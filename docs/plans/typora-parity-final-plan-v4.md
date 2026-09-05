# Mellow ↔ Typora 最终深度对标实施方案（V4.0 · 待确认）

> 文档状态：**待确认，确认后实施**
> 方案版本：V4.0（取代 V3.0 成为唯一权威施工文件）
> 更新日期：2026-09-01
> 代码审计基线：`2482503`（Desktop `1.3.6+`，20 文件 +615/−83，22 提交）
> 产品验收基线：**Typora 1.14.9（build 7785）** — 官方 stable channel 当前最新为 1.14.x，无 1.15
> 历史参考：Typora 1.14.6（不再用于规范验收）
> 语言范围：**仅简体中文（zh-CN）与 English（en-US）**
> 验证环境：macOS 本机真实桌面验收；Windows / Linux 由 GitHub Actions 真实桌面环境执行
> 文档角色：Typora 对标工作的**唯一权威实施方案**
> 实施约束：严格按 P0 → P8 推进；P8 全部通过前不得宣称"完全一致或更优"

---

## 0. 一页结论

Mellow 的目标不是"具备与 Typora 类似的功能"，而是：

> **让 Typora 用户在 Mellow 中以相同心智、相同或更少步骤、相同快捷键和不更差的编辑手感完成核心任务，并在 IME、文件安全、Source Fidelity、大文件、阅读模式和跨平台一致性上明确更优。**

### 0.1 V4.0 相对 V3.0 的变化

V4.0 不是重写，而是**用 2026-09-01 的代码审计结果替换 V3.0 中"待确认"的部分**。三件事变了：

1. **V3.0 的 P0 与顶层菜单差距已关闭** — 基线治理完成（`tests/parity/typora-parity-ledger.json` 32 条纳入 `pnpm test`）；顶层菜单已收敛为 `文件/编辑/段落/格式/显示/主题/窗口/帮助`，独立"插入"顶层已移除。
2. **差距从"结构性"下沉为"肌肉记忆级"** — 菜单顺序对了，但 Windows / Linux 上 **9 处快捷键与 Typora 官方快捷键表不一致**（代码块、数学块、引用、有序/无序列表、图片、删除线、行内代码、缩进方向、新建窗口缺失）。这是 Typora 用户迁移时最先撞上的墙，V4.0 把它提到 P1。
3. **新增审计发现的确定性缺陷** — 侧边栏无目录 watcher、四模式全无虚拟化、Outline/Search 无键盘导航、`--mellow-line-height` 设置无人消费（行高设置完全失效）、Image/TaskCheckbox/智能标点等 9 个模块无 IME composition guard、Undo 未按用户动作分组、Table 100×30 零测试、Clipboard 跨应用零自动化、无像素级视觉 Golden。

### 0.2 当前总体判定

| 维度 | V3.0 判定 | V4.0 判定 | 变化 |
|---|---|---|---|
| 功能覆盖 | IMPL / AUTO 较高 | IMPL / AUTO 较高 | 持平 |
| 菜单顶层结构 | FAIL | **PASS-B**（顺序对，条目与快捷键待收口） | ↑ |
| 快捷键（Win/Linux） | 未评估 | **FAIL**（9 处偏离官方表） | ↓ 新暴露 |
| 桌面 UI / 布局 | 未 PASS-E | 未 PASS-E（默认已克制，缺陷在细节） | 持平 |
| 侧边栏 | 功能丰富、密度高 | 密度已收敛；**能力缺口明确**（watcher/虚拟化/键盘） | ↑ |
| 编辑手感 | macOS 部分证据 | macOS 部分证据；**IME guard 与 Undo 语义缺口定位完成** | ↑ 可施工 |
| 三平台 | 构建/启动通过 | Linux IME 矩阵已跑真机；**Windows 仍为诊断级** | ↑ |
| Release Gate | 空白 | **UX Score 与 30 任务仍空白** | 持平 |

**结论：不可宣称"完全对标完成"。Ledger 32 项中 0 项 PASS-E，28 项 AUTO、2 项仅有 macOS 证据（IME/Undo、性能）、1 项 IMPL（三平台 Runtime 门禁）、1 项 NOT_TESTED（UX Gate）。**

### 0.3 实施顺序（确认后固定）

```text
P0 基线与证据治理          ✅ 已完成
→ P1 Menu / Command / Shortcut 单一真源 + 快捷键纠偏   ← 最先做，影响全部用户路径
→ P2 Desktop Shell 与默认布局收敛（含已知缺陷修复）
→ P3 Sidebar 深度对标（watcher / 虚拟化 / 键盘 / 右键）
→ P4 Live Editing 与编辑手感（15 状态矩阵 / IME guard / Undo 语义）
→ P5 Table / Image / Clipboard / File Workflow
→ P6 Settings / Theme / Export / Better
→ P7 三平台 Native Adapter 收口
→ P8 真机、效率、盲测与 Release Gate
```

---

## 1. 权威依据与冲突裁决

### 1.1 文档优先级

| 优先级 | 文档 | 本方案使用方式 |
|---|---|---|
| P0 | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 产品范围、目标、基线与 Release Gate 最终依据 |
| P1 | `docs/specs/desktop-ui-design-spec.md` | Desktop Shell、Sidebar、布局与低干扰规则 |
| P1 | `docs/specs/live-markdown-engine-spec.md` | Live Editing、Caret、IME、Undo 与节点状态 |
| P1 | `docs/specs/table-editing-spec.md` | 表格 GUI、Minimal Patch 与 IME |
| P1 | `docs/specs/image-workflow-spec.md` | 图片输入、路径、批处理与文件操作 |
| P1 | `docs/specs/clipboard-smart-paste-spec.md` | 多格式复制与 Smart Paste |
| P1 | `docs/specs/document-file-safety-spec.md` | Source Fidelity、保存、恢复与外部冲突 |
| P1 | `docs/specs/ime-test-plan.md` | 三平台真实输入法矩阵 |
| P1 | `docs/specs/performance-benchmark-spec.md` | 同机对照与性能口径 |
| P2 | ADR-0001/0003/0005/0006/0007/0009/0011/0015/0016/0019/0022 | 已接受决策，不在本方案推翻 |
| P3 | 本方案 | 施工顺序、验收拆解、依赖与证据治理 |

### 1.2 冲突裁决

1. **Normative Baseline = Typora 1.14.9（build 7785）**；1.14.6 仅历史参考；
2. 官方 stable channel 当前最新为 1.14.x，**不存在 1.15**，无需改基线；
3. Split Mode 已移出 V1，不得通过菜单、命令、设置或验收项重新引入；
4. 需求冲突以 PRD V1.2 FINAL 为准，先报告再动手；
5. 架构变更必须新增 ADR，禁止直接改写 Accepted ADR。

### 1.3 不在本方案变更的架构

保留 MarkEdit CoreEditor；Markdown 纯文本唯一真源；CodeMirror 6 + Lezer；Live Markdown 走 Decoration/Widget（**从不 replace 文本**）；React + TypeScript 负责 Desktop UI；Rust 负责 System Core；Editor/UI 不直接依赖 Tauri；平台差异只在 Adapter；Tauri 2 锁定（ADR-0019 触发条件成立时新增 ADR）；AI 仅可选扩展。

---

## 2. "一致或更优"的判定模型

### 2.1 三级目标

| 等级 | 定义 | 允许结果 |
|---|---|---|
| **E — Equivalent** | Typora 核心任务必须体验等价 | 步骤不更多、默认一致、快捷键一致、结果一致、性能不更差 |
| **B — Better** | Mellow 明确优于 Typora | 必须有测试和用户验证，不能靠功能数量自评 |
| **D — Deliberate Difference** | 有意不同 | 品牌视觉、Logo、原创主题、Reader/Palette/Slash 等不破坏 Typora 心智的增强 |

### 2.2 Experience Contract（每项对标必须同时记录）

```text
Feature
+ Entry Point        + Default State     + Keyboard
+ Mouse / Touchpad   + Caret / Selection + IME
+ Undo / Redo        + Visual Feedback   + Markdown / File Result
+ Performance        + Accessibility     + Windows / macOS / Linux Result
= Experience Contract
```

只满足 Feature 不得标记完成。

### 2.3 状态码

| 状态 | 含义 |
|---|---|
| ABSENT | 未实现 |
| IMPL | 已有实现，未形成充分验收证据 |
| AUTO | 自动化测试通过，未完成真机体验验收 |
| MAC / WIN / LINUX | 仅该平台真机通过 |
| PASS-B | 基本一致，存在已知小差异 |
| **PASS-E** | 三平台 Experience Contract 全部通过 |
| PASS-BETTER | Better 项通过对照或盲测 |
| BLOCKED | 触发 Release Blocker |

最终 "Done" 只能是 `PASS-E` 或 `PASS-BETTER`。

### 2.4 证据等级（从高到低）

1. 同机同文档真实 Typora / Mellow 双应用对照；
2. 三平台真实桌面手工或自动化交互；
3. AX 树、截图、视频、菜单 dump、文件 diff、导出产物；
4. E2E / Integration / Unit 自动化；
5. 代码阅读；
6. 文档声明。

