# Markdown 全语法样例：Typora ↔ Mellow 编辑与显示深度对标方案

> 状态：本轮实现与本地自动化 Gate 已完成；产品级全量 parity Gate 仍按 Master Plan 管理
> 制定日期：2026-08-23
> 输入样例：`/Volumes/My-Data/jason.wa/Downloads/markdown-syntax-demo.md`
> 样例 SHA-256：`23d01902be09eb4abe7902c2d2a4d234396022922423a9bac033e0d0c4bf35db`
> Mellow 基线：`74c454b` / Desktop `1.3.4`
> 本专项实测与判定基线：Typora `1.14.9` build `7785`
> 产品文档兼容说明：仓库 PRD 与本专项的产品级规范验收基线均为 Typora `1.14.9`（build 7785）；Typora `1.14.6` 仅保留历史参考，不影响本专项的结论。

## 1. 目标

使用同一份 Markdown 原文，在 Typora 与 Mellow 中执行相同的查看、导航、编辑、IME、撤销、复制和保存操作，形成可复现的差距报告，并据此优化：

1. 静态排版与完整文档显示；
2. Live Markdown 的 marker 显隐与节点切换；
3. Caret、Selection、IME、Undo / Redo；
4. Table、Image、Math、Mermaid、HTML、Footnote 等复杂节点；
5. Outline、滚动、查找、链接跳转与 Sidebar；
6. Source Fidelity、保存结果和渲染性能；
7. 默认桌面界面的复杂度与正文优先程度。

最终目的不是像素复制 Typora 主题，而是证明：

- 相同 Markdown 语义得到相同或更正确的结果；
- 相同写作任务步骤不更多、输入手感不更差；
- 品牌视觉差异不影响层级、可读性和用户心智；
- Mellow 的 IME、文件安全和扩展能力确实更优。

## 2. 测试边界与不变量

实施时必须遵守：

- 保留 MarkEdit CoreEditor，不重写编辑器；
- Markdown 纯文本是唯一真源；
- 不把样例转换成私有 Rich Text 模型；
- 不为追求截图相似而复制 Typora 专有 CSS；
- Editor Core 不直接依赖 Tauri；
- 所有文本改动都必须验证 Undo / Redo 和 Source Fidelity；
- 先证明差距，再修改最小相关模块；不得进行无关重构。

## 3. 样例预检与夹具治理

### 3.1 原样本已知条件

样例共 299 行，覆盖：

- YAML Front Matter；
- H1–H6 展示源码；
- 段落、硬换行、`<br>`；
- Strong、Emphasis、Strong+Emphasis、Strike、Inline Code；
- HTML `u` / `mark`；
- 多级 Quote；
- JavaScript、Python、SQL 与无语言 Code Fence；
- 无序、有序、混合嵌套列表；
- HTML Definition List；
- 三类水平分隔线；
- 行内、标题、相对、自动、邮箱与引用式 Link；
- Remote Image、Image Link、HTML Image；
- 基础与对齐 Table；
- Task List；
- Footnote；
- Superscript / Subscript；
- HTML style block 与 `details`；
- Inline / Block Math、Matrix；
- Mermaid；
- Emoji shortcode。

### 3.2 不能误判为产品缺陷的夹具问题

1. 目录包含 `[代码](#代码)`，但正文标题实际是 `## data`；该跳转失败属于夹具自身错误。
2. 图片引用 `markdown-here.com` 与 `via.placeholder.com`；网络、证书、DNS 或防盗链失败不能直接归因于编辑器。
3. Emoji shortcode、Superscript、Subscript、HTML style 的支持范围可能属于扩展语法差异，必须先按 PRD / Spec 分类，不能把 Typora 行为自动视作 CommonMark 正确性。
4. 文档中的 H1–H6 是 fenced code 内容，不是六个真实标题节点；标题编辑矩阵需在工作副本末尾临时增加测试区，但不得改写原样本基线。

### 3.3 确认后建立三份夹具

| 夹具 | 用途 | 规则 |
|---|---|---|
| `original.md` | 真实性、Source Fidelity | 与下载文件逐字节一致 |
| `local-assets.md` | 图片与离线显示对比 | 只把远程图片替换为固定本地 PNG / SVG |
| `interaction.md` | 节点状态与破坏性编辑 | 从 original 复制，追加独立交互测试区 |

保存到：

