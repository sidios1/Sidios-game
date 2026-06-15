// Modelo de carta de Mentiroso (REGLAS_MENTIROSO.md §1 y §9).
// Baraja inglesa de 52: SOLO importa el palo, no el valor. El `id` solo sirve
// para distinguir las 52 cartas entre sí (mover, recoger, comparar identidad).

export type Palo = "picas" | "corazones" | "diamantes" | "treboles";

export const PALOS: readonly Palo[] = [
  "picas",
  "corazones",
  "diamantes",
  "treboles",
];

export interface Carta {
  readonly palo: Palo;
  /** Único en la baraja: hay 13 cartas por palo (el valor es irrelevante). */
  readonly id: string;
}

const NOMBRE_PALO: Readonly<Record<Palo, string>> = {
  picas: "picas",
  corazones: "corazones",
  diamantes: "diamantes",
  treboles: "tréboles",
};

export function describirCarta(carta: Carta): string {
  return `carta de ${NOMBRE_PALO[carta.palo]}`;
}
