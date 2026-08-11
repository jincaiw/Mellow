pub mod bridge;
pub mod fs;
pub mod recovery;
pub mod watcher;

use tauri::Manager;

use watcher::{DebounceState, WatcherRegistry};

/// Web→Native 消息（与 CoreEditor nativeModule.ts 格式一致）
#[derive(serde::Deserialize)]
pub struct BridgeMessage {
    pub module_name: String,
    pub method_name: String,
    pub parameters: String,
}

/// Rust System Core 入口（ADR-0017：Rust System Core；ADR-0007：Editor/UI 不直接依赖 OS API）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_call,
            fs::open_document,
            fs::save_document,
            fs::read_text,
            recovery::recovery_save,
            recovery::recovery_list,
            recovery::recovery_get,
            recovery::recovery_delete,
            watcher::watch_document,
            watcher::unwatch_document,
        ])
        .manage(WatcherRegistry::default())
        .manage(DebounceState::default())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let _ = window.set_title("Mellow V0.0 — Runtime Qualification");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mellow");
}
