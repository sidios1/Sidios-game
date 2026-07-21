// Selección de la carpeta de música del HOST, en sus dos sabores:
//
//  - `elegirCarpetaWeb()`: un <input webkitdirectory> efímero. Devuelve los
//    File de la carpeta; sirve en el navegador Y en el webview de Tauri
//    (WebView2 es Chromium: el picker de carpeta funciona igual). Es el mismo
//    mecanismo del panel del lobby, pero invocable desde "Crear partida".
//  - `elegirCarpetaTauri()`: el diálogo NATIVO de la app de escritorio
//    (plugin-dialog), que devuelve la RUTA ABSOLUTA — lo único que la File API
//    no puede dar, y lo que el sidecar LAN necesita como env CARPETA_MUSICA.
//    Import dinámico de @tauri-apps/*, igual que servidorEmbebido.ts: no
//    arrastra Tauri al bundle web ni a los tests.
//
// Ambas devuelven null si el usuario cancela: hostear se aborta sin error.

/** Abre el picker de carpeta del navegador y resuelve con sus archivos. */
export function elegirCarpetaWeb(): Promise<readonly File[] | null> {
  return new Promise((resolver) => {
    const input = document.createElement("input");
    input.type = "file";
    // webkitdirectory no está en los tipos del DOM: es un atributo, no una prop.
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("multiple", "");
    input.style.display = "none";
    document.body.appendChild(input);

    const terminar = (valor: readonly File[] | null): void => {
      input.remove();
      resolver(valor);
    };
    input.addEventListener("change", () => {
      const files = input.files === null ? [] : [...input.files];
      terminar(files.length > 0 ? files : null);
    });
    // Chromium dispara `cancel` cuando se cierra el diálogo sin elegir.
    input.addEventListener("cancel", () => terminar(null));
    input.click();
  });
}

/** Abre el diálogo nativo de Tauri y resuelve con la ruta absoluta elegida. */
export async function elegirCarpetaTauri(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const ruta = await open({
    directory: true,
    multiple: false,
    title: "Elegí la carpeta de música de la sala",
  });
  return typeof ruta === "string" && ruta.length > 0 ? ruta : null;
}