**低等级证据不能替代高等级 Gate。**"有 631 个测试"不能替代 Windows 微软拼音真机验证。

---

## 3. Typora 1.14.9 体验模型（对标对象）

### 3.1 核心特点：五层体验共同成立

| 层 | Typora 的做法 | Mellow 对应合同 |
|---|---|---|
| 1. 单一编辑表面 | 正文与预览不分离，语法标记按 Caret 智能显隐 | Live Mode 默认；marker 只用 `Decoration.mark`（fontSize:0 / opacity .35），从不 replace |
| 2. 低干扰桌面壳 | 窗口控件、菜单、Sidebar 退后，文档第一视觉 | Sidebar/StatusBar 默认隐藏、单 Tab 自动隐藏、无常驻 Ribbon |
| 3. 结构化编辑 GUI | Table、Image、Link、Math、Mermaid 无需切换富文本模型 | 全部以 Markdown 为真源，GUI 操作产出 minimal patch |
| 4. 文件型工作流 | 打开单文件即加载父目录，Tree/List/Outline/Search 紧贴文档 | Sidebar 四模式 + Quick Open + 父目录自动挂载 |
| 5. 可预测输出 | 复制、粘贴、主题、PDF、HTML、Pandoc 与 Markdown 原文兼容 | Source Fidelity 0 diff；多格式剪贴板；导出 corpus |

### 3.2 官方 1.14.6 新增能力（全部属 P0 范围，Mellow 须有对应）

- Editor Toolbar（视图 → 工具栏）；
- macOS 格式 Context Menu；
- Sidebar hidden / all / custom glob 过滤；
- File Tree keyboard navigation。

### 3.3 默认桌面心智

```text
macOS                                            Windows / Linux
┌──────────────────────────────────────┐         ┌──────────────────────────────────────┐
│ Traffic Lights · Tabs · Sidebar 图标 │         │ 低干扰标题 / 菜单 / 窗口控件         │
├────────────┬─────────────────────────┤         ├────────────┬─────────────────────────┤
│ Sidebar    │   居中写作表面          │         │ Sidebar    │   居中写作表面          │
│（可选）    │                         │         │（可选）    │                         │
└────────────┴─────────────────────────┘         └────────────┴─────────────────────────┘
```

关键不是像素复制，而是：**默认打开后可立即写；第一眼看见正文不是工具条；Sidebar 开关不改变写作宽度；高级能力只在需要时出现；常用功能在原菜单位置能找到。**

---

## 4. 当前实现审计

### 4.0 重审计（2026-09-04 @ `316a082`，本节为最新状态，§4.1–§4.4 保留为 2026-09-01 历史基线）

对 §4.1–§4.4 全部 G4 缺陷逐项对照当前 HEAD 复核，结果如下：

| 状态 | 项 |
|---|---|
| **已修复（15 项）** | G4-SHELL-01（line-height 已消费，`build-editor-bundle.mjs:242` + `verify-shell-typography.mjs` 护栏）、G4-SHELL-03（四模式虚拟化 `VirtualRows.tsx`/`virtual.ts`）、G4-SHELL-04（Tab scrollIntoView + compact，`Tabbar.tsx:32-44`）、G4-SHELL-05（Tab 右键菜单）、G4-SHELL-07（`verify-visual-golden.mjs` + `tests/visual/visual-golden.mjs` 四分辨率）、G4-SHELL-08（Top 56px / Bottom 30vh 固化）、G4-SIDE-01（File List 全键位）、G4-SIDE-02（Outline/Search 键盘导航，`App.tsx:4200`）、G4-SIDE-03（四模式右键菜单）、G4-SIDE-06（常驻 filter + 新建按钮）、G4-MENU-01~06/08/09（menuSchema 单一真源、主题 registry 派生、新建窗口/Ctrl+N、context menu 走 dispatchCommand、三平台 accelerator、menu dump 入库）、G4-EDIT-02（9 模块 IME guard，`ime-guards.test.ts`）、G4-EDIT-03（Undo 分组 `undoGrouping.ts`，21 用例）、G4-EDIT-04（Table 100×30，`table-large.test.ts`）、G4-EDIT-07（Source↔Live 往返 8 用例） |
| **部分修复** | G4-SHELL-06（focus/typewriter 有 mode-indicator；Reader 不做常驻指示为代码注释明示的设计取舍，记为 D）、G4-EDIT-05（引擎层 11 用例已过；跨应用 GUI 自动化仍缺，属真机 Gate）、G4-EDIT-06（mock uploader 已测；PicGo 真实外部进程链路属真机 Gate） |
| **仍存在** | **G4-SHELL-02 / G4-SIDE-04（Sidebar 目录 watcher）**——唯一待施工硬缺口 |

Settings 快捷键可编辑（§9.5 缺口）已随 P2-2.6 落地。跨应用拖拽 e2e（`tests/e2e/drag-drop-verify.mjs`）已存在，OS 级 Finder/Explorer ↔ Sidebar 跨应用拖拽仍属真机验证范围。

**2026-09-04 增补（桌面对标第二轮，v1.4.4）**：用户裁决"再次完全对标 Typora 桌面 UI/布局并补足功能与编辑体验"（C1–C6 全量）已完成自动化收口——C1 右键菜单全面对标（code/math/mermaid/table/link/image 13 类条目、渲染导出 copyAsImage/download、单 Undo 文档变换、guarded by `verify-context-menu-parity.mjs` 契约序列 + `verify-context-menu-guard.mjs` 12 缺陷变异）、C2 菜单 §7.3 收口（edit 菜单 pasteMatchStyle/copyWithoutTheme/EOL/trimTrailing；快捷键冲突 export.repeat Ctrl+E 移除，单一真源保持）、C3 StatusBar 单项配置 + Zoom 项（localStorage `mellow.statusbar.fields`）、C4 编辑器默认字体回退缺陷修复（`ui-monospace` 契约全链路）、C5 widget 节点 15 状态矩阵（9 家族 × 15 态 = 126 用例，caret 语义以源码为准）。§4.1–§4.4 状态不变；G4-SHELL-02/G4-SIDE-04（目录 watcher）已在前轮关闭。

### 4.1 桌面 UI / 布局（2026-09-01 历史基线）

**已达标**

| 项 | 证据 |
|---|---|
| Sidebar 默认隐藏 + 记忆 | `App.tsx:258-260`（`mellow.sidebar.visible`） |
| Status Bar 默认隐藏 | `App.tsx:253-256`；`settings/src/index.ts:158` |
| 单 Tab 自动隐藏 | `App.tsx:3768`（`tabs.length > 1 \|\| !autoHideTabBar`） |
| 写作宽度 820px / auto | `App.tsx:365-374`；`styles.css:870-873` |
| Sidebar 开关不改变写作宽度 | `tests/e2e/sidebar-verify.mjs:123,201-207` |
| 侧边栏 hover/action 收敛 | `styles.css:201-212`（`.sidebar-header-actions` opacity 0 → hover/focus-within 1） |
| 高级过滤默认折叠 | `App.tsx:414`（`fileFiltersOpen` 默认 false） |

**缺陷（G4-SHELL-\*）**

| ID | 缺陷 | 定位 | 级别 |
|---|---|---|---|
| G4-SHELL-01 | `--mellow-line-height` 写入但**全仓库无 CSS 消费**，行高设置完全失效 | 写入 `App.tsx:372,3104`；消费点缺失 | **P0 缺陷** |
| G4-SHELL-02 | Sidebar 无目录 watcher，外部新增/删除/移动文件不会自动刷新 | `src-tauri/src/watcher.rs:60,114` 只有 `watch_document` | P1 |
| G4-SHELL-03 | 文件树 / 文件列表 / 大纲 / 搜索**全无虚拟化**，10k 文件目录会卡 | `FileTree.tsx:53-56`、`FileList.tsx:20`、`OutlineList.tsx:19`、`SearchResultsList.tsx:15` | P1 |
| G4-SHELL-04 | Tab overflow 只有横向滚动，无"滚动到 active"、无压缩 | `styles.css:76-82`；`Tabbar.tsx:17-45` | P1 |
| G4-SHELL-05 | Tab 无右键菜单（关闭 / 关闭其他 / 关闭右侧 / 重新打开） | `Tabbar.tsx` 无 `onContextMenu` | P1 |
| G4-SHELL-06 | Focus / Typewriter / Slash / Reader **无常驻状态指示**，StatusBar 又默认隐藏 → 用户零反馈 | `App.tsx:1025-1072`、`3249-3259`、`3327-3328` | P2 |
| G4-SHELL-07 | **无像素级视觉 Golden**，只有 DOM 断言与人工截图 | 无 golden 测试；截图仅存于 `tests/benchmark/parity/`、`screenshots/` | P1 |
| G4-SHELL-08 | `.mellow-editor-frame` 无 top padding / bottom space 定义，留白由 iframe 内主题决定，跨主题不一致 | `styles.css:874-878` | P2 |

