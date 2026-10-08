# Runtime Qualification Plan

## 1. 目的

决定 Mellow 是否正式锁定 Tauri 2。

核心原则：

> 体验优先于安装包体积。

> **2026-10-01 状态**：本节的问题**已回答** —— `ADR-0019`（Accepted，取代 ADR-0002）**锁定 Tauri 2**，
> 并保留 Electron 作为**预案**（该 ADR 标题即「Tauri 2 锁定 + Electron 预案」）。
> ⚠️ 但**决策依据与本 spec §6 的门禁不一致** —— 那是本节唯一的「未如实之处」，详见 §6 的更正块。

---

## 2. 候选

A. Tauri 2
- Windows WebView2
- macOS WKWebView
- Linux WebKitGTK

B. Electron/Chromium
- fallback

> **2026-10-01 状态**：**A（Tauri 2）已锁定**；**B 作为预案保留**，其可行性由架构约束守护 ——
> `AGENTS.md` 架构细则「**不允许 Editor Core 直接依赖 Tauri**（经 Host Adapter 隔离，保 Electron fallback 可行）」
> + 护栏 `tests/parity/verify-adapter-contract.mjs`（core 包平台中立 / 桥链路锚定 / 漂移 canary）。

---

## 3. 测试原型

只做最小 Editor Shell：

- MarkEdit CoreEditor
- Live heading
- bold
- list
- table
- math
- Mermaid
- clipboard
- file open/save

不要先做完整 UI。

> **2026-10-01 状态：本节是 V0.0 期的阶段要求，已完成、不再有效。**
> 「只做最小 Editor Shell、不要先做完整 UI」描述的是 **Runtime Qualification 原型阶段**；
> 该阶段早已结束（三平台矩阵执行完毕，决策落在 ADR-0019），此后项目进入完整 UI 开发。
> 保留原文仅为追溯 —— **不要**把本节当成当前的工作约束。

---

## 4. 平台矩阵

**证据环境：** macOS 使用本机实机；Windows／Linux 使用 GitHub Actions 对应平台 runner（ADR-0022）。Windows／Linux 不再要求人工真机补测；CI 的无交互桌面限制需记录，但不构成缺失证据。

### Windows
- Windows 10
- Windows 11
- x64
- Microsoft Pinyin
- Sogou Pinyin

### macOS
- Apple Silicon
- current supported macOS
- system Pinyin

### Linux
- Ubuntu LTS GNOME
- Fedora KDE/GNOME
- fcitx5
- ibus

---

> ## ⚠️ 2026-10-01 复核：本节的矩阵与 §5 的必测项目**未与 ADR-0022 同步**
>
> **背景**：本节的写法是 **V0.0 期（决定 Tauri vs Electron）**的口径。其后 **ADR-0022（Accepted）**
> 明确取代了 ADR-0019 §3 中「Windows／Linux 必须以人工真机回填」的证据要求，并规定
> 「CI 的无交互桌面限制**必须如实记录**……在本 ADR 的 V1 范围内**不再要求**以人工 Windows／Linux
> 机器补齐」。**但本节与 §5 一直没改** —— 读起来仍像 Fedora / ibus / Windows 10·11 区分 /
> Sogou·Microsoft Pinyin / dead keys 等**都是要求**。
>
> **CI 实际覆盖 vs 本节要求的差集**（`.github/workflows/runtime-qualification.yml` 实读，如实列出
> **没有任何证据**的项）：
>
> | 本节要求 | CI 实际 | 差集（无证据） |
> |---|---|---|
> | Windows 10 **与** 11 | 仅 `windows-latest`（单一版本） | Windows 10 与 11 的**区分** |
> | Microsoft Pinyin **与** Sogou Pinyin | Windows job 为 launch + SendKeys smoke（**无交互桌面**，仅诊断级） | 两个第三方输入法的真实面板交互 |
> | Linux：Ubuntu LTS GNOME **与** Fedora KDE/GNOME | 仅 `ubuntu-latest` | **Fedora（KDE/GNOME）完全未跑** |
> | Linux：fcitx5 **与** ibus | 仅 **fcitx5**（Xvfb 8 场景矩阵） | **ibus 完全未跑** |
> | macOS：Apple Silicon / system Pinyin | 本机实机 | ✅ 覆盖 |
> | §5 Input：ASCII / 中文 IME / 中英混排 / emoji / **dead keys** | IME 矩阵 8 场景覆盖前四项 | **dead keys 未覆盖** |
> | §5 Clipboard：plain / HTML / image / file / **TSV** | 剪贴板跨应用为**人工模板**（W7） | 跨应用矩阵整体未跑 |
> | §5 Performance：1MB / 5MB / 10MB / **100k lines** | 10MB 冒烟 + 本机 benchmark | 100k lines 无 CI 证据 |
>
> **处置（本轮）**：**保留原文**（历史口径可追溯）+ 追加本更正块 + 上面的差集表。
> **不删任何条目** —— 差集表本身就是「如实记录未覆盖项」的载体，删掉会让缺口从视野里消失。
> 若要**收窄**本节，属方案级裁决（需同时更新 ADR-0022 的后果节与 ledger 的 `requiredEvidence`）。

