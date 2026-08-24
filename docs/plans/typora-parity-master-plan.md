# Mellow ↔ Typora 最终深度对标实施方案（Master Plan）

> 文档状态：**实施中：P1 Command / Menu 单一真源**（P0 基线与台账已完成；P0 体验 Gate 尚未关闭）
> 方案版本：V3.0
> 更新日期：2026-08-24
> 审计代码基线：`8bf5d1e`（Desktop `1.3.2`）
> 产品验收基线：**Typora 1.14.9（build 7785）**
> 历史参考：Typora 1.14.6（不再用于规范验收）
> 文档角色：Typora 对标工作的**唯一权威实施方案**
> 本轮边界：只冻结对标口径、目标体验、差距与施工顺序；**未经确认不进入代码实施**

---

## 0. 一页结论

Mellow 的目标不是“具备与 Typora 类似的功能”，而是：

> **让 Typora 用户在 Mellow 中以相同心智、相同或更少步骤、相同快捷键和不更差的编辑手感完成核心任务，并在 IME、文件安全、Source Fidelity、大文件、阅读模式和跨平台一致性上明确更优。**

截至本方案审计时点，Mellow 已拥有大量功能实现和自动化测试资产，但**还不能宣称“完全对标完成”**。当前最关键的不是继续堆功能，而是完成以下闭环：

1. 统一 Typora 1.14.9 规范基线，消除文档中 1.14.6 / 1.14.9 混用；
2. 把“代码存在”与“体验达标”分开，建立逐项 Experience Contract；
3. 收敛 Desktop Shell、Sidebar 和 Menu，使默认界面真正回到“文档优先”；
4. 消除 Command Registry、Rust 原生菜单、主题包和 UI 入口之间的漂移；
5. 对 Live Editing、Caret、Selection、IME、Undo 做节点级真机对照；
6. 完成 Windows / Linux 真实桌面交互矩阵；
7. 完成 UX Score ≥ 92 和 30 个计时任务 Gate；
8. 所有 P0 项达到 PASS-E 后，才允许发布“与 Typora 一致或更优”的结论。

本方案确认后，实施顺序固定为：

```text
P0 基线与证据治理
→ P1 Command / Menu 单一真源
→ P2 Desktop Shell 与默认布局收敛
→ P3 Sidebar 深度对标
→ P4 Live Editing 与编辑手感
→ P5 Table / Image / Clipboard / File Workflow
→ P6 Settings / Theme / Export / Better 能力
→ P7 三平台 Native Adapter 收口
→ P8 真机、效率、盲测与 Release Gate
```

### 0.1 Typora 1.14.9 样例专项回归（2026-08-23）

用户指定的 `markdown-syntax-demo.md` 专项已完成一轮实现与 macOS release 复验，关闭了该样例暴露出的 Source Mode 刷新、Outline 远距虚拟滚动、PageUp / PageDown 空白视口和 GFM Table 原位编辑问题。Table 路径保持 Markdown 唯一真源，并增加 minimal patch、Composition、Tab 导航和 Undo 自动化。

专项证据见 [Markdown 全语法样例 Typora 1.14.9 对标验收报告](../qualification/markdown-syntax-demo-parity-2026-08-23.md)。结果包括 `60 suites / 642 tests` editor-engine 回归、151 / 151 Source Fidelity corpus、macOS AX / 截图证据和 unsigned 1.3.4 release bundle。

该专项只更新对应实现项和证据，不改变本方案的产品级状态码：真实中文输入法 Golden Journey、隔离环境 N=5 外部性能、以及本次代码 push 后的 Windows / Linux GitHub Actions 仍须完成，才能把相关 Experience Contract 提升为 `PASS-E`。

---

## 1. 权威依据与冲突裁决

### 1.1 文档优先级

| 优先级 | 文档 | 本方案使用方式 |
|---|---|---|
| P0 | [Mellow PRD V1.2 FINAL](../product/Mellow-PRD-V1.2-FINAL.md) | 产品范围、目标、基线与 Release Gate 的最终依据 |
| P1 | [Desktop UI Design Spec](../specs/desktop-ui-design-spec.md) | Desktop Shell、Sidebar、布局与低干扰规则 |
| P1 | [Live Markdown Engine Spec](../specs/live-markdown-engine-spec.md) | Live Editing、Caret、IME、Undo 与节点状态 |
| P1 | [Table Editing Spec](../specs/table-editing-spec.md) | 表格 GUI、Minimal Patch 与 IME |
| P1 | [Image Workflow Spec](../specs/image-workflow-spec.md) | 图片输入、路径、批处理与文件操作 |
| P1 | [Clipboard & Smart Paste Spec](../specs/clipboard-smart-paste-spec.md) | 多格式复制与 Smart Paste |
| P1 | [Document & File Safety Spec](../specs/document-file-safety-spec.md) | Source Fidelity、保存、恢复与外部冲突 |
| P1 | [IME Test Plan](../specs/ime-test-plan.md) | 三平台真实输入法矩阵 |
| P1 | [Performance Benchmark Spec](../specs/performance-benchmark-spec.md) | 同机对照与性能口径 |
| P2 | ADR-0001 / 0003 / 0005 / 0006 / 0007 / 0009 / 0011 / 0015 / 0016 / 0019 | 架构和已接受决策，不在本方案中推翻 |
| P3 | 本方案 | 施工顺序、验收拆解、依赖与证据治理 |

### 1.2 Typora 版本基线

仓库存在以下历史冲突：

- PRD、AGENTS.md 和 Performance Spec 指定 **Typora 1.14.6**；
- 旧版 Master Plan 把本机 1.14.9 写成了“验收基线”。

最终裁决：

1. **Normative Baseline：Typora 1.14.9（build 7785）**；
2. **Historical Reference：Typora 1.14.6**，只保留历史证据用途；
3. 如 1.14.9 与历史记录不同，以 1.14.9 的新鲜配置实测为准；
4. Split Mode 已移出 V1；不得通过菜单、命令、设置或验收项重新引入。

官方 stable release 记录显示，1.14.6 的重点新增是：

- Editor Toolbar；
- macOS 格式 Context Menu；
- Sidebar hidden/all/custom glob filter；
- File Tree keyboard navigation。

这些能力全部属于 Mellow P0 对标范围。

### 1.3 已接受架构，不在本方案中变更

- 保留 MarkEdit CoreEditor，不从零重写；
- Markdown 纯文本是唯一真源；
- CodeMirror 6 + Lezer 是 Editor Core；
- Live Markdown 通过 Decoration / Widget 实现；
- React + TypeScript 负责 Desktop UI；
- Rust 负责 System Core；
- Editor/UI 不直接依赖 Tauri；
- 平台差异只存在于 Adapter / Native Enhancement；
- Tauri 2 当前锁定，ADR-0019 触发条件成立时再新增 ADR 切换 Electron；
- AI 仅为可选扩展，不进入默认界面。

---

## 2. “一致或更优”的最终判定模型

### 2.1 三级目标

| 等级 | 定义 | 允许结果 |
|---|---|---|
| E — Equivalent | Typora 核心任务必须体验等价 | 步骤不更多、默认一致、快捷键一致、结果一致、性能不更差 |
| B — Better | Mellow 明确优于 Typora | 必须有测试和用户验证，不能靠功能数量自评 |
| D — Deliberate Difference | 有意不同 | 品牌视觉、Logo、原创主题、Reader/Palette/Slash 等不破坏 Typora 心智的增强 |

