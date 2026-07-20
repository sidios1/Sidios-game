// Etiqueta corta de una carta para el tooltip de hover (presentación pura del
// cliente; las reglas viven en carioca-core). Formato compacto tipo "A♠", "J♥",
// "10♣"; el comodín como "★". Los mapas replican los valores de
// escena/texturasCarta.ts (símbolos) y carioca-core/carta.ts (etiquetas): se
// mantienen aquí para no exportar internals del core ni del módulo de texturas.

import type { Carta, Pinta, ValorCarta } from "@juegos/carioca-core";

const SIMBOLOS: Readonly<Record<Pinta, string>> = {
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
  picas: "♠",
};

const ETIQUETAS: Readonly<Record<ValorCarta, string>> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

/** Etiqueta compacta de una carta: "A♠", "10♣"; comodín → "★"; de pinta → "★♠". */
export function etiquetaCorta(carta: Carta): string {
  if (carta.tipo === "comodin") return "★";
  if (carta.tipo === "comodinPinta") return `★${SIMBOLOS[carta.pinta]}`;
  return `${ETIQUETAS[carta.valor]}${SIMBOLOS[carta.pinta]}`;
}

/** Cartas de una combinación en orden, unidas por guion: "A♠-2♠-3♠-4♠-5♠". */
export function etiquetaCombinacion(cartas: readonly Carta[]): string {
  return cartas.map(etiquetaCorta).join("-");
}
