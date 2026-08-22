# Mellow ↔ Typora 最终对标实施方案（Master Plan）

> 状态：**定稿基准**（2026-08-22）。本方案是 Typora 对标工作的**唯一权威实施方案**，合并并取代以下四个历史文档（已删除，内容吸收至此）：
>
> 1. `docs/specs/typora-parity-checklist.md`（110 项 / 13 域功能对标清单）
> 2. `docs/qualification/typora-parity-review-2026-08-13.md`（首轮对标评审）
> 3. `docs/qualification/typora-full-parity-audit-2026-08-20.md`（四维全量差距审计）
> 4. `docs/plans/typora-deep-parity-plan.md`（深度对标五阶段方案与执行记录）
>
> 验收基线：**Typora 1.14.9**（macOS 本机实测：AX API 菜单树 dump 509 行 + 偏好设置 7 面板 OCR + 主窗口布局实测，证据见 `tests/benchmark/fixtures/typora-menu-dump.txt`）。
> 判定口径：PASS-E = 一致或更优；PASS-B = 基本一致有小差异；FAIL = 缺失；NOT TESTED = 未验证。

---

## 一、最终目标

与 Typora 在**功能、特点、桌面 UI、桌面布局、菜单**五个维度完全一致或更优，同时保持 Mellow 的差异化优势（数据安全、IME 优先、开放架构）：

1. **五维 PASS-E**：功能、快捷键体系、编辑行为、菜单结构、UI 布局逐项达标；
2. **三平台 + Windows Portable**：Windows（MSI/NSIS/Portable）/ macOS（Signed + Notarized DMG）/ Linux（AppImage/deb/rpm）；
3. **多语言**：简体中文（默认）+ English 100% 对齐，架构可扩展更多语言；
4. **不回退红线**：File Safety 5/5、Source Fidelity 0 diff、IME corruption = 0、updater 签名、安全门禁（H1/H2/M1/M2）全绿。

---

## 二、项目基础与参考项目

### 2.1 基础项目：MarkEdit（MarkEdit-app/MarkEdit）

- **定位**：CoreEditor 引擎基础（ADR-0001），vendored 于 `packages/editor-core/CoreEditor`（只读，见 UPSTREAM.md）；
- **保留**：CodeMirror 6 + Lezer 内核（ADR-0004）、Live Markdown 渲染管线（ADR-0006）；
- **不动**：不从零重写编辑器；上游同步走 vendored 流程。

### 2.2 参考项目 A：Paperling（Razee4315/Paperling，Tauri 2 + React + TS）

| 优点 | Mellow 状态 | 结论 |
|---|---|---|
| Reader / Code / Split 三视图（双向滚动同步） | ✅ 已有 | 达标 |
| Focus mode（非活动行变暗）/ Typewriter mode | ✅ 已有（F8/F9） | 达标 |
| Slash commands（行首 `/` 快捷插入） | ✅ 已有 | 更优保留 |
| 视觉表格工具条（行列增删 / 对齐 / tidy） | ✅ 已有（buildTableToolbarExtension） | 达标 |
| Interactive task checkbox（点击回写源码） | ✅ 已有 | 达标 |
| Smart paste（URL → 链接、HTML → Markdown、TSV → 表格） | ✅ 已有（clipboard-smart-paste-spec） | 达标 |
| Frontmatter Properties 卡片 | ✅ 已有（灰色源码 + 可折叠卡片，决策 2026-08-16） | 达标 |
| Wikilink `[[name]]` 同目录解析 | ✅ 已有 | 达标 |
| Cheatsheet（`?` 全快捷键可搜索） | ✅ 已有（帮助菜单速查表） | 达标 |
| KaTeX 按需加载 / mhchem 化学式 / Mermaid | KaTeX/Mermaid ✅；mhchem ❌ | R3 吸收 |
| Image lightbox（点击放大 + 懒加载） | ❌ | R3 吸收 |
| 欢迎屏最近文件（缺失标记）+ 恢复上次文件 | ✅ 已有 | 达标 |
| 外部变更检测（重载/保留选择） | ✅ 已有（externalChange 9 测试） | 达标 |
| 四主题五字体三字号 | 6 主题 + 字体族/字号设置 ✅ | 达标（R2 补主题语义） |
| AI 侧栏（Ask/Agent inline diff） | ADR-0018：AI 为可选扩展 | R3 可选（尊重 ADR） |

