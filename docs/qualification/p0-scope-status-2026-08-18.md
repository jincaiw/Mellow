# Mellow P0 范围验收总览（PRD §133，2026-08-18）

> 依据：ADR-0020（pre-release 状态）、ADR-0021（三平台构建矩阵 PASS）、优化方案阶段 0-5。
> 结论：**P0 60 项中 58 项代码侧完成；2 项（中文 IME Gate、Typora UX Benchmark）需真机执行。**
> 判定口径：功能 + 行为 + 快捷键 + i18n + 测试（PRD §146）；真机项以「构建级 ✅ / 真机 ⏳」标注。
> **历史状态修订（2026-08-24）**：本报告中 Split Mode 的已完成记录仅表示当时实现历史，已不属于 V1 范围；当前验收基线为 Typora 1.14.9（build 7785）。

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
- docs/plans/typora-deep-parity-plan.md（阶段 0-4 进度记录）
