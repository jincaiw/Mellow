# Mellow ↔ Typora 深度对标评估与优化实施方案

> 版本：草案 v1（待确认）· 日期：2026-08-16
> 目标：以 Typora 1.14.x 为验收基线，逐项对齐功能、行为、快捷键、桌面 UI 与体验细节，
> 达到「一致或更优」；借鉴 Paperling 与 markdown-preview 的优点；三平台 + 中英双语（默认中文）。

---

## 一、评估方法与基线

- **基线**：Typora 1.14.6（PRD 基准）/ 1.14.9（本机实测对照）。
- **证据来源**：
  1. `docs/specs/typora-parity-checklist.md`（110 项，13 域）——功能对标清单；
  2. `docs/qualification/typora-parity-review-2026-08-13.md`（约 100 PASS-E/B、35 NOT TESTED、3 FAIL→已修）;
  3. `docs/qualification/golden-journeys-2026-08-13.md`（20 项实测，18/19 功能缺口→已修）；
  4. `docs/qualification/ui-review-2026-08-13.md`（U1-U8 收敛清单→U1-U4 已实施）；
  5. 本机实测（benchmark / IME 矩阵 / 三平台 CI 产物）；
  6. 参考项目 README 盘点（Paperling 473★、markdown-preview 1959★，2026-08 抓取）。
- **判定规则**：任何条目必须同时通过「功能、行为、快捷键、视觉反馈、文件结果、三平台」才算
  对齐；缺口分三类：**功能缺失**（Typora 有 Mellow 无）、**行为差异**（有但不等价）、
  **未验证**（有实现但缺证据）。

---

## 二、现状资产盘点（已完成、不回退）

| 资产 | 状态 |
|---|---|
| Live Markdown 引擎（marker reveal / 表格 / 数学 / Mermaid / 脚注 / YAML / TOC / 图片工作流） | ✅ 已发布 V1.0 |
| IME Composition Guard（macOS 8/8 无 corruption）+ Undo guard | ✅ |
| 文件安全（atomic save / 冲突拒绝 / 崩溃恢复 / Source Fidelity 0 diff） | ✅ File Safety 5/5 |
| 安全（DOM 白名单 / 链接拦截 / CSP / 远程图片默认关 / 签名自动更新+回滚） | ✅ |
| 导出（打印 Cmd+P / PDF CJK / HTML）+ 图标/安装器/文件关联/updater 元数据 | ✅ |
| UX 收敛（侧栏/状态栏默认隐藏、行号默认关、去 ⌘P 按钮） | ✅ |
| 三平台 CI（MSI/NSIS/DMG/AppImage/deb/rpm + updater 签名）+ GitHub Release v1.0.0 | ✅（macOS 未公证、Win/Linux 未真机验证） |
| i18n zh-CN/en-US 100% | ✅ |

---

## 三、深度差距分析

### A. 功能面缺口（Typora 有、Mellow 无 —— 按优先级）

| # | 功能 | Typora 行为 | Mellow 现状 | 优先级 |
|---|---|---|---|---|
| A1 | **查找替换（Ctrl/Cmd+H）** | 查找 + 替换 + 全部替换 + 正则 + 大小写 + 全词 | 仅 Cmd+F 查找（@codemirror/search 有 replace 能力未接线） | **P0** |
| A2 | **==高亮== 标记** | `==text==` 黄色高亮，marker 双向 reveal | 无实现（checklist 遗漏项） | **P0** |
| A3 | **^上标^ / ~下标~** | `x^2^`、`H~2~O` 行内上下标渲染 | 无实现（checklist 遗漏项） | **P0** |
| A4 | **emoji 补全** | 输入 `:smile:` 弹出补全 → 😄 | 无（editor-core 未启用 emoji autocomplete） | P1 |
| A5 | **Wiki 链接 [[file]]** | `[[other]]` 点击跳转/新建 | 无（Paperling 同款能力） | P1 |
| A6 | **脚注交互**（B5） | 点击跳转 / 返回 / hover 预览 / 源码 reveal | 渲染 ✅，交互未接线 | P1 |
| A7 | **TOC 点击跳转**（B6） | 点击目录项跳转标题 | 渲染 ✅，跳转未接线 | P1 |
| A8 | **图片尺寸语法** | `![alt](url =100x50)` 缩放 | 无 | P2 |
| A9 | **导出 Word (.docx)** | File→Export→Word | 无（仅 PDF/HTML/打印） | P2 |
| A10 | **最近文件夹**（B12） | 最近打开文件夹列表 | 无 | P2 |
| A11 | **Quick Look 扩展**（PRD §82） | macOS 空格预览 .md（markdown-preview 杀手锏） | 无 | P2 |

