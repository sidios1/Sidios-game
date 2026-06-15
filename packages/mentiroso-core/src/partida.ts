// Máquina de partida de Mentiroso: funciones puras y deterministas sobre un
// estado inmutable (REGLAS_MENTIROSO.md). Cada acción devuelve un Resultado:
// el nuevo estado o un error tipado. Aquí viven TODAS las reglas del juego;
// no se duplican en el servidor ni en el cliente.
//
// Decisiones §8 (fijadas en REGLAS_MENTIROSO.md):
//  - Quien juega su última carta NO gana al instante: queda "pendiente" hasta
//    que su jugada se acepta (el siguiente jugador juega) o sobrevive a una
//    acusación. Si lo acusan y mentía, recoge la pila y sigue.
//  - Acusa cualquiera menos quien acaba de jugar; apunta a `ultimaJugada`.
//  - El palo de cada ronda lo fija el motor (la acción `jugar` no lleva palo):
//    inicial al azar; cada ronda nueva, distinto al anterior.

import { barajar, type GeneradorAleatorio } from "./aleatorio.js";
import type { Carta, Palo } from "./carta.js";
import { PALOS } from "./carta.js";
import { crearBarajaCompleta, repartir } from "./baraja.js";
import { REGLAS_MENTIROSO } from "./reglas.js";

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

/** Las últimas cartas puestas, para resolver una acusación (§5). */
export interface UltimaJugada {
  readonly jugador: string;
  /** 1 a 3 (§4). */
  readonly cantidad: number;
  /** Las cartas REALES recién puestas (lo que se destapa al acusar). */
  readonly cartas: readonly Carta[];
}

export interface EstadoPartida {
  /** Cartas en mano por jugador (ocultas para los demás). */
  readonly manos: Readonly<Record<string, readonly Carta[]>>;
  /** Cartas jugadas boca abajo (ocultas). */
  readonly pila: readonly Carta[];
  /** Palo declarado de la ronda actual. */
  readonly paloRonda: Palo;
  /** Palo de la ronda anterior, para forzar uno distinto (§6); null en la 1.ª. */
  readonly paloRondaAnterior: Palo | null;
  /** Orden de turnos (ids), fijado al repartir. */
  readonly ordenJugadores: readonly string[];
  readonly jugadorEnTurno: string;
  readonly ultimaJugada: UltimaJugada | null;
  /** Quien vació su mano y espera que su jugada final se acepte (§8.1). */
  readonly ganadorPendiente: string | null;
  /** Ganador confirmado; mientras sea null la partida sigue. */
  readonly ganador: string | null;
}

export type CodigoError =
  | "JUGADORES_INVALIDOS"
  | "PARTIDA_TERMINADA"
  | "NO_ES_TU_TURNO"
  | "CANTIDAD_INVALIDA"
  | "CARTAS_INSUFICIENTES"
  | "NADA_QUE_ACUSAR"
  | "NO_AUTO_ACUSACION"
  | "JUGADOR_DESCONOCIDO";

export interface ErrorJuego {
  readonly codigo: CodigoError;
  readonly mensaje: string;
}

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorJuego };

function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

function error<T>(codigo: CodigoError, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}

// ── Helpers internos ────────────────────────────────────────────────────────

/** Siguiente jugador en la rueda de turnos. */
function siguienteJugador(orden: readonly string[], actual: string): string {
  const i = orden.indexOf(actual);
  return orden[(i + 1) % orden.length] ?? actual;
}

/**
 * Palo de la ronda nueva: distinto al anterior (§6). En la primera ronda
 * (anterior === null) cualquiera de los 4 sirve. La elección es del rng.
 */
function elegirPalo(anterior: Palo | null, rng: GeneradorAleatorio): Palo {
  const opciones =
    anterior === null ? PALOS : PALOS.filter((p) => p !== anterior);
  const idx = Math.floor(rng() * opciones.length);
  return opciones[idx] ?? "picas";
}

/** Devuelve las manos con la mano de un jugador reemplazada (inmutable). */
function conMano(
  manos: Readonly<Record<string, readonly Carta[]>>,
  jugador: string,
  mano: readonly Carta[],
): Record<string, readonly Carta[]> {
  return { ...manos, [jugador]: mano };
}

function validarJugadores(datos: readonly DatosJugador[]): ErrorJuego | null {
  if (datos.length < 2) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "se necesitan al menos 2 jugadores" };
  }
  const ids = datos.map((d) => d.id);
  if (ids.some((id) => id.length === 0)) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay un id de jugador vacío" };
  }
  if (new Set(ids).size !== ids.length) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay ids de jugador duplicados" };
  }
  return null;
}

function montar(
  datos: readonly DatosJugador[],
  baraja: readonly Carta[],
  paloInicial: Palo,
): EstadoPartida {
  const orden = datos.map((d) => d.id);
  const manosArr = repartir(baraja, orden.length);
  const manos: Record<string, readonly Carta[]> = {};
  orden.forEach((id, i) => {
    manos[id] = manosArr[i] ?? [];
  });
  return {
    manos,
    pila: [],
    paloRonda: paloInicial,
    paloRondaAnterior: null,
    ordenJugadores: orden,
    jugadorEnTurno: orden[0] ?? "",
    ultimaJugada: null,
    ganadorPendiente: null,
    ganador: null,
  };
}

