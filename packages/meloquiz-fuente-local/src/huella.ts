// Identificador opaco de pista: huella parcial del CONTENIDO.
//
// ── POR QUÉ HASH Y NO NOMBRE/TÍTULO ────────────────────────────────────────
// El id es lo ÚNICO que viaja durante la fase `clip`: la vista publica `pistaId`
// ANTES de que se vote. Si el id codificara el título o el nombre del archivo,
// filtraría la respuesta y rompería la invariante de ocultamiento. El id debe
// ser OPACO. Invariante cerrada en S1 (meloquiz-core/src/catalogo.ts) — no se
// relaja.
//
// ── POR QUÉ PARCIAL Y NO EL ARCHIVO COMPLETO ───────────────────────────────
// Hashear cientos de archivos de 5-10 MB enteros hace lenta la apertura de la
// carpeta. Los primeros 64 KB + el tamaño dan una carga casi instantánea con
// opacidad idéntica.
//
// ── POR QUÉ EL TAMAÑO ES OBLIGATORIO EN LA HUELLA ──────────────────────────
// No es un extra: es lo que hace viable la huella parcial. Dos archivos
// DISTINTOS pueden compartir los primeros 64 KB (mismo álbum/encoder ⇒ headers y
// frames iniciales casi idénticos; el mismo track en dos formatos; una intro o
// un silencio común). El "++ tamaño exacto" vuelve remota esa colisión. Sin el
// tamaño, NO usar huella parcial.
//
// La colisión residual NO se ignora: `fuenteLocal.ts` corta la carga con error si
// dos archivos producen el mismo id (ver el guardián allí).

import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

/** Cuántos bytes del principio del archivo entran en la huella. */
export const BYTES_HUELLA = 64 * 1024;

/**
 * SHA-256 de `primeros 64 KB ++ tamaño en bytes`. Usa WebCrypto, que es global
 * tanto en Node 22 como en el navegador (el adaptador Tauri de S3 lo reusa).
 */
export async function calcularHuella(
  sistemaArchivos: ISistemaArchivos,
  archivo: ArchivoLocal,
): Promise<string> {
  const prefijo = await sistemaArchivos.leerPrefijo(archivo.clave, BYTES_HUELLA);
  const sufijoTamano = new TextEncoder().encode(`:${archivo.tamanoBytes}`);

  const entrada = new Uint8Array(prefijo.length + sufijoTamano.length);
  entrada.set(prefijo, 0);
  entrada.set(sufijoTamano, prefijo.length);

  const digest = await crypto.subtle.digest("SHA-256", entrada);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
