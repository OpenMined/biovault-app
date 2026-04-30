#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lab;
mod protocol;
mod server;
mod state;

use protocol::{AppState, Command, ServerMsg};
use state::Store;
use tauri::{Emitter, State};

#[tauri::command]
async fn app_snapshot(store: State<'_, Store>) -> Result<AppState, String> {
    Ok(store.snapshot().await)
}

#[tauri::command]
async fn app_apply_command(store: State<'_, Store>, command: Command) -> Result<AppState, String> {
    store.apply(command).await
}

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
        .manage(store.clone())
        .manage(runtime)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_snapshot,
            app_apply_command,
            lab::lab_pick_files,
            lab::lab_stat_paths,
            lab::lab_read_file_bytes,
            lab::lab_read_file_text,
            lab::lab_download_url_file,
            lab::lab_run_assay,
            lab::lab_run_variant_yaml
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let store = store.clone();
            tauri::async_runtime::spawn(async move {
                let mut rx = store.subscribe();
                while let Ok(msg) = rx.recv().await {
                    if let ServerMsg::State { state } = msg {
                        let _ = app_handle.emit("app-state", state);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