### 4.2 菜单 / Command / 快捷键

**已达标**

- 顶层顺序 ✅：`文件 → 编辑 → 段落 → 格式 → 显示 → 主题 → 窗口 → 帮助`（`menu.rs:430,514,699,700,701,731,740,748`；macOS 前置应用菜单 316–331）
- 独立"插入"顶层已移除 ✅：insert 项并入段落/格式（`menu.rs:573` 注释 + `696-697`、`603`）
- 主题菜单与 registry 有测试护栏 ✅（但仍是硬编码 + 正则校验）

**缺陷（G4-MENU-\*）**

| ID | 缺陷 | 定位 | 级别 |
|---|---|---|---|
| G4-MENU-01 | **五真源并存**：`menu.rs` 硬编码（803 行）、`App.tsx` 内联 ~205 条命令（3209–3498）、`MENU_LABELS` 第三套文案（57–275）、`Cheatsheet.tsx` 手写 SECTIONS（33–101）、i18n 无 `menu.*` 命名空间 | 见定位列 | **P1 首要** |
| G4-MENU-02 | `CommandDescriptor` / `menuPath` / `menuOrder` / `checkState` / `toNativeMenuSpec()` **全部未实现**；仓库内 `NativeMenuSpec` 仅出现在方案文档 | `packages/commands/src/index.ts:47-60` | P1 |
| G4-MENU-03 | 菜单护栏只有 46 行正则扫描（存在性 + 顶层顺序），**不校验条目顺序、separator、accel、checkState、文案** | `tests/parity/verify-menu-contract.mjs` | P1 |
| G4-MENU-04 | 主题菜单 8 个 id 硬编码在 `menu.rs:706`，非从 registry 派生 | `menu.rs:706`；`packages/themes/src/index.ts:145-320` | P1 |
| G4-MENU-05 | 文件菜单缺 **新建窗口**、**Page Setup**、**在文件树中显示**、**在文档列表中显示**；"新建"被绑到 `Cmd+T/Ctrl+Alt+T` 且文案为"新建标签页"，**缺 `Ctrl+N`** | `menu.rs:334,418-429` | **P1 肌肉记忆** |
| G4-MENU-06 | Context Menu 只覆盖 `text/link/wikilink/image/table` 五类，**无 code / math / mermaid 分支** | `editor-engine/src/contextMenu.ts:23` | P1 |
| G4-MENU-07 | Context Menu **绕过 `dispatchCommand`**，直接调 `win.__MELLOW_CONTEXT_ACTIONS__`，因此不计入 registry、不共享 enabled/checkState、不受 menu contract 约束 | `App.tsx:2660-2698` | P1 |
| G4-MENU-08 | Windows / Linux 无原生 accelerator（`accel()` 仅 macOS 生效，`menu.rs:309-311`），全部依赖前端 keydown，存在双触发与焦点丢失风险 | `menu.rs:309-311` | P1 |
| G4-MENU-09 | `tests/benchmark/fixtures/typora-menu-dump.txt` 为 gitignore 生成物，**仓库内不存在**，真机 AX 语义 diff 未落地 | `menu.rs:8` 引用 | P1 |

**快捷键偏离表（对照 Typora 官方 Shortcut Keys）**

| 功能 | Typora Win/Linux | Mellow Win/Linux | 判定 |
|---|---|---|---|
| 新建 | `Ctrl+N` | **无**（`file.new` 绑到 `Ctrl+Alt+T`） | ✗ FAIL |
| 新建窗口 | `Ctrl+Shift+N` | **缺失** | ✗ FAIL |
| 代码块 | `Ctrl+Shift+K` | `Ctrl+Alt+C` | ✗ FAIL |
| 数学块 | `Ctrl+Shift+M` | `Ctrl+Alt+B` | ✗ FAIL |
| 引用 | `Ctrl+Shift+Q` | `Ctrl+Alt+Q` | ✗ FAIL |
| 有序列表 | `Ctrl+Shift+[` | `Ctrl+Alt+O` | ✗ FAIL |
| 无序列表 | `Ctrl+Shift+]` | `Ctrl+Alt+U` | ✗ FAIL |
| 图片 | `Ctrl+Shift+I` | `Ctrl+Alt+I` | ✗ FAIL |
| 删除线 | `Alt+Shift+5` | `Ctrl+Shift+\`` | ✗ FAIL |
| 行内代码 | `Ctrl+Shift+\`` | `Ctrl+\`` | ✗ FAIL |
| 缩进 / 减少缩进 | `Ctrl+[` / `Ctrl+]` | `Ctrl+]` / `Ctrl+[` | ⚠ **方向相反，需真机复核后裁决** |
| 表格 | `Ctrl+T` | `Ctrl+T` | ✓ |
| Quick Open | `Ctrl+P` | `Ctrl+P` | ✓ |
| 查找 / 替换 / 下一个 / 上一个 | `Ctrl+F` / `Ctrl+H` / `F3` / `Shift+F3` | 同（`F3` 走别名） | ✓ |
| 侧边栏 / 大纲 / 文章 / 文件树 | `Ctrl+Shift+L` / `1` / `2` / `3` | 同 | ✓ |
| 源码模式 / F8 / F9 / F11 | `Ctrl+/` / F8 / F9 / F11 | 同 | ✓ |
| 复制为 Markdown / 粘贴纯文本 | `Ctrl+Shift+C` / `Ctrl+Shift+V` | 同 | ✓ |
| 选择行 / 样式范围 / 词 / 删除词 | `Ctrl+L` / `Ctrl+E` / `Ctrl+D` / `Ctrl+Shift+D` | 同 | ✓ |
| 跳转文首 / 文末 / 选区 | `Ctrl+Home` / `Ctrl+End` / `Ctrl+J` | 同 | ✓ |
| 删除表格行 | `Ctrl+Shift+Backspace` | 同 | ✓ |
| 首选项 / 重开关闭文件 / 切换文档 | `Ctrl+,` / `Ctrl+Shift+T` / `Ctrl+Tab` | 同 | ✓ |
| 放大 / 缩小 / 实际大小 | `Ctrl+Shift+=` / `-` / `0` | 同 | ✓ |
| 全屏 | `F11` | `F11` | ✓ |
| 打印 | 官方表未列（`Ctrl+P` 被 Quick Open 占用） | `Ctrl+Alt+P` | ✓ D 增强 |
| macOS 全屏 | 官方 `Cmd+Option+F` | `Ctrl+Cmd+F` | ⚠ 需真机复核 |

> **裁决原则**：E 级项必须与官方表一致；冲突项（如 Windows `Ctrl+T`）已在 V3.0 裁决（保 Typora Table，New Tab 让位 `Ctrl+Alt+T`），本版维持；"需真机复核"项在 P1 的 keymap 真机核对任务中定案，不得单平台自行决定。

### 4.3 侧边栏

**已达标**：四模式信息架构（Files=Tree/List、Outline、Search）✅；hover 收敛 ✅；根路径单行 ✅；过滤/排序/最近/固定默认折叠 ✅；大纲 filter 常驻 ✅；全局搜索 streaming ✅（`App.tsx:1800-1804`）；跳转 ✅。

**缺陷（G4-SIDE-\*）**

| ID | 缺陷 | 定位 |
|---|---|---|
| G4-SIDE-01 | File List 键盘导航只有 ↑↓/Enter，无 ←→ / F2 / Delete / PageUp/PageDown | `App.tsx:2004-2011` |
| G4-SIDE-02 | **Outline 与 Search 完全没有键盘导航**（onKeyDown 仅 files 分支） | `App.tsx:3786` |
| G4-SIDE-03 | File List / Outline / Search **无右键菜单**（仅 Tree 有 10 项） | `App.tsx:1949-1972` |
| G4-SIDE-04 | 无目录 watcher（同 G4-SHELL-02），外部变更需手动刷新 | `watcher.rs:60` |
| G4-SIDE-05 | 四模式全无虚拟化（同 G4-SHELL-03） | 见 §4.1 |
| G4-SIDE-06 | 无常驻 filter 输入框（只能靠 `⋯` 里的 glob），无常驻新建文件/文件夹按钮 | `App.tsx:3799-3858` |
| G4-SIDE-07 | 无跨应用拖拽（Finder/Explorer ↔ Sidebar）的自动化验证 | 仅实现，未验 |

### 4.4 编辑体验（Live / Caret / IME / Undo）

**资产**：`packages/editor-engine` 60 个测试文件、约 631 个 `it/test` 块（CI 注释标 486，存在 skip/todo 或注释过期，需实测校正）。

**缺陷（G4-EDIT-\*）**