### B. 行为/体验差异（有但不等价）

| # | 项 | Typora | Mellow 现状 | 差距 | 优先级 |
|---|---|---|---|---|---|
| B1 | **链接点击** | Cmd+Click 打开（普通点击进源码） | 任何点击都 openUrl（H2 安全修复的取舍） | 需对齐：普通点击=光标定位/源码 reveal，Cmd+Click=浏览器（安全拦截保留） | **P0** |
| B2 | **表格列宽拖拽** | 拖拽分隔线调列宽（对齐列） | 无 | 中等 | P1 |
| B3 | **行内代码内反引号转义** | 智能处理 | 需实测 | 验证 | P1 |
| B4 | **列表 Enter 行为细节** | 空项回车退出、`1)`/`-` 自动转换 | 已实现大部分，需逐条实测（清单 §4.1 未全绿） | 验证+补 | P1 |
| B5 | **右键菜单** | 编辑器内完整右键（剪切/复制/粘贴/加粗/斜体/链接/图片/表格/段落） | ContextMenu 组件仅文件树用；编辑器内依赖 CM6 默认 | 需补齐编辑器右键菜单 | P1 |
| B6 | **菜单栏结构** | 文件/编辑/段落/格式/视图/主题/帮助 | 仅 Mellow/文件/视图/插入 —— 缺**编辑**（Undo/Redo/查找/替换）、**格式**（加粗/斜体/代码/链接/引用）、**段落**（标题层级）、**主题**、**帮助** | 结构缺失 | **P0**（骨架）+ P1（补全项） |
| B7 | **单文档 vs 多标签** | 单窗口单文档，打开即替换 | 多标签 | 保留 tabs（更优），但需：打开新文件默认当前窗口新 tab（已符合）+ 明确关闭行为对齐 | 验证 |
| B8 | **字数统计** | 状态栏 字数/行数 实时 | statusbar stats 存在（口径需对齐：字数） | 验证 | P1 |
| B9 | **拼写检查** | OS 拼写（红下划线 + 右键建议） | CM6 spellcheck 默认开（largeFile 关）——右键建议未验证 | 验证 | P1 |
| B10 | **YAML front matter 显示** | 灰色源码（不渲染卡片） | 渲染为卡片（githubAlerts 风格） | 需对齐 Typora：默认源码样式，可折叠 | P1 |

### C. 桌面 UI 差异

| # | 项 | Typora | Mellow 现状 | 优先级 |
|---|---|---|---|---|
| C1 | 默认界面 | 文档即视界（无侧栏/无标签/无行号/无状态栏杂物） | U1-U4 已收敛 ✅ | 已完成 |
| C2 | 标题栏 | 原生标题栏 + 路径 | overlay + tabbar | 保留（更优） |
| C3 | 主题菜单 | View→Themes 实时切换 | 设置内切换 + 命令 | P1（菜单对齐 B6 顺带） |
| C4 | 窗口 chrome 三平台 | Win/Linux 行为 | 未真机验证 | 验证（无环境则标注） |

### D. 参考项目借鉴清单（Paperling / markdown-preview）

