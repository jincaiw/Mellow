# Mellow ↔ Typora 完全对标实施方案（V7.0 · 最终版 · 待确认）

> 文档状态：**待确认；确认后即成为施工依据**
> 方案版本：**V7.0（最终版）** — 归并 V3.0 / V4.x / V5 / V6 与 v1.4.x–v1.5.5 全部真机反馈轮次
> 更新日期：2026-09-11
> 代码审计基线：`079cd5d`（tag **v1.5.5**）
> 产品验收基线：**Typora 1.14.9（build 7785）**；1.14.6 仅历史参考
> 语言范围：简体中文（zh-CN，默认）+ English（en-US）
> 验证环境：macOS 本机真实桌面同机对照；Windows / Linux 由 GitHub Actions 真实桌面环境执行
> 文档角色：Typora 对标工作的**唯一权威实施方案**
> 实施约束：严格按 W0 → W8 推进；W8 全部通过前不得宣称「完全一致或更优」

---

## 0. 一页结论

### 0.1 目标定义

Mellow 的目标不是「具备与 Typora 类似的功能」，而是：

> **让 Typora 用户在 Mellow 中以相同心智、相同或更少步骤、相同快捷键、不更差的编辑手感完成核心任务，并在 IME、文件安全、Source Fidelity、大文件、阅读模式与跨平台一致性上明确更优。**

### 0.2 当前判定（v1.5.5）

经过 v1.4.0 → v1.5.5 共 14 个版本的连续对标（含 V4 四轮、V5 一轮、V6 一轮及 5 轮真机反馈），**结构性差距已基本关闭**：

| 维度 | V4.0 判定（2026-09-04） | V7.0 判定（2026-09-11 @ v1.5.5） | 说明 |
|---|---|---|---|
| 菜单顶层结构 | PASS-B | **PASS-B** | 三平台顶层已与 Typora 一致（macOS 9 个 / Win·Linux 7 个） |
| 菜单条目完整度 | FAIL | **PASS-B** | 仍有 3 处真实缺失（见 §5.1） |
| 快捷键 | FAIL（9 处偏离） | **PASS-B** | 9 处已纠偏；剩 6 处偏离 + 2 处缺失（见 §5.2） |
| 桌面 UI / 布局 | 未 PASS-E | **PASS-B** | 默认克制已达标；存在 1 个真实缺陷 + 3 处裁决项 |
| 侧边栏 | 能力缺口明确 | **PASS-B** | watcher/虚拟化/键盘已补齐；**File List 模式整体缺失** |
| 编辑体验 | macOS 部分证据 | **AUTO / MAC** | 15 状态矩阵与 IME guard 已大面积补齐；跨应用真机未闭环 |
| 排版与渲染 | 未评估 | **PASS-B** | 渲染真值已到位（v1.5.0 指纹治理后）；**默认值三处自相矛盾** |
| 三平台 | 构建/启动通过 | **IMPL** | Linux 真机 IME 已通；Windows 仍为诊断级 |
| Release Gate | 空白 | **NOT_TESTED** | UX Score 与 30 任务仍空白 |

`tests/parity/typora-parity-ledger.json` 看板：**32 项中 PASS-E = 0**，AUTO 28 / MAC 2 / IMPL 1 / NOT_TESTED 1。

### 0.3 剩余差距的三类性质

**这是本方案最重要的判断** —— 剩余工作不是「功能不够多」，而是三类不同性质的问题：

| 类别 | 性质 | 典型项 | 处置 |
|---|---|---|---|
| **A. 真实缺失** | Typora 有、Mellow 没有 | 重新打开关闭的文件（⌘⇧T）、File List / Articles 侧栏模式（⌃⌘2）、macOS 标题栏字数、View→状态栏开关、单图段落居中、Insert Local Images… | 必须补齐，属 E 级 |
| **B. 真值不一致** | 两边都有，但对不上 | 缩进/减少缩进方向相反、macOS 全屏键位、排版默认值三处不一致、Windows 新建窗口双标题栏、侧栏模式菜单死代码 | 必须修正，属缺陷 |
| **C. 验收未闭环** | 功能在，但没证据 | UX Score ≥92、30 任务计时、三平台真机矩阵、跨应用剪贴板、PicGo 真实链路、三平台视觉 Golden | 必须执行，属 Gate |

### 0.4 实施顺序（确认后固定）

```text
W0 证据治理与真值固化（含三平台参考机复核）      ← 前置，不再新增功能
→ W1 菜单 / 快捷键 / 命令单一真源收口            ← 影响全部用户路径
→ W2 桌面 UI 与布局收口（缺陷修复 + 裁决项落地）
→ W3 侧边栏深度对标（File List 重建 + 交互真值）
→ W4 编辑体验与排版真值收口
→ W5 功能域收口（文件 / 图片 / 剪贴板 / 导出 / 主题）
→ W6 三平台 Native Adapter 收口
→ W7 真机、效率、盲测
→ W8 Release Gate 与结论发布
```

**冻结条款**：W0–W7 期间只做对标收敛与缺陷修复，不新增 Typora 之外的功能；任何新增必须经用户单独裁决并登记 D 表。

---

## 1. 本版定位与历史归并

### 1.1 版本归并关系

| 历史文档 | 角色 | 归并方式 |
|---|---|---|
| `typora-parity-master-plan.md`（V3.0） | 产品合同来源 | §2–§7 合同被本版继承并更新 |
| `typora-parity-final-plan-v4.md`（V4.0–V4.6） | 施工包 + 决策记录 | §8 工作包 + D 表被本版继承并重排 |
| `typora-parity-v5-plan.md` + `typora-parity-v5-truth-table.md` | 渲染/侧栏视觉对标 | 并入 §5.7 与 §7.3 |
| `typora-parity-v6-plan.md` | 渲染层指纹治理 + 壳 UI | 并入 §5.7（已落地）与 §8.W2 |
| `typora-parity-b1-sdi-plan.md` + `sdi-truth-table-v1.md` | SDI 单文档窗口真值 | 并入 §3.2 与 §5.3 |
| `markdown-syntax-demo-parity-validation-plan.md` | 全语法样例专项 | 保留为独立专项证据 |

> 自本版起，上述前六份文档统一移入 `docs/plans/archive/`，**不再作为施工依据**，仅保留历史证据价值。

### 1.2 本版相对 V4.0 的实质变化

1. **判定基准从「2026-09-01 审计」推进到「2026-09-11 @ v1.5.5」** —— V4 的 18 项 G4 缺陷、V5 的渲染残差、V6 的渲染层陈旧问题均已随 v1.4.x–v1.5.5 关闭，本版不再重复。
2. **差距性质重新分类**（§0.3）—— 从「结构性缺失」转为「缺失 / 不一致 / 未验收」三类，施工重心从「实现」转向「对齐 + 证据」。
3. **引入 Typora 官方真值作为一手依据** —— §3 的参考模型基于 Typora 官方文档（Shortcut Keys / File Management / Outline / Search / Word Count / Images / About Themes / What's New 1.14）与仓库内 1.14.9 菜单 dump 交叉验证，替代此前的推断。
4. **新增 3 项 V4 未识别的真实缺失** —— Reopen Closed File、File List / Articles 模式、macOS 标题栏字数。
5. **新增排版默认值三处自相矛盾**（fontSize / lineHeight / writingWidth 各有两个值）—— V5 只发现了一处。

---

## 2. 权威依据与冲突裁决

### 2.1 文档优先级

| 优先级 | 文档 | 本方案使用方式 |
|---|---|---|
| P0 | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 产品范围、目标、Release Gate 最终依据 |
| P1 | `docs/specs/desktop-ui-design-spec.md` | 桌面壳、侧边栏、布局与低干扰规则 |
| P1 | `docs/specs/live-markdown-engine-spec.md` | Live Editing、Caret、IME、Undo 与节点状态 |
| P1 | `docs/specs/table-editing-spec.md` | 表格 GUI、Minimal Patch 与 IME |
| P1 | `docs/specs/image-workflow-spec.md` | 图片输入、路径、批处理与文件操作 |
| P1 | `docs/specs/clipboard-smart-paste-spec.md` | 多格式复制与 Smart Paste |
| P1 | `docs/specs/document-file-safety-spec.md` | Source Fidelity、保存、恢复与外部冲突 |
| P1 | `docs/specs/ime-test-plan.md` | 三平台真实输入法矩阵 |
| P1 | `docs/specs/performance-benchmark-spec.md` | 同机对照与性能口径 |
| P2 | ADR-0001/0003/0005/0006/0007/0009/0011/0015/0016/0019/0022/0023 | 已接受决策，本方案不推翻 |
| P3 | 本方案 | 施工顺序、验收拆解、依赖与证据治理 |

### 2.2 冲突裁决

1. **规范基线 = Typora 1.14.9（build 7785）**；1.14.6 仅历史参考，不参与 diff 与 Release 判定。
2. **Typora 官方 stable 当前为 1.14.x，不存在 1.15**，无需改基线。
3. **Split Mode 已移出 V1**（2026-08-24 产品决策），不得通过菜单、命令、设置或验收项重新引入。
4. **需求冲突以 PRD V1.2 FINAL 为准**；spec 与 PRD 冲突时先报告再动手，不得擅自裁决。
5. **架构变更必须新增 ADR**，禁止直接改写 Accepted ADR。
6. **Typora 官方文档与实机行为冲突时以实机为准**，并在 D 表记录（例：macOS Replace 键位）。

### 2.3 不在本方案变更的架构

保留 MarkEdit CoreEditor；Markdown 纯文本唯一真源；CodeMirror 6 + Lezer；Live Markdown 走 Decoration / Widget（**从不 replace 文本**）；React + TypeScript 负责 Desktop UI；Rust 负责 System Core；Editor / UI 不直接依赖 Tauri；平台差异只在 Adapter；Tauri 2 锁定（ADR-0019 触发条件成立时新增 ADR）；AI 仅可选扩展。

---

## 3. Typora 1.14.9 参考模型（对标对象）

> 依据：Typora 官方文档（Shortcut Keys / File Management / Outline / Search / Word Count / Images / About Themes / What's New 1.14，2026-09 检索）+ 仓库内 `tests/benchmark/fixtures/typora-menu-dump.txt`（macOS 1.14.9 真机提取）。
> 标注规则：✅ = 官方文档或真机 dump 定论；🟡 = 需参考机实测确认。

### 3.1 五个特点：Typora 的竞争力结构

Typora 的优势不是单个 Markdown 功能，而是**五层体验同时成立**：

| 层 | Typora 的做法 | 可观察判据 |
|---|---|---|
| **1. 单一编辑表面** | 正文与预览不分离，语法标记按 Caret 智能显隐 | 不存在「编辑区 / 预览区」两个区域；`#`、`**` 等标记在光标进入时才出现 |
| **2. 低干扰桌面壳** | 窗口控件、菜单、侧边栏退后，文档成为第一视觉 | 打开文件后第一眼是正文；侧栏默认不占位；无永久格式工具条 |
| **3. 结构化编辑 GUI** | 表格、图片、链接、公式、Mermaid 无需切换到富文本模型 | 表格可在原位编辑、Tab 导航；图片可直接拖拽缩放 |
| **4. 文件型工作流** | 打开单文件即加载父目录，Tree / List / Outline / Search 紧贴文档 | 「打开一个 md」后侧栏立刻有该文件夹内容，无需「打开文件夹」 |
| **5. 可预测输出** | 复制、粘贴、主题、PDF、HTML、Pandoc 与 Markdown 原文兼容 | 源码不被静默重写；复制到 Word / Gmail 保留格式 |

### 3.2 桌面 UI 与布局真值

```text
macOS                                        Windows / Linux
┌────────────────────────────────────┐      ┌────────────────────────────────────┐
│ 交通灯 · 文件名（标题栏）· 右上角按钮 │      │ 菜单栏 · 文件名 · 窗口控制          │
├──────────┬─────────────────────────┤      ├──────────┬─────────────────────────┤
│ 侧栏      │   居中写作表面           │      │ 侧栏      │   居中写作表面           │
│（可选）   │                         │      │（可选）   │                         │
└──────────┴─────────────────────────┘      ├──────────┴─────────────────────────┤
  字数：标题栏 hover                           │ 状态栏（默认关，可开）· 左下侧栏按钮 │
                                             └────────────────────────────────────┘
```

**已定论真值（✅）**

| 项 | 真值 |
|---|---|
| 标题栏 | 系统原生标题栏；文件名显示在标题栏，**正文上方没有额外的文件名条** |
| 侧栏开关入口 | macOS：菜单栏 + **标题栏**；Windows/Linux：菜单栏 + **状态栏**（左下角） |
| 侧栏底部 | hover 侧栏时显示更多按钮；**侧栏底部**有当前文件夹的操作菜单（含 Refresh / Open Folder… / 排序） |
| 状态栏 | Windows/Linux 默认**关闭**，需在「偏好设置 → 外观 → 显示状态栏」或 View 菜单开启；macOS 无状态栏 |
| 字数统计 | macOS：hover 标题栏显示，可在「偏好设置 → 外观」设为常显；Windows/Linux：状态栏显示 |
| 工具栏 | 1.14 新增 **浮动**编辑器工具栏（Floating Editor Toolbar），从 `View → Toolbar` 或 `设置 → 外观` 开启 |
| 窗口模型 | 默认单窗口单文档（SDI）；同时存在 New Window / New Tab / Reopen Closed File 通道 ✅（mac File 菜单**无「全部关闭」**） |
| 顶栏 | 无四模式分段控件、无路径面包屑 |

### 3.3 菜单体系真值

**顶层菜单（✅）**

```text
macOS：  Typora | 文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 窗口 | 帮助     （9 个）
Win/Linux：文件 | 编辑 | 段落 | 格式 | 显示 | 主题 | 帮助                 （7 个，无「窗口」）
```

**View（显示）菜单真值（✅，官方快捷键表逐项推导）**

```text
Toggle Sidebar          Outline          Articles          File Tree
Source Code Mode        Focus Mode       Typewriter Mode
Toggle Fullscreen       Actual Size      Zoom In           Zoom Out
Switch Between Opened Documents          Toggle DevTools
（1.14 新增）Toolbar     （Search 官方文档标注 View → Search）
```

**File（文件）菜单真值（✅ 部分，来自 1.14.9 dump）**

```text
New · New Window · New Tab · Open · Open Recent（含 Reopen Closed File）·
Close · Save · Save As / Duplicate · Save All · Preference · Print / Export…
```

**段落 / 格式 / 编辑菜单真值（✅，官方快捷键表推导）**

| 菜单 | 条目 |
|---|---|
| 段落 | Heading 1–6 · Paragraph · Increase / Decrease Heading Level · Table · Code Fences · Math Block · Quote · Ordered List · Unordered List · Indent / Outdent · Link Reference · Footnote · Horizontal Rule · TOC · YAML Front Matter |
| 格式 | Strong · Emphasis · Underline · Code · Strike · Hyperlink · **Image 子菜单** · Clear Format |
| 编辑 | New Paragraph · New Line · Undo / Redo · Cut / Copy / Paste · Copy As Markdown · Paste As Plain Text · Select All · Select Line / Sentence · Delete Row (table) · Select Style Scope · Select Word · Delete Word · Jump to Top / Selection / Bottom · Find / Find Next / Find Previous / Replace |

**格式 → 图片子菜单真值（✅，Images 官方文档）**

```text
Insert Local Images…        When Insert Local Images…       Use Image Root Path
Move All Images to…         Copy All Images to…             Download All Images…
```

### 3.4 快捷键真值表（官方，三平台）

> 来源：`https://support.typora.io/Shortcut-Keys/`（2026-09 检索）。**本表是对标的唯一键位依据。**