### 2.2 Experience Contract

每个对标项必须同时记录：

```text
Feature
+ Entry Point
+ Default State
+ Keyboard
+ Mouse / Touchpad
+ Caret / Selection
+ IME
+ Undo / Redo
+ Visual Feedback
+ Markdown / File Result
+ Performance
+ Accessibility
+ Windows / macOS / Linux Result
= Experience Contract
```

只满足“Feature”不得标记完成。

### 2.3 状态码

| 状态 | 含义 |
|---|---|
| ABSENT | 未实现 |
| IMPL | 已有实现，但未形成充分验收证据 |
| AUTO | 自动化测试已通过 |
| MAC | macOS 真机已通过 |
| WIN | Windows 真机已通过 |
| LINUX | Linux 真机已通过 |
| PASS-B | 基本一致，存在已知小差异 |
| PASS-E | 三平台 Experience Contract 全部通过 |
| PASS-BETTER | Better 项通过对照或盲测 |
| BLOCKED | 触发 Release Blocker |

最终“Done”只能是 `PASS-E` 或 `PASS-BETTER`。

### 2.4 证据等级

从高到低：

1. 同机同文档真实 Typora / Mellow 双应用对照；
2. 三平台真实桌面手工或自动化交互；
3. AX 树、截图、视频、菜单 dump、文件 diff、导出产物；
4. E2E / Integration / Unit 自动化；
5. 代码阅读；
6. 文档声明。

低等级证据不能替代高等级 Gate。例如“有 600 个测试”不能替代 Windows 微软拼音真机验证。

---

## 3. Typora 1.14.9 体验模型

### 3.1 核心特点

Typora 的竞争力不是单个 Markdown Feature，而是五层体验共同成立：

1. **单一编辑表面**：正文与预览不分离，语法标记按 Caret 智能显隐；
2. **低干扰桌面壳**：窗口控件、菜单和 Sidebar 退后，文档成为第一视觉；
3. **结构化编辑 GUI**：Table、Image、Link、Math、Mermaid 等无需切换到富文本模型；
4. **文件型工作流**：打开单文件即加载父目录，Tree / List / Outline / Search 紧贴文档；
5. **可预测输出**：复制、粘贴、主题、PDF、HTML 和 Pandoc 与 Markdown 原文兼容。

### 3.2 默认桌面心智

```text
macOS
┌──────────────────────────────────────────────────────┐
│ Traffic Lights · Document / Tabs · Sidebar Toggle   │
├───────────────┬──────────────────────────────────────┤
│ Optional      │                                      │
│ Sidebar       │       Centered Writing Surface       │
│               │                                      │
└───────────────┴──────────────────────────────────────┘

Windows / Linux
┌──────────────────────────────────────────────────────┐
│ Low-noise Menu / Title / Window Controls            │
├───────────────┬──────────────────────────────────────┤
│ Optional      │       Centered Writing Surface       │
│ Sidebar       │                                      │
├───────────────┴──────────────────────────────────────┤
│ Optional low-noise status / sidebar entry           │
└──────────────────────────────────────────────────────┘
```

关键不是像素复制，而是：

- 默认打开后可立即写；
- 用户第一眼看见正文，不是工具条；
- Sidebar 隐藏时正文写作宽度不变，只改变可用留白；
- 高级能力只在需要时出现；
- 常用功能在原菜单位置可找到。

---

## 4. 当前审计结论

### 4.1 已有强资产

以下能力已有实现与不同程度测试，本方案要求保留并防回退：

- MarkEdit CoreEditor + CodeMirror 6 + Lezer；
- Live Markdown marker reveal 框架；
- Table GUI、Tab 导航、行列增删移动、Tidy；
- 图片粘贴、拖拽、路径策略、批量操作与上传 Adapter；
- Math、Mermaid、Footnote、TOC、Alerts、YAML、Wikilink；
- Smart Paste 和多格式 Copy；
- Focus、Typewriter、Reader、Command Palette、Slash；
- Tabs、File Tree、File List、Outline、Quick Open、Global Search；
- Atomic Save、Recovery、External Conflict、Encoding、EOL；
- Source Fidelity corpus；
- Large File Mode；
- zh-CN 默认和 en-US i18n；
- 三平台构建、打包与启动级证据。

这些是“实施基础”，不是自动获得 PASS-E 的理由。

### 4.2 当前高优先级差距

| ID | 差距 | 当前证据 | 判定 |
|---|---|---|---|
| G-BASE-01 | Master Plan 把 1.14.9 当正式基线 | PRD 与旧 Plan 冲突 | 必须先修正文档治理 |
| G-MENU-01 | 顶层菜单顺序不一致 | Typora：文件/编辑/段落/格式/显示/主题/窗口/帮助；Mellow：文件/编辑/显示/插入/格式/段落/主题/窗口/帮助 | FAIL |
| G-MENU-02 | Mellow 新增“插入”顶层菜单 | 与 PRD“不得无限新增顶层菜单”冲突 | FAIL；应并回段落/格式 |
| G-MENU-03 | Theme Registry 与原生菜单漂移 | 主题包已有 Whitey/Gothic；`menu.rs` 仍只装配 6 项 | FAIL |
| G-MENU-04 | Command Registry 与 Rust Menu 双真源 | 同一命令的名称、快捷键、顺序分散 | 高回归风险 |
| G-SIDE-01 | Sidebar 顶部控件密度高 | 文件/大纲/搜索 + 打开/刷新/更多 + 树/列表 + 路径 + 最近文件夹 | PASS-B 以下 |
| G-SIDE-02 | Typora 的 hover/action-panel 心智未完整复刻 | Mellow 多数控制常驻 | 需 UI 收敛 |
| G-SHELL-01 | 多 Tab 时 Titlebar 视觉占比高 | 当前 Tab 全量横排，标题栏密度随文档数上升 | 需任务效率与视觉评审 |
| G-SHELL-02 | Sidebar 打开时正文视觉被明显推挤 | 本机截图可见左侧多层 chrome | 需布局收敛 |
| G-STATUS-01 | 旧文档相互矛盾 | UI Review、P0 Status、Master Plan 使用不同时间点和结论 | 证据治理失败 |
| G-QA-01 | UX Score 表仍为空 | `ux-score-gate-template.md` | NOT TESTED |
| G-QA-02 | 30 个任务效率 Gate 未执行 | 只有模板 | NOT TESTED |
| G-QA-03 | Windows / Linux IME、Caret、Clipboard 真机矩阵未完成 | CI 只有构建/启动级 | Release Blocker 未关闭 |
| G-QA-04 | 菜单没有结构化自动测试 | `menu.rs` 无对应 menu schema test | 高回归风险 |
| G-QA-05 | Desktop UI 缺少稳定视觉 Golden | 只有少量主题截图 | 无法证明布局不回退 |

### 4.3 当前总体状态

| 维度 | 当前状态 | 结论 |
|---|---|---|
| 功能覆盖 | IMPL / AUTO 较高 | 不等于 Experience Parity |
| 编辑手感 | macOS 部分 MAC | Windows / Linux 未闭环 |
| Sidebar | 功能丰富，视觉与入口待收敛 | 未 PASS-E |
| Desktop UI / Layout | 已有统一壳，默认复杂度仍需复核 | 未 PASS-E |
| Menu / Shortcut | 功能项较多，但顶层结构和单一真源存在明确差距 | FAIL |
| 三平台 | 构建/启动通过 | 真机交互未完成 |
| Release Gate | UX Score 和效率 Gate 空白 | 不得宣称最终达标 |

