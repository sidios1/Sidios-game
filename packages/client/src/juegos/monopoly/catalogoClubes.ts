// Catálogo de clubes para las fichas de jugador (REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §1.1). El motor no conoce este catálogo (ver clubDeJugador.ts): el cliente lo
// carga aparte, como asset estático servido por Vite (copia de datos/clubes_monopoly.json,
// ver packages/client/public/datos/). `construirCatalogoClubes` es la misma función pura
// que usa el server para el mismo dataset, importada por su subpath browser-safe (sin
// node:fs).

import { construirCatalogoClubes } from "@juegos/monopoly-fuente-datos/clubes";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";
import type { ArchivoClubes } from "@juegos/monopoly-fuente-datos/tiposCrudos";

let catalogoPromesa: Promise<readonly ClubPool[]> | null = null;

async function fetchCatalogo(): Promise<readonly ClubPool[]> {
  const respuesta = await fetch("/datos/clubes_monopoly.json");
  if (!respuesta.ok) {
    throw new Error(`no se pudo cargar el catálogo de clubes: HTTP ${respuesta.status}`);
  }
  const archivo = (await respuesta.json()) as ArchivoClubes;
  return construirCatalogoClubes(archivo.clubes);
}

/** Catálogo de clubes, cacheado tras la primera carga exitosa. */
export function cargarCatalogoClubes(): Promise<readonly ClubPool[]> {
  if (catalogoPromesa === null) {
    catalogoPromesa = fetchCatalogo().catch((error: unknown) => {
      catalogoPromesa = null; // permite reintentar en la próxima llamada
      throw error;
    });
  }
  return catalogoPromesa;
}