| ID | 缺陷 | 定位 |
|---|---|---|
| G4-EDIT-01 | **只有 Heading 与 Strong 接近 15 状态矩阵**，其余 20+ 节点仅 Happy Path | `heading.test.ts:52-295`、`format-bold.test.ts:36-188` |
| G4-EDIT-02 | **9 个模块无 IME composition guard**：Image 全家桶（widget/insert/path/ops/scan/host/input/assetConfig/engineApi）、TaskCheckbox、codeLineNumbers、codeFence、documentSearch、emoji、selectionCommands、smartPunctuation、table/commands、table/parser | guard 已覆盖 21 处，见 `src/composition.ts` 调用点清单 |
| G4-EDIT-03 | **Undo 无按用户动作分组**，完全依赖 CM `history()`（一次 dispatch = 一个 undo），`undo.test.ts` 仅 3 例 | `test/undo.test.ts` |
| G4-EDIT-04 | Table 100×30 大表**零测试覆盖**（只存在于文档） | 无 |
| G4-EDIT-05 | Clipboard 跨应用**零自动化**，仅有手动模板 | `tests/qualification/clipboard-copy-cross-app.md` |
| G4-EDIT-06 | Image 上传（PicGo/PicList/Custom Adapter）无真实链路测试 | `image-ops.test.ts:207,216` 仅计划级断言 |
| G4-EDIT-07 | Source ↔ Live 往返的 scroll/caret/selection 保持缺少跨模式联合测试 | `source-mode-api.test.ts` 仅 1 例 |

### 4.5 三平台与验收门禁

| 平台 | 当前能力 | 判定 |
|---|---|---|
| macOS | 本机真实桌面 + 同机 Typora 1.14.9 对照；Journey 1/2/4/7/8/9/10/15 双端 16 项全 PASS；10MB 保存 108ms vs Typora 150ms | **最接近 PASS-E** |
| Linux | `runtime-qualification.yml` 的 `linux-runtime` job 装 Xvfb + fcitx5 + xdotool，**真实跑 IME 矩阵**（`ime-matrix-linux.mjs --im=fcitx5 --driver=xdotool`，fail-fast） | 真机输入链路已通 |
| Windows | `windows-runtime` job 硬 Gate 只有 `cargo test source_fidelity_open_no_edit_save_byte_identical`；SendKeys 段**明确降级为诊断**（`interactive_input_skipped=true` 不算失败），仅保留启动存活 + 10MB 存活 | **仍是构建/启动级，体验 Gate 未关** |

已知证据缺口（`docs/qualification/real-desktop-execution-bundle.md:84-90`）：30 个核心任务两轮交叉计时、UX Score、主观评分、迁移盲测**均未做**；`tests/qualification/README.md` Pass/Fail 表已过期（最后更新 2026-08-25，大量 ⛔ 未回填）。

---

## 5. 最终产品与交互总合同

### 5.1 默认状态

| 项目 | 最终默认 | 现状 |
|---|---|---|
| 编辑模式 | Live Mode | ✅ |
| Sidebar | 首次启动隐藏；用户操作后记忆 | ✅ |
| Status Bar | 默认隐藏；可设置显示 | ✅ |
| Line Numbers | Live 默认关；Source 可独立配置 | ✅ |
| 单 Tab 栏 | 自动隐藏 | ✅ |
| 多 Tab 栏 | 32–36px、低对比、Close 仅 hover | ✅ 需补右键与 overflow |
| Formatting Toolbar | Selection 后出现；IME 时不出现 | 待验 |
| Command Palette / Quick Open / Slash | 浮层，不常驻 | ✅ |
| Reader | 不在 Titlebar 常驻，View / Palette 进入 | ✅ |
| AI | 默认关闭且无常驻入口 | ✅ |
| Language | zh-CN | ✅ |
| Writing Width | 820px（680/820/980/Auto） | ✅ |
| Body | 16px / line-height 1.65 | ⚠ 变量失效（G4-SHELL-01） |
| Top Padding / Bottom Space | 56px / ≥30vh | ⚠ 未定义（G4-SHELL-08） |

### 5.2 布局不变量（不得违反）

1. Sidebar 开关不改变 Writing Width；
2. Sidebar 展开/收起不导致 Caret 跳跃或横向闪烁；
3. Titlebar、Tabs、Status Bar 不抢占正文视觉；
4. Editor Surface 无永久 Formatting Ribbon；
5. 任何模式切换保持 document、caret、selection、scroll；
6. Dialog、Toast、Toolbar 不覆盖 IME candidate window；
7. 900×600 仍可完成打开、编辑、保存、搜索；
8. 200% Zoom 不截断关键按钮；
9. 三平台共享产品语义，系统装饰遵循平台习惯；
10. 原创品牌视觉，不复制 Typora 专有资源。

---

## 6. 六维深度对标矩阵

### 6.1 维度 A — 功能（Document / File）

| 能力 | 合同 | 等级 |
|---|---|---|
| 新建 / 新建窗口 / 新建标签页 | 三平台统一 Tabs，`Ctrl+N` / `Ctrl+Shift+N` 必须存在 | E（Win 新建窗口缺失） |
| 打开 / 打开文件夹 / 打开最近 / Quick Open | 打开即 Live，同步挂载父目录，中文模糊匹配不更差 | E / B |
| 保存 / 另存为 / 保存全部 / 从磁盘重新加载 | Atomic Save + Fidelity；Dirty 时禁止静默覆盖 | B |
| Rename / Move / Duplicate / Delete | watcher、tab、recent 同步；Trash 优先 + 可撤销 | E / B |
| 文件信息 / 打开文件位置 / 导入 / 导出 / Page Setup / 打印 | 中文统计更完整；Page Setup 补齐 | E |
| 快照 / 恢复 | 不得插入 Typora 高频菜单组，放 File Info 或 Advanced 子菜单 | B |

### 6.2 维度 B — 编辑体验

| 能力 | 合同 | 等级 |
|---|---|---|
| Live Markdown | 15 状态矩阵覆盖全部节点；marker reveal 不改变 document position | E |
| Caret / Selection | 鼠标单击/双击/三击/拖拽选择平台化；Home/End/词移动平台化 | E |
| IME | Composition Guard 覆盖**所有**节点；20 分钟连续写作 0 丢字 | B |
| Undo / Redo | **按用户动作分组**，一个 GUI 动作一个 Undo | E |
| Auto Pair / 智能标点 / 拼写检查 | 默认状态与 Typora 一致，代码与 URL 排除 | E |
| Focus / Typewriter / Reader | F8 / F9；打字时 Chrome 不喧宾夺主；Reader 支持搜索/大纲/Zoom/Lightbox/Print | E / B |
| Slash / Palette | 行首触发、可关闭、不抢普通 `/` 输入与 IME | B |
| 字数统计 | CJK/英文/字符/段落/阅读时长，选择与全文 | E |

### 6.3 维度 C — 侧边栏

见 §8 完整合同。核心：**四模式、默认低密度、键盘-only 全通、10k 文件不冻结、目录 watcher 实时**。

### 6.4 维度 D — 特点（Typora 五层体验）

见 §3.1。核心判据：单一编辑表面、低干扰壳、结构化 GUI、文件型工作流、可预测输出，五层同时成立才叫"特点一致"。

### 6.5 维度 E — 桌面 UI 与布局

见 §9 完整合同。核心：**默认第一视觉是文档；布局不变量 10 条不违反；三平台视觉 Golden 防回退。**

### 6.6 维度 F — 菜单

见 §7 完整合同。核心：**顶层顺序已达标，P1 收口条目顺序、separator、accel、checkState、单一真源、快捷键纠偏。**

---

## 7. 菜单、Command 与 Shortcut 最终合同

### 7.1 顶层菜单（已达标，维持）

```text
macOS
Mellow | 文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 窗口 | 帮助

Windows / Linux
文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 帮助
```

### 7.2 文件菜单目标顺序（修正 G4-MENU-05）

1. 新建（`Ctrl/Cmd+N`）　2. 新建窗口（`Ctrl/Cmd+Shift+N`）　3. 新建标签页（`Cmd+T` / `Ctrl+Alt+T`）
4. ──　5. 打开　6. 打开最近　7. 快速打开　8. 打开文件夹
9. ──　10. 文件信息　11. 在文档列表中显示　12. 在文件树中显示　13. 打开文件位置
14. ──　15. 重命名/移动　16. 删除
17. ──　18. 关闭　19. 全部关闭
20. ──　21. 保存　22. 另存为　23. 保存全部　24. 从磁盘重新加载
25. ──　26. 导入　27. 导出　28. 页面设置　29. 打印

> 快照 / 恢复入口不得插入上述高频组，移至"文件信息"或"高级"。

### 7.3 各菜单覆盖要求（沿用 V3.0 §9.3–§9.8，此处不重复）

编辑：Undo/Redo、Cut/Copy/Copy Image/Paste、复制为纯文本/Markdown/HTML 代码/无主题、Paste Plain/Match Style、选择子菜单、移动行、删除范围、Math Tools、EOL、空白与换行、替换与智能标点、拼写、查找替换。

段落：H1–H6、正文、升降级、Table 全量子菜单、Math Block、Code Fence、Code Tools、GitHub Alerts、Quote、有序/无序/任务列表、任务状态、列表缩进、上下插入段落、Reference Link、Footnote、Horizontal Rule、TOC、YAML、Mermaid（作为 Code Fence 模板）。