| 分类 | 功能 | Windows / Linux | macOS |
|---|---|---|---|
| 文件 | New | `Ctrl+N` | `Cmd+N` |
| 文件 | New Window | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| 文件 | New Tab | *(不支持)* | `Cmd+T` |
| 文件 | Open | `Ctrl+O` | `Cmd+O` |
| 文件 | Open Quickly | `Ctrl+P` | `Cmd+Shift+O` |
| 文件 | **Reopen Closed File** | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| 文件 | Save | `Ctrl+S` | `Cmd+S` |
| 文件 | Save As / Duplicate | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| 文件 | Preference | `Ctrl+,` | `Cmd+,` |
| 文件 | Close | `Ctrl+W` | `Cmd+W` |
| 编辑 | New Paragraph / New Line | `Enter` / `Shift+Enter` | `Enter` / `Shift+Enter` |
| 编辑 | Copy As Markdown | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| 编辑 | Paste As Plain Text | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| 编辑 | Select Line / Sentence | `Ctrl+L` | `Cmd+L` |
| 编辑 | Delete Row (table) | `Ctrl+Shift+Backspace` | `Cmd+Shift+Backspace` |
| 编辑 | Select Style Scope / Cell | `Ctrl+E` | `Cmd+E` |
| 编辑 | Select Word / Delete Word | `Ctrl+D` / `Ctrl+Shift+D` | `Cmd+D` / `Cmd+Shift+D` |
| 编辑 | Jump to Top / Bottom | `Ctrl+Home` / `Ctrl+End` | `Cmd+↑` / `Cmd+↓` |
| 编辑 | Jump to Selection | `Ctrl+J` | `Cmd+J` |
| 编辑 | Find / Next / Previous | `Ctrl+F` / `F3` / `Shift+F3` | `Cmd+F` / `Cmd+G` / `Cmd+Shift+G` |
| 编辑 | Replace | `Ctrl+H` | `Cmd+H` 🟡 |
| 段落 | Heading 1–6 | `Ctrl+1…6` | `Cmd+1…6` |
| 段落 | Paragraph | `Ctrl+0` | `Cmd+0` |
| 段落 | Increase / Decrease Heading | `Ctrl+=` / `Ctrl+-` | `Cmd+=` / `Cmd+-` |
| 段落 | Table | `Ctrl+T` | `Cmd+Option+T` |
| 段落 | Code Fences | `Ctrl+Shift+K` | `Cmd+Option+C` |
| 段落 | Math Block | `Ctrl+Shift+M` | `Cmd+Option+B` |
| 段落 | Quote | `Ctrl+Shift+Q` | `Cmd+Option+Q` |
| 段落 | Ordered List | `Ctrl+Shift+[` | `Cmd+Option+O` |
| 段落 | Unordered List | `Ctrl+Shift+]` | `Cmd+Option+U` |
| 段落 | **Indent** | `Ctrl+[` / `Tab` | `Cmd+[` / `Tab` |
| 段落 | **Outdent** | `Ctrl+]` / `Shift+Tab` | `Cmd+]` / `Shift+Tab` |
| 格式 | Strong / Emphasis / Underline | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | `Cmd+B` / `Cmd+I` / `Cmd+U` |
| 格式 | **Code** | `Ctrl+Shift+`` ` | `Cmd+Shift+`` ` |
| 格式 | **Strike** | `Alt+Shift+5` | `Control+Shift+`` ` |
| 格式 | Hyperlink | `Ctrl+K` | `Cmd+K` |
| 格式 | Image | `Ctrl+Shift+I` | `Cmd+Control+I` |
| 格式 | Clear Format | `Ctrl+\` | `Cmd+\` |
| 显示 | Toggle Sidebar | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| 显示 | Outline | `Ctrl+Shift+1` | `Cmd+Control+1` |
| 显示 | **Articles** | `Ctrl+Shift+2` | `Cmd+Control+2` |
| 显示 | File Tree | `Ctrl+Shift+3` | `Cmd+Control+3` |
| 显示 | Source Code Mode | `Ctrl+/` | `Cmd+/` |
| 显示 | Focus / Typewriter | `F8` / `F9` | `F8` / `F9` |
| 显示 | Toggle Fullscreen | `F11` | `Cmd+Option+F` |
| 显示 | Actual Size / Zoom In / Zoom Out | `Ctrl+Shift+0` / `=` / `-` | *(不支持)* |
| 显示 | Switch Between Opened Documents | `Ctrl+Tab` | `Cmd+`` ` |
| 显示 | Toggle DevTools | `Shift+F12` | — |

### 3.5 侧边栏真值

**信息架构（✅）** —— Typora 的侧栏承载三种面板：

```text
Files 侧栏 ─┬─ File Tree   （以树形展示已加载文件夹）
            └─ File List    （以列表展示已加载文件夹，即 View → Articles）
Outline 面板 （当前文档标题大纲）
Search 面板  （跨文件全局搜索）
```

**交互真值（✅）**

| 维度 | 真值 |
|---|---|
| 开关入口 | 菜单栏；macOS 标题栏；Windows/Linux 状态栏 |
| 面板切换 | `View → Outline / Articles / File Tree`，或 macOS 侧栏顶部 Search 图标；Windows/Linux 滚动到侧栏顶部显示搜索框 |
| 文件过滤 | 1.14 新增：可配置显示隐藏文件/文件夹、显示非 Markdown 文件、自定义显示/隐藏规则 |
| 排序 | 5 组：Group by Folder（开关）· natural order · alphabet order · modified date · created date（各升降序） |
| 文件夹监听 | **自动监听文件夹变化**，文件移动/删除时树与列表自动更新；异常时可用侧栏底部菜单的 `Refresh` 手动刷新 |
| 右键菜单 | Open · Open in New Window · Undo File Operations · New File/Folder · Duplicate · Rename · Delete (Move to Trash) · Copy File Path · Reveal in Finder/Explorer |
| 拖拽 | 树内拖拽移动；**Finder/Explorer ↔ 侧栏双向拖拽**；侧栏文件拖到正文**插入指向该文件的链接** |
| 文件操作撤销 | **仅最近一次**文件操作可撤销；Windows/Linux 删除文件不可撤销；move 撤销在目标已存在时可能失败 |
| Recent Locations | 每个文件夹 hover 显示 **trash 图标**（移除）与 **pin 图标**（固定）；固定项同时进入 `File → Open Recent` 与 Open Quickly |
| 键盘 | 1.14 新增：File Tree 支持键盘导航 |
| 默认展开 | 🟡 需参考机实测 |

**Outline 面板真值（✅）**

| 维度 | 真值 |
|---|---|
| 内容 | 当前文档的 Headers，按 Header 级别构建缩进与继承关系 |
| 入口 | `View → Outline`；macOS 右上角按钮；Windows/Linux 左下角按钮 |
| 当前项标记 | **滚动或编辑时，当前活动章节的 Header 会在面板上被标记** |
| 跳转 | 点击条目跳转到目标 Header |
| 过滤 | 支持关键词过滤/定位 |
| 形态 | **Flat outline / Collapsible outline** 两种，可在「偏好设置」或**面板右键菜单**切换 |
| 右键菜单 | `Highlight Current Header`（找不到当前项时快速定位） |
| 自动编号 | **非内置选项**，官方通过自定义 CSS 实现 → PRD 的 auto-number 属 Mellow 增强 |
| 导出 | PDF 自动生成 outline；HTML 可在偏好设置中配置是否包含 outline 面板 |

**Search 面板真值（✅）**

| 维度 | 真值 |
|---|---|
| 文档内查找 | `Cmd/Ctrl+F` 打开 Find 面板；`Cmd/Ctrl+H` 打开 Find and Replace |
| 正则替换 | 启用正则时，替换串中的 `$0` `$1` `$3`… 被括号捕获组替换 |
| 跨文件搜索 | 侧栏 search 图标 / `View → Search` / `Cmd(Ctrl)+Shift+F` |
| 开关 | case sensitive / insensitive · match whole word · match with regular expression |
| 标签 | 不支持 `#tags`，但可用全局搜索 `#tags` 找到匹配文件 |
| Open Quickly | `Cmd+Shift+O` / `Ctrl+P`，对当前文件夹与最近文件做模糊搜索 |

### 3.6 编辑体验真值

| 维度 | 真值 |
|---|---|
| 编辑表面 | 单一表面，无编辑/预览分区 |
| 标记显隐 | 语法标记按 Caret 位置智能显隐；标记显隐**不改变文档位置** |
| 结构编辑 | 表格原位编辑 + Tab 导航；列表 Enter 续写、Tab/Shift+Tab 缩进；任务列表可点击勾选 |
| Caret / Selection | 平台原生语义（Home/End、词移动、双击选词、三击选段） |
| Undo / Redo | 一次用户动作 = 一次撤销（含 GUI 操作） |
| 模式 | Source Code Mode（`Cmd/Ctrl+/`）、Focus Mode（F8）、Typewriter Mode（F9） |
| 字数 | 排除用于格式的 Markdown 语法（如列表 `-`）；字符数则包含；**一个中文字符计为一个词** |
| 智能标点 | 有，可开关 |
| 拼写检查 | 有，可开关 |

### 3.7 结构化 GUI 真值

| 域 | 真值 |
|---|---|
| 表格 | 原位编辑、Tab 在单元格间移动、末格 Tab 加行；行列增删移动；对齐；Tidy（唯一允许重排空格的命令） |
| 图片插入 | 写 Markdown / 拖拽（支持多图）/ `Format → Image → Insert Local Images…` / 剪贴板粘贴 |
| 图片路径 | 默认用原路径；可开「Use relative path if possible」「Ensure `./` prefix」「Auto escape image URL」；YAML 支持 `typora-copy-images-to`、`typora-root-url` |
| 图片文件操作 | `Delete Image`（删引用 + 磁盘文件）· `Move Image to`（含重命名）· `Copy Image to`；菜单栏 `Move All / Copy All / Download All Images` |
| 图片对齐 | **Typora 不支持图片对齐**（官方明示），但**单图独占段落时默认居中**（`p > img:only-child { display:block; margin:auto }`） |
| 图片缩放 | 支持（拖拽 / 尺寸设置） |
| 图片上传 | 支持 PicGo / 自定义命令 / iPic 等，可「插入时上传」或「上传所有本地图片」 |
| 代码块 | 语言标识、语法高亮、复制 |
| 数学 | 行内 `$…$` / 块级 `$$…$$`，MathJax 兼容 |
| Mermaid | 代码围栏渲染，错误态不破坏源码 |
| 脚注 / TOC / Alerts / YAML | 均有；TOC 通过 `[TOC]` 插入 |

### 3.8 输出、剪贴板与主题真值

| 域 | 真值 |
|---|---|
| 导出 | PDF（自动含 outline）· HTML（可配置是否含 outline 面板）· Image · Pandoc 多格式 · 打印 |
| 复制 | `Copy As Markdown`（`Cmd/Ctrl+Shift+C`）、`Paste As Plain Text`（`Cmd/Ctrl+Shift+V`）、复制为 HTML 代码等 |
| 主题数量 | **6 个内置主题**，通过菜单栏 Themes 菜单选择 |
| 主题机制 | 每个主题 = 主题文件夹下的一个 `.css`；文件命名 kebab-case，菜单自动转成可读标题（`my-first-typora-theme.css` → "My First Typora Theme"） |
| 明暗分离 | 可为 Light Mode 与 Dark Mode **分别设置主题**（macOS/Windows） |
| 主题文件夹 | 偏好设置面板的 `Open Theme Folder` 按钮 |
| 自定义 CSS | `base.user.css` / `[theme].user.css`（Add Custom CSS） |
| 获取主题 | 官方 Typora Theme Gallery（`theme.typora.io`），Themes 菜单提供入口 🟡 |

### 3.9 参考模型的一句话总结

> Typora 的一致性来自「**默认极简 + 入口可预期 + 结果可预测**」：默认状态下只有正文；需要什么时，功能出现在菜单里它该在的位置；任何操作都不静默改写 Markdown 原文。

---

## 4. 「一致或更优」的判定模型

### 4.1 三级目标

| 等级 | 定义 | 允许结果 |
|---|---|---|
| **E — Equivalent** | Typora 核心任务必须体验等价 | 步骤不更多、默认一致、快捷键一致、结果一致、性能不更差 |
| **B — Better** | Mellow 明确优于 Typora | 必须有测试与用户验证，不得靠功能数量自评 |
| **D — Deliberate Difference** | 有意不同 | 品牌视觉、原创主题、Reader / Palette / Slash 等不破坏 Typora 心智的增强 |

### 4.2 Experience Contract（每个对标项必须同时记录）

```text
Feature
+ Entry Point        + Default State     + Keyboard
+ Mouse / Touchpad   + Caret / Selection + IME
+ Undo / Redo        + Visual Feedback   + Markdown / File Result
+ Performance        + Accessibility     + Windows / macOS / Linux Result
= Experience Contract
```

只满足 `Feature` 不得标记完成。

### 4.3 状态码

| 状态 | 含义 |
|---|---|
| ABSENT | 未实现 |
| IMPL | 已有实现，未形成充分验收证据 |
| AUTO | 自动化测试通过，未完成真机体验验收 |
| MAC / WIN / LINUX | 仅该平台真机通过 |
| PASS-B | 基本一致，存在已记录小差异 |
| **PASS-E** | 三平台 Experience Contract 全部通过 |
| PASS-BETTER | Better 项通过对照或盲测 |
| BLOCKED | 触发 Release Blocker |
| NOT_TESTED | 尚未执行验收 |

最终「Done」只能是 `PASS-E` 或 `PASS-BETTER`。

### 4.4 证据等级（从高到低）

1. 同机同文档真实 Typora / Mellow 双应用对照；
2. 三平台真实桌面手工或自动化交互；
3. AX 树、截图、视频、菜单 dump、文件 diff、导出产物；
4. E2E / Integration / Unit 自动化；
5. 代码阅读；
6. 文档声明。

**低等级证据不能替代高等级 Gate。** 「有 1400 个测试」不能替代 Windows 微软拼音真机验证。

---

## 5. 当前实现审计（v1.5.5 @ `079cd5d`）

> 本节以**代码为唯一依据**（`docs/` 自述滞后于代码处已标注）。差距 ID 前缀 `G7-`，供后续跟踪。

### 5.1 菜单（G7-MENU）

**已达标**：三平台顶层结构一致（`packages/commands/src/menuSchema.ts`：macOS `app+file+edit+paragraph+format+view+theme+window+help`，Win/Linux 无 `app`/`window`）；单一真源 `MENU_SCHEMA` → `toNativeMenuSpec()` → Rust `menu.rs` 只做 materialization（ADR-0023）；主题菜单从 `BUILTIN_THEMES` 派生；右键菜单 13 类条目并走 `dispatchCommand`。

| ID | 差距 | Typora 真值 | Mellow 现状 | 判定 |
|---|---|---|---|---|
| **G7-MENU-01** | **File 菜单缺「重新打开关闭的文件」** | `Reopen Closed File`，`Cmd/Ctrl+Shift+T`，1.14.9 dump 存在 `reopenClosedFilesMenu:` | schema 无此条目；B1（SDI）时删除 `tabs.reopenClosed` 后未以「新窗口打开」形式恢复。`grep reopenClosed` 仅命中 docs | **FAIL（E 级缺失）→ 已修复（W1.1）** |
| **G7-MENU-02** | **View 菜单缺「Articles / 文库」（File List 模式）** | `View → Articles`，`Ctrl+Shift+2` / `Cmd+Control+2` | schema 只有 `view.sidebar.outline`（⌃⌘1）与 `view.sidebar.fileTree`（⌃⌘3）；`FileListService` 随 V5-A1 退役（`App.tsx:230`），`FileList.tsx` 保留但未挂载 | **FAIL（E 级缺失）→ 已修复（W1.5）** |
| **G7-MENU-03** | View 菜单缺「状态栏」开关 | Typora Win/Linux 可在 View 菜单开启状态栏 | 状态栏开关不在菜单中 | FAIL → 已修复（W1.6） |
| **G7-MENU-04** | 段落菜单尾部挂 7 个 Slash 插入命令 | Typora 段落菜单无此分组 | `insert.heading/list/task/quote/code/math/mermaid` 挂在段落菜单末尾（`menuSchema.ts:296-302`），破坏菜单可预期性 | **FAIL → 已修复（W1.3）** |
| **G7-MENU-05** | Edit 菜单「拼写和语法检查 / 替换」子菜单**内容不完整** | 真机 nib 提取：`Substitutions` 子菜单含 Convert on Input / Convert on Rendering / Smart Quotes / Smart Dashes / Text Replacement；`Spelling and Grammar` 含 Check Spelling While Typing / Check Grammar With Spelling / Correct Spelling Automatically / Check Document Now / Learn / Unlearn Spelling | Mellow 保留子菜单结构（正确），但每子菜单仅 1 项（`edit.spellcheck.toggle` / `edit.smartPunctuation.toggle`） | **部分 → 内容缺口登记为 G7-EDIT-04**（W5 补齐，结构无需再改） |
| **G7-MENU-06** | Edit 菜单缺 `New Paragraph` / `New Line` | Typora Edit 菜单含这两项（Enter / Shift+Enter） | 无对应菜单条目 | ✅ **已修复（2026-09-13）** —— Edit 菜单顶部新增 `edit.newParagraph`（新段落）/ `edit.newLine`（新行），位于 Undo 之前，与官方表顺序一致。<br/>**一手证据**：官方 Shortcut Keys 页（2026-09-06 更新）Edit 段开头确为 **New Paragraph（Enter）/ New Line（Shift+Enter）**。<br/>**语义由实测确定（重要）**：Mellow 的 Enter 只插单个 `\n`，而单 `\n` 在 Markdown 中是**段内软换行**（渲染同一段落：行高 32px / 行距 32px 紧凑）；真分段需空行（`\n\n`：行高 38px / 段间距 64px）。故 **New Paragraph 插 `\n\n`、New Line 插 `\n`**，均不复用 Enter。<br/>**不声明 shortcut**：官方给的 Enter / Shift+Enter 若注册为菜单 accelerator 会全局吞掉回车键，故只暴露菜单项。<br/>**Enter 本身不改** —— 输入路径最高风险面（同 D-V 判据），差异登记为 **G7-EDIT-07**。<br/>**实现陷阱（已守护）**：`applyToView` 空选区默认是**块级作用于整行**，会让 New Paragraph 把当前行替换掉（`abc` → `\n\n`）。已按 `referenceLink` 先例加 caret 插入分支，并由单测「行中调用：断成两段而非替换整行」守护。<br/>测试：`format-new-paragraph-line.test.ts` 10 例 + `ux-flows-verify.mjs` 3 项（含行高 > 32 的分段渲染断言）。 |
| **G7-MENU-07** | 格式 → 图片子菜单不完整 | `Insert Local Images…` / `When Insert Local Images…` / `Use Image Root Path` / `Move All` / `Copy All` / `Download All` | 仅有 `image.uploadAll/downloadRemote/moveAll/copyAll`（`menuSchema.ts:328-333`） | **部分修复（W1.7）→ 余项已复核并登记 D（2026-09-13）**：已补 `Insert Local Images…`（+ 子菜单首位 `insert.image`）。<br/>① **Use Image Root Path**：**行为本就等价** —— `insertLocalImage`（`App.tsx:1530-1536`）在同根时**默认输出相对路径**，与 Typora 该选项的默认态一致；无需菜单开关（Typora 亦为默认开）。登记 **D-AA**。<br/>② **When Insert Local Images…**：语义（插入时复制到资源目录 / 上传 / 保留原路径）已由**设置面板**承载 —— `image.assetDir` + `image.uploadService`（`settings/src/index.ts:182-193`）。以设置项而非菜单项承载，避免同一语义两处入口。登记 **D-AB**。 |
| **G7-MENU-08** | `file.openSnapshotsFolder` 位于 File 菜单末位 | Typora File 菜单无此高频位 | 应在「文件信息」或高级子菜单（V4 §7.2 已裁决，未落地） | **D（有意差异）**：置于 File 菜单末尾独立分组（separator 后），属 Mellow 恢复能力入口，不插入 Typora 高频组；已由 `verify-menu-contract.mjs` §7.2 契约锁定 |
| **G7-MENU-09** | View 菜单顺序与 Typora 不同 | Toggle Sidebar → Outline → Articles → File Tree → Source → Focus → Typewriter → Fullscreen → Zoom → Switch Documents → DevTools | Mellow 以 Command Palette 打头，分组顺序不同 | FAIL → 已修复（W1.5） |
| **G7-MENU-10** | 菜单护栏只做存在性 + 顶层顺序 | — | `tests/parity/verify-menu-contract.mjs` 未覆盖条目顺序 / separator / accel / checkState / 文案 | FAIL（治理）→ 已修复（W1.10：新增 File 菜单 31 槽位契约 / View 顺序断言 / checkState 四来源 / 双语块定界缺陷修复） |

