# Markdown 全语法样例 Typora 1.14.9 对标验收报告

> 日期：2026-08-23
> 输入：`/Volumes/My-Data/jason.wa/Downloads/markdown-syntax-demo.md`
> 样例 SHA-256：`23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db`
> 实测对照：Typora 1.14.9 build 7785
> **历史报告修订（2026-08-24）**：本报告记录当时的 Typora 1.14.6 口径；当前产品规范验收基线为 Typora 1.14.9（build 7785）。
> Mellow：1.3.4，源码基线 commit `74c454b` 加本轮工作区修改

## 1. 最终判定

本轮针对该 299 行样例暴露出的四项核心实现差距已经关闭：

1. Source / Live 切换立即刷新；
2. Outline 远距离跳转后正文稳定定位，不再出现 WKWebView 空白视口；
3. PageUp / PageDown 不再通过直接 `scrollBy` 把 CodeMirror 虚拟视口推进未绘制区域；
4. GFM Table 从只读静态预览升级为 Markdown 唯一真源之上的原位语义网格编辑。

macOS release 应用已用同一工作副本复验：从大纲点击“表格”后，目标标题和前置图片内容稳定可见；继续按 Down 后，两个表格均完整显示；按 Tab 后，焦点进入首个正文单元格“张三”。最终截图、AX 焦点与文件 hash 均已固化。

这意味着“本样例触发的本轮代码任务与本地 Gate”已经收口，但不等同于全产品已经达到 Master Plan 定义的 `PASS-E`。完整声明仍需要隔离环境的 N=5 外部性能数据、真实中文输入法候选流程，以及本次代码推送后的 Windows / Linux GitHub Actions 结果。

## 2. 环境与公平性

| 项目 | 值 |
|---|---|
| Typora | 1.14.9 build 7785 |
| Mellow | 1.3.4，release bundle |
| macOS | 26.6.2 build 25G83 |
| 设备 | Mac mini，Apple M4，10-core CPU，16 GB |
| 显示器 | 3840 × 2160；系统缩放 1920 × 1080 @ 60 Hz |
| 原文 | 299 行，UTF-8 Markdown |
| 原文 SHA-256 | `23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db` |

仓库 Accepted ADR 没有被改写；本报告中的 Typora 1.14.6 仅为历史证据。用户确认的 Typora 1.14.9 已成为产品级规范基线。

## 3. 对标结果

| 领域 | Typora 1.14.9 | Mellow 最终状态 | 本轮判定 |
|---|---|---|---|
| 默认正文 | 无行号、无空白符号、标题层级清晰 | 系统字体、隐藏行号和不可见字符、强化 H1–H6 | 差距关闭 |
| Marker Reveal | 非活动节点隐藏语法标记 | Live Mode 正常；Source Mode 同一命令内立即全显 | 差距关闭 |
| Outline | 点击后稳定定位并回到正文 | 同步 measure 校准目标 line block，selection / focus / scroll 一致 | 差距关闭 |
| PageUp / PageDown | Caret 与页面共同移动 | 最高优先级 caret-page 命令，不再直接滚动 DOM | 差距关闭 |
| GFM Table 显示 | 语义网格、列对齐、行内样式 | 语义 `<table>`、列对齐、Strong / Emphasis / Code / Strike / escaped pipe | 样例差距关闭 |
| GFM Table 编辑 | 网格内编辑，Tab 导航 | cell 原位编辑、minimal patch、Tab / Shift+Tab、末格加行、Enter / Escape | 样例差距关闭 |
| Table IME / Undo | 组合输入一次提交，可撤销 | Composition 结束一次写入 Markdown；Cmd/Ctrl+Z 走 CM6 history | 自动化通过；真实 IME 仍属人工 Gate |
| YAML / Comment | 低干扰源码 | 灰色源码与可展开入口 | 基本等价，保留品牌差异 |
| Task | Checkbox | 可编辑 Checkbox | 基本等价 |
| Math | KaTeX | KaTeX | 基本等价 |
| Mermaid | SVG | SVG | 基本等价 |
| Remote Image | 依赖网络 | 明确“加载远程图片”入口 | 网络失败不计产品缺陷 |
| Source Fidelity | 浏览不改源文件 | 四份样例 hash 一致；151 文件 corpus 0 diff | PASS |

样例自身有两个已隔离问题：目录中的“代码”链接没有对应标题，且远程图片受 DNS、证书和防盗链影响。它们没有被误计为 Mellow 缺陷。

## 4. 实现收口

### 4.1 Desktop 写作默认值

`apps/desktop/scripts/build-editor-bundle.mjs` 只在 Desktop bundle 注入以下默认值：