### 2.3 参考项目 B：markdown-preview（pluk-inc/markdown-preview，macOS AppKit）

| 优点 | Mellow 状态 | 结论 |
|---|---|---|
| Quick Look 扩展（Finder 空格预览） | ✅ 已有（B4） | 达标 |
| Open With（真实编辑器列表 + 记忆） | ✅ 已有（PRD §79） | 达标 |
| 离线 Mermaid/KaTeX（bundled 无 CDN） | ✅ 已有 | 达标 |
| copy-tex（选中公式复制 LaTeX 源码） | ✅ 已有 | 达标 |
| 文本缩放（捏合 + ⌘+/⌘-/⌘0，50%-300% 步进） | 字体缩放三键 ✅（12-28px 步进 1px） | R2 评估百分比式 |
| CLI 工具（`mdp` 打开文件/文件夹） | ✅ 已有（`mellow-desktop [--reader|--source] <file>`，PRD §80） | 达标（R3 评估软链别名） |
| .md 默认处理器注册提议 | ✅ 已有（fileAssociations） | 达标 |
| Share = 复制 Markdown 源码 | ❌ | R3 吸收（小项） |
| Open in LLM（发文件给 Codex/Claude/ChatGPT） | ❌ | R3 可选（与 AI 扩展联动） |
| 可自定义工具栏（View → Customize Toolbar） | ❌（AppKit 特性，跨平台成本高） | 暂缓（记录不实施理由） |

---

## 三、现状基线（已完成资产，禁止回退）

> 截至 v1.2.0（2026-08-22 发布，run 32548372001 三平台全绿）。以下均已落地且有测试/真机证据，**不重复实施**。

### 3.1 引擎与编辑

| 资产 | 证据 |
|---|---|
| Live Markdown 引擎（marker reveal / 表格全操作 / 数学 / Mermaid / 脚注 / YAML / TOC / Wikilink / 高亮 / 上下标） | engine 588 tests 全绿 |
| 表格完整操作（Tab 导航 / 插行列 / 行列移动 / 删表 / 复制表 / 列宽拖拽 / tidy） | table-engine 套件 |
| 选择命令组（⌘L 行 / ⌥⌘P 段落 / ⌘D 词 / ⌘E 格式文本 / 跳转组 / 删除范围 / 移行 ⌥↑↓） | D1/D3/D4 |
| 查找替换（⌘F / ⌥⌘F / ⌘G / ⇧⌘G / ⌃H 别名，正则 / 大小写 / 全词） | search 桥 + golden journey |
| 智能粘贴（HTML→MD / URL→链接 / TSV→表格）+ 复制四路（plain/html/rtf/markdown + Copy as HTML Code） | clipboard 套件 |
| IME Composition Guard（拼音 corruption=0）+ Undo guard | golden j2 PASS-E |
| 非对称标记（下划线 ⌘U / 注释 ⌃-）toggle 包裹 | D4 |
| 链接/代码块定位（打开链接 / 复制链接地址 / 复制代码块内容） | D4 |

### 3.2 菜单与快捷键（Typora 1.14.9 509 行菜单树逐项对照）

