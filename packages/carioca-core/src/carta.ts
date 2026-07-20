// Modelo de carta (REGLAS_CARIOCA.md §1 y §3).
// Los 2 rojos NO son comodines: un 2♥ es una carta normal sin trato especial.

export type Pinta = "corazones" | "diamantes" | "treboles" | "picas";

export const PINTAS: readonly Pinta[] = [
  "corazones",
  "diamantes",
  "treboles",
  "picas",
];

/** 1 = As, 11 = J, 12 = Q, 13 = K. */
export type ValorCarta = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Orden natural A-2-…-Q-K; el índice de cada valor es `valor - 1`. */
export const VALORES: readonly ValorCarta[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
];

export interface CartaNormal {
  readonly tipo: "normal";
  readonly pinta: Pinta;
  readonly valor: ValorCarta;
  /** Único en el mazo: cada carta existe por duplicado (dos mazos ingleses). */
  readonly id: string;
}

export interface CartaComodin {
  readonly tipo: "comodin";
  readonly id: string;
}

/**
 * Comodín-de-pinta (modo Rumble / GUASON, §3.2 REGLAS_RUMBLE.md): representa
 * CUALQUIER carta de su pinta (cualquier valor) en escalas Y tríos de esa pinta.
 * Es MENOS flexible que el comodín normal (que sirve para cualquier pinta). NO se
 * saca del mazo: la ACUÑA la habilidad GUASON (ver `acunarComodinDePinta` en
 * partida.ts), única costura que rompe el invariante de multiset.
 */
export interface CartaComodinPinta {
  readonly tipo: "comodinPinta";
  readonly pinta: Pinta;
  readonly id: string;
}

export type Carta = CartaNormal | CartaComodin | CartaComodinPinta;

/** ¿Es el comodín normal (sin pinta)? El comodín-de-pinta NO cuenta aquí. */
export function esComodin(carta: Carta): carta is CartaComodin {
  return carta.tipo === "comodin";
}

/** ¿Es un comodín-de-pinta (Rumble/GUASON)? */
export function esComodinDePinta(carta: Carta): carta is CartaComodinPinta {
  return carta.tipo === "comodinPinta";
}

/** ¿Es un comodín de cualquier clase (normal o de pinta)? Actúa como comodín. */
export function esCualquierComodin(
  carta: Carta,
): carta is CartaComodin | CartaComodinPinta {
  return carta.tipo === "comodin" || carta.tipo === "comodinPinta";
}

export function crearCartaNormal(
  pinta: Pinta,
  valor: ValorCarta,
  copia: string,
): CartaNormal {
  return { tipo: "normal", pinta, valor, id: `${pinta}-${valor}-${copia}` };
}

export function crearComodin(indice: number): CartaComodin {
  return { tipo: "comodin", id: `comodin-${indice}` };
}

/**
 * Acuña un comodín-de-pinta (Rumble/GUASON). El `indice` debe hacerlo único dentro
 * del estado (el acuñador lo garantiza); el id incluye la pinta.
 */
export function crearComodinDePinta(
  pinta: Pinta,
  indice: number,
): CartaComodinPinta {
  return { tipo: "comodinPinta", pinta, id: `comodinPinta-${pinta}-${indice}` };
}

const NOMBRES_VALOR: Readonly<Record<ValorCarta, string>> = {
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

export function describirCarta(carta: Carta): string {
  if (carta.tipo === "comodin") return "comodín";
  if (carta.tipo === "comodinPinta") return `comodín de ${carta.pinta}`;
  return `${NOMBRES_VALOR[carta.valor]} de ${carta.pinta}`;
}
