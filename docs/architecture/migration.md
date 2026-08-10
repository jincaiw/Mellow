# MarkEdit 迁移策略

> 约束：PRD §118（Keep / Refactor / Replace）+ ADR-0001（保留 CoreEditor，不从零重写）。

## Keep（复用，不重写）

- CoreEditor parser / CodeMirror setup / Lezer 定制
- history（undo 分组）、completion、task、table、Math parsing、Mermaid
- Markdown styles / themes（16 个）、extension API（P1）
- CoreEditor jest 测试（185 用例，jsdom 可跑）

## Refactor（适配）

- Safari-only assumptions（现状仅剩 `messageHandlers.bridge` 1 处，已 mock → Tauri IPC）
- Host globals（window.config 注入方式已沿用）
- modifier keys（Cmd ↔ Ctrl 差异，Windows/Linux 需适配）
- localization（默认 zh-CN，PRD §12）
- clipboard hooks（多格式 copy/smart paste，ADR-0011）

## Replace（重写）

- MarkEditMac Desktop Shell（22,940 行 AppKit）→ React + Tauri 2
- MarkEditKit WKWebView-specific host bridge → Rust bridge + Host Adapter（PRD §116）
- MarkEditCore Swift 模型 → TS/Rust 契约（EditorConfig 等）

## Optional macOS reuse（Native Enhancement）

- Quick Look（macOS .appex）、Finder 集成、Shortcuts、Writing Tools

## 迁移顺序

```
Phase 0  Repository & Runtime（T-0001~0007）：fork✓/monorepo✓(部分)/CoreEditor package 化(待)/Safari 假设清理/Host API/Tauri shell✓/Qualification harness
Phase 1  Editor Parity Core（T-0101~0112）：marker reveal✓(Phase1)/composition✓/undo✓；links/lists/quote/code fence/source-live 待
Phase 2  Rich Markdown（table/image/math/mermaid：复用 CoreEditor，验证）
Phase 3  Desktop Workflow（React：tabs/tree/outline/search/command palette）
Phase 4-5 Clipboard/Images/UX + Safety（Rust System Core：fs/watch/recovery/atomic）
Phase 6  Appearance/Export/i18n（zh-CN 默认）
Phase 7  QA（parity/IME 矩阵/10MB 基准）
```

## 风险清单（跨平台迁移）

| # | 风险 | 级别 | 缓解 |
|---|---|---|---|
| 1 | messageHandlers.bridge Promise 语义 | 高 | Tauri invoke 等价验证 + 三平台真机 |
| 2 | Swift 层 28,781 行需替换 | 高 | 按 Keep/Refactor/Replace 分批 |
| 3 | AppKit 49 文件强依赖 | 高 | macOS-only 隔离到 native/macos |
| 4 | esnext/safari 18 目标 | 中 | WebView2/WebKitGTK 语法兼容扫描 |
| 5 | 平台行为差异（IME/滚动/剪贴板） | 中 | PRD §4.5 + Runtime Qualification 门禁 |
| 6 | macOS 原生能力缺失 | 中 | L5 Native Enhancement 映射 |
| 7 | ts-gyb 生成链路 | 低 | 桥契约定义 → TS/Rust 输出 |
| 8 | markedit-api GitHub 依赖 | 低 | vendor/类型替换 |

## 基线快照

- 上游：`81da2a20`（2026-08-09）
- CoreEditor：13,625 行；Swift：28,781 行
- 已实现：vendored ✓、Tauri 壳 ✓、Host fs/bridge ✓、marker reveal Phase 1 ✓
