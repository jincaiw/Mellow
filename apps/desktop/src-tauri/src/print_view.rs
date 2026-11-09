//! 打印视图（A37 / ADR-0037 = A2，2026-11-09）：PDF 导出复用 HTML 打印管线。
//!
//! 架构（ADR-0037 裁决 = A2 的宿主绑定）：
//! 1. 前端 `export.pdf` 用 `buildPrintHtml`（packages/export，已有单测）生成
//!    自包含打印 HTML（@page 分页 / KaTeX / Mermaid / 图片全内联）；
//! 2. 该 HTML 经 `stage_print_view` 存进本模块的**单槽**状态；
//! 3. `open_print_view` 建打印视图窗口，加载 `printview://localhost/view.html`；
//! 4. 协议处理器直接把暂存 HTML 作为响应体返回（内嵌同文档桥脚本：等
//!    `mellow-print-ready` 就绪信号（mermaid 渲染完 / load）后调既有
//!    `print_window` → 系统打印对话框，用户选「存储为 PDF」得到分页 PDF）。
//!
//! 【设计决策与依据（本轮逐一从 tauri 2.11.5 / wry 0.55.1 源码核实）】
//! - **协议直吐 HTML，不用壳页 + fetch + document.write**：tauri 的
//!   `UriSchemeContext::app_handle()`（app.rs:2474）让协议闭包能直接读槽，
//!   少一条 IPC、少一次文档替换（document.write 会换掉监听器，脆）。
//! - **不用临时文件**：打印 HTML 含用户文档内容——落盘会绕过「文件 IO 归
//!   Rust System Core」的审计面（这里虽在 Rust，但 AGENTS.md 的源保真 /
//!   文件安全护栏按「不经 fs 的内存通道」审计更干净），且 macOS /tmp 会被
//!   Spotlight/Time Machine 索引。协议只在本进程注册，内容不过文件系统。
//! - **单槽 + 取走即清**：打印是模态操作；后一次 stage 覆盖前一次，窗口
//!   加载时取走即清，不留驻内存副本。
//! - **不自动关窗**：wry 三平台 `print()` 均**立即返回**——macOS
//!   `runOperationModalForWindow`（canSpawnSeparateThread=true，面板在独立
//!   线程模态）、Windows `window.print()`（eval）、Linux `run_dialog`——
//!   Rust 侧拿不到「打印完成」回调；打印后若自动关窗，macOS 上会杀掉
//!   正在显示打印面板的宿主窗。改由**桥脚本在面板流程结束后关窗**：
//!   - macOS：`runOperationModalForWindow` 的面板与窗口同在主线程跑模态循环，
//!     `print()` 返回后主线程恢复 ⇒ 桥在 invoke resolve 后关窗安全；
//!   - Windows/Linux：`window.print()` 阻塞 JS 线程，返回即用户已关预览/对话框。
//!   （真机实测见台账 P0-EXPORT-001 blockedBy，本机禁跑打印探针。）
//! - **IPC 可达性已核实**：tauri 初始化脚本（`__TAURI_INTERNALS__.invoke`）
//!   注入**所有** webview（含 External URL，manager/webview.rs:182）；IPC 响应
//!   带 `Access-Control-Allow-Origin: *`（ipc/protocol.rs:51）；Mellow `build.rs`
//!   为裸 `tauri_build::build()`（无 `app_manifest`）⇒ `has_app_manifest=false` ⇒
//!   自定义命令对 Local origin **不做 ACL 检查**（webview/mod.rs:1823）——
//!   print-view-* 窗口不在 capabilities 清单里也能 invoke 自定义命令。
//!   自定义协议 origin 被 `is_local_url` 判为 Local（webview/mod.rs:1727 一带）。
//!
//! 平台差异（wry 实测）：macOS `printOperationWithPrintInfo` 系统打印面板；
//! Windows WebView2 `window.print()`（打印预览 → 存为 PDF）；Linux
//! WebKitGTK `PrintOperation::run_dialog`。分页一律由 `@page` CSS 承担
//! （printStyle.ts），三平台同源。

use std::sync::Mutex;
use tauri::{Manager, WebviewUrl};
use tauri::webview::WebviewWindowBuilder;

/// 打印视图 HTML 的单槽（None = 无待打印内容）。
#[derive(Default)]
pub struct PrintViewSlot(pub Mutex<Option<String>>);

