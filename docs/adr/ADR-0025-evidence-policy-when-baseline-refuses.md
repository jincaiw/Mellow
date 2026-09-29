# ADR-0025 — 基线产品拒绝执行时的证据政策（Typora >2MB 拒渲染）

**Status:** Proposed（2026-09-29）—— **待裁决，尚未生效**

> 与 ADR-0024 同批起草。按 AGENTS.md，决策变更以新增 ADR 记录，不改写既有 ADR 结论。

## 背景

### 事实一：Typora 1.14.9 不渲染超过 2,000,000 字符的文档（一级证据）

`TypeMark/appsrc/window/frame.js`：

```js
tryEnterOversize: function(e,t,n){ return (!File.isMac||File.bundle.filePath)
  && (a.bindOversizePlaceholder(), t || e.length > File.MAX_FILE_SIZE)
    ? (File.doEnterOversize(n), "") : (File.exitOversize(), e) }
// 同文件内：MAX_FILE_SIZE: 2e6
```

命中时只显示「The file is too large to render in Typora.」
（zh-Hans「该文件过大，因此无法在 Typora 中呈现」）提示页 + 一个 QuickLook 按钮，
**既不渲染也不可编辑**。实测边界：1,900,000 字符正常渲染 / 2,100,000 字符为提示页。

### 事实二：这与 PRD 的验收设计直接冲突

- **PRD §110**：10MB 目标是「≤ 1.0s–1.5s to editable target」——隐含 Typora 侧可对照。
- **PRD §132 任务 17「10 MB」**、**Journey J18「10MB：Open → search → edit → save」**
  ——把 10MB 定为**必须执行**的对照任务。
- **PRD §110 同时要求**：「不能只用绝对指标。必须：同机型与 Typora 对照。」

即：PRD 要求「同机型与 Typora 对照」，而该尺寸上 Typora **不存在可比行为**。
按 AGENTS.md「实现与 Spec 冲突 → 先报告冲突，不得擅自裁决」，本 ADR 只登记、不处置。

### 事实三：台账合同文本与该事实不符

`tests/parity/typora-parity-ledger.json` 的 `P0-PERF-001.typoraBehavior` 写的是
「同机、同文档条件下维持可编辑和可导航。」——对 >2MB 不成立。

### 事实四：已有护栏防止把「无基线」当「有基线」用

`run-benchmark.mjs` 的 `ratioOrNA()` 已实现并受护栏保护：基线不渲染该夹具时
**不得相除**，报告输出 `n/a（Typora 拒渲染）`。本轮又补上：
① Typora 侧「基线不适用」提示；② Mellow 大文件模式归属列（阈值 `>5MB` / `>50,000 lines`，
见 PRD §109 与三方一致护栏）；③ hot-open 的判据自证。

## 待决问题

- **Q1**：台账 `P0-PERF-001.typoraBehavior` 应如何更正？（它是「Typora 行为契约」，
  当前文本对 >2MB 为假）
- **Q2**：>2MB 夹具（`5MB.md` 之上、`10MB.md`、`100k-lines.md`）在对照口径中如何处置？
- **Q3**：PRD §132 任务 30 / J18 在 Typora 侧不可执行，如何处置？

## 选项

### Q1

| 选项 | 内容 |
|---|---|
| **A1** | 更正为限定式：「同机、同文档条件下维持可编辑和可导航；**Typora 自身对 >2,000,000 字符的文档不渲染，该尺寸无 Typora 行为可比**。」 |
| **A2** | 保持原文不动，仅在 `evidence` 中登记冲突（现状） |

### Q2

| 选项 | 内容 | 后果 |
|---|---|---|
| **B1** | 保留夹具，Typora 列记「不适用」并注明原因（**现状**，`ratioOrNA` 已实现） | 可继续评 Mellow 的绝对指标与「10MB 可编辑」这一能力事实 |
| **B2** | 把 >2MB 夹具从**对照**集合移到**能力观察**集合 | 报告更干净，但失去「同机对照」之外的尺寸连续性 |
| **B3** | 为 >2MB 寻找替代基线（如 VS Code / Obsidian） | 引入第三方，超出 PRD §110「与 Typora 对照」的规定 |

### Q3

| 选项 | 内容 |
|---|---|
| **C1** | 任务 30 的对照尺寸改为 ≤2MB（Typora 可执行），另立「>2MB 能力差异」**非对照**观察项 |
| **C2** | 任务 30 只评 Mellow 绝对指标，Typora 侧记「不适用」并说明原因 |

## 建议（供裁决参考，非结论）

- **Q1 → A1**：合同文本不应包含已知为假的陈述；限定式表述既不削弱 Mellow 的义务，
  也不留下可被误引的假事实。
- **Q2 → B1**：`ratioOrNA` 与报告标注已把风险控制住，改动最小。
- **Q3 → C1**：保留「同尺寸对照」的可比性，同时把「Typora 做不到、Mellow 做得到」
  作为**能力差异**单独记录 —— 这本身就是 PRD §129「10 MB 文档仍然可编辑」的正面证据。

## 后果（若采纳建议）

- 台账 `P0-PERF-001.typoraBehavior` 文本更新（**需人工确认**，AI 不擅自改合同文本）。
- `docs/qualification/ux-score-gate-template.md` 的任务 30 处置说明同步更新
  （模板已登记该障碍与两个候选处置）。
- 无代码改动。

## 关联

- 证据：`tests/qualification/evidence/2026-09-23-typora-render-limit-2mb.md`、
  `2026-09-25-perf-hot-open-authoritative.md`、
  `2026-09-25-hotopen-criterion-and-large-file-cliff.md`、
  `2026-09-28-open-echo-criterion-and-fresh-comparison.md`、
  `2026-09-29-typing-metric-resolution-limit.md`。
- 审计：`docs/qualification/release-blocker-audit-2026-09-25.md`。