---

## 5. 必测项目

### Input
- ASCII
- Chinese IME
- Chinese / English mixed input
- emoji
- dead keys

### Caret
- click
- arrows
- word movement
- selection
- drag
- Home/End

### Composition
- heading
- bold
- list
- table
- link
- code
- math

### Clipboard
- plain
- HTML
- image
- file
- TSV

### Rendering
- CSS
- fonts
- Math
- Mermaid
- images

### System
- drag/drop
- file dialog
- open with
- print
- PDF
- zoom

### Performance
- 1 MB
- 5 MB
- 10 MB
- 100k lines

---

## 6. Tauri Pass Conditions

全部满足（**每条必须挂一个可解析的载体**，由护栏 `verify-runtime-qualification-workflow.mjs` 断言）：

- IME corruption = 0（`P0-EDITOR-004`）
- no blocking caret bug（`P0-EDITOR-003`）
- no selection loss（`P0-EDITOR-003`）
- clipboard P0 complete（`P0-CLIPBOARD-001`）
- PDF/print viable（`P0-EXPORT-001`）
- 10 MB editable（`P0-PERF-001`）
- typing P95 target met（`P0-PERF-001`）
- Linux P0 journeys pass（`P0-PLATFORM-001`）
- no platform requires editor fork（护栏：`tests/parity/verify-adapter-contract.mjs`）

> **⚠️ 2026-10-01 逐节复核（本节是一条「门禁」，而它从未被满足过）**
>
> **① 事实：ADR-0019 是在本节条件「未满足」时锁定 Tauri 的 —— 且它如实写了这一点。**
> `ADR-0019`（Accepted，取代 ADR-0002）的背景原文：
>
> > **真机体验矩阵（IME / Caret / Clipboard / Print / 10MB）在决策时点未取得完整实测数据**
> > （Windows / Linux 无真机环境，macOS 无 GUI 会话）。
> > 决策依据 = 架构证据（构建全绿、平台解耦证明、逻辑层 254 测试）+ 已知技术事实比较。
> > **无任何 FAIL 记录。**
>
> 而本节的措辞是「**全部满足**」才锁定 ⇒ **两者不一致**。
> **注意优先级**：按 `AGENTS.md`，spec 是 **P1**、ADR 是 **P2** —— 即**按本节，Tauri 本不该被锁定**。
> ADR-0019 的实际路径是「**架构证据 + 无 FAIL**」，**不是**本节的 9 条实测。
>
> **② 今天的逐条状态**（2026-10-01 实跑门禁；`AUTO` 且 `requiredEvidence` 不含 `ux-gate` 才算闭环，ADR-0024 Q3=A3）：
>
> | 条件 | 载体 | 状态 |
> |---|---|---|
> | IME corruption = 0 | `P0-EDITOR-004` | **未闭环**（`MAC`，等人工 `ux-gate`） |
> | no blocking caret bug / no selection loss | `P0-EDITOR-003` | **未闭环**（`AUTO` 但 `requiredEvidence` 含 `ux-gate`） |
> | clipboard P0 complete | `P0-CLIPBOARD-001` | ✅ 闭环 |
> | PDF/print viable | `P0-EXPORT-001` | ✅ 闭环 |
> | 10 MB editable / typing P95 target met | `P0-PERF-001` | **未闭环**（`MAC`，`ux-gate` + `perf-harness-pending`） |
> | Linux P0 journeys pass | `P0-PLATFORM-001` | ✅ 闭环 |
> | no platform requires editor fork | `verify-adapter-contract.mjs` | ✅ 护栏常态守护 |
>
> ⇒ **本节的「全部满足」至今仍未达成**（4 条未闭环），这与**当前状态真值源 = `tests/parity/verify-release-gate.mjs` 的输出**（全仓 `PASS-E = 0/50`）的结论一致。
> **但这不推翻 Tauri 锁定** —— 锁定的依据是 ADR-0019 的架构证据路径，本节只是**当时写的、从未满足的门禁**。
>
> **③ 处置**：**保留原文 + 挂载体 + 本更正块**。
> **不**把本节改成「已满足」（那是假的）；**也不**删除它（它记录了当时的判据）。
> 若要**收窄或重写**本节（例如改为「架构证据 + 无 FAIL」以对齐 ADR-0019 的实际路径），
> 属**方案级裁决** —— 需**新增 ADR** 说明，并同步 `ADR-0022` 的后果节与 ledger 的 `requiredEvidence`。
> **不在文档层擅自改**（`AGENTS.md`「冲突处理」：不要自行修改架构，先报告冲突）。

---

## 7. Fail Conditions

以下任意一项无法在合理成本内修复：

- Linux IME unstable
- WKWebView composition regression
- WebView2 clipboard blocker
- platform-specific editor logic proliferates
- PDF/print impossible to unify
- CodeMirror behavior diverges materially

则：

> 切 Electron/Chromium。

