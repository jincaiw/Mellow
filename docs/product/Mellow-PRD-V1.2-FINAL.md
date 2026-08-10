# Mellow 产品需求文档（PRD）— Typora 体验对标最终冻结版

**产品名称：Mellow**  
**文档版本：V1.2 FINAL / SCOPE FROZEN**  
**日期：2026-08-09**  
**文档状态：最终冻结产品需求基线；后续只允许细化实现规范，不再扩张 V1 功能范围**  
**基础代码项目：MarkEdit-app/MarkEdit**  
**参考项目：Razee4315/Paperling、pluk-inc/markdown-preview**  
**核心竞品 / 体验验收基线：Typora 1.14.6**  
**正式目标平台：Windows / Linux / macOS**  
**国际化：完整 i18n 架构；V1 至少内置简体中文、English；简体中文为首次启动默认语言**

---

# 0. 一页结论

Mellow 是一款以 **MarkEdit** 为代码和编辑器底座重新构建的跨平台 Markdown 桌面编辑器。

产品目标不是“功能类似 Typora”，而是：

> **让熟悉 Typora 的用户切换到 Mellow 后，核心写作流程无需重新学习；高频编辑动作、文件管理、表格、图片、搜索、主题和导出体验与 Typora 等价或更自然，并在中文输入、文件安全、阅读模式、开放性、大文件和跨平台一致性方面更优。**

最终组合：

```text
MarkEdit
└── CoreEditor / CodeMirror 6 / Lezer / Markdown correctness

Typora 1.14.6
└── 核心功能、Live Preview、桌面布局、快捷键、交互习惯、质量基线

Paperling
└── Tauri / React 跨平台实践、Reader/Code/Split、Command Palette、
    Slash Commands、Smart Paste、Visual Table、AI Diff

markdown-preview
└── Reader-first、原生阅读体验、Outline、Zoom、Open With、Quick Look
```

**唯一基础项目：MarkEdit。**

Paperling 与 markdown-preview **只参考优点，不替换 MarkEdit CoreEditor**。

---

## 0.1 架构总原则：针对用户需求开发，而不是针对操作系统重复开发

Mellow 正式采用：

> **Cross-platform First + Native Enhancement（跨平台优先、原生增强）**

产品需求先定义“用户要完成什么”，再定义统一交互和领域能力，最后才决定某项能力在 Windows、macOS、Linux 上如何落地。

架构原则：

```text
User Need
   ↓
Product / UX Contract
   ↓
Shared Application & Editor Core
   ↓
Cross-platform Desktop Runtime
   ↓
Platform Adapter
   ↓
Small Native Enhancement
```

禁止反向设计：

```text
Windows 能怎么做？
macOS 能怎么做？
Linux 能怎么做？
↓
分别设计三套产品
```

Mellow 不维护三套编辑器、三套文件模型、三套命令系统或三套 UI。

允许差异的只有：

- 窗口系统习惯；
- 系统菜单；
- 文件选择器；
- 系统分享；
- Quick Look / Explorer / XDG 等系统集成；
- 平台安全和权限 API；
- 少量平台专有增强。

**同一用户任务必须由同一 Product Contract 定义。**

---

## 0.2 Mellow 的“双核心”而不是“全 Rust”

“跨平台高性能核心”在 Mellow 中分成两个不同的领域核心：

```text
┌─────────────────────────────────────────────┐
│ TypeScript Editor Core                      │
│ MarkEdit CoreEditor + CodeMirror 6 + Lezer │
│ 输入 / Selection / Undo / AST / Decoration │
└─────────────────────┬───────────────────────┘
                      │ Typed Contract
┌─────────────────────▼───────────────────────┐
│ Rust System Core                            │
│ File / Watch / Search / Recovery / Export  │
│ Settings / Security / Keychain / Update    │
└─────────────────────────────────────────────┘
```

原因：

1. MarkEdit 最有价值的资产已经是成熟 TypeScript/CodeMirror 编辑核心；
2. 把这一部分重写成 Rust 会增加风险，却不会自动提高 Typora 级编辑体验；
3. 文件、搜索、恢复、Watcher、导出等能力非常适合 Rust；
4. Rust 与 Tauri 运行时天然一致，可减少额外 Sidecar/IPC；
5. 两个 Core 都必须是平台无关实现，不得散布 Windows/macOS/Linux 条件逻辑。

因此：

> **跨平台核心 ≠ 所有代码必须使用同一种语言。**

正确目标是：

> **领域逻辑只实现一次。**

---

# 1. 产品愿景

> **Mellow = 一个真正可以替代 Typora 的、开源友好、跨平台、中文优先的现代 Markdown 桌面编辑器。**

Mellow 的关键体验关键词：

- 即写即得；
- Markdown 不打扰；
- 内容优先；
- 打开即写；
- 打开即读；
- 不丢数据；
- 不绑云；
- 不强迫账号；
- 不做 IDE；
- 不做知识库数据库；
- 不把 AI 放在核心写作之前。

---

# 2. 最重要的成功标准

Mellow V1.0 只有同时满足以下条件才算成功：

1. Typora 用户可以零学习成本完成最常见写作任务；
2. Live Markdown 编辑体验达到 Typora 水平；
3. 中文 IME 在 Windows/Linux/macOS 全部稳定；
4. Caret / Selection / Undo 不因渲染层发生异常；
5. 打开 Typora Markdown 文件无需迁移；
6. 表格与图片操作达到 Typora GUI 水平；
7. 文件树、文件列表、大纲、Quick Open、Global Search 完整；
8. PDF / HTML 导出达到日常生产可用；
9. 10 MB 文档仍然可编辑；
10. 不存在已知数据损坏问题；
11. Windows、Linux、macOS 的核心体验同级；
12. 默认简体中文，完整支持英文，并具备任意语言扩展能力。

---

# 3. “与 Typora 一致或更优”的严格定义

为避免“功能做了但不好用”，所有对标项分为三类。

## 3.1 E — Equivalent：必须体验等价

Mellow 与 Typora 完成同一任务时必须满足：

- 操作步骤不更多；
- 核心快捷键相同或遵循对应系统惯例；
- 用户不需要切换额外模式；
- 结果语义一致；
- Markdown 原文兼容；
- 反馈速度不更慢；
- 错误提示不更模糊；
- 默认配置不增加学习成本。

典型 E：

- Live Preview；
- Bold / Italic / Heading；
- List；
- Table；
- Image；
- File Tree；
- Outline；
- Quick Open；
- Search；
- Focus；
- Typewriter；
- Themes；
- Export。

---

## 3.2 B — Better：明确要求优于 Typora

Mellow 必须重点领先：

- 中文 IME；
- Crash Recovery；
- External Conflict；
- Git-friendly minimal diff；
- Source Fidelity；
- Reader Mode；
- Split Mode；
- Command Palette；
- Slash Commands；
- Large File Mode；
- Extension API；
- Extension Permission；
- 三平台体验一致性；
- 安全默认值；
- 可选 AI Diff。

---

## 3.3 D — Deliberate Difference：允许有意不同

Mellow 不追求像素级复刻。

以下必须原创：

- Logo；
- App Icon；
- 品牌颜色；
- 默认主题 CSS；
- 图标资产；
- 插画；
- About 页面；
- Welcome 页面。

目标：

> **交互认知等价，不复制 Typora 专有视觉资产。**

---

# 4. 多轮深度评估

---

## 4.1 第一轮：基础项目选择

评估：

| 指标 | MarkEdit | Paperling | markdown-preview |
|---|---:|---:|---:|
| Live Markdown 内核潜力 | 10 | 7.5 | 5 |
| Markdown 正确性 | 10 | 8 | 8 |
| CodeMirror 深度 | 10 | 8 | — |
| 大文件潜力 | 10 | 8 | 9 |
| 跨平台现状 | 4 | 10 | 3 |
| 文件工作流 | 6 | 9 | 6 |
| Reader | 6 | 9 | 10 |
| 扩展能力 | 9 | 7 | 4 |
| 重构长期价值 | **10** | 8 | 5 |

### 最终决策

**MarkEdit 是唯一基础项目。**

原因：

> 最难复制的不是 Tauri 壳、文件树或设置页，而是编辑内核。

MarkEdit CoreEditor 已使用：

- CodeMirror 6；
- Lezer Markdown；
- History；
- Multiple Selection；
- Bracket Matching；
- Search；
- Completion；
- Markdown Styling；
- Table；
- Math；
- Mermaid；
- Front Matter；
- Task List；
- Input interception；
- Extension API。

因此 Mellow 应：

```text
保留 CoreEditor
重构 Desktop Host
重做 Desktop UI
增强 Live Markdown
```

而不是重新做编辑器。

---

## 4.2 第二轮：Paperling 价值评估

Paperling 最值得 Mellow 吸收：

- Tauri 2 + Rust；
- React + TypeScript；
- Windows / Linux / macOS；
- Reader / Code / Split；
- Bidirectional Scroll Sync；
- File Explorer；
- Outline；
- Command Palette；
- Slash Commands；
- Smart Paste；
- HTML → Markdown；
- TSV → Table；
- Visual Table Toolbar；
- Wikilink Completion；
- AI Merge/Diff；
- OS Keychain；
- Updater；
- External Change；
- Auto Save。

### 结论

```text
Paperling ≠ Mellow 基础
Paperling = Desktop / Workflow Reference
```

---

## 4.3 第三轮：markdown-preview 价值评估

最值得吸收：

- 打开即读；
- 极简 Reader；
- Outline；
- Inspector；
- Search；
- Zoom；
- Open With；
- Share Source；
- Quick Look；
- CLI；
- Default Markdown Handler。

### 结论

markdown-preview 不适合跨平台基础，但：

> **Reader Mode 的产品哲学明显值得 Mellow 采用。**

---

## 4.4 第四轮：Typora 1.14.6 体验拆解

Typora 最核心的不是“Markdown 功能很多”。

真正构成 Typora 用户体验的层次是：

### 第一层：编辑手感

1. Markdown marker 智能隐藏；
2. Caret 进入元素后立即显示语法；
3. 离开后立即恢复排版；
4. Inline 与 Block 渲染自然；
5. Undo 符合输入动作；
6. Caret 不跳；
7. IME 不干扰。

### 第二层：写作结构

8. Table GUI；
9. Image；
10. Lists；
11. Code；
12. Math；
13. Mermaid；
14. Footnotes；
15. TOC。

### 第三层：文档导航

16. File Tree；
17. File List；
18. Outline；
19. Quick Open；
20. Global Search。

### 第四层：低干扰

21. 极简 UI；
22. Focus；
23. Typewriter；
24. Themes；
25. Floating Toolbar。

### 第五层：输出

26. Smart Copy / Paste；
27. PDF；
28. HTML；
29. Image；
30. Pandoc。

因此：

> **任何“AI 很强”“插件很多”的实现，都不能抵消 Live Editing 不如 Typora。**

---

## 4.5 第五轮：桌面 Runtime 评估

候选：

### A：Tauri 2

优点：

- Rust backend；
- 小体积；
- 性能；
- Paperling 已验证；
- 权限模型；
- 文件系统友好。

风险：

```text
Windows → WebView2
macOS → WKWebView
Linux → WebKitGTK
```

三个 WebView 的：

- IME；
- Selection；
- Composition；
- Clipboard；
- Printing；
- CSS；
- Scroll；

可能存在差异。

### B：Electron / Chromium

优点：

- 三平台 Browser Engine 一致；
- CodeMirror 行为一致性高；
- 更容易保证 UI parity。

代价：

- 包更大；
- Memory 更高；
- 与 MarkEdit 轻量理念相冲突。

### 最终策略

> **首选 Tauri，但必须先通过 V0.0 Runtime Qualification Gate。**

若三平台任意一平台无法满足 Live Editing / IME / Clipboard / Export 的硬指标：

> **在 V0.1 前切换 Electron。**

不允许为了“轻量”牺牲 Typora 级使用体验。

---

## 4.6 第六轮：范围收敛

从候选需求中删除或延期：

- Knowledge Graph；
- Backlink Database；
- Cloud Workspace；
- Team Collaboration；
- Full Git；
- Terminal；
- Browser；
- AI Agent automation。

原因：

