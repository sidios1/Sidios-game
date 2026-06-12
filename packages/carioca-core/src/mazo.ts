// Construcción del mazo, reparto y reposición (REGLAS_CARIOCA.md §1).
// Convención de todo el motor: la CIMA de un montón (mazo o pozo) es el
// ÚLTIMO elemento del array.

import type { Carta } from "./carta.js";
import { crearCartaNormal, crearComodin, PINTAS, VALORES } from "./carta.js";

/** §1: dos mazos ingleses; los ids distinguen cada copia. */
export const COPIAS_DE_MAZO: readonly string[] = ["a", "b"];

/** §1: 4 comodines. */
export const CANTIDAD_COMODINES = 4;

/** 2 mazos ingleses + 4 comodines = 108 cartas (§1). */
export function crearMazoCompleto(): Carta[] {
  const cartas: Carta[] = [];
  for (const copia of COPIAS_DE_MAZO) {
    for (const pinta of PINTAS) {
      for (const valor of VALORES) {
        cartas.push(crearCartaNormal(pinta, valor, copia));
      }
    }
  }
  for (let i = 1; i <= CANTIDAD_COMODINES; i++) {
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
