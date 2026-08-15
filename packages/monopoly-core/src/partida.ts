// Punto de composición: crea la partida y despacha `AccionMonopoly`
// (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1.1, §6). Estas firmas son
// estructuralmente compatibles con `MotorJuego<E,A>` de
// packages/server/src/motor.ts (crear/aplicarAccion/jugadorEnTurno/
// terminada) — el adaptador de servidor en sí es S3, no esta sesión.
//
// El dispatcher centraliza el llamado a `finalizarSegmentoDeTurno`: cada
// archivo de acción (economia.ts, cartasPrensaEfectos.ts) solo limpia
// `decisionPendiente`/`subastaEnCurso`; SOLO acá se decide si eso alcanza
// para cerrar el segmento de turno (evita que economia.ts/
// cartasPrensaEfectos.ts dependan de turnos.ts — ver cabeceras de esos
// archivos).
//
// Sobres iniciales (§1.1): el reglamento dice "elige liga y posición igual
// que un sobre normal del tablero" para los 6 sobres gratis de cada
// jugador. Por alcance de esta sesión (ya muy extensa), se simplifica a
// asignación AUTOMÁTICA (liga y posición al azar, mismo sorteo de tier que
// un sobre normal) en vez de una fase interactiva de elección — decisión
// de esta sesión, documentada como candidata a mejorar en una sesión futura
// (UX de setup interactivo). No afecta el resto de las reglas: el efecto
// económico es el mismo (6 cartas gratis, liga variada), solo cambia quién
// elige la liga/posición.

import type { GeneradorAleatorio } from "./aleatorio.js";
import { crearMazoPrensa } from "./cartasPrensa.js";
import { elegirCambioAgente, elegirLigaDobleFichaje, elegirRoboPrensa } from "./cartasPrensaEfectos.js";
import { pagarMultaDescendido } from "./descendido.js";
import {
  comprarSobre,
  declinarCompra,
  elegirPosicionSobre,
  forzarCompra,
  pasarSubasta,
  pujar,
} from "./economia.js";
import { LIGAS } from "./tablero.js";
import { POSICIONES, validarPoolSobres, type PoolSobres, type PosicionJugador } from "./fuenteSobres.js";
import { intercambiar, type OfertaIntercambio } from "./intercambios.js";
import { agregarCarta, type CartaMiClub } from "./miClub.js";
import { elegirJugadorParaSobre, excluirYaSorteados, tramosParaLiga } from "./muestreo.js";
import { REGLAS_MONOPOLY } from "./reglas.js";
import { error, ok, type Resultado } from "./resultado.js";
import { finalizarSegmentoDeTurno, tirarDados } from "./turnos.js";
import {
  conJugador,
  estaTerminada,
  jugadorDe,
  siguienteIdDeCarta,
  type DatosJugador,
  type DecisionPendiente,
  type EstadoJugador,
  type EstadoMonopoly,
} from "./estado.js";

export interface ConfigPartidaMonopoly {
  readonly rondasTotales: number;
}

function otorgarSobresIniciales(estadoBase: EstadoMonopoly, rng: GeneradorAleatorio): EstadoMonopoly {
  let estado = estadoBase;
  for (const jugadorId of estado.ordenJugadores) {
    for (let i = 0; i < REGLAS_MONOPOLY.sobresIniciales; i++) {
      const liga = LIGAS[Math.floor(rng() * LIGAS.length)];
      const posicion = POSICIONES[Math.floor(rng() * POSICIONES.length)];
      if (liga === undefined || posicion === undefined) continue;
      const pool = excluirYaSorteados(estado.pool.porLiga[liga], estado.jugadoresRealesSorteados);
      const elegido = elegirJugadorParaSobre(pool, tramosParaLiga(false), posicion, rng);
      if (elegido === undefined) continue;
      const { id, estado: conId } = siguienteIdDeCarta(estado);
      const carta: CartaMiClub = { tipo: "jugador", id, origen: { clase: "liga", liga }, jugador: elegido };
      const j = jugadorDe(conId, jugadorId);
      const conCarta = conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, carta) });
      estado = {
        ...conCarta,
        jugadoresRealesSorteados: [...conCarta.jugadoresRealesSorteados, elegido.jugadorId],
      };
    }
  }
  return estado;
}