> 这些功能会把 Mellow 从 Typora 替代品变成 Obsidian / IDE / Notion。


---

## 4.7 第七轮：跨平台优先、原生增强架构合理性评估

该观点对 Mellow **高度适用，但不是无条件的技术教条**。

对于 Markdown 编辑器这种产品：

- 核心用户任务高度一致；
- 文档格式一致；
- 编辑语义一致；
- 文件工作流大部分一致；
- Windows/macOS/Linux 差异主要集中在桌面集成层。

因此重复构建三套原生程序会造成：

- 三套 Feature Implementation；
- 三套 Bug；
- 三套测试；
- 三套 UX 漂移；
- 三套 AI 代码上下文；
- 三倍左右的长期同步成本风险。

Mellow 正式采用：

```text
One Product
One Editor Semantics
One Command Model
One File Model
One Settings Model
One i18n Model
One Extension API

+ Windows Adapter
+ macOS Adapter
+ Linux Adapter
```

但“统一”不能成为降低体验的理由。

如果某个统一实现明显劣于系统原生能力：

> 使用 Native Enhancement。

---

## 4.8 第八轮：Tauri / Qt / Flutter / Electron 对 Mellow 的重新评估

### Tauri 2 — 首选

适合原因：

- 与 MarkEdit TypeScript/CoreEditor 直接衔接；
- Rust Core；
- React/Vite 可直接复用；
- Windows/macOS/Linux；
- Paperling 已提供同类应用实践；
- 最小权限 Capability 模型；
- 安装包和内存潜力较好。

主要风险：

- 不同系统 WebView；
- Linux WebKitGTK；
- IME / Clipboard / Printing / CSS 差异。

结论：

> **首选，但必须通过 Runtime Qualification。**

---

### Electron / Chromium — 第一备用

适合原因：

- 三平台 Chromium 一致；
- CodeMirror / DOM / IME 行为更容易统一；
- Web 编辑器生态风险最低。

代价：

- 更大安装包；
- 更高基础内存；
- Runtime 自带 Chromium；
- 与 MarkEdit“轻”的理念不完全一致。

结论：

> **不是失败方案，而是当系统 WebView 无法达到 Typora 级编辑体验时的理性 fallback。**

---

### Qt — 不作为 Mellow 主路线

Qt 本身是非常成熟的桌面跨平台框架，也正式支持 Windows、macOS、Linux。

但 Mellow 已拥有 MarkEdit 的 CodeMirror/Web 编辑资产。

采用 Qt 有两个方向：

1. 重写 Editor/UI 为 Qt/C++/QML；
2. 使用 Qt WebEngine 承载现有 CodeMirror。

方案 1 会丢失 MarkEdit 最大资产；方案 2 实际仍需要 Chromium WebEngine、JS bridge 和额外桌面技术栈。

因此：

> Qt 是优秀桌面技术，但**不是 Mellow 当前资产条件下的最优重构路径**。

---

### Flutter — 不作为 Mellow 主路线

Flutter 同样正式支持 Windows、macOS、Linux，并支持平台插件和原生代码集成。

但 Mellow 若改 Flutter：

- Desktop UI 需转 Dart；
- CodeMirror 需要嵌入 WebView 或重写编辑器；
- MarkEdit CoreEditor 复用价值降低；
- React/Paperling 参考代码无法直接吸收。

因此：

> Flutter 适合从零构建统一 UI 的产品，但不适合 Mellow 当前“保留 MarkEdit CoreEditor”的核心约束。

---

## 4.9 第九轮：Rust 与 Go 的核心层选择

Rust 和 Go 都适合跨平台系统服务。

Mellow 最终选择：

> **Rust 为 System Core。**

不是因为 Go 不够好，而是：

1. Tauri Core 本身使用 Rust；
2. File/Watcher/Search/Recovery 可在同一 Core Process 内完成；
3. 不需要额外 Go Sidecar；
4. 少一个进程生命周期；
5. 少一层 IPC；
6. 少一套打包和更新；
7. 更容易使用 Tauri Capability/Scope。

Go 仍可用于未来独立服务，例如：

- 独立 CLI Server；
- 网络型协作服务；
- 后台索引服务（只有证明确有必要时）。

V1 不引入 Go Sidecar。

---

## 4.10 第十轮：AI 辅助开发与长期维护评估

AI 辅助开发最怕：

- 三套同功能代码；
- 大量 `if windows / if mac / if linux`；
- 无边界全局状态；
- 文档与代码接口不一致；
- UI 与系统 API 直接耦合；
- 同一功能多种实现。

因此 Mellow 增加以下 AI-friendly Architecture 约束：

### Interface First

功能先定义：

```text
Spec
→ Type Contract
→ Contract Test
→ Shared Implementation
→ Platform Adapter
```

### Platform Conditional 只能出现在 Adapter

禁止：

```ts
if (isWindows) ...
if (isMac) ...
if (isLinux) ...
```

散布在 Editor / Product UI。

### 小模块、稳定边界

AI/Codex 任务应能映射到：

- 一个 package；
- 一个 interface；
- 一组 fixtures；
- 一组 acceptance tests。

### 测试是 AI 修改的边界

任何 AI 自动修改：

> 必须通过 Golden Markdown、IME、File Safety、Typora Journey 测试后才允许合并。

### 文档即约束

ADR / Spec / Schema 进入仓库，并作为 AI coding context 的正式来源。

这使 Mellow 更适合长期 AI 辅助迭代，而不是依赖单次“大模型重写”。

---

# 5. 产品定位

## 一句话

> **Mellow 是一款以 Typora 级 Live Markdown 写作为核心、兼具高质量阅读和专业文件工作流的跨平台 Markdown 桌面编辑器。**

---

# 6. 目标用户

## 6.1 写作者

- 文章；
- 学习笔记；
- 博客；
- 书稿；
- 文档。

## 6.2 开发者

- README；
- ADR；
- 技术方案；
- API 文档；
- Mermaid；
- Git 管理的 Markdown。

## 6.3 中文知识工作者

- 中文输入；
- 中文长文；
- 表格；
- PDF；
- 图片；
- 文件夹工作流。

## 6.4 Markdown 阅读用户

- 双击 README；
- 审阅项目文档；
- 阅读技术说明。

---

# 7. 信息架构

Mellow 顶层只有：

```text
文档
文件夹
设置
```

不建立：

```text
Vault
Database
Workspace Database
Cloud Space
```

“Workspace”只是当前打开文件夹的运行状态，不写入用户目录。

---

# 8. 桌面 UI 总体对标

Mellow 必须复制 Typora 的一个核心 UI 思想：

> **软件 UI 退后，文档内容向前。**

默认主界面：

```text
┌───────────────────────────────────────────────────────────────┐
│ Titlebar / Tabs                               Window Controls │
├───────────────┬───────────────────────────────────────────────┤
│               │                                               │
│ Sidebar       │                                               │
│               │                                               │
│ 文件          │              Document Surface                 │
│ 大纲          │                                               │
│ 搜索          │             Live Markdown                     │
│               │                                               │
│               │                                               │
├───────────────┴───────────────────────────────────────────────┤
│ Status Bar                                                    │
└───────────────────────────────────────────────────────────────┘
```

---

# 9. 主窗口尺寸

首次启动建议：

```text
Windows/Linux：1200 × 800
macOS：1180 × 780
```

最小：

```text
900 × 600
```

窗口状态必须记忆：

- x/y；
- width；
- height；
- maximized；
- full screen；
- sidebar width；
- tab state。

---

# 10. 标题栏

## 10.1 视觉优先级

标题栏不得比正文更醒目。

高度：

```text
macOS：跟随系统 titlebar
Windows/Linux：约 40–44px
```

内容：

```text
Sidebar Toggle
Tabs
Document Title / Path Hint
Optional Mode Controls
Window Controls
```

---

# 11. Tabs

Typora 核心体验中应保持非常轻。

功能：

- 多文档；
- Drag Reorder；
- Dirty Indicator；
- Close；
- Close Others；
- Close Right；
- Reopen Closed；
- Path Tooltip；
- Duplicate tab prevention。

单 Tab：

> 可设置自动隐藏 Tab Bar。

Tab 高度建议：

```text
32–36px
```

不要做 VS Code 风格巨大工作区 tab chrome。

---

# 12. Sidebar

Typora 文件管理主要包含：

- File Tree；
- File List；
- Outline。

Mellow 增加：

- Search；

但仍使用同一 Sidebar，而不是加入复杂 Activity Bar。

顶部模式：

```text
文件 | 大纲 | 搜索
```

或使用三个轻图标。

默认宽度：

```text
260px
```

范围：

```text
200–480px
```

---

# 13. Sidebar 隐藏状态

Sidebar 关闭：

- 正文自动居中；
- Writing width 不改变；
- 不产生闪动；
- Caret 水平位置变化必须平滑；
- ESC 不错误打开 Sidebar。

---

# 14. File Tree UI

对标 Typora 1.14.6。

必须：

- Tree hierarchy；
- disclosure arrow；
- file/folder icon；
- hover；
- current file；
- context menu；
- keyboard navigation；
- hidden files toggle；
- non-Markdown toggle；
- custom glob filter。

Keyboard：

```text
↑ ↓      Move
←        Collapse / Parent
→        Expand
Enter    Open
F2       Rename（Windows/Linux）
Delete   Trash
```

macOS 使用系统等效操作。

---

# 15. File List UI

与 File Tree 切换。

列表项：

```text
Document Title
filename.md
optional modified time / summary
```

支持：

- compact；
- comfortable；
- recursive；
- current folder only。

默认：

> compact。

---

# 16. Outline UI

对标 Typora。

必须：

- H1–H6；
- hierarchy；
- current heading highlight；
- click jump；
- collapse；
- filter；
- flat/tree；
- auto-number；
- export outline。

Outline 选中行：

> 不使用过强背景色。

---

# 17. Search Sidebar

Global Search：

- input 固定顶部；
- match list；
- file grouping；
- context 1–2 lines；
- current match；
- click jump。

高级按钮：

```text
Aa
Whole Word
.*
```

不默认展开 include/exclude。

---

# 18. Editor Surface

正文区域是产品视觉中心。

建议写作宽度：

```text
680 / 820 / 980 / Auto
```

默认：

```text
820px
```

行高：

```text
1.55–1.75
```

默认正文：

```text
16px
```

代码：

```text
13–14px
```

---

# 19. Editor Padding

桌面：

```text
Top 48–72px
Bottom 35–45vh（Typewriter off 时可缩小）
Left/Right auto
```

目的：

- 文档不贴标题栏；
- Typewriter 有空间；
- 长文舒适。

---

# 20. Status Bar

Typora Windows/Linux 类似位置提供 Sidebar/状态能力。

Mellow 保持一个轻量 Status Bar。

高度：

```text
22–26px
```

默认内容：

```text
字数
行:列
Markdown
UTF-8
LF
100%
```

可以全部隐藏。

---

# 21. Floating Toolbar

Typora 1.14.6 新增重点能力。

Mellow P0。

Selection 后显示：

```text
H1 H2 H3
B I S Code
Link
Quote
List
```

要求：

- 不遮 selection；
- 不挡下一行；
- IME 时隐藏；
- Escape 关闭；
- keyboard accessible；
- 可设置完全关闭。

---

# 22. Context Menu

对标 Typora 风格编辑上下文。

内容根据上下文动态变化。

普通文本：

```text
剪切
复制
粘贴
---
段落
标题
粗体
斜体
删除线
代码
链接
---
AI（如果扩展启用）
```

Image：

```text
打开图片
显示文件
复制图片
复制路径
重命名/移动
上传
```

Table：

```text
插入行
删除行
插入列
删除列
对齐
整理表格
```

---

# 23. 系统菜单

macOS：

```text
Mellow
文件
编辑
段落/格式
视图
主题
窗口
帮助
```

Windows/Linux：

```text
文件
编辑
段落/格式
视图
主题
帮助
```

菜单命令与 Command Registry 共用。

---

# 24. Welcome Screen

Mellow Welcome 必须比 Paperling 更克制。

```text
Mellow

新建文档
打开文件
打开文件夹

最近使用
```

无：

- Hero marketing；
- 吉祥物；
- AI 推荐；
- 新闻；
- 云账号。

