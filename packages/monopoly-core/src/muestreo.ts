// Sorteo ponderado y tiers por percentil (REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §3.2). `muestrearPonderado` es un duplicado local del patrón de
// rumble-core/src/muestreo.ts (ruleta de peso acumulado) — no se importa
// rumble-core, monopoly-core queda standalone.
//
// Alcance del percentil (ambigüedad de reglas resuelta con el usuario): el
// tier (Malo/Normal/Raro) se sortea sobre el pool COMPLETO de la liga/Resto
// del Mundo (todas las posiciones mezcladas, ordenado por rating); recién
// después se filtra por la posición elegida por el comprador DENTRO del
// rango de rating de ese tier.
//
// Cascada de fallback (decisión de esta sesión, el reglamento no cubre el
// caso de que no exista un jugador de la posición pedida en el tier
// sorteado — inevitable en pools chicos como el mock de pruebas):
//   nivel 0: tier ∩ posición
//   nivel 1 (si nivel 0 vacío): toda la liga filtrada solo por posición
//   nivel 2 (si nivel 1 vacío): cualquier jugador de la liga
// `validarPoolSobres` ya garantiza que cada liga tiene ≥1 jugador, así que
// nivel 2 nunca vuelve `undefined` salvo pool vacío (invariante interna).

import type { GeneradorAleatorio } from "./aleatorio.js";
import type { JugadorPool, PosicionJugador, TecnicoPool } from "./fuenteSobres.js";
import { REGLAS_MONOPOLY, type TramosTier } from "./reglas.js";

/** Tramos a usar para una celda de liga: bono de la celda más cara (§3.2). */
export function tramosParaLiga(esCeldaMasCara: boolean): TramosTier {
  return esCeldaMasCara ? REGLAS_MONOPOLY.tiers.ligaCeldaMasCara : REGLAS_MONOPOLY.tiers.liga;
}

/** Ruleta de peso acumulado: sortea un elemento proporcional a su peso. */
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
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && peso(item) > 0) return item;
  }
  return undefined;
}

function elegirUniforme<T>(items: readonly T[], rng: GeneradorAleatorio): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.min(Math.floor(rng() * items.length), items.length - 1);
  return items[idx];
}

export type Tier = "malo" | "normal" | "raro";

/** Corta el pool ordenado por rating en 3 rangos según los tramos porcentuales. */
export function cortesPercentil(
  pool: readonly JugadorPool[],
  tramos: TramosTier,
): Record<Tier, readonly JugadorPool[]> {
  const ordenado = [...pool].sort((a, b) => a.rating - b.rating);
  const n = ordenado.length;
  const corteMalo = Math.round((tramos.malo / 100) * n);
  const corteNormal = Math.round(((tramos.malo + tramos.normal) / 100) * n);
  return {
    malo: ordenado.slice(0, corteMalo),
    normal: ordenado.slice(corteMalo, corteNormal),
    raro: ordenado.slice(corteNormal, n),
  };
}

/** Sortea un tier con las probabilidades de `tramos` (ruleta ponderada). */
export function elegirTier(tramos: TramosTier, rng: GeneradorAleatorio): Tier {
  const tiers: readonly Tier[] = ["malo", "normal", "raro"];
  return muestrearPonderado(tiers, (t) => tramos[t], rng) ?? "normal";
}

/**
 * Quita del pool las entradas de futbolistas reales ya sorteados en esta
 * partida (§9: un mismo `jugadorId` puede tener varias entradas de
 * posición, pero solo puede salir sorteado una vez). Se llama ANTES de
 * `elegirJugadorParaSobre`; la cascada de fallback de esa función resuelve
 * el resto con normalidad sobre lo que quede.
 */
export function excluirYaSorteados(
  pool: readonly JugadorPool[],
  jugadoresRealesSorteados: readonly string[],
): readonly JugadorPool[] {
  if (jugadoresRealesSorteados.length === 0) return pool;
  const excluidos = new Set(jugadoresRealesSorteados);
  return pool.filter((j) => !excluidos.has(j.jugadorId));
}

/** Punto de entrada único para "abrir un sobre" de jugadores. Ver cascada arriba. */
export function elegirJugadorParaSobre(
  pool: readonly JugadorPool[],
  tramos: TramosTier,
  posicion: PosicionJugador,
  rng: GeneradorAleatorio,
): JugadorPool | undefined {
  const tier = elegirTier(tramos, rng);
  const cortes = cortesPercentil(pool, tramos);

  const nivel0 = cortes[tier].filter((j) => j.posicion === posicion);
  if (nivel0.length > 0) return elegirUniforme(nivel0, rng);

  const nivel1 = pool.filter((j) => j.posicion === posicion);
  if (nivel1.length > 0) return elegirUniforme(nivel1, rng);

  return elegirUniforme(pool, rng);
}

/** Para técnicos: sin tier, sin posición — uniforme sobre el pool completo. */
export function elegirTecnicoParaSobre(
  pool: readonly TecnicoPool[],
  rng: GeneradorAleatorio,
): TecnicoPool | undefined {
  return elegirUniforme(pool, rng);
}