| # | 借鉴点 | 来源 | 与 Typora 关系 | 优先级 |
|---|---|---|---|---|
| D1 | **Find & Replace（Ctrl+H）+ 正则 + 计数** | Paperling | Typora 同款（A1 合并实施） | P0 |
| D2 | **Cheatsheet（`?` 全局快捷键速查，可搜索）** | Paperling | Typora 无（更优项） | P1 |
| D3 | **Recent Files 欢迎屏（缺失文件标记）+ 启动恢复上次文件** | Paperling | Typora 有最近文件 | P1 |
| D4 | **表格可视化工具条（行/列增删、对齐、tidy）** | Paperling | Mellow 已实现 ✅（buildTableToolbarExtension） | 已完成 |
| D5 | **Interactive task checkbox（点击回写源码）** | Paperling | Mellow 已实现 ✅（taskCheckbox） | 已完成 |
| D6 | **Frontmatter Properties 卡片（可编辑）** | Paperling | Typora 无（更优项，与 B10 冲突需决策） | P2 |
| D7 | **Wikilink** | Paperling | Typora 有（A5 合并） | P1 |
| D8 | **copy-tex（选中公式复制 LaTeX 源码）** | markdown-preview | Mellow 已实现 ✅（copy source） | 已完成 |
| D9 | **Quick Look 扩展（Finder 空格预览）** | markdown-preview | PRD §82 P1 明确参考 | P2 |
| D10 | **离线 Mermaid/KaTeX 渲染（无 CDN）** | 两项目 | Mellow 已实现 ✅（本地渲染） | 已完成 |
| D11 | **4 主题 + 多字体选择** | Paperling | Mellow 有主题引擎（+custom CSS）；字体选择可补 | P2 |

---

## 四、优化实施方案（分阶段，待确认）

### Phase 0 —— Typora 核心编辑闭环补全（P0，预计 2-3 周）

| 任务 | 内容 | 验收 |
|---|---|---|
| P0-1 | 查找替换：接线 @codemirror/search 的 Replace（Ctrl+H 面板、全部替换、正则、大小写、全词）+ i18n + Cmd+G/Shift+Cmd+G | golden journey「查找替换」新用例 PASS；engine 测试 |
| P0-2 | 菜单栏对齐：新增 编辑（撤销/重做/剪切/复制/粘贴/查找/替换）、格式（加粗/斜体/代码/链接/引用）、段落（标题 H1-H6）、主题（主题列表）、帮助（关于/快捷键）菜单 | 菜单项逐项 dispatch 验证（AX 实测） |
| P0-3 | 链接点击对齐 Typora：普通点击→源码定位/光标进入，Cmd+Click→系统浏览器（保留 H2 导航拦截 + openUrl 安全路径） | H2 安全测试保持全绿；golden journey link 用例 |
| P0-4 | `==高亮==`：引擎 marker（reveal 双向 + 样式 + i18n）+ editor-core/engine 测试 | highlight.test 全套；Source Fidelity 不回退 |
| P0-5 | `^上标^` / `~下标~`：行内 widget 渲染 + 测试 | sup/sub 测试；源码 round-trip 不变 |

### Phase 1 —— Typora 体验细节对齐（P1，预计 3-4 周）

| 任务 | 内容 | 验收 |
|---|---|---|
| P1-1 | 脚注交互接线（B5：点击跳转/返回/hover 预览/源码 reveal）+ TOC 点击跳转（B6） | golden journey footnote/toc 用例 |
| P1-2 | emoji 补全（`:smile:` → 😄，editor-core autocomplete） | 测试 + 真机 |
| P1-3 | Wikilink [[x]]（同目录解析 + 点击跳转/新建，借鉴 Paperling） | 测试 + 真机 |
| P1-4 | 编辑器右键菜单（剪切/复制/粘贴/加粗/斜体/链接/图片/表格/段落，按上下文） | 右键菜单矩阵实测 |
| P1-5 | 表格列宽拖拽（对齐列宽度，minimal patch 写回） | table journey 扩展用例 |
| P1-6 | Cheatsheet（`?` 快捷键速查面板，可搜索，zh/en） | 实测 |
| P1-7 | Recent Files 欢迎屏（缺失文件标记）+ 启动恢复上次文件 | 实测 |
| P1-8 | 列表行为/字数统计/拼写右键建议/链接 editing reveal 逐条实测回填（B4/B8/B9 + checklist §3.3/§4.1 未绿项） | 清单逐项标绿 |
| P1-9 | YAML front matter 对齐 Typora（默认源码样式可折叠，B10；与 D6 Properties 卡片二选一，见决策点） | 视觉对照 |

### Phase 2 —— 增强与生态（P2，预计 3-6 周）

| 任务 | 内容 | 验收 |
|---|---|---|
| P2-1 | 导出 Word (.docx) | CJK 实测 |
| P2-2 | Quick Look 扩展（PRD §82，参考 markdown-preview） | Finder 空格预览实测 |
| P2-3 | 图片尺寸语法 =WxH | 测试 |
| P2-4 | 最近文件夹 + Hidden/Non-Markdown 文件策略（B12） | 实测 |
| P2-5 | 多字体选择 + 主题细节（D11） | 视觉对照 |