> **2026-10-01 逐条对账：6 条 fail condition 目前无一触发。**
>
> | fail condition | 现状 |
> |---|---|
> | Linux IME unstable | ⚠️ **曾是真实风险** —— Linux IME 矩阵自 run 58（2026-09-06）起**连续失败 4 次**；根因**全在 harness 侧**（code 场景探针坐标错误、Undo 验证被 Ctrl+A/C 读回污染观察窗口），修复后自 v1.5.14 起 **8/8** |
> | WKWebView composition regression | 无记录（macOS IME 矩阵断言无 corruption） |
> | WebView2 clipboard blocker | 无记录（Windows 为 launch + SendKeys smoke，**无交互桌面**；跨应用剪贴板矩阵未跑） |
> | platform-specific editor logic proliferates | ✅ 由 `verify-adapter-contract.mjs` 常态守护（core 包平台中立） |
> | PDF/print impossible to unify | 无记录（`P0-EXPORT-001` 已闭环） |
> | CodeMirror behavior diverges materially | 无记录 |
>
> ⚠️ **本节是「决策时点的判据」，不是持续门禁** —— 它**没有载体**，也没有任何机制在持续监视这 6 条。
> 尤其第 2 / 3 / 5 / 6 条：**「无记录」≠「已排除」** —— 那是**未被观测**，不是**已观测为否**。

---

## 8. Decision Deadline

必须在：
- V0.0 结束
- V0.1 完整 UI 开发开始之前

锁定。

禁止：
- V0.3 后才决定换 Runtime

> **2026-10-01 复核：截止条件已满足，但**无法被机器核对**。**
>
> - **时序上合规**：决策落在 **V0.0 结束时**（ADR-0019 背景自述「V0.0 Runtime Qualification 三平台矩阵执行完毕」），
>   远早于「V0.3 后才换 Runtime」的禁止线。
> - ⚠️ **不可核对**：「V0.0 结束」「V0.1 完整 UI 开发开始」这两个**里程碑没有定义处** ——
>   台账**无 milestone 字段**、仓库内**无对应标签**、**无登记**；且 **ADR-0019 自身没有日期**
>   （只有 `Status: Accepted`）。⇒ 这条截止条件**只能靠自述判断**，任何护栏都核对不了。
> - **处置**：如实登记；**不**补一个「看起来能核对」的假载体 —— 那只会制造新的失真。
>   （若要可核对，应先定义里程碑的机器可读形式，属流程裁决。）

---

## 9. 输出

最终形成：
- benchmark report
- platform issue list
- pass/fail table
- ADR-0002 final decision

> **2026-10-01 复核（逐项对账）**：
>
> | 输出物 | 现状 |
> |---|---|
> | benchmark report | ✅ 有（`tests/qualification/evidence/` 下的 perf 证据族，如 `2026-09-25-perf-hot-open-authoritative.md`） |
> | **platform issue list** | ✅ **有**（**2026-10-08 更正**，审计 §4.154）—— **载体是「章节」而不是「独立文件」**：`tests/qualification/README.md` 的 **「Platform Issue 记录」** 节（列名 `日期 / 平台 / 现象 / 影响 / 状态`，正是**按平台聚合的问题清单**），自 **2026-08-10**（commit `80603cc`）起就在。⚠️ 原判定写「❌ **不存在** —— **全仓无此文件**」：**「无此文件」成立、但结论「从未产出」不成立** —— 核对用的是**文件**粒度，而产物是**章节**粒度 |
> | pass/fail table | ✅ 有（`tests/qualification/README.md` 的门禁表）—— ⚠️ 其**数字曾长期过期**（护栏写 14 实际 17、editor-engine 写 1135 实际 1277），已于 2026-10-01 刷新；**2026-10-08 再次刷新**（审计 §4.153：`editor-engine 1277→1318` · `app-core 258→297` · `export 89→100`，合计 `1824→1915`），并**加护栏锁定「文件内自洽」**（护栏数量由 `verify-release-gate.mjs` 直接对账；**包用例数与合计**必须与「各包规模」这一**单一真值源**一致） |
> | 「ADR-0002 final decision」 | ⚠️ **引用过期** —— 最终决策落在 **ADR-0019**（`ADR-0019-runtime-final-decision.md`，Accepted），它**取代了 ADR-0002**（ADR-0002 原文为 Conditional）。本行原写「ADR-0002 final decision」是**当时的预期载体**，实际由 ADR-0019 承担 |
>
> **结论**：§9 的四个输出物 **4 个都存在**（其中 1 个以**章节**而非独立文件承载；1 个的**命名**与 ADR 现状不符）。
> ⚠️ **2026-10-08 更正（审计 §4.154）**：原结论写「3 个存在、1 个（platform issue list）**从未产出**」—— 那一条**是错的**（见上表）。
> 由此得到的通用教训：**「全仓无此文件」推不出「从未产出」** —— 产物可以以**章节 / 表格 / 代码符号**的形态存在；
> 核对「某输出物有没有」时，**扫描面必须同时含「文件名」与「文档章节标题」**（护栏已按此锁定，见 `verify-doc-code-refs.mjs`）。