```text
tests/fixtures/typora-parity/markdown-syntax-demo/
```

每份夹具记录 SHA-256；原文件保持只读，不在 Downloads 原地测试保存。

## 4. 公平对照环境

### 4.1 两层对比

**A. 默认体验对比**

- Typora 使用首次安装默认主题 / 默认布局；
- Mellow 使用首次安装默认主题 / 默认布局；
- 用于判断开箱复杂度、正文优先、默认字体与可读性。

**B. 控制变量对比**

- 相同窗口尺寸：1180 × 780、900 × 600、1440 × 900；
- 相同缩放：100% 与 200%；
- 同为 Light，再各测 Dark；
- 正文字号统一 16 px，写作宽度统一 820 px；
- 系统字体和等宽字体保持同一平台默认；
- Sidebar / Status Bar 均关闭，再分别打开对比。

默认体验和控制变量结果必须分开，不允许用定制参数掩盖默认体验差距。

### 4.2 启动状态

- 关闭会话恢复、更新提示和非必要弹窗；
- 两侧均复制到独立临时文件后打开；
- 窗口置于同一显示器、相同位置；
- 测试时关闭网络通知和系统动画干扰；
- 记录 macOS、CPU、内存、显示分辨率、Typora 版本、Mellow commit 和工作区状态。

## 5. 静态显示对比矩阵

按以下锚点分别截图，禁止只截首屏：

| ID | 锚点 | 检查内容 |
|---|---|---|
| V-01 | YAML + H1 + Intro | Front Matter 收起/显示、H1 层级、正文宽度 |
| V-02 | 目录 + 分隔线 | Link 样式、列表间距、HR 厚度与留白 |
| V-03 | 段落与换行 | 硬换行、`br`、中文行高、段间距 |
| V-04 | 文本样式表格 | Inline 样式、代码基线、表格对齐 |
| V-05 | Quote | 嵌套层级、边线、缩进、颜色对比 |
| V-06 | Code Fence | 语言标签、语法高亮、横向滚动、复制入口 |
| V-07 | Lists | marker、缩进、嵌套连续性、CJK 对齐 |
| V-08 | Links | URL 显隐、自动链接、引用式链接、hover |
| V-09 | Images | loading / success / failure、标题、居中 HTML |
| V-10 | Tables | 边框、列宽、对齐、Inline Markdown |
| V-11 | Tasks + Footnotes | Checkbox、完成态、脚注引用与回跳 |
| V-12 | HTML | allowlist、样式隔离、details 交互 |
| V-13 | Math | 行内基线、块级居中、矩阵裁切与错误态 |
| V-14 | Mermaid | SVG 清晰度、背景、错误态、滚动 |
| V-15 | Emoji + Ending | shortcode 策略、尾部留白、文档结束体验 |

每个锚点评分：

```text
结构语义 0–2
层级与可读性 0–2
字体/行高/留白 0–2
节点渲染完整性 0–2
布局稳定性 0–2
```

满分 10；低于 8 必须进入差距台账。主题色和品牌风格不同本身不扣分。

## 6. Live Editing 节点状态矩阵

对下列节点逐项执行：

```text
idle
caret-before
caret-inside
caret-on-marker
caret-after
selection-partial
selection-full
mouse-entry
keyboard-entry
invalid-partial-source
undo
redo
source-live-switch
```

节点范围：

1. Front Matter；
2. Heading；
3. Strong / Emphasis / Nested Emphasis；
4. Strike；
5. Inline Code；
6. Link / Reference Link / Auto Link；
7. Image / Linked Image / HTML Image；
8. Quote / Nested Quote；
9. Ordered / Unordered / Mixed List；
10. Task Checkbox；
11. Code Fence；
12. Table；
13. Footnote；
14. HTML Block / Details；
15. Inline Math；
16. Block Math / Matrix；
17. Mermaid；
18. Horizontal Rule；
19. Emoji；
20. Hard Break。

逐项记录：marker 是否按预期显隐、Caret 是否跳动、Selection 是否改变、Scroll anchor 是否漂移、节点宽高是否抖动、源码是否被非用户动作修改。

## 7. 编辑任务矩阵

两侧均从同一 `interaction.md` 副本开始，每项结束后恢复副本。

