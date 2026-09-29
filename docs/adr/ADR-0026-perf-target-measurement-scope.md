# ADR-0026 — PRD §110 性能目标的测量口径（目标 ↔ 指标映射）

**Status:** Proposed（2026-09-29）—— **待裁决，尚未生效**

> 第三份同批起草的 Proposed ADR。起因：benchmark 报告里已把 PRD §110 的 1MB/10MB 目标
> **断言为「热打开口径」**，但 PRD 原文并未规定口径 —— 那是本仓库的**推断**。
> 推断本身有强论据，但不应以「PRD 陈述」的形式出现在报告里。

## 背景

### PRD §110 原文（逐字）

```text
### Startup
P95 <= 1.2s to editable on reference machine

### 1 MB
<= 250ms to editable target

### 10 MB
<= 1.0s–1.5s to editable target

### Input
普通文档：P95 update < 16ms
Large：P95 < 32ms
```

另有一条方法论要求：

> 不能只用绝对指标。必须：同机型与 Typora 1.14.6 对照。
> （版本以 AGENTS.md 规则 14 为准：**1.14.9**）

### 问题一：1MB 的 250ms 与 Startup 的 1.2s **逻辑不自洽**（若同为冷启动）

实测（2026-09-29，同机同会话）：

| 指标 | Mellow | Typora 1.14.9 |
|---|---|---|
| Startup（blank 冷启动）P95 | 321.9ms | 461.1ms |
| 1MB 冷启动 open-to-editable median | 611.0ms | 1150.3ms |

**进程启动本身就要 300–500ms**（上表 winMs 分量：Mellow 约 300–340ms、Typora 约 400–490ms）。
若 1MB 的 250ms 也含进程启动，则它比 Startup 的 1200ms **严格更严**，且**两个产品都必然不达标**
—— 这使该目标失去区分度。

故本仓库在报告中**推断**：1MB / 10MB 是**热打开口径**（应用已在运行，打开文档到可编辑），
Startup 才是冷启动口径。按此推断，Mellow 的 1MB 热打开 `switchMs` 为 **127–186ms**，
**在 250ms 之内**；冷启动口径则两侧都不达标。

**该推断有强论据，但它是推断，不是 PRD 的陈述。**

### 问题二：Input 的 16ms 目标**低于本 harness 的分辨率**

`typing` 以屏幕捕获首帧变化为准，SCK ≈57fps → **单帧 ≈17.4ms**。
16ms < 17.4ms → 该目标在此口径下**不可判定**（已实现：输出「不可判定（低于分辨率）」，
不给 ✅/❌）。32ms 目标高于分辨率，判定成立（实测 5MB 为 380.51ms → ❌）。

要判定 16ms 必须换测量方法（应用内 `input → paint` 埋点，或 CDP tracing）。

### 问题三：目标 ↔ 指标映射此前只隐含存在

报告中各节的 PRD 目标与所用指标是隐含对应的，没有一处集中声明。读者无法确认
「哪个目标由哪个指标回答」。

## 待决问题

- **Q1**：1MB / 10MB 目标按**热打开**口径（应用已运行）还是**冷启动**口径解读？
- **Q2**：若按热打开，是否以 `hotopen` 的 `switchMs` 作为判定量（而非 `total`）？
- **Q3**：Input 16ms 目标：接受「本 harness 不可判定」，还是立项换测量方法？
- **Q4**：目标 ↔ 指标映射是否以本 ADR 的表格为唯一声明处？

## 目标 ↔ 指标映射（建议 Q4 采纳为唯一声明）

| PRD §110 目标 | benchmark 指标 | 判定可用性 |
|---|---|---|
| Startup P95 ≤ 1.2s | `startup`（blank 冷启动 → 可编辑） | ✅ 可判定（1200ms ≫ 17.4ms） |
| 1MB ≤ 250ms | `hotopen.switchMs`（**热打开**，待 Q1/Q2 确认） | 待定 |
| 10MB ≤ 1.0–1.5s | `hotopen.switchMs`（**热打开**，待 Q1/Q2 确认） | 待定；Typora 无基线 |
| Input 普通 < 16ms | `typing` P95 | ❌ **不可判定**（16ms < 单帧 17.4ms） |
| Input Large < 32ms | `typing` P95（Large 夹具） | ✅ 可判定（实测 5MB 380.51ms → ❌） |

## 选项

### Q1 / Q2

| 选项 | 内容 | 后果 |
|---|---|---|
| **A1** | 按热打开解读，判定量取 `hotopen.switchMs` | 与「250ms 不应严于 1.2s」自洽；Mellow 1MB = 127–186ms → 达标；但需解释 `switchMs` 只测「顶部带首次实质变化」 |
| **A2** | 按冷启动解读 | 目标对两个产品都不达标 → 失去区分度；且与 Startup 预算矛盾 |
| **A3** | 在 PRD 中补写口径（改宪法） | 最干净，但属 PRD 变更，需人工裁决并同步 PRD 版本 |

### Q3

| 选项 | 内容 |
|---|---|
| **B1** | 接受「本 harness 不可判定」，改由应用内埋点立项后判定 |
| **B2** | 不判定该目标，在报告中标注「超出本 harness 能力范围」 |

### Q4

| 选项 | 内容 |
|---|---|
| **C1** | 以本 ADR 的映射表为唯一声明处，报告各节引用之（避免多处各自推断） |
| **C2** | 维持现状（映射隐含在各节文字里） |

## 建议（供裁决参考，非结论）

- **Q1/Q2 → A1**：论据最强（否则目标自相矛盾），且已有 `hotopen` 指标可判定。
- **Q3 → B1**：换测量方法是唯一正解，但应作为独立工作项排期，不在本 ADR 内决定实现。
- **Q4 → C1**：本 ADR 正是为了消灭「多处各自推断」而写。

## 后果（若采纳建议）

- `run-benchmark.mjs`：报告各节的目标列改为**引用本 ADR 的映射**，并明确
  「口径为本仓库推断（见 ADR-0026）」，不再以「PRD 目标为热打开口径」的陈述形式出现。
- 1MB / 10MB 的判定改由 `hotopen` 回答；`open`（冷启动）仅作同机对照，不参与 PRD 判定。
- Input 16ms 目标在报告中保持「不可判定」。

## 关联

- `docs/qualification/release-blocker-audit-2026-09-25.md`
- `tests/qualification/evidence/2026-09-25-perf-hot-open-authoritative.md`
- `tests/qualification/evidence/2026-09-25-hotopen-criterion-and-large-file-cliff.md`
- `tests/qualification/evidence/2026-09-29-typing-metric-resolution-limit.md`
