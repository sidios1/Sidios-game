// App Tauri mínima: registra el plugin shell (para arrancar el sidecar del
// servidor LAN desde el frontend) y el plugin dialog (el host de MeloQuiz elige
// su carpeta de música con el diálogo nativo), y corre la ventana. La lógica del
// juego y la del servidor viven en JS/Node; Rust solo hospeda el webview.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error al arrancar la app Tauri");
}
