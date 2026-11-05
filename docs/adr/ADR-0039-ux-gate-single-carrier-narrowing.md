# ADR-0039 — UX Gate 策略收窄：人工体验 Gate 集中于 `P0-QA-001` 单点承载

**Status:** **Accepted**（2026-11-03，**用户裁决**「收窄：仅 P0-QA-001 需要人工 Gate」）—— 已裁决并生效。

**取代：** ADR-0024 的 **Q2 = B1**（ux-gate **逐项**前置）的残余效力，并把 **Q1 = A3** 的适用范围收窄为「仅 `P0-QA-001` 自声明 ux-gate」。ADR-0024 原文**保留为历史记录**（统一规则 16：不改写旧 ADR 结论，本 ADR 追加）。

## 背景

ADR-0024（Accepted 2026-09-30）定了两条与人工 UX Gate 相关的口径：

- **Q2 = B1**：ux-gate 证据**逐项**前置 —— 每个 P0 项的 `requiredEvidence` 都写了 `ux-gate`，
  且门禁全局要求「标 `PASS-E` 必须含 `ux-gate`」。
- **Q1 = A3**：标 `AUTO` 但 `requiredEvidence` 含 `ux-gate` 的项**不得以 AUTO 收口**（防止
  §5.7 前科同型漏洞：`P0-SHELL-003` 把不可用功能当闭环）。

实际效果（2026-11-03 实测）：`ux-gate` 是**聚合型人工会话**（30 个计时任务 + UX Score ≥92，
对照 Typora 同机执行），它**天然只有一个合理承载点** —— `P0-QA-001`。把它抄进 50 项的
`requiredEvidence` 造成 **10 项未闭环里有 6 项**（`P0-EDITOR-001/003/004`、`P0-SHELL-001`、
`P0-MENU-001`、`P0-LAYOUT-002`）的**唯一阻塞原因就是这条全局策略**：它们的自动化/CI/视觉证据
**已全部取得**（如 `P0-EDITOR-004` 的 Linux IME 矩阵 8/8、Windows Source Fidelity + runtime
smoke、macOS launch —— v1.5.14 run 35635085958；`P0-LAYOUT-002` 的三平台视觉基线已入库并
受护栏保护）。重复声明让台账**失去区分度**（「还缺什么」被策略噪声淹没），这正是 ADR-0024
自己在 Q2 备选里记过的「状态码误导」问题的放大形态。

先例：`P0-PLATFORM-001` 在 2026-10-01 已按同一逻辑处置（三平台证据齐备 ⇒ 改 `AUTO` 并
**移除** `requiredEvidence` 中的 ux-gate 与 blockedBy）—— 本 ADR 把该处置**一般化**。

## 选项

- **B1 维持逐项前置**（现状）：继续 6 项「证据齐备但被同一策略挂着」；未闭环数与真实缺口脱钩。
- **B2 全局删除 ux-gate**：连 `P0-QA-001` 也不要求 ⇒ 30 任务人工会话失去机器可读载体。**否** ——
  人工体验 Gate 是 PRD §110/master-plan §8 V1.0 Exit Gate 的明确要求，只能**集中**、不能**删除**。
- **C 收窄至单点（裁决 = C）**：`ux-gate` 仅由 `P0-QA-001` 声明与承载；其余项的
  `requiredEvidence` 移除 ux-gate；A3 规则**保留**（对 QA-001 恒适用），全局「PASS-E 必须含
  ux-gate」断言废除（PASS-E 的定义改由 §4.3 状态词表承载：三平台证据 + 体验结论以 `P0-QA-001`
  为总前提）。

## 裁决与依据（C）

**用户 2026-11-03 拍板：收窄 —— 仅 `P0-QA-001` 需要人工 Gate。**

理由：
1. 人工体验会话是**聚合验收**（一次会话覆盖 30 个跨域任务），逐项声明不增加任何证据信息，
   只把 6 项已挣得平台证据的项**人为挂起**。
