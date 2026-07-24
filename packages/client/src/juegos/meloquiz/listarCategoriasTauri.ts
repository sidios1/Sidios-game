// Lista las subcarpetas de primer nivel de la carpeta de música elegida con el
// diálogo NATIVO (REGLAS_MELOQUIZ §11), para el checklist de categorías del
// modo LOCAL: `elegirCarpetaTauri()` solo da la ruta, no lista contenido, y la
// File API no puede leer una ruta absoluta del disco. Import dinámico de
// @tauri-apps/plugin-fs, igual que `elegirCarpetaTauri` con plugin-dialog: no
// arrastra Tauri al bundle web ni a los tests.

/** Nombres de las subcarpetas directas de `carpeta`, ordenados; sin recursión. */
export async function listarCategoriasTauri(carpeta: string): Promise<readonly string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const entradas = await readDir(carpeta);
  return entradas
    .filter((entrada) => entrada.isDirectory)
    .map((entrada) => entrada.name)
    .sort();
}