---

## 5. 最终产品与交互总合同

### 5.1 默认状态

| 项目 | 最终默认 |
|---|---|
| 编辑模式 | Live Mode |
| Sidebar | 首次启动隐藏；用户操作后记忆 |
| Status Bar | 默认隐藏；可设置显示 |
| Line Numbers | Live Mode 默认关闭；Source Mode 可独立配置 |
| 单 Tab 栏 | 默认自动隐藏 |
| 多 Tab 栏 | 显示，但保持 32–36px、低对比、Close 仅 hover |
| Formatting Toolbar | Selection 后出现；IME 时不出现 |
| Command Palette | 不常驻，只通过快捷键/菜单 |
| Reader | 不在 Titlebar 常驻，以 View / Palette 进入 |
| AI | 默认关闭且无常驻入口 |
| Language | zh-CN |
| Writing Width | 820px |
| Body | 16px / line-height 1.65 |
| Top Padding | 56px |
| Bottom Space | ≥ 30vh |

### 5.2 布局不变量

1. Sidebar 开关不得改变 Writing Width；
2. Sidebar 展开/收起不得导致 Caret 跳跃或横向闪烁；
3. Titlebar、Tabs、Status Bar 不得抢占正文视觉；
4. Editor Surface 不出现永久 Formatting Ribbon；
5. 任何模式切换保持 document、caret、selection、scroll；
6. Dialog、Toast、Toolbar 不覆盖 IME candidate window；
7. 900×600 仍可完成打开、编辑、保存、搜索；
8. 200% Zoom 不截断关键按钮；
9. 三平台共享产品语义，系统装饰遵循平台习惯；
10. 原创品牌视觉不得复制 Typora 专有资源。

---

## 6. 功能深度对标矩阵

### 6.1 Document / File

| 能力 | Typora 合同 | Mellow 目标 | 等级 |
|---|---|---|---|
| New | 新文档立即可写 | 同快捷键、同焦点行为 | E |
| New Window | 新窗口独立会话 | 系统惯例一致 | E |
| New Tab | macOS 原生支持，Win/Linux 有差异 | 三平台统一 Tabs，不抢 Table 快捷键 | B |
| Open File | 打开即 Live | 同步加载父目录 | E |
| Open Folder | 文件对话框选择目录 | 同步骤或更少 | E |
| Open Parent Automatically | 单文件打开后父目录出现 | 不打断已有 workspace root | E |
| Recent | 文件/文件夹可进入 | 清理、Pin、缺失提示更安全 | E/B |
| Quick Open | fuzzy current folder/recent | Unicode / 中文匹配不更差 | E/B |
| Save | 可预测保存 | Atomic + Fidelity 更优 | B |
| Save As | 新路径、状态正确 | 资产目录规则可预测 | E |
| Save All | 多文档批量保存 | Dirty 与失败逐项反馈 | E/B |
| Reload from Disk | 明确重载 | Dirty 时禁止静默覆盖 | B |
| Rename / Move | 文件菜单和 Sidebar | watcher、tab、recent 同步 | E/B |
| Delete | 移到 Trash | 可撤销时提供 Undo | B |
| File Info | 路径、统计、编码 | 中文统计更完整 | E/B |
| File Association | 可选默认应用 | 安装器不强制篡改 | E |

### 6.2 Markdown 元素

以下节点全部执行统一的 15 状态矩阵：

```text
idle / caret-before / caret-inside / caret-after
selection-partial / selection-full / mouse-click
IME / undo / redo / copy / paste
delete-start / delete-end / source-live-roundtrip
```

| 节点 | Live 目标 | Source Fidelity 目标 | 等级 |
|---|---|---|---|
| Paragraph / Break | Enter / Shift+Enter 与 Typora 一致 | 保留 hard break 与空格 | E |
| ATX H1–H6 | marker 智能显隐 | `#` 数量不改写 | E |
| Setext Heading | 正确渲染与回退 | 原 underline 保持 | E |
| Strong / Emphasis | nested 独立显隐 | 原 marker 风格保持 | E |
| Strike | 切换与 marker 一致 | minimal wrap | E |
| Underline HTML | GUI 可操作 | 保留 HTML 源 | E |
| Inline Code | 关闭 spell/smart punctuation | backtick 数量正确 | E |
| Link / Reference Link | text/url mixed state | path/title/escape 保持 | E |
| Image | widget + source reveal | path 不静默改写 | E/B |
| Blockquote | marker 与嵌套稳定 | 缩进不改写 | E |
| Ordered / Unordered List | continuation/terminate/indent | marker 风格与编号策略可预测 | E |
| Task List | clickable checkbox | 只 patch `[ ]` / `[x]` | E/B |
| Code Fence | language、copy、fold、wrap | fence 长度与 info 保持 | E |
| Table | GUI 与源码无模式切换 | minimal patch | E/B |
| Inline / Block Math | Typora 兼容优先 | delimiter 保持 | E |
| Mermaid | lazy render / error / source edit | fence source 不重写 | E |
| Footnote | jump / return / hover | label 与 definition 保持 | E |
| TOC | live update / jump | `[TOC]` 保持 | E |
| GitHub Alerts | 5 类型 | blockquote source 保持 | E |
| YAML | source-first + optional card | key order 不默认重排 | E/B |
| HTML / Media | 安全渲染 | 原文保持 | E + safer |
| Sup / Sub / Highlight | 与设置联动 | marker 保持 | E |

### 6.3 写作辅助

| 能力 | 对标合同 | 验收重点 |
|---|---|---|
| Auto Pair | 成对插入/跳过/删除 | IME 不干扰，Undo 一步 |
| Smart Punctuation | 默认状态与 Typora 一致，可细分开关 | 中英文引号、破折号、代码/URL 排除 |
| Spellcheck | 菜单/设置状态一致 | 三平台可用性、代码区排除 |
| Floating Toolbar | Selection 后显示 | 不遮选择、不遮下一行、Esc、Keyboard、IME hidden |
| Slash Commands | Mellow Better | 默认不抢 Typora 输入，行首触发，可关闭 |
| Command Palette | Mellow Better | 可发现命令，不替代原菜单入口 |
| Focus Mode | F8，非活动内容淡化 | line/block 口径、Theme、IME |
| Typewriter Mode | F9，Caret 固定 | 鼠标移动设置、滚动稳定 |
| Reader Mode | Mellow Better | 搜索、Outline、Zoom、Lightbox、Print |
| Split Mode | 已移除（2026-08-24） | 与 WYSIWYG 单一真源理念冲突，产品决策删除 |
| Word Count | 选择与全文统计 | CJK/英文/字符/段落/阅读时长 |

### 6.4 Table

| 场景 | 合同 |
|---|---|
| Create | Source、Menu、Context、Slash、TSV 全部可达 |
| Resize | 行列数量工具与拖动不更难 |
| Navigation | Tab / Shift+Tab / Last+Tab / Ctrl/Cmd+Enter |
| Row / Column | 上下左右插入、删除、移动 |
| Alignment | 左/中/右只 patch delimiter row |
| Selection | Cell、Row、Column 操作符合视觉反馈 |
| Copy / Paste | 单元格与表格复制粘贴可预测 |
| Tidy | 唯一允许显式重排空格的命令 |
| Invalid Source | 不自动“修复”或丢数据 |
| IME | 单元格组词不丢字、不重建整表 |
| Undo | 每个 GUI 动作一个 Undo |
| Large | 100×30 可编辑；不每键重建 DOM |