2. 「就绪度声明必须由证据挣得」原则**不变**：收窄后 `PASS-E` 仍要求三平台证据组齐备；
   且**发布层面**的人工 Gate 结论仍由 `P0-QA-001` 单点阻塞（其 `NOT_TESTED` +
   `blockedBy: human-ux-gate-session` 原样保留）⇒ **门禁对「人工体验是否验收过」的回答
   没有变宽**，只是从 50 个噪声点收敛为 1 个真信号点。
3. A3 的防「自声明需人工门禁却以 AUTO 收口」护栏**不删除**：只要项声明 ux-gate 仍不得 AUTO
   收口。收窄实现为「除 QA-001 外无人声明」，而非「规则作废」⇒ 若将来某项确实需要逐项人工
   门禁，机制仍然可用（诚实登记即可）。

## 落地（同批次执行，机器可读）

| 位置 | 改动 |
|---|---|
| `tests/parity/typora-parity-ledger.json` | `P0-EDITOR-001` / `P0-EDITOR-003` / `P0-SHELL-001` / `P0-MENU-001`：`requiredEvidence` 移除 `ux-gate`、删除 `blockedBy: ux-gate-policy`（AUTO 收口恢复）。`P0-EDITOR-004`：`MAC → AUTO` + 同上（三平台运行时证据 2026-09-22 已取得）。`P0-LAYOUT-002`：`BLOCKED → AUTO` + 删 blockedBy（三平台视觉基线已入库）。`P0-PERF-001`：保留 `MAC`，`blockedBy` 改为**真实剩余缺口** `perf-harness-pending`（去掉 ux-gate 分量）。`P0-QA-001`：**不动**（唯一 ux-gate 声明项）。新增 `P0-MARKDOWN-006`（ADR-0035 CJK 强调语义，`ABSENT`）⇒ P0 项数 50→51。 |
| `verify-release-gate.mjs` | PASS-E 的全局 `ux-gate` 必含断言**移除**（三平台证据组断言保留）；`closedViaAuto`（A3）**保留**，注释写明 ADR-0039 收窄语义。 |
| `verify-parity-ledger.mjs` | `LEDGER_P0_BASELINE` 50→51；对门禁源码的字符串锁同步（Closure basis / ux-gate 断言形态）。 |
| 审计登记表 | 新增第 22 行（本 ADR 的载体记录）；第 1 行处置追加 ADR-0039 对 Q1/Q2 的取代说明。 |
| master-plan | 「当前状态真值源」行的 `PASS-E` / 未闭环 / 待裁决计数**按现算更正**。 |

## 后果（如实）

- 未闭环（noGo）从 **10 → 5**：`P0-PERF-001`（MAC，perf harness 未完）/ `P0-EXPORT-001`
  （IMPL，ADR-0037 A2 待施工）/ `P0-EDITOR-005`（IMPL，拼写检查 runtime 待核）/
  `P0-QA-001`（NOT_TESTED，人工会话本身）/ **`P0-MARKDOWN-006`（新增，ABSENT，ADR-0035 待施工）**。
- **`PASS-E` 仍为 0**：本 ADR 不升格任何项的**结论等级**（PASS-E 需要三平台证据 + 体验结论，
  后者集中待 `P0-QA-001`）；收窄改变的是「哪些项因策略噪声被挂起」，不是「什么算验收通过」。
- §8 V1.0 Exit Gate 的「全 PASS-E」要求**不变**（那是完成度口径，与本门禁口径正交）。

## 验证

- `node tests/parity/verify-release-gate.mjs`：未闭环 5 项（逐一为真实缺口）、`PENDING_ADRS` = ADR-0040。

> **⚠️ 更正（2026-11-05，批次 A35）**：上行是 2026-11-03 的实跑记录（历史保留）。现算 **4 项未闭环**
> —— `P0-MARKDOWN-006`（ADR-0035 = A1）已于批次 A35 落地转 `AUTO`（审计 §4.354）；`PENDING_ADRS` 不变（仍 ADR-0040）。
- `node tests/parity/verify-parity-ledger.mjs`：基线 51 通过；ux-gate 声明项 = 1（仅 QA-001）。