格式：Bold/Italic/Underline/Inline Code、Strike/Comment、Hyperlink、Link Operations、Image 子菜单全量、Clear Format；Highlight/Sup/Sub 作为增强项以 separator 分隔。

显示：Tab Bar/All Tabs、Source Mode、Reader、Focus、Typewriter、Toolbar、Toggle Sidebar、Outline/File List/File Tree/Search、Word Count、Zoom、Always on Top、Fullscreen；Command Palette 放独立增强分组。

主题：从 Theme Registry 自动生成；切换不重建 EditorView、不丢 Caret/Selection/Undo；Open Theme Folder / User CSS 放 separator 后。

窗口/帮助：macOS 用系统预定义项；Help 含 What's New、Quick Start、Markdown Reference、Pandoc、Custom Themes、Images、Acknowledgements、Changelog、Privacy、Website、Feedback；Mellow Cheatsheet 作为增强项。

### 7.4 Command 单一真源（P1 核心交付）

```text
packages/commands
└── CommandDescriptor
    ├── id / titleKey / category
    ├── menuPath / menuOrder / separatorBefore
    ├── shortcut.mac / shortcut.win / shortcut.linux
    ├── checkState / enabledWhen
    └── handler contract
          ↓
    React Registry / Palette / Cheatsheet / Settings / Context Menu
          ↓
    Serializable NativeMenuSpec
          ↓
    apps/desktop Native Menu Adapter（Rust 只做 materialization）
```

硬规则：

1. Command ID 只定义一次；
2. 快捷键只定义一次；
3. 菜单顺序由 **schema 测试**校验（条目顺序、separator、accel、checkState、文案）；
4. 主题菜单从 Theme Registry 派生；
5. Menu Check State 与 Settings Store 同一真源；
6. Rust 只负责 materialization 与 OS predefined item；
7. Menu click 与 keyboard 必须进入同一 Command Handler；
8. **禁止 native accelerator + JS keydown 双触发**（G4-MENU-08）；
9. zh-CN / en-US menu dump 都进入 Golden；
10. 三平台各自生成预期顶层结构；
11. **Context Menu 必须走 `dispatchCommand`**（G4-MENU-07）。

---

## 8. Sidebar 最终深度合同

### 8.1 信息架构（禁止变更）

```text
Files ─┬─ File Tree
       └─ File List
Outline
Search
```

禁止引入 Activity Bar、右侧永久 Inspector 或插件面板。

### 8.2 默认视觉层级

1. 顶部只显示当前模式名称 + 最多 2–3 个轻图标；
2. Files 模式默认进入 Tree 或上次模式；
3. Tree/List 切换、Open Folder、Refresh、Sort、Filter 收进 hover/action menu（✅ 已实现）；
4. Root 路径单行截断显示（✅ 已实现）；
5. Recent/Pinned 默认折叠（✅ 已实现）；
6. 高级 glob 不常驻（✅ 已实现）；
7. 选中态低对比，keyboard focus 清晰。

### 8.3 File Tree 合同

| 维度 | 合同 | 现状 |
|---|---|---|
| Hierarchy | disclosure、folder/file icon、缩进清晰 | ✅ |
| Filter | hidden / non-Markdown / custom include-exclude | ✅（折叠态） |
| Sort | natural / name / modified / created / asc-desc / folder grouping | ✅ 4 种 |
| **Watch** | **外部新增、删除、移动自动更新** | ❌ G4-SIDE-04 |
| Keyboard | ↑↓ / ←→ / Enter / F2 / Delete / Home / End | ✅ |
| Mouse | single open、double 稳定、drag move | ✅ |
| Cross-drop | Finder / Explorer ↔ Sidebar | 未验 |
| Editor Drop | Sidebar 文件拖到正文生成相对 Markdown link | ✅ |
| Context | 新建文件/文件夹、打开、新窗口、重命名、复制、移动、Trash、复制路径、Reveal、Undo | ✅ 10 项 |
| Safety | Trash 优先、失败不丢状态、Undo 有反馈 | 待验 |
| **Scale** | **10k 文件不冻结；扫描可取消** | ❌ G4-SIDE-05 |

### 8.4 File List 合同

Item（title/filename/modified/summary）、compact 默认、current/recursive、folder grouping、↑↓/Enter/PageUp/PageDown（❌ 部分）、current/selected/hover/missing、**右键菜单（❌ 缺）**、**虚拟化（❌ 缺）**。

### 8.5 Outline 合同

H1–H6 hierarchy、当前 Heading 实时高亮、click/Enter 跳转、keyword filter（✅）、collapse/expand/flat、auto-number、Context（Highlight Current / Collapse All / Expand All / Flat-Tree）、Scroll 不剧烈滚动、与 PDF/HTML Outline 语义一致。
**缺口：❌ 键盘导航、❌ 右键菜单。**

### 8.6 Global Search 合同

顶部固定输入、Enter 执行、Aa/Whole/Regex 轻图标、advanced 折叠、file grouping + 1–2 行 context、Rust 流式增量可取消（✅）、jump 打开并定位、Up/Down/Enter/Esc（❌ 缺）、invalid regex 就地提示、scope = 父目录/workspace root。
**缺口：❌ 键盘导航。**

### 8.7 响应式

| 窗口宽度 | 行为 |
|---|---|
| ≥ 1200 | 200–480px 可拖动 |
| 900–1199 | 保持用户宽度，限制正文最小可用区域 |
| < 900 | 自动隐藏 Sidebar（✅ `App.tsx:263-266`） |
| 200% Zoom | 控件不横向溢出，高级项进菜单 |

---

## 9. 桌面 UI 与布局最终合同

### 9.1 Titlebar / Tabs

| 项 | 合同 | 现状 |
|---|---|---|
| 高度 | 32–36px（Win/Linux 自定义区 ≤44px） | ✅ 36px |
| macOS | 原生 Traffic Lights、拖拽区、Fullscreen、系统 Menu Bar | ✅ |
| Windows | Snap-compatible controls，不伪造 chrome | 待真机 |
| Linux | GNOME/KDE 可用，尊重系统字体 | 待真机 |
| 单 Tab | 自动隐藏 | ✅ |
| 多 Tab | 轻背景、无强 accent line、Close 仅 hover | ✅ |
| Dirty | 低干扰且不只依赖颜色 | `●` + class |
| **Overflow** | **滚动到 active + compact，不挤压窗口控件** | ❌ G4-SHELL-04 |
| Drag | reorder | ✅ |
| **Context** | **关闭 / 关闭其他 / 关闭右侧 / 重新打开** | ❌ G4-SHELL-05 |
| Path | Tooltip 显示，不常驻 | ✅ |
| Sidebar Toggle | 轻图标，无永久快捷键胶囊 | ✅ |

### 9.2 Editor Surface

Writing Width 680/820/980/Auto，默认 820；Body 16px；**Line Height 1.65（必须在 CSS 侧真正消费）**；Top Padding 56px；Bottom Space ≥30vh；marker reveal 不改变 document position；中英文 Selection 在 Light/Dark 下清晰；不使用大面积高饱和品牌色；不对 Caret、marker、table resize 做动画。

### 9.3 Status Bar

默认隐藏。开启后可显示字数、行:列、Markdown、Encoding、EOL、Zoom、保存/错误状态。高度 22–26px（✅ 24px）。可单项配置 P1。不作为高频命令唯一入口。

### 9.4 Welcome / Empty

Welcome 只允许：Mellow 标题 + 新建文档 / 打开文件 / 打开文件夹 + 最近使用。**无营销、账号、新闻、AI Prompt、插画大图**（✅ `Welcome.tsx:18-51` 合规）。

### 9.5 Settings

一级导航固定 11 类：通用 / 编辑器 / Markdown / 文件 / 图片 / 外观 / 导出 / 快捷键 / 扩展 / 高级 / AI（仅扩展启用后）。
现状 10/11 对齐，差异：`file` id 为单数、多出 `updater`、AI 条件追加、**快捷键只读**（需支持可编辑）。

### 9.6 Dialog / Toast / Recovery

保存/打开用原生对话框；未保存关闭明确文档名 + Save/Don't Save/Cancel；外部冲突 Compare/Reload Disk/Keep Local；Recovery Recover/Compare/Ignore；文件操作 Toast + Undo；Error 说明对象、原因、可恢复动作；Update 不阻挡写作；Permission 只在动作需要时申请。

---

## 10. Context Menu 与临时 UI

