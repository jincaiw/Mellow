# Typora 对标第五轮（V5）桌面 UI / 渲染全面对标方案

状态：**已确认，实施中（2026-09-05 用户裁决：D1=P1 完全 Typora 化；D2=P1 常驻卡片；D3=P1 一次对齐真值；D4=P1 随 D1 采 Typora 式侧栏开关；D5=P1 一次批连续至发版 v1.4.8）**
触发：用户 2026-09-05 提供 3 组 Mellow v1.4.7 vs Typora 1.14.9 截图，判定当前版本桌面 UI、布局、渲染与 Typora 差距明显，要求「完全对标桌面 UI、桌面布局，再据此补足功能、编辑体验、侧边栏、菜单、使用体验」。
基线：Mellow v1.4.7（commit 4a59c75）；Typora 1.14.9（build 7785，macOS）。

---

## §0 摘要

从截图证据 + 代码审计得出五类差距：

1. **渲染解析缺陷（P0）**：引用块内的 fenced code 与表格出现源码标记泄露（```` ```js ````、`| :---: |` 管道符原文可见），Typora 正常渲染。
2. **块级样式缺口**：引用块无左竖线+浅灰背景；代码块无背景/圆角/内边距；front matter 无容器卡片（Typora 为常驻表格化卡片）。
3. **排版体系差距**：默认字号 17px（Typora 16px）；标题字号阶梯过平（diffs [5,3,1]）；标题无 Typora 的字号对比度与 h1/h2 底部分隔线观感；标题着色策略（accent vs 正文黑）待对齐。
4. **侧栏过度设计**：三 tab + 路径 chips 栏 + 根路径条 + Tree/List 分段控件 + hover 工具按钮排；Typora 是极简单面板：树形缩进、行首图标、浅灰圆角选中条。
5. **默认配置缺陷**：`App.tsx:3749` features 默认值 bug —— localStorage 无键时 `null === '1'` 恒 false，导致 yaml 等语法特性默认关闭（与「默认开启」的设计意图相反）。

实施顺序：Phase 0 真值复核（门禁）→ C 组 P0 缺陷 → B 组渲染排版 → A 组侧栏 UI → D 组菜单/体验 → E 组验收发版 v1.4.8。

---

## §1 截图证据清单（差异 → 现状映射）

| # | 截图证据（Mellow 现状） | Typora 表现 | 现状代码 |
|---|---|---|---|
| 1 | 引用内代码块显示 ```` ```js ```` 与 `> const …` 原文 | 渲染为带高亮代码块 | 装饰层对 BlockQuote 内节点覆盖缺口（§2-C） |
| 2 | 引用内表格显示 `\| :---: \|` 管道原文 | 渲染为真表格 | 同上 |
| 3 | 引用块仅斜体，无竖线无背景 | 左竖线 + 整体浅灰背景 | CoreEditor 无 quote 样式（builder.ts:125 仅 italic） |
| 4 | front matter 彩色着色原文、无容器 | 带边框圆角的表格化卡片常驻 | engine 卡片扩展存在但 `f.yaml` 默认 false（App.tsx:3746-3749） |
| 5 | 标题阶梯弱（H4-H6 与正文难区分）、整体偏小 | 标题大而粗、层级分明 | fontSize 默认 17、diffs [5,3,1]（settings/index.ts:75、heading.ts:9-12） |
| 6 | 无 h1/h2 底部分隔线观感 | h1/h2 下方细线 | CoreEditor 无 heading border-bottom |
| 7 | 代码块无背景无圆角 | 浅灰背景圆角块 | nodes/code.ts:37-48 仅 monospace |
| 8 | 侧栏：路径 chips + 根路径条 + Tree/List 切换 + hover 按钮排，平铺列表 | 单面板树形、行图标、浅灰选中条 | SidebarHeader.tsx:21-32、App.tsx:4612-4671、styles.css:107-466 |
| 9 | 侧栏背景 #fbfbfb 偏白 | 更深的灰（约 #f6f6f6） | styles.css:112-113、themes/index.ts:59 |

