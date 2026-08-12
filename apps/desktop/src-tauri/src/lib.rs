pub mod bridge;
pub mod fs;
pub mod menu;
pub mod recovery;
pub mod search;
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_call,
            fs::open_document,
            fs::save_document,
            fs::read_text,
            fs::write_text,
            fs::copy_file,
            fs::mkdir,
            fs::write_binary,
            fs::read_binary,
            fs::path_exists,
            fs::move_file,
            fs::pick_folder,
            fs::trash,
            fs::remove_file,
            fs::read_dir,
            fs::download_remote,
            search::search_start,
            search::search_cancel,
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
            let _ = window.set_title("Mellow");
            // macOS Menu Bar：菜单只发命令 id，执行统一走前端 CommandRegistry
            menu::attach_menu_events(app.handle());
            let _ = menu::install_menu(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mellow");
}
