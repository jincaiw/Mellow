# Mellow P0 范围验收总览（PRD §133，2026-08-18）

> 依据：ADR-0020（pre-release 状态）、ADR-0021（三平台构建矩阵 PASS）、优化方案阶段 0-5。

> **⚠️ 2026-10-05 更正**：上行的「ADR-0020（**pre-release 状态**）」**已过期** ——
> 发布状态自 **ADR-0031**（Accepted，用户裁决）起转为**正式发布**（ADR-0020 §1 对后续版本的适用已终止；
> **§2 的 V1.0 门槛仍有效**）。本文其余内容为 2026-08-18 的**历史快照**，如实保留。
> 结论：**P0 60 项中 58 项代码侧完成；2 项（中文 IME Gate、Typora UX Benchmark）需真机执行。**
> 判定口径：功能 + 行为 + 快捷键 + i18n + 测试（PRD §146）；真机项以「构建级 ✅ / 真机 ⏳」标注。
> **历史状态修订（2026-08-24）**：本报告中 Split Mode 的已完成记录仅表示当时实现历史，已不属于 V1 范围；当前验收基线为 Typora 1.14.9（build 7785）。

> **⚠️ 2026-10-06 更正（审计 §4.90）—— 头条结论已不能按「当前」读**：
> 本报告的结论句「**P0 60 项中 58 项代码侧完成；2 项需真机执行**」是 **2026-08-18 的条目集与口径**，
> 与**当前门禁**不一致：
>
> | 项 | 本报告（2026-08-18） | 当前真值源 |
> |---|---|---|
> | 条目集 | **60 项** | **50 项**（`tests/parity/typora-parity-ledger.json`，门禁自报「50 P0 items」） |
> | 未闭环 | 2 项（待真机） | **9 项**（含 4 项「标 AUTO 但 `requiredEvidence` 含 `ux-gate`」，ADR-0024 A3 不得以 AUTO 收口） |
> | 达 `PASS-E` | — | **0/50** |
>
> ⇒ **「58/60 完成」不得当作当前就绪度引用**；当前就绪度以 `verify-release-gate.mjs` 的输出为准。
>
> **逐条更正**（其余行如实保留为当时快照）：
> - **#13 Tabs「✅」** —— **Tabs 已被 SDI 否决**（D-D / D-Y；`desktop-ui-design-spec` §4 整节作废），
>   **不属于 V1 范围** ⇒ 该行按**当时**读（护栏 `verify-shell-widgets.mjs` 确认
>   `Tabbar` / `tab-overview` / `autoHideTabBar` **已全量移除**）。
> - **#3「editor-engine 491 测试」** —— 实测现为 **1293**（`packages/editor-engine` jest：79 suites）。
> - **#39「6 内置原创主题」** —— **「6」是 PRD 的要求数**，实际 **8** 个
>   （`mellow-light` / `mellow-dark` / `paper` / `git-light` / `git-dark` / `newsprint` / `whitey` / `gothic`）
>   ⇒ 这是**超额**，**不是失真**（勿「修正」回 6）。
> - **「参考」里的 `docs/plans/typora-deep-parity-plan.md` 不存在**（**幽灵引用**）——
>   ⚠️ 更精确地说：它**不是「从未存在」**，而是**已被取代并删除、且未归档**
>   （`AGENTS.md` 记录「2026-08-22 起由 `typora-parity-master-plan.md` 取代旧
>   checklist / audit / review / deep-parity-plan 四文档」；PRD §148 曾把 `typora-parity-checklist.md`
>   列入「PRD 定稿后按顺序生成」的文档清单）⇒ 该名在仓库与 `docs/plans/archive/` 里都**已不存在**。
>   ⇒ 当前施工文件是 **`docs/plans/typora-parity-master-plan.md`**（V7.0），历史方案在 `docs/plans/archive/`。
>
> **保留**：本文其余内容（逐项状态表）为 2026-08-18 的**历史快照**，如实保留。

