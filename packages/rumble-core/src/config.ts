// Schema del panel de configuración de Rumble (REGLAS_RUMBLE.md §6) y su
// validación cruzada pura. Los defaults hacen que "empezar rápido" funcione sin
// tocar nada; la validación corre como cortesía en el cliente (Sesión 3) y como
// autoridad en el host (Sesión 2) antes de permitir "Iniciar".

import type { HabilidadId, TierHabilidad } from "./habilidades.js";
import { esAntiCombo, TODAS_LAS_IDS } from "./habilidades.js";

const IDS_VALIDAS: ReadonlySet<string> = new Set<string>(TODAS_LAS_IDS);

/** §6.2 — qué manos de Carioca componen la partida. */
export type ConfigRondas =
  | { readonly tipo: "completa" }
  | { readonly tipo: "subconjunto"; readonly manos: readonly number[] }
  | { readonly tipo: "corta"; readonly n: number };

/** §6.4 — ponderación por tier del sorteo (§5). */
export type ConfigPreset =
  | { readonly tipo: "equilibrado" }
  | { readonly tipo: "caos" }
  | { readonly tipo: "personalizado"; readonly pesos: Readonly<Record<TierHabilidad, number>> };

export interface ConfigRumble {
  readonly habilidadesPorJugador: number; // §6.1 — 1..3, default 1
  readonly rondas: ConfigRondas; // §6.2 — default completa
  readonly poolActivo: readonly HabilidadId[]; // §6.3 — default = las 18
  readonly presetPesos: ConfigPreset; // §6.4 — default equilibrado
  readonly reasignacion: "porRonda" | "fijas"; // §6.5 — default porRonda
  readonly repeticion: "permitir" | "excluirUltima"; // §6.6 — default permitir
  readonly colision: "permitirDuplicados" | "unicasPorRonda"; // §6.6 — default permitirDuplicados
  readonly penalizacionExtra: "descartar2" | "perderTurno" | "aleatorio"; // §6.7
  readonly visibilidad: "secreta" | "publica"; // §6.8 — default secreta
}

export const HABILIDADES_POR_JUGADOR_MIN = 1;
export const HABILIDADES_POR_JUGADOR_MAX = 3;

export const CONFIG_DEFAULT: ConfigRumble = {
  habilidadesPorJugador: 1,
  rondas: { tipo: "completa" },
  poolActivo: TODAS_LAS_IDS,
  presetPesos: { tipo: "equilibrado" },
  reasignacion: "porRonda",
  repeticion: "permitir",
  colision: "permitirDuplicados",
  // PROVISIONAL (§8.1): default a fijar tras playtesting.
  penalizacionExtra: "descartar2",
  visibilidad: "secreta",
};

// === Parseo de forma estricto ============================================
// El host recibe la config como blob OPACO (`unknown`) por `iniciarPartida`. Antes
// de la validación cruzada hay que parsear su FORMA de forma estricta (no confiar en
// el cliente): cualquier campo mal tipado → null. La validación de VIABILIDAD
// (§6, con numJugadores) es `validarConfigRumble`, aparte.

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function enLista<T extends string>(v: unknown, opciones: readonly T[]): v is T {
  return typeof v === "string" && (opciones as readonly string[]).includes(v);
}

function parsearRondas(v: unknown): ConfigRondas | null {
  if (!esObjeto(v)) return null;
  if (v["tipo"] === "completa") return { tipo: "completa" };
  if (v["tipo"] === "subconjunto") {
    const manos = v["manos"];
    if (!Array.isArray(manos) || !manos.every((m) => typeof m === "number")) {
      return null;
    }
    return { tipo: "subconjunto", manos: [...(manos as number[])] };
  }
  if (v["tipo"] === "corta") {
    const n = v["n"];
    if (typeof n !== "number") return null;
    return { tipo: "corta", n };
  }
  return null;
}

function parsearPreset(v: unknown): ConfigPreset | null {
  if (!esObjeto(v)) return null;
  if (v["tipo"] === "equilibrado") return { tipo: "equilibrado" };
  if (v["tipo"] === "caos") return { tipo: "caos" };
  if (v["tipo"] === "personalizado") {
    const pesos = v["pesos"];
    if (!esObjeto(pesos)) return null;
    const alto = pesos["alto"];
    const medio = pesos["medio"];
    const utilidad = pesos["utilidad"];
    if (
      typeof alto !== "number" ||
      typeof medio !== "number" ||
      typeof utilidad !== "number"
    ) {
      return null;
    }
    return { tipo: "personalizado", pesos: { alto, medio, utilidad } };
  }
  return null;
}

function parsearPool(v: unknown): readonly HabilidadId[] | null {
  if (!Array.isArray(v)) return null;
  const ids: HabilidadId[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !IDS_VALIDAS.has(x)) return null;
    ids.push(x as HabilidadId);
  }
  return ids;
}

/**
 * Parsea un blob opaco a una `ConfigRumble` validada en FORMA (no en viabilidad).
 * Devuelve null si algún campo falta o está mal tipado. El host la corre y luego
 * `validarConfigRumble` antes de aceptar `iniciarPartida`.
 */
