# ADR-0024 — 发布闭环语义：`AUTO` 是否阻断发布、`ux-gate` 是否逐项前置

**Status:** **Accepted**（2026-09-30）—— 已裁决并生效（原 Proposed 2026-09-29）

> **⚠️ 部分被取代（2026-10-05）**：**Q2 = B1（「保持 pre-release」）已被
> [`ADR-0031`](ADR-0031-release-status-promotion.md)（Accepted，用户裁决）取代** ——
> 发布状态已转为**正式发布**。
> **Q1 = A3（闭环口径）与其余各条继续有效**（与发布状态正交）。
> 本文正文**保留为历史记录**（ADR 只追加、不改写结论）；**引用发布状态时以 ADR-0031 为准**。

## 裁决（2026-09-30）

> 依据：用户于 2026-09-30 授权「全部自行评估、决策、实施，不叫我人工参与」。
> **授权不等于降低举证标准**：下面每条裁决都指向可复核的证据或项目自身的规则，
> 不采用「看起来合理」的选项。

### Q1 = **A3**（`AUTO` 不得为「自身声明需要人工门禁」的项收口）

- 依据：master-plan §4.3 已定义 `AUTO` =「自动化测试通过、**真机体验验收未完成**」。
  一个把 `ux-gate` 写进 `requiredEvidence` 的项，其**声明本身**就承认人工验收未完成；
  按「不阻断」处理即 §5.7 前科的同型漏洞（`P0-SHELL-003` 浮动工具栏永不显示却被 AUTO 当闭环）。
- 为何不选 A2：A2 会让每次发布前都显示 50 项，门禁**失去区分度**（pre-release 通道失效）；
  A3 改动面最小且**只可能让项变严，不可能放宽任何一项**。

### Q2 = **B1**（`ux-gate` 逐项前置）—— **此处偏离本 ADR 起草时的建议 B2**

偏离理由（逐条）：

1. **B2 依据的权威链不干净**：B2 引 ADR-0020 §决策2（全局门槛）。但 ADR-0020 **自身**末尾
   还挂着一条**更晚的用户裁决**（2026-09-05「CI 绿即正式发布；残余真机 Gate
   ——含 macOS 30 计时任务 + UX Score——转为发布后跟踪项，**不再阻塞发布状态**」）。
   而该裁决**已被实践取代**：`release-notes-v1.5.10 ~ v1.5.15` 逐版写明
   「Release Gate 未闭环前保持 pre-release」，`release-template.md` 亦写
   「真机 Gate 回填前不宣称正式发布」。即 B2 所依赖的那条口径**自身处于被取代状态**。
2. **B2 的收益已被交付**：B2 的唯一好处是修掉「状态码误导」。而门禁输出**已经**逐项打印
   `P0-EDITOR-004(MAC — ux-gate-policy)` —— 阻塞原因对读者是可见的（`blockedBy` 是机器可读字段）。
3. **风险不对称**：B2 会把 3 项升为 `PASS-E`，那是**实质就绪度声明**（三平台验收通过）；
   B1 不产生任何新声明。判据：**就绪度声明必须由证据挣得，不能由策略解读推出。**
4. B2 还需改写 master-plan §8 / §11 的宪法级表述；B1 不需要动宪法文本。

**故不升格那 3 项**：`P0-EDITOR-004` / `P0-PLATFORM-001` / `P0-LAYOUT-002` 维持
`MAC` / `IMPL` / `BLOCKED`，但 `blockedBy` 已明确为 `ux-gate-policy`。

### 已实施的后果（同批次落地）

| 位置 | 改动 |
|---|---|
| `verify-release-gate.mjs` | 「不阻断」条件收紧为 `AUTO` **且 `requiredEvidence` 不含 `ux-gate`**；新增 A3 规则 canary（含/不含 ux-gate 各一例 + PASS-E 一例） |
| 台账 | `P0-EDITOR-001` / `P0-EDITOR-003` / `P0-SHELL-001` / `P0-MENU-001` 补 `blockedBy: ux-gate-policy`（门禁要求未闭环项必须机器可读地声明原因） |
| 门禁输出 | `Closure basis` 写明新口径；**未闭环 6 → 10**；4 项标注 A3 原因 |
| `verify-release-gate.mjs` | `PENDING_ADRS` → `DECIDED_ADRS`：断言反转为「已裁决 ADR 不得删除、不得退回 Proposed」 |

> **未闭环数 6 → 10 不是退步，而是口径变诚实**（原先 4 项被 `AUTO` 当成了闭环）。
> 发布状态不变（仍 pre-release）：全局人工 UX Gate 会话本身仍未完成。

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