| ID | 操作 | 通过标准 |
|---|---|---|
| E-01 | 在 H1 后输入中文段落 | 无延迟、无 marker 抖动 |
| E-02 | 粗体内增删中文 | marker 正确 reveal，Caret 不跳 |
| E-03 | 嵌套强调跨边界选择 | Selection 不丢失，格式命令可撤销 |
| E-04 | Quote Enter / Backspace | 延续和退出语义与 Typora 等价 |
| E-05 | 无序、有序、嵌套列表 Enter / Tab / Shift+Tab | 缩进、退出、Undo 等价 |
| E-06 | Task Checkbox 鼠标勾选 | 只 patch `[ ]` / `[x]`，一次 Undo |
| E-07 | Table Tab 遍历、末格加行 | 焦点顺序正确、一次操作可撤销 |
| E-08 | Table 行列增删与对齐 | 未触及单元格无 diff |
| E-09 | Link 文本与 URL 分别编辑 | URL 按 Caret reveal，跳转不误触 |
| E-10 | Image alt/path 编辑 | 预览失败可恢复，不静默改路径 |
| E-11 | Code Fence 输入反引号与中文 | 不触发错误格式化 |
| E-12 | Math 源码输入与错误修复 | 渲染异步，不阻塞输入 |
| E-13 | Mermaid 修改节点后快速继续输入 | debounce，不丢键、不闪回旧图 |
| E-14 | Footnote 插入、跳转与回跳 | 锚点正确、源码保真 |
| E-15 | HTML details 展开后继续编辑 | 展开状态不吞键，源码不改写 |
| E-16 | Cmd+F 查找“Markdown”并逐项跳转 | 高亮、下一处、Esc 与 Typora 等价 |
| E-17 | Outline 点击“表格”后键盘继续输入 | Caret 和焦点正确转移 |
| E-18 | Source → Live → Source 往返 | 文本 byte-equivalent |
| E-19 | 全选复制到纯文本与富文本目标 | Markdown / HTML MIME 符合目标 |
| E-20 | 保存、关闭、重开 | 文本、滚动位置和恢复行为可预测 |

每项记录步骤数、完成时间、错误数、犹豫点、Undo 次数、Caret 跳变、Source diff。

## 8. 中文 IME 专项

在以下节点输入同一句：

```text
今天使用 Mellow 编写 Markdown，表格和公式都很稳定。
```

节点：Paragraph、Heading、Strong、Link text、Image alt、List、Task、Quote、Table cell、Code Fence、Inline Math、Mermaid source、YAML、Find、Sidebar Search。

每个节点执行：

1. 连续拼音组词；
2. 候选翻页和数字选词；
3. Composition 中 Backspace；
4. Composition 中左右方向键；
5. 中英文混输和全角标点；
6. 提交后 Undo / Redo；
7. 未提交时点击节点外取消或提交。

硬门槛：丢字、重字、提前提交、Caret 跳动、Undo corruption 均为 0。

## 9. Source Fidelity 与保存验证

对 `original.md` 执行只浏览、滚动、Outline、查找、主题切换、Source / Live 切换后保存：

```text
before SHA-256
→ 操作
→ save
→ after SHA-256
→ byte diff
```

无编辑场景必须 0 diff。

有编辑任务必须：

- 只出现预期 changed range；
- EOL、UTF-8、Front Matter、HTML、空白与尾部换行不被全局标准化；
- Undo 后恢复原始 SHA-256；
- Redo 后恢复编辑后 SHA-256。

## 10. 性能与稳定性

该样例不是大文件性能夹具，但适合测复杂节点混合成本：

| 指标 | 方法 | 门槛 |
|---|---|---|
| Open-to-editable | 冷启动打开，N=5 | Mellow ≤ Typora + 10%，且无明显空白等待 |
| Typing P95 | 普通段落、Table、Math、Mermaid 各 100 键 | 普通 <16ms；复杂节点同步路径 <16ms |
| Scroll | 全文往返 3 次 | 无持续掉帧和布局跳变 |
| Node render | Math / Mermaid 离开 Caret 到稳定首帧 | 不阻塞下一次输入 |
| Search | 查找“Markdown” | Mellow ≤ Typora + 10% |
| Save | 修改一字后 Cmd+S，N=5 | 无 UI 卡顿、无额外 diff |
| Memory | 打开稳定 30 秒 | 记录两侧 RSS 与相对比值 |

性能测量沿用 `tests/benchmark` 的同一外部测量路径；不能用 Mellow 内部插桩与 Typora 外部测量混比。

