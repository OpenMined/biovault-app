#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protocol;
mod server;
mod state;

use state::Store;

fn main() {
    let store = Store::new();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");

    {
        let store = store.clone();
        runtime.spawn(async move { server::run(store).await });
    }

    tauri::Builder::default()
        .manage(runtime)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
