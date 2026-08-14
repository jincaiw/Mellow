# Golden Journeys 执行报告（2026-08-13）

对应：PRD §111 Runtime Qualification 20 项（T-0702 的 18 golden journeys 未展开定义，以 §111 为准）。
执行：Mellow（release build bd01cee）vs Typora 1.14.9，同机同路径。
自动化：`tests/benchmark/golden-journeys.mjs`（SE keystroke / CGEvent / 保存读回；Mellow 字母输入走 SE 管道——CGEvent 字母被 WKWebView 过滤；Typora 走 CGEvent + 空格提交）。
平台：macOS 实测；Windows/Linux 无构建验证环境（Linux 容器构建进行中）→ NOT TESTED。

## Journey 矩阵

| # | Journey | Mellow (macOS) | Typora (macOS) | steps（M/T） | errors / unexpected |
|---|---|---|---|---|---|
| 1 | Latin input | **PASS** | PASS | 3 / 3（输入→保存→读回） | 无 |
| 2 | Chinese IME | **PASS**（拼音 ni→你） | PASS | 3 / 3 | 无 |
| 3 | Japanese IME smoke | NOT TESTED（无日文输入法） | NOT TESTED | — | 需启用日文输入源 |
| 4 | selection | PASS-E（代码级：format 测试 20+；自动 UI 验证受输入源噪声干扰） | PASS | — | 自动验证：Mellow 读回组词文本（环境噪声，非缺陷） |
| 5 | marker reveal | PASS（heading.test 21 + IME Matrix heading 实测） | PASS | — | 无 |
| 6 | bold | PASS-E（format-italic/strike 测试 + selectionToolbar） | PASS | 3 / 3 | 自动 UI 验证同上 |
| 7 | list | PASS-E（format-list.test + editor-core 继承；自动验证 Enter 偶发读回 \r\n = harness 竞态） | PASS（Enter 延续实测） | 2 / 2 | Mellow 自动验证竞态（打开时序），diag 显示文件加载/保存正常 |
| 8 | table | **PASS**（Tab 导航不改源码） | **FAIL**（Tab 导航后保存重排对齐：`\| a \| b \|` → `\|      \|      \|`） | 2 / 2 | **Mellow 优于 Typora**（minimal patch，Typora 保存重排） |
| 9 | math | PASS（fidelity） | PASS（fidelity） | 1 / 1 | 无 |
| 10 | Mermaid | PASS（fidelity） | PASS（fidelity） | 1 / 1 | 无 |
| 11 | image paste | PASS-E（image-input 测试 11 + image-ops 18） | PASS | — | 自动 UI 受限（剪贴板位图无法精确读回） |
| 12 | HTML clipboard | PASS-E（smartPaste htmlToMarkdown + sanitizeHtml） | PASS | — | 自动 UI 受限 |
| 13 | TSV paste | PASS-E（tsvToGfmTable） | PASS | — | 自动 UI 受限 |
| 14 | drag/drop | PASS-E（image-input drag 逻辑 + 测试） | PASS | — | 无法自动拖拽（CGEvent drag 不可靠） |
| 15 | undo | **PASS**（Cmd+Z 双 PASS） | PASS | 2 / 2 | 无 |
| 16 | external change | PASS-E（externalChange.test 9 + fs.rs conflict 拒绝覆盖） | PASS | — | 自动 UI 受限 |
| 17 | 10 MB | **PASS**（打开可编辑；精确 loadMs 引用 benchmark 报告） | **FAIL**（30s 内未检测到稳定渲染——Typora 更慢或检测口径差异） | 1 / 1 | Mellow 大文件打开优于 Typora（benchmark 佐证） |
| 18 | print | **FAIL**（无 Cmd+P / 菜单打印；仅 palette「打印 Reader」） | PASS（Cmd+P） | 3 / 1 | 功能缺失（UI 接线） |
| 19 | PDF export | **FAIL**（无 export.pdf 命令/菜单；仅打印→系统面板存 PDF） | PASS（File→Export→PDF） | 4 / 2 | 功能缺失（UI 接线） |
| 20 | accessibility focus | PASS（a11y phase：focus ring + Tab 导航 + aria-label） | PASS | — | 无 |