| 场景 | 必备项 | 现状 |
|---|---|---|
| 普通文本 | Cut/Copy/Paste、Paragraph/Heading、Bold/Italic/Strike/Code/Link、Copy as Markdown/Plain、Spelling；AI 仅在扩展启用且有 Selection 时置于末尾 | ✅ |
| Link | Open / Copy URL / Edit / Remove；本地文件 Reveal / New Tab | ✅ |
| Image | Open/Reveal、Copy Image/Copy Path、Resize、Markdown↔HTML、Rename/Move/Copy、Upload、Delete（二次确认 + Trash） | ✅ |
| Table | 增删移动行列、对齐、Copy Table、Tidy、Delete Table | ✅ |
| **Code / Math / Mermaid** | **Copy Source / Copy Rendered / Language / Refresh / Export SVG-PNG / Error 详情不破坏源文本** | ❌ G4-MENU-06 |
| Selection Toolbar | `H1 H2 H3 \| B I S Code \| Link \| Quote \| List`；仅非空 Selection 后出现、不遮 Selection 中心与下一行、IME 时隐藏、Esc 关闭、命令后 Editor 重获焦点、一个命令一个 Undo | ✅ 有测试（34 例） |

---

## 11. Better 与 Deliberate Difference 边界

### 11.1 必须保留的 Better

| 能力 | Better 原因 | 不得破坏 |
|---|---|---|
| Crash Recovery Compare | 比简单恢复更安全 | 启动速度、隐私 |
| External Conflict Compare | 防静默覆盖 | 保存主流程 |
| Source Fidelity | Git 友好 | GUI 编辑效率 |
| Large File Mode | Typora >10MB 可能拒绝 | 普通文档体验 |
| Reader Mode | 高质量阅读 | 默认仍为 Live |
| Command Palette / Slash | 发现性与高效插入 | 原菜单入口、普通 `/` 输入与 IME |
| 三平台统一 Tabs | 一致性 | Table 快捷键 |
| Extension Permissions | 开放与安全 | 核心功能不依赖插件 |

### 11.2 不进入 V1

Knowledge Graph、Backlink Database、Cloud Workspace、Account/Team Collaboration、Full Git GUI、Terminal、Browser、Permanent AI Chat Panel、AI Autonomous Agent、Online Publishing Platform、**Split Mode（2026-08-24 产品决策删除）**。

---

## 12. 实施工作包

### P0 — 基线与证据治理　✅ 已完成

`tests/parity/typora-parity-ledger.json` 32 条唯一 ID；`verify-parity-ledger.mjs` / `verify-menu-contract.mjs` / `verify-runtime-qualification-workflow.mjs` 纳入根 `pnpm test`；带日期的 qualification 报告保留为历史证据，不参与状态聚合。

---

### P1 — Menu / Command / Shortcut 单一真源 + 快捷键纠偏

**目标**：先修用户发现路径与肌肉记忆，再修视觉。

| # | 任务 | 主要模块 | 验收 |
|---|---|---|---|
| 1.1 | 定义 `CommandDescriptor`（id / titleKey / category / menuPath / menuOrder / separatorBefore / shortcut 三平台 / checkState / enabledWhen / handler） | `packages/commands/src` | 类型测试 |
| 1.2 | 把 `App.tsx:3209-3498` 的 ~205 条内联命令迁出为 descriptor 表 | `apps/desktop/src` | 命令数不减、ID 不变 |
| 1.3 | 实现 `toNativeMenuSpec()`，Rust `menu.rs` 降为平台 Adapter | `packages/commands` + `src-tauri/src/menu.rs` | 单一真源 |
| 1.4 | 菜单文案迁入 i18n `menu.*` 命名空间，消灭 `MENU_LABELS` 第三套文案 | `packages/i18n`、`menu.rs:57-275` | zh/en 强制对齐 |
| 1.5 | 主题菜单从 Theme Registry 派生 | `menu.rs:706`、`packages/themes` | 新增主题菜单自动出现 |
| 1.6 | Cheatsheet 全量从 registry 派生 | `apps/desktop/src/Cheatsheet.tsx` | 无静态串 |
| 1.7 | Context Menu 改走 `dispatchCommand`，补齐 code/math/mermaid 分支 | `editor-engine/src/contextMenu.ts`、`App.tsx:2660-2698` | 复用 command id |
| 1.8 | **快捷键纠偏**：按 §4.2 偏离表修正 Win/Linux 9 处；补齐 `Ctrl+N`、`Ctrl+Shift+N` | `App.tsx` + `menu.rs` | 三平台 keymap test |
| 1.9 | 文件菜单按 §7.2 补齐条目与顺序（含 Page Setup、在树/列表中显示） | `menu.rs:418-429` | schema test |
| 1.10 | 菜单护栏升级：正则 → schema diff（条目顺序/separator/accel/checkState/三平台结构） | `tests/parity/verify-menu-contract.mjs` | 三平台 × 双语 |
| 1.11 | 修复 Win/Linux 无原生 accelerator 与潜在双触发 | `menu.rs:309-311` | 单次执行断言 |
| 1.12 | 生成 Typora 1.14.9 zh/en AX menu dump 并纳入 Golden | `tests/benchmark/fixtures/` | 语义 diff |
| 1.13 | 冲突项真机复核（缩进方向、macOS 全屏）并定案 | 三平台 | keymap 证据 |

**Exit Gate**：三平台顶层与条目结构符合合同；每个 Menu Item 有 Command ID；Theme/Settings/Menu 无漂移；keyboard 与 menu click 各执行一次；zh-CN / en-US dump 通过；Win/Linux 快捷键与官方表逐键一致（或记录为 D 并说明）。

---

### P2 — Desktop Shell 与默认布局收敛

| # | 任务 | 定位 | 验收 |
|---|---|---|---|
| 2.1 | **修复 `--mellow-line-height` 无人消费** | `styles.css:870` 附近 | 设置改行高即时生效 |
| 2.2 | 定义 Top Padding 56px / Bottom Space ≥30vh，跨主题一致 | `styles.css:874-878` | Golden |
| 2.3 | Tab overflow：滚动到 active + compact | `Tabbar.tsx`、`styles.css:76-82` | 20 Tab 不破版 |
| 2.4 | Tab 右键菜单（关闭/关闭其他/关闭右侧/重新打开） | `Tabbar.tsx` | e2e |
| 2.5 | Focus / Typewriter / Slash / Reader 状态指示（不常驻，轻量） | `App.tsx:1025-1072` | 可见且低干扰 |
| 2.6 | Settings：快捷键可编辑；`file` id 归一；`updater` 归位 | `packages/settings/src/index.ts` | 搜索可达 |
| 2.7 | 补齐 900×600 / 1200×800 / 1440×900 / 200% Zoom 视觉 Golden | 新建 `tests/visual/` | 防回退 |
| 2.8 | 三平台 window chrome 截图归档 | `tests/benchmark/screenshots/` | 人工评审 |

**Exit Gate**：UI Review 不再判定为 VS Code / Obsidian 化；常见任务入口不增步；Screenshot Golden 通过；Keyboard / Focus / Reduced Motion 通过。

---

### P3 — Sidebar 深度对标

| # | 任务 | 定位 |
|---|---|---|
| 3.1 | 目录 watcher（`watch_dir`）+ 增量刷新 + 取消 | `src-tauri/src/watcher.rs:60` |
| 3.2 | 四模式虚拟化（10k 文件 / 1000 headings / 1 万结果） | `FileTree.tsx:53`、`FileList.tsx:20`、`OutlineList.tsx:19`、`SearchResultsList.tsx:15` |
| 3.3 | Outline / Search 键盘导航（↑↓/Enter/Esc/Home/End） | `App.tsx:3786` |
| 3.4 | File List 补齐 ←→/F2/Delete/PageUp/PageDown | `App.tsx:2004-2011` |
| 3.5 | File List / Outline / Search 右键菜单 | 参照 `App.tsx:1949` |
| 3.6 | 常驻 filter 输入框 + 新建文件/文件夹轻按钮 | `App.tsx:3799-3858` |
| 3.7 | 跨应用拖拽（Finder/Explorer/DE ↔ Sidebar）自动化 | 新增 e2e |
| 3.8 | Sidebar resize / 记忆 / 窄化 / 200% Zoom | — |
| 3.9 | 四模式 Screenshot Golden | 新建 |
| 3.10 | Sidebar 12 个计时微任务 | `tests/benchmark/` |

**Exit Gate**：Sidebar 默认只展示当前任务；四模式 keyboard-only 全通；10k/1000/1万 不阻塞；三平台真机通过。

---

### P4 — Live Editing 与编辑手感

| # | 任务 | 定位 |
|---|---|---|
| 4.1 | 为 §6.2 全部节点补 15 状态矩阵（当前仅 Heading / Strong） | `packages/editor-engine/test/` |
| 4.2 | **补齐 9 个模块 IME composition guard**（Image 全家桶、TaskCheckbox、codeLineNumbers、codeFence、documentSearch、emoji、selectionCommands、smartPunctuation、table commands/parser） | 参照 `src/composition.ts` 21 处已覆盖点 |
| 4.3 | **Undo 按用户动作分组**（不依赖 transaction 计数） | `test/undo.test.ts` 扩到 ≥ 20 例 |
| 4.4 | Enter / Backspace / Delete / Home / End / 词移动平台化 | editor-engine |
| 4.5 | 鼠标单击/双击/三击/拖拽选择矩阵 | editor-engine |
| 4.6 | nested inline formatting | editor-engine |
| 4.7 | invalid / partial Markdown fallback source | editor-engine |
| 4.8 | Source ↔ Live 往返保持 scroll/caret/selection | `source-mode-api.test.ts` |
| 4.9 | Focus / Typewriter 与 marker reveal 联合测试 | focusMode/typewriterMode |
| 4.10 | Floating Toolbar 与 IME / Selection 联合测试 | selectionToolbar |
| 4.11 | 每平台真实输入法连续 20 分钟写作 | 三平台 |
| 4.12 | 同机 Typora / Mellow 输入延迟与任务时间对照 | `tests/benchmark/` |