### 5.2 快捷键（G7-KEY）

V4 暴露的 Win/Linux 9 处偏离**已全部纠偏**（`menuSchema.ts` 逐条核对官方表通过）。剩余：

| ID | 项 | Typora 真值 | Mellow 现状 | 判定 |
|---|---|---|---|---|
| **G7-KEY-01** | 缩进 / 减少缩进**方向相反** | Indent = `Ctrl+[` / `Cmd+[`；Outdent = `Ctrl+]` / `Cmd+]` | `paragraph.indentMore` = `Ctrl+]` / `Cmd+]`；`indentLess` = `Ctrl+[` / `Cmd+[`（`menuSchema.ts:281-282`） | **FAIL → 已修复（W1.2）** |
| **G7-KEY-02** | Reopen Closed File 键位缺失 | `Ctrl+Shift+T` / `Cmd+Shift+T` | 无 | **FAIL → 已修复（W1.1）** |
| **G7-KEY-03** | Articles 键位缺失 | `Ctrl+Shift+2` / `Cmd+Control+2` | 无 | **FAIL → 已修复（W1.5）** |
| **G7-KEY-04** | macOS 全屏 | `Cmd+Option+F` | `Ctrl+Cmd+F`（`menuSchema.ts:358`） | FAIL → 已修复（W1.9） |
| **G7-KEY-05** | macOS 行内 Code | `Cmd+Shift+`` ` | `Ctrl+`` `（`menuSchema.ts:313`） | FAIL → 已修复（W1.9） |
| **G7-KEY-06** | macOS Replace | `Cmd+H` 🟡 | `Cmd+Alt+F`（`menuSchema.ts:213`） | **D（有意差异）**：`Cmd+H` 被 macOS 系统「隐藏应用」占用，沿用 `Cmd+Alt+F`；见 §12 D-Q |
| **G7-KEY-07** | Find Next（Win/Linux） | `F3` / `Enter` | 主绑定 `Ctrl+G` / `Cmd+G`；`F3` / `Shift+F3` 别名**两平台均已注册**（`App.tsx:4477-4478`）；`Enter` 由 CM 查找面板接管 | ✅ **已复核（2026-09-12）** —— `tests/e2e/block-shortcuts-verify.mjs` 实测 18/18：Enter 连续推进匹配（0→11）、F3 在编辑区聚焦时推进（含环绕）。<br/>**边界（如实记录）**：dev 环境无原生菜单 accelerator 通道，故「查找输入框聚焦时按 F3」无法验证；真机由菜单快捷键分发，不作断言 |
| G7-KEY-08 | Switch Between Opened Documents | `Ctrl+Tab` / `Cmd+`` ` | 无（SDI 下语义变为窗口切换） | D 或实现 |
| G7-KEY-09 | New Tab | macOS `Cmd+T` | 无（SDI 决策移除） | D（需显式登记） |
| G7-KEY-10 | Actual Size / Zoom In / Out（macOS） | 官方「不支持」 | Mellow 提供 `Cmd+Shift+0/=/-` | D（增强） |

**W1.2 键位方向的证据链（重要）**：`tests/benchmark/fixtures/typora-menu-dump.txt` 的
`keymap.macDefault` / `keymap.pcDefault` 段显示 `Cmd-[ => indentLess`、`Cmd-] => indentMore`，
与官方 Shortcut Keys 页「Indent = `Ctrl+[` / Outdent = `Ctrl+]`」表面相反。二者不矛盾：
前者是 CodeMirror 的**编辑器内部默认键位**，后者是 Typora **原生菜单 accelerator**；
macOS/Windows 的原生菜单键位在事件分发早于 WebView keydown，故用户实际触发的是
菜单项「Indent」。**以官方 Shortcut Keys 表为准**（该表明确说明「可在菜单项右侧看到键位」）。

### 5.3 桌面 UI 与布局（G7-SHELL）

**已达标**：默认 Live 模式；Sidebar / StatusBar 默认隐藏并记忆；单 Tab 栏自动隐藏（SDI）；写作限宽内部化到 iframe `.cm-content`；窗口几何记忆（Rust `geometry.rs`）；Windows 自绘标题栏（主窗口）；macOS 回归原生标题栏；浮动大纲。

| ID | 差距 | 证据 | 判定 |
|---|---|---|---|
| **G7-SHELL-01** | **Windows 新建窗口双标题栏**：`window.rs:71` 恒 `.decorations(true)`，只有主窗口走 `decorations(false)` → Windows 上新开窗口出现「系统标题栏 + 应用内 titlebar」双栏 | `src-tauri/src/window.rs:63-73` vs `lib.rs:209-232` | **已修复（W2.1）** |
| **G7-SHELL-02** | **`.editor-topbar` 常驻文件名条**：Typora 无此条（文件名在系统标题栏）；macOS 下与原生标题栏重复显示文件名 | `App.tsx:4673-4712`；`styles.css` | **已修复（W2.3，D-A = ③ 改造为纯操作条：删除居中文档名，保留侧栏/大纲两个操作槽，条高 34px 不变）** |
| **G7-SHELL-03** | **排版默认值三处自相矛盾** | fontSize：settings 16（`settings/src/index.ts:78`）vs iframe 初始 17（`bundle.ts:21`）；lineHeight：settings 1.6（`:114`）vs 运行时 1.65（`App.tsx:459,2805`）；writingWidth：settings '860'（`:107`）vs 运行时 820（`App.tsx:2812`）vs Reader 820（`styles.css:1326`） | **已修复（W2.2，`TYPOGRAPHY_DEFAULTS` 单一真源 + 三处数值交叉比对护栏）** |
| **G7-SHELL-04** | **EditorToolbar 语义与 Typora 1.14 不一致**：Typora 是**浮动**工具栏（Selection 锚定），Mellow 是常驻横向条；且仅 13 键，缺 H1 / 正文 / 表格行列 / 查找 | `packages/desktop-ui/src/EditorToolbar.tsx:14-28` | **已修复（W2.4，D-B = ① 退役常驻横条；Typora 的浮动工具栏由既有引擎级 `selectionToolbar` 承载）** |
| **G7-SHELL-05** | **macOS 侧栏切换入口不可发现**：应用内 `.titlebar` 被 CSS 隐藏（`styles.css:31-33`），☰ 在 macOS 不可见；只剩 ⇧⌘L / 菜单 / editor-topbar 左槽 | 同上 | **已修复（W2.3：`editor-topbar` 左侧按钮条件改为 `(platformMac \|\| !sidebarShown)`，macOS 恒显）** |
| **G7-SHELL-06** | **macOS 字数不可见**：Typora macOS hover 标题栏显示字数；Mellow 状态栏默认隐藏且无标题栏 hover | `StatusBar.tsx:33-35`；`App.tsx:262-265` | **已修复（W2.6）**：交付 Typora 的「始终显示」选项（`appearance.wordCount` + 标题并入字数）。hover 显隐登记 D（原生标题栏在 webview 外，需 tao titlebar tracking）。 |
| **G7-SHELL-07** | 状态栏字段缺「行数 / 字符数 / 阅读时长」 | `StatusBar.tsx:5-13` 仅 8 字段枚举；Typora 字数面板含 lines / characters / reading time | **原判定失真，已更正；真实缺口已修（W2.7）**：`formatWordCountStats` 早已输出「字 · 词 · 字符 · 行」且 `refreshStats` 追加阅读时间，面板含 7 项统计。真实缺口是字数项不可点击 → 已改为按钮并接面板。 |
| **G7-SHELL-08** | 浮动大纲尺寸/位置硬编码（240px，top/right 固定），不可拖拽/停靠 | `styles.css:860-874` | D（增强，低优先级） |

### 5.4 侧边栏（G7-SIDE）

**已达标**：目录 watcher（自动刷新 + 250ms 合并）；四容器虚拟化（`VirtualRows`）；Outline / Search / File Tree 键盘导航；三模式右键菜单；hover 收敛；根路径单行截断；过滤/排序/最近/固定默认折叠；搜索 streaming + 分组 + 跳转；跨应用拖拽 e2e 存在。

| ID | 差距 | 证据 | 判定 |
|---|---|---|---|
| **G7-SIDE-01** | **File List / Articles 模式整体缺失**（同 G7-MENU-02） | `sidebarMode` 仅 `'files' \| 'outline' \| 'search'`（`App.tsx:485`）；`FileList.tsx` 未挂载 | **已修复（V7-W1.5）** —— 四态 `files / fileList / outline / search` + `View → Articles` + `⌃⌘2` |
| **G7-SIDE-02** | 缺 Typora 式**侧栏底部**文件夹操作菜单（Refresh / Open Folder… / 排序 / Recent） | 现用顶部 header + 右键菜单替代（`SidebarHeader.tsx:33-75`） | **已修复（V7-W3.3，D-C 裁决 = ①）** —— 新增 `SidebarFooter` + `openFolderMenu` |
| **G7-SIDE-03** | 「文件」标题不可点击，无模式下拉；`.sidebar-mode-menu` 为**死 CSS** | `SidebarHeader.tsx:62`；`styles.css:220-252`；`tests/e2e/sidebar-verify.mjs:231` 断言其为 null | **死代码部分已修（W2.8）**；「标题可点击/模式下拉」形态本身为 **D**（Mellow 用内联模式按钮组，Typora 1.14 为标题行内联导航，语义等价） |
| **G7-SIDE-04** | File Tree 默认不展开（`expanded` 初始空集），无「展开全部 / 折叠全部」 | `app-core/src/fileTree.ts:153`；`FileTree.tsx:24-31` | **已修复（V7-W3.5）** —— `readTree(expandAll)` 递归读取 + `expandAllPaths` / `collapseAllPaths`；默认全折叠（与 Typora 一致，🟡 仍需参考机实测确认） |
| **G7-SIDE-05** | 排序项未达 Typora 5 组 × 升降序 | Typora：Group by Folder / natural / alphabet / modified / created | **已修复（V7-W3.4）** —— 底部菜单 5 组勾选 + 升序 / 降序 |
| **G7-SIDE-06** | 1.14 的「显示隐藏文件 / 显示非 Markdown 文件」配置形态未核对 | Typora 为**偏好设置项**，Mellow 为折叠态 filter | **已修复（V7-W3.6）** —— 偏好设置三项：显示隐藏文件 / 显示非 Markdown / 自定义显示·隐藏规则（glob） |
| **G7-SIDE-07** | 文件操作撤销语义未与 Typora 对齐核对（Typora：仅最近一次；Win/Linux 删除不可撤销） | `FileTreeHistory.undo` | **已修复（V7-W3.8）** —— 撤销栈收敛为深度 1；**trash 撤销登记 D**（Typora macOS 可撤销，Mellow 全平台依赖系统回收站，需 `FileService` 暴露平台回收站 API） |

**W3 新识别并登记的差异（D）**

| # | 差异 | 裁决 | 依据 |
|---|---|---|---|
| **D-N（新）** | trash 撤销 | **全平台不可撤销，登记 D** | Typora 官方「on Windows/Linux, delete file is not undoable」—— Win/Linux 与 Typora 一致；**macOS Typora 可撤销**而 Mellow 不可，属平台原生能力缺口（需 `NSWorkspace` recycle / `SHFileOperation`），`host-api` 的 `FileService` 未暴露，留待 W6 三平台 Adapter 评估。 |
| **D-O（新）** | File Tree 默认展开层级 | **默认全折叠** | 与 Typora 参考机默认一致（🟡 官方未文档化，标记需真机复核）；补偿能力是「展开全部」与「当前文档所在目录自动展开」。 |
| **D-P（新）** | 底部操作条形态 | **可聚焦 button 而非无边框条** | Typora 为无边框条 + 点击弹出；Mellow 用 button 使键盘可达（Tab + Enter），属 B 级增强，不改变菜单内容。 |

### 5.5 编辑体验（G7-EDIT）

**已达标**：Live Preview marker reveal（Decoration.mark，从不 replace 文本）；Composition Guard 覆盖 21 处调用点 + `ime-guards.test.ts`；Undo 分组 `undoGrouping.ts`（21 用例）；Table 100×30 测试；Source↔Live 往返 8 用例；widget 15 状态矩阵 9 家族 × 15 态 = 126 用例；文档内查找替换自建面板。

| ID | 差距 | 判定 |
|---|---|---|
| **G7-EDIT-01** | 15 状态矩阵未覆盖全部节点（Heading / Strong 较完整，widget 家族已做，其余块级节点仍偏 Happy Path） | **原判定失真，已更正（V7-W4.1 复核）**：`state-matrix.test.ts` 实为 **11 个 marker 家族 × 15 态**参数化（ATX / Setext Heading、Strong、Emphasis、Strikethrough、InlineCode、Link、Autolink、ListItem、Blockquote、Highlight）+ FencedCode 专述；widget 家族另有 9 个专属 suite。原判定按「文件行数」而非「参数化用例数」推断。真实剩余缺口 = 无。 |
| **G7-EDIT-02** | 跨应用剪贴板自动化仅手动模板（`tests/qualification/clipboard-copy-cross-app.md`） | NOT_TESTED（需真机，W7） |
| **G7-EDIT-03** | 图片上传真实链路（PicGo / PicList / Custom Adapter）仅 mock | NOT_TESTED（W5） |
| **G7-EDIT-04** | 拼写检查仅切 `spellcheck` 属性，无词典与替换建议；跨平台行为不一致 | FAIL（W5：词典与替换建议属平台能力，需 `host-api` 扩展） |
| **G7-EDIT-05** | 三平台真实输入法连续 20 分钟写作未执行 | NOT_TESTED（W7 真机） |
| **G7-EDIT-06（新）** | **`FileTreeHistory` 撤销栈为无界栈，与 Typora「仅最近一次可撤销」不一致** | **已修复（V7-W3.8 随侧栏一并收敛）** |
| **G7-EDIT-07（新，2026-09-13 实测）** | **Enter 的语义与 Typora 相反：Mellow 的 Enter = 软换行，而非新段落** | **FAIL（真实行为差距，方案此前未记录）** —— 实测（Playwright，光标置于行尾）：<br/>① `abc` + Enter → `"abc\ndef"`（单 `\n`），渲染为**同一段落**（行高 32、行距 32 紧凑）；<br/>② `abc` + Shift+Enter → `"abc\ndef"`，与 ① **完全一致**（无 `Shift-Enter` 绑定）；<br/>③ 真正的分段是 `abc\n\ndef`（行高 38、段间距 64）。<br/>而官方表定义 **Enter = New Paragraph、Shift+Enter = New Line** —— 即 Mellow 的 Enter 实际承担的是「New Line」语义，**缺的是 New Paragraph**。<br/>根因：`lang-markdown` 只绑定 `{key:"Enter", run: insertNewlineContinueMarkup}`；全仓无 `Shift-Enter` 绑定。<br/>**本轮处置**：**不动 Enter**（输入路径最高风险面，且 `insertNewlineContinueMarkup` 还负责列表续写，改动会连带破坏列表），改为把两项能力经 **Edit 菜单** 显式暴露（见 **G7-MENU-06** 已修复），用户由此可获得真正的「新段落」。<br/>**残余差距（登记，非阻塞）**：Enter 键位语义仍与 Typora 相反；彻底对齐需谨慎改造 Enter（含列表续写分支），风险显著高于收益，按 D-V 判据维持现状并显式登记。 |

### 5.6 排版与渲染（G7-TYPO）

**已达标（v1.5.0 指纹治理后）**：正文字号阶梯 `headerFontSizeDiffs=[20,12,8,4,0,0]`；H1/H2 底部分隔线；引用块竖线 + 嵌套竖线；代码块 `#f8f8f8` + 边框 + 语言标签 + 复制按钮；行内 code 背景；front matter 卡片；kbd 键帽；链接 `#0969da`；hr 间距；表格边框/表头/斑马纹；`--mellow-md-*` 13 个渲染 token（明暗各一套）；8 个内置主题；用户主题文件夹。

| ID | 差距 | 判定 |
|---|---|---|
| **G7-TYPO-01** | **单图独占段落默认居中未确认**（Typora 官方 CSS `p > img:only-child { display:block; margin:auto }`） | **已修复（V7-W4.3）** —— `ImageWidget` 按「行内无其他内容」判定加 `mellow-md-image-centered`（block + text-align:center）；`centered` 参与 widget `eq` 使居中态随编辑更新；5 例单测含「图文混排 / 两图并排均不居中」 |
| **G7-TYPO-02** | 内置主题 8 个 > Typora 6 个（PRD 要求 ≥6 原创）——但 `packages/themes/src/index.ts` 注释仍写 6 | **已修复（V7-W4.8）** —— 注释改为 8 并列出全名单；护栏新增「注释声明数 vs 实际 id 数」交叉比对，防再次失真 |
| **G7-TYPO-03** | 资产指纹实现为**版本化文件名 + 时间戳 query**，与 V6 方案文本 `?v={appVersion}` 不符（功能等价） | 已落地，记录差异 |
| **G7-TYPO-04** | `build-editor-all.mjs` 存在但 **CI 未调用**，本地/CI 构建链分叉风险 | **已修（V7-W5）** —— `ci.yml` 的 `desktop-frontend` job 在 `pnpm run build` 后新增 `node scripts/verify-release-bundle.mjs`；新增护栏 `tests/parity/verify-build-pipeline.mjs`（5 组断言 + 2 canary）锁定「一键构建 5 步链路 / CI 必含指纹校验且序位正确 / 桌面 build 抽取早于 vite build / 注释不得谎称 CI 已编排」，已纳入根 `pnpm test` |

