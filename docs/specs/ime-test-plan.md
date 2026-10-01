# IME Test Plan

## 1. 目的

中文 IME 是 Mellow V1 Release Gate。

> **2026-10-01 载体核对（正向确认）**：本节声明在台账里由 **`P0-EDITOR-004`** 承载
> （capability = 「**IME 与 Undo / Redo**」），其 `requiredEvidence` = `unit` / `macos` / `windows-ci` /
> `linux-ci` / **`ux-gate`** ⇒ 按 ADR-0024 Q1=A3，**含 `ux-gate` 的项不得以 `AUTO` 收口**，
> 当前确实计入未闭环 ✓。§8 的四条禁令（丢字 / 重复 / blocker caret / undo corruption）
> 也由它的证据覆盖（Linux 矩阵逐场景断言「无丢字重复 + 保存读回一致 + Undo 后归零」）。

---

## 2. 平台

### Windows
- Microsoft Pinyin
- Sogou Pinyin

### macOS
- system Simplified Chinese Pinyin
- Wubi

### Linux
- fcitx5 Pinyin
- ibus Pinyin

非 V1 功能承诺：
- Japanese、Korean 及其他语言输入法仅可作为兼容性观察，不属于 Release Gate。

> **⚠️ 2026-10-01 覆盖实测：本表 6 个输入法，实际只有 1 个在 CI 内常态覆盖。**
>
> | 平台 | 输入法 | 载体 | 在流水线里跑吗 |
> |---|---|---|---|
> | Windows | Microsoft Pinyin | **无** | — |
> | Windows | Sogou Pinyin | **无** | — |
> | macOS | 系统简体拼音 | `tests/benchmark/ime-matrix.mjs`（断言丢字 / 重复 / caret blocker / undo corruption） | **否** —— 本地工具，需 System Events 权限 |
> | macOS | 五笔 Wubi | **无** | — |
> | Linux | fcitx5 | `tests/benchmark/ime-matrix-linux.mjs`（8 场景） | **是** —— 每次发版跑（Runtime Qualification） |
> | Linux | ibus | runner **支持** `--im=ibus`（`GTK_IM_MODULE=ibus`），但**从未跑过** | 否 |
>
> ⇒ **4 个输入法零覆盖**（Microsoft Pinyin / Sogou Pinyin / Wubi / ibus），
> 它们只能依赖 §7 的人工 Gate（而人工 Gate 的任务清单里**没有输入法项**，见 §7 的注）。

---

## 3. 基础输入

每个输入法测试：

- continuous sentence
- punctuation
- mixed Chinese/English
- emoji
- candidate selection
- backspace during composition
- arrow during composition
- cancel composition

> **⚠️ 2026-10-01 覆盖实测：上列 8 类里，自动化只覆盖了 2 类。**
>
> - **已覆盖**：`continuous sentence`、`candidate selection`
>   （矩阵按「四音节 → 逐音节空格提交候选 1」施加，并断言无丢字重复 / 保存读回一致 / Undo 后归零）。
> - **零覆盖（6 类）**：`punctuation`、`mixed Chinese/English`、`emoji`、
>   **`backspace during composition`**、**`arrow during composition`**、**`cancel composition`**。
>
> ⚠️ 其中**后 3 类**（组合中退格 / 组合中方向键 / 取消组合）恰是 **IME 缺陷高发路径**，
> 而它们**既不在自动化矩阵里、也不在人工 Gate 的任务清单里** —— 属**真实覆盖缺口**，
> 已在审计 §4.70 登记（**未**在本次补测）。

---

## 4. Node Matrix

- paragraph
- heading
- bold
- italic
- strike
- inline code
- link
- image alt
- list
- task
- quote
- code fence
- table
- inline math
- block math
- Mermaid source
- YAML
- search
- rename
- command palette
- slash menu

> **矩阵覆盖节点（机器可读）**：`paragraph` `heading` `format` `list` `table` `code` `math` `link`
>
> **⚠️ 2026-10-01 实测**：`tests/benchmark/ime-matrix-linux.mjs` 的 `SCENARIOS` 覆盖**上列 21 个节点中的 8 个**
> （即上一行的 8 个 id）。注意**矩阵 id 与本节节点名不是 1:1**：
> `format` 对应 bold / italic / strike / inline code，`code` 对应 code fence，`math` 对应 inline / block math。
> 其余 **13 个节点**（image alt / task / quote / Mermaid source / YAML / search / rename /
> command palette / slash menu 等）**无自动化覆盖**。
>
> 上一行「矩阵覆盖节点」由护栏 `verify-runtime-qualification-workflow.mjs` 与矩阵的 `SCENARIOS`
> **双向锁定** —— 矩阵增删场景而不更新本行 ⇒ 护栏失败；本行改了而矩阵没改 ⇒ 同样失败。

---

## 5. 必须验证

- no lost char
- no duplicated char
- no caret jump
- no premature slash commit
- no unexpected marker hide
- no undo corruption
- no full editor remount

---

## 6. Composition Event Logging

Debug build 可记录：

- compositionstart
- compositionupdate
- compositionend
- beforeinput
- input
- selectionchange
- CM transaction

Release build 不收集用户文本。

> **2026-10-01 实测**：组合事件由 `packages/editor-engine/src/composition.ts` 处理；
> 自动化探针是 `tests/e2e/ime-composition-verify.mjs`。
> 「Debug build **可**记录」是**允许性**条款（不是强制），当前**未实现**专门的组合事件日志设施；
> 「Release build 不收集用户文本」因此**平凡成立** —— 全仓**不存在任何把用户文本送往外部/日志的通道**。
> ⚠️ **本节的隐私条款没有护栏**：若将来加入调试日志设施，必须**同时**加一条
> 「release 构建不得收集用户文本」的判据 —— 否则这条只写在散文里的约束会静默失效。

---

## 7. Automated + Manual

自动：
- event sequence tests
- regression fixtures

手工：
- 真输入法
- 真候选窗
- 真实平台

IME 不允许只靠自动化测试通过。

> **2026-10-01 载体核对（一半成立、一半是缺口）**：
>
> **✅ 有载体的一半**：人工侧载体是 `tests/qualification/ux-gate-recorder.mjs` ——
> 它有 `caretImeUndo` 评分模块（**15 分**），并**强制** `imeCorruption` 字段明确记录为 `false`，
> 门槛是「Caret / IME / Undo 必须 = **15/15**」。台账 `P0-EDITOR-004` 的 `requiredEvidence` 亦含 `ux-gate`。
> ⇒ 「不允许只靠自动化」这条**确实有机器可读的载体** ✓。
>
> **⚠️ 缺口的一半**：该记录器的 **30 个任务里没有任何一项提到输入法**
> （最接近的是「Focus Mode 连续写作」/「Typewriter Mode 连续写作」）——
> 它只提供「**评分**」与一个**布尔字段**，不枚举 §2 的「平台 × 输入法矩阵」，也不枚举 §3 的 8 类基础输入。
> ⇒ 即 **§2 / §3 的验证范围只写在本 spec 里**，两处载体都没有枚举它
> —— 属「**关键约束只在散文里**」（与 ADR-0029 Q1 的 `settings.open` 同型）。
> 已在审计 **§4.70** 登记；**本次未**扩张人工 Gate 的任务清单（那会改变人工会话的负担，需单独裁决）。

---

## 8. Gate

任何平台存在：
- 丢字
- 重复
- blocker caret
- undo corruption

=> V1 禁止发布。