## 11. Desktop UI 与 Sidebar 对比

### 11.1 默认状态

- 文档是否第一视觉；
- Sidebar / Status Bar 是否默认隐藏；
- 单文档 Tab Bar 是否自动隐藏；
- 正文宽度、顶部留白、底部 breathing room；
- 窗口缩小时正文是否被 chrome 过度挤压。

### 11.2 Sidebar 打开状态

- Files / Outline / Search 入口可发现性；
- 当前 Heading 跟随和点击跳转；
- File Tree 行高、缩进、选中态、图标密度；
- 打开文件夹、刷新、过滤是否低干扰；
- 200–480 px 拖拽与持久化；
- Keyboard navigation 与焦点返回 Editor；
- Sidebar 开关前后正文 Caret、Scroll 和 Writing Width 是否稳定。

### 11.3 视觉尺寸

- Tab 32–36 px；
- File Tree row 26–30 px；
- Sidebar 默认 260 px；
- Body 16 px / line-height 1.65；
- Writing width 820 px；
- Top padding 56 px；
- Bottom breathing ≥30vh；
- Status Bar 22–26 px，默认隐藏。

## 12. 差距分类与优先级

| 类别 | 示例 | Owner |
|---|---|---|
| RENDER | Math、Table、HTML、Emoji 显示不同 | `editor-engine` / `themes` |
| EDIT | marker、Caret、Selection、Undo 不同 | `editor-engine` |
| IME | Composition、候选、提交异常 | `editor-engine` / `editor-react` |
| SHELL | 窗口、Tabs、正文宽度、Status Bar | `desktop-ui` / `apps/desktop` |
| SIDEBAR | Outline、Tree、Search、密度 | `desktop-ui` / `workspace` |
| FILE | 保存、外部变更、Source diff | `app-core` / Rust System Core |
| PERF | 打开、输入、滚动、渲染 | 对应最小责任包 |
| FIXTURE | 错误锚点、失效远程资源 | 只记录，不改产品 |

优先级：

- S0：数据损坏、IME corruption、Caret / Undo blocker；
- S1：核心语法错误、节点不可编辑、视觉严重错位、菜单/快捷键不可达；
- S2：间距、层级、hover、动画、Sidebar 密度等体验差距；
- S3：品牌视觉和非阻塞细节。

## 13. 证据目录与报告

确认后创建：

```text
tests/benchmark/parity/markdown-syntax-demo/
├── fixtures/
├── typora/
│   ├── default/
│   ├── controlled/
│   └── interaction/
├── mellow/
│   ├── default/
│   ├── controlled/
│   └── interaction/
├── diffs/
├── timings/
└── manifest.json

docs/qualification/
└── markdown-syntax-demo-parity-2026-08-23.md
```

每个截图记录应用、版本、主题、窗口、缩放、Sidebar 状态、锚点、操作状态与 SHA-256。报告逐项列出 Typora 行为、Mellow 行为、差距等级、根因、修改文件、测试和复验结果。

## 14. 确认后的实施顺序

### Phase A：冻结夹具与捕获基线

1. 复制并校验三份夹具；
2. 构建 Mellow release；
3. 重置两侧可控状态；
4. 捕获默认与控制变量截图；
5. 执行 V-01–V-15、E-01–E-20 和 IME 矩阵；
6. 输出首版差距台账，不修改代码。

### Phase B：根因分类

1. 排除 FIXTURE / 网络 / 主题品牌差异；
2. 用 AST、Decoration、DOM、computed style、AX 和文件 diff 定位；
3. 将每个问题绑定 Spec、Owner Package 和回归测试；
4. S0 / S1 必须先于 S2 / S3。

### Phase C：实现优化

按以下顺序逐批修改：

```text
Source Safety / IME / Caret / Undo
→ 节点语义与 Live Editing
→ Table / Image / Math / Mermaid / HTML
→ Typography / Spacing / Theme tokens
→ Desktop Shell / Sidebar
→ 性能与可访问性
```

每批只修改当前差距涉及模块；编辑器改动必须新增节点测试、IME 测试、Undo 测试与 Source Fidelity 断言。

### Phase D：双应用复验

1. 重跑受影响锚点和任务；
2. 重跑全量 V / E / IME；
3. 执行 `pnpm test`、Desktop build、Rust tests、E2E smoke；
4. 对所有有编辑的工作副本执行 byte diff；
5. 更新 parity ledger，但不得在证据不足时写 PASS-E。