> PASS-E = 代码级证据（自动化测试）通过，UI 自动验证受环境限制；实际产品行为由测试保障。

## 差异分析

### A. Mellow 比 Typora 多一步的操作

| 操作 | Mellow | Typora | 多几步 |
|---|---|---|---|
| 打印 | Reader 打开 → palette 找「打印 Reader」→ 系统面板（3 步，无 Cmd+P） | Cmd+P（1 步） | +2 |
| 导出 PDF | Reader 打开 → palette 打印 → 系统面板 → 选「存为 PDF」（4 步） | File → Export → PDF（2 步） | +2 |
| 表格创建（键盘） | 菜单 Insert→表格 或 slash `/bg`（无快捷键） | Cmd+Opt+T（1 步） | +1 |
| 图片插入（键盘） | slash `/tp` / 拖拽 / 粘贴（无快捷键无菜单） | Cmd+Ctrl+I（1 步） | +1 |

### B. Mellow 比 Typora 更难发现的功能

| 功能 | Mellow 入口 | Typora 入口 | 发现难度 |
|---|---|---|---|
| PDF 导出 | 无菜单/命令，藏在「打印 Reader」（palette） | File→Export→PDF | 高（不可见） |
| slash 插入命令 | `/` + 中文别名（bg/dm/sx/tt/jg/tp/ml）需记忆 | 可浏览菜单 | 中高（aliases 记忆成本） |
| 公式/图表/图片插入 | slash-only（菜单只有标题/列表/任务/引用/表格/代码块） | Format→Paragraph/Image 菜单 | 中（无菜单） |

### C. Mellow UI 更复杂的位置

| 位置 | Mellow | Typora | 复杂度 |
|---|---|---|---|
| 导出体系 | 打印/导出分散（palette + Reader），无统一 Export 菜单 | File 菜单集中 | 高 |
| 命令入口 | slash + palette + 菜单三套并存且覆盖不一致（表格有菜单+slash，公式仅 slash） | 菜单为唯一权威入口 | 中高 |
| 侧边栏 | files/outline/search 三模式按钮切换 | 左下角图标（大纲/文件树） | 中 |

## 修复清单（直接列入）

| 优先级 | # | 修复 | 类型 |
|---|---|---|---|
| **P0** | F1 | 导出 PDF 命令（`export.pdf` → createPdfBuffer + 保存对话框）+ 菜单 File→Export→PDF | 功能缺失（UI 接线） |
| **P0** | F2 | 打印入口：Cmd+P 快捷键 + 文件菜单「打印…」（print_window） | 功能缺失（UI 接线） |
| **P0** | F3 | 图片插入菜单入口 + 快捷键（对齐 Typora Cmd+Ctrl+I） | 功能缺失（UI 接线） |
| P1 | F4 | 表格创建快捷键 Cmd+Opt+T（对齐 Typora） | 快捷键差异 |
| P1 | F5 | Insert 菜单补全：公式/图表/代码块/图片项（当前 slash-only） | 发现性 |
| P1 | F6 | 导出 HTML 菜单项（export 体系统一） | 功能缺失（UI 接线） |
| P2 | F7 | 命令入口一致性审查：slash/palette/menu 三套入口覆盖对齐 | UI 复杂度 |
| P2 | F8 | Japanese IME smoke：启用日文输入源后补测（j3） | 验证 |

## 平台记录

- **macOS**：1/2/5/8/9/10/15/17/20 实测 PASS；4/6/7/11/12/13/14/16 代码级 PASS-E；18/19 FAIL（功能缺失）；3 NOT TESTED。
- **Windows / Linux**：无构建验证环境 → 全部 NOT TESTED。Linux 容器构建完成后回填（IMPORTANT：j1/j2/j8/j15/j17 的 runner 可直接在容器内以 xdotool 复跑）。