### 6.5 Image

| 场景 | 合同 |
|---|---|
| 输入 | typing / picker / drag one / drag many / bitmap / copied file / URL |
| 路径 | 原路径、relative、`./`、escape、root URL |
| 资产目录 | assets / images / document.assets / custom |
| GUI | open / reveal / copy / copy path / resize / syntax convert |
| 文件操作 | rename / move / copy / delete，Markdown 引用同步且可恢复 |
| 批量 | Move All / Copy All / Download Remote / Upload All |
| Broken | placeholder + retry + source reveal，不删除引用 |
| Remote | lazy、timeout、安全策略、可本地化 |
| Upload | PicGo HTTP / CLI / PicList / Custom Adapter |
| 特殊路径 | 中文、空格、#、%、括号、drive、UNC、symlink |
| Undo | Source patch 一个 Undo；文件操作单独安全撤销 |

### 6.6 Clipboard

| 场景 | 合同 |
|---|---|
| Normal Copy | 同时写 plain / HTML / RTF / Markdown flavor |
| Copy as Markdown | Ctrl/Cmd+Shift+C |
| Copy as Plain | 显式纯文本 |
| Copy as HTML Code | HTML 源写入 plain |
| Copy without Theme | 保留语义，去主题样式 |
| Paste | HTML 优先转 Markdown |
| Paste Plain | Ctrl/Cmd+Shift+V，完全忽略 rich |
| URL on Selection | 生成 link；已有 link 时安全替换 target |
| TSV | 一步转换 GFM Table |
| Image/File | 进入 Image Pipeline |
| Cross-app | VS Code、系统纯文本、Word、Gmail、Apple Notes、LibreOffice |

### 6.7 Search / Navigation

| 能力 | 合同 |
|---|---|
| Find | Ctrl/Cmd+F，count、next/prev、case、whole、regex |
| Replace | Ctrl/Cmd+H 或平台合同，`$1` replacement |
| F3 Alias | Windows/Linux Find Next / Previous 肌肉记忆 |
| Global Search | 流式、分组、上下文、Aa/Whole/Regex |
| Quick Open | fuzzy filename/path/recent/pinned |
| Outline | hierarchy/current/jump/filter/collapse/flat |
| File Link | relative/absolute/folder/anchor |
| Missing Link | 引导创建，不静默失败 |
| Document Switch | Ctrl+Tab / Cmd+grave，Caret/scroll/session 独立 |

### 6.8 Theme / Export / Print

| 能力 | 合同 |
|---|---|
| Themes | 至少 6 个原创主题；Light/Dark 分离；System |
| Custom CSS | base → theme → base.user → theme.user |
| Theme Menu | 与 Theme Registry 自动一致，无手工数组漂移 |
| PDF | CJK、Math、Mermaid、Table、Footnote、Outline、Page Break |
| HTML | with style / no style / self-contained |
| Image Export | P1；width/font/quality/long-image guard |
| Pandoc | 可选路径，错误展示完整但不泄露敏感信息 |
| Previous Export | 当前文档/窗口语义明确 |
| Print | 系统 Dialog；与 PDF 共用 print stylesheet |

---

## 7. Sidebar 最终深度合同

### 7.1 信息架构

Sidebar 只承载四个产品任务：

```text
Files
├── File Tree
└── File List

Outline

Search
```

禁止引入 Activity Bar、右侧永久 Inspector 或插件面板。

### 7.2 默认视觉

Sidebar 打开后的默认层级：

1. 顶部只显示当前模式名称和最多 2–3 个轻图标；
2. Files 模式默认直接进入 Tree 或上次模式；
3. Tree/List 切换、Open Folder、Refresh、Sort、Filter 收进 hover/action menu；
4. Root 路径只在必要时以单行截断显示；
5. Recent/Pinned 默认折叠或进入 action menu，不在每次打开时占据正文高度；
6. 高级 glob 不常驻；
7. 选中态低对比，但 keyboard focus 清晰。

### 7.3 File Tree

| 维度 | 最终合同 |
|---|---|
| Hierarchy | disclosure、folder/file icon、层级缩进清晰 |
| Filter | hidden / non-Markdown / custom include/exclude |
| Sort | natural / name / modified / created / asc-desc / folder grouping |
| Watch | 外部新增、删除、移动自动更新 |
| Keyboard | Up/Down、Left/Right、Enter、F2、Delete、Home/End |
| Mouse | single select/open、double 行为稳定、drag move |
| Cross-drop | Finder/Explorer ↔ Sidebar |
| Editor Drop | Sidebar 文件拖到正文生成相对 Markdown link |
| Context | New File/Folder、Open、New Window、Rename、Duplicate、Move、Trash、Copy Path、Reveal、Undo |
| Safety | Trash 优先；失败不丢状态；Undo 有明确反馈 |
| Current | 当前文档与 keyboard selection 可区分 |
| Scale | 10k 文件目录不冻结 UI；搜索/扫描可取消 |

### 7.4 File List

| 维度 | 最终合同 |
|---|---|
| Item | title、filename，可选 modified/summary |
| Density | compact 默认，comfortable 可选 |
| Scope | current folder / recursive |
| Group | folder grouping 与 Tree 语义一致 |
| Keyboard | Up/Down、Enter、PageUp/PageDown |
| State | current、selected、hover、missing |
| Performance | 大目录虚拟化或等效优化 |

### 7.5 Outline

| 维度 | 最终合同 |
|---|---|
| Structure | H1–H6 hierarchy |
| Active | 当前 Heading 实时高亮 |
| Jump | click/Enter 跳转，Caret 可预测 |
| Filter | keyword filter |
| Tree | collapse / expand / flat |
| Number | auto-number option |
| Context | Highlight Current、Collapse All、Expand All、Flat/Tree |
| Scroll | Active 变化不引发剧烈侧栏滚动 |
| Export | 与 PDF/HTML Outline 语义一致 |

### 7.6 Global Search

| 维度 | 最终合同 |
|---|---|
| Input | 顶部固定；Enter 执行 |
| Toggles | Aa / Whole Word / Regex 轻图标 |
| Advanced | include/exclude/context 默认折叠 |
| Results | file grouping + 1–2 行 context |
| Streaming | Rust 搜索结果增量显示，可取消 |
| Jump | 打开文件并定位 match |
| Keyboard | Up/Down/Enter/Esc |
| Error | invalid regex 就地提示，不提交 |
| Scope | 当前打开父目录 / workspace root |

### 7.7 Sidebar 响应式

| 窗口宽度 | 行为 |
|---|---|
| ≥ 1200 | 200–480px 可拖动 |
| 900–1199 | 默认保持用户宽度，限制正文最小可用区域 |
| < 900 | 不支持作为正式最小窗口；如系统强制缩小则自动隐藏 Sidebar |
| 200% Zoom | 控件不横向溢出；高级项进入菜单 |

---

## 8. Desktop UI 与布局最终合同

### 8.1 Titlebar / Tabs