---

# 25. 默认模式：Live Mode

这是 Mellow 的产品生命线。

核心行为：

> Markdown 原文仍存在，但无关语法符号自动隐藏。

例如：

```markdown
**Mellow**
```

Caret 在外：

```text
Mellow
```

Caret 进入：

```markdown
**Mellow**
```

---

# 26. Live Rendering 原则

数据模型：

```text
Markdown Text
    ↓
Lezer AST
    ↓
CodeMirror Decorations / Widgets
    ↓
Live View
```

严禁：

```text
Markdown
→ HTML
→ contenteditable
→ 再转 Markdown
```

原因：

- source drift；
- Git diff；
- undo；
- formatting loss；
- table serialization；
- HTML conversion；
- cursor mapping。

---

# 27. Markdown Marker Reveal

必须支持：

- heading mark；
- emphasis mark；
- strong mark；
- strike；
- link brackets/url；
- image source；
- list marker；
- task marker；
- blockquote；
- code fence；
- math delimiter。

显示条件：

1. Caret intersects；
2. Selection intersects；
3. IME composition intersects；
4. invalid node；
5. Source Mode；
6. user forces show。

---

# 28. Caret 体验硬指标

Mellow 必须做到：

- marker show/hide 不跳 Caret；
- Enter 不随机滚屏；
- deleting marker 可预测；
- nested formatting 正确；
- mouse click 定位正确；
- double click word select 正确；
- triple click paragraph/line 依据 OS；
- drag selection 正确；
- Shift+Arrow 正确；
- Home/End 依据平台。

任何 Caret regression：

> Release Blocker。

---

# 29. IME 规则

`compositionstart` 到 `compositionend`：

禁止：

- 格式化；
- marker replacement rebuild；
- slash command commit；
- table tidy；
- whole-editor re-render；
- React text sync；
- AI edit；
- auto completion commit；
- selection rewrite。

---

# 30. Source Mode

对标 Typora Source Code Mode。

必须：

- 完整 Markdown；
- line number 可选；
- syntax highlight；
- code folding；
- current line；
- search；
- source position；
- 切回 Live 后保持 scroll/caret。

---

# 31. Reader Mode

Mellow Better 项。

参考 markdown-preview。

Reader Mode：

- 无 caret；
- 无 marker；
- no editing chrome；
- Outline；
- Search；
- Zoom；
- Image Lightbox；
- Code Copy；
- Math Copy Source；
- Mermaid；
- Print；
- Export；
- Open With。

---

# 32. Split Mode

参考 Paperling。

```text
Source | Preview
```

要求：

- scroll sync；
- click navigation；
- heading sync；
- selection anchor；
- ratio remembered；
- horizontal/vertical P1。

---

# 33. Markdown 功能完整对标矩阵

Legend：

- `E`：与 Typora 等价；
- `B`：Mellow 更优；
- `P1/P2`：版本优先级。

| 功能 | Typora 1.14.6 | Mellow | 目标 |
|---|---|---|---|
| Paragraph | ✅ | ✅ | E |
| Soft/Hard Break | ✅ | ✅ | E |
| H1–H6 | ✅ | ✅ | E |
| Setext Heading | ✅ | ✅ | E |
| Blockquote | ✅ | ✅ | E |
| Ordered List | ✅ | ✅ | E |
| Unordered List | ✅ | ✅ | E |
| Nested List | ✅ | ✅ | E |
| Task List | ✅ | ✅ | E |
| Code Fence | ✅ | ✅ | E |
| Inline Code | ✅ | ✅ | E |
| Table | ✅ | ✅ | E/B |
| Math Inline | ✅ | ✅ | E |
| Math Block | ✅ | ✅ | E |
| Footnote | ✅ | ✅ | E |
| Horizontal Rule | ✅ | ✅ | E |
| YAML Front Matter | ✅ | ✅ | E |
| TOC | ✅ | ✅ | E |
| Github Alerts | ✅ | ✅ | E |
| Links | ✅ | ✅ | E |
| Reference Links | ✅ | ✅ | E |
| Auto Link | ✅ | ✅ | E |
| Images | ✅ | ✅ | E/B |
| Bold | ✅ | ✅ | E |
| Italic | ✅ | ✅ | E |
| Strike | ✅ | ✅ | E |
| Underline HTML | ✅ | ✅ | E |
| Emoji | ✅ | ✅ | E |
| Superscript | ✅ | ✅ | E |
| Subscript | ✅ | ✅ | E |
| Highlight | ✅ | ✅ | E |
| HTML | ✅ | ✅ | E + safer |
| Video/Audio | ✅ | ✅ | E |
| Mermaid | ✅ | ✅ | E |
| Source Mode | ✅ | ✅ | E |
| Reader Mode | 部分 | ✅ | B |
| Split Mode | 非核心 | ✅ | B |

---

# 34. Paragraph / Enter

对标 Typora：

普通段落 Enter：

> 新段落。

Shift+Enter：

> soft line break。

Settings：

- strict line break；
- preserve spaces；
- smart punctuation P1。

---

# 35. Heading

输入：

```markdown
## 标题
```

光标离开：

> 标题样式。

Enter：

> 下一段自动回到 paragraph。

Shortcut：

```text
Ctrl/Cmd+1…6
Ctrl/Cmd+0 → Paragraph
```

---

# 36. Bold / Italic / Strike / Inline Code

行为必须统一：

有 Selection：

> Wrap。

无 Selection：

> Insert pair。

已经处于格式：

> Toggle。

Undo：

> 一次动作一次撤销。

---

# 37. Lists

必须：

- continuation；
- terminate empty；
- indent/outdent；
- renumber ordered；
- loose/tight list；
- multiline item；
- nested checkbox；
- paste list；
- move line/paragraph P1。

---

# 38. Task List

Live Mode checkbox 可点击。

修改：

```text
[ ] ↔ [x]
```

只 patch 必要字符。

禁止重新写整行。

---

# 39. Code Fence

支持：

- CodeMirror language registry；
- language autocomplete；
- default language；
- last-used language option；
- syntax theme；
- copy；
- fold；
- wrap；
- optional line numbers；
- Mermaid special renderer；
- math special renderer。

---

# 40. Table — Typora 核心对标

Table 是 Release Gate。

创建方式：

- source；
- menu；
- slash；
- context；
- TSV paste。

GUI：

- row add/delete；
- column add/delete；
- row/column move；
- alignment；
- resize；
- select cell；
- multi-column align；
- tidy；
- delete table。

Keyboard：

```text
Tab          Next cell
Shift+Tab    Previous
Last+Tab     New row
Ctrl/Cmd+Enter New row
```

Source：

> GUI 操作只做最小 patch。

---

# 41. Table 性能

大型 Table：

- 100 × 30 仍可编辑；
- viewport render；
- 不每次输入重建整表；
- IME 单元格完整测试。

---

# 42. Math

Typora 当前 MathJax v4 路线具有较高兼容性。

Mellow 目标：

> **以 Typora 可打开公式兼容率为验收，而不是只追求 KaTeX 更快。**

推荐：

### Compatibility Renderer

MathJax v4 compatible。

### Fast Path（可选）

KaTeX 对明确可支持语法进行优化。

必须支持：

- `$...$`;
- `$$...$$`;
- `\(...\)`；
- `\[...\]`；
- macros；
- mhchem compatibility；
- copy source；
- render error。

---

# 43. Mermaid

Typora 当前已持续升级 Mermaid。

Mellow：

- Mermaid 11.x current compatible；
- flowchart；
- sequence；
- class；
- state；
- ER；
- gantt；
- pie；
- mindmap；
- timeline；
- packet；
- kanban；
- radar；
- treemap；
- venn；
- ishikawa；
- 当前 Mermaid 后续稳定类型。

要求：

- lazy load；
- render cancel；
- error；
- source copy；
- SVG export；
- PNG P1。

---

# 44. Footnotes

体验：

- superscript；
- hover preview；
- click definition；
- return location；
- source reveal。

---

# 45. TOC

`[TOC]`：

- live；
- update；
- jump；
- level；
- export；
- custom CSS。

---

# 46. Github Style Alerts

支持：

```markdown
> [!NOTE]
> ...
```

包括：

- NOTE；
- TIP；
- IMPORTANT；
- WARNING；
- CAUTION。

设置可关闭。

---

# 47. YAML Front Matter

Live 模式：

- block style；
- syntax；
- fold；
- validation。

P1 Properties：

- GUI edit；
- minimal YAML patch；
- no reorder by default。

---

# 48. HTML

对标 Typora 安全策略：

- common inline tags；
- block tags；
- video；
- audio；
- iframe sandbox；
- no script；
- no inline events；
- no JavaScript URL。

---

# 49. Smart Paste

Typora 核心体验。

必须：

### HTML → Markdown

浏览器/Docs rich clipboard：

> 转 Markdown。

### URL on Selection

Selection + clipboard URL：

> link。

### Spreadsheet TSV

> GFM Table。

### Paste as Plain

```text
Ctrl/Cmd+Shift+V
```

---

# 50. Copy

Typora 会把多种格式同时写入 Clipboard。

Mellow 必须尽可能实现：

- plain；
- Markdown source；
- HTML；
- RTF（支持平台）。

支持：

- Copy；
- Copy as Markdown；
- Copy as Plain；
- Copy as HTML Code；
- Copy without Theme Styling。

---

# 51. Image — Typora 核心对标

输入：

- Markdown；
- URL；
- local picker；
- drag；
- multi-drag；
- clipboard bitmap；
- copied image file。

显示：

- live；
- error placeholder；
- retry；
- natural dimensions；
- context。

---

# 52. Image Path

设置：

```text
□ 尽可能使用相对路径
□ 相对路径确保 ./ 前缀
□ 对特殊路径转义
```

必须正确处理：

```text
中文 文件名.png
空格
#
@
()
Windows drive
UNC
WSL path P1
```

---

# 53. Image Insert Rule

用户选择：

```text
保留原路径
复制至 ./assets
复制至 ./images
复制至 ./${filename}.assets
自定义目录
上传
```

支持：

- global；
- per-document YAML。

---

# 54. Image Operations

对标 Typora并增强：

- Open Image；
- Reveal；
- Rename/Move；
- Copy Image；
- Copy Path；
- Move All；
- Copy All；
- Download Remote；
- Upload Selected；
- Upload All。

P1 Image Manager：

- Missing；
- Unused；
- Local；
- Remote；
- batch action。

---

# 55. Image Upload

P1。

支持 adapters：

- PicGo-Core；
- PicGo；
- PicList；
- Upgit；
- Custom；
- Extension。

上传密钥：

> OS Keychain。

---

# 56. File Management

对标 Typora：

- open file；
- open folder；
- parent folder auto-load；
- file tree；
- file list；
- switch folder；
- sort；
- move；
- undo file op；
- pin folder；
- recent；
- default launch folder；
- reopen last file。

---

# 57. File Operations

P0：

- New File；
- New Folder；
- Rename；
- Duplicate；
- Move；
- Trash；
- Reveal；
- Copy Path；
- Copy Relative Path；
- Refresh。

Delete 默认：

> 系统回收站，不直接永久删除。

---

# 58. File Operation Undo

Toast：

```text
已移动 README.md     撤销
```

可安全撤销：

- rename；
- move；
- trash；
- create。

---

# 59. File Tree Filters

对标 Typora 1.14.6：

- show hidden；
- show non-markdown；
- custom include glob；
- custom exclude glob。

---

# 60. Sorting

Tree/List：

- name；
- natural；
- modified；
- created；
- folder first；
- asc/desc。

---

# 61. Quick Open

对标 Typora。

Shortcut：

```text
macOS       Cmd+Shift+O
Windows     Ctrl+P
Linux       Ctrl+P
```

搜索：

- current folder；
- recent；
- filename；
- path；
- fuzzy；
- Chinese；
- Unicode。

---

# 62. Global Search

对标 Typora并优化性能。

支持：

- case；
- whole word；
- regex；
- include；
- exclude；
- context；
- keyboard navigation；
- current result highlight。

Rust backend：

> streaming result，不等全目录搜索完再显示。

---

# 63. Current File Find/Replace

```text
Ctrl/Cmd+F
Ctrl/Cmd+H
```