### 5.7 功能域（G7-FEAT）

| ID | 差距 | 判定 |
|---|---|---|
| **G7-FEAT-01** | 打印预览无 UI（`buildPrintHtml` 管线已在 `packages/export/src/print.ts`，桌面端直接打印主 Webview） | **已关闭（原判定失真，V7-W5）** —— Typora **没有**打印预览窗口（证据：`tests/benchmark/fixtures/typora-menu-dump.txt` 只有 `Print` 与 `Page Setup`）。D-H 裁决 = ② 维持直接系统打印对话框；`buildPrintHtml` 保留为导出侧可测试资产（已有单测），护栏禁止 `file.printPreview` 复活 |
| **G7-FEAT-02** | 非 macOS 的页面设置降级为 `Err`（`window.rs:108-128`） | **已修（V7-W5）** —— 非 macOS 不再空转 invoke，改为 `platformMac` 守卫 + **可操作提示**（「Windows / Linux 无系统页面设置面板，请在『打印…』对话框中设置纸张与页边距」）；平台能力缺口本身登记 D |
| **G7-FEAT-03** | 自动保存仅 blur / 文档切换触发，非定时 | **已修（V7-W5）** —— Typora 官方《Auto Save》实测：Win/Linux **默认每 5 分钟**（`conf/conf.user.json` 的 `autoSaveTimer`，Double/分钟，默认 5，GUI 不可达）；macOS 为 NSDocument 系统特性。新增 `packages/app-core/src/autosave.ts` + 5 分钟定时器 + GUI 暴露间隔（B 级增强）；6 例单测 + 护栏 |
| **G7-FEAT-04** | 扩展 API 运行时仅骨架（无第三方插件加载、剪贴板 HTML/Image 未接线） | 按 PRD §119 为 P1，V1 不阻塞（维持） |
| **G7-FEAT-05** | Themes 菜单缺 Typora 的「Get Themes…」（Theme Gallery 入口） | **已修（V7-W1.11）** —— `theme.getThemes` 已入 schema 并接线至 `THEME_GALLERY_URL`（Mellow 自有主题文档锚点，非 Typora 专有资源，符合布局不变量 10） |

### 5.8 验收与证据治理（G7-QA）

| ID | 差距 | 判定 |
|---|---|---|
| **G7-QA-01** | UX Score 100 分表为空（`docs/qualification/ux-score-gate-template.md`） | NOT_TESTED |
| **G7-QA-02** | 30 个核心计时任务未执行 | NOT_TESTED |
| **G7-QA-03** | 三平台真机矩阵未闭环（Windows 仅诊断级；Linux 已通 IME，Keyboard/Caret/Clipboard 未扩） | BLOCKED |
| **G7-QA-04** | 视觉 Golden 仅本机，三平台 chrome 截图未归档 | 部分 |
| **G7-QA-05** | `tests/qualification/README.md` 门禁表过期（大量 ⛔ 未回填） | **已修（V7-W0）** —— 门禁表已按当日实跑刷新数字（editor-engine 971→1135、app-core 200→217、desktop-ui 13→17、themes 8→12、护栏 12→13、台账 32→50）；真机列仍为 ⛔ 并显式注明「本环境无真机，不得臆造为通过」 |
| **G7-QA-06** | 台账 `P0-SHELL-002` 仍写「Tabs 可扩展」，与 SDI 删除 Tabbar 矛盾 | **已修（V7-W0）** —— capability 改为「Focus 与 Typewriter（SDI：无 Tabs）」，目标改写为「Tabs 不提供并登记 D-D，台账不得再写可扩展」，grade 由 B 改 D；台账同步扩容 32 → 50 项 |

---

## 6. 最终产品与交互总合同

### 6.1 默认状态

| 项目 | 最终默认 | 现状 |
|---|---|---|
| 编辑模式 | Live Mode | ✅ |
| Sidebar | 首次启动隐藏；用户操作后记忆 | ✅ |
| Status Bar | 默认隐藏；**菜单可开**（View → 状态栏） | ✅ 已修（V7-W1.6，`view.statusbar.toggle`） |
| Line Numbers | Live 默认关；Source 可独立配置 | ✅ |
| Tab 栏 | SDI 单文档，无 Tab 栏 | ✅ |
| Editor Toolbar | 浮动（Selection 锚定），默认开启；入口 = View → 工具栏 或 设置 → 外观 | ✅ 已收敛为单一浮动工具栏（V7-W2.4，D-B = ①） |
| 字数统计 | macOS：标题栏常显或 hover；Win/Linux：状态栏 | ✅ 已修（V7-W2.6：`appearance.wordCount` 常显开关 + 标题并入字数）；hover 显隐登记 D（原生标题栏在 webview 外） |
| Command Palette / Quick Open / Slash | 浮层，不常驻 | ✅ |
| Reader | 不在标题栏常驻，View / Palette 进入 | ✅ |
| AI | 默认关闭且无常驻入口 | ✅ |
| Language | zh-CN | ✅ |
| Writing Width | **860px**（680 / 860 / 980 / Auto） | ✅ 单一真源（V7-W2.2） |
| Body | **16px / line-height 1.6** | ✅ 单一真源 `TYPOGRAPHY_DEFAULTS`（V7-W2.2）；Reader 字号同源补齐（V7-W5，`--mellow-content-font-size`） |
| Top Padding / Bottom Space | 56px / ≥30vh | ✅ |

### 6.2 布局不变量（不得违反）

1. Sidebar 开关不得改变 Writing Width；
2. Sidebar 展开/收起不得导致 Caret 跳跃或横向闪烁；
3. 标题栏、状态栏不得抢占正文视觉；
4. 编辑表面不得出现永久 Formatting Ribbon；
5. 任何模式切换必须保持 document / caret / selection / scroll；
6. Dialog、Toast、Toolbar 不得覆盖 IME candidate window；
7. 900×600 仍可完成打开、编辑、保存、搜索；
8. 200% Zoom 不截断关键按钮；
9. 三平台共享产品语义，系统装饰遵循平台习惯；
10. 原创品牌视觉，不复制 Typora 专有资源。

---

## 7. 分域深度对标合同

> 每域给出「合同条目 × Typora 真值 × Mellow 目标 × 等级 × 验收方式」。等级 E 必须三平台等价；B 必须通过对照或盲测。

### 7.1 域 A — 功能

| 能力 | Typora 真值 | Mellow 目标 | 等级 |
|---|---|---|---|
| 新建 / 新建窗口 | `Cmd/Ctrl+N` / `Cmd/Ctrl+Shift+N` | 同键位；Windows 新窗口不得双标题栏 | E |
| 新建标签页 | macOS `Cmd+T` | D：SDI 下不提供，登记为有意差异 | D |
| 打开 / 打开文件夹 / 打开最近 | 打开文件即挂载父目录 | 同步骤或更少；中文模糊匹配不更差 | E |
| **重新打开关闭的文件** | `Cmd/Ctrl+Shift+T` | 以「新窗口打开最近关闭的有路径文档」实现 | E |
| Quick Open | `Cmd+Shift+O` / `Ctrl+P` | 同键位；fuzzy 覆盖文件名/路径/最近/固定 | E |
| 保存 / 另存为 / 保存全部 / 重新加载 | 可预测保存 | Atomic + Source Fidelity 更优；Dirty 时禁止静默覆盖 | B |
| 重命名 / 移动 / 复制 / 删除 | 右键菜单 + 拖拽；删除走 Trash | watcher / 窗口 / recent 同步；Trash 优先 | E |
| 文件信息 / 打开文件位置 / 导入 / 导出 / 页面设置 / 打印 | 均有 | 补齐非 macOS 页面设置与打印预览 | E |
| 最近 / 固定 | Recent Locations + Pin；固定项进入 Open Recent 与 Quick Open | 同语义；清理入口明确 | E |

### 7.2 域 B — 编辑体验

| 能力 | 合同 | 等级 |
|---|---|---|
| Live Markdown | 15 状态矩阵覆盖全部块级与行内节点；marker reveal 不改变 document position | E |
| Caret / Selection | 单击/双击/三击/拖拽选择平台化；Home/End/词移动平台化 | E |
| IME | Composition Guard 覆盖全部节点；三平台连续 20 分钟写作 0 丢字 | B |
| Undo / Redo | 一次用户动作 = 一次撤销（含 GUI 操作、表格、图片尺寸） | E |
| Auto Pair / 智能标点 / 拼写检查 | 默认状态与 Typora 一致；代码与 URL 排除；拼写检查有词典与建议 | E（智能标点 ✅ 有设置项；Auto Pair 恒开、**不可关**，与 Typora 默认值一致 → 登记 **D-V**；拼写检查词典与建议 → **D-S** / `P0-EDITOR-005` BLOCKED） |
| Focus / Typewriter / Reader | F8 / F9；Reader 支持搜索 / 大纲 / Zoom / Lightbox / Print | E / B |
| Slash / Palette | 行首触发、可关闭、不抢普通 `/` 输入与 IME | B |
| 字数统计 | 词 / 行 / 字符 / 段落 / 阅读时长；选中时显示选中统计；**中文一字一词**；排除格式语法 | E |

### 7.3 域 C — 侧边栏

| 能力 | 合同 | 等级 |
|---|---|---|
| 信息架构 | Files（Tree / **List**）、Outline、Search —— 三者与 Typora 一一对应 | E |
| 面板切换 | `View → Outline / Articles / File Tree` + 侧栏内轻图标；键位 `⌃⌘1/2/3`、`Ctrl+Shift+1/2/3` | E |
| 默认密度 | 顶部只显示当前模式 + ≤3 个轻图标；高级项收进 hover / 底部菜单 / 右键菜单 | E |
| File Tree | 层级、图标、键盘（↑↓←→ Enter F2 Delete Home/End）、拖拽、跨应用拖拽、右键 10 项、自动监听 | E |
| File List | title + filename（可选 modified / summary）、compact 默认、current / recursive、folder grouping、键盘 ↑↓ Enter PageUp/PageDown | E |
| Outline | H1–H6 层级、当前项实时标记、点击跳转、关键词过滤、**Flat / Collapsible 切换**、右键 `Highlight Current Header` | E |
| Search | 顶部固定输入、Aa / Whole Word / Regex、advanced 折叠、按文件分组 + 1–2 行上下文、流式可取消、↑↓ Enter Esc、invalid regex 就地提示 | E |
| 排序 | Group by Folder + natural / alphabet / modified / created（各升降序） | E |
| 文件操作撤销 | 语义与 Typora 对齐并显式记录差异 | E |
| 规模 | 10k 文件 / 1000 headings / 1 万结果不阻塞 | E |
| 响应式 | ≥1200 可拖 200–480px；900–1199 保持宽度；<900 自动隐藏；200% Zoom 不溢出 | E |

### 7.4 域 D — 特点（五层体验）

| 层 | 判据 | 等级 |
|---|---|---|
| 单一编辑表面 | 不存在编辑/预览分区；标记按 Caret 显隐且不改变文档位置 | E |
| 低干扰桌面壳 | 打开后第一眼是正文；侧栏/状态栏默认不占位；无永久工具条 | E |
| 结构化编辑 GUI | 表格/图片/链接/公式/Mermaid 均以 Markdown 为真源原位编辑 | E |
| 文件型工作流 | 打开单文件即挂载父目录；四模式紧贴文档 | E |
| 可预测输出 | Source Fidelity 0 diff；多格式剪贴板；导出 corpus | E |

### 7.5 域 E — 桌面 UI

| 能力 | 合同 | 等级 |
|---|---|---|
| 标题栏 | macOS 原生（交通灯 + 文件名 + 右上角按钮）；Windows 自绘控制按钮（新窗口同样自绘）；Linux 系统装饰 | E |
| 正文上方 | **不出现额外的文件名条**（D-A 裁决） | E |
| 侧栏开关入口 | macOS 标题栏 + 菜单；Win/Linux 状态栏 + 菜单；键位 ⇧⌘L | E |
| 状态栏 | 默认关；菜单可开；字段含字数 / 行数 / 字符 / 行:列 / Markdown / 编码 / EOL / Zoom / 状态 | E |
| 字数可见性 | macOS 标题栏（hover 或常显，可配置）；Win/Linux 状态栏 | E |
| Editor Toolbar | **浮动**（Selection 锚定），入口 = View → 工具栏 / 设置 → 外观；无常驻横条 | E（V7-W2.4 已收敛） |
| Dialog / Toast | 原生文件对话框；未保存关闭明确文档名 + Save/Don't Save/Cancel；文件操作 Toast + Undo | E |

### 7.6 域 F — 桌面布局

| 项 | 合同 | 等级 |
|---|---|---|
| 窗口模型 | SDI 单窗口单文档；New Window 通道；窗口几何记忆 | E |
| 写作宽度 | 680 / **860** / 980 / Auto，默认 **860**，单一真源（V7-W0 修正：原表写 820，与 `TYPOGRAPHY_DEFAULTS.writingWidth = 860` 及设置项选项值不符） | E |
| 正文 | 16px / line-height 1.6，单一真源 | E |
| 留白 | Top 56px；Bottom ≥30vh；跨主题一致 | E |
| 侧栏宽度 | 200–480px 可拖，默认 260px | E |
| 响应式 | 900×600 可用；<900 自动隐藏侧栏；200% Zoom 不截断 | E |
| 视觉 Golden | 三平台 × 14 场景（见 §9.3） | E |

### 7.7 域 G — 菜单与快捷键

| 项 | 合同 | 等级 |
|---|---|---|
| 顶层结构 | macOS 9 个 / Win·Linux 7 个，顺序与 Typora 一致 | E |
| 条目顺序与分组 | 每个菜单的条目顺序、separator 位置、文案与 Typora 一致；Mellow 增强项以 separator 隔离后置 | E |
| 单一真源 | Command ID 与快捷键只定义一次；主题菜单从 Registry 派生；菜单勾选态与 Settings 同源 | E |
| 快捷键 | 与 §3.4 官方表逐键一致；冲突项按 D 表登记 | E |
| Context Menu | 全部走 `dispatchCommand`；覆盖 text / link / wikilink / image / code / math / mermaid / table / file-tree / outline / search | E |
| 菜单护栏 | schema diff 覆盖条目顺序 / separator / accel / checkState / 三平台 × 双语 | E |

---

## 8. 实施工作包

### W0 — 证据治理与真值固化（前置，不新增功能）

**目标**：所有后续任务使用同一基线、同一状态、同一证据目录。

| # | 任务 | 模块 / 产物 | 验收 |
|---|---|---|---|
| 0.1 | 归档 V3–V6 计划文档至 `docs/plans/archive/`，本方案成为唯一权威 | `docs/plans/` | 无二义施工依据 |
| 0.2 | 台账升级：32 项 → 覆盖 §7 全部合同条目；修正 `P0-SHELL-002` 等失真项 | `tests/parity/typora-parity-ledger.json` | `verify-parity-ledger` 通过 |
| 0.3 | 三平台参考机复核（§3 中全部 🟡 项）：默认展开、Typora 状态栏默认、Replace 键位、单图居中、主题菜单项、自动保存行为 | 参考机截图 + 回填 | 真值表定稿 |
| 0.4 | 固化 Typora 1.14.9 zh-CN / en-US 菜单 dump 入库 | `tests/benchmark/fixtures/` | 语义 diff 可执行 |
| 0.5 | 回填 `tests/qualification/README.md` 过期门禁表 | 文档 | 无 ⛔ 残留 |

**Exit Gate**：基线无冲突；所有合同条目有唯一 ID；不存在无证据的 PASS-E；🟡 项全部定论或降级为 D。

### W1 — 菜单 / 快捷键 / 命令单一真源收口