| 项 | 合同 |
|---|---|
| Height | 32–36px；Windows/Linux 自定义区域不超过 44px |
| macOS | 原生 Traffic Lights，拖拽区、Fullscreen、系统 Menu Bar |
| Windows | Snap-compatible controls，不伪造不兼容 window chrome |
| Linux | GNOME/KDE 可用，尊重系统字体与窗口行为 |
| Single Tab | 默认自动隐藏 |
| Multi Tab | 轻背景区分；无强 accent line；Close 仅 hover |
| Dirty | 低干扰且不只依赖颜色 |
| Overflow | 横向滚动或 compact，不挤压窗口控件 |
| Drag | reorder，跨窗口 P1 |
| Context | Close / Close Others / Close Right / Reopen |
| Path | Tooltip 显示，不常驻占据 Titlebar |
| Sidebar Toggle | 轻图标，不显示永久快捷键胶囊按钮 |

### 8.2 Editor Surface

- Writing Width：680 / 820 / 980 / Auto；
- 默认 820px；
- Body 16px，Line Height 1.65；
- Top Padding 56px；
- Bottom Space ≥ 30vh；
- Inline marker reveal 不改变 document position；
- Selection 在 Light/Dark 和中文正文中清晰；
- 不使用大面积高饱和品牌色；
- 不对 Caret、marker、table resize 做动画。

### 8.3 Status Bar

默认隐藏。开启后可显示：

- 字数；
- 行:列；
- Markdown；
- Encoding；
- EOL；
- Zoom；
- 保存/错误状态。

要求：

- 高度 22–26px；
- 可单项配置 P1；
- 不作为高频命令唯一入口；
- Windows/Linux 可承载 Sidebar toggle，但必须保持低干扰。

### 8.4 Welcome / Empty

Welcome 只允许：

```text
Mellow

新建文档
打开文件
打开文件夹

最近使用
```

无营销、账号、新闻、AI Prompt、插画大图。首次启动是否直接显示 Welcome 或新建空白文档，在 P2 用户测试中二选一，判定标准是“启动到输入的步骤不多于 Typora”。

### 8.5 Settings

一级导航固定：

1. 通用；
2. 编辑器；
3. Markdown；
4. 文件；
5. 图片；
6. 外观；
7. 导出；
8. 快捷键；
9. 扩展；
10. 高级；
11. AI（仅扩展启用后）。

规则：

- 左栏 180–220px；
- 右侧内容 max 720px；
- 修改尽量即时生效；
- 必须 reload 时显示明确按钮；
- Menu Check State、Settings 和 Command State 必须同一真源；
- zh-CN / en-US 不硬编码，不用固定宽度按钮。

### 8.6 Dialog / Toast / Recovery

| 类型 | 合同 |
|---|---|
| Save / Open | 原生文件对话框 |
| Unsaved Close | 文档名明确，Save / Don’t Save / Cancel |
| External Conflict | Compare / Reload Disk / Keep Local |
| Recovery | Recover / Compare / Ignore |
| File Operation | Toast + Undo |
| Error | 说明对象、原因、可恢复动作 |
| Update | 不阻挡写作；Portable 明确手动覆盖 |
| Permission | 只在动作需要时申请 |

---

## 9. Menu、Command 与 Shortcut 最终合同

### 9.1 顶层菜单

最终目标：

```text
macOS
Mellow | 文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 窗口 | 帮助

Windows / Linux
文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 帮助
```

裁决：

- 移除独立“插入”顶层菜单；
- Insert 能力并入“段落”或“格式”；
- Reader / Command Palette 作为 Mellow Better 项放在“显示”并用 separator 隔开；
- 不新增 AI 顶层菜单；
- Windows/Linux 是否展示“窗口”只遵循平台原生惯例，不复制 macOS 专属项。

### 9.2 文件

顺序合同：

1. 新建；
2. 新建标签页；
3. 新建窗口；
4. separator；
5. 打开；
6. 打开最近；
7. 快速打开；
8. separator；
9. 文件信息；
10. 在文档列表中显示；
11. 在文件树中显示；
12. 打开文件位置；
13. separator；
14. 删除；
15. separator；
16. 关闭 / 全部关闭；
17. separator；
18. 保存 / 另存为 / 保存全部 / 从磁盘重新加载；
19. Rename / Move / Duplicate（按平台文案）；
20. separator；
21. Import；
22. Export；
23. Page Setup；
24. Print。

Mellow Snapshot / Recovery 入口不得插入 Typora 高频组中破坏查找，可放在 File Info 或 Advanced 子菜单。

### 9.3 编辑

必须覆盖：

- Undo / Redo；
- Cut / Copy / Copy Image / Paste；
- Copy as Plain / Markdown / HTML Code / Without Theme；
- Paste Plain / Match Style；
- Select 子菜单；
- Move Line Up / Down；
- Delete Range 子菜单；
- Math Tools；
- EOL；
- Whitespace / Line Break；
- Replace / Smart Punctuation；
- Spelling and Grammar；
- Find / Replace；
- macOS Speech / Dictation / Emoji 使用系统项。

### 9.4 段落

必须覆盖：

- H1–H6；
- Paragraph；
- Increase / Decrease Heading；
- Table 全量子菜单；
- Math Block；
- Code Fence；
- Code Tools；
- GitHub Alerts；
- Quote；
- Ordered / Unordered / Task List；
- Task State；
- List Indent；
- Insert Paragraph Above / Below；
- Reference Link；
- Footnote；
- Horizontal Rule；
- TOC；
- YAML Front Matter；
- Mermaid 作为 Code Fence 快速模板，可放在 Code Tools 或 Command Palette，不新增顶层菜单。

### 9.5 格式

必须覆盖：

- Bold / Italic / Underline / Inline Code；
- Strike / Comment；
- Hyperlink；
- Link Operations；
- Image 子菜单全量；
- Clear Format；
- Mellow Highlight / Sup / Sub 作为增强项，以 separator 与 Typora 基础项分隔。

### 9.6 显示

必须覆盖：

- Tab Bar / All Tabs；
- Source Mode；
- Read-only 或 Reader Mode；
- Focus；
- Typewriter；
- Toolbar；
- Toggle Sidebar；
- Outline / File List / File Tree / Search；
- Word Count；
- Outline Window 若不实现独立窗口，记录 Deliberate Difference 与替代路径；
- Zoom；
- Always on Top；
- Fullscreen；
- Mellow Better：Command Palette，在独立增强分组。

### 9.7 主题

- 菜单从 Theme Registry 自动生成；
- 选中态与实际主题一致；
- Light/Dark/System 与主题选择不冲突；
- Whitey / Gothic 等新增主题不得只存在于 Settings；
- Open Theme Folder / User CSS 放在 separator 后；
- 主题切换不重建 EditorView，不丢 Caret/Selection/Undo。

### 9.8 窗口 / 帮助

macOS Window 由系统预定义项优先：

- Minimize / Zoom；
- Move & Resize / Fullscreen Tile；
- Previous / Next Tab；
- Move Tab / Merge All Windows；
- Bring All to Front；
- Window list。

Help：

- What’s New；
- Quick Start；
- Markdown Reference；
- Pandoc；
- Custom Themes；
- Images；
- Acknowledgements；
- Changelog；
- Privacy；
- Website；
- Feedback；
- Mellow Cheatsheet 可作为增强项。

### 9.9 Command 单一真源

当前 Rust `menu.rs`、TypeScript Command Registry、i18n、Cheatsheet、Settings 各自维护部分名称和快捷键，必须收敛为：

