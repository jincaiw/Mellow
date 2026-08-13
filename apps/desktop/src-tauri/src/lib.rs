pub mod bridge;
pub mod fs;
pub mod menu;
pub mod print;
pub mod recovery;
pub mod search;
pub mod watcher;

use tauri::{Emitter, Manager, RunEvent};
use std::sync::Mutex;

use watcher::{DebounceState, WatcherRegistry};

/// 待打开的文件路径（CLI 参数 / odoc 事件）：前端 ready 前的事件不丢失，
/// 前端 mount 后经 `pending_open_path` 拉取；ready 后由事件实时投递。
struct PendingOpen(Mutex<Option<String>>);

/// 前端就绪后拉取待打开路径（benchmark open-to-editable / open-with）
#[tauri::command]
fn pending_open_path(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

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
            pending_open_path,
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
            print::print_window,
        ])
        .manage(WatcherRegistry::default())
        .manage(DebounceState::default())
        .manage(PendingOpen(Mutex::new(None)))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let _ = window.set_title("Mellow");
            // macOS Menu Bar：菜单只发命令 id，执行统一走前端 CommandRegistry
            menu::attach_menu_events(app.handle());
            let _ = menu::install_menu(app.handle());
            // CLI 打开：`mellow-desktop <file.md>`（benchmark / open-with 用）
            // 先存状态（前端未 ready 时不丢），再 emit（前端已 ready 时实时投递）
            if let Some(arg) = std::env::args().nth(1) {
                let path = std::path::Path::new(&arg);
                if path.is_file() {
                    *app.state::<PendingOpen>().0.lock().unwrap() = Some(arg.clone());
                    let _ = app.emit("mellow://open-file", arg);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Mellow")
        .run(|app: &tauri::AppHandle, event| {
            // macOS Finder「打开方式」/ `open -a`（odoc Apple Event）
            if let RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let s = path.to_string_lossy().to_string();
                        *app.state::<PendingOpen>().0.lock().unwrap() = Some(s.clone());
                        let _ = app.emit("mellow://open-file", s);
                    }
                }
            }
        });
}