- `system-ui`；
- `showLineNumbers: false`；
- `showActiveLineIndicator: false`；
- `invisiblesBehavior: 'never'`；
- H1–H6 相对正文的字号差 `[15, 9, 5, 2, 0, -1]`。

没有修改 vendored MarkEdit CoreEditor，也没有改变用户设置覆盖机制。

### 4.2 Source Mode 即时刷新

`sourceMode.ts` 在模块状态切换后派发无文本变更的 selection transaction，使依赖 selection 的 ViewPlugin 在同一命令内重算。该事务不进入 Markdown、不污染 Undo 栈。

### 4.3 Outline 与虚拟滚动

`outlineBridge.ts` 完成两层修复：

1. 每个 EditorView 实例只销毁自己持有的 bridge，避免多标签 / View 重建时旧实例删除新 API；
2. 普通文档跳转时先设置精确 selection，再以目标 `lineBlockAt(pos)` 设置滚动位置并同步执行 CodeMirror `measure(true)`，随后用 `coordsAtPos` 二次校准；Large File Mode 保留更保守的原生 selection + scroll 路径。

该路径解决了“selection 已到目标但虚拟视口仍为空白”的 WebKit 时序问题。实机截图显示“图片”尾部和“## 表格”同时稳定出现，焦点返回编辑器。

### 4.4 PageUp / PageDown

`paging.ts` 安装最高优先级 keymap，使用 CodeMirror `cursorPageUp` / `cursorPageDown`。Shift 版本保留选区扩展，Composition 期间不接管按键。这样 Caret、selection、viewport 都由 CM6 同一事务管理，避开 MarkEdit 直接 `scrollBy` 的空白视口路径。

### 4.5 Table Live View

`table/liveView.ts` 仍从 Lezer `Table` 节点和 Markdown source 解析模型，不建立私有 Rich Text 数据结构。表格外部使用 block replacement widget 显示语义网格；每次编辑只 patch 当前 cell 的 source range。

已覆盖：

- 表头、正文、对齐列与可访问 cell 名称；
- Strong、Emphasis、Inline Code、Strike 和 escaped pipe 的安全渲染；
- 鼠标和键盘进入 cell；
- `beforeinput`、Paste 与 WebKit accessibility `input` fallback；
- Composition 期间不写源码，`compositionend` 一次提交；
- Tab / Shift+Tab 遍历，最后一格 Tab 新增 Markdown 行；
- Enter 回到对应源码，Escape 退出原位编辑；
- Cmd/Ctrl+Z 与 Redo 使用 CodeMirror history；
- Source Mode、非法表格和 Large File Mode 保留 Markdown 源码。

Widget 在 `input.table-live` transaction 中映射现有 decoration，避免每个输入字符重建整张表；离开编辑状态时再刷新行内渲染。

## 5. macOS 实机验证

最终 release 应用执行的关键路径：

```text
打开 byte-identical 工作副本
→ Outline 点击“1.11 表格”
→ 等待 1.2 秒
→ 验证目标标题与正文非空
→ Down × 5
→ Tab
→ AX 焦点 = Edit table cell: 张三
→ 关闭应用，不保存
→ 复核工作副本 SHA-256
```

结果：

- Outline 跳转后不存在空白或冻结视口；
- 两个表格均呈现完整网格、列对齐和行内容；
- Tab 聚焦首个正文 cell，AX 元素为 selectable / settable cell；
- 关闭应用后工作副本与原文 byte-identical。

Computer Use 的 `type_text` 在 WebKit 嵌套 `contenteditable` 上会把文本注入 CodeMirror 顶层输入区，因此该能力只用于验证可见性和焦点，不被当作真实 cell 输入或真实中文 IME 证据。表格中文 Composition、一次提交和 Undo 由 editor-engine 自动化验证。

## 6. Source Fidelity、IME 与 Undo

四个样例最终 SHA-256 完全一致：

```text
Downloads 原文                23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db
冻结 original.md             23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db
Mellow 工作副本              23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db
Typora 工作副本              23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db
```

独立 Source Fidelity corpus 结果：`total=151`、`identical=151`、`diff/failed=0`、`git diff=0`。

Table Live View 自动化明确断言：

- compositionstart 到 compositionend 期间不提交候选中间态；
- compositionend 只写入一次完整中文；
- 输入 transaction 不重建整张表；
- Cmd+Z 恢复编辑前完整 Markdown；
- Source / Live 往返不改变文档。

## 7. 自动化与构建结果