注：菜单栏（Mellow/Typora 文件 编辑 段落 格式 显示 主题 窗口 帮助）截图层面已一致；目录 [toc]、标题锚点 ⧉ 两侧均已有。此两项 Phase 0 仅做合同 diff 复核。

---

## §2 代码审计结论

### A. 侧栏（apps/desktop/src/App.tsx、packages/desktop-ui/src/）
- 容器 `App.tsx:4579`；头部 `SidebarHeader.tsx:21-25`（三 tab files/outline/search）；工具按钮 ⌑/↻/⋯ hover 显隐（styles.css:171-178）；路径 chips `App.tsx:4635-4666` + 只读根路径条 `:4669-4671`；Tree/List 分段切换 `:4612-4615`。
- FileTree 已有树形+折叠（FileTree.tsx:25-64），但默认 list 平铺；行图标为纯 CSS clip-path（styles.css:449-466）；选中高亮 `--mellow-selection #e9eefb` + 加粗（styles.css:436-442）。
- 侧栏宽 260px 可拖 200-480（styles.css:107-110）；背景 `--mellow-bg-subtle #fbfbfb`。
- 守卫：`verify-sidebar-contract.mjs` 锁虚拟化/导航/拖拽行为，改样式安全；改四个滚动容器挂载结构会挂护栏（:155）。

### B. 渲染排版（packages/editor-core/CoreEditor/src/styling/）
- 字号：`config.ts:85-111` setFontSize，标题 diffs [5,3,1]（`nodes/heading.ts:9-12`）；默认 fontSize **17**（`packages/settings/src/index.ts:75`）、lineHeight 1.65（:111）、writingWidth 820px（:104）。
- 标题：仅字号 + accent 色（config.ts:238），无 border-bottom、无 margin/padding。
- 引用：无竖线/背景/padding，仅斜体（builder.ts:125）+ quoteMark 着色。
- 代码块：`nodes/code.ts:37-48` 仅 monospace wrapper + line deco；无背景/圆角。行内 code 有浅背景（builder.ts:220-222）。
- 表格：源码态 monospace（nodes/table.ts:9-12）；预览走 PreviewWidget（:17-31，需手动点按钮）。
- front matter：CoreEditor 只着色（styling/nodes/frontMatter.ts:10-13）；engine 卡片扩展已具备（editor-engine/yamlFrontMatter.ts:143-196，默认灰源码+折叠按钮，卡片展开态隐藏源码）。

### C. 引用内嵌套块泄露（根因方向）
- 装饰层 `matchers/lezer.ts` 全树 iterate、按节点名匹配，不排除 BlockQuote 上下文；parser 已配 GFM（vendor lang-markdown markdown.ts:82-86）。
- 泄露嫌疑集中在：①隐藏标记 deco（quote mark / fence mark 的显隐逻辑）对 quote 内子节点未覆盖；②quote 内 Table/FencedCode 的 blockWrapper/lineDeco/preview 条件分支。**Phase 0 以最小复现文档定位后修复**。

### D. features 默认值 bug（P0 附带）
- `App.tsx:3746-3749`：`features[k] = localStorage.getItem(...) === '1'`，无键时 false；catch 分支才是 true。修复为「无键默认 true」。

---

## §3 Phase 0 真值复核（门禁，产出《V5 真值表》）

在 Typora 参考机实测以下 computed style，回填后才能定稿 B 组参数：

1. 正文：字号/行高/段间距/内容最大宽度。
2. 标题 h1-h6：字号（em）、粗细、上下 margin、h1/h2 border-bottom（颜色/粗细）、颜色（黑 or 主题色）。
3. 引用块：竖线宽/颜色、背景色、padding、圆角。
4. 代码块：背景色、圆角、padding、边框；行内 code 背景。
5. 表格：表头背景、边框颜色、单元格 padding。
6. front matter 卡片：边框/背景/圆角/内边距、键值排版。
7. 侧栏：背景色、宽度、行高、选中条颜色/圆角、图标风格、模式切换交互（「文件」标签点击行为）。
8. 最小复现：引用内 fence/table/列表/标题嵌套文档在 Mellow 中逐节点 dump syntaxTree + decorations，定位泄露根因。

## §4 WBS