支持：

- regex；
- case；
- whole word；
- `$1` replacement；
- result count；
- previous；
- next；
- replace one；
- replace all。

---

# 64. Focus Mode

行为等价 Typora：

> 当前 line/block 正常，其他淡化。

设置：

```text
当前行
当前段落
```

---

# 65. Typewriter Mode

Caret 固定在 viewport 中部。

提供：

```text
□ 鼠标移动 Caret 后也始终居中
```

对标 Typora同类设置。

---

# 66. Theme

Typora 当前有 6 个内置主题并支持 CSS Theme 和 Light/Dark 独立选择。

Mellow P0：

内置原创主题：

1. Mellow Light；
2. Mellow Dark；
3. Paper；
4. Git Light；
5. Git Dark；
6. Newsprint。

支持：

- CSS theme；
- separate Light/Dark；
- System；
- theme folder；
- live reload P1。

---

# 67. Custom CSS

P1，但架构 V1 就必须兼容。

顺序：

```text
base.css
theme.css
base.user.css
theme.user.css
```

与 Typora 使用习惯接近，降低迁移成本。

---

# 68. Typography

Appearance：

- UI Font；
- Body Font；
- Mono Font；
- Font Size；
- Line Height；
- Paragraph Spacing；
- Writing Width；
- Heading scale。

默认字体：

> System UI，不打包庞大 CJK 字库。

---

# 69. 中文字体 fallback

```css
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
"Microsoft YaHei UI",
"Microsoft YaHei",
"PingFang SC",
"Hiragino Sans GB",
"Noto Sans CJK SC",
sans-serif
```

---

# 70. Word Count

中文优化：

- 汉字；
- CJK Characters；
- 英文 Words；
- Characters；
- Non-space；
- Paragraphs；
- Lines；
- Reading Time。

---

# 71. Export

Typora 当前内置：

- PDF；
- HTML；
- HTML without styles；
- Image；

其他通过 Pandoc。

Mellow 对标。

---

# 72. PDF Export

P0。

设置：

- A4/A5/Letter/Custom；
- margin；
- theme；
- print background；
- header；
- footer；
- page number；
- page break at H1；
- outline；
- CJK；
- image；
- math；
- Mermaid；
- table；
- footnote；
- callout。

目标：

> Windows/Linux/macOS 输出结果在排版上高度一致。

---

# 73. HTML Export

P0：

- HTML with theme；
- HTML without style；
- self-contained；
- include outline；
- custom head/body P1。

---

# 74. Image Export

P1：

- PNG；
- JPEG；
- width；
- font；
- quality；
- long-image protection。

---

# 75. Pandoc

P1 optional。

支持：

- DOCX；
- RTF；
- ODT；
- EPUB；
- LaTeX。

检测：

- PATH；
- custom path。

不把 Pandoc 强制打进 Mellow 核心。

---

# 76. Export Previous

对标 Typora：

- Export with Previous；
- Export and Overwrite Previous。

P1。

---

# 77. Print

P0。

使用系统 Print Dialog。

Print 与 PDF：

> 共享 print stylesheet。

---

# 78. Reader Mode UX

参考 markdown-preview。

Reader Toolbar 可显示：

```text
Sidebar
Zoom -
Zoom +
100%
Search
Print
Open With
```

默认仍尽量隐藏。

---

# 79. Open With

P1。

自动发现：

- VS Code；
- Cursor；
- Zed；
- Sublime Text；
- BBEdit；
- TextEdit；
- system editor。

允许 Custom Command。

---

# 80. CLI

P1。

```bash
mellow README.md
mellow .
mellow --reader README.md
mellow --source README.md
```

---

# 81. File Association

安装器允许：

> “将 Mellow 设为 Markdown 默认应用”。

不得默认强制篡改关联。

---

# 82. macOS Quick Look

P1。

参考 MarkEdit / markdown-preview。

支持：

- GFM；
- Math；
- Mermaid；
- Theme。

---

# 83. Windows Explorer Integration

P1：

- New Markdown；
- Open with Mellow；
- Send to Mellow。

Preview Handler：

> P2。

---

# 84. Linux Integration

P0：

- Desktop Entry；
- MIME association；
- Open With。

P2：

- file manager preview。

---

# 85. 多语言架构

Mellow 从第一天设计成完整多语言产品。

目录建议：

```text
packages/i18n/
├── zh-CN/
├── en-US/
├── zh-TW/
├── ja-JP/
├── ko-KR/
├── de-DE/
├── fr-FR/
└── es-ES/
```

---

# 86. 语言发布策略

## V1 必须人工验收

- **简体中文 zh-CN（默认）**
- **English en-US**

## V1 可同步发布 / P1 完善

- 繁体中文 zh-TW；
- 日本語 ja-JP；
- 한국어 ko-KR；
- Deutsch de-DE；
- Français fr-FR；
- Español es-ES。

质量规则：

> 不因增加语言数量降低核心语言翻译质量。

---

# 87. 默认语言规则

首次运行：

```text
language = zh-CN
```

无论系统语言为何：

> 默认简体中文。

用户可切：

```text
简体中文
English
繁體中文
日本語
...
跟随系统
```

---

# 88. i18n 技术要求

禁止：

- UI 字符串硬编码；
- string 拼句；
- 依赖英文词序；
- 固定宽度按钮。

支持：

- ICU Message；
- plural；
- interpolation；
- locale date/time；
- number formatting；
- keyboard names；
- RTL-ready。

RTL：

> 架构支持，正式语言可 P2。

---

# 89. 中文本地化

不仅翻译 UI。

必须优化：

- 中文菜单；
- 中文术语统一；
- 中文搜索；
- 中文 Word Count；
- 中文输入法；
- 中文文件名；
- 中文路径；
- 中文 PDF；
- 中文 Font fallback；
- 中英文混排。

术语示例：

```text
Live Mode → 即时预览
Source Mode → 源码模式
Reader Mode → 阅读模式
Outline → 大纲
File Tree → 文件树
Typewriter Mode → 打字机模式
Focus Mode → 专注模式
```

---

# 90. 中文 IME 测试

Windows：

- Microsoft Pinyin；
- Sogou Pinyin。

macOS：

- Simplified Chinese Pinyin；
- Wubi。

Linux：

- fcitx5；
- ibus。

测试节点：

- paragraph；
- heading；
- bold；
- list；
- task；
- table；
- code；
- inline code；
- link；
- image alt；
- math；
- search；
- rename；
- command palette；
- slash menu。

---

# 91. 设置页

结构：

```text
通用
编辑器
Markdown
文件
图片
外观
导出
快捷键
扩展
高级
```

AI Extension 启用后：

```text
AI
```

设置 UI：

- 左导航 180–220px；
- 右内容最大 720px；
- 可搜索 P1。

---

# 92. General Settings

- Language；
- Launch behavior；
- Recent；
- Update；
- Default app；
- Telemetry；
- Crash reporting。

---

# 93. Editor Settings

- Live/Source default；
- line wrap；
- font；
- size；
- line height；
- auto pair；
- smart paste；
- copy behavior；
- spellcheck；
- focus；
- typewriter；
- floating toolbar。

---

# 94. Markdown Settings

- GFM；
- Sup/Sub；
- Highlight；
- Emoji；
- Alerts；
- Math；
- Mermaid；
- HTML；
- TOC；
- auto link；
- line break strategy；
- code default language。

---

# 95. File Settings

- default extension；
- open parent folder；
- reopen last；
- autosave；
- file filters；
- hidden；
- non-Markdown；
- encoding；
- EOL。

---

# 96. Image Settings

- relative path；
- `./` prefix；
- insert rule；
- target folder；
- upload；
- auto upload；
- remote image strategy。

---

# 97. Appearance Settings

- system/light/dark；
- light theme；
- dark theme；
- body font；
- mono font；
- writing width；
- status；
- toolbar；
- sidebar；
- open theme folder。

---

# 98. Shortcut Settings

P1 UI。

P0：

> command registry 支持自定义。

允许：

- search command；
- record shortcut；
- conflict detection；
- reset；
- export/import keymap P2。

---

# 99. Command Palette

Better。

Shortcut：

```text
Ctrl/Cmd+Shift+P
```

搜索：

- commands；
- settings；
- toggle modes；
- themes；
- file commands。

命令来源：

```text
Command Registry
```

---

# 100. Slash Commands

Better。

行首输入：

```text
/
```

显示：

- 标题；
- 列表；
- 任务；
- 引用；
- 表格；
- 代码；
- Math；
- Mermaid；
- Alert；
- Image；
- TOC。

Slash：

- fuzzy；
- keyboard；
- localized；
- extensible；
- disable option。

---

# 101. Auto Save

支持：

```text
关闭
窗口失焦
切换文档
延迟保存
```

默认：

```text
Window Blur + Document Switch
```

---

# 102. Recovery

Mellow Better。

Recovery Snapshot 不等于 Save。

```text
Editing
↓
Recovery Snapshot
↓
User Save / Auto Save
↓
Snapshot cleared
```

启动发现：

```text
发现未保存的恢复内容

恢复
比较
忽略
```

---

# 103. External Change

无 dirty：

> Auto reload。

有 dirty：

```text
此文件已由其他程序修改

比较
重新加载磁盘版本
保留 Mellow 版本
```

禁止：

> silent overwrite。

---

# 104. Atomic Save

Rust：

```text
temp write
flush
fsync
replace
```

同时保留：

- permissions；
- original encoding；
- original EOL。

网络盘/Windows lock：

> safe fallback。

---

# 105. Encoding

V1：

- UTF-8；
- UTF-8 BOM；
- UTF-16 read。

P1：

- GB18030；
- Big5；
- Shift-JIS。

默认新文件：

> UTF-8 no BOM。

---

# 106. EOL

- LF；
- CRLF。

默认：

> Preserve Original。

---

# 107. Source Fidelity

最高级指标：

```text
Open file
No content edit
Save
```

结果必须：

> byte-identical。

例外：

用户明确执行：

- encoding convert；
- EOL convert；
- format。

---

# 108. Git-friendly Editing

以下 GUI 功能必须使用最小 patch：

- checkbox；
- table；
- YAML properties；
- image rename；
- link change。

禁止：

> 整文档重新 serialize。

---

# 109. Large File Mode

触发：

```text
>5MB
or >50,000 lines
```

自动：

- pause offscreen Mermaid；
- pause offscreen Math；
- image lazy；
- spellcheck off；
- heavy preview limit；
- animation off。

保持：

- edit；
- find；
- save；
- source；
- outline（可增量）。

---

# 110. 性能目标

不能只用绝对指标。

必须：

> 同机型与 Typora 1.14.6 对照。

绝对目标：

### Startup

```text
P95 <= 1.2s to editable on reference machine
```

### 1 MB

```text
<= 250ms to editable target
```

### 10 MB

```text
<= 1.0s–1.5s to editable target
```

### Input

普通文档：

```text
P95 update < 16ms
```

Large：

```text
P95 < 32ms
```

---

# 111. Runtime Qualification — V0.0

正式开发 UI 前必须完成。

同一 `editor-core` 分别跑：

- Windows WebView2；
- macOS WKWebView；
- Linux WebKitGTK。

测试：

1. Latin input；
2. Chinese IME；
3. Japanese IME smoke；
4. selection；
5. marker reveal；
6. bold；
7. list；
8. table；
9. math；
10. Mermaid；
11. image paste；
12. HTML clipboard；
13. TSV paste；
14. drag/drop；
15. undo；
16. external change；
17. 10 MB；
18. print；
19. PDF；
20. accessibility focus。

---

# 112. Runtime 决策 Gate

Tauri 通过条件：

- 0 IME corruption；
- 0 known caret blocker；
- 0 clipboard blocker；
- input latency within target；
- rendering parity acceptable；
- print/export feasible；
- Linux WebKitGTK can pass P0 journeys。

失败：

> Electron/Chromium。

这一步必须发生在完整 UI 开发之前。

---

# 113. 推荐技术架构：Cross-platform First + Native Enhancement

若 Tauri Gate 通过：

