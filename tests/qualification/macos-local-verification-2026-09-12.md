# macOS 本机验证记录（2026-09-12）

## 0. 验证范围裁决（用户，2026-09-12）

> 「macOS 平台版本使用本机验证，其他平台不做真实设备验证。」

- **macOS**：以**本机实机**为证据来源（本文件即记录）。
- **Windows / Linux**：**不做**真实设备验证。这与仓库已有 **ADR-0022** 一致 ——
  Windows 与 Linux 以 GitHub Actions（`windows-latest` / `ubuntu-latest`）为**正式 Runtime
  证据来源**，不要求人工真机补测。
- 因此 `requiredEvidence` 中的 `windows` / `linux` 两项**继续保留**（仍需证据），
  但其证据形态为 **CI**，而非真机截图/计时。本文件不改变该策略，只补足 macOS 侧。

补充（同日，证据词汇修正）：原台账用**裸平台名** `windows` / `linux` 表达证据需求，
在 D-W 下**不可满足**（不做真机验证 → 该 token 永远取不到），等于把门禁变成
「永远无法关闭的假门禁」。已统一改为 `windows-ci` / `linux-ci`，与 `P0-PLATFORM-001`
既有写法及 ADR-0022 对齐，并由 `tests/parity/verify-release-gate.mjs` ② 节
**显式禁用**裸 `windows` / `linux` / `win` / `mac`，且未登记词一律拒绝。
共改写 **47 项**台账条目。详见 §2.11。

## 1. 机器与规范基线

| 项 | 值 |
|---|---|
| 机型 | Mac mini（Apple M4），arm64 |
| 系统 | Darwin 25.6.0（xnu-12377.161.14~5/RELEASE_ARM64_T8132） |
| Typora（本机安装） | `/Applications/Typora.app` → **1.14.9（build 7785）** |
| 规范基线 | Typora 1.14.9（build 7785） |
| 结论 | **本机 Typora 版本与规范基线完全一致**，本机具备直接对照条件 |

## 2. 已取得的 macOS 证据

### 2.1 基线 dump 可复现（真机提取）

```sh
node tests/benchmark/generate-typora-menu-dump.mjs
# typora-menu-dump.txt: EXTRACTED from Typora 1.14.9 (7785); 1489 lines
```

- 重生成前后 `diff` **仅 1 行差异**：`GENERATED_AT` 时间戳；其余 1488 行**逐字节一致**。
- 证据来源校验和（Info.plist / Menu.strings(zh-Hans) / MainMenu.nib / frame.js）均稳定。
- 意义：菜单单一真源的**输入基线是可复现的真机产物**，不是 UNVERIFIED 占位。

### 2.2 Rust System Core（macOS）

```sh
cd apps/desktop/src-tauri && cargo test
```

| target | 结果 |
|---|---|
| `mellow_desktop_lib`（单元） | 63 passed / 0 failed |
| `tests/file_safety_corpus.rs` | 16 passed / 0 failed |
| `tests/updater_safety.rs` | 4 passed / 0 failed |
| **合计** | **83 passed / 0 failed** |

含原子保存、磁盘满、只读、云同步替换、Source Fidelity 逐字节、更新包篡改拒绝等。

### 2.3 全仓 TypeScript 单测（macOS）

**1613 例全绿**（editor-engine 1135 / app-core 217 / export 72 / host-api 43 / commands 30 /
document-model 26 / editor-core 19 / desktop-ui 17 / i18n 15 / extension-api 14 / settings 13 / themes 12）。

### 2.4 类型检查 0 错误

```sh
cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
# TSC_EXIT=0，错误行数 0
```

> **重要更正**：此前多轮记录中「11 条 `@tauri-apps/api` 相关错误属环境基线、非代码问题」的
> 判定 —— 本次复核**该 11 条错误已不再复现**，类型检查为**完全干净**。历史记录里的
> 「环境基线」说法应作废，不得再作为豁免理由。

