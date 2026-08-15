// Mapeo del campo `liga` de datos/jugadores_monopoly.json (nombre patrocinado
// completo del dataset EA FC) a las 8 `NombreLiga` del tablero
// (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §2). Verificado contra los 47 valores
// distintos reales del dataset: las 8 strings de abajo son exactas; todo lo
// demás (incluyendo "Icons", null, y ~38 ligas más como Eredivisie o Liga
// Profesional de Fútbol) cae a Resto del Mundo (§3.2: "cualquier liga fuera
// de las 8 principales, incluyendo los Icons").

import type { NombreLiga } from "@juegos/monopoly-core";

const MAPA_LIGA: Readonly<Record<string, NombreLiga>> = {
  "Major League Soccer": "MLS",
  "ROSHN Saudi League": "Arabia Saudita",
  "Liga Portugal": "Liga Portugal",
  "Ligue 1 McDonald's": "Ligue 1",
  Bundesliga: "Bundesliga",
  "Serie A Enilive": "Serie A",
  "LALIGA EA SPORTS": "La Liga",
  "Premier League": "Premier League",
};

/** `null` = Resto del Mundo (liga desconocida, sin mapeo a las 8 del tablero). */
export function resolverLiga(ligaCruda: string | null): NombreLiga | null {
  if (ligaCruda === null) return null;
  return MAPA_LIGA[ligaCruda] ?? null;
}