```text
                          Mellow
                            │
             ┌──────────────▼──────────────┐
             │ Product / UX Contracts      │
             │ Command / Settings / i18n   │
             └──────────────┬──────────────┘
                            │
       ┌────────────────────┴────────────────────┐
       │                                         │
┌──────▼────────────────────┐          ┌─────────▼─────────────────┐
│ TypeScript Editor Core    │          │ React Desktop UI          │
│ MarkEdit CoreEditor       │          │ Tabs / Sidebar / Reader   │
│ CodeMirror 6 + Lezer      │          │ Settings / Palette        │
│ Live Markdown Engine      │          └─────────┬─────────────────┘
└────────────┬──────────────┘                    │
             └────────────────────┬──────────────┘
                                  │ Typed Host API
                        ┌─────────▼───────────────┐
                        │ Rust System Core        │
                        │ File / Watch / Search   │
                        │ Recovery / Export       │
                        │ Settings / Security     │
                        │ Keychain / Update       │
                        └─────────┬───────────────┘
                                  │
                        ┌─────────▼───────────────┐
                        │ Tauri 2 Runtime         │
                        └───────┬───────┬─────────┘
                                │       │
              ┌─────────────────┘       └─────────────────┐
              ▼                                           ▼
        Native Adapter                              Native Adapter
        macOS / Swift                              Windows / Win API
              │                                           │
              └───────────── Linux Adapter ───────────────┘
```

目标：

> **90% 左右的产品逻辑与交互语义共享，平台代码只负责系统能力适配和原生增强。**

该比例是架构目标，不是为了追求数字而牺牲 UX 的硬 KPI。

---

# 113.1 五层边界

## Layer 1 — Product Contract

平台无关：

- user journey；
- commands；
- shortcuts semantics；
- settings schema；
- file semantics；
- export model；
- localization keys。

## Layer 2 — Editor / UI

平台无关：

- Markdown editing；
- Live rendering；
- tabs；
- sidebar；
- search UI；
- reader；
- settings。

## Layer 3 — System Core

Rust、平台无关：

- file domain；
- watcher abstraction；
- search；
- recovery；
- export orchestration；
- permissions；
- session。

## Layer 4 — Platform Adapter

只实现统一 interface：

- file dialog；
- clipboard；
- menu；
- window；
- trash；
- print；
- notifications；
- opener。

## Layer 5 — Native Enhancement

只为提升系统体验存在。

不得拥有：

- Markdown semantics；
- document truth；
- save model；
- command business logic。

---

# 113.2 原生增强矩阵

| 能力 | macOS | Windows | Linux |
|---|---|---|---|
| 文件关联 | Native | Native | MIME/XDG |
| 系统菜单 | Native | Native/Unified | Unified/DE-aware |
| 文件对话框 | Native | Native | Portal/Native |
| 回收站 | Native | Native | Desktop API |
| Open With | Launch Services | Shell | XDG |
| Quick Look / Preview | Quick Look P1 | Preview Handler P2 | File-manager integration P2 |
| Recent integration | Native recent P1 | JumpList P1 | Desktop recent P2 |
| Share | Share/Services P1 | Share integration P2 | Desktop integration P2 |
| Writing Tools | macOS enhancement P2 | — | — |
| Explorer/Finder integration | Finder P1 | Explorer P1 | Nautilus/Dolphin P2 |

这些增强允许不同，但：

> **核心编辑行为、文件语义和用户任务不能因平台而改变。**

---

# 113.3 Native Enhancement 进入条件

只有满足至少一个条件才允许写平台专有代码：

1. 系统提供明显更好的原生能力；
2. 通用实现无法达到用户预期；
3. 与 OS Shell 深度集成；
4. 安全模型要求；
5. 无法通过跨平台 Runtime 正确实现。

不满足：

> 使用共享实现。

---

# 113.4 平台代码隔离规则

推荐目录：

```text
packages/
  editor-core/
  app-core/
  host-api/

apps/desktop/src-tauri/
  core/
  adapters/
    macos/
    windows/
    linux/

native/
  macos/
  windows/
  linux/
```

硬规则：

> `editor-core` 不允许导入任何 OS-specific package。

> `app-core` 不允许直接调用 Swift / Win32 / DBus。

只能经：

```text
Host API
```

---

# 113.5 共享代码目标

架构目标：

```text
Editor semantics      100% shared
Document model        100% shared
Command model         100% shared
Settings schema       100% shared
i18n                   100% shared
Desktop UI            >= 90% shared
System domain core    >= 90% shared
OS integration        intentionally platform-specific
```

禁止为了提高“共享比例”而模拟明显劣于原生的系统行为。

---

# 114. 为什么 UI 采用 React

相比重新引入 Svelte：

- Paperling 已有 React 功能参考；
- 可选择性移植成熟交互；
- CodeMirror 生态成熟；
- diff/editor UI 容易复用；
- 桌面设置和复杂状态更容易组织。

注意：

> React 不拥有 keystroke 级全文状态。

---

# 115. Editor State Boundary

CodeMirror owns：

- doc；
- selection；
- history；
- composition；
- decorations。

React owns：

- tabs；
- sidebar；
- dialogs；
- settings；
- workspace；
- application mode。

---

# 116. Host Adapter

CoreEditor 不得直接依赖 Tauri：

```ts
interface DesktopHost {
  fs: FileService
  dialog: DialogService
  clipboard: ClipboardService
  window: WindowService
  watcher: WatchService
  search: SearchService
  export: ExportService
  keychain: KeychainService
  process: ProcessService
}
```

这样 Electron fallback 不需要重写 Editor。

---

# 117. Monorepo

```text
/
├── apps/
│   └── desktop/
├── packages/
│   ├── editor-core/
│   ├── editor-react/
│   ├── desktop-ui/
│   ├── document-model/
│   ├── workspace/
│   ├── commands/
│   ├── i18n/
│   ├── themes/
│   ├── extension-api/
│   └── shared/
├── extensions/
├── tests/
└── docs/
```


---

# 117.1 面向 AI/Codex 的仓库设计规范

每个 package 必须包含：

```text
README.md
CONTRACT.md
src/
tests/
fixtures/
```

关键模块必须有：

- 输入/输出类型；
- 不变量；
- 错误语义；
- 性能边界；
- 禁止行为；
- Typora parity reference；
- golden fixtures。

Codex 任务不得使用：

> “把 Windows 版也改一遍、macOS 再改一遍、Linux 再改一遍”

作为常态。

正确任务应是：

```text
实现 FileTrashService contract
→ shared behavior tests
→ macOS adapter
→ Windows adapter
→ Linux adapter
```

---

# 117.2 AI 变更半径原则

AI 修改单次优先限定：

- 1 个 domain；
- 1 个 package；
- 1–3 个 interface；
- 明确 acceptance tests。

跨越 Editor Core + Rust Core + Native Adapter 的改动：

> 必须先更新 ADR/Spec。

---

# 117.3 架构熵控制

CI 增加静态架构检查：

禁止：

- Editor import Tauri；
- Editor import OS module；
- UI 直接 fs access；
- UI 直接 process access；
- platform conditional 散落；
- native code修改 document content；
- duplicated command implementation。

目标：

> AI 辅助开发越多，架构边界越严格，而不是越松。

---

# 118. MarkEdit 迁移策略

## Keep

- CoreEditor parser；
- CodeMirror setup；
- Lezer；
- history；
- completion；
- Markdown styles；
- task；
- table；
- Math parsing；
- Mermaid；
- extensions。

## Refactor

- Safari-only assumptions；
- Host globals；
- modifier keys；
- localization；
- clipboard hooks；
- WebView integration。

## Replace

- MarkEditMac Desktop Shell；
- MarkEditKit WKWebView-specific host bridge。

## Optional macOS reuse

- Quick Look；
- Finder integration；
- Apple-specific features。

---

# 119. Extension API

P1 产品层，架构 P0。

类型：

- Editor；
- Theme；
- Command；
- Image Uploader；
- Exporter；
- Sidebar；
- Renderer；
- AI。

---

# 120. Extension Permissions

```text
document.read
document.write
workspace.read
workspace.write
network
clipboard
process
keychain
notification
```

默认最小权限。

---

# 121. Safe Mode

```bash
mellow --safe-mode
```

禁用：

- extensions；
- user CSS；
- AI；
- custom process。

仍然可：

- open；
- edit；
- save；
- export basic。

---

# 122. AI

P2。

只吸收 Paperling 的正确理念：

> Inline Diff。

流程：

```text
Selection
→ AI Proposal
→ Diff
→ Accept / Reject
```

默认：

- disabled；
- no model；
- no document upload。

---

# 123. Security

### HTML

sanitize。

### iframe

sandbox。

### Mermaid

secure mode。

### Extension

permission。

### Custom Process

explicit grant。

### File

no arbitrary access beyond user-selected scopes where platform permits。

---

# 124. Privacy

默认：

```text
Telemetry OFF
AI OFF
Cloud OFF
Document Upload NONE
```

Crash Report：

> Opt-in，且不得包含 document/path。

---

# 125. Windows 支持

正式：

- Windows 10 current supported baseline；
- Windows 11；
- x64。

P1：

- ARM64。

Package：

- MSI；
- NSIS EXE。

---

# 126. macOS 支持

正式：

- Apple Silicon；
- supported macOS baseline 在发行前按 WebView 兼容性冻结。

发行：

- signed；
- notarized；
- DMG。

Intel：

> P1 / 按用户需求和 CI 成本决定。

---

# 127. Linux 支持

官方测试：

- Ubuntu LTS；
- Debian stable；
- Fedora stable。

桌面：

- GNOME；
- KDE。

包：

- AppImage；
- deb；
- rpm。

---

# 128. Accessibility

P0 baseline：

- keyboard；
- visible focus；
- zoom；
- contrast；
- semantic label。

P1：

- VoiceOver；
- Narrator；
- Orca；
- reduced motion；
- high contrast。

---

# 129. Typora 体验黄金任务

必须全部通过。

## J01 写第一段

启动 → New → Heading → Paragraph → Save。

## J02 打开 Markdown

双击 → Live → Edit。

## J03 文件夹

Open Folder → Tree → File → Outline。

## J04 Quick Open

Shortcut → fuzzy → Enter。

## J05 Global Search

Keyword → Result → Jump。

## J06 Format

Bold → Italic → Link → List。

## J07 Table

Insert → fill → Tab → Add Row → Align → Delete Col。

## J08 Image

Paste screenshot → assets → relative path。

## J09 Web Paste

Browser rich content → Markdown。

## J10 Copy

Mellow → Word/Gmail rich；
Mellow → VS Code Markdown。

## J11 Math

Write → render → re-enter → edit。

## J12 Mermaid

Write → render → fix error。

## J13 Focus/Typewriter

5-minute continuous writing。

## J14 Export PDF

Chinese + image + table + math + Mermaid。

## J15 External Change

Modify in external editor → resolve.

## J16 Crash Recovery

Unsaved edit → kill → restart → recover。

## J17 Source Fidelity

Open → save → git diff zero。

## J18 10MB

Open → search → edit → save。

---

# 130. UX 对照实验

在同一机器、同一文档，对比：

```text
Typora 1.14.6
vs
Mellow
```

每项记录：

- steps；
- completion time；
- error；
- hesitation；
- subjective rating。

---

# 131. UX Parity Score

100 分：

| 模块 | 分数 |
|---|---:|
| Live Editing | 25 |
| Caret / IME / Undo | 15 |
| Markdown | 10 |
| Table / Image | 10 |
| Files / Search / Outline | 10 |
| Desktop UI | 10 |
| Clipboard | 5 |
| Export | 5 |
| Performance | 5 |
| File Safety | 5 |

Release：

```text
Total >= 92
Live Editing >= 24/25
Caret/IME/Undo = 15/15
File Safety = 5/5
```

---

# 132. 任务效率 Gate

30 个核心 Typora 任务：

- 至少 90% 完成时间 ≤ Typora +5%；
- 任一关键任务不得慢 >15%；
- 错误率不得高于 Typora；
- IME corruption = 0；
- data loss = 0。

Better 宣称：

> 必须通过正式用户盲测，不允许仅靠团队主观宣称。

---

# 133. P0 — V1.0 完整范围

