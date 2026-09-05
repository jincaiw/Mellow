//! 窗口级系统命令（P1-1.9：文件菜单补齐 —— 新建窗口 / 页面设置；B1 SDI 关闭保护）。
//!
//! 架构约束（PRD §113.4）：Rust 只做系统能力投射，不含业务逻辑。
//! 菜单项与命令面板共用同一 Command ID，统一经 CommandRegistry 分发。

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewWindow};

/// B1（SDI）关闭保护：允许关闭的窗口 label 集合。
///
/// 流程：任意窗口 CloseRequested（mac 红绿灯 / Win ✕ / 原生 close）→ 未命中集合则
/// `prevent_close()` + emit `mellow://window-close-requested` → 前端对当前文档做
/// dirty 确认 → 确认后 `allow_close_window` 登记 → 再次 `window.close()` 命中集合放行。
/// 防环：命中集合的关闭直接放行，不再 emit（前端 ⌘W 路径先 arm 再 close 同理）。
#[derive(Default)]
pub struct CloseGate(pub Mutex<HashSet<String>>);

/// 关闭许可：前端完成 dirty 确认后登记该窗口 label，放行下一次 CloseRequested。
#[tauri::command]
pub fn allow_close_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let state = app.state::<CloseGate>();
    let mut gate = state.0.lock().map_err(|e| e.to_string())?;
    gate.insert(label);
    Ok(())
}

/// 为单个窗口安装关闭保护（B1 D4 = A：系统关窗 = 关文档，需 dirty 确认）。
/// 与 A2 几何监听各自独立挂载；几何事件不受影响。
pub fn install_close_gate(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let app_handle = app.clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let state = app_handle.state::<CloseGate>();
            let mut gate = match state.0.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            if gate.remove(&label) {
                return; // 已获前端许可 → 放行关闭
            }
            drop(gate);
            api.prevent_close();
            let _ = app_handle.emit_to(&label, "mellow://window-close-requested", ());
        }
    });
}

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
    // B1（SDI）：新窗口同样安装关闭保护（红绿灯/✕ → dirty 确认）
    install_close_gate(&app, &window);
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

#[cfg(test)]
mod tests {
    use super::CloseGate;

    #[test]
    fn close_gate_allow_once_then_consumed() {
        let gate = CloseGate::default();
        {
            let mut set = gate.0.lock().unwrap();
            assert!(!set.contains("main"));
            set.insert("main".to_string());
        }
        {
            // 放行是一次性的：命中后移除，防止后续 CloseRequested 被静默放行
            let mut set = gate.0.lock().unwrap();
            assert!(set.remove("main"));
            assert!(!set.remove("main"));
        }
    }

    #[test]
    fn close_gate_labels_are_isolated() {
        let gate = CloseGate::default();
        {
            let mut set = gate.0.lock().unwrap();
            set.insert("main-123".to_string());
        }
        {
            let mut set = gate.0.lock().unwrap();
            assert!(!set.remove("main-456")); // 其它窗口不被误放行
            assert!(set.remove("main-123"));
        }
    }
}
