# ADR-0024 — 发布闭环语义：`AUTO` 是否阻断发布、`ux-gate` 是否逐项前置

**Status:** Proposed（2026-09-29）—— **待裁决，尚未生效**

> 本 ADR 由 AI 起草，用于把两项**方案级决策**从散文记录收敛为可裁决的形式。
> 按 AGENTS.md「决策变更：正确做法是新增 ADR」，故新增本文件而非改写 master-plan §8。
> **在状态变为 Accepted 之前，现有实现（门禁把 `AUTO` 视为不阻断）保持不动。**

## 背景

### 事实一：门禁口径与方案口径不一致（实跑）

```
$ node tests/parity/verify-release-gate.mjs
Release verdict: NO-GO：6 项未闭环
  Closure basis: 本门禁的「不阻断」口径 = PASS-E / PASS-B / AUTO；…
  实际 PASS-E = 0/50。
```

- `tests/parity/verify-release-gate.mjs` 把 `PASS-E` / `PASS-B` / `AUTO` 视为**不阻断**，
  故输出「6 项未闭环」。
- `docs/plans/typora-parity-master-plan.md` §4.3 定义 `AUTO` = 「自动化测试通过，
  **真机体验验收未完成**」；§8 的 V1.0 Exit Gate 要求「Windows / macOS / Linux
  **全 PASS-E**」→ 按该口径 **0/50 达标**。

两者相差 6 与 50，同一份台账。

### 事实二：有前科

master-plan §5.7 记录：`P0-SHELL-003` 的 `AUTO` 状态**曾把一个完全不可用的功能当作已闭环**
—— 浮动工具栏因在 CM6 update 周期内读布局而永不显示，单测只覆盖纯函数
`shouldShowToolbar`，属「有测试但不工作」。即 **`AUTO` 在本项目有被误读为「已完成」的历史**。

### 事实三：4 项标 `AUTO` 却把 `ux-gate` 写进了 `requiredEvidence`

`P0-EDITOR-001`、`P0-EDITOR-003`、`P0-SHELL-001`、`P0-MENU-001` —— 它们自己声明
需要人工门禁，却被按「不阻断」处理。

### 事实四：三项自身证据已齐备，仅被逐项 `ux-gate` 政策挡住

`P0-EDITOR-004`（三平台 Runtime 证据齐备）、`P0-PLATFORM-001`（requiredEvidence
「已全部取得」）、`P0-LAYOUT-002`（三平台 × 3 类基线全部入库并进入比对模式）——
台账自述均写明「仅因 PASS-E 全局策略要求 `ux-gate` 而未升」。
它们当前的状态码是 `MAC` / `IMPL` / `BLOCKED`，**状态码本身会误导**
（读起来像「缺平台证据」，实际缺的是人工 UX Gate 会话）。

### 事实五：ADR-0020 的口径不同

`ADR-0020` §决策 2 把发布门槛定义为「PRD §133 P0 范围 + 发布评审 18 项验收全部通过，
包含：三平台真机矩阵、**UX Score ≥ 92 对照实测**、**30 任务效率 Gate**、macOS 签名公证、
Source Fidelity / File Safety / IME 全绿」—— 即 **UX Gate 是全局发布门槛**，
不是「每一项 PASS-E 的前置条件」。

按 AGENTS.md 的优先级（PRD > spec > ADR > plan），master-plan §8 的逐项要求与
ADR-0020 的全局门槛口径不同，属**需要裁决的冲突**，AI 不擅自裁决。

## 待决问题

- **Q1**：`AUTO` 是否应阻断发布？（即门禁的「不阻断」集合是否应排除 `AUTO`）
- **Q2**：`ux-gate` 是否必须是**每一项** PASS-E 的前置？（还是仅作为全局发布门槛，
  如 ADR-0020 所述）

## 选项

### Q1

| 选项 | 内容 | 后果 |
|---|---|---|
| **A1**（现状） | `AUTO` 不阻断，门禁输出「6 项未闭环」+ `Closure basis` 声明口径 | 数字好看但需读者自行理解口径；与 §8 的 Exit Gate 不一致；有 §5.7 前科 |
| **A2** | `AUTO` 视为**未闭环**，门禁输出「50 项未闭环（PASS-E = 0）」 | 与 §4.3/§8 一致；缺点是**每次发布前都会显示 50 项**，需另设「pre-release 通道」语义以免门禁失去区分度 |
| **A3** | 保留 A1 的输出，但**另立一条硬门禁**：凡 `requiredEvidence` 含 `ux-gate` 的项，**不得**以 `AUTO` 收口 | 精确堵住「用 AUTO 绕开人工门禁」；改动面最小（只影响 4 项） |

### Q2

| 选项 | 内容 | 后果 |
|---|---|---|
| **B1**（现状） | 逐项 `ux-gate` 前置 | 6 项全等同一场人工会话；三项已齐备证据也只能停在 `MAC`/`IMPL`/`BLOCKED` |
| **B2** | `ux-gate` 仅作为**全局**发布门槛（对齐 ADR-0020） | 三项可凭已取得的证据升 PASS-E → 未闭环 6 → 3；人工会话仍需完成，但不再是逐项前置 |

## 建议（供裁决参考，非结论）

- **Q1 建议 A3**：既保留 pre-release 通道的区分度，又堵住「AUTO 绕开人工门禁」的漏洞。
- **Q2 建议 B2**：与 ADR-0020 的既有措辞一致，且避免「证据齐备却因策略无法升格」的空转。

两项建议都**不降低**实际要求：人工 UX Gate 会话与三平台真机证据仍然必须完成，
变的只是「它挂在每一项上，还是挂在发布门槛上」。

## 后果（若采纳建议）

- `verify-release-gate.mjs`：`AUTO` 不再无条件不阻断；新增「`ux-gate` 项不得 AUTO 收口」断言。
- `verify-parity-ledger.mjs`：PASS-E 的 `requiredEvidence` 校验从「必须含 ux-gate」
  改为「必须含三平台真机证据」。
- 台账：`P0-EDITOR-004` / `P0-PLATFORM-001` / `P0-LAYOUT-002` 可升 PASS-E。
- 需同步更新 master-plan §8 与 §11 的表述，并在本 ADR 中说明取代关系。

## 未决事项（本 ADR 不覆盖）

`P0-PERF-001` 的「台账 `typoraBehavior` 对 >2MB 不成立」与「>2MB 夹具对比口径」
属另一类问题（基线产品拒绝渲染时的证据政策），见 **ADR-0025**。
