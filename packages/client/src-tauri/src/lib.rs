// App Tauri mínima: registra el plugin shell (para arrancar el sidecar del
// servidor LAN desde el frontend) y corre la ventana. La lógica del juego y la
// del servidor viven en JS/Node; Rust solo hospeda el webview y lanza el sidecar.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error al arrancar la app Tauri");
}
