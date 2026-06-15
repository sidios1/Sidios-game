// Baraja inglesa de 52 cartas (REGLAS_MENTIROSO.md §1 y §3): 13 por palo.
// Solo importa el palo; el índice 1..13 únicamente da ids únicos.

import type { Carta, Palo } from "./carta.js";
import { PALOS } from "./carta.js";

/** Cartas por palo en una baraja inglesa. */
export const CARTAS_POR_PALO = 13;

/** Total de la baraja: 4 palos × 13. */
export const CARTAS_POR_BARAJA = PALOS.length * CARTAS_POR_PALO; // 52

/** Una baraja inglesa completa: 13 cartas de cada palo, ids únicos. */
export function crearBarajaCompleta(): Carta[] {
  const cartas: Carta[] = [];
  for (const palo of PALOS) {
    for (let i = 1; i <= CARTAS_POR_PALO; i++) {
      cartas.push({ palo, id: `${palo}-${i}` });
    }
  }
  return cartas;
}

/**
 * Reparte TODA la baraja entre `numJugadores` lo más parejo posible (§3):
 * las cartas se entregan una a una en rueda, así el resto (52 % n) recae en los
 * primeros jugadores y nadie queda con más de una carta de diferencia.
 */
export function repartir(
  baraja: readonly Carta[],
  numJugadores: number,
): Carta[][] {
  const manos: Carta[][] = Array.from({ length: numJugadores }, () => []);
  baraja.forEach((carta, indice) => {
    manos[indice % numJugadores]?.push(carta);
  });
  return manos;
}

/** Filtra una baraja por palo (útil para armar manos en tests deterministas). */
export function cartasDePalo(baraja: readonly Carta[], palo: Palo): Carta[] {
  return baraja.filter((c) => c.palo === palo);
}