```text
packages/commands
└── CommandDescriptor
    ├── id
    ├── titleKey
    ├── category
    ├── menuPath
    ├── menuOrder
    ├── shortcut.mac
    ├── shortcut.win
    ├── shortcut.linux
    ├── checkState
    ├── enabledWhen
    └── handler contract
          ↓
React Registry / Palette / Cheatsheet / Settings
          ↓
Serializable NativeMenuSpec
          ↓
apps/desktop Native Menu Adapter
          ↓
Tauri Rust materialization + OS predefined items
```

硬规则：

1. Command ID 只能定义一次；
2. 快捷键只能定义一次；
3. 菜单顺序由 schema 测试；
4. Theme 菜单从 Theme Registry 派生；
5. 菜单 Check State 与 Settings Store 同一真源；
6. Rust 只负责原生 materialization 和 OS predefined item；
7. Menu click 与 keyboard 必须进入同一 Command Handler；
8. 禁止 native accelerator + JS keydown 双触发；
9. zh-CN / en-US menu dump 都进入 Golden；
10. macOS / Windows / Linux 各自生成预期顶层结构。

### 9.10 Shortcut 冲突裁决

| 冲突 | 最终策略 |
|---|---|
| Windows/Linux Ctrl+T | 保持 Typora Table；New Tab 使用 Ctrl+Alt+T 或用户自定义 |
| macOS Cmd+T | New Tab；Table = Cmd+Option+T |
| Cmd/Ctrl+Shift+P | Command Palette，作为 Mellow Better |
| Cmd/Ctrl+P | macOS Print；Windows/Linux Quick Open 依 Typora |
| Source | Cmd/Ctrl+/ |
| Focus / Typewriter | F8 / F9 |
| Sidebar | Cmd/Ctrl+Shift+L |

任何冲突必须经过三平台 keymap test，不得在单平台自行决定。

---

## 10. Context Menu 与临时 UI

### 10.1 普通文本

- Cut / Copy / Paste；
- Paragraph / Heading；
- Bold / Italic / Strike / Code / Link；
- Copy as Markdown / Plain；
- Spelling；
- AI 只在扩展启用且有 Selection 时出现，并置于末尾增强区。

### 10.2 Link

- Open Link；
- Copy URL；
- Edit Link；
- Remove Link；
- Local file link 时 Reveal / Open in New Tab。

### 10.3 Image

- Open / Reveal；
- Copy Image / Copy Path；
- Resize；
- Markdown / HTML syntax convert；
- Rename / Move / Copy；
- Upload；
- Delete File 必须二次确认并走 Trash。

### 10.4 Table

- Add/Delete/Move Row；
- Add/Delete/Move Column；
- Alignment；
- Copy Table；
- Tidy；
- Delete Table。

### 10.5 Code / Math / Mermaid

- Copy Source；
- Copy Rendered；
- Language / Refresh；
- Export SVG/PNG（适用时）；
- Error 详情不破坏源文本。

### 10.6 Selection Toolbar

最终项：

```text
H1 H2 H3 | B I S Code | Link | Quote | List
```

行为：

- 只在非空 Selection 后出现；
- 计算可用空间后放在上方或下方；
- 不遮 Selection 中心与下一输入行；
- IME composition 时隐藏；
- Esc 关闭；
- Tab / Arrow / Enter 可用；
- 命令执行后 Editor 重新获得焦点；
- 一个命令一个 Undo。

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
| Split Mode | 已移除（2026-08-24） | 与 WYSIWYG 单一真源理念冲突，产品决策删除 |
| Command Palette | 发现性 | 原菜单入口 |
| Slash Commands | 高效插入 | 普通 `/` 输入与 IME |
| Three-platform Tabs | 一致性 | Table 快捷键 |
| Extension Permissions | 开放与安全 | 核心功能不依赖插件 |

### 11.2 不进入 V1

- Knowledge Graph；
- Backlink Database；
- Cloud Workspace；
- Account / Team Collaboration；
- Full Git GUI；
- Terminal；
- Browser；
- Permanent AI Chat Panel；
- AI Autonomous Agent；
- Online Publishing Platform。

---

## 12. 实施工作包

### P0 — Baseline 与证据治理

**目标**：所有后续任务使用同一基线、同一状态、同一证据目录。

任务：

1. 将所有 active 文档的主基线统一为 Typora 1.14.9（build 7785）；
2. 1.14.6 标记为历史参考；
3. 建立 `parity-ledger.json` 或等价 typed fixture；
4. 每项包含 Typora 行为、Mellow 当前、等级、状态、证据、测试、Owner Package；
5. 清理“代码完成 = 完全达标”的表述；
6. 旧 qualification 文档只作为历史证据，不参与当前状态聚合；
7. 生成当前状态 Dashboard；
8. 冻结 Typora 官方来源与本机 1.14.9 AX dump。

建议文件：

- `docs/plans/typora-parity-master-plan.md`；
- `tests/parity/ledger.*`；
- `tests/benchmark/fixtures/typora-1.14.9-*`；
- `tests/benchmark/fixtures/typora-1.14.6-history-*`。

Exit Gate：

- 基线无冲突；
- 所有 P0 项有唯一 ID；
- 不存在无证据的 PASS-E。

**实施结果（2026-08-24）**：已完成。`tests/parity/typora-parity-ledger.json` 建立 32 个唯一 P0 条目；`node tests/parity/verify-parity-ledger.mjs` 已纳入根目录 `pnpm test`，会验证 1.14.9 规范基线、历史版本隔离、ID / 证据完整性与 PASS-E 前置要求，并输出当前状态 Dashboard。带日期的 qualification 报告保留为历史证据，不再参与当前状态聚合。

### P1 — Command / Menu 单一真源

**目标**：先修用户发现路径，再修视觉。

任务：

1. 在 `packages/commands` 定义 CommandDescriptor；
2. 从 descriptor 生成 Palette / Cheatsheet / NativeMenuSpec；
3. Rust `menu.rs` 降为平台 Adapter；
4. 顶层菜单按 §9.1 重排；
5. 移除 Insert 顶层，条目并入 Paragraph / Format；
6. 补齐 File / Edit / Paragraph / Format / View / Help 的顺序和 separator；
7. Theme Menu 从 Theme Registry 生成；
8. 统一 check state、enabled state、shortcut；
9. 为 macOS / Windows / Linux 写 menu schema tests；
10. 真机导出 AX menu dump，与 Typora fixture 做语义 diff；
11. Context Menu 复用 Command ID；
12. Shortcut conflict test 覆盖 Ctrl+T、Ctrl+P、Cmd+P 等。

主要模块：

- `packages/commands`；
- `packages/i18n`；
- `apps/desktop/src-tauri/src/menu.rs`；
- `apps/desktop/src/App.tsx`；
- `apps/desktop/src/Cheatsheet.tsx`；
- `packages/themes`。

Exit Gate：

- 三平台顶层结构符合合同；
- 每个 Menu Item 有 Command ID；
- Theme / Settings / Menu 无漂移；
- keyboard 与 menu click 只执行一次；
- zh-CN / en-US dump 通过。

### P2 — Desktop Shell 与默认布局

**目标**：默认打开后第一视觉是文档。

任务：