### C 组 P0：渲染解析缺陷修复（先行）
- C1 引用内 fenced code：标记隐藏/代码渲染修复。
- C2 引用内表格：解析确认 + 渲染/预览行为对齐。
- C3 引用内嵌套列表/标题/引用回归（markdown-syntax 全景文档 §五）。
- C4 features 默认值修复（App.tsx:3749）+ 存量用户 localStorage 迁移。

### B 组：渲染排版对标（依赖 Phase 0 真值）
- B1 默认排版参数：fontSize 17→16、行高、段距、内容宽度按真值。
- B2 标题系统：字号阶梯、粗细、margin、h1/h2 border-bottom、标题颜色。
- B3 引用块样式：竖线 + 背景 + padding（明暗主题各一套 token）。
- B4 代码块样式：背景/圆角/padding；行内 code 微调。
- B5 表格样式：表头背景/边框/padding（预览态渲染路径）。
- B6 front matter：默认开启 yaml → 默认卡片态（Typora 常驻式），光标进入回源码（依赖 D2 决策）。

### A 组：侧栏 Typora 化（依赖 Phase 0 真值 + D1 决策）
- A1 结构收敛：移除路径 chips 栏 + 根路径条 + Tree/List 分段控件；工具按钮（⌑/↻/⋯）收进右键菜单/标题栏。
- A2 默认树形：默认模式 tree，缩进+折叠+行首图标对齐 Typora。
- A3 选中/背景：浅灰圆角选中条、侧栏灰底（主题 token 化，明暗各一套）。
- A4 模式入口：「文件」标签 + 切换交互对齐 Typora（大纲/搜索保留，入口收敛）。
- A5 侧栏开关位置（依赖 D4 决策：标题栏 ☰ vs Typora 底部图标）。

### D 组：菜单与体验收尾
- D1 菜单合同 diff 复核（对照 Typora 菜单逐项，verify-menu-contract 更新）。
- D2 右键菜单、状态栏与 Typora 差异复核（快速 diff，发现小项顺手修）。
- D3 键位对照复核。

### E 组：验收与发版
- E1 视觉 golden 扩样本（引用/代码块/表格/front matter/侧栏）+ 6 配置重刷。
- E2 parity 守卫更新（sidebar-contract、shell-typography、menu-contract）。
- E3 markdown-syntax 全景测试文档逐节截图对比验收。
- E4 全量回归（parity 12 项 + smoke + tsc + jest + cargo）→ v1.4.8 按 ADR-0020 发版。

## §5 风险

- 侧栏结构调整可能触发 verify-sidebar-contract 挂载断言 → 优先样式层收敛，滚动容器结构不动。
- 默认字号变化影响既有 visual golden → 全量重刷并记录 ±1px 容差。
- 引用内装饰修复触及 CoreEditor 装饰层 → 回归 IME composition 用例与 B2 轮 readonly 用例。
- 存量用户 localStorage 无 features 键 → C4 迁移逻辑保证不重复弹设置。

## §6 待评审决策清单

| # | 决策 | 选项 |
|---|---|---|
| D1 | 侧栏收敛程度 | P1=完全 Typora 化（移除路径栏/切换/按钮排，仅树形）；P2=保留功能仅默认收敛（默认树形+隐藏工具） |
| D2 | front matter 默认态 | P1=常驻卡片（Typora 式，光标进入回源码）；P2=维持灰源码+折叠按钮 |
| D3 | 默认排版对齐 | P1=一次对齐 Typora 真值（16px/标题黑/h1h2 分隔线等）；P2=保守微调 |
| D4 | 侧栏开关位置 | P1=Typora 式侧栏底部图标；P2=保留标题栏 ☰ |
| D5 | 执行节奏 | P1=一次批连续实施至发版 v1.4.8；P2=分批确认 |

## §7 验收标准

1. 三组截图场景（front matter 顶部区、标题排版区、引用块区）与 Typora 并排对比无明显差异。
2. markdown-syntax 全景测试文档全节渲染无源码泄露。
3. 全部门禁绿（含更新后的 parity 守卫与视觉 golden）。
4. 按 ADR-0020 发版 v1.4.8。
