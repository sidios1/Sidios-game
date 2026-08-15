// Formación 4-3-3 de la votación final (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §7):
// 11 slots de jugador + 1 de técnico = las 12 categorías de voto. §7 nombra
// los slots en español (POR, LD, DFC, LI, MC, MCO, ED, DC, EI) pero nunca los
// vincula al enum `PosicionJugador` de fuenteSobres.ts (GK/CB/LB/RB/CDM/CM/
// CAM/LM/RM/LW/RW/ST, pensado para las cartas de sobre del dataset real).
//
// PREGUNTA ABIERTA (no definida en §7, decisión tomada aquí para poder
// implementar algo testeable — a confirmar/ratificar en el .md):
// - Mapeo elegido: traducción literal 1:1 (POR=GK, LD=RB, LI=LB, DFC=CB,
//   MC=CM, MCO=CAM, ED=RW, EI=LW, DC=ST). Las cartas con posición CDM, LM o
//   RM no calzan en ningún slot de este 4-3-3 fijo: quedan siempre en banca.
// - Los dos slots DFC (y los dos MC) se tratan como intercambiables entre sí:
//   §7 aclara que son categorías de voto independientes pero no distingue
//   izquierda/derecha, así que cualquier carta CB sirve para DFC_1 o DFC_2
//   (mismo criterio para MC_1/MC_2 con CM).

import type { PosicionJugador } from "./fuenteSobres.js";

export type IdSlotFormacion =
  | "POR"
  | "LD"
  | "DFC_1"
  | "DFC_2"
  | "LI"
  | "MC_1"
  | "MCO"
  | "MC_2"
  | "ED"
  | "DC"
  | "EI"
  | "TECNICO";

export interface SlotFormacion {
  readonly id: IdSlotFormacion;
  /** Nombre de categoría para mostrar (los slots DFC/MC comparten etiqueta). */
  readonly etiqueta: string;
  readonly tipo: "jugador" | "tecnico";
  /** Ausente cuando `tipo === "tecnico"`. */
  readonly posicionesAceptadas?: readonly PosicionJugador[];
}

/** Los 12 slots de §7, en el orden en que los enumera el reglamento. */
export const FORMACION_4_3_3: readonly SlotFormacion[] = [
  { id: "POR", etiqueta: "POR", tipo: "jugador", posicionesAceptadas: ["GK"] },
  { id: "LD", etiqueta: "LD", tipo: "jugador", posicionesAceptadas: ["RB"] },
  { id: "DFC_1", etiqueta: "DFC", tipo: "jugador", posicionesAceptadas: ["CB"] },
  { id: "DFC_2", etiqueta: "DFC", tipo: "jugador", posicionesAceptadas: ["CB"] },
  { id: "LI", etiqueta: "LI", tipo: "jugador", posicionesAceptadas: ["LB"] },
  { id: "MC_1", etiqueta: "MC", tipo: "jugador", posicionesAceptadas: ["CM"] },
  { id: "MCO", etiqueta: "MCO", tipo: "jugador", posicionesAceptadas: ["CAM"] },
  { id: "MC_2", etiqueta: "MC", tipo: "jugador", posicionesAceptadas: ["CM"] },
  { id: "ED", etiqueta: "ED", tipo: "jugador", posicionesAceptadas: ["RW"] },
  { id: "DC", etiqueta: "DC", tipo: "jugador", posicionesAceptadas: ["ST"] },
  { id: "EI", etiqueta: "EI", tipo: "jugador", posicionesAceptadas: ["LW"] },
  { id: "TECNICO", etiqueta: "Técnico", tipo: "tecnico" },
];

export function slotPorId(id: IdSlotFormacion): SlotFormacion {
  // FORMACION_4_3_3 cubre el union completo de IdSlotFormacion por construcción.
  return FORMACION_4_3_3.find((s) => s.id === id) as SlotFormacion;
}