| # | 任务 | 定位 | 验收 | 状态 |
|---|---|---|---|---|
| 1.1 | **补 `Reopen Closed File`**：新增 app 级 closed 栈，`file.reopenClosed` 打开最近关闭的有路径文档；File 菜单 + `Cmd/Ctrl+Shift+T` | `menuSchema.ts` file、`App.tsx`、Rust | 三平台 keymap + 行为 | **DONE**（栈为 `localStorage 'mellow.closedFiles'`，上限 20；SDI 下语义 = 当前窗口打开，见 D-R） |
| 1.2 | **修正缩进方向**：`indentMore` ↔ `indentLess` 键位互换为 Typora 语义（Indent = `[`，Outdent = `]`） | `menuSchema.ts` paragraph.indent | keymap 断言 | **DONE**（证据链见 §5.2 注；`menu-schema.test.ts` 断言锁定） |
| 1.3 | **段落菜单去噪**：移除 7 个 Slash 插入命令条目（命令保留供 Slash / Palette） | `menuSchema.ts` paragraph 尾部 | schema diff | **DONE**（i18n 孤儿键同步退役） |
| 1.4 | **Edit 菜单子菜单**：保留 `edit.spell` / `edit.replace` 子菜单（真机 nib 证实 Typora 有此结构），文案对齐真机 | `menuSchema.ts` edit | schema diff | **DONE（修正原计划方向）**：原计划「平铺」被真机证据推翻，见 G7-MENU-05 |
| 1.5 | **View 菜单重排**：按 Typora 顺序（Sidebar → Outline → Articles → File Tree → Search → Source → Focus → Typewriter → Toolbar → Fullscreen → Zoom → Statusbar → Word Count → Always on Top），Mellow 增强项（Palette / DevTools）separator 后置 | `menuSchema.ts` view | schema diff | **DONE**（含 Articles 视图实装） |
| 1.6 | **补 View → 状态栏开关** | `menuSchema.ts`、`App.tsx`、`nativeMenu.ts` | 勾选态与状态栏一致 | **DONE**（`checkedFrom: 'statusbar'`，护栏新增单一真源断言） |
| 1.7 | **补格式 → 图片子菜单**：`Insert Local Images…`（已实装文件选择器 → 插入图片语法）；`When Insert Local Images…` / `Use Image Root Path` 待 W5 | `menuSchema.ts` format.image | 条目可达 | **DONE（部分）**：缺项转 W5（依赖插入策略设置） |
| 1.8 | `file.openSnapshotsFolder` 迁出 File 高频组 | `menuSchema.ts` file | schema diff | **DONE**（已置于末位独立分组；登记为 D 类） |
| 1.9 | **macOS 键位复核与修正**：全屏 `Cmd+Option+F`、行内 Code `Cmd+Shift+`` `、Replace（`Cmd+H` 与系统 Hide 冲突则登记 D） | `menuSchema.ts` format/view | 参考机证据 | **DONE**（全屏/行内 Code 已改；Replace 登记 D-Q） |
| 1.10 | 菜单护栏升级为 **schema diff**（条目顺序 / separator / accel / checkState / 三平台 × 双语） | `tests/parity/verify-menu-contract.mjs` | 变异测试拒绝 | **DONE**（File 31 槽位契约 + View 顺序 + checkState 4 来源 + 修复 locale 块定界缺陷） |
| 1.11 | Themes 菜单补 `Get Themes…`（或登记 D） | `menuSchema.ts` theme | 参考机证据 | **DONE**（指向主题文档/社区入口） |

**W1 交付物**：
- `packages/commands/src/menuSchema.ts`：11 处 schema 修订；`NativeMenuSpecInput.statusbar` + `resolveChecked('statusbar')`。
- `packages/i18n/src/messages.ts`：新增 7 个键（`menu.file.reopenClosed`、`menu.view.sidebarFileList`、`menu.view.statusbarToggle`、`menu.image.insertLocal`、`menu.theme.getThemes`、`sidebar.articles`、`sidebar.articlesAria`）；退役 9 个孤儿键；`menu.edit.spellMenu` 文案对齐真机「拼写和语法检查」；`menu.file.revealInFileList` →「在文档列表中显示」。
- `apps/desktop/src/App.tsx`：5 个新命令装配（`file.reopenClosed` / `view.sidebar.fileList` / `view.statusbar.toggle` / `image.insertLocal` / `theme.getThemes`）；`sidebarMode` 增 `fileList`；Articles 视图实装（`FileListService` + `FileListModel` + `FileList` + `refreshFileList` + `formatFileTime` + `handleFileListKeyDown`）；closed 栈；`syncNativeMenu` 传 `statusbar`。
- `apps/desktop/src/nativeMenu.ts`：`statusbar` 透传。
- `packages/desktop-ui/src/SidebarHeader.tsx`：`SidebarMode` 增 `fileList`。
- `tests/parity/verify-menu-contract.mjs` / `verify-sidebar-contract.mjs` / `verify-settings-contract.mjs`：契约同步 + **修复 locale 块定界缺陷**（zh-CN 文案此前从未被真正校验）。
- `packages/commands/test/menu-schema.test.ts`：+4 组断言（31 槽位 / View 顺序 / 缩进键位 / reopenClosed），30 用例全绿。

**Exit Gate 核验**：顶层与条目结构符合 §7.7 ✅；每个菜单项有 Command ID ✅（护栏 `schema 命令缺少 CommandRegistry 注册` 断言）；Theme / Settings / Menu 无漂移 ✅；keyboard 与 menu click 双通道 ⏳（需三平台真机）；zh-CN / en-US dump 通过 ✅（护栏双语断言）。

### W2 — 桌面 UI 与布局收口

| # | 任务 | 定位 | 验收 |
|---|---|---|---|
| 2.1 | **修复 Windows 新建窗口双标题栏**：`new_window` 同样 `#[cfg(target_os="windows")] decorations(false)` | `src-tauri/src/window.rs:63-73` | Windows 真机截图 |
| 2.2 | **统一排版默认值单一真源**：fontSize 16、lineHeight 1.6、writingWidth **860**；消除 settings / iframe 初始 / 运行时回落三处不一致 | `settings/src/index.ts:78,107,114`、`App.tsx:459,2805,2812`、`bundle.ts:21`、`styles.css:1326` | **DONE**（详见下方 W2.2 交付说明） |
| 2.3 | **裁决 D-A：`.editor-topbar` 去留** | `App.tsx:4673-4712` | **DONE**：裁决 = ③（纯操作条，去文件名）；左侧按钮 macOS 恒显（G7-SHELL-05） |
| 2.4 | **裁决 D-B：EditorToolbar 形态**（浮动 vs 常驻；若保留常驻则补 H1 / 正文 / 表格行列 / 查找） | `EditorToolbar.tsx:14-28` | **DONE**：裁决 = ①（退役常驻横条；浮动工具栏由引擎级 `selectionToolbar` 承载，View → 工具栏 与 设置 → 外观 同源） |
| 2.5 | **macOS 侧栏切换入口**：在原生标题栏可用位置或视图层提供可发现的轻图标 | `App.tsx:4546`、`styles.css:31-33` | **DONE**（随 W2.3 落地：`editor-topbar` 左侧按钮 macOS 恒显；真机截图待补） |
| 2.6 | **macOS 字数可见性**：标题栏 hover 显示字数（或常显可配） | `App.tsx`、Rust window title | **DONE（实现「始终显示」选项）**：新增 `appearance.wordCount` 设置 + 标题并入字数（`{count} 字` / `{count} words`，口径 = CJK 字数 + 词数）。**hover 显隐登记为 D** —— macOS 原生标题栏在 webview 之外，hover 事件不进入 Web 层，需 tao 暴露原生 titlebar tracking；Typora 官方同时提供「始终显示」选项，故先交付该等价能力。 |
| 2.7 | 状态栏字段补 lines / characters / reading time；字数面板（点击展开全统计） | `StatusBar.tsx:5-13` | **DONE**：① 状态栏字数串**早已**含「字 · 词 · 字符 · 行 + 阅读时间」（`formatWordCountStats`），原审计按 `StatusBar.tsx` 字段枚举判定「缺失」属**失真**，已在下方登记；② 字数项改为**按钮**（`.statusbar-stats`）点击展开统计面板，对齐 Typora「click on the word count button → popup panel」；③ 面板本身（cjk/words/chars/charsNoSpace/lines/paragraphs/readingTime）此前已存在。 |
| 2.8 | 清理死 CSS `.sidebar-mode-menu` / `.sidebar-mode-item`；e2e 断言同步更新 | `styles.css:220-252`、`tests/e2e/sidebar-verify.mjs:231` | **DONE**：死 CSS 删除；e2e 的两条断言保留为「模式弹出菜单不得复活」的永久防线（侧栏模式切换现为内联按钮组）。 |
| 2.9 | 视觉 Golden 扩到 §9.3 全部 14 场景，三平台归档 | `tests/visual/` | **部分 DONE**：① 修复一处**假护栏** —— `sidebarVisible` 采样查 `.sidebar`（应用中不存在该 class，侧栏节点是 `aside.file-tree`），恒为 false，永远抓不到「侧栏默认可见」回归；已改真实选择器并在护栏加反回归断言；② 「扩到 14 场景」需在具备 Playwright 的环境执行并重建基准（本机未安装 Playwright），登记为待办。 |

**W2 交付物（W2.1–W2.8 完成；W2.9 部分完成）**：

- **W2.1**（G7-SHELL-01）`apps/desktop/src-tauri/src/window.rs`：`new_window` 增 `#[cfg(target_os = "windows")] let builder = builder.decorations(false);`，与主窗口装配一致，消除「系统标题栏 + 应用内 titlebar」双栏。
- **W2.2**（G7-SHELL-03）排版默认值单一真源收口：
  - `packages/settings/src/index.ts`：新增 `TYPOGRAPHY_DEFAULTS = { fontSize: 16, lineHeight: 1.6, writingWidth: 860 }`（**声明在 `SETTINGS_SECTIONS` 之前** —— 该表模块顶层求值，`const` 无提升，否则 TS2448 TDZ 报错）；`editor.fontSize` / `editor.writingWidth` / `editor.lineHeight` 的 `defaultValue` 改为引用它。
  - `apps/desktop/src/App.tsx`：① **字号启动恢复改为无条件 apply** 并回落 `TYPOGRAPHY_DEFAULTS.fontSize` —— 原实现为「`size !== 17` 才 apply」，而 17 是 vendored CoreEditor iframe 的初始值（`CoreEditor/index.ts:40`、`bundle.ts:21`），并非 Mellow 默认，导致用户保持默认 16px 时分支被跳过、编辑器实际停在 17px（设置显示 16、渲染 17）；② 写作宽度/行高的启动恢复与 live apply 全部改引用真源；③ CSS 变量 effect 增写 `--mellow-writing-width`（`auto` → `none`）。
  - `apps/desktop/src/styles.css`：`.mellow-reader` 改消费 `var(--mellow-writing-width, 860px)` / `var(--mellow-line-height, 1.6)`（原硬编码 820px / 1.65）。
  - `packages/editor-core/src/bundle.ts`：**不引入 settings 依赖**（违反包依赖规则），改为注释显式说明「17 / 1.5 是上游初始值，产品默认由宿主无条件覆盖」，解耦关系与守护护栏一并登记。
  - `packages/i18n/src/messages.ts`：`settings.editor.fontSizeDesc` 文案「默认 17px = 100%」→「默认 16px = 100%」（zh + en）。
  - 测试资产同步：`tests/visual/visual-golden.mjs`（CONFIGS 16 / zoom-200 = 32；新增 `TYPOGRAPHY_FONT_SIZE/LINE_HEIGHT/WRITING_WIDTH` 字面量 + **`assertEditorContract` 实测 vs 期望硬断言**）、`tests/visual/golden/layout-golden.json`、`tests/visual/README.md`、`tests/e2e/zoom-verify.mjs`（16 → 17 → 16 → 重置 16）、`tests/e2e/sidebar-resize-verify.mjs`（200% = 32px）。
  - **护栏加强**：`verify-shell-typography.mjs` 新增「settings 默认值 / App 回落 / Reader CSS 回落」三处与 `TYPOGRAPHY_DEFAULTS` 的**数值交叉比对** + 3 个漂移 canary；`verify-visual-golden.mjs` 新增脚本字面量与真源的交叉比对、基准自洽性校验（`lineHeightPx` vs `expectedLineHeightPx`）、字号基准 canary。
  - **附带发现并修复的真实缺陷**：① `verify-shell-typography` 此前断言 `1.65`，W2.2 落地后即红（护栏比代码新）；② 视觉 Golden 基准**自相矛盾且恒绿** —— `lineHeightPx: 27.2`（实测 = 17 × 1.6）与 `expectedLineHeightPx: 28.1`（期望 = 17 × 1.65）并存，且 `expected*` 字段从不与实测比对（`diffSample` 只做 golden vs actual 的同式比对）。已改为硬断言。
  - **待真机/CI 复核**：本机未安装 Playwright（`tests/visual/visual-golden.mjs` 无法本地执行），`layout-golden.json` 中字号相关字段（`fontSize` / `lineHeightPx` / `expected*`）按**确定性推导**手工同步（浏览器对无单位 `line-height` 的计算值 = `fontSize × 倍率`，与既有 27.2 = 17 × 1.6 实测一致）；几何字段与字号无关故保持原值。下一次在具备 Playwright 的环境执行 `node tests/visual/visual-golden.mjs` 应全绿，若否以 `--update` 重刷并复核差异。

- **W2.3**（G7-SHELL-02 / G7-SHELL-05，D-A = ③）`.editor-topbar` 改造为纯操作条：
  - `apps/desktop/src/App.tsx`：删除 `<div className="editor-topbar-title">`（居中文档名）；左侧侧栏按钮条件由 `!sidebarShown` 改为 `(platformMac || !sidebarShown)` 并加 `active` 态与 `toggleSidebar`，使 macOS 恒显可发现的侧栏入口；新增 `.editor-topbar-spacer` 撑开左右槽。
  - `apps/desktop/src/styles.css`：删除 `.editor-topbar-title` 规则，新增 `.editor-topbar-spacer`；条高保持 `height: 34px / flex: 0 0 34px`（视觉基线不漂移）。
  - 护栏 `verify-shell-widgets.mjs`：新增 5 条断言（`.editor-topbar-title` 不得复活、spacer 存在、macOS 条件、active 态、条高不变）+ 复活漂移 canary；并引入 `stripComments()` 辅助（注释中合法提及历史类名不应误报）。
- **W2.4**（G7-SHELL-04，D-B = ①）退役常驻 EditorToolbar：
  - 依据：Typora 1.14 What's New「enable the **float toolbar** from menubar → **View → Toolbar** or from **Settings → Appearance**」。Typora 只有一个浮动工具栏概念，Mellow 的引擎级 `selectionToolbar` 即其等价物。
  - 删除：`packages/desktop-ui/src/EditorToolbar.tsx`、`test/editor-toolbar.test.ts`、`index.ts` 的两条导出、`styles.css` 的 `.editor-toolbar` / `.editor-toolbar-btn` 规则、`App.tsx` 的 import / 渲染 / `editorToolbarVisible` 状态与 `mellow.editor.toolbarVisible` 持久化键。
  - 收敛：`view.toolbar.toggle` → `toggleSelectionToolbar()`（浮动工具栏）；设置项 `editor.toolbar` → **`appearance.toolbar`**（对齐 Typora「Settings → Appearance」），`applyCommand` → `settings.toolbar`；`syncNativeMenu` 传 `toolbar: selectionToolbarEnabled`。
  - 单一真源（ADR-0023）：`menuSchema.ts` 的 `view.toolbar.toggle` 增 `checkedFrom: 'toolbar'`，`NativeMenuSpecInput.toolbar` + `resolveChecked('toolbar')` 落地；`verify-menu-contract` 的 `CHECK_STATE_CONTRACT` 4 → 5 项、`VIEW_GROUP_EXCEPTIONS` 7 → 6 项（护栏自带「例外过期检测」）。
  - 附带修复两处真实缺陷：① `selectionToolbarEnabled` 初值恒 `true`，用户关闭后重启会出现「菜单勾选 = 开 / 实际工具栏 = 关」的真值分裂 → 改为从 `appearance.toolbar` 设置项初始化；② `setSelectionToolbarEnabled` 的 `useCallback` 依赖为 `[]` 却使用 `t`（locale 切换后状态文案过期）→ 补 `[t]`。③ 设置「侧栏默认视图」选项表缺 `fileList`（W1.5 已实装 Articles 但用户无法设为默认）→ 补 `settings.sidebar.articles`。
  - i18n：新增 `settings.appearance.toolbar`（浮动编辑器工具栏 / Floating editor toolbar）、`settings.sidebar.articles`（文档列表 / Articles）；退役 `settings.editor.toolbar`。zh/en 各 737 键，零孤儿。

- **W2.5**（G7-SHELL-05）随 W2.3 落地：`editor-topbar` 左侧侧栏按钮条件 `(platformMac || !sidebarShown)`，macOS 恒显可发现入口（真机截图待补）。
- **W2.6**（G7-SHELL-06）macOS 字数可见性：
  - 依据 Typora 官方 Word Count 文档：「For macOS version, the word count are shown when user hover on the titlebar. To "always" show it, please enable this option in Preferences Panel → Appearance section.」
  - `packages/settings/src/index.ts`：新增 `appearance.wordCount`（默认 false，`applyCommand: 'settings.wordCount'`）。
  - `apps/desktop/src/App.tsx`：新增 `wordCountInTitle` state（启动从设置初始化）+ `case 'settings.wordCount'` live apply；窗口标题 effect 在开启时并入 `{count} 字` / `{count} words`（Typora 口径：中文一字 = 一词，故 count = `cjkChars + words`）。
  - i18n：`settings.appearance.wordCount`（在标题栏显示字数 / Show word count in title bar）、`settings.appearance.wordCountDesc`、`status.wordCountShort`（`{count} 字` / `{count} words`）。
  - **残余差异（D）**：hover 显隐不可在 Web 层实现 —— macOS 用原生装饰标题栏（在 webview 之外），hover 事件不进入 Web 层；需 tao 暴露原生 titlebar tracking。已交付 Typora 同样提供的「始终显示」等价能力。
- **W2.7**（G7-SHELL-07）字数面板入口与字段核对：
  - **原审计失真更正**：G7-SHELL-07 称「状态栏缺 lines / characters / reading time」，实际 `packages/app-core/src/wordCount.ts` 的 `formatWordCountStats` 早已输出「N 字 · M 词 · K 字符 · L 行」，`refreshStats` 又追加「· 约 X 分钟」，且 `view.wordCount` 面板含 cjk/words/chars/charsNoSpace/lines/paragraphs/readingTime 七项。原判定按 `StatusBar.tsx` 的**字段枚举**推断，未核对 `stats` 串的实际内容 → 失真，已更正。
  - 真实缺口 = 字数项**不可点击**：`packages/desktop-ui/src/StatusBar.tsx` 新增 `onStatsClick` 与 `.statusbar-stats` 按钮；`apps/desktop/src/App.tsx` 接到 `refreshStats` + `setWordCountOpen(true)`；`styles.css` 增可点击样式。
