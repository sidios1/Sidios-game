// Puerto de acceso a disco (REGLAS_MELOQUIZ.md §1, §2).
//
// La fuente LOCAL no conoce `node:fs` ni `@tauri-apps/plugin-fs`: habla contra
// esta interfaz, igual que el orquestador habla contra `TransporteServidor`. Hoy
// el único adaptador es el de Node (`sistemaArchivosNode.ts`), pero §1 dice que
// en S3/S4 **cada cliente lee su propia carpeta** desde el webview de Tauri: ese
// día se agrega otro adaptador y ni la normalización ni el armado del pool
// cambian una línea.

/** Un archivo de la carpeta, ya listado (sin abrir todavía). */
export interface ArchivoLocal {
  /** Identificador para reabrirlo contra ESTE sistema de archivos (ruta en Node). */
  readonly clave: string;
  /** Nombre con extensión; es la base del fallback de título cuando falta el tag. */
  readonly nombre: string;
  readonly tamanoBytes: number;
}

export interface ISistemaArchivos {
  /** Archivos directamente dentro de la carpeta (no recursivo); ignora subcarpetas. */
  listar(carpeta: string): Promise<readonly ArchivoLocal[]>;
  /** Primeros `bytes` del archivo (menos si es más corto). Para la huella del id. */
  leerPrefijo(clave: string, bytes: number): Promise<Uint8Array>;
  /**
   * Flujo de lectura del archivo. `ReadableStream` es el tipo común a Node 22 y
   * al navegador, así que el lector de metadatos sirve en ambos entornos.
   */
  abrirFlujo(clave: string): Promise<ReadableStream<Uint8Array>>;
}
