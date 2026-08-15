// Efectos de las 16 cartas de Prensa Deportiva (REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §5). `aplicarCartaPrensa` resuelve los efectos automáticos y deja
// `decisionPendiente` para los 3 que requieren elección del jugador (#8, #13,
// #16); las funciones que resuelven esa elección viven en este mismo archivo.
// NO llaman a `finalizarSegmentoDeTurno` (eso lo centraliza el dispatcher de
// partida.ts al detectar que `decisionPendiente`/`subastaEnCurso` quedaron en
// null) — así este archivo no depende de turnos.ts y se evita un ciclo (
// turnos.ts SÍ depende de este archivo, para resolver aterrizajes en Prensa
// Deportiva).
//
// #8 "Fichaje sorpresa": el jugador ELIGE rival y carta específica (lectura:
// "puedes robar" = elección, no azar); no-op si NINGÚN rival tiene cartas.
// #13 "Doble fichaje": la carta se roba en una celda de Prensa Deportiva, sin
// contexto de liga — se resuelve dejando elegir la liga al jugador
// (`elegirLigaDobleFichaje`); "al precio de uno" se cobra una sola vez, al
// precio de la celda MÁS BARATA de esa liga (decisión de esta sesión, el
// reglamento no lo especifica).
// #16 "Cambio de agente": generalizado a cualquier origen de carta (liga,
// Resto del Mundo o técnico) y no solo "liga", ya que restringir a liga sin
// más contexto sería una lectura arbitraria; el sobre nuevo pide la MISMA
// posición que tenía la carta reemplazada (evita un paso de elección extra);
// no-op si Mi Club está vacío (literal de la carta).
// #7/#10/#14 "paga": lectura inclusiva de "[los impuestos] alimentan el Palco
// del Club... igual que las otras multas del juego" — se interpretan como
// pagos muertos que también van al Palco (decisión de esta sesión).

import type { GeneradorAleatorio } from "./aleatorio.js";
import type { CartaPrensa } from "./cartasPrensa.js";
import { esNombreLigaValido } from "./cartasPrensa.js";
import { entrarADescendido } from "./descendido.js";
import { celdasDeLiga } from "./tablero.js";
import type { JugadorPool } from "./fuenteSobres.js";
import { agregarCarta, buscarCarta, elegirCartaAleatoria, quitarCarta, type CartaMiClub } from "./miClub.js";
import { elegirJugadorParaSobre, elegirTecnicoParaSobre, tramosParaLiga } from "./muestreo.js";
import { REGLAS_MONOPOLY } from "./reglas.js";
import { error, ok, type Resultado } from "./resultado.js";
import {
  alPalco,
  cobrar,
  conJugador,
  estaTerminada,
  jugadorDe,
  pagarAJugador,
  siguienteIdDeCarta,
  type EstadoMonopoly,
} from "./estado.js";

export type MovimientoPendiente =
  | { readonly tipo: "avanzarASalida" }
  | { readonly tipo: "retroceder"; readonly cantidad: number };

/** Aplica el efecto de una carta ya robada. `fueDoble` viaja a cualquier `decisionPendiente` que se abra. */
export function aplicarCartaPrensa(
  estado: EstadoMonopoly,
  jugadorId: string,
  carta: CartaPrensa,
  fueDoble: boolean,
  rng: GeneradorAleatorio,
): { readonly estado: EstadoMonopoly; readonly movimiento: MovimientoPendiente | null } {
  const efecto = carta.efecto;
  switch (efecto.tipo) {
    case "sobreMitadPrecio":
      return { estado: conJugador(estado, jugadorId, { proximoSobreMitadPrecio: true }), movimiento: null };

    case "recibirDinero":
      return { estado: pagarAJugador(estado, jugadorId, efecto.monto), movimiento: null };

    case "perderTurno": {
      const jugador = jugadorDe(estado, jugadorId);
      return {
        estado: conJugador(estado, jugadorId, { turnosAPerder: jugador.turnosAPerder + 1 }),
        movimiento: null,
      };
    }

    case "perderJugadorAleatorio":
      return { estado: perderCartaAleatoria(estado, jugadorId, rng), movimiento: null };

    case "irADescendido":
      return { estado: entrarADescendido(estado, jugadorId), movimiento: null };

    case "pagarDinero":
      return { estado: alPalco(cobrar(estado, jugadorId, efecto.monto), efecto.monto), movimiento: null };

    case "robarJugadorRival": {
      const hayRivalConCartas = estado.jugadores.some(
        (j) => j.id !== jugadorId && j.miClub.length > 0,
      );
      if (!hayRivalConCartas) return { estado, movimiento: null };
      return {
        estado: {
          ...estado,
          decisionPendiente: { jugadorId, fueDoble, detalle: { tipo: "elegirRoboPrensa" } },
        },
        movimiento: null,
      };
    }

    case "avanzarASalida":
      return { estado, movimiento: { tipo: "avanzarASalida" } };

    case "retrocederCasillas":
      return { estado, movimiento: { tipo: "retroceder", cantidad: efecto.cantidad } };

    case "dobleFichaje":
      return {
        estado: {
          ...estado,
          decisionPendiente: { jugadorId, fueDoble, detalle: { tipo: "elegirLigaDobleFichaje" } },
        },
        movimiento: null,
      };

    case "cambiarAgente": {
      const jugador = jugadorDe(estado, jugadorId);
      if (jugador.miClub.length === 0) return { estado, movimiento: null };
      return {
        estado: {
          ...estado,
          decisionPendiente: { jugadorId, fueDoble, detalle: { tipo: "elegirCambioAgente" } },
        },
        movimiento: null,
      };
    }
  }
}