- 10 菜单结构等价映射（文件/编辑/段落/格式/视图/插入/主题/帮助 + Apple/Mellow）；
- 文件菜单：打开最近（10 项 + 清除）/ 全部关闭 / 保存全部 / 磁盘重载 / 页面设置 / 移到 / 废纸篓删除 / 快照入口 / 导出 13 格式（Pandoc 9 + PDF/HTML/无样式 HTML/图像）+ ⌃⌘P 导出 PDF + ⌃⌘E 上次设置导出；
- 编辑菜单：Typora 顺序重排 + 选择子菜单 5 项 + 删除子菜单 + 拼写检查子菜单 + 拷贝图片 + 复制为 Markdown ⇧⌘C / 纯文本 ⇧⌘V；
- 段落菜单：标题 ⌘1-6 + 升降级 + 表格子菜单 17 项 + 代码工具 + 列表缩进 ⌘]/⌘[ + 上下插段落 + 链接引用 ⌥⌘L + 脚注 + 水平线 + TOC + YAML；
- 格式菜单：下划线 ⌘U / 注释 ⌃- / 链接操作子菜单 / 图像子菜单 / 清除样式 ⌘\；
- 视图菜单：放大 ⇧⌘= / 缩小 ⇧⌘- / 实际大小 ⇧⌘0 / 侧栏模式 ⌃⌘1-3 / 全部标签 ⇧⌘\ / Always on Top / DevTools（debug）；
- 快捷键补集：行内代码 ⌃` / 删除线 ⌃⇧` / 公式块 ⌥⌘B / 代码块 ⌥⌘C / 引用 ⌥⌘Q / 列表 ⌥⌘O/U/X 全部落地。

### 3.3 平台与发布

- 三平台 CI（release.yml）：Windows MSI+NSIS / macOS Signed+Notarized+DMG / Linux AppImage+deb+rpm + updater 签名（.sig + latest.json）；
- Runtime Qualification 流水线：三平台启动 + 10MB 大文件冒烟 + Linux 渲染截图；
- 已发布：v1.0.0 → v1.1.0（B 系列 + 导出/侧栏增强）→ **v1.2.0**（D 系列深度对标，14 产物）。

### 3.4 多语言（需求 3 已满足，维护态）

- `packages/i18n`：`DEFAULT_LOCALE = 'zh-CN'`，zh-CN / en-US 100% 对齐（类型强制 + 测试），菜单/设置/消息全量 i18n；
- 新语言扩展路径已预留（`LOCALES` 数组 + messages 表 + 菜单目录）。

### 3.5 质量门禁（每阶段回归）

TS 10 包 918 tests / cargo 74 tests / Source Fidelity 145 文件 0 diff / E2E 冒烟 10 项 / desktop tsc clean。

---

## 四、剩余差距矩阵（待实施项全集）

> 经 B1-B5 / C / D1-D4 六个批次实施后，Typora 对标仅剩以下尾差。D5 浮动窗口已确认不实施（侧栏模式替代）。

| # | 维度 | 差距项 | Typora 基线 | 优先级 | 阶段 |
|---|---|---|---|---|---|
| G1 | 功能 | **Windows Portable 版**（新需求，Typora 无 portable 但用户明确要求） | —（增强项） | **P0** | R1 |
| G2 | 功能 | 智能标点（智能引号/破折号/输入时转换，编辑→替换子菜单） | 偏好设置可开关 | P2 | R2 |
| G3 | 功能 | 字数统计窗口（独立面板 + 阅读速度换算） | 视图→字数统计窗口 | P3 | R2 |
| G4 | UI | 主题语义补齐：Typora 六主题命名对照（Gothic/Pixyll/Whitey 风格位） | 6 主题（Github/Gothic/Newsprint/Night/Pixyll/Whitey） | P3 | R2 |
| G5 | 特点 | 缩放百分比化评估（Safari 式 50%-300% 步进 vs 现 12-28px） | 缩放 % 独立设置 | P3 | R2 评估 |
| G6 | 增强 | Image lightbox（图片点击放大 + 懒加载，Paperling） | ❌（Typora 无） | P2 | R3 |
| G7 | 增强 | mhchem 化学式（`$\ce{...}$`，Paperling） | ❌ | P3 | R3 |
| G8 | 增强 | Share = 复制 Markdown 源码（markdown-preview） | ❌ | P3 | R3 |
| G9 | 增强 | Open in LLM（文件发给 Codex/Claude/ChatGPT，markdown-preview） | ❌ | P3 | R3 可选 |
| G10 | 验证 | Windows 真机交互矩阵（微软拼音/五笔 IME + 安装矩阵 + 行为矩阵） | — | **P1** | R4 |
| G11 | 验证 | Linux 真机交互矩阵（fcitx5/ibus + 安装矩阵） | — | **P1** | R4 |
| G12 | 验证 | 日文 IME（golden journey j3） | — | P2 | R4（✅ macOS 2026-08-22 达标，见 §八） |
| G13 | 验收 | UX Score ≥ 92 + 30 任务效率 Gate（≤ Typora+5%） | — | **P1** | R4 |

**更优保留清单**（不实施 Typora 行为）：命令面板 ⇧⌘P / Slash 命令 / Reader / Split 视图 / 重开标签 ⇧⌘T / 单窗口多 tab / 高亮与上下标菜单项 / 状态栏信息常显 / ⇧⌘S 标准另存为。

---

## 五、实施阶段

### R1 —— Windows Portable 打包（P0，新硬需求）

**技术方案**（Tauri 2 无官方 portable target，采用 exe-local 数据目录重定向）：

1. **数据目录重定向**（Rust，`apps/desktop/src-tauri/src/lib.rs`）：
   - `main` 入口在 Builder 之前检测 exe 同目录是否存在 `Data` 文件夹；
   - 存在 → Windows 下 `std::env::set_var("APPDATA", <exe_dir>/Data)`（Tauri `app_data_dir` 由 `%APPDATA%\<identifier>` 解析，重定向后配置/快照/updater 缓存全部落在 exe 旁）；
   - 不存在 → 行为不变（安装版不受影响）；macOS/Linux 不启用。
2. **CI 产物**（`release.yml` windows job 追加 step）：
   - 复制 `target/release/mellow-desktop.exe` → `Mellow/Mellow.exe`；
   - 生成 `Mellow/Data/.keep` 占位（激活 portable 模式）+ `portable-README.txt`（WebView2 运行时说明）；
   - `zip Mellow_<version>_portable_win64.zip` → upload-artifact + tauri-action 后追加到 Release 资产。
3. **Updater 策略**：portable 模式下设置面板更新项降级为「请下载新版 zip 覆盖」提示（检测 Data 重定向标志）。
4. **验收门禁**：
   - 解压即用（无安装、无注册表、无 `%APPDATA%` 残留）；
   - 配置/最近文件/快照落在 `Data/`；删除 `Data/` = 完全卸载；
   - Windows 真机（或 VM）打开 10MB 文档冒烟；
   - 安装版回归不受影响（无 `Data` 目录时行为与 v1.2.0 一致）。

### R2 —— Typora 尾差补全（P2/P3）

| 任务 | 内容 | 验收 |
|---|---|---|
| R2-1 智能标点 | 设置 Markdown 面板开关组（输入时转换/智能引号/智能破折号）；引擎 input handler 按开关转换（`"` → `“”` 成对、`--` → `—`）；编辑→替换子菜单 | 引擎测试 + 中英文引号方向用例 |
| R2-2 字数统计窗口 | 独立面板（字数/字符/行数/段落/阅读时长，中英文口径区分 CJK）；视图菜单「字数统计窗口」 | 面板实时刷新 + 测试 |
| R2-3 主题语义补齐 | 新增 Gothic（衬线深色，Georgia/宋体衬线族）与 Whitey（极简高对比白）主题，主题菜单 radio 列全 8 项；主题命名对照表入文档 | 主题切换实测 + themes 测试 |
| R2-4 缩放百分比化评估 | 评估 fontSize 12-28px ↔ 50%-300% 映射（Reader 已百分比）；结论二选一：a) 保持 px b) 双轨显示 | 评估结论记录 + 设置面板口径统一 |