### 2.5 前端构建 + Release 构建 + 渲染层指纹（macOS）

```sh
cd apps/desktop && pnpm run build          # build-editor-bundle → tsc → vite build，EXIT=0
cd src-tauri && cargo build --release --features custom-protocol
# Finished `release` profile [optimized] target(s) in 1m 21s
node scripts/verify-release-bundle.mjs
# Release bundle self-check OK: v1.5.5 fingerprint + heading diffs [20,12,8,4,0,0] + engine truth markers
```

- 产物：`src-tauri/target/release/mellow-desktop`，19,006,752 字节，Mach-O 64-bit arm64，ad-hoc 签名。
- 构建产生 2 条 `dead_code` 警告（`src/search.rs` 的 `now_ms` 等），**不影响构建成功**；
  按 AGENTS.md 统一规则 15（不允许未经要求的无关重构），本次**未**顺手清理，仅记录。

### 2.6 应用启动冒烟（真机）

```sh
./mellow-desktop   # 后台运行 4s 后 kill
# 结果：ALIVE，stdout/stderr 无 panic / error / thread 'main' 输出
```

- 结论：**release 二进制在本机可正常启动并保持存活**，无启动期崩溃。

### 2.7 Parity 护栏（macOS）

```sh
for f in tests/parity/verify-*.mjs; do node "$f"; done   # 14/14 PASS
node tests/qualification/ux-gate-recorder.mjs --self-test  # PASS
```

> **更正**：此前记录「`tests/e2e/*.mjs` 另需 Playwright，本环境未安装」——
> 经复核**不成立**。Chromium 已存在于 `~/Library/Caches/ms-playwright/`，
> 仅缺 npm 包；已装到临时目录 `/tmp/pw`（**不污染仓库、不改 package.json**），
> 以 `NODE_PATH=/tmp/pw/node_modules` 运行即可。详见 §2.8。

### 2.8 e2e 端到端（macOS，Playwright + Chromium）

运行方式（Playwright 未纳入仓库依赖，故用临时 NODE_PATH）：

```sh
NODE_PATH=/tmp/pw/node_modules node tests/e2e/<script>.mjs
```

| 脚本 | 结果 | 覆盖 |
|---|---|---|
| `smoke.mjs` | **10/10** ✅ | React 非白屏、iframe 挂载、`webModules.core` 就绪、CodeMirror 实例、引擎扩展安装、输入闭环、WYSIWYG marker 隐藏 5/5、零页面错误、零控制台错误 |
| `sidebar-verify.mjs` | **19/19** ✅ | ⌃⌘1/2/3 三模式、写作宽度不随侧栏变化、Source Mode 往返、Reader 往返、⌘F 临时过滤框、☰ 直切、窄窗暂隐与恢复 |
| `sidebar-resize-verify.mjs` | **12/12** ✅ | 默认 260、拖拽 380、clamp 200/480、持久化、重载恢复、越界回落、<900 暂隐、200% zoom |
| `block-shortcuts-verify.mjs` | **15/15** ✅ | ⌥⌘Q/U/O/X/C/B 块级、**⌘⇧` 行内代码**、⌃⇧` 删除线、⌘\\ 清除样式、查找替换面板 |
| `zoom-verify.mjs` | **8/8** ✅ | — |
| `theme-verify.mjs` | **8/8** ✅ | — |
| `font-family-verify.mjs` | **4/4** ✅ | — |
| `drag-drop-verify.mjs` | **7/7** ✅ | — |
| `ime-composition-verify.mjs`（本轮新增） | **6/6** ✅ | 见 §2.10 |

**首轮暴露 2 项 ❌，经查证均为「断言过期」而非实现回归**（第五类失真）：