function perderCartaAleatoria(
  estado: EstadoMonopoly,
  jugadorId: string,
  rng: GeneradorAleatorio,
): EstadoMonopoly {
  const jugador = jugadorDe(estado, jugadorId);
  const carta = elegirCartaAleatoria(jugador.miClub, rng);
  if (carta === undefined) return estado;
  return conJugador(estado, jugadorId, { miClub: quitarCarta(jugador.miClub, carta.id) });
}

// ── #8: Fichaje sorpresa ────────────────────────────────────────────────────

export function elegirRoboPrensa(
  estado: EstadoMonopoly,
  jugadorId: string,
  rivalId: string,
  cartaId: string,
): Resultado<EstadoMonopoly> {
  const chk = validarPendiente(estado, jugadorId, "elegirRoboPrensa");
  if (!chk.ok) return chk;
  if (rivalId === jugadorId) return error("RIVAL_INVALIDO", "no puedes robarte a ti mismo");
  const rival = estado.jugadores.find((j) => j.id === rivalId);
  if (rival === undefined) return error("RIVAL_INVALIDO", "ese jugador no existe");
  const carta = buscarCarta(rival.miClub, cartaId);
  if (carta === undefined) return error("CARTA_DESCONOCIDA", "ese rival no tiene esa carta");

  const sinCarta = conJugador(estado, rivalId, { miClub: quitarCarta(rival.miClub, cartaId) });
  const jugador = jugadorDe(sinCarta, jugadorId);
  const conCarta = conJugador(sinCarta, jugadorId, { miClub: agregarCarta(jugador.miClub, carta) });
  return ok({ ...conCarta, decisionPendiente: null });
}

// ── #16: Cambio de agente ───────────────────────────────────────────────────

export function elegirCambioAgente(
  estado: EstadoMonopoly,
  jugadorId: string,
  cartaId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  const chk = validarPendiente(estado, jugadorId, "elegirCambioAgente");
  if (!chk.ok) return chk;
  const jugador = jugadorDe(estado, jugadorId);
  const carta = buscarCarta(jugador.miClub, cartaId);
  if (carta === undefined) return error("CARTA_DESCONOCIDA", "no tienes esa carta en Mi Club");

  const sinCarta = quitarCarta(jugador.miClub, cartaId);
  const base: EstadoMonopoly = { ...conJugador(estado, jugadorId, { miClub: sinCarta }), decisionPendiente: null };

  if (carta.tipo === "tecnico") {
    const tecnico = elegirTecnicoParaSobre(base.pool.tecnicos, rng);
    if (tecnico === undefined) return error("POOL_INVALIDO", "no hay técnicos disponibles");
    const { id, estado: conId } = siguienteIdDeCarta(base);
    const nuevaCarta: CartaMiClub = { tipo: "tecnico", id, tecnico };
    const j = jugadorDe(conId, jugadorId);
    return ok(conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, nuevaCarta) }));
  }

  const posicion = carta.jugador.posicion;
  const pool: readonly JugadorPool[] =
    carta.origen.clase === "liga" ? base.pool.porLiga[carta.origen.liga] : base.pool.restoDelMundo;
  const tramos =
    carta.origen.clase === "liga" ? tramosParaLiga(false) : REGLAS_MONOPOLY.tiers.restoDelMundo;
  const nuevoJugador = elegirJugadorParaSobre(pool, tramos, posicion, rng);
  if (nuevoJugador === undefined) return error("POOL_INVALIDO", "no hay jugadores disponibles");
  const { id, estado: conId } = siguienteIdDeCarta(base);
  const nuevaCarta: CartaMiClub = { tipo: "jugador", id, origen: carta.origen, jugador: nuevoJugador };
  const j = jugadorDe(conId, jugadorId);
  return ok(conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, nuevaCarta) }));
}

// ── #13: Doble fichaje ──────────────────────────────────────────────────────

export function elegirLigaDobleFichaje(
  estado: EstadoMonopoly,
  jugadorId: string,
  liga: string,
): Resultado<EstadoMonopoly> {
  const chk = validarPendiente(estado, jugadorId, "elegirLigaDobleFichaje");
  if (!chk.ok) return chk;
  if (!esNombreLigaValido(liga)) return error("LIGA_INVALIDA", `liga desconocida: "${liga}"`);

  const celdas = celdasDeLiga(liga);
  const precios = celdas.map((c) => c.precio);
  const precioMasBarato = Math.min(...precios);

  const cobrado = cobrar(estado, jugadorId, precioMasBarato);
  const fueDoble = chk.valor;
  return ok({
    ...cobrado,
    decisionPendiente: {
      jugadorId,
      fueDoble,
      detalle: { tipo: "elegirPosicionSobre", origen: { clase: "liga", liga }, sobresRestantes: 2 },
    },
  });
}

/** Valida que haya una decisión pendiente del tipo esperado, para `jugadorId`. Devuelve `fueDoble`. */
function validarPendiente(
  estado: EstadoMonopoly,
  jugadorId: string,
  tipo: "elegirRoboPrensa" | "elegirCambioAgente" | "elegirLigaDobleFichaje",
): Resultado<boolean> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const pend = estado.decisionPendiente;
  if (pend === null || pend.detalle.tipo !== tipo) {
    return error("ACCION_NO_ESPERADA", `no corresponde "${tipo}" en este momento`);
  }
  if (pend.jugadorId !== jugadorId) return error("NO_ES_TU_TURNO", "esta decisión no es tuya");
  return ok(pend.fueDoble);
}
