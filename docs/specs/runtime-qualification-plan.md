# Runtime Qualification Plan

## 1. 目的

决定 Mellow 是否正式锁定 Tauri 2。

核心原则：

> 体验优先于安装包体积。

---

## 2. 候选

A. Tauri 2
- Windows WebView2
- macOS WKWebView
- Linux WebKitGTK

B. Electron/Chromium
- fallback

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

全部满足：

- IME corruption = 0
- no blocking caret bug
- no selection loss
- clipboard P0 complete
- PDF/print viable
- 10 MB editable
- typing P95 target met
- Linux P0 journeys pass
- no platform requires editor fork

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

---

## 8. Decision Deadline

必须在：
- V0.0 结束
- V0.1 完整 UI 开发开始之前

锁定。

禁止：
- V0.3 后才决定换 Runtime

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
> | **platform issue list** | ❌ **不存在** —— 全仓无此文件。最接近的是 `docs/qualification/runtime-matrix-evidence-2026-08-18.md`（三平台矩阵证据）与各期审计的「缺陷清单」，但它们不是**按平台聚合的问题清单** |
> | pass/fail table | ✅ 有（`tests/qualification/README.md` 的门禁表）—— ⚠️ 其**数字曾长期过期**（护栏写 14 实际 17、editor-engine 写 1135 实际 1277），已于 2026-10-01 刷新 + 加护栏锁定 |
> | 「ADR-0002 final decision」 | ⚠️ **引用过期** —— 最终决策落在 **ADR-0019**（`ADR-0019-runtime-final-decision.md`，Accepted），它**取代了 ADR-0002**（ADR-0002 原文为 Conditional）。本行原写「ADR-0002 final decision」是**当时的预期载体**，实际由 ADR-0019 承担 |
>
> **结论**：§9 的四个输出物里 **3 个存在、1 个（platform issue list）从未产出**。
> 该缺口属**文档性缺口**（不影响代码正确性），如实登记；若要补，应作为**独立产出**（按平台聚合的问题清单），
> 而不是从审计文档里拼凑 —— 否则会产生一个「看起来有、实际是转述」的清单。
