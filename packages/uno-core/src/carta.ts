// Modelo de carta de UNO (REGLAS_UNO.md). El mazo tiene 108 cartas: por color
// (rojo, amarillo, verde, azul) un 0, dos de cada 1–9, dos Skip, dos Reverse,
// dos +2; más 4 Wild y 4 Wild +4. El `id` es único en el mazo y sirve para
// mover/identificar cartas; el resto de campos llevan el significado de juego.

export type Color = "rojo" | "amarillo" | "verde" | "azul";

export const COLORES: readonly Color[] = ["rojo", "amarillo", "verde", "azul"];

/** Valores numéricos posibles de una carta de número. */
export type Valor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Cartas de acción CON color. */
export type Simbolo = "skip" | "reverse" | "mas2";

/** Comodines SIN color (el color lo elige quien los juega). */
export type Comodin = "wild" | "mas4";

export type CartaColor =
  | { readonly id: string; readonly color: Color; readonly tipo: "numero"; readonly valor: Valor }
  | { readonly id: string; readonly color: Color; readonly tipo: Simbolo };

export type CartaComodin = { readonly id: string; readonly tipo: Comodin };

export type Carta = CartaColor | CartaComodin;

/** Un comodín (wild o +4) no tiene color propio. */
export function esComodin(carta: Carta): carta is CartaComodin {
  return carta.tipo === "wild" || carta.tipo === "mas4";
}

/** Cuánto suma una carta al acumulador de "+": +2 → 2, +4 → 4, resto → 0. */
export function incrementoMas(carta: Carta): number {
  if (carta.tipo === "mas2") return 2;
  if (carta.tipo === "mas4") return 4;
  return 0;
}

/**
 * Valor de la carta para el puntaje del ganador (REGLAS_UNO.md "Fin de ronda"):
 * números su valor nominal; Skip/Reverse/+2 → 20; Wild/+4 → 50.
 */
export function valorPuntos(carta: Carta): number {
  if (carta.tipo === "numero") return carta.valor;
  if (carta.tipo === "wild" || carta.tipo === "mas4") return 50;
  return 20; // skip, reverse, mas2
}