1. MarkEdit CoreEditor cross-platform；
2. Runtime Qualification；
3. Live Mode；
4. Source Mode；
5. Reader Mode；
6. Split Mode；
7. Windows；
8. Linux；
9. macOS；
10. Full i18n architecture；
11. zh-CN default；
12. en-US；
13. Tabs；
14. File Tree；
15. File List；
16. Outline；
17. Quick Open；
18. Global Search；
19. Find/Replace；
20. Full GFM；
21. Typora extension syntax；
22. Table GUI；
23. Image workflow；
24. Batch image operations；
25. Math；
26. Mermaid；
27. Footnote；
28. TOC；
29. Github Alerts；
30. YAML；
31. Safe HTML；
32. Smart Paste；
33. Multi-format Copy；
34. Focus；
35. Typewriter；
36. Floating Toolbar；
37. Command Palette；
38. Slash Commands；
39. Theme；
40. Light/Dark；
41. PDF；
42. HTML；
43. Print；
44. Auto Save；
45. Recovery；
46. External Change；
47. Atomic Save；
48. Encoding；
49. EOL；
50. Source Fidelity；
51. Git-friendly minimal patch；
52. Recent/Pin；
53. File Filter；
54. File Operation Undo；
55. Large File Mode；
56. Chinese IME Gate；
57. Keyboard navigation；
58. File Association；
59. Security baseline；
60. Typora UX Benchmark。

---

# 134. P1

- zh-TW；
- ja-JP；
- ko-KR；
- de-DE；
- fr-FR；
- es-ES；
- Image Uploader；
- Image Manager；
- Pandoc；
- Image Export；
- Previous Export；
- Custom CSS UI；
- Properties Card；
- Shortcut UI；
- Spellcheck；
- CLI；
- Open With；
- macOS Quick Look；
- Windows JumpList；
- Extension Manager；
- Accessibility complete。

---

# 135. P2

- Wikilink；
- AI Inline Diff；
- Chemistry explicit UI；
- Windows Preview Handler；
- Linux Preview Integration；
- Extension Marketplace；
- Lightweight Git hints；
- RTL production locales。

---

# 136. 明确不做

- Knowledge Graph；
- Vault Database；
- Backlinks database；
- Cloud Sync；
- Account；
- Team Collaboration；
- Full Git GUI；
- Terminal；
- Browser；
- AI autonomous agent；
- Online publishing platform。

---

# 137. 开发阶段

## V0.0 Runtime Qualification

决定 Tauri / Electron。

## V0.1 Cross-platform Editor

Open / Edit / Save / Chinese IME。

## V0.2 Typora Editing

Live Markdown / Table / Image / Math / Mermaid。

## V0.3 Desktop Workflow

Tabs / Tree / List / Outline / Search。

## V0.4 Safety

Recovery / Watcher / Conflict / Atomic / Fidelity。

## V0.5 Output & Appearance

Theme / Reader / Split / Clipboard / Export。

## V0.9 Parity QA

Typora tasks / UI / benchmark。

## V1.0

只有全部 Gate 通过才发布。

---

# 138. Release Blockers

任何一个存在：

> 禁止 V1.0。

- IME 丢字/重复；
- Caret blocker；
- Undo corruption；
- Save corruption；
- External overwrite；
- Table data loss；
- Image path loss；
- Source Fidelity fail；
- 10 MB unusable；
- PDF CJK garble；
- platform journey fail；
- Typora UX score <92；
- Live Editing <24/25。

---

# 139. 测试体系

### Unit

- parser；
- commands；
- table；
- smart paste；
- path；
- export model。

### Editor Integration

- IME；
- caret；
- selection；
- undo；
- decoration；
- doc switch。

### Desktop E2E

- Playwright/WebDriver equivalent；
- File；
- Search；
- Settings；
- Export。

### Rust

- save；
- watcher；
- recovery；
- search；
- permission。

---

# 140. Compatibility Corpus

建立：

```text
tests/typora-compat/
```

覆盖 Typora 官方 Markdown Reference 和真实文档。

来源：

- Typora；
- GitHub；
- VitePress；
- MkDocs；
- Hugo；
- Hexo；
- Astro；
- Jekyll；
- Obsidian standard Markdown。

---

# 141. File Safety Corpus

场景：

- Git checkout；
- external editor；
- Dropbox；
- OneDrive；
- iCloud Drive；
- SMB/NFS；
- disk full；
- permission denied；
- read-only；
- rename；
- delete；
- symlink；
- antivirus lock。

---

# 142. Export Corpus

测试：

- 100 pages；
- 100 images；
- 50 tables；
- 100 formulas；
- 30 diagrams；
- emoji；
- CJK；
- footnote；
- TOC；
- callout；
- code；
- page breaks。

---

# 143. Mellow 产品指标

V1：

- Typora UX Score ≥92；
- crash-free session ≥99.9% target；
- data corruption known issue = 0；
- Chinese IME blocker = 0；
- 10 MB support；
- core feature parity = 100% of P0；
- translation completeness zh-CN/en-US = 100%。

---

# 144. License

MarkEdit：

> MIT。

markdown-preview：

> MIT。

Paperling：

> Apache-2.0。

规则：

- MarkEdit attribution 保留；
- 直接移植 Paperling 代码时保留 Apache-2.0 和 NOTICE；
- 建立 `THIRD_PARTY_NOTICES.md`；
- 不复制 Typora 闭源代码和专有资源。

---

# 145. Mellow 品牌

正式产品：

```text
Mellow
```

Mellow UI 中不使用：

```text
MarkEdit Next
Typora Clone
Open Typora
```

产品介绍可以使用：

> “Typora-like / Typora alternative”

具体营销文案在商标法务审核后确定。

---

# 146. Definition of Done

每个 P0 Feature 必须同时：

```text
Functional
+ Typora parity reviewed
+ Windows
+ Linux
+ macOS
+ zh-CN
+ en-US
+ Keyboard
+ IME
+ Undo
+ Theme
+ Source Fidelity
+ Automated Test
+ Manual Golden Journey
```

否则：

> Not Done。

---

# 147. ADR 清单

```text
ADR-0001 MarkEdit as Core Codebase
ADR-0002 Desktop Runtime Qualification
ADR-0003 React Desktop UI
ADR-0004 CodeMirror 6 + Lezer
ADR-0005 Markdown Single Source of Truth
ADR-0006 Live Markdown Engine
ADR-0007 Desktop Host Adapter
ADR-0008 Document Model
ADR-0009 File Safety / Atomic Save
ADR-0010 Math Compatibility Strategy
ADR-0011 Clipboard Strategy
ADR-0012 i18n Architecture
ADR-0013 Extension Permissions
ADR-0014 Export Pipeline
ADR-0015 Typora UX Parity Policy
```

---

# 148. 后续设计文档

PRD 定稿后按顺序生成：

1. `ADR-0001~0015.md`
2. `runtime-qualification-plan.md`
3. `live-markdown-engine-spec.md`
4. `typora-parity-checklist.md`
5. `desktop-ui-design-spec.md`
6. `table-editing-spec.md`
7. `image-workflow-spec.md`
8. `clipboard-smart-paste-spec.md`
9. `document-file-safety-spec.md`
10. `ime-test-plan.md`
11. `i18n-localization-spec.md`
12. `export-print-spec.md`
13. `performance-benchmark-spec.md`
14. `extension-api-spec.md`
15. `codex-implementation-plan.md`

---

# 149. 最终产品判断原则

后续任何需求评审先问“用户需要什么”，再问“如何跨平台实现”，最后才问“哪个操作系统需要原生增强”。

四个问题：

1. 是否直接帮助 Mellow 达到 Typora 核心使用体验？
2. 是否降低用户操作成本或提高安全性？
3. 能否由共享 Product Contract / Core 一次实现？
4. 如果必须使用平台代码，它是否只是 Native Enhancement 而非重新实现业务逻辑？

同时继续检查：

> 是否会损害 Live Editing、IME、性能或界面简洁性？

如果：

```text
不是
不是
会
```

则：

> 不进入 V1。

---

# 150. 最终定稿结论

Mellow 的产品战略不是靠比 Typora “功能更多”取胜。

正确路线是：

> **先把 Typora 最难复制的 Live Markdown 写作体验做到真正等价，再通过 MarkEdit 的正确性和性能、Paperling 的现代桌面工作流、markdown-preview 的阅读体验，把整个产品提升到更安全、更开放、更适合中文和跨平台工作的水平。**

最终代码路线：

```text
MarkEdit CoreEditor
        ↓
增强 Live Markdown Engine
        ↓
React Desktop UI
        ↓
Host Adapter
        ↓
Tauri 2（通过 Runtime Gate 后锁定）
        │
        ├── Windows
        ├── Linux
        └── macOS
```

若 Tauri 无法达到三平台体验门槛：

```text
Host Adapter
    ↓
Electron / Chromium
```

**产品体验优先于技术偏好。**

Mellow 的长期架构路线最终冻结为：

> **User Need First → Cross-platform Core → Unified UX → Native Enhancement。**

这不是为了追求“跨平台”标签，而是为了让：

- 同一个需求只实现一次；
- 同一个 Bug 只修一次；
- 同一个功能只测试一套领域语义；
- Windows/macOS/Linux 不发生产品分叉；
- AI/Codex 可以在清晰、稳定、可测试的模块边界内工作；
- 少量原生代码只负责把 Mellow 变得“更像该操作系统上的好软件”。

对于 Mellow 这类 Markdown 桌面工具，这是比“三套原生应用”更符合产品目标、团队效率和长期维护成本的架构。

但最终判定仍然是：

> **凡是跨平台抽象导致体验明显低于 Typora或系统原生预期，就允许在明确边界内使用 Native Enhancement；如果系统 WebView 本身成为 Live Editing 硬瓶颈，则切换 Chromium Runtime。**

因此：

> **跨平台优先不是跨平台教条；原生增强不是三套重复开发。**

---

# 附录 A：Typora 当前研究基线

截至 2026-08-09，Typora stable channel 为 1.14.6。

重点官方能力：

- Live Preview；
- File Tree / File List；
- Outline；
- Quick Open；
- Global Search；
- Smart Paste；
- Multi-format Clipboard；
- Table GUI；
- Images；
- Image Upload；
- Focus；
- Typewriter；
- CSS Themes；
- PDF/HTML/Image；
- Pandoc；
- Floating Editor Toolbar；
- Sidebar file filters；
- File Tree keyboard navigation；
- MathJax v4；
- Mermaid 11.x。

---

# 附录 B：研究来源

## 基础项目

- https://github.com/MarkEdit-app/MarkEdit
- https://github.com/Razee4315/Paperling
- https://github.com/pluk-inc/markdown-preview

## Typora 官方

- https://typora.io/releases/stable
- https://support.typora.io/Quick-Start/
- https://support.typora.io/Markdown-Reference/
- https://support.typora.io/File-Management/
- https://support.typora.io/Search/
- https://support.typora.io/Outline/
- https://support.typora.io/Table-Editing/
- https://support.typora.io/Images/
- https://support.typora.io/Upload-Image/
- https://support.typora.io/Copy-and-Paste/
- https://support.typora.io/Focus-and-Typewriter-Mode/
- https://support.typora.io/About-Themes/
- https://support.typora.io/Add-Custom-CSS/
- https://support.typora.io/Export/
- https://support.typora.io/What%27s-New-1.14/
- https://support.typora.io/HTML/

---

# 附录 C：最终范围冻结

从本版本起：

> **Mellow PRD V1.0 FINAL 作为产品范围基线。**

下一阶段不得继续通过“增加功能”反复扩大 PRD。

下一阶段工作重点必须转为：

```text
Runtime Qualification
→ Live Markdown Engine
→ Typora Parity Checklist
→ Desktop UI Spec
→ File Safety
→ IME
→ Implementation Plan
```

这才是确保 Mellow 真正达到 Typora，而不是停留在“功能清单对标”的关键。


---

# 附录 D：跨平台架构研究依据（2026-08）

## Tauri 官方

- Process Model  
  https://v2.tauri.app/concept/process-model/

- WebView Versions  
  https://v2.tauri.app/reference/webview-versions/

- Capabilities  
  https://v2.tauri.app/security/capabilities/

- Frontend Configuration  
  https://v2.tauri.app/start/frontend/

结论依据：