### Phase E：完成 Gate

- S0 = 0；
- S1 = 0；
- IME corruption = 0；
- 无编辑 Source Fidelity = 0 diff；
- 所有预期编辑均为 minimal diff；
- V-01–V-15 单项 ≥8/10，核心节点 ≥9/10；
- E-01–E-20 全部通过；
- 常用任务步骤不多于 Typora；
- 性能不超过本方案阈值；
- macOS 实机报告、截图和原始数据齐全；
- Windows / Linux 相关自动化继续由 GitHub Actions Gate 覆盖。

## 15. 本轮确认点

本方案建议直接采用以下默认决策：

1. 原下载文件不修改，只在仓库生成校验过的副本；
2. 同时测默认体验与控制变量体验；
3. 本专项的截图、操作、性能和差距判定全部以本机 Typora 1.14.9 build 7785 为基线；
4. 先完整采集差距，再修改代码；
5. 优先修 S0 / S1，视觉细节最后统一收敛；
6. 不把夹具错误、远程资源失败或品牌主题差异算作产品缺陷。

确认后从 Phase A 开始，不在确认前实施产品代码修改。

## 16. 最终实施结果（2026-08-23）

已完成：

1. 冻结 `original.md`、`local-assets.md`、`interaction.md` 与本地图片资产；
2. 在 Typora 1.14.9 build 7785 和 Mellow 1.3.4 中打开同一原文并采集基线；
3. 修正 Mellow Desktop 首次启动的编辑器默认值：系统字体、隐藏行号、隐藏不可见字符、增强标题层级；
4. 修正 Source / Live 模式切换后必须移动 Caret 才刷新的问题；
5. 新增 GFM Table Live View：离开表格时显示语义网格，安全渲染 Strong、Emphasis、Inline Code、Strike 与 escaped pipe；
6. 支持表格单元格原位编辑，直接对 Markdown cell 执行 minimal patch，并覆盖 Tab / Shift+Tab、末格加行、Enter 回源码、Escape 退出、Paste、中文 Composition 与 Cmd/Ctrl+Z；
7. 修正 Outline bridge 多 EditorView 生命周期竞争；普通文档采用同步 CodeMirror measure 校准远距虚拟滚动，大文件模式保留原生路径；
8. 以最高优先级 PageUp / PageDown keymap 改用 CodeMirror caret-page 命令，避免 MarkEdit 直接 `scrollBy` 导致 WKWebView 未绘制空白区；
9. 在 macOS release 应用中复验 Outline 点击“表格”后正文稳定显示，连续 Down 后 Tab 可聚焦首个正文 cell；
10. 新增 Source Mode、Outline、Paging、Table Live View、Composition 与 Undo 回归；editor-engine 共 `60 suites / 642 tests` 通过；
11. 完成仓库级 TypeScript / Jest、Rust、151 文件 Source Fidelity corpus 和未签名 macOS release `.app` 构建；
12. 原下载文件、冻结夹具、Mellow 工作副本和 Typora 工作副本最终 SHA-256 完全一致。

边界说明：

1. 本轮已关闭该 299 行样例暴露出的 Outline、PageDown、Source Mode 与 Table Live View 实现缺陷；这不等同于把 Master Plan 中全产品、全语法、全平台项目全部标记为 `PASS-E`；
2. Computer Use 能可靠验证表格可见性和焦点，但其 `type_text` 会绕过 WebKit 嵌套 `contenteditable`，因此未把该注入结果当作真实表格输入或真实中文输入法证据；中文组合输入与一次性提交由单元测试覆盖；
3. Windows / Linux 的 build、test、runtime qualification 与 release workflow 已有 GitHub Actions 覆盖；当前工作区尚未提交或推送，不能伪称远端本次 commit 已运行；
4. N=5 外部性能 runner 会关闭当前 Typora 并清理 Mellow 用户状态，本轮未在用户已有应用会话上执行破坏性基准；产品级性能结论继续由专用、隔离环境的 Performance Gate 给出。

详细证据与判定见 `docs/qualification/markdown-syntax-demo-parity-2026-08-23.md`。本专项的代码与本地验证任务已收口，但“Typora 全产品完全一致或更优”仍只能在 Master Plan 全部 `PASS-E / PASS-BETTER` 后声明。