| 断言 | 实测 | 定性 |
|---|---|---|
| `⌃⌘2 unbound (V5-A1: list retired)` | `mode=fileList`（已绑定） | **断言过期**：W1.5 已按 Typora 官方表恢复 Articles（⌃⌘2）。实现正确。 |
| `⌃` wraps selection as inline code` | 未包裹 | **断言过期**：W1.9 已按官方表将行内 Code 的 macOS 键位改为 **⌘⇧`**（⌃⇧` 为删除线）。实现正确。 |

向 Typora 官方 Shortcut Keys 页（rev. 2026-09-06）求证后确认官方真值：
`Code = Cmd+Shift+\``、`Strike = Ctrl+Shift+\``、`Articles = Cmd+Control+2`、
`Outline = Cmd+Control+1`、`File Tree = Cmd+Control+3` —— **Mellow 现状全部一致**。

处置：**改断言、不改实现**；并在 `block-shortcuts-verify` 增加反残留防线
（「⌃` 不得再包裹行内代码」），在护栏侧把官方真值固化为合同（§2.11）。

### 2.9 视觉 Golden（macOS）

```sh
NODE_PATH=/tmp/pw/node_modules node tests/visual/visual-golden.mjs    # 6/6 配置命中 ±1px
NODE_PATH=/tmp/pw/node_modules node tests/visual/sidebar-golden.mjs   # 4/4 视图命中 ±1px
NODE_PATH=/tmp/pw/node_modules node tests/visual/capture-window-chrome.mjs
```

- **布局 Golden**：`win-900x600` / `win-1200x800` / `win-1440x900` / `zoom-200` /
  `dark-900x600` / `dark-1440x900` —— **6 配置全部命中基准**。
- **侧边栏 Golden**：`files-tree` / `files-tree-filter` / `outline` / `search` —— **4 视图全部命中**。
- **window chrome**：已归档 `p2-8-window-chrome-macos.png`（1440×900），
  manifest 中 Windows / Linux 仍为 `PENDING_REAL_MACHINE`。
- 旁证：`sidebar-verify` 实测写作宽度 **860px**（与 `TYPOGRAPHY_DEFAULTS` 单一真源一致，
  此前文档曾写 820，已纠偏）。

### 2.10 IME 合成（macOS，CDP 路径）

`tests/benchmark/ime-matrix.mjs` 依赖 System Events 向原生 App 发键，本机被 TCC 拒绝（§3）。
本轮改用 **CDP `Input.imeSetComposition`** 直接驱动渲染进程合成管线，
产生真实的 compositionstart/update/end 与文本提交，**不需要辅助功能授权**。
新增 `tests/e2e/ime-composition-verify.mjs`，**6/6 通过**：

| 验证点 | 结果 |
|---|---|
| 拼音中间态 → 提交，精确落字（无丢字 / 无重复） | ✅ `你好` |
| 合成中抑制自动配对（`autoCharacterPairs` 的 `isComposing` 守卫） | ✅ `（` 未生成 `（）` |
| 行内 marker 内合成不破坏结构 | ✅ `**ab中**` |
| 块级 marker 后合成保持块完整 | ✅ `- 新item` |
| 撤销回到空文档（无 CJK 残留） | ✅ |
| 同次数重做逐字回到原状 | ✅ |

**证据边界（如实记录）**：本路径覆盖「编辑器内核 + Mellow 扩展」的合成行为，
运行在 dev server + Chromium；**不覆盖**原生 macOS 输入法面板/候选窗交互与
Tauri WKWebView 宿主行为。后者仍需辅助功能授权后由 `ime-matrix.mjs` 补齐。

### 2.11 官方快捷键表真值合同（新增护栏 §11）

根因：W1.5 / W1.9 分别改过 Articles 与行内 Code 的键位，但**改完无人守** ——
键位真值只存在于 e2e 断言里，而 e2e 不进 CI，于是断言与实现脱节后长期无人发现。

处置：在 `tests/parity/verify-menu-contract.mjs` 新增 §11，把 Typora 官方
Shortcut Keys 表（rev. 2026-09-06）写成**机器可判定合同**：

- 覆盖 **55 条**官方键位（File / Edit / Paragraph / Format / View 五组），macOS 与 Win/Linux 双向校验；
- 修饰键别名归一化（`Command`↔`Cmd`、`Control`↔`Ctrl`、`Option`↔`Alt`，且顺序无关），
  避免「等价写法被判漂移」；
- 有意差异显式登记（`search.replace`：macOS `Cmd+H` 被系统「隐藏应用」占用 → §12 D-Q）；
- **canary**：注入 W1.9 前的旧键位必须被拒绝；另加 Articles 键位漂移 canary。

**已做真实注入验证**（非仅自洽）：把 `format.code` 的 `mac` 改成 `Ctrl+\`` 后
护栏确实报 `官方快捷键表漂移：format.code macOS 应为 Cmd+Shift+\`，随后还原。

### 2.12 Source Fidelity 语料门禁（macOS，真实原子保存管线）

```sh
PATH="/Volumes/My-Data/jason.wa/.cargo/bin:$PATH" \
  bash tests/qualification/run-source-fidelity-corpus.sh
