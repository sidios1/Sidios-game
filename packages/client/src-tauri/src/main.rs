// Oculta la consola en Windows release; en debug la deja para ver logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    juegos_rapidos_lib::run()
}