1. Sidebar 首次启动隐藏，之后记忆用户状态；
2. Status Bar 首次启动隐藏；
3. Live Mode Line Numbers 默认关，Source 可独立设置；
4. 移除 Titlebar 永久快捷键胶囊，改轻图标；
5. 单 Tab 自动隐藏；
6. 多 Tab overflow、dirty、close、active 视觉收敛；
7. Sidebar toggle 保持 Writing Width；
8. Welcome 做 A/B 对照：空白新文档 vs 极简 Welcome；
9. Settings 导航补齐 PRD 结构，但不引入复杂嵌套；
10. 统一 Editor Padding、Writing Width、Focus Ring、Selection；
11. 加入 900×600、1200×800、1440×900、200% Zoom Golden；
12. macOS / Windows / Linux 分别做 window chrome screenshot。

主要模块：

- `apps/desktop/src/App.tsx`；
- `apps/desktop/src/styles.css`；
- `packages/desktop-ui`；
- `packages/settings`；
- `packages/themes`。

Exit Gate：

- UI Review 不再判定为 VS Code / Obsidian 化；
- 常见任务入口不增步；
- Screenshot Golden 通过；
- Keyboard / Focus / Reduced Motion 通过。

### P3 — Sidebar 深度对标

**目标**：功能完整，但默认密度不高于 Typora。

任务：

1. SidebarHeader 改为低密度模式标题 + 轻图标；
2. Open / Refresh / Tree-List / Filter / Sort 收入 hover/action menu；
3. Recent / Pinned 改为折叠或 action panel；
4. 高级 glob 默认折叠；
5. Tree 完成键盘、拖拽、Context、Watcher 全链路；
6. List 完成 density、recursive、group、virtualization；
7. Outline 完成 current/filter/collapse/flat/number/context；
8. Search 完成轻量 toggle、advanced fold、stream/cancel/jump；
9. Sidebar resize、记忆、窗口窄化和 200% Zoom；
10. 与 Finder/Explorer/Desktop Environment 做跨应用拖拽；
11. 建立四模式 Screenshot Golden；
12. 完成 Sidebar 12 个计时微任务。

Exit Gate：

- Sidebar 默认只展示当前任务；
- Tree/List/Outline/Search keyboard-only 全通；
- 10k 文件、1000 headings、1万结果不阻塞；
- 三平台真机交互通过。

### P4 — Live Editing 与编辑手感

**目标**：Typora 最难复制的部分达到 PASS-E。

任务：

1. 对 §6.2 每个节点执行 15 状态矩阵；
2. marker reveal 更新不得改变 Selection；
3. Composition Guard 覆盖所有 node；
4. Undo grouping 以用户动作而非 transaction 数量为准；
5. Enter / Backspace / Delete / Home / End / Word Move 平台化；
6. mouse click / double / triple / drag selection；
7. nested inline formatting；
8. invalid/partial Markdown fallback source；
9. Source ↔ Live 保持 scroll/caret/selection；
10. Focus / Typewriter 与 marker reveal 联合测试；
11. Floating Toolbar 与 IME/Selection 联合测试；
12. 每个平台真实输入法连续 20 分钟写作；
13. 同机 Typora/Mellow 输入延迟和任务时间对照；
14. 所有 Caret / IME / Undo regression 标为 Release Blocker。

主要模块：

- `packages/editor-core`；
- `packages/editor-engine`；
- `packages/editor-react`；
- `tests/fixtures`；
- `tests/benchmark`。

Exit Gate：

- Live Editing ≥ 24/25；
- Caret / IME / Undo = 15/15；
- IME corruption = 0；
- Typing P95 达 PRD；
- 任何节点无 Source Fidelity 回退。

### P5 — Table / Image / Clipboard / File Workflow

**目标**：四个高频生产任务达到 GUI 与数据安全双重对标。

Table：

- 22 场景全量；
- 100×30；
- cell IME；
- one action one Undo；
- minimal diff。

Image：

- 24+ 场景；
- 三平台路径；
- 多图 drag/paste；
- move/copy/upload；
- document rename + asset folder；
- failure rollback。

Clipboard：

- 7 个目标应用；
- plain/html/rtf/markdown；
- rich paste/TSV/URL/image；
- Source Mode plain-first。

File：

- open parent；
- watcher；
- rename/move/trash/undo；
- external dirty conflict；
- recovery compare；
- network/cloud/disk-full corpus。

Exit Gate：

- Table / Image UX 任务不慢于 Typora +5% 目标；
- Clipboard cross-app matrix 全绿；
- Source Fidelity 0 diff；
- File Safety 5/5；
- Data loss = 0。

### P6 — Settings / Theme / Export / Better

**目标**：完成核心配置心智和输出质量，不让增强项增加默认复杂度。

任务：

1. Settings 一级导航与搜索；
2. 菜单、设置、运行状态双向同步；
3. Theme Registry / User CSS / Light-Dark；
4. PDF / HTML / Image / Pandoc / Previous Export；
5. CJK、Math、Mermaid、Table、Footnote、TOC export corpus；
6. Reader / Palette / Slash 的默认隐藏与可发现性；
7. Recovery / Conflict Compare；
8. Large File Mode；
9. Extension permission 与 Safe Mode；
10. AI 默认关闭验证。

Exit Gate：

- Typora 用户能在相同一级设置中找到关键配置；
- PDF/HTML 日常生产可用；
- Better 能力不改变默认 Typora 心智；
- Export 三平台视觉高度一致。

### P7 — 三平台 Adapter 与 Native Enhancement

**目标**：共享语义一致，系统行为原生。

macOS：

- Traffic Lights / Menu Bar / Services / Share；
- Cmd+, / Cmd+W / Native Fullscreen；
- Quick Look；
- Signed / Notarized DMG。

Windows：

- Snap / Window Controls；
- MSI / NSIS / Portable；
- File Association / Open With / Explorer；
- Microsoft Pinyin / Sogou；
- JumpList P1。

Linux：

- GNOME / KDE；
- Portal / Native File Dialog；
- AppImage / deb / rpm；
- MIME / XDG；
- fcitx5 / ibus。

Exit Gate：

- 核心 Editor 无平台分支；
- Adapter 行为通过 contract tests；
- 三平台安装/卸载/更新矩阵通过；
- ADR-0019 trigger 未触发；若触发，停止并新增 ADR。

### P8 — 最终验收

任务：

1. 三平台 Golden Journeys；
2. 30 个核心计时任务，两轮交叉顺序；
3. UX Score 100 分；
4. Typora 用户盲测；
5. Accessibility keyboard + screen reader baseline；
6. Performance 同机对照；
7. Source Fidelity / File Safety / Export Corpus；
8. Menu AX dump / Screenshot Golden；
9. Release Candidate audit；
10. 只在全部 Gate 通过后更新 Release 文案。

Exit Gate：

- Total UX Score ≥ 92；
- Live Editing ≥ 24/25；
- Caret / IME / Undo = 15/15；
- File Safety = 5/5；
- ≥ 27/30 任务 ≤ Typora +5%；
- 关键任务无一慢 >15%；
- IME corruption = 0；
- Data loss = 0；
- Source Fidelity = 0 diff；
- Windows / macOS / Linux 全 PASS-E。

---

## 13. 依赖与实施顺序

```text
P0 Baseline
  ↓
P1 Command/Menu ───────────────┐
  ↓                            │
P2 Desktop Shell               │
  ↓                            │
P3 Sidebar                     │
  ↓                            │
P4 Live Editing  ←─────────────┘
  ↓
P5 Table/Image/Clipboard/File
  ↓
P6 Settings/Theme/Export/Better
  ↓
P7 Platform Adapters
  ↓
P8 Final QA
```

禁止：