# [source-fidelity] total=177 identical=177 diff/failed=0
# PASS —— 177 个文件 Open → No Edit → Save 后 git diff = 0（字节级一致）
```

- 语料 **177 个文件 / 约 29MB**，覆盖 `bom` / `chinese` / `crlf` / `html` / `images` /
  `large` / `lf` / `math` / `mermaid` / `real`(148) / `tables` / `yaml` 共 12 类。
- 走**真实原子保存管线**（`tools/source-fidelity`：decode → encode → atomic_save），
  不是模拟；`git diff` 必须为 0。
- 这是「不丢字节」的硬证据，直接支撑 File Safety 与 Source Fidelity 相关台账项。

### 2.13 图片上传链路与大文件诊断（macOS）

| 脚本 | 结果 | 说明 |
|---|---|---|
| `tests/e2e/image-upload-verify.mjs` | **10/10** ✅ | 4 通道（none / picgo-http / picgo-cli / custom-command）设置与持久化、空文档早退、缺失图片不改文档 |
| `tests/e2e/large-file-diag.mjs` | **1MB（58,912 行）`resetEditor` 137ms，`ok=true`，无白屏** | 10MB 白屏诊断的检查点版；本轮先跑 1MB 档位确认管线无卡点 |

> 大文件诊断运行在 dev server + Chromium，**不等于** release 应用的性能；
> `P0-PERF-001` 的正式性能对比（Mellow vs Typora，同机同时）仍受阻于 System Events。

### 2.14 §9.3 视觉 Golden 补齐 14 场景（macOS 全覆盖）+ 发现并修复一个真 bug

原覆盖：plan §9.3 定义每平台 14 场景，`visual-golden.mjs`（6 配置）+ `sidebar-golden.mjs`
（4 视图）合计只覆盖 7 个；缺 **首次启动 / 单文档 Live / File List / Settings /
Selection Toolbar / Table Toolbar / Reader**。

新增 `tests/visual/scenes-golden.mjs` 补齐这 7 个，**macOS 侧 14 场景现已全覆盖**：

```sh
NODE_PATH=/tmp/pw/node_modules node tests/visual/scenes-golden.mjs   # 7/7 命中 ±1px
```

**过程中发现真 bug（结构在、功能死）**：`selection-toolbar` 场景首采得到
`{w:0, h:0, visible:false}` —— 元素在、10 个按钮在，但 `display` 恒为 none。

- 根因：`position()` 内部调用 `view.coordsAtPos()`，而 **CodeMirror 6 禁止在 update 周期内
  读取布局**（抛 `Reading the editor layout isn't allowed during an update`）。
  异常被 `getAnchor` 的 `catch` 吞掉并返回 `null` → 立即 `hideEl()`；
  `visible=false` 之后 `update()` 不再重定位 → **浮动工具栏永不显示**。