- **W2.8**（G7-SIDE-03 死代码）`styles.css` 删除 `.sidebar-mode-menu` / `.sidebar-mode-item` / `:hover` / `.active` 四条死规则；`tests/e2e/sidebar-verify.mjs` 两条断言保留并加注为「模式弹出菜单不得复活」永久防线。
- **W2.9** 视觉 Golden：
  - **修复假护栏（重要）**：`sidebarVisible: document.querySelector('.sidebar') !== null` —— 应用中不存在 `.sidebar` class（侧栏节点是 `aside.file-tree`），该采样恒为 `false`，「侧栏默认可见」回归永远抓不到。已改为 `aside.file-tree`，并在 `verify-visual-golden.mjs` 加「必须查真实节点 + 不得再用 `.sidebar`」双向断言。
  - **待办已闭环（2026-09-12）**：此前「扩到 §9.3 全部 14 场景需 Playwright（本机未安装）」的
    判断**不成立** —— Chromium 已在 `~/Library/Caches/ms-playwright/`，仅缺 npm 包，装到仓库外
    临时目录即可（`NODE_PATH=<dir>/node_modules`）。新增 `tests/visual/scenes-golden.mjs`
    补齐余下 7 场景（首次启动 / 单文档 Live / File List / Settings / Selection Toolbar /
    Table Toolbar / Reader），**macOS 侧 §9.3 14 场景现已全覆盖**。
  - **发现并修复真 bug（重要）**：`selection-toolbar` 场景首采 `{w:0,h:0,visible:false}`
    —— 元素在、10 个按钮在，但 `display` 恒为 `none`。根因：`position()` 在 CM6 的
    **update 周期内**调用 `view.coordsAtPos()`（CM6 禁止读布局）→ 抛错被 `getAnchor` 的
    `catch` 吞掉返回 `null` → 立即 `hideEl()`，且 `visible=false` 后不再重定位 →
    **浮动工具栏永不显示**（程序化选区与真实鼠标拖拽均不显示）。即 `P0-SHELL-003` 的
    `AUTO` 状态曾把一个完全不可用的功能当作已闭环 —— 单测只覆盖了纯函数
    `shouldShowToolbar`，属「有测试但不工作」。
    修复：`selectionToolbar.ts` 新增 `schedulePosition()`（rAF 推迟到 update 周期外，
    无 rAF 环境退化同步定位以兼容单测），`destroy()` 取消待执行帧；实测 `300.7×34` 可见。
    回归防线：`verify-shell-widgets.mjs` 静态契约（禁止 `showEl()`/`update()` 同步
    `position()` + canary，已真实注入验证）+ `scenes-golden.mjs` 硬断言 `visible === true`。
  - **方法论（防同类事故）**：Golden 采样**必须配「实测 vs 期望」硬断言**。只做基线 diff
    的话，首跑就会把「功能不工作」的状态固化为基准，此后永远绿。

**W2 Exit Gate 核验**：布局不变量 10 条 —— 未引入新的常驻 UI（退役 1 个常驻横条、1 条文件名重复渲染）✅；常见任务入口不增步（工具栏/侧栏/字数入口均为一跳）✅；Screenshot Golden 结构断言通过、真跑待 Playwright ⏳；Keyboard / Focus / Reduced Motion 未改动相关路径 ✅；12 个 parity 护栏 + `ux-gate-recorder --self-test` 全绿 ✅；`packages/commands` 30 用例、`packages/desktop-ui` 17 用例全绿 ✅；桌面端 `tsc --noEmit` 零错误 ✅。

### W3 — 侧边栏深度对标

| # | 任务 | 定位 | 验收 |
|---|---|---|---|
| # | 任务 | 定位 | 状态 |
|---|---|---|---|
| 3.1 | **重建 File List / Articles 模式**：挂载 `FileList.tsx`，接入 `FileListService`，补 `View → Articles` + `⌃⌘2` / `Ctrl+Shift+2` | `FileList.tsx`、`App.tsx`、`menuSchema.ts` | ✅ **完成**（V7-W1.5 随菜单收口一并落地，护栏 ⑪⑫ 锁定） |
| 3.2 | File List 契约补齐：compact 默认、current / recursive、folder grouping、↑↓ Enter PageUp/PageDown、current / selected / hover / missing 态 | `FileList.tsx`、`app-core/src/fileList.ts` | ✅ **完成** |
| 3.3 | **裁决 D-C：侧栏底部文件夹操作菜单**（Refresh / Open Folder… / 排序 / Recent） | `SidebarFooter.tsx`（新建）、`App.tsx` | ✅ **完成**（D-C = ①） |
| 3.4 | 排序补齐为 Typora 5 组 × 升降序（Group by Folder / natural / alphabet / modified / created） | `app-core/src/fileTree.ts`、`App.tsx` | ✅ **完成** |
| 3.5 | File Tree 默认展开策略 + 「展开全部 / 折叠全部」 | `fileTree.ts`、`FileTree.tsx` | ✅ **完成** |
| 3.6 | 1.14 文件过滤配置对齐：显示隐藏文件 / 显示非 Markdown / 自定义规则 | `App.tsx`、`packages/settings` | ✅ **完成** |
| 3.7 | Outline 补 Flat / Collapsible 切换 + 右键 `Highlight Current Header` | `OutlineList.tsx`、`App.tsx` | ✅ **完成** |
| 3.8 | 文件操作撤销语义核对与对齐（Typora：仅最近一次；Win/Linux 删除不可撤销） | `fileTree.ts` `FileTreeHistory` | ✅ **完成**（trash 撤销登记 D） |
| 3.9 | Recent Locations 的 trash / pin hover 图标 | `App.tsx`、`recentFiles.ts`、`ContextMenu.tsx` | ✅ **完成** |
| 3.10 | 四模式 Screenshot Golden + 12 个计时微任务 | `tests/` | ✅ **完成（2026-09-12）** —— Golden 三模式（`sidebar-golden.mjs`）+ 12 微任务已存在；**Articles 模式 Golden 已补齐**：`tests/visual/scenes-golden.mjs` 的 `file-list` 场景实测 `label=文档列表`、`aside 260×900`、7/7 命中基准。原「待 Playwright 环境」判断系误判（Chromium 已在本机缓存），同 §W2.9 |

**Exit Gate**：Sidebar 默认只展示当前任务；四模式 keyboard-only 全通；10k / 1000 / 1 万不阻塞；三平台真机通过。

### W3 交付物详述

**W3.2 —— File List 契约补齐（`packages/desktop-ui/src/FileList.tsx`）**

- `compact` prop（默认 `true`）—— Typora Articles 默认紧凑行；`compact` 时行高 40px、无摘要。
- `groupByFolder` + `folderLabel` —— 按文件夹分组，组标题 `position: sticky`（VirtualRows 用 padding spacer 而非 transform，sticky 可用）。**单组时自动退化为不渲染标题**（Typora：单文件夹 Articles 无分组标题）。
- 分组渲染要求「同文件夹连续」，故 App 层用 `fileListItemsForRender` 按 `dirname` 稳定排序；键盘导航**必须**复用同一序列（护栏 ㉕ 断言，防导航与渲染错位）。
- **PageUp / PageDown 接线** —— 模型 `FileListModel.navigate` 早已支持 `pageup` / `pagedown`，但 `handleFileListKeyDown` 的键位映射表未包含，属「能力已实现但未可达」。
- **missing 态** —— 当前文档不在已加载文件夹时，Typora 侧栏**无任何高亮**，用户会以为列表没刷新。Mellow 在底部给出显式提示条（`sidebar-footer-hint`）与「载入所在文件夹」入口，属 B 级增强。

**W3.3 —— 侧栏底部文件夹操作条（D-C = ①，新建 `SidebarFooter.tsx`）**

Typora 官方 File Management：「At the bottom of the left side bar, users can pop up menu items for the current folder」。菜单结构：

```text
刷新
打开文件夹…
──────────
展开全部 / 折叠全部
[包含子文件夹]        ← 仅 Articles（文档列表）模式
排序 ▸  文件夹分组 ✓ / 自然 / 名称 / 修改时间 / 创建时间 / 升序 ✓ / 降序
最近文件夹 ▸  <文件夹名>  [★] [✕]     ← hover 显示 pin / trash
```

仅在 Files（树 / 列表）模式渲染 —— Typora 的 Outline / Search 面板底部无此条。`ContextMenu` 为此扩展了 `checked`（排序勾选）与 `actions`（行内 hover 操作，用 `<span role="button">` 避免 button 嵌套 button 的非法 HTML）。

**W3.4 —— 排序 5 组 × 升降序**

`FileTreeOptions` 原本就具备 `sortBy: natural | name | modified | created` + `folderFirst` + `sortAsc`，与 Typora 的 5 组一一对应 —— 缺口是**UI 不可达**而非算法。底部菜单逐项暴露后补齐。

**W3.5 —— 展开全部 / 折叠全部**

关键约束：File Tree 是**惰性读取**（`readTree` 只下钻 `expanded` 中的项），未知层级的子孙尚未加载，因此「展开全部」**不能**只往 `expanded` 集合塞路径 —— 会读不到深层节点。实现为 `readTree(..., expandAll)` 递归读取，再用 `collectFolderPaths` 回填 `model.expanded`，使后续单个折叠可用（`expandAllPaths` / `collapseAllPaths`）。

**W3.6 —— 文件过滤配置**

偏好设置「文件」组补齐三项：显示隐藏文件 / 显示非 Markdown 文件 / **自定义显示·隐藏规则**（`includeGlobs` / `excludeGlobs`，glob 列表，逗号或换行分隔，由 `parseGlobList` 解析）。

**W3.7 —— Outline 右键 `Highlight Current Header`**

Flat / Collapsible 切换此前已在右键菜单（`outline.switchFlat` / `switchTree`）。本轮补齐 `Highlight Current Header`。**关键细节**：不能只靠 `setOutlineSelectedId(currentOutlineId)` —— 若当前项已是键盘选中项，state 未变、effect 不重跑、视口不动，用户会以为功能失效。故引入 `highlightNonce` 递增计数强制触发滚动跟随。

**W3.8 —— 文件操作撤销语义**

`FileTreeHistory.push` 由「追加到无界栈」改为「深度 1（`this.stack = [op]`）」，对齐 Typora 官方「only the last one file operation in Typora is undoable」。`trash` 撤销登记为 D（见 §5.4 表 D-N）。

**W3.9 —— Recent Locations 的 pin / trash**

`recentFiles.ts` 新增 `removeRecentFolder` / `togglePinRecentFolder` / `sortRecentFolders`。**设计选择**：pin 集合持久化于**独立键** `mellow.recent.folders.pinned`，与既有 `string[]` 最近文件夹载荷解耦 —— 避免改动 `pushRecentFolder` / `parseRecentFolders` 的类型与既有单测，同时保留旧存档兼容。图标用 `★`/`☆`（pin）与 `✕`（trash），hover 显示。

### W4 — 编辑体验与排版真值收口

| # | 任务 | 定位 | 状态 |
|---|---|---|---|
| 4.1 | 15 状态矩阵补齐至全部块级 / 行内节点 | `packages/editor-engine/test/` | ✅ **已完成（复核后确认原判定失真）** —— `state-matrix.test.ts` 为 **11 家族 × 15 态**参数化（约 171 例）+ FencedCode 专述 + widget 9 个专属 suite；矩阵无空洞 |
| 4.2 | 拼写检查：接入词典与替换建议，代码区 / URL 排除，三平台一致 | `editor-engine` | ⛔ **BLOCKED（W5）** —— 需 `host-api` 暴露平台拼写服务（`NSSpellChecker` / Hunspell / ISpell），非引擎层可解 |
| 4.3 | 单图独占段落居中（Typora 官方 CSS 语义） | `image/widget.ts` | ✅ **完成**（原定位 `wysiwygBlocks.ts` 有误 —— 图片是 widget，不在块级装饰里） |
| 4.4 | Undo 语义全量核对：GUI 动作（表格、图片尺寸、格式命令）各一个 Undo | `undo.test.ts` / `table-undo-diff.test.ts` | ✅ **完成** —— 37 例（21 + 16）+ 本轮新增 3 例锁定「格式命令 / 图片尺寸改写各一个 Undo」 |
| 4.5 | Enter / Backspace / Delete / Home / End / 词移动平台化；鼠标选择矩阵 | `editor-engine` / CoreEditor | ✅ **完成（2026-09-12）** —— `platformNav.ts` 存在；鼠标选择矩阵新增 `tests/e2e/mouse-selection-verify.mjs`，**7/7 运行时验证通过**：单击定位（选区为空）、双击选词（hello / world）、三击选整行、拖拽连续选区（2→6）、Shift+单击扩展选区（2→7）、列表行三击含 marker 整行。<br/>**三击语义固化为「整行 + 行尾换行」**（`"first line\n"`），属 CodeMirror 默认语义；Typora 同为该引擎族（见 typora-menu-dump 的 keymap 段），逐字对照仍需真机取样。<br/>**踩坑记录**：`view.coordsAtPos()` 返回 **iframe 视口内**坐标，而 `page.mouse.*` 用**主页面视口**坐标，必须叠加 iframe 偏移，否则所有点击都会落到偏移 0 |
| 4.6 | Source ↔ Live 往返保持 scroll / caret / selection | `source-mode-api.test.ts` | ✅ **完成** —— 10 例；15 状态矩阵的 `source-live-roundtrip` 态亦逐家族覆盖 |
| 4.7 | Focus / Typewriter 与 marker reveal 联合；Floating Toolbar 与 IME / Selection 联合 | `focusMode` / `typewriterMode` / `selectionToolbar` | ✅ **完成** —— `focus-typewriter-reveal.test.ts` 9 例 + `selectionToolbar.test.ts` |
| 4.8 | 主题注释失真修正（6 → 实际数量） | `packages/themes/src/index.ts` | ✅ **完成** —— 改为 8 并列全名单；护栏加「注释声明数 vs 实际 id 数」交叉比对 |
| 4.9 | **表格列对齐分隔符连字符被侵蚀（真 bug）** | `editor-engine/src/table/commands.ts` | ✅ **修复（2026-09-12）** —— `setColumnAlignment` 用固定 2 连字符的 `mark` 再 `slice` 拼装，丢弃原始连字符长度：每切换一次对齐少一个（`---` → `:--:` → `:-:` → `::` 非法）。<br/>**为何长期未被发现**：既有单测只断言 **解析后的对齐语义**，而 `:--:` 与 `:-:` 解析结果相同 —— 又一次「有测试但不工作」。<br/>修复：保留原连字符数（`---` → `:---:` → `:---`）。回归测试 `table-toolbar.test.ts` 11b，**已 canary 验证**（注入旧实现即失败）。<br/>另新增 `tests/e2e/widget-buttons-verify.mjs`（4/4）：验证工具栏按钮**真的产生编辑效果**（Bold 加粗、Align Center 改写分隔符、Row Below 插行），而非仅渲染存在 |

**Exit Gate**：Live Editing ≥ 24/25；Caret / IME / Undo = 15/15；IME corruption = 0；Typing P95 达 PRD；无 Source Fidelity 回退。

### W4 交付物详述

**W4.1 —— 15 状态矩阵（复核结论：原审计失真）**

`state-matrix.test.ts` 的结构是「家族配置数组 × 15 个状态」的**双层循环**，因此从「文件里只有 6 个 `test(`」会误判为覆盖不足 —— 实际是 11 家族 × 15 态 + FencedCode 专述。教训同 G7-SHELL-07：**按代码行数/用例函数名计数判断覆盖率不可靠，必须看参数化展开后的实际用例数**。

**W4.3 —— 单图独占段落居中**

Typora 官方 CSS 语义 `p > img:only-child { display:block; margin:auto }`。CodeMirror 无 `<p>` 节点，「段落」= 一行，故判定为「该行去掉首尾空白后完全等于这张图片的 Markdown 文本」：

- 图文混排（`caption ![a](x.png)`）→ 不居中 ✅ 与 Typora 一致；
- 两图并排（`![a](x.png) ![b](y.png)`）→ 都不居中 ✅ 符合 `only-child` 语义；
- `centered` **必须参与 `ImageWidget.eq`** —— 否则「独占 → 非独占」变化时 CM 复用旧 widget，居中态不更新（已加对应用例）。

**W4.4 —— GUI 动作各一个 Undo**

真正的加粗/斜体格式命令与图片拖拽缩放属 vendored CoreEditor（MarkEdit）的 keymap / DOM 交互，不在 `editor-engine` 内，故用**引擎可表达的等价程序化事务**（wrap `**`、`=WxH` 尺寸改写）锁定「一个 GUI 动作 = 一个 undo 单元」，并验证「连发两次 → 精确两次 undo，第三次为 no-op」。

**W4.8 —— 主题数量文档失真**

`packages/themes/src/index.ts` 头部注释写「内置 6 主题」，实际 8 个（mellow-light / mellow-dark / paper / git-light / git-dark / newsprint / whitey / gothic）。修正注释并新增护栏交叉比对（解析注释里的数字 vs 解析实际 `id` 数量），防再次失真。

### W5 — 功能域收口

