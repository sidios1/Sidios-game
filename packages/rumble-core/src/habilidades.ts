// Modelo de las 18 habilidades del modo Rumble como DATOS serializables
// (REGLAS_RUMBLE.md §3, §5, §9). Sin funciones ni referencias a UI: es un
// catálogo que el motor (Sesión 2) y el panel de config (Sesión 3) consumen.

export type HabilidadId =
  // General (§3.1)
  | "DECRETALO"
  | "MISH"
  | "RADAR"
  | "AUGURIO"
  | "SAPO"
  | "JUDIO"
  | "PESAO"
  | "OJO"
  // Primeros 3 turnos (§3.2)
  | "GINYU"
  | "CHATO"
  | "MATO"
  | "TROLL"
  | "EXODIA"
  | "GUASON"
  // Doble filo (§3.3)
  | "DOBLE"
  | "PILLO"
  | "TOCO"
  | "EXTRA";

export type GrupoHabilidad = "general" | "primeros3Turnos" | "dobleFilo";

export type TierHabilidad = "alto" | "medio" | "utilidad";

/** Categoría de hook técnico (SPIKE_RUMBLE.md §1). */
export type CategoriaEfecto =
  | "info"
  | "robo"
  | "mutPropia"
  | "mutAjena"
  | "victoria"
  | "turno"
  | "puntaje"
  | "pasiva";

/** Modelo de cargas (§2.1): usos/consultas/robos limitados, o pasiva. */
export type Cargas =
  | { readonly tipo: "usos"; readonly cantidad: number }
  | { readonly tipo: "consultas"; readonly cantidad: number }
  | { readonly tipo: "robos"; readonly cantidad: number }
  | { readonly tipo: "pasiva" };

/**
 * Ventana de validez (B1, §3.2). `primeros3Turnos` es GLOBAL: los turnos 1–3 de
 * la ronda (`turno.numero ≤ 3`), no los 3 turnos propios de cada jugador.
 * `estricta` marca que la ventana no es ampliable (EXODIA); no cambia el número.
 */
export type Ventana =
  | { readonly tipo: "ronda" }
  | { readonly tipo: "primeros3Turnos"; readonly estricta: boolean };

/** Restricciones declarativas (banderas de balance/transparencia §2). */
export interface Restricciones {
  readonly objetivoAleatorio?: boolean; // GINYU: el objetivo no se elige
  readonly anuncioPublico?: boolean; // DOBLE: se anuncia a todos
  readonly transparencia?: boolean; // el afectado se entera de la disrupción
  readonly compensacion?: boolean; // OJO: carta extra de compensación
}

export interface IHabilidad {
  readonly id: HabilidadId;
  readonly nombre: string;
  readonly grupo: GrupoHabilidad;
  readonly tier: TierHabilidad;
  readonly categoria: CategoriaEfecto;
  readonly cargas: Cargas;
  readonly ventana: Ventana;
  readonly restricciones: Restricciones;
}

const RONDA: Ventana = { tipo: "ronda" };
const PRIMEROS_3: Ventana = { tipo: "primeros3Turnos", estricta: false };