- 实测确认：程序化选区与**真实鼠标拖拽选区**（`sel=[0,2]` 非空）均为 `display:none`。
- 影响面：`P0-SHELL-003` 的 `AUTO` 状态曾把它当作已闭环 —— 实际上 V7-W2.4 这个
  Typora 对齐功能**完全不可用**。此前无任何测试覆盖（单测只测了纯函数
  `shouldShowToolbar`），是典型的「有测试但不工作」。
- 修复：`selectionToolbar.ts` 新增 `schedulePosition()`，把定位推迟到 update 周期之外
  （`requestAnimationFrame`；无 rAF 环境退化为同步定位以兼容单测），`destroy()` 取消待执行帧。
- 修复后实测：`{x:83.5, y:31, w:300.7, h:34}`，`visible=true`。
- 回归防线（两道）：
  1. `tests/parity/verify-shell-widgets.mjs` 静态契约 —— 禁止 `showEl()` / `update()`
     同步调用 `position()`，含 canary；**已做真实注入验证**（改回 `this.position()` 即被拒）。
  2. `tests/visual/scenes-golden.mjs` 硬断言 `selection-toolbar.visible === true`
     （防止把「不可见」烘进基准成为永久假绿）。

> 教训（可复用）：**Golden 采样必须配「实测 vs 期望」硬断言**。
> 若只做基线 diff，首跑就会把一个真 bug 的状态固化为基准，之后永远绿。

### 2.16 原生性能基准首轮结果（macOS，权限已生效）

本机权限状态已分层确认：

```sh
./tests/benchmark/bin/screen-timing check
# {"accessibility":true,"ok":true,"screenRecording":true}
```

注意：`screen-timing` helper 已取得 Accessibility + Screen Recording，但当前 WorkBuddy
shell 内的 `osascript → System Events` 仍返回 `-10004`；因此性能 runner 能测到窗口帧，
但涉及 `System Events` 读窗口坐标 / 激活窗口 / 合成输入的部分仍会部分失败。这是**宿主 shell
的 TCC 上下文**与 helper 权限不一致，不把「helper ok」误报成完整原生 GUI 已解锁。

已启动全量 `run-benchmark.mjs --app both --all`，首轮结果如下（Typora 侧已跑完，Mellow
侧因 runner 进入前置失败而未形成可比报告）：

| Typora 夹具 | open-to-editable median / P95 | typing P95 | scroll FPS | 备注 |
|---|---:|---:|---:|---|
| 1MB | 1216.5 / 1291.9 ms | 47.60 ms | 57.0 | search 的 ScreenCaptureKit 启动偶发失败；save 读坐标失败 |
| 5MB | 579.3 / 717.8 ms | 超时 8 次 | 57.3 | 大文档 typing 超时 |
| 10MB | 585.0 / 619.9 ms | 超时 8 次 | 57.3 | 大文档 typing 超时 |
| 100k-lines | 546.1 / 595.1 ms | 超时 8 次 | 57.6 | 大文档 typing 超时 |
| large-table | 1121.0 / 1361.3 ms | 74.55 ms | 57.4 | save 失败 |
| 100-mermaid | 6328.7 / 6538.3 ms | 93.90 ms | 57.5 | Mermaid 打开明显较重 |
| 1000-images | 1320.3 / 1441.7 ms | 229.48 ms | 57.5 | 图片 typing 明显较重 |

首轮没有形成正式 Mellow vs Typora 结论，**不写入 PASS-E**。同时修复了 runner 的一个
环境可复现问题：结尾恢复夹具使用硬编码 `node generate-fixtures.mjs`，在本机 shell 内
`node` 不在 PATH，导致 Typora 阶段完成后整体失败；已改为使用当前 Node 的绝对路径
（`${process.execPath} generate-fixtures.mjs`）。

随后用修复后的 runner 完成一轮正式的 **Mellow vs Typora（N=3）**打开 / 滚动对照，报告：
`tests/benchmark/reports/2026-09-12T09-04-16-mellow-vs-typora.md`。

