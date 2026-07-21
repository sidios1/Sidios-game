// API pública de la fuente LOCAL de catálogo de MeloQuiz (REGLAS §1, §2, §8).
//
// Lee una carpeta de audio del disco y produce el `PoolPartida` que consume el
// núcleo. Los adaptadores concretos (disco de Node, music-metadata) se exportan
// aparte de los puertos: en S3 el cliente Tauri sustituye el sistema de archivos
// sin tocar el resto.

export * from "./sistemaArchivos.js";
export * from "./sistemaArchivosNode.js";
export * from "./metadatos.js";
export * from "./metadatosMusicMetadata.js";
export * from "./normalizarTitulo.js";
export * from "./huella.js";
export * from "./fuenteLocal.js";