| 验证 | 最终结果 |
|---|---|
| Source Mode API 专项 | 1 / 1 PASS |
| Outline bridge 生命周期专项 | 2 / 2 PASS |
| Paging 专项 | 2 / 2 PASS |
| Table Live View 专项 | 5 / 5 PASS |
| 本轮四组专项合计 | 10 / 10 PASS |
| editor-engine 全量 | 60 suites / 642 tests PASS |
| 仓库级 `pnpm test` | PASS；16 / 17 workspace 项目、parity ledger 与原生菜单契约通过 |
| `pnpm typecheck` | PASS |
| Rust `cargo test` | PASS；55 unit + 16 file-safety + 4 updater-safety |
| Source Fidelity corpus | PASS；151 / 151 byte-identical |
| Tauri release `.app` | PASS，`--no-sign` |

仓库既有非阻塞警告仍包括浏览器侧 `fs` / `path` externalization、Vite 大 chunk、Rust 未使用 import / 字段；本轮没有进行无关重构。

## 8. Windows / Linux CI/CD 验证边界

当前 workflow 已覆盖：

- `.github/workflows/ci.yml`：Ubuntu package、editor-engine 与 Rust 测试；
- `.github/workflows/runtime-qualification.yml`：macOS / Windows / Ubuntu runtime qualification，以及 Linux IME matrix；
- `.github/workflows/release.yml`：macOS / Windows / Linux release 构建。

本次修改没有引入 macOS-only Editor Core 依赖；平台差异仍限制在 Desktop Adapter。由于工作区未被授权 commit / push，远端 Actions 尚不可能针对本次未提交内容产生结果，因此这里只能判定“CI 定义覆盖”，不能伪造 `WIN` 或 `LINUX` 已通过状态。

## 9. 发布制品

| 制品 | 路径 / 值 |
|---|---|
| macOS app | `apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app` |
| updater archive | `apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app.tar.gz` |
| disk image | `apps/desktop/src-tauri/target/release/bundle/dmg/Mellow_1.3.4_aarch64.dmg` |
| updater archive size | 15,801,026 bytes |
| executable SHA-256 | `2dc77be53c44ee6bc686c3df7f8fc1dd17b62a345b86f6385394ba6f7933e850` |
| updater archive SHA-256 | `149e93bd9c1fa1b1f2a1ebac4f7d100a8f851efe64209d8100eb263082dfae8d` |
| DMG SHA-256 | `5303cd8d33e342c5c1de68ebaf553624eba9fcdaf586f10cff6a419e0b69c4e8` |

制品是本地 unsigned / unnotarized 验证版本；没有签名凭据时不能作为面向最终用户的 Gatekeeper 发布包。

## 10. 证据索引

Typora：

- `tests/benchmark/parity/markdown-syntax-demo/typora/default/00-open-default.png`
- `tests/benchmark/parity/markdown-syntax-demo/typora/controlled/00-top-no-sidebar.png`
- `tests/benchmark/parity/markdown-syntax-demo/typora/controlled/08-tables.png`
- `tests/benchmark/parity/markdown-syntax-demo/typora/controlled/13-math-mermaid.png`
- `tests/benchmark/parity/markdown-syntax-demo/typora/controlled/14-mermaid.png`

Mellow：

- `tests/benchmark/parity/markdown-syntax-demo/mellow/default/00-open-default.png`
- `tests/benchmark/parity/markdown-syntax-demo/mellow/controlled/00-top-no-sidebar-before.png`
- `tests/benchmark/parity/markdown-syntax-demo/mellow/controlled/04-text-style-table-after.png`
- `tests/benchmark/parity/markdown-syntax-demo/mellow/controlled/08-outline-jump-final.jpeg`
- `tests/benchmark/parity/markdown-syntax-demo/mellow/controlled/09-source-mode-on.png`
- `tests/benchmark/parity/markdown-syntax-demo/mellow/controlled/10-table-live-focus.jpeg`

`controlled/debug-*.png` 是定位被撤销滚动方案时的诊断证据，不代表最终发布行为。

## 11. 未冒充完成的产品级 Gate

以下项目不属于“本轮实现还没写完”，而是 Master Plan 的外部验收条件：

1. 真实拼音输入法的候选翻页、Composition 内 Backspace / 方向键和多节点 Golden Journey；
2. N=5 的 Typora / Mellow 外部 Open、Search、Save、Typing 性能计时；现有 runner 会关闭 Typora 并清理 Mellow 用户状态，必须在隔离测试会话执行；
3. push 后由 GitHub Actions 为本次代码生成 Windows / Linux 结果；
4. 全产品 V-01–V-15、E-01–E-20、UX Score 与三平台 `PASS-E`。

最终结论：该样例发现的 S1 实现缺陷已清零，本地代码、macOS 交互、Undo、组合输入自动化、Source Fidelity 和 release 构建均通过；Mellow 全产品“与 Typora 完全一致或更优”的声明仍受上述 Master Plan Gate 约束。