- Menu 未统一前继续增加入口；
- Desktop Shell 未收敛前加入常驻增强面板；
- Windows/Linux 真机未通过就宣称三平台等价；
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
| Contract | CommandDescriptor、Host API、Menu Schema、Adapter |
| Editor Integration | marker、caret、selection、IME event、undo、mode switch |
| Rust | save、watcher、recovery、search、export、permission |
| Desktop E2E | file、sidebar、menu、settings、export、dialog |
| Visual | shell、sidebar 四模式、tabs、settings、theme、dialog |
| Corpus | Source Fidelity、File Safety、Export、Typora Markdown |

### 14.2 真机矩阵

| 平台 | 必测 |
|---|---|
| Windows 10/11 | 微软拼音、搜狗、WebView2、MSI/NSIS/Portable、Clipboard、Print |
| macOS | 拼音、五笔、WKWebView、Menu/Share/Quick Look、DMG |
| Ubuntu / Fedora | fcitx5、ibus、WebKitGTK、GNOME/KDE、AppImage/deb/rpm |

### 14.3 视觉 Golden

每个平台至少保存：

1. 首次启动；
2. 单文档 Live；
3. 多 Tab；
4. File Tree；
5. File List；
6. Outline；
7. Search；
8. Settings；
9. Selection Toolbar；
10. Table Toolbar；
11. Reader；
12. Light / Dark；
13. 900×600；
14. 200% Zoom。

Golden 用于回归，不用于要求三平台像素完全相同。

### 14.4 Menu Golden

- Typora 1.14.6 zh-CN / en-US；
- Typora 1.14.9 observation；
- Mellow macOS zh-CN / en-US；
- Mellow Windows zh-CN / en-US；
- Mellow Linux zh-CN / en-US；
- 比较 top-level、item path、order、separator、shortcut、check/enabled state；
- OS predefined 项允许平台差异。

### 14.5 30 个核心计时任务

沿用 [UX Score Gate Template](../qualification/ux-score-gate-template.md) 的 30 项，并增加以下观测字段：

- entry point；
- steps；
- time；
- errors；
- hesitation；
- shortcut success；
- undo count；
- caret jump；
- source diff；
- subjective complexity；
- screenshot/video evidence。

每个任务 Typora / Mellow 各做两轮，交换执行顺序。

---

## 15. Release Blockers

任一存在即禁止发布：

- IME 丢字、重复、提前提交；
- Caret / Selection blocker；
- Undo semantic corruption；
- Save / Recovery / External Conflict 数据损坏；
- Table data loss；
- Image path/file loss；
- Source Fidelity fail；
- 10MB 不可编辑；
- PDF CJK garble；
- Clipboard P0 blocker；
- Menu 高频入口缺失或快捷键冲突；
- Windows / Linux 真机 Journey 未通过；
- UX Score < 92；
- Live Editing < 24/25；
- Caret / IME / Undo < 15/15；
- File Safety < 5/5；
- 未完成 Typora 用户迁移盲测。

---

## 16. 完成定义

每个 P0 Feature 必须同时满足：

```text
Functional
+ Typora Experience Contract
+ Correct Entry Point
+ Default State
+ Windows
+ macOS
+ Linux
+ zh-CN
+ en-US
+ Keyboard
+ Mouse
+ Accessibility
+ IME
+ Caret / Selection
+ Undo / Redo
+ Source Fidelity
+ Performance Budget
+ Automated Tests
+ Manual Golden Journey
= PASS-E
```

任何一项缺失，状态只能是 IMPL / AUTO / platform-partial，不能写“已完成对标”。

---

## 16.1 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-24 | 移除 Split Mode（Source｜Preview） | 产品决策：与 WYSIWYG「编辑即预览、单一真源」理念冲突。删除 SplitPreview 组件、split.* 命令、scrollBridge 引擎扩展（含 9 测试）、core.ts 滚动桥三方法、Split 样式与 i18n key；Reader 模式不受影响。门禁：10 包测试全过 + 16 包 build clean |

---

## 17. 历史实现记录的治理

旧版 Master Plan 中 2026-08-22 至 2026-08-23 的 R1–R3、Large File、IME、Sidebar、File Link、Image Upload 等记录仍是有价值的实现证据，但从本版本起：

1. 不再把时间流水账放在主施工路径中；
2. 相关实现通过 Git history、tests 和 parity ledger 追踪；
3. 旧“G1–G9 代码级闭环”只表示 IMPL/AUTO，不自动表示 PASS-E；
4. 新进度只更新对应 Work Package、状态码和证据链接；
5. 不允许继续追加没有验收状态的长日志。

---

## 18. 研究与证据入口

### 18.1 Typora 官方

- https://typora.io/releases/stable
- https://support.typora.io/Quick-Start/
- https://support.typora.io/Shortcut-Keys/
- https://support.typora.io/File-Management/
- https://support.typora.io/Search/
- https://support.typora.io/Outline/
- https://support.typora.io/Table-Editing/
- https://support.typora.io/Images/
- https://support.typora.io/Upload-Image/
- https://support.typora.io/Copy-and-Paste/
- https://support.typora.io/Focus-and-Typewriter-Mode/
- https://support.typora.io/Markdown-Reference/
- https://support.typora.io/Export/
- https://support.typora.io/What%27s-New-1.14/

### 18.2 仓库实测与门禁

- [Typora 菜单 dump](../../tests/benchmark/fixtures/typora-menu-dump.txt)
- [Desktop UI 历史审查](../qualification/ui-review-2026-08-13.md)
- [UX Score Gate](../qualification/ux-score-gate-template.md)
- [真实桌面执行包](../qualification/real-desktop-execution-bundle.md)
- [Runtime Matrix Evidence](../qualification/runtime-matrix-evidence-2026-08-18.md)
- [Runtime Qualification 状态](../../tests/qualification/README.md)

---

## 19. 已确认决策

以下产品级决策已经确认：

1. **基线**：正式基线固定 Typora 1.14.9（build 7785），1.14.6 仅作历史参考；
2. **菜单**：移除 Mellow 独立“插入”顶层菜单，恢复 Typora 顶层顺序；
3. **默认 UI**：Sidebar / Status Bar / Live Line Numbers 默认隐藏，单 Tab 自动隐藏；
4. **Sidebar**：高级过滤、排序、最近和固定文件夹默认收进 hover/action menu；
5. **Better 保留**：Reader、Command Palette、Slash、Recovery Compare、Large File（Split 已于 2026-08-24 移除）；
6. **完成口径**：现有“代码完成”统一降为 IMPL/AUTO，只有三平台真机 + UX Gate 后可标 PASS-E；
7. **实施顺序**：严格按 P0 → P8，不先做新增 Feature。

已从 **P0 Baseline 与证据治理** 开始实施。

---

## 20. 最终目标

Mellow V1 的最终状态应当是：

> Typora 用户无需学习新的基础写作方式；默认界面同样克制；菜单、快捷键、Sidebar、Table、Image、Clipboard、Search、Theme、Export 都能在预期位置完成；Live Markdown、Caret、IME、Undo 和文件安全达到正式 Gate；Reader、Recovery、Large File 和开放扩展在不增加默认复杂度的前提下提供明确优势。

在此之前，产品只能描述为：

> **“以 Typora 体验为目标的 Mellow”**

只有 P8 全部通过后，才允许描述为：

> **“与 Typora 1.14.9 核心体验一致，并在安全、中文输入、大文件、阅读和跨平台一致性上更优。”**
