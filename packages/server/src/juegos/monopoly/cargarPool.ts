// Carga del pool de sobres de Monopoly Ultimate Team desde la carpeta de datos
// del disco (`datos/*.json`, ver monopoly-fuente-datos), para un futuro punto
// de entrada del PROCESO servidor (dev.ts/embebido.ts, mismo rol que
// juegos/meloquiz/cargarPool.ts). Única costura de este juego que toca
// @juegos/monopoly-fuente-datos: el resto del servidor (motorMonopoly.ts,
// vistaMonopoly.ts) solo conoce @juegos/monopoly-core.
//
// No incluye `cargarCatalogoClubes` (catálogo cosmético de clubes): fuera de
// alcance de esta sesión, ningún `AccionMonopoly` ni campo de `EstadoMonopoly`
// lo consume todavía (ver PROMPTS_MONOPOLY_ULTIMATE_TEAM.md).

import { crearFuenteDatosArchivo } from "@juegos/monopoly-fuente-datos";
import type { PoolSobres } from "@juegos/monopoly-core";

/** Arma el `PoolSobres` leyendo `rutaCarpetaDatos` (la carpeta `datos/` del repo). */
export function cargarPoolDeCarpeta(rutaCarpetaDatos: string): Promise<PoolSobres> {
  return crearFuenteDatosArchivo(rutaCarpetaDatos).cargar();
}