**Exit Gate**：Live Editing ≥ 24/25；Caret/IME/Undo = 15/15；IME corruption = 0；Typing P95 达 PRD；无 Source Fidelity 回退。

---

### P5 — Table / Image / Clipboard / File Workflow

| 域 | 任务 | 验收 |
|---|---|---|
| Table | 22 场景全量；**100×30 大表测试（当前 0）**；cell IME；one action one Undo；minimal diff | 不慢于 Typora +5% |
| Image | 24+ 场景；三平台路径；多图 drag/paste；move/copy/upload；**PicGo/PicList/Custom Adapter 真实链路**；document rename + asset folder；failure rollback | 0 loss |
| Clipboard | **7 个目标应用 cross-app 自动化（当前 0）**；plain/html/rtf/markdown；rich paste / TSV / URL / image；Source Mode plain-first | 矩阵全绿 |
| File | 打开父目录；watcher；rename/move/trash/undo；外部 dirty 冲突；recovery compare；network/cloud/disk-full corpus | File Safety 5/5 |

**Exit Gate**：Source Fidelity 0 diff；File Safety 5/5；Data loss = 0。

---

### P6 — Settings / Theme / Export / Better

Settings 双向同步 → Theme Registry / User CSS / Light-Dark → PDF / HTML / Image / Pandoc / Previous Export → CJK+Math+Mermaid+Table+Footnote+TOC 导出 corpus → Reader/Palette/Slash 默认隐藏与可发现性 → Recovery/Conflict Compare → Large File Mode → Extension permission 与 Safe Mode → AI 默认关闭验证。

**Exit Gate**：Typora 用户能在相同一级设置中找到关键配置；PDF/HTML 日常生产可用；Better 能力不改变默认心智；导出三平台视觉高度一致。

---

### P7 — 三平台 Adapter 与 Native Enhancement

| 平台 | 任务 |
|---|---|
| macOS | Traffic Lights / Menu Bar / Services / Share；`Cmd+,` / `Cmd+W` / Native Fullscreen；Quick Look；Signed & Notarized DMG |
| Windows | Snap / Window Controls；MSI / NSIS / Portable；File Association / Open With / Explorer；**微软拼音 + 搜狗真实交互矩阵（当前仅诊断级）**；JumpList P1 |
| Linux | GNOME / KDE；Portal / Native File Dialog；AppImage / deb / rpm；MIME / XDG；fcitx5 / ibus（已通，需扩到 Keyboard/Caret/Clipboard） |

**Exit Gate**：核心 Editor 无平台分支；Adapter contract tests 通过；安装/卸载/更新矩阵通过；ADR-0019 trigger 未触发（若触发则停止并新增 ADR）。

---

### P8 — 最终验收

1. 三平台 Golden Journeys；
2. **30 个核心计时任务，两轮交叉顺序**（当前 0）；
3. **UX Score 100 分评分表**（当前空）；
4. Typora 用户盲测；
5. Accessibility keyboard + screen reader baseline；
6. Performance 同机对照；
7. Source Fidelity / File Safety / Export Corpus；
8. Menu AX dump / Screenshot Golden；
9. Release Candidate audit；
10. 回填 `tests/qualification/README.md` 过期门禁表。

**Exit Gate**：

- Total UX Score ≥ 92；
- Live Editing ≥ 24/25；Caret/IME/Undo = 15/15；File Safety = 5/5；
- ≥ 27/30 任务 ≤ Typora +5%；关键任务无一慢 >15%；
- IME corruption = 0；Data loss = 0；Source Fidelity = 0 diff；
- Windows / macOS / Linux 全 PASS-E。

---

## 13. 依赖与实施顺序

```text
P0 ✅ → P1 Menu/Command/Shortcut ──┬──→ P4 Live Editing
          ↓                        │
       P2 Desktop Shell            │
          ↓                        │
       P3 Sidebar ─────────────────┘
          ↓
       P5 Table/Image/Clipboard/File
          ↓
       P6 Settings/Theme/Export/Better
          ↓
       P7 Platform Adapters
          ↓
       P8 Final QA
```

**禁止**：

- Menu 未统一前继续增加入口；
- Desktop Shell 未收敛前加入常驻增强面板；
- Windows / Linux 真机未通过就宣称三平台等价；
- 用测试数量替代 Experience Contract；
- 顺手重构无关模块；
- 修改 vendored CoreEditor；
- 直接改写 Accepted ADR。

---

## 14. 测试与证据体系

### 14.1 自动化层

| 层 | 内容 |
|---|---|
| Unit | parser、commands、table、image path、clipboard、settings |
| **Contract** | **CommandDescriptor、Host API、Menu Schema（升级为 schema diff）、Adapter** |
| Editor Integration | marker、caret、selection、IME event、undo、mode switch |
| Rust | save、watcher、recovery、search、export、permission |
| Desktop E2E | file、sidebar、menu、settings、export、dialog |
| **Visual Golden** | **shell、sidebar 四模式、tabs、settings、theme、dialog（当前缺失，P2 补齐）** |
| Corpus | Source Fidelity、File Safety、Export、Typora Markdown |

### 14.2 真机矩阵

macOS 本机完成 Typora 1.14.9 与 Mellow 同机对照、真实 IME 与视觉验收；Windows / Linux 在 GitHub Actions 托管桌面环境完成构建、启动、输入、读回与证据归档。**CI 只能在真实桌面输入链路、文件读回与 Undo 断言全部成立时计为通过。**

| 平台 | 必测 |
|---|---|
| Windows 10/11 | 微软拼音、搜狗、WebView2、MSI/NSIS/Portable、Clipboard、Print、**真实交互矩阵（当前仅诊断）** |
| macOS | 拼音、五笔、WKWebView、Menu/Share/Quick Look、DMG |
| Ubuntu / Fedora | fcitx5、ibus、WebKitGTK、GNOME/KDE、AppImage/deb/rpm、**Keyboard/Caret/Clipboard 补齐** |

### 14.3 视觉 Golden（每平台至少）

首次启动 / 单文档 Live / 多 Tab / File Tree / File List / Outline / Search / Settings / Selection Toolbar / Table Toolbar / Reader / Light-Dark / 900×600 / 200% Zoom。

### 14.4 Menu Golden

Typora 1.14.9 zh-CN / en-US（规范 Golden）；Mellow macOS / Windows / Linux × zh-CN / en-US；比较 top-level、item path、order、separator、shortcut、check/enabled state；OS predefined 项允许平台差异。**当前 `typora-menu-dump.txt` 为 gitignore 生成物，P1 必须固化入库。**

### 14.5 30 个核心计时任务

沿用 `docs/qualification/ux-score-gate-template.md` 的 30 项，观测字段：entry point / steps / time / errors / hesitation / shortcut success / undo count / caret jump / source diff / subjective complexity / 截图视频证据。每任务 Typora / Mellow 各两轮，交换顺序。

---

## 15. Release Blockers

任一存在即禁止发布：

- IME 丢字、重复、提前提交；
- Caret / Selection blocker；
- Undo semantic corruption；
- Save / Recovery / External Conflict 数据损坏；
- Table data loss；Image path/file loss；
- Source Fidelity fail；10MB 不可编辑；PDF CJK garble；
- Clipboard P0 blocker；
- **菜单高频入口缺失或快捷键冲突**（当前 Win/Linux 9 处偏离即属此类）；
- Windows / Linux 真机 Journey 未通过；
- UX Score < 92；Live Editing < 24/25；Caret/IME/Undo < 15/15；File Safety < 5/5；
- 未完成 Typora 用户迁移盲测。

---

## 16. 完成定义

```text
Functional
+ Typora Experience Contract + Correct Entry Point + Default State
+ Windows + macOS + Linux + zh-CN + en-US
+ Keyboard + Mouse + Accessibility + IME + Caret/Selection + Undo/Redo
+ Source Fidelity + Performance Budget + Automated Tests + Manual Golden Journey
= PASS-E
```

任何一项缺失，状态只能是 IMPL / AUTO / platform-partial，**不得写"已完成对标"**。

### 16.1 当前看板（Ledger 32 项）

| 状态 | 数量 | 说明 |
|---|---|---|
| PASS-E | **0** | 尚无 |
| NOT_TESTED | 1 | `P0-QA-001` UX Score 与 30 任务 |
| IMPL | 1 | `P0-PLATFORM-001` 三平台 Runtime 门禁 |
| MAC | 2 | `P0-EDITOR-004` IME/Undo、`P0-PERF-001` 性能 |
| AUTO | 28 | 其余全部 |

