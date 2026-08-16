/// Print（PRD §77）：调系统打印对话框，打印 Webview 当前渲染内容。
///
/// 平台差异由 Tauri / wry 内部处理：
/// - macOS：NSPrintOperation 打印面板（wry 原生实现）；
/// - Windows：WebView2 `window.print()`（Chromium 打印预览 → 系统打印对话框）；
/// - Linux：WebKitGTK `PrintOperation` 系统打印对话框。
///
/// 打印样式：前端注入 PRINT_STYLESHEET（@page + 与 PDF 共享排版常量，见
/// packages/export/src/printStyle.ts），打印输出与 PDF 导出排版一致。
use tauri::WebviewWindow;

#[tauri::command]
pub fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| format!("print failed: {e}"))
}
