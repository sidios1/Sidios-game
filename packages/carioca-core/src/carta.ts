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

export type Carta = CartaNormal | CartaComodin;

export function esComodin(carta: Carta): carta is CartaComodin {
  return carta.tipo === "comodin";
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
  return `${NOMBRES_VALOR[carta.valor]} de ${carta.pinta}`;
}
