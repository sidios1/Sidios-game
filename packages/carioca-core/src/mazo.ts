// Construcción del mazo, reparto y reposición (REGLAS_CARIOCA.md §1).
// Convención de todo el motor: la CIMA de un montón (mazo o pozo) es el
// ÚLTIMO elemento del array.

import type { Carta } from "./carta.js";
import { crearCartaNormal, crearComodin, PINTAS, VALORES } from "./carta.js";
import { MATERIALES } from "./contratos.js";

/**
 * §1: cantidad de mazos según el número de jugadores (sin tope superior).
 * mazos = mazosPorBloque × máx(1, piso(jugadores / jugadoresPorBloque)).
 * Ej.: 2/4/6 → 2 mazos, 8 → 4, 12 → 6, 16 → 8.
 */
export function mazosParaJugadores(numJugadores: number): number {
  return (
    MATERIALES.mazosPorBloque *
    Math.max(1, Math.floor(numJugadores / MATERIALES.jugadoresPorBloque))
  );
}

/** §1: comodines según el número de jugadores (2 por mazo). */
export function comodinesParaJugadores(numJugadores: number): number {
  return mazosParaJugadores(numJugadores) * MATERIALES.comodinesPorMazo;
}

/**
 * Mazo completo para `numJugadores`: tantas copias de cada carta normal como
 * mazos correspondan, más sus comodines (§1). El id distingue cada copia por
 * índice, así no hay tope de mazos. Con 2–6 jugadores son las 108 cartas
 * clásicas (2 mazos + 4 comodines).
 */
export function crearMazoCompleto(numJugadores: number): Carta[] {
  const numMazos = mazosParaJugadores(numJugadores);
  const cartas: Carta[] = [];
  for (let copia = 0; copia < numMazos; copia++) {
    for (const pinta of PINTAS) {
      for (const valor of VALORES) {
        cartas.push(crearCartaNormal(pinta, valor, String(copia)));
      }
    }
  }
  const comodines = comodinesParaJugadores(numJugadores);
  for (let i = 1; i <= comodines; i++) {
    cartas.push(crearComodin(i));
  }
  return cartas;
}

export interface Reparto {
  readonly manos: readonly (readonly Carta[])[];
  readonly mazoRestante: readonly Carta[];
}

/** Reparte desde la cima del mazo, un bloque por jugador. */
export function repartir(
  mazo: readonly Carta[],
  numJugadores: number,
  cartasPorJugador: number,
): Reparto {
  const restante = [...mazo];
  const manos: Carta[][] = [];
  for (let j = 0; j < numJugadores; j++) {
    const mano: Carta[] = [];
    for (let k = 0; k < cartasPorJugador; k++) {
      const carta = restante.pop();
      if (carta !== undefined) mano.push(carta);
    }
    manos.push(mano);
  }
  return { manos, mazoRestante: restante };
}

/**
 * Mazo agotado (decisión confirmada, no cubierta por REGLAS_CARIOCA.md):
 * se conserva la carta superior del pozo y el resto se transforma en mazo
 * SIN barajar, de modo que la última carta descartada es la primera en
 * robarse. Ejemplo: pozo [c1, c2, c3] (cima c3) → pozo [c3], y el nuevo
 * mazo roba primero c2, luego c1.
 */
export function reponerMazoDesdePozo(pozo: readonly Carta[]): {
  readonly mazo: Carta[];
  readonly pozo: Carta[];
} {
  if (pozo.length <= 1) {
    return { mazo: [], pozo: [...pozo] };
  }
  const cima = pozo[pozo.length - 1];
  const resto = pozo.slice(0, -1);
  return { mazo: resto, pozo: cima === undefined ? [] : [cima] };
}