export function parsearConfigRumble(crudo: unknown): ConfigRumble | null {
  if (!esObjeto(crudo)) return null;
  const habilidadesPorJugador = crudo["habilidadesPorJugador"];
  if (typeof habilidadesPorJugador !== "number") return null;
  const rondas = parsearRondas(crudo["rondas"]);
  if (rondas === null) return null;
  const poolActivo = parsearPool(crudo["poolActivo"]);
  if (poolActivo === null) return null;
  const presetPesos = parsearPreset(crudo["presetPesos"]);
  if (presetPesos === null) return null;
  const reasignacion = crudo["reasignacion"];
  if (!enLista(reasignacion, ["porRonda", "fijas"] as const)) return null;
  const repeticion = crudo["repeticion"];
  if (!enLista(repeticion, ["permitir", "excluirUltima"] as const)) return null;
  const colision = crudo["colision"];
  if (!enLista(colision, ["permitirDuplicados", "unicasPorRonda"] as const)) {
    return null;
  }
  const penalizacionExtra = crudo["penalizacionExtra"];
  if (
    !enLista(penalizacionExtra, ["descartar2", "perderTurno", "aleatorio"] as const)
  ) {
    return null;
  }
  const visibilidad = crudo["visibilidad"];
  if (!enLista(visibilidad, ["secreta", "publica"] as const)) return null;
  return {
    habilidadesPorJugador,
    rondas,
    poolActivo,
    presetPesos,
    reasignacion,
    repeticion,
    colision,
    penalizacionExtra,
    visibilidad,
  };
}

/** Resultado de validación (misma forma que `Validacion` de carioca-core). */
export type ResultadoConfig =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: string };

const VALIDA: ResultadoConfig = { valida: true };
function invalida(motivo: string): ResultadoConfig {
  return { valida: false, motivo };
}

function esEnteroEnRango(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Validación cruzada del panel (§6): pool no vacío; `habilidadesPorJugador` en
 * rango; suficientes habilidades por jugador respetando anti-combo (§4); y, si
 * `unicasPorRonda`, suficientes para todos sin reemplazo (§6.6). Pura.
 */
export function validarConfigRumble(
  config: ConfigRumble,
  numJugadores: number,
): ResultadoConfig {
  if (numJugadores < 1) {
    return invalida("se necesita al menos 1 jugador");
  }
  if (
    !esEnteroEnRango(
      config.habilidadesPorJugador,
      HABILIDADES_POR_JUGADOR_MIN,
      HABILIDADES_POR_JUGADOR_MAX,
    )
  ) {
    return invalida(
      `habilidadesPorJugador debe ser un entero entre ${HABILIDADES_POR_JUGADOR_MIN} y ${HABILIDADES_POR_JUGADOR_MAX}`,
    );
  }
  const pool = config.poolActivo;
  if (pool.length === 0) {
    return invalida("el pool de habilidades activas no puede estar vacío");
  }

  // Capacidad por jugador respetando anti-combo (§4): si el pool contiene ambos
  // miembros de un par prohibido, un jugador puede tomar como mucho |pool| − 1
  // habilidades distintas sin caer en el par.
  const poolContieneParProhibido = tieneParProhibido(pool);
  const capacidadPorJugador = pool.length - (poolContieneParProhibido ? 1 : 0);
  if (config.habilidadesPorJugador > capacidadPorJugador) {
    return invalida(
      poolContieneParProhibido
        ? `el pool no permite ${config.habilidadesPorJugador} habilidades por jugador respetando anti-combo (§4)`
        : `el pool tiene menos habilidades que las ${config.habilidadesPorJugador} pedidas por jugador`,
    );
  }

  // §6.6 únicas por ronda: muestreo global sin reemplazo → tienen que alcanzar.
  if (config.colision === "unicasPorRonda") {
    const necesarias = numJugadores * config.habilidadesPorJugador;
    if (necesarias > pool.length) {
      return invalida(
        `"únicas por ronda" exige ${necesarias} habilidades activas (jugadores × habilidadesPorJugador) y hay ${pool.length}`,
      );
    }
  }

  // §6.4 personalizado: los pesos deben permitir muestrear (suma positiva).
  if (config.presetPesos.tipo === "personalizado") {
    const pesos = config.presetPesos.pesos;
    const suma = pesos.alto + pesos.medio + pesos.utilidad;
    if (!Number.isFinite(suma) || suma <= 0) {
      return invalida("los pesos personalizados deben sumar un valor positivo");
    }
    if (pesos.alto < 0 || pesos.medio < 0 || pesos.utilidad < 0) {
      return invalida("los pesos personalizados no pueden ser negativos");
    }
  }

  const errorRondas = validarRondas(config.rondas);
  if (errorRondas !== null) return invalida(errorRondas);

  return VALIDA;
}

function tieneParProhibido(pool: readonly HabilidadId[]): boolean {
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a !== undefined && b !== undefined && esAntiCombo(a, b)) return true;
    }
  }
  return false;
}

function validarRondas(rondas: ConfigRondas): string | null {
  if (rondas.tipo === "subconjunto") {
    if (rondas.manos.length === 0) return "el subconjunto de manos no puede estar vacío";
    if (rondas.manos.some((m) => !esEnteroEnRango(m, 1, 9))) {
      return "las manos del subconjunto deben estar entre 1 y 9";
    }
  }
  if (rondas.tipo === "corta") {
    if (!esEnteroEnRango(rondas.n, 1, 9)) return "la partida corta usa entre 1 y 9 manos";
  }
  return null;
}