| 夹具 | Mellow open median / P95 | Typora open median / P95 | Mellow scroll P95 / FPS | Typora scroll P95 / FPS |
|---|---:|---:|---:|---:|
| 1MB | 1289.2 / 1306.4 ms | 1326.9 / 1347.3 ms | 18.4 ms / 57.6 | 18.9 ms / 57.8 |
| 10MB | 1109.7 / 1545.8 ms | 428.1 / 500.2 ms | 19.0 ms / 57.3 | 18.5 ms / 57.7 |

- 1MB 打开：Mellow 中位数约为 Typora 的 **0.97×**，滚动接近且均无掉帧。
- 10MB 打开：Mellow 中位数约为 Typora 的 **2.59×**，P95 为 1.5458s；滚动仍约 57 FPS。
- 该结果是**冷启动带文件**口径；PRD 的 1MB ≤250ms 是热打开口径，不能混判。
- 10MB 性能已暴露真实优化项，但本轮不擅自重写大文件架构；`P0-PERF-001` 保持 `MAC`，不升 PASS-E。

单独输入延迟测量（当前 runner 的 ScreenCaptureKit 校准只得到 1 个有效样本、其余为 timeout，
因此不作为正式 P95）：1MB Mellow 256.87ms、Typora 256.38ms；两侧均 8/9 timeout，
说明该指标当前更像测量管线问题，需先修 helper / ROI 校准后再用于发布判定。

### 2.15 功能存活扫描（25 项，全部存活）

浮动工具栏那个 bug 属于「结构在、功能死」，而现有护栏抓不到 —— 故新增
`tests/e2e/feature-liveness-verify.mjs`，把**现有 e2e 未覆盖**的特性逐项走真实命令路径，
确认它们真的产生效果。**结果 25/25 全部存活，未发现第二个同类缺陷。**

```sh
NODE_PATH=/tmp/pw/node_modules node tests/e2e/feature-liveness-verify.mjs   # 25/25 ✅
```

覆盖：水平线 / TOC / 插入表格 / 脚注 / 高亮 / 注释 / YAML Front Matter /
引用块·列表·任务（菜单命令 `format.*`）/ 数学块 / Mermaid / 代码块 / 任务勾选 /
标题升降 / 行移动 / 代码块语言标签 / Mermaid 渲染 / 行内数学 / Wikilink /
**Focus Mode（变暗节点出现与消失）** / Typewriter / **拼写检查开关真实改变
`contentDOM` 的 `spellcheck` 属性** / 链接引用占位。

> **拼写检查的重要澄清**：`edit.spellcheck.toggle` 实测把 `.cm-content` 的
> `spellcheck` 从 `true` 翻到 `false`，即**系统拼写检查（红色下划线）已真实接线并可调**。
> 因此 `P0-EDITOR-005` 的缺口比台账原描述更窄：缺的是**词典与右键建议列表**
> （需 host-api 扩展），而非「拼写检查本身不工作」。

**取证纪律（本轮 6 处首跑失败的处理）**：失败不得直接改断言。逐个查证后，
6 处**全部是我的断言/测试设置写错**，实现均正确：

| 首跑失败项 | 查证结论 |
|---|---|
| 水平线 / TOC | 断言多余地要求尾随换行；TOC 实际输出小写 `[toc]` |
| `insert.quote/list/task` 输出 `hello> ` | 这三条是 **Slash 专用**命令（W1.3 已从段落菜单移除，`execute` 为 `replaceSlashTrigger`），不能用菜单语义断言 → 改用真正的菜单命令 `format.*` |
| 标题升降方向相反 | Typora 语义是 headingUp = **提升**（`#` 更少）；我的期望写反了 |
| 代码块语言标签 `nodes=0` | 光标在围栏起始行时标签**有意隐藏**（`selectionTouchesOpenLine`）；需把光标移到围栏外 |
| `format.referenceLink` 输出畸形 | 既定行为是「插入 `[][n]` 占位 + 定义」（有单测为证），不是「行内链接转引用」；我的期望错了 |

