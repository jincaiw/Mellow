# Clipboard Copy Cross-App Manual Test Matrix

对应 `docs/specs/clipboard-smart-paste-spec.md` §2 / §8 与 PRD §50。

> 状态：自动化覆盖已完成；以下为真机 GUI 手动验收记录模板。执行前运行 `cd apps/desktop && npm run tauri dev`。
>
> **自动化（2026-09-04 新增）**：「系统纯文本编辑器」列由 `tests/benchmark/clipboard-cross-app.mjs`
> 自动执行（macOS，目标 TextEdit；C1 多 MIME 断言 / C2 Copy-as-Markdown 逐字符读回 /
> C3 纯文本粘贴逐字符读回）。运行前提：`tauri build` 产出 release Mellow.app + 终端已授予
> 辅助功能权限（System Events / CGEvent 在 WorkBuddy 托管会话内不可用，须在用户终端执行）。
> 结果归档 `tests/benchmark/results/<ts>-clipboard-cross-app.json`。

## 测试源文档

在 Mellow 中输入并全选以下内容：

````markdown
# 中文标题 😀

这是 **重点** 和 [链接](https://example.com/路径)。

- 第一项
- 第二项

| 名称 | 数量 |
| --- | --- |
| 苹果 | 2 |

```ts
const html = "<b>不要转换</b>";
```
````

## 预期

- Normal Copy：目标应用尽可能收到 `text/html`/`text/rtf` 富文本；纯文本目标收到 rendered plain text。
- Copy as Markdown：目标应用收到 Markdown source。
- Copy as Plain：目标应用收到 rendered plain text（无 Markdown markers）。
- Copy without Theme：目标应用收到语义 HTML；不带 Mellow theme style/class。
- Unicode/中文：中文、路径、emoji 不丢失。
- Code block：`<b>不要转换</b>` 显示为代码文本，不成为真实 bold HTML。

## Matrix

| 目标应用 | Normal Copy | Copy as Markdown | Copy as Plain | Copy without Theme | 中文/Unicode | Code block 安全 | 执行人/日期 | 备注 |
|---|---|---|---|---|---|---|---|---|
| VS Code | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| Cursor | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| Word | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| Gmail | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| Apple Notes | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| LibreOffice | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |
| 系统纯文本编辑器 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | ⛔ 未测 | | |

## 记录规则

- ✅：目标应用中实际粘贴结果符合预期。
- ⚠️：可用但存在平台差异（例如目标应用忽略 `text/rtf`，使用 `text/html`）。
- ❌：不符合预期，需要记录复现步骤。
- ⛔ 未测：尚未在真实 GUI 应用中执行。
