// Adaptador de `ILectorMetadatos` sobre `music-metadata`.
//
// Es el ÚNICO módulo del paquete que conoce la librería. Cubre los cuatro
// formatos que exige §1 (mp3, m4a/AAC, flac, opus), incluida la carátula
// embebida.
//
// ⚠️ NO se pasa `{ duration: true }`. Esa opción hace que la librería escanee el
// archivo ENTERO cuando el header no declara la duración, y eso reintroduce el
// costo de I/O que la huella parcial (`huella.ts`) existe para evitar. Se toma la
// duración que declaran los headers — pasándole el `size` del archivo, que es lo
// que permite deducirla en mp3 CBR sin leerlo completo. Si aun así no hay
// duración, la fuente descarta el archivo y lo cuenta (§2): mejor perder una
// canción que hacer lenta la apertura de la carpeta.

import { parseWebStream, selectCover } from "music-metadata";

import type { ILectorMetadatos, MetadatosCrudos } from "./metadatos.js";
import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

const MIME_POR_EXTENSION: Readonly<Record<string, string>> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
};

/** Ayuda a la librería a elegir parser sin tener que olfatear tanto. */
function tipoMimePorNombre(nombre: string): string | undefined {
  const minuscula = nombre.toLowerCase();
  for (const [extension, mime] of Object.entries(MIME_POR_EXTENSION)) {
    if (minuscula.endsWith(extension)) return mime;
  }
  return undefined;
}

function textoONulo(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const recortado = valor.trim();
  return recortado.length > 0 ? recortado : null;
}

export function crearLectorMusicMetadata(): ILectorMetadatos {
  return {
    async leer(
      archivo: ArchivoLocal,
      sistemaArchivos: ISistemaArchivos,
    ): Promise<MetadatosCrudos> {
      const flujo = await sistemaArchivos.abrirFlujo(archivo.clave);
      const mime = tipoMimePorNombre(archivo.nombre);
      const metadatos = await parseWebStream(
        flujo,
        {
          size: archivo.tamanoBytes,
          ...(mime === undefined ? {} : { mimeType: mime }),
        },
        // `skipPostHeaders` evita recorrer la cola del archivo buscando headers
        // extra: con streams es lo recomendado y ahorra I/O.
        { skipPostHeaders: true },
      );

      const portada = selectCover(metadatos.common.picture);
      const duracion = metadatos.format.duration;

      return {
        titulo: textoONulo(metadatos.common.title),
        artista: textoONulo(metadatos.common.artist),
        duracionSegundos: duracion === undefined ? null : duracion,
        caratula:
          portada === null
            ? null
            : { bytes: portada.data, tipoMime: portada.format },
      };
    },
  };
}