---

## 17. 决策记录

### 17.1 已确认（2026-09-01）

| # | 决策点 | **决议** | 落地位置 |
|---|---|---|---|
| **D1** | Win/Linux 9 处快捷键偏离 | **全改 Typora 官方键位**。代码块 `Ctrl+Shift+K`、数学块 `Ctrl+Shift+M`、引用 `Ctrl+Shift+Q`、有序列表 `Ctrl+Shift+[`、无序列表 `Ctrl+Shift+]`、图片 `Ctrl+Shift+I`、删除线 `Alt+Shift+5`、行内代码 `Ctrl+Shift+\``；补齐 `Ctrl+N`、`Ctrl+Shift+N`。不保留"经典键位"兼容预设 | P1 任务 1.8 |
| **D2** | 缩进方向（官方表 `Ctrl+[`=Indent，与直觉相反） | **先真机复核 Typora 1.14.9 实机行为再定案**：若与官方表一致则照抄；若官方表有误则以实机为准并记为 D | P1 任务 1.13 |
| **D5** | Windows 真机交互验收 | **接入 Windows self-hosted runner（物理机或常驻 VM）**，跑微软拼音、搜狗、剪贴板、打印的真实交互矩阵，替换当前诊断级 SendKeys 段；作为 P7 前置，需提供机器 | P7 |
| **D7** | 实施期功能冻结 | **冻结至 P8 全部通过**。P1–P8 期间只做对标收敛与缺陷修复，不新增 Feature | 全局 |

### 17.2 决策点状态（2026-09-03 复核更新）

| # | 决策点 | 状态 |
|---|---|---|
| D3 | P1 是否包含"Win/Linux 原生 accelerator 落地" | ✅ **已随 P1 单一真源落地**：`menuSchema` `shortcut` 三平台字段驱动，`menu.rs` `syncNativeMenu` 物化（含平台过滤与平台 accelerator），`verify-menu-contract` 护栏断言 |
| D4 | 视觉 Golden 采用像素 diff 还是关键区域容差截图 | ✅ **已落地**：关键区域契约点采样 + `layout-golden.json` 基准 + 容差（`tests/parity/verify-visual-golden.mjs` ①-⑤） |
| D6 | 是否新增 ADR 记录"菜单单一真源" | ✅ **已新增并经用户确认 Accepted（2026-09-03）** `docs/adr/ADR-0023-menu-single-source-menuschema.md`（以实际机制 `menuSchema` 命名，不动已有 ADR） |
| D8 | Windows self-hosted runner 的机器来源与安全基线 | ⏸ **暂缓（2026-09-03 用户确认）**：继续使用 GitHub hosted runner（三平台 CI 已全绿，够用于现有验证矩阵）；机器到位后再接入 |
| D9 | 9 处键位改后，Cheatsheet 与 i18n 快捷键提示是否同步 | ✅ **已落地**：Cheatsheet 从 Command Registry（menuSchema 派生）读取当前平台键位，无手工维护 |

> **D7 解冻记录（2026-09-03 用户裁决）**：P1 观察项 **Windows JumpList** 与 **broken local link error indicator** 两项经用户确认纳入实施（D7 单项解冻，其余新功能继续冻结至 P8 真机 Gate 通过）。Pandoc / Previous Export / Image Export 经复核确认为已实现（见 `tests/qualification/README.md` 2026-09-03 纠正）。

### 17.3 D10 — Windows 一体化自绘标题栏（2026-09-04 用户确认"评估并实施"）

| 项 | 结论 |
|---|---|
| 决议 | **Windows**：`decorations(false)` + 应用内 36px titlebar 承担拖拽与窗口控制按钮（最小化/最大化/关闭，非 macOS Tauri 环境显示，关闭键 hover `#e81123`）；边缘 resize 与拖拽由 tao undecorated hit-testing 提供。**macOS**：维持 `TitleBarStyle::Overlay`（原生 Traffic Lights）。**Linux**：维持系统装饰（undecorated 在 GNOME/KDE 下边缘 resize 兼容性风险高），记为 D 有意差异，待 Linux 真机证据再评估 |
| 落地 | `src-tauri/src/lib.rs`（`#[cfg(target_os = "windows")] decorations(false)`）、`App.tsx` titlebar-window-controls、`styles.css`、i18n `titlebar.closeWindow` |
| 与 V4 §9.1 的关系 | 原"不伪造 chrome"条款由本决议在 Windows 平台取代（用户裁决优先）；"Snap-compatible"由原生按钮 hover 行为提供，**Windows 11 Snap Layout 悬停卡片为已知限制**，归入 P7 Windows 真机矩阵验证 |
| 验证 | 本机 macOS 不可验证 Windows 行为；Windows 真机交互验证（拖拽/Snap/resize/最大化）列入 P7 真机 Gate 待办（D8 runner 到位后执行） |

---

## 18. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-24 | V3.0 | 移除 Split Mode；P0 基线治理完成 |
| 2026-09-01 | V4.0 | 基于 `2482503` 全量代码审计重写：关闭顶层菜单差距；新暴露 Win/Linux 9 处快捷键偏离、9 模块缺失 IME guard、侧边栏 watcher/虚拟化/键盘缺口、line-height 变量失效、Table 100×30 与 Clipboard 跨应用零测试、无视觉 Golden；固化 P1–P8 施工包 |
| 2026-09-01 | V4.0 | 用户确认 D1（全改 Typora 官方键位）、D5（Windows self-hosted runner）、D7（冻结新功能至 P8 通过）；D2 转真机复核后定案 |
| 2026-09-03 | V4.1 | P0-P8 自动化范围全部收口（12 包 jest 1418 例 + parity 护栏 12 个），v1.4.0 tag 发布（pre-release，ADR-0020）；§17.2 决策点复核：D3/D4/D6/D9 落地关闭（D6 新增 ADR-0023），D8 待用户提供 runner 机器；P8 剩余项全部为真机/人工 Gate |
| 2026-09-03 | V4.2 | 用户裁决（互动确认）：D6 Accepted 定级确认、D8 暂缓继续用 hosted runner、D7 单项解冻 JumpList 与 broken-link indicator 并当日实现收口（d96346c/f56abcb）；导出能力复核纠正（Pandoc/Previous Export/Image Export 早已实现）；PRD P1 功能清零；v1.4.1 tag 发布（CI 三平台全绿，Draft pre-release） |
| 2026-09-04 | V4.3 | 重审计（§4.0）：§4.1–§4.4 全部 18 项 G4 缺陷经逐项代码复核确认已随 v1.4.x 修复（含目录 watcher，初判"仍存在"系检索路径笔误，已更正）；3 项属真机 Gate（G4-SHELL-06 记 D、G4-EDIT-05/06）；新增用户确认范围——主题 Open Theme Folder / User CSS、Win/Linux 自绘标题栏纳入实施 |
| 2026-09-04 | V4.4 | 桌面对标第二轮（用户确认 C1–C6 全量 + Mermaid 导出命令 + 发版 v1.4.4）：C1 右键菜单全面对标（`ContextMenu.tsx` 子菜单体系 + engine `contextMenu.ts` 表格对齐/代码工具/数学与 Mermaid PNG 渲染导出/链接编辑/图片就地上传等 28 条新命令注册）；C2 菜单 §7.3 收口（edit.pasteMatchStyle/copyWithoutTheme/eol/trimTrailing，pasteMatchStyle 改 mac 专用修 Ctrl+Shift+V 冲突，移除 export.repeat winLinux Ctrl+E）；C3 StatusBar 单项配置 + Zoom（`mellow.statusbar.fields`）；C4 默认字体 `ui-monospace` 启动恢复修复（index.html 初始 config + host 无条件 apply）；C5 widget 15 状态矩阵 9 家族 126 用例；新增 i18n 约 60 键双语、护栏契约扩展 + 变异缺陷 12 拒绝；e2e 六项全绿（font-family-verify 就绪探针加固：要求 requestMeasure + .cm-content 在场，修冷启动竞态）。**2026-09-05 转正**：用户裁决"CI 绿即正式发布"（ADR-0020 更新），v1.4.4 经 main CI + Release Packaging 全绿后置为 Latest 正式版（prerelease=false），残余真机 Gate 转为发布后跟踪项 |

---

## 19. 最终目标

Mellow V1 的最终状态：

> Typora 用户无需学习新的基础写作方式；默认界面同样克制；菜单、快捷键、Sidebar、Table、Image、Clipboard、Search、Theme、Export 都能在预期位置完成；Live Markdown、Caret、IME、Undo 和文件安全达到正式 Gate；Reader、Recovery、Large File 和开放扩展在不增加默认复杂度的前提下提供明确优势。

在此之前只能描述为：**"以 Typora 体验为目标的 Mellow"**。
P8 全部通过后，才允许描述为：**"与 Typora 1.14.9 核心体验一致，并在安全、中文输入、大文件、阅读和跨平台一致性上更优。"**
