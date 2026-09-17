pub mod bridge;
pub mod clipboard;
pub mod fs;
pub mod geometry;
pub mod jumplist;
pub mod menu;
pub mod open_with;
pub mod pandoc;
pub mod print;
pub mod recovery;
pub mod search;
pub mod updater;
pub mod upload;
pub mod watcher;
pub mod window;

use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};

use watcher::{DebounceState, WatcherRegistry};

/// 打开请求（CLI `mellow-desktop [--reader|--source] <file>` / Finder odoc）：
/// 前端 ready 前的事件不丢失，mount 后经 `pending_open_path` 拉取；ready 后由事件实时投递。
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct OpenRequest {
    pub path: String,
    /// "normal" | "reader" | "source"（PRD §80 CLI）
    pub mode: String,
}

/// 待打开请求**按窗口 label 隔离**。
///
/// 为什么不能是全局单槽：多窗口下会「串窗」—— 新窗口要打开的文件可能被已有窗口先消费
/// （`pending_open_path` 是谁先 mount 谁先拿），反之亦然。macOS Finder「打开方式」
/// 仍投递给**当前聚焦窗口**，行为不变。
pub(crate) struct PendingOpen(Mutex<std::collections::HashMap<String, OpenRequest>>);

/// Windows Portable 模式标志（master-plan R1：exe 旁 `Data` 文件夹存在 → 便携模式）
static PORTABLE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// 检测 exe 同目录是否存在 `Data` 文件夹（便携模式判定；非 Windows 恒为 None）
fn portable_data_dir() -> Option<std::path::PathBuf> {
    if !cfg!(target_os = "windows") {
        return None; // 便携模式仅 Windows（master-plan R1）
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.join("Data");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// 便携模式数据重定向：APPDATA / LOCALAPPDATA 指向 `Data` 目录。
///
/// 覆盖全部数据落点（dirs crate 环境变量优先于 Known Folder）：
/// - APPDATA → app_data_dir（recovery 快照、updater 备份）
/// - LOCALAPPDATA → app_local_data_dir（WebView2 profile：localStorage/IndexedDB）
///
/// 删除 `Data` = 完全卸载；无 `Data` 时行为与安装版完全一致。
/// 必须在 tauri::Builder 之前调用（WebView2 初始化前生效）。
fn setup_portable_mode() -> bool {
    match portable_data_dir() {
        Some(dir) => {
            std::env::set_var("APPDATA", &dir);
            std::env::set_var("LOCALAPPDATA", &dir);
            true
        }
        None => false,
    }
}

/// 前端查询便携模式（设置面板 / updater 检查降级提示，master-plan R1-2）
#[tauri::command]
fn is_portable() -> bool {
    *PORTABLE.get().unwrap_or(&false)
}

/// 前端 updater 安装路径守卫（anySSH 模式对齐）：debug/dev 构建绝不能下载并
/// 把 release 覆盖到自身可执行文件上（会损坏运行中的二进制）。仅真正的
/// release 构建允许自更新；未知（invoke 失败）时前端按保守处理。
#[tauri::command]
fn is_release_build() -> bool {
    !cfg!(debug_assertions)
}

/// 记录最近文档到系统（Windows JumpList Recent category；PRD §134 P1；
/// 非 Windows no-op。调用点：前端 recordRecentFile——仅用户成功打开文档语义处）
#[tauri::command]
fn jump_list_add_recent(path: String) {
    jumplist::add_recent(&path);
}

/// 前端就绪后拉取待打开请求（benchmark open-to-editable / open-with / CLI）
#[tauri::command]
fn pending_open_path(window: tauri::WebviewWindow, state: tauri::State<PendingOpen>) -> Option<OpenRequest> {
    // 只取**本窗口**的待打开请求（Tauri 自动注入调用方窗口）
    take_pending_open(&state, window.label())
}

/// PendingOpen 的消费必须是一次性的：实时事件与前端拉取路径可能重叠，旧请求
/// 绝不能在用户已切换文档后再次注入 EditorCore。
fn take_pending_open(pending: &PendingOpen, label: &str) -> Option<OpenRequest> {
    // 只消费一次。若保留副本，前端完成首次打开后再次查询会把旧文件重新
    // 注入 EditorCore，可能与用户当前编辑或启动 tab 初始化发生竞态。
    pending.0.lock().unwrap().remove(label)
}

/// 把待打开请求挂到**指定窗口**的 label 下（该窗口 mount 时经 `pending_open_path` 拉取）。
/// 目标窗口尚未就绪也不会丢 —— 这正是 PendingOpen 存在的意义。
pub(crate) fn insert_pending_open(app: &tauri::AppHandle, label: &str, req: OpenRequest) {
    app.state::<PendingOpen>()
        .0
        .lock()
        .unwrap()
        .insert(label.to_string(), req);
}

/// Web→Native 消息（与 CoreEditor nativeModule.ts 格式一致）
#[derive(serde::Deserialize)]
pub struct BridgeMessage {
    pub module_name: String,
    pub method_name: String,
    pub parameters: String,
}

#[cfg(test)]
mod tests {
    use super::{take_pending_open, OpenRequest, PendingOpen};
    use std::collections::HashMap;
    use std::sync::Mutex;

    fn pending_with(entries: &[(&str, &str)]) -> PendingOpen {
        let mut map = HashMap::new();
        for (label, path) in entries {
            map.insert(
                (*label).to_string(),
                OpenRequest {
                    path: (*path).to_string(),
                    mode: "normal".to_string(),
                },
            );
        }
        PendingOpen(Mutex::new(map))
    }

    #[test]
    fn pending_open_is_consumed_once() {
        let pending = pending_with(&[("main", "/tmp/launch.md")]);

        let first = take_pending_open(&pending, "main").expect("first read returns the launch request");
        assert_eq!(first.path, "/tmp/launch.md");
        assert_eq!(first.mode, "normal");
        assert!(
            take_pending_open(&pending, "main").is_none(),
            "a consumed launch request must not be replayed"
        );
    }

    /// 按窗口隔离：A 窗口的请求不得被 B 窗口取走（否则「在新窗口中打开」会串窗）。
    #[test]
    fn pending_open_is_per_window() {
        let pending = pending_with(&[("main-1", "/tmp/one.md"), ("main-2", "/tmp/two.md")]);

        let two = take_pending_open(&pending, "main-2").expect("second window gets its own request");
        assert_eq!(two.path, "/tmp/two.md");
        assert!(
            take_pending_open(&pending, "main-2").is_none(),
            "second window must not get it twice"
        );

        let one = take_pending_open(&pending, "main-1").expect("first window keeps its own request");
        assert_eq!(one.path, "/tmp/one.md");
        assert!(
            take_pending_open(&pending, "unknown-window").is_none(),
            "an unknown window label must not steal another window's request"
        );
    }
}

/// Rust System Core 入口（ADR-0017：Rust System Core；ADR-0007：Editor/UI 不直接依赖 OS API）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 便携模式数据重定向必须在 WebView2 初始化前完成（master-plan R1-1）
    let _ = PORTABLE.set(setup_portable_mode());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            pending_open_path,
            is_portable,
            is_release_build,
            jump_list_add_recent,
            print::open_devtools,
            menu::set_menu_spec,
            bridge::bridge_call,
            clipboard::copy_image_to_clipboard,
            fs::open_document,
            fs::save_document,
            fs::read_text,
            fs::read_text_meta,
            fs::read_text_chunk,
            fs::write_text,
            fs::copy_file,
            fs::mkdir,
            fs::pick_save_path,
            fs::pick_open_path,
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
            watcher::watch_dir,
            watcher::unwatch_dir,
            print::print_window,
            window::new_window,
            window::page_setup,
            window::allow_close_window,
            open_with::detect_open_with,
            open_with::open_with_editor,
            pandoc::pandoc_available,
            pandoc::pandoc_export,
            pandoc::pandoc_import,
            upload::upload_images,
            updater::update_rollback_prepare,
            updater::update_rollback_status,
            updater::update_rollback_note_launch,
            updater::update_rollback_commit,
            updater::update_rollback_restore,
        ])
        .manage(WatcherRegistry::default())
        .manage(watcher::WatcherIdCounter(AtomicU64::new(0)))
        .manage(DebounceState::default())
        .manage(PendingOpen(Mutex::new(std::collections::HashMap::new())))
        .manage(geometry::GeometryState::default())
        .manage(window::CloseGate::default())
        .setup(|app| {
            // 主窗口经 Builder 显式创建（Security Review H2 纵深防御）：
            // on_navigation 只允许应用自身页面（tauri:// 或 dev http://localhost），
            // 外部链接由前端 Reader/SplitPreview 拦截后经系统浏览器打开。
            let window = {
                let builder = tauri::webview::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title("Mellow")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .decorations(true)
                .resizable(true)
                .center();
                // V6-P2 2.2（与 Typora 完全一致）：macOS 回归原生标题栏（显示文件名标题，
                // 红绿灯在原生栏内），不再 Overlay/隐藏标题、不再自绘顶栏。
                // #[cfg(target_os = "macos")]
                // let builder = builder
                //     .title_bar_style(tauri::TitleBarStyle::Overlay)
                //     .hidden_title(true);
                // Windows 一体化自绘标题栏（Typora parity，V4 §17 D10）：去掉系统 chrome，
                // 由应用内 36px titlebar 承担拖拽/控制按钮；边缘 resize 与拖拽由 tao
                // undecorated hit-testing 提供。
                // Linux 维持系统装饰（GNOME/KDE undecorated resize 兼容性风险，记为 D）。
                #[cfg(target_os = "windows")]
                let builder = builder.decorations(false);
                builder
                    .on_navigation(|url| {
                        let scheme = url.scheme();
                        if scheme == "tauri" {
                            return true; // 应用自身页面（release）
                        }
                        // dev server（vite）
                        scheme == "http" && url.host_str() == Some("localhost")
                    })
                    .build()
                    .expect("failed to build main window")
            };
            let _ = window.set_title("Mellow");
            // A2（第四轮）：窗口几何记忆 —— 恢复上次位置/尺寸/最大化；
            // 之后监听 Moved/Resized 更新进程内状态，Destroyed/Exit 时落盘。
            {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    geometry::handle_window_event(&app_handle, event);
                });
                geometry::restore(app.handle(), &window);
                // B1（SDI）：主窗口关闭保护（红绿灯/✕ → 前端 dirty 确认后放行）
                window::install_close_gate(app.handle(), &window);
            }
            // Native Menu（三平台）：菜单只发命令 id，执行统一走前端 CommandRegistry
            menu::attach_menu_events(app.handle());
            let _ = menu::install_menu(app.handle());
            // CLI 打开：`mellow-desktop [--reader|--source] <file.md>`（PRD §80 / benchmark / open-with）
            // 先存状态（前端未 ready 时不丢），再 emit（前端已 ready 时实时投递）
            {
                let mut mode = "normal".to_string();
                let mut cli_path: Option<String> = None;
                for arg in std::env::args().skip(1) {
                    match arg.as_str() {
                        "--reader" => mode = "reader".to_string(),
                        "--source" => mode = "source".to_string(),
                        _ => {
                            if cli_path.is_none() {
                                cli_path = Some(arg);
                            }
                        }
                    }
                }
                if let Some(p) = cli_path {
                    if std::path::Path::new(&p).is_file() {
                        let req = OpenRequest {
                            path: p.clone(),
                            mode: mode.clone(),
                        };
                        // CLI 启动参数 → 主窗口（此处 app 是 &mut App，取 handle()）
                        insert_pending_open(app.handle(), "main", req.clone());
                        let _ = app.emit_to("main", "mellow://open-file", req);
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Mellow")
        .run(|app: &tauri::AppHandle, event| {
            match event {
                // A2：应用退出/最后窗口关闭 → 把进程内最新几何落盘
                RunEvent::ExitRequested { .. } | RunEvent::Exit => geometry::flush(app),
                // macOS Finder「打开方式」/ `open -a`（odoc Apple Event）
                #[cfg(target_os = "macos")]
                RunEvent::Opened { urls } => {
                    for url in urls {
                        if let Ok(path) = url.to_file_path() {
                            let s = path.to_string_lossy().to_string();
                            let req = OpenRequest {
                                path: s.clone(),
                                mode: "normal".to_string(),
                            };
                            // 投递给**当前聚焦窗口**（无聚焦窗口则主窗口），不再广播：
                            // 广播在多窗口下会让非目标窗口也收到。
                            let target = app
                                .webview_windows()
                                .iter()
                                .find(|(_, w)| w.is_focused().unwrap_or(false))
                                .map(|(label, _)| label.clone())
                                .unwrap_or_else(|| "main".to_string());
                            insert_pending_open(app, &target, req.clone());
                            let _ = app.emit_to(target.as_str(), "mellow://open-file", req);
                        }
                    }
                }
                _ => {}
            }
        });
}