export const HABILIDADES: readonly IHabilidad[] = [
  // === General (§3.1) ===
  { id: "DECRETALO", nombre: "DECRETALO", grupo: "general", tier: "utilidad", categoria: "robo", cargas: { tipo: "robos", cantidad: 3 }, ventana: RONDA, restricciones: {} },
  { id: "MISH", nombre: "MISH", grupo: "general", tier: "utilidad", categoria: "info", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: {} },
  { id: "RADAR", nombre: "RADAR", grupo: "general", tier: "utilidad", categoria: "info", cargas: { tipo: "pasiva" }, ventana: RONDA, restricciones: {} },
  { id: "AUGURIO", nombre: "AUGURIO", grupo: "general", tier: "utilidad", categoria: "info", cargas: { tipo: "consultas", cantidad: 3 }, ventana: RONDA, restricciones: {} },
  { id: "SAPO", nombre: "SAPO", grupo: "general", tier: "alto", categoria: "info", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: {} },
  { id: "JUDIO", nombre: "JUDIO", grupo: "general", tier: "alto", categoria: "robo", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: { transparencia: true } },
  { id: "PESAO", nombre: "PESAO", grupo: "general", tier: "utilidad", categoria: "pasiva", cargas: { tipo: "pasiva" }, ventana: RONDA, restricciones: {} },
  { id: "OJO", nombre: "OJO", grupo: "general", tier: "medio", categoria: "turno", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: { transparencia: true, compensacion: true } },
  // === Primeros 3 turnos (§3.2) ===
  { id: "GINYU", nombre: "GINYU", grupo: "primeros3Turnos", tier: "alto", categoria: "mutAjena", cargas: { tipo: "usos", cantidad: 1 }, ventana: PRIMEROS_3, restricciones: { objetivoAleatorio: true, transparencia: true } },
  { id: "CHATO", nombre: "CHATO", grupo: "primeros3Turnos", tier: "medio", categoria: "mutAjena", cargas: { tipo: "usos", cantidad: 1 }, ventana: PRIMEROS_3, restricciones: { transparencia: true } },
  // MATO es auto-perjuicio/auto-beneficio: excepción de ventana → toda la ronda (§3.2).
  { id: "MATO", nombre: "MATO", grupo: "primeros3Turnos", tier: "utilidad", categoria: "mutPropia", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: {} },
  { id: "TROLL", nombre: "TROLL", grupo: "primeros3Turnos", tier: "medio", categoria: "mutAjena", cargas: { tipo: "usos", cantidad: 1 }, ventana: PRIMEROS_3, restricciones: { transparencia: true } },
  { id: "EXODIA", nombre: "EXODIA", grupo: "primeros3Turnos", tier: "alto", categoria: "victoria", cargas: { tipo: "pasiva" }, ventana: { tipo: "primeros3Turnos", estricta: true }, restricciones: {} },
  // GUASON acuña un comodín-de-pinta con costo (§3.2 REGLAS_RUMBLE.md): ventana de
  // primeros 3 turnos (B1 global, no estricta). Movida aquí desde el grupo General.
  { id: "GUASON", nombre: "GUASON", grupo: "primeros3Turnos", tier: "utilidad", categoria: "mutPropia", cargas: { tipo: "usos", cantidad: 1 }, ventana: PRIMEROS_3, restricciones: {} },
  // === Doble filo (§3.3) ===
  { id: "DOBLE", nombre: "DOBLE", grupo: "dobleFilo", tier: "alto", categoria: "puntaje", cargas: { tipo: "pasiva" }, ventana: RONDA, restricciones: { anuncioPublico: true } },
  { id: "PILLO", nombre: "PILLO", grupo: "dobleFilo", tier: "medio", categoria: "mutAjena", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: { transparencia: true } },
  { id: "TOCO", nombre: "TOCO", grupo: "dobleFilo", tier: "medio", categoria: "victoria", cargas: { tipo: "pasiva" }, ventana: RONDA, restricciones: {} },
  { id: "EXTRA", nombre: "EXTRA", grupo: "dobleFilo", tier: "medio", categoria: "robo", cargas: { tipo: "usos", cantidad: 1 }, ventana: RONDA, restricciones: {} },
];

/** Todas las ids en orden de catálogo (pool activo por defecto). */
export const TODAS_LAS_IDS: readonly HabilidadId[] = HABILIDADES.map((h) => h.id);

const POR_ID: ReadonlyMap<HabilidadId, IHabilidad> = new Map(
  HABILIDADES.map((h) => [h.id, h]),
);

export function habilidadPorId(id: HabilidadId): IHabilidad | undefined {
  return POR_ID.get(id);
}

/**
 * Pesos por tier del preset *Equilibrado* (§5). PROVISIONAL: 1/3/6 relativos, a
 * afinar tras playtesting (§8.2). Las raras son raras; utilidad/info comunes.
 */
export const PESOS_TIER: Readonly<Record<TierHabilidad, number>> = {
  alto: 1,
  medio: 3,
  utilidad: 6,
};

/**
 * Pares prohibidos para un mismo jugador en una misma ronda (§4). El muestreo
 * nunca entrega ambas a un jugador (relevante con 2–3 habilidades/jugador).
 */
export const ANTI_COMBOS: readonly (readonly [HabilidadId, HabilidadId])[] = [
  ["PESAO", "JUDIO"],
];

/** ¿`a` y `b` forman un par anti-combo prohibido (§4)? */
export function esAntiCombo(a: HabilidadId, b: HabilidadId): boolean {
  return ANTI_COMBOS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}
