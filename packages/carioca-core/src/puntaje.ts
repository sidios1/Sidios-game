// Conteo de puntos (REGLAS_CARIOCA.md §7), basado en VALOR_PUNTOS de §9.

import type { Carta } from "./carta.js";
import { VALOR_PUNTOS } from "./contratos.js";

export function puntosCarta(carta: Carta): number {
  if (carta.tipo === "comodin") return VALOR_PUNTOS.comodin;
  // Comodín-de-pinta (Rumble/GUASON): puntúa como el comodín normal (30, §8.4
  // REGLAS_RUMBLE.md), aunque sea menos flexible.
  if (carta.tipo === "comodinPinta") return VALOR_PUNTOS.comodin;
  if (carta.valor === 1) return VALOR_PUNTOS.as;
  if (carta.valor >= 10) return VALOR_PUNTOS.diez_J_Q_K;
  // 2..9: VALOR_PUNTOS.numeros2a9 === "valorNominal"
  return carta.valor;
}

export function puntosMano(cartas: readonly Carta[]): number {
  return cartas.reduce((suma, carta) => suma + puntosCarta(carta), 0);
}