### Phase 3 —— 三平台真机验证与细节回填（依赖基础设施）

| 任务 | 内容 | 验收 |
|---|---|---|
| P3-1 | Windows 真机：安装矩阵 + IME（微软拼音/五笔）+ 行为矩阵 | windows-ime-matrix 回填 |
| P3-2 | Linux 真机：fcitx5/ibus + 安装矩阵 + 行为矩阵 | linux 清单回填 |
| P3-3 | macOS 签名公证（凭据到位后） | spctl 通过 |
| P3-4 | typing P95 复测（ABC 输入法）+ 30 任务效率 Gate（90% ≤ Typora+5%） | benchmark 报告 |

---

## 五、风险与不变量

1. **不回退已发布资产**：所有改动必须保持 File Safety 5/5、Source Fidelity 0 diff、
   IME corruption=0、Security（H1/H2/M1/M2）与 updater 签名全绿 —— 每阶段回归门禁。
2. **三平台一致**：新功能不允许平台分支逻辑进 editor-core/engine（仅 Adapter 层）。
3. **i18n 同步**：zh-CN 源 + en-US 100% 对齐（类型强制 + 测试）。
4. **冲突处理**：与 PRD/ADR 冲突先报告（例如 YAML 卡片 vs Typora 源码式、单文档 vs 标签页）。

## 六、待确认的决策点

1. **链接点击行为**（P0-3）：普通点击=源码定位、Cmd+Click=浏览器 —— 是否按此对齐 Typora？
2. **菜单栏**（P0-2）：新增 编辑/格式/段落/主题/帮助 五组菜单 —— 确认结构？
3. **YAML front matter**（P1-9）：对齐 Typora（源码样式）还是保留卡片（更优项）？
4. **标签页**（B7）：保留多标签为「更优」差异 —— 确认？
5. **P0 范围**：高亮/上标下标/查找替换/链接/菜单 五项为 P0 —— 确认？
6. **实施节奏**：Phase 0（P0）→ Phase 1（P1）→ Phase 2/3（P2+真机）—— 确认？

---

> 本方案仅为评估与计划，确认后按 Phase 顺序实施，每项带测试与真机验证。

---

## 七、决策记录（2026-08-16 确认）

| # | 决策点 | 确认结果 |
|---|---|---|
| 1 | P0 范围 | ✅ 确认五项 P0（查找替换 / 菜单栏 / 链接点击 / 高亮 / 上标下标） |
| 2 | 链接点击 | ✅ 对齐 Typora：普通点击=源码定位，Cmd+Click=系统浏览器（保留 H2 拦截） |
| 3 | 菜单栏 | ✅ 五组对齐 Typora：编辑 / 格式 / 段落 / 主题 / 帮助 |
| 4 | YAML front matter | ✅ 源码式（灰色）+ 可折叠，点击展开卡片 |
| 5 | 实施节奏 | ✅ **P0+P1 合并连续实施**，完成后统一验收 |

实施顺序（合并后）：高亮 → 上标下标 → 查找替换 → 链接点击 → 菜单栏五组 → YAML 折叠 →
脚注/TOC 交互 → emoji → Wikilink → 右键菜单 → Cheatsheet → Recent Files → 表格列宽 →
逐条实测回填。每项带测试；全部完成后跑回归门禁 + golden journeys 增量用例统一验收。

---

## 八、实施进度（2026-08-16 第一批，已提交 5ce499d；第二批 P0+P1 合并 ⑨-⑬ 已提交）

