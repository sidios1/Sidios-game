// Mazo completo de UNO: 108 cartas (REGLAS_UNO.md "Mazo y reparto").
// Por color: un 0, dos de cada 1–9, dos Skip, dos Reverse, dos +2 (25 por color
// × 4 = 100). Más 4 Wild y 4 Wild +4 = 108. El barajado lo hace `crearPartida`
// con el rng inyectado; aquí solo se crea el mazo ordenado con ids estables.

import type { Carta, Simbolo, Valor } from "./carta.js";
import { COLORES } from "./carta.js";

/** Total de cartas del mazo de UNO. */
export const TOTAL_CARTAS = 108;

/** Los nueve números que aparecen DOS veces por color (el 0 va una sola vez). */
const NUMEROS_DOBLES: readonly Valor[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Los tres símbolos de acción con color, dos copias de cada uno por color. */
const SIMBOLOS: readonly Simbolo[] = ["skip", "reverse", "mas2"];

/** Crea el mazo completo de 108 cartas, ordenado, con ids únicos y estables. */
export function crearMazoCompleto(): Carta[] {
  const cartas: Carta[] = [];
  for (const color of COLORES) {
    cartas.push({ id: `${color}-0`, color, tipo: "numero", valor: 0 });
    for (const valor of NUMEROS_DOBLES) {
      cartas.push({ id: `${color}-${valor}-a`, color, tipo: "numero", valor });
      cartas.push({ id: `${color}-${valor}-b`, color, tipo: "numero", valor });
    }
    for (const simbolo of SIMBOLOS) {
      cartas.push({ id: `${color}-${simbolo}-a`, color, tipo: simbolo });
      cartas.push({ id: `${color}-${simbolo}-b`, color, tipo: simbolo });
    }
  }
  for (let i = 1; i <= 4; i++) cartas.push({ id: `wild-${i}`, tipo: "wild" });
  for (let i = 1; i <= 4; i++) cartas.push({ id: `mas4-${i}`, tipo: "mas4" });
  return cartas;
}