| 域 | 任务 | 验收 | 状态 |
|---|---|---|---|
| 构建链 | `verify-release-bundle.mjs` 纳入 CI；`build-editor-all.mjs` 注释失真修正；新增 `verify-build-pipeline.mjs` | CI 与本地同链 | ✅ 完成 |
| 文件 | 非 macOS 页面设置；自动保存行为与 Typora 实测对齐 | 三平台 | ✅ 完成（G7-FEAT-02 / 03） |
| 打印 | ~~打印预览 UI 接线~~ → **判定为非差距**（Typora 无预览窗口，D-H = ②）；改做「禁止复活」护栏 | 与 PDF 共用 print stylesheet | ✅ 关闭（G7-FEAT-01） |
| 主题菜单 | Themes → Get Themes…（W1.11 已落地，本轮复核确认） | 菜单结构对齐 | ✅ 完成（G7-FEAT-05） |
| 搜索 | **invalid regex 就地提示**（§7.3；原实现把它静默吞成「无结果」） | 与 Typora 一致 | ✅ 完成（V7-W5） |
| 图片 | PicGo / PicList / Custom Adapter 真实链路；Move All / Copy All / Download All 端到端；失败回滚 | 0 loss | ⛔ NOT_TESTED（需真机 PicGo / 图床凭据，W7） |
| 剪贴板 | 7 个目标应用 cross-app 自动化（VS Code / 系统纯文本 / Word / Gmail / Apple Notes / LibreOffice / 记事本） | 矩阵全绿 | ⛔ NOT_TESTED（W7 真机） |
| 表格 | 22 场景全量复核；cell IME；one action one Undo；minimal diff | 不慢于 Typora +5% | 🟡 部分 —— 引擎侧已有矩阵；**cell IME 已取得运行时证据（2026-09-12）**：`tests/e2e/ime-composition-verify.mjs` 8/8，单元格内合成中文后列结构与管道数不变（`"\| 1中 \| 2 \|"`），撤销精确还原原表。<br/>**边界**：走 CDP `Input.imeSetComposition`，覆盖编辑器内核与 Live Table 重绘；原生输入法面板 / 候选窗交互仍需 W7 真机 |
| 主题 | 明暗分离、主题文件夹、`base.user.css` / `[theme].user.css` 加载顺序；命名规则（kebab → 可读标题） | 与 Typora 机制一致 | 🟡 部分（V7-W5 已落地 user CSS **三层叠加**与命名规则真值复核；加载顺序真机验证转 W6） |
| 导出 | CJK + Math + Mermaid + Table + Footnote + TOC 导出 corpus；PDF 自动 outline；HTML outline 可配置 | 三平台视觉一致 | 🟡 待复核（corpus 需 W7 三平台视觉比对） |

**Exit Gate**：Source Fidelity 0 diff；File Safety 5/5；Data loss = 0。

#### W5 交付物详述（V7-W5）

**5.1 构建链治理（G7-TYPO-04）**

- `.github/workflows/ci.yml`：在 `desktop-frontend` job 的 `pnpm run build` **之后**新增
  `Verify editor release bundle fingerprint`（`node scripts/verify-release-bundle.mjs`），
  消除「本地构建链 ≠ CI 构建链」的分叉风险（渲染层资产为版本化文件名，指纹错配会静默降级）。
- `apps/desktop/scripts/build-editor-all.mjs`：注释原称「CI 的 release.yml 已按相同顺序编排」——
  **经核查两个 workflow 均未调用它**，属文档失真，已改为说明当前实际状态。
- 新增第 13 个护栏 `tests/parity/verify-build-pipeline.mjs`（5 组断言 + 2 个 canary）：
  一键构建 5 步链路完整、CI 必含指纹校验且序位正确、桌面 `build` script 抽取早于 `vite build`、
  注释不得谎称 CI 已编排。已纳入根 `pnpm test` / `pnpm run parity`。

**5.2 定时自动保存（G7-FEAT-03，D-G = ①）**

- 新证据（Typora 官方《Auto Save》）：Win/Linux 默认 **5 分钟**，`autoSaveTimer`（Double / 分钟）
  藏在 `conf/conf.user.json`、**GUI 不可达**；macOS 为 NSDocument 系统特性、始终开启。
  → 原「待复核」升级为**确定差距**，按 D-G = ① 对齐。
- `packages/app-core/src/autosave.ts`（新）：`DEFAULT_AUTOSAVE_MINUTES = 5`、
  `parseAutosaveMinutes`（非法值回退默认、次分钟值夹紧到 1 分钟）、`isAutosaveEnabled`、
  `autosaveIntervalMs`。纯函数、可单测，策略与 UI 解耦。
- `apps/desktop/src/App.tsx`：`autosaveEnabled` / `autosaveMinutes` state +
  `window.setInterval(..., autosaveIntervalMs(minutes))`，依赖 `[autosaveEnabled, autosaveMinutes]`
  保证改设置立即重排；复用既有 `maybeAutoSaveRef`（仅在 dirty 时落盘），blur / 文档切换路径不变。
- `packages/settings/src/index.ts`：新增 `files.autosaveTimer`（默认 `'5'`）。
  Typora 该配置需手改 JSON，Mellow 暴露到 GUI → 判定 **B（更优）**。
- 单测 `packages/app-core/test/autosave.test.ts` 6 例全绿；护栏 `verify-settings-contract.mjs`
  第 ⑦ 节锁定默认值 / 解析函数 / 定时器三要素 / i18n 双语，并含变异复检 canary。

**5.3 打印与页面设置（G7-FEAT-01 / 02，D-H = ②）**

- **G7-FEAT-01 判定更正**：`typora-menu-dump.txt` 全文只有 `Print` 与 `Page Setup`，
  **无 Print Preview**。因此「无打印预览 UI」不是差距，原 FAIL 判定失真（本轮第四例同类失真：
  把「Mellow 有而 Typora 无的自研资产」误列为 parity 缺口）。`buildPrintHtml` 保留为
  导出侧可测试资产（已有单测），护栏永久禁止 `file.printPreview` 复活。
- **G7-FEAT-02**：非 macOS 原本仍 invoke、`Err` 后弹「当前平台不支持页面设置」——
  属**空转 + 无操作指引**。改为 `platformMac` 守卫：非 macOS 直接给可操作提示
  （「请在『打印…』对话框中设置纸张大小与页边距」）。平台能力缺口本身（Tauri 无等价原生 API）
  仍登记为 D，不伪造行为。

**5.4 Typora 式 user CSS 分层（W5 主题域）**

- 原状：只加载 `appData/user.css` 单文件；Typora 的机制是 **themes 目录下的
  `base.user.css`（全局）+ `<theme>.user.css`（主题专属）** 两层。属真实机制差距。
- 落地三层（**后层覆盖前层**）：`themes/base.user.css` → `themes/<themeId>.user.css`
  → `appData/user.css`（Mellow 既有单文件保留为最高优先级，向后兼容）。
- 关键实现约束：三个 `<style>` 节点必须**同步按序创建**后再异步填内容。读取是异步的，
  若按 resolve 顺序 append，层叠顺序会漂移（同一份 CSS 时好时坏）。
- 切换主题时主题专属层必须**清空**（读取失败 → `textContent = ''`），否则旧主题样式残留。
- `host/userThemes.ts` 的主题扫描排除 `*.user.css` —— 否则 `base.user.css` 会被注册成
  名为「base.user」的伪主题出现在主题菜单里。
- 用户主题 id 形如 `user/<name>`，`/` 非法文件名 → `themeUserCssFile()` 剥离 `user/` 前缀。

**5.5 Reader / 编辑器正文字号同源（§6.1「三处不一致」的残余）**

- 原状：`.mellow-reader` 硬编码 `font-size: 16px`，而 `editor.fontSize` 只走
  `setEditorConfig`（iframe）→ 用户设 20px 时 Reader 仍 16px。
- 落地：新增 `--mellow-content-font-size`，Reader 改为
  `font-size: var(--mellow-content-font-size, 16px)`；App 在**三个写入点**
  （启动恢复 / `adjustFontSize` 缩放命令 / settings live apply）同步写该变量。
- 护栏：`verify-shell-typography.mjs` 交叉比对「CSS 回落值 == `TYPOGRAPHY_DEFAULTS.fontSize`」
  并统计 `applyContentFontSize` 调用点 ≥ 3；同时把 W2.2 的字号断言从「锁代码形状」
  改为「锁语义」（2026-09-12 因提取变量而误报，格式耦合教训）。

**5.6 Search 的 invalid regex 就地提示（§7.3）**

- 原状：`buildSearchRegex` 对非法正则 `catch` 后返回 `null`，与「空查询」和「零匹配」
  **不可区分** → 界面只显示「无结果」，用户无法判断是语法写错还是文档里真没匹配。
- 落地：`app-core/globalSearch.ts` 新增 `isSearchRegexValid(options)`（只校验 regex 模式，
  豁免非 regex 模式与空查询 —— 否则纯文本搜索会被误判为非法）；App 侧派生
  `searchRegexInvalid` 并在 toggles 下方渲染 `.search-regex-invalid`（`role="alert"`，
  subtle 错误指示而非弹窗，与 broken link 指示同一种视觉语言）。
- 单测 3 组（合法性判定 / 与 `buildSearchRegex` 判定一致无旁路 / 豁免分支）+ 护栏 ㉞ + canary。

**5.7 未闭环项（依赖真机 / 外部凭据，转 W6 / W7）**

图片上传真实链路（PicGo / PicList / Custom）、7 应用跨应用剪贴板、表格 cell IME、
主题 `user.css` 加载顺序真机验证、导出 corpus 三平台视觉比对 —— 均需真机或外部服务凭据，
本环境无法完成，保持 NOT_TESTED 而非臆造结论。

### W6 — 三平台 Native Adapter 收口

| 平台 | 任务 |
|---|---|
| macOS | 原生标题栏按钮 / Menu Bar / Services / Share；`Cmd+,` / `Cmd+W` / Native Fullscreen；Quick Look；签名 + 公证 DMG |
| Windows | Snap / 窗口控制（含新窗口）；MSI / NSIS / Portable；文件关联 / Open With / Explorer；**微软拼音 + 搜狗真实交互矩阵**；JumpList |
| Linux | GNOME / KDE；Portal / 原生文件对话框；AppImage / deb / rpm；MIME / XDG；fcitx5 / ibus 扩到 Keyboard / Caret / Clipboard |

**Exit Gate**：核心 Editor 无平台分支；Adapter contract tests 通过；安装/卸载/更新矩阵通过；ADR-0019 trigger 未触发（若触发则停止并新增 ADR）。

### W7 — 真机、效率与盲测

1. 三平台 Golden Journeys（J01–J18）；
2. **30 个核心计时任务，两轮交叉顺序**；
3. **UX Score 100 分评分表**；
4. Typora 用户迁移盲测（禁止先解释）；
5. Accessibility keyboard + screen reader baseline；
6. Performance 同机对照（Startup P95 ≤1.2s；1MB ≤250ms；10MB ≤1.0–1.5s；输入 P95 <16ms）；
7. Source Fidelity / File Safety / Export corpus 全量；
8. Menu AX dump / Screenshot Golden 三平台。

### W8 — Release Gate 与结论发布

**Exit Gate**

- Total UX Score ≥ 92；Live Editing ≥ 24/25；Caret / IME / Undo = 15/15；File Safety = 5/5；
- ≥ 27/30 任务 ≤ Typora +5%；关键任务无一慢 >15%；
- IME corruption = 0；Data loss = 0；Source Fidelity = 0 diff；
- Windows / macOS / Linux 全 PASS-E；
- 台账无 `AUTO` 残留被误标为 PASS-E。

**状态：工具链已就绪（V7-W5），结论待真机证据 —— 当前判定 NO-GO。**

新增第 14 个护栏 `tests/parity/verify-release-gate.mjs`（已接入根 `test` / `parity` 链），
把「发布结论无法绕过证据」固化为可静态判定的契约：

1. **护栏全集接入**：`tests/parity/verify-*.mjs` 每一个都必须出现在根 `test` 与 `parity`
   两条脚本链中（防「新增护栏忘了接线」与「悄悄删掉一条」）。**首跑即自检出自身未接线**，
   接线后通过 —— 该自指设计使「忘记接入」不可能被漏过。
2. **结论可达性**：任何 `PASS-E` 项的 `requiredEvidence` 必须含三平台真机 + `ux-gate`；
   硬失败。与 `verify-parity-ledger`（校验 schema）分工，本护栏校验**结论可达性**。
3. **CI 门禁完整**：packages 单测 / editor-engine 单测 / 桌面构建 / 渲染层指纹（须在 build
   之后）/ parity 链 / `cargo test` 六项锚点齐备。
4. **发布门禁**：`release.yml` 每个打包 job 必须在**打包之前**跑 `verify-release-bundle.mjs`
   （指纹错配会静默加载旧引擎，是最危险的静默降级）。
5. **NO-GO 清单只报告不抛错**：开发期必然存在未闭环项，护栏如实列出而非掩盖。

**当前输出**（2026-09-12）：`NO-GO：6 项未闭环` ——
`P0-EDITOR-004`（IME，仅 macOS）、`P0-PERF-001`（性能，仅 macOS）、`P0-PLATFORM-001`（三平台 Runtime，IMPL）、
`P0-QA-001`（UX Score / 30 任务，NOT_TESTED）、`P0-EDITOR-005`（拼写检查词典，BLOCKED）、
`P0-LAYOUT-002`（三平台视觉 Golden，BLOCKED）。**这 6 项全部依赖真机或 `host-api` 扩展，
本环境无法闭环 —— 在补齐前不得发布 PASS-E 结论。**

---

## 9. 测试与证据体系

### 9.1 自动化层

| 层 | 内容 |
|---|---|
| Unit | parser、commands、table、image path、clipboard、settings |
| **Contract** | CommandDescriptor、Host API、**Menu Schema diff**、Adapter |
| Editor Integration | marker、caret、selection、IME event、undo、mode switch |
| Rust | save、watcher、recovery、search、export、permission、geometry |
| Desktop E2E | file、sidebar、menu、settings、export、dialog、drag-drop |
| Visual Golden | shell、sidebar 四模式、tabs、settings、theme、dialog |
| Corpus | Source Fidelity、File Safety、Export、Typora Markdown |

### 9.2 真机矩阵

| 平台 | 必测 |
|---|---|
| macOS | 拼音、五笔、WKWebView、Menu / Share / Quick Look、DMG |
| Windows 10/11 | 微软拼音、搜狗、WebView2、MSI / NSIS / Portable、Clipboard、Print、**真实交互矩阵** |
| Ubuntu / Fedora | fcitx5、ibus、WebKitGTK、GNOME / KDE、AppImage / deb / rpm、Keyboard / Caret / Clipboard |

CI 只能在真实桌面输入链路、文件读回与 Undo 断言全部成立时计为通过；**单纯构建成功不得替代体验验收**。

### 9.3 视觉 Golden（每平台 14 场景）

首次启动 · 单文档 Live · File Tree · **File List** · Outline · Search · Settings · Selection Toolbar（浮动编辑器工具栏）· Table Toolbar · Reader · Light / Dark · 900×600 · 200% Zoom

**基线按平台分离（2026-09-12，P0-LAYOUT-002）**：基线存的是布局**测量值**（写作宽度 / 行高 /
aside 尺寸），而这些依赖平台的字体度量与 DPI —— 用 macOS 基线与 Linux / Windows 产物比对
**必然失配**，会把门禁退化成「只能靠 `--update` 糊过去」的假门禁。故新增
`tests/visual/golden-path.mjs`：

| 平台 | 基线文件 |
|---|---|
| macOS | `golden/<name>-golden.json`（沿用历史文件名，本机实测基线） |
| Linux | `golden/<name>-golden.linux.json` |
| Windows | `golden/<name>-golden.windows.json` |

- 首次在某平台运行会**自动生成**该平台基线并成功退出（与既有脚本行为一致）；
  基线提交后，同平台后续运行即进入比对模式，漂移会使门禁失败。
- `MELLOW_GOLDEN_PLATFORM` 可覆盖判定（空串按未设置处理 —— CI 常见「已设置但为空」，
  曾因此产生 `*-golden..json` 畸形名）。
- **禁止**在非对应平台上生成平台基线后直接提交（那等于伪造跨平台证据）；
  护栏 `verify-visual-golden.mjs` 约束：三个脚本必须使用 `goldenFile()`、
  `golden/` 下的文件名必须符合 `^(layout|sidebar|scenes)-golden(\.(linux|windows))?\.json$`。
- 采集已接入 `.github/workflows/runtime-qualification.yml` 的 `linux-runtime` 与
  `windows-runtime`（Playwright 装在仓库外临时目录，不污染依赖），产物上传为
  `linux-visual-golden` / `windows-visual-golden`；**首次 CI 运行后需人工把基线提交入库**，
  之后即成为真正的跨平台门禁。

**macOS 侧 14 场景已全覆盖（2026-09-12）**：`visual-golden.mjs`(6) + `sidebar-golden.mjs`(4)
+ `scenes-golden.mjs`(7) —— 首次启动 / 单文档 Live / File List / Settings / Selection Toolbar /
Table Toolbar / Reader，7/7 命中基准（±1px）。

### 9.4 Menu Golden

Typora 1.14.9 zh-CN / en-US（规范 Golden）· Mellow macOS / Windows / Linux × zh-CN / en-US；比较 top-level、item path、order、separator、shortcut、check / enabled state；OS predefined 项允许平台差异。

### 9.5 30 个核心计时任务

沿用 `docs/qualification/ux-score-gate-template.md` 的 30 项，观测字段：entry point / steps / time / errors / hesitation / shortcut success / undo count / caret jump / source diff / subjective complexity / 截图视频证据。每任务 Typora / Mellow 各两轮，交换执行顺序。

---

## 10. Release Blockers

任一存在即禁止发布：

- IME 丢字、重复、提前提交；
- Caret / Selection blocker；
- Undo semantic corruption；
- Save / Recovery / External Conflict 数据损坏；
- Table data loss；Image path / file loss；
- Source Fidelity fail；10MB 不可编辑；PDF CJK garble；
- Clipboard P0 blocker；
- **菜单高频入口缺失或快捷键冲突**；
- Windows / Linux 真机 Journey 未通过；
- UX Score < 92；Live Editing < 24/25；Caret / IME / Undo < 15/15；File Safety < 5/5；
- 未完成 Typora 用户迁移盲测。

---

## 11. 完成定义与状态看板

### 11.1 PASS-E 定义