/// scheme 名：macOS/Linux 上页面 origin 为 `printview://localhost/…`；
/// Windows 上 tauri 自动转成 `https://printview.localhost/…`（WebView2 自定义协议
/// 仅支持 `*.localhost` 形态，manager/webview.rs:249-253）。
pub const PRINT_VIEW_SCHEME: &str = "printview";

/// 打印视图窗口 label 前缀（协议层以此校验「只有打印视图窗口能取内容」）。
pub const PRINT_VIEW_LABEL_PREFIX: &str = "print-view-";

/// 前端 → Rust：暂存打印 HTML（前端 `buildPrintHtml` 产物）。
#[tauri::command]
pub fn stage_print_view(app: tauri::AppHandle, html: String) -> Result<bool, String> {
    let slot = app.state::<PrintViewSlot>();
    let mut guard = slot.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(html);
    Ok(true)
}

/// 打开打印视图窗口（前端先 `stage_print_view`）。返回窗口 label。
///
/// 只读槽判定「有内容」，**不清槽**——内容由协议响应消费（窗口加载时取走即清）。
#[tauri::command]
pub fn open_print_view(app: tauri::AppHandle) -> Result<String, String> {
    {
        // 无内容直接报错：前端流程保证先 stage 再 open，此处兜底防御。
        let slot = app.state::<PrintViewSlot>();
        let guard = slot.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            return Err("no print content staged".into());
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let label = format!("print-view-{stamp}");
    // External URL + 自定义协议：三平台由 tauri/wry 统一映射（见 PRINT_VIEW_SCHEME 注释）。
    let url = WebviewUrl::External(
        format!("{PRINT_VIEW_SCHEME}://localhost/view.html")
            .parse()
            .map_err(|e| format!("invalid print view url: {e}"))?,
    );
    let builder = WebviewWindowBuilder::new(&app, label, url)
        .title("Mellow")
        .inner_size(900.0, 700.0)
        .resizable(true)
        .center();
    // 与主窗口/新窗口同一裁决（V4 §17 D10 / V7-W2.1）：Windows 一体化自绘标题栏，
    // 去系统 chrome；macOS/Linux 维持系统装饰。
    #[cfg(target_os = "windows")]
    let builder = builder.decorations(false);
    let window = builder
        .build()
        .map_err(|e| format!("print view window failed: {e}"))?;
    window
        .set_title("Mellow")
        .map_err(|e| format!("set title failed: {e}"))?;
    // label 已被 builder 消费（move），从窗口本体取回返回给调用方。
    Ok(window.label().to_string())
}

/// 打印视图桥脚本（内嵌进协议响应的打印 HTML，同文档运行）。
///
/// 就绪信号来自 `buildPrintHtml` 注入的 `PRINT_READY_SCRIPT`（packages/export
/// print.ts）：mermaid 渲染完 `mellow-mermaid-ready` → postMessage
/// 'mellow-print-ready'（postMessage 到自身；parent===window 时 PRINT_READY_SCRIPT
/// 本就发不出去——**因此这里不能再依赖 postMessage**，改为监听 DOM 事件
/// `mellow-mermaid-ready` + load，加 2.9s / 6s 双兜底）。打印完成后关窗：
/// `print_window` 命令带 `window: WebviewWindow` 参数由 Tauri **自动注入调用方窗口**
/// ⇒ 无需传 label；macOS wry `runOperationModalForWindow` 模态返回后 resolve，
/// Windows/Linux `window.print()` 阻塞返回后 resolve ⇒ resolve 即面板已关，关窗安全。
///
/// ⚠️ 就绪脚本的 mermaid 路径有 fallback 计时器兜底，load 路径也有 300ms 兜底，
/// 这里再加 2.9s/6s 两层固定兜底：任何信号都没到也必须弹打印（mermaid 大图 +
/// 慢字体不能让用户干等）。
fn print_view_bridge_script() -> &'static str {
    r#"(function () {
  var invoked = false;
  function invoke(cmd, args) {
    var fn = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (!fn) return Promise.reject(new Error('no ipc'));
    return fn(cmd, args || {});
  }
  function printNow() {
    if (invoked) return;
    invoked = true;
    // print_window 由 Tauri 注入「本窗口」→ 系统打印对话框（用户选「存储为 PDF」）。
    // resolve = 面板已结束（macOS 模态返回 / Win|Linux window.print() 返回）→ 关窗。
    invoke('print_window')
      .catch(function () { window.print(); }) // IPC 不可达兜底（仍能出系统打印路径）
      .then(function () { return invoke('close_print_view', {}); })
      .catch(function () { window.close(); })
      .then(function () {});
  }
  // 就绪信号（与 PRINT_READY_SCRIPT 同一事件面，不依赖跨文档 postMessage）：
  window.addEventListener('mellow-mermaid-ready', function () { setTimeout(printNow, 50); });
  window.addEventListener('load', function () { setTimeout(printNow, 2900); });
  setTimeout(printNow, 6000); // 最终兜底
})();
"#
}

