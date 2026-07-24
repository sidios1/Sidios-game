// Carga del pool de MeloQuiz desde una carpeta del disco, para los puntos de
// entrada del PROCESO servidor (dev.ts y embebido.ts).
//
// Por qué vive del lado servidor y no del cliente (REGLAS §1, decisión de S3):
// el pool es material de las REGLAS (títulos, distractores, punto de inicio), y
// las reglas las resuelve la autoridad. El host apunta a su carpeta con el env
// CARPETA_MUSICA y el proceso servidor la lee con la fuente local de S2. Lo que
// viaja a los peers sigue siendo solo la ORDEN (id de pista + start_at), jamás
// bytes de audio: la restricción innegociable de §1 no se toca.
//
// No duplica nada de fuenteLocal.ts: solo cablea los adaptadores de Node.

import {
  crearFuenteLocal,
  crearLectorMusicMetadata,
  crearSistemaArchivosNode,
} from "@juegos/meloquiz-fuente-local";
import type { CargaLocal } from "@juegos/meloquiz-fuente-local";
import type { Resultado } from "@juegos/meloquiz-core";

/**
 * Arma el `PoolPartida` leyendo `carpeta`. Devuelve la `CargaLocal` completa
 * (pool + descartes) para que el llamador pueda reportar por consola qué entró y
 * qué se descartó; el error de pool insuficiente ya lo da `validarPool`.
 *
 * `categoriasSeleccionadas` es la elección del host de qué subcarpetas de
 * primer nivel incluir (REGLAS_MELOQUIZ §11); `null`/`undefined` = todas.
 */
export function cargarPoolDeCarpeta(
  carpeta: string,
  categoriasSeleccionadas?: readonly string[] | null,
): Promise<Resultado<CargaLocal>> {
  const fuente = crearFuenteLocal({
    carpeta,
    sistemaArchivos: crearSistemaArchivosNode(),
    lectorMetadatos: crearLectorMusicMetadata(),
    // exactOptionalPropertyTypes: se omite la clave si no vino selección.
    ...(categoriasSeleccionadas !== undefined ? { categoriasSeleccionadas } : {}),
  });
  return fuente.cargarDetallado();
}
