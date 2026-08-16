# Print 三平台验证清单（PRD §77）

Print 实现：桌面端注入打印样式表（与 PDF 共享排版常量），打印命令经
`invoke('print_window')` 调 Tauri `WebviewWindow::print()`（系统打印对话框）。

## 自动化验证（全部通过，2026-08-13）

| 项目 | 命令 | 结果 |
|------|------|------|
| export 包单测（HTML 24 + PDF 11 + Print 11） | `cd packages/export && npx jest` | 46/46 passed |
| export 类型检查 | `npx tsc --noEmit`（packages/export） | 通过 |
| desktop 前端类型检查 | `cd apps/desktop && npx tsc --noEmit` | 通过 |
| desktop 前端构建 | `npx vite build` | 通过（打印样式表零依赖注入，未膨胀 bundle） |
| Rust 编译 | `cd apps/desktop/src-tauri && cargo check` | 通过（无新增警告） |

## 打印样式表与 PDF 对齐（自动化断言）

`packages/export/test/print.test.ts` 断言 printStylesheet 与 PDF 排版常量
（`typography.ts`，pdfmake 同源）一致：正文 11pt / 行高 1.6 / 标题 22-11pt /
代码 9pt / 页边距 60pt / 配色 #1a1a1a #f6f8fa #dfe2e5 #0366d6（light）。

## 系统打印对话框：平台机制（源码级验证）

| 平台 | WebView | 机制 | 来源 |
|------|---------|------|------|
| macOS | WKWebView | `NSPrintOperation` 打印面板（wry 原生实现） | wry 0.55 `wkwebview/mod.rs print_with_options` |
| Windows | WebView2 | `window.print()`（Chromium 打印预览 → 系统打印） | wry 0.55 `webview2/mod.rs print` |
| Linux | WebKitGTK | `webkit2gtk::PrintOperation::run_dialog` 打印对话框 | wry 0.55 `webkitgtk/mod.rs print` |

Tauri 2.11 暴露 `WebviewWindow::print()`（tauri 2.11.2 `webview/webview_window.rs:2294`），
前端统一 `invoke('print_window')`；非 Tauri 环境（纯 Web 调试）fallback `window.print()`。

## 手动验证（需三平台真机 + GUI 会话）

> 说明：本开发机（macOS）自动化会话中 AppKit 初始化 panic
> （tao 0.35.3 `did_finish_launching`，与应用代码无关），无法自动弹出打印面板，
> 以下步骤需人工执行。

### 前置
1. 打开一个含以下内容的 Markdown 文档：
   - 中文段落（CJK）+ 英文混排；
   - 多级标题（# / ## / ###），确保 H1 后内容跨页；
   - 表格（≥10 行）、图片（本地相对路径 + 远程 URL）、行内公式 `$...$`、
     块级公式 `$$...$$`、` ```mermaid ` 流程图；
2. 打开 Reader（`Cmd+Shift+O` 或工具栏 Reader 按钮），确认 math / mermaid 已渲染。

### 步骤（三平台相同）
1. 点击 Reader 工具栏「打印」按钮（或 File → 打印 Reader）→ 弹出**系统打印对话框**；
2. 检查打印预览：
   - 纸张 A4、页边距 60pt（约 2.1cm）——与 PDF 导出（A4/60pt）一致；
   - 正文 11pt、行高 1.6、标题层级字号递减（22/18/15/13/12/11pt）；
   - 中文（CJK）正常渲染，无豆腐块；
   - 表格有边框、代码块有浅灰背景（打印「背景图形」开启时）；
   - 数学公式完整（KaTeX/MathJax 渲染，符号不缺字）；
   - Mermaid 图正常显示（非源码）；
   - 每个 H1 前自动分页（首个 H1 除外）；
3. 选择「另存为 PDF」验证输出文件排版（与 PDF 导出对照）；
4. 关闭对话框，确认应用无崩溃、无空白打印页。

### 平台差异关注点
- **macOS**：打印面板为系统标准面板；「背景图形」选项影响代码块背景；
- **Windows**：Chromium 打印预览，选择打印机后进入系统对话框；「背景图形」默认关闭需勾选；
- **Linux**：GTK 打印对话框；若无打印服务（CUPS），对话框仍可打开并预览。

## 已确认的已知限制
1. 打印入口当前为 Reader 场景（`reader.print` 命令 `enabled: readerOpen`），
   编辑态直接打印未实现（后续可基于 `buildPrintHtml` 做独立打印视图）；
2. 页眉/页脚/页码由系统打印对话框提供（WebView 打印不注入 HTML 页眉页脚），
   与 PDF 导出的 pdfmake 页眉页脚选项（PRD §72）为不同机制；
3. 暗色主题打印默认使用 light 配色（与 PDF 默认一致）；`printStylesheet({ theme: 'dark' })`
   可用于自定义暗色打印。

## 相关代码

- `packages/export/src/typography.ts` — PDF/Print 共享排版常量（单一真源）
- `packages/export/src/printStyle.ts` — 打印样式表（零依赖，桌面注入）
- `packages/export/src/print.ts` — `buildPrintHtml`（独立打印文档，供打印预览）
- `packages/export/src/html/assets.ts` — mermaid 渲染完成事件（打印就绪）
- `apps/desktop/src-tauri/src/print.rs` — `print_window` 命令
- `apps/desktop/src/App.tsx` / `Reader.tsx` — 样式注入 + 打印命令接入
