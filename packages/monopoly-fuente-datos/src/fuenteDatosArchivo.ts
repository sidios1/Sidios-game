// Único módulo del paquete que toca `node:fs`/`node:path`: adaptador real de
// `IFuenteSobres` sobre los 3 JSON de datos/ (jugadores_monopoly.json,
// tecnicos_monopoly.json, clubes_monopoly.json). La carpeta se recibe
// inyectada (no hardcodeada) — S3 decide dónde vive `datos/` en el server.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { IFuenteSobres, PoolSobres } from "@juegos/monopoly-core";

import { construirCatalogoClubes, type ClubPool } from "./clubes.js";
import { construirPoolSobres } from "./construirPoolSobres.js";
import type { ArchivoClubes, ArchivoJugadores, ArchivoTecnicos } from "./tiposCrudos.js";

async function leerJson<T>(rutaCarpetaDatos: string, archivo: string): Promise<T> {
  const contenido = await readFile(join(rutaCarpetaDatos, archivo), "utf-8");
  return JSON.parse(contenido) as T;
}

/** Fuente real: lee jugadores_monopoly.json + tecnicos_monopoly.json de `rutaCarpetaDatos`. */
export function crearFuenteDatosArchivo(rutaCarpetaDatos: string): IFuenteSobres {
  return {
    id: "datos-reales",
    async cargar(): Promise<PoolSobres> {
      const [archivoJugadores, archivoTecnicos] = await Promise.all([
        leerJson<ArchivoJugadores>(rutaCarpetaDatos, "jugadores_monopoly.json"),
        leerJson<ArchivoTecnicos>(rutaCarpetaDatos, "tecnicos_monopoly.json"),
      ]);
      return construirPoolSobres(archivoJugadores.jugadores, archivoTecnicos.tecnicos);
    },
  };
}

/** Catálogo de clubes para la elección de ficha (§1.1), lee clubes_monopoly.json. */
export async function cargarCatalogoClubes(
  rutaCarpetaDatos: string,
): Promise<readonly ClubPool[]> {
  const archivo = await leerJson<ArchivoClubes>(rutaCarpetaDatos, "clubes_monopoly.json");
  return construirCatalogoClubes(archivo.clubes);
}