```text
Functional
+ Typora Experience Contract + Correct Entry Point + Default State
+ Windows + macOS + Linux + zh-CN + en-US
+ Keyboard + Mouse + Accessibility + IME + Caret/Selection + Undo/Redo
+ Source Fidelity + Performance Budget + Automated Tests + Manual Golden Journey
= PASS-E
```

任何一项缺失，状态只能是 IMPL / AUTO / platform-partial，**不得写「已完成对标」**。

### 11.2 当前看板（台账 32 项）

| 状态 | 数量 | 说明 |
|---|---|---|
| PASS-E | **0** | 尚无 |
| AUTO | 28 | 自动化通过，真机未验 |
| MAC | 2 | IME/Undo、性能 |
| IMPL | 1 | 三平台 Runtime 门禁 |
| NOT_TESTED | 1 | UX Score 与 30 任务 |

W0 完成后台账将扩容至覆盖 §7 全部合同条目。

---

## 12. 待确认决策点（D 表）

> 本节是本方案「待确认」的核心。**请逐项裁决**；未裁决项在实施中一律保持现状并登记为 D。

| # | 决策点 | 选项 | 建议 |
|---|---|---|---|
| **D-A** | `.editor-topbar` 常驻文件名条去留 | ① 移除（对齐 Typora：文件名只在系统标题栏）② 保留为 Mellow 有意差异 D ③ 改造为纯操作条（去掉文件名，只留侧栏/大纲开关） | **已裁决 = ③**（W2.3 落地）。理由：文件名真源已存在（`windowService.setTitle`，含 dirty `●` 前缀，macOS 原生栏 / Windows 自绘栏均显示），Typora 无应用内文件名条 → ① 的去文件名部分必须做；但该条同时是 macOS 上**唯一可发现的侧栏入口**（G7-SHELL-05：`.shell.platform-mac .titlebar` 被 `display:none`）与浮动大纲开关的载体 → 整体移除会引入可用性回退。故取 ③：删居中文档名 + 左侧按钮 macOS 恒显 + 条高保持 34px（避免视觉基线漂移）。残余差异「Typora 无此条」登记为 D。 |
| **D-B** | EditorToolbar 形态 | ① 改为 Typora 1.14 式**浮动**工具栏（Selection 锚定）② 保留常驻横条并补全按钮（H1 / 正文 / 表格行列 / 查找）③ 两者并存 | **已裁决 = ①**（W2.4 落地）。依据 Typora 1.14 What's New 原文「You can now enable the **float toolbar** from menubar → **View → Toolbar** or from **Settings → Appearance**」：Typora 只有一个「编辑器工具栏」概念且为浮动。Mellow 的浮动工具栏**早已存在**（引擎级 `selectionToolbar`，Selection 锚定、IME 冻结、可键盘操作），故 ① 的落地形式是**退役**与之重叠的壳层常驻横条（`packages/desktop-ui/src/EditorToolbar.tsx` 及 `.editor-toolbar` 样式），并把 `View → 工具栏` 指向浮动工具栏（与设置项同源 storageKey `mellow.selectionToolbar.enabled`），同时把设置项从「编辑器」移到「外观」对齐 Typora。②③ 均被否：② 会留下 Typora 不存在的常驻横条；③ 制造两套格式工具心智负担。 |
| **D-C** | 侧栏操作入口位置 | ① 改为 Typora 式**侧栏底部**文件夹菜单（Refresh / Open Folder… / 排序 / Recent）② 保留现顶部 header + 右键菜单 | **已裁决 = ①**（W3.3 落地）。依据 Typora 官方 File Management 原文「At the bottom of the left side bar, users can pop up menu items for the current folder」。落地形态：新建 `SidebarFooter.tsx`（底部单行按钮：文件夹图标 + 当前文件夹名 + 上箭头）+ `openFolderMenu`（Refresh / Open Folder… / 展开·折叠全部 / [包含子文件夹] / 排序子菜单 / 最近文件夹子菜单）；仅在 Files（树·列表）模式渲染（Typora 的 Outline / Search 面板底部无此条）。**顶部 `SidebarHeader` 与行右键菜单全部保留** —— ① 是「补齐 Typora 真机具备的入口」，不是替换既有入口；② 被否因它等于放弃一个 Typora 真值条目。 |
| **D-D** | New Tab 与 Switch Between Opened Documents | ① 维持 SDI 不提供，登记为 D ② 恢复 macOS `Cmd+T` 新窗口语义 + 文档切换 | **①**：SDI 是已确认产品决策，但需显式登记为 D |
| **D-E** | macOS Replace 键位 | ① 改为 `Cmd+H`（官方表）② 保留 `Cmd+Alt+F`（避免与系统 Hide 冲突）并登记 D | **先真机复核** Typora 1.14.9 实机行为再定 |
| **D-F** | 缩进方向 | ① 照抄官方（Indent = `[`，Outdent = `]`）② 以实机为准 | **已裁决 = ①**（W1.2 落地）。证据：官方 Shortcut Keys 页明确 `Indent: Ctrl+[ / Tab`、`Outdent: Ctrl+] / Shift+Tab`，且该页自述「键位即菜单项右侧显示值」。`typora-menu-dump.txt` 的 CodeMirror `keymap` 段（`Cmd-[ => indentLess`）是编辑器内部默认，被原生菜单 accelerator 覆盖，不作为裁决依据。 |
| **D-G** | 自动保存行为 | ① 对齐 Typora 实测默认 ② 增加定时保存 | **已裁决 = ①（V7-W5）**。官方《Auto Save》原文：Win/Linux「documents will be saved every **5 minutes**」，间隔由 `conf/conf.user.json` 的 `autoSaveTimer`（Double / minute / 默认 5）改写且 **GUI 不可达**；macOS「auto-save is always enabled as a system feature」。落地：三平台统一 5 分钟定时保存（规则 10），受既有 `mellow.file.autosave` 开关控制，并把间隔暴露到 GUI（Typora 需手改 JSON）= **B 级增强** |
| **D-H** | 打印预览 | ① 实施预览窗口 ② 维持直接系统打印对话框（对齐 Typora） | **已裁决 = ②（V7-W5）**。`typora-menu-dump.txt` 全文只有 `Print => 打印` 与 `Page Setup => 页面设置`，**无 Print Preview 条目**；故「无预览窗口」不是差距。维持 `file.print → print_window`（系统对话框），并在护栏中永久禁止 `file.printPreview` 复活 |
| **D-I** | 扩展 API 运行时 | ① V1 保持骨架（PRD 列 P1）② 提前实施 | **①**：不阻塞 V1 对标 |
| **D-J** | 内置主题数量 | ① 保持 8 个（超过 Typora 6 个）② 收敛为 6 个对齐 Typora | **①**：PRD 要求 ≥6 原创，更多不破坏心智 |
| **D-K** | 实施节奏 | ① 按 W0→W8 连续推进至 W8 ② 每个工作包完成后暂停确认 | **已裁决 = ①**（用户指令「直到全部完成」）。 |

### W1 期间新增的 D 类裁决（自行评估并登记）

> **编号说明（V7-W5 修正）**：本节原沿用 D-G ~ D-M 编号，与上表 D-A ~ D-K **撞号**（同一
> 字母指两件事，属文档二义）。现统一改号为 **D-Q ~ D-U**（接在 §5.4 的 D-N / D-O / D-P 之后），
> 已同步更新 §5.2 / §8 中的交叉引用。

| # | 决策点 | 裁决 | 依据 |
|---|---|---|---|
| **D-Q**（原 D-G 新） | macOS Replace 键位 | **保留 `Cmd+Alt+F`，登记 D** | 官方表写 `Cmd+H`，但 macOS 保留 `Cmd+H` = 隐藏应用（NSApplication.hide:），改用它会导致系统菜单冲突。Mellow 为 macOS 原生菜单装配，冲突不可接受。 |
| **D-R**（原 D-H 新） | Reopen Closed File 在 SDI 下的语义 | **在当前窗口打开**（非新窗口） | Typora 为多标签，`Reopen Closed File` 恢复标签页；Mellow 为 SDI 单文档窗口，语义等价映射为「替换当前文档」，未保存修改仍经 `guardSingleDocument()` 确认。避免为此新增 Rust 窗口传参通道。 |
| **D-S**（原 D-I 新） | Edit 菜单「拼写和语法检查 / 替换」子菜单 | **保留子菜单结构，内容缺口转 W5** | 真机 nib 提取证实 Typora 确有这两个 NSSubmenu（`Substitutions` 含 5 项）。原 W1.4「平铺」计划被证据推翻，已回退。结构对齐优先，内容（词典/语法/智能引号/文本替换）作为 G7-EDIT-04 在 W5 补齐。 |
| **D-T**（原 D-J 新） | `file.openSnapshotsFolder` 位置 | **保留 File 菜单末位独立分组** | 属 Mellow 崩溃恢复能力入口，Typora 无对应项；置于 separator 后不污染高频组，由 §7.2 31 槽位契约锁定，防未来漂移。 |
| **D-W**（V7-W5 新增，用户裁决） | 验证范围与证据来源 | **macOS = 本机实机验证；Windows / Linux = CI 证据（ADR-0022），不做真实设备验证** | 用户 2026-09-12 裁决。落地：`tests/qualification/macos-local-verification-2026-09-12.md` 记录本机证据（基线 dump 可复现、83 Rust + 1613 jest、前端/release 构建 + 指纹 + 启动冒烟、14 护栏）。**注意**：`requiredEvidence` 中的 `windows` / `linux` 项**继续保留**（仍需证据），只是证据形态为 CI 而非真机 —— 本裁决**不降低**证据要求，只明确来源。<br/>**补充（同日，证据词汇修正）**：裸平台名 `windows` / `linux` 在本裁决下**不可满足**（不做真机验证 → token 永远取不到），等于把门禁变成「永远无法关闭的假门禁」。已统一改为 `windows-ci` / `linux-ci`（与 `P0-PLATFORM-001` 既有写法及 ADR-0022 对齐），共改写 **47 项**台账条目；`tests/parity/verify-release-gate.mjs` ② 节**显式禁用**裸 `windows` / `linux` / `win` / `mac`，未登记词一律拒绝。 |
| **D-X**（V7-W5 新增） | 键位真值的守卫位置 | **官方快捷键表作为护栏合同，不由 e2e 单独主张** | 根因：W1.5（Articles ⌃⌘2）与 W1.9（行内 Code ⌘⇧`）都改过键位，但真值只存在于 `tests/e2e/*.mjs` 断言里，而 e2e 不进 CI → 实现改了、断言没跟上，长期呈现 2 项 ❌ 无人发现（本轮复跑才暴露，经官方表求证后判定为**断言过期、实现正确**）。处置：在 `verify-menu-contract.mjs` 新增 §11「官方快捷键表真值合同」，锁定 **55 条**官方键位（File/Edit/Paragraph/Format/View），修饰键别名归一化 + 有意差异显式登记 + 双 canary，并已用真实注入验证护栏会拦截。e2e 退化为「验证键位能走到正确行为」，不再重复主张真值。 |
| **D-V**（V7-W5 新增） | Auto Pair（自动配对）可配置性 | **维持恒开、不新增设置项，登记 D** | 现状：`autoCharacterPairs` 在 `packages/editor-core/src/bundle.ts` 恒为 `true`，无设置项；Typora 偏好里可关。**默认值与 Typora 一致（均默认开启）**，故用户可感知的**行为**无差异，缺口只在「可配置性」。不实施的理由：① 它是 CM `closeBrackets()` 扩展，在**构建期**由 `window.config.autoCharacterPairs` 决定是否装配 —— 运行时开关需要 Compartment/reconfigure 或改由 `editor-engine` 自研 inputHandler 接管；② 输入路径是最高风险面（括号/引号/反引号/markdown 标记包裹），一次回归就是「打字坏了」级别的事故；③ 收益仅为一个默认态本就一致的开关。风险显著大于收益，故显式登记为 D 而非强制实施。 |
| **D-U**（原 D-K 新） | `image.insertLocal` 多选 | **先实现单选，多选待 `DialogService` 扩展** | `host-api` 的 `OpenFileOptions` 无 `multiple` 字段；扩展 Host 契约需新增 ADR。单选已可满足「插入本地图片」主路径。 |
| **D-Y**（2026-09-13 补登记） | **New Tab（macOS `Cmd+T`）与 Switch Between Opened Documents（`Ctrl+Tab` / ``Cmd+` ``）** | **维持 SDI 不提供，显式登记 D** | §5.2 的 G7-KEY-08 判为「D 或实现」、G7-KEY-09 判为「D（需显式登记）」，但二者此前**从未进入 D 表** —— 属「要求登记却漏登记」，已补齐。依据：SDI 单窗口单文档为已确认产品决策（B1），多标签语义在 SDI 下无对应物；`Cmd+T` 在 macOS 亦无「新标签」可映射。<br/>**同 D-D（显式登记要求一致）**。 |
| **D-Z**（2026-09-13 补登记） | **macOS Actual Size / Zoom In / Zoom Out**（`Cmd+Shift+0` / `=` / `-`） | **保留 Mellow 实现，登记为 D（增强）** | 官方 Shortcut Keys 表（2026-09-06 复核）对 macOS 三档缩放均标注 ***(Not Supported)*** —— 即 Typora 在 macOS **不提供**菜单缩放。Mellow 提供且可用（§6.1 默认 100%），属**超出 Typora 的增强**，不破坏心智，故登记 D 而非删除。<br/>复核同时确认 G7-KEY-08/09/10 三行与官方表一致，§3.4 键位表无漂移。 |
| **D-AA**（2026-09-13） | 格式 → 图片子菜单「Use Image Root Path」 | **不加菜单开关，登记 D** | 证据：`insertLocalImage`（`App.tsx:1530-1536`）在同根时已**默认输出相对路径**（`fileTreeRelativePath`），与 Typora 该选项默认态一致。补一个恒开的菜单开关不增加能力，只增加与设置面板不一致的第二入口。 |
| **D-AB**（2026-09-13） | 格式 → 图片子菜单「When Insert Local Images…」 | **由设置面板承载，登记 D** | 该 Typora 菜单项的语义（插入时复制到资源目录 / 上传 / 保留原路径）已由 `image.assetDir` + `image.uploadService` 两个设置项覆盖（`settings/src/index.ts:182-193`）。以设置承载而非菜单承载，符合「同一语义单一入口」，不复制 Typora 的入口形态。 |
| **D-L（新）** | View 菜单「Search」条目 | **置于侧栏三视图之后、模式组之前** | 官方 View 菜单无 Search（搜索在侧栏内）；Mellow 全局搜索（⇧⌘F）需常驻入口，紧邻侧栏组语义最近，且不与 Typora 基础项混淆。 |
| **D-M（新）** | View 菜单「Word Count / Always on Top」位置 | **归入状态组，排在状态栏开关之后** | 二者均为「窗口/状态」语义，与 Typora 的 `Show Status Bar` 同组；不插入 Typora 的显示模式组。 |

---

## 13. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-24 | V3.0 | 移除 Split Mode；P0 基线治理完成 |
| 2026-09-01 | V4.0 | 基于 `2482503` 全量审计重写：关闭顶层菜单差距；新暴露 Win/Linux 9 处快捷键偏离、9 模块缺 IME guard、侧边栏 watcher/虚拟化/键盘缺口、line-height 失效、Table 100×30 与 Clipboard 跨应用零测试、无视觉 Golden |
| 2026-09-03 | V4.1–V4.2 | 自动化范围收口（12 包 jest 1418 例 + parity 护栏 12 个）；D3/D4/D6/D9 关闭；新增 ADR-0023；D7 单项解冻 JumpList 与 broken-link indicator |
| 2026-09-04 | V4.3–V4.4 | 重审计确认 18 项 G4 缺陷已随 v1.4.x 修复；C1–C6 桌面对标第二轮（右键菜单全面对标、菜单收口、StatusBar 配置、默认字体、widget 15 状态矩阵） |
| 2026-09-05 | V4.5–V4.6 | 第三、四轮（常驻工具栏、只读模式、图片尺寸、代码块语言标签、源码行号、窗口几何记忆、写作限宽内部化、SDI 真值表）；V5 渲染/侧栏对标；V6 渲染层指纹治理 |
| 2026-09-06 ~ 09-11 | v1.5.0–v1.5.5 | 真机反馈五轮：渲染层指纹 + 视觉残差清零 + 壳 UI Typora 化 + 侧栏 Typora 化 + 树形去边框 + 引擎级字号阶梯 + 引用加固 + 代码高亮与复制按钮 + 浮动大纲 + iframe 防缓存 + 标题段落间距收敛 |
| **2026-09-11** | **V7.0** | **归并 V3–V6 与全部真机反馈轮次为唯一权威版本；以 Typora 官方文档 + 1.14.9 dump 重建参考模型（§3）；差距重新分类为「缺失 / 不一致 / 未验收」三类；新识别 3 项 E 级缺失（Reopen Closed File、File List / Articles、macOS 标题栏字数）与 1 项真实缺陷（排版默认值三处不一致、Windows 新窗口双标题栏）；工作包重排为 W0–W8；新增 D-A ~ D-K 待裁决决策点** |

---

## 14. 最终目标

Mellow V1 的最终状态：

> Typora 用户无需学习新的基础写作方式；默认界面同样克制；菜单、快捷键、侧边栏、表格、图片、剪贴板、搜索、主题、导出都能在预期位置完成；Live Markdown、Caret、IME、Undo 和文件安全达到正式 Gate；Reader、Recovery、Large File 和开放扩展在不增加默认复杂度的前提下提供明确优势。

在此之前只能描述为：**「以 Typora 体验为目标的 Mellow」**。

W8 全部通过后，才允许描述为：**「与 Typora 1.14.9 核心体验一致，并在安全、中文输入、大文件、阅读和跨平台一致性上更优。」**