**R2-4 评估结论（2026-08-22，选 b 双轨显示）**：编辑器保持 `editor.fontSize` px 单一真源（10-32px，默认 17px），不做全局百分比化。理由：① Typora 偏好设置的字体大小本身即 px 值，px 与 Typora 偏好语义一致；② CodeMirror 行高/padding 与代码块 em 相对布局基于 px 字号精确计算，全百分比化需重构 theme 层，风险高收益低；③ 口径统一改为换算显示——状态栏字号提示为 `17px (100%)`（默认 17px = 100% 基准，Reader zoom 同基准），设置面板字号项新增描述说明该换算关系（i18n zh/en）。

### R3 —— 参考项目增强（P2/P3，Typora 无有的加分项）

| 任务 | 内容 | 来源 | 验收 |
|---|---|---|---|
| R3-1 Image lightbox | 图片点击全屏放大（遮罩 + 缩放 + Esc 关闭）、编辑区图片懒加载 | Paperling | 交互实测 |
| R3-2 mhchem 化学式 | KaTeX mhchem 扩展（`$\ce{2H2+O2->2H2O}$`），按需加载 | Paperling | 数学套件扩展用例 |
| R3-3 Share 复制源码 | macOS Share 子菜单 → 分享面板携带 Markdown 文本（Copy = 源码） | markdown-preview | 真机实测 |
| R3-4 Open in LLM（可选） | 工具栏/文件菜单 → 系统检测 Codex/Claude/ChatGPT 并以文件上下文打开；遵守 ADR-0018（AI 可选扩展，默认关） | markdown-preview | 真机实测 |
| R3-5 CLI 别名评估 | 评估 `mellow` 软链/别名（现 `mellow-desktop`），Windows 侧 `.cmd` shim | markdown-preview | 评估结论 |

