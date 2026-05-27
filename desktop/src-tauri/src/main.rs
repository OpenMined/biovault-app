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
            lab::lab_cache_remote_bytes,
            lab::lab_cache_remote_url_file,
            lab::lab_delete_cached_remote_lab_file,
            lab::lab_download_url_file,
            lab::lab_fs_delete,
            lab::lab_fs_info,
            lab::lab_fs_read_text,
            lab::lab_fs_write_text,
            lab::lab_list_cached_remote_lab_files,
            lab::lab_prepare_runtime_root,
            lab::lab_run_assay,
            lab::lab_run_variant_yaml,
            lab::lab_run_file_request,
            lab::lab_inspect_bytes,
            lab::lab_compile_variant_yaml_text,
            lab::lab_lookup_genotype_bytes_variants,
            lab::lab_lookup_genotype_bytes_rsids,
            lab::lab_lookup_cram_variants,
            lab::lab_lookup_bam_variants,
            lab::lab_lookup_vcf_variants,
            lab::lab_resolve_remote_resource_text,
            lab::lab_resolve_package_release_text,
            lab::lab_resolve_package_zip_bytes,
            lab::lab_verify_package_artifact_sha256,
            lab::lab_run_package_report_bytes,
            lab::lab_run_package_report_from_cram,
            lab::lab_run_package_report_from_bam,
            lab::lab_run_package_report_from_vcf
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