| # | 任务 | 状态 | 验证 |
|---|---|---|---|
| ① | ==高亮== | ✅ | inlineExtras：扫描器（跳过围栏/行内代码/Setext）+ caret-aware 定界符 + 9 测试 |
| ② | ^上标^ / ~下标~ | ✅ | 同上（单 ~ 下标与 ~~ 删除线不冲突） |
| ③ | 查找替换（Ctrl+H） | ✅ | @codemirror/search Mod-h + __MELLOW_SEARCH_API__ 桥（菜单触发） |
| ④ | 链接点击对齐 | ✅ | 普通点击不导航；Cmd/Ctrl+Click 浏览器（H2 保留） |
| ⑤ | 菜单栏五组 | ✅ | 编辑/格式/段落/主题/帮助（macOS AX 实测 10 菜单）；__MELLOW_FORMAT_API__ 桥（空选区成对插入、空光标作用于当前行） |
| ⑥ | YAML 灰色源码可折叠 | ✅ | 默认灰色源码 + 折叠按钮 → 卡片（StateField + 按钮 widget） |
| ⑦ | 脚注交互 + TOC 跳转 | ✅ | footnote.test.ts（点击跳转/↩ 返回/源码 reveal/hover title）+ toc.test.ts（live TOC widget 跳转） |
| ⑧ | emoji 补全 | ✅ | :smile: → 😄（autocomplete 源合并） |
| ⑨ | Wikilink [[name]] | ✅ | scanWikilinks（跳过围栏/行内代码）+ caret-aware 定界符 + 点击桥 → 同目录 name.md（10 测试） |
| ⑩ | 编辑器右键菜单 | ✅ | 上下文检测（文本/链接/Wikilink/图片/表格）+ 剪切/复制/粘贴 + 表格操作（14 测试） |
| ⑪ | Cheatsheet | ✅ | 帮助菜单「Markdown 速查表」→ 双语速查面板（命令 help.cheatsheet） |
| ⑫ | Recent Files + 启动恢复 | ✅ | recentFiles 模型（去重置顶/cap 10/缺失标记，8 测试）+ 欢迎屏列表 + 既有会话恢复 |
| ⑬ | 表格列宽拖拽 | ✅ | delimiter 分隔线拖拽 → 对齐列 dash 增减（对齐冒号保留）+ minimal patch 单单元格（8 测试） |
| ⑭ | 逐条实测回填 | ✅ | 见下方实测记录；统一验收（回归门禁 + golden journeys 增量） |

引擎测试：454 → **486 全绿**（48 suites；⑨+10、⑩+14、⑬+8）；app-core 111 → **119**（⑫ +8）；i18n 15 全绿；
desktop tsc / cargo check 通过；debug bundle 启动 + 菜单栏 10 菜单实测。

### ⑭ 实测记录（macOS debug/release bundle）

- 菜单栏：10 菜单（Apple/Mellow/文件/编辑/视图/插入/格式/段落/主题/帮助）AX 实测；帮助 → 「Markdown 速查表」点击执行成功（触发命令 `help.cheatsheet`）✅
- Golden Journeys（release .app，--app=mellow）：**j8 table、j9 math fidelity、j10 mermaid fidelity、j15 undo 全部 PASS**（j8 覆盖表格引擎 + ⑬ 扩展在安装列表中，无回归）✅
- typing 类 journey（j1 latin / j2 chinese / j4 bold / j7 list）FAIL：本机拼音 ITABC 拦截 ASCII 合成键 + 窗口焦点被 GUI 抢占（既有环境限制，与 ⑭ 改动无关；j15 同为 typing 却 PASS 证实非代码回归）——标注待 ABC 输入法复测
- 编辑器右键 / Wikilink 点击 / 列宽拖拽：DOM 级功能由 engine jsdom 测试覆盖（⑩ 14 + ⑨ 10 + ⑬ 8）；AX 无法断言 WKWebView 内部 DOM，且本会话屏幕录制权限被系统对话框拦截（视觉验证不可用）——标注待 GUI 捕获基础设施补充
- 回归门禁：cargo test 37+16(file safety)+4(updater) 全绿；Source Fidelity 137 文件 0 diff；引擎 486 / app-core 119 / i18n 15 全绿；desktop tsc 通过

---

## 九、实施进度更新（2026-08-17 —— 优化方案五阶段执行记录）

### 阶段 0 —— 事实基线修正与工具链（✅ 完成，提交 faedf91/3d0d740）
- ADR-0020：V1.0 降级为 pre-release（README/标题/元数据修正）；
- 根 pnpm workspace（package.json + pnpm-workspace.yaml + 根脚本）；
- 版本统一 0.1.0；npm lockfiles 移除，pnpm-lock.yaml 入库；
- ci.yml/release.yml 迁移 pnpm；tauri hooks 改 pnpm；
NaN
- 全量测试绿：engine 486 / app-core 128 / export 46 / host-api 38 / document-model 26 / i18n 15 / settings 8 / themes 8 / editor-core 16 / Rust 37+16+4。

