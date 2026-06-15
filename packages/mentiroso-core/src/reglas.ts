// Reglas duras de Mentiroso como DATOS (REGLAS_MENTIROSO.md §9).
// Transcripción fiel del reglamento: si una regla cambia, se edita el doc
// primero y este archivo lo sigue. El motor no hardcodea estos valores en
// condicionales sueltos: los lee de aquí.

import type { Palo } from "./carta.js";
import { PALOS } from "./carta.js";

export interface ReglasMentiroso {
  /** Cartas que se pueden poner por turno (§4). */
  readonly cartasPorTurno: { readonly min: number; readonly max: number };
  /** Los 4 palos de la baraja. */
  readonly palos: readonly Palo[];
  /** El palo de la ronda nueva debe ser distinto al de la anterior (§6). */
  readonly nuevaRondaPaloDistinto: boolean;
  /** El valor de la carta es irrelevante; solo cuenta el palo (§1). */
  readonly soloImportaElPalo: boolean;
}

export const REGLAS_MENTIROSO: ReglasMentiroso = {
  cartasPorTurno: { min: 1, max: 3 },
  palos: PALOS,
  nuevaRondaPaloDistinto: true,
  soloImportaElPalo: true,
};
