// Máquina de turnos y estado de la partida (REGLAS_CARIOCA.md §1, §5, §6 y §7).
// Estilo reducer puro: el estado es inmutable y cada acción devuelve un
// Resultado con el estado nuevo o un error tipado. El servidor (Fase 2)
// traduce intenciones de los clientes a estas acciones.

import type { Carta } from "./carta.js";
import { describirCarta, esComodin } from "./carta.js";
import type { GeneradorAleatorio } from "./aleatorio.js";
import { barajar } from "./aleatorio.js";
import { crearMazoCompleto, repartir, reponerMazoDesdePozo } from "./mazo.js";
import type { ContratoMano } from "./contratos.js";
import { contratoDeMano, MANOS } from "./contratos.js";
import type {
  Combinacion,
  ExtremoEscala,
  TipoCombinacion,
} from "./combinaciones.js";
import {
  contarComodines,
  extenderEscala,
  validarContrato,
  valorDeTrio,
} from "./combinaciones.js";
import { puntosMano } from "./puntaje.js";

export type CodigoError =
  | "JUGADORES_INVALIDOS"
  | "MAZO_INVALIDO"
  | "MANO_DESCONOCIDA"
  | "MANO_EN_CURSO"
  | "PARTIDA_TERMINADA"
  | "NO_ES_TU_TURNO"
  | "FASE_INCORRECTA"
  | "MAZO_VACIO"
  | "POZO_VACIO"
  | "CARTA_NO_ESTA_EN_MANO"
  | "YA_TE_BAJASTE"
  | "NO_TE_HAS_BAJADO"
  | "CONTRATO_INVALIDO"
  | "PEGAR_MISMO_TURNO"
  | "PEGAR_INVALIDO"
  | "COMBINACION_INEXISTENTE"
  | "COMODIN_AL_POZO";

export interface ErrorJuego {
  readonly codigo: CodigoError;
  readonly mensaje: string;
}

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorJuego };

export function exito<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function fallo<T>(codigo: CodigoError, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

export interface Jugador extends DatosJugador {
  readonly mano: readonly Carta[];
  readonly puntosAcumulados: number;
  /** Número de turno en que se bajó en la mano actual, o null. */
  readonly turnoEnQueSeBajo: number | null;
}

export interface CombinacionEnMesa {
  readonly duenoId: string;
  readonly combinacion: Combinacion;
}

export type FaseTurno = "robar" | "descartar";
export type FasePartida = "jugandoMano" | "manoTerminada" | "partidaTerminada";

export interface Turno {
  readonly jugadorId: string;
  readonly fase: FaseTurno;
  /** Contador global que crece cada vez que el turno pasa de jugador. */
  readonly numero: number;
}

export interface EstadoPartida {
  readonly jugadores: readonly Jugador[];
  /** Número de la mano en curso (1..9), indexa MANOS por su campo numero. */
  readonly manoActual: number;
  readonly mazo: readonly Carta[];
  readonly pozo: readonly Carta[];
  readonly mesa: readonly CombinacionEnMesa[];
  readonly turno: Turno;
  readonly repartidorIdx: number;
  readonly fase: FasePartida;
  /** Quién cerró la mano actual (cuando fase no es "jugandoMano"). */
  readonly ganadorManoId: string | null;
}

export interface PropuestaCombinacion {
  readonly tipo: TipoCombinacion;
  /** Ids de cartas de la mano del jugador, en el orden propuesto. */
  readonly cartaIds: readonly string[];
}

// §1: 2 a 4 jugadores.
const MIN_JUGADORES = 2;
const MAX_JUGADORES = 4;

function validarMazoCompleto(mazo: readonly Carta[]): string | null {
  const referencia = crearMazoCompleto();
  if (mazo.length !== referencia.length) {
    return `el mazo debe tener ${referencia.length} cartas`;
  }
  const ids = new Set(mazo.map((carta) => carta.id));
  if (ids.size !== mazo.length) {
    return "el mazo tiene cartas repetidas";
  }
  if (referencia.some((carta) => !ids.has(carta.id))) {
    return "el mazo no contiene todas las cartas del juego";
  }
  return null;
}

function comenzarMano(
  jugadoresPrevios: readonly Jugador[],
  contrato: ContratoMano,
  repartidorIdx: number,
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  const errorMazo = validarMazoCompleto(mazoOrdenado);
  if (errorMazo !== null) return fallo("MAZO_INVALIDO", errorMazo);
  const reparto = repartir(
    mazoOrdenado,
    jugadoresPrevios.length,
    contrato.cartasRepartidas,
  );
  const mazo = [...reparto.mazoRestante];
  const aperturaPozo = mazo.pop();
  if (aperturaPozo === undefined) {
    return fallo("MAZO_INVALIDO", "no quedan cartas para abrir el pozo");
  }
  const jugadores: Jugador[] = [];
  for (let i = 0; i < jugadoresPrevios.length; i++) {
    const previo = jugadoresPrevios[i];
    const mano = reparto.manos[i];
    if (previo === undefined || mano === undefined) {
      return fallo("JUGADORES_INVALIDOS", "el reparto no cubre a todos los jugadores");
    }
    jugadores.push({ ...previo, mano, turnoEnQueSeBajo: null });
  }
  // §1/§5: el reparto rota cada mano; abre el jugador siguiente al repartidor.
  const abre = jugadores[(repartidorIdx + 1) % jugadores.length];
  if (abre === undefined) {
    return fallo("JUGADORES_INVALIDOS", "no hay jugador que abra la mano");
  }
  return exito({
    jugadores,
    manoActual: contrato.numero,
    mazo,
    pozo: [aperturaPozo],
    mesa: [],
    turno: { jugadorId: abre.id, fase: "robar", numero: 1 },
    repartidorIdx,
    fase: "jugandoMano",
    ganadorManoId: null,
  });
}

export function crearPartida(
  datos: readonly DatosJugador[],
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  return crearPartidaConMazo(datos, barajar(crearMazoCompleto(), rng));
}

/** Variante determinista: recibe el mazo ya ordenado (tests, repeticiones). */
export function crearPartidaConMazo(
  datos: readonly DatosJugador[],
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  if (datos.length < MIN_JUGADORES || datos.length > MAX_JUGADORES) {
    return fallo(
      "JUGADORES_INVALIDOS",
      `la partida es de ${MIN_JUGADORES} a ${MAX_JUGADORES} jugadores`,
    );
  }
  if (new Set(datos.map((d) => d.id)).size !== datos.length) {
    return fallo("JUGADORES_INVALIDOS", "hay ids de jugador repetidos");
  }
  const primera = MANOS[0];
  if (primera === undefined) {
    return fallo("MANO_DESCONOCIDA", "no hay manos definidas en el contrato");
  }
  const jugadores: Jugador[] = datos.map((d) => ({
    ...d,
    mano: [],
    puntosAcumulados: 0,
    turnoEnQueSeBajo: null,
  }));
  return comenzarMano(jugadores, primera, 0, mazoOrdenado);
}

export function iniciarSiguienteMano(
  estado: EstadoPartida,
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  return iniciarSiguienteManoConMazo(estado, barajar(crearMazoCompleto(), rng));
}

export function iniciarSiguienteManoConMazo(
  estado: EstadoPartida,
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  if (estado.fase === "partidaTerminada") {
    return fallo("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (estado.fase !== "manoTerminada") {
    return fallo("MANO_EN_CURSO", "la mano actual aún no termina");
  }
  const siguiente = contratoDeMano(estado.manoActual + 1);
  if (siguiente === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual + 1}`);
  }
  return comenzarMano(
    estado.jugadores,
    siguiente,
    (estado.repartidorIdx + 1) % estado.jugadores.length,
    mazoOrdenado,
  );
}

export function contratoActual(estado: EstadoPartida): ContratoMano | undefined {
  return contratoDeMano(estado.manoActual);
}

export function jugadorActual(estado: EstadoPartida): Jugador | undefined {
  return estado.jugadores.find((j) => j.id === estado.turno.jugadorId);
}

/** Ganadores de la partida (menor puntaje acumulado, §7); vacío si no terminó. */
export function ganadores(estado: EstadoPartida): readonly Jugador[] {
  if (estado.fase !== "partidaTerminada") return [];
  const minimo = Math.min(...estado.jugadores.map((j) => j.puntosAcumulados));
  return estado.jugadores.filter((j) => j.puntosAcumulados === minimo);
}

function validarAccion(
  estado: EstadoPartida,
  jugadorId: string,
  fase: FaseTurno,
): ErrorJuego | null {
  if (estado.fase !== "jugandoMano") {
    return { codigo: "FASE_INCORRECTA", mensaje: "no hay una mano en curso" };
  }
  if (estado.turno.jugadorId !== jugadorId) {
    return { codigo: "NO_ES_TU_TURNO", mensaje: "no es tu turno" };
  }
  if (estado.turno.fase !== fase) {
    return {
      codigo: "FASE_INCORRECTA",
      mensaje:
        fase === "robar"
          ? "ya robaste en este turno"
          : "primero debes robar una carta",
    };
  }
  return null;
}

function conManoActualizada(
  estado: EstadoPartida,
  jugadorId: string,
  transformar: (jugador: Jugador) => Jugador,
): readonly Jugador[] {
  return estado.jugadores.map((j) => (j.id === jugadorId ? transformar(j) : j));
}

/** §7: quien cierra suma 0; los demás suman las cartas que les quedaron. */
function cerrarMano(estado: EstadoPartida, ganadorId: string): EstadoPartida {
  const jugadores = estado.jugadores.map((j) =>
    j.id === ganadorId
      ? j
      : { ...j, puntosAcumulados: j.puntosAcumulados + puntosMano(j.mano) },
  );
  const ultima = MANOS[MANOS.length - 1];
  const esUltima = ultima !== undefined && estado.manoActual === ultima.numero;
  return {
    ...estado,
    jugadores,
    ganadorManoId: ganadorId,
    fase: esUltima ? "partidaTerminada" : "manoTerminada",
  };
}

export function robarDelMazo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  let mazo = [...estado.mazo];
  let pozo = [...estado.pozo];
  if (mazo.length === 0) {
    const repuesto = reponerMazoDesdePozo(pozo);
    mazo = repuesto.mazo;
    pozo = repuesto.pozo;
  }
  const carta = mazo.pop();
  if (carta === undefined) {
    return fallo("MAZO_VACIO", "no quedan cartas para robar");
  }
  return exito({
    ...estado,
    mazo,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

export function robarDelPozo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  const pozo = [...estado.pozo];
  const carta = pozo.pop();
  if (carta === undefined) {
    return fallo("POZO_VACIO", "el pozo está vacío");
  }
  return exito({
    ...estado,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

/**
 * Bajarse (§5/§6): solo tras robar, una única vez por mano y con el contrato
 * exacto. En las manos de cierre automático se bajan las 13 cartas y se gana
 * sin descartar.
 */
export function bajarse(
  estado: EstadoPartida,
  jugadorId: string,
  propuesta: readonly PropuestaCombinacion[],
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  if (jugador.turnoEnQueSeBajo !== null) {
    return fallo("YA_TE_BAJASTE", "ya te bajaste en esta mano");
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  const usadas = new Set<string>();
  const combinaciones: Combinacion[] = [];
  for (const prop of propuesta) {
    const cartas: Carta[] = [];
    for (const id of prop.cartaIds) {
      if (usadas.has(id)) {
        return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${id} está repetida en la propuesta`);
      }
      const carta = jugador.mano.find((c) => c.id === id);
      if (carta === undefined) {
        return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${id} no está en tu mano`);
      }
      usadas.add(id);
      cartas.push(carta);
    }
    combinaciones.push({ tipo: prop.tipo, cartas });
  }
  const validacion = validarContrato(contrato, combinaciones);
  if (!validacion.valida) {
    return fallo("CONTRATO_INVALIDO", validacion.motivo);
  }
  const manoRestante = jugador.mano.filter((c) => !usadas.has(c.id));
  if (contrato.cierreAutomatico && manoRestante.length > 0) {
    return fallo("CONTRATO_INVALIDO", "en esta mano debes bajar todas tus cartas");
  }
  const nuevo: EstadoPartida = {
    ...estado,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
      turnoEnQueSeBajo: estado.turno.numero,
    })),
    mesa: [
      ...estado.mesa,
      ...combinaciones.map((combinacion) => ({ duenoId: jugadorId, combinacion })),
    ],
  };
  // §6: la mano termina cuando un jugador se deshace de todas sus cartas
  // (en sucia/real esto es el cierre automático, sin descartar).
  if (manoRestante.length === 0) {
    return exito(cerrarMano(nuevo, jugadorId));
  }
  return exito(nuevo);
}

/**
 * Pegar (§6): a combinaciones propias o ajenas, solo en turnos posteriores
 * al de bajarse. Comodín pegable solo si la combinación destino aún admite
 * uno según el contrato (decisión confirmada).
 */
export function pegar(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
  mesaIdx: number,
  extremo?: ExtremoEscala,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  if (jugador.turnoEnQueSeBajo === null) {
    return fallo("NO_TE_HAS_BAJADO", "solo puedes pegar después de bajarte");
  }
  if (jugador.turnoEnQueSeBajo === estado.turno.numero) {
    return fallo("PEGAR_MISMO_TURNO", "no puedes pegar en el mismo turno en que te bajaste");
  }
  const carta = jugador.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en tu mano`);
  }
  const objetivo = estado.mesa[mesaIdx];
  if (objetivo === undefined) {
    return fallo("COMBINACION_INEXISTENTE", "esa combinación no está en la mesa");
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  const { combinacion } = objetivo;
  if (esComodin(carta)) {
    if (combinacion.tipo === "escalaReal") {
      return fallo("PEGAR_INVALIDO", "la escala real no admite comodines");
    }
    if (contarComodines(combinacion.cartas) + 1 > contrato.comodinesPorCombinacion) {
      return fallo(
        "PEGAR_INVALIDO",
        `máximo ${contrato.comodinesPorCombinacion} comodín(es) por combinación`,
      );
    }
  }
  let nuevasCartas: Carta[] | null = null;
  if (combinacion.tipo === "trio") {
    if (!esComodin(carta)) {
      const valor = valorDeTrio(combinacion.cartas);
      if (valor === null || carta.valor !== valor) {
        return fallo(
          "PEGAR_INVALIDO",
          `${describirCarta(carta)} no coincide con el número del trío`,
        );
      }
    }
    nuevasCartas = [...combinacion.cartas, carta];
  } else if (combinacion.tipo === "escala") {
    nuevasCartas = extenderEscala(combinacion.cartas, carta, extremo);
    if (nuevasCartas === null) {
      return fallo(
        "PEGAR_INVALIDO",
        `${describirCarta(carta)} no extiende la escala por ninguno de sus extremos`,
      );
    }
  } else {
    return fallo("PEGAR_INVALIDO", "no se puede pegar a una escala sucia o real");
  }
  const cartasFinales = nuevasCartas;
  const mesa = estado.mesa.map((enMesa, idx) =>
    idx === mesaIdx
      ? { ...enMesa, combinacion: { ...enMesa.combinacion, cartas: cartasFinales } }
      : enMesa,
  );
  const manoRestante = jugador.mano.filter((c) => c.id !== cartaId);
  const nuevo: EstadoPartida = {
    ...estado,
    mesa,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
    })),
  };
  if (manoRestante.length === 0) {
    return exito(cerrarMano(nuevo, jugadorId));
  }
  return exito(nuevo);
}

/**
 * Descartar (§5): termina el turno. Prohibido descartar comodín salvo en
 * manos donde no se permiten comodines (§3, en los datos:
 * comodinesPorCombinacion === 0).
 */
export function descartar(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  const carta = jugador.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en tu mano`);
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  if (esComodin(carta) && contrato.comodinesPorCombinacion > 0) {
    return fallo("COMODIN_AL_POZO", "no puedes descartar un comodín en esta mano");
  }
  const manoRestante = jugador.mano.filter((c) => c.id !== cartaId);
  const base: EstadoPartida = {
    ...estado,
    pozo: [...estado.pozo, carta],
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
    })),
  };
  if (manoRestante.length === 0) {
    return exito(cerrarMano(base, jugadorId));
  }
  const idx = estado.jugadores.findIndex((j) => j.id === jugadorId);
  const siguiente = estado.jugadores[(idx + 1) % estado.jugadores.length];
  if (siguiente === undefined) {
    return fallo("JUGADORES_INVALIDOS", "no hay jugador siguiente");
  }
  return exito({
    ...base,
    turno: {
      jugadorId: siguiente.id,
      fase: "robar",
      numero: estado.turno.numero + 1,
    },
  });
}