/** Crea la partida: valida jugadores y pool, arma tablero + mazo + 6 sobres gratis por jugador. */
export function crearPartida(
  datos: readonly DatosJugador[],
  pool: PoolSobres,
  rng: GeneradorAleatorio,
  config: ConfigPartidaMonopoly,
): Resultado<EstadoMonopoly> {
  if (datos.length < 2) return error("JUGADORES_INVALIDOS", "se necesitan al menos 2 jugadores");
  const ids = datos.map((d) => d.id);
  if (ids.some((id) => id.length === 0)) {
    return error("JUGADORES_INVALIDOS", "hay un id de jugador vacío");
  }
  if (new Set(ids).size !== ids.length) {
    return error("JUGADORES_INVALIDOS", "hay ids de jugador duplicados");
  }

  const poolValidado = validarPoolSobres(pool);
  if (!poolValidado.ok) return poolValidado;

  if (!Number.isInteger(config.rondasTotales) || config.rondasTotales < 1) {
    return error("CONFIG_INVALIDA", "rondasTotales debe ser un entero positivo");
  }

  const jugadores: EstadoJugador[] = datos.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    presupuesto: REGLAS_MONOPOLY.presupuestoInicial,
    posicion: 0,
    miClub: [],
    clubToken: null,
    enQuiebra: false,
    enDescendido: false,
    turnosEnDescendido: 0,
    proximoSobreMitadPrecio: false,
    turnosAPerder: 0,
  }));
  const ordenJugadores = ids;
  const primerJugador = ordenJugadores[0];
  if (primerJugador === undefined) return error("JUGADORES_INVALIDOS", "no hay jugadores");

  const base: EstadoMonopoly = {
    jugadores,
    ordenJugadores,
    indiceRotacion: 0,
    jugadorEnTurno: primerJugador,
    doblesSeguidos: 0,
    turnoGlobal: 0,
    numeroRonda: 1,
    rondasTotales: config.rondasTotales,
    palcoDelClub: 0,
    mazoPrensa: crearMazoPrensa(rng),
    ventanasAbiertas: {},
    subastaEnCurso: null,
    decisionPendiente: null,
    siguienteCartaId: 0,
    pool,
    jugadoresRealesSorteados: [],
  };

  return ok(otorgarSobresIniciales(base, rng));
}

export type AccionMonopoly =
  | { readonly tipo: "tirarDados" }
  | { readonly tipo: "comprarSobre"; readonly posicion?: PosicionJugador }
  | { readonly tipo: "declinarCompra" }
  | { readonly tipo: "pujar"; readonly monto: number }
  | { readonly tipo: "pasarSubasta" }
  | { readonly tipo: "elegirPosicionSobre"; readonly posicion: PosicionJugador }
  | { readonly tipo: "forzarCompra" }
  | { readonly tipo: "pagarMultaDescendido" }
  | {
      readonly tipo: "intercambiar";
      readonly conJugadorId: string;
      readonly ofrezco: OfertaIntercambio;
      readonly pido: OfertaIntercambio;
    }
  | { readonly tipo: "elegirRoboPrensa"; readonly rivalId: string; readonly cartaId: string }
  | { readonly tipo: "elegirCambioAgente"; readonly cartaId: string }
  | { readonly tipo: "elegirLigaDobleFichaje"; readonly liga: string };