### R4 —— 三平台真机验证与最终验收（依赖真机/VM 基础设施）

按 `docs/qualification/real-desktop-execution-bundle.md` 执行包 + `ux-score-gate-template.md` 门禁：

| 任务 | 内容 | 验收 |
|---|---|---|
| R4-1 Windows 真机 | 安装矩阵（MSI/NSIS/Portable）+ IME（微软拼音/五笔）+ 行为矩阵 + portable 数据落盘核查 | windows-ime-matrix 回填 |
| R4-2 Linux 真机 | fcitx5/ibus IME + 安装矩阵（AppImage/deb/rpm）+ 行为矩阵 | linux 清单回填 |
| R4-3 日文 IME | golden journey j3（macOS 日文输入源） | j3 达标 |
| R4-4 UX Score Gate | UX Score ≥ 92 + 30 任务效率 ≤ Typora+5% + Manual Golden Journey 全绿 | 门禁报告 |
| R4-5 V1.0 转正评审 | ADR-0019/0020 门禁裁决 + 发布评审 | V1.0 release |

---

## 六、风险与不变量

1. **不回退红线**（每阶段回归）：File Safety 5/5 / Source Fidelity 0 diff / IME corruption=0 / updater 签名 / 安全门禁全绿；
2. **三平台一致**：新功能不允许平台分支逻辑进 editor-core/engine（仅 Adapter 层，PRD §113.4）；
3. **Portable 不污染安装版**：数据重定向必须以 `Data` 目录存在为前置条件，默认路径行为与已发布版本完全一致；
4. **i18n 同步**：所有新 UI 词条 zh-CN 源 + en-US 100%（类型强制）；
5. **冲突处理**：与 PRD/ADR 冲突先报告不擅改（如 R3-4 Open in LLM 需符合 ADR-0018 可选扩展边界）。

---

## 七、文档治理记录（2026-08-22）

| 动作 | 文件 | 去向 |
|---|---|---|
| 删除 | `docs/specs/typora-parity-checklist.md` | 110 项清单终态吸收至本方案 §三/§四 |
| 删除 | `docs/qualification/typora-parity-review-2026-08-13.md` | 首轮评审结论吸收至 §三 |
| 删除 | `docs/qualification/typora-full-parity-audit-2026-08-20.md` | 四维差距矩阵终态吸收至 §四 |
| 删除 | `docs/plans/typora-deep-parity-plan.md` | 五阶段执行记录吸收至 §三；后续进度记录于本方案 §八 |
| 保留 | `docs/qualification/` 其余文件 | IME 矩阵 / golden journeys / 门禁模板等为**测试证据**非对标文档，历史引用不改写 |

---

## 八、实施进度记录

