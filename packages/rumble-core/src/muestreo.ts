// Muestreo del pool por ronda (REGLAS_RUMBLE.md §7). Determinista bajo semilla:
// consume el RNG inyectado de carioca-core. Pondera por tier (§5), respeta
// repetición/colisión (§6.6) y anti-combo (§4) por jugador.

import type { GeneradorAleatorio } from "@juegos/carioca-core";
import type { ConfigRumble, ConfigPreset } from "./config.js";
import type { HabilidadId, TierHabilidad } from "./habilidades.js";
import { esAntiCombo, habilidadPorId, PESOS_TIER } from "./habilidades.js";

export interface EntradaAsignacion {
  readonly config: ConfigRumble;
  readonly jugadorIds: readonly string[];
  /** §6.6 — última asignación por jugador, para `excluirUltima`. */
  readonly memoriaPrevia?: Readonly<Record<string, readonly HabilidadId[]>>;
  readonly rng: GeneradorAleatorio;
}

export interface AsignacionRonda {
  readonly porJugador: Readonly<Record<string, readonly HabilidadId[]>>;
}

function pesosDelPreset(preset: ConfigPreset): Readonly<Record<TierHabilidad, number>> {
  switch (preset.tipo) {
    case "equilibrado":
      return PESOS_TIER;
    case "caos":
      return { alto: 1, medio: 1, utilidad: 1 };
    case "personalizado":
      return preset.pesos;
  }
}

function pesoDeId(id: HabilidadId, pesos: Readonly<Record<TierHabilidad, number>>): number {
  const h = habilidadPorId(id);
  return h === undefined ? 0 : Math.max(0, pesos[h.tier]);
}

/**
 * Elige un elemento con probabilidad proporcional a su peso. Consume UN valor del
 * RNG. Devuelve undefined si no hay candidatos o todos pesan 0.
 */
export function muestrearPonderado<T>(
  items: readonly T[],
  peso: (item: T) => number,
  rng: GeneradorAleatorio,
): T | undefined {
  const total = items.reduce((suma, item) => suma + Math.max(0, peso(item)), 0);
  if (total <= 0) return undefined;
  let umbral = rng() * total;
  for (const item of items) {
    umbral -= Math.max(0, peso(item));
    if (umbral < 0) return item;
  }
  // Salvaguarda por error de redondeo: devuelve el último con peso positivo.
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && peso(item) > 0) return item;
  }
  return undefined;
}

/**
 * Asigna a cada jugador `habilidadesPorJugador` habilidades del pool activo,
 * ponderadas por el preset. Dentro de un jugador las habilidades son distintas y
 * no forman pares anti-combo (§4); con `unicasPorRonda` tampoco se repiten entre
 * jugadores (§6.6); con `excluirUltima` se evita la última recibida (§6.6).
 * Determinista: misma semilla + misma entrada ⇒ misma asignación.
 */
export function asignarHabilidadesRonda(entrada: EntradaAsignacion): AsignacionRonda {
  const { config, jugadorIds, rng } = entrada;
  const pesos = pesosDelPreset(config.presetPesos);
  const usadasGlobal = new Set<HabilidadId>();
  const porJugador: Record<string, readonly HabilidadId[]> = {};

  for (const jugadorId of jugadorIds) {
    const excluidas = new Set<HabilidadId>();
    if (config.repeticion === "excluirUltima") {
      for (const id of entrada.memoriaPrevia?.[jugadorId] ?? []) excluidas.add(id);
    }
    const propias: HabilidadId[] = [];
    for (let k = 0; k < config.habilidadesPorJugador; k++) {
      const candidatos = config.poolActivo.filter((id) => {
        if (propias.includes(id)) return false; // distinta dentro del jugador
        if (excluidas.has(id)) return false; // §6.6 excluirUltima
        if (config.colision === "unicasPorRonda" && usadasGlobal.has(id)) return false;
        if (propias.some((p) => esAntiCombo(p, id))) return false; // §4
        return true;
      });
      const elegido = muestrearPonderado(candidatos, (id) => pesoDeId(id, pesos), rng);
      if (elegido === undefined) break; // sin candidatos viables (config al límite)
      propias.push(elegido);
      if (config.colision === "unicasPorRonda") usadasGlobal.add(elegido);
    }
    porJugador[jugadorId] = propias;
  }

  return { porJugador };
}
