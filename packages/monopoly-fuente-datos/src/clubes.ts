// Catálogo de clubes para la elección de ficha (REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §1.1). Deliberadamente FUERA de `IFuenteSobres`/`PoolSobres`: el motor no
// tiene noción de "club catálogo" (`EstadoJugador.clubToken` es un string
// cosmético sin validar, ver estado.ts), así que no se toca esa interfaz.
// `liga` queda como string crudo del dataset (207 clubes cubren 10 ligas, 2
// fuera de las 8 del tablero) — la elección de club es puramente visual.

import type { ClubCrudo } from "./tiposCrudos.js";

export interface ClubPool {
  readonly id: string;
  readonly nombre: string;
  readonly nombreOficial: string;
  readonly liga: string;
  readonly imagenClaraUrl: string;
  readonly imagenOscuraUrl: string;
}

export function construirCatalogoClubes(clubes: readonly ClubCrudo[]): readonly ClubPool[] {
  return clubes.map((crudo) => ({
    id: String(crudo.id),
    nombre: crudo.nombre,
    nombreOficial: crudo.nombreOficial,
    liga: crudo.liga,
    imagenClaraUrl: crudo.imagenClaraUrl,
    imagenOscuraUrl: crudo.imagenOscuraUrl,
  }));
}