// ── Creación de partida ─────────────────────────────────────────────────────

/** Crea la partida barajando la baraja completa con el rng dado (§3). */
export function crearPartida(
  datos: readonly DatosJugador[],
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  const err = validarJugadores(datos);
  if (err !== null) return { ok: false, error: err };
  const baraja = barajar(crearBarajaCompleta(), rng);
  return ok(montar(datos, baraja, elegirPalo(null, rng)));
}

/**
 * Variante determinista para tests: reparte la baraja dada TAL CUAL (sin
 * barajar) y usa el palo inicial indicado, así se pueden montar manos exactas.
 */
export function crearPartidaConBaraja(
  datos: readonly DatosJugador[],
  baraja: readonly Carta[],
  paloInicial: Palo = "picas",
): Resultado<EstadoPartida> {
  const err = validarJugadores(datos);
  if (err !== null) return { ok: false, error: err };
  return ok(montar(datos, baraja, paloInicial));
}

// ── Acciones ────────────────────────────────────────────────────────────────

/**
 * Pone `cantidad` cartas (del frente de la mano) boca abajo sobre la pila,
 * declarando el palo de la ronda (§4). Las cartas pueden o no coincidir con el
 * palo: ahí está el faroleo. Si con esto el jugador vacía su mano, queda como
 * ganador PENDIENTE (§8.1). Si ya había un ganador pendiente (de la jugada
 * anterior) y ahora juega el siguiente, esa jugada se "acepta" y se confirma.
 */
export function jugar(
  estado: EstadoPartida,
  jugador: string,
  cantidad: number,
): Resultado<EstadoPartida> {
  if (estado.ganador !== null) {
    return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (jugador !== estado.jugadorEnTurno) {
    return error("NO_ES_TU_TURNO", "no es tu turno");
  }
  // El siguiente jugador toma su turno => la jugada final pendiente se acepta.
  if (estado.ganadorPendiente !== null) {
    return ok({ ...estado, ganador: estado.ganadorPendiente });
  }
  const { min, max } = REGLAS_MENTIROSO.cartasPorTurno;
  if (!Number.isInteger(cantidad) || cantidad < min || cantidad > max) {
    return error("CANTIDAD_INVALIDA", `debes jugar entre ${min} y ${max} cartas`);
  }
  const mano = estado.manos[jugador] ?? [];
  if (mano.length < cantidad) {
    return error("CARTAS_INSUFICIENTES", "no tienes esa cantidad de cartas");
  }
  const cartas = mano.slice(0, cantidad);
  const nuevaMano = mano.slice(cantidad);
  return ok({
    ...estado,
    manos: conMano(estado.manos, jugador, nuevaMano),
    pila: [...estado.pila, ...cartas],
    ultimaJugada: { jugador, cantidad, cartas },
    jugadorEnTurno: siguienteJugador(estado.ordenJugadores, jugador),
    ganadorPendiente: nuevaMano.length === 0 ? jugador : null,
  });
}

/**
 * "¡Mentiroso!" sobre la última jugada (§5). Revela esas cartas:
 *  - si TODAS son del palo declarado, el acusado decía verdad => recoge el ACUSADOR;
 *  - si ALGUNA no lo es, el acusado mentía => recoge el ACUSADO.
 * Quien recoge la pila inicia la ronda nueva con un palo distinto (§6). Si el
 * acusado era ganador pendiente y sobrevive (decía verdad), su victoria se
 * confirma; si mentía, recoge y la victoria pendiente se cancela.
 */
export function acusar(
  estado: EstadoPartida,
  acusador: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  if (estado.ganador !== null) {
    return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (!estado.ordenJugadores.includes(acusador)) {
    return error("JUGADOR_DESCONOCIDO", "ese jugador no está en la partida");
  }
  const jugada = estado.ultimaJugada;
  if (jugada === null) {
    return error("NADA_QUE_ACUSAR", "no hay una jugada que acusar");
  }
  if (acusador === jugada.jugador) {
    return error("NO_AUTO_ACUSACION", "no puedes acusar tu propia jugada");
  }
  const acusadoDeciaVerdad = jugada.cartas.every((c) => c.palo === estado.paloRonda);
  const quienRecoge = acusadoDeciaVerdad ? acusador : jugada.jugador;
  const manoRecoge = [...(estado.manos[quienRecoge] ?? []), ...estado.pila];
  // El acusado era ganador pendiente y sobrevivió => victoria confirmada.
  const ganaPendiente =
    estado.ganadorPendiente !== null && quienRecoge === acusador;
  return ok({
    ...estado,
    manos: conMano(estado.manos, quienRecoge, manoRecoge),
    pila: [],
    paloRonda: elegirPalo(estado.paloRonda, rng),
    paloRondaAnterior: estado.paloRonda,
    jugadorEnTurno: quienRecoge,
    ultimaJugada: null,
    ganadorPendiente: null,
    ganador: ganaPendiente ? estado.ganadorPendiente : null,
  });
}

/** Cartas que le quedan a un jugador (para vistas/UI; el core no las oculta). */
export function cartasEnMano(estado: EstadoPartida, jugador: string): number {
  return (estado.manos[jugador] ?? []).length;
}
