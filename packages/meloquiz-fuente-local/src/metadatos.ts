// Puerto de lectura de metadatos (REGLAS_MELOQUIZ.md §1).
//
// Separado del sistema de archivos porque son dos ejes independientes: en los
// tests se inyecta un lector falso (evita fixtures binarios) mientras el
// adaptador real de disco sigue siendo el de verdad, y viceversa.

import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

/** Carátula embebida en los tags; si falta, el cliente usa un placeholder (§1). */
export interface CaratulaEmbebida {
  readonly bytes: Uint8Array;
  readonly tipoMime: string;
}

/** Lo que traen los tags, SIN normalizar: la limpieza es paso aparte (§2). */
export interface MetadatosCrudos {
  readonly titulo: string | null;
  readonly artista: string | null;
  /** Duración en segundos; `null` si el archivo no la declara (⇒ se descarta). */
  readonly duracionSegundos: number | null;
  readonly caratula: CaratulaEmbebida | null;
}

export interface ILectorMetadatos {
  /** Debe RECHAZAR si el archivo es ilegible o corrupto: la fuente lo cuenta como descartado. */
  leer(archivo: ArchivoLocal, sistemaArchivos: ISistemaArchivos): Promise<MetadatosCrudos>;
}