- Tauri Core 使用 Rust；
- 前端运行于系统 WebView；
- Windows 为 WebView2；
- macOS 为 WKWebView；
- Linux 为 WebKitGTK；
- 可通过 Capability / Scope 限制前端系统权限；
- 官方明确要求考虑不同系统 WebView 差异。

## Qt 官方

- Supported Platforms  
  https://doc.qt.io/qt-6/supported-platforms.html

- Qt WebEngine Overview  
  https://doc.qt.io/qt-6/qtwebengine-overview.html

结论依据：

- Qt 正式支持 Windows/macOS/Linux；
- Qt WebEngine 基于 Chromium；
- 对 Mellow 来说，使用 Qt WebEngine 会增加 C++/QML/Qt + Chromium 技术栈，而重写为 Qt 又会损失 MarkEdit CoreEditor 的复用价值。

## Flutter 官方

- Desktop Support  
  https://docs.flutter.dev/platform-integration/desktop

- Platform Integration  
  https://docs.flutter.dev/platform-integration

结论依据：

- Flutter 正式支持 Windows/macOS/Linux；
- 支持 platform-specific plugin/code；
- 更适合从统一 Dart UI 起步的产品；
- Mellow 已有 TypeScript/CodeMirror 编辑核心，因此迁移 Flutter 的收益不足以覆盖重写成本。

---

# 附录 E：架构原则定稿

Mellow 不采纳“针对某操作系统开发一套产品”的组织方式。

正式原则：

```text
用户需求
  ↓
产品语义
  ↓
共享实现
  ↓
平台适配
  ↓
必要时原生增强
```

任何新增功能，如果 PR 方案第一句是：

```text
“Windows 版这样做、macOS 版另写、Linux 版再写……”
```

必须重新评审。

正常情况应该先形成：

```text
Platform-neutral Contract
```

然后才实现 Adapter。

例外必须通过 ADR 说明。
---

# 附录 F：最终轮深度评估与修订结论

本附录是 V1.2 FINAL 相比 V1.1 的最后一次体验层收敛。  
原则：**所有技术和新增能力都必须服从“Typora 用户无需重新学习”的目标。**

---

## F.1 第十一轮评估：功能对标是否足够？

结论：

> **不够。**

“支持表格”“支持图片”“支持大纲”只是 Feature Parity。

真正的 Typora Experience Parity 必须继续回答：

- 从哪里进入功能？
- 默认是否自动工作？
- 需要几步？
- 快捷键是什么？
- 光标进入时发生什么？
- 鼠标操作是否自然？
- Undo 是一步还是多步？
- 界面是否增加干扰？
- 不同平台是否改变用户心智？

因此 Mellow 从本版本起采用：

```text
Feature
+ Entry Point
+ Default Behavior
+ Keyboard
+ Mouse
+ Caret
+ Undo
+ Visual Feedback
+ File Result
+ Platform Result
= Experience Contract
```

任何 P0 功能如果只有 Feature 而没有 Experience Contract：

> **视为未完成。**

---

## F.2 第十二轮评估：是否应该完全统一三平台 UI？

结论：

> **统一产品语义，不强制统一所有系统装饰。**

Typora 本身在 macOS 与 Windows/Linux 就存在桌面 UI 差异，例如 Sidebar 入口位置和系统菜单形态不同。

Mellow 的目标不是：

```text
三个系统像素完全一致
```

而是：

```text
同一任务
同一概念
同一命令
同一结果
+
符合本平台桌面习惯
```

因此：

### 必须统一

- Live Markdown；
- Markdown 语义；
- Command ID；
- 文件语义；
- 设置 schema；
- 搜索；
- 大纲；
- 表格；
- 图片；
- 导出参数；
- i18n；
- Extension API。

### 允许原生差异

- Titlebar；
- Menu Bar；
- Traffic Lights / Window Controls；
- File Dialog；
- Share；
- Trash；
- Open With；
- Quick Look / Explorer / XDG；
- 系统 Context Menu 风格。

---

## F.3 第十三轮评估：Mellow 的“更多模式”是否破坏 Typora 简洁性？

结论：

> **有风险，因此默认 UI 必须隐藏复杂度。**

Mellow 支持：

```text
Live
Source
Reader
Split
```

但默认只展示：

> **Live。**

Source：

- `Ctrl/Cmd + /`；
- `视图 → 源码模式`。

Reader：

- `视图 → 阅读模式`；
- Command Palette；
- 可配置打开文件默认 Reader。

Split：

- `视图 → 分屏预览`；
- Command Palette。

标题栏默认：

> **无四模式 Segmented Control。**

这是最终 UI 决策。

---

## F.4 第十四轮评估：是否需要复刻 Typora UI？

结论：

> **不复刻像素；复刻信息架构、交互优先级和低干扰原则。**

Mellow 必须让 Typora 用户产生：

> “我知道这个功能在哪儿，我知道接下来会发生什么。”

而不是：

> “这个软件看起来完全一模一样。”

---

## F.5 第十五轮评估：什么情况下可以宣称“优于 Typora”？

不能因为拥有：

- Reader Mode；
- Slash Commands；
- AI；
- Plugin；

就直接宣称整体优于 Typora。

“Better” 必须按具体任务声明，例如：

```text
Crash recovery：Better
External conflict handling：Better
Cross-platform tabs：Better
Reader Mode：Better
Command discoverability：Better
Large file protection：Better
Extension openness：Better
```

对于 Live Editing：

> 在完成正式 Benchmark 和用户测试之前，只允许使用“Parity Target”，不得提前宣传“更优”。

---

# 附录 G：Typora 1.14.6 体验主对标表

截至本 PRD 冻结日，Typora stable channel 为 **1.14.6**。

以下表格是 Mellow V1 的正式验收基线之一。

| 用户能力 | Typora 当前行为 | Mellow V1 要求 | 等级 |
|---|---|---|---|
| Live Preview | inline/block 即时排版，语法标记智能显隐 | 等价并保证 Caret/IME 稳定 | E |
| GFM | 默认核心 Markdown | 完整兼容 | E |
| Source Code Mode | `Ctrl/Cmd + /` | 保持同一默认快捷键 | E |
| Quick Open | Win/Linux `Ctrl+P`，macOS `Cmd+Shift+O` | 保持 | E |
| Global Search | `Ctrl/Cmd+Shift+F` | 保持，并流式显示结果 | E/B |
| File Tree | Folder hierarchy | 等价 | E |
| File List / Articles | 列表浏览 | 等价 | E |
| Outline | 层级、当前标题、过滤、折叠 | 等价 | E |
| Sidebar Filter | hidden/non-Markdown/custom glob | 等价 | E |
| File Tree Keyboard | 1.14 新增 | 三平台完整键盘导航 | E |
| Floating Toolbar | 1.14 可选 | 可选，默认不强干扰 | E |
| Table GUI | 菜单、右键、快捷键、拖动等 | 等价并 minimal diff | E/B |
| Image Drag | 单张/多张 | 等价 | E |
| Clipboard Image | 保存到目标后插入引用 | 等价 | E |
| Relative Image Path | 可配置 | 等价 | E |
| Copy/Move All Images | 支持 | 等价 | E |
| Image Upload | PicGo/PicGo-Core/PicList/Upgit/custom 等 | Adapter 体系 | E/B |
| Smart Paste | HTML 优先转 Markdown | 等价 | E |
| Multi-format Copy | HTML/RTF/Plain 同时写 Clipboard | 等价 | E |
| Copy as Markdown | `Ctrl/Cmd+Shift+C` | 保持 | E |
| Paste Plain | `Ctrl/Cmd+Shift+V` | 保持 | E |
| Focus Mode | 当前 line/block，其他淡化 | 保持 F8 | E |
| Typewriter | Caret 固定 | 保持 F9 | E |
| Theme | 6 内置 + CSS | 至少 6 原创 + CSS | E |
| Light/Dark Theme | 可分别设置 | 等价 | E |
| Custom CSS | base/theme user CSS | 提供兼容加载思想 | E |
| PDF | 内建 | 内建、CJK 三平台一致性更强 | E/B |
| HTML | styled / no-style | 等价 | E |
| Image Export | 内建 | P1 | E roadmap |
| Pandoc | 其他格式 | P1 optional | E roadmap |
| Previous Export | 复用上次导出设置 | P1 | E roadmap |
| Math | MathJax v4 路线 | Typora 公式兼容率优先 | E |
| Mermaid | Mermaid 11.x 持续升级 | 同代兼容 | E |
| Recent/Pin | 支持 | 等价 | E |
| File Operation Undo | 支持 | 等价并扩大安全覆盖 | E/B |
| External Changes | 会检测/更新 | dirty 时强制安全冲突流程 | B |
| Reader Mode | 非核心独立阅读模式 | 专门 Reader Surface | B |
| Split Mode | 非默认核心体验 | Source + Preview | B |
| Tabs | macOS 支持更完整、Win/Linux不完全一致 | 三平台统一 Tabs | B |
| Recovery | 有恢复能力 | 可比较恢复快照 | B |
| Extension API | 非主要开放方向 | 权限化 Extension API | B |

---

# 附录 H：Typora 快捷键兼容合同

Mellow 默认快捷键优先保持 Typora 用户肌肉记忆。

## H.1 文件

| 命令 | Windows/Linux | macOS |
|---|---|---|
| New | `Ctrl+N` | `Cmd+N` |
| New Window | `Ctrl+Shift+N` | `Cmd+Shift+N` |
| New Tab | `Ctrl+T`（Mellow Better） | `Cmd+T` |
| Open | `Ctrl+O` | `Cmd+O` |
| Quick Open | `Ctrl+P` | `Cmd+Shift+O` |
| Reopen Closed | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Save | `Ctrl+S` | `Cmd+S` |
| Save As | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Settings | `Ctrl+,` | `Cmd+,` |
| Close Tab/Document | `Ctrl+W` | `Cmd+W` |

---

## H.2 编辑

| 命令 | Windows/Linux | macOS |
|---|---|---|
| Cut | `Ctrl+X` | `Cmd+X` |
| Copy | `Ctrl+C` | `Cmd+C` |
| Paste | `Ctrl+V` | `Cmd+V` |
| Copy as Markdown | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Paste Plain | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| Find | `Ctrl+F` | `Cmd+F` |
| Replace | `Ctrl+H` | `Cmd+H` |
| Global Search | `Ctrl+Shift+F` | `Cmd+Shift+F` |

---

## H.3 段落

| 命令 | Windows/Linux | macOS |
|---|---|---|
| H1–H6 | `Ctrl+1…6` | `Cmd+1…6` |
| Paragraph | `Ctrl+0` | `Cmd+0` |
| Table | `Ctrl+T` | `Cmd+Option+T` |
| Code Fence | `Ctrl+Shift+K` | `Cmd+Option+C` |
| Math Block | `Ctrl+Shift+M` | `Cmd+Option+B` |
| Quote | `Ctrl+Shift+Q` | `Cmd+Option+Q` |
| Indent | `Ctrl+[` / `Tab` | `Cmd+[` / `Tab` |
| Outdent | `Ctrl+]` / `Shift+Tab` | `Cmd+]` / `Shift+Tab` |

**注意：**

Windows/Linux 的 `Ctrl+T` 同时常被用户理解为 New Tab。  
Mellow 因新增三平台 Tabs，必须在 V0.9 UX Test 中验证冲突方案。

建议最终策略：

- Windows/Linux 默认 `Ctrl+T` 保持 Typora Table，以保护 Typora 肌肉记忆；
- New Tab 使用 `Ctrl+Alt+T` 或 Command Palette；
- 允许用户在 Shortcut Settings 中重新绑定；
- macOS 保持 `Cmd+T = New Tab`、`Cmd+Option+T = Table`。

不得未经用户测试擅自覆盖 Typora Table 快捷键。

---

## H.4 格式

