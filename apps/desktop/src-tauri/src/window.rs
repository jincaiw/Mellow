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
pub fn new_window(
    app: tauri::AppHandle,
    state: tauri::State<crate::PendingOpen>,
    path: Option<String>,
    mode: Option<String>,
) -> Result<(), String> {
    let _ = &state; // 仅用于保证 Tauri 注入 state（写待打开请求走 insert_pending_open）
    // label 必须唯一：用单调时间戳，避免与既有窗口冲突
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let label = format!("main-{stamp}");
    let window_label = label.clone();

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

    // V6-P2 2.2（与 Typora 完全一致）：macOS 回归原生标题栏 —— 显示窗口标题
    // （文件名由前端 setTitle 跟随），不再 Overlay/隐藏标题、不再自绘顶栏。
    // Windows 仍走下方 decorations(false) 分支 + 自绘标题栏（V4 §17 D10 不变）。
    // #[cfg(target_os = "macos")]
    // let builder = builder
    //     .title_bar_style(tauri::TitleBarStyle::Overlay)
    //     .hidden_title(true);

    // V7-W2.1（G7-SHELL-01 修复）：Windows 新窗口此前恒 `.decorations(true)`，
    // 而前端 Windows 分支渲染自绘 36px titlebar → 出现「系统标题栏 + 应用内 titlebar」
    // 双栏。此处与主窗口（lib.rs 主窗口装配）保持完全一致：Windows 去系统 chrome，
    // Linux 维持系统装饰（GNOME/KDE undecorated resize 兼容性风险，记为 D）。
    #[cfg(target_os = "windows")]
    let builder = builder.decorations(false);

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
    // 「在新窗口中打开」（Typora 文件树右键）：把待打开请求挂到**本窗口**的 label 下，
    // 新窗口 mount 时经 pending_open_path 拉取 —— 前端 ready 之前也不会丢。
    if let Some(p) = path {
        crate::insert_pending_open(
            &app,
            &window_label,
            crate::OpenRequest {
                path: p,
                mode: mode.unwrap_or_else(|| "normal".to_string()),
            },
        );
    }
    Ok(())
}

/// D-AU（ADR-0034 Q12 裁决 = A2）：关掉最后一个窗口是否退出应用（macOS 惯例）。
///
/// 默认 `false` = **不退出**（对齐 Typora 1.14.9 `quitAfterWindowClose: false` 与
/// macOS 惯例：关窗 ≠ 退应用）。前端启动时经 `set_quit_after_window_close` 把设置值
/// 灌进本状态（默认关 ⇒ 未灌值时行为即新默认）。
///
/// 生效点在 `lib.rs` 的 `RunEvent::ExitRequested`：**仅 `code: None`（最后窗口销毁的
/// 自然退出）且本值为 false 时 `prevent_exit()`**。两条不可破坏的安全边界：
/// 1. **⌘Q 不被拦**：`code: Some` 的程序化退出直接放行 —— 且据 vendored 源码
///    （muda-0.20 `PredefinedMenuItemType::Quit => sel!(terminate:)`；
///    tauri-runtime-wry `LoopExiting` 不重发 ExitRequested），macOS 原生 Quit 走
///    `terminate:`，**根本不经过** last-window-destroyed 的 ExitRequested{None} 通道；
/// 2. **关闭确认门不被旁路**（`CloseGate`）：被拦下的是「窗口已销毁后的进程退出」，
///    窗口关闭本身的 dirty 确认流程不受影响。
#[derive(Default)]
pub struct QuitPolicy(pub std::sync::atomic::AtomicBool);

/// 前端 → Rust：灌入 `editor.quitAfterWindowClose` 设置值。
#[tauri::command]
pub fn set_quit_after_window_close(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<QuitPolicy>();
    state.0.store(enabled, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

/// **纯函数**：给定「本次退出是否由最后窗口销毁自然触发」与「用户偏好」，是否应阻止退出。
///
/// 抽成纯函数的原因与 `spellcheck_supported_on` 同型（本仓「平台/分支判定的两端可测」
/// 母题）：`prevent_exit` 分支只能在真机 GUI 里触发，把**判定**与**副作用**分开后，
/// 判定本身在任何平台都有断言。
pub const fn should_prevent_exit(code_is_none: bool, quit_after_window_close: bool) -> bool {
    code_is_none && !quit_after_window_close
}

/// 「打开系统拼写设置」（批次 A38 / ADR-0038 C 的入口按钮）。
///
/// macOS 深链 `x-apple.systempreferences:com.apple.Keyboard-Settings.extension`
/// —— 现代 macOS（Ventura 起）拼写检查设置**没有独立面板**，位于
/// 「键盘 → 文本输入 → 编辑… → 拼写」，故落点 = 键盘面板（一手依据：Apple 支持文档
/// mchlp2299 的「Open Keyboard settings」按钮同此路径）。
/// 非 macOS 返回 Err，由前端按 `available()` 门**隐藏**本入口（不是点了报错）。
///
/// 为什么走 `NSWorkspace` 而不是 `opener.openUrl`：tauri-plugin-opener 的默认 ACL
/// 只放行 mailto/tel/http(s)，自定义 `#[tauri::command]` 是本仓既有的合规通道
/// （先例：`open_with_editor`、`page_setup`）。
#[tauri::command]
pub fn open_system_spell_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        use objc2_foundation::{MainThreadMarker, NSURL, NSString};
        // NSWorkspace 只能在主线程访问（objc2 用 MainThreadMarker 静态强制；同 page_setup 的
        // NSApplication 约束。Tauri v2 的同步命令在主线程执行，取不到 MTM 时如实报错不伪造）
        let _mtm = MainThreadMarker::new()
            .ok_or_else(|| "opening system settings requires the main thread".to_string())?;
        let url = NSURL::URLWithString(&NSString::from_str(
            "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
        ))
        .ok_or_else(|| "invalid system settings URL".to_string())?;
        let ok = NSWorkspace::sharedWorkspace().openURL(&url);
        if ok {
            Ok(())
        } else {
            Err("System Settings refused the URL".to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("system spell settings are only available on macOS".to_string())
    }
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
    use super::{should_prevent_exit, CloseGate};

    #[test]
    fn quit_default_keeps_app_alive_after_last_window() {
        // D-AU（ADR-0034 Q12 = A2，默认 false = 不退出，对齐 Typora + macOS 惯例）：
        // 最后窗口销毁（code None）且偏好为「不退出」⇒ 必须阻止进程退出。
        assert!(should_prevent_exit(true, false));
    }

    #[test]
    fn quit_preference_true_allows_window_close_exit() {
        // 开关打开（= Mellow 旧行为）⇒ 不阻止，回归「关窗即退出」语义。
        assert!(!should_prevent_exit(true, true));
    }

    #[test]
    fn programmatic_exit_is_never_prevented() {
        // **安全关键**：code: Some（AppHandle::exit / restart）不得被拦 ——
        // 否则「退出应用」命令/Dock 退出会卡死（prevent 后无人再触发退出）。
        assert!(!should_prevent_exit(false, false));
        assert!(!should_prevent_exit(false, true));
    }

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