可复用结论：`insert.quote / insert.list / insert.task` 等带 `presentation.slash` 的命令
**不能按菜单点击语义测试**（无 slash 触发点时只会在光标处插入裸前缀）。

### 2.17 原生体验门禁复测结果（授权上下文仍分裂）

虽然 `screen-timing check` 已返回：

```json
{"accessibility":true,"ok":true,"screenRecording":true}
```

但 WorkBuddy shell 内的 AppleScript 仍返回 `System Events -10004`。因此需要 `System Events`
的脚本仍未真正解锁：

- `ime-matrix.mjs --scenario=paragraph`：0/1，通过 helper 的焦点路径后，输入与保存仍依赖
  `System Events keystroke`，最终 `重试耗尽`；不是把失败误判成 IME corruption。
- `golden-journeys.mjs --app mellow --journey 1,6`：失败，日志连续出现 `-10004`，Latin input
  读回为空；同时已确认原先默认 bundle 路径不存在的问题已修复（现在 release App bundle
  已生成于 `target/release/bundle/macos/Mellow.app`）。
- `clipboard-cross-app.mjs`：**C1/C2 通过，C3 失败**。C1 富文本 MIME 存在；C2
  Mellow → TextEdit 的 Markdown 读回精确一致；C3 TextEdit → Mellow 期望纯文本
  `Pasted from TextEdit plain`，实际仍读回上一阶段 Markdown `Hello **bold** world`。
  该结果暂定为**跨应用清空 / TextEdit 纯文本输入阶段未生效**，尚不能归因于 Mellow
  Smart Paste 实现；需在完整 System Events 上下文下重跑并补录，`P0-CLIPBOARD-001/002`
  不升 PASS-E。

这次复测确认「helper 权限已授权」与「执行该 helper 的 WorkBuddy shell 获得
System Events Apple Event 权限」是**两个独立权限上下文**；前者通过不代表后者通过。

## 3. 未能执行的部分（明确受阻，不伪造）

**GUI 自动化被 macOS TCC 拦截**：

```sh
osascript -e 'tell application "System Events" to get name of first application process'
# ❌ 40:44: execution error: “System Events”遇到一个错误：发生权限违例。 (-10004)
# （首轮记录为 -609「连接无效」，复测为 -10004「权限违例」，同属 TCC 拦截）
```

- `osascript` 本身可用（基础命令正常返回），但**涉及 System Events 的调用被拒绝**。
- 直接后果：**依赖原生 App 界面操控**的验证无法执行：
  - `tests/benchmark/run-benchmark.mjs`（Mellow vs Typora 性能对比：启动应用、打字、窗口 ROI）
  - `tests/benchmark/ime-matrix.mjs`（原生 IME 矩阵 / 连续 20 分钟写作）
  - `tests/benchmark/golden-journeys.mjs`、30 个核心计时任务、UX Score 100 分表
  - 跨应用剪贴板（7 应用）、Typora 用户盲测
- **已通过替代路径取得的部分**：Playwright 类 e2e 与视觉 Golden 不依赖 System Events，
  已全部完成（§2.8 / §2.9）；IME 合成经 CDP 路径取得运行时证据（§2.10）。
- **仍属缺口**：性能对比、原生 IME 面板交互、连续写作稳定性、计时与 UX Score、盲测。
- **解锁方式**（需用户操作）：系统设置 → 隐私与安全性 → 辅助功能，为运行本会话的终端/宿主应用
  勾选授权；随后可重跑上述脚本。在此之前这些项**只能保持 NOT_TESTED / MAC，不得标为通过**。

## 4. 结论