| 命令 | Windows/Linux | macOS |
|---|---|---|
| Bold | `Ctrl+B` | `Cmd+B` |
| Italic | `Ctrl+I` | `Cmd+I` |
| Underline | `Ctrl+U` | `Cmd+U` |
| Inline Code | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| Link | `Ctrl+K` | `Cmd+K` |
| Image | `Ctrl+Shift+I` | `Cmd+Ctrl+I` |
| Clear Format | `Ctrl+\` | `Cmd+\` |

---

## H.5 视图

| 命令 | Windows/Linux | macOS |
|---|---|---|
| Toggle Sidebar | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| Source Mode | `Ctrl+/` | `Cmd+/` |
| Focus Mode | `F8` | `F8` |
| Typewriter Mode | `F9` | `F9` |
| Full Screen | `F11` | `Cmd+Option+F` |
| Switch Documents | `Ctrl+Tab` | `Cmd+\`` |

Mellow 新增：

| 命令 | 默认 |
|---|---|
| Command Palette | `Ctrl/Cmd+Shift+P` |
| Reader Mode | 默认无强制快捷键，可用户配置 |
| Split Mode | 默认无强制快捷键，可用户配置 |

理由：

> 新功能不得抢占 Typora 高频快捷键。

---

# 附录 I：桌面 UI 体验合同

---

## I.1 Desktop Shell

默认状态只包含：

```text
Titlebar / Tabs
Sidebar（可隐藏）
Document Surface
Status Bar（可隐藏）
```

默认不包含：

- Mode switcher；
- AI panel；
- Activity Bar；
- Inspector；
- Formatting ribbon；
- Right sidebar；
- permanent toolbar。

---

## I.2 macOS

目标：

> 接近原生 macOS 文档型应用，同时保留 Typora 的内容优先感。

要求：

- Traffic Lights 原生；
- 系统 Menu Bar；
- Sidebar toggle 可放 titlebar；
- Window title 不抢内容；
- Native Fullscreen；
- `Cmd+,` Settings；
- `Cmd+W` Close；
- Services / Share 作为原生增强；
- Quick Look 是 Mellow P1 Better 项。

特别说明：

> Typora 当前并不内置自己的 Quick Look 插件；Mellow 若提供 Quick Look，是“超过 Typora”的原生增强，而不是 parity requirement。

---

## I.3 Windows

要求：

- Native/Snap-compatible window controls；
- Menu/toolbar 视觉低干扰；
- Sidebar toggle 可位于 status/title area；
- File Association；
- Explorer Open With；
- Trash；
- JumpList P1；
- Windows 11 视觉适配，但不强制 Fluent 重设计整个 Editor。

---

## I.4 Linux

要求：

- GNOME/KDE 可用；
- XDG/MIME；
- native/portal file dialog；
- fcitx5/ibus；
- system fonts；
- GNOME/KDE window behavior；
- 不为了和 Windows/macOS 像素一致而破坏桌面环境惯例。

---

## I.5 Editor Surface

正文才是视觉中心。

默认建议：

```text
Writing Width: 820px
Body Font: 16px
Line Height: 1.65
Top Padding: 56px
Bottom Breathing Space: >= 30vh
```

主题可以修改这些值。

---

## I.6 颜色与边界

默认主题：

- 不使用高饱和品牌色大面积占据编辑器；
- Sidebar 与 Editor 仅通过轻背景/边界分区；
- Active File / Current Heading 使用低对比选中；
- Focus Ring 必须清晰；
- Selection 颜色要满足中文正文可读性；
- Dark Mode 不使用纯黑大面积背景作为唯一方案。

---

# 附录 J：菜单结构合同

Mellow 顶层菜单建议与 Typora 心智保持接近：

```text
文件 File
编辑 Edit
段落 Paragraph
格式 Format
视图 View
主题 Themes
窗口 Window（macOS / 可选平台）
帮助 Help
```

Mellow 新增能力不得无限新增顶层菜单。

---

## J.1 文件

至少：

- 新建；
- 新窗口；
- 打开；
- 快速打开；
- 打开文件夹；
- 最近；
- 固定文件夹；
- 保存；
- 另存为；
- 导出；
- 打印；
- 文件信息；
- 关闭。

---

## J.2 编辑

至少：

- Undo；
- Redo；
- Cut；
- Copy；
- Copy as Markdown；
- Copy as Plain；
- Copy without Theme；
- Paste；
- Paste Plain；
- Find；
- Replace；
- Global Search。

---

## J.3 段落

至少：

- Paragraph；
- Heading 1–6；
- Increase/Decrease Heading；
- Table；
- Code Fence；
- Math Block；
- Quote；
- Ordered List；
- Unordered List；
- Task List；
- Indent；
- Outdent。

---

## J.4 格式

至少：

- Bold；
- Italic；
- Underline；
- Strike；
- Inline Code；
- Link；
- Image；
- Clear Format。

---

## J.5 视图

至少：

- Toggle Sidebar；
- File Tree；
- File List；
- Outline；
- Source Mode；
- Reader Mode；
- Split Mode；
- Focus；
- Typewriter；
- Toolbar；
- Status Bar；
- Fullscreen；
- Zoom。

---

# 附录 K：设置迁移心智

Typora 用户打开 Mellow Settings 时，核心配置不得“找不到”。

建议一级设置：

```text
通用 General
编辑器 Editor
Markdown
图片 Image
外观 Appearance
导出 Export
快捷键 Shortcuts
扩展 Extensions
高级 Advanced
```

其中前六项和 Typora 用户心智直接对应。

---

## K.1 编辑器

- Live/Source behavior；
- Smart Paste；
- Clipboard；
- line wrap；
- indentation；
- auto pair；
- spell；
- floating toolbar；
- Focus；
- Typewriter。

---

## K.2 Markdown

- GFM；
- Math；
- Mermaid；
- Sup/Sub；
- Highlight；
- Emoji；
- Alerts；
- HTML；
- Line Break。

设置修改应尽量：

> **无需重启应用。**

如果必须重载 Editor：

> 明确显示“重新加载编辑器”按钮，不强制退出 Mellow。

---

## K.3 图片

- relative path；
- `./` prefix；
- escape；
- root URL；
- insert target；
- uploader；
- auto-upload；
- per-document YAML。

---

## K.4 外观

- System/Light/Dark；
- light theme；
- dark theme；
- font；
- writing width；
- status；
- toolbar；
- Open Theme Folder。

---

## K.5 导出

- General；
- PDF；
- HTML；
- HTML no style；
- Image；
- Pandoc/custom exporters P1。

---

# 附录 L：Live Markdown 元素级验收

每类节点都必须分别测试：

```text
idle
caret-before
caret-inside
caret-after
selection-partial
selection-full
IME
undo
redo
copy
paste
mouse-click
keyboard-enter
delete-boundary
```

节点：

- Heading；
- Bold；
- Italic；
- Strike；
- Inline Code；
- Link；
- Image；
- List；
- Task；
- Quote；
- Code Fence；
- Table；
- Inline Math；
- Block Math；
- Mermaid；
- Footnote；
- TOC；
- YAML；
- Alert；
- HTML。

任何节点在 rendered / source transition 中导致：

- Caret 跳跃；
- Selection 丢失；
- IME corruption；
- Undo semantic break；

均为 P0 Blocker。

---

# 附录 M：表格体验验收

不能只检查“能编辑”。

必须完成：

1. Markdown source 创建；
2. Menu 创建；
3. Slash 创建；
4. TSV Paste；
5. Tab 跨 cell；
6. Shift+Tab；
7. Last Cell + Tab；
8. Add Row；
9. Delete Row；
10. Add Col；
11. Delete Col；
12. Alignment；
13. Drag/Move（若 V1 实现）；
14. Undo；
15. Redo；
16. Chinese IME；
17. Copy cells；
18. Paste cells；
19. Large table；
20. Source Mode round-trip；
21. Git Diff minimal；
22. External file update。

---

# 附录 N：图片体验验收

必须完成：

1. type Markdown image；
2. paste bitmap；
3. paste copied file；
4. drag single；
5. drag multiple；
6. local picker；
7. clipboard URL；
8. relative path；
9. Chinese filename；
10. space filename；
11. move target；
12. copy target；
13. missing image；
14. remote image；
15. Move All；
16. Copy All；
17. image root；
18. save-as document；
19. rename document + asset folder；
20. undo/redo when source changes；
21. external image move；
22. Windows path；
23. macOS path；
24. Linux path。

---

# 附录 O：复制粘贴体验验收

必须以真实应用测试，不只测试 Clipboard API。

目标应用至少：

- VS Code；
- Cursor；
- Notepad/TextEdit 等纯文本应用；
- Microsoft Word；
- Gmail/Web rich editor；
- Apple Notes（macOS）；
- LibreOffice（Linux）。

场景：

- Copy normal；
- Copy Markdown；
- Copy Plain；
- Copy without Theme；
- Paste normal HTML；
- Paste plain；
- URL selection paste；
- Spreadsheet TSV paste；
- image paste。

---

# 附录 P：Mellow 明确超过 Typora 的 V1 能力

Mellow 的差异化必须克制，只保留真正增加价值的项目。

## P.1 三平台统一 Tabs

Typora 的 Tab 能力当前存在平台差异。

Mellow：

> Windows / macOS / Linux 全部统一支持多文档 Tabs。

但不得破坏 Windows/Linux 的 Typora Table 快捷键习惯。

---

## P.2 Reader Mode

专门的只读渲染 Surface。

这是 Mellow 明确 Better 项。

---

## P.3 Split Mode

为开发者和兼容调试提供：

```text
Source | Preview
```

但不成为默认工作方式。

---

## P.4 Recovery Compare

崩溃恢复不是简单“恢复/丢弃”，还可以：

> 比较 Recovery Snapshot 与磁盘内容。

---

## P.5 External Conflict Compare

外部变化与本地 Dirty：

> 可以直接比较，而不是只弹确认。

---

## P.6 Cross-platform Native Enhancement

- macOS Quick Look；
- Windows Explorer integration；
- Linux MIME/XDG；

按平台增强，但不分裂产品。

---

## P.7 Extension API

Mellow 提供权限化 Extension API。

核心功能不依赖第三方插件才能达到 Typora parity。

---

# 附录 Q：最终 Release Gate — Typora 用户迁移测试

正式 V1 前至少招募具有 Typora 使用经验的目标用户做迁移测试。

禁止首先向用户解释 Mellow。

给用户同一组文件，让其独立完成：

1. 打开 Markdown；
2. 修改标题；
3. 粗体；
4. 插图；
5. 建表；
6. 全局搜索；
7. 打开大纲；
8. Focus；
9. Typewriter；
10. PDF；
11. Source Mode；
12. Theme；
13. Copy to Word；
14. Copy Markdown to VS Code；
15. 打开文件夹。

核心观察：

> 用户是否会自然使用原 Typora 习惯完成任务。

Release 目标：

- 绝大多数核心任务无需提示；
- 无关键“功能找不到”；
- 无明显额外步骤；
- 无输入/Undo/保存异常；
- UI 复杂度主观评价不得明显高于 Typora。

---

# 附录 R：最终冻结原则

从 V1.2 FINAL 起，Mellow V1 的产品功能范围冻结。

后续可以：

- 细化 UI；
- 细化 interaction spec；
- 优化性能；
- 增加测试；
- 修正实现选择；
- 完善 accessibility；
- 补充 parity fixtures。

后续不允许以“更现代”为理由把以下功能重新塞入 V1：

- Knowledge Graph；
- Cloud Workspace；
- Agent Workflow；
- Database；
- Team Collaboration；
- Full Git；
- Browser；
- Terminal；
- Permanent AI Chat Panel。

最终目标始终是：

> **Mellow 首先是一款比肩 Typora 的 Markdown 编辑器，然后才是一款现代平台。**

---

# 附录 S：最终研究校验（2026-08-09）

本次最终冻结重新核验了 Typora 官方资料：

- Stable Release：1.14.6；
- Quick Start / Live Preview；
- Shortcut Keys；
- File Management；
- Outline；
- Table Editing；
- Images；
- Upload Images；
- Copy and Paste；
- Focus / Typewriter；
- About Themes；
- Custom CSS；
- Export；
- Code Fences；
- Typora 1.14；
- macOS integration。

最终判断：

> **Mellow 的 V1 产品范围已经足够覆盖 Typora 的核心使用面。接下来产品成败不再取决于添加更多 Feature，而取决于 Live Markdown、Caret/IME/Undo、桌面 UI 细节、Table/Image、Clipboard、File Safety 和三平台一致性是否真正达到上述 Experience Contract。**