| # | P0 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | MarkEdit CoreEditor cross-platform | ✅ | CoreEditor vendored 原样（git diff 空）+ wrapper 519 行契约，neutral 测试 16 |
| 2 | Runtime Qualification | ✅/⏳ | 三平台构建矩阵 PASS（ADR-0021）；真机 IME/Caret/Clipboard 待机器 |
| 3 | Live Mode | ✅ | editor-engine 491 测试（marker reveal 状态机/增量 decoration） |
| 4 | Source Mode | ✅ | Cmd/Ctrl+/ 命令+菜单+引擎 API（installSourceApi） |
| 5 | Reader Mode | ✅ | Reader.tsx：搜索/缩放/打印/Lightbox/代码复制/链接安全 |
| 7-9 | Windows/Linux/macOS | ✅/⏳ | 三平台打包全绿（MSI/NSIS/DMG/AppImage/deb/rpm）；真机行为待验 |
| 10 | Full i18n architecture | ✅ | i18n 包 + completeness 测试 15 + 原生菜单 locale 重建 |
| 11 | zh-CN default | ✅ | 默认 zh-CN（PRD §87）；zh 词条残留英文已清 |
| 12 | en-US | ✅ | en-US 完整（含原生菜单标签目录） |
| 13 | Tabs | ✅ | TabManager + Tabbar 组件 + 会话恢复 + 单 Tab 自动隐藏 |
| 14 | File Tree | ✅ | FileTree 组件 + 键盘导航 + 拖拽移动 + 右键菜单 |
| 15 | File List | ✅ | FileList 组件（tree/list 切换） |
| 16 | Outline | ✅ | OutlineList 组件 + 当前标题高亮 + 过滤/折叠/编号 |
| 17 | Quick Open | ✅ | Ctrl+P/Cmd+Shift+O fuzzy（中文拼音首字母） |
| 18 | Global Search | ✅ | Rust 流式搜索 + 分组/上下文/包含排除 glob |
| 19 | Find/Replace | ✅ | Cmd+F/Ctrl+H（engine search API + 菜单接线） |
| 20 | Full GFM | ✅ | 引擎节点全覆盖（heading/emphasis/lists/tables/代码围栏…） |
| 21 | Typora extension syntax | ✅ | 高亮/上标/下标/脚注/TOC/Alerts/YAML/Wikilink |
| 22 | Table GUI | ✅ | 工具栏/快捷键/列宽拖拽/Tab 导航/minimal patch |
| 23 | Image workflow | ✅ | 粘贴/拖拽/相对路径/中文文件名/asset 策略 |
| 24 | Batch image operations | ✅ | moveAll/copyAll/downloadRemote + 撤销 toast |
| 25 | Math | ✅ | $/$$/\\(…\\) 渲染 + copy source（Typora 公式兼容优先） |
| 26 | Mermaid | ✅ | 本地离线渲染 + 错误态 + copy |
| 27 | Footnote | ✅ | 渲染 + 点击跳转/返回/hover |
| 28 | TOC | ✅ | [TOC] 实时 + 跳转 |
| 29 | Github Alerts | ✅ | [!NOTE/TIP/…] 渲染（可开关） |
| 30 | YAML | ✅ | 灰色源码可折叠（Typora 对齐） |
| 31 | Safe HTML | ✅ | 白名单 sanitize + iframe sandbox + CSP |
| 32 | Smart Paste | ✅ | HTML→MD / TSV→表 / URL-on-selection |
| 33 | Multi-format Copy | ✅ | plain/HTML/RTF 同时写入 |
| 34 | Focus | ✅ | F8 行/段两级 |
| 35 | Typewriter | ✅ | F9 caret 居中 |
| 36 | Floating Toolbar | ✅ | selection 浮出 + IME 隐藏 + 可关 |
| 37 | Command Palette | ✅ | Ctrl/Cmd+Shift+P + 最近 + 禁用态 |
| 38 | Slash Commands | ✅ | 行首 / fuzzy + 双语 + 可关 |
| 39 | Theme | ✅ | 6 内置原创主题 |
| 40 | Light/Dark | ✅ | 系统跟随 + 分离设置 |
| 41 | PDF | ✅ | 打印样式共享 + Noto CJK 子集嵌入 + 三平台一致目标 |
| 42 | HTML | ✅ | with-theme 单文件 + sanitize |
| 43 | Print | ✅ | Cmd/Ctrl+P 系统对话框 |
| 44 | Auto Save | ✅ | Window Blur + Document Switch（可关） |
| 45 | Recovery | ✅ | 防抖快照 + 恢复/比较/忽略 |
| 46 | External Change | ✅ | 干净自动重载 + dirty 冲突三选项 |
| 47 | Atomic Save | ✅ | temp+flush+fsync+replace（file-safety 16 测试） |
| 48 | Encoding | ✅ | UTF-8/BOM/UTF-16（保真 141 文件 0 diff） |
| 49 | EOL | ✅ | LF/CRLF preserve original |
| 50 | Source Fidelity | ✅ | 141 文件 0 diff 复跑 PASS |
| 51 | Git-friendly minimal patch | ✅ | checkbox/表格/列宽/重命名最小 patch |
| 52 | Recent/Pin | ✅ | 欢迎屏最近 + 缺失标记 + 固定文件夹 |
| 53 | File Filter | ✅ | hidden/non-markdown/glob/排序（折叠收纳） |
| 54 | File Operation Undo | ✅ | toast 撤销（rename/move/trash/create） |
| 55 | Large File Mode | ✅ | >5MB/>50k 行自动降级（渲染/拼写/动画） |
| 56 | Chinese IME Gate | ✅/⏳ | macOS 简体拼音 8/8；Win（微软拼音/搜狗）与 Linux（fcitx5/ibus）待真机 |
| 57 | Keyboard navigation | ✅ | 命令注册表 + 快捷键 + 文件树键盘导航 |
| 58 | File Association | ✅ | tauri.conf.json .md/.markdown（安装器注册） |
| 59 | Security baseline | ✅ | CSP/H1/H2 拦截/远程图默认关/sanitize/最小权限 |
| 60 | Typora UX Benchmark | ⏳ | 门禁模板就绪（ux-score-gate-template.md）；需三平台真机执行 |

## 待真机项（2 项）
1. 中文 IME Gate（#56）：Windows 微软拼音/搜狗 + Linux fcitx5/ibus → 执行 phase1-runtime-qualification-manual.md；
2. Typora UX Benchmark（#60）：UX Score ≥92 + 30 任务 Gate → 执行 ux-score-gate-template.md。

## 参考
- docs/qualification/phase1-runtime-qualification-manual.md、ux-score-gate-template.md
- docs/adr/ADR-0020、ADR-0021
- **当前施工文件**：`docs/plans/typora-parity-master-plan.md`（V7.0）；历史方案在 `docs/plans/archive/`
  （原写 `typora-deep-parity-plan.md` —— 该文件**不存在**，见上方 2026-10-06 更正）