| 维度 | 状态 |
|---|---|
| 规范基线（Typora 1.14.9/7785 在本机且与 dump 一致） | ✅ 已验证 |
| macOS 构建链（前端 + release + 指纹 + 启动） | ✅ 已验证 |
| macOS 逻辑正确性（83 Rust + 1613 jest + 14 护栏 + 类型检查 0 错误） | ✅ 已验证 |
| macOS e2e（8 个既有脚本 + 1 个新增 IME 脚本） | ✅ 已验证（本轮新增） |
| macOS 视觉 Golden（**§9.3 14 场景全覆盖**：6 布局配置 + 4 侧栏视图 + 7 新增场景 + window chrome） | ✅ 已验证（本轮新增） |
| macOS 浮动编辑器工具栏（V7-W2.4）真实可见 | ✅ **修复后**已验证（本轮发现并修复永不显示 bug） |
| macOS IME 合成正确性（CDP 路径） | ✅ 已验证（本轮新增；原生面板交互仍缺） |
| 官方快捷键真值（55 条，护栏锁定） | ✅ 已验证（本轮新增） |
| macOS **体验** Gate（性能对比 / 原生 IME 面板 / 30 计时 / UX Score / 盲测） | ⛔ **受阻**（System Events -10004） |

Release Gate 判定仍为 **NO-GO**，未闭环 6 项（见 `verify-release-gate.mjs` 输出）：

| 项 | 状态 | 未闭环原因 |
|---|---|---|
| `P0-EDITOR-004` IME 与 Undo/Redo | MAC 仅单平台 | 已有 unit + CDP 合成证据；缺 windows-ci / linux-ci 与原生 IME 面板交互 |
| `P0-PERF-001` 大文件与交互性能 | MAC 仅单平台 | 性能对比需 System Events 驱动原生 App，受阻；缺 benchmark 与 CI 证据 |
| `P0-PLATFORM-001` 三平台 Runtime 门禁 | IMPL | 依赖 `windows-ci` / `linux-ci` Runtime 证据；`ci.yml` 的 Windows 契约 job 本轮已补（见文末），但 **Runtime 级**（打包/安装/输入交互）Windows 证据仍只在手动触发的 `runtime-qualification.yml` |
| `P0-QA-001` UX Score 与 30 个核心任务 | NOT_TESTED | 计时任务需界面操控，受阻 |
| `P0-EDITOR-005` 拼写检查词典与建议 | BLOCKED | 需 host-api 扩展后补齐（D-S） |
| `P0-LAYOUT-002` 三平台视觉 Golden（14 场景） | BLOCKED | **macOS 侧 14 场景已全覆盖**（§2.14：新增 `scenes-golden.mjs` 补齐 7 个）；**Windows / Linux 仍无任何场景归档**（`PENDING_REAL_MACHINE`），且 Golden 基线为 macOS 测量值，跨平台需各自基线 |

> **结构性缺口（本轮发现并已修复）**：`ci.yml` 原 6 个 job **全部** `runs-on: ubuntu-latest`，
> **没有任何 Windows job**。这与 ADR-0022「Windows 以 GitHub Actions 为正式 Runtime 证据来源」
> 存在落差 —— 台账中 **47 项**要求 `windows-ci` 证据，此前却只有 `workflow_dispatch` 手动触发的
> `runtime-qualification.yml` 能产出，常态门禁完全缺失。
>
> 处置：新增 `windows-parity-guard` job（`runs-on: windows-latest`），跑与 `parity-guard`
> 同源的纯 Node 契约链（无需 pnpm install、不构建 Rust，快速且低 flake）。
> 它验证「契约在 Windows 的路径分隔符 / 换行 / Node 行为下同样成立」。
> 并在 `verify-release-gate.mjs` ③ 节立**不变量**：`ci.yml` 必须含 `windows-latest`，
> 否则门禁直接失败（已 canary 验证：改回 ubuntu 即被拒）。
>
> **仍属缺口、未纳入**：Windows 打包矩阵、安装/卸载/更新、SendKeys 输入交互
> （由 `runtime-qualification.yml` 的 `windows-runtime` 承担）；Windows 上的**单测**
> 亦尚未在 CI 执行（本 job 有意只跑契约链）。
>
> **首次运行需确认**：该 job 为首次在 Windows runner 上执行，CI 会给出真实结论；
> 若失败即说明存在 Windows 特有的路径/换行问题，属真实发现而非噪音。