/** Dispatcher delgado: valida turno/decisión pendiente y delega a la función real. */
export function aplicarAccion(
  estado: EstadoMonopoly,
  jugadorId: string,
  accion: AccionMonopoly,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (estado.jugadores.every((j) => j.id !== jugadorId)) {
    return error("JUGADOR_DESCONOCIDO", "ese jugador no está en la partida");
  }

  const pend = estado.decisionPendiente;
  if (pend !== null) {
    if (jugadorId !== pend.jugadorId) {
      return error("NO_ES_TU_TURNO", "hay una decisión pendiente de otro jugador");
    }
    return resolverDecisionPendiente(estado, pend, jugadorId, accion, rng);
  }

  if (estado.subastaEnCurso !== null) {
    if (accion.tipo !== "pujar" && accion.tipo !== "pasarSubasta") {
      return error("ACCION_NO_ESPERADA", "hay una subasta en curso");
    }
    const fueDoble = estado.subastaEnCurso.fueDoble;
    const resultado =
      accion.tipo === "pujar"
        ? pujar(estado, jugadorId, accion.monto)
        : pasarSubasta(estado, jugadorId, rng);
    if (!resultado.ok) return resultado;
    return ok(finalizarSiCorresponde(resultado.valor, fueDoble));
  }

  switch (accion.tipo) {
    case "tirarDados":
      if (jugadorId !== estado.jugadorEnTurno) return error("NO_ES_TU_TURNO", "no es tu turno");
      return tirarDados(estado, jugadorId, rng);
    case "forzarCompra":
      return forzarCompra(estado, jugadorId);
    case "intercambiar":
      return intercambiar(estado, jugadorId, accion.conJugadorId, accion.ofrezco, accion.pido);
    case "pagarMultaDescendido":
      if (jugadorId !== estado.jugadorEnTurno) return error("NO_ES_TU_TURNO", "no es tu turno");
      return pagarMultaDescendido(estado, jugadorId);
    default:
      return error("ACCION_NO_ESPERADA", `no corresponde "${accion.tipo}" en este momento`);
  }
}

function resolverDecisionPendiente(
  estado: EstadoMonopoly,
  pend: DecisionPendiente,
  jugadorId: string,
  accion: AccionMonopoly,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  const detalle = pend.detalle;
  let resultado: Resultado<EstadoMonopoly>;

  switch (detalle.tipo) {
    case "compraODeclina":
      if (accion.tipo === "comprarSobre") {
        resultado = comprarSobre(estado, jugadorId, rng, accion.posicion);
      } else if (accion.tipo === "declinarCompra") {
        resultado = declinarCompra(estado, jugadorId);
      } else {
        return error("ACCION_NO_ESPERADA", "debes comprar o declinar");
      }
      break;
    case "elegirPosicionSobre":
      if (accion.tipo !== "elegirPosicionSobre") {
        return error("ACCION_NO_ESPERADA", "debes elegir una posición para el sobre");
      }
      resultado = elegirPosicionSobre(estado, jugadorId, accion.posicion, rng);
      break;
    case "elegirRoboPrensa":
      if (accion.tipo !== "elegirRoboPrensa") {
        return error("ACCION_NO_ESPERADA", "debes elegir a quién robarle");
      }
      resultado = elegirRoboPrensa(estado, jugadorId, accion.rivalId, accion.cartaId);
      break;
    case "elegirCambioAgente":
      if (accion.tipo !== "elegirCambioAgente") {
        return error("ACCION_NO_ESPERADA", "debes elegir el cambio de agente");
      }
      resultado = elegirCambioAgente(estado, jugadorId, accion.cartaId, rng);
      break;
    case "elegirLigaDobleFichaje":
      if (accion.tipo !== "elegirLigaDobleFichaje") {
        return error("ACCION_NO_ESPERADA", "debes elegir la liga del doble fichaje");
      }
      resultado = elegirLigaDobleFichaje(estado, jugadorId, accion.liga);
      break;
  }

  if (!resultado.ok) return resultado;
  return ok(finalizarSiCorresponde(resultado.valor, pend.fueDoble));
}

function finalizarSiCorresponde(estado: EstadoMonopoly, fueDoble: boolean): EstadoMonopoly {
  if (estado.decisionPendiente !== null || estado.subastaEnCurso !== null) return estado;
  return finalizarSegmentoDeTurno(estado, estado.jugadorEnTurno, fueDoble);
}

export function jugadorEnTurno(estado: EstadoMonopoly): string | null {
  if (estaTerminada(estado)) return null;
  return estado.jugadorEnTurno;
}

export function terminada(estado: EstadoMonopoly): boolean {
  return estaTerminada(estado);
}