### 阶段 1 —— 三平台构建矩阵（✅ 构建级完成，ADR-0021；真机矩阵待机器）
- GitHub Actions release.yml 首次三平台全绿：Windows MSI+NSIS（28MB）、macOS DMG（14.6MB，未签名）、Linux AppImage+deb+rpm（119MB）；
- CI 5 job 全绿（editor-core/engine/packages/desktop/rust）；
NaN

### 阶段 2 —— 桌面 UI Typora 化（进行中）
- ✅ 状态栏真实编码/行尾 + PRD§70 字数统计（wordCount 工具 + 9 测试，app-core 128）；
- ✅ 原生菜单三平台化（Win/Linux 首次有菜单）+ locale 切换重建（menu.rs 目录 zh/en）；
- ✅ U6 侧栏过滤控件折叠收纳（⋯）+ U7 tabbar 低干扰化 + macOS 标题栏拖拽区；
- ✅ 写作宽度（680/820/980/Auto）+ 行高设置（CSS 变量即时生效）；
- ✅ 设置搜索（P1，跨分类 labelKey 过滤）；
- ⏳ 剩余：markdown 语法开关（需 engine config 重构，阶段 3 前置）、字体/行高编辑器内生效（需 engine/theme）、App.tsx 组件化（desktop-ui，计划内）。

### 阶段 3-5 —— 待推进
- 阶段 3：parity 清单 NOT TESTED 项真机回填 + engine config 开关；
- 阶段 4：Reader/CLI/Open With/文件关联；
- 阶段 5：真实 UX Score/30 任务 Gate/三平台矩阵回填。

### 阶段 2/3 补充（2026-08-17 晚，第二轮）
- ✅ 源码模式接线（PRD §30）：引擎 installSourceApi → shell 命令 view.source.toggle（Cmd/Ctrl+/）+ 菜单项；
- ✅ CLI 模式（PRD §80）：`mellow-desktop [--reader|--source] <file.md>`（Rust OpenRequest + 前端 openPathWithMode）；
- ✅ Auto Save（PRD §101）：Window Blur + Document Switch 默认保存 dirty 文档，设置可关闭（此前设置项为空转）；
- ✅ 速查表补充新快捷键条目；
- ✅ Win/Linux 原生菜单不设加速键（避免与前端 keydown 双重触发切换类命令）。

### 阶段 2d/3 第三轮（2026-08-17 深夜）
- ✅ 建立 packages/desktop-ui（PRD §117）：从 App.tsx 增量抽取 Tabbar / StatusBar / Welcome（行为等价，拖拽逻辑内聚组件）；
- ✅ 状态提示串全部 i18n 化（打开/保存/另存/已保存，消除硬编码中文）；
- ✅ Source Fidelity 门禁复跑 PASS：140 文件 Open→Save 0 diff（File Safety 不回退）；
- ⏳ 2d 剩余：侧栏渲染函数（tree/outline/search/list）与 App.tsx 主体拆分（依赖面大，待后续轮次）。

### 阶段 4 第四轮（2026-08-18 凌晨）
- ✅ Open With（PRD §79）：Rust Adapter 平台检测（macOS /Applications 扫描 + open -a；Windows LOCALAPPDATA/ProgramFiles；Linux PATH which）+ 前端弹窗（检测列表 + 自定义命令）+ 文件菜单「打开方式…」+ 命令面板 file.openWith；
- ✅ 设置 Export 段过时文案修正（导出已可用，指向菜单/命令面板）。

### 阶段 2d/4 第五轮（2026-08-18）
- ✅ 2d 继续：抽取 OutlineList / SearchResultsList / FileList 到 desktop-ui（App.tsx 3219→3169 行；desktop-ui 已有 6 个组件：Tabbar/StatusBar/Welcome/OutlineList/SearchResultsList/FileList）；
- ✅ 设置补齐：启动恢复会话开关（PRD §92 general.reopenLast，默认开）；打开用户 CSS 命令（PRD §97 Custom CSS 入口，reveal appData/user.css）；
- ✅ 全量测试绿（app-core 128 / engine 491 等）；
NaN

