// Armado del PoolPartida EN EL WEBVIEW, para el host del modo online: a
// diferencia de LAN (donde el pool lo lee el proceso sidecar de Node), online no
// tiene proceso aparte — el orquestador corre en el webview del host, así que el
// pool también se arma acá, con la MISMA fuente local de S2 sobre la File API.
//
// No duplica nada de fuenteLocal.ts (misma normalización, misma huella, mismos
// descartes que el servidor): solo cablea los adaptadores del navegador, igual
// que cargarPool.ts del server cablea los de Node. Ese "misma huella" es la
// invariante de siempre (REGLAS §1): el pistaId que difunde el host TIENE que
// coincidir con el que cada peer calcula de su propia carpeta.

import { crearFuenteLocal } from "@juegos/meloquiz-fuente-local/fuenteLocal";
import type { CargaLocal } from "@juegos/meloquiz-fuente-local/fuenteLocal";
import type { ILectorMetadatos } from "@juegos/meloquiz-fuente-local/metadatos";
import { crearLectorMusicMetadata } from "@juegos/meloquiz-fuente-local/metadatosMusicMetadata";
import { crearSistemaArchivosFiles } from "./sistemaArchivosFiles.js";

/** El Resultado de la fuente, sin que este módulo importe meloquiz-core. */
type ResultadoCarga = Awaited<ReturnType<ReturnType<typeof crearFuenteLocal>["cargarDetallado"]>>;

/**
 * Arma el pool de la sala desde los File de la carpeta elegida. El `lector` es
 * inyectable para tests (por defecto, music-metadata: el real del navegador).
 */
export function armarPoolDeFiles(
  files: readonly File[],
  lector: ILectorMetadatos = crearLectorMusicMetadata(),
): Promise<ResultadoCarga> {
  const { sistema } = crearSistemaArchivosFiles(files);
  const fuente = crearFuenteLocal({
    carpeta: "(carpeta elegida)",
    sistemaArchivos: sistema,
    lectorMetadatos: lector,
  });
  return fuente.cargarDetallado();
}

export type { CargaLocal };