/// 协议响应体：暂存 HTML + 桥脚本（注入 `</body>` 前；结构来自 buildPrintHtml，固定有 </body>）。
fn print_view_response_body(html: &str) -> String {
    let script = format!("<script>\n{}\n</script>", print_view_bridge_script());
    match html.rfind("</body>") {
        Some(idx) => format!("{}\n{}\n{}", &html[..idx], script, &html[idx..]),
        None => format!("{html}\n{script}"),
    }
}

/// lib.rs 的 Builder 链调用：注册 printview 协议 + 单槽状态。
///
/// 协议只服务 `/view.html`（其余 404），且**只有 print-view-* 窗口能取内容**：
/// `ctx.webview_label()`（manager/webview.rs:233 一带）给出请求方窗口 label。
pub fn register_protocol(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    use tauri::Manager;
    builder
        .manage(PrintViewSlot::default())
        .register_uri_scheme_protocol(PRINT_VIEW_SCHEME, |ctx, request| {
            let not_found = || {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .expect("static 404 response")
            };
            // 校验请求方：非打印视图窗口不得经本协议取到任何内容（防御纵深，
            // 正常流程只有 open_print_view 建的窗口会请求该 scheme）。
            if !ctx.webview_label().starts_with(PRINT_VIEW_LABEL_PREFIX) {
                return not_found();
            }
            if request.uri().path() != "/view.html" {
                return not_found();
            }
            let html = {
                let slot = ctx.app_handle().state::<PrintViewSlot>();
                let mut guard = match slot.0.lock() {
                    Ok(g) => g,
                    Err(_) => return not_found(),
                };
                match guard.take() {
                    Some(h) => h,
                    None => return not_found(), // 槽已空（重复加载 / 直接打开该 URL）
                }
            };
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(print_view_response_body(&html).into_bytes())
                .expect("print view html response")
        })
}

/// 关闭打印视图窗口。`window: WebviewWindow` 由 Tauri 自动注入**调用方窗口**
/// ——桥脚本就在打印视图窗口里运行 ⇒ 无需（也无法可靠）传 label。
#[tauri::command]
pub fn close_print_view(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .close()
        .map_err(|e| format!("close print view failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{print_view_response_body, PRINT_VIEW_LABEL_PREFIX};

    /// 桥脚本必须注入 `</body>` 之前（document 末尾的脚本在 DOMContentLoaded 前执行，
    /// load/mermaid 监听器才能挂上）。
    #[test]
    fn bridge_script_injected_before_body_close() {
        let html = "<html><body>hello</body></html>";
        let out = print_view_response_body(html);
        assert!(out.contains("print_window"), "桥脚本必须在响应体里");
        let script_at = out.find("<script>").expect("script tag");
        let body_close_at = out.find("</body>").expect("body close");
        assert!(script_at < body_close_at, "script 必须在 </body> 前");
        assert!(out.ends_with("</html>"), "文档结构保持完整");
    }

    /// 无 `</body>` 的兜底路径（buildPrintHtml 产物固定有，防御）。
    #[test]
    fn bridge_script_appended_when_no_body_close() {
        let out = print_view_response_body("<p>frag</p>");
        assert!(out.contains("print_window"));
        assert!(out.contains("<p>frag</p>"));
    }

    /// label 前缀必须与 open_print_view 生成的 label 一致（协议校验依赖它）。
    #[test]
    fn label_prefix_matches_window_label_format() {
        assert!(PRINT_VIEW_LABEL_PREFIX.starts_with("print-view-"));
        assert!(format!("{PRINT_VIEW_LABEL_PREFIX}123").starts_with(PRINT_VIEW_LABEL_PREFIX));
    }
}