### 阶段 4/5 第六轮（2026-08-18）
- ✅ 2d 完成 FileTree 抽取（desktop-ui 现有 7 个组件：Tabbar/StatusBar/Welcome/OutlineList/SearchResultsList/FileList/FileTree；App.tsx 3219→3143 行）；
- ✅ 阶段 5 门禁模板：docs/qualification/ux-score-gate-template.md（PRD §131 UX Score 评分表 + §132 30 任务清单与执行方法/通过判定/证据要求）；
- ⏳ 图片上传 adapter（PRD §55 P1）：extension-api 契约已有，宿主接线与 PicGo 适配器需真机+网络验证，明确延期；
NaN

### 阶段 2/5 第七轮（2026-08-18）
- ✅ 文件信息对话框（PRD §J.1）：路径/大小/修改时间/编码/行尾/行数/字符数/字数/阅读时长（纯前端统计，无新 IO）+ 文件菜单「文件信息…」；
- ✅ README 更新 desktop-ui 组件清单；
NaN

### 阶段 2 第八轮（2026-08-18）
- ✅ 单 Tab 自动隐藏标签栏（PRD §11 Typora 行为对齐；设置 editor.autoHideTabBar 默认开）；
- ✅ 复核 PRD §53 per-document YAML asset_dir 已实现（assetConfig.ts，无需补）；
- ✅ 三平台 release 流水线复跑全绿（含近两周全部改动：open_with/menu-i18n/desktop-ui 组件/AutoSave/源码模式/CLI/文件信息）。

### 阶段 2/3 第九轮（2026-08-18）
- ✅ 2d：抽取 SidebarHeader（desktop-ui 第 8 个组件：+SidebarHeader；App.tsx 3185 行）；
- ✅ Source Fidelity 复跑 PASS（141 文件 0 diff）；
- ✅ 修复 task-checkbox 测试时序抖动（轮询等待渲染，消除并行负载 flaky）；全量测试绿（engine 491 / app-core 128 等）。

### 阶段 1 第十一轮（2026-08-18，CI runner 突破）
- ✅ Runtime Qualification 流水线（.github/workflows/runtime-qualification.yml）：Windows/macOS/Linux 启动级验证全 PASS（app_alive=True；Linux 1200x775 主窗口 + X 焦点 + 文档渲染截图证据）；
- ✅ 精确定位 Linux 无头输入限制：WebKitGTK 在 Xvfb 下不接收 XTEST 合成键（双路径诊断+截图比对字节级相同）——非应用缺陷，需真实桌面；
NaN
NaN
NaN
NaN

### 阶段 1 第十二轮（2026-08-18）
- ✅ 三平台 **10MB 大文件打开冒烟**（PRD §110）：Windows/macOS/Linux 全部 `10mb_alive=true`（release 二进制打开 10MB 文档 15s 无崩溃）+ Linux 渲染截图；
- ✅ Linux 键盘事件穷尽式诊断完成（Ctrl+Shift+P 面板未弹出，三截图字节级相同）——确认 Xvfb 下 WebKitGTK web 进程不接收合成键，输入交互矩阵归入真机桌面执行包；
- ✅ Runtime Qualification 流水线累计证据：构建+启动+10MB（三平台）+ 文档渲染（Linux）。

### 阶段 3/4 第十三轮（2026-08-18）
- ✅ 图片尺寸语法 `![alt](url =WxH)`（Typora 附录 G 图片，deep-parity A8）：stripImageSize 纯函数 + widget 渲染应用 width/height + scan 剥离尺寸（批量操作路径正确）+ 4 测试；引擎 495 全绿；
NaN

### 阶段 3/4 第十四轮（2026-08-18）
- ✅ 最近文件夹（deep-parity A10，PRD §56/§62）：侧栏「最近文件夹」区（自动追踪去重置顶、上限 10、与固定文件夹并置）+ 3 测试；app-core 131 全绿。

### 阶段 4 第十五轮（2026-08-18）
- ✅ Pandoc Word 导出（PRD §75 P1 / deep-parity A9）：Rust pandoc_available/pandoc_export（PATH 检测 + spawn）+ 前端 export.docx 命令 + 文件菜单「导出 Word…」+ i18n；**本机真实验证**（pandoc 已装 → 生成含中文/表格的 DOCX 成功）；CI Linux 装 pandoc 复验；
NaN