| 日期 | 阶段 | 内容 | 状态 |
|---|---|---|---|
| 2026-08-22 | — | 本方案定稿（合并 4 旧文档，差距矩阵确认剩余 G1-G13） | ✅ |
| 2026-08-22 | R1-1 | Rust 便携模式：exe 旁 `Data` 检测 + APPDATA/LOCALAPPDATA 重定向（recovery/updater/WebView2 localStorage 全落 Data；`is_portable` 命令暴露前端） | ✅ |
| 2026-08-22 | R1-2 | 前端 updater 降级：便携模式跳过启动自动检查 + 手动检查 toast 提示（i18n zh/en） | ✅ |
| 2026-08-22 | R1-3 | CI portable 产物：Windows job 追加 `Mellow_<ver>_portable_win64.zip`（exe + Data 占位 + 中英双语 README）并附加到 Release | ✅（真机验证待 R4-1） |
| 2026-08-22 | R1-4 | 门禁：cargo check/test 74 全过 + desktop tsc clean + i18n 15 过（Windows 代码路径以运行时 cfg! 判定实现，本地可编译验证） | ✅ |
| 2026-08-22 | R2-1 | 智能标点：引擎 `smartPunctuation.ts`（smart quotes 成对弯引号 + `--␠`→`—`，避开 hr/表格 delimiter）+ iframe `__MELLOW_SMART_PUNCTUATION__` 通道 + 设置开关（默认关，Typora 一致）+ 编辑→替换菜单 CheckMenuItem + 引擎测试 9 用例 | ✅ |
| 2026-08-22 | R2-2 | 字数统计窗口：`countWords` 新增 paragraphs/charsNoSpace 口径 + 视图菜单「字数统计窗口」+ 独立面板（字/词/字符含去空格/行/段落/阅读时长，实时刷新，复用文件信息面板样式） | ✅ |
| 2026-08-22 | R2-3 | 主题语义补齐：新增 Whitey（极简高对比白）与 Gothic（衬线深色，Georgia/宋体）主题，内置主题达 8 个，主题菜单 radio 全列 | ✅ |
| 2026-08-22 | R2-4 | 缩放百分比化评估结论：选 b 双轨显示（保持 px 单一真源 + 换算显示）；状态栏 `17px (100%)` + 设置面板字号描述（zh/en） | ✅ |
| 2026-08-22 | R2 门禁 | 全 workspace 测试 10 包 932 用例全过（app-core 140 / engine 600 / editor-core 17 / export 67 / host-api 43 / document-model 26 / i18n 15 / settings 8 / themes 8 / commands 8）+ desktop tsc clean + cargo test ok（reveal.test 并发偶发超时已单独复跑确认稳定） | ✅ |
| 2026-08-22 | R3-1 | Image lightbox：Reader lightbox 增强滚轮缩放（50%-400%）/ 双击重置 / 缩放百分比指示 + 全渲染管线 img `loading="lazy"`（export markdown-it 规则与 app-core reader 行内） | ✅ |
| 2026-08-22 | R3-2 | mhchem 化学式 + 编辑器内公式排版：export 静态注册 katex contrib mhchem（\ce/\pu，导出/打印生效，测试 msub+→ 特征断言）；Reader/Split 无 MathJax 时按需加载 KaTeX+mhchem 渲染；engine 新增 `__MELLOW_KATEX_RENDER__` 异步通道（宿主注入 iframe，含 KaTeX CSS），fallback 链 MathJax→KaTeX→源码；desktop katexLoader 单例 + engine/editor-core 通道测试 | ✅ |
| 2026-08-22 | R3-3 | Share 复制源码：macOS NSSharingServicePicker 需真机验证 → 并入 R4 真机阶段实施（跨平台基础「复制为 Markdown ⇧⌘C」已有） | ⏸ 并入 R4 |
| 2026-08-22 | R3-4 | Open in LLM：可选增强，遵守 ADR-0018（AI 可选、默认关）；暂缓待明确需求 | ⏸ 暂缓 |
| 2026-08-22 | R3-5 | CLI 别名评估：`mellow-desktop` 已可用（PRD §80）；改名/别名涉及 updater/CI 产物名一致性，收益低风险高 → 保持现名，Windows `.cmd` shim 列为后续可选增强 | ✅ 结论：保持现名 |
| 2026-08-22 | R3 门禁 | 10 包 934 测试全过（engine 601 / export 68 含 mhchem 用例）+ cargo test 20 + desktop tsc clean + vite build 验证（katex 261KB / mhchem 33KB 独立异步 chunk，按需加载达成）| ✅ |
| 2026-08-22 | — | **G1-G9 代码级差距全部闭环**（R1 portable / R2 尾差 / R3 增强）；剩余 G10/G11/G13（R4 真机验证矩阵 + UX Gate）为环境依赖项，待 Windows/Linux 真机就绪后执行（G12 日文 IME 已于同日 macOS 达标，见下） | 📌 R4 待环境（G10/G11/G13） |
| 2026-08-22 | j17 性能 | 大文件 dispatch O(n²) 修复：wikilink/inlineExtras 区间检查改 `makeSkipChecker`（归并区间 + 二分 + char-first 快路径）+ 视口裁剪；10MB dispatch 92s → 169ms（LF 预启）；新增性能护栏测试防复杂度回归 | ✅ |
| 2026-08-22 | j17 白屏根因 | tauri:// WKURLSchemeHandler 下动态 `<style>` CSSOM 永久失效（sheet===null 不可恢复）三层修复：① 分块 IPC 传输大内容（Rust `read_text_meta`/`read_text_chunk` + 前端分块拼接，规避超大单次 IPC 响应卡死 WebKit 事务）；② `EditorCore.open()` 大文档 gate `waitForStylesReady()`（样式 CSSOM 建立后才 dispatch）；③ **styleAdoptShim**（bundle 注入：MutationObserver 监听动态样式，确认 CSSOM 死亡后镜像到 `adoptedStyleSheets`，含 `style.disabled` 原型守卫保 Typewriter Mode 开关语义；正常环境不接管零侵入）+ 主文档 642KB inline module script 外部化（`core-main.js`） | ✅ |
| 2026-08-22 | LF 收口 | Large File Mode 分类移入 `CoreEditor.open()`（resetEditor 前自动降级，覆盖 applyTab / auto reload / 冲突解决 / 快照恢复全路径）；editor-core 契约测试更新（ready() idle-mount 等待语义 + jsdom TextEncoder 守卫降级路径） | ✅ |
| 2026-08-22 | j17 门禁 | 重建 release Mellow.app 实测：**j17 10MB PASS 8.5s**（OCR 渲染验证）；TS 10 包 936 tests 全绿（engine 603 / app-core 140 / export 68 / host-api 43 / editor-core 17 / document-model 26 / i18n 15 / settings 8 / themes 8 / commands 8）+ cargo 74 + desktop tsc clean。对照：**Typora 拒渲染 >10MB 文件（弹「该文件过大」），Mellow 正常渲染 = 优于 Typora**（PRD「一致或更优」）。golden-journeys j17 ready 判定改 OCR 内容验证（窗口截屏 OCR fixture 首行）：本机 SCK 窗口捕获流间歇故障（snap 启动失败 / probe 假稳定 → detectChange 无帧），输入（CGEvent/SE keystroke）与渲染均实测正常，非产品缺陷；screen-timing 增加 snap 调试命令 | ✅ |
| 2026-08-22 | G12 日文 IME | **j3 双 app PASS（Mellow + Typora 1.14.9）**。环境修复：① 启用日文罗马字输入源（GUI 添加；plist 直写与 TISEnableInputSource 均不持久，实测需 System Settings 正规路径）；② 输入源 ID 演进：macOS 26 实测为 `com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese`（旧 `…Kotoeri.Romaji` 已不存在），j3 改双 ID 依次探测；③ 用词修正：`konnichiwa` 在 macOS 26 JapaneseIM 做字面转换得 `こんにちわ`（正字拼作 konnichiha，双 app 同行为 = parity 成立，测试用例问题），改无歧义词 `nihongo`；④ 判定准则明确为「IME 组字提交成功」（にほんご / 日本語 任一），验证 marked text 完整性而非词典选择 | ✅ macOS 达标 |
