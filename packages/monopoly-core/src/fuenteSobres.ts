// Contrato de la fuente de sobres (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1, §3,
// §3.2). Mirror de meloquiz-core/catalogo.ts: el núcleo consume un
// `PoolSobres` YA ARMADO y es agnóstico de dónde salió — no lee datasets, no
// normaliza nombres. v1 (S1) usa un mock (ver apoyoPruebas.ts, no exportado);
// la fuente real (dataset EA FC de datos/jugadores_monopoly.json, S2) implementa
// este mismo puerto sin que el núcleo cambie.

import { error, ok, type Resultado } from "./resultado.js";
import type { NombreLiga } from "./tablero.js";
import { LIGAS } from "./tablero.js";

/**
 * Posiciones de jugador. Compatible con el campo `posicion` del dataset real
 * (datos/jugadores_monopoly.json, S2: GK/CB/LB/RB/CDM/CM/CAM/LM/RM/LW/RW/ST)
 * para que S2 pueda satisfacer este puerto sin traducir posiciones.
 */
export type PosicionJugador =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST";

export const POSICIONES: readonly PosicionJugador[] = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
];

/** Un jugador listo para entrar a un sobre. */
export interface JugadorPool {
  readonly id: string;
  /**
   * Identidad del futbolista real, compartida por todas sus entradas de
   * distinta posición (§9: un jugador con >1 posición elegible tiene varias
   * entradas en el pool, pero solo puede salir sorteado UNA vez por
   * partida — ver `excluirYaSorteados` en muestreo.ts).
   */
  readonly jugadorId: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly rating: number;
  readonly posicion: PosicionJugador;
  /** Calidad de origen del dataset (incluye "Icon" para Resto del Mundo); cosmética. */
  readonly calidad: string;
}

/** Un técnico listo para entrar a un sobre (§2: sin posición). */
export interface TecnicoPool {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
}

/** El material de una partida: los pools de las 8 ligas + Resto del Mundo + Técnicos. */
export interface PoolSobres {
  readonly porLiga: Readonly<Record<NombreLiga, readonly JugadorPool[]>>;
  readonly restoDelMundo: readonly JugadorPool[];
  readonly tecnicos: readonly TecnicoPool[];
}

/**
 * Puerto de una fuente de sobres. El núcleo NUNCA llama `cargar()`: solo
 * declara la forma para que la fuente real (S2) la implemente y el servidor
 * inyecte el pool ya resuelto en `crearPartida`.
 */
export interface IFuenteSobres {
  readonly id: string;
  cargar(): Promise<PoolSobres>;
}

/**
 * Valida que un pool sirva para jugar: cada una de las 8 ligas tiene al menos
 * un jugador, Resto del Mundo y Técnicos también, e ids únicos y no vacíos
 * dentro de cada sub-pool (evita colisiones al construir `CartaMiClub`).
 */
export function validarPoolSobres(pool: PoolSobres): Resultado<PoolSobres> {
  for (const nombreLiga of LIGAS) {
    const jugadores = pool.porLiga[nombreLiga];
    if (jugadores === undefined || jugadores.length === 0) {
      return error("POOL_INVALIDO", `la liga "${nombreLiga}" no tiene jugadores`);
    }
    const err = idsUnicosNoVacios(jugadores.map((j) => j.id), nombreLiga);
    if (err !== null) return error("POOL_INVALIDO", err);
  }
  if (pool.restoDelMundo.length === 0) {
    return error("POOL_INVALIDO", "Resto del Mundo no tiene jugadores");
  }
  const errRdM = idsUnicosNoVacios(pool.restoDelMundo.map((j) => j.id), "Resto del Mundo");
  if (errRdM !== null) return error("POOL_INVALIDO", errRdM);

  if (pool.tecnicos.length === 0) {
    return error("POOL_INVALIDO", "Técnicos no tiene técnicos");
  }
  const errTec = idsUnicosNoVacios(pool.tecnicos.map((t) => t.id), "Técnicos");
  if (errTec !== null) return error("POOL_INVALIDO", errTec);

  return ok(pool);
}

function idsUnicosNoVacios(ids: readonly string[], etiqueta: string): string | null {
  if (ids.some((id) => id.length === 0)) {
    return `hay un id vacío en el pool de "${etiqueta}"`;
  }
  if (new Set(ids).size !== ids.length) {
    return `hay ids duplicados en el pool de "${etiqueta}"`;
  }
  return null;
}
