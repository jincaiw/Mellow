//! 窗口级系统命令（P1-1.9：文件菜单补齐 —— 新建窗口 / 页面设置）。
//!
//! 架构约束（PRD §113.4）：Rust 只做系统能力投射，不含业务逻辑。
//! 菜单项与命令面板共用同一 Command ID，统一经 CommandRegistry 分发。

use tauri::WebviewWindow;

/// 新建窗口（Typora 文件 → 新建窗口，⇧⌘N / Ctrl+Shift+N）。
///
/// 与主窗口共用同一 URL 与导航约束（Security Review H2：`on_navigation` 白名单），
/// 标题、尺寸与 macOS 标题栏风格沿用主窗口默认值，避免两套窗口行为分叉。
#[tauri::command]
pub fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    // label 必须唯一：用单调时间戳，避免与既有窗口冲突
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let label = format!("main-{stamp}");

    let builder = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Mellow")
    .inner_size(1200.0, 800.0)
    .min_inner_size(900.0, 600.0)
    .decorations(true)
    .resizable(true)
    .center();

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let window = builder
        .on_navigation(|url| {
            let scheme = url.scheme();
            if scheme == "tauri" {
                return true; // 应用自身页面（release）
            }
            // dev server（vite）
            scheme == "http" && url.host_str() == Some("localhost")
        })
        .build()
        .map_err(|e| format!("new window failed: {e}"))?;
    window
        .set_title("Mellow")
        .map_err(|e| format!("set title failed: {e}"))?;
    Ok(())
}

/// 页面设置（Typora 文件 → 页面设置）。
///
/// macOS 走 `NSApplication.runPageLayout:`（系统页面设置面板）。
/// Windows / Linux 的 Tauri 未提供等价原生 API，返回 Err 由前端降级提示，
/// 不伪造行为——避免"点了没反应"的假实现。
#[tauri::command]
pub fn page_setup(_window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;
        // NSApplication 只能在主线程访问（objc2 用 MainThreadMarker 静态强制）
        let mtm = MainThreadMarker::new()
            .ok_or_else(|| "page setup requires the main thread".to_string())?;
        // runPageLayout: 的 sender 参数传 nil
        let sender: Option<&AnyObject> = None;
        let app = NSApplication::sharedApplication(mtm);
        unsafe {
            let _: () = objc2::msg_send![&app, runPageLayout: sender];
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("page setup is unsupported on this platform".to_string())
    }
}
