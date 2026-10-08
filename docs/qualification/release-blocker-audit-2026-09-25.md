# 发布阻塞项审计（2026-09-25）

**审计结论**：**未完成 → 不发布**。50 项 P0 中 44 项 `AUTO`（门禁视为闭环），
**6 项未闭环**，且其中 **3 项的自身 requiredEvidence 已全部取得**，
仅因一条**全局策略**而未升 PASS-E。

> 本次审计的判定依据全部来自**实跑命令**（`verify-release-gate.mjs` / `verify-parity-ledger.mjs`
> + 台账 JSON + 证据文件存在性），**不采信文档自述**。

> **`§` 引用约定**（2026-10-08 立，审计 §4.148 —— 起因是实测到 407 处无限定词的引用）：
> - **裸 `§4.N`** ⇒ 指**本文档**的 `## 4.N`（本文档的逐轮日志）。⚠️ 本文档的日志**从 `## 4.3` 起**
>   （编号 **4.1** / **4.2** 不存在）⇒ 裸写这两个编号会**解析不到**
>   —— 本行刻意**不带 `§` 前缀**，否则**它自己会被下面的判据命中**（PITFALLS §4.195 的形态）。
> - **引用 `PITFALLS.md`** ⇒ 必须写 `PITFALLS §4.N` —— 两者的编号空间在 **1–147 区间重叠**，
>   裸写无法判定指哪一份（§4.143）。
> - **引用其它文档** ⇒ 写文档名，**或**在小节开头给**块级限定词**
>   （如「以下 `§N` 均指 `docs/plans/packaging-release.md` 的小节」）。
> - ⚠️ **不得**在本文档里用「**本文件**」去指**别的**文档 —— 本文档里「本文件」= 审计文档。
>   反例见 §4.88 的 `packaging-release.md` 小节（已修）。
> - **存量残量（如实登记）**：实测全文 **605 处 `§` 引用里 407 处不带文档限定词**。
>   **不做机械全改** —— 「该引用指哪份文档」必须读上下文（表格标题 / 同段落），
>   **机械补限定词没有判据能验证改对了**，只会制造 400 处无法复核的改动。
>   ⇒ 判据只覆盖**可机械判的那一半**：**不可解析的 `§4.N` 必须带限定词**
>   （`verify-doc-code-refs.mjs`）；其余**登记为残量**。

---

## 一、状态分布（实跑）

```
$ node tests/parity/verify-release-gate.mjs
Release verdict: NO-GO：6 项未闭环
  Unclosed: P0-EDITOR-004(MAC — ux-gate-policy), P0-PERF-001(MAC — metric-decisions + ux-gate-policy),
            P0-PLATFORM-001(IMPL — ux-gate-policy), P0-QA-001(NOT_TESTED — human-ux-gate-session),
            P0-EDITOR-005(BLOCKED — host-api-extension), P0-LAYOUT-002(BLOCKED — ux-gate-policy)
  Blocked by: ux-gate-policy → P0-EDITOR-004, P0-PLATFORM-001, P0-LAYOUT-002
              | metric-decisions + ux-gate-policy → P0-PERF-001
              | human-ux-gate-session → P0-QA-001
              | host-api-extension → P0-EDITOR-005
```

| 状态 | 数量 | 门禁是否视为闭环 |
|---|---|---|
| `AUTO` | 44 | 是（不在 NO-GO 清单内） |
| `MAC` | 2 | 否 |
| `IMPL` | 1 | 否 |
| `NOT_TESTED` | 1 | 否 |
| `BLOCKED` | 2 | 否 |

### 待裁决项登记表（**唯一声明处**）

> **立此表的原因（2026-10-01）**：项目规则是「**待裁决项必须有 ADR 载体**」，
> 而逐项复核发现**本文档里有 6 处「待裁决」标记，门禁的 `Pending decisions:` 却是「无」**
> —— 即这些裁决项**长期没有载体**。根因是护栏**只做了单向**：它核对「ADR → 门禁」，
> 没核对「本文档的待裁决项 → 是否有 ADR」。
> **本文档此后不得新增未登记的裁决项**；「载体」列要么指向存在的 ADR，要么写 `已处置`（并给证据）。
> 护栏 `verify-release-gate.mjs` 会断言本表存在且每行的载体**可解析**。
> （范围限制：护栏**不能**自动发现「新加了 `待裁决` 字样却没登记」—— 那需要理解自然语言；
> 要补上这一半需给标记定机器可读写法，属后续工作。见 **ADR-0029**。）

| # | 出处 | 裁决问题 | 处置 | 载体 |
|---|---|---|---|---|
| 1 | §3（2026-09-29） | `AUTO` 是否阻断发布 / `ux-gate` 是否逐项前置 | **已裁决**（A3 / ~~B1~~）⚠️ **2026-10-06 更正**：`Q2 = B1`（保持 pre-release）**已被 `ADR-0031` 取代**（「取代：ADR-0024 的 Q2 = B1」）⇒ 本行的 `B1` 是**历史值**，**`Q1 = A3` 继续有效**（ADR-0031 明示「不取代 Q1=A3」） | `docs/adr/ADR-0024-release-closure-semantics.md`；**取代者** `docs/adr/ADR-0031-release-status-promotion.md` |
| 2 | §3.1 | `P0-PERF-001` 的 5 项口径中有两项是否开放 | **已由 PRD 判定**（宪法已判，无需裁决） | `已处置`（§3.1 记录依据） |
| 3 | §4.3 | 远程图片默认值（安全相关默认值） | **已由两处独立一手证据判定**（Typora 始终加载远程图片且无退出选项） | `已处置`（§4.3 记录 `frame.js` 的 `DEFAULT_OPTIONS`） |
| 4 | §4.4 | **安全验收是否应进入台账**（新增安全域与条目） | **已裁决**（B2：不新增，改在验收文档单列） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q2） |
| 5 | §4.5 | **V1.0 发布时是否把「Apple 凭据缺失」改为硬失败** | **已裁决**（C2：保持警告 + 现状护栏） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q3） |
| 6 | §4.10.1 | **`settings.open` 在 Win/Linux 的菜单入口**（D 还是缺口） | **已裁决**（A3：维持现状 + 理由进 D 表；**证据缺口已注明**）—— D 表载体 = master-plan §12 的 **`D-AF`**，**2026-09-30 已落地**（2026-10-01 复核确认，见 §4.67） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q1） |
| 7 | §4.14 / §4.29–§4.30 | `Allow Magnification` / 「使用主题的字体大小」的**前半**（自定义字号） | **已处置**（前者已实装；后者「自定义字号」已实装 = `export.image.fontSize` 默认 16，刻意不对齐 Typora 的 24，已登记 D）⚠️ **2026-10-06 更正**：原写「已处置」**过度声称** —— 该项的**另一半**（「用主题字号」）**未实施**，见**第 16 行** | `已处置`（§4.28 / §4.30） |
| 8 | §4.39 | **表格 `invalid` 提示**：Mellow 自有提示 or 从 spec 移除 | **已裁决（2026-10-05）= D2：从 spec 移除** —— 补足一手证据后裁定：Typora 对损坏表格**既不提示也不校验**（两条独立通道：全部 8 份 `.strings` + `main.js`）⇒ 该项非 parity 且从未实现 | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q4） |
| 9 | §4.40 | **上传「密钥」的 spec 表述**（不适用 / keychain / UI 禁止） | **已裁决**（E1：改写为「不适用」+ **保留明文残余风险说明**） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q5） |
| 10 | §4.51 | **`tests/visual/actual/*.png` 是否取消 git 跟踪** | **已裁决**（F1：取消跟踪 + 改护栏 + README 同步） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q6） |
| 11 | §4.72 | **clipboard paste 优先级：`image payload`（§3 优先级 2）与 `rich HTML`（4）分处两个 eventHandler，而注册顺序把 2 排在 3/4 之后 ⇒ 与 spec §3 相反** | **已裁决（2026-10-05）= A3：把顺序决策收敛到一处显式判断**（`handleSmartPaste` 内显式检查图片 payload 并让位）—— 关键推理：**该裁决不需要 MIME 证据**，因为 §3 的优先级 2 指的是 **payload**，不是「含 `<img>` 的 HTML」；已实现 + 5 例单测 + 护栏改写 | `docs/adr/ADR-0030-clipboard-paste-priority-handler-order.md` |
| 12 | §4.102 / §4.105 | **30 个「无人使用」的 i18n 键**（侧栏过滤面板→设置页的化石、只被护栏维护的 4 个、未接线的一批） | **已裁决（2026-10-06）= A1：删除** —— 删除前取证三项（无产品/工具链引用、无 `tests/` 功能引用、无动态构造）；两 locale 各删 30 键（**841 → 811**）；`MESSAGES_UNUSED` 清空 ⇒ 判据 D 升级为**硬判据** | `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（Q1） |
| 13 | §4.99 | **3 个「声明了但无人消费」的主题 token**（`--mellow-tab-underline` / `--mellow-warning-fg` / `--mellow-mermaid-border`） | **已裁决（2026-10-06）= B3：维持登记**（与 ADR-0027 Q3 对 `--mellow-md-fg` 的既有口径一致：删除属主题面变更、接线属外观变更） | `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（Q2） |
| 14 | §4.95 | **零跨包消费者的包**去留 —— ⚠️ **2026-10-08 更正（审计 §4.160）**：原文写「**3 个零跨包消费者的包**（`document-model` / `shared` / `workspace`）」，而实测是 **4 个**（`PKG_NO_CONSUMER_EXEMPT` 四条 = 上述三个 + **`editor-react`**）⇒ **原表述把「3 个待裁决的」写成了「3 个零消费者的」**（数量对、**对象错**）。**待裁决的仍是 3 个**；`editor-react` 是**有意预留**（契约 re-export；组件化 UI 见阶段 2 计划）⇒ **不待裁决**。其中 `document-model` 涉及 **ADR-0008 的落地实现整体未被采用** | **已裁决（2026-10-06）= C3：保留 + 记录理由与触发条件** —— **按 `AGENTS.md`「不要自行修改架构，先报告冲突」不自行改**（该条比常设授权更具体因而优先）；触发条件已写明（`document-model` 需替代设计或新 ADR；`shared`/`workspace` 若仍无消费者可在专门架构裁决中删除） | `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（Q3） |
| 15 | §4.85 | **3 个不在设置 schema 的持久化键**（`fileTree.options` / `outline.options` / `statusbar.fields`）：既不在设置页、也不被「恢复默认」清理 | **已裁决（2026-10-06）= D2：维持登记 + 补文档** —— 它们已有独立 UI 入口，进设置页会造成双入口；已在 master-plan 偏好设置小节写明「不在设置页、且不被『恢复默认』清理」 | `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（Q4） |
| 16 | §4.113 | **图片导出的「用主题字号」**（Typora `useThemeFontSize` radio 的**另一半**）：Mellow 只有「自定义字号」`export.image.fontSize`，**无「跟随主题字号」选项**；且 Typora 默认 24px vs Mellow 16px | **已裁决（2026-10-06）= A2：提供「跟随编辑器字号」开关** —— A3（跟随主题字号）**实测等于空操作**（主题无 per-theme 字号，恒为 16 ⇒ 假控件）；A1 会把 parity 缺口永久留着。⚠️ **有意的差异**（canvas 无主题 CSS 通道）⇒ 须登记 D。**默认仍为 `custom` ⇒ 既有导出输出逐字节不变** | `docs/adr/ADR-0033-image-export-theme-font-size.md` |
| 17 | §4.120 / §4.121 | **偏好矩阵两条轴上共 10 项「未登记的待裁决偏离」**：**默认值轴** 5 项（`markdown.highlight` / `markdown.supSub`（Typora 拆成 sub·sup 两个）/ `markdown.mermaid` / `editor.cmdWheelZoom` —— 默认值与 Typora 默认相反）；**行为轴** 5 项（`autoEscapeImageURL` / `useRelativePathForImg` / `mathFormatOnCopy` / `noLegacyMath` / `wordCountDelimiter` —— 无该选项且行为不同） | **待裁决（10 问）** —— ⚠️ 这 10 项此前**只在 master-plan 的轮次叙述里**，**登记表一行都没有** ⇒ 门禁据此报 `Pending decisions: 无`（**项目在机器可读层面声称「没有待裁决项」**）。本行是补登记；**未擅自改任何默认值或行为**（改的是用户可见结果，属产品决策）。行为轴另 3 项已各有载体（`useTreeStyle`→**D-AK**、`wordsPerMinute`→**D-AO**、`presetSpellCheck`→台账 `P0-EDITOR-005`） | `docs/adr/ADR-0034-preference-deviations-2026-10-07.md` |

## 二、六项逐条（阻塞原因与「还差什么」）

### 2.1 三项**自身证据已齐备**，只被全局策略挡住

| 项 | 状态 | requiredEvidence | 台账自述的取得情况 |
|---|---|---|---|
| `P0-EDITOR-004` | MAC | unit / macos / windows-ci / linux-ci / **ux-gate** | 三平台 Runtime 证据已取得（Linux IME 矩阵 8/8、Windows Source Fidelity + SendKeys 读回、macOS launch/CLI-open）。原文：「状态仍不升 PASS-E：**全局策略要求 PASS-E 必须带 ux-gate**，而 ux-gate-recorder 按设计只接受人工计时记录」 |
| `P0-PLATFORM-001` | IMPL | macos-native / windows-ci / linux-ci / linux-ime-matrix | 原文：「本项 requiredEvidence（macos-native / windows-ci / linux-ci / linux-ime-matrix）至此**已全部取得**。状态仍维持 IMPL：PASS-E 全局策略额外要求 ux-gate」 |
| `P0-LAYOUT-002` | BLOCKED | unit / macos / windows-ci / linux-ci / visual-golden | 三平台 × 3 类基线全部入库并进入比对模式，三平台各 3 个脚本均报 match。原文：「**本项自身 requiredEvidence 已齐备**，但 PASS-E 全局策略要求 `ux-gate`，需人工计时会话（P0-QA-001）」 |

**⚠️ 状态码本身在误导**：`MAC 仅单平台` / `IMPL` 会让人以为「缺平台证据」，
实际缺的是**人工 UX Gate 会话**。本次审计已把原因变成机器可读字段 `blockedBy`，
门禁输出改为 `P0-EDITOR-004(MAC — ux-gate-policy)`。

### 2.2 其余三项

| 项 | 阻塞原因 | 还差什么 |
|---|---|---|
| `P0-QA-001` | `human-ux-gate-session` | **本项就是那个 UX Gate 会话本身**：30 任务 × 2 应用 × 2 轮 = 120 条人工计时观测，`ux-gate-recorder.mjs` 按设计只接受人工记录（明令禁止伪造计时） |
| `P0-PERF-001` | `metric-decisions + ux-gate-policy` | 原列 5 项口径中**两项已由 PRD §109 判定**（阈值 `>` 正确；`5MB.md` 是边界样本无需改，见 §3.1）；仍待处置：① 台账 `typoraBehavior` 对 >2MB 不成立；② UX Gate 任务 30 属 PRD-现实冲突（§3.2）；③ >2MB 夹具对比口径。另加环境限制：屏幕锁定期间无法做视觉测量 |
| `P0-EDITOR-005` | `host-api-extension` | 台账自述已收窄：系统拼写检查**已真实接线并可调**，仅缺「词典与右键建议列表」（属平台能力，需 `packages/host-api` 扩展后补齐） |

## 三、最高杠杆的一项决策

> **`ux-gate` 是否必须是*每一项* PASS-E 的前置？**

- 若「是」（现状）：6 项全部要等同一场人工 UX Gate 会话；`P0-EDITOR-004` /
  `P0-PLATFORM-001` / `P0-LAYOUT-002` 三项虽证据齐备也只能停在 `MAC`/`IMPL`/`BLOCKED`。
- 若「仅 `P0-QA-001`（验收域）需要」：上述三项可凭**已取得的证据**升 PASS-E，
  未闭环从 6 项降到 3 项（`P0-QA-001` 仍需人工会话；`P0-EDITOR-005` 仍需实现；
  `P0-PERF-001` 仍需口径裁决）。

该策略是 `docs/plans/typora-parity-master-plan.md` §8 的明示设计
（「任何 PASS-E 项的 requiredEvidence 必须含三平台真机 + ux-gate；硬失败」），
**属方案级决策，本环境不擅自改动**；改与不改都需要你裁决。

> **2026-09-29 更新：已收敛为 ADR，待裁决。**
> 本节的两项（`AUTO` 是否阻断、`ux-gate` 是否逐项前置）连同 §3.2 的 PRD-现实冲突，
> 已按 AGENTS.md「决策变更以新增 ADR 记录」起草为：
> - `docs/adr/ADR-0024-release-closure-semantics.md`
> - `docs/adr/ADR-0025-evidence-policy-when-baseline-refuses.md`
>
> 两份 ADR 各含背景（含实跑数字与一级证据）、待决问题、选项与后果、以及供参考的建议。

> **2026-09-30 更新：三份 ADR 均已裁决为 Accepted（含 ADR-0026），护栏断言已反转。**
> 用户在 2026-09-30 授权「全部自行评估、决策、实施」；裁决内容与理由见各 ADR 的「裁决」节
> （其中 ADR-0024 Q2 **偏离**起草建议 B2 → 取 B1，理由见该节）。
> 门禁输出：`Pending decisions:` 改为「无 —— 已于 2026-09-30 裁决」；
> 护栏断言由「**待裁决 ADR 必须存在且状态为 Proposed**」反转为
> 「**已裁决 ADR 不得删除、不得退回 Proposed**」（注入验证方向随之反转）。

### 3.1 原「P0-PERF-001 的 5 项口径」中，两项已由 PRD 判定（无需裁决）

回查 PRD（宪法）后发现两项并非开放问题：

| 原列裁决项 | 结论 | 依据 |
|---|---|---|
| 大文件模式阈值用 `>` 还是 `>=` | **`>` 正确，实现无需改动** | PRD §109 Large File Mode 的触发原文即 `>5MB` / `>50,000 lines`（严格大于）。故 `5MB.md` 恰好压线而不降级**不是缺陷**，是宪法规定的结果 |
| `5MB.md` 是否改为略大于 5 MiB | **无需改动**：它本来就是**边界样本** | `run-benchmark` 的 `modeMap` 早已把它标为「边界」；本轮补上的是「报告必须说明它落在阈值哪一侧」，已实现（§2d 新增「Mellow 大文件模式」列并标注「恰好压线」） |

并新增**三方一致**护栏（PRD §109 ↔ `largeFile.ts` ↔ benchmark 复刻）：
只锁实现与 benchmark 仍可能双双偏离 PRD，故三处同时锁。注入验证：
把 PRD 的 `>5MB` 改成 `>=5MB` → 护栏报错；还原 → 通过。

### 3.2 任务 30 属**PRD 与现实的冲突**（按 AGENTS.md 须报告、不擅自裁决）

> **⚠️ 引用更正（2026-09-30）**：本节原写「PRD §132 的任务清单（第 17 项「10 MB」）」——**该引用不成立**，已核实并更正：
> 1. **PRD §132 不含任务清单**：该节原文只有一句「30 个核心 Typora 任务：」+ 四条阈值（≥90% ≤ Typora+5% / 关键任务不慢 >15% / 错误率不高于 Typora / IME corruption = 0 / data loss = 0），**没有逐项枚举**。
> 2. **30 项清单的载体是模板**：`docs/qualification/ux-score-gate-template.md` §二的任务表（**30 行**，已实跑核对），并由 master plan §9.5 指定为唯一来源（「沿用 `ux-score-gate-template.md` 的 30 项」）。
> 3. **10MB 是模板第 30 项**，不是第 17 项（模板第 17 项 =「Mermaid 代码块 → 渲染 → 修正错误」；记录器 `TASKS[16]` 同为 `Mermaid 修正`）。
> 4. **PRD 侧对应的是 §129 J18**（「10MB：Open → search → edit → save」，§129 开头即「必须全部通过」），不是 §132。
>
> 更正后，本节需区分**两个层级**（详见下方）。

**层级一（模板/方法论，非宪法）**：效率 Gate 的**第 30 项用多大夹具**是**模板自定**的 ——
PRD §132 只规定「30 个核心 Typora 任务」的数量与阈值，未规定夹具尺寸。
故「把任务 30 的对照尺寸改为 ≤2MB」不违反 §132，属**方法论修正**；
但它改变门禁实际度量的对象，仍须走 ADR 登记（ADR-0025 Q3），**不擅自改**。

**层级二（宪法级冲突，须报告）**：PRD **§129 J18**（10MB 全流程，§129 要求「必须全部通过」）
与 **§110**（「不能只用绝对指标。必须：同机型与 Typora 对照。」）**互相冲突** ——
J18 要求 10MB 通过，而 **Typora 1.14.9 根本不渲染 >2,000,000 字符的文档**（一级证据见 ADR-0025 事实一），
基线产品上**不存在可比行为**。这属于 AGENTS.md「实现与 Spec 冲突 → **不要自行修改架构，先报告冲突**」，
故只登记、不处置。

## 四、⚠️ 追加发现：「6 项未闭环」是**门禁口径**，不等于「只差 6 项」

门禁把 `AUTO` 视为**不阻断**，但 master-plan §4.3 对 `AUTO` 的定义是
「自动化测试通过，**真机体验验收未完成**」，而 §8 的 V1.0 Exit Gate 要求
「Windows / macOS / Linux 全 PASS-E」。两者口径不同：

| 口径 | 结果 |
|---|---|
| 本门禁的「不阻断」口径（PASS-E / PASS-B / AUTO） | 44 项不阻断 → **NO-GO：6 项未闭环** |
| master-plan §8 的 V1.0 Exit Gate（全 PASS-E） | **0 / 50 达 PASS-E** |

**实测数字**：`PASS-E = 0/50`；其中 **4 项标 `AUTO` 却把 `ux-gate` 写进了
`requiredEvidence`**（`P0-EDITOR-001`、`P0-EDITOR-003`、`P0-SHELL-001`、`P0-MENU-001`）——
即它们自己声明需要人工门禁，却被按「不阻断」处理。

**为什么这条必须写出来**：master-plan §5.7 已经记录过一次同类事故 ——
`P0-SHELL-003` 的 `AUTO` 状态**把一个完全不可用的功能当作已闭环**
（浮动工具栏因 CM6 update 周期内读布局而永不显示；单测只覆盖纯函数
`shouldShowToolbar`，属「有测试但不工作」）。把 `AUTO` 读作「已完成」在本项目有前科。

**本轮改动**：门禁输出新增 `Closure basis:` 一行，显式声明口径、报出 `实际 PASS-E = 0/50`、
列出「标 AUTO 却要求 ux-gate」的项，并保留 §5.7 的警示。**未改动门禁语义**
（`AUTO` 是否应阻断属口径决策，不在本轮擅自变更）。护栏锁住这四行不得被删除（含 canary，
注入验证：改写 `Closure basis:` → 护栏报错；还原 → 通过）。

### 4.1 `AUTO` 项的**证据引用**审计（2026-09-29）

`AUTO` 的定义是「**自动化测试通过**」，且门禁把它视为**不阻断** ——
即 `AUTO` 是「靠自动化撑着」的闭环状态。故本轮逐项核对：**44 个 `AUTO` 项是否真的引用了
CI 可执行的制品？**

**发现：7 项没有任何 CI 可执行证据**（只引 docs / qualification 记录），
其中 5 项引的是 `tests/e2e/*.mjs` —— 而 **e2e 不进 CI**（会悄悄腐烂）：

| 项 | 原 evidence | 实际情况 |
|---|---|---|
| `P0-I18N-001` | PRD + `packages/i18n`（目录） | `packages/i18n/test/index.test.ts` **存在** |
| `P0-EXPORT-001` | 仅 docs | `packages/export/test/` 有 7 个单测 |
| `P0-THEME-001` | `packages/themes/src/index.ts` + spec | `packages/themes/test/index.test.ts` **存在** |
| `P0-SHELL-004` | `StatusBar.tsx` + menuSchema | `packages/desktop-ui/test/statusbar-defaults.test.ts` **存在** |
| `P0-SIDEBAR-001/002` | docs + `tests/e2e/sidebar-verify.mjs` | `packages/app-core/test/{fileTree,fileList}.test.ts` **存在** |
| `P0-SHELL-001` | docs + e2e | `tests/parity/verify-visual-golden.mjs` **存在** |
| `P0-EDITOR-002` | docs + e2e | `packages/editor-engine/test/source-mode-api.test.ts` **存在** |
| `P0-FILE-003` | `App.tsx` + `menuSchema.ts`（实现） | `packages/app-core/test/fileOpHistory.test.ts` **存在** |
| `P0-BASELINE-001` | 仅文档 | 其 `requiredEvidence` 含 `ledger-validation` → 应引 `verify-parity-ledger.mjs` |

**即：这些项其实有 CI 执行的单测，只是台账没引用** ——
引用缺位让证据看起来比实际弱，更糟的是**把读者指向最弱、会腐烂的那份制品**（e2e）。

**处置**：补齐 10 处引用（`P0-*` 各 1–2 处），并新增护栏
**「`AUTO` 项的 evidence 必须至少引用一份 CI 可执行制品」**
（parity 护栏 / 单测文件（含 Rust 的 `tests/`）/ CI workflow）。
非 AUTO 项不约束 —— `P0-QA-001` 是人工 UX Gate，本就无可执行证据，属正确状态。
注入验证：把 `P0-I18N-001` 的单测引用换回 e2e → 护栏报错；还原 → 通过。

**审计后状态**：44 个 `AUTO` 项**全部**至少引用一份 CI 可执行证据（0 违规）。

> **补充（2026-09-30）：那次处置**只补了具体文件，没有摘掉原有的弱引用，也没有护栏防复发。
> 实跑复核后仍有两处 `evidence` **指向目录**（`existsSync` 对目录同样返回 true，故照样通过）：
>
> | 项 | 指向目录的 evidence | 是否丢信息 |
> |---|---|---|
> | `P0-I18N-001` | `packages/i18n` | 否（同一数组里已有 `packages/i18n/test/index.test.ts`） |
> | `P0-PLATFORM-001` | `tests/qualification/evidence` | 否（已有该目录下的具体证据文件） |
>
> 目录**不可核对** —— 你不知道里面哪一份、也不知道它是否还在。
> 已摘掉这两处，并新增护栏：**`evidence` 必须指向文件而非目录**
> （`items` 与 `patchObservations` 两处都加，含 canary）。
> 顺带清掉 9 处畸形逗号（`"…"\n      ,\n"…"`）—— 那是当时**脚本化插入**新条目留下的痕迹
> （JSON 语义合法，但说明那次改动是「追加」而非「替换」）。

### 4.2 「证据已齐备」必须实跑核对（同日，针对 P0-LAYOUT-002）

台账自述 `P0-LAYOUT-002` 的「3 平台 × 3 类基线全部入库并进入比对模式」。
实跑核对：`ls tests/visual/golden/*.json | wc -l` → **9**（3 类 × 3 平台），**结论成立**。
但核对同时发现另外两种失效模式（结论对 ≠ 一切正常）：

1. **守它的不变量不存在**：`verify-visual-golden.mjs` 此前**只校验 macOS 主基线**，
   其余 6 个平台基线文件被删除也无任何信号 → 三平台覆盖会**静默退化**为单平台。
   已补断言（9 文件齐备 + 非空 + 含核心条目）+ canary；注入验证：移走
   `layout-golden.windows.json` → 护栏抛错。
2. **承载它的文档自相矛盾**：`2026-09-22-v1.5.14-three-platform-runtime-qualification.md`
   里**同文档**的 §4.1/§4.3 已记录 Windows 基线修复完成，而 §4.4 / §五 仍写「待 runner 确认」；
   **同文档**的 §五 还留着**已作废**的「10MB 打开 2.59× 于 Typora」（该 Typora 侧数字实为画提示页的耗时）。
   已**透明追加更正块**（不改写历史记录）。


## 4.3 安全相关默认值被改回，且**只有代码注释作为记录**（2026-09-30）

**事实**：`packages/editor-engine/src/image/widget.ts` 的 `remoteImagesEnabled()`
在 `localStorage` 键缺失时返回 **`true`**，设置 `image.loadRemote` 的 `defaultValue` 也是 **`true`**
→ **远程图片当前是「默认加载」**。

**矛盾之处（三处）**：
1. 同一文件第 184 行注释写「Security M2：远程图片**默认不加载**」——**与实现相反**（已更正）；
2. `docs/qualification/v1.0-final-release-review-2026-08-16.md` 把 M2 标为
   「✅ **已修**：新增「加载远程图片」设置**默认 Off**」——**结论已被后续改动推翻**（已加更正块）；
3. 同文件另一条注释写「V6-P1 1.2.6：远程图片**默认自动加载**（Typora 行为）」——
   说明这是**后续有意对齐 Typora** 的改动。

**为什么值得单独列出来**：M2 曾被 2026-08-16 的发布评审列为**安全类 blocker**
（「远程图片打开即隐式加载（默认联网冲突）」）。把默认值改回「加载」意味着：
打开含 `![](http://…)` 的文档会**立即联网**，向第三方暴露「你打开了这份文档」与来源 IP
（经典 tracking-pixel 场景）。这**可能是**正确的 Typora parity 取舍，
但它属于**安全相关默认值**，当前**只由一行代码注释记录**，未见 ADR / 方案 D 表登记。

**✅ 已由证据判定，无需裁决（2026-09-30 同日补充）**：

两处**独立一级证据**（本机 Typora 1.14.9）表明 **Typora 始终加载远程图片、且没有退出选项**：
1. `TypeMark/appsrc/window/frame.js` 的 `DEFAULT_OPTIONS` —— 6 个图片相关键
   （`allowImageMove` / `allowImageUpload` / `defaultImageStorage` / `applyImageMoveForWeb` /
   `applyImageMoveForLocal` / `autoEscapeImageURL`）**没有任何「加载远程图片」开关**；
2. `Contents/Resources/{zh-Hans,Base}.lproj/Panel.strings`（498 / 500 条）—— 图片相关文案只涉及
   **上传 / 复制 / 移动 / 质量 / 格式 / 转义 URL**，**没有「远程图片 / 联网」选项**。

**结论**：Mellow 的 `image.loadRemote` **默认 `true` 与 Typora 行为一致**，
符合 AGENTS.md 规则 14（Typora 1.14.9 为功能验收基线）；且 Mellow **额外提供退出选项**，
在同等默认下比 Typora **更隐私友好**。PRD §124 的隐私默认（Telemetry / AI / Cloud OFF、
Document Upload NONE）约束的是**Mellow 自身的服务**，不涉及「渲染用户内容里的远程资源」——
Typora 对图片**上传**才要求显式确认（`Panel.strings`：「Typora 会调用第三方软件和服务…是否继续？」），
Mellow 的图片上传同样是独立 opt-in 路径。

→ **维持现状，无需改动。** 原 M2 处方（默认 Off）实为**偏离 parity 基线**的处置；
后续改回 `true` 是对齐基线的正确方向，只是**当时只留了代码注释**（已在本轮补记于 §4.3）。

**残余（属「超出 parity 的隐私偏好」，需显式裁决才可偏离基线）**：若产品希望**比 Typora 更严**
（默认不加载、点击才加载），那是对基线的**有意偏离**，需在方案 D 表登记并说明取代关系 ——
本环境不擅自偏离基线。

**已加护栏**：设置侧 `defaultValue` 与引擎侧回退值**必须一致**
（单侧改动会造出「设置显示关、实际仍加载」这类屏幕上看不出的错配）。
注入验证：把设置默认改成 `false` → 护栏报错；还原 → 通过。

## 4.4 「Security」是 18 项验收之一，但**台账里没有安全域**（2026-09-30）

**事实**：`v1.0-final-release-review-2026-08-16.md` 的 18 项验收里，第 **17 项是 Security**
（当时判 FAIL，blocker 为 M1 CSP 缺失、M2 远程图片默认加载）。
但台账 `tests/parity/typora-parity-ledger.json` 的 **19 个域里没有安全域**
（acceptance / baseline / build / clipboard / desktop-ui / editing / export / feature /
file / i18n / image / layout / markdown / menu / performance / platform / sidebar /
table / theme），**也没有任何安全相关条目**。

**后果**：安全验收的状态**只存在于 2026-08-16 的快照里**（该快照判 FAIL），
而发布门禁（`verify-release-gate`）读的是台账 —— **它看不见安全这一项**。
即：18 项验收里的第 17 项**不在任何可跟踪的看板上**。

**本轮的处置（只做不改变治理的部分）**：
- **M1（CSP）**：核实**已修复**（`tauri.conf.json` 现配有完整 CSP），并新增护栏锁住
  修复的核心不变量（CSP 非空 + 含 `default-src 'self'` + `object-src 'none'`）；
  **不锁** `unsafe-inline`/`unsafe-eval` —— PRD §48 的「no script / no inline events」
  针对**渲染出的 HTML**（sanitize 路径），不构成对 app shell CSP 的要求，
  不在此发明更严约束。注入验证：`csp: null` → 护栏报错；还原 → 通过。
- **M2（远程图片默认值）**：见 §4.3，属待裁决项。

**待裁决**：安全验收是否应进入台账（新增安全域与条目）？
这属**治理结构变更**（台账的域与条目集合），本环境不擅自改动。

> 18 项的**当前状态**已单独重新评估：`docs/qualification/v1.0-acceptance-reevaluation-2026-09-30.md`
> （逐项给出可核对来源；无法验证的一律标 `NOT TESTED`，不推断）。

## 4.5 macOS 签名公证：job 名宣称了它**无法保证**的属性（2026-09-30）

**事实**：`release.yml` 的 macOS job 名为 `macOS (Signed + Notarized + DMG)`，
但其「Configure Apple signing env」步骤在凭据缺失时只执行：

```bash
else
  echo "Apple 凭据未配置：产出未签名 DMG"
fi
```

即**只 echo 一句然后继续** → job 仍然 `success`，产物是**未签名、未公证的 DMG**。
而 **ADR-0020 §2 要求 V1.0 必须「macOS 签名公证」**。

**后果（两层）**：
1. **名称在骗人**：绿色 job 名写着「Signed + Notarized」，实际可能完全没有签名 ——
   与「菜单护栏谎称读了本机 Typora」「CI 步骤名内嵌已漂移的用例数」**同一类**；
2. **V1.0 的签名要求无人守**：发布管线无论有无凭据都走同一条成功路径，
   **不存在任何东西在检查「这次发布是否真的签了名」**。

**本轮的处置（不改发布行为）**：
- job 名改为如实描述：`macOS (DMG；有 Apple 凭据时签名 + 公证)`，并在其上方写明原因；
- 新增护栏锁定**不变量**：「**要么保证签名（凭据缺失即硬失败），要么名称不宣称签名**」——
  若有人把名称改回宣称 `Signed`，护栏会要求同时把凭据缺失改为 `exit 1`。
  注入验证：把名称改回 `Signed + Notarized + DMG` → 护栏报错；还原 → 通过。

**待裁决**：V1.0 发布时是否应把「Apple 凭据缺失」改为**硬失败**？
（即：把「macOS 签名公证」从纸面要求变成发布管线的强制前置。）
这属**发布行为变更**，可能阻断 pre-release 打包，本环境不擅自改动。

## 4.6 §10 的「PDF CJK garble」此前只有**冒烟测试**在守（2026-09-30）

**事实**：master plan §10 把「PDF CJK garble」列为**发布阻塞项**，
V1.0 验收 18 项的第 13 项也依赖它。而 `packages/export/test/index.test.ts` 里
唯一涉及 CJK 的断言是：

```ts
const buffer = await createPdfBuffer('# 中文标题\n\n这是中文段落测试。\n\nEnglish paragraph.', ...);
expect(String.fromCharCode(...buffer.slice(0, 5))).toBe('%PDF-');
expect(buffer.byteLength).toBeLessThan(3 * 1024 * 1024);
```

即：**只证明「管线跑通了、产出了 PDF」**，**测不到「CJK 变乱码」**。

**为什么这是「有测试 ≠ 测到了」**：garble 有两个**互相独立**的失效面，
冒烟测试对两面都无感：

| 失效面 | 机制要求 | 缺了会怎样 |
|---|---|---|
| **字形**（看得见） | 嵌入子集（`/FontFile2`） | 换机器/换字体环境 → 字形缺失或回退成方框 |
| **码位**（复制/搜索对不对） | CJK 走 `/Type0` + `/Identity-H`，此时**字符码 = 字形 id** → 必须有 `/ToUnicode` CMap 才能映回 Unicode | **屏幕看着完全正常，复制出来却是乱码** —— 最典型的「屏幕上看不出异常」 |

**本轮实跑（本机 macOS，pdfmake 0.3.11 + Noto Sans SC 子集）**：
四个标记**全部命中**（`/Type0`、`/Identity-H`、`/CIDFontType2`、`/FontFile2`、`/ToUnicode`），
且原始字节中**不含** UTF-8 明文中文（符合 Identity-H 的「码 = 字形 id」语义）。

**处置**：
1. 在 export 单测中新增**机制断言**测试（断言上述四个标记），保留原冒烟测试；
2. 新增护栏：export 单测**必须**断言 `/ToUnicode`、`/FontFile2`、`/Identity-H` ——
   防止测试被悄悄退回冒烟状态。注入验证：删掉 `/ToUnicode` 断言 → 护栏报错；还原 → 通过；
3. V1.0 验收第 13 项由「⏳ 未复核」改为「✅ 已复核（有 CI 机器依据）」。

**同日加强：从「存在」到「正确」**。上一步只断言 `/ToUnicode` **存在** ——
而「存在但映射错」的后果与「不存在」**完全一样**：屏幕正常、复制出来是错字。
故再补一条**真解析 CMap** 的断言：

- 提取 PDF 里所有 Flate 压缩流，取含 `begincmap` 的（实测有 **2 份**：正文子集 + 粗体标题子集）；
- 解析 `beginbfchar` 与 `beginbfrange`（**两种形态**：`<lo> <hi> [<u>…]` 数组式 与 `<lo> <hi> <dst0>` 递增式）；
- 断言「**输入里每个 CJK 字符都能在映射的目标码位里找到**」。
  实测：15 个目标码位，输入 10 个 CJK 字符**全部命中**。

> **解析时踩到的坑（已写进测试注释）**：递增式的正则若与数组式**分开写**，
> 会匹配到**数组内部的元素**（`<0000> <4e2d> <6587>`），造出 `lo=0..0x4e2d` 的伪区间 ——
> 实测污染出 **3 万多个假映射**，把「`中` 映射缺失」掩盖成通过。
> 修法：用**单条交替正则一次吃掉整个条目**（`(?:\[…\]|<hex>)`）。
> **教训：解析器的「多匹配」会伪装成「覆盖良好」。**

护栏同步加强：除三个标记外，还要求测试里存在 `extractToUnicodeCMaps` /
`parseToUnicodeCmap` 实现与「覆盖断言」本身（注入验证：删掉覆盖断言 → 护栏报错）。

**未做的事**：未改动导出实现、未改动 `%PDF-` 冒烟测试、未改动任何结论口径。
本项**仍不是 PASS-E**（§8 要求三平台真机 + ux-gate），本轮只把「谁在守」从冒烟提升到机制。

## 4.7 UX Gate 的「同一份测试文档」此前**没有参照物**（2026-09-30）

**事实**：门禁要求「同一台机器、**同一份测试文档**」下对照 Typora 1.14.9 与 Mellow
（模板 §二 执行方法第 1 条、§3.2 环境前置），但**没有任何文档被指定**——
原文只写「同一份测试文档（`tests/fixtures/`）」，而该目录下有 20+ 个夹具。

**为什么这不是小事**：30 项任务里**一半以上依赖特定内容**：

| 任务 | 依赖的内容 |
|---|---|
| 19 | 独立的 `[TOC]` 指令 |
| 18 | 脚注引用 + 定义 |
| 16 / 25 | 行内与块级数学 |
| 17 | **一处真正写错的 Mermaid**（要求「渲染 → 修正错误」） |
| 11 | 带左/右/居中对齐标记的表格 |
| 12 | 可写入的 `assets/` 与相对路径图片 |
| 10 / 09 | 任务列表、嵌套列表 |
| 20 | 多级标题（大纲层级） |
| 28 / 29 | 可被外部编辑器修改的文件 |
| 03 / 04 | 同目录下多份文档（切换 / Quick Open） |
| 30 | 10 MiB 夹具（生成物，不入库） |

不指定 → **三场平台会话各用各的文档**，任务内容不可比；「修正错误」「加一行」
这类动作也无从复现。而这类缺口在人工会话里的表现是「**跳过该任务**」——
即一条**静默缺失的观测**（屏幕上看不出）。

**处置**：
1. 新增 `tests/fixtures/ux-gate/`：主文档 `ux-gate-30tasks.md`（各节标题前缀标明服务哪项任务）
   + 第二文档 `notes.md` + `assets/gate-placeholder.png`（确定性生成的真 PNG）+ `README.md`
   （含使用约定、证据命名、任务 30 的生成命令与已知障碍）；
2. 模板 §二/§3.2 由「同一份测试文档（`tests/fixtures/`）」改为**指定**该目录；
3. 新增护栏：断言该目录存在、≥3 个 `.md`、图片是真 PNG，且主文档**结构上**具备
   上表各项能力。

**护栏必须结构判定，不能查「文本出现过」**（本轮踩到并已修）：第一版用裸子串断言，
结果**删掉真实的 `[TOC]` 指令行后护栏仍绿** —— 因为正文里有一句说明文字
「点击文首的 `` `[TOC]` `` 生成的目录项」，把断言满足了。同理「含『故意』二字」
也可被说明文字满足。已改为：指令类用行锚点（`^…$`）、脚注引用要求**紧贴正文**
而非被反引号包住、任务 17 的「可修正错误」直接**判定 Mermaid 围栏括号是否不平衡**。
注入验证四个方向（删 `[TOC]` 指令 / 把 Mermaid 修好 / 删脚注定义 / 降级 H4）均报错。

## 4.8 「步骤名不得内嵌数字」的护栏**只覆盖了一个 workflow**（2026-09-30）

**事实**：`verify-release-gate.mjs` 的「CI 步骤名不得内嵌用例数」护栏**只读 `ci.yml`**
（`const ci = read('.github/workflows/ci.yml')`）。仓库共有 **3 个** workflow。

实跑枚举三个 workflow 的全部步骤名，抓到一个存活实例：

```
runtime-qualification.yml  27 个步骤名，含 2+ 位数字的 2 个（同一名字出现两次）
  Visual golden (§9.3, 14 scenes)     ← Linux job 与 Windows job 各一处
release.yml                24 个步骤名，含 2+ 位数字的 1 个
  Fill release notes and mark prerelease (ADR-0020)   ← 这是**引用**，不是计数
ci.yml                     22 个步骤名，0 个
```

**「14 scenes」对不上任何来源**（这正是它该被删的理由）：

| 来源 | 数量 |
|---|---|
| `tests/visual/golden/scenes-golden.json` 键数 | **7** |
| `tests/visual/golden/sidebar-golden.json` 键数 | **4** |
| `tests/visual/golden/layout-golden.json` 键数 | **6** |
| 三者合计（任何工具都能算出来） | **17** |
| master plan §9.3 的场景清单条目数 | **13** |
| 把 `Light / Dark` 拆成两项才得到 | **14** ← 就是被写进步骤名的那个数 |
| `release-notes-v1.5.6.md` 自己的算术 | 写「**14 场景**」却又列「6 + 4 + 7」= **17** |

即：它是**输出里一个没人校验、且依赖一个没有写明的约定**的数字 ——
「14」只有在「`Light / Dark` 算两项」时成立，而这一点从未写在任何地方；
发布说明里更是**同一句话内自相矛盾**（说 14，列 6+4+7）。与 ci.yml 里那批
「Unit tests (host-api 43 / …)」同类（后者已全部漂移并被移除）。

**处置**：
1. 护栏扩展到**全部三个 workflow**；并引入**引用豁免** —— 先剥掉 `ADR-\d+`、`§\d+(\.\d+)*`、
   `v\d+(\.\d+)*`、`G7-EDIT-\d+`、`P0-XXX-\d+`、`#\d+` 再看是否还剩 2+ 位数字
   （否则 `release.yml` 的 `(ADR-0020)` 会被误报 —— 它是**引用**，不是计数）；
2. 步骤名改为 `Visual golden (§9.3: visual + sidebar + scenes)` —— 直接写出脚本名，
   **不再有任何数字**，因此不可能漂移；
3. master plan §9.3 加**计数更正**块（保留清单，删掉无法派生的数字），
   并同步清掉该文件内其余 6 处引用（契约表、W2.9 待办、交付物说明、§9.3 正文）；
   `tests/visual/{scenes-golden,golden-path}.mjs` 与 `verify-visual-golden.mjs`
   的注释同源数字一并更正（共 8 处）。**历史记录不改写**：
   `release-notes-v1.5.6.md` 与 `macos-local-verification-2026-09-12.md`
   保持原样（已发布的快照），其自相矛盾在本文记录；
4. `verify-release-gate.mjs` 自身注释里那批**会继续漂移的当前值**（host-api 43→47 等）
   也一并去掉，只保留一处**注明日期的实证**（「给 export 补一个测试，该包计数即从 83 变成 84」）——
   它自己就是这条规则的反例。

**注入验证**：往 `runtime-qualification.yml` 塞一个含计数的步骤名 → 护栏报错；
还原 → 通过；`release.yml` 的 `ADR-0020` 不触发（豁免有效）。

## 4.9 「大文件模式阈值」的**生产路径**既无单测也无护栏（2026-09-30）

**背景**：master plan §10 把「10MB 不可编辑」列为发布阻塞项，PRD §109 定义 Large File Mode
的触发为 `>5MB` / `>50,000 lines`（**严格大于**，宪法条款）。
已有一条「三方一致」护栏：**PRD §109 ↔ `editor-engine/src/largeFile.ts` ↔ `run-benchmark` 的复刻**。

**实跑核对发现：这三方都不是应用真正走的判定。**

| 位置 | 角色 | 生产是否使用 |
|---|---|---|
| PRD §109 | 宪法依据 | — |
| `editor-engine/src/largeFile.ts` 的 `classifyLargeFile()` | 纯函数，有单测 | **否**：全仓**没有任何生产调用点**（只有测试调用） |
| `run-benchmark.mjs` 的 `MELLOW_LARGE_FILE_*` | benchmark 复刻 | 否（只用于报告标注） |
| **`editor-core/src/core.ts`** | **应用真正走的判定** | **是** —— 但它把阈值**内联重复**了一份 |

```js
// packages/editor-core/src/core.ts
// 阈值与 editor-engine/src/largeFile.ts 同步维护（包间不引依赖，故内联）。
const large = bytes > 5 * 1024 * 1024 || lines > 50_000;
```

**为什么这是真缺口**：把 `core.ts` 这一行改成 `>=`、或把阈值改小，
**应用行为立刻改变**，而 PRD / `largeFile.ts` / benchmark **三者仍然自洽**、
`npm run parity` **全绿** —— 一条**屏幕上看不出**的宪法级漂移。

**与既有母题的镜像关系**：本项目记录过「已实现 ≠ **有消费方**」（`setIndentUnit` 全链齐备但无人读）。
这里是它的镜像：**被测试的那个函数没人用，被用的那段没人测。**
两者都源于「真值散落多处而只有一部分被锁」。

**内联是否可避免**：暂时不可。包依赖方向是 `editor-engine → editor-core`，
editor-core **不能**反向 import 引擎（成环）。故内联是**必要的**，
补偿控制只能是**护栏**（而非消除重复）。

**处置**：把「三方一致」扩为**四方** —— 新增对 `core.ts` 的断言：
1. 两个阈值必须能从 `core.ts` 解析出来并与 `largeFile.ts` **数值相等**
   （**解析不到就响亮失败**，不静默漏检 —— 例：有人给表达式加括号，护栏会报「无法解析」）；
2. 判据方向必须同为「严格大于」（`>` 而非 `>=`）；
3. 附 canary，**含反例**：`>=` 样本必须**不**被当作「严格大于」。

注入验证三方向：阈值改 4MB → 报「生产路径 ↔ 引擎不一致」；改成 `>=` → 报方向错；
改成加括号写法 → 报「无法解析」。均还原后复绿。
另在 `largeFile.ts` 的文件头写明「本函数无生产调用点 + 真正生效处 + 四方同锁」，防下一个人误判。

**未做的事（如实说明）**：**没有**给这条路径加**行为**测试 ——
`core.ts` 的判定发生在 WebView/iframe 装配路径上，dev harness 天然测不到
（按本项目既有做法，如实降级为**静态契约断言**并写明，不改断言求绿）。
即：本项仍是**静态不变量**被守住，**不是**「10MB 可编辑」已被真机验证 ——
后者属 PASS-E（三平台真机 + ux-gate），**不在本轮口径内**。

## 4.10 菜单护栏**声称**覆盖 `menuContract.ts`，实际从未读取它（2026-09-30）

**事实**：`tests/parity/verify-menu-contract.mjs` 的文件头把
`packages/commands/src/menuContract.ts` 列为「覆盖的源码」之一，但**全文件从未读取该文件** ——
第 1 节把顶层顺序**自己硬编码**了一份（`const TYPOGRAPHIC_MENU_ORDER = [...]`），只与 `menuSchema.ts` 比对。

于是顶层顺序存在**三份**副本：`menuSchema.ts`（真值源）、`menuContract.ts`、**护栏自己**。
护栏锁住了「真值源 ↔ 自己」，而 `menuContract.ts` 那份**无人核对**。

**为什么这不是无害的**：`menuContract.ts` 是从包入口 `export *` 出去的**公开合同**，
其 `MENU_COMMAND_CONTRACT` 还额外声明了 15 条高频命令的**归属**。
把 schema 里 `format.bold` 挪到 paragraph，护栏（只比顺序）照样通过 —— 合同静默变假。
这与「菜单护栏谎称读了本机 Typora」同类：**声称的覆盖 ≠ 实际的覆盖**。

**实跑核对结果（真读它之后当场抓到 2 条陈旧条目）**：

| 合同条目 | schema 实际 | 判定 |
|---|---|---|
| `{ id: 'settings.open', menu: 'help' }` | 在 **`app`**（macOS 应用菜单，`macOnly`） | **合同错**（`app` 是本合同按定义排除的平台 chrome） |
| `{ id: 'insert.mermaid', menu: 'paragraph' }` | schema 里**没有该命令** | **合同错**（段落菜单有意不设 code/math/mermaid 分组，见 schema 该处注释） |
| `{ id: 'edit.undo', menu: 'edit' }` | 是 `{ kind: 'predefined', predefined: 'undo' }` | 不是错 —— 但护栏需要**显式映射**「OS 预定义角色 ↔ 合同命令 id」才能核对 |

**处置**：
1. 护栏新增 §1b：**真的读取** `menuContract.ts`，逐条核对 ——
   顶层顺序必须与产品合同一致；每条命令的归属必须等于它在 schema 里的**实际**顶层菜单；
   引用 schema 中不存在的命令即失败。
2. **动态派生 id 不盲目豁免**：schema 只声明占位（`recent-files` / `themes`），
   具体 id 运行时展开 —— 改为校验它归属「**声明该占位的那一级**」
   （`theme.apply.*` 必须落在含 `dynamic: 'themes'` 的那一级）。
   前缀与所属级**从 schema 派生**；出现护栏不认识的动态类型即**响亮失败**。
3. OS 预定义角色用**显式小映射**（`undo`/`redo` → `edit.undo`/`edit.redo`）+ canary。
4. 修正合同的两条陈旧条目（保留说明注释）。
5. mutation 沙箱补上 `menuContract.ts`（新依赖必须进沙箱，否则自检假失败 —— 上轮刚踩过），
   并新增 3 个用例：归属漂移 / 顶层顺序漂移 / 引用不存在的命令。
   自检由 29 → **32** 个注入缺陷全部被拒。

> **护栏自己踩到的坑（同类，已修）**：我在合同里写的「已移除 `{ id: 'settings.open', … }`」
> 说明注释，被护栏**当成真条目**解析出来并报成违规 —— 即 skill 里记的
> 「**注释被计入**」。修法：**先 stripComments 再解析**（`//` 与 `/* */`）。

### 4.10.1 顺带发现（**待裁决，本轮不擅自处置**）

**`settings.open` 在 Windows / Linux 的菜单里没有入口。**

| | macOS | Windows / Linux |
|---|---|---|
| Typora | 应用菜单 → Preferences（⌘,） | **File → Preferences**（Ctrl+,） |
| Mellow | 应用菜单 → 设置（⌘,）✅ 对齐 | **菜单无此项**；仅 `Ctrl+,` 键盘 + 命令面板 |

该设计**已实现且已被护栏锁住**（`verify-menu-contract.mjs` §11 平台互补键位专项，
断言 `settings.open` 必须有 Win/Linux 的 `Ctrl+,` 键盘键位；`App.tsx` 内联补充该键位）。
但它的理由**只写在代码注释里**（`verify-menu-contract.mjs:320/569/674-677`、`App.tsx:5249`），
**未登记进 master plan 的 D 表** —— 而 D-AC 的教训正是：

> 「该裁决此前**只写在护栏注释与断言里**，方案正文从未登记 …… 因发现 `view.readonly.toggle`
> 『能力已实现但菜单不可达』而**误加了菜单项**，被该护栏当场拦下。
> **教训：护栏注释不是决策登记处 —— 裁决必须进本 D 表，否则后续轮次无法发现。**」

即：当前状态**正是 D-AC 描述的那类条件**。本环境**不擅自登记**（D 表是裁决登记处，
「属有意差异 D 还是缺口」需要你判断），仅在此登记该观察。

> **✅ 2026-10-01 更正（本节的自述已过期）**：该裁决已由 **ADR-0029 Q1 = A3** 裁定，且**理由早已登记进
> master-plan §12 的 `D-AF` 行**（登记于 **2026-09-30**，即本节写下当天）。本节上面那句
> 「**未登记进 master plan 的 D 表**」是**当时的观察，不是现状**。
>
> ⚠️ **这条过期自述造成过一次实际后果**：ADR-0029（2026-10-01）的 Q1 背景**采信了本节**，
> 把「未进 D 表」当成待办 —— 于是在 2026-10-01 做「Q1 的 D 表登记」时**差点重复登记一条已存在的裁决**。
> **处置**：不新建编号，只补 ADR ↔ `D-AF` 的互相指认；并新增护栏锁「凡被引用的 D 编号必须有声明行」。
> 经过与教训见 **§4.67**。

## 4.11 权威文档里的 `文件:行号` 引用已漂移，而「越界检查」查不出来（2026-09-30）

**背景**：施工计划 / ADR / spec 里用「**`符号`（`文件:行号`）**」的形式指向代码，
作为结论的依据。行号会随重构漂移，但**行号仍在文件范围内**这件事**掩盖了**漂移 ——
读者按图索骥看到**无关代码**，可能据此判断「该结论无据」。
**行号有效 ≠ 引用有效。**

**实跑核对（扫描 41 份权威文档，只认「符号紧跟括号内 路径:行号」的紧邻形态）抓到 3 处**：

| 文档 | 原引用 | 该行实际内容 | 正确位置 |
|---|---|---|---|
| master-plan G7-MENU-07 / D-AA | `insertLocalImage`（`App.tsx:1530-1536`） | `setCommandPaletteRecent((prev) => {` | `App.tsx:1721-1739` |
| master-plan G7-MENU-07 | `image.uploadAll/downloadRemote/moveAll/copyAll`（`menuSchema.ts:328-333`） | `format.referenceLink` 那一段 | `menuSchema.ts:367-370` |
| master-plan G7-FEAT-02 | 非 macOS 页面设置降级为 `Err`（`window.rs:108-128`） | `window` / `set_title` / `install_close_gate` | 前端守卫在 `App.tsx:4880-4883`；Rust 侧 `Err` 在 `window.rs:153` |

第三处顺带澄清了一处措辞：原文说「改为 `platformMac` 守卫」——
`platformMac` **确实存在**（`App.tsx:4880` 的 `if (!platformMac)`），但**不在被引的 window.rs 里**。

**处置**：
1. 修正上述 3 处（4 个引用）；
2. 新增护栏 `tests/parity/verify-doc-code-refs.mjs`（第 15 个护栏，已接入 `test` 与 `parity` 两条链）：
   断言紧邻形态的引用**必须能在被引行范围（±2 行）内找到该符号**；行号越界单独报错；
   文件在仓库内找不到 → **响亮失败**（不静默跳过）；同名文件不唯一 → 计入汇总的「未判定」数（**可见**）。

**护栏自身的两个坑（都踩到并已修，均为既有失效模式的复现）**：
- **解析器漏成员**：扩展名过滤写成 `CODE_EXT.slice(4, -1)`，把 `(?:ts|…` 切成 `s|tsx|…`
  → **`.ts` 整类被静默漏掉**，`menuSchema.ts` 因此从未被判定，而输出看起来正常。
  修法：显式列举扩展名数组。
- **行号有效 ≠ 引用有效**：这正是本节要解决的问题 —— 所以本护栏**不做**越界检查了事。

**范围限制（如实声明，不要读成「文档引用已全部核对」）**：只覆盖紧邻形态；
41 份文档中仅 3 处属该形态 —— **覆盖率低是形态罕见，不是文档干净**。
其它写法（「见 `文件:行号` 的 `符号`」、散文里提行号、表格裸行号）**不在覆盖内**。

## 4.12 右键菜单契约扩展：允许「携带值的条目」（P0-EDITOR-005，2026-09-30）

**被挡住的缺口**：Typora 的文本右键菜单在**顶部**列出拼写建议，点某条就把该词替换成它。
这类条目的语义是「id + **值**」，而 `verify-context-menu-parity` 的模型是
「一条目 = 一个 `onClick: run('id')`」—— 只带 id 的命令表达不了「点的是哪条建议」。

**曾考虑的方案（已否决）**：给 `DIRECT_CALL_EXCEPTIONS` 登记 `text`。
否决理由：该例外**按 kind 生效**，登记 `text` 会**豁免整个文本菜单**（几十个条目），
而实际只需豁免 1 类条目 —— 正是 skill 记的「**例外按维度放大**」。

**采用的方案**：允许条目**经 `dispatchCommand` 携带 payload**（`onClick: run('id', <expr>)`）。
- 基础设施**本就支持**：`dispatchCommand(id, source, payload)` → `createCommandContext({…, payload})`
  → `CommandContext.payload`，**插件已在用这条通道**；缺的只是「菜单条目约定」与「护栏解析」。
- 该扩展**强化**而非削弱 §7.4 硬规则 11：携带 payload 的条目仍走同一条入口
  （同一 `enabledWhen`、同一 `rememberCommandRecent`、同一命令注册表），**无需**登记例外。

**落地（四件）**：

| # | 改动 | 验证 |
|---|---|---|
| ① | 引擎 `wordSpanAt()`（`wordAt` 改由它派生，边界规则永不漂移）+ 动作 `replaceWordAtCursor(replacement)`（含 Composition Guard；无词/无编辑器/CJK → false **且不改文档**） | 引擎单测 48 → 51 例；全量 75 套件 **1200 例通过** |
| ② | 桌面 `run(id, payload?)` + 命令 `edit.spelling.applySuggestion`（目标词区间由引擎按「光标处词」解析，宿主不猜位置） | 桌面 `tsc` 干净 |
| ③ | 文本右键**顶部**补入建议：系统建议异步取 → 先弹菜单、取到后**补入**；用**菜单代次 token** 丢弃「慢响应落到后开菜单」的陈旧结果 | 护栏（见④） |
| ④ | 护栏接受 payload 写法 + canary；`DYNAMIC_ITEM_KINDS` 声明文本菜单条数不定 | 注入「未注册 id」→ 护栏报错；注入「直连条目」→ 仍报 §7.4 违规 |

**⚠️ 实施中又被护栏抓住一次（这是好事）**：我最初把建议段写成
`if (req.kind === 'text' && req.word !== undefined && spellcheckAvailableSync()) {` ——
条件含括号 → **整块对护栏隐形**，护栏的**元护栏**当场报
「块解析数(9) ≠ 出现次数(10)」。按它文档化的指引把条件**移入块内部**后恢复。
即：那条元护栏在真实改动中第二次发挥了作用（第一次是它被加入时）。

**状态（如实）**：契约阻塞（`host-api-extension`）**已解除**；
但建议的**端到端运行时行为**（右键真的弹出建议、点击真的替换）**没有自动化测试覆盖** ——
它依赖 macOS `NSSpellChecker` 与真实右键交互。故本项**不标 `AUTO`**
（避免重演 §5.7「AUTO 把不可用功能当闭环」），而是显式保持未闭环，
`blockedBy` 由 `host-api-extension` 改为 **`runtime-verification-pending`**。
台账状态 `BLOCKED` → `IMPL`（`BLOCKED` 计数 2 → 1），未闭环总数仍 10。

## 4.13 复核（负结果）：44 项 `requiredEvidence` 不含 `ux-gate` **不是缺陷**（2026-09-30）

**现象**：`verify-parity-ledger.mjs` 断言「标记 `PASS-E` 前，`requiredEvidence` 必须含三平台证据 + `ux-gate`」；
而实测 **50 项里只有 6 项含 `ux-gate`**，另 44 项不含 —— 直觉上像「44 项结构上永远无法闭环」。

**复核结论：不是缺陷，是设计。** 该断言的作用是「**声明了才能声称**」——
`requiredEvidence` 列的是**该项当前被要求**的证据，而不是「要成为 PASS-E 所需的全部」。
任何一项在**声称 PASS-E 的那一刻**都必须先补齐 `ux-gate` 声明，断言在此把关。
即：44 项不是「无法闭环」，而是「尚未声明那一项要求」——声明与声称同时发生才可核对。

**顺带明确**：因此**不**给这 44 项补 `ux-gate`。补了会让门禁变成
「约 54 项未闭环」，等价于 ADR-0024 的 A2 选项 —— 而 A2 已被裁决否决
（理由：门禁失去 pre-release 通道的区分度）。当前 A3 + `Closure basis` 里的
`实际 PASS-E = 0/50` 已把「真相」显式报出，无需靠堆高未闭环数来表达。

> 记录本条的目的：**避免下一轮把同一现象重新当作缺陷**（「负结果也是结论」）。

## 4.14 最大护栏 `verify-settings-contract.mjs` 的断言**可被注释满足**（2026-09-30，已证实）

**扫描**：15 个护栏里 **6 个**已用 `stripComments`（`verify-context-menu-parity` / `menu-contract` /
`parity-ledger` / `shell-widgets` / `sidebar-contract` / `visual-golden`），
而 **`verify-settings-contract.mjs` 没有** —— 且它读的**代码文件最多（40 个）**。

**注入验证（已证实）**：把 `packages/editor-engine/src/image/insert.ts` 里
`const src = buildImageSrcFrom(target, docDir, rootDir)` **两处全部整行注释掉**
（即真实接线消失、只剩注释文本）→ **护栏仍然全绿**。
即它**无法发现「被断言的接线被删」**，与 §4.6 记录的「CJK 只有冒烟测试在守」同类，
但更隐蔽：**断言存在、且看起来在检查那行代码**。

> 这是本仓库反复出现的「**注释被计入**」失效模式；本次会话我自己也踩了两次
> （一次是自己写的说明注释满足了新护栏，一次是注释里的旧条目被解析成真条目）。

**风险分级（同日实测，先做分级再动手）**：用「剥整行注释」的版本重跑该护栏，
**当前代码仍然全绿（0 失败）** —— 即**没有任何断言是「当前靠注释通过」**。
故这是**加固**（挡住将来「把代码注释掉」这种停用方式），**不是修复现行缺陷**。
分级很重要：它把「护栏坏了」降级为「护栏缺一道防线」，避免过度处置。

**已实施的修法**：把该文件的 `read()` 改为「**代码文件（`.ts/.tsx/.mjs/.rs/.css`）先剥整行注释**」，
其它扩展名（`.json`/`.md`）保持原样。

- **只剥整行注释**，不用常见的「行内双斜杠剥离器」——后者会把**字符串/正则里的双斜杠**
  也当注释起点截断（实测：改用后者立刻误报 3 条，而那 3 条的目标文本确实在真实代码里，
  是被剥离器**误伤**）。
- **双向注入验证**：把 `insert.ts` 里被断言的 `const src = buildImageSrcFrom(…)` 两处
  **整行注释掉** → 护栏 **EXIT=1**（抓到了）；还原 → **EXIT=0**。

> ⚠️ **实施中踩到两次同一个自伤（第二次才定位）**：我在**说明注释里写了剥离器的正则示例**，
> 而该示例含字面量 `*/` → **提前终止块注释** → 护栏文件 SyntaxError。
> 教训：**注释里不要写字面量 `*/`**（哪怕是在举例）；改护栏本身时，先确认能一键还原再动手。

## 4.15 `image-workflow-spec` §12 声明的 `save as` 场景**零覆盖**（2026-09-30）

**扫描方法**：spec §12「Tests」声明「24+ scenarios」并列出 10 个类别；
把每个类别**逐条映射到实际测试**（不用关键词 grep 下结论 —— 上一轮刚证明那会骗自己）。

**结果**：image 测试共 **12 个文件 / ≈199 个用例**（「24+」满足 ✓），10 个类别里 **9 个有覆盖**：

| 类别 | 覆盖 |
|---|---|
| paste / drag / multi | `image-input.test.ts`、`image-insert.test.ts` ✓ |
| relative | 8 个文件（`imageFileOps` / `image-asset-config` / `image-input` …）✓ |
| rename | `imageFileOps` / `image-engine-api` / `image-ops` ✓ |
| missing | 5 个文件 ✓ |
| remote | 5 个文件 ✓ |
| Chinese path | `image-insert` / `image-ops` / `image-path` ✓ |
| Windows/macOS/Linux | `image-engine-api` / `image-insert` / `image-path` ✓ |
| **save as** | ❌ **零覆盖** |

**`save as` 的核实过程**：先在 `image*.test.ts` 里查 → 0 命中；
再放宽到**全仓所有 `*.test.ts/tsx`** 并查「`saveAs`/另存为」与「image/图片/src/assets」的**共现** →
**只有 1 处命中，且是 `menu-schema.test.ts` 里的菜单顺序断言**（列 `file.saveAs` 这个 id），
与「另存为后的图片引用行为」**无关**。

**为什么这是真实缺口而非命名差异**：spec §12 把它与 `rename`、`missing`、`relative` 并列，
语义应是「**另存为后文档路径变化，图片引用是否仍然正确**」——
而 `rename`（改名/移动）**有**覆盖、`relative`（相对路径解析）**有**覆盖，
唯独「另存为导致路径基准变化」这一条没有。二者风险同源（路径基准变了、引用可能失效），
却没有对应的回归防线。

**后续项**：为「另存为 → 图片引用仍可解析」补一条测试（可参照 `documentRename.test.ts`
与 `imageFileOps.test.ts` 的现有模式）；或若实现上「另存为」与「重命名」走同一路径，
则在 spec §12 里合并该类别并注明 —— **两者必居其一**，不要让声明与实现长期脱节。

**✅ 已部分闭环（2026-09-30 同日）**：在 `packages/editor-engine/test/image-path.test.ts`
新增 `describe('另存为（spec §12 的「save as」场景）')`，3 个用例钉住另存为**依赖的路径基准语义**：
① 同一相对引用在文档目录变化后解析基准随之变化；② 未命名文档首次保存（`docDir` 由 `null` 变有值）
后相对引用才开始可解析；③ 绝对路径与 URL 不受另存为影响。
**注入验证**：在 `resolveImageSrc` 里注入 `docDir = '/FIXED'`（忽略文档目录基准）→
**4 个测试失败**（含新增的两个），证明断言非空壳；还原 → 全过。

> ⚠️ **覆盖边界（如实声明）**：这是**单元级**断言（`resolveImageSrc` 的契约），
> **不是端到端的「另存为流程」测试** —— 后者需要真实应用（对话框 + 磁盘）。
> 故本节的缺口**只被部分闭环**：路径基准语义已有人守，
> 「另存为后编辑器里图片是否真的还能渲染」仍需 e2e/真机覆盖。

## 4.16 `table-editing-spec` §10 声明的 `external update` 场景**零覆盖**（2026-09-30）

**方法**：同 §4.15 —— spec §10「Tests」声明 11 个必覆盖类别，逐条映射到实际测试
（表格测试共 8 个文件：`table-column-width` / `table-engine` / `table-keyboard` /
`table-large` / `table-live-view` / `table-parser` / `table-toolbar` / `table-undo-diff`）。

**结果**：**10/11 有覆盖**，唯独 **`external update` 零覆盖**。

**核实过程**（避免误报）：把范围放宽到**全仓所有 `*.test.ts/tsx` 与 Rust `_corpus.rs`**，
查「`external`/`外部`/`reload`/`重载`」×「`table`/`表格`」的**共现** → 6 处命中，
**全部无关**：`menu-schema.test.ts` 的菜单顺序里列了 `file.reloadFromDisk` 这个 id；
`export/html.test.ts` 讲的是「无外部脚本引用」（自包含）；`ime-guards.test.ts` 的注释说
「宿主外部事务」。

**⚠️ 不过度声称**：**文件安全侧**的外部变更**已被覆盖** ——
`file_safety_corpus.rs` 有 `external_editor_in_place_edit_never_overwrites` /
`git_checkout_external_replace_never_overwrites` / `external_delete_save_conflicts` 等
（保证**不静默覆盖**）。缺的是**另一面**：**表格的 live-view / decoration 状态在
「外部重载」之后是否正确重建** —— 文件安全测试只断言磁盘内容不被破坏，
不断言编辑器里的表格控件状态。

**后续项**：补一条「文档被外部修改 → 重载 → 表格 live-view 与对齐/列宽状态正确重建」
的测试（可参照 `table-live-view.test.ts` 与 `table-column-width.test.ts` 的现有模式）。

**✅ 已部分闭环（2026-09-30 同日）**：在 `table-live-view.test.ts` 新增
`describe('表格 live-view · 外部更新（spec §10 的「external update」场景）')`，2 个用例
模拟外部重载的**实质 —— 整文档被替换**：
① 整文档替换后 live-view 反映**新内容**（李四）且**不残留旧状态**（不再含张三）；
② 外部重载把表格整体删掉后，live-view **不再存在**（不残留旧 widget）。
**注入验证**：把 live-view 的 `docChanged` 分支从 `buildDecorations(transaction.state)`
改为复用 `value.decorations`（模拟「重载后残留旧 widget」）→ 该文件**全部 7 个用例失败**
（含新增 2 个），证明断言确实在检验真实行为；还原 → 7 例全过。

> ⚠️ **覆盖边界（如实声明）**：这是**单元级**模拟（整文档 `dispatch`），
> **不是端到端**「文件被外部修改 → 自动重载」流程（需真实文件系统 + watcher）。
> 故本节的缺口**只被部分闭环**：编辑器侧语义已有人守，
> 「文件真被外部改了以后自动重载是否正确」仍需 e2e/真机覆盖。

## 4.17 spec §8「Caret Stability」的不变量在**状态矩阵里没有断言**（2026-09-30）

**spec 原文**（`live-markdown-engine-spec.md` §8）：

```text
任何 decoration 更新必须满足：
document position unchanged
selection anchor/head unchanged
scroll anchor preserved
除非用户动作本身改变文本。
```

**实测**：`state-matrix.test.ts`（15 个节点族 × 15 个状态的系统矩阵）逐状态的断言是
**marker 可见性** —— `expect(cfg.hiddenWhenIdle(view)).toBe(true)` /
`expect(cfg.revealedWhenTouched(view)).toBe(true)`。
**全文件没有 `doc.toString()` 断言，也没有 selection 断言**
（grep `doc\.toString\(\)|position|不变|unchanged` 在该文件只命中 import 与 describe 标签）。

即：矩阵系统性地检查「**什么变得可见**」，但**不检查「别的东西没变」** ——
而 §8 正是关于「别的东西没变」。散落的其他测试（如 `table-live-view.test.ts`）
确实有 `expect(view.state.doc.toString()).toBe(source)`，
但那是**逐点抽查**，不是对「任何 decoration 更新」的系统性保证。

**为什么这是缺口**：§8 的不变量是**跨所有 decoration 更新**的（spec 用的是「任何」），
而系统矩阵恰是唯一能覆盖「所有状态」的地方；它漏了这条，等于
**「marker reveal 不改变文档位置」只有零散抽查、没有系统防线**。

**后续项**（建议做法，成本可控）：
1. 在矩阵的每个 case 里，动作前后各取 `view.state.doc.toString()` 与
   `view.state.selection.main`，断言二者不变（spec §8 前两条）；
2. `scroll anchor preserved` 需真实布局，jsdom 下不可判定 —— **如实降级为
   「本 harness 不判定」**（与 ADR-0026 Q3 对 16ms 目标的处置同一原则），
   不要用一个恒真的假断言冒充；
3. 改完后**逐状态注入验证**：让某个 decoration 更新顺带改一次文档 →
   矩阵必须报错。

> **与 §4.15/§4.16 的区别**：那两处是「声明了某个测试场景但零覆盖」；
> 本处是「**声明了一个不变量，而系统性测试只检查了它的相邻面**」——
> 更隐蔽，因为矩阵**看起来**在覆盖这 15 个状态。

## 4.18 复核（正向确认）：`ime-test-plan` §5 的 7 条不变量**全部有覆盖**（2026-09-30）

**背景**：`ime-test-plan` §5「必须验证」列了 7 条不变量，§8「Gate」把其中 4 条列为
**禁止发布**条件（丢字 / 重复 / blocker caret / undo corruption）。
首轮用**关键词映射**扫描 `ime.test.ts` + `ime-guards.test.ts` → 4 条 ❌。

**⚠️ 那 4 条 ❌ 全是假阴性** —— 关键词法只证明「某文件提到过这个词」，
而这类不变量通常通过**断言最终文档等于期望串**间接保证，不必出现「丢字」二字。
改为**逐条读用例名**后，7 条**全部有覆盖**（分散在 3 个单元测试文件 + Linux IME 矩阵）：

| §5 不变量 | 覆盖它的测试 |
|---|---|
| no lost char / no duplicated char | **Linux IME 矩阵**（台账 `linux-ime-matrix` 证据，断言无丢字/重复） |
| no caret jump | `ime.test.ts`「合成期间 caret 移动不触发重算（渲染冻结）」 |
| **no premature slash commit** | **`slashCommands.test.ts`「does not trigger during IME composition」** |
| no unexpected marker hide | `ime-guards.test.ts`（8 个功能各一条「合成期冻结 → 结束恢复」） |
| no undo corruption | `ime.test.ts`「合成结束后 Undo 不破坏文本与 marker（undo corruption guard）」 |
| no full editor remount | `ime-guards.test.ts` 的「冻结」+ `table-live-view.test.ts` 的「不重建整张表」 |

**记录目的**：① 把「7 条不变量有人守」变成**已核对的事实**，避免未来重复审计；
② 留下一条**方法教训** —— **关键词映射不能用来判定「某不变量无人守」**，
它只适合用来**定位候选**，判定必须读用例名/断言本体。
（本会话已因此自伤两次：一次把 `.md` 引用源漏掉报了假孤儿，一次就是本条。）

## 4.19 `desktop-ui-design-spec` §19 的「no color-only status」**无人守**（2026-09-30）

**spec §19 Accessibility 声明 6 条**：keyboard complete / focus visible / 200% zoom /
reduced motion / screen reader baseline / **no color-only status**。

**实测**：仓库里唯一的无障碍审计文档 `docs/accessibility/accessibility-phase-2026-08-13.md`，
其基准也是 6 项（keyboard navigation / focus ring / semantic labels / 200% zoom / contrast /
reduced motion），矩阵是 6 列（Keyboard / Focus ring / Semantic / Contrast / Zoom / Motion）。
**两个 6 项的集合不同** —— spec 的第 6 条 `no color-only status`
**不在审计基准里、不在矩阵里、也不在任何测试里**
（全仓 828 个源文件（含 `.md`/`.ts`/`.tsx`/`.mjs`/`.rs`/`.json`）搜
`color-only|仅颜色|不只用颜色|颜色.*唯一|color alone` → **0 命中**）。

**⚠️ 不过度声称**：这条要求**可能被结构性满足**（例如状态项总是带文本、不只靠色块）——
**但没有任何地方检查过**。本节的判定是「**无人守**」，不是「实现不合规」。
这正是 §4.18 记录的同一区分：「某属性没有断言」≠「该属性不成立」，
但**「没人检查过」本身就是一个缺口** —— 它意味着将来改坏了不会有信号。

**为什么容易漏**：无障碍审计的 6 项基准是**当时自己定的**，
而 spec §19 的 6 条是**另一处独立写的** —— 两处**没有交叉校验**，
于是集合差集（这里是 1 项）**永远不会被发现**。
这与 §4.17 的形态同源：**两处各自维护同一件事的部分清单，谁都不负责核对全集**。

**后续项**：
1. 在 `accessibility-phase-*.md` 的审计矩阵里补该维度（如新增 `Color-independence` 列），
   逐区域核对「状态是否只靠颜色表达」；
2. 加一条可判定的断言：状态类元素（如侧栏 badge、连接状态、dirty 标记）必须有
   **可读文本或 `aria-label`**，不得仅有颜色差异；
3. 或在 spec §19 里注明该条属**人工走查**（并写进审计文档的 §4「验证项（需人工/GUI 确认）」）——
   **三者必居其一**，不要让一条已声明的要求长期无人认领。

### 处置（2026-09-30，选②）

**选了修法 ②（加可判定断言）**，因为它同时回答「谁在守」与「有没有坏」。
② 立刻**抓到一个真实缺陷**——这正是它优于 ①/③ 的地方（①③ 都只是「把要求挪个地方」）。

**新增护栏**：`tests/parity/verify-no-color-only-status.mjs`（第 16 个护栏，已接入
`test` 与 `parity` 两条链；`verify-release-gate.mjs` 现报 `16 parity guards`）。三条断言：

- **① 使用点清单锁**：扫出所有「用**语义状态色**（`--mellow-danger|warning|success`）
  表达状态」的位置——`styles.css` 的规则选择器 **＋ 内联 `var(--mellow-…)` 的样式键**
  （CM 主题里写作 ``[`.${CONST}`]: {…}``）——断言集合**恰好等于**护栏内的 `REGISTRY`。
  新增未登记 → 失败（逼登记）；登记了但源码已消失 → 也失败（防登记表退化成化石）。
- **② 每个使用点必须声明非颜色线索且可核实**：`nonColor: 'text'` 要求锚点落在真正的
  JSX 表达式容器里（`{…}`），`'pattern'` 要求指向非颜色的形态差异。锚点消失 → 失败。
- **③ `status` 状态两端配对**：`StatusBar` 的 `.status` 元素必须渲染 `statusText`；
  宿主每次 `setStatus('<非 idle>')` 必须**紧接着** `setStatusText(...)`。
  （前端靠 `className` 换色，语义全在文本——只锁一端等于没锁。）

**抓到的缺陷**：`packages/editor-engine/src/mdLink.ts` 的**断链指示只改颜色**
（`.mellow-mdlink-broken { color: var(--mellow-danger) }`，无 `attributes`/`title`/aria，
下划线形态与正常链接完全相同）→ 灰度或色盲下**断链与正常链接不可区分**，即 spec §19
`no color-only status` 违规。**已修**：加 `textDecoration: 'underline wavy'` 作为非颜色线索
（WCAG 1.4.1 认可的「additional visual means」）。

**顺带修正一处「把推断写成宪法陈述」**：该处旧注释写「subtle error indicator（spec §12）：
暗红文字，**不改动下划线形态**与文档源码」。回查 `live-markdown-engine-spec.md` §12 原文，
只有 `subtle error indicator` / `source unchanged` 两条 —— **「不改动下划线形态」是
实现选择，不是 spec 约束**。故修形态不违反 §12；注释已改写并标明来由。

**验证（全部做过「能失败」）**：
- 护栏注入 8 个 mutation，**8/8 被检出**：① 去掉 `StatusBar` 的 `statusText`；
  ② 新增一处未登记的语义色使用点；③ `setStatus('error')` 后删掉 `setStatusText`；
  ④ 去掉断链的 `wavy`；⑤ 从 `REGISTRY` 删掉一个真实存在的使用点；
  ⑥ 改名真实使用点的选择器；⑦ 把文本锚点挪进**属性值**（不再是 JSX 表达式容器）；
  ⑧ 内联语义色**失去归属键**。
- **mutation ⑦⑧ 各暴露了护栏自身的一个缺陷，均已修**（这两条是「加固」而非「装饰」的证据）：
  - ⑦ 最初的「JSX 容器」判据只查「锚点之后有个 `}`」——**属性值里同样成立**，
    等于没判。改为：锚点须以 `{` 开头 **且** 其前一个非空白字符不是 `=` / `"` / `'`。
  - ⑧ 归属键只取「向前最近的 `${CONST}`」→ 当某条规则被改成字面量键时，
    护栏会把该用法**错误归属到上一条规则的常量**；若那个常量已登记，
    **新用法被静默吞掉**（正是「护栏看不见我」）。改为：`${CONST}` 之后若还有 `}`，
    说明那条规则已闭合 → **响亮失败**。
    ⚠️ 边界必须按 token 的**结束位置**算 —— `${CONST}` 自身就含一个 `}`，
    用起始位置比较会把「占位符自己的右花括号」当成规则闭合（首跑即误报，已修）。
- 另在 `packages/editor-engine/test/md-link.test.ts` 补一条**运行时**断言（读**实际注入
  DOM 的样式规则**，而非源码文本），并先断言「规则读得到」以防断言因读不到样式而**恒绿**；
  注入验证：删掉 `wavy` → 该断言失败。
- `packages/editor-engine`（16/16，全量 1217 例）与 `packages/desktop-ui`（17/17）单测全绿；
  完整 `npm run parity` 链（16 护栏 + UX 自检 + vendored CoreEditor lint/jest 191 例）全绿。

**如实声明的范围限制**（写在护栏文件头，避免被读成「无障碍已达标」）：
- 只覆盖**语义状态色**这条路径；用非语义色/渐变/背景图表达状态的元素**不在覆盖内**。
- 「有无文本」是**静态可判定**的代理指标，**不等于** WCAG 1.4.1 合规：对比度、
  色盲可辨识度、屏幕阅读器语义（`role`/`aria-label`）**均不判定**。
  （断链目前仍无 SR 语义——引擎侧无 i18n 通道，需宿主注入文案，属独立议题。）
- spec §19 其余 5 条（keyboard complete / focus visible / 200% zoom / reduced motion /
  screen reader baseline）**不在此护栏**，仍属 §4.19 的「无人守」范围。

**为什么不用 ①（补审计矩阵列）**：矩阵是**散文表格**，加一列不会产生任何信号；
它只在**有人重跑人工走查**时才有意义，而人工走查恰恰是当前最稀缺的资源
（见 §4.19 起因：两处清单各自维护、差集永远不被发现）。

## 4.20 `document-file-safety-spec` §12 的 Release Blocker「document history crossing tabs」**无人守**（2026-09-30）

**背景**：按「谁在守」审计法扫 `document-file-safety-spec`。这份 spec 的覆盖总体**很好**：
`tests/qualification/file-safety-corpus.md` 是一份 16 用例的对照表（含「模拟手段」列，
如实标注了 OneDrive/SMB/NFS/disk-full 是模拟而非真实挂载），`§3 Source Fidelity` 有
独立语料门禁与 `tools/source-fidelity` 工具，`§6 Recovery` 由
`packages/app-core/test/recovery.test.ts`（debounce / flush / 保存后清理 / 多文档独立 /
启动恢复流程）覆盖。**唯一落空的是 §12 的一条 Release Blocker。**

**现象（典型的「看起来有人守」）**：
`packages/document-model/src/index.ts` 头部注释声明：

> **文档切换不共享 Undo History**：每个文档一个独立 DocumentModel 实例；
> 编辑器侧由 resetEditor（重建 EditorView）保证历史隔离（**CoreEditor 已实现**，
> 对应 spec §12 Release Blocker「document history crossing tabs」）

而 `packages/document-model/test/document-model.test.ts` 里**确实有一条同名测试**：
`test('Editor 层历史隔离由 resetEditor 保证（文档级约束记录）')`。
但读它的**断言本体**，只有：

```ts
expect(a.id).not.toBe(b.id);
expect(a.revision).toBe(0);
expect(b.revision).toBe(0);
```

—— 断言的是「两个实例 id 不同、revision 都是 0」，**与 Undo 历史毫无关系**，
而且**上一条测试已经覆盖了同样的东西**。于是：
**一个 Release Blocker 的守护状态，完全由「测试名 + 代码注释」支撑，没有任何断言。**

**为什么这条特别要紧**（严重级判断，不是形式主义）：
spec §12 列它为 Release Blocker，失效后果是「在 A 文档按 Undo 改掉 B 文档的内容」——
**数据损坏级**，且**屏幕上看不出**（用户只看到「撤销没反应 / 撤销了别的东西」）。
按失效模式 10（冒烟被当成机制断言）：**屏幕上看不出的那一面正是必然漏检的一面**。

**核实「实现到底有没有问题」（不把「无人守」写成「不合规」）**：
读 `packages/editor-core/CoreEditor/src/core.ts` 的 `resetEditor` ——
`tryGetEditor()?.destroy()` 后 `new EditorView({ state: EditorState.create({…}) })`。
CM6 的 history 存在 **EditorState** 里，状态全新即历史全新 →
**隔离在结构上成立，声明是真的**。本节判定仍是「**无人守**」，不是「实现有缺陷」。

**处置（2026-09-30）**：
1. **补真断言**：新增 `packages/editor-core/CoreEditor/test/document-isolation.test.ts`
   （3 例，走真实 EditorView + 真实 `undo`/`undoDepth`）。断言的是**行为**
   （切换后 `undoDepth === 0` 且 `undo()` 返回 false 且 doc 不变），
   而不是实现形态（「有没有 destroy()」）—— 将来换成别的隔离手法仍成立。
   含一条**反向断言**「同一文档内 Undo 必须仍可用」，防止把「隔离」做成「历史全废」。
   ⚠️ 该测试**先断言文档 A 的 Undo 历史确实可用**（`undoDepth === 1`）——
   否则「切换后 undo 无效」会因为「undo 本来就无效」而**恒绿**（空壳）。
2. **去掉虚假声明**：把 `document-model.test.ts` 那条测试改名为
   「模型层：每文档独立实例 + 独立 id/revision（历史隔离的真断言在 CoreEditor）」，
   并在正文写明它**不**验证历史隔离、真断言在哪。这不是「改名绕开护栏」——
   护栏原本就不存在；这里去掉的是一个**假前提**，同时补上了真断言。
3. **更新声明出处**：`document-model/src/index.ts` 的注释改为**指名断言文件**，
   让「已实现」这句话变成**可核对**的（原写法只断言了「CoreEditor 已实现」，无从查证）。
4. **登记进台账**：`P0-FILE-001` 的 `evidence` 增列该测试文件
   （CoreEditor 的 jest 由 `tools/check-vendored-editor.mjs` 接入 `npm test` / `npm run parity`，
   属 **CI 可执行制品**，符合 `AUTO` 项的证据要求）。

**验证（做过「能失败」）**：注入一个**真实可能的回归** —— 把 `resetEditor` 从
「重建 EditorView」改成「往现有 view 里 dispatch 新内容」（正是有人会做的「省一次重建」优化）
→ **新测试失败**（历史跨文档被检出）；还原 → 通过。同时 `document-model` 包测试仍全绿。

**方法教训（已并入 skill）**：
> **测试名与代码注释都是「声称」，不是「守护」。** 判定「谁在守」必须**读断言本体** ——
> 本例中测试名逐字写着「由 resetEditor 保证历史隔离」，而断言里连 `undo` 都没出现。
> 这与 §4.18 的「关键词命中 ≠ 有断言在守」是同一条：**名字/关键词只能定位候选**。

## 4.21 方案自己的「未完成」表**已过期**，且过期方向是**高估剩余工作**（2026-09-30）

**背景**：按「检查所有工作任务」的口径，方案 §15.3 是权威的**剩余工作清单**
（12 项 + 1 项，全部标「需先裁决 / 环境阻塞」）。它是 **2026-09-13** 的快照，
此后方案自身仍有 09-14 ~ 09-22 的多轮实装 —— **表未同步**。

**核实方法**：不采信表自述，逐项**回到代码**查（`grep` 设置 id / command id / i18n key）。

**结果（两行，共 9 个子项中 6 个已实装）**：

| §15.3 行 | 表中说法 | 代码核实结果 |
|---|---|---|
| **10** `Insert Final New Line On Save` | 无实现 | ✅ **已实装** `files.finalNewline`（`packages/settings/src/index.ts:209`，默认 false 对齐 Typora `preferFinalNewline:false`）+ `packages/app-core/src/finalNewline.ts` + 护栏 `verify-settings-contract.mjs` ⑨ |
| **10** `Preserve single line break` | 无实现 | ✅ **已实装**（三段齐备：编辑器软换行 G7-EDIT-07 / 导出 `settings.export.preserveLineBreaks` 由 `packages/export/src/index.ts` 消费 / Reader 段内软换行 `packages/app-core/test/reader.test.ts`） |
| **10** `Allow Magnification`（双指缩放） | 无实现 | ⚠️ **该结论已被 §4.27 更正**：机制**已存在**（`enablePinchZoom`，仅 Quick Look 启用 + 有单测），主编辑器未接线 |
| **11** `Open Image in Browser` | 无命令/入口 | ✅ **已实装** `edit.openImageInBrowser`（`App.tsx:5137` + 图片右键入口 `App.tsx:4118` + 护栏 `verify-shell-widgets.mjs`） |
| **11** `Refresh All Math Expressions` | 无命令/入口 | ✅ **已实装** engine `refreshMath()`（`contextMenu.ts:669`） |
| **11** `Task Status` | 无命令/入口 | ✅ **已实装** engine `setTaskStatus()`（`contextMenu.ts:783`） |
| **11** `Block/Inline/List Styles` | 无命令/入口 | ✅ **已实装** i18n `contextmenu.textBlockStyles` / `textInlineStyles` / `textListStyles`（zh + en，`messages.ts:192-194` / `1074-1076`） |
| **11** `Learn More` / `Image Tools` | 无命令/入口 | ❌ **仍未实现**（全仓仅出现在 Typora dump 夹具与本文档中） |

**为什么这条值得记**：我们一直在防「把**没做**的说成**做了**」（§4.13 / §4.18 / §4.19 / §4.20）。
本条是**反向**的：把**做了**的说成**没做**。两种都会造成实际损失 ——
反向的那种会让下一轮**重复劳动**（去实现已经存在的东西），
或让「剩余工作」的评估系统性偏悲观，进而影响是否值得继续投入的判断。

**处置（2026-09-30）**：
1. §15.3 第 10 / 11 行按代码核实**逐项更正**（标明哪些已实装、证据在哪、仅剩什么）；
   并把「仍需裁决」收窄到**真实剩余的两项**（`Allow Magnification` / `Learn More`+`Image Tools`）。
2. §3.8b 的 Typora 偏好对照表同样过期两处，一并更正：
   `preLinebreakOnExport` 原写「Mellow 无对应设置项」→ 已实装；
   `enable_inline_math` 补注「无**设置项**但**行为已判为 matches-default**（偏好矩阵）」——
   防止把「无设置项」误读成「有缺口」。
3. §15.1 的「未完成 **9 类**」：§15.3 实为 **13 行**（编号 1–12 + 14），**「类」的归组口径从未写明**
   → 如实标注为「**无法从制品派生，不得引用**」，行数以 §15.3 表为准（不擅自改成 13，
   因为原作者的「类」可能确有归组意图，只是没写下来）。

**⚠️ 不过度声称**：本节只更正**已由代码证实**的条目。§15.3 其余 11 行**未逐项复核**
（它们多为真机/人工/裁决阻塞，代码核实不适用或代价高）——**不读成「剩余工作只剩两项」**。

## 4.22 Settings 面板里成簇存在「可点击但点了没反应」的设置项（2026-09-30）

**怎么发现的**：在核实 §15.3 行 14 ③「Typora 有『确认重置高级设置？』而 Mellow 无入口」时去读
Settings 的渲染路径，发现渲染层对 `type: 'action'` **一律**渲染「打开」按钮并只调用
`applySetting(def, true)`，而 `applySetting` 是按 `def.applyCommand` 分派的 switch，
**落 `default: break` 即静默 no-op**。于是「有按钮、无消费者」可以长期存在。

**程序化枚举**（不靠肉眼，避免只修碰巧看到的几个）：解析 `packages/settings/src/index.ts`
＋ `SettingsPanel.tsx` 的设置项字面量，与 App 的 `applySetting` switch case 集合比对 → **6 处**：

| # | 项 | 现象 | 处置 |
|---|---|---|---|
| A1 | `extensions.ai` | action 但**无 applyCommand** → 「打开」按钮点了没反应 | 补 `applyCommand: 'extensions.list'` |
| A2 | `extensions.plugins` | `docs/adr/ADR-0029-audit-pending-decisions-registry.md` | 补 `applyCommand: 'commandPalette.open'`（其描述即「插件注册的命令统一进入 Command Palette」） |
| B1 | `advanced.windowBounds` | `applyCommand: 'settings.windowBounds'` **无对应 case** → 死引用 | **删掉该死引用**（该设置是**启动期**读取，App 直接读 storageKey，本就没有 live-apply） |
| B2 | `ai.panel`（**在 SettingsPanel 里**） | `applyCommand: 'settings.aiPanel'` 无对应 case | 整段移除（见处置 4） |
| C1 | `appearance.openThemeFolder` | action 却带**非空 storageKey** → 写下一个无人读的值 | 改为 `storageKey: ''` |
| D1 | `advanced.userCss` | `type: 'text'` 却 `storageKey: ''` → 输入的值写进 localStorage 的**空键**、无人消费 | 改为 `type: 'action'` + `applyCommand: 'file.openUserCss'`（与 `appearance.openThemeFolder` 同范式） |

**⚠️ 一次「防误报」救回的假阳性（值得单记）**：初版判据是「applyCommand 必须有 case」，
它会把 `advanced.windowBounds` 判成缺陷。但核实后发现该 toggle **有消费方** ——
App 在启动时**直接读** `mellow.advanced.windowBounds`（windowBounds 判定），
根本不经过 `applySetting`。**「无 case」≠「无消费方」**：对**值型**设置，值本身是持久化的，
消费者可以在任何地方直接读。故判据按类型分岔 —— action 型（按钮是唯一入口）必须有 case；
值型只需有 storageKey。这正是「**禁止型护栏必须做防误报验证**」的实例：
只验证「违例被拦」会造出一个**会吃掉正确行为**的护栏。

**另一个只有「把扫描面枚举全」才能看到的点**：`ai.panel` **不在** `packages/settings` 的 schema 里，
而在 `SettingsPanel.tsx` 里按 `aiEnabled` **动态追加**。已有的两处检查
（`verify-settings-contract.mjs` 与 `packages/settings/test`）**都只扫 package schema**
→ 它从未被任何不变量覆盖。这与 §4.19 的「两处各自维护清单」、§4.17 的「只查相邻面」同源：
**检查的范围没有覆盖缺陷能出现的全部位置**。

**处置（2026-09-30）**：
1. **修上表 6 处**。
2. **新增跨层不变量**（`verify-settings-contract.mjs` 新节）：A. action 型必有 applyCommand；
   B. 任何出现的 applyCommand 必有对应 case；C. action 型不得带 storageKey；
   D. 值型必有 storageKey。**扫描面同时含 package schema 与 SettingsPanel**（防 App 层追加的项绕过）。
   含**双向 canary**（四类违例必被检出 ＋ 两类合规样本不得被拦）。
3. **包级测试**（`packages/settings/test/index.test.ts`）：新增「action 型必须绑定 applyCommand
   且不得带 storageKey」。
4. **移除 AI 死分区**：`SettingsPanel` 的 `ai` 分类唯一控件 `ai.panel` 无消费者且持久化
   `mellow.ai.panel`（与 PRD §122「无任何持久化 AI 状态」相悖）→ 移除该分类 ＋ App 的
   `aiEnabled` state ＋ `mellow.ai.enabled` 键 ＋ 三条 i18n 文案。AI 入口由 `extensions`
   分类的 action 承载。
5. **修正一条「把缺陷写成契约」的断言**：`packages/settings/test` 原断言
   `expect(ai?.applyCommand).toBeUndefined()`（注释「不绑定命令」）—— 它把**死按钮**
   固化成了契约。PRD §122 要的是「不持久化 AI 状态」（同测试上一行已断言），
   不是「按钮不许做事」。改为断言必须绑定命令。

**验证（能失败）**：注入 6 个 mutation，**6/6 被检出**：① action 去 applyCommand；
② applyCommand 改成一个不存在的值；③ action 带 storageKey；④ 值型去掉 storageKey；
⑤ **在 SettingsPanel 动态追加一个死设置项**（证明扫描面真的含面板）；
⑥ 删掉 applySetting 的接线 case（只锁一端的形态）。

**⚠️ 不过度声称**：
- 本节的判据是「**有没有接线 / 消费者**」，**不是**「行为是否正确」。`extensions.ai` 现转发到
  `extensions.list`，是**语义最近且真实存在**的命令；它是否正是产品想要的那个入口，属产品判断。
- `extensions.ai` / `extensions.plugins` 所在分类**始终可见** → 这两处是**用户可见**的缺陷；
  而 `ai.panel` 所在分区需 `mellow.ai.enabled === '1'` 才出现，而**全仓无任何地方写这个键**
  → 它实际**不可达**（已随之移除）。
- **未复核**：值型设置的 storageKey 是否都真的**有消费者**（本节的 D 只断言「有 storageKey」，
  不断言「有人读」）—— 静态判定「某键有消费者」代价高且易误报，**如实留为未覆盖**。

## 4.23 §15.3 行 14a ③「设置无恢复默认入口」—— 实施，并更正我上一轮的**不可行**判断（2026-09-30）

**背景**：上一轮（§4.21）我把该项的「未实现原因」写成：

> 一次正确的「全量恢复默认」要覆盖 64 个设置项各自的 live-apply 路径（主题/语言/侧栏/
> 编辑器 config/…）与启动期读取项，涉及多个子系统，**半量生效比没有更糟**。

**这个理由站不住。** 做完 §4.22 后回头看，**正确的路径一直存在且可复用**：
设置面板的每个控件 onChange 走的就是

```ts
localStorage.setItem(def.storageKey, …); applySetting(def, next);
```

—— 也就是说，「把某一项设回默认值」这件事**早就有一条被证明可用的路径**，
只要对它**循环**即可。不需要为「全量恢复」另建一条 live-apply。

**处置（2026-09-30）**：
1. `packages/settings/src`：新增 `restoreAllSettingsDefaults(apply)` ——
   **删除**存储键（而非写入 `defaultValue`：写入会把**当前**默认值固化下来，
   将来默认值变更时用户那份旧值会顽固留存）；**跳过 `storageKey === ''` 的入口型 action**
   （它们没有值，且 `apply` 会触发副作用：打开主题文件夹 / 速查表 / 检查更新 / 扩展列表 /
   命令面板）；逐项 `apply(def, def.defaultValue)`；返回重置项数。
2. `apps/desktop/src`：`settings.restoreDefaults` 命令 + `handleRestoreSettingsDefaults`
   —— **必须走应用内确认对话框**（破坏性；`window.confirm` 全仓禁用），
   并把 `restoreAllSettingsDefaults(applySetting)` 的返回值写进状态栏。
3. i18n zh/en 四条（命令名 + 对话框标题/正文/确认按钮 + 状态栏消息）；
   正文**明确说明**「快捷键自定义不受影响」——范围诚实。
4. **包级测试**（3 例）：清键 + 逐项 apply 默认值 + 数量等于值型项数（**不漏项**）；
   **跳过入口型 action**（先断言「确实存在 action 型」以防断言空壳）；
   不触碰快捷键 override 层。
5. **护栏**（`verify-settings-contract.mjs`）：锁「必须遍历 `SETTINGS_SECTIONS`（不得硬编码
   清单，否则会**只重置一部分**）」「必须跳过入口型 action」「必须删除键而非写入默认值」
   「必须逐项 apply」+ 命令入口存在 + 必须复用 `applySetting` + 处理函数必须 `await askUser`。
   注入 **7 个 mutation，7/7 被检出**。

**⚠️ 这次最该记的不是功能，而是我上一轮的错误**：我把**「我没想到那条路径」**写成了
**「不可行」**，并给出了听起来很具体的技术理由（「涉及多个子系统」）。
危害是：这条**看似有据的不可行结论**会**永久关闭**一个其实很便宜的项 ——
下一个读到它的人（包括未来的我）不会再去看。
→ 规则：写「不可行 / 代价过高」时，必须同时写**「我查过哪些路径、为什么它们不行」**；
只写结论不写查证过程，就是**用具体性伪装的无证据判断**。

**验证（能失败）**：7 个 mutation 全部被检出（硬编码清单 / 去掉 action 跳过 / 改成写入默认值 /
去掉逐项 apply / 去掉命令入口 / 去掉确认对话框 / 不再复用 `applySetting`）。
settings 17/17、i18n 15/15、desktop `tsc` 0 错误、完整 parity 链全绿。
⚠️ **过程中我自己的 mutation 脚本踩了 skill 记录的失效模式 5**（`String.replace` 只替换首处，
而 `for (const section of SETTINGS_SECTIONS)` 在文件里出现两次 → 我改的是模块级建 map 的循环，
于是「M1 未被检出」是脚本 bug 而非护栏缺陷）——**判定「护栏空壳」前要先确认注入真的生效**。

## 4.24 文案键是跨层声明：`t('file.info')` / `t('file.openWith')` **键不存在** → 界面显示裸键（2026-09-30）

**发现路径**：§4.22 那条「跨层声明必须在两端同时锁」的母题产出 6 个真缺陷后，我按同一形状
去找**其它跨层声明**。文案键是最典型的一个：调用点写 `t('a.b')`，真值在 `packages/i18n` 的目录里。

**先做正向确认（避免只报坏消息）**：
- `menuSchema` 的 `labelKey` → i18n 已被 `verify-menu-contract.mjs` §6 覆盖（212 个键，全在）；
- `SETTINGS_SECTIONS` 的 135 个 `labelKey`/`descriptionKey` 也**全在** zh/en 中（但**无护栏**，
  见下）；
- i18n 两个 locale 的键集合完全一致（826 / 826，零差集）。

**然后程序化枚举全仓 `t('<字面量>')`**（276 个 TS/TSX 文件、561 次调用、440 个去重键）
→ **2 个键无法解析**：

| 键 | 使用处 | 后果 |
|---|---|---|
| `file.info` | `App.tsx` 的「文件信息」面板 **`aria-label` + 标题** | 面板标题在 zh/en 下都显示字面量 **`file.info`**；`aria-label` 同理（屏幕阅读器读裸键） |
| `file.openWith` | `App.tsx` 的「打开方式」面板 **`aria-label` + 标题** | `docs/adr/ADR-0029-audit-pending-decisions-registry.md` |

**为什么它不报错**：`createI18n` 的 `t()` 是 `table[key] ?? catalog['en-US'][key] ?? key` ——
**缺失键返回键名本身**。所以「键写错 / 忘了加」在界面上表现为**一段看起来像标识符的文本**，
不会有任何异常。

**⚠️ 为什么它一直没被发现**：这两个概念在 **App.tsx 的命令注册**里用的是
**内联 `localizedTitle: { zh: '文件信息', en: 'File Info' }`**（菜单/命令面板因此显示正常），
而**面板标题**走的是 `t('file.info')`。两条文案来源，只有一条有真值 ——
**看着菜单是对的，就没人去核对面板**。这与 §4.19 的「两处各自维护清单」同源。

**处置**：
1. 补 `file.info` / `file.openWith` 两条键（zh + en），值对齐命令的内联标题。
2. **新增第 17 个护栏** `tests/parity/verify-i18n-contract.mjs`（接入 `test` / `parity` 双链）：
   - **A**：全仓 `t('<字面量>')` 的键必须在 zh **和** en 目录中**非空**存在；
   - **B**：各 schema（settings / SettingsPanel / menuSchema）声明的 `labelKey` /
     `descriptionKey` 字面量同上 —— 这条覆盖了「`t(def.labelKey)` 变量调用」的那一半：
     变量无法静态解析，但它的**声明处**是字面量。
   - **元护栏**：去重键数 / 调用次数 / schema 声明数各设下限，低于即**响亮失败**
     （防解析器漏一大类后退化成空壳）。
   - **canary 三个方向**：缺失键被检出、存在的键不被误报、**值为空白的键也算不可解析**。
3. 注入 **5 个 mutation，5/5 被检出**（不存在的键 / 从目录删键 / 值改空白 /
   schema 声明不存在的 labelKey / **模板字面量形态**的缺失键）。

**⚠️ 如实声明的范围限制**（写在护栏文件头）：
- 只覆盖**字面量**键；`t(变量)` / `t(\`…${x}\`)` 无法静态解析，**不在覆盖内**；
- 不判定文案质量；**占位符 `{var}` 与调用方传参是否匹配未覆盖**
  （`formatMessage` 对缺失变量返回空串 → 屏幕上是「缺一块」而非报错，静态判定需解析 ICU 子集）；
- Rust 侧 / HTML 模板文案不在覆盖内。

## 4.25 原生菜单勾选态：**设置面板这条入口漏了重建** → 「设置里改了、菜单上没变」（2026-09-30）

**发现路径**：继续按「跨层声明」的母题找其它实例。这次查**命令 id 引用 ↔ 注册表**与
**`invoke('x')` ↔ Rust 命令**。前者出现 9 个 `export.*` 的「未注册」是**我的解析器假阳性**
（它们在 App.tsx 里由**格式表驱动动态注册**，不是字面量 `id: …, localizedTitle:` 相邻形态）
—— 记下来是为了下次别再当成缺陷。后者抓到 2 个 `invoke('set_spellcheck_state')`，
顺藤摸出了本节的真缺陷。

**缺陷 1（用户可见）：设置面板改「拼写检查 / 智能标点 / 首行缩进」时，原生菜单的勾选态不跟随。**

- `menuSchema` 用 `checkedFrom` 声明勾选值来源；其中 **`spellcheck` / `smartPunct` /
  `firstLineIndent` 三项的值存在 localStorage**（不是 React state），
  所以它们**必须**靠 `menuCheckTick` 自增来触发菜单 effect 重建；
  另三项（`statusbar` / `toolbar` / `themeMode`+`activeTheme`）走 React state，天然在依赖数组里。
- **菜单入口**（`edit.spellcheck.toggle` / `edit.smartPunctuation.toggle` /
  `edit.firstLineIndent.toggle` 三条命令）都自增了 tick ✓；
- **设置面板入口**（`applySetting` 的对应分支）**漏了 tick** ✗ →
  在设置里关掉「键入时检查拼写」，Edit 菜单里**仍然是勾选状态**。
- 而 `App.tsx` 里 `edit.firstLineIndent.toggle` 的注释恰好警告过同一问题的**反方向**：
  「两处入口必须走同一条写入路径，否则会出现『菜单勾上了、设置里没变』」——
  **反方向（设置里改了、菜单上没变）当时没有对应检查**。

**缺陷 2：设置路径里两处 `invoke('set_spellcheck_state')` 是注定失败的死调用。**

该命令是**旧的状态同步机制**，已被「整体 `set_menu_spec` 重建」取代（`App.tsx` 注释明确写了
「取代旧 set_menu_locale / set_recent_files / set_theme_selection / set_spellcheck_state /
set_smart_punct_state 五条状态同步命令」），且 **`verify-menu-contract.mjs` §4 明令禁止
Rust 侧复活它**。但前端仍在调用，并用 `.catch(() => undefined)` 吞掉失败 →
**看着像在同步原生菜单，其实什么也没发生**。这也解释了缺陷 1 为何长期没被发现：
**有一个「看起来在处理这件事」的调用占着位置**。

**处置（2026-09-30）**：
1. `applySetting` 的三处分支补 `setMenuCheckTick((n) => n + 1)`（与菜单入口同进同退）。
2. 删除两处死调用（设置路径 + 启动初始化路径）。
3. `menuCheckTick` 的声明**上移到 `applySetting` 之前**，并在注释里写明原因：
   目前只在回调体内引用（调用时求值，不会 TDZ），但**若将来有人把它放进依赖数组，
   依赖数组是 render 期求值的 → 会 TDZ**（本项目已记录过这个坑）。
4. **护栏**（`verify-menu-contract.mjs` 新增 §4b）：对三项逐一断言
   「**设置面板入口**自增 tick」＋「**菜单入口**自增 tick」（两条入口同进同退）；
   并断言**前端不得调用**那 5 条已移除的 legacy 命令 —— 与 §4 的 Rust 侧禁令构成
   **两端同时锁**。注入 **5 个 mutation，5/5 被检出**。

**⚠️ 本轮我自己的两个错，都值得记**：
- **① 大小写滑手导致错误结论**：我先用 `menuCheckTick` 搜「谁在调用」，
  而调用点是 `setMenuCheckTick`（**大写 M**）→ **匹配不到** → 我一度得出
  「`setMenuCheckTick` 从未被调用」的结论，并已写进代码注释。
  读到三处真实调用后才更正为「**只有设置面板这条入口漏了**」。
  → 教训：**搜「某标识符有没有被用」时要搜它的所有形态（含 setter / 包装名），别只搜裸名**；
  JS 区分大小写，`grep` 默认也区分。
- **② 护栏首跑误报，原因是我给切窗取了固定长度**：`applyBody.slice(idx, idx + 400)`
  —— 而那个 case 里有 ~350 字符的中文注释，**窗口够不到断言目标** → 报「未自增」。
  改成「切到该 case 的 `break;`」并对单行分支按行切后通过。
  → 教训：**静态切窗不要用固定长度**，用「到下一个结构标记」的语义边界。

**⚠️ 不过度声称**：本节的判据是「**有没有触发重建**」。
菜单**是否真的重建成功**（`set_menu_spec` 的 IPC 结果）在非 Tauri 环境下不判定，
需真机/运行时证据（e2e 或人工）—— 与 §4.19 同类的边界。

## 4.26 §15.3 行 14b 逐项复核：1 项已实装、1 项由不同机制覆盖、1 项本轮实装、2 项 P2、1 项 D（2026-09-30）

**背景**：行 14b 声称「`Panel.strings` 偏好项比对发现的 **6 项无实现**」，并写「经代码检索确认」。
它是 2026-09-13 的快照 —— 与 §4.21 同型（**过期**）。本轮**回到代码逐项复核**：

| 项 | 复核结果 | 证据 / 处置 |
|---|---|---|
| `默认的代码块语言` | ✅ **已实装** | `markdown.defaultCodeLang`（`packages/settings/src/index.ts` 的 markdown 段；V7-W6 / G7-EDIT-16）—— 该轮实装后**表未同步** |
| `PicList 路径` | 🟰 **由不同机制覆盖 → D-AL** | Mellow 用**本机 HTTP 端点**（`image.uploadService` 的 `picgo-http`，默认 36677，`src-tauri/src/upload.rs`）而非「可执行文件路径」；**能力等价**，且还支持 PicGo / 自定义 HTTP |
| `目录显示的标题层数` | ✅ **本轮实装** | 见下 |
| `使用主题的字体大小` | ❌ **仍未实现 → P2** | 需改动排版**单一真源**（`TYPOGRAPHY_DEFAULTS` 有专门护栏），成本/收益不划算 |
| `插入文件夹链接` | ❌ **仍未实现 → P2** | 边缘功能 |
| `导出后运行命令`（After Export） | 🚫 **不实现 → D-AM** | 允许「导出后执行任意 shell 命令」；Mellow 的安全基调是**不提供任意命令执行入口**，新增一条「用户配置即可任意执行」的攻击面，收益与风险不成比例 |

**本轮实装：`markdown.outlineMaxLevel`（目录显示的标题层数）**
1. `packages/settings/src/index.ts`：`markdown.outlineMaxLevel`（select 1–6，默认 `'6'` = 全部层级）。
2. `packages/app-core/src/outline.ts`：`BuildOutlineOptions.maxLevel`；`buildOutline` 跳过 `level > maxLevel`
   的标题（**层级判定仍用原始 level**，故截断后父子关系与编号与未截断时一致）。
3. `apps/desktop/src/App.tsx`：`outlineMaxLevel` state（初值读 settings schema）+ `applySetting` 的
   `case 'settings.outlineMaxLevel'` 写入 state + `refreshOutline` 的两处 `buildOutline` 传 `maxLevel`
   **并把该 state 列进依赖数组**。
4. i18n zh/en：标签 + 描述 + 6 个层级选项文案（各 8 条键）。
5. 单测 5 例（app-core）：缺省=6 全量 / maxLevel=2 截断 / **截断后父子关系仍正确** /
   autoNumber 与 maxLevel 同生效且编号不变 / maxLevel=1 且正文里的 `#` 不算标题。

**护栏（`verify-settings-contract.mjs` 新增一节）**：把整条链**一次锁死** ——
schema（含 6 个选项与默认值）→ `applySetting` 分支写 state → `buildOutline` 收到 `maxLevel`
（**tree + all 两处**）→ **该 state 必须进 `refreshOutline` 依赖数组**。
最后一条直接照搬 §4.25 的教训：**有设置项 ≠ 真的生效**，缺依赖数组就是「改了没反应」。
注入 **6 个 mutation，6/6 被检出** —— 其中 M5 专门验「依赖数组漏掉」这一条。

**⚠️ 本轮我自己的一个错**：护栏首跑误报，因为我把正则写成 `buildOutline\([^)]*maxLevel:`
—— 实参里有 `host.getText()`，`[^)]*` **被那个右括号截断**。改成直接数
`maxLevel: outlineMaxLevel` 的出现次数（应为 2）。这与 §4.25 的「切窗用固定长度」同族：
**静态切窗/正则边界必须按语义结构，不要按字符类的直觉**。

## 4.27 我上一轮把「settings 包内搜不到」写成了「全仓无实现」（2026-09-30）

**起因**：§4.21 复核 §15.3 行 10 时，我把 ③ `Allow Magnification` 的结论写成
「**全仓无 pinch / magnification 相关实现**，只有 `editor.cmdWheelZoom`」。
本轮去查它的**可行性**（准备做 E/D 裁决）时发现：**这句话是错的**。

**错在哪**：我当时的检索命令是

```
grep -rn "finalNewline|preLinebreakOnExport|Magnification|magnification" packages/settings/src/index.ts
```

—— **扫描面只有 settings 包**。因为该包内确实搜不到，我就把结论**过度推广**成「全仓无」。
这与 §4.18 / §4.24 记录过的「关键词/名字只能定位候选，不能下结论」同源，
但这次的具体形态是：**把「某处没有」写成了「哪里都没有」**，而措辞里带上了「全仓」。

**实际状态**：
- `packages/editor-core/CoreEditor/src/@quicklook/zoom.ts` **已实现** `enablePinchZoom`：
  禁用原生放大（原生放大会让内容可滚动），改用 `inner.style.zoom` 的 **re-layout** 缩放（1.0–2.5），
  并处理 `gesturestart` / `gesturechange` / `gestureend`；`CoreEditor/test/zoom.test.ts` 有单测。
- 但它**只在 `setUpQuickLook` 里被调用**（`@quicklook/index.ts`），即**仅 macOS Quick Look 预览**；
  主编辑器走 `setUpMainApp`（`CoreEditor/index.ts`），**没有接线**。
- 另：该键在 Typora 是**原生菜单项**（`toggleAllowMagnification:`，`MainMenu.nib`；
  本机 dump 作「Allow Magnification => 双指缩放」，SF Symbol `hand.raised.fingers.spread`），
  **不是偏好面板项** —— §15.3 行 10 原称「三项均为偏好设置项」对此项也不准确。

**裁决：E（补齐）**，但**本轮只登记不实施**（**scope 决策，不是可行性判断**）。已查路径：
1. **不存在「启动前注入 config」的通道**：`buildBundleHtml` **只在构建期**被调用
   （`apps/desktop/scripts/build-editor-bundle.mjs` 写 `apps/desktop/public/editor/index.html`），
   iframe 的 config 是**构建期烘焙**的；宿主只能在加载后经 `setEditorConfig` 覆盖。
2. 故实施需四步：① 给 `enablePinchZoom` 加 **disposer**（现有实现**装上监听器就撤不掉** ——
   只做 enable 不做 disable 会给出「关了没生效」的控件，正是本项目反复记录的那类缺陷）；
   ② `CoreEditor/src/bridge/web/config.ts` 新消息 + `packages/editor-core/src/core.ts` 的
   `setEditorConfig` **白名单**（漏加 → 调用被静默丢弃）；③ Mellow 设置项 + `applySetting` 分支；
   ④ **渲染层重建**（`vite build` → `build-editor-bundle` → `verify-release-bundle`）+ 单测 + 护栏。
3. **且本环境无法验证手势行为**（需触控板 + GUI）；Typora 该键的**默认态也未能从一手证据确认**
   （用户 plist 无该键；`MainMenu.nib` / 二进制未暴露初始 state）→ 实施时默认取 `false`（保守）。

**为什么写这一段**：§4.23 记过我上一类错误（**把「没想到」写成「不可行」**）。
这次是**同一族但不同形态**：**把「一处没有」写成「处处没有」**。
两者的共同危害是**用确定的措辞掩盖了未验证的范围** —— 下一个读到的人（包括未来的我）
不会再去查，因为它「已经被确认过」。
→ 规则：写「**全仓无 X**」这类**范围性否定**时，必须写明**检索面**（哪些目录/文件类型）；
只搜了一个包就写「全仓」，是把范围当结论。

## 4.28 实施 §15.3 行 10 ③「双指缩放」—— 核心是给 `enablePinchZoom` 补 disposer（2026-09-30）

**承接 §4.27 的裁决 E**，本轮完成完整闭环。

**改动的核心不是「加一个设置项」，而是「让开关关得掉」**：
`enablePinchZoom` 原实现**装上三个手势监听器就撤不掉**（无返回值）。
它此前只服务 Quick Look（一次性只读预览），撤不掉无所谓；但一旦做成**用户可切换的设置**，
没有 disposer 就只能「只能开、关不掉」→ 给出一个**假控件**（关了但没生效），
正是本项目反复记录的那类缺陷。故本轮先给它补 disposer（移除监听器 **并复位内联 `zoom`**），
再谈接线。

**端到端七环**（照 `setFirstLineIndent` 的既有形态）：
1. `packages/settings/src/index.ts`：`editor.allowMagnification`（toggle / 默认 `false` /
   `applyCommand: 'settings.editorConfig'`）。
2. `CoreEditor/src/@quicklook/zoom.ts`：`enablePinchZoom` **返回 disposer**。
3. `CoreEditor/src/modules/config/index.ts`：`setAllowMagnification(enabled)` ——
   持有 `pinchZoomDispose`，开启时装、关闭时撤，**幂等**（重复开启不叠加监听器）。
4. `CoreEditor/src/config.ts`：`allowMagnification?: boolean`。
5. `CoreEditor/src/bridge/web/config.ts`：**声明并实现** `setAllowMagnification`。
6. `packages/editor-core/src/core.ts`：`setEditorConfig` **白名单**加 `'setAllowMagnification'`
   （漏加 → 调用被静默丢弃）。
7. `apps/desktop/src/App.tsx`：`applySetting` 的 live-apply 分支 + **启动恢复**下发。
   i18n zh/en 各 2 条。

**测试**：
- `CoreEditor/test/zoom.test.ts` +2 例：disposer 移除监听器**且复位内联 zoom**；disposer 幂等。
- 新增 `CoreEditor/test/allow-magnification.test.ts` 4 例：默认关不改动 / 开启后生效且 config 标志同步 /
  **★ 关闭后失效且复位** / 连续开启两次后关一次即完全失效（不叠加监听器）。
- ⚠️ 过程中踩到 jsdom 细节：**从未被赋值**的 `style.zoom` 读回 `undefined`（而 TS 类型是 `string`），
  直接写 `style.zoom ?? ''` 会被 eslint 判 `no-unnecessary-condition` → 改为带 cast 的
  `inlineZoom(el)` 辅助函数（既 lint 干净、又把该 jsdom 行为写进注释）。

**护栏**（`verify-settings-contract.mjs` 新节）：端到端七环逐环断言 +
**核心断言「`enablePinchZoom` 必须返回 disposer」** + 「disposer 必须移除 `gesturestart`」+
「关闭分支必须调用 disposer 并清空」。注入 **8 个 mutation，8/8 被检出**
（含「去掉 disposer 返回类型」「disposer 不移除监听器」「白名单漏加」）。

**⚠️ 如实声明两处边界**：
1. **默认取 `false`（保守）**：Typora 该键的默认态**未能从一手证据确认**
   （用户 plist 无该键；`MainMenu.nib` / 二进制未暴露初始 state），故**不改变现有行为**；
   若将来确认 Typora 默认开启，改一行 `defaultValue` 即可（护栏会同步要求更新）。
2. **真机手势未验证**：本环境无触控板 + GUI。已验证到「监听器装上 / 撤下、内联 zoom 写入 / 复位」
   这一层（jsdom + 单测），**真实捏合行为需真机会话补验** —— 与 §4.19 同类的边界。
   **不得**把本节读成「双指缩放已在真机上验证通过」。

## 4.29 §15.3 行 14b 剩项复核：「使用主题的字体大小」的作用域被写错了（2026-09-30）

**方法**：不靠回忆，直接读**本机 Typora 的一手资源** —— `Panel.strings`（`plutil -convert json`）
与偏好面板的编译产物 `TypeMark/page-dist/static/js/Preferences.*.js`。

**发现**：`useThemeFontSize`（面板标签「Use theme font size / 使用主题的字体大小」）
**不是通用偏好**，而是 **图片导出**分区里 `fontSize` 组的一个 **radio**：

```js
fontSize: { label: "Font Size", type: "group", content: [
  { key: "useThemeFontSize", type: "radio", options: {
      0: "Use custom font size", 1: "Use theme font size" }, default: 0 },
  { key: "imageFontSize", type: "number", unit: "px", default: 24,
    visible: e => !e.useThemeFontSize },
] }
```

消费点也在导出路径：`exportToImage` 里 `o.useThemeFontSize && (o.fontSize = void 0)`
—— 即**让主题 CSS 的字号生效**（而不是用一个自定义的 24px）。

**Mellow 侧对照**：图片导出只有 `format` / `width` / `quality` 三个选项，
**没有字号**；正文字号是**硬编码常量** `BODY_SIZE = 16`（`packages/export/src/image/index.ts`）。
→ 真实状态是「**缺选项 ＋ 默认值偏离**」：Mellow 固定 16px vs Typora 默认 24px。
**这处默认值偏离此前从未被记录过**（原条目只写「该项无实现」，看不出是导出子选项，
更看不出默认值不同）。

**裁决**：**E（补齐图片导出的字号选项）**，但**登记待实施**（**scope 决策，路径已查明**）：
- 需给 `ImageExportOptions` 加 `bodyFontSize`，把 `BODY_SIZE` 的约 10 处读取改为读该选项
  （该文件已有 `scale = size / BODY_SIZE` 的换算结构，可循此线程化）；
- ＋ 两个设置项（自定义字号 / 是否用主题字号）＋ 护栏。
- **⚠️ 关键风险（故不在本轮擅自实施）**：对齐 Typora 默认（24px）会**改变所有既有图片导出的输出**
  —— 面积按 1.5× 放大，更易触及 `MAX_IMAGE_HEIGHT` / `MAX_IMAGE_PIXELS` 长图保护。
  故「是否对齐默认值」需**视觉 / 真机确认**后再改，不能凭「对齐 Typora」一句话改。

**教训**：**「偏好面板里的一项」不等于「一项通用偏好」**。
Typora 的面板有**分区专属**的子选项（本项只在图片导出分区、且是 radio 的一半）。
把它的作用域写宽或写窄，都会让「缺口」看起来比实际大或小 ——
**记一项待办时，要连同它的作用域（哪个分区、和谁配对、默认值）一起记**，
否则下一个执行者会去改错的地方（比如去动编辑器的排版真源）。

## 4.30 实施图片导出正文字号（§4.29 的 E）—— 刻意**不对齐** Typora 的默认值（2026-09-30）

**范围**：只做 `useThemeFontSize` 那个 radio 组的**「自定义字号」一半**（`imageFontSize`）。
另一半（`Use theme font size`）**不做** —— Mellow 的图片导出是 **canvas 渲染**（显式 `fontFamily`），
**没有主题 CSS 通道**，其等价物（「跟随编辑器字号」？）需单独裁决。

**实现（端到端）**：
1. `packages/export/src/image/index.ts`：`ImageExportOptions.bodyFontSize?: number`；
   `MIN_IMAGE_FONT_SIZE=8` / `MAX_IMAGE_FONT_SIZE=48`；
   `resolveImageBodyFontSize(options)`（缺省/非法 → `BODY_SIZE`，越界 → clamp）；
   `layoutImageDocument` 里 `const body = resolveImageBodyFontSize(options)` +
   `rel(absolute) = (absolute / BODY_SIZE) * body` —— 标题/代码/脚注**等比缩放**，视觉层级不变。
2. `packages/settings`：`export.image.fontSize`（number / 8–48 / **默认 16**）。
3. `apps/desktop`：`handleExportImage` 读取该键并传入 `bodyFontSize`；i18n zh/en 各 2 条。
4. 单测 4 例（`packages/export/test/image.test.ts`）：默认不变 / 回落与 clamp /
   自定义生效且层级比不变、图高增加 / **★ `rel` 未退化成「不缩放」**（body=32 时 H1 必须恰为 56px）。

**⚠️ 刻意不对齐 Typora 的默认值（24）**：对齐会**改变所有既有图片导出的输出**
—— 面积按 1.5× 放大、更易触及 `MAX_IMAGE_HEIGHT` / `MAX_IMAGE_PIXELS` 长图保护，
需视觉 / 真机确认后再定。故本轮只**提供可配置能力**（用户可自行调到 24 对齐 Typora），
并把 `BODY_SIZE` **锁进护栏**（`verify-settings-contract.mjs` 断言它必须仍为 16）——
防止将来有人「顺手对齐 Typora」而静默改变既有输出。
→ 护栏只锁**接线**；`rel()` 的**正确性**由单测的**行为断言**锁
（**不要把表达式形态也锁进护栏**：那是形状锁，既拦合法重构、又保护不了行为）。

**⚠️ 本轮我自己的三个错，都值得记**：
1. **整段替换改到了自己刚插入的代码**：我用「按函数切片 + `replaceAll('BODY_SIZE', 'body')`」
   做机械替换，而 `rel` 的定义是我**同一步刚插入**的 —— 于是它被改成
   `(absolute / body) * body` ≡ `absolute`，**等比缩放被静默禁用**（标题保持 28px、正文变 32px，
   层级被压平）。靠**逐行读回**才发现。→ 教训：**机械替换的范围里若含你自己刚写入的内容，
   要么把它放在替换之后写，要么替换后逐行复核**。已补单测锁死该行为（H1 必须恰为 56px）。
2. **子串断言放过了「键改名」**：护栏里写 `!/mellow\.export\.image\.fontSize/.test(appSource)` ——
   而 `mellow.export.image.fontSize` 仍是 `...fontSizeX` 的**子串**，故「把键改名」这种漂移
   **不会被检出**（实测是靠 canary 意外发现的）。→ 改为带引号的精确键 `/'mellow\.export\.image\.fontSize'/`。
3. **我的改动打断了一个护栏自己的 canary**：`verify-doc-code-refs.mjs` 的 canary **硬编码了行号范围**
   （`inRange(1719, 1741)` 必须含 `insertLocalImage`）；我改 App.tsx 使该符号从 1721 挪到 1743 →
   canary **误报「判据失效」**（判据其实好好的）。→ 改为**从文件现算**符号所在行做正样本、
   用文件第 1 行（`/**`）做负样本。**这恰是该护栏自己要防的那种脆弱性，不该出现在它自己的 canary 里。**
   同批还修正了两处 `insertLocalImage` 的行号引用（原写 `App.tsx:1721-1739`，已随改动漂移）→ 改为**符号引用**。

## 4.31 **我自己的变更记录把 CI 打红了** —— 更正块引用旧引用会命中紧邻形态护栏（2026-09-30）

**现象**：`07b445d` 的 CI 在「Typora parity guardrails」两个 job（ubuntu + windows）**都失败**，
而本地 `npm run parity` **全绿**。用 `gh`（本机已登录为仓库所有者）取到失败日志，报的是：

```
docs/plans/typora-parity-master-plan.md：引用「insertLocalImage」（App.tsx:1721-1739）
在被引行范围内找不到该符号（该行现为：const next = !prev;）
```

**根因**：这句话**本身**就是我**在同一个提交里**写的变更记录 ——
「同批修正两处 `insertLocalImage`（`App.tsx:1721-1739`）的行号引用漂移 → 改为符号引用」。
它**复现了护栏要抓的紧邻形态** `` `符号`（`文件:行号`） ``，于是被当成真引用判定；
而那个行号**本来就该是错的**（它正是我要修掉的旧引用）。
→ **护栏的判定没有错，是我踩了它已声明的形态。**

**为什么本地没发现**：我的 `npm run parity` 跑在**写变更记录之前**，之后才补上那一行并提交。
**本地绿是「跑得早」，不是「没问题」** —— 而 CI 是对着**提交**跑的，所以它抓到了。
这正是 §4.16「提交前的门禁必须对着**最终内容**跑」的又一次实例。

**处置**：
1. 把「引用旧引用」的写法改成**非紧邻**形态：
   「同批修正两处 `insertLocalImage` 的**行号引用**（原写 `App.tsx:1721-1739`，已随改动漂移）→ 改为符号引用」
   —— 符号与 `文件:行号` 中间加字，不再匹配紧邻形态（该护栏头部已声明只覆盖紧邻形态）。
2. 给护栏加一条**提示**（**不改判定强度**）：当被判定的引用所在行含「原写 / 更正 / 漂移」等标记时，
   失败信息里明确指出「这像是在描述一次修正，请改用非紧邻写法，**不要**去改行号
   （那个行号本来就该是错的）」。实测：把旧形态写回即触发该提示。

**复现方法（值得记）**：本地工作区可能因「跑得早」或含未提交改动而与提交不一致 →
用 **`git worktree add --detach /tmp/xxx <sha>`** 建一个干净检出，在那里跑护栏，
即可**等价于 CI 的 checkout**。本次正是靠它复现并确认修复的（本地跑绿但 worktree 跑红）。

**教训**：**「描述一次修正」的句子会复现被修正的形态** —— 写更正块时，
要么用非紧邻写法，要么让护栏显式豁免更正块（本仓库此前的约定）。二者选一，不要留给下一个人踩。

## 4.32 我**第四次**犯同一个错：只搜了一个文件，就断言「从未被测过」（2026-09-30）

**这次查的是 `clipboard-smart-paste-spec` §10（Security）**，顺着 `security-review-2026-08-13.md`
的 H1（P0）走。我 grep 了 `packages/app-core/test/reader.test.ts` 里的
`sanitiz|script|javascript|onclick|sandbox|实体|entity`，只命中 2 条 →
于是写下「**H1 的确切绕过机制（实体编码）从未被测过**，一旦有人把 DOM 净化改回正则式，现有测试仍然全绿」，
并据此「补」了一组回归用例。

**结果是我错了**：仓库里有一个**专门的** `packages/app-core/test/reader-sanitize.test.ts`
（7 例，文件头第一行就写着「**Security Review H1 回归**：Reader 原始 HTML 净化（DOM 白名单）」），
**已经覆盖**实体编码 / data: / 事件属性 / 危险协议 / 嵌套 / 允许标签保留 —— 正是安全审计建议的全部变体。
我只是**没有去列这个包 test 目录下的文件**。

**同一母题的第四次**（前三次见 §4.18 的 IME 不变量、§4.21 的孤儿 spec、§4.24 的 `t()` 扫描）：
- 第 1 次：扫描器只收 `.mjs`/`.json`，**漏 `.md`** → 把被 8 处引用的 spec 报成孤儿；
- 第 2 次：关键词法假设「一处集中」，而 7 条不变量**分散在 3 个测试文件 + 一个 CI 矩阵**；
- 第 3 次：全仓扫描漏 `.md` → 误报「隐私约束无人守」；
- **第 4 次（本条）**：只 grep 了一个测试文件 → 断言「从未被测过」。
→ 三次的共同形态：**把「我搜到的地方没有」当成「全仓没有」**。
我在 §4.27 已经为「范围性否定」立过规则（**必须写明检索面**），但**这条规则当时只写进了文档，
没有变成我的检索动作** —— 所以它没能拦住第四次。

**机械做法（这次要真正落地）**：判定「X 有没有人守」之前，**先 `ls` 该结论可能出现的目录**，
把候选文件列全（本次就是 `packages/app-core/test/`），再逐个读；**不要从一次 grep 的命中数直接下结论**。

**处置**：① 把「补」出来的用例**归位**：真正新增的 4 个变体（十六进制 / 无分号实体、`mailto:` 正向对照、
非白名单标签 `form/input`、IFRAME `sandbox=""` 精确值）+ 1 条 KBD 一致性回归，**并入既有的
`reader-sanitize.test.ts`**（避免同一关注点两处安家）；我从 `reader.test.ts` 追加的那一组已撤回。
② 更正我在两份审计文档里刚写的措辞（「已按建议补齐回归变体」→「**回归测试本已存在**，本轮只补未覆盖的变体」）。
③ 本轮**真正的新发现**保留：**两处净化器实际已分叉**（engine 有 `KBD`、app-core 没有）→ 已修，
并新增「两处净化器必须一致」护栏（首跑即报出该分叉）。

## 4.33 状态矩阵缺 spec §21 的第 16 态 `keyboard`，且**出处引用写错**（2026-09-30）

**动因**：逐条比对 `docs/specs/live-markdown-engine-spec.md` **§21 Required Test Matrix**
（该节明确列出 **16** 项）与 `packages/editor-engine/test/state-matrix.test.ts`。

**发现 1 —— 缺一态**：§21 列 `… delete-start / delete-end / **mouse** / **keyboard** / source-live switch`。
矩阵只有 15 态：`mouse` 以 `mouse-click` 之名存在，**`keyboard` 完全没有**。
`mouse-click` / `caret-*` 都走**程序化 `moveCaret`**（直接改选区），因此此前**没有任何用例**覆盖
「**真实 `keydown` → CM keymap → selection → reveal**」这条**组合**链路 ——
即「按键没生效」或「keymap 装配漏了」这类故障，在旧矩阵里**不会红**。

**发现 2 —— 出处失真**：`state-matrix.test.ts` 头部写「§6.2 节点统一 15 状态矩阵（typora-parity-master-plan §6.2）」。
但 `typora-parity-master-plan.md` **§6.2 实为「布局不变量（不得违反）」**，与状态矩阵无关。
真值源是 **engine spec §21**。这类「引用到一个存在但不相干的章节」比「引用不存在的章节」更隐蔽 ——
链接能点开、章节号看着合理，于是没人回头核。

**处置**：
1. 补 `keyboard` 态（11 个 marker 家族参数化 + FencedCode 专述各 1 例）。
   `defaultKeymap` 在产品里由 CoreEditor 装配、本 harness 不含 → 用例内**显式加**，与真实路径一致。
   断言分三段：**前提**（按键确实把 head 左移且落进节点）、**效果**（该家族的 reveal 判据成立）、
   **无副作用**（spec §8：doc 未被改写）。
2. **非恒绿验证**：把 `keymap.of(defaultKeymap)` 换成空绑定 → **12 个 `keyboard` 用例全部失败**（11 家族 + FencedCode）。
3. 同步 `widget-state-matrix.test.ts`（9 家族，补 `keyboard`）→ 该文件头部「15 状态与 state-matrix 相同」也随之更正为 16。
4. 更正出处引用（`§6.2` → engine spec `§21`），并更正 master plan / ledger 中 8 处「15 状态矩阵」自述。

**判定陷阱（本轮真正的教训）**：`keyboard` 态最初用 `hiddenWhenIdle(view)).toBe(false)` 作 reveal 判据，
**首跑 11 个家族里 Link 家族红**。这不是缺陷 —— 对 mixed 模型的 Link，`hiddenWhenIdle` 探的是
**URL 是否隐藏**（`markerTexts.includes('https://example.com')`）；而 `hiddenMarkers` 里
`inUrl` 是**开区间** `(node.from+open, node.from+close)`，两次左移的落点 `end-1` 恰是 `)`（= `close`）
→ 按 spec §12 判为 **text 区**，此时 **URL 仍应隐藏、只显示 `[`/`]`**，
故 `hiddenWhenIdle === true` 是**正确**的 mixed 行为。

> **差点踩的坑**：一个「红」的用例、一条「把断言放宽一点就绿了」的捷径。
> 若当时把 Link 塞进 `skipStates` 或改判据方向，就会把**误用判据**这件事**永久掩盖**。
> 正确做法是回到 spec §12 读规则、确认行为正确、然后换用**各家族统一**的 reveal 判据
> `revealedWhenTouched`（`caret-*` / `mouse-click` / IME / undo / redo / paste 同用），
> 并补一条「起点处该判据必须为 false」的非恒绿前提，使「false → true」的翻转成为被断言的事实。
> **本轮我自己的一个错（记下，同族错误第二次）**：做非恒绿验证时，我用 `replace_all` 把
`history(), keymap.of(defaultKeymap), install(false)]` ↔ `history(), install(false)]` 来回替换，
**第二次替换的方向是「加」**，于是它把 `keymap.of(defaultKeymap)` 也加到了**另外两处本来没有它的构造点**
（`makeView` 的 history 分支、FencedCode 的 undo/redo 用例）。这三处**测试全绿**（keymap 对它们无副作用），
所以**绿不会报警**；是靠 `git diff` 逐行读回发现的。→ 与 2026-09-30 图片字号那轮的
`replaceAll('BODY_SIZE','body')` 是**同一母题**：**`replace_all` 的作用域是全文件，不是「我刚写的那一处」**。
机械做法：**替换前先数出现次数**，或改用带上下文的单点替换（`old_string` 里带上前后行）。

**判定：矩阵不是覆盖不足，而是「按 §21 少一态」＋「判据用错」两件事叠在一起。**

## 4.34 `live-markdown-engine-spec` §4–§20 逐节复核（2026-10-01）

§21（测试矩阵）已在 §4.33 处理；本轮把 §4–§20 的**每一条具体声明**逐条对到守护它的测试。
方法：**先 `ls` 测试目录把候选文件列全**，再逐个读用例名/断言本体（§4.22 的机械做法），
**不用关键词命中判定**（§4.18 的教训）。

| spec 节 | 声明的具体条目 | 守护它的测试 | 结论 |
|---|---|---|---|
| §4 Node State | `source` / `rendered` / `mixed` / `invalid` 四值 | `packages/editor-engine/src/types.ts` 的联合类型与 spec **逐字一致**；`state.test.ts` + `invalid-fallback.test.ts` | ✅ |
| §5 Reveal Policy | 6 条进入 source/mixed 的条件 | `state.test.ts` 的 rule 1 / 2 / 3 / 5·6；rule 4（invalid/partial）→ `invalid-fallback.test.ts` | ✅ |
| §6 Composition Guard | 8 条禁止 | `ime-guards.test.ts`（8 个功能各一条「合成期冻结 → 结束恢复」）+ `ime.test.ts`；逐条核对见 §4.18 | ✅ |
| §7 Undo Contract | ① 一个动作 = 一个 undo group ② doc switch 不进上一文档历史 ③ recovery restore 不混入普通 undo | ① `undo.test.ts` / `undoGrouping`（21 例）+ `task-checkbox.test.ts`「点击后一次 undo 还原」；② `document-isolation.test.ts`（见 §4.20）；③ **无专测** —— 但与 ② **同机制**：`handleRecover → host.open → resetEditor`，而 `resetEditor` 是 `destroy()` + 新 `EditorState.create`（历史存在 StateField 里，状态不复用即历史不复用） | ⚠️ ③ 无专测（机制已被 ② 的行为断言覆盖；**如实记录，不假装有**） |
| §8 Caret Stability | document position / selection anchor·head / scroll anchor 三条 | §4.17：前两条已进状态矩阵（`caret-*` / `mouse-click` / `selection-*` / `keyboard` 各断言 doc 与选区不变）；第三条需真实布局 → **如实降级为「本 harness 不判定」** | ⚠️ 降级（按 §4.17 后续项 2） |
| §9 Heading | instant reveal / **无宽度跳变导致滚动位移** / 空标题安全 / setext | `heading.test.ts`（H1–H6 idle·caret、空标题安全、Backspace 退化、Typora Parity 对照）+ `invalid-fallback.test.ts`；**宽度跳变需布局** → 归 e2e/真机 | ✅（宽度项降级） |
| §10 Strong/Emphasis/Strike | 嵌套标记独立 | `nested-inline-formatting.test.ts` 的「P4.6 嵌套 reveal —— 层级独立性（spec §10）」13 例 | ✅ |
| §11 Inline Code | monospace / background / backticks hidden；caret inside 时 **no autocorrect/spellcheck** | monospace 与 backticks：`format-inline-code.test.ts`；**autocorrect**：原先**无守卫**（已修，见 §4.35）；**spellcheck**：**未实现**（见下） | ⚠️ 两处 |
| §12 Links | rendered / caret in text / caret in URL / broken indicator（subtle + source 不变） | `md-link.test.ts` + §4.32；broken 指示的「非颜色线索」见 §4.19 | ✅ |
| §13 Images | widget / caret 进入 reveal / 失败占位 + path / **无静默路径改写** | `image-widget.test.ts` / `image-ops.test.ts` / `image-path.test.ts` / `image-size.test.ts` / `image-insert.test.ts` | ✅ |
| §14 Lists/Quotes | idle 视觉归一 / caret 行显示 / Enter 续行 / 空行终止 / **嵌套缩进原样** | `format-list.test.ts`（「Enter continuation」「Empty item terminate」「multiline item：续行不新增 marker」）+ 嵌套缩进断言（`'- item\n  - second'` 原样） | ✅ |
| §15 Task List | checkbox widget / patch `[ ]`·`[x]` / 一个 undo / **不重写整行** | `task-checkbox.test.ts`（「不重写整行（其他内容原样）」「点击后一次 undo 还原（单 transaction）」） | ✅ |
| §16 Code Fence | code 恒 source / 围栏可见 / 语言 UI / mermaid·math 围栏 | `codeFence.test.ts` + `format-code-fence.test.ts` + 状态矩阵 FencedCode 专述 | ✅ |
| §17 Table | 不转富文本 / 文本 patch / 最小改动行 / 大表不全量重解析 | `table-engine` / `table-live-view` / `table-undo-diff` / `table-large` / `table-parser` / `table-keyboard` / `table-toolbar` / `table-column-width`（8 个文件） | ✅ |
| §18 Math | idle 渲染 / caret inside source / error | `math.test.ts` + 状态矩阵 widget 家族 | ✅ |
| §19 Mermaid | idle widget / caret source / debounce / cancellation token / viewport lazy / security | `mermaid.test.ts` + `widget-state-matrix` | ✅ |
| §20 Performance Budgets | 输入 P95 < 16 ms 等 | **无机器断言** —— ADR-0026 Q3 已裁决「16 ms 目标在屏幕捕获上原理性不可判定」→ 改为应用内埋点（`inputLatency.ts`） | ⚠️ 按裁决降级 |

**§11 的第二个缺口（spellcheck）**：全仓只有 `packages/editor-core/CoreEditor/src/styling/nodes/code.ts` 的
`codeBlockStyle` 给 **FencedCode / CodeBlock** 设 `spellcheck=false` / `autocorrect=off` /
`autocomplete=off` / `autocapitalize=off`；**`inlineCodeStyle` 只加 class，不带任何属性**。
→ 行内代码内**浏览器拼写检查仍会画红波浪线**，与 §11 的「no spellcheck」不符。

**处置（2026-10-01 当日已实施）**：按 `UPSTREAM.md` 的取向落在**引擎侧** ——
新增 `packages/editor-engine/src/inlineCodeAttrs.ts`（`buildInlineCodeAttrsExtension`）：
对每个 `InlineCode` 节点加一个**只带属性、不改视觉**的 mark decoration
（`spellcheck=false` / `autocorrect=off` / `autocomplete=off` / `autocapitalize=off`，
与块级 `codeBlockStyle` 逐字对齐），视口裁剪 + composition 期间只映射不重算（与 `plugin.ts` 同序）。
测试 6 例（含「无行内代码 → 0 个」「围栏代码**不**被本扩展标记，块级不重复」「caret 进入后属性仍在且 doc 不变」）；
**非恒绿验证**：关掉该扩展的产出 → 4 例失败、2 例对照仍绿。

**同时补一条护栏**：这两处表达的是**同一件事**（「这段不是自然语言」），
分叉的表现是「围栏内不画红波浪线、行内代码内画」——屏幕上看不出原因。
故在 `verify-parity-ledger.mjs` 新增「**行内 / 块级代码属性必须一致**」
（解析两处的 `'key': 'value'` 对并逐项比对 + canary）。
**非恒绿验证**：把引擎侧 `autocapitalize` 改成 `on` → 护栏报出分叉；还原 → 通过。

> ⚠️ **本段先前的成本判断是错的，记下来**：我原写「路径已查明、登记待实施」，理由是
> 「引擎侧新增属性装饰是**渲染管线的新增责任**（不是『补一个属性』那么小）」。
> 实际改动面是**一个约 100 行的独立模块 + 6 条测试**（不触碰既有管线），当天就做完了。
> → §4.10 的风险不止「写成『不可行』」，也包括「**把它写成看起来需要大工程的待办**」；
> 定「待实施」之前应先把**改动面算清**（哪怕只是列出要碰的文件），而不是凭印象定规模。
> （**注意不要写成「不可行」** —— 见 §4.10：把「没想到」写成「不可行」会永久关闭一个可做的项。）

## 4.35 智能标点**没有代码上下文守卫**，且既有用例是**空壳**（2026-10-01，已修）

**缺陷**：`packages/editor-engine/src/smartPunctuation.ts` 的 `handleSmartPunctuation` 是**全局 inputHandler**，
**没有任何代码感知** —— 开启智能标点后，在 `` `code` `` 或代码围栏内键入 `"` 会被改写成弯引号，
即**静默改写代码文本**（违反 spec §2「Markdown Text 唯一真源」/ §11 / §16）。

**为什么长期没被发现**：`format-code-fence.test.ts` 有一条名为
「code 内编辑保留源码（无 smart punctuation 改写）」的用例 —— 但它用**程序化 `view.dispatch(...)`**。
`inputHandler` 只对**用户输入**触发，程序化 dispatch **永远绕过它** → 该断言**恒真**。
再加该功能**默认关闭**（`smartPunctuationEnabled = false`），这条用例是**双重空壳**。

**修复**：新增 `isInsideCodeContext(state, pos)`（语法树父链，`resolveInner(pos, -1)` 命中
`InlineCode` / `FencedCode` / `CodeBlock` / `CodeText` / `CodeInfo` / `CodeMark` 即判定为代码上下文；
**O(树深)，不是全文扫描**），并在 handler 的两条分支**之前**早退。

**测试改为走真实的 handler 链**（`state.facet(EditorView.inputHandler)`，与 CodeMirror 的调用方式一致）：
- 行内代码内 / 代码围栏内键入 `"` → handler **不接管**、doc 一字未改；
- **反向对照**（防「一律不转」）：普通文本中键入 `"` → 接管并转成弯引号；行内代码**之后**的文本仍可转换；
- 另加 `isInsideCodeContext` 的两条单元断言（代码内 true / 代码外 false）。

**非恒绿验证**：注释掉那行守卫 → **3 条用例失败**（行内代码、代码围栏、以及上面那条原空壳用例的替代版）；
两条反向对照仍通过。还原 → 全绿。

**教训（与 §4.7「测试名 / 注释不是守护」同族，但更强）**：
**「程序化 dispatch」不能用来断言 inputHandler 行为**。凡是「按键 → handler」的契约，
必须走 handler 链（或真机），否则得到的是**恒真断言**——它比「没有测试」更危险，因为它会让人以为已经守住了。

## 4.36 `packages/editor-core/UPSTREAM.md` 与现状矛盾：re-vendor 会**静默丢弃** Mellow 的改动（2026-10-01，已修）

**发现**：`packages/editor-core/UPSTREAM.md` 写

> DO NOT modify files under CoreEditor/ directly.
> Changes belong in apps/desktop/src/host or Mellow-specific packages.

**但仓库里 `CoreEditor/` 已有 18 个改动文件 + 3 个新增测试**（下表）。更危险的是它的 re-vendor 步骤是
`cp -R /tmp/MarkEdit-src/CoreEditor ./CoreEditor` —— 这会**静默覆盖/删除**全部 Mellow 改动，
而**没有任何测试会因此变红**（丢的是行为与回归，不是编译错误）。

**取证方式（不靠回忆、不靠人工枚举）**：取**本文件钉住的 commit** 的官方 tarball，逐文件 diff：

```sh
curl -sL https://codeload.github.com/MarkEdit-app/MarkEdit/tar.gz/<COMMIT> -o /tmp/markedit.tar.gz
diff -rq /tmp/markedit-up/MarkEdit-<COMMIT>/CoreEditor packages/editor-core/CoreEditor \
  --exclude=node_modules --exclude=dist --exclude=.yarn --exclude=yarn.lock --exclude='*.tsbuildinfo'
```

结果：**修改 18 个**（`src/@quicklook/zoom.ts`、`src/bridge/web/config.ts`、`src/config.ts`、
`src/extensions.ts`、`src/languages.ts`、`src/modules/config/index.ts`、`src/modules/indentation/index.ts`、
`src/modules/input/index.ts`、`src/modules/input/insertCodeBlock.ts`、`src/styling/builder.ts`、
`src/styling/config.ts`、`src/styling/markdown.ts`、`src/styling/nodes/heading.ts`、
`src/styling/nodes/indent.ts`、`src/styling/themes/github-{dark,light}.ts`、`test/zoom.test.ts`、`.gitignore`）
＋ **新增 3 个测试**（`document-isolation.test.ts` / `allow-magnification.test.ts` / `codeBlockFence.test.ts`）。

**处置**：改写 `UPSTREAM.md` ——
① 保留「优先落在 Mellow 自己的包」的取向，但**如实承认规则事实上已被打破**；
② 列出**逐文件改动清单**（含规模与要点）；
③ 给出**现算清单的命令**，要求 re-vendor 后重跑；
④ 修掉上游示例里 `git rev-parse HEAD > UPSTREAM.md` 这一行 —— 它会把整份文档**覆盖成一行 hash**，
   连带删掉清单（同一个「静默丢内容」隐患）。

**为什么没有 CI 护栏**：生成/校验清单需要**下载上游源码**（网络 + 钉住 commit），CI 不可用 ——
与 `audit-typora-menu-labels.mjs` 需本机 Typora 同类。**如实记录为人工工具**，不用一个恒真的假护栏冒充。

## 4.37 一条**依赖固定时长的时序用例**在全量套件下偶发假红（2026-10-01，已修）

**现象**：`packages/editor-engine` 整包（77 suites）跑出 **1 failed** —— `test/math.test.ts` 的
「heavy render is scheduled async and stale render is ignored while typing」；
而**单独跑该文件 9/9 全绿**。

**判因（量化，不停在「大概是抖动」）**：该用例在 `view.dispatch` 后用固定 `await sleep(60)` 等异步渲染完成
（`debounceMs: 20` + renderer 内 `await sleep(10)` + 调度）。实测该用例**总耗时 59 ms** ——
原来的余量只有约 **1 ms**，套件级负载一高就「还没渲染完就断言」。

**为什么必须修而不是「重跑一次」**：这类假红的代价不是一次重跑，而是**训练人忽略红灯**；
更糟的是它**掩盖真断** —— 同一位置若真回归，也会被当成抖动放过。

**处置**：改用 harness 里为此提供的等待原语
`waitFor(() => view.dom.querySelector('.custom-math') !== null)`。
`waitFor` 超时仍返回 `false` → 断言照旧会红（**不会**退化成恒绿）；断言本体（`calls` 与 `textContent`）不变。

**判据沉淀**：**「单跑绿、整包红」先怀疑时序，但必须给出量化依据**（本例：实测 59 ms vs 预算 60 ms）
—— 没有量化的「大概是抖动」就是猜。

## 4.38 `document-file-safety-spec` §1–§12 逐节复核 + 抓到「撤销重命名不同步最近文件」（2026-10-01）

方法同 §4.34：**先 `ls` 候选目录/文件，再逐个读用例名与断言本体**，不用关键词命中判定。

| spec 节 | 声明的具体条目 | 守护它的测试 / 证据 | 结论 |
|---|---|---|---|
| §1 最高原则 | 用户数据安全优先于一切体验优化 | 由以下各节 + corpus 的硬指标（**data loss = 0 / silent overwrite = 0**）体现 | ✅ |
| §2 Document Identity | path / file identity / encoding / EOL / mtime / dirty / revision / recovery id | `packages/app-core/src/documentState.ts` 的 `DocumentTab` 八个字段齐备（`documentId` 即 recovery id、`diskState.identityKey` 即 file identity）+ `documentState.test.ts` | ✅ |
| §3 Source Fidelity | Open→No Edit→Save = **byte identical** | `apps/desktop/src-tauri/tests/file_safety_corpus.rs` 的 `source_fidelity_open_no_edit_save_byte_identical`；CI 的 `cargo test` 步骤（`ci.yml` 名含 file-safety）会跑 | ✅ |
| §4 Save Pipeline | validate → encode → temp → flush → **fsync** → replace → verify → revision → clear recovery | `src-tauri/src/fs.rs` 的 `atomic_save` 逐条对应，且**多做了**三件：symlink 解析、原权限保留、替换后**读回 verify**；`fs.rs` 单测 15 条 + corpus | ✅ |
| §5 External Change | clean → 自动重载 + **preserve cursor**；dirty → **never overwrite** + Compare/Reload/KeepLocal | `externalChange.test.ts` 9 例；「preserve cursor」的**机制**由 `CoreEditor/test/core.test.ts` 的 `resetEditor documentChanged=false` 5 例断言（App 的 `handleCleanChange` 传 `false`） | ✅ |
| §6 Recovery | 与 autosave **分离** / 仅 AppData / 按 document id 键 | `recovery.test.ts` 5 例（含「模拟重启 → listPending → recover → ignore」）；「分离」由代码结构坐实：`scheduleRecoverySnapshot` 位于 `contentEdited` 分支内、**不受 autosave 开关门控**（关掉自动保存不会关掉崩溃恢复） | ✅ |
| §7 Crash Safety | kill during typing / during temp write / before replace / after replace before commit | corpus 的 `crash_during_save_never_partial_or_loss`（SIGKILL，断言「只可能是完整旧内容或完整新内容」）+ `crash_residue_temp_cleaned_on_next_save` + `fs.rs` 的 `rename_failure_original_intact_temp_cleaned` | ✅ |
| §8 File Operation | Delete: trash first；Rename/move: watcher aware / update tab path / update recent / image refs **only if explicit rule** | `documentRename.test.ts` 9 例（含「有 assets + **拒绝**同步 → 引用保持有效」「asset 目录重命名失败 → **回滚**文档重命名」「目标已存在 → conflict 零改动」）；watcher 重挂与 recent 同步在 App 层 → 见下方新增护栏 | ✅（+ 本轮补护栏） |
| §9 Encoding | UTF-8 / UTF-8 BOM / UTF-16 read / 默认 UTF-8 无 BOM / 保存保留原编码 | `fs.rs` 的 `roundtrip_all_encodings` + `detect_eol_and_encoding` | ✅ |
| §10 EOL | LF / CRLF，默认保留原样 | `fs.rs` 的 `detect_eol_and_encoding` + CoreEditor `lineEndings.test.ts` + `app-core/finalNewline.test.ts` | ✅ |
| §11 Special Storage | iCloud / OneDrive / Dropbox / SMB / NFS / removable / symlink / read-only / permission denied / disk full | corpus 逐项覆盖：只读目录、权限拒绝（目录 0555）、**disk full 用 `RLIMIT_FSIZE` 让子进程写中途失败（EFBIG，与 ENOSPC 同路径）**、symlink（保存保留 symlink 并更新目标）、云同步（外部替换语义）、网络共享只读、外部 rename / delete、杀毒锁（rename 被拒）。**无挂载点的项用等价语义并写明理由**（不假装测过真挂载点） | ✅ |
| §12 Release Blockers | silent overwrite / partial save corruption / lost recovery / wrong encoding / wrong EOL / history crossing tabs / rename path mismatch | 依次：corpus 4 例（git checkout / VS Code / 云同步 / rename / delete）· corpus + `fs.rs` · `recovery.test.ts` · `fs.rs` roundtrip · 同上 + `lineEndings.test.ts` · **§4.20** · `documentRename.test.ts` + **本轮新增护栏** | ✅ |

### 本轮抓到的真缺陷：**撤销重命名不同步「最近文件」**

`apps/desktop/src/App.tsx` 的 `undo()` 里，撤销重命名分支此前只做三件事
（`filePathRef` / `setDocumentPath` / `watchDocument`），**漏了 recent**。

**后果**：`重命名 → 撤销` 之后，`File → 打开最近文件` 仍指向**已不存在的**新路径
（点击必然失败），且列表里长期残留一条 `missing` 条目。

**为什么这是「同型缺陷的第二次」**：`applyDocumentRename` 里有一段注释记录了**正向**版本 ——
「此前只有 `applyDocumentMove` 做了这一步，rename 漏了 —— 重命名后 File → 打开最近文件
仍指向**已不存在的旧路径**，点击必然失败，且列表里长期残留一条 missing 条目」。
同一个不变量、同一个后果，只是**方向相反**。根因不是「忘了写」，而是
**同一件事在 4 个地方各内联一份**（`applyDocumentRename` / `applyDocumentMove` /
`handleTrashDocument` / `undo`）—— 只要有一处没跟上就会复发。

**修复（两件）**：
1. **提取共享纯函数**（`packages/app-core/src/recentFiles.ts`）：
   `replaceRecentFilePath(list, from, to)` 与 `removeRecentFilePath(list, path)`；
   4 处调用点全部改走它们（语义与原先的内联实现**逐字一致**，故对既有 3 处是**行为保持**的重构，
   本轮唯一的行为变更是补上撤销侧）。新增 6 条单测（含「撤销 = 反向调用同一函数」「幂等」「纯函数不改入参」）。
2. **扩展既有的最近文件护栏**（`verify-sidebar-contract.mjs` ⑳b 节 —— **不是**新写一条，
   避免同一不变量两处守）：
   ① `RECENT_CONTRACT` 补 `undo` 一行（本缺陷的直接防线）；
   ② 判定前 **`stripComments`**；
   ③ 新增「不得再出现**内联**的 recent 路径改写」断言（内联多份正是「漏掉一处」的成因）。
   **非恒绿验证**：A. 把撤销分支的同步整段移除 → exit 1 并报「undo 未同步最近文件」；
   B. 把某处还原成 `prev.map((e) => (e.path === …))` → exit 1 并报「仍有 1 处内联」；均还原后 exit 0。

> **两次「护栏自己出问题」的记录（都靠 canary 抓到）**：
> ① **重构打断既有 canary**：⑳b 原有的 canary 靠替换**内联**形态 `prev.map((e) => (e.path === path`
> 来注入漂移；我把 4 处改成共享纯函数后，该锚点不复存在 → 护栏**响亮失败**
> （「最近文件 canary 未武装」）而不是静默放过。这正是护栏该有的行为 —— 顺带说明
> **canary 的注入锚点也是一种契约**：改实现形态时必须同步更新它。
> ② **注释里的标识符让判定恒真**：我新加的 `undo` 契约首版用 `body.includes('setRecentFiles')`
> 判定，而 `undo` 分支里**一行解释性注释**恰好写着 `setRecentFiles` → 「同步整段移除」的漂移
> 仍被判为已同步（canary 未报错）。→ 判定前必须 `stripComments`（本项目已记过的坑，这次是
> **在我新写的护栏上复发**）。这两条都说明：**护栏必须配 canary，且 canary 必须验证「能翻转」**，
> 只验证「注入成功」是不够的。

> **为什么这次值得加静态护栏**：§7③ 与 §5 的接线（`handleRecover → host.open`、
> `handleCleanChange` 传 `false`）我判定为**不加护栏**，因为护栏无法表达「是否走了正确路径」；
> 而**本条可以**——不变量是「这个分支里必须出现这个调用」，是可机械判定的。
> **判据：护栏要能真正拦住被测的那类缺陷，否则不加**（不加一个恒真的假护栏）。

## 4.39 `table-editing-spec` §1–§10 逐节复核：两处**未实现**、一处**规格失真**、一处**规格漏收**、一处**无一手依据**、一处**零测试**（2026-10-01）

方法：**先把 8 个表格测试文件的 102 个用例名全部列出来逐条读**（`table-parser` / `table-engine` /
`table-keyboard` / `table-toolbar` / `table-undo-diff` / `table-live-view` / `table-large` / `table-column-width`），
再逐节对到实现；**一手证据取本机 Typora 1.14.9 的资源**（不靠回忆）。

| spec 节 | 声明 | 守护 / 现状 | 结论 |
|---|---|---|---|
| §2 数据原则 | source 唯一真源 / 禁止完整 serialize | `table-engine` 全篇断言「1 处 insert / 只 patch delimiter 行」；`table-large` 的 100×30 断言「其他 101 行逐字不变」 | ✅ |
| §4 Toolbar | 9 个动作 | `table/toolbar.ts` 有 **11** 个（多出 move 相关）；`table-toolbar.test.ts` + e2e `widget-buttons-verify.mjs` | ✅ |
| §5 Keyboard | Tab / Shift+Tab / last+Tab / Mod+Enter / arrows / Esc | `table-keyboard.test.ts` 14 例（含真实 keydown 管道、Esc 关 toolbar、表格外交回默认）；`table-engine` 亦有 | ✅ |
| §6 Minimal Patch | add row 一行 / alignment 只改 delimiter / tidy 唯一重排入口 | `table-engine`（1 处 insert）+ `table-undo-diff` + `table-column-width`（`delimiterPatch` 只替换目标单元格） | ✅ |
| §8 IME | 合成期不重排 / 不规范化 / 提交后更新 | `table-keyboard` 的「composition 期间 Tab 不移动 caret」「Mod+Enter 不 add row」+ `table-live-view` 的「compositionend 后一次性提交且不重建整张表」+ e2e IME 8/8 | ✅ |
| §9 Large Table | 100×30 可用 / 不每键重建 / viewport | `table-large.test.ts` 15 例 | ✅ |
| §10 Tests（11 类） | Chinese / emoji / links / inline code / escaped pipe / alignment / empty cell / **multiline incompatibility** / undo / external update / source-live switch | 前 7 类见 `table-parser`；undo 见 `table-undo-diff`；external update 见 `table-live-view`（2026-09-30 补，审计 §4.16）；source-live switch 见 `table-live-view` 的 `setSourceMode` 用例；**multiline incompatibility 原先零覆盖 → 本轮补** | ⚠️ 本轮补齐 |
| §3 创建 | source / Paragraph→Table / Slash `/table` / TSV Paste / **Create Dialog（rows·columns·alignment）** | 前四项都有（`insert.table` / `slashCommands` 的 `/` 触发 + 宿主 `insert.table` / `smartPaste.ts` 的 `tsvToGfmTable`）；**Create Dialog 未实现**（见下） | ❌ |
| §7 Invalid Table | 不强制修复 / fallback source-like / **提示「表格语法不完整」** / 显式 Tidy·Fix | 前两项**结构上成立但零测试**（本轮补）；**第三项未实现且无一手依据**（见下） | ⚠️ / ❌ |

### 发现 1（未实现）：§3 的 **Create Table 对话框**

一手证据（本机 Typora 1.14.9）：
- `TypeMark/html/content.html` 有 `id="table-insert-dialog"` 的 modal，标题 `data-localize="Insert Table"`，
  字段只有两个：`#table-insert-col`（`Columns`，**默认 3**）与 `#table-insert-row`（`Rows`，**默认 4**），
  按钮 `Cancel` / `OK`。
- 文案在 `zh-Hans.lproj/Front.strings`：`Insert Table=插入表格`、`Columns=列`、`Rows=行`。

**Mellow 现状**：`insert.table`（菜单 `paragraph.table` 子项 / Slash `/table`）**直接插入固定 2×2**，
没有对话框。→ **已登记为待实施项**（见 master-plan 的 W4 表）。

> **✅ 已于当日实施（2026-10-01，任务 4.10）**：菜单与 Slash 共用的 `insert.table` 改为打开
> **应用内多字段对话框**（复用既有 `askUser` 状态机，新增 `askForm` —— **不新起第二套**，
> 因为项目已把「同一操作两套实现」记为结构性缺陷）。
> 生成逻辑提取为纯函数 `packages/app-core/src/tableTemplate.ts` 的 `buildGfmTable` /
> `parseTableCount`（**可单测**，10 例），App 层只做编排。口径全部来自上面的一手证据：
> 默认 4 行 × 3 列、`Rows` **含表头行**、空值兜底列 2 / 行 1；**上限 30 列 / 100 行是 Mellow 自定**
>（Typora 的两个 max 常量未从压缩产物中提取到 —— **如实标注，不冒充一手值**）。
> 新增护栏（`verify-shell-widgets.mjs` 的应用内对话框节）：① `insert.table` 必须走对话框、
> 不得再硬编码表格字面量；② `askForm` 必须复用 `askUser`（不得自己 `setAskDialog`）。
> **非恒绿验证**：把 `insert.table` 改回硬编码 → exit 1 报「未走创建对话框」；
> 把 `askForm` 里的 `askUser({` 换名 → exit 1 报「未复用同一状态机」；均还原后 exit 0。
>
> ⚠️ **覆盖边界（如实声明，不得读作「已验证」）**：
> 1. **运行时未验证** —— 本环境无 e2e 通道（`tests/e2e/*.mjs` 需 Playwright + 起 dev server，
>    且 **e2e 不进 CI**）。因此「对话框真的弹出、两个输入框真的可用、确定后真的插入正确表格」
>    这一层**没有实测证据**，只有：纯函数单测（生成逻辑）+ 静态护栏（接线与状态机复用）。
>    既有的 `tests/e2e/in-app-input-dialog-verify.mjs` + `tests/shared/in-app-dialog.mjs`
>    已是「应用内输入框」的共享驱动 —— 扩展它覆盖 `askForm`（两个字段）是明确的下一步。
> 2. **上限 30 列 / 100 行是 Mellow 自定**（非一手值，见上）。

### 发现 2（规格失真，已更正）：§3 的「optional alignment」

Typora 的创建对话框里**没有任何 alignment 控件**（见上：只有 Rows / Columns）。本 spec §3 把
「表格**有**对齐能力」错记成「**创建时**可设对齐」。→ 已在 spec §3 内**保留原文并追加更正块**：
创建对话框**不得**加对齐字段，否则会做出一个 Typora 没有的界面；对齐的正确位置是 §4 Toolbar / §6。

> 这条的价值在于：**若不先更正 spec 就照它实现，会做出一个「照 spec 正确、照 Typora 错误」的功能。**

### 发现 3（规格漏收 + 未实现）：**Resize Table**

Typora 自带官方文档 `TypeMark/Docs/Table Editing.md` 有 `## Resize Table` 一节：
「光标在表格内时表头上方出现 tooltip，点**最左图标**即可像多数富文本编辑器那样调整表格；
要超过 **6 列或 10 行**，点行列数字输入框直接填数」。文案 `Resize Table=调整表格`。

**本 spec 原先完全没有这一节**，Mellow 也未实现（工具栏无该入口、无网格调整 UI）。
→ 已**补入 spec §3b**（含一手引文）+ 登记为待实施项。

> **✅ 已于当日实施（2026-10-01，任务 4.11）**：
> 引擎侧新增 `resizeTable` / `planResizeTable`（`packages/editor-engine/src/table/commands.ts`）——
> **单次 dispatch**（最小 patch + 一次 undo；**delimiter 行永不删**；`rows` 口径与创建对话框一致 =
> 含表头的正文行数、不含 delimiter 行）；工具栏**最左**新增「调整」按钮（一手：Typora 的入口是
> tooltip 最左图标），弹层含 **6×10 网格**（hover 预选 + 点击立即应用）与**两个数字输入**（列 / 行 + 应用），
> 覆盖文档所述的「超过 6 列或 10 行时用数字输入」路径。网格尺寸 6×10 亦为一手
>（`md-grid-board` 的单元格为 `col="1".."col="6"`；文档写「larger than 6 columns or 10 rows」）。
> 测试 19 例（引擎 13：增/减行、增/减列、行列同时变化、上限夹取、一次 undo、no-op 不产生事务、
> 保留单元格逐字不变；工具栏 6：最左按钮、弹层与预填、hover 高亮、点网格应用、数字输入应用、关闭语义）。
> **新增跨包一致性护栏**：两个包**互不依赖**（`dependencies` 均为空）→ 上限各写一份，
> 故在 `verify-parity-ledger.mjs` 加「表格尺寸上限两端一致」+ canary
> （**非恒绿验证**：只改引擎侧 `TABLE_RESIZE_MAX_ROWS = 7` → 报「engine 7 vs app-core 100」）。
>
> ⚠️ **覆盖边界（如实声明）**：与任务 4.10 相同 —— **运行时未验证**（本环境无 e2e 通道）。
> 弹层的**视觉与真机交互**（网格高亮观感、弹层定位、触屏）没有实测证据。

### 发现 4（无一手依据）：§7 的「提示『表格语法不完整』」

在 Typora 的 `Front.strings`（zh-Hans，全量）里检索 `不完整 / 无效 / 语法` 与 `incomplete / invalid / syntax`：
命中的**只有引用链接 / 图片 / 脚注**三条（「请按语法 … 定义 …」），**没有任何表格相关提示**。

→ 该条是 **Mellow 自定要求**，不是 Typora parity；且**未实现**（全仓仅出现在 spec 里）。
按「先报告冲突、不擅自裁决」：**登记为待裁决项**（实现为 Mellow 自有提示，或从 spec 移除），
本轮**不擅自实现**。

> **✅ 2026-10-05 已裁决（ADR-0029 Q4 = D2：从 spec 移除）** —— 本轮把证据补足到**两条独立通道**：
> ① **全部 4 个 `.strings` × 2 语言**（Base + zh-Hans 的 Front/Menu/Panel/Welcome，经 `plutil` 转 JSON）：
> 与表格**不相交**的语法类词命中 20 条，**与表格相关 0 条**；
> ② **行为真值 `main.js`**：`表格+无效/不完整`、`table+invalid|incomplete|malform`、
> `(invalid|malform)+table`、`*Valid*Table` 标识符 **全部 0 命中** —— Typora 只有**显式**的
> `reformatTable`（菜单「Prettify Source Code」）。
> ⇒ **Typora 对损坏表格既不提示也不校验**（只是不按表格渲染 + 提供显式修复动作），
> 故该项**非 parity 且从未实现** ⇒ 移除。**§7 的第 1/2/4 项不变**。
> 证据与理由见 `ADR-0029` 的「Q4 裁决」节。

### 发现 5（零测试 → 本轮补）：§7 的 fallback 与 §10 的 multiline

本轮在 `table-live-view.test.ts` 新增 4 例（`表格 live-view · invalid / 多行不兼容`）：
- 缺分隔行 / 分隔行列数与表头不一致 / 分隔行被换行拆断 → **不渲染 live view、源码逐字不变、不崩**；
- **显式修好语法后 live view 恢复** —— 「不强制修复」≠「修好了也不渲染」。

**判别性（防恒真）**：同一文件里既有 `toBeNull()`（非法）也有 `not.toBeNull()`（合法，含修好后），
故「不渲染」不是恒真断言。**如实声明覆盖边界**：本组只覆盖「解析层判定为非表格 → 不渲染」这条路径，
不含 §7 第三项（未实现）。

### 发现 6（台账口径）：`P0-TABLE-001` 的 capability 与证据面不匹配

台账 `P0-TABLE-001` 的 capability 是「**表格创建**与键盘导航」，但 `evidence` 是
`table-keyboard` / `table-engine` / e2e IME / widget-buttons —— **没有一条覆盖「创建对话框」**。
它**不是虚假声明**（Mellow 确能建表：固定插入 / TSV 粘贴 / 手写 `| a | b |`），
但**名称会让读者以为创建路径已被完整覆盖**。→ 已在该项 `mellowTarget` 内**写明创建对话框未实现**
（口径与 §4.36 同类：**证据面必须与 capability 名称对齐**）。

## 4.40 `image-workflow-spec` §1–§12 逐节复核：一处**未实现**、一处**规格与实现冲突（安全）**、一处**代码注释过期**（2026-10-01）

方法同前：**先把 11 个图片测试文件的用例名全部列出逐条读**（`image-asset-config` / `image-engine-api` /
`image-input` / `image-insert` / `image-ops` / `image-path` / `image-root-url` / `image-scan` /
`image-size` / `image-widget` / `app-core/imageFileOps`，共 167 例），再逐节对到实现。

| spec 节 | 声明 | 守护它的测试 / 现状 | 结论 |
|---|---|---|---|
| §2 输入渠道（7 条） | Markdown typing / file picker / drag single / drag multiple / paste bitmap / paste copied file / paste URL | `image-input.test.ts` 14 例（bitmap / copied file / URL / drag 单张·多张 / 侧栏拖拽建链 / file picker / caret 位置） | ✅ |
| §3 Insert Strategy | Keep original / relative / copy to assets / Upload；默认 local→relative、bitmap→asset dir | `image-insert.test.ts` 26 例 + `image-ops` 的 `uploadAll` | ✅ |
| §4 Asset Directory | `./assets/` / `./images/` / `./${filename}.assets/` / custom | `image-path`（`assetDirName` 四模式）+ `image-asset-config` 13 例 + `imageFileOps`（front matter docname / global images） | ✅ |
| §5 Path Rules | 中文 / 空格 / `#` / `%` / 括号 / Windows drive / UNC / macOS·Linux 绝对 / **symlink**；ensure `./` / URL escape / root URL | `image-path` 27 例 + `image-root-url` 18 例；**symlink 未单列测试** —— 但 `atomic_save` 侧有 symlink 覆盖（`file_safety_corpus`），图片路径侧依赖 `canonicalize` 语义 | ⚠️ 见下 |
| §6 Rename / Move | 单图 rename·move + 更新引用；文档 rename：探测 `${filename}.assets` / 询问 / 原子 patch | `image-ops` 21 例 + `documentRename.test.ts` 9 例 + `imageFileOps` | ✅ |
| §7 Batch | P0 Move All / Copy All / Download Remote；P1 Upload All / unused cleanup / image manager | P0 全覆盖 + **P1 的 Upload All 也已实现**；`unused cleanup` / `image manager` 未见实现 | ⚠️ P1 两项未实现 |
| §8 Broken Image | compact placeholder / 文件名·路径 / retry / reveal source；禁止自动删除 broken reference | `image-widget.test.ts` 的「Broken Image」3 例；「引用保留」见 `imageFileOps`「缺失文件跳过（exists=false），引用保留」 | ✅ |
| §9 Remote Image | lazy load / **timeout** / no silent download / user command to localize | lazy ✓、no-silent-download ✓、localize ✓；**timeout 原先未实现 → 本轮补**（见下） | ⚠️ 本轮补齐 |
| §10 Security | 远程图无任意本地协议 / 尊重网络设置；**Upload key: OS keychain** | 前两条 ✓；**upload key 这条与实现冲突**（见下） | ❌ |
| §11 Undo | source patch 可撤销；文件系统 move/delete 单独 undo | 多处「单 Undo 还原」+ `FileOpHistory` 7 例 | ✅ |
| §12 Tests（24+ 场景） | paste / drag / multi / relative / **save as** / rename / missing / remote / Chinese path / Windows·macOS·Linux | 全部有覆盖（`save as` 为 2026-09-30 补；跨平台见 `image-path` 的 drive/UNC/POSIX 三组） | ✅ |

### 发现 1（未实现 → 本轮补）：§9 的 **timeout**

`packages/editor-engine/src/image/widget.ts` 只给 `<img>` 挂了 `error` 监听、**没有任何超时**。
**后果**：连接被静默丢弃 / 对端不响应时，浏览器**既不触发 `load` 也不触发 `error`** ——
widget 永远停在加载态：用户看到**空白**，且因为没进 broken 分支，**连 retry 入口都没有**。

**处置（已实施）**：新增 `REMOTE_IMAGE_TIMEOUT_MS`（**15s，Mellow 自定** —— spec 只写「timeout」未给数值，
**不冒充一手值**），**仅对远程 src** 生效（本地文件秒开，加超时只会在慢盘上误判）。
超时后走**同一条 broken 路径**（compact placeholder + filename/path + retry），
并 `removeAttribute('src')` **中止仍在挂起的请求**（否则它稍后成功会把已替换掉的 DOM 写回来）。
定时器在 `load` / `error` / 任何重渲染 / `destroy` 时清理（**不留悬挂回调**）。
新增 4 例测试（超时进 broken + 中止请求 / 超时前 load 不误判 / **本地图不加超时** / destroy 清理定时器）。
**非恒绿验证**：把超时分支改成 `if (false)` → 第 1 例失败；还原 → 17/17 通过。

### 发现 2（规格与实现冲突，**安全相关**）：§10 的「Upload key: OS keychain」

- Mellow 的上传通道是 **picgo-http / picgo-cli / custom-command**，`ImageUploadOptions` 只有
  `channel` / `httpUrl` / `command` —— **设计上没有密钥字段**，故「存 keychain」没有落点。
- `packages/extension-api` 明确把 `keychain` 列为**高危权限、V1 运行时一律拒绝**（注释：desktop 无实现）。
- **但存在真实隐患**：`image.uploadHttpUrl` 是 **text 字段**、存 **localStorage 明文**
  （`mellow.image.uploadHttpUrl`）→ 用户把**带凭据的 URL**（`…?token=…`）粘进去即明文落盘。
- **处置：登记为待裁决**（安全设计 + 平台能力），已在 spec §10 内写下三种走向（UI 提示禁止 / 引入 keychain / 改写为「不适用」+ 保留风险说明）。**不擅自实现。**

### 发现 3（代码注释过期）：`image/index.ts` 头部

原文写「上传：暂不实现（spec §7 Upload / §9 remote localize 属后续阶段）」——
**但 `uploadAll` / `downloadRemote` 均已实现**（`imageFileOps.ts` + `apps/desktop/src/host/uploadService.ts`
+ `src-tauri/src/upload.rs` + e2e `image-upload-verify.mjs`）。已更正。
→ **代码注释也是声明**：过期即失真，与文档同级（本轮第 N 次遇到「自述与现实不符」）。

### 发现 4（P1 未实现，登记）
§7 的 P1 两项 —— `unused image cleanup`（未引用图片清理）与 `image manager`（图片管理器）—— 未见实现。
属 P1（不阻塞），**如实登记**。

## 4.41 `auto-update-spec` 逐节复核（**正向确认**）+ `image-workflow-spec` §7 P1 两项**无一手依据**（2026-10-01）

### A. `auto-update-spec` §1–§8：**全部核实通过**

安全类 spec 的声明**逐条可静态核验**，本轮全部核过（不靠「写了就是有」）：

| spec 节 | 声明 | 核实结果 |
|---|---|---|
| §1.1 signed update | 内嵌公钥校验（`tauri.conf.json → plugins.updater.pubkey`） | ✅ `pubkey` 存在且是**合法 minisign 公钥**（base64 解码以 `untrusted comment: minisign pu…` 开头）；`bundle.createUpdaterArtifacts: true` |
| §1.2 verify package | 下载后、安装前校验签名，失败拒绝安装 | ✅ `updater_safety.rs` 有 `signed_update_fixture_verifies` + **`tampered_package_is_rejected`**（篡改必拒） |
| §1.3 不得自动上传用户数据 | 只发版本/平台/架构 + `X-Mellow-Channel` + UA | ✅ 端点是无模板变量的静态 URL（GitHub Releases `latest.json`）；头只有 channel（`updater.ts`）；**全仓检索 `telemetry / analytics / sentry / posthog` 零命中** |
| §1.4 release channel | 默认 stable，设置可切 beta | ✅ `DEFAULT_UPDATE_CHANNEL = 'stable'`，`updateChannelFromSettings()` 非 beta 一律回落 stable |
| §1.5 / §5 rollback | 备份 → 计数 → 健康确认 → 可回滚 | ✅ Rust 5 例（`marker_roundtrip_and_launch_count` / `copy_and_restore_app_dir` / `restore_missing_backup_errors` / `restore_single_file_app` / `commit_cleans_backup_and_marker`） |
| §2 流程时序 | 启动后 **4s** check；首次启动 **15s** 健康窗口后 commit | ✅ `setTimeout(runUpdateCheck, 4000)`；`setTimeout(rollbackCommit, 15000)`（且实现**多做了**两条守卫：dev serve 跳过、Windows Portable 跳过，均带注释说明理由） |
| §3 测试 | fixture 可校验 / 篡改拒绝 / 生产 key 合法 / mock 端到端 | ✅ `updater_safety.rs` 四例**逐条对应** |
| §7 验收 | `cargo test --test updater_safety` + `--lib updater` + `npm run build` | ✅ CI 的 `cargo test` 步骤覆盖（`ci.yml` job 名含 updater） |

> **结论**：本节**没有发现缺口**。记下来是为了**避免未来重复审计**（同 §4.18 / §4.34 的做法）。

### B. `image-workflow-spec` §7 的 P1 两项**无一手 Typora 依据**

- `Upload All` ✓ **是 Typora 的**（`Menu.strings` 的 `Upload All Local Images = 上传所有本地图片`；
  自带文档 `Docs/Use Images in Typora.md` 亦引用）。
- **`unused image cleanup` / `image manager` 在 Typora 里找不到对应物**：
  `Menu.strings` 的**全部 25 条**图片相关项已逐条列出，**没有任何**「删除未引用图片 / 清理」或
  「图片管理器」条目；Typora 自带 `Docs/` 全目录检索 `unused` **零命中**。
- → 这两项**不是 parity**，是 Mellow 自定增强或规格失真 → 已在 spec §7 内**保留原文 + 追加更正块**，
  并**登记为待裁决**（任务 4.16 由「未实现」改为「待裁决」）。
- **为什么不当场实现**：与 §4.39 的 `optional alignment` 同一逻辑 —— **照 spec 实现会做出一个
  「照 spec 正确、照 Typora 多余」的功能**。且这是**产品范围**决策（要不要有非 parity 的增强），
  按 AGENTS.md「先报告冲突，不擅自裁决」。

## 4.42 `runtime-qualification-plan` 复核：矩阵未与 ADR-0022 同步 + §9 缺一个输出物 + **qualification README 数字长期过期**（2026-10-01）

### 发现 1：§4 平台矩阵与 §5 必测项目**未与 ADR-0022 同步**

本节的写法是 **V0.0 期**（决定 Tauri vs Electron）口径。其后 **ADR-0022（Accepted）** 明确
取代 ADR-0019 §3 的「Windows／Linux 必须以人工真机回填」，并写明「CI 的无交互桌面限制必须如实记录……
**不再要求**以人工 Windows／Linux 机器补齐」—— **但本节与 §5 一直没改**，读起来仍像
Fedora / ibus / Windows 10·11 区分 / Sogou·Microsoft Pinyin / dead keys 等都是要求。

**处置**：在 §4 后**追加更正块 + 差集表**（逐项列出「CI 实际覆盖 vs 要求」与**没有任何证据**的项：
Fedora、ibus、Windows 10/11 区分、第三方输入法面板、dead keys、跨应用剪贴板矩阵、100k lines）。
**保留原文、不删条目** —— 差集表本身就是「如实记录未覆盖项」的载体，删掉会让缺口从视野里消失。

### 发现 2：§9 的四个输出物里 **1 个从未产出**

| 输出物 | 现状 |
|---|---|
| benchmark report | ✅（`tests/qualification/evidence/` 的 perf 证据族） |
| **platform issue list** | ❌ **不存在**（全仓无此文件） |
| pass/fail table | ✅ `tests/qualification/README.md`（但数字过期，见发现 3） |
| 「ADR-0002 final decision」 | ⚠️ **引用过期** —— 最终决策实际落在 **ADR-0019**（Accepted，取代 ADR-0002） |

### 发现 3（本轮修复）：`tests/qualification/README.md` 的数字**长期过期**

该文件是 **ADR-0019 §3 Gate 条款**指定的「三平台 Pass/Fail 表」载体，而实测：

- 写「Parity 契约护栏 **14 个**」→ 实际 **17 个**（且清单里缺 `i18n-contract` / `doc-code-refs` /
  `no-color-only-status` 三条）；
- 写「editor-engine **1135** / app-core **219**，合计 **1615**」→ 当日实跑 **1277 / 258，合计 1824**。

**为什么值得修而不只是「改个数字」**：该表是**判断覆盖度的基线**。数字偏低会让人以为
「还有很多没测」；清单缺条目会让人以为「这三条不存在」。**读数的人不会去核对**。

**处置（两件）**：
1. **刷新为当日实跑值**（12 包逐包 `node_modules/.bin/jest` 实跑：editor-engine 1277 / app-core 258 /
   export 89 / host-api 47 / commands 33 / document-model 26 / editor-core 19 / desktop-ui 17 /
   settings 17 / i18n 15 / extension-api 14 / themes 12 = **1824**），并补全护栏清单（17 条）。
2. **加护栏防复发**（`verify-release-gate.mjs` 新增一节）：断言 README 声明的护栏数量
   **等于**实际 `tests/parity/verify-*.mjs` 全集；**canary**：改掉那个数字必须被检出。
   ⚠️ **覆盖边界（如实声明）**：只锁**护栏数量**（可静态算）；**包用例数需实跑**，无法在此校验。
   该文件里已把这条边界写清，避免读者以为「数字都被守住了」。

> **本轮我自己的一个错（被 canary 当场抓到）**：这条断言首版被我写在
> `if (errors.length > 0)` 的**后面** —— 那里已经没有检查点了，`fail()` 只是往数组里塞字符串，
> **永远不会被判定**（正是护栏卫生里的「**护栏看不见我**」）。canary 注入漂移后**应当失败却 exit 0**
> 才暴露。→ 已移到检查点之前，并把这个教训写进该节注释。
> **若只做「注入验证」而不验证「能翻转」，这条空壳护栏会一路绿灯地留在 CI 里。**

## 4.43 `performance-benchmark-spec` 复核（结构全部核实）+ **实测推翻其 W-PERF-3 的「一行级修法」**（2026-10-01）

### A. 结构性声明：**全部核实通过**

| spec 节 | 声明 | 核实结果 |
|---|---|---|
| §4 夹具（7 个） | `1MB` / `5MB` / `10MB` / `100k-lines` / `large-table` / `100-mermaid` / `1000-images` + `manifest.json`（sha256/字节/行数） | ✅ 7 个夹具与 manifest **都在**；`tests/benchmark/fixtures/` **确为 gitignore**（产物不入库） |
| §6 组件 | `lib/screen-timing.swift` / `perf-common.mjs` / `run-benchmark.mjs` | ✅ 三件都在；helper 已编译为 `bin/screen-timing` |
| §10 W-PERF-1 | 「引擎侧已落地」`inputLatency.ts` + `__MELLOW_INPUT_LATENCY__` | ✅ 文件与全局出口都在 |
| §10 W-PERF-2 | 「已完成」报告 §2d hot-open 表 + 护栏三条 | ✅ `verify-parity-ledger.mjs` 确有 `switchMs` 判定量与「目标与口径必须同表」断言 |
| §10 W-PERF-3 | 「已做」`loadMs` 不得进 PRD 判定的三条护栏 | ✅ 三条断言 + canary 都在（`opens.push`/`vals.push` 不得含 `loadMs`；打印处必须带标注且**在字符串字面量里**） |
| §9 | 16ms 目标「原理性不可判定」 | ✅ 与 ADR-0026 Q3 一致 |

### B. **实测推翻 W-PERF-3 的修法**（本节重点）

spec §10 给的「最小修法（一行级）」是 `return lastChange - start`。本轮**本机实测**（权限齐备：
`screen-timing check` → `accessibility:true, screenRecording:true`；helper 与 release 构建都在）：

| 版本 | 夹具 / 应用 | `loadMs` |
|---|---|---|
| 改前 | 1MB / Typora | **[631, 631]** |
| 改前 | 1MB / Mellow | **[633, 629]** |
| **改后** | 1MB / Typora | **[0, 0]** |
| **改后** | 1MB / Mellow | **[0, 0]** |
| **改后** | **10MB / Mellow** | **[0, 0]** |

**改后每个样本的 stderr 都是 `0 changed`** —— 整个 600ms 窗口内**一次显著变化都没观察到**，
`lastChange` 停在 `start` → **恒为 0**。

**判定：该修法把「恒 ~600ms 的地板」换成「恒 0」，后者更糟**（0 读起来像「瞬时加载」，
而它同样不是在测加载）。**根因比 spec 的诊断更锐利**：`waitStable` 在**窗口已被绘制之后**
才被调用（调用序：窗口检测 → `waitStable`），此时**没有后续变化可观察**。
**真实修法 = 把观测窗口前移到打开之前**（harness 时序重排），不是改返回值。

**附加证据**：10MB 的真实代价体现在 **`latencyMs ≈ 1.4s`**（首键回显 `[1418, 1339]`），
**不是** `loadMs` —— 说明「加载代价」在当前 harness 里实际由 `latencyMs` 承载。

**处置**：**回退**（源码 + **已授权二进制**；回退后复测读数恢复 **613–629ms**，环境复原），
并把上述记录写进 spec §10。**不发布一个读数为 0 的量具。**

### B2. 随后实施的**替代做法**（保留原读数 + 让限制自证）

真正的修法（显示级捕获 / 观测窗口前移）要求把 SCStream 从「窗口级」换成「显示级」并引入
**窗口→显示坐标 + 点/像素缩放**映射 —— 高风险区；而它的产出 `loadMs` **已被护栏排除在所有
PRD 判定之外**（`open-to-editable = winMs + latencyMs`），只是诊断量。**收益小于成本 → 未采用**
（路径明确、环境已验证可用，若将来要把它升为判定量再从那里入手）。

**改为**：不动 `loadMs` 语义，新增**逐样本观察统计**并在报告与 JSON 中报出 ——
`stableFramesSeen` / `stableChangedFrames` / `stableFirstChangeMs`（**-1 = 一次都没观察到**），
报告里打印在 `loadMs` 行下方：

```
loadMs（= waitStable 的返回：等待画面静止，含 600ms 稳定判定地板；不是文档加载耗时，不参与任何 PRD 判定）=[629]
↳ 该窗口内观察到的显著变化帧数=[0]（全 0 ⇒ 窗口在 waitStable 开始前已绘制完成，loadMs 不是加载耗时）
```

**护栏**：新增两条断言（① `run-benchmark` 必须逐样本落盘变化帧数；② 报告打印 `loadMs` 处必须
伴随该诊断行，且**在字符串字面量里**）+ canary（**非恒绿验证**：抹掉两个标识符 → 报错）。
**实测**：`loadMs=[629]` 未变（没有制造假好数），诊断行与 JSON 字段均按预期出现。

> ⚠️ **不得读成「W-PERF-3 已完成」**：`loadMs` 仍是 600ms 稳定窗口，只是现在**每个样本都能自证为什么**；
> 真正的「内容就绪」信号**仍未实现**。

> **本条的元价值**：spec 把 W-PERF-3 标为「实现待做，留给能跑真机的环境」——
> 读起来像「缺环境」。实测表明**环境是齐备的**，真实情况是
> **「验证后发现修法本身不成立」**。两者对读者与排序的含义完全不同：
> 前者是「等资源」，后者是「换方案」。**「需环境」这个归类本身就是一次未验证的推断。**

## 4.44 vendored CoreEditor 的 `lezer.test.ts` 偶发假红：**在增量解析完成前读语法树**（2026-10-01，已修）

**现象**：`npm run parity` 的 vendored jest 步骤报错 ——

```
● Lezer parser › test ATXHeading
  Expected value: "ATXHeading2"
  Received array: ["Document", "Body"]
```

**复跑即通过**（`tools/check-vendored-editor.mjs` → 23 suites / 200 tests 全绿）→ **偶发假红**。

**判因（读码，机制明确，非猜测）**：`test/lezer.test.ts` 的 `parseTypes()` **同步**读
`syntaxTree(editor.state)` —— 而 CM6 的 Lezer 解析是**增量**的，`syntaxTree` 返回的是
「已解析到哪算哪」的树。`editor.setUp(doc)` 刚建好视图就断言，此时树可能**只有
`Document` / `Body`**（正是失败输出）。机器负载高时必现、空闲时通常不现。

**影响面**：这是 **CI 可见**的测试（`ci.yml` 的 editor-core job 跑同一套 vendored jest）
→ 假红会**打红整条 CI**，且这类假红的代价不是一次重跑，而是**训练人忽略红灯**
（同 §4.37 的判据）。

**修法**：`parseTypes` 改用 `ensureSyntaxTree(state, doc.length)` —— **同步强制完成解析**后
再遍历（保留 `?? syntaxTree(...)` 兜底）。用**确定性 API** 取代对时序的隐含依赖。

> ⚠️ **覆盖边界（如实声明，与 §4.37 不同）**：**无法构造确定性 canary** ——
> 该危害是**时序依赖**的（负载高才现），不能靠一次注入稳定复现。
> 因此本条的**证据是实测失败输出本身**（不是模拟），修法的价值在于
> **用确定性 API 消除了对时序的依赖**，故**无论是否复发都严格更安全**。
> **不得**把它写成「已 canary 验证」。

**vendored 文件处置**：该文件属 `CoreEditor/`（re-vendor 会被 `cp -R` 覆盖）→
已**同步更新 `packages/editor-core/UPSTREAM.md` 的改动清单**（修改文件 **18 → 19**）。

## 4.45 **交付产物里的引擎不是这一版源码**：`editor-engine/dist` 陈旧 6 天（2026-10-01，W-PERF-1 端到端失败的真因）

**现象**：W-PERF-1（应用内按键回显延迟读数）接线全部完成后，端到端验证失败 ——

```
typing: p95=110.46ms median=92.33ms timeouts=3
inputLatency（应用内）: 不可用 —— 埋点未产出样本（不代表「快」，也不代表「慢」）
=== 内容 === {}          # dump 文件只有哨兵
```

**排除过程（逐条实测，不靠猜）**：

| 假设 | 判据 | 结论 |
|---|---|---|
| 前端接线没进产物 | `apps/desktop/dist/assets/index-*.js` 含 `getInputLatencyReport` / `input_latency_dump_path` / `__MELLOW_INPUT_LATENCY__` | ✅ 在 |
| Rust 命令没编进去 | 二进制含 `MELLOW_INPUT_LATENCY_DUMP` | ✅ 在 |
| 命令名不对 | `lib.rs` 里是 `fs::write_text`，注册名 `write_text`，与 App 侧一致 | ✅ 对 |
| 环境变量没传 | `perf-common.launch()` 用 `spawn(bin, args, { env })` | ✅ 能传 |
| `isTauri()` 为假 | release 二进制下 `__TAURI_INTERNALS__` 存在 | ✅ 为真 |
| **iframe 里的引擎没装埋点** | `apps/desktop/public/editor/engine-v1.5.15/` 里**没有 `inputLatency.js`**，全文搜不到 `inputLatencyReport` | ❌ **真因** |

**根因（时间线，硬证据）**：

| 项 | mtime |
|---|---|
| `packages/editor-engine/dist/index.js` | **2026-09-25 00:22** |
| `packages/editor-engine/src/inputLatency.ts` | 2026-09-30 13:55 |
| `packages/editor-engine/src/index.ts`（接入埋点） | 2026-10-01 00:36 |

`build-editor-bundle.mjs` 的引擎来源是 `packages/editor-engine/dist/`（第 25 行），
而它是 **gitignore 的 tsc 产物** —— 只有 `pnpm --filter @mellow/editor-engine run build`
会生成。`apps/desktop` 的 `build` script 是
`build-editor-bundle.mjs && tsc --noEmit && vite build`，**不构建引擎 dist**。
于是「本地只跑 desktop build + `tauri build`」把**旧引擎**打进了 iframe bundle。

**为什么此前没有任何信号**：
- `ci.yml`（`editor-engine` job + desktop 构建前）与 `release.yml` **都先跑各包构建** →
  **只有本地临时构建路径会漏**；
- `build-local.sh` 步骤 1/6 本会按 mtime 重建（`find src -newer dist`，本例必然命中）
  → 说明那次构建**没走这个脚本**；
- `verify-release-bundle.mjs` 只检查 **4 个固定文件名**（`wysiwygBlocks.js` 等）存在
  —— 能证明「产物非空」，**证明不了「产物是这一版源码」**。

**影响面（远大于 W-PERF-1）**：**09-30 之后全部引擎改动都没进任何交付产物** ——
`inputLatency.ts`（W-PERF-1 埋点）、`inlineCodeAttrs.ts`（spec §11 行内代码属性）、
智能标点代码上下文守卫、表格 `resizeTable` / 工具栏。此前各条「已实施」的结论
**在源码层面成立、在交付层面不成立**。

**顺带发现（同一目录卫生问题）**：`tsc` **不清 `outDir`**，被删除的源文件会留下孤儿产物 ——
`dist/markers.js`（源 `markers.ts` 08-24 删除）、`dist/scrollBridge.js`（08-11 删除）
连同 `.d.ts` 共 4 个文件，**自 8 月起随包发布**（未被引用故不加载，但确实是死代码进包）。

**处置（全部实测验证）**：

1. **修产物**：`packages/editor-engine` 重新 `tsc -p tsconfig.json` → `dist/index.js`
   含 `inputLatency`；重跑 `build-editor-bundle.mjs` → `engine-v1.5.15/` 出现
   `inputLatency.js` / `inlineCodeAttrs.js`；`verify-release-bundle.mjs` 通过。
2. **加确定性闸门**（`build-editor-bundle.mjs`，三条构建路径的公共入口）：
   `assertPkgDistFresh(name, pkgDir)` —— 判据 `src/**/*.ts`（去 `.d.ts`）集合
   **必须 ==** `dist/**/*.js` 集合。
   - **缺失 → 硬失败**（报出缺哪些模块 + 修法命令）；**不依赖 mtime**（checkout 顺序下不可靠）；
   - **孤儿 → 不复制进产物**（死代码不进包）+ 警告；
   - 覆盖 `@mellow/editor-engine` 与 `@mellow/editor-core`（后者是 2026-09-15
     「改了 config 字段却静默用旧 dist」的同型事故）。
   - **翻转验证**：移开 `dist/inputLatency.js` → `exit=1` 且报出该模块名；移开
     `editor-core/dist/contract.js` → `exit=1` 且报出 `@mellow/editor-core`；还原后 `exit=0`。
3. **产物级复核**（`verify-release-bundle.mjs`）：交付包的引擎模块集合
   **必须 == 源码模块集合**（`notShipped` / `deadCode` 双向）。
   **翻转验证**：移开 `engine-v1.5.15/inputLatency.js` → FAIL；放一个无源文件的
   `zzz-orphan.js` → FAIL；还原 → OK。
4. **CI 可见护栏**（`tests/parity/verify-build-pipeline.mjs` §⑦）：锁住闸门存在、
   两个包都被覆盖、「缺失必须硬失败」、产物级比对存在；各配 canary。
   **护栏级真 canary**：把闸门函数改名 → 护栏 `exit=1`；还原 → `exit=0`。
5. **修 `build-local.sh` 两处**（都是「脚本本身在拦自己」）：
   - 步骤 4/6 的旧 `dist` 落点原为 `${TMPDIR}` —— 仓库在 `/Volumes/My-Data`（disk8s1），
     `${TMPDIR}` 在 `/System/Volumes/Data`（disk3s5），**跨卷 `mv` 退化为复制+递归删除**，
     删除那步照样撞 safe-delete 守卫 → 改落 `node_modules/.cache`（同卷，真 rename）；
   - 步骤 0/6 缺同型处置：`CoreEditor/dist` 的 `emptyDir` 撞守卫
     （`count=2011 threshold=50`，**看上去像构建失败**）→ 补「先移开再 build」。
   护栏新增 §⑥b 锁「落点必须同卷」——**只看代码行**（注释里也会提到 `${TMPDIR}`，
   扫全文会误报；「护栏匹配到散文」是静态护栏的经典失效模式）。

> ⚠️ **教训（与 §4.43 同族）**：§4.43 是「『需环境』这个归类本身就是一次未验证的推断」，
> 本条是「**『已实现』的判据必须是『在交付产物里』，不是『源码里有』**」。
> 两条都指向同一件事：**结论的载体选错了，结论就会错得很干净**。
> 本次能定位，靠的是**逐条排除 + 对产物本身取证**（而不是继续读源码）。

## 4.46 `UPSTREAM.md` 的 CoreEditor 改动清单：**内容准确（正向确认），但零护栏** → 已做离线机器校验（2026-10-01）

**背景**：§4.36 修掉了 `UPSTREAM.md` 与现状的矛盾，并**人工**（对钉住 commit 的上游 tarball 逐文件 diff）
重建了逐文件清单（修改 19 / 新增 3）。但该清单此后**没有任何机器护栏** —— 而它是 re-vendor
（`cp -R` 覆盖 `CoreEditor/`）之后**唯一能重放 Mellow 改动**的依据，且 §4.36 已明确记下：
**静默丢掉这些改动不会让任何测试变红**。这与 §4.45 是同一母题：**关键约束只写在散文里 = 没有守护**。

**正向确认（本轮实做）**：按钉住 commit `81da2a2…` 下载官方 tarball，对 199 个上游文件逐个算
`sha256` 并与仓库比对 ——

| 集合 | 推导结果 | `UPSTREAM.md` 表格 | 一致？ |
|---|---|---|---|
| 修改的文件 | **19** | 19 行 | ✅ |
| 新增的文件 | **3**（全在 `test/`） | 3 行 | ✅ |
| 上游有而仓库无 | **0** | ——（未声明） | ✅ |
| 未改动（哈希一致） | **180** | —— | ✅（19+180=199 自洽） |

即 §4.36 重建的清单**是准确的**（这一点此前只是「人工做过一次」，从未被验证过）。

**处置（本轮新增）**：

1. **哈希清单入库**：`packages/editor-core/upstream-manifest.json`（199 个文件的 `sha256` 前 16 位，
   含 `repository` / `commit` / `algorithm` / `fileCount`）。
2. **生成器**：`tools/gen-upstream-manifest.mjs` —— 真值源是 **`UPSTREAM.md` 的 `Commit:` 行**
   （不在脚本里再写一遍 commit，避免两处漂移）；支持 `--tarball` 离线生成。
3. **离线护栏**：`tests/parity/verify-upstream-manifest.mjs`（已接入根 `test` 与 `parity` 两条链，
   护栏总数 **17 → 18**）。判据双向且确定性：
   - 哈希一致 ⇒ **不得**出现在「修改的文件」表；哈希不同 ⇒ **必须**出现；清单里没有 ⇒ **必须**出现在「新增的文件」表；
   - 两表的**声明条数**（标题里的数字）== **实际行数** == **推导结果**，三者一致；
   - 清单的 `commit` == 本文 `Commit:` 行（防「清单与文档描述不同上游快照」）。
4. **canary 直接测逻辑（不是测字符串替换）**：护栏把比对写成纯函数（`derive` / `diffDoc`），
   canary 用合成输入跑**同一套函数**，覆盖 5 种不一致（漏登记已改动 / 幽灵条目 / 未登记新增 / 丢失上游文件 /
   一致的文档被误报）。文件级真 canary 另做三向：改**未登记**的 vendored 文件 → 报错；
   往 `CoreEditor/` 加新文件 → 报错；篡改清单 `commit` → 报错；还原后 → 通过（且 `git status` 确认
   vendored 文件**字节级还原**，无残留）。

> ⚠️ **边界**：该护栏只保证「清单与哈希事实一致」，**不保证清单里的「改动要点」文字描述正确**
> —— 那是散文，仍需人工维护。也**不替代** `diff -rq` 的逐文件细节（生成器只刷新哈希）。
> 生成器**不会替你更新表格**：哈希变了就必须手工核对更新，否则护栏报「事实是但文档里没有」——
> **这正是设计意图**。

## 4.47 `P0-EDITOR-005` 的「运行时验证缺口」：应用侧端到端已覆盖（2026-10-01，缺口**收窄**而非收口）

**背景**：该条目 `status: IMPL`、`blockedBy: runtime-verification-pending`，其自述里写明剩余缺口是
「**建议的端到端运行时行为**（右键真的弹出建议、点击真的替换）没有自动化测试覆盖 ——
它依赖 macOS NSSpellChecker 与真实右键交互」。此前只有**静态护栏**（契约模型允许携带 payload）
与**引擎/Rust 单测** —— 而本项目反复出现的母题是「**结构在、功能死**」（§5.7 浮动工具栏、
表格对齐连字符侵蚀），静态契约全绿并不能排除功能是死的。

**为什么现在可做**：`apps/desktop/src/host/spellcheck.ts` 在**非 Tauri（浏览器 dev）**下把服务
委托给 `browserMockHost.spellcheck`，而该 mock 是**确定性**的（`packages/host-api/src/mock-host.ts`：
词典初始为空；非词典词 → `[w+'s', w+'ed', w+'ing']`；`available()` 恒 `true`）。
→ 存在一条**无需真机、结果确定**的接缝，可以驱动完整交互链。

**新增** `tests/e2e/spellcheck-suggestions-verify.mjs`（浏览器 dev + Playwright；按仓库既有 e2e 约定
**不进 CI**）。三个相位，各自独立可判定：

| 相位 | 断言 | 实测 |
|---|---|---|
| A | 右键文本 → 菜单**顶部**出现 3 条确定性建议；且「添加到字典」在场（同一 `spellcheckAvailableSync()` 门控） | ✅ `top3=[hellos, helloed, helloing]` |
| B | 点击建议 → 文档**真的**被替换（`hellos`）、菜单关闭 | ✅ `got="hellos"` |
| C | **反向**：点「添加到字典」后同一词的**建议区消失**，且菜单本身仍可弹出 | ✅ 建议区消失、菜单仍开 |

**7/7 通过，且做过变异验证（首跑绿不算数）**：

| 变异 | 期望失败点 | 实测 |
|---|---|---|
| 把 `sugg` 置空（建议不入菜单） | 「建议出现在菜单顶部」 | ✅ 该断言失败 |
| 把 mock 的 `learn` 变空开关 | 「建议区消失」 | ✅ 该断言失败 |

失败点与变异**一一对应**，说明每个相位都真的在被驱动。

> ⚠️ **canary 自身踩到的坑（已修，值得记）**：变异脚本首版在两次变异之间**没有还原**，
> 于是第二个变异运行时仍带着第一个变异的残留 —— 它的「失败」与它自己的变异无关
> （实测 M2 因 M1 残留而失败于**错误的断言**）。这是「canary 必须同一脚本内还原」的**逐用例**版本：
> **还原要在每个用例之后，不只是整个脚本结束时**。

**边界（如实声明，故 `blockedBy` 不变）**：dev 模式的词典是**内存 mock**，因此本 e2e
**不能**证明「macOS `NSSpellChecker` 返回真实建议」。故：
- `status` 保持 `IMPL`、`blockedBy` 保持 `runtime-verification-pending` —— **不擅自收口**；
- 但该 blocker 的含义已**收窄**为「**真实词典**的建议内容 + 真机三平台证据」，
  而非「端到端行为无覆盖」；
- 台账 `evidence` 已加入本脚本，`mellowTarget` 追加本轮的收窄说明。

**顺带修正的一处操作失误**：我先把收窄说明写进了 `notes` 字段 —— 而该条目**没有** `notes` 键
（长文本字段是 `mellowTarget`），于是 `undefined + '…'` 生成了一个以 `"undefined"` 开头的**假字段**。
靠 `git diff` 复核发现并回退重做。**教训**：改 JSON 前先确认字段名**存在**（`'x' in obj`），
不要把「我以为的字段」当成契约。

## 4.48 `P0-PERF-001` 的「真实待办」清单**过期，方向是高估剩余工作**（2026-10-01，已更正）

**做法**：按「**过期是双向的**」纪律核查该条目里的两处「真实待办」列表 ——
不只查「把没做的说成做了」（那是审计的常规方向），也查「**把做了的说成没做**」。
后者证据强度更低（找到实现即可），但危害是系统性的：它会让「剩余工作」被**高估**，
进而影响「是否值得继续投入」的判断（skill 里记为反复出现的形态）。

**逐项对代码核实（不是对文档）**：

| 清单里的待办 | 实测 | 证据 |
|---|---|---|
| 补 hot-open 口径 | **已完成** | `run-benchmark.mjs` 的 `ALL_METRICS` 含 `hotopen`、报告 §2d、`hot-open-probe` 调用；ADR-0026 Q1/Q2=A1 已把 `hotopen.switchMs` 定为 PRD §110 的**判定量** |
| 隔离探针 0/5 的根因 | **已解释（设计内边界）** | ADR-0025 Q1/Q2：Typora 对 >2,000,000 字符**不渲染** → 该尺寸**不存在 Typora 基线**；跨应用比值一律经 `ratioOrNA()`；台账 `typoraBehavior` 已按该 ADR 改为限定式表述 |
| 改 `waitStable` 为「内容就绪」信号 | **仍待办** | 但性质是**诊断量而非判定量**：ADR-0026 已把判定改走 `hotopen.switchMs`（触发点在捕获开始之后 → 观测窗口天然覆盖加载）；冷启动 `open` 一节已声明不参与任何 PRD 判定 |

**结论**：3 条里 **2 条其实已完成**，`perf-harness-pending` 的实际剩余范围收窄为**第 3 条一项（诊断量）**。

**处置**：只更新 `mellowTarget` 的表述（逐条写明证据与「为什么仍待办」）；
`blockedBy` 与 `status` **均不变**（本项仍被 `ux-gate-policy` 阻塞，且**不擅自收口**）。

> ⚠️ **一处操作失误（已修，值得记）**：首次用 `node -e "…"` 写入这段文本时，
> **shell 把双引号内的反引号当成了命令替换**（输出 `command not found: run-benchmark.mjs`），
> 于是写进台账的文本里那些反引号片段被**静默替换成空串** —— 文件语法合法、护栏全绿，
> 只有**内容**坏了。改用脚本文件承载 JS（彻底避开 shell 引号），并在脚本里加了一条
> 「反引号片段完整性」自检。
> **通则**：**写含反引号/`$`/`!` 的文本时，不要用 `node -e "…"` 或 `echo "…"`** ——
> 这些字符在双引号内会被 shell 展开。用文件承载，或改用单引号 heredoc（`<<'EOF'`）。

## 4.49 `P0-EDITOR-005` 的真实词典侧：一条**恒真空壳测试** + 一个**没有 CI 守卫的平台分支**（2026-10-01，已修）

### 发现 1：那条「returns guesses」测试**什么都没断言**（恒真空壳）

```rust
#[test]
fn suggest_returns_guesses_for_misspelling() {
    // 系统词典存在性依赖运行环境；只断言「不 panic 且返回 Vec」
    let _ = suggest("recieve");     // ← 断言本体不检查任何东西
}
```

**症状**：测试名声称「对拼写错误返回建议」，而函数体只把返回值丢掉 —— 该测试**永远通过**。
**后果**：台账里「Rust 侧有测试」这句话为真，但**「真实 NSSpellChecker 是否真的给建议」从未被任何机器验证过**
—— 正是 `runtime-verification-pending` 缺口的一半（另一半是应用侧 e2e，见 §4.47）。

**修法**（先探针取真实值，再写期望 —— 不凭假设）：

| 探针（macOS 27.0 / arm64） | 实测 |
|---|---|
| `suggest("recieve")` | `["receive", "relieve"]` |
| `suggest("teh")` | `["the", "ten", "yeh", …]` |
| `suggest("mellowzzrecieve")` | `[]`（无法猜测时返回空） |
| `has_learned("recieve")` | `false`（未被用户词典污染） |

断言分四层：① **先自证「读到了东西」**（`assert!(!guesses.is_empty())`，否则系统词典缺失时恒绿）；
② 建议里必须含正确拼写 `receive`（用户可见不变量）；③ 不得原样回吐输入（否则「建议」是点了没反应的项）；
④ 规范化契约（trim + 小写 → 结果不变，可确定性断言）。
**只锁跨 macOS 版本稳定的部分** —— 不锁条数与顺序（那是系统词典实现细节，锁死会变成「形状锁」）。

### 发现 2：macOS-only 单测**在 CI 中根本不执行**

- `ci.yml` 的 `rust-check` 跑在 **ubuntu** → `#[cfg(target_os = "macos")]` 的测试被 cfg 掉；
- `runtime-qualification.yml` 只跑**定向**的 `cargo test --test file_safety_corpus <用例>`。

**即**：`spellcheck.rs` 的 6 条 macOS 单测（含上面那条空壳）**只在本地才会跑**。
这正是本仓反复记录的母题：**不变量只存在于「本地才会跑」的测试里 = 没守护**
（同「e2e 不进 CI」；也解释了为什么空壳能存活很久而无人发现）。

**处置**：新增 **`rust-check-macos` job**（`runs-on: macos-latest` + `cargo test`）。
仓库为 **public → macOS runner 免费**，代价仅为排队时间。护栏 `verify-build-pipeline.mjs` §⑧
锁住该 job 存在且必须跑 `cargo test`（含 canary），防止日后被静默删除。

### 发现 3：平台分支**两端各自只有一半平台能验**

`spellcheck_available()` 的返回值决定宿主**是否显示拼写区** —— 「显示一个点了没反应的项
比不显示更糟」是本项目的硬约束，故「非 macOS → `false`」是**用户可见行为**的依据。
而它原先直接写成 `cfg!(target_os = "macos")`：

| 平台 | 能验 true 那一侧？ | 能验 false 那一侧？ |
|---|---|---|
| 本地 macOS | ✅ | ❌ |
| ubuntu CI | ❌ | ✅ |

**故这条分支的两侧**都从未在同一个地方被断言过。**修法**：抽成纯函数
`spellcheck_supported_on(is_macos: bool)`，两端都能在任意平台断言；并加一条
**端到端一致性断言**（`spellcheck_available()` 必须等于 `cfg!(target_os = "macos")`）——
否则纯函数与真实命令可以各自漂移而纯函数测试仍全绿。

### 发现 4（方法论）：canary 的还原方式**会让构建系统跑错二进制**

做「空壳 → 真断言」的变异验证时，还原后测试**仍然失败**，一度像是「断言写错了」。
逐步隔离（单独跑 / 单线程跑 / 再探针）后发现是**我自己的工具伪影**：

| 步骤 | 结果 |
|---|---|
| 变异（mtime 前进 → 会重建） | FAILED（预期） |
| **`cp -p` 还原（mtime 倒退到备份时刻）→ cargo 跳过重建** | **仍 FAILED** ← 源文件已正确、跑的是变异后的二进制 |
| `touch` 强制重建 | PASSED |

**根因**：`cp -p` 保留 mtime，还原时 mtime **倒退** → 构建系统认为「源比产物旧，无需重建」。
**后果**：**你读的是还原后的源码，跑的是变异后的二进制** —— 对「变异后应失败」的 canary 会
给出**看起来正确的失败**（掩盖问题）；对「还原后应通过」的检查则会**假红**。
**规则**：对**编译型**目标做变异验证时，还原**不要用 `cp -p`**（用 `cp` 让 mtime 前进，
或显式 `touch` / 强制重建）。对解释型目标（Node 脚本运行时读文件）无此问题。

### 发现 5：把这一形态**推广成一次全仓扫描**（1591 个用例 → 5 个候选 → 2 个真问题）

既然「测试名声称 X、断言本体不检查任何东西」能存活很久，就值得扫一遍全仓：

| 步骤 | 结果 |
|---|---|
| 扫描面 | 212 个测试相关文件，识别 **1591 个用例**（JS/TS 的 `it/test` + Rust 的 `#[test]`） |
| 无断言候选 | **5 个** |

**逐条读断言本体后定性**（关键词只用于**定位候选**，不用于下结论）：

| 候选 | 定性 | 依据 |
|---|---|---|
| `fs.rs::roundtrip_all_encodings` | **误报** | 委托给 `roundtrip()` helper，helper 内有 `assert_eq!(saved, original)` |
| `pandoc.rs::pandoc_availability_detection` | **真问题** | 函数体只有 `let _ = pandoc_available();`；注释声称「存在性由真实 CI 验证」**不成立**（见下） |
| `jumplist.rs::add_recent_smoke` | **可接受** | 命名即 `_smoke`，注释显式写明「真实聚合与任务栏展示由 CI Windows runner / 真机验证（P7 真机项）」——边界是**声明过**的 |
| `image-widget.test.ts::reveal：…` | **真问题（更糟）** | 见下 |
| `print-style.test.ts::canary：…` | **误报** | 我扫描器的**花括号计数被正则字面量干扰**（`\{` / `[^}]*` / `\}` 净计一个 `}`）→ 提前截断，`expect` 其实在 |

**`pandoc.rs` 的那条**：注释写「存在性由真实 CI 验证」，但核实后 ——
`runtime-qualification.yml` 的 Linux runner 确实 `apt install pandoc`，**然而那个 job 只跑定向的
`file_safety_corpus` 用例、不跑 lib 单测**；`ci.yml` 的 rust-check（ubuntu）**根本不装 pandoc**。
故「装了 pandoc 必须返回可用」**没有任何机器在守**（后果形态：`pandoc_available()` 被改成常量
→ 导出功能**假死**，全部测试仍绿）。已改为「与独立探针一致」的断言（环境无关），
并在注释里**如实声明残留边界**（仍未断言「装了 pandoc 的环境必须为 true」）。

**`image-widget.test.ts` 的那条更糟**：测试名声称「调宿主 `revealFile`」，而函数体只有
`revealBtn?.click(); await sleep(); // 断言不崩` —— **零断言**；
且 `?.` 会把「定位按钮根本没渲染」**静默吞掉**。实测 DEBUG 显示该用例连 widget 都没渲染
（`wrappers = 0`，DOM 里是裸源码 `![alt](missing.png)`）—— 因为**光标停在该行时按 Typora 语义显示源码**，
而原用例漏了 `moveCaret(view, doc.length)`。即：**它连「按钮存在」这个前提都没建立**。
修法：补 `moveCaret` + ① 自证按钮存在 ② 断言宿主真的收到 `revealFile('missing.png')`；
并把 mock 里**只写不读**的 `revealed` 数组改为 `onReveal` 回调（**录制了却没人读 = 断言无从写起**）。

> ⚠️ **这个陷阱是「已记录但未被应用」的**：`tests/e2e/README.md` 第 6 条**已经写明**
> 「断言 widget / 装饰存在前，先确认光标是否抑制其渲染……光标压在图片上时
> `.mellow-md-image-*` 根本不存在」。即**知识在仓库里，但只写在 e2e 的 README 里**，
> 而这条是**单测**（`packages/editor-engine/test/`）—— 踩坑者不会去读 e2e 的 README。
> **教训**：把跨目录通用的陷阱只写在某一个子目录的 README 里，等于**只对该目录生效**；
> 这类陷阱应当写进**模块自身**的注释（本例：`widget.ts` 的 `buildBrokenPlaceholder` 处）
> 或项目级 `PITFALLS`，而不是散落在测试目录的说明里。

### 发现 6：类别级护栏 + **canary 自己写窄了**

按「修一处必须加**类别级**护栏」的纪律，新增「整个 Rust crate 不得出现『函数体只有
`let _ = f(...);`』的恒真空壳」的检查（含扫描面下限 = 当前基线 74，防解析失效）。

**canary 首版失败，但问题在 canary 而非护栏**：我的变异只替换了 `assert_eq!(...)` 块，
**却留下 `let probe = …` 那一行** → 函数体不是「纯空壳」→ 护栏**正确地**没报错，
而 canary 却判「护栏失效」。修法：替换**整个函数体**，并加一条自检
——「变异后函数体必须真的是目标形态，否则 canary 无效」。

> **通则**：**canary 没翻转时，先怀疑 canary 本身**。变异必须真的产生目标形态；
> 加一句自检（`变异后形态 == 预期形态`）比事后排查便宜得多。

## 4.50 e2e 腐烂检测：28 个脚本跑一遍 → **3 处真陈旧**，并把它们的契约值**绑进 CI**（2026-10-01）

**为什么做**：`tests/e2e/` 有 28 个脚本且**不进 CI**（其 README 明说「是人工/本地复核通道，不是门禁」）。
README 自己也记着「正因如此，凡是必须永远成立的不变量，不要只写在这里」—— 并列出**两次真实腐烂先例**。
本轮把这条从「提醒」变成「**实测**」：逐个跑一遍。

### 结果与逐条定性（关键词只用于定位，定性必须读断言本体）

| 结果 | 脚本 | 定性 |
|---|---|---|
| ❌ | `block-shortcuts-verify.mjs` | **真陈旧**：仍按 `⌥⌘F` 找替换面板 |
| ❌ | `context-menu-verify.mjs` | **真陈旧**：仍找「格式」子菜单 |
| ❌ | `feature-liveness-verify.mjs` | **真陈旧**：仍断言 `insert.table` 直接插入 |
| ❌ | `zoom-verify.mjs` | **假失败**（环境）：单独复跑即通过 |
| ✅ | 其余 24 个 | 通过 |

### 三处真陈旧的根因（都是「行为/契约有意改变，消费者没跟上」）

1. **`⌥⌘F` → `⌥⌘H`**：`⌥⌘F` 与 `window.fullscreen` 撞车（W1.9 按官方表把全屏改为 `⌘⌥F` 时，
   未发现该键已被 replace 占用）。取舍写在 `menuSchema.ts`：**全屏保留官方键（有据），
   replace 改用 `Cmd+Alt+H`**（取官方 `Cmd+H` 的同一字母 + Alt，规避 macOS「隐藏应用」）。
   → e2e 长期按已失效的键位断言，**一直失败却无人发现**。
2. **「格式」→「块样式 / 内联样式 / 列表样式」**：文本右键的三个样式子菜单被拆分
   （`contextmenu.textBlockStyles` / `textInlineStyles` / `textListStyles`），加粗现在在**内联样式**下。
   契约侧由 `verify-context-menu-parity` 锁定（它比对 Typora 官方条目序列）→ e2e 只是**没跟上**。
3. **`insert.table` → 弹创建对话框**：实施 `table-editing-spec` §3 的 Create Dialog 后，
   该命令从「直接插入」变为「弹对话框 → 确认后插入」。e2e 断言的是前者。

**处置**：
- ① 改为 `⌥⌘H` 并在注释里写明**键位变更的取舍依据与出处**；
- ② 改为查找「内联样式」子菜单，并在其下点「加粗」；
- ③ **不只是改断言**：新增「表格创建对话框」专项块 —— 断言对话框弹出（2 个输入）、
  默认值 = **3 列 / 4 行**（与 `tableTemplate` 的一手证据一致）、确认后真的插入 **5 行** GFM 表格
  （1 表头 + 1 分隔 + 3 正文，Rows **含表头行**）、以及 **Esc 取消不留残字**。
  即把「命令行为变了」这件事**从陈旧断言变成新覆盖**（该对话框此前无 e2e 覆盖）。

### 结构性修法：把 e2e 的**硬编码契约值**与真值源绑进 CI

e2e 不进 CI 这件事改不了（它需要浏览器），但**它硬编码的期望可以借真值源在 CI 里被交叉核对**。
新增 `verify-parity-ledger.mjs` 一节（含 canary）：

| 检查 | 真值源 |
|---|---|
| `block-shortcuts-verify.mjs` 按下的键 == `menuSchema` 的 `search.replace` mac 键（`Cmd`→`Meta`） | `packages/commands/src/menuSchema.ts` |
| `context-menu-verify.mjs` **按查找形态**匹配的标签 == `contextmenu.textInlineStyles` 的 i18n 值；且加粗确实在该子菜单里 | `packages/i18n/src/messages.ts` + `App.tsx` |
| `insert.table` 必须走 `insertTableWithDialog`（行为契约）；e2e 必须覆盖该对话框且用应用内选择器 | `App.tsx` |

### canary 连抓我两次「判据被散文/无关代码满足」

- **第一次**：①的判据写成 `.includes(label)` —— 而脚本的**失败消息字符串**里也有该标签
  （`check('菜单含「内联样式」子菜单入口', …)`）→ 把查找改回陈旧的「格式」后**护栏仍通过**（skill §8 的形态）。
- **第二次**：改成「行里含 `findIndex|.includes(|===`」后，`check(…, clicked && text === '**hello**', …)`
  这一行也命中 —— `===` 出现在**断言参数**里，与查找无关。
- **定稿**：按**精确查找形态**判定（`.includes('…')` / `=== '…'`），并在失败消息里说明
  「若改了查找写法请同步本护栏」。三处 canary 现全部双向翻转。

> **教训**：**「文件里出现过 X」是最弱的判据**。判据要落在**语法位置**上
> （哪个调用、哪个参数位），否则会被注释、消息字符串、甚至无关的 `===` 满足。

### 环境坑（顺带确认 README 第 1 条）

批量跑时 `zoom-verify.mjs` 出现**假失败**：`pkill` 后端口尚未释放，下一个脚本连上了**上一个的 vite**。
→ 运行器改为「pkill 后**等 3 秒**」；单独复跑该脚本即通过。**这不是产品问题，也不是测试问题。**

### 顺带抓到：**e2e 会覆盖归档证据文件**（差点被误提交）

跑完全量套件后，工作区出现一处**我没打算改**的改动：`tests/benchmark/screenshots/b3-2-paper.png`。

- **根因**：`theme-verify.mjs` 把 3 张截图写进 `tests/benchmark/screenshots/` ——
  那是**归档证据目录**（同目录的 `tests/visual/capture-window-chrome.mjs` 是**带 manifest 的正式归档工具**，
  且 `p2-8-window-chrome-macos.png` 被台账 `P0-LAYOUT-002` 引用为证据）。
  而 `theme-verify` 写的那 3 张 `b3-2-*.png` **全仓没有任何地方读**（无 manifest、无引用）。
- **危害**：**每跑一次 e2e 就覆盖被 git 跟踪的证据文件** → 产生一个**二进制 diff**，
  极易被 `git add -A` 误提交（**本轮本人已踩，靠 `git status` 复核才发现**）。
  即：**一次「本地复核」动作静默改写了归档证据** —— 与「证据必须是有意产生的」直接冲突。
- **处置**：`theme-verify.mjs` 的落点改为**被忽略**的 `tests/e2e/.artifacts/`（仍可人工查看，
  但不再改写证据）；`.gitignore` 加该目录；**新增护栏**：`tests/e2e/*.mjs` 不得出现
  「向 `tests/benchmark/screenshots/` 写截图」的调用（含双向 canary）。
  验证：跑一次 `theme-verify.mjs` → 8 ✅，且 `git status tests/benchmark/screenshots/` **为空**。
- **未处置（仅记录）**：那 3 张 `b3-2-*.png` 现在**永远不会被再生**（成为无读者的冻结证据）。
  删除属破坏性操作且未被要求，故只报告不动手。

## 4.51 视觉 Golden 三重缺陷：**回归已随 v1.5.16 发布，而门禁报绿**（2026-10-01）

顺着 §4.50「不进 CI 的测试会腐烂」这条线，对另一批同样不在主 CI 里的脚本（`tests/visual/` 的三个
Golden）做同样的实跑。抓到**三个叠加的缺陷**，其中两个是**门禁自身的缺陷**。

### 发现 1：`scenes-golden` 失败 —— 表格工具栏宽度漂移（我自己的改动，基线未更新）

```
Scenes golden: 2 项偏离基准（像素 ±1px；计数/常量精确）
  ✗ table-toolbar.bar.w: 436 → 478
  ✗ table-toolbar.buttonCount: 11 → 12（计数/常量必须精确）
```

归因（git 历史）：基线最后更新 **2026-09-13**，而 `toolbar.ts` 最后改动是
**2026-10-01 `eb3acd7`「实施 Resize Table」**——即**新增「调整」按钮**。
加一个按钮 → 计数 11→12、宽度 +42px，两者都是**预期内的**，但**基线从未更新**。
（`buttonCount` 只在修掉发现 3 之后才被报出来，见下。）

### 发现 2（**最严重**）：视觉步骤是 `continue-on-error: true` —— 失败被降级成 job 成功

`runtime-qualification.yml` 的两个视觉步骤原带 `continue-on-error: true`
（理由写的是「本步骤用于**采集**基线……**基线入库后**如需作为门禁，再改为严格比对」）。
而三平台基线**都已入库**（`tests/visual/golden/*-golden.{json,linux.json,windows.json}` 在库）→
**该理由按它自己的条件已失效**。

**实测代价（取 v1.5.16 那次运行的日志原文）**：

```
Linux:  Xvfb + fcitx5 IME matrix   VISUAL_GOLDEN scenes-golden: FAILED (exit 1)
Windows: launch + SendKeys smoke   VISUAL_GOLDEN scenes-golden: FAILED (exit 1)
```

而**两个 job 的结论都是 `success`**（步骤级也报 `success` —— `continue-on-error` 会把失败吞掉）。
即：**一个真实可见的排版回归（表格工具栏 436→478）随 v1.5.16 发布，而门禁完全看不见**。
这与 §5.7「`AUTO` 把完全不可用的功能当闭环」是同型：**「绿」不代表「通过」**。

> ⚠️ **我自己的推断也差点出错**：最初我看到 v1.5.16 的 Runtime Qualification 是 success，
> 就写下「说明视觉 golden 在那次运行里通过了」——**这是错的**。job 成功 ≠ 该步骤成功。
> 取到**日志原文**后才看到 `FAILED`。**教训：`continue-on-error` 让步骤结论不可信，
> 只能读日志里脚本自己打印的那一行。**

### 发现 3：容差被套在**计数字段**上 —— 加/删一个按钮对检查不可见

`scenes-golden.mjs` 原实现：

```js
if (Math.abs(bv - av) > TOLERANCE_PX) drift.push(...)   // TOLERANCE_PX = 1，对**所有**数值字段
```

于是 `buttonCount 11 → 12` 被 `|Δ| = 1 ≤ 容差` **静默放过**。字段清单已核实：非像素数值全是
**计数**（buttonCount / itemCount / categoryCount / groupCount / lineCount / tableCount /
codeBlockCount）或**设计常量**（fontSize / lineHeight / writingWidth / boldMarkerWidth）——
**都不是测量值**，套像素容差是**语义不匹配**。
**后果**：`buttonCount` 本是唯一能抓住「增删按钮」的判据，却形同虚设；该漂移最终只由
`bar.w` 暴露，而 `bar.w` 的失败又被发现 2 吞掉 —— **两个缺陷叠加才让回归一路发布**。

### 发现 4（次要）：`tests/visual/actual/*.png` 被跟踪但**不可复现**

跑一次本地套件 → 11 个被跟踪 PNG 变脏。逐个体积对比：**Δ ≤ 151 字节**（文件 5–79 KB）→
是 AA/字体渲染噪声，不是内容变化（连 `scene-table-toolbar.png` 也只 Δ=9 字节）。
即：提交它们是**纯噪声**；而 CI 已把同一批图作为 artifact 上传（`path: tests/visual/actual/*.png`），
跟踪副本与之**重复**。
**处置**：本轮**回退这些 PNG**（只提交基线 JSON）。**未处置**（仅记录）：是否取消跟踪 `actual/`
—— 那与 `tests/visual/README.md` 的「截图归档……人工评审素材」表述冲突，属需裁决项，不擅自改。

### 处置（全部实测）

| 项 | 动作 | 验证 |
|---|---|---|
| 基线 | macOS 由 `--update` 重建；Linux/Windows 的这两个字段按 **CI 日志实测值**（`436 → 478`）同步 | 三文件各只改 2 行；`scenes-golden` 本地 exit 0 |
| 容差语义 | 容差由**字段名**选择：像素 ±`TOLERANCE_PX`，其余精确 0 | 修前只报 1 项、修后报 2 项（多出 `buttonCount`） |
| 门禁 | **移除两个视觉步骤的 `continue-on-error`**（实现该步骤注释自身的条件） | YAML 可解析；两个步骤均无该属性 |
| 护栏 | ① `verify-build-pipeline` §⑨：视觉步骤不得 `continue-on-error`；② `verify-visual-golden`：容差必须由 `PX_FIELD` 选择 | 各配双向 canary，注入 → 报错 → 还原 → 通过 |

**真实平台验证（不是本地推断）**：改完后**手动触发** `Runtime Qualification`（run `36790078304`，
`gh workflow run … -f target=all`），三平台全部通过；日志里脚本自己打印的结论：

```
Windows: VISUAL_GOLDEN visual-golden: OK / sidebar-golden: OK / Scenes golden: 7 场景命中基准（±1px）/ scenes-golden: OK
Linux:   VISUAL_GOLDEN visual-golden: OK / sidebar-golden: OK / Scenes golden: 7 场景命中基准（±1px）/ scenes-golden: OK
```

两个要点：① `Scenes golden` 由「**1 项偏离基准**」变为「**7 场景命中基准**」→
**我按 CI 日志同步的 Linux/Windows 基线是正确的**（该值当时是推断的，现已实测）；
② 视觉步骤**已是阻断的**，所以 `job = success` 这次是**真的通过**，不再是 `continue-on-error` 吞出来的。

> **护栏又踩一次「匹配到散文」**：§⑨ 的说明注释里写着「**移除了** `continue-on-error: true`」
> ——该串本身会被判据命中 → **首跑即误报**。按 §4「先剥注释」修（YAML 去 `#` 行）并补 canary。
> 这是本会话**第四次**同一形态（前三次：shell 注释里的 `${TMPDIR}`、台账文本里的反引号、
> 单测消息字符串里的标签）。

## 4.52 `P0-I18N-001`「English 完整性」在**引擎侧**不成立 → 状态 AUTO 降为 IMPL（2026-10-01）

### 怎么发现的

在查表格工具栏宽度（§4.51）时读到按钮定义 `label: '↑行'` / `'删列'` / `'整理'` ——
**硬编码中文、没走 `t()`**。顺着扫一遍引擎，命中 **43 处**硬编码中文 UI 文案（5 个文件）。

### 实测（不是读代码推断）

新增探针 `tests/e2e/i18n-engine-probe.mjs`：把 `mellow.locale` 设为 `en-US` 后，
**先断言前置条件**（否则结论无效），再读引擎渲染出来的真实文案：

| 探针输出 | 内容 |
|---|---|
| 前置 ✅ | Settings 面板显示**英文**（`Settings / General / … / Language / 简体中文 / English`）→ locale 确实生效 |
| 观察 | 表格工具栏：`调整 / ↑行 / ↓行 / 删行 / ←列 / →列 / 删列 / 左 / 中 / 右 / 整理 / 删除表` |
| 观察 | 查找面板：placeholder `查找` / `替换`，按钮 `替换` / `全部` |
| 观察 | DOM 里 title：`一级标题 / 二级标题 / 三级标题 / 粗体 / 斜体 / 删除线 / 行内代码 / 链接 / 引用 / 列表 / 区分大小写 / 正则表达式` |

即：**界面是英文，而引擎（iframe 内）的 UI 文案仍是中文**。

> ⚠️ 探针**只断言前置条件**（界面确实是 en、面板确实渲染出来），**不断言「缺口存在」** ——
> 后者会把缺陷**写成契约**（skill §14）。缺口本身只**记录**，由登记表守「不得扩大」。

### 为什么此前没有被发现（结构性原因）

| 环节 | 覆盖范围 | 能否看到引擎文案 |
|---|---|---|
| `P0-I18N-001` 的证据 | `packages/i18n/test/index.test.ts`（zh/en **目录键一致性**） | ❌ 看不到 |
| CI 护栏 `verify-i18n-contract.mjs` | `t('<字面量>')` + schema 的 labelKey/descriptionKey | ❌ 看不到（其范围声明此前只写「不覆盖 Rust 侧 / HTML 模板」，**未提引擎侧**） |
| 全仓文档 | —— | ❌ 搜不到任何记录 |

**故本项的 `AUTO` 站不住**：`AUTO` 的含义是「自动化测试通过」，
而本项的关键主张「English 完整」**经实测在引擎侧不成立** —— 继续标 `AUTO` 会让门禁把它当不阻断。
这与 §5.7「`AUTO` 把一个完全不可用的功能当闭环」**同型**。

### 处置

| 项 | 动作 |
|---|---|
| 台账 | `P0-I18N-001`：`AUTO` → **`IMPL`**；`blockedBy: engine-i18n-plumbing-pending`；`mellowTarget` 追加本节实测与范围；证据补入探针 |
| 门禁 | `NO-GO：10 → **11** 项未闭环`（与 ADR-0024 的 6→10 同型：**口径变诚实**，不是退步） |
| 护栏 | `verify-i18n-contract.mjs` 新增**登记表 + 双向核对**（`ENGINE_I18N_REGISTERED`）：新增硬编码中文 UI 文案即失败、删掉须注销；并修正其范围声明 |
| 探针 | `tests/e2e/i18n-engine-probe.mjs`（前置断言 + 观察输出；清单同时充当修复的工作清单） |

**未做（属设计决策，不擅自定）**：把引擎文案接进 i18n。需要先回答
「**引擎侧文案的真值源在哪、由谁注入**」——引擎是独立 bundle，而 `editor-engine` 与
`packages/i18n` 之间是否允许依赖、或改由宿主注入文案表，属**架构选择**。

### 两个过程中的自伤（都已修）

1. **扫描器覆盖面缺口**：首版只认「属性赋值」形态（`x = '…'` / `x: '…'`），
   而引擎用 `setAttribute('aria-label', '查找')` 设了 3 处 → **漏检**。
   （是 canary 注入该形态时**没翻转**才发现的 —— 「canary 没翻转时先怀疑 canary，再怀疑判据」。）
   已补第二形态 + 该形态的 canary。**这是 skill §9「护栏范围没枚举」在「同一语义的多种写法」上的形态。**
2. **canary 与判据不匹配**：首版 canary 用 `setAttribute` 形态去测「属性赋值」的判据 → 没翻转。

### 另一方向（仅记录，未纳入登记表）

`table/liveView.ts` 的 aria-label 是**硬编码英文**（`Empty table cell` / `Edit table cell: …` /
`Markdown table`）—— 在**默认的中文界面**下同样未本地化。
未纳入登记表的原因：英文串里混有**刻意语言中立**的按钮文本（如查找面板的 `Aa` / `.*`），
静态判定噪声大；需先定「哪些英文串属于 UI 文案」才可守。

## 4.53 引擎侧「主题跟随」：宿主变量**跨不进 iframe** → 非 md 的 `var(--mellow-*)` 永远取 fallback（2026-10-01）

顺着 §4.52 的同一条线（**「必须走某个中央机制」的约束，护栏只看机制本身、不看有没有绕过**）
把「主题」也查了一遍。

### 机制（读码确认，且有注释自述）

`packages/editor-engine/src/mdTokens.ts`：

```js
function setTokenProperties(tokens) {
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('--mellow-md-')) root.style.setProperty(key, value);   // ← 显式过滤
  }
}
```

文件头自述：「编辑器运行在独立 iframe（独立 document），**宿主的 `--mellow-*` 变量不会自动继承**。
宿主（`App.tsx` applyTheme）经 `EditorCore.setMdTokens()` → 本桥把 **`--mellow-md-*`** token 批量写入」。

而 `App.tsx` 的 applyTheme 把变量设在 **app 根**上（`root.style.setProperty(key, value)`），
给 iframe 的只有 `setMdTokens(activeTheme.variables)` 这一条通道。

**即：iframe 只拿得到 `--mellow-md-*`；其余 `--mellow-*` 一律到不了。**

### 实测（探针 `tests/e2e/theme-follow-probe.mjs`）

app 侧：`data-theme = mellow-dark`、`--mellow-bg = #1e1e1e`、`--mellow-toolbar-bg = rgba(40,40,42,0.95)`
（**主题确实生效**）。iframe 侧：

| 观察项 | 读数 | 含义 |
|---|---|---|
| iframe 根上的 `--mellow-bg` / `--mellow-toolbar-bg` / `--mellow-accent` | **全为空** | 非 md 变量确实没跨过去 |
| 选区浮动工具栏计算背景 | `rgba(30,30,30,0.92)` = **fallback**（≠ app 的 `rgba(40,40,42,.95)`） | `var(--mellow-toolbar-bg, …)` 取的是 fallback |
| 表格工具栏计算背景 | `rgba(255,255,255,0.92)`（**白底**）+ 深色文字 | `table/toolbar.ts` 15 处硬编码色、**一个主题变量都没用** → 暗色下仍是白底 |

### 范围（枚举）

引擎里使用的**非 md** 主题变量共 **6 个**（8 个文件）：

| 变量 | 使用处 |
|---|---|
| `--mellow-accent` | `mdLink.ts` / `table/columnWidth.ts` / `table/liveView.ts` / `taskCheckbox.ts` / `wikilink.ts` |
| `--mellow-bg-hover` | `wysiwygBlocks.ts` |
| `--mellow-border` | `kbdCaps.ts` |
| `--mellow-danger` | `mdLink.ts` |
| `--mellow-toolbar-bg` / `--mellow-toolbar-fg` | `selectionToolbar.ts` |

**即：这 6 个变量全部永远取 fallback** —— 主题文件里为它们定义的值，对引擎是**死值**。

### 处置（**不擅自改设计**）

| 项 | 动作 |
|---|---|
| 护栏 | `verify-parity-ledger.mjs` 新增：引擎**不得出现新的非 md 主题变量**（登记上述 6 个；新增即失败）。理由：新增即等于**又写一个永不生效的开关**。 |
| 探针 | `tests/e2e/theme-follow-probe.mjs`：**只断言「量具就位」**（app 侧主题生效、两个工具栏渲染出来），把 iframe 变量与工具栏计算样式**打印**出来 |
| 台账 | `P0-THEME-001` 追加本节记录，**并明确标注不影响其主张**（见下） |

**为什么不动那 6 个 `var()`**：它们承载「这些表面**想**跟随主题」的意图。正解是**拓宽 token 桥**
（让更多 `--mellow-*` 跨进 iframe）——那会改变引擎多个表面的外观，属**设计决策**，不擅自定。
若确要走「就地内联字面量」的路线（行为等价，因为现在恒取 fallback），应连同**桥的语义**一起决定。

**为什么不降级 `P0-THEME-001`**（与 §4.52 的处置**不同**，此处刻意不照搬）：
该条目的主张是「主题和字体改变**阅读外观**」+「主题**注册/菜单/设置/UI 同步**」——
**都没有**声称「引擎侧每个表面都跟随主题」。故本节**不构成**对它主张的反驳，
只是它**未覆盖**的一个缺口。**「同一个模式」不等于「同一个处置」**：先读条目到底主张了什么。

### 三处「引擎拿不到宿主状态」的同族缺口（值得一起看）

| # | 缺口 | 通道 | 现状 |
|---|---|---|---|
| 1 | **locale** | 无（引擎文案硬编码） | §4.52，43 处，已登记 |
| 2 | **非 md 主题变量** | `setMdTokens` 只传 `--mellow-md-*` | 本节，6 个变量恒取 fallback |
| 3 | **文档/主题元信息** | 无 | —— |

三者形态相同：**引擎在独立 document 里，宿主的上下文需要显式桥接**，而桥是**逐项加**的。
→ 值得记的设计观察：与其继续逐项加桥（每加一个就多一处「没加的那部分静默失效」），
不如定一个**统一的 UI 上下文桥**（locale + 主题 token + 其它宿主状态），一次说清边界。

## 4.54 宿主 ↔ 引擎 的桥：**全量核对 = 无死桥 / 无断桥**（正向确认）+ 把该不变量固化为护栏（2026-10-01）

### 为什么查

§4.52（locale）与 §4.53（非 md 主题变量）是**同一形态**：宿主上下文到不了引擎。
故把**全部** `__MELLOW_*` 桥列全，逐条核对「有声明处 + 有读取处」—— 这是「谁在守」审计法
在**桥层**的应用。

### 结果（正向确认）

**36 个 `__MELLOW_*` 全局，全部满足「有声明处 + 有读取处」** —— 无死桥（装了开关没人用）、
无断桥（调了不存在的全局）。两个方向的例外都**有据**：

| 例外 | 说明 |
|---|---|
| `__MELLOW_MERMAID_LOADER__` | **扩展点**：由用户 / 主题注入（引擎注释写「Inject `window.mermaid` or `__MELLOW_MERMAID_LOADER__`」）→ 仓库内本就没有声明处，**属设计** |

### 处置：把该不变量固化为护栏（`verify-adapter-contract.mjs`）

新增一节：**每个 `__MELLOW_*` 全局必须有 ≥1 声明处 且 ≥1 读取处**；
死桥 / 断桥分别报错（文案不同，因为处置动作不同）；含 canary。

**⚠️ 这条护栏的编写过程本身踩了三个坑（都已修，且都值得记）**：

1. **判定看错了方向**：首版看全局名**之前**的文本找 `=` —— 而 `=` 在**之后** →
   把声明全判成读取 → 产出 **20 个假的「断桥」候选**。
2. **`startsWith` 漏了前导空格**：改成看之后，写成 `after.startsWith('=')` —— 而 ` = {` 以**空格**开头
   → **36 个桥全被判成断桥**。而 canary 用的是**另一份**（正确的）正则 →
   **canary 测的是副本，没覆盖真实代码路径**，所以没抓到。
   → 修法：把判定抽成**具名函数 `isDeclAt`**，扫描与 canary **共用**它。
3. **扫描面漏了目录**：`__MELLOW_ASSET_RESOLVER__` 由 `apps/desktop/scripts/` 的 Tauri 适配器注入
   → 不扫该目录会把它误判成「只在引擎侧出现（死桥）」。

**形态盲区（护栏必须处理，否则误报）**：仓库里有两种**非常规写法** ——
- **常量间接**：`const GLOBAL_KEY = '__MELLOW_ENGINE_API__' as const;` 之后 `win[GLOBAL_KEY] = api;`
  （实测覆盖 2/3 的误报）；
- **扩展点**（见上表）。
→ 护栏已分别处理（常量映射 + 显式例外集），并**为常量间接单独配 canary**。

> **教训（与 §4.20「描述一次修正」同族）**：**分析脚本的判定方向、边界字符、扫描面，三者任一写错，
> 都会产出「看起来很具体」的假结论**。本轮的三次误报分别产出 20 / 36 / 3 个假候选 ——
> **数量级本身就是信号**：一个「36 个全坏」的结论，先怀疑工具。

## 4.55 表格工具栏的 Typora 一手基线核实 + 护栏**按前缀分类**的盲区（2026-10-01）

§4.53 把「表格工具栏暗色下是白底」记为**真实产品缺陷**，但当时只凭探针读数与「Typora 无命中」推断，
**没有拿到 Typora 的正面基线**（只在 `style/themes/github.css` 里搜 `md-grid` / `tooltip` 无命中）。
本节补齐一手证据，并顺手抓到护栏自身的一个盲区。

### 一手证据（本机 Typora 1.14.9）

先纠正**找错了类名**：`md-grid-board` 是**插入表格时的行列网格选择器**，不是表格工具栏；
真正的工具栏类名是 **`.ty-table-edit`**（`appsrc/main.js` 中 15 处）。其取色**逐主题显式声明**：

| 文件 | 规则（逐字） |
|---|---|
| `style/base-control.css`（基线） | `.ty-table-edit{width:100%;margin-left:-4px;position:absolute;background:0 0}` |
| 同上（按钮） | `.ty-table-edit button{border:1px solid transparent;background:0 0;padding:1px 5px;font-size:12px;line-height:1.5}` |
| **`style/themes/night.css`（暗色）** | `.ty-table-edit{border-top: 1px solid gray; background-color: #363B40;}` |
| `style/themes/gothic.css` / `pixyll.css` | `.ty-table-edit{background: #ededed;}` |
| `style/themes/whitey.css` | `.ty-table-edit{background: #ededed; padding-top: 4px;}` |
| `style/themes/newsprint.css` | `.ty-table-edit{background-color: transparent;}` |
| `style/themes/github.css` | 无覆盖 → 沿用基线「透明」（继承表格/正文底色） |

**关键对照**：`night.css` 的 `#363B40` **恰等于该主题自己的 `--bg-color: #363B40`**。

> **结论**：「表格工具栏**跟随主题**」是 Typora 的**既定行为**，由主题作者逐主题声明。
> 故 Mellow 暗色下的白底（`table/toolbar.ts` 15 处硬编码色、**一个主题变量都没用**）
> **是缺口，不是「有意差异」** —— §4.53 的推断由此升级为**有一手基线支撑的结论**。

### 顺带抓到：护栏的**按前缀分类**盲区

原护栏把「会不会跨进 iframe」判定为**前缀**（`--mellow-md-*` ⇒ 会）。
盲区：`var(--mellow-md-X, fallback)` 若 X **两端都没定义**，同样恒取 fallback，
**但前缀是 md → 护栏看不见**。

实测扫全引擎（13 个 md 变量 / 6 个非 md 变量）抓到一例：

| 变量 | 消费处 | `MD_TOKEN_DEFAULTS` | 主题基表 | 实际行为 |
|---|---|---|---|---|
| `--mellow-md-list-bullet` | `plugin.ts`（`MARKER_BULLET_CLASS::before` 的 `content:'•'` 颜色） | **无** | **无** | **恒取 fallback `#8b949e`** |

另抓到一例**反向**问题（死 token）：`--mellow-md-fg` 在 `MD_TOKEN_DEFAULTS` 与主题基表**两端都有**，
但**引擎源码从不消费**（全仓扫描确认）—— 其文档化用途是 Typora 的 `body{color:rgb(51,51,51)}`，
而正文色实际由 CoreEditor 主题（`App.tsx` 的 `setTheme(activeTheme.editorTheme)`）提供。

> **教训（与 §4.10 / §4.54 同族）**：**分类维度选错，护栏就会在自己宣称覆盖的范围内留盲区**。
> 前缀是**声明式**的（作者写了 `md-` 就认为它可达），可达性是**事实式**的（真的有人注入、真的有人读）。
> 护栏应当断事实，不断声明。

### 处置

| 项 | 动作 |
|---|---|
| `--mellow-md-list-bullet` | **修**：补入 `MD_TOKEN_DEFAULTS` + 主题亮/暗基表。亮色沿用原 fallback `#8b949e` ⇒ **零视觉变化**；暗色 `#a0a0a0`（与同组 `--mellow-md-quote-fg` / `-metablock-fg` 暗色同阶）。真值说明：Typora **没有**独立列表圆点色（`themes/*.css` 与 `style/base.css` 均无 `::marker` 规则，圆点继承正文色）→ 属 **Mellow 自选灰阶（参数原创）** |
| 护栏判据 | **升级为可达性**：**R1** 引擎里每个 `var(--mellow-X, …)` 必须可达（md ⇒ 同时在 token 表与主题基表；非 md ⇒ 必须在 `ENGINE_THEME_VARS_INERT` 登记）；**R2** 两端 md 键集合**双向**相等；**R3** token 表里引擎从不消费的键必须在 `MD_TOKENS_UNUSED` 登记（`--mellow-md-fg` 已登记并写明原因） |
| `--mellow-md-fg` | **登记为「未接线」**（不删、不接线）。接线会覆盖 CoreEditor 主题色 ⇒ 属外观变更，交 ADR-0027 Q3 裁决 |
| 表格工具栏 | **不动**（15 处硬编码色保持）。取色方案有三种取舍（新增 md 面板 token / 拓宽 token 桥 / 维持现状并登记为 D 类），属**设计决策** → 已立 **ADR-0027（Proposed）**，并登记进门禁的 `Pending decisions:` 行 |

### 注入验证（9 例，全部符合预期）

`verify-parity-ledger.mjs` 的判定函数 `classify(name, ctx)` **具名且参数化**，canary 复用同一份
（避免「canary 测的是副本」）。逐例「注入 → 报错 → 还原 → 通过」：

① 引擎里注入未定义的 md token → 报「不可达的 md token」；② 注入未登记的非 md → 报「新的非 md 主题变量」；
③ 从主题基表删掉该 token → 报不可达；④ 从 token 表删掉 → 报不可达；
⑤ 只加 token 表一端 → 报「只在 `MD_TOKEN_DEFAULTS`、不在主题基表」；
⑥ 只加主题表一端 → 报「只在主题基表、不在 `MD_TOKEN_DEFAULTS`」；
⑦ 塞入引擎从不消费的死 token → 报「引擎从不消费」；⑧ 清空 `ENGINE_THEME_VARS_INERT` → 报未登记（反例锁）；
⑨ 还原后通过。另配三条**翻转** canary：清空 inert 名单 ⇒ 非 md 变量判未登记；清空主题表 / token 表 ⇒ md 变量判不可达。

### 门禁加固（顺带）

`verify-release-gate.mjs` 的 `PENDING_ADRS` 此前**只有报告行、没有任何断言**（自身即「写了却无消费方」）。
本次补上断言：待裁决 ADR 必须存在且**状态为 Proposed**（只认 `**Status:**` 那一行，
防止正文里的字样蒙混），并配 3 条 canary（合法 Proposed 被检出 / Accepted 不被误判 / 正文里的字样不算状态行）。

## 4.56 把视觉门禁改成**真门禁**之后，它第一次真跑就抓到**两处测试自身的时序缺陷**（2026-10-01）

§4.51 移除了 `runtime-qualification.yml` 两个视觉步骤的 `continue-on-error`（假门禁 → 真门禁）。
本节是它**第一次以真门禁跑 `v*` 标签**的结果 —— 也是「假门禁代价」的量化。

### 现象（run 36797746845，v1.5.17 标签）

Runtime Qualification：**Windows job 红**，macOS / Linux 绿。失败步骤正是被改真的那一个
（`Visual golden (§9.3: visual + sidebar + scenes)`）：

```
Visual golden:  6 configs match baseline (±1px)   → OK
Sidebar golden regressions:
  ❌ files-tree-filter.focused: golden false vs actual true
VISUAL_GOLDEN sidebar-golden: FAILED (exit 1)
Scenes golden: 1 项偏离基准（像素 ±1px；计数/常量精确）
  ✗ settings.panel.y: 150 → 146
VISUAL_GOLDEN scenes-golden: FAILED (exit 1)
```

### 决定性证据：**同一提交重跑即变绿**

对**同一个提交**（`7881f06`，未做任何改动）重跑该 job：

```
Visual golden: 6 configs match baseline (±1px)   → OK
Sidebar golden: 4 views match baseline (±1px)    → OK      ← 上一次这里是 focused 漂移
Scenes golden: 7 场景命中基准（±1px）              → OK      ← 上一次这里是 y=146
```

**同一份代码，一次红、一次绿** —— 这本身就是「量具不稳定」的判据：
真实回归不会因为重跑而消失。**若只看重跑后的绿，就会把一次真实的量具缺陷记成「已通过」**
（这正是 §5.7 / §4.51 反复出现的「绿 ≠ 通过」同型）。

### 关键排除：先怀疑量具，而不是产品

- `cb4fbcc`（约 1 小时前，`workflow_dispatch`）三平台**全绿**（含 Windows）；
- `cb4fbcc..HEAD` 之间**唯一**影响渲染的改动是「往主题基表与 token 表各加一个 CSS 变量」
  （`--mellow-md-list-bullet`），其余全是护栏/文档/版本号；
- 两个读数（布尔焦点、4px 偏移）都**不是**「加一个未消费的 CSS 变量」能造成的形态。

→ 结论：**是量具的问题**。

### 定性 1：`settings.panel.y 150 → 146` = **入场动画未结束**

`apps/desktop/src/styles.css`：

```css
@keyframes mellow-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.settings-backdrop { animation: mellow-fade 140ms ease; }
```

`translateY(-4px)` 与读数差 **完全一致**。`.settings-panel` 的 `y` 在动画结束时是
`(900 - 600) / 2 = 150`，动画起点是 **146**。

**直接佐证**：取该次运行的 Windows 视觉产物，`actual/scene-settings.png` 里面板**半透明**
（正文透过面板可见）—— 动画确实还在跑；而本地 macOS 的同一张是**不透明**的。

**原实现的缺陷**：用 `sleep(400)` 兜底一个 140ms 的动画。**在负载高的 runner 上这不成立** ——
渲染进程可能尚未产出首帧（动画「还没开始」），墙钟却已走完。
→ 同一个提交、同一个 runner 镜像，一次 150、一次 146。

### 定性 2：`files-tree-filter.focused false → true` = 采到了**焦点争夺的中间态**

`apps/desktop/src/App.tsx` 的 ⌘F effect：

```js
// 编辑器 iframe 会在挂载后抢焦点（mellow-editor-frame 成为 activeElement）→
// 挂载后短窗内反复夺回焦点，保证键入直接落在过滤框
useEffect(() => { if (!treeFilterOpen) return; /* … 1200ms 内每 60ms el.focus() … */ }, [treeFilterOpen]);
```

而 `sidebar-golden.mjs` 在「输入框**刚出现**」的瞬间就采样 `document.activeElement === el`
→ 读到的是**编辑器 iframe 抢焦点 vs effect 夺回** 的中间态，谁赢取决于这一瞬间的调度。
基线里的 `false` 正是「**被抢走**」的那个瞬态 —— **把竞态中间态当成了契约**。

**本地实跑验证**（macOS，修复后）：`focused = true`，且**只有这一个字段漂移**（几何全部命中）。

> **两处同型**：都拿**墙钟**去猜一个**状态**（动画是否结束 / 焦点是否收敛）。
> **`sleep(N)` 是「等时间」，不是「等状态」。**

### 处置

| 项 | 动作 |
|---|---|
| 新原语 | `tests/visual/wait-rendered.mjs`：`waitForAnimationsSettled(target)`（先推 2 帧确保动画已启动，再轮询 `document.getAnimations()`；**跳过无限迭代的常驻动画**，见下「跟进」）+ `waitForFocusSettled(page, sel)` |
| 接入 | `scenes-golden.mjs`（设置场景）、`sidebar-golden.mjs`（过滤框场景）、`visual-golden.mjs`（6 配置布局）改为 `if (!(await …)) throw` —— **未收敛即响亮失败，禁止静默继续采样**（静默继续正是读数漂移的成因） |
| 基线 | 三平台 `sidebar-golden*.json` 的 `files-tree-filter.focused`：`false → true`。**依据**：macOS 本地实测 `true`；Windows 该次 CI 的 actual 也是 `true`；Linux 为**推断**（同一平台无关代码路径），**已由 CI 证实**（见下） |
| 护栏 | `verify-visual-golden.mjs` 新增：**范围按目录派生**（凡读 `getBoundingClientRect` 的 `tests/visual/*.mjs` 自动纳入，另有覆盖下限防「判据静默变空」）；每个采样脚本必须从共享模块引入、**至少调用一次**、且对返回值做 `!(await …)` 判定；**功能性**验证纯谓词（`await import` 真实模块，四个方向含常驻动画）；判定与 canary **共用**剥注释函数（`codeOnlyOf`）；注入验证 **13 例**全部符合预期（含「注释掉调用」「新增采样脚本自动纳入」「去掉常驻动画排除」三种形态） |

### 跟进：「等所有动画结束」是**错的**判据 —— 页面里有合法的**常驻动画**（同日实测）

把原语推广到第三个采样脚本 `visual-golden.mjs`（它用 `page.waitForTimeout(600)`，同一类「等时间」）时，
**立刻炸出原语自身的一个错误假设**：

```
Error: 编辑器 iframe 入场动画未在 3s 内结束 —— 此时采样布局会读到动画中间值
```

探针（dump `document.getAnimations()`）：

| 文档 | 动画数 | 明细 |
|---|---|---|
| 主文档（app） | **0** | —— |
| 编辑器 iframe | **1** | `cm-blink2`（target `div.cm-cursorLayer`、`duration: 1000`、**`iterations: Infinity`**）= **CodeMirror 6 的光标闪烁** |

即：**「等所有动画结束」在 iframe 上永远等不到**。若照此实现，等于**把一个假失败引进来** ——
比原来的时序漂移更糟（原来的问题至少偶尔能过）。

**修正**：原语必须区分「**入场**动画」（有限迭代）与「**常驻**动画」（无限迭代）。
判据抽成**纯函数** `isPendingSettlable(animation)`：`iterations === Infinity` ⇒ 不等；
其余非 `finished` ⇒ 等。并以**源码字符串**送进浏览器（`new Function` 重建），
使「浏览器里真正跑的谓词」与「护栏验证的谓词」是**同一份**（避免「canary 测的是副本」）。

> **教训**：把一条判据**推广到新场景**时，它原本隐藏的假设会暴露。
> 本例的假设是「所有动画都会结束」—— 在设置面板上成立，在编辑器里不成立。

**同一步里还修了「范围判据太窄」**：最初的采样判据只看 `getBoundingClientRect`，
于是漏掉**纯截图**脚本 —— 而截图同样会被动画影响（**动画中间帧会被冻结进归档证据**）。
实测漏掉的正是 `capture-window-chrome.mjs`（P2-2.8 的归档工具，它在 `waitForTimeout(600)` 后
截图并写入人工评审素材）。判据已拓宽为「**读过几何 或 截过图**」，范围派生的结果由 3 个变 **4 个**：

```
capture-window-chrome.mjs / scenes-golden.mjs / sidebar-golden.mjs / visual-golden.mjs
```

并给 `capture-window-chrome.mjs` 补上等待（实跑验证：截图产出且归档 PNG 字节未变）。

### 修后复核（三平台实测，v1.5.17）

把 `v1.5.17` 标签**移到含修复的提交**（`git tag -f` + 强推，因为原标签里是**偶发版测试代码**），
重跑两条流水线 —— **全绿**：

| 流水线 | 结论 | 关键读数 |
|---|---|---|
| Runtime Qualification | ✅（Linux / Windows / macOS） | Windows 视觉步骤：`visual-golden: OK` / `sidebar-golden: OK`（4 views）/ `scenes-golden: OK`（7 场景） |
| Release Packaging | ✅（三平台 + Finalize） | 15 制品；draft 且 `prerelease=true` |

即：**`focused = true` 在 Linux 上的推断被 CI 证实**（无需再猜），且 `settings.panel.y` 回到稳态 150。

> **为什么移标签而不是接受重跑的绿**：原标签里的**测试代码本身**是偶发版 ——
> 它的绿可能只是这一次调度赢了。把修复提交纳入标签，标签的绿才是**可复现的绿**。

### 教训

- **假门禁的代价是可以量化的**：移除 `continue-on-error` 的**第一次真跑**就红 ——
  说明在此之前，这两个漂移已经（或将会）无声通过。
- **「重跑变绿」不是通过，是量具不稳**：真实回归不会因为重跑而消失。
  拿重跑的绿当作通过证据，等价于把量具缺陷洗成结论 —— 与 §5.7 同型。
  本节的处置是**修量具**，而不是接受那次重跑的绿。
- **「绿」要被质疑时，先质疑量具**：本例的三条排除（1 小时前同镜像全绿 / 改动面不含渲染 /
  读数形态与改动不符）比任何猜测都省时间。
- **采样值若会被动画或焦点竞争影响，就必须等「状态」，不能等「时间」。**

## 4.57 引擎侧 i18n 的「43 处 / 5 文件」**少计一半**：判据只认一种写法（2026-10-01）

### 为什么查

`P0-I18N-001` 是未闭环 11 项里**唯一** `blockedBy` 指向**实现**（`engine-i18n-plumbing-pending`）
而非人工/真机/裁决的一项 —— 故本轮准备实施它。**动手前先核对工作清单**，于是先看登记表。

### 发现：登记表 43 处 / 5 文件，实测 **79 处 / 8 文件**

`verify-i18n-contract.mjs` 的 `ENGINE_I18N_REGISTERED` 记 43 条，而按「逐行、任意位置、
三种引号、含汉字即算」重新枚举，得到 **79 条 / 8 个文件**。

漏检的是**四种同语义写法**：

| # | 形态 | 实例 | 为什么漏 |
|---|---|---|---|
| ① | **三元 / 表达式位置** | `label.textContent = this.lang === '' ? '语言' : …` | 判据要求 `属性 = '…'` **紧邻**，而 `=` 后面是 `this.lang` |
| ② | **函数实参** | `new Option('(无语言)', '')`、`copyCodeText(code, btn, '复制')` | 不是属性赋值，是调用实参 |
| ③ | **模板串** | ``fail(`mkdir(${path}) 未实现`)`` | 判据只认单/双引号 |
| ④ | **整个文件** | `wysiwygBlocks.ts` / `image/ops.ts` / `image/host.ts` | 这三个文件**从未被扫到过** |

新增漏检项的分布：`codeBlockLabel.ts` +2、`image/widget.ts` **+10**（各按钮的 tooltip **描述**，
此前只登记了按钮**标签**）、`table/toolbar.ts` +2、以及 3 个新文件（3 / 15 / 4）。

> **这与 §4.52 同型，也与 PITFALLS §4.37 同型：只核对一半 = 没核对。**
> 更值得记的是：**这份「工作清单」本身是漏的** —— 若直接照着它实施，
> 会交付一个「登记表全绿但界面仍有中文」的半成品，而**没有任何判据能发现**。

### 处置

- **判据改为「按事实枚举」**：逐行扫描、**任意位置**、单/双/反引号**三种形态**，含汉字即登记；
  唯一豁免是**已本地化的调用**（`tEngine('…')` / `t('…')` —— 即修复的目标状态）。
  不再猜「哪个位置算 UI」。
- **登记表补齐到 79 条 / 8 文件**；比较改为**集合**（与书写顺序无关）。
- **8 条逐形态 canary**，重点是历史上漏检的那三种写法（三元 / 实参 / 模板串）+ 剥注释 + 豁免方向。
- **9 例注入验证**全部符合预期（含「清空登记表」「删掉一条已登记项」「把一条改成 `tEngine`」）。
- 台账 `P0-I18N-001` 追加更正段；**状态与 `blockedBy` 不变**（接线尚未开始）。
- `image/host.ts` 那 4 条是**错误路径 / 开发者消息**（`fail()` 与 io 兜底）：
  **照收不误**（宁可多登记，不可漏登记），是否真属 UI 由接入时逐条判定。

### 注入验证抓到我自己的设计错误（值得单记）

我最初给登记表加了「**条目下限 ≥ 79**」防「清空即全绿」。注入用例「把 1 条改成 `tEngine(...)`
并同步删登记项」→ **被下限拦下**：

```
引擎文案登记表疑似被清空/缩水：文件 8（下限 8）、条目 78（下限 79）
```

即：**该下限会阻止修复** —— 本登记表是**待修清单**，其目标是**缩到 0**。
而「清空即全绿」这个担忧**本来就被别的判据覆盖**：清空后扫描仍会报出 79 条「新增未登记」→ 照样红。
**下限冗余且有害，已移除**；真正需要防的「扫描器本身失效」由逐形态 canary 守。

> **教训**：**给「待修清单」设覆盖下限是反的** —— 覆盖下限适用于**不该缩小的集合**
> （如护栏清单、契约点），而**待修清单**的下降正是进展。
> **判据要跟着「集合的语义」走，不能一律套用同一个防退化手法。**

### 对工作量的影响

本项实际工作量约为原估计的 **1.8 倍**（79 条 / 8 文件 vs 43 条 / 5 文件）。
接线本身（locale 通道 + 引擎文案目录 + 逐条替换 + 测试）**尚未开始** ——
且它需要先回答「引擎侧文案的真值源与注入方式」（见下）。

> **与 ADR-0027 的关系**：`P0-THEME-001`/ADR-0027 卡在「引擎在独立 document，宿主上下文逐项加桥」；
> i18n 的 locale 是**同一形态的第三个缺口**（§4.53 已列：locale / 非 md 主题变量 / 其它宿主状态）。
> §4.54 的建议是「与其继续逐项加桥，不如定一个**统一的 UI 上下文桥**」——
> 该建议至今**没有 ADR 载体**，而 locale 接线会**替它做选择**（再加一条独立桥）。
> 故本轮**不擅自接线**，把这一项留给 ADR。

## 4.58 引擎侧 i18n 接线（ADR-0028 落地）：静态护栏全绿之后，探针抓到**求值时机**缺陷（2026-10-01）

### 裁决

依据用户 2026-09-30 授权「全部自行评估、决策、实施，不叫我人工参与」（ADR-0024/25/26 裁决节同引）：

- **ADR-0028**（引擎宿主上下文通道）：**Q1=A2**（逐项加桥）/ **Q2=B1**（引擎自带目录）/ **Q3=C1**（默认 zh-CN）。
  A1（统一桥）被否的**关键理由**：它原本的主要论据是「逐项加桥 → 没加的那部分静默失效」，
  而本会话已把这条风险**变成会红的判据**（`verify-parity-ledger.mjs` 的 R1 可达性、
  `verify-i18n-contract.mjs` 的引擎文案判据）→ 边际收益下降，而改动面（36 个桥 + 视觉基线）不变。
- **ADR-0027**（引擎浮动面板取色）：**Q1=A1 / Q2=B1 / Q3=C1**；**决策已定、实现未做**（排在 P0 缺陷之后）。
  它与 0028 的 A2 **解耦**（面板 token 复用既有 md 桥，不新增桥），故原「应一并裁决」的顾虑消解。

### 实施

- `engineI18n.ts`：76 键 × zh/en + `tEngine()` + `__MELLOW_ENGINE_LOCALE__` 桥（localStorage 时序兜底）。
- 引擎侧 **79 处 / 8 文件**硬编码中文 → `tEngine('…')`；登记表**清空**（待修清单的目标即缩到 0）。
- 宿主链：`engine/index.ts` 装桥 → `editor-core.setEngineLocale()` → `App.tsx`（引擎就绪回调 + locale 变化）。
- 英文真值取自 Typora 一手资源（`.strings` 的**键即英文源串**、`main.js`）：`Find` / `Replace` / `All` /
  `Case Sensitive` / `Regular Expression` / `Download` / `Open` / `Rename` / `Heading 1..3` / `Strike` /
  `Quote` / `Emphasis` / **`Strong`** / `Align Left|Center|Right` / `Delete Table`；
  其余标注 **Mellow 自译（参数原创）**。

### ⚠️ 差点以「半成品」收口 —— 本节最重要的一条

**静态护栏 E1–E4 全绿之后，e2e 探针仍然报错**：

```
{"buttons":["调整","↑行","↓行","删行","←列","→列","删列","左","中","右","整理","删除表"]}
["一级标题","二级标题","三级标题","粗体","斜体","删除线","行内代码","链接","引用","列表"]
```

**根因是求值时机**：`selectionToolbar.ts` 的按钮定义是**模块级常量**（模块加载即求值）、
`table/toolbar.ts` 在**构造时**渲染 —— 而引擎 `install()` 早于宿主注入 locale 的桥
→ 标签被**烘死**成默认语言。

**为什么静态护栏查不出**：源码里确实**没有硬编码中文**（都走 `tEngine`）、键也都在目录里、
接线链也完整 —— E1–E4 **全部为真**。**「求值时机」不在静态判据的可表达范围内。**

**修**：标签改为**显示时求值**（`ACTION_DEFS` 模块常量 → `actionDefs()` 函数 + `syncLabels()` 在
`showEl()` 调用；`renderButtons()` 从构造移到 `updateToolbar` 的显示路径）。

> **教训（与 §4.55「按声明 vs 按事实」同族，但更深一层）**：
> 静态护栏能证「代码里写对了」，**不能证「运行时会走对」**。
> 凡是「求值时机 / 生命周期」类的缺陷，**必须由能真跑的东西来证** —— 本例是 e2e 探针。
> **「护栏全绿」不是收口的充分条件。**

### 实测证据（`tests/e2e/i18n-engine-probe.mjs`，en-US 界面下读引擎真实 DOM）

| 表面 | 读数 |
|---|---|
| 表格工具栏 | `Resize / ↑ Row / ↓ Row / Delete Row / ← Col / → Col / Delete Col / Align Left / Align Center / Align Right / Tidy / Delete Table` |
| 查找面板 | 占位符 `Find` / `Replace`；按钮 `Replace` / `All` |
| 选区浮动工具栏 | `Heading 1\|2\|3 / Strong / Emphasis / Strike / Inline Code / Hyperlink / Quote / List`；`aria-label = Format toolbar` |
| 引擎 DOM **可见**元素中 title 含中文 | **0** |

探针同时由「只断言前置 + 记录缺口」改为**正面断言英文**，并只扫**可见**元素 ——
未显示的工具栏保留默认语言属正常（`showEl()` 时才同步），断言应落在**用户看得见的状态**。

### 附带抓到的两处自身缺陷（都被护栏当场拦下）

1. **注入验证的还原有漏**：`documentSearch.ts` 残留 2 处 `engine.search.notExist`、目录少 1 个键
   → **E2 报「目录中不存在」、目录下限报「只有 75 个键」**。两处都被抓到。
   **教训：注入 harness 必须自带「还原后比对」的自检** —— 否则「验证用的变异」会变成「提交的内容」。
2. **E3 的「键重叠」是死判据**：`catalog` 只收集 `engine.*` 键，而 app 目录无此类键 ⇒ **交集恒空、永不触发**
   （skill §15「不可达判据」）。已改为**可达**的等价表述「`packages/i18n` 不得出现 `engine.*` 键」，
   并注入验证其**确实会报**。

### 第三次「自伤」：护栏的目录正则**预过滤** → 前缀判据不可达（由 CI 抓出）

提交后 **CI 红**（`editor-engine test + build` → 单测），报：

```
● engine i18n — 目录 › 每个键的 zh-CN 与 en-US 都非空，且键一律 engine. 前缀
  > 28 |       expect(k.startsWith('engine.')).toBe(true);
```

**根因**：目录里残留了一行**注入变异产物** `'sidebar.files': { 'zh-CN': '查找', 'en-US': '' },`
（我在补回 `engine.search.find` 时没删掉它）。而**静态护栏全绿** —— 因为它的目录正则写成
`'((?:engine)\.[…])'`：**非 engine 键对整节判据全部不可见**，前缀判据因此**永不触发**
（又一个 skill §15「不可达判据」；与本节前面那个「键重叠」是同一个错）。

**修**：目录正则改为取**全部**条目（再让前缀判据去判定），并注入验证「把键改成 `sidebar.files`」
**确实会报**。清理残留键 → 76 键、无杂键。

> **另一条值得记的**：修好前我在本地跑过一次全量 jest，**它是通过的** ——
> 因为 **jest 缓存**给了假绿；加 `--no-cache` 立刻复现失败。
> **「本地通过」必须问一句：跑的是当前源码吗？**

### 门禁

`NO-GO：**10** 项未闭环`（原 11）；`P0-I18N-001` 由 `IMPL` 升 **AUTO**（`blockedBy` 移除）。
**`AUTO` ≠ 完成**：自动化证据（引擎单测 79 套件 / 1288 用例 + E1–E4 护栏 + e2e 实测）齐备，
**真机三平台体验验收仍未做**。

## 4.59 ADR-0027 落地（表格工具栏跟随主题）—— 顺带修掉「主题这一族没在启动时下发」（2026-10-01）

### 落地

- 新增 **4 个 md 面板 token**（亮/暗两套，同时进 `packages/themes/src/index.ts` 与 `mdTokens.ts`）：
  `--mellow-md-panel-bg` / `-fg` / `-border` / **`-active`**（比 ADR 草案的 3 个多 1 个 ——
  Resize 弹层激活格填充若改用 accent 会改变亮色观感，为**保住亮色现状**而增设；属实现细节）。
- `table/toolbar.ts` 的 **15 处硬编码色** → `var(--mellow-md-panel-*, <原值>)`；
  **亮色取值 = 原硬编码值** ⇒ 桥未就绪时观感与修复前**完全一致**。
  悬停底**复用边框色**（亮 `#ddd` / 暗 `#3a3a3a` 都成立），故不必再加第 5 个 token。
- 未动 `selectionToolbar.ts` 与那 6 个非 md 变量（ADR-0027 Q2 = B1）。

### ⚠️ 顺带修掉一个**更早**的缺陷（不修则本 ADR 无效）

探针实测：**主题这一族**（编辑器主题名 / md 排版 token / 编辑器字体）**只在**「主题变化」的 effect
里下发，而该 effect **早于编辑器就绪** → 启动时若已是暗色，那三次调用**静默 no-op**：

| 观察（`theme-follow-probe.mjs`，**暗色启动**） | 修复前 | 修复后 |
|---|---|---|
| iframe 根上的 `--mellow-md-inline-code-bg` | **空** | `#2d2d2f` |
| iframe 根上的 `--mellow-md-link` | **空** | `#4493f8` |
| 表格工具栏 `background` | `rgba(255,255,255,0.92)`（白底） | `rgba(37,37,38,0.95)` |
| 表格工具栏 `color` | `rgb(51,51,51)`（深字） | `rgb(230,230,230)`（浅字） |
| 选区工具栏 `color` | `rgb(36,41,47)`（**暗色下深色文字**） | `rgb(209,209,214)` |

即：**以暗色启动时，编辑器此前会用默认（亮）主题渲染**。字号 / 行高 / 写作宽度等**其它**启动设置
早已在「引擎就绪」回调里补下发 —— **只有主题这一族漏了**。已按同一模式补齐（幂等）。

> **这条缺陷一直没被发现，是因为没人从「冷启动即暗色」这个入口看过。**
> 已有的 e2e / 视觉 Golden 都在**默认（亮色）**下采样；主题探针此前**只记录不断言**
> （「只断言前置，缺口只记录」—— §4.51 时代为避免「把缺陷写成契约」而刻意如此）。
> **本轮把它升级为正面断言**，于是它立刻抓到了这个跨模块的启动时序缺陷。

### 证据

`theme-follow-probe.mjs` 新增 3 条正面断言（暗色下：面板底为暗 / 按钮底为暗 / 文字为浅）**全部通过**；
`verify-parity-ledger.mjs` 的 **R1/R2** 自动校验新 token **两端齐备**（这是 ADR-0027 起草时立下的护栏，
本轮第一次真正用上）。

## 4.60 把 §4.59 的教训**系统化**：宿主→引擎的「启动状态下发」逐条核对 → 又抓到一处（2026-10-01）

§4.59 发现「主题这一族没在启动时下发」。既然它是**一族**，就把**全部**宿主→引擎的 `set*` 列全，
逐条判定「冷启动时是否生效」。方法：以 `editor-core` 的宿主契约（`packages/editor-core/src/core.ts`
的 `set*` 方法）为**完备清单**，逐个回查它在 `App.tsx` 里的下发点。

### 结果

| `set*` | 下发点 | 冷启动生效？ |
|---|---|---|
| `setTheme` / `setMdTokens` / `setEngineLocale` | 主题/locale effect | ❌ → **§4.59 已修** |
| `setEditorConfig('setFontSize' / 'setLineHeight' / 'setContentMaxWidth' / 'setShowLineNumbers' / ` `'setLineWrapping' / 'setAutoPair' / 'setMarkdownSyntaxPairs' / 'setDefaultCodeLang' / ` `'setCodeIndentSize' / 'setTabKeyBehavior' / 'setFirstLineIndent' / 'setAllowMagnification')` | 就绪回调 | ✅ |
| `setSpellcheckEnabled` / `setSmartPunctuationEnabled` / `setCodeLineNumbersEnabled` / `setTypewriterMode` / `setFocusMode` | 就绪回调 | ✅ |
| **`setSelectionToolbarEnabled`** | **只在菜单/设置的回调里**（`setSelectionToolbarEnabled` callback） | ❌ **本轮抓到并修复** |
| `setDocumentPath` / `setLargeFileMode` | 按文档 / 按文件大小驱动 | ✅（非持久设置） |

### 缺陷：`appearance.toolbar` 关掉后**重启又出现**

`selectionToolbarEnabled` 的 state **确实**从持久化值初始化了（源码注释还记着上一轮修过
「菜单勾选态 = 开、实际工具栏 = 关」的分裂）—— 但**引擎从未在启动时被告知**。
即剩下的那一半分裂：「**菜单勾选态 = 关，实际工具栏 = 开**」。

**实测取证**（新探针 `tests/e2e/startup-state-probe.mjs`）：

```
=== 用例 1：appearance.toolbar=false（非默认）→ 选中文本 ===
{"found":true,"display":"flex"}          ← 关掉了却仍显示
=== 用例 2：对照（默认开）→ 选中文本 ===
{"found":true,"display":"flex"}
```

**修**：在「引擎就绪」回调里下发（照 `spellcheck` / `smartPunctuation` 等邻居的模式；
但**无论取值都下发**，不依赖「引擎默认 = 开」这一隐式耦合）。修复后用例 1 → `display:"none"` ✓、
用例 2 仍 `flex` ✓（对照证明判据有效）。

### 固化为护栏（否则下次还会漏）

`verify-adapter-contract.mjs` 新增第 ⑥ 节：**宿主→引擎的每个状态 `set*` 都必须出现在
`App.tsx` 的 `STARTUP_STATE_APPLY_BEGIN/END` 区间内**（该区间即「引擎就绪」回调里的下发段）。

**注入验证 3 例**：移出 `setMdTokens` → 报错；移出 `setSelectionToolbarEnabled` → 报错；
删掉区间结束标记 → 报错；基线通过。

> **护栏自身也踩了一个坑（值得记）**：首版判据写 `slice.includes(name)` —— 抽掉
> `host.setSelectionToolbarEnabled(on)` 后，**同名的状态 setter** `setSelectionToolbarEnabledState(on)`
> 仍让子串匹配成立 → **护栏没翻转**。已改为判**调用形态**（`host.<name>(` 或 `'<name>'`），
> 并补一条反例锁：「只有同名 setter、没有 `host.` 前缀」必须算**缺失**。
> （skill §7「断言匹配调用而非标识符」的同型。）

## 4.61 把「非默认入口探针」挂进**发布门禁**（2026-10-01）

### 问题：连续几轮的发现都靠**手工跑探针**，而探针不进 CI

§4.59（暗色启动用亮主题）与 §4.60（关掉的开关重启又出现）都是**探针**抓出来的。
而 `tests/e2e/` **不进主 CI**（需要 Playwright + 构建产物）—— 按 §4.50 的教训
「**不进 CI 的测试会腐烂**」，这些断言若不挂到某处，下一次没人跑就等于没有。

### 处置：挂到 Runtime Qualification 的 Linux job（**每次发布都会跑**）

该 job 已经装了 Playwright、构建了 bundle、并且已经在跑视觉 Golden —— 是现成的落点。
新增步骤 **「Non-default entry probes (dark / English / 关掉的开关)」**，跑三个探针：

| 探针 | 覆盖的**非默认入口** | 对应发现 |
|---|---|---|
| `theme-follow-probe` | **暗色主题** | §4.53 / §4.59 |
| `i18n-engine-probe` | **English 界面** | §4.52 / §4.58 |
| `startup-state-probe` | **关掉的开关**（`appearance.toolbar=false`） | §4.60 |

**与视觉步骤同规**：逐条记录退出码、失败即非零退出；**不得** `continue-on-error`
（那正是 §4.51 修过的假门禁）。

### 护栏

`verify-runtime-qualification-workflow.mjs` 新增断言：该步骤**必须存在**、三个探针**必须都在**、
**不得**带 `continue-on-error`、**必须**逐条记录退出码并 `exit $status`。

**注入验证 3 例**：删掉步骤 → 报错；加 `continue-on-error: true` → 报错；去掉 `status=1`/`exit $status` → 报错；基线通过。

> **连带（同轮第 5 次）**：该步骤的**说明注释**里写着「不得用 `continue-on-error`」——
> 若不剥 YAML 注释，判据会被**自己的说明**触发。已按本仓既有约定先剥注释，并配 canary
> （「注释里的字样不算」+「真实违规必须被检出」两个方向）。

### ⚠️ **派发实跑**抓到探针自己的跨平台缺陷（这是「接上线 ≠ 能跑」的实证）

只把步骤接上是不够的 —— 我**派发了一次 Runtime Qualification（`target=all`）实跑**，结果：

| job | 结果 |
|---|---|
| macOS / Windows | ✅ |
| **Linux** | ❌ —— 视觉 Golden ✅，但**新增的探针步骤 ❌** |

探针步骤内部逐条读数：

```
✅ 主题探针（暗色）：表格工具栏 bg = rgba(37,37,38,0.95) / fg = rgb(230,230,230)
✅ 启动探针：appearance.toolbar=false → display:"none"；对照 → "flex"
❌ i18n 探针：=== 查找面板 === {"found":false}
   ❌ 前置：查找面板出现且能读到输入框（引擎侧渲染） — inputs=0
ENTRY_PROBE i18n-engine-probe: FAILED (exit 1)
```

**根因：探针自己写死了 macOS 专有按键** —— `page.keyboard.press('Meta+f')`。
Linux 上没有 Meta 键 → 查找面板根本没打开。**这是探针缺陷，不是产品缺陷。**

**为什么一直没被发现**：该探针**只在 macOS 上跑过** —— 又一次「非默认入口无人走」
（这次的非默认入口是**非 macOS**）。

**修**：改用 Playwright 的 `ControlOrMeta`（macOS→Cmd / 其它→Ctrl；本仓既有约定见
`sidebar-golden.mjs` 的 `ControlOrMeta+f`）。

**并加固**：`verify-runtime-qualification-workflow.mjs` 新增 —— **凡挂进该 CI 步骤的探针，
源码里不得出现 macOS 专有按键**（`'Meta+…'` / `'Cmd+…'`，先剥注释再判），配双向 canary。
注入验证：把探针改回 `Meta+f` → 报错；基线通过。

> **教训**：「**把测试接进 CI**」与「**测试在 CI 上能跑**」是两件事。
> 前者是配置改动，后者**只能靠实跑证明** —— 本次若不派发，下一个版本会在 Linux 上静默红。

## 4.62 非默认入口探针**两侧都挂**（Linux + Windows）—— 只挂一个平台 = 另一个平台仍无人走（2026-10-01）

§4.61 把探针挂到了 Linux job。但本仓的**平台专有代码集中在 Adapter**（ADR-0016 / ADR-0022），
而 §4.61 在 Linux 上抓到的**恰恰是按键处理类**问题（探针写死 macOS 的 `Meta+f`）——
**同一类风险在 Windows 上同源存在**，只挂 Linux 等于把另一半留在无人区。

### 处置

在 **Windows job** 加同一步骤（该 job 已装 Playwright 于 `C:/pw/node_modules`、已跑视觉 Golden）：
「Non-default entry probes (dark / English / 关掉的开关)」，pwsh 写法，**逐条记录退出码 + `exit $status`**、
**不得** `continue-on-error`。

### 护栏升级

`verify-runtime-qualification-workflow.mjs` 由「找到一处」改为「**必须有两处**」：
- 用 `matchAll` 取**全部**同名步骤，断言 **≥2**（Linux + Windows）；
- 逐个检查：三探针齐全 / 无 `continue-on-error` / 逐条记录退出码并 `exit $status`；
- **bash 与 pwsh 两种写法都认**（`status=1` 与 `$status = 1`）。

**注入验证**：删掉 Windows 那一处 → 报错
「非默认入口探针步骤只有 1 处（下限 2：Linux + Windows）」；基线通过。

> **教训（与 §4.61 的「接上线 ≠ 能跑」互补）**：
> **「挂了一个平台」≠「挂了所有平台」**。凡平台专有代码所在之处，验证也要**逐平台落地** ——
> 否则「有测试」这句话在每个平台上都为真，而**每条路径上都不完整**。

### ⚠️ 派发实跑：Windows 侧**三个探针全挂** —— 又是「裸 spawn('npx')」

只把步骤接上仍不够 —— 派发 RQ 实跑后 **Windows job ❌**（视觉 Golden ✅、探针 ❌），
且三个探针**各在 ~0.5 秒内瞬间失败**：

```
ENTRY_PROBE theme-follow-probe: FAILED (exit 1)
ENTRY_PROBE i18n-engine-probe: FAILED (exit 1)
ENTRY_PROBE startup-state-probe: FAILED (exit 1)

Error: spawn npx ENOENT
```

**根因**：三个探针都写了 `spawn('npx', ['vite', …])` —— 而 **Windows 上 `npx` 实际是 `npx.cmd`**，
无 shell 时 spawn 抛 `ENOENT`。**这正是本仓已经修过一次的坑**
（`tests/visual/dev-server.mjs` 的文件头就记着它：P0-LAYOUT-002 的 Windows 采集长期「静默产出 0 文件」）。

**为什么这次又漏了 —— 护栏的「范围缺口」**：
`verify-visual-golden.mjs` 里**已有**一条「不得裸 spawn('npx')」的判据，
但它的 `visualScripts` 列表**只列 `tests/visual/` 的 4 个脚本** ——
**覆盖不到 `tests/e2e/` 的探针**。即：判据存在，**范围不达**。

### 处置

- 三个探针改用既有的跨平台启动器 `startViteDevServer`（`tests/visual/dev-server.mjs`），
  并把「未就绪」的错误信息接上 `describeSpawnFailure`（否则只剩无法定位的超时）。
- 护栏**补范围**：`verify-runtime-qualification-workflow.mjs` 在「挂进 CI 的探针」这一清单上
  断言「**不得裸 `spawn('npx')`** 且**必须用 `startViteDevServer`**」，配双向 canary。

> **教训（第三条，与上两条并列）**：**判据的范围必须覆盖它想保护的对象。**
> 「已经有一条同型判据」不等于「这条判据管得到我」——
> 见到同型判据时，**先读它的扫描面**，别假定它覆盖了你的新文件。

## 4.63 复核（**负结果**）：两处「非默认入口 / 安全」候选疑虑被读实现否证（2026-10-01）

顺着 §4.59–§4.62 的「非默认入口」线索又查了两个候选，**两处都不成立** —— 记下来以免下次重复怀疑。

### 候选一：200% 缩放下的**浮动工具栏定位错位**（假设不成立）

**假设**：若缩放是 CSS `transform: scale()` / `zoom`，则 iframe 内的 `coordsAtPos()` 坐标与宿主叠加的
iframe 偏移会**不同尺度** → 选区工具栏 / 表格工具栏会错位。

**否证**：本项目的「200% Zoom」是**字号式** —— `tests/visual/visual-golden.mjs` 的 `zoom-200` 配置为
`fontSize: TYPOGRAPHY_FONT_SIZE * 2`（16 → 32px），**不是** CSS 变换。
故坐标**不做缩放**，不存在尺度错位；且 `tests/e2e/sidebar-resize-verify.mjs` 已覆盖 200% 下的
侧栏可见性 / 拖拽 / 临时过滤框（`200% zoom: resize drag still works` 等 3 条断言）。

### 候选二：图床上传的**凭据明文存储**（假设不成立）

**假设**：上传服务（Typora §55 / 清单 1.3）需要 token/密钥，可能明文存在 `localStorage`。

**否证**：读上传注入点（`App.tsx` 的 `__MELLOW_IMAGE_UPLOAD__`）—— 传给上传服务的只有
**两项非凭据配置**：`httpUrl`（默认 `http://127.0.0.1:36677/upload`，PicGo 式**本地端点**）
与 `command`（本地 CLI）。**没有任何 token / 密钥 / 密码**被读取或存储。
另：扩展的 `keychain` / `process` 权限在 **V1 一律拒绝**（`extensionHost.ts` 的 context 层门卫，
宿主不接线）→ 也不存在「扩展把密钥写到别处」的路径。

> **方法备注**：这两条都是**读实现即可否证**的 —— 比写测试便宜得多。
> **负结果同样值得落盘**：否则下一个接手的人会重新怀疑同一件事（本审计 §4.13 / §4.18 同例）。

## 4.64 状态词误用：`IMPL` 被用来表达「不能宣称 PASS-E」（2026-10-01）

### 怎么发现的

逐项复核未闭环 10 项的 `blockedBy` 时，`P0-PLATFORM-001` 的**状态与原因自相矛盾**：

- 状态 = **`IMPL`**；
- 而其记录**自己**早已写明「本项 requiredEvidence（macos-native / windows-ci / linux-ci /
  linux-ime-matrix）至此**已全部取得**」；
- 维持 `IMPL` 的理由写的是「PASS-E 全局策略额外要求 ux-gate，需人工计时会话后才能**宣称结论**」。

**「能否宣称 PASS-E」≠「本项是否实现」** —— 用 `IMPL`（= 未实现/未完成）表达前者属**状态词误用**：
它让读者以为还有实现工作，同时**掩盖**该条其实已达 `AUTO`。

### 处置：`IMPL` → `AUTO`（按规则，不是 judgement）

门禁 `verify-release-gate.mjs` 的闭环口径（**ADR-0024 Q1=A3**）：
**`AUTO` 且 `requiredEvidence` 不含 `ux-gate` ⇒ 视为已闭环** —— 因为 `AUTO` 的含义正是
「自动化测试通过、**真机体验验收未完成**」，与「本项证据齐备、仅差全局 ux-gate 策略」**完全对应**。

且 **requiredEvidence 不含 `ux-gate`** ⇒ 本项**不适用** ADR-0024 A3 的「含 ux-gate 的 AUTO 不得收口」限制。

**独立复核（实跑，非仅凭自述）**：派发 Runtime Qualification（run **36825957958**）→
**macOS / Windows / Linux 三平台全绿**（Linux IME 矩阵、Windows Source Fidelity + runtime smoke、
macOS launch + CLI open）⇒ 上列四项证据**确实取得**。

**故状态改为 `AUTO` 并移除 `blockedBy`**（已闭环项不得再挂「阻塞」）。
**这不改变任何结论**：门禁仍报 `PASS-E = 0/50`，且 `AUTO` **不等于**「真机体验验收已完成」——
全局人工 UX Gate 会话（`P0-QA-001`）仍是发布转正的前提。

### 逐项核对：为什么**只**改这一项

| 项 | `requiredEvidence` | 台账自述 | 判定 |
|---|---|---|---|
| **`P0-PLATFORM-001`** | 不含 `ux-gate` | 「requiredEvidence 至此**已全部取得**」 | **改 AUTO** ✓ |
| `P0-EDITOR-004` | **含 `ux-gate`** | —— | 不动（AUTO 也收不了口） |
| `P0-PERF-001` | 含 `windows-ci` / `linux-ci` | 仅 macOS 基准 | 不动（**证据未齐**；`AUTO` 会变成未挣得的闭环） |
| `P0-EDITOR-005` | 含 `windows-ci` / `linux-ci` | 「剩余仅为真机三平台证据」 | 不动（Rust 平台契约测试**没有 Windows job** ⇒ `windows-ci` 未取得） |
| `P0-LAYOUT-002` | 不含 `ux-gate` | 「requiredEvidence 已齐备」 | **不动** —— 它写的是 `BLOCKED`（= 被阻塞），而它**确实**被人工会话阻塞 ⇒ **词义正确**。与 `IMPL` 不同：`IMPL` 说「没做」，`BLOCKED` 说「做完了在等」——前者是事实错误，后者是事实正确 |

> **判据（本节的要点）**：**状态词是事实陈述，不是表达策略立场的工具。**
> 「能不能宣称 PASS-E」属**全局策略**，不应写进单项的状态词里；
> 单项状态只回答「**这一项**做到哪了」。

### 固化为护栏

`verify-release-gate.mjs` 新增：**`status === 'IMPL'` 的项，其 `blockedBy` 不得只有 `ux-gate-policy`**
—— `IMPL` 必须配一个**实现类**的阻塞原因。配双向 canary（`IMPL`+`ux-gate-policy` 必须被检出；
`AUTO`+`ux-gate-policy` 与 `IMPL`+实现类原因必须**不被**误判）。
**注入验证**：把 `P0-PLATFORM-001` 改回 `IMPL`+`ux-gate-policy` → 报错；基线通过。

## 4.65 治理缺口：**6 处「待裁决」长期没有 ADR 载体**（2026-10-01）

### 怎么发现的

顺着 §4.64（状态词误用）的同一条线复核「待裁决项是否都有载体」。
项目规则明确：**待裁决项必须有 ADR 载体**（AGENTS.md「决策变更」+ 门禁的 `PENDING_ADRS`）。
而实测：**本文档里有 6 处 `待裁决` 标记，门禁的 `Pending decisions:` 却是「无」**。

**根因是护栏只做了单向**：
- 已有：核对「**ADR → 门禁**」（已裁决的不得退回 Proposed）✓；
- 缺失：核对「**本文档的待裁决项 → 是否有 ADR**」✗。

> 与 §4.10 的教训同源：**两处各自维护同一件事的部分清单，谁都不负责核对全集。**
> 也与 §4.18/§4.19 同族：**「有规则」≠「有人守规则」**。

### 处置

1. **立 `ADR-0029`（Proposed）** 集中承载这 6 项（`settings.open` 的 Win/Linux 菜单入口 /
   安全验收是否入台账 / Apple 凭据是否硬失败 / 表格 `invalid` 提示 / 上传密钥 spec 表述 /
   `actual/*.png` 跟踪策略），并纳入门禁 `PENDING_ADRS` → `Pending decisions:` 随之可见。
2. **本文档新增「待裁决项登记表（唯一声明处）」**：10 行（含已处置的），
   每行含「出处 / 问题 / 处置 / **载体**」；载体要么指向存在的 ADR，要么写 `已处置`（附证据）。
3. **新增护栏**（`verify-release-gate.mjs`）：
   - 登记表**必须存在**；
   - 表中**每行的载体必须可解析**（指向存在的 `.md`，或 `已处置`）；
   - **双向**：`PENDING_ADRS` 的每个 ADR 都必须被登记表引用。
   **注入验证 3 例**：载体改成不存在的 `.md` → 报错；删掉「已处置」字样 → 报错；删掉登记表标题 → 报错。

### 顺带的一手复核：Q5（上传密钥）的**前提不成立**

ADR-0029 的 Q5 源于 `image-workflow-spec` §10 的「密钥」表述。**读实现后**：
上传注入点（`App.tsx` 的 `__MELLOW_IMAGE_UPLOAD__`）只传 **`httpUrl`**（默认
`http://127.0.0.1:36677/upload`，PicGo 式**本地端点**）与 **`command`**（本地 CLI）——
**不持有任何凭据**；扩展的 `keychain`/`process` 在 V1 **一律拒绝**。
故该裁决的**前提不成立**，已写进 ADR-0029 供裁决时据实重新表述。

### 顺带复核：Q1（`settings.open` 的 Win/Linux 菜单入口）**不是产品缺陷**

它**设计如此**（Win/Linux 走 `Ctrl+,` + 命令面板，且 `verify-menu-contract.mjs` §11 已锁住该键位），
问题在于**理由只写在代码注释里、未进 master-plan 的 D 表** —— 而项目自己的教训正是
「**护栏注释不是决策登记处**」。故它属 ADR-0029 的 Q1（D 还是缺口），**不是** bug。
**未擅自补菜单项**：Typora 的 Win/Linux 菜单结构**无法在本机核实**（只有 macOS 的 dump），
按「不得把推断写成真值」先取证再动。

> **护栏的范围限制（如实声明）**：新护栏**不能**自动发现「本文档新加了一个 `待裁决` 字样却没登记」
> —— 那需要理解自然语言。它只能保证**已登记的**部分自洽。要补上另一半，需给标记定
> 机器可读写法（如统一 `<!-- PENDING: id -->`），已记入 ADR-0029 的「范围限制」。

## 4.66 ADR-0029 裁决与落地 —— 含一次「本地假通过」（2026-10-01）

### 裁决（依据用户 2026-09-30 的长期授权；**证据不足者明确不判**）

| Q | 裁决 | 依据 |
|---|---|---|
| Q1 `settings.open` 的 Win/Linux 菜单入口 | **A3**：维持现状 + 理由从代码注释搬进 D 表 | **先做了取证尝试，三项独立检查全为负结果**（见下）⇒ **A1 缺一手证据**，不据此断言缺口 |
| Q2 安全验收是否入台账 | **B2**：不新增 | 台账是 **Typora parity 的 P0 项**集合，安全不在其能力维度内；改在验收文档单列 |
| Q3 Apple 凭据缺失是否硬失败 | **C2**：保持警告 + 现状护栏 | 本仓当前**无凭据**，改 `exit 1` 会阻断**每一次 pre-release 打包**（而 pre-release 是 ADR-0024 明确保留的通道） |
| Q4 表格 `invalid` 提示 | **未裁决（留在本 ADR）** | 需产品判断，且 Typora 对应行为**未核实** ⇒ 不判 |
| Q5 上传「密钥」的 spec 表述 | **E1**：改写为「不适用」+ **保留明文残余风险说明** | 一手复核（见下） |
| Q6 `actual/*.png` 跟踪策略 | **F1**：取消跟踪 | 实测成本（本会话四次噪声 diff、两次差点误提交） |

**Q1 的取证尝试（三项独立检查，全为负结果）**：

| 检查 | 结果 |
|---|---|
| `Base.lproj/MainMenu.nib` | **存在**（70KB）→ macOS 菜单是**原生 NIB**，不是 JS 模板 |
| `TypeMark/appsrc/main.js` 里 `darwin`/`win32`/`process.platform` | **0 次** → 渲染层没有平台分支的菜单定义 |
| `zh-Hans.lproj/Menu.strings` 是否有 `Preferences` | **有**（`"Preferences" = "偏好设置"`）→ 只证标签存在，**不指示平台位置** |

⇒ **Typora 的 Win/Linux 菜单结构在本机不可得**。故 A1（补菜单项）**缺一手证据**，按「不得把推断写成真值」**不判为缺口**。

**Q5 的一手复核 + 一处自我更正**：上传注入点只传 `httpUrl`（PicGo 式本地端点）+ `command`，
**没有「密钥」字段** ⇒ E2（keychain）无落点。**但**我起草时的措辞「前提不成立」**过于绝对** ——
spec 的复核笔记已指出**真实残余风险**：`image.uploadHttpUrl` 是**明文 localStorage 文本字段**，
用户可能把**带凭据的 URL** 粘进去。**本仓不「持有」密钥，但会「代为保存」用户自己粘进来的密钥。**
⇒ E1 的改写**必须连同该风险说明一起保留**（已在 ADR 与 spec 中更正）。

### 落地

- `image-workflow-spec` §10 的 `Upload key: OS keychain` → **`不适用（本仓无密钥通道）`** + 保留风险说明 + 裁决依据。
- `tests/visual/actual/` **取消 git 跟踪**（`.gitignore` + `git rm --cached` 17 个 PNG）+ README 同步。
- 门禁 `Pending decisions:` 回到「无」；**文案改为从 `DECIDED_ADRS` 派生**（原先硬编码名单，新增 ADR 后会静默过期）。

### ⚠️ 一次「本地假通过」（CI 抓出）—— 值得单记

取消跟踪后，**本地 `npm run parity` 全绿**，而 **CI 红**：`verify-sidebar-contract.mjs` 也断言那 4 个
sidebar PNG **文件存在**（我只改了 `verify-visual-golden.mjs` 那一处）。

**根因**：**本地磁盘上文件仍在**（取消跟踪 ≠ 删除）⇒ 判据**假通过**；CI 是**干净检出** ⇒ 真不存在 ⇒ 红。

**修**：第二处判据同样改为「**采集脚本会写出该路径**」（静态可判）。
**验证方式也随之更正**：把 `tests/visual/actual/` **临时移开**（模拟干净检出）再跑 parity → 通过 ✓。

> **教训（两条）**：
> ① **凡改动涉及「取消跟踪 / 加 .gitignore / 改产物落点」，验证必须模拟干净检出** ——
>    否则本地残留会让判据**必然假通过**。
> ② **改这类判据前先把同类判据枚举全**（`grep` 该路径的全部引用）——
>    本次只改了「自己记得的那一处」，漏了另一处。

## 4.67 「唯一可发现处」里查无此行：`D-AB` 是一条渲染时不可见的 D 条目（2026-10-01）

### 怎么发现的：做 A3 的落地时**先回查 D 表**，而不是采信自述

任务本身是 ADR-0029 **Q1 = A3** 的收尾 —— 把 `settings.open` 在 Win/Linux 无菜单入口的理由「搬进 D 表」。
动手前先按既定纪律「**不采信 docs 自述，回查真值源**」去读 master-plan §12，结果：

**A3 的三步早已由 `D-AF` 于 2026-09-30 完成** —— 该行写的就是「不新增菜单项；Win/Linux 经键盘 `Ctrl+,`
与命令面板触达，登记 D」，并已注明「⚠️ **本机无一级证据**……**未经实机验证**」。
⇒ **不新建编号**（重复登记会制造与 **D-E / D-Q** 同型的二义 —— 那份二义本仓已收敛过一次）。

### 回查时抓到的真缺陷：`D-AB` 被引用、却不在表里

| | 内容 |
|---|---|
| 引用处 | §5.1 `G7-MENU-07`「…登记 **D-AB**」；§15.2「07 余项按 D-AA / D-AB 登记」 |
| 表内 | **无 `D-AB` 行** —— 全文搜索只命中这两处 + §13 变更记录 |
| 根因 | D-AB 行**丢失了前 3 格**（`#` / 决策点 / 裁决），残余的「依据」格**被并进了 D-AC 行** |
| 后果 ① | **渲染时整条不可见** —— GFM 丢弃超出表宽的第 5 格（D-AC 行实测 = 5 格） |
| 后果 ② | §12 自称「**唯一可发现处**」，而条目**实际不在**其中 ⇒ 与 D-AC 记下的教训**同型** |
| 引入时间 | 2026-09-13「补登记 D-AB」那次编辑（`git blame` 把该行定位到当时的 D-AC 行） |

### 处置（同批）

1. **补全 `D-AB` 行为 4 格**（`#` / 决策点 / 裁决 / 依据）—— 内容取自它自己的「依据」格 + §5.1 的 ① / ② 上下文；
2. **`D-AC` 行恢复 4 格**（把误并入的第 5 格移回 D-AB）；
3. **`D-AF` 行补上 ADR-0029 的互相指认**（两侧都能发现对方）；
4. 顺带修掉 D-AB / `G7-MENU-07` 里**已漂移的行号引用**：`settings/src/index.ts:182-193`
   —— 该处现为 `markdown.html` 等引擎开关，`image.assetDir` / `image.uploadService` 实际在 **235 / 238-244** 行。
   按 §4.11 的既定处置改为**符号引用**（不写行号）；
5. §15.2 的护栏数字 `17` → **`18`**（实测值）。

### 两条新护栏

**① `verify-release-gate.mjs`：D 表必须自洽**

- **凡在 master-plan / 本审计文档 / ADR 里出现的 **D 编号**，必须在 master-plan 中有**声明行**
  （表格**首格**形如 `| **D-A`…，D-N / D-O / D-P 声明在 §5.4，故扫全文而非只扫 §12）；
- **D 表行必须恰好 4 格**（直接锁住本次的破损形态 —— 5 格 ⇒ 第 5 格在渲染时被静默丢弃）；
- **覆盖下限**（防表被削空）+ **canary**（正/负样本 + 「被引用但无声明」必须被检出）；
- **显式例外表**：确实要「提到某个不存在的编号」时（例如记下「经复核**不**新建某编号」这个决定），
  必须在 `D_TABLE_NOT_DECLARED` 里登记**理由**；例外表**双向**校验（条目必须仍被引用、且不得同时又有了声明行）。
- **范围限制（如实声明）**：只覆盖**可静态判定**的这一半 —— 「编号被引用但表里没有」。
  另一半（「审计里新出现一个『待裁决』标记但没登记」）**仍需理解自然语言**，不在本护栏内（同 ADR-0029 的声明）。

**② `verify-doc-code-refs.mjs`：新增「路径后缀唯一匹配」**

文档里大量把路径写成 `settings/src/index.ts`（**省掉 `packages/` 前缀**），而 `index.ts` 同名不唯一
⇒ 旧护栏把它归入「**未判定**」**静默跳过** —— 于是上面那处漂移**在护栏眼里根本不存在**。
新增：basename 不唯一时，按**路径后缀**再匹配一次，**唯一命中才判定**（仍不唯一则继续计入「未判定」）。
**全仓实测**：该改动只新暴露 **1 处**失败 —— 正是上面这处（其余引用均对得上）。

### 教训

> **「登记表声称自己是唯一可发现处」≠「条目真的在表里」。**
> 这与 ADR-0029 记的「护栏只做单向」**同源**：**凡自称自洽的登记处，必须有一条机器可读的核对**。
> 而**回查真值源**（而不是采信文档自述）是发现这类问题**唯一**的入口 ——
> 本次两次发现（「A3 早已落地」「D-AB 根本不在表里」）**都是「先回查」的直接产物**，
> 且两次都发生在**动手写之前**。

## 4.68 发布收口是一道**人工作业**，而它没有机器记录 —— 12 个 tag 里漏了 6 个（2026-10-01）

### 怎么发现的

§4.67 结尾我留了两条「只报告未动手」的观察，其中一条是：
「`release.yml` 的 finalize 步骤设了 `prerelease=true` 但**没有 `draft=false`** ⇒ 每次发版后仍需手动
`gh release edit --draft=false`」。

本轮先取证 —— 结论**推翻了我自己的归因**：

- 那一步**不是遗漏，是有意的人工门禁**：workflow 头部注释原文写着
  「此后**仅需人工执行** `gh release edit vX --draft=false` 即可发布」。
- 但代价已经显形：**12 个 tag 里有 6 个从未解除 Draft**
  （`v1.5.6` / `v1.5.7` / `v1.5.8` / `v1.5.11` / `v1.5.12` / `v1.5.13`）。

### 更糟的一半：那 6 个里有一个是**不完整构建**

对每个 Draft 逐个查 `assets`：

| tag | draft | prerelease | assets |
|---|---|---|---|
| v1.5.6 / v1.5.7 / v1.5.8 / v1.5.11 / v1.5.13 | true | true | **15** |
| **v1.5.12** | true | true | **12** |

⇒ **「人工扫一眼资产表」这道门禁，既漏了发布、又漏了一个不完整构建** —— 两个方向**都**没有机器兜住。
（`v1.5.12` 缺的是 `.dmg`，即 macOS 那一路没传全。）

### 为什么不能简单删掉这道门禁

因为它的**目的**是对的：**解除 Draft 之前必须确认三平台制品齐全**（`v1.5.12` 就是反例）。
问题不在门禁，而在**它没有任何机器记录** —— 靠人记的步骤会以**可测量**的频率被漏掉（本例 6/12 = **50%**）。

### 修法：把「人眼扫资产表」**机器化**，然后自动发布

`release.yml` 的 finalize 改为三步：

1. **先填 body + 标 `prerelease=true`，并显式保持 `draft=true`** —— 失败安全：
   即使②的断言失败，发布也停在「未公开」状态；
2. **资产断言**：关键制品（`.dmg` / `.msi` / `x64-setup.exe` / `.AppImage` / `.deb` / `.rpm` / `latest.json`）
   逐个必须在，且总数 **≥ 15**；任一不满足 → `::error::` + `exit 1`（**保持 Draft**）；
3. 断言通过才 `draft=false` + `prerelease=true`，并在收尾 `test` 断言「已不是 Draft」。

`prerelease=true` 保持 **ADR-0020 / ADR-0024 Q2=B1** 语义（不宣称正式发布、`releases/latest` 不动）。

> **⚠️ 2026-10-05 更正（本节的发布状态描述已过期）**：**ADR-0031**（Accepted，用户裁决：
> 忽略真机 Gate 回填，正式发布）**取代 ADR-0024 Q2=B1** ⇒ finalize 现为
> `prerelease=false` + `make_latest=true`（**正式发布**，`releases/latest` 指向本版本）。
> 本节其余内容（「人工门禁没有机器记录 ⇒ 6/12 漏检」「资产断言」「先断言后发布」）**仍然成立** ——
> 它们与发布状态正交。发布收口护栏的判据已随之更新（锁 `prerelease=false` + `make_latest=true`），
> 且新增「**README 状态行 ⇄ 流水线 `prerelease=`**」双向锁。

### 验证（两层，缺一不可）

**① 静态护栏**（`verify-release-gate.mjs` 新增 §④b）：锁「finalize 里**必须存在**这些机器判据」——
`-F draft=false` / `-F prerelease=true` / 关键制品断言 / 数量下限 / **顺序（先断言、后发布）** /
收尾 isDraft 断言 / ≥2 处 `::error::`。**注入验证 6/6**：
抹掉 `draft=false` / 抹掉 `prerelease` / 抹掉制品断言 / **把发布挪到断言之前** / 抹掉数量下限 / 无变异对照。

**② 对真实数据试跑**（否则只是「写进 YAML 就算接上了」）：把 finalize 里那段 shell 断言**原样抽出**，
对**已有** release **只读**跑一遍：

```
v1.5.12 -> 拒绝发布：缺少关键制品: \.dmg$（保持 Draft）
v1.5.6 / v1.5.7 / v1.5.8 / v1.5.11 / v1.5.13 -> 允许发布：15 个制品，三平台关键制品齐全
v1.5.21 -> 允许发布：15 个制品，三平台关键制品齐全
```

⇒ 断言**真的**拦住了 `v1.5.12`，而不是「看起来能拦」。

### 施工中我自己踩到的两个坑（都值得单记）

**① 我第一版把 `-F draft=true` 写进了步骤①** —— 本意是「失败安全」，实际后果相反：
**重跑 finalize 会把已发布的 release 降级回 Draft**（一次失败的重跑就能把线上发布撤下来）。
⇒ 改为「**不动 draft 字段**」：新 tag 时它本来就是 draft（失败安全），已发布时也不会被降级；
并加护栏**禁止回归**（`finalize` 里出现 `-F draft=true` 即失败）。

> **教训**：「失败安全」不能靠**主动设置**一个状态来实现 —— 那是**状态变更**，
> 而状态变更在**重跑**时会作用在**已经成功**的对象上。正确做法是**不做那件事**（这里：不动该字段）。

**② 护栏首跑被我自己的注释打红**：我在注释里写了「**不要**在这里写 `-F draft=true`」，
而判据 `/-F draft=true/` **没有剥注释** ⇒ 命中那句**说明**。
⇒ 按本仓既有处置**先剥注释**（`stripComments`），并加**双向 canary**：
「注释里的字样**不算**」+「真实违规**必须**仍被检出」（后者防「剥注释把判据架空」）。

> **教训**：这是本仓第 N 次踩「注释被计入」。**凡新增按字面匹配的判据，先问「我自己的说明会不会命中它」。**

### 遗留（**只报告，未动手**）

6 个历史 Draft 仍在（上表）。其中 `v1.5.12` **制品不齐**（缺 `.dmg`），**不宜补发布**；
其余 5 个制品齐全但均已被后续版本取代。删除属**远端破坏性操作**，本环境**不擅自执行**；
如需清理：`gh release delete v1.5.6 --yes`（`--yes` 之外不加 `--cleanup-tag`，保留 tag 作为历史）。

### 教训

> **一道人工门禁若没有机器记录，它的漏检率是「可测量」的**（本例 50%）。
> 正确的修法不是「删掉门禁」，而是**把它要人做的那件事写成断言** ——
> 人做判断、机器做核对；**只要还能靠「记得」，它就一定会被忘掉。**
>
> 附带一条方法论：这也纠正了我上一轮的归因 —— 我当时写成「workflow 缺一步」，
> 实际是「**一步有意的人工门禁从未被可靠执行**」。**同一现象、两种归因，修法完全不同**：
> 前者加个 `draft=false` 就收工（**然后丢掉 `v1.5.12` 那层保护**），后者才会**先把判据机器化**。

## 4.69 `desktop-ui-design-spec` 逐节审计：**5 处与已定真值矛盾**，其中 §4 是「整节不可满足」（2026-10-01）

### 动因：先量一下「审计覆盖率」这句话的口径

§4.43 的标题写着「**最后一份未审计 spec**」。本轮先**量**它：
按「审计文档里出现过该 spec 名」统计，10 份 spec **全部**出现过 —— 但**逐节**看：

| spec | 节数 | 审计实际覆盖 |
|---|---|---|
| `desktop-ui-design-spec` | **20** | 仅 **§19**（no color-only status，即 §4.19） |
| `ime-test-plan` | 8 | 仅 **§5 / §8**（即 §4.18） |

⇒ 「最后一份未审计 spec」是**按「碰过没有」**说的，**不是「逐节审过」**。
本节把 `desktop-ui-design-spec` 逐节过一遍。

### 结论：5 处矛盾（spec 是**权威层**，优先级高于 ADR / plan）

| # | 节 | spec 声明 | 实现 | 性质 |
|---|---|---|---|---|
| 1 | **§4 Tabs** | Tab 高度 32–36px / 六种状态 / 单文件自动隐藏 / `Cmd+T` | **仓库内不存在任何 Tab UI** | **整节不可满足**（SDI），**从未登记** |
| 2 | §5 Sidebar | default **260** / min **200** | **270 / 160**（Typora 真值） | 数字失真（护栏已改，spec 未同步） |
| 3 | §8 Editor | writing width default **820** | **860** | 数字失真 |
| 4 | §8 Editor | line-height **1.65** | **1.6** | 数字失真 |
| 5 | §3 Window | macOS **1180 × 780** | 三平台统一 **1200 × 800** | **未实现的建议值**（**非**有意差异） |

**已核对为「一致」的**（记下来，避免下轮重复查）：§2（`activity-bar` / `ribbon` / `right-inspector` /
`ai-panel` / `segmented` 在 `styles.css` **命中均为 0** ⇒ 确无常驻面板）、§6（`F2` 重命名在
`App.tsx` 的树级 keydown、键盘导航有 `sidebar-keyboard.test.ts`、拖拽 `draggable`/`onDragStart`、
右键 `onContextMenu` 全线透传；`trash` 走右键 = D-AH）、§7（`OutlineList` 的 `flat`/`collapsed`/
`onJump`/`highlightNonce`）、§8 的 `56px` / `≥30vh`（有护栏）、§10 高度 24px（落在 22–26）、
**§12 设置分组 10 节逐字一致**、**§13 的 `New Window` 已实现**（`file.newWindow`）、
**§17 三条空态文案逐字一致**、§19（已由 `verify-no-color-only-status.mjs` 锁）。

### 最重的一处：§4 是「权威层里一整节不可满足」

`packages/desktop-ui/src/` **无任何 Tab 组件**，`apps/desktop/src/styles.css` 里
`.tab*` / `tab-bar` 规则**命中 0 条** ⇒ §4 的 Tab 高度 / 状态 / 单文件自动隐藏 / `Cmd+T` **均无实现对象**。

SDI 是已确认的产品决策（B1），「New Tab 与 Switch Between Opened Documents」也早已登记为 **D-D / D-Y** ——
**但那两行讲的是「快捷键与菜单」，没有一行讲「spec §4 这一整节」**。
⇒ 属「**权威 spec 里有一整节不可能满足，而没人发现**」，与 §4.67 的 `D-AB` **同源**（登记处与事实脱节）。

**处置**：§4 标为**作废（保留原文，不删除）**，并在 spec 内注明依据指向 **D-Y**（已扩登记）。
**唯一仍然有效**的是「Windows/Linux 不得抢占 `Ctrl+T`（Typora Table）」——
它由 `verify-menu-contract.mjs` **§11 官方快捷键表**锁住（`insert.table` 的 winLinux 必须是 `Ctrl+T`），
**与 Tab UI 无关**。

### 根因：那次「单一真源」修复**漏了第四处**

§5 / §8 的数字失真不是「各自写错」，而是**同一件事的第四个副本没被一起改**：
`TYPOGRAPHY_DEFAULTS`（`packages/settings/src/index.ts`）的注释**自己就记着**这段历史 ——
「同一组默认值散落**三处**且互相矛盾：settings / App 回落 / Reader CSS ❌」——
那次修复把三处统一了，**spec 这「第四处」被漏掉**。
§5 同理：`verify-sidebar-contract.mjs` 里有「2026-09-13 由 260 更正」的注释 —— **护栏改了、spec 没改**。

> **教训：修「多处副本不一致」时，`grep` 的扫描面必须包含 `docs/`。**
> 否则「权威层」恰恰是最容易被漏掉的那一份 —— 而它**优先级最高**。

### 固化为护栏（`verify-shell-typography.mjs` 新增一节）

**从单一真源读数值 → 断言 spec 的声明行与之相等**（**不是**从 spec 取值再断言它等于自己 —— 那是恒真）。
覆盖 §3 初始宽度 / §5 default+min / §8 writing width + line-height。
**注入验证 8/8**：改 spec 任一处 / **改代码单一真源而 spec 未改** / 删掉声明行（锚点漂移）/ 无变异对照。

- **只认「列表项」形态**（行首 `- `）⇒ spec 里用 `>` 引用块写的**更正说明**不会自我命中
  （§4.68 刚踩过「护栏检出自己的注释」，这次在设计时就避开了）。
- **范围限制（如实声明）**：只覆盖**能解析出单一数值**的硬数字。§4（整节作废）与
  §10（默认可见字段集，已由 `packages/desktop-ui/test/statusbar-defaults.test.ts` 锁住）**不在**本条内。
- §3 的 macOS `1180 × 780` **不纳入判据** —— 它未实现，已在 spec 内如实标注；
  断言它等于真值会造出一个**必然失败的门禁**（**假门禁的另一种形态**：让门禁永远红着，人就会学会忽略它）。

### 教训

> **「权威层」不会自动保持正确** —— 它只是**优先级最高**，不是**被核对过**。
> 越是「大家默认它是对的」的那份文档，越容易成为**最后一个被同步的副本**。

### 附带：本轮又踩了一次 BSD `grep` 的 `\|`

查 §6 时用 `grep -E`/BRE 交替语法搜 `'F2'|"F2"|ArrowUp`，**静默无命中**，
差点得出「F2 未实现」的错误结论 —— 实际 `App.tsx:3415` 就有 `event.key === 'F2'`。
**本会话第三次**踩同一个坑（BSD grep 不支持 BRE 的 `\|`）。⇒ 一律改用 Grep 工具或 `node` 扫描。

## 4.70 `ime-test-plan` 逐节审计：§2 / §3 的验证矩阵**没有载体**（2026-10-01）

### 为什么审它

§4.69 结尾记了一句：`ime-test-plan` **8 节只审过 §5 / §8**。本节把剩下 6 节（§1–§4、§6、§7）过一遍。

### 逐节结论

| 节 | 声明 | 载体 | 判定 |
|---|---|---|---|
| §1 目的 | 「中文 IME 是 V1 Release Gate」 | 台账 **`P0-EDITOR-004`**（capability = **IME 与 Undo / Redo**），`requiredEvidence` **含 `ux-gate`** ⇒ 不得以 AUTO 收口 | ✅ **有载体**（当前确实计入未闭环） |
| §2 平台 | 6 个输入法（Win 2 / mac 2 / Linux 2） | 见下表 | ⚠️ **矩阵无载体** |
| §3 基础输入 | 8 类 | 见下 | ⚠️ **6 类零覆盖** |
| §4 Node Matrix | 21 个节点 | Linux 矩阵 8 场景 | 🟡 **8 / 21**；且覆盖清单此前**只在源码里** |
| §6 组合事件日志 | debug **可**记录；release 不收集文本 | `composition.ts` 存在；**无**专门日志设施 | ✅ 平凡成立，但**隐私条款无护栏** |
| §7 Automated + Manual | 「IME 不允许只靠自动化」 | `ux-gate-recorder` 的 `caretImeUndo`（15 分）+ 强制 `imeCorruption === false` | ✅ **有载体**；但**任务清单不含输入法** |
| §8 Gate | 4 条禁令 ⇒ 禁止发布 | 由 `P0-EDITOR-004` 的证据覆盖 | ✅ |

### §2：6 个输入法，只有 1 个在 CI 内常态覆盖

| 平台 | 输入法 | 载体 | 在流水线里跑吗 |
|---|---|---|---|
| Windows | Microsoft Pinyin | **无** | — |
| Windows | Sogou Pinyin | **无** | — |
| macOS | 系统简体拼音 | `tests/benchmark/ime-matrix.mjs` | **否**（本地工具，需 System Events 权限） |
| macOS | 五笔 Wubi | **无** | — |
| Linux | fcitx5 | `tests/benchmark/ime-matrix-linux.mjs` | **是**（每次发版） |
| Linux | ibus | runner **支持** `--im=ibus`，**从未跑过** | 否 |

⇒ **4 个输入法零覆盖**。

### §3：8 类基础输入，自动化只覆盖 2 类

- **已覆盖**：`continuous sentence` / `candidate selection`（矩阵按「四音节 → 逐音节空格提交候选 1」施加）。
- **零覆盖 6 类**：`punctuation` / `mixed Chinese/English` / `emoji` / **`backspace during composition`** /
  **`arrow during composition`** / **`cancel composition`**。
- ⚠️ 后 3 类（组合中退格 / 方向键 / 取消组合）恰是 **IME 缺陷高发路径**。

### 真正的缺口：§2 / §3 的验证范围**只写在 spec 里**

两处载体都不枚举它：

- **自动化**：Linux 矩阵的 8 个场景是 **§4 的「节点」维度**，**不是 §3 的「基础输入」维度**；
- **人工**：`ux-gate-recorder` 的 **30 个任务里没有任何一项提到输入法**（最接近的是
  「Focus Mode / Typewriter Mode 连续写作」），它只提供 `caretImeUndo` 的**评分**与一个 `imeCorruption` 布尔字段。

⇒ 「**用什么输入法、测哪几类基础输入**」这件事**只写在散文里** ——
与 ADR-0029 Q1（`settings.open` 的理由只写在代码注释里）**同型**。

### 处置（本次做了什么 / 明确没做什么）

**做了**：

1. spec §1–§7 逐节补上**如实的覆盖实测**（含上面两张表），使权威层不再暗示不存在的覆盖；
2. **把「矩阵覆盖了 §4 的哪 8 个节点」变成机器可读**（spec §4 一行 + 护栏双向锁）——
   此前它只存在于矩阵源码的 `SCENARIOS`，而**同一件事的第三个副本**还在 RQ 的注释里（「8 场景 IME 矩阵」）；
3. 新护栏（`verify-runtime-qualification-workflow.mjs`）：**spec 的覆盖清单 ⇄ 矩阵 `SCENARIOS` ⇄ RQ 注释的场景数，三处双向一致**。
   **注入验证 7/7**（矩阵增删场景 / spec 多声明 / spec 漏声明 / RQ 数字漂移 / 锚点消失 / 无变异对照）。

**没做（明确登记为缺口，不假装已做）**：

- **未**给 §3 的 6 类基础输入补自动化场景。理由：它们要跑在 `mellow-linux-ime` 容器 / GitHub runner 上，
  本机（macOS）**无法验证**；而「写进 YAML 就算接上了」正是本仓反复踩过的坑（`probe-to-gate-hygiene` §0）。
  正确做法是**单独一轮**：加场景 → **派发实跑** RQ → 逐场景读日志确认。
- **未**扩张人工 Gate 的任务清单（加输入法项会改变人工会话的负担）—— 属**产品 / 流程裁决**，需单独决定。

### 教训

> **「覆盖了没有」必须有载体，不能只在 spec 里声称。**
> 本次两处缺口都不是「实现错了」，而是**验证范围没有落到任何可执行 / 可记录的载体上** ——
> 于是它会一直「看起来有要求」，直到有人真的去数。
>
> 附带纠正一个**我差点写错的结论**：我一度以为「§7 不允许只靠自动化」没有载体
> （`P0-PLATFORM-001` 的 `requiredEvidence` 确实不含 `ux-gate`），回查后发现**真正的 IME 条目是
> `P0-EDITOR-004`**，它含 `ux-gate` ⇒ **有载体**。
> **「同一主题可能有多个台账条目，别只看第一个命中的」。**

## 4.71 `runtime-qualification-plan` 逐节审计：§6 是一条**从未满足过的门禁**（2026-10-01）

### 为什么审它

§4.70 记下「还有 3 份 spec 未逐节」。本节审 `runtime-qualification-plan`（9 节）——
其中 **§4 / §5 / §9 已在 2026-10-01 审过**（带差集表与逐项对账），故本轮补 **§1 / §2 / §3 / §6 / §7 / §8**。

### 最重的一处：§6「全部满足」与 ADR-0019 的实际决策依据**不一致**

§6「Tauri Pass Conditions」写的是「**全部满足**」才锁定 Tauri，列了 9 条
（IME corruption = 0 / no blocking caret bug / no selection loss / clipboard P0 complete /
PDF·print viable / 10 MB editable / typing P95 target met / Linux P0 journeys pass /
no platform requires editor fork）。

而 **`ADR-0019`**（Accepted，取代 ADR-0002）的**背景原文**是：

> **真机体验矩阵（IME / Caret / Clipboard / Print / 10MB）在决策时点未取得完整实测数据**
> （Windows / Linux 无真机环境，macOS 无 GUI 会话）。
> 决策依据 = 架构证据（构建全绿、平台解耦证明、逻辑层 254 测试）+ 已知技术事实比较。
> **无任何 FAIL 记录。**

⇒ **ADR-0019 是在 §6 的条件未满足时锁定 Tauri 的**，依据是「架构证据 + 无 FAIL」。
**注意优先级**（`AGENTS.md`）：spec 是 **P1**、ADR 是 **P2** ⇒ **按 §6，Tauri 本不该被锁定**。
而 §6 **从未更新** —— 权威层与判决层长期不一致，且**无人发现**（同 §4.70 的形态）。

### 今天的逐条状态（实跑门禁）

| 条件 | 载体 | 状态 |
|---|---|---|
| IME corruption = 0 | `P0-EDITOR-004` | **未闭环**（`MAC`） |
| no blocking caret bug / no selection loss | `P0-EDITOR-003` | **未闭环**（`AUTO` 但 `requiredEvidence` 含 `ux-gate`） |
| clipboard P0 complete | `P0-CLIPBOARD-001` | ✅ 闭环 |
| PDF/print viable | `P0-EXPORT-001` | ✅ 闭环 |
| 10 MB editable / typing P95 target met | `P0-PERF-001` | **未闭环**（`MAC`） |
| Linux P0 journeys pass | `P0-PLATFORM-001` | ✅ 闭环 |
| no platform requires editor fork | `verify-adapter-contract.mjs` | ✅ 护栏常态守护 |

⇒ **§6 的「全部满足」至今仍未达成**（4 条未闭环）—— 与全仓 `PASS-E = 0/50` 一致。
**但这不推翻 Tauri 锁定**：锁定依据是 ADR-0019 的架构证据路径，§6 只是「**当时写的、从未满足的门禁**」。

**处置**：保留原文 + **逐条挂载体** + 更正块。
**不**把它改成「已满足」（那是假的），**也不**删除（它记录了当时的判据）。
**收窄 / 重写 §6 属方案级裁决**（需**新增 ADR**，并同步 ADR-0022 后果节与 ledger 的 `requiredEvidence`）——
按 `AGENTS.md`「冲突处理」，**文档层不擅自改**。

### 其余各节

| 节 | 判定 |
|---|---|
| §1 目的 | ✅ 问题已回答（ADR-0019 锁定 Tauri）；已注明与 §6 的不一致 |
| §2 候选 | ✅ A 已锁定；B（Electron）作为**预案**保留，由 `AGENTS.md` 架构细则 + `verify-adapter-contract.mjs` 守护 |
| §3 测试原型 | 🟡 **V0.0 阶段要求，已完成、不再有效**（已注明「不要当当前约束」） |
| §7 Fail Conditions | ⚠️ **6 条无一触发，但「无记录」≠「已排除」**：其中 4 条**根本没有观测机制**；Linux IME 曾**连续失败 4 次**（根因在 harness 侧，已修 ⇒ 8/8）。已注明它是**决策时点判据，不是持续门禁** |
| §8 Decision Deadline | ⚠️ **时序上合规，但无法被机器核对** —— 「V0.0 结束」「V0.1 完整 UI 开发开始」**没有定义处**（台账无 milestone 字段、无标签、无登记），**ADR-0019 自身也没有日期**（只有 `Status: Accepted`） |

### 固化为护栏（`verify-runtime-qualification-workflow.mjs` 新增一节）

**§6 的每条 pass condition 必须挂可解析的载体**：`` （`<台账 id>`） `` 或 `` （护栏：`<路径>`） ``；
台账 id 必须在台账里存在、护栏路径必须在仓库里存在。
**注入验证 6/6**（去载体 / 假 id / 假护栏路径 / 低于下限 / 锚点消失 / 无变异对照）。

> **范围限制（如实声明）**：它锁的是「**条件挂得上载体**」，**不是**「载体所报的状态为真」——
> 后者由台账与 `verify-release-gate.mjs` 负责。两条判据分工不同，别混读。

### 教训

> **一条写在 spec 里、却从未被满足的门禁，比没有门禁更危险** —— 因为它**看起来**已经把关过了。
> 发现它的唯一入口仍是**逐条挂载体**：**挂不上的那一条，就是没人管的那一条**。

## 4.72 `clipboard-smart-paste-spec` 逐节审计：§3 的优先级与实现**顺序相反**（2026-10-05）

### 为什么审它

§4.70 记下「还有 3 份 spec 未逐节」。`clipboard-smart-paste-spec`（10 节）此前**只审过 §10 安全**（§4.32），
本节把 §1–§9 过一遍。

### 最重的一处：§3「Paste Priority」的 **2 与 3/4 分处两个处理器**，而注册顺序与声明相反

§3 声明 6 级优先级：`1 Paste Plain → 2 image/file payload → 3 TSV → 4 HTML → 5 URL-on-selection → 6 plain`。

**实现是分散的**：

| 优先级 | 位置 | 形态 |
|---|---|---|
| 1 | `smartPaste.ts` 的 `Mod-Shift-v` → `pastePlain()` | 键位命令 |
| **2** | **`image/input.ts`**（`paste` handler：`items` 的 `image/*` + `data.files`） | **独立扩展** |
| 3 / 4 / 5 | `smartPaste.ts` 的 `handleSmartPaste()`（**链内顺序正确**） | 同一个处理器 |

**冲突点**：CM 的 `eventHandlers.paste` 按**扩展注册顺序**调用、**首个返回 `true` 者胜**。
而 `packages/editor-engine/src/index.ts` 里 `buildSmartPasteExtension()`（**行 272**）
**先于** `buildImageExtensions()`（**行 279**）⇒ **优先级 2 排在 3/4 之后**。
⇒ 剪贴板**同时**含富文本与图片时（典型：从浏览器「复制图片」，带 `text/html` 的 `<img>` + 图片数据），
HTML 分支先命中 ⇒ 图片被转成远程 `![](src)`，**不走**「复制到资源目录 / 上传」的图片管线。

**为什么长期没被发现**：`smart-paste.test.ts` 的「P5.3 Clipboard — paste priority 链」**只覆盖链内**
（已钉住 **3 > 4**、**4 > 5**、无选区 URL 不误建链接）——
**没有任何测试覆盖「两个处理器之间」的顺序**，而这一层的胜负**完全由注册顺序决定**。

**处置（本环境不擅自改行为）**：按 `AGENTS.md`「如果实现与 Spec 冲突：**不要自行修改架构，先报告冲突**」，
本轮**只记录 + 立载体**，**不**调整注册顺序、**不**改 §3 口径。
已立 **`ADR-0030`（Proposed）** 承载裁决，并登记进「待裁决项登记表」（第 11 行）+ 门禁 `PENDING_ADRS`。
裁决前需**一手证据**：真实剪贴板在「从浏览器复制图片 / 从 Word 复制图文 / 从 Finder 复制图片」时
到底带哪些 MIME —— **只有 `text/html` 与图片数据同时存在时**本冲突才实际发生（影响面待实测）。

### 其余各节（均**正向确认**）

| 节 | 判定 |
|---|---|
| §1 目标 | ✅（本节为原则性陈述） |
| §2 Copy | ✅ 5 个用户命令**全部存在**（`edit.copyMarkdown` / `copyPlain` / `copyHtmlSource` / `copyWithoutTheme` + 原生 `copy`）；**RTF 确实实现**（`clipboardCopy.ts` 写 `text/rtf`） |
| §4 HTML → Markdown | ✅ 7 项「必须」全实现；**「sanitize before conversion」成立** —— `htmlToMarkdown()` 第一步就是 `sanitizeHtml()`，之后**重新 parse**（两阶段，不是就地改 DOM） |
| §5 URL on Selection | ✅ `linkedTargetRange()` 命中标签区间时**只替换 target**；无选区**不**误建链接（有测试） |
| §6 TSV → Table | ✅ 且**比本节更严** —— 要求**完全矩形**（不一致的行数**拒绝转换**而非猜）；Undo = **一次** transaction（`pasteText` 单次 dispatch） |
| §7 Paste Plain | ✅ rich formats 在**类型层面**不可达（`pastePlain` 只收纯文本，不接触 `DataTransfer`） |
| §8 Cross-app Matrix | ⚠️ **7 个应用只自动化 1 个**（TextEdit）；人工矩阵模板 `clipboard-copy-cross-app.md` **7 行 × 6 列全部「未测」** ⇒ **载体存在但为空** |
| §9 IME / Clipboard | ✅ `isComposing(view)` 首句守卫；测试还钉住「**compositionend 后同一格式生效**」（证明是时序行为而非永久失效） |
| §10 Security | ✅（§4.32 已审，本轮复核仍成立） |

### 固化为护栏（**新增** `tests/parity/verify-clipboard-contract.mjs`，第 19 个护栏）

Clipboard 域此前**没有任何护栏**。本护栏**不裁定冲突**（裁决在 ADR-0030），
而是**让冲突不会静默漂移**：从 `index.ts` **现算**注册顺序，与 spec §3 的
「**有效顺序（机器可读）**」行**双向**比对 —— 改代码不改 spec ⇒ 失败；改 spec 不改代码 ⇒ 同样失败。
**注入验证 5/5**（改代码顺序 / 改 spec 声明 / 删 spec 锚点行 / 删代码锚点 / 无变异对照）。

> **范围限制（如实声明）**：它锁的是「**声明与实现的有效顺序一致**」，
> **不是**「该顺序符合 §3 的理想优先级」—— 后者正是 ADR-0030 要裁的事。

### 教训

> **当「谁优先」由扩展的注册顺序决定时，这条规则就藏在 `index.ts` 的行号里，而不是在代码里。**
> 优先级链被拆到两个处理器之后，**测试能覆盖的只有链内**，跨处理器的那一层**没有任何判据** ——
> 于是 spec 与实现可以长期相反而无人发现。
> **可测的判据是「把顺序现算出来、与声明双向比对」**；把它写死进护栏等于没判。

## 4.73 `performance-benchmark-spec` 逐节审计：§2 声称的开关**不存在** + §6 与 §10 字面矛盾（2026-10-05）

### 为什么审它

这是 `docs/specs/` **最后一份**未逐节审的 spec（10 节）。§10（待办工作项 W-PERF-1/2/3）此前已深审
（§4.43 / §4.44），故本轮补 **§1–§9**。

### 发现 1（主）：§2 声称的环境变量 `TYPORA_APP` **全仓无人读**

§2 原文：「实测版本通过**环境变量 `TYPORA_APP`** 指定 `.app` 路径」。
**实测：全仓没有任何代码读它** —— 实际的覆盖方式是 **CLI 参数 `--typora <path>`**
（`run-benchmark.mjs` 的 `APPS.typora.bin`，默认 `/Applications/Typora.app/Contents/MacOS/Typora`）。
版本**确实**被记录（`typoraVersion(bin)` → 报告环境头 + 与 `TYPORA_NORMATIVE_VERSION` 比对）✓。

**同源失真**：`tests/benchmark/README.md` 也写「版本经 `TYPORA_APP` 环境变量可覆盖」——
**两处都错**（同 §4.54 的「多处副本」形态）。

**已修**：两处都改为 CLI 参数，并加**更正块**（保留原文，注明依据）。

### 发现 2：§6「不做 in-app 插桩」与 §10 的 W-PERF-1 **字面矛盾**

§6 核心原则写「**不做 in-app 插桩**（Typora 不可插桩，插桩会破坏可比性）」——
而 §10 的 **W-PERF-1 正是应用内埋点**（`packages/editor-engine/src/inputLatency.ts`，**已落地**）。
两者**并不真矛盾**，但原文的**绝对措辞**会让人以为 W-PERF-1 违规。

**已修**：在 §6 加更正块，把口径拆成三条 ——
① 外部屏幕捕获**仍是主路径**（也是唯一可比路径）；② in-app 埋点**只在屏幕捕获原理性不可判定的那一个指标**上启用
（`typing` 的 16ms）；③ 它**不得单独作为判定依据**（W-PERF-1 的验收条件要求与屏幕捕获**交叉验证**）。

### 发现 3：§8 的报告文件名与实现不符

§8 写 `reports/<YYYY-MM-DD>-<mellow-commit>-<typora-version>.md`；实际是
`reports/<ts>-mellow-vs-typora.md`（如 `2026-09-30T19-39-23-mellow-vs-typora.md`）——
**commit / 脏树 / Typora 版本记在报告**内部**（环境头），不在文件名里**。
⇒ 信息**等价**，差别只在「能否靠 `ls` 一眼定位」。且 `reports/` 与 `results/` **均已 gitignore**
（本机产物、不随仓库分发）。**本轮只更正 spec 描述，未改代码**（改名属行为变更，收益仅「本地更好找」）。

### 正向确认

| 节 | 判定 |
|---|---|
| §4 夹具规格 | ✅ **7 个夹具**与 `generate-fixtures.mjs` 的 `GENERATED` 列表一致；`manifest.json` 记 **sha256 / bytes / lines** ✓；产物目录 gitignore ✓；固定 seed 确定性 ✓ |
| §5 指标定义 | ✅ 与 `run-benchmark.mjs` 的 `ALL_METRICS = ['startup','open','hotopen','typing','scroll','search','save','memory']` **一一对应**（§5 表 7 项 + §10 的 `hotopen` = 8） |
| §6 组件清单 | ✅ `screen-timing.swift`（CGEventPost / ScreenCaptureKit / ROI diff / CGWindowList）、`perf-common.mjs`、`run-benchmark.mjs` 三者职责与实现一致 |
| §2 记录项 | ✅ commit hash + **脏树状态**确实被记录（`git rev-parse --short HEAD` + `git status --porcelain`）；Typora 版本 + 规范性标注 ✓ |
| §9 已知限制 | ✅（含「16ms 原理性不可判定」） |
| §10 待办 | ✅ 已深审（§4.43 / §4.44） |

### 固化为护栏（`verify-doc-code-refs.mjs` 新增一节）

**文档里声明的 `MELLOW_*` / `TYPORA_*` 开关，必须在代码里真的「被读取」。**
**注入验证 4/4**（新增不存在的开关 / 豁免失效两种形态 / 无变异对照）。

**这条判据的谓词经过三次收窄（都有实测数字，写进注释）**：

| 谓词 | 结果 |
|---|---|
| 所有反引号 UPPER_SNAKE | 91 个 token，4 个「不在代码中」—— **3 个是噪声**（`PITFALLS` 是文档名；`ACTION_DEFS` / `ENGINE_I18N_REGISTERED` 是审计内部标签） |
| 「同一行提到『环境变量』」 | 收窄后只剩 1 个（真缺陷），但**修完变成 0 个** ⇒ **判据空转** |
| **命名族 `(MELLOW\|TYPORA)_*` + 「被读取」** | **4 个 token、零误报，修完仍有 3 个可查 ⇒ 非空转** ✅ 采用 |

**⚠️ 施工中自己踩到的两个坑（都写进注释与 canary）**：

1. **判据被自己打死（两次）**：首版用「代码里**出现过**这个字符串」⇒ 本护栏**注释里的 `TYPORA_APP` 字样**
   就满足了它；改判据为「**被读取**」后，**canary 里的合成样本 `process.env.TYPORA_APP`** 又落在护栏源码里
   ⇒ 仍然恒不报错。**最终修法：把护栏自身排除出扫描面**，并加一条「自排除生效」的自检。
2. **我自己的测量脚本有边界 bug**：`process\.env\.TYPORA_APP` **前缀匹配**了 `process.env.TYPORA_APPSRC`
   ⇒ 一度得出「`TYPORA_APP` 有人读」的**假结论**（差点把真发现丢掉）。
   加 `(?![A-Za-z0-9_])` 边界后结论反转 —— 这正是 **PITFALLS §4.40「边界字符写错 = 假结论」**的同型。
   ⇒ 已把该边界做成 **canary**（`TYPORA_APP` 不得匹配 `TYPORA_APPSRC`）。

**⚠️ 作用域（首跑就被自己的审计文本命中 4 行 ⇒ 据此收窄）**：文档集 = **权威文档**
（`docs/plans` / `docs/adr` / `docs/specs`，与既有 PAIR 判据同范围）+ **各 README**；
**故意不含 `docs/qualification`** —— 审计/验收记录的职责就是**引用旧值**
（「原写 `TYPORA_APP`」「该开关不存在」），纳入会把**如实记录**误判成**声明错误**。
这是**如实声明的范围限制**，不是漏了。（实测：本节正文首跑即被命中 4 行，全部是「在描述旧值」而非「在声明」。）

### 教训

> **「代码里出现过」≠「代码里有人用」** —— 判据若用前者，会被**文档、注释、报错文案、canary 样本**满足；
> 而护栏**自己**就是最容易满足它的那个文件。**凡「存在性」判据，先问一句：我自己的源码会不会满足它？**
>
> 附带：**测量脚本的边界字符**要单独当判据来验（本轮我的脚本在这里错了，而它差点推翻一个真发现）。

## 4.74 ADR-0029 Q4 裁决：表格 `invalid` 提示**从 spec 移除**（2026-10-05）

### 背景

§4.39 的发现 4 把 `table-editing-spec` §7 的第 3 项（提示「表格语法不完整」）登记为待裁决：
「实现 Mellow 自有提示，或从 spec 移除」——当时**证据不足**（只在 `Front.strings` 单文件里查过），故不判。

### 本轮补足的一手证据（**两条独立通道**，均在本机 Typora 1.14.9 / build 7785）

| 通道 | 检索面 | 结果 |
|---|---|---|
| **文案** | Typora 的**全部 4 个 `.strings` × 2 语言**（Base + zh-Hans 的 Front / Menu / Panel / Welcome），`plutil -convert json` 后检索 | 与表格**不相交**的语法类词（`不完整\|无效\|语法\|非法\|incomplete\|invalid\|syntax\|malform\|broken`）命中 **20** 条，**其中与表格相关 0 条**；唯一「提示」形态是三条 `请按语法 … 定义 {链接\|图片\|脚注}` |
| **行为真值** | `TypeMark/appsrc/main.js`（1.6 MB） | `表格+无效/不完整`、`table+invalid\|incomplete\|malform`、`(invalid\|malform)+table`、`*Valid*Table` 标识符 —— **全部 0 命中**。表格函数族只有 `insertTable` / `deleteTable` / `copyTable` / **`reformatTable`**（= 菜单「Prettify Source Code / 格式化表格源码」）/ `tryResetTable` / `isTableEmpty` / `moveTableRow·Col` / `resizeTableEdit` |

⇒ **Typora 对损坏表格既不提示、也不校验**：只是**不按表格渲染**（source-like），
并提供**显式**的 `reformatTable` 动作 —— 恰好对应 §7 的**第 1/2/4 项**（已实现且有 4 例单测）。

### 裁决 **D2：从 spec 移除**

理由：本 spec 是 **Typora parity spec**；该项**非 parity** 且**从未实现**（全仓仅出现在该 spec 里）。
保留「非 parity + 未实现」的要求会让读者误读成**差距**（同 §4.70 形态）。
**不选 D1**（实现 Mellow 自有提示）—— 那属**产品新增**，须单独提出并登记为 **D** + 定文案。

**落地**：spec §7 第 3 项标记为**移除**（保留原文划除 + 注明依据）；**第 1/2/4 项不变**；
`ADR-0029` 追加「Q4 裁决」节并同步其顶部状态；审计「待裁决项登记表」第 8 行改为**已裁决**；
门禁 `DECIDED_ADRS` 的 ADR-0029 描述串同步（**Q4 留待 → Q4=D2**）。

### 施工中又踩了一次「判定退化成恒真」（同 §4.40 族）

我第一版的检索用的是**一个词集**同时判「含语法类词」与「含表格」——
而 `TABLE`（表格）是 `TERMS` 的**子集** ⇒ 合取条件**退化成「只要含表格」**，
于是把 `插入表格` / `删除表格` 这类**纯菜单标签**全报成了「表格语法提示」。
改用**不相交**词集（`SYNTAX` 与 `TABLE` 无交集）后重测，结论才成立（20 条里 0 条与表格相关）。

> **教训**：**合取判据的两个词集必须验证「不相交」** —— 否则 `A ∧ B` 会静默退化成 `A`。
> 这与 §4.40（边界字符）、§4.73（`TYPORA_APP` 前缀匹配 `TYPORA_APPSRC`）是**同一族**：
> **判据的形态假设错一次，就是一条恒真（或恒假）的判据。**

## 4.75 ADR-0030 裁决与落地：paste 优先级 **A3**（收敛到一处显式判断）（2026-10-05）

### 关键推理：这个裁决**不需要**「真实剪贴板带哪些 MIME」的证据

起草 ADR-0030 时，我把它写成「裁决前需先实测真实剪贴板在『从浏览器复制图片』时带哪些 MIME」，
并据此**留待**。本轮复核**否掉了这个前提**：

> **§3 的优先级 2 说的是「image/file **payload**」，不是「含 `<img>` 的 HTML」。**
> ⇒ **有 payload 时图片赢**是**规定行为**，与「真实剪贴板里 HTML 多不多」**无关**；
> **没有** payload 时 HTML 赢，**同样符合 §3**（那是优先级 4）。

即 **A3 让代码对「任何剪贴板内容」都遵循 §3**，不需要经验前提。
（这同时解释了为什么 A2「修订 §3」不必要 —— §3 的优先级本身自洽。）

> **教训**：把「需要一手证据」当成**默认答案**，会让一个**本来就自洽的规定**被误当成**待实测的经验问题**。
> 判断方法：**问一句「这条规则的成立依赖外部世界的什么事实？」** —— 答「不依赖」，就不该要求证据。

### 落地（真实实现，非仅文档）

| 项 | 内容 |
|---|---|
| **代码** | `smartPaste.ts` 新增 `hasImagePayload(data)`；`handleSmartPaste()` 内**显式**：有图片 payload ⇒ `return false` **让位**给 `image/input.ts` |
| **单测** | `smart-paste.test.ts` 新增 **5 例**（三类让位：`files` / `items` / **TSV 也让位**；两类**防过宽**：无 payload 时 HTML 照常转换、**非图片** payload 不让位）⇒ **22/22 通过** |
| **护栏** | `verify-clipboard-contract.mjs` **按裁决改写**（见下）；**注入验证 4/4** |
| **载体** | ADR-0030 → **Accepted**；门禁 `PENDING_ADRS` → 空、`DECIDED_ADRS` 增列；审计「待裁决项登记表」第 11 行 → 已裁决 |

**为什么不选 A1（前置 image 扩展）**：那是在改**全局注册顺序**，副作用会波及**其它**场景
（如「网页图文混排选区」原本应转 Markdown，前置后可能被图片路径抢走），
而且会让「谁优先」**继续依赖装配文件里的行号** —— 那正是本次问题的成因。
A3 把决策放进**唯一相关的那一处**，且**可读、可测**。

**范围（如实声明）**：**只认 `image/*` payload**（那是图片处理器唯一会消费的类型）；
**非图片的 file payload 不让位** —— 没有处理器消费它，让位只会让粘贴「什么都不发生」。

### 护栏按裁决改写（**前提消失 ⇒ 判据必须换**）

首版护栏锁的是「spec 声明的**有效顺序** ⇄ `index.ts` 现算的**注册顺序**」——
它让冲突**不静默漂移**，但**不裁定**冲突。A3 之后「谁优先」**不再依赖注册顺序** ⇒ 该前提消失。

现锁**更强的不变量**：**§3 优先级 2 必须在代码里被显式落实**
（spec 的「落实方式（机器可读）」行 ⇄ 源码现算：`payload-yield-explicit` / `order-dependent`）。
**去掉显式让位 ⇒ 现算值变回 `order-dependent` ⇒ 与声明不符 ⇒ 失败。**
注册顺序（`smartPaste@L272` / `image@L279`）**保留不变但不再承载语义** —— 护栏把它打印出来，
避免读者误以为顺序无关紧要。

> **教训**：**裁决落地后，护栏的「前提」可能已经不存在**。
> 此时**不能**留着旧判据（它会变成「锁一个不再重要的事实」），也不能简单删掉 ——
> 要把它换成**承载新语义的那个更强的不变量**。

### 施工中踩到的一个测试断言陷阱

「让位」用例最初用 `event.defaultPrevented === false` 判定「smartPaste 未拦截」——
**失败**：因为 **CodeMirror 自带的 paste 处理也会 `preventDefault`**（它自己插入剪贴板内容），
该量对「smartPaste 拦了」与「CM 默认拦了」**都是 true**。
⇒ 可靠判据是**文档内容**（转换发生了吗）。已写进测试注释，避免下一个人重踩。

## 4.76 `docs/architecture/` 逐节审计：**从未被审计、也不在任何护栏的扫描面里**（2026-10-06）

### 为什么审它

盘点「哪些文档从未被审计」时发现：`docs/architecture/`（**7 份**）**从未被审过**，
而且**不在任何护栏的扫描面里** —— `verify-doc-code-refs.mjs` 的 `DOC_GLOBS` 只有
`docs/plans` / `docs/adr` / `docs/specs`，**不含 architecture**；`docs/architecture` 里
「紧邻形态」的 `符号（文件:行号）` 引用为 **0**（已实测）⇒ 把它加进那个护栏是**空转**。

**但**：该目录含大量「**路径 + 状态 + 规模**」的断言 ⇒ 属于**可核对**的内容。
本节逐份过一遍（`README` / `overview` / `editor-core` / `host-adapter` / `monorepo` / `migration` / `extension-api`）。

### 结论：本目录是 **2026-08 快照**，其中**不带日期**的断言按「当前」读 ⇒ 8 处与现状不符

| # | 位置 | 声明 | 实测 | 性质 |
|---|---|---|---|---|
| 1 | `README.md` | 约束层级 =「PRD（宪法）> **本文档（实现架构）** > ADR」 | `AGENTS.md` 的表是「PRD > **specs** > ADR > plans」 | **两套优先级冲突**（且 architecture 把自己排在 ADR 之上、**完全没提 specs**） |
| 2 | `README.md` | CoreEditor（TS）：**201 文件**（行数 13,625） | 真值源 `upstream-manifest.json` 的 `fileCount` = **199**；13,625 行**全仓无出处**、口径未声明 | 数字失真 |
| 3 | `editor-core.md` | 「（vendored，**只读**）」「注入式扩展…**0 修改 CoreEditor**」 | `UPSTREAM.md` 记录**修改 19 / 新增 3**（共 22 处） | **政策级声明失实**（读者会以为该目录是原样上游） |
| 4 | `host-adapter.md` | 实现状态矩阵：`window` / `clipboard` / `watcher` / `search` / `export` **全为 ⛔** | **五项均已实现** —— 宿主侧 `apps/desktop/src/host/` **12 个** Adapter 文件 + `src-tauri/src/` **18 个** Rust 源文件可证（含 `clipboard.rs` / `print.rs` / `watcher.rs` / `search.rs` / `window.rs`） | **矩阵整体是 V0.0 期状态** |
| 5 | `host-adapter.md` | 「前端桥接」列 4 个文件（`editorHost.ts` / `fs.ts` / `bridge.ts` / `types.ts`） | **一个都不存在**；实际是 **12 个**按服务拆分的文件 | 文件表全错 |
| 6 | `monorepo.md` | 「现状与差距」把 `editor-react` / `desktop-ui` / `document-model` 标为「**未建**」 | **三者都已建**；`packages/` 实际 **15 个包** | 快照过期（表已标 2026-08，但**不带日期的树注释**仍按当前读） |
| 7 | `monorepo.md` | 「每个 package **必须**包含 `README.md`/`CONTRACT.md`/`src/`/`tests/`/`fixtures/`」（PRD §117.1） | 15 个包里：`src/` **15/15**、`test(s)/` 12/15、**`README.md` 2/15**、**`CONTRACT.md` 1/15**、**`fixtures/` 0/15** | **宪法级规范基本未执行，且无护栏** |
| 8 | `extension-api.md` | `examples/hello-command.ts` | 实际是 **`helloCommand.ts`**（**大小写**不同） | ⚠️ **macOS 大小写不敏感 ⇒ 本地看着是通的**；Linux/Windows 上**断链** |

**另有一处顺带**：`host-adapter.md` 的 `src-tauri/src/bridge.rs` **少了 `apps/desktop/` 前缀**
（同表其它行都带前缀）⇒ 路径不自洽。

**已核对为正确**：`editor-core.md` 的「`styling/themes/` **16 个主题**」✓（实测 16）。

### 处置

1. **`README.md`**：约束层级**改以 `AGENTS.md` 为准**（本目录是**实现架构说明**，不参与优先级仲裁）；
   快照数字**改为引用真值源**（`upstream-manifest.json` 的 199），并**如实声明** 13,625 / 28,781 两行**无真值源**；
   新增「本目录整体是 2026-08 快照」的**显式声明**（区分「带日期的表」与「不带日期的断言」）。
2. **`editor-core.md`**：`0 修改 CoreEditor` → **如实写成「修改 19 / 新增 3」**，
   并说明**准确表述是「注入式扩展不 fork CoreEditor」**（注入是主路径，但 vendored 树**确实被改过**且受校验）。
3. **`host-adapter.md`**：**按实际代码重写**状态矩阵（**每格给出可打开的路径**）与桥接文件表；
   `keychain` 标为**有意不实现**（ADR-0029 Q5 = E1）；`process` 标为**无统一服务**（如要统一须新增 ADR）。
4. **`monorepo.md`**：加**2026-10-06 复核块**（列出实际 15 个包、指出「未建」已不成立）；
   包规范加**实测合规表**（2/15 / 1/15 / 0/15），并写明两种正当处置（补齐 + 护栏 / 走 ADR），**本轮不擅自选择**。
5. **`extension-api.md`**：路径改为 `helloCommand.ts` + 注明**大小写差异在 macOS 上不可见**。

### 固化为护栏（`verify-doc-code-refs.mjs` 新增一节）

**`docs/architecture` 里以反引号给出的「仓库相对路径」必须存在。**
**注入验证 5/5**（正文假路径 → 拦下；**围栏代码块** / **更正说明行** / **Windows 分隔符** → 三个**防误报**方向全过；无变异对照）。

**范围与豁免（如实声明）**：① 只查**含 `/`** 的路径，**裸文件名**（`CONTRACT.md` 这类基址不明）**跳过但计数**；
② **跳过围栏代码块**（那里的路径常是相对某个根的示意）；③ **更正说明行豁免**（它必然引用已不存在的旧路径）；
④ 路径**按 `/` 归一化**后判定（Windows 上 `walk` 产出 `\` —— 本项目已因此红过一次 CI）。

### 教训

> **「快照」这个标注只保护「带日期的表」。** 同一个文件里**不带日期**的断言（规模 / 实现状态 / 修改数）
> 会被读者**按「当前」读** —— 于是「2026-08 快照」里混着的**当下的错误声明**就长期无人发现。
> ⇒ 要么给每条断言标日期，要么**把不可核对的数字换成对真值源的引用**。
>
> 附带两条：
> - **大小写错误在 macOS 上不可见**（大小写不敏感的文件系统）⇒ 文档里的路径必须**由护栏在 CI 上判**，
>   否则 Linux/Windows 用户会先撞上它。
> - **「0 修改 X」这类绝对措辞**必须与事实一致：实际有 22 处改动，且其中任一处丢失都会被
>   `verify-upstream-manifest` 抓到（同 §4.56「门禁声称满足 vs 实际未闭环」）。

## 4.77 清点「从未被审计的文档」：三份 `docs/plans` 逐份复核（2026-10-06）

### 清点方法

按「审计文档里是否出现过该文件名」逐份数，`docs/` 下**从未被审**的是：

| 文档 | 行数 | 结论 |
|---|---|---|
| `docs/plans/codex-implementation-plan.md` | 234 | **1 处过期任务**（+ 2 处「不是缺陷」已记明） |
| `docs/plans/print-verification-checklist.md` | 81 | **2 处失真** |
| `docs/plans/markdown-syntax-demo-parity-validation-plan.md` | 457 | ✅ **零缺陷**（正向确认，见下） |

（`docs/architecture/` 7 份已在 §4.76 处理；`docs/product/` 的 PRD 是 5514 行的宪法，**仍未逐节审**，见「遗留」。）

### ① `codex-implementation-plan.md`：1 处过期任务

它是**任务编号脚手架**（T-0001…T-0710），**无状态列** —— 因此**本次先给它加了「权威状态在哪」的指针**
（master-plan §15 + 台账），否则读者只能从编号推断进度。

**过期任务**：**`T-0301 Tabs`** 仍作为 Phase 3 任务列出，而 Tabs 已被 **SDI 决策否决**
（master-plan §12 的 **D-D / D-Y**；`desktop-ui-design-spec` §4 已**作废**）。
**发现它的方式值得记**：**同一份文件里已有正确的标注范式** ——
`T-0410 已移除（Split Mode 不属于 V1 范围）` ⇒ **同类情况一处标了、一处没标**。
已按同一范式标注 T-0301。

**两处「不是缺陷」（已写进文档的复核块，避免下轮重复怀疑）**：

- `T-0602 6 built-in themes` 的「6」是 **PRD 的要求数**，实际内置 **8** 个主题
  （`packages/themes/src/index.ts`；`verify-shell-typography.mjs` 断言「内置 8 主题」）⇒ **超额满足**。
- `T-0702 18 golden journeys` 的「18」是**初版条数**；当前矩阵 **20 项终态**
  （`docs/qualification/golden-journeys-2026-08-19.md`）⇒ 同为**超额**。

> **教训**：**「数字与现状不一致」有两种** ——「过期的计数」与「已超额的要求」。
> 判据：**先回查该数字的来源（PRD 要求？初版计数？）**，再决定它是不是缺陷。
> 本轮两处都**先查了来源**，避免了两次误报。

### ② `print-verification-checklist.md`：2 处失真

| # | 声明 | 实测 |
|---|---|---|
| 1 | 「已确认的已知限制 1：打印入口当前为 **Reader 场景**（`reader.print`，`enabled: readerOpen`），**编辑态直接打印未实现**」 | **已不成立** —— `file.print` 命令**已存在**（`menuSchema.ts`，`Cmd+P` / `Ctrl+Alt+P`），且 `App.tsx` 注册为 **`enabled: always`**（不依赖 Reader）；对应 **golden journey #18「基线 FAIL → 接线修复」** |
| 2 | 「Tauri **2.11.2** `webview/webview_window.rs:2294`」 | ① 版本已漂移（`Cargo.lock` 实为 **`tauri 2.11.5`**；`wry 0.55.1` 与原文一致 ✓）；② **指向第三方源码的行号不可核对**（文件不在本仓、且随依赖升级漂移）⇒ 按 §4.11 改为**只引符号** |

**已核对为正确**：该清单「相关代码」列的 **6 个路径全部存在** ✓。

### ③ `markdown-syntax-demo-parity-validation-plan.md`：**零缺陷**（正向确认）

**逐项实测**（这是本轮唯一一份**没有任何失真**的文档）：

| 声明 | 实测 |
|---|---|
| 输入样例 `/Volumes/My-Data/jason.wa/Downloads/markdown-syntax-demo.md` + SHA-256 `23d01902…` | 文件**仍在**，SHA-256 **逐字符一致** ✓ |
| 三份夹具落在 `tests/fixtures/typora-parity/markdown-syntax-demo/` | **就在该路径** ✓（`original.md` / `local-assets.md` / `interaction.md` / `assets/`） |
| 「每份夹具记录 SHA-256」 | 夹具 README 的 SHA 表与**实测逐条一致** ✓（`original` `23d01902…` / `local-assets` `7d2e718c…` / `interaction` `80a9dd33…`） |
| 基线（Mellow `74c454b` / Desktop `1.3.4` / Typora 1.14.9）+ 制定日期 2026-08-23 | **已声明为带日期的专项报告** ✓ |

> **方法学结论（值得记）**：**同样是 6 周前的文档** ——
> `docs/architecture/`（§4.76）**不带日期**的断言漂移了 **8 处**；
> 而这份 plan **带日期 + 带证据锚点（SHA-256 / 夹具路径 / 基线）**，**零漂移**。
> ⇒ **「证据锚点」不只是为了说服读者，它是文档抗漂移的机制** ——
> 锚点会**逼着**作者在写下时把事实固定住，而读者/护栏能**逐条复核**它。
> 反过来：**没有锚点的数字与状态**（「201 文件」「⛔ 未实现」「0 修改」）**没有任何东西在守**。

### 遗留

- **PRD（`docs/product/Mellow-PRD-V1.2-FINAL.md`，5514 行）仍未逐节审** ——
  它是**宪法**（P0），目前只被**按需引用**（§109/§110/§116/§117.1/§133 等）。
  逐节审它是一次**独立的、量级更大**的工作（需按「声明 → 载体」的方式过一遍），**本轮不做**，如实登记。

## 4.78 PRD（宪法，5514 行）审计：**先做承重集测绘**，再抓结构缺陷（2026-10-06）

### 为什么不能直接「逐节读」

`docs/product/Mellow-PRD-V1.2-FINAL.md` 是**宪法（P0）**，**5514 行 / 151 个一级小节**。
逐节读完并逐条对到载体，是**独立且量级更大**的工作。
故本轮先做**承重集测绘**（哪几个小节真的被当作依据），把下一轮的入口**量化**出来。

### 测绘结果（方法：正则扫全仓对 `PRD §N` 的引用）

| 量 | 值 |
|---|---|
| PRD 一级小节（`# N.`） | **151** |
| 被其它文档 / 护栏引用过的 §N | **67** |
| **从未被任何文档引用的 §N** | **89** |

⇒ **151 个小节里只有 67 个有外部锚点**；其余 89 个**既没有护栏在核对、也没有文档在引用它们**。
这不是「它们不重要」——宪法整体有效 —— 而是说：**它们的现状没有任何东西在守**（同 §4.64 的结论）。

### 本轮抓到的缺陷：**8 处子节被写成了「一级标题」**

| 行 | 现状 | 应为 |
|---|---|---|
| 3156 / 3220 / 3241 / 3257 / 3294 | `# 113.1` … `# 113.5` | `## 113.1` … `## 113.5` |
| 3397 / 3437 / 3452 | `# 117.1` … `# 117.3` | `## 117.1` … `## 117.3` |

**同文件里另 20 处子节用的是正确的 `## N.M`** ⇒ 又是「**同类处理不一致**」（同 §4.77 的 `T-0301` 与 `T-0410`）。

**后果**：生成的目录会把 `113.1`–`113.5` / `117.1`–`117.3` 列成**与 `# 113.` / `# 117.` 平级**。
而全仓**大量**文档按「**PRD §113.4**（平台代码隔离规则）」「**PRD §117.1**（面向 AI/Codex 的仓库设计规范）」
引用它们 —— 读者**按目录去找会定位到错误层级**。（引用本身靠文本匹配，不受影响；受影响的是**结构视图**。）

**已修**：8 处 `#` → `##`。**零语义变更**（只改标题层级）。

**⚠️ 修复前先确认「没有护栏依赖旧写法」**：`verify-parity-ledger.mjs` 断言的是
`/# 109\. Large File Mode/` —— 那是**顶级**小节（保持 `#` 不变 ✓）；另实测**无**护栏匹配 `# 113.` / `# 117.` ⇒ 改动安全。

### 固化为护栏（`verify-doc-code-refs.mjs` 新增一节）

**PRD 里不得出现 `# N.M`（子节写成一级标题）** + **一级小节数量下限**（防结构漂移致判据空转）。
**注入验证 3/3**（把子节改回一级 / 新增一处 `# N.M` / 无变异对照）。

> **判据只抓「带小数点的 `#`」** —— 明确**不**把 `# 109.` 这类**顶级**小节判成违规（那是正确形态）。

### 教训

> **宪法也会有结构缺陷，而它影响的是「引用可达性」。**
> 语义没变、引用没断，但**按目录找不到** —— 这类缺陷不会被任何「内容核对」发现，
> 只有**结构判据**能发现（「标题层级是否与编号一致」）。
>
> 附带：**覆盖率要按「被引用的最小单位」量**。151 个一级小节里只有 67 个有外部锚点 ——
> 这个数字本身就是下一轮工作的**入口清单**，而不是一句「还没审」。

### 遗留（如实登记）

- **PRD 的语义逐节核对仍未做**：本轮只覆盖**结构层**（标题层级 + 引用测绘）。
  151 个小节的**声明 → 载体**逐条核对是独立工作；**入口已量化**（67 个被引用的 §N 优先）。
- 上一轮登记的其余遗留不变（`runtime-qualification-plan` §6 的收窄需 ADR；`ime-test-plan` §3 的 6 类基础输入需加场景 + 派发实跑）。

## 4.79 PRD 承重集审计（一）：**61 处「引用宪法」里只有 3 行真的读它**（2026-10-06）

### 方法

承重集测绘（§4.78）给出 67 个被引用的 PRD 编号。本轮先审**被护栏引用**的那部分 ——
因为护栏是**机器强绑定**，而文档引用只是散文。

**实测：护栏里共 61 处 `PRD §N` 引用**（`tests/parity/*.mjs` + `tests/benchmark/*.mjs` + `tests/qualification/ux-gate-recorder.mjs`）。

### 发现（系统性缺口）：「引用了宪法」≠「核对了宪法」

**读 PRD 原文的护栏只有一处**：`verify-parity-ledger.mjs` 的 **§109** 三行断言
（`# 109. Large File Mode` / `>5MB` / `>50,000 lines`）。**其余 ~58 处**都是
**注释里的依据** —— 断言的是**实现 / 记录器**一侧，**PRD 被改动时不会红**。

**两个具体后果（本轮修掉）**：

| # | 缺口 | 实测 |
|---|---|---|
| 1 | **§131 的 UX 门槛与模块权重只锁了「记录器」一侧**，且把 `92 / 24 / 15 / 5` **复述进护栏** | 同一组数字有**三份副本**（宪法 / 记录器 / 护栏），而**宪法那份没人核对** ⇒ 改 PRD §131 不会让任何东西变红 |
| 2 | **§132 的「30 个核心 Typora 任务」**只与模板**互相**核对 | 两侧都**没有与宪法核对** ⇒ 改 PRD §132 的数量同样不会红 |

> 这与 **§4.9「跨层字段必须两端同时锁」**同型：**只在一端加判据，另一端被改了没人知道**。

### 修复：改成**从宪法读值**，与记录器**双向**比对

- **§131**：解析 PRD 的**模块表（10 行）**与 **Release 门槛块**（`Total >= 92` / `Live Editing >= 24/25` /
  `Caret/IME/Undo = 15/15` / `File Safety = 5/5`），逐项与记录器的 `UX_MODULES` / `UX_THRESHOLDS` 比对
  （**按标签匹配**，两侧模块集必须一致）。
- **§132**：解析 PRD 的「**N 个核心 Typora 任务**」，与记录器 `TASKS.length` 比对。
- **解析必须响亮失败**：模块表不是 10 行 / Release 块解析不到 / 任务数解析不到 ⇒ **立即报错**
  （否则「解析不到」会**静默变成「无需核对」**）。
- 护栏里**不再复述**这些数字 —— **宪法是唯一真值源**。

**注入验证 6/6**：**改宪法门槛 / 改宪法权重 / 删宪法一行 / 改宪法任务数**（四个「改宪法 ⇒ 红」方向）
+ 改记录器门槛 + 无变异对照。

### 教训

1. **「引用了宪法」≠「核对了宪法」** —— 61 处引用里只有 **3 行**真的读它。
   引用是**声明**，读文件才是**核对**。
2. **护栏里复述真值源的数字 = 制造第三份副本**。数字越多处复述，越没人知道该改哪份。
   ⇒ **从真值源读值**，让「改真值源」直接变成红灯。
3. **解析必须响亮失败**：`assert(解析到了预期条数)` —— 否则**解析器漏成员会静默变成「无需核对」**
   （同 §4.52「未判定 = 静默通过」）。

### 遗留（如实登记）

- 其余 **~58 处** PRD 引用**仍是单向**（多为「注释里的依据」）。它们的风险较低（注释漂移不改变行为），
  但**不是零** —— 若要收口，应按「**该引用是否承载一个可判定的数字/阈值**」逐条筛，**本轮未做**。
- **PRD 的语义逐节核对仍未做**（承重集里文档引用的那部分也还没过）。

## 4.80 PRD 承重集审计（二）：§110 的五个绝对目标**只在 ADR 一侧被断言**（2026-10-06）

### 方法

按 §4.79 登记的方法，对**其余 ~58 处单向引用**逐条筛：**该引用是否承载一个可判定的数字 / 阈值**？
承载的那些才有「宪法被改了没人知道」的实际后果。筛出的第一项就是 **§110 的五个绝对目标**。

### 发现

`verify-parity-ledger.mjs` 的 ADR-0026 覆盖检查里，那五个目标模式**只对 ADR 断言**：

```js
// PRD §110 有五个绝对目标：Startup ≤1.2s / 1MB ≤250ms / 10MB 1.0–1.5s / Input <16ms / Input Large <32ms
```

—— **这句话是硬编码在护栏注释里的**，而 **PRD 从未被读**。
⇒ 改宪法的数值（如 `250ms → 200ms`）**不会让任何东西变红**，而 ADR-0026 那份「唯一声明处」
会与宪法**静默脱钩**（同 §4.79 / §4.9 的「只锁一侧」）。

### 修复：补**宪法侧**判据

同一组模式必须**在 PRD §110 原文里也成立** ⇒ 两侧任一被改都会红。

**⚠️ 施工中判据当场抓到一处记法差异（值得记）**：

| 侧 | 10MB 目标的写法 |
|---|---|
| **PRD §110** | `<= 1.0s–1.5s to editable target` |
| **ADR-0026** | `1.0–1.5s` |

即**同一目标两侧记法不同**（PRD 在第一个数字后也写了 `s`）。
护栏的模式原本是**按 ADR 的写法**建的 ⇒ 第一次跑到 PRD 上**立刻报错**。
⇒ 已把模式改为同时接受两种写法（`1.0` 后可有可无 `s`），并**把该差异写进注释**。

> 这次「首次运行就红」恰好**证明了两侧真的在比对** —— 若只是把 PRD 读进来却不比对，
> 或模式宽松到两种写法都隐式通过，就不会有任何信号。

**注入验证 4/4**：改宪法的 1MB 目标 / Input 目标 / 10MB 目标（三个「**改宪法 ⇒ 红**」方向）+ 无变异对照。

### 一处「不是缺陷」（回查后否掉，如实记录）

PRD 里有 **13 处 `1.14.6`**（含 §110 的「同机型与 Typora 1.14.6 对照」），
初看像「基线过期」（全项目基线是 **1.14.9**，`AGENTS.md` 统一规则 14 明文）。**回查 PRD 自身**：

> **产品决策修订（2026-08-24）**：规范验收基线固定为 Typora **1.14.9**（build 7785），
> 文中 Typora **1.14.6 的版本描述仅为冻结时的历史记录**。

⇒ **宪法自己处理了这件事**（顶部一条全局修订覆盖全文），**不是缺陷**。
（本轮**第三次**靠「回查来源」避免误报 —— 前两次是 `T-0602` 的主题数与 `T-0702` 的 journeys 数。）

### 教训

> **判据的「模式」是按哪一侧的写法建的？** 本轮的模式是按 **ADR** 的写法建的 ——
> 所以它**在 ADR 上一直通过、第一次跑到宪法上就红**。
> ⇒ 加「两侧比对」时，**先用真值源那侧的原文校准模式**；而**第一次运行就红**是好信号
> （它说明模式确实贴着某一侧的写法，而不是宽到两边都过）。

### 遗留

- 其余承载数字的引用（如 §48 的 CSP、§129 的 J18）**尚未逐条过**；「不承载数字」的那批（§111 / §122 / §101 等）
  风险较低，**但也不是零** —— 它们的判据是**行为性**的（如「AI 默认 disabled」「自动保存默认含 Document Switch」），
  要核的是**行为**而非数字，本轮未做。

## 4.81 PRD 承重集审计（三）：§48 与 §129 —— 两条「在注释里引用、从未读原文」的安全 / 能力条款（2026-10-06）

### 方法

接 §4.80 的遗留，逐条过**承载数字或硬约束**的剩余引用。本轮取两条：

| 条款 | 承载什么 | 引用它的护栏 |
|---|---|---|
| **PRD §48 HTML** | **安全策略**（8 条：inline tags / block tags / video / audio / iframe sandbox / no script / no inline events / no JavaScript URL） | `verify-parity-ledger.mjs` 的 CSP 块（**仅在注释里**引 §48） |
| **PRD §129 J18** | **能力要求**（`## J18 10MB` → `Open → search → edit → save`，§129 开头「必须全部通过」） | `verify-parity-ledger.mjs` 的「模板必须保留 >2 MB 非对照能力观察」（**仅在注释里**引 §129 J18） |

### 发现一：§48 是**安全条款**，三处净化器**都没被宪法核对过**

- §48 的实现散在**三处**：`editor-engine/src/safeHtml.ts`、`app-core/src/reader.ts`、
  `export/src/html/sanitize.ts`（后者文件头自称「与编辑器 safeHtml 白名单对齐，PRD §48」）。
- 已有的「两处 HTML 净化器必须一致」护栏**只比对前两处彼此**，**不与宪法比对**，
  且**不覆盖导出那处**（白名单是 `sanitize-html` 配置数组，形态不同）。
- ⇒ **若两处同时删掉 `on*` 剥离，一致性判据仍然成立** ⇒ 行内事件处理器会执行，
  **没有任何信号**。这正是 §4.79/§4.80 的「引用宪法 ≠ 读宪法」，
  但落在**安全条款**上，后果比数字脱钩更重。
- 附带确认：app shell 的 CSP **本来就允许** `'unsafe-inline'`/`'unsafe-eval'`
  （`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; …`），
  ⇒ §48 的「no script / no inline events」**只能由净化器承担**，不能靠 CSP 兜。
  （原护栏注释已写明「不锁 unsafe-inline —— 那针对渲染出的 HTML」，本轮把这句话**变成判据**。）

### 发现二：§129 J18 是 ADR-0025「非对照能力观察」的**唯一宪法依据**，但从未被读

ADR-0025 把 10 MB 从**对照测量**改为**非对照能力观察**，理由是
「Typora 渲染上限 ≈ 2 MB，>2 MB 无基线」。该理由的**前提**正是 **§129 J18 要求 10 MB**。
若有人把 §129 J18 的尺寸改成 2 MB：

- ADR-0025 的**全部理由消失**；
- UX Gate 模板里的「>2 MB 非对照能力观察」节变成**没有宪法依据的孤儿**；
- **不会有任何信号**（现有护栏只断言模板保留了那一节）。

### 修复：补**宪法侧**判据 + **实现侧**不变量

**§48 块**（新增，紧接 CSP 块）：

1. **宪法侧**：§48 的 8 条要求逐条必须在 PRD 原文里存在（缺一条即红）。
2. **实现侧**：三处净化器各自必须满足 §48 明文列出的四条**可机械判定**的不变量 ——
   `no script`（白名单是 allow-list 且不含 `SCRIPT`/`script`）、
   `no inline events`（DOM 侧 `name.startsWith('on')`；导出侧「属性白名单无 `on*` 键」——
   因为 `sanitize-html` 只放行白名单属性，事件属性天然被丢弃，这是**等价不变量**）、
   `no JavaScript URL`（协议是 allow-list 且**恰好**为 `http:/https:/mailto:`）、
   `iframe sandbox`（DOM 侧 `setAttribute('sandbox','')`；导出侧 `attribs.sandbox = 'sandbox'`）。
   **不发明更严的约束**（不碰 `unsafe-inline`）。

**§129 块**（新增，**放在模板解析之外**）：

- 读 PRD §129：必须声明「必须全部通过」；`J18` 必须存在且**仍写 10 MB**；
  黄金任务必须为 **18 条且编号连续 `J01..J18`**。
- ⚠️ **刻意不放在 `if (tplRows.length && recTasks.length)` 里** ——
  否则模板/记录器一旦解析失败，这段宪法侧判据会被**静默跳过**（「条件跳过 = 静默通过」）。

### 注入验证

**文件级 13/13**（改被守护对象 ⇒ 必红）：

| 注入 | 结果 |
|---|---|
| PRD §48 删 `no inline events` / 删 `video；` / 删 `iframe sandbox；` | ✅ 红 |
| 编辑器净化器删 `on*` 剥离 | ✅ 红 |
| Reader 净化器删 `iframe sandbox` 强制 | ✅ 红 |
| 编辑器净化器协议白名单加 `javascript:` | ✅ 红 |
| 导出净化器 `ALLOWED_SCHEMES` 加 `javascript` / `ALLOWED_TAGS` 加 `script` / 属性白名单加 `onclick` / 删 `attribs.sandbox` | ✅ 红（4/4） |
| PRD §129 J18 `10MB → 2MB` / 删「必须全部通过」/ 删 J18 整节 | ✅ 红 |

**谓词级 7/7**（改**护栏自己的谓词** ⇒ canary 必须报）：
`protoOk` 恒真 / 收窄、`onKeysOf` 恒空、`RE_TEN_MB` 放宽为 `/./` / 收窄为 `/20MB/`、
`RE_J18_HEAD` 放宽为 `/J18/`、§48 单条谓词放宽为 `/./` —— 全部报 `canary 失效`。
无变异对照绿、复原后绿。

### 施工中被自己的 canary 抓到的两个坑（值得记）

1. **canary 与断言必须共用同一个谓词对象**。
   初版 canary 把正则**另写一份**（`/10\s?MB/i` 在断言与 canary 里各一份）⇒
   把 `RE_TEN_MB` 放宽成 `/./` 时，**正向 canary 仍用旧正则** ⇒ 什么都不报。
   改为 `const RE_TEN_MB = …` 一处定义、三处引用后，放宽**立刻**被负向样本抓到。
   **「canary 必须是双向的」还不够 —— 还必须是「同一个对象」的。**

2. **负向样本的替换不能带尾随换行**。
   §48 逐条 canary 初版用 `S48_FULL.replace('- ' + line + '\n', '')` ⇒
   对**最后一条**（`no JavaScript URL。`，无尾随 `\n`）**替换静默不生效** ⇒
   正常态也被判成「谓词过宽」⇒ **护栏在无注入时自己变红**。
   这正是「**假阳性**比漏检更早暴露问题」的例子：若无条件接受它，下一步就会去放宽判据。

### 一处「不是缺陷」（回查后否掉，如实记录）

PRD §129 的 `## J18` 在原文里**没有**「必须全部通过」以外的强调，
而 ADR-0025 与模板都称 J18「要求 10 MB 文档仍然可编辑」——
ADR 的措辞比宪法原文**更具体**（原文只有 `Open → search → edit → save`）。
**这不是冲突**：`Open → search → edit → save` 就是「仍可编辑」的可执行表述。
⇒ 本轮判据只锁**宪法实际写下的东西**（尺寸 10 MB、条目齐全、编号连续），
**不把 ADR 的释义反向写进宪法**。

### 教训

> **安全条款的「引用」比数字条款的「引用」更危险**：数字脱钩只是「改了没人知道」，
> 而安全条款脱钩是「**判据整体失效但仍全绿**」——
> 「两处一致」这类**相对判据**在两侧同时退化时**必然通过**，
> 它只能防「分叉」，**防不了「一起变松」**。
> ⇒ **凡引用宪法处，判据必须有一条是「对宪法原文的绝对判据」。**

### 遗留

- 其余承载数字的引用尚未逐条过完；「不承载数字」的那批（§111 / §122 / §101 等）
  判据是**行为性**的（如「AI 默认 disabled」「自动保存默认含 Document Switch」），本轮仍未做。
- §48 的 `common inline tags` / `block tags` 两条**只做了宪法侧存在性断言**，
  **未做实现侧覆盖断言**（「白名单是否真的覆盖了常用行内/块级标签」需要一份**清单来源**，
  否则就是拿自己的实现当真值）—— 需单独裁决清单来源，本轮未做。

## 4.82 PRD 承重集审计（四）：把「只在注释里引用 PRD」的护栏**清零**（2026-10-06）

### 方法

承重集测绘给出「**哪些护栏文件引用了 PRD 但从未读它**」。上一轮（§4.81）处理了
`verify-parity-ledger.mjs` 里的 §48/§129；本轮把**其余护栏文件**一次清完。

**测绘口径**：扫 `tests/parity/verify-*.mjs`，统计「文件内出现 `PRD §N`」与
「文件内出现 `Mellow-PRD-V1.2-FINAL.md`（即真的打开它）」。实测：

| 文件 | 引用 | 是否读 PRD |
|---|---|---|
| `verify-parity-ledger.mjs` | §48 §109 §110 §129 §131 §132 | ✅（§4.79–§4.81 后） |
| `verify-doc-code-refs.mjs` | §113.4 | ✅ |
| `verify-shell-widgets.mjs` | §101 | ❌ |
| `verify-settings-contract.mjs` | §122 | ❌ |
| `verify-adapter-contract.mjs` | §134 | ❌ |
| `verify-release-gate.mjs` | §110 | ❌（但**已被 §4.80 覆盖**：数值由台账护栏从 PRD §110 读值） |

⇒ 待处理 **3 处**。全部是「**行为性**」引用（不承载数字），但**不是零风险**：
它们引用的是**默认值 / 优先级清单**——宪法一改，这些断言就变成**没有宪法依据的要求**。

### 发现与修复

**① `verify-shell-widgets.mjs` → PRD §101 Auto Save**

引用形态：「PRD §101 规定自动保存默认含 Document Switch」。
宪法原文（回查）：支持 `关闭 / 窗口失焦 / 切换文档 / 延迟保存` 四种，**默认 `Window Blur + Document Switch`**。
⇒ 若默认值被改（去掉 Document Switch），本护栏那条「`guardSingleDocument` 必须含静默保存后离开分支」
就成了**无依据要求**。新增宪法侧判据：四种模式齐全 + 默认值仍为 `Window Blur + Document Switch`。

**② `verify-settings-contract.mjs` → PRD §122 AI**

引用形态：「PRD §122：AI 默认 disabled / no model / no document upload」。
宪法原文（回查）：§122 标 **P2**，默认三项同上。
⇒ 新增宪法侧判据：§122 必须仍声明 **P2** + 三个默认项齐全。

**③ `verify-adapter-contract.mjs` → PRD §134 P1**

引用形态：「PRD §134 P1 Recent integration」。
宪法原文（回查）：§134 的 P1 清单里确有独立一条 `- Windows JumpList；`。
⇒ 新增宪法侧判据：§134 的 P1 清单里必须仍有**独立条目** `Windows JumpList`。

**④ `verify-release-gate.mjs` → PRD §110：判定为「已被覆盖」，不重复加判据。**
该处只是 ADR 登记表里的一行**描述**（「ADR-0026 = PRD §110 性能目标的测量口径」），
而 §110 的**五个数值**已由台账护栏从 PRD 原文读值（§4.80）。
**再补一条会是第三份副本** —— 记录为「已覆盖」而不是「已修复」。

### 判据形态：这次用了「**共享谓词函数**」

三处都按 §4.81 的教训写成**同一个函数对象**（`check101` / `check122` / `hasJumpListP1`），
断言与 canary **共用**它；canary **三向**：

| 方向 | 样本 | 期望 |
|---|---|---|
| ① 正样本 | 完整原文片段 | **必须**全识别 |
| ② 负样本-缺条 | 删掉其中一条 | 该条**必须**不命中 |
| ③ **负样本-放宽** | 谓词被改成 `/./` 后应当**不**命中的样本 | **必须**不命中 |

> **③ 是本轮新增的**：§4.81 已发现「只做①②抓不到放宽」，本轮把它固化成规则。
> 实测：§101 的 `defaultOk` **初版只做了①②** ⇒ 注入「`defaultOk: /./`」时**仍然全绿**；
> 补上 ③（「默认值不含 Document Switch 的样本必须判不合格」）后**立刻变红**。

### 注入验证

**文件级 7/7**（改宪法 ⇒ 必红）：§101 删模式 / 删 Document Switch / 默认改成只 Document Switch；
§122 删 `no model` / `P2 → P1`；§134 删 `Windows JumpList` / 给该条**加后缀**（不再是独立条目）。
**谓词级 5/5**（改护栏自己的谓词 ⇒ canary 必报）：`check101` 的 MODES 清空 / `defaultOk` 放宽为 `/./`、
`check122` 的 AI_DEFAULTS 清空 / `isP2` 放宽为 `/./`、`hasJumpListP1` 放宽为「非空即真」。
**共 12/12**；无变异对照绿、复原后绿。

### 至此的盘点

**「引用 PRD 却从不读 PRD」的护栏文件数：4 → 0。**
（`verify-release-gate.mjs` 的那一处按上面的理由判为**已被覆盖**，不计入。）

### 收口：把「清零」变成**可重跑的不变量**（新增元护栏）

上面那张表是**我手工扫出来的** —— 那它下一轮就会腐烂。故新增元护栏
（`verify-doc-code-refs.mjs`）：**`tests/parity/verify-*.mjs` 里出现 `PRD §N` 的文件，
必须同时出现 PRD 文件名**（即真的打开它）。

- **例外必须显式登记并带理由**（`PRD_CITE_EXEMPT`）——
  目前只有 1 条：`verify-release-gate.mjs`（该处只是 ADR 登记表里的**描述行**，
  §110 的数值已由台账护栏从 PRD 原文读值；**再读一遍会制造第三份副本**）。
- **例外表双向核对**：登记了但已不再引用 ⇒ 报错（**防化石例外**掩盖未来回归）。
- **覆盖下限**（`cited.length < 2` ⇒ 报错）：结构漂移会让本判据**空转**。
- **canary 与判据共用同一条正则**（`CITES_PRD`），双向：`'PRD §110 …'` 必须命中、
  `'PRD 110 …'`（无 `§`）必须不命中。
- ⚠️ **范围如实声明**（写进注释）：只扫 `tests/parity/verify-*.mjs`（发布门禁自动发现的那一族），
  **不含** `tests/qualification/*`（人工记录器）与其他目录。

**元护栏注入验证 3/3**：① 删掉例外条目 ⇒ `verify-release-gate.mjs` 被报裸引用；
② 把「真的打开了 PRD」的判定改成恒假 ⇒ **5 个文件同时被报**（说明判据确实在比对，
不是只报了登记过的那一个）；③ 把例外表改成**化石条目**（登记 `verify-menu-contract.mjs`）
⇒ 「已不再引用」分支报错。复原后绿。

### 教训

> **「清零」比「逐个修」更需要一个可重跑的口径。**
> 本轮能说「4 → 0」，靠的不是「我读了一遍」，而是**一条命令**（`verify-*.mjs` × 两个正则）。
> 而且**手工清点出来的结论必须立刻变成判据** —— 否则它下一轮就变成一句
> 「我记得都改过了」，而这正是本审计反复抓到的失效形态（§4.52 / §4.55 / §4.64）。
> ⇒ **收口类工作结束时问一句：「这件事下一次靠什么被发现？」**

## 4.83 第三处 HTML 净化器：自称「与编辑器对齐」，实测**已漂移**且**零测试覆盖**（2026-10-06）

### 怎么发现的

§4.81 为 PRD §48 建判据时，我**如实登记**了一条范围缺口：

> 「已有的『两处 HTML 净化器必须一致』**不覆盖导出那处**（白名单是 `sanitize-html` 配置数组，形态不同）。」

本轮把这条缺口收口。**先量集合关系，再决定要不要改**：

```text
engine = 41   reader = 41   export = 71
engine \ export = ['KBD']        ← 差异
reader \ export = ['KBD']
export \ engine = ANNOTATION INPUT KATEX … NAV SECTION SEMANTICS（导出自身产物，有意多放行）
```

⇒ **导出白名单漏抄了 `kbd`**：编辑器那组的 40/41 逐字一致，唯独少了 `kbd` —— 是**漏抄**，不是有意排除。

### 影响（实测确认，不靠推断）

导出侧用 `disallowedTagsMode: 'discard'`。**实测**该语义是「**去标签、保文本**」：

```text
'<p>a</p><kbd>Ctrl</kbd><object>OBJ</object>'  →  '<p>a</p>CtrlOBJ'
```

（与 `script` / `style` 属 `nonTextTags`、**连内容一起丢**不同。）

⇒ 后果：**`<kbd>` 在编辑器/Reader 里渲染成按键样式，导出 HTML 时被剥成纯文本**。
不丢字、不报错、**屏幕上看不出原因** —— 正是本仓这一族判据要防的形态。

### 第二个发现：`sanitizeOutput` 此前**零测试覆盖**

导出包 7 个测试文件里，**只有** `rawHtml: false`（整体转义）那条路径被测过；
而 `rawHtml` **默认就是 `true`**，走的是 `sanitizeOutput` 白名单 —— **从未被测**。
⇒ 白名单漂移既无测试、也无护栏，**没有任何信号**。

### 修复

1. **产品**：导出白名单补回 `'kbd'`，并在该组上方写明
   「**必须逐字包含** `editor-engine/src/safeHtml.ts` 的 `ALLOWED_TAGS`」+ 本次漂移的事故记录。
2. **护栏**（`verify-parity-ledger.mjs`）：新增「编辑器/Reader 白名单 **⊆** 导出白名单」判据。
   **锁子集关系，不是相等** —— 导出有意多放行 TOC / footnote / task list / KaTeX 等自身产物。
3. **测试**（新增 `packages/export/test/sanitize.test.ts`，10 例）：`kbd` 保留、常见行内/块级标签保留、
   video/audio/iframe + sandbox、`no script`、`no inline events`、`no JavaScript URL`、`style` 被剥、
   `target=_blank` 补 `rel`、`discard` 语义、配置单例同源。

> **⚠️ 写测试时当场抓到我自己的一个错误假设**：我最初把 `input` 列进「应被剥掉的标签」——
> 测试**立刻变红**（`<input />` 活着）。回查后确认：`input` **不在**编辑器白名单里、
> **在**导出白名单里，是 **task list 复选框**的有意产物。
> ⇒ 已改为一条**正向**断言记录这处「有意差异」，并在测试文件里写明
> 「其余断言**不得**把 `input` 当作应被剥的标签」。
> **这正是「先跑再写结论」的价值** —— 若只「读代码推断」，这条错误假设就会进测试。

### 注入验证

| 注入 | 期望 | 结果 |
|---|---|---|
| **还原原始缺陷**（导出白名单删 `kbd`） | 红（报 app-core **与** engine 两侧缺失） | ✅ |
| 编辑器白名单加 `MARK`（导出没有） | 红 | ✅ |
| Reader 白名单加 `MARK`（导出没有） | 红 | ✅ |
| **导出多放行一个 `mark`（编辑器没有）** | **仍绿**（子集 ≠ 相等，**防误报**） | ✅ |
| 谓词 `missingInExport` 放宽为恒空 | canary 报错 | ✅ |

无变异对照绿、复原后绿。`npm run parity` 全绿；`packages/export` 单测 **100/100**（8 suites）；`tsc --noEmit` 通过。

### 教训

> **「范围缺口」被如实登记之后，必须回头收口 —— 否则登记本身就成了终态。**
> §4.81 我把「导出那处不在扫描面里」写进了遗留；本轮证明：**缺口里当时就藏着一个真缺陷**
> （而且是「自称对齐却已漂移」+「零测试」两件事叠加）。
> ⇒ **判据的扫描面缺口不是「已知限制」，是「尚未检查的样本」** —— 应尽快去看，而不是记下来。

## 4.84 「自称对齐」的普查（一）：把 174 条收窄到 12 条高风险，抓到 1 处真缺口（2026-10-06）

### 方法

§4.83 的成因是「**文件头自称与 X 对齐，但没人核对**」。于是做一次**全仓普查**：
扫 `.ts/.tsx/.mjs/.cjs/.rs` 的注释行，匹配「与 … 对齐 / 一致」「必须同步 / 一致」「同源」
「stay in sync」—— 命中 **174 条**。

**174 条不能逐条当缺陷看** —— 必须先分类再定扫描面，否则会把**设计声明**误判成缺陷：

| 类别 | 例 | 是否该有判据 |
|---|---|---|
| **高风险**：声明**两处具体代码产物**必须一致 | 「两份阈值必须一致」「CSS 与 JS 必须同源」 | **是**（与 §4.83 同型） |
| 中风险：声明**同一设置/键**在两处被读 | 「storageKey 与 App 侧同源」 | 是（锁键名一致） |
| 低风险：**设计意图**声明 | 「与 Typora 一致」「与 CommonMark 一致」 | 否（不是两处代码同步） |
| 低风险：**测试名**里的「与…一致」 | `test('…与线性扫描一致')` | 否 |

⇒ 收窄为「高风险」（注释行 + 有具体代码锚点 + 排除设计意图/测试名）后剩 **12 条**，逐条核对：

- **10 条已有判据**（多数就写在护栏文件自己的注释里，或已被既有护栏覆盖）——
  例：`largeFile.ts`「两份阈值必须一致」（`verify-parity-ledger` 四方同锁）、
  `reader.ts`「与 safeHtml.ts 同源」（两处一致护栏）、
  `verify-shell-typography.mjs`「正文字号两个消费方必须同源」。
- **1 条是真缺口**（见下）。
- 1 条是护栏自己的注释（`verify-parity-ledger.mjs` 的 §48 块）。

### 真缺口：`clearRecentItems` 的「状态与 localStorage 必须同步清理」

`apps/desktop/src/App.tsx` 的 `clearRecentItems`（G7-MENU-14）自己声明：

> 「Typora 不是『直接清空』——它先让用户选择作用域：文档 / 历史文件夹与文件 /
> 历史及固定的文件夹与文件。**状态与 localStorage 必须同步清理**。」

而**全仓对该函数的唯一引用是一处 `useCallback` 依赖数组的正则**（只是**容忍**它出现，
不检查任何东西）。⇒ 只清 state 不清 storage（或反之）时：
**界面上已清空、重启后条目又回来** —— 屏幕上看不出原因。

**新增判据**（`verify-settings-contract.mjs`）：

1. 从 `clearRecentItems` 体内解析 `set*([])` 与 `localStorage.removeItem(KEY)`，
   **两者数量必须相等**（成对清理）；
2. **下限**（各 ≥3 = 三档作用域）—— 低于此值说明解析或实现漂移（防空转）；
3. 每个被删的键**必须在该文件里真的被写过**（`localStorage.setItem(KEY`）——
   防「删了一个写错的键名」这种**假清理**。

**⚠️ canary 当场抓到我的一个正则错误**：键名模式初版写 `[A-Z_]+`（**不含数字**），
而 canary 样本用了 `K1` ⇒ 匹配不上 ⇒ 判「合法成对样本不成对」⇒ **护栏自己变红**。
改为 `[A-Z_][A-Z0-9_]*` 后通过。**这正是 canary 该做的事** ——
若没写 canary，这条判据会带着「键名不能含数字」的隐藏约束上线，将来遇到带数字的键名会**误报**。

### 注入验证 5/5

| 注入 | 结果 |
|---|---|
| 删掉一处 `localStorage` 清理（只清 state） | ✅ 红 |
| 键名写错（删一个从未写入的键） | ✅ 红 |
| 整个函数被删 | ✅ 红 |
| 谓词放宽：`states` 恒 0 | ✅ 红（下限 + 不成对 + canary 同时报） |
| 谓词放宽：`keys` 恒空 | ✅ 红 |

无变异对照绿、复原后绿。

### 遗留（如实登记，本轮未做）

**中风险那一类（同一设置/键在两处被读）尚未逐条过**；174 条里也未逐条分类完毕
（本轮只处理了「高风险」12 条）。⇒ 下轮入口：按上表把 174 条**逐条归类**，
再决定中风险那批是否值得建判据。

## 4.85 「自称对齐」普查（二）：174 条逐条归类 → 中风险那一类落到「持久化键」上（2026-10-06）

### 方法：先把 174 条归类，再看中风险那类能不能变成判据

| 类别 | 条数 | 处置 |
|---|---|---|
| 高风险（两处具体代码产物必须一致） | 17 | §4.83/§4.84 已处理 |
| **中风险（同一设置/键在两处被读）** | **10** | **本轮** |
| 低风险（设计意图 / 测试名 / 官方文案） | 15 | 不是缺陷 |
| 其他（未归类） | 82 | 待逐条归类 |

中风险那类的共同形态是「**同一个 storageKey 在两处被读**」。⇒ 把它变成一条**可机械判定**的判据：
**持久化键必须「在设置 schema，或显式登记为有意非设置」**。

理由：`restoreAllSettingsDefaults` **只遍历 `SETTINGS_SECTIONS`** ⇒ 不在 schema 里的键
**既不出现在设置页、也不会被「恢复默认」清理** —— 而这一点此前**没有任何东西在守**。

### ⚠️ 扫描面：只扫一半的形态 = 漏检一半的对象

**实测（本轮自己踩到并当场纠正）**：

| 扫描面 | 命中的非 schema 键 |
|---|---|
| 只扫「存储 API 的**字面量**键」（`localStorage.getItem('mellow.x')`） | **6** |
| 再加上「**`const X = 'mellow.*'` 声明**」 | **21** |

差别来自**声明为 const 后间接使用**的形态（`SHORTCUT_OVERRIDES_KEY` / `RECENT_FILES_KEY` …）。
**只扫字面量会把 15 个键整个漏掉** —— 同 §4.79 的「只核对一半的列 = 没核对」。
⇒ 已把**两种形态都写进判据**，并为「const 形态」单独加了一条 canary
（若有人把该形态从扫描面里砍掉，canary 立刻报错）。

> **另一侧的过度扫描同样要防**：若宽松地扫所有 `'mellow.*'` 字面量，会把 **CSS 类名**
>（`mellow-md-image` / `mellow-toc`）也算进来 —— 实测噪声从 **21 涨到 90+**。
> 用 `mellow.`（**带点**）即可天然排除连字符类名，并已加 canary 锁住这条边界。

### 21 个非 schema 持久化键（已逐条登记理由）

| 组 | 键 |
|---|---|
| 视图 / 会话状态 | `tabs.session` / `closedFiles` / `window.bounds` / `sidebar.width` / `sidebar.visible` / `reader.zoom` |
| 「最近使用」记忆 | `recent.files` / `recent.folders` / `recent.folders.pinned` / `quickOpen.recent` / `commandPalette.recent` / `fileTree.root` / `export.last` |
| **面板/视图选项** ⚠️ | `fileTree.options` / `outline.options` / `statusbar.fields` |
| 通道 / 兜底键 | `engine.features` / `engine.locale` / `md.tokens` / `shortcuts.overrides` |
| 版本级记忆 | `updater.skippedVersion` |

**`mellow.shortcuts.overrides` 已有成文决定**：`restoreAllSettingsDefaults` 的文档**明确**写了
「不覆盖快捷键自定义」并给出理由（独立 override 层 + 已有逐项恢复，调用方需在文案里说明）——
登记时**引用该决定**，不是重新发明。

### ⚠️ 如实报告（**不擅自改**）：3 个「看起来像设置、但不在 schema」的键

`mellow.fileTree.options` / `mellow.outline.options` / `mellow.statusbar.fields` 都是
**用户可配置项**（面板右键 / 状态栏右键），但**不在 schema** ⇒
**点「恢复默认设置」不会重置它们**，而用户在设置页里也**找不到**它们。

⇒ 本轮**登记为「已知且非 schema」，不等于「已裁决为正确」**（例外表的理由里逐字写明这一点），
并在本节登记为**待裁决**。按 `AGENTS.md`「不要自行修改架构，先报告冲突」，
**未擅自把它们搬进 schema**（那会牵动设置页结构、i18n 文案、applyCommand 与 restore-defaults 语义）。

**裁决入口**：若判为「应进 schema」⇒ 走正常设置项流程（schema + i18n + applyCommand + 单测）；
若判为「有意留在 schema 外」⇒ 需明确**用户如何重置它们**（否则「恢复默认」的名义与行为不符）。

### 判据形态

- 集合关系：**持久化键 ⊆ (schema ∪ 例外表)**；
- **例外表双向**：登记了但已进 schema / 已不再被持久化 ⇒ 报错（**防化石例外**）；
- **覆盖下限**（`schema < 50` 或 `持久化键 < 40` ⇒ 报错）：扫描面漂移会让判据**空转**；
- **canary 与断言共用同一函数对象**（`unregisteredOf`），**三向**（在 schema 的 / 已登记的 / 未登记的）；
- 另加两条**形态 canary**（const 形态必须被识别、CSS 类名必须不被识别）。

### 注入验证 6/6

| 注入 | 结果 |
|---|---|
| 新加一个字面量持久化键（未登记） | ✅ 红 |
| 新加一个 **const 声明**的持久化键（未登记） | ✅ 红 |
| 例外表**化石**：把已登记的键写进 schema | ✅ 红 |
| 例外表**化石**：删掉一个已登记键的使用 | ✅ 红 |
| 谓词放宽：`unregisteredOf` 恒空 | ✅ 红（canary） |
| **扫描面砍掉「const 声明」形态** | ✅ 红（下限 45→24 + 形态 canary） |

无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

**本轮无产品改动** ⇒ 不发新版本。

### 遗留

- 「其他（未归类）」那 **82 条**尚未逐条归类。
- 上面 3 个「看起来像设置」的键**待裁决**（见上）。

## 4.86 一次**差点做成的静默回归**：把「两种有意不同的语义」当成重复代码去合并（2026-10-06）

### 怎么走到这一步的

继续归类「其他 82 条」时，注意到**一组可疑的重复**：8 个引擎扩展的注释都写着
「与 X 一致」，而实际代码里：

| 形态 | 出现处 |
|---|---|
| 含边界 `head >= X.from && head <= X.to` | `inlineExtras.ts` / `kbdCaps.ts` / `mdLink.ts` ×2 / `wikilink.ts` ×2 |
| 严格内 `head > X.from && head < X.to` | `math.ts`（`caretInside`）/ `mermaid.ts`（`caretInside`） |
| 严格内 `pos > from && pos < to` | `toc.ts` / `githubAlerts.ts` / `footnote.ts`（`inside`，**逐字相同地定义了 3 遍**） |

**当时的判断**：「这是重复代码 ⇒ 抽一个共享 helper，把 8 处收拢成 1 处」。
这个判断**看起来很自然**，而且本仓的文档里恰好有一句支持它的话
（`restoreAllSettingsDefaults`：「少一条路径就少一处将来会漂移的地方」）。

### ⚠️ 回查后否掉：那**不是**重复代码，是**两种语义**

`packages/editor-engine/test/widget-state-matrix.test.ts` 的文件头**已经文档化**了这件事：

```text
各家族 caret 语义（源码证据）：
  - math.ts caretInside: head > from && head < to（严格）
  - mermaid.ts caretInside: 同上（严格）
  - toc/yaml/githubAlerts/footnote inside(): pos > from && pos < to（严格）
  - image/widget.ts: node.from <= head && node.to >= anchor → 隐藏（含边界）
  - wikilink.ts: head >= from && head <= to → 定界符隐藏（含边界）
```

而且有**成文的字段与断言**：`WidgetFamilyCfg.boundaryReveals`（「边界（head = from/to）是否显示源码」）
+ `caret-before` / `caret-after` / `selection-full` 三条测试按该字段分支。

⇒ **两种语义是有意的**：

- **含边界**家族（链接 / 双链 / kbd / 高亮）：caret 紧贴定界符 ⇒ **显示源码**（用户正要编辑它）；
- **严格内**家族（Math / Mermaid / TOC / Alerts / Footnote）：caret 紧贴定界符 ⇒ **不显示源码**。

**若按原计划合并**：`math.ts` / `mermaid.ts` 的边界行为会**从「不显示源码」变成「显示源码」**
—— 一次**静默的编辑器行为回归**，而且**现有测试很可能仍然全绿**
（`widget-state-matrix` 按 `boundaryReveals` 分支断言，若我把两个家族都改成同一个谓词，
测试会按**新的** `boundaryReveals` 取值去断言 —— 除非有人同时改字段，否则**测试不会报**）。

⇒ **本轮不做这个重构**，改为**把「按家族保持哪种语义」变成判据**。

> 这是本会话**第 4 次**「回查来源后否掉一个看似合理的结论」
> （前三次：`T-0602` 主题数 / `T-0702` journeys 数 / PRD 的 `1.14.6` 基线）。
> **每一次否掉，都避免了一次真实的错误改动。**

### 修复：新增「caret 边界语义按家族锁定」判据（`verify-parity-ledger.mjs`）

- 声明 **9 个家族文件**各自的期望形态（含边界 4 个 / 严格内 5 个）；
- 逐文件断言该形态**存在**（找不到任何形态 ⇒ 响亮失败，不静默漏检）；
- **不断言「一个文件只能有一种形态」** —— `githubAlerts` / `footnote` 同时含
  「`ranges.some` 跳过检查（含边界）」与「`inside` reveal 判定（严格内）」两件事，
  断言互斥会**误伤**；
- **覆盖下限**（`checked < 9` ⇒ 报错，防空转）；
- **与文档化来源挂钩**：`widget-state-matrix.test.ts` 必须仍**声明** `boundaryReveals`
  且**实际使用**它（`.boundaryReveals`）。
  ⚠️ 初版只断「出现过 `boundaryReveals`」—— 那是 §26 的「**出现过 ≠ 有人用**」：
  只声明字段却不再读它，判据仍会通过。已拆成**声明**与**使用**两条断言。

### 注入验证 9/9

| 注入 | 结果 |
|---|---|
| `wikilink` / `mdLink` / `kbdCaps`：含边界 → 严格内 | ✅ 红（3/3） |
| `math` / `mermaid` / `toc`：严格内 → 含边界 | ✅ 红（3/3） |
| 谓词放宽：`REVEAL_STRICT` 恒真 | ✅ 红（canary：含边界样本被误判为严格内） |
| **全局重命名** `boundaryReveals`（字段消失） | ✅ 红（声明断言） |
| **只保留声明、删掉全部使用** | ✅ 红（使用断言 —— 化石字段） |

无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

> ⚠️ **注入脚本本身踩过一次坑**：第一版用 `String.replace(a, b)` —— 它**只替换首处**，
> 于是 `wikilink` / `mdLink`（各 2 处）的注入**只改了一半** ⇒ 判据看到另一种形态仍在 ⇒
> 误判为「护栏无效」。改成 `split(a).join(b)`（全局）后 3/3 全红。
> ⇒ **注入必须全局替换**，否则「注入失败」会被误读成「护栏失效」。

### 教训

> **「看起来像重复代码」不等于「重复代码」。** 合并之前必须回答：
> **这两处的语义**（边界 / 空值 / 顺序 / 错误处理）**是否真的相同？**
> —— 名字相同**不是**证据（本例两个 `caretInside` 同名不同义）；
> 名字不同也**不是**反证。
>
> ⇒ **去重是一次行为变更，不是一次格式整理。** 去重前必须能说出
> 「合并后**哪些输入**的结果会变」，答不上来就**先别合并**。

## 4.87 「自称对齐」普查（三）：174 条归类收口 —— 锁住一条**成立**的声明，如实登记一条**不成立**的（2026-10-06）

### 方法：把 82 条「其他」逐条归类

| 归类 | 条数 | 处置 |
|---|---|---|
| **护栏/测试自身的说明文字**（「本节锁 X 与 Y 一致」——**声明本身就是判据**） | ~40 | 不是缺口 |
| 设计/行为对齐声明（「与 `window.prompt` 语义一致」等） | ~30 | 不可机械判定，非缺口 |
| 已共用实现或已有判据（Large File 视口余量 / 写作宽度三段同源 / 侧栏宽度同源 …） | ~10 | 逐条核对，**均有守护** ✓ |
| **可机械判定且此前无人核对的** | **2 组** | 见下 |

**普查至此收口**：174 条 = 高风险 17（§4.83–§4.84）+ 中风险 10（§4.85）+ 低风险 15 + 其他 82（本节）。

### 抽查一：`marginPt` 默认值 —— **不是缺陷**（回查后否掉）

`print.ts` 与 `printStyle.ts` 各写一句「页边距（pt），默认与 PDF 一致 60」，看着像两处副本。
**回查**：默认值只有一个落点 —— `printStyle.ts` 用 `options.marginPt ?? PDF_TYPOGRAPHY.margin`
（真值源 `typography.ts` = 60），且 `print.test.ts` 有断言
`expect(PRINT_STYLESHEET).toContain('margin: ${PDF_TYPOGRAPHY.margin}pt')` 把它绑到真值源。
⇒ **单一真值源 + 测试**，`print.ts` 那句只是**接口文档**。**不是缺陷。**

### 抽查二：`slugifyHeading` —— **四处实现**，其中一处**不成立**

标题锚点规则（「标题 → `#anchor`」）在本仓有 **4 份实现**：

| # | 位置 | 规则 | 自称 |
|---|---|---|---|
| 1 | `editor-engine/src/toc.ts` | 保留 `\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}`，其余 → `-`；空回退 `heading` | — |
| 2 | `export/src/html/markdown.ts` | **与 #1 逐字相同** | **「与 editor-engine 一致」** |
| 3 | `app-core/src/reader.ts` | 先去 HTML 标签 → **删** `[^\p{L}\p{N}\s-]` → `[\s_]+`→`-`；空回退 `section` | 只自称「与 render 对齐」 |
| 4 | `app-core/src/outline.ts::headingOffsetForAnchor` | `[^\p{L}\p{N}]+` → `-`，**对锚点与标题两侧同规则** | — |

**实测**（从源码抽函数体后**原样求值**，20 个样本语料）：

- **#1 与 #2 行为完全一致** ⇒ 那条「与 editor-engine 一致」的声明**成立** ✓
- **#3 与 #1/#2 在 6/12 个样本上不同**：

| 输入 | #1 / #2 | #3（Reader） |
|---|---|---|
| `a_b` | `a-b` | `ab` |
| `日本_語` | `日本-語` | `日本語` |
| `What's new?` | `what-s-new` | `whats-new` |
| `Hello 世界 😀` | `hello-世界-😀` | `hello-世界` |
| `!!!` | `heading` | **`-`** |
| `---` | `heading` | **`-`** |

- **#4 是自洽的**（锚点与标题走同一条规则 ⇒ 两边同时化简，仍能匹配）✓

### 处置

1. **把成立的那条声明锁成不变量**（新增判据）：`export/html/markdown.ts` 的 `slugifyHeading`
   必须与 `editor-engine/src/toc.ts` 的**行为一致**（同一语料 20 例逐例比对）。
   ⚠️ **判据用「行为比对」而不是「逐字比对」**：两份排版不同
   （一份 `return title\n .trim()…`，另一份 `return (\n title\n .trim()… )`）—— 逐字比会**误报**，
   而真正要守的是「同一输入 → 同一锚点」。（初版正是逐字比，**当场误报**，已改。）
2. **不去统一 #3**（按 §4.86 的教训：统一会改掉 Reader 的 heading id，是**行为变更**）。
3. **如实登记为待裁决**（见下），**本轮未擅自改**。

### ⚠️ 待裁决（如实登记，含可复现证据）

**问题**：`app-core/reader.ts` 的标题 id 与「编辑器 TOC / 导出 HTML」**不是同一套规则**。
- 直接后果：**同一标题在 Reader 与导出 HTML 里得到不同锚点**；
- 其中 `!!!` / `---` 会得到 **`id="-"`**（退化锚点），且**不同标题撞成同一个 id**；
  `a_b` 与 `ab` 也会撞成同一 id。
- **未验证的**（不写成结论）：Reader 内是否存在「点 TOC 跳转」依赖该 id 的路径 ——
  本轮只确认了**规则不同**，**未**确认端到端可复现的用户可见故障。

**裁决入口**：若判为「应统一」⇒ 需明确 **Reader 的锚点是否属于对外契约**
（若有人已把 Reader 锚点写进文档/链接，统一会**改掉既有锚点**）；
若判为「有意不同」⇒ 需在 `reader.ts` 的注释里**写明理由**（目前只有「与 render 对齐」，没说与引擎不同）。

### 注入验证 7/7

| 注入 | 结果 |
|---|---|
| `export` 去掉 Emoji 类 | ✅ 红（1/20 样本不一致） |
| `export` 回退词 `heading` → `section` | ✅ 红（4/20） |
| `export` 连字符 `-` → `_` | ✅ 红（**16/20**） |
| `engine` 去掉 Emoji 类 | ✅ 红 |
| `engine` 回退词 `heading` → `anchor` | ✅ 红 |
| 语料被砍到 1 个样本 | ✅ 红（下限 20） |
| canary（把 export 结果加 `-drift`） | ✅ 内建自检 |

无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### 教训

> **「自称一致」的两种命运：锁住成立的，登记不成立的 —— 但都**不要**擅自统一。**
> - 声明**成立**时（#2）⇒ 加判据**锁住**，否则它迟早会漂散（§4.83 就是漂散后的样子）；
> - 声明**不成立**时（#3）⇒ **如实登记 + 给可复现证据 + 标待裁决**，
>   **不**把「统一」当成修复 —— 统一是**行为变更**（§4.86）。
>
> 另一条方法学：**判据要按「要守的东西」选形态**。
> 本例要守的是「同一输入 → 同一锚点」（**行为**），而初版判据守的是「两份源码长得一样」（**文本**）
> —— 后者**当场误报**。⇒ **先问「我要守的到底是什么」，再选判据形态。**

## 4.88 换一条普查轴：「哪些 `docs/` 从未被审计过」（2026-10-06）

### 方法

沿用 §4.77 的方法，但**推广到整个 `docs/`**（74 份 `.md`，不含 `archive/`）：
逐份问「审计文档里提到过它吗」。**口径必须同时接受三种引用写法**
（本轮的**两个错误口径**已当场纠正）：

1. 只按**完整文件名**匹配 ⇒ 误报 52 份（审计大量使用**去扩展名**写法，如「`desktop-ui-design-spec` §3」）；
2. 加上「去扩展名」后 ⇒ 仍误报 27 份 ADR（审计引用 ADR 用**编号** `ADR-0024`，不是文件名）；
3. **三种写法都接受**（文件名 / 去扩展名 / ADR 编号 / 日期+主题）⇒ **26 份从未被提及**。

> ⚠️ **口径本身要先用已知样本校准**：第 1 版口径把「已审过的 10 份 specs」全判成「未审」——
> 与我上一轮刚做的结论**直接矛盾**。**矛盾出现时先怀疑口径，不要怀疑结论。**

### 结果与分诊（26 份）

| 类别 | 份数 | 判断 |
|---|---|---|
| `ADR-0001`–`ADR-0018` 等 **6–10 行**的短记录 | 16 | 一行决策 + 状态，**无「现状断言」** ⇒ 无腐烂面，低优先 |
| `docs/qualification/` 的 **2026-08-18 期**证据记录（rc-audit / p0-scope-status / runtime-matrix-evidence / release-candidate-audit / real-desktop-execution-bundle / v1.0-release-notes / phase1-...manual） | 7 | **归档证据**，职责就是记录当时状态 ⇒ 不按「当前」读；但**需确认它们不冒充现状** |
| **`docs/plans/packaging-release.md`（130 行，P3 发版手册）** | 1 | ⚠️ **人手跟着做** ⇒ **本轮处理**（见下） |
| `docs/superpowers/specs/2026-08-11-image-file-ops-design.md`（118 行） | 1 | 位置特殊（`docs/superpowers/`），未审计 ⇒ **登记为遗留** |
| `ADR-0021`（47 行）/ `ADR-0023`（20 行） | 2 | 未逐字审 ⇒ **登记为遗留** |

### 本轮处理：`packaging-release.md` —— 6 处失真，其中 2 处**会直接害到发版的人**

先对全文的**可核对断言**逐条取证（引用文件 / `tauri.conf.json` 键 / 命令）。

> ⚠️ **引用约定（2026-10-08，审计 §4.148 补）**：**本小节里的 `§N` / `§N.M` 一律指
> `docs/plans/packaging-release.md` 的小节**（本小节审的就是它）—— **不是**本文档的小节。
> 补这条是因为原文写成「**本文件** §3.1」，而本文档里「本文件」= **审计文档** ⇒ **读者会读错**。

**取证为「成立」的**（不必改）：§2 产物矩阵与 `bundle.targets` 一致 ✓；§4 的 `hardenedRuntime` +
`entitlements` ✓；§5 的 `pubkey` 非空 + `endpoints` 指向 GitHub Releases ✓；§6 的
`licenseFile` / `license` / `resources` map 形式 ✓ 且**未配置 `infoPlist` 键**（与文中「不要配置」的警告一致）✓；
§7 `fileAssociations` = `md` / `markdown` ✓；§8 的 `tests/qualification/run-packaging-smoke.sh` **存在** ✓；
§9 的 `cargo test --test file_safety_corpus` **target 存在** ✓；引用的 6 个文件**全部存在** ✓。

**失真与修复**（下表 `§N` 同上的块级限定词：均指 `packaging-release.md`）：

| # | 原文 | 实测 | 处置 |
|---|---|---|---|
| 1 | §1「当前版本：**0.1.0**（**三处**一致）」 | 真值源 = **1.5.28**；且升版是 **4 处** | 删掉硬编码（**改为指向真值源**）；写明「**4 处**」+ `Cargo.lock` **需手改** |
| 2 | §1 只说同步到 `package.json` / `Cargo.toml` | `sync-version.mjs` 只同步 **3 处**（实测），**`Cargo.lock` 漏在外** | 补 `Cargo.lock` + `cargo check --locked` |
| 3 | §3.1 的示例 `git tag v0.1.0` | 过期字面量 | 改 `v<版本>` 占位符 |
| 4 | §5 / §9-6「发布到 endpoints 指向的**服务器**」 | endpoints 指向 **GitHub Releases 的 latest.json**，由流水线自动产出 | 改写：**不需要也不存在另一台服务器** |
| 5 | §9-2「`npm run build` 全绿」作为渲染层验证 | `apps/desktop` 的 `build` = `build-editor-bundle + tsc + vite`，**不构建各包 `dist`** ⇒ **正是「6 天旧引擎进包」那个坑** | 改为 `npm run parity` + 警告，并给出 `build-local.sh` |
| 6 | §9-7「**Draft** Release 审核后发布」 | 与**`packaging-release.md` 自己 §3.1 的 2026-10-05 更正**（finalize 一步发布到位）**自相矛盾** | 改为「无需人工发布（ADR-0031）；停在 Draft = 构建真的不齐」 |
| 7 | §9-3「推 `v*` 标签」 | 缺「先推 `main` 等 CI 全绿」这一步 | 补上顺序 |

> **#6 值得单独记**：**同一份文件里，一处更正了、另一处没更正** ——
> 这是本仓反复出现的形态（§4.77 的 `T-0301` vs `T-0410` 同型）。
> ⇒ **更正时要扫全文的同类表述**，不能只改「你正好看到的那一处」。

### 判据：把「版本字面量」绑到真值源

`docs/plans/packaging-release.md` 里出现的 `X.Y.Z` 字面量，必须**等于真值源
（`tauri.conf.json` 的 `version`）**，或**显式登记理由**（例外表**双向**核对，防化石例外）。

- **首选是不写死**（正文已改为指向真值源 / `v<版本>` 占位符）；
- 确需出现的两处已登记并给出理由：`0.1.0`（**更正块引用的旧值**——更正惯例必须引用错误原文）、
  `v1.5.2`（**历史起点**，不是当前版本）。

**注入验证 5/5**：文档写回过期版本号 / 新增未登记异值 / 删掉例外表里的 `v1.5.2`（**化石例外**）/
清空例外表 / 谓词恒空 —— 全部红；无变异对照绿、复原后绿。

> ⚠️ **注入脚本又一次踩了同一个坑**：用 `[].slice(0) && X` 造「恒空谓词」——
> **`[]` 在 JS 里是真值**，`[] && X` 就是 `X` ⇒ **注入根本没生效**，
> 却被读成「护栏无效」。这已是本会话**第 2 次**（§4.86 同型）。**已入库 PITFALLS。**

### 教训

> **普查换轴（按目录 → 按文件类型 → 按引用写法）时，口径必须先用「已知已审」的样本校准。**
> 本轮两次口径错误都是**用未校准的新口径去量**，得到的数字与刚做的结论**直接矛盾**。
> ⇒ **数字与已知结论矛盾时，先验口径。**
>
> 另一条：**「未被提及」不等于「未审」** —— 26 份里 23 份是**短记录**或**归档证据**
>（职责就是记录当时状态），只有 **1 份是「人手跟着做」的手册**。**分诊比计数重要。**

## 4.89 收口 §4.88 的三份遗留：一份设计稿 + 两份 ADR（2026-10-06）

### ① `docs/superpowers/specs/2026-08-11-image-file-ops-design.md`（118 行，Approved）

**先逐条取证**（不靠阅读推断）：

- **§7 分层里列出的 8 个文件全部存在** ✓
  （`editor-engine/src/image/{scan,assetConfig,ops,engineApi,widget}.ts`、
  `app-core/src/{imageFileOps,documentRename,fileOpHistory}.ts`）；
- **§8 的两个 Rust 依赖都在 `Cargo.toml`** ✓（`trash = "5"`、`ureq = "2"`）；
- **§5 的 `showConfirm` 仍成立** ✓（`documentRename.ts` 仍调 `dialog.showConfirm`）。

**一处失真**：§11 偏差记录写「Rename 输入用 `window.prompt`」——
**实测全仓 `window.prompt` 的非注释用法 = 0 处**，已由应用内输入对话框 `askInput` 取代
（commit `5cb37df` 迁移 9 处），且 `verify-shell-widgets.mjs` **有护栏**锁「不得再用 `window.prompt`」。

**处置**（沿用「不改写历史、只追加更正」惯例）：加**快照声明头**（本文是 2026-08-11 快照，现状以代码为准）
+ **§12 更正块**（指出 §11 那一行已不成立，并列出取证为成立的部分供复核者省事）。

> **附带发现（已写进快照声明头）**：本文件位于 `docs/superpowers/specs/`，
> **不在任何护栏的扫描面内** —— `verify-doc-code-refs.mjs` 的 `DOC_GLOBS` 只含
> `docs/plans` / `docs/adr` / `docs/specs`。⇒ 其中的路径/契约断言**没有机器守护**。

### ② `ADR-0023`（20 行）—— **逐条核对全部成立** ✓

「菜单单一真源 = `menuSchema`」「快捷键只定义一次」「Cheatsheet 从注册表派生」
「权限边界：核心包平台中立」四条与代码一致，且引用的两个护栏
（`verify-menu-contract.mjs` / `verify-menu-contract-guard.mjs`）**都存在**。

### ③ `ADR-0021`（47 行）—— **1 处结构缺陷 + 1 处被超越的结论**

- **结构缺陷**：`### 真机 Runtime 矩阵（待执行）` **连续重复两行**（行 33/34，复制粘贴残留）。
  全量扫 `docs/adr/**` 后确认**仅此一处**。
- **被超越的结论**：「后果 2」写「真机矩阵…**阻塞「V1.0 正式发布」结论**」——
  已被 **ADR-0031**（2026-10-05，**用户裁决**「忽略真机 Gate 回填，正式发布」）**超越**。
  ⇒ 追加更正块（**不改写原文**）：**发布状态已变、完成度未变**，该表述按**当时**读。

### 新增判据：同一文档内**标题不得重复**

与 §4.78（PRD 子节被写成一级标题）**同族**：这类**结构缺陷**
**不会被任何「内容核对」发现**（两边文字都对），渲染出来只多一行同样的标题、
**看起来像排版风格**；但会让**按标题定位**的引用/锚点指向**第一个**，而作者可能想的是第二个。

- 扫描面：`docs/adr` + `docs/specs`（**下限 20 份**，防空转）；
- 比较键 = **层级 + 文本**（`## A` 与 `### A` 是合法的不同标题，**不断言互斥**）；
- canary **双向**：同层同文本必须判为重复；**不同层同名必须不判为重复**（防「过宽」）。

**注入验证 4/4**：恢复 ADR-0021 的重复标题 / 给某 spec 注入重复标题 /
`HEADING_RE` 恒不匹配 / `headingKey` 恒返回 `null` —— 全部红（后两条由「**过宽**」canary 抓住）。
无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### 教训

> **「结构缺陷」需要专门的判据 —— 内容核对永远看不见它。**
> 本会话已抓到两次同族：**PRD 子节层级**（§4.78）、**文档重复标题**（本节）。
> 两次都不是「写错了内容」，而是「**内容对、结构错**」，且**渲染出来像风格问题**。
>
> 另一条：**「被后续裁决超越的结论」要追加更正，不要改原文** ——
> 但要**明确指出「按当时读」还是「已不成立」**，否则下一个读者会拿旧结论当现状
> （本仓 `ADR-0020` / `ADR-0024` 正文仍写 pre-release，那是**历史记录**，不是现状 —— 同型）。

## 4.90 归档证据里的**最危险一份**：`p0-scope-status-2026-08-18.md` 的头条结论已不能按「当前」读（2026-10-06）

### 为什么挑它

§4.88 的 26 份里，7 份是 `docs/qualification/` 的 2026-08 期记录。其中
**`p0-scope-status-2026-08-18.md`（80 行）名字里就带 "status"** —— 最容易被当成**当前**就绪度引用。

### 发现：头条结论与**当前门禁**不一致

| 项 | 该报告（2026-08-18） | 当前真值源 |
|---|---|---|
| 条目集 | **60 项** | **50 项**（`typora-parity-ledger.json`；门禁自报「50 P0 items」） |
| 未闭环 | **2 项**（待真机） | **9 项**（含 4 项「标 `AUTO` 但 `requiredEvidence` 含 `ux-gate`」，ADR-0024 A3 不得以 AUTO 收口） |
| 达 `PASS-E` | —（未使用该口径） | **0/50** |

⇒ 报告结论句「**P0 60 项中 58 项代码侧完成；2 项需真机执行**」
**不得当作当前就绪度引用**。

### 逐条更正（取证后）

| # | 原文 | 实测 | 判定 |
|---|---|---|---|
| 13 | **Tabs「✅」** | `verify-shell-widgets.mjs`：`Tabbar` / `tab-overview` / `autoHideTabBar` **已全量移除**（B1 SDI）；`desktop-ui-design-spec` §4 整节作废 | **已不成立**（不属 V1 范围） |
| 3 | 「editor-engine **491** 测试」 | **1293**（79 suites） | 过期计数 |
| 39 | 「**6** 内置原创主题」 | 实际 **8**（`mellow-light`/`mellow-dark`/`paper`/`git-light`/`git-dark`/`newsprint`/`whitey`/`gothic`） | **不是失真** ——「6」是 **PRD 的要求数**，属**超额**（勿「修正」回 6） |

**处置**：追加更正块（**不改写原文**；本文已有 2026-10-05 / 2026-08-24 两个更正块的先例）。

### 附带发现：**幽灵引用**

该报告的「参考」里写 `docs/plans/typora-deep-parity-plan.md`（阶段 0-4 进度记录）——
**该文件不存在**（`docs/plans/` 与 `docs/plans/archive/` 都没有）。
⚠️ **§4.93 更正**：本行原写「**从未入库**」—— **不准确**。它**不是「从未存在」**，
而是**已被取代并删除、且未归档**：`AGENTS.md` 记录「2026-08-22 起由 `typora-parity-master-plan.md`
取代旧 **checklist / audit / review / deep-parity-plan** 四文档」，而 PRD **§148** 曾把
`typora-parity-checklist.md` 列入「PRD 定稿后按顺序生成」的清单 ⇒ 这批文档**确实存在过**，
后被取代并**未归档**（`docs/plans/archive/` 里只有 v4/v5/v6 计划与 SDI 真值表）。
⇒ 「幽灵引用」的性质因此**略有不同**：不是「引用了从未存在的文件」，而是
「**引用了已被取代且未归档的文件**」—— 判据（引用必须可达）不变，但**归因要准确**。

**全仓普查**：`docs/**` 里引用 `docs/**/*.md` 且目标不存在的，**共 2 处**，都是这同一个幽灵名
（`golden-journeys-2026-08-19.md` 与 `p0-scope-status-2026-08-18.md`）。
第 3 处引用在 `.trae/documents/`（**已被 gitignore** 的本地 IDE 目录，不入库）。
⇒ 已把两处改为指向 **`docs/plans/typora-parity-master-plan.md`（V7.0）** 与 `docs/plans/archive/`。

### 新增判据：文档里引用的 `docs/**/*.md` 必须存在

- **扫描面扩到整个 `docs/`**（与 §4.76 只扫 `docs/architecture` 的反引号路径不同），
  且**不要求反引号**（幽灵引用常常是裸路径）；
- 三种解析（仓库相对 / 相对 `docs` / 相对 `docs/plans`）—— 历史文档常省略前缀；
- **例外必须显式登记 + 双向**：更正块**必然要引用错误原名**（本仓惯例「不改写历史、只追加更正」），
  故幽灵名会**合法地**出现在「说明它不存在」的句子里 —— 例外表里已登记并给出理由；
- **覆盖下限**（`docs/**` 的 md 份数 < 50 ⇒ 报错）；canary **双向**。

**注入验证 3/3**：某文档新增幽灵引用 / 例外表被清空 / 谓词放宽 —— 全部红；
无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### 教训

> **归档证据里，名字带「status / 现状 / 就绪度」的那一份最危险** ——
> 它的**日期**是唯一的「过期信号」，而读者常常只读结论句。
> ⇒ 处置优先级：**先给这类文档加「快照声明头 + 更正块」，再考虑其他**。
>
> 另一条：**幽灵引用是「引用的可达性」问题**，与 §4.78（标题层级）/ §4.89（重复标题）**同族**
> —— **内容对、引用断**，只有**可达性判据**能发现。

## 4.91 收口 §4.88 的剩余 6 份：三份「裁决互相矛盾」的记录 + 给整个目录加**快照声明**判据（2026-10-06）

### 发现：三份记录**互相矛盾**，而它们都**没有快照声明头**

| 文件 | 头条裁决 | 日期 |
|---|---|---|
| `rc-audit-2026-08-16.md` | 「存在 FAIL → **V1.0 禁止标记**」（13 项 blocker） | 2026-08-16 |
| `v1.0-release-notes.md` | 称已发布 **1.0.0**（含 UX Score **94/100**） | 2026-08-16 |
| `release-candidate-audit-2026-08-18.md` | 称「**待**生成 V1.0 Release Notes」（待办 #4） | **2026-08-18（更晚）** |

⇒ **同一天的两份结论相反**，而**更晚**的那份还在说「待生成」**更早**就已存在的 release notes
（**时序矛盾**）。三者都能被当成「当前就绪度」读，而**没有一句话说清「这是当时」**。

### 逐条取证后的失真

| 文件 | 原文 | 实测 |
|---|---|---|
| `v1.0-release-notes` | 版本 **1.0.0** | `tauri.conf.json` = **1.5.28** |
| `v1.0-release-notes` | 「自动化测试 **916 项**」 | **仅 editor-engine 就 1293**（79 suites） |
| `v1.0-release-notes` | Source Fidelity「**135** 文件 0 diff」 | 与 RC 审计的「**141** 文件」**互相矛盾**；且仓库内 `tests/fixtures` 下 `.md` **仅 27 份** ⇒ corpus **本仓不可复现**（**无锚点数字**，§4.64 同族） |
| `v1.0-release-notes` | 「UX Score **94/100**（≥92 ✅）」 | 当前门禁报 **`ux-gate` 未执行**（`PASS-E = 0/50`），且记录器**只接受人工记录** ⇒ 该分数是历史测量 |
| `v1.0-release-notes` | 「已知限制：endpoints 为占位地址 `updates.mellow.app`」 | 现为 **`https://github.com/jincaiw/Mellow/releases/latest/download/latest.json`**（v1.5.2 起替换）⇒ **已不成立** |
| `release-candidate-audit` | #1「PRD §133 **60 项**：58 完成」 | 台账 **50 项** / 门禁 **9 未闭环 / `PASS-E = 0/50`** |
| `release-candidate-audit` | #3「引擎 **495** 测试」 | **1293** |

**处置**：三份各加**快照声明头 + 更正块**（**不改写原文**）。

### 新增判据：`docs/qualification/` 的每份记录必须带**快照声明**

**判据**：非豁免的 `docs/qualification/*.md`，其**前 14 行**必须含快照标记
（`快照声明` / `不是当前` / `已过期` / `历史记录` / `按当时读` 之一）。

- **默认「每份都要」**，而不是「按启发式挑出结论型」——
  初版用启发式（标题含「结论/裁决/状态」才要求）**少抓 5 份**
  （`golden-journeys-2026-08-19` / `macos-ime-matrix-2026-08-13` /
  `markdown-syntax-demo-parity-2026-08-23` / `real-desktop-execution-bundle` /
  `v1.0-final-release-review-2026-08-16`）。**启发式在这里只会制造盲区**；
- **例外表显式 + 双向**：目前仅 2 条 —— `ux-score-gate-template.md`（**模板/工具**，不含某次结论）、
  `release-blocker-audit-2026-09-25.md`（**现状真值源本身**，是滚动日志，不是快照）；
- **下限 8 份**（防空转）；canary **双向**（含「无标记样本必须不被识别」的**过宽**方向）。

**为 12 份记录补齐了快照声明头**（内容统一为「本文是 `<日期>` 的历史记录，不是当前就绪度；
当前状态真值源 = `verify-release-gate.mjs` 的输出（9 项未闭环 / `PASS-E = 0/50`）；发布状态为正式发布（ADR-0031）」）。

### 注入验证 4/4

| 注入 | 结果 |
|---|---|
| 删掉某份的快照声明 | ✅ 红 |
| **新增**一份无标记的记录 | ✅ 红 |
| 例外表**化石**（登记不存在的文件） | ✅ 红 |
| 谓词放宽为 `/./` | ✅ 红（**过宽** canary） |

无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### 教训

> **日期写在标题里 ≠ 读者知道这是历史。**
> 本目录 **17/17 份都有日期**（在标题里），却仍被读成现状 —— 因为**缺的是那句「这不是当前、当前在哪儿」**。
> ⇒ **过期信号要显式，不能靠推断**；而且**默认就该有**（不按启发式挑）。
>
> 另一条：**「互相矛盾的记录」比「单份过期」更危险** —— 读者会**挑对自己有利的那份**。
> 三份矛盾时，**必须有一份被指认为真值源**（本例：`verify-release-gate.mjs` 的输出 + 本审计日志）。

## 4.92 台账自身从未被审：**状态词表三处互不核对**，且 §4.3 定义的 `PASS-BETTER` **无法表达**（2026-10-06）

### 换轴：从「审文档」到「审**台账**」

前面 8 轮审的都是**文档**。台账 `tests/parity/typora-parity-ledger.json`（50 项 P0）**从未被审** ——
它虽有「`evidence` 必须指向文件 / 不得指向 gitignore / 未闭环必须声明 `blockedBy`」等护栏，
但那些都在守**格式**，**没人核对它自己的声明**。

### 发现一：`allowedStatuses`（护栏硬编码）与 `statusDefinitions`（台账声明）**互不核对**

实测：`verify-parity-ledger.mjs` **完全不读** `statusDefinitions`（`includes('statusDefinitions') === false`），
而它把 10 个状态**硬编码**在自己文件里 ⇒ **在任一侧加/删状态都不会有任何信号**。

**为什么这有后果**：门禁的「**不阻断口径**」= `PASS-E` / `PASS-B` /
**`AUTO` 且 `requiredEvidence` 不含 `ux-gate`**（ADR-0024 Q1=A3）—— 它**依赖 `AUTO` 的含义**
（master-plan §4.3：`自动化测试通过，未完成真机体验验收`）。
⇒ 若把台账里的 `AUTO` 释义改成「已完成」，**门禁仍会通过**，而语义已变。

### 发现二：§4.3 定义的 `PASS-BETTER` **在台账与护栏里都不存在**

master-plan §4.3 的状态表列了 **10 个状态**，其中 **`PASS-BETTER`（「Better 项通过对照或盲测」）**
**不在**台账的 `statusDefinitions` 里，也**不在**护栏的 `allowedStatuses` 里
（全仓 `PASS-BETTER` 只出现 6 处：§4.3 表 + §4.3 结尾句 + 归档 v4 计划 + `generate-typora-menu-dump.mjs` 的一句禁令）。

而 §4.3 结尾**明写**：

> **最终「Done」只能是 `PASS-E` 或 `PASS-BETTER`。**

⇒ **有 Better 项通过盲测时，按宪法无法标记 Done**（只能标 `PASS-E`，与 master-plan §4.3 的区分丢失）。
⚠️ 注意它**不是** `grade: B` 的重复：master-plan §4.2 的 `grade`（E/B/D）说的是「**该项是不是 Better 项**」
（台账里 14 项 `grade: B`），master-plan §4.3 的 `PASS-BETTER` 说的是「**那个 Better 项的验收级别**」。

**当前是「潜伏缺口」**：`PASS-E = 0/50`，还没有任何项走到 Done ⇒ 尚未被触发。

### 处置（**不擅自补状态**）

补一个状态会牵动**护栏、门禁口径、以及 50 项既有数据** ⇒ 按 `AGENTS.md`「先报告冲突」，
本轮**只做三件事**：

1. **锁「护栏 ⇄ 台账」双向一致**（新增判据）—— 防两处静默漂移；
2. **锁「台账 ⇄ master-plan §4.3」双向一致**（**扫 §4.3 原文**，不采信台账自述）——
   `PASS-BETTER` 走**显式例外表**（带理由：**已知缺口，待裁决**），
   使「要么补状态、要么改 §4.3」这件事**无法被静默忽略**；
3. **锁 `AUTO` 的释义**必须仍含「自动化 / 真机 / 未完成」且**不含「已完成」** ——
   因为门禁的「不阻断口径」依赖它。

**裁决入口**：给台账 + 护栏补 `PASS-BETTER`（并同步门禁口径），或把 §4.3 的该行与
「Done 只能是…」一句改掉（说明 Better 项以 `grade=B` + `status=PASS-E` 表达）。

### 发现三：`updatedAt` **从未被读**且已过期

实测：`updatedAt` 全仓**只出现在它自己的声明里**（从未被任何代码/文档读），
且值为 **2026-09-12** —— 而台账此后被改过多次。

**处置**：更新为 `2026-10-06` + 加**合理值**判据（合法日期 / 不早于声明下限 / 不在未来）。
⚠️ **不假装能自动检测「陈旧」** —— 它是**人工维护字段**，无自动推导来源（判据注释里写明这一点）。

> ⚠️ **施工中我自己的判据当场误报**：首版用 `new Date().toISOString()`（**UTC**）算「今天」
> ⇒ 沙箱 UTC 为 `2026-10-05`，而本地（GMT+8）已是 `2026-10-06` ⇒ **把合法的本地日期判成未来**。
> 已改为**同时接受 UTC 与本地两种「今天」**（取较晚者）。

> ⚠️⚠️ **而上面那次修正仍然不够 —— CI 实测把它打回来了**（这是本轮最值得记的一段）：
> `111de1b` 的 CI **两个 parity-guard job 真实 `failure`**（其余 6 个 job 全成功），日志：
>
> ```text
> - 台账 updatedAt（2026-10-06）晚于今天（UTC 2026-10-05 / 本地 2026-10-05）—— 请勿填写未来日期
> ```
>
> **根因**：CI runner 在 **UTC**（`2026-10-05`），而该值是我按**本地**（GMT+8）写的 `2026-10-06`。
> 我上一次的修正只对齐了**校验环境内部**的 UTC/本地，**没考虑「写入环境」与「校验环境」是两个时区**
> —— 校验环境里 UTC 与本地**同为** `2026-10-05`，两个「今天」都救不了。
>
> **正确修法（带容差 + 推导）**：时区偏移 ∈ `[-12h, +14h]`
> ⇒ 「写入方的本地日期」最多比「UTC 日期」**超前 1 天**（`date(T+14h) − date(T) ≤ 1`）
> ⇒ 上限取 `max(utcToday, localToday) + 1 天`。**「不早于下限」一侧仍严格**（防回退）。
>
> **验证方式也随之升级**：任何含「今天/日期」判据的护栏，**必须本地与 `TZ=UTC` 两种环境各跑一次**
> （`TZ=UTC node tests/parity/verify-….mjs`）—— 本轮修正后两侧均绿。
>
> **教训（可复用）**：**「本地绿」不等于「CI 绿」，只要判据里出现了「今天」。**
> 日期类判据要么**带时区容差**，要么**根本不判「未来」**（本例保留容差，因为它仍能抓住 `2027-01-01` 这类明显错误）。

### 注入验证 7/7

| 注入 | 结果 |
|---|---|
| 台账加一个未定义状态 | ✅ 红（护栏 ⇄ 台账 失配） |
| 护栏加一个台账没有的状态 | ✅ 红 |
| **§4.3 删掉 `PASS-B` 行**（宪法缺项） | ✅ 红（台账有但宪法未定义） |
| 台账 `AUTO` 释义改成「已完成」 | ✅ 红 |
| 台账**补上** `PASS-BETTER`（例外表应报化石） | ✅ 红（双向核对） |
| `updatedAt` 回退到下限之前 | ✅ 红 |
| `updatedAt` 填未来日期 | ✅ 红 |
| 谓词放宽：`setDiff` 恒空 | ✅ 红（canary） |

无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### 教训

> **「有护栏」不等于「被审过」。** 台账有一整套格式护栏（evidence 是文件 / 不是 gitignore /
> 未闭环有 blockedBy / AUTO 引用 CI 制品），**恰恰因此没人再去看它自己的声明** ——
> **格式合规会制造「已被守护」的错觉**（同 §4.26「冒烟冒充机制断言」）。
> ⇒ **审计要问「这个对象自己的声明有没有人核对」，而不是「它有没有护栏」。**
>
> 另一条（施工坑）：**「今天」在 UTC 与本地可能差一天** —— 任何「不得为未来日期」的判据
> 都必须**同时接受两种时区的今天**，否则会在跨时区时**误报合法值**。

## 4.93 审**治理文件 `AGENTS.md`** 自身：3 处失真，其中 1 处是「更正没扫全文」的复发（2026-10-06）

### 换轴：从「审台账」到「审治理文件」

§4.92 的教训是「**有护栏 ≠ 被审过**」。沿这条线再往前推一格：**`AGENTS.md` 是治理文件**
（规定文档层级、目录约定、包依赖），它是**所有任务的入口** ——
而它的**扫描面不在任何护栏里**（`DOC_GLOBS` 只含 `docs/plans|adr|specs`；
§4.76 的架构护栏只扫 `docs/architecture`）。审计里提到 `AGENTS.md` **15 次**，
**全部是「作为引用来源」**，**从未被审**。

### 逐条取证（先列「成立」的，避免只报坏消息）

**取证为「成立」的** ✓：目录约定里 **12 个包全部存在**；`README.md` **确有「核心原则」节**（第 87 行）
⇒ 「P0 门槛」引用有效；`docs/architecture/` 目录存在；PRD **§113.4 = 「平台代码隔离规则」**
⇒ 包依赖图末尾的引用有效；`docs/plans/typora-parity-master-plan.md` / `codex-implementation-plan.md` 均存在。

### 三处失真

| # | 位置 | 原文 | 实测 | 性质 |
|---|---|---|---|---|
| 1 | `packages/editor-core/` 行 | 「vendored MarkEdit CoreEditor（**只读**）」 | 其 `UPSTREAM.md`：**修改 19 / 新增 3** | ⚠️ **同一处失真我在 §4.76 于 `docs/architecture/editor-core.md` 修过，`AGENTS.md` 被漏掉** ⇒ **「更正没扫全文」复发**（同 §4.91 的教训） |
| 2 | `docs/architecture/` 行 | 括号内清单：`overview/editor-core/host-adapter/monorepo/migration`（**5 个**） | 实际 **7 个**（另有 `README.md` / `extension-api.md`） | 清单没枚举全（同 §4.28） |
| 3 | `packages/` 清单 | 列出 **12 个** | 实际 **15 个**（漏 `desktop-ui` / `export` / `settings`） | 同上；且该清单**自称穷举** |

**另有一处「角色冲突」**：`AGENTS.md` 的「权威文档」表把 **P3 施工图**指向
`codex-implementation-plan.md`，而 **master-plan 自称「Typora 对标工作的唯一权威实施方案」**，
`codex-implementation-plan.md` 又自称「**任务编号脚手架，不是状态台账**」
⇒ **同一角色（施工依据）被指派给两个文件**。

### 处置

1. **#1**：改为「**注入式扩展、不 fork**；改动清单见其 UPSTREAM.md」——
   **指向真值源、不复述数字**（19/3 会漂；且 `verify-upstream-manifest.mjs` 已在守那份清单）。
2. **#2**：括号清单**改为指向该目录 README.md**（从根上消除「清单会过期」这件事）。
3. **#3**：**补齐 3 个包**（`desktop-ui` / `export` / `settings`），并**由护栏双向锁定**。
4. **角色冲突**：按两个文件的**自述**调和 —— **P3 施工图 = master-plan**，
   codex 计划降为**从属的编号脚手架**，并把两条自述**原文写进表下**。
   ⚠️ **未发明新层级**，只是把已有的自述写清楚。
5. **`master-plan` 的「待确认」标记**：该标记是 2026-09-11 起草时写下，而此后本方案
   已作为施工依据被持续执行 ⇒ **标记与实际使用状态不一致**。
   ⚠️ **只标记、不擅自改**（确认属**人工签署**动作）—— 已在文档头加说明并登记为**待裁决**。

### 新增判据：`AGENTS.md` 的路径与包清单必须与实际一致

覆盖**可机械判定的那一半**（#1「只读」是语义判断，**不在判据范围**，已人工更正）：

- `AGENTS.md` 里以反引号给出的**仓库相对路径必须存在**；
- 「目录约定」里列出的 `packages/<name>` **双向**等于实际的 `packages/*`
  （「列出的必须存在」+「存在的必须被列出」）；
- 覆盖下限（解析出的包数 ≥ 10）+ canary **双向**。

**注入验证 4/4**：引用不存在的路径 / **删掉一个包** / **列一个不存在的包** / 谓词放宽 —— 全部红；
无变异对照绿、复原后绿；本机 **19 个护栏 + ux-gate-recorder 自测全绿**。

### ⚠️ 一处自我更正（§4.90 的措辞）

§4.90 说 `docs/plans/typora-deep-parity-plan.md`「**从未入库**」—— **不准确**。
本轮取证（`AGENTS.md` line 52 + **PRD §148**）表明：该名**确实存在过**
（PRD §148 把 `typora-parity-checklist.md` 列入「PRD 定稿后按顺序生成」的清单），
后于 **2026-08-22 被 master-plan 取代并删除、且未归档**
（`docs/plans/archive/` 里只有 v4/v5/v6 计划与 SDI 真值表）。
⇒ **判据（引用必须可达）不变，但归因要准确**：
「引用了**已删除**的文档」≠「引用了**从未存在**的文档」—— 前者提示「该补归档」，后者提示「该删引用」。
已在 3 份文档与护栏注释里更正措辞。

### 教训

> **「更正」必须扫全文的同类表述 —— 这是本会话第二次栽在同一处。**
> §4.91 记过这条（`rc-audit` 的更正没扫 `v1.0-release-notes`），本轮**又复发**
> （§4.76 更正了 `docs/architecture/editor-core.md` 的「只读」，却漏了 `AGENTS.md` 的同一句）。
> ⇒ **具体做法**：更正一处表述后，**立刻对全仓 grep 该表述的关键词**（本例是「只读」+`editor-core`），
> 而不是靠回忆「我改过那一处了」。
>
> 另一条：**治理文件（`AGENTS.md`）的扫描面通常是空白** —— 因为它「不是文档也不是代码」。
> 而它恰恰是**所有任务的入口**。⇒ 审计清单里应**显式包含治理文件本身**。

### ✅ 规则当场见效：「扫全文」立刻又抓到 **3 处**同一表述

写下上面那条教训后，**立刻执行**（全仓 grep `只读` + `editor-core|CoreEditor|vendor`）——
结果**除我刚改的两处外，还有 3 处仍在陈述「只读」**：

| # | 位置 | 原文 |
|---|---|---|
| 4 | `README.md`（仓库根，目录结构图） | 「editor-core/ # vendored MarkEdit CoreEditor（**只读**，见 UPSTREAM.md）」 |
| 5 | `docs/architecture/overview.md` §现状 | 「CoreEditor vendored（**只读**）✅」 |
| 6 | `packages/editor-core/README.md`（**该包自己的 README**） | 「**只读，不修改源码**」+「（固定 commit 81da2a20，**只读**）」 |
| 7 | `THIRD_PARTY_NOTICES.md` | 「vendored 目录**保持只读**」 |

⚠️ **#6 尤其要紧**：它与**同一个包内**的 `UPSTREAM.md`（修改 19 / 新增 3）**直接矛盾**。

**统一改为**：「**注入式扩展、不 fork 上游**；对上游树的改动**必须登记**（清单见 `UPSTREAM.md`，
由 `verify-upstream-manifest.mjs` 双向锁定）」—— 即**指向真值源、不复述数字**。

**复验**：全仓 grep 后剩 **3 处命中，全部是审计/计划记录里的引文**（引旧措辞说明「它不成立」），
**无一处仍是陈述** ✓。

> **这条规则的价值当场被证明**：如果只改「触发它的那两处」，**4 处失真会留在仓库里**
> （其中 1 处还在**包自己的 README** 里，与同包的 UPSTREAM.md 直接打架）。
> ⇒ **「改完之后必须扫全文」不是建议，是收口动作的一部分。**

## 4.94 审**仓库门面 `README.md`**：5 处失真 + 新增「markdown 链接可达性」判据（2026-10-06）

### 换轴：门面文件同样落进「既不是文档也不是代码」的缝

`README.md` 是**最常被点开**的文件，而它此前**只被部分护栏覆盖**
（`verify-doc-release-gate.mjs` 只锁「状态行 ⇄ `prerelease=`」那一段）。
⇒ 与 §4.93 的 `AGENTS.md` 同一处境。

### 5 处失真（逐条取证）

| # | 位置 | 原文 | 实测 |
|---|---|---|---|
| 1 | 文档体系表 | 「施工图」列 **两个并列文件**（codex 计划 + master-plan） | 与 §4.93 调和后的角色（master-plan = 唯一权威；codex = 从属脚手架）**不一致** |
| 2 | 目录结构 `adr/` | 「ADR-0001 ~ **ADR-0021**」 | 实际 **ADR-0001 ~ ADR-0031**（**31 个**）—— 且与**本文档自己的**文档索引段「~ ADR-0031」**自相矛盾** |
| 3 | 目录结构 `plans/` | 「Typora **深度对标计划**」 | 该文档**已于 2026-08-22 被 master-plan 取代并删除**（§4.93 已确认） |
| 4 | 目录结构 `architecture/` | 括号清单列 **5** 个 | 实际 **7** 个 |
| 5 | 目录结构 `desktop-ui/` / `app-core/` | 列了 `Tabbar`、`Welcome`、`Tabs` | `Tabbar` 随 **B1 SDI** 移除、`Welcome` 随 **B2 第四轮**移除、`Tabs` 被 **SDI 否决**；且 `desktop-ui` **漏了** `SidebarHeader` / `SidebarFooter` |

**修法**：**易漂的清单改为指向真值源** —— `adr/` 指向目录（不写范围）、
`architecture/` 指向其 `README.md`、`desktop-ui/` 指向该包 `src/index.ts` 的导出。

> **#2 值得单独记**：**同一份文件里两处写着不同的 ADR 范围**（0021 vs 0031）。
> 这正是「更正没扫全文」（§4.91 / §4.93）在**单文件内部**的形态 ——
> 文件内两处同类表述也会分叉。

### 新增判据：**markdown 相对链接必须可达**

本文件此前已有两条「路径可达性」判据，但**形态不同**：
① §4.76 = `docs/architecture` 里的**反引号**路径；② §4.90 = 整个 `docs/` 里的**裸**路径。
而**最常被点**的是第三种：**markdown 链接** `[文字](相对路径)` —— 例如 `README.md` 的「文档索引」整段。

**实测规模**：全仓 **1037 条相对链接**。

**⚠️ 必须跳过三种「合法的不可达」**（否则假阳性 —— 实测首版报 **29 处**、加过滤后真断链 **0 处**）：

| 形态 | 例 | 为什么合法 |
|---|---|---|
| **围栏代码块 / 行内代码**里的示例 | `` `[label](src)` ``、```text [text](URL) ``` | 是**语法示例**，不是链接 |
| **测试夹具**（`tests/fixtures/**`、`tests/benchmark/**/{work,fixtures}/**`） | `[相对链接](../docs/specs/…)` | 它们是**链接渲染语料**，**故意**含断链 |
| **更正/引用块** | 「原写 `[x](old.md)`」 | 更正必然引用旧路径 |

**注入验证 5/5**：README 加断链 / spec 加断链（**应红**）+
**围栏代码块内**加断链 / **测试夹具内**加断链（**应绿 —— 防误报**）+
谓词放宽（canary 报错）。无变异对照绿、复原后绿。

> ⚠️ **canary 也当场补了一处**：首版 canary 只测「绝对 URL / 锚点被跳过」，
> 而把正则放宽成 `([^)]*)` **不会**触发它们（过滤谓词仍会拦下）——
> 但它会把 `[a](x.md "标题")` 的**标题属性并进目标** ⇒ **假阳性**。
> ⇒ 补了第 4 向 canary（**带标题属性的链接只能取到路径**），并把过滤谓词抽成**共用函数**。

### 教训

> **「路径可达性」有三种形态**（反引号 / 裸路径 / markdown 链接），
> **只做一种 = 只覆盖一部分**（同 §4.70「只扫一半的形态 = 漏检一半的对象」）。
> 而 **markdown 链接是读者真正会点的那种** —— 它最该有判据，却**最后**才被覆盖。
>
> 另一条：**「同一文件内两处同类表述」也会分叉** ——
> 更正时不但要扫**全仓**，也要扫**同文件**。

### ⚠️⚠️ CI 当场抓到本判据的一个**严重缺陷**：基线拿「被生成物污染的本地计数」校准

首次推送（`4ffb8e2`）后，两个 parity-guard job **真实 failure**：

```text
- markdown 链接可达性普查只解析出 25 条相对链接（下限 500 = 立此判据时的基线）
```

**根因（两层，都值得记）**：

1. **夹具豁免不全**：`tests/benchmark/fixtures/` **自带 `.gitignore`（内容为 `*`）**——
   是 `generate-fixtures.mjs` **本地生成、不入库**的夹具。其中 `1000-images.md`
   **一个文件就含 1000 条相对链接**。而我的 `FIXTURE_RE` 只豁免了
   `tests/fixtures/**` 与 `benchmark/**/{work,fixtures}/`，**正则漏了 `benchmark/fixtures/` 这一形态**
   ⇒ 该文件被计入。
2. **下限按污染值校准**：本地实测 **1037** 条（其中 **1000** 条来自那一个文件），
   于是我设了下限 **500**。而 **CI 里该文件不存在** ⇒ 只剩 **25** ⇒ **必然撞穿**。

**修法**：
- `FIXTURE_RE` 补上 `benchmark/fixtures/`；
- 下限改为 **15**，并**写明真实基线 = 25（已排除生成型夹具）**；
- **把计数打印出来**（本地与 CI 可对照）——首版没打，这正是「下限按污染值校准」没被发现的原因。

**验证**：修后本地输出 `markdown 相对链接 **25** 条（已排除生成型夹具）`，
**与 CI 的 25 完全一致** ✓；全仓扫描确认**只有这一个**生成型 md 目录
（3 个 `.gitignore` 里只有它写了 `*`）。

> **教训**：**判据的「基线/下限」必须在「干净检出」下校准** ——
> 而**本地不是干净检出**（有生成物、有 `node_modules`、有构建产物）。
> ⇒ 校准任何阈值前先问：**「这个计数在 CI 的检出里还成立吗？」**
> 并且**把计数打出来**，让本地/CI 能对照（否则污染值不会暴露）。

## 4.95 审**包接线**：4 个包零消费者，其中 `document-model` 是**架构级**发现（2026-10-06）

### 换轴：从「文档」到「**包接线**」

本仓的跨包导入走**相对路径**（如 `../../../packages/settings/src`），
**不是** `@mellow/*` 包名 ⇒ **没有任何东西保证一个包被用到**。
而 `pnpm-workspace.yaml` 覆盖 `packages/*` ✓、每个包都有 `build` 脚本 ✓，
`pnpm -r run test` 也**不会漏**（实测：3 个无 `test` 脚本的包**确实没有 `test/` 目录**，
且**没有任何包「有测试文件却无 test 脚本」**）—— **接线是自洽的** ✓。

⇒ 于是问题变成：**哪些包根本没人 import？**

### 发现：4 个包零跨包消费者

| 包 | 规模 | 性质 |
|---|---|---|
| **`document-model`** | **317 行 src + 270 行测试** | ⚠️ **架构级**：按 **ADR-0008** 实现了完整文档模型（id/path/revision/dirty/encoding/EOL/diskState/cursor/scroll），**但无任何跨包导入** |
| `editor-react` | 42 行 | README / AGENTS.md 均注明「契约 re-export；组件化 UI 见**阶段 2 计划**」⇒ **有意预留** |
| `shared` | 70 行（`debounce` / `Emitter` / `assert`） | ⚠️ 零消费者 |
| `workspace` | 72 行（`WorkspaceModel` 等） | ⚠️ 零消费者 |

**`document-model` 为什么是架构级**：`packages/app-core/src/documentState.ts` 有**同一套字段**
（`DocumentTab` 的 `path/content/dirty/documentId/revision/encoding/eol/diskState`），
且**不 import `document-model`** ⇒ **ADR-0008 的实现在仓库里，但 app 用的是另一套**。

> 这是「**存在 ≠ 有人用**」的**最强形态**：不是一个死函数，而是
> **一个 ADR 的落地实现整体未被采用**，而另一处**重新实现**了同一套字段。

### 处置（**不擅自改架构**）

按 `AGENTS.md`「不要自行修改架构，先报告冲突」——三条路都需裁决：
① 把 `app-core` 接到 `document-model`（大改）；② 删包并改 ADR-0008（或新增 ADR 说明）；
③ 明确「阶段 2 计划」并写进文档。**本轮只登记，不动代码。**

### 新增判据：无消费者的包**必须显式登记理由**

**⚠️ 测量口径踩了 4 次才定准**（全部当场被自己的输出暴露）：

| # | 错法 | 后果 |
|---|---|---|
| 1 | 按「文件里出现过包名」判 | 注释 / **局部变量名**（`const workspace = …`）/ **同名测试目录**（`tests/shared/`）全被算成消费者 ⇒ **假阳性一片** |
| 2 | 只匹配**单引号** `from '…'` | 漏双引号 ⇒ 假阴性 |
| 3 | 在 `node -e` 里塞含引号的正则 | **shell 转义把正则改坏** ⇒ 15 个包**全报无消费者**（明显荒谬才被识破） |
| 4 | `ownerOf` 把**整个** `packages/editor-core/` 排除 | 它作为**目标**也被判 null ⇒ `editor-core` **假阴性**（正确做法：只排除 `packages/editor-core/CoreEditor/`） |

⇒ 最终口径：**只认模块说明符**（`from '…'` / `import('…')`，单双引号均可）+
**只排除 vendored 上游** + **试 4 种落点**（`base` / `.ts` / `.tsx` / `/index.ts`）。

**判据**：无消费者的包必须进 `PKG_NO_CONSUMER_EXEMPT`（带理由）；例外表**双向**
（一旦接线就报错）；包数下限；canary 双向（vendored 上游必须被排除 / 普通包必须被识别）。

**注入验证 4/4**：给 `shared` 接线一个消费者（例外表双向报错）/ 新增一个无消费者包 /
例外表键名被改 / `ownerOf` 恒 null（canary）。无变异对照绿、复原后绿。

### 教训

> **相对路径导入的 monorepo 里，「包被用到」这件事没有任何东西保证。**
> `package.json` 的 `name` / `main` 是**装饰性的**（没人按名导入）⇒
> **不能从「包在 workspace 里 + 有构建脚本」推出「它在被使用」**。
>
> 另一条（方法学）：**测量的口径要能被「荒谬结果」自证** ——
> 第 3 次口径错时**15 个包全报无消费者**，正是因为结果**荒谬到不可能**才被发现。
> ⇒ **看到「全中」或「全不中」时先怀疑口径**（同 §4.88「数字与已知结论矛盾时先验口径」）。

## 4.96 审 **Rust ↔ 前端命令边界**：最硬的一层跨层契约此前无护栏，且**同类事故已真实发生过**（2026-10-06）

**动机**：「跨层字段必须两端同时锁」已覆盖三处（菜单 `dispatchCommand`、设置 `applyCommand` ↔ `applySetting`、
文案 `t()` ↔ i18n），但**最硬的一层边界没有任何护栏** ——
前端 `invoke('name')` ↔ Rust `#[tauri::command]` ↔ `generate_handler![…]` 注册表。
三者任一错位**都不会在编译期报错**，只在**运行时 reject**。

**⚠️ 这不是假想的风险，本仓真实发生过**：`apps/desktop/src/App.tsx:4849` 的注释记录了
旧机制 `invoke('set_spellcheck_state')`「**必然失败**」—— 该命令已被架构移除（同文件 4945 行亦有说明）。
当时是**靠人读代码**发现的；本护栏把这条边界变成机器判据。

**实测（2026-10-06）**：声明 **D = 59**、注册 **R = 59**、前端调用 **F = 59**，
`D∖R = F∖R = R∖D = R∖F = ∅` —— 现状**健康**。本节的价值在于**把它锁住**，而不是修一个当前不存在的缺陷。

### 口径：6 次踩坑，每次都由一次「荒谬结果」暴露

| # | 错法 | 后果 |
|---|---|---|
| 1 | 把**成员调用**也算成 Tauri 命令 | `bridge.invoke({…})` / `imageHost.invoke(…)` 是 **bridge 协议 / host 对象** ⇒ 误报 `copyFile` / `writeBinary` 为「调用了未注册命令」 |
| 2 | 为了排除 #1 而**一律排除成员调用** | `window.__TAURI__.core.invoke('bridge_call', …)` 是**真** Tauri 调用 ⇒ 误排除（`bridge_call` 从 F 里消失） |
| 3 | 泛型用 `<[^>]*>` | 嵌套泛型 `invoke<Array<{ path: string }>>('read_dir', …)` 在第一个 `>` 处收尾 ⇒ **漏检** `read_dir` / `detect_open_with` |
| 4 | **自动发现** invoke 包装器（「函数体后 4000 字符里出现 `invoke(`」） | 发现 **40 个**「包装器」，含 `fail` / `doc` / `onChange` / `hasSelection` ⇒ 假阳性 `H1` |
| 5 | 用**块注释正则**剥注释（斜杠星号 … 星号斜杠，非贪婪） | **在 TSX 上不安全**：JSX 的注释包裹写法与正则字面量里的斜杠星号会让匹配**跨越大段代码** —— 实测 `App.tsx` **351734 → 297769** 字符，把真实调用 `invoke('set_menu_spec', …)` 一起删掉 ⇒ **假阴性** |
| 6 | 干脆**不剥注释** | `packages/editor-engine/src/image/host.ts` 的文档注释里有 `invoke('fs', …)`、`App.tsx` 注释里有 `invoke('set_spellcheck_state')` ⇒ **把已经修好的问题重新报成缺陷**（比漏报更糟） |

⇒ 最终口径：**按行前缀判定注释**（`inComment`）+ **非成员 `invoke`** + **`__TAURI__` 全局桥** +
**显式包装器清单**（`INVOKE_WRAPPERS`，双向自检防化石）。

### 新增护栏 `tests/parity/verify-tauri-command-contract.mjs`（第 **20** 个）

四条「必须为空」的判据：
- **① `D∖R`** —— 声明了 `#[tauri::command]` 但未注册 ⇒ **命令不可达**（前端调用必失败）；
- **② `F∖R`** —— 前端在调未注册的命令 ⇒ **运行时 reject**；
- **③ `R∖D`** —— 注册了但找不到声明（编译期应报，留作扫描面自检）；
- **④ `R∖F`** —— 注册了但前端**一个字面量调用都没有** ⇒ 必须显式登记理由。

> **④ 同时是「扫描面收窄」的 canary**：若解析器悄悄漏掉一类调用形态
> （例如去掉 `__TAURI__.core.invoke` 这条），`bridge_call` 会从 F 里消失、`R∖F` 立刻非空 ⇒ 护栏变红。
> **单靠 F 的下限（≥45）抓不到这种「少了一类形态」的漂移** —— 这是本节的另一条方法学。

另有：扫描面下限（D ≥ 50 / R ≥ 50 / F ≥ 45）；`INVOKE_WRAPPERS` 双向自检（清单项必须真转发到 invoke）；
**canary 10 项**（正样本 / 负样本-缺条 / 负样本-放宽 / 注释行 / 成员调用 / `__TAURI__` 全局桥 /
嵌套泛型 / 包装器 / 缺 `generate_handler` 返回 null）；**共用同一解析函数**（canary 不另写正则）。

**注入验证 6/6**：① 从 `generate_handler` 移除 `fs::trash` ⇒ 报 `D∖R` + `F∖R`；
② 注册不存在的命令 ⇒ 报 `R∖D`；③ 前端调 `ghost_front_cmd` ⇒ 报 `F∖R`；
④ 去掉 `__TAURI__` 形态 ⇒ `R∖F` 抓到 `bridge_call`；⑤ 放宽 invoke 谓词 ⇒ 非静默通过；
⑥ 让 `inComment` 恒 false ⇒ 注释里的命令被误报。还原后全绿且**文件与快照逐字节一致**。

### 附带的两条工具教训（都不是护栏本身的问题）

1. **注入脚本的还原不能依赖 `git checkout --`** —— 新增的护栏文件是**未跟踪**的，
   git 报 `did not match any file(s) known to git` 且**注入留在磁盘上**污染后续用例
   （首版 6 项只过 2 项，且报告的是被污染后的状态）。⇒ 注入与还原**都以启动时的内存快照为基准**，
   还原放 `finally`，结束时**逐字节比对**。
2. **注入验证里的「期望文案」正则本身也是判据** —— 首版把 `**未注册**进` 写成 `未**注册**进`
   （星号位置写错）⇒ 护栏**确实变红了**却被判为「未检出」。⇒ 报「护栏无效」前先确认期望式与实现文案逐字对齐。

### 环境噪声（如实记录，勿误判为真红）

本地 `npm run parity` 偶发 `vendored CoreEditor 检查失败：eslint .`，根因是
`Error: write EPIPE ... broker-ipc-client.cjs`（本机沙箱 IPC broker），**不是 eslint 真失败**；
单独重跑 `node tools/check-vendored-editor.mjs` 即通过。⇒ 见到 `EPIPE` + `broker-ipc-client` 先重跑再判断。

### 本次改动

- **新增** `tests/parity/verify-tauri-command-contract.mjs`，并接入根 `test` + `parity` 两条链；
- 同步 `tests/qualification/README.md` 的护栏数量 19 → **20**（该数字由 `verify-release-gate.mjs` 锁定）；
- **未改动任何产品代码**（现状即健康；本节只加判据）。

## 4.97 审 **Tauri capability 权限表 ↔ 前端实际调用的 API**：**4 个写操作未授权**（2026-10-06）

**动机**：`capabilities/default.json` 是**手工列举**的权限白名单，而**没有任何东西保证它覆盖了
前端实际调用的 API**。漏授一个权限 = 该 API 在真机上**运行时被拒**（Tauri 2 ACL），
而前端普遍写成 `void win?.setTitle(...)`（fire-and-forget）⇒ **静默失败**：
无弹窗、无日志，**测试也看不见**（浏览器 dev 走 mock，不走 ACL）。

### ⚠️ 实测：4 个写操作未授权

| 前端调用 | 需要的权限 | capability | 后果 |
|---|---|---|---|
| `win.setTitle()`（`App.tsx` ×3：标题栏脏标记 `●` / 字数） | `core:window:allow-set-title` | ❌ **缺** | 窗口标题不更新 |
| `win.setSize()`（`App.tsx` 窗口尺寸恢复 + `windowService`） | `core:window:allow-set-size` | ❌ **缺** | 窗口尺寸不恢复 |
| `win.setPosition()`（`App.tsx` 窗口位置恢复） | `core:window:allow-set-position` | ❌ **缺** | 窗口位置不恢复 |
| `win.setAlwaysOnTop()`（菜单「保持窗口在最前端」） | `core:window:allow-set-always-on-top` | ❌ **缺** | 菜单项点了没反应 |

**旁证 —— 这份清单是「人工列举且不完整」，不是「刻意最小化」**：
清单**授了** `core:window:allow-set-fullscreen`、`allow-minimize`、`allow-maximize`、
`allow-close`、`allow-toggle-maximize`，却漏了上面 4 个写操作。
⇒ 是**列举时没想到**，不是有意的权限收缩。

**为什么以前没被发现**：`docs/security/security-review-2026-08-13.md` 只按**面**审过 ——
原话「权限面窄（core:default + window + dialog + opener ✅）」。
**「面窄」与「覆盖了实际调用」是两个不同的命题**，而后者从未被核对。
（同族：§4.96 的「Rust 命令三方可达性」也是同类边界。）

### ⚠️ 证据等级（如实声明，勿当已确认缺陷）

- **静态、高置信**：所需权限未在 capability 中授予 + 调用点可达 + 命令↔权限映射已核实
  （`allow-set-title → set_title` 等，取自 `gen/schemas/acl-manifests.json`）。
- **未验证**：**未在真机观察过失败**（本环境无法运行 Tauri 应用、无法做真机 UX Gate）。
  按 Tauri 2 ACL 语义未授予即拒绝，但**修复后的行为也未验证**。
- ⇒ 因此**本轮不擅自放宽 capability**：放宽安全面属**策略决定**（且是安全评审明确称赞过的面），
  按 `AGENTS.md`「不要自行修改架构，先报告冲突」—— **只登记，待裁决**。

**一行修法（供裁决后执行）**：在 `apps/desktop/src-tauri/capabilities/default.json` 的
`permissions` 里补上那 4 个标识符（`core:window:allow-set-title` / `allow-set-size` /
`allow-set-position` / `allow-set-always-on-top`），然后**重新生成** `gen/schemas/`
（本护栏会断言源与生成快照一致，防「改了源忘了重新生成」）。

### 新增护栏 `tests/parity/verify-tauri-capability-contract.mjs`（第 **21** 个）

- **① 生成快照必须与 capability 源一致**（`gen/schemas/capabilities.json` ⇄ `capabilities/*.json`）——
  否则护栏读的是过期快照，判据失真；
- **② 前端调用的每个 window API，其所需权限必须已授予**，否则必须进
  `CAPABILITY_GAP_EXEMPT`（4 条，理由里**逐字**写明「待裁决」与「未在真机验证」）；
- **③ 例外表双向**（一旦授权 / 一旦不再被使用，登记项必须删除）；
- **④ 扫描面下限 + canary 6 项**。

**权限集是「展开」出来的，不是硬编码的**：`core:default` → `core:window:default` →
逐条权限，全部从已入库的 `acl-manifests.json` 派生；
**命令↔权限映射也是派生的**（`set_title` → `core:window:allow-set-title`，camelCase↔snake_case）。
⇒ 新增 API 时不需要改护栏表。

### 口径踩坑（两次，都是「过宽 ⇒ 假阳性」）

1. **manifest 的键是 `core:window` 而不是 `window`** —— 首版按插件名取键 ⇒ 展开出 0 项、
   映射表空 ⇒ **16 个 API 一个都没识别**、4 个例外全被判「前端没用」。
   ⇒ 由 canary（`core:window:default` 必须展开出 `allow-is-maximized`）当场暴露。
2. **「凡 `标识符.方法(` 都算」过宽** ⇒ 把**编辑器 host** 的方法误报成 Tauri 命令
   （`host.setTheme(...)` / `host.destroy()`，`host` 是 editor-core 的宿主适配器）。
   ⇒ 改为**从 `getCurrentWindow()` 派生接收者**（含包装它的本地函数 `windowHandle()`，
   再找 `const win = await windowHandle()` 这类绑定）。

**注入验证 5/5**：① 给 `allow-set-title` 授权 ⇒ 例外表双向报错；② 撤 `allow-close` ⇒ 报未授予；
③ 让生成快照与源分叉 ⇒ 报不一致；④ 撤 `allow-set-fullscreen` ⇒ 报未授予；
⑥ **源与快照同时**撤掉 `allow-is-maximized`（它仍在 `core:window:default` 里）⇒ **仍绿**
（证明权限集展开真的生效）。还原后全绿且文件与快照逐字节一致。

> ⑥ 的**设计本身**是个教训：只改源会先撞上「快照与源不一致」，**测不到**展开逻辑 ——
> 验证一条判据时，要先确认**没有别的判据先把它拦住**。

### 本次改动

- **新增** `tests/parity/verify-tauri-capability-contract.mjs`，接入根 `test` + `parity` 两条链；
- 同步 `tests/qualification/README.md` 的护栏数量 20 → **21**；
- **未改动 `capabilities/*.json`**（只登记，待裁决）。

### 跟进（2026-10-06 同日）—— 已修，并附**安全评估**

**决定：补上那 4 个权限**（`allow-set-title` / `allow-set-size` / `allow-set-position` /
`allow-set-always-on-top`），例外表随之**清空**。

**为什么这次可以改（与首轮「只登记」的差别）—— 三条**：

1. **单调安全**：这 4 个权限是**只增**的。若我的分析有误（即这些调用本来就被允许），
   加上它们就是**空操作**；若分析正确，则修掉 4 个静默失效的功能。
   **不存在「改了更糟」的路径。**
2. **边际风险 ≈ 0**：它们只作用于**应用自己的窗口**（改标题 / 改尺寸 / 改位置 / 置顶），
   不碰文件系统、不碰网络、不碰进程。而清单里**早已授权** `allow-close`、
   `allow-minimize`、`allow-maximize`、`allow-set-fullscreen` ——
   即：即便 webview 被攻破（安全评审的 H1/H2，均已修），攻击者**本来就能**关闭/全屏这个窗口。
   新增项的边际能力**严格弱于**已授权项。
3. **安全评审的关切点未被触及**：评审的三条中危是 CSP（已设）、远程导航（H2，已修）、
   自定义命令无 ACL（M3，设计使然）。本条不改其中任何一条。

**同时如实声明**：
- **证据仍是静态的** —— 本环境**无法做真机验证**：实测 `screen-timing windows` 返回
  `cgWindows: []`（无屏幕录制权限），`osascript` 访问 System Events 报
  **`-10004 权限违例`**（无辅助功能权限）。这与 `PASS-E = 0/50`、9 项未闭环互为印证：
  **真机 UX Gate 在本环境不可执行**。
- 因此**修复后的行为未被观察确认**；若日后真机验收发现窗口标题/尺寸/置顶仍异常，
  本节的因果推断即为错，须回退重查。
- 本改动在 `apps/` 下、会被编译进二进制 ⇒ **制品变化 ⇒ 发 v1.5.30**。

## 4.98 审 **capability 的 `windows` 绑定**：新窗口不匹配任何 capability ⇒ **对 IPC 层毫无访问权限**（实测缺陷，已修）（2026-10-06）

**这是 §4.97 的同族、但更严重的一条：不是「少授一个权限」，而是「整个窗口一个权限都没有」。**

### 缺陷

`apps/desktop/src-tauri/capabilities/default.json` 写的是：

```json
"windows": ["main"]
```

而 `window.rs:67`（`new_window`，即 ⌘N / ⇧⌘N / 「在新窗口中打开」）创建的窗口 label 是：

```rust
let label = format!("main-{stamp}");   // ⇒ 形如 main-1728192000000
```

**`main-1728192000000` 不匹配精确模式 `main`** —— 而 Tauri 官方文档对 `windows` 字段的原话是：

> 「**If a webview or its window is not matching any capability then it has no access to the IPC layer at all.**」
> 「Windows can be added to a capability by exact name (e.g. `main-window`) or **glob patterns** like `*` or `admin-*`.」

⇒ **新窗口照样加载 `index.html`、照样启动前端，然后每一次 `invoke` / `listen` 都被拒**。
受影响的功能：⌘N（新建窗口空白文档）、⇧⌘N（新建窗口）、文件树右键「在新窗口中打开」、
以及 `Reopen Closed File` 的「新窗口打开」路径 —— **全部落到一个 IPC 全禁的窗口里**。

### 为什么长期没被发现

1. **已有护栏只查了「接线」，没查「权限」**：`verify-shell-widgets.mjs` 断言
   `new_window` 接受 `path`/`mode`、把路径挂到本窗口 label、前端把 path 传给它 ——
   **全都成立**。缺的是「这个窗口有没有权限用 IPC」。
2. **UX Gate 从未跑过**（`PASS-E = 0/50`，`P0-QA-001` 是 `NOT_TESTED / human-ux-gate-session`）
   ⇒ 多窗口从没有人类验收过。
3. 本项目**已有同型前科**：§5.7 记录过「`AUTO` 把一个完全不可用的功能当作已闭环」（浮动工具栏）。

### 修复

```json
"windows": ["main", "main-*"]
```

并同步 `gen/schemas/capabilities.json`（该文件入库，本护栏会断言它与源一致）。

**安全性说明（为什么这不等于放宽攻击面）**：`main-*` 窗口是**应用自己**用 `new_window` 创建的，
与主窗口**同一 URL、同一 `on_navigation` 白名单、同一关闭保护**，
本就是「同一个应用窗口」——`main-{stamp}` 这个命名方案正是为了表明它属于 main 家族。
它不是给「不可信内容」的窗口（本应用目前不存在这种窗口）。
**若将来出现应当无权限的窗口**（例如承载远程内容），必须登记进护栏的 `UNPRIVILEGED_WINDOWS`
并写明理由 —— 这样「该不该有权限」会被**显式决定**，而不是静默掉进「无权限」的坑。

### 新增判据（并入 `verify-tauri-capability-contract.mjs`，护栏数仍为 21）

**凡 Rust 侧创建的窗口 label，必须被某个 capability 的 `windows` 模式覆盖**（glob 语义）。
- 从 Rust 解析窗口 label：字面量 `"main"`，以及 `format!("main-{stamp}")` → `main-*`；
- capability 缺 `windows` 字段视为「覆盖全部」（如实记录，避免误报）；
- `UNPRIVILEGED_WINDOWS` 例外表**双向**；
- 扫描面下限（窗口创建点 ≥ 2）+ canary。

**canary 11 项**（原 6 项 + 新增 5 项）：`main` **不得**匹配 `main-1728192000000`（这正是缺陷能成立的根因）、
`main-*` 必须匹配且不得匹配 `other-1`、`format!` 形式与字面量形式都要能解析出 label。

**注入验证 4/4**：① capability 退回 `["main"]`（**修前状态**）⇒ 报「`main-*` 无覆盖」；
② 移除 `windows` 字段 ⇒ 仍绿（不误报）；③ Rust 把 label 改成 `panel-{stamp}` ⇒ 报「`panel-*` 无覆盖」；
④ `windows` 变成过宽的 `["*"]` ⇒ 仍绿（不误报）。还原后全绿且文件与快照逐字节一致。

> ① 是本节的关键证据：它证明**这条护栏确实能抓到修前的缺陷**，而不是事后诸葛亮。

### 口径坑（1 次）

`let label` 在同一文件出现**两次** —— `install_close_gate` 里的 `let label = window.label().to_string();`
在前，`new_window` 里的 `let label = format!("main-{stamp}");` 在后。
首版用「第一个匹配的赋值」⇒ 解析成 `window.label()` ⇒ 判据失效（报「无法解析」）。
⇒ 改为取**调用点之前最近**的那一处赋值。

### 附带补齐：**插件注册 ↔ capability 授权必须成对**（同族失效模式）

同一个护栏里补了一条同族判据：**Rust 注册的每个 `tauri_plugin_X` 必须有对应命名空间的授权**
（否则该插件的 JS API 在真机被拒）；**反向**，capability 里每个非 `core` 命名空间必须有对应插件注册
（否则是**死权限项**，会让人以为某能力可用）。
2026-10-06 实测 **4 : 4 完全一致**（dialog / opener / process / updater ↔ 各自的 `X:default`）——
本节同样是把「现状健康」锁住，而不是修缺陷。
`PLUGIN_PAIR_EXEMPT` 例外表**双向**；canary 13 项（新增「插件名解析」：
`init()` 与 `Builder::new().build()` 两种形态都要认出来）。
注入验证 **3/3**：撤 `dialog:default` ⇒ 报「注册了插件但无权限」；加未注册的 `shell:default` ⇒ 报死权限项；
撤 `.plugin(tauri_plugin_process::init())` ⇒ 报死权限项。

### ⚠️ 证据等级

- **静态、高置信**：官方文档明示「不匹配即无 IPC 访问」+ 代码中的 label 构造 + 修复前的 capability 内容。
- **未验证**：**未在真机确认新窗口此前确实不可用、也未确认修复后可用**（本环境无法运行 Tauri 应用）。

### 影响面：本次是**产品改动** ⇒ 需要发版

capability 会被编译进二进制 ⇒ **制品发生变化** ⇒ 按发版规则**需要出新版本**（v1.5.29）。

## 4.99 审 **主题 token 的另一半**：引擎侧有判据、**宿主侧空白** ⇒ 3 个死旋钮（2026-10-06）

**动机**：ADR-0027 的引擎 token 可达性判据（R1 可达性 / R2 两端同锁 / R3 防死 token）
只覆盖**引擎**（`--mellow-md-*` 与引擎里的非 md 变量）。
而主题基表里还有一大批**宿主** token（`--mellow-bg` / `--mellow-warning-fg` …）——
**「宿主从不读它们」这一半没有任何判据**。典型的**只锁了一半**。

### 实测：3 个非 md token 全仓零消费

| token | 性质 |
|---|---|
| `--mellow-tab-underline` | **SDI 迁移删掉标签栏后的化石** —— 基表 + **5 个具名主题**共 **7 处声明**，零 `var()` 消费 |
| `--mellow-warning-fg` | 警告家族里**唯一没接线**的成员（`warning-bg` / `-border` / `-btn` 都在 `.recovery-bar` / 提示条里被消费） |
| `--mellow-mermaid-border` | 同理：`.mellow-reader-mermaid` 用 `mermaid-bg` 作底色，边框却用 `--mellow-border-strong` ⇒ 主题里这个边框色**改不动** |

**注意这三条都不是「显示缺陷」**：`.recovery-bar` 未设 `color` ⇒ 继承 `--mellow-fg`，在警告底色上**可读**；
mermaid 容器也有边框（只是不跟随这个 token）。**它们是「死旋钮」** ——
主题作者以为设了生效，实际无效果。

### 处置：**登记，不自行删/接**（沿用 ADR-0027 Q3=C1 的既有裁决逻辑）

`--mellow-md-fg` 的先例已确立口径：**删除属主题面变更、接线属外观变更** ⇒ 一律登记。
本节的 3 个完全同型 ⇒ 登记进 `HOST_TOKENS_UNUSED`，逐条写明原因。

### 新增判据 R4（并入 `verify-parity-ledger.mjs` 的同一节）

**主题基表里每个非 md token，必须至少在**某处**被消费（宿主或引擎），否则登记**；
登记表**双向**（一旦接线 / 一旦不再被使用，登记项必须删除）；登记表非空且无重复。

> R4 与 R3 **不重叠**：md 前缀的 token 直接判 `md-skip` 交给 R3（canary 覆盖了这一点），
> 避免同一个 token 被两张表双重登记。

**注入验证 5/5**：① 从登记表删 `tab-underline` ⇒ 报「都不消费」；② 把**已消费**的 `--mellow-bg`
塞进登记表 ⇒ 报「已不再未消费」；③ 主题基表新增死 token ⇒ 报「都不消费」；
④ 清空登记表 ⇒ 报「不得为空」；⑤ **真接线（在 `styles.css` 里消费）+ 从登记表删除 ⇒ 仍绿**
（证明双向判据成立、且不会把合法变更误报）。

### ⚠️ 一处**自己踩到并修掉**的 canary 设计错误

首版 canary 写成 `canaryHost('--mellow-tab-underline', 'registered-dead')` ——
**用真实 token 当夹具**。后果：**「将来把它接线并脱表」这个合法变更会把 canary 弄红**（假警报）。
是注入用例 ⑤ 当场暴露的。
⇒ 改为**合成夹具**（`--mellow-x` + 显式 ctx）：canary 要测的是「**判定逻辑能不能翻转**」，
**不是「现实数据恰好长这样」**。（同族：护栏卫生里的「canary 锚点绑实现形态」。）

### 本次改动

- **只改护栏**（`verify-parity-ledger.mjs` 增 R4 + 登记表 + canary），**无产品代码改动**
  ⇒ 制品不变 ⇒ **不发新版本**。
- 未改 `packages/themes/src/index.ts`、未改 `styles.css`（那两项都属外观/主题面，需裁决）。

> **载体与裁决（2026-10-06）**：本节的 3 个死 token 登记进「待裁决项登记表」**第 13 行**，
> 载体 = `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（**已裁决 = Q2/B3：维持登记**，与 ADR-0027 Q3 口径一致 ⇒ **无代码改动**）。

## 4.100 审 **PRD §117.1 包规范**：宪法级要求**基本未执行**，且此前**无护栏**（2026-10-06）

**这是本次承重集审计里**唯一一条「**P0 宪法明写「必须」，而现实几乎全不满足**」**的发现。

### 宪法原文（`docs/product/Mellow-PRD-V1.2-FINAL.md` §117.1）

> 每个 package **必须**包含：`README.md` / `CONTRACT.md` / `src/` / `tests/` / `fixtures/`

### 实测（2026-10-06，14 个包，不含 vendored `editor-core`）

| 项 | 合规 | 说明 |
|---|---|---|
| `src/` | **14 / 14** | ✅ |
| `test(s)/` | 11 / 14 | 缺：`editor-react` / `shared` / `workspace` |
| `README.md` | **1 / 14** | 只有 `editor-engine` 有 |
| `CONTRACT.md` | **0 / 14** | 全缺 |
| `fixtures/` | **0 / 14** | 见下「与字面的偏离」 |

⇒ **宪法级规范基本未执行**，而此前**没有任何判据**（同 §4.96/§4.97 的「引用宪法 ≠ 读宪法」）。

### 与宪法字面的一处偏离（**显式声明，不静默放宽**）

§117.1 要求每个包**必须包含 `fixtures/`**，但 **git 无法跟踪空目录** ——
字面满足只能提交空 `.gitkeep`，那是**仪式**而不是内容。
⇒ 本护栏**按意图判**：**夹具数据若存在，必须放在 `fixtures/` 下**（即 `fixtures/` 存在则必须非空），
**不强制要求空目录存在**。该偏离登记在护栏的 `PRD_117_1_DEVIATIONS` 里，并有「不得为空」的断言 ——
**偏离必须被声明，不能靠「把判据写松」绕开**。

### 本次动作

1. **新增护栏** `tests/parity/verify-package-conventions.mjs`（第 **22** 个），接入根 `test` + `parity`：
   - **C1 `src/`**、**C2 `README.md`** —— **硬失败，无例外**；
   - **C3 `CONTRACT.md`**、**C4 `test(s)/`** —— 必须存在，否则登记（登记表**双向**）；
   - **C5 `fixtures/`** —— 按意图判（存在则必须非空）；
   - **新包必须完全合规**（未登记 ⇒ 缺口必须为空）—— 这是「**缺口不许增长**」的核心；
   - 下限（包数 ≥ 10）+ 偏离声明非空 + canary 5 项。
2. **补齐 13 个 `README.md`**（`app-core` / `commands` / `desktop-ui` / `document-model` /
   `editor-react` / `export` / `extension-api` / `host-api` / `i18n` / `settings` / `shared` /
   `themes` / `workspace`）⇒ **C2 现在可以是硬判据**（14/14）。
   内容全部取自**实测**（`package.json` 的 description、`src/index.ts` 的真实导出清单、
   实测的跨包依赖边），**不含推测**；每份都标注了它对应的已知缺口（§4.95 的零消费者、§4.100 的缺 CONTRACT）。
3. **`CONTRACT.md` 与 3 个 `test(s)/` 缺口 → 登记**（`PKG_CONTRACT_GAPS` / `PKG_TEST_GAPS`），
   理由逐条写明是「**未执行**」而非「已评估通过的偏离」。
   - `CONTRACT.md` 是**独立的文档工作包**（§117.1 要求含：输入/输出类型、不变量、错误语义、
     性能边界、禁止行为、Typora parity reference、golden fixtures），不在本次范围；
   - 3 个缺测试的包正是 §4.95 里**零跨包消费者**的那 3 个 ⇒ **是否补测取决于它们的去留**（待裁决）。
     > **⚠️ 2026-10-08 更正（审计 §4.160）**：上句**原写**结尾「（**待裁决**）」—— 而**去留已在 §4.95 裁决**
     > （登记表第 14 行 = **ADR-0032 Q3 的 C3：保留 + 触发条件**）⇒ **「待裁决」的前提已过期**。
     > 补测的**触发条件**随之明确：**该包被真正接线时**（零消费者状态解除）。
     > ⇒ 该缺口**由登记表第 14 行覆盖**，**不再是一条独立的待裁决项**（**登记表不新增行**）。
     > ⚠️ 另：这 3 个里 **`editor-react` 是「有意预留（阶段 2）」**，与 `shared`/`workspace` 的
     > 「零消费者」**性质不同**（见 §4.95 的表）—— 补测的理由也不同。
     > ⚠️ 本条第 3 点提到的 **`PKG_CONTRACT_GAPS` 现已不存在**：`CONTRACT.md` 于本轮之后**已补齐 15/15**
     > ⇒ 该表随之移除（`verify-package-conventions.mjs` 现在只保留 `PKG_TEST_GAPS`）。

**注入验证 5/5**：① 删 `README.md` ⇒ 硬失败；② 从 `PKG_CONTRACT_GAPS` 删一项（文件仍缺）⇒ 报「缺且未登记」；
③ 反向：造出 `CONTRACT.md` 但登记项还在 ⇒ 报「已存在 ⇒ 请删除登记项」；
④ **新增一个只有 `src/` 的包 ⇒ 被抓**（证明「新包必须合规」真的生效）；⑤ 清空偏离声明 ⇒ 报「不得为空」。

### ⚠️ 证据等级

- **静态、可复核**：合规矩阵由本护栏每次运行重算；README 内容来自实测数据。
- **本护栏不改变任何产品行为**（只加文档 + 判据）⇒ 制品不变 ⇒ **不发新版本**。

## 4.101 审 **`invoke` 的实参字段 ↔ Rust 形参**：一处 snake_case 键 ⇒ 「另存为」的建议文件名永远丢失（2026-10-06）

**动机**：§4.96 只锁了**命令名**（`invoke('x')` ↔ `#[tauri::command] fn x`）。
命令**内部**的字段名同样是一条跨层契约 —— 而它此前**没有任何判据**。
（同 §4.97/§4.98/§4.99 的「**只锁了一半**」。）

### 缺陷

`apps/desktop/src/host/fileServices.ts` 的 `save()`：

```ts
await invoke<TauriSaveResponse>('save_document', {
  path, content,
  encoding: …, eol: …,
  default_name: options?.suggestedName ?? null,   // ← 键名写成了 snake_case
  expected: …,
});
```

而 Rust 侧：

```rust
pub async fn save_document(
    app: tauri::AppHandle,
    path: Option<String>, content: String, encoding: Option<String>, eol: Option<String>,
    default_name: Option<String>,          // ← 形参
    expected: Option<DiskState>,
) -> SaveDocumentResult {
    ...
    let suggested = default_name
        .filter(|n| !n.trim().is_empty())
        .map(|n| if n.ends_with(".md") { n } else { format!("{n}.md") })
        .unwrap_or_else(|| "untitled.md".to_string());   // ← 永远走这一支
```

**Tauri 的实参键规则（读宏源码确定，不是凭印象）**：
`tauri-macros/src/command/wrapper.rs` 的 `WrapperAttributes` 默认
**`argument_case: ArgumentCase::Camel`**（:51），且 `key = key.to_lower_camel_case()`（:505-507）。
⇒ **实参键 = `to_lower_camel_case(形参标识符)`** = **`defaultName`**。
前端传的是 `default_name` ⇒ **查不到该键**。

**为什么没报错**：`default_name` 是 `Option<String>`，而 Tauri 的缺键处理是
「**目标类型不是 `Option` 才报错**」（`tauri/src/ipc/command.rs:110-112` 原话）
⇒ 缺键 ⇒ **静默 `None`**。

**后果（用户可见）**：对**未命名文档**执行保存时，系统「另存为」对话框的建议文件名
**永远是 `untitled.md`**，而不是按注释里写明的 Typora parity
「建议文件名来自文档首行/首个标题」（Rust 注释「C1（第四轮）」）——
**该功能自始至终没有生效过，且没有任何报错**。

### 修复

前端键 `default_name` → **`defaultName`**（与其余 58 处调用的约定一致），并在该行上方写明
「键名必须 camelCase + 宏源码出处 + 本次事故」，防回归。

**为什么不用 `#[tauri::command(rename_all = "snake_case")]`**：那会与全仓 58 处调用的约定相反，
且该命令的其余形参都是单词（`path`/`content`/…）⇒ 改前端键是最小且一致的做法。

### ⚠️ 差点做出一个**假阳性**（值得记录）

初版判据用「`snake(jsKey) === 形参名`」比对 ⇒ 把 `_search_id`（`search_cancel` 的形参，
带前导下划线表示「有意未使用」）判成不匹配，**误报一处缺陷**。
回查宏源码才发现：`heck` 的 `to_lower_camel_case` 会**丢掉下划线切出的空段** ⇒
`_search_id` → **`searchId`**，**与前端一致**（宏源码里还有一句注释专门说明这点）。
⇒ 判据必须**复刻框架的真实变换**，不能自己发明一种「看起来等价」的变换。

### 新增判据（并入 `verify-tauri-command-contract.mjs`，护栏数仍为 22）

**前端 `invoke(cmd, {…})` 的每个顶层键必须等于 `toArgKey(形参)`**（Tauri 的真实变换），
且**必填形参（非 `Option`）必须被传**；例外表 `ARG_FIELD_EXEMPT`（**刻意为空**）+ 双向。

**canary 21 项**（新增 11 项）：`toArgKey('default_name')==='defaultName'`、
**`toArgKey('_search_id')==='searchId'`**（防我自己的假阳性）、注入型参数（`State`/`WebviewWindow`）
不得被算作实参、**形参文本必须只取括号内部**（首版把 `pub fn name` 也吞进来 ⇒ 第一个形参永远解析不到）、
简写属性 / spread / 大小写敏感。

**注入验证 5/5**：① 把前端键退回 `default_name`（**修前状态**）⇒ 报「没有的实参键」；
② 反向把 Rust 形参改名 ⇒ 同样报；③ 删掉必填键 ⇒ 报「未传必填形参」；
④ 删掉 `Option` 键 ⇒ **仍绿**（证明可选判定生效）；⑤ 例外表登记不存在的缺口 ⇒ 报「已不存在」。

> ⚠️ **注入验证当场抓到我自己的一个空转判据**：首版给 `defaultName:` 上方加了一段注释，
> 而对象解析把「注释行 + 键」当成同一个顶层逗号段 ⇒ **该键根本没被提取** ⇒
> 判据对这个键是**空的**（把键改回 snake_case 竟然不报）。
> 修法是**先丢掉整行注释**再切分。**如果没做注入验证，这条护栏会带着一个空洞上线。**

### 影响面

`apps/desktop/src/host/fileServices.ts` 是**产品代码** ⇒ 制品变化 ⇒ **发 v1.5.31**。

## 4.102 审 **i18n 目录的反方向**：`menu.*` 有孤儿判据、**其余命名空间零判据** ⇒ 26 个死键（2026-10-06）

**动机**：现有 i18n 护栏（A/B/C）全是「**`t()` 用到的键必须存在**」（**使用 → 目录**）。
**反方向（目录 → 使用）此前只有 `menu.*` 有判据** ——
`verify-menu-contract.mjs` 的 `ORPHAN_ALLOWED` **遍历全部 `menu.*` 键**；
**其余命名空间零判据**（又一次「只锁了一半」，同 §4.97/§4.98/§4.99/§4.101）。

### 实测

841 个键里 **34 个全仓任何引号形式都不出现**；其中 8 个是 `menu.theme.*`（已在 `ORPHAN_ALLOWED` 里）
⇒ **其余 26 个**没有任何判据。

**它们不是「占地方」，而是改版遗留的物证**：

| 死键 | 遗留自哪次改版 |
|---|---|
| `sidebar.showHidden` / `sidebar.showNonMarkdown` / `sidebar.filtersTitle` / `tree.includeGlob` / `tree.excludeGlob` | **侧栏过滤面板**改版为**设置页选项**（`settings.file.*`）—— 旧 UI 拆了，键没删 |
| `sidebar.tree` / `sidebar.list` / `sidebar.summary` | 侧栏模式切换改用 `sidebar.*Aria` 系列 |
| `settings.writingWidth.820` | 写作宽度从**选项列表**改为**数值设置**（`settings.editor.writingWidth`） |
| `contextmenu.textParagraph` / `contextmenu.textFormat` | 右键项文案**在命令对象里内联**（`localizedTitle: { zh, en }`），未走 i18n 目录 |
| 其余（`reader.copy` / `status.words` / `quickopen.hint` / `updater.rollbackInProgress` …） | 功能未接线或文案走了别处 |

**顺带一处信号**：`verify-sidebar-contract.mjs` 至今还在断言其中几个键「zh/en 双语存在」
（`:322` / `:396`）—— **护栏在维护一个死键**：它断言了「存在」，却没人问「谁在用」。

### 新增判据（并入 `verify-i18n-contract.mjs`，护栏数仍为 22）

**除 `menu.*` 外，目录里每个键必须在产品 / 工具链 / 测试中以任一种引号形式出现**，否则登记进
`MESSAGES_UNUSED`（26 条，逐条写明遗留来源）；登记表**双向**（一旦接线 / 一旦不再无人使用 ⇒ 必须删除）。

**为什么刻意排除 `menu.*`**：那部分已由 `verify-menu-contract.mjs` 的 `ORPHAN_ALLOWED` 穷尽覆盖；
**同一缺口登记两处会制造与 D-E/D-Q 同型的二义**（本仓已有前科）。
护栏输出里明写这条分工（`MESSAGES_UNUSED_SCOPE_NOTE`）。

**canary 4 项**（合成夹具，不绑现实数据）：单/双引号形式识别、不存在的键不得被判为被引用、
**前缀相似的键不得互相算作引用**（必须整键匹配）、`menu.*` 排除判定。

**注入验证 5/5**：① 从登记表删一项 ⇒ 报「无人使用」；② 目录里新增无人使用的键 ⇒ 报「无人使用」；
③ 在**被扫描的产品文件**里真正使用该键（登记项仍在）⇒ 报「已不再无人使用」；
④ 把 `menu.theme.paper` 塞进表 ⇒ 报「本不该在此表」（防与 menu 护栏双重登记）；⑤ 清空表 ⇒ 报「不得为空」。

### ⚠️ 本轮踩到的两个口径坑（都靠实跑暴露）

1. **护栏扫到了自己**：`MESSAGES_UNUSED` 表里的键字符串就在**护栏自己的源码**里，
   而护栏文件在扫描面内 ⇒ 每个死键都「看起来被引用」⇒ 判据全空转。
   ⇒ 扫描面必须**显式排除护栏自身**（`f !== SELF`），并写明理由。
2. **排除面过宽**：首版把整个 `packages/i18n/` 排除 ⇒ 把该包**测试**里出现的 `app.name`
   误判成死键。⇒ 只排除**目录文件本身**（`packages/i18n/src/messages.ts`）。
3. （工具侧）**注入脚本同一文件的多处编辑必须累积** —— 首版每处都从快照出发，后者覆盖前者，
   于是「zh 与 en 各加一个键」只落了一处 ⇒ **假阴性**。⇒ 编辑先落到一份 staged 副本上再统一写盘。

### 本次改动

- **只改护栏**（`verify-i18n-contract.mjs` 增 D 段 + 登记表 + canary），**无产品代码改动**
  ⇒ 制品不变 ⇒ **不发新版本**。
- **未删任何键**：删除属产品面变更（且会改变两个 locale 的目录）⇒ 按「有删/收紧 ⇒ 只登记 + 报冲突」
  的口径**登记待裁决**。

> **载体与裁决（2026-10-06）**：这 26（后为 30）个死键登记进「待裁决项登记表」**第 12 行**，
> 载体 = `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（**已裁决 = Q1/A1：删除**）—— 30 键已从两个 locale 删除（**841 → 811**），
> `MESSAGES_UNUSED` 清空、判据 D 升级为**硬判据**（审计 §4.107）。

## 4.103 执行 §117.1 的 `CONTRACT.md`：14 个包全部补齐，判据升级为**硬要求**（2026-10-06）

**背景**：§4.100 登记了 §117.1 的合规缺口 —— `CONTRACT.md` **0/14**。本节把它执行掉。

### 做法：**指针式契约**，不复制真值

每份 `CONTRACT.md` 的结构固定为 9 节：
职责与边界（含**负向边界**）/ 公开接口与类型 / **不变量（每条必须写明执行者）** / 错误语义 /
性能边界 / 禁止行为 / Typora parity reference / golden fixtures / 测试入口。

> **关键设计：不变量必须带「执行者」列** —— 与本仓「**不采信 docs 自述**」一致：
> 契约里每一条都必须指向**护栏或测试**，否则它只是散文。
> 这样写同时避免了「文档与实现双份真值」（双份必然漂移，本仓已有多次前科）。

内容全部来自**实测**：`package.json` 的 description、`src/index.ts` 的真实导出清单、
实测的跨包依赖边、**实测的「谁在守」映射**（扫描 22 个护栏对每个包路径的提及）、
以及本会话已核实的各条不变量（caret 两族 / md token 可达性 / 净化器子集 / 大文件阈值 /
剪贴板顺序 / 引擎文案 E1–E4 / 视觉 Golden 等）。

### 判据升级

`verify-package-conventions.mjs` 的 **C3 从「可登记」升级为「硬要求」**：
`PKG_CONTRACT_GAPS` 表**整表删除**，`CONTRACT.md` 与 `src/` / `README.md` 同级 —— 无例外。
（C4 `test(s)/` 仍可登记，当前 3 项。）

**注入验证 2/2**：① 删掉 `packages/settings/CONTRACT.md` ⇒ 硬失败；
② 新增一个只有 `src/` + `README.md` 的包 ⇒ 报「缺 CONTRACT.md」。

### ⚠️ 连带必须做的更正（「更正必须扫全文」）

§4.100 落地时我在 13 份 `README.md` 里写了「契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）」——
**本次补齐后该表述已不成立**。已把 13 份 README 的该行改为指向 `CONTRACT.md` 的正式指针；
`editor-engine` 的 README 是**既有的**（不含该表述），补了同样的指针行。
并用「全仓搜 `CONTRACT.md` + `尚未编写`」复核为 **0 命中**。

> 这是本仓第 N 次踩「**更正必须扫全文**」：改了 A 处就要问「还有谁在说同一件事」。
> 上一次的同型事故是 §4.93 的「更正没扫全文」复发。

### 本次改动

- **新增 14 份 `CONTRACT.md`**（`packages/*/CONTRACT.md`）+ 更正 14 份 `README.md` 的指针；
- 护栏 C3 升级为硬要求；
- **只改文档与护栏，无产品代码改动** ⇒ 制品不变 ⇒ **不发新版本**。

## 4.104 审 **Tauri 事件名契约**（Rust `emit` ⇄ 前端 `listen`）：双向 7:7 一致，补上判据（2026-10-06）

**动机**：命令名（§4.96）与实参字段（§4.101）都锁了，**事件名**同样是一条 Rust↔JS 边界 ——
若只在一端改名 ⇒ **静默死通道**（前端一直等一个永不发生的事件，或 Rust 发的事件无人接收）。
此前**没有任何判据**。

### 实测：**双向 7:7 完全一致**（无缺陷）

Rust `emit` / `emit_to`：`mellow-menu-command` / `mellow://bridge` / `mellow://dir-changed` /
`mellow://file-changed` / `mellow://open-file` / `mellow://search-result` / `mellow://window-close-requested`
前端 `listen`：**同一组 7 个**（无「只听不发」、无「只发不听」）。

### ⚠️ 口径坑（本次实测踩到，**差点误报一处不存在的缺陷**）

`emit_to` 的**第一个实参是窗口 label，而它可能是字符串字面量**：

```rust
app.emit_to("main", "mellow://open-file", req);   // ← label 是字面量
```

首版判据用「抓调用里**第一个字符串**」⇒ 把 **label `main` 当成事件名**，
并**漏掉真正的事件** `mellow://open-file` ⇒ 误报「前端在听但 Rust 从不 emit」。
⇒ 必须**按参数位**取：`.emit(ev, payload)` 取 `args[0]`；`.emit_to(label, ev, payload)` 取 `args[1]`，
且 label 既可能是字面量也可能是标识符（`&label`）—— 两种都要能跳过。

> 同族教训（§4.99）：**判据必须复刻框架/语言的真实形态**，不能按「看起来差不多」猜。

### 新增判据（并入 `verify-tauri-command-contract.mjs`，护栏数仍为 22）

**⑥ 事件名契约**：Rust `emit`/`emit_to` 的事件集合 ⇄ 前端 `listen` 的事件集合，**双向相等**；
`EVENT_EXEMPT`（**刻意为空**）+ 双向；扫描面下限（各 ≥ 5）。
**canary 21 → 29 项**（新增：`.emit` / `.emit_to` 两种形态、**label 为字面量与标识符两种都要跳过**、
只 listen 不 emit / 只 emit 不 listen 两个方向的谓词、注释行里的 `listen` 不算）。

**注入验证 4/4**：① Rust 改名 ⇒ 报「前端在 listen 但 Rust 不 emit」；
② 前端改名 ⇒ 报「Rust emit 但前端不 listen」；③ 例外表登记不存在的缺口 ⇒ 报「已不存在」；
④ **把 `emit_to` 的实参位退回 `args[0]`（我踩过的假阳性）⇒ canary 拦下**。

> ④ 是本节最有价值的一条：它证明**这条 canary 真的能拦住「我犯过的那个错」**。

### ⚠️ 注入验证同时抓到判据自身的**双向校验写反**

例外表的双向校验首版写成「只查后半条件」：

```js
const still = kind === 'listen' ? !emittedEvents.has(ev) : !listenedEvents.has(ev);  // ❌
```

⇒ 注入 `emit:ghost.event`（一个**不存在**的缺口）时护栏**仍绿** —— 因为 `!listenedEvents.has('ghost.event')`
恒为 true。修法：**两个条件都要查**（`kind === 'listen'` ⇒ `listened && !emitted`；
否则 ⇒ `emitted && !listened`），并校验前缀只能是 `listen:` / `emit:`。

### 另：一条**实测干净**的轴（记下来避免重复劳动）

**CSS 类名「用了但没有定义」**：扫 290 个源文件里 `className` 的 200 个类名 ⇄
定义面 291 个文件的 2520 个类名 token，**只剩 6 个候选**，逐条核实后**全部无害**：
`tree-icon-` 是动态前缀（`.tree-icon` / `-folder` / `-file` 都有定义）；
其余 5 个（`confirm-modal-line` / `settings-row-value` / `statusbar-wrap` / `toast-message` /
`virtual-rows`）是**无样式的 hook 类** —— 父类已提供 `display:flex`（`confirm-modal-message` /
`toast-bar`）或由**内联样式**承担（`virtual-rows` 的 padding），**都不是缺陷**。
⇒ 该轴**未加护栏**（加只会产生噪声）。

### 本次改动

- **只改护栏**（`verify-tauri-command-contract.mjs` 增 ⑥ + canary），**无产品代码改动**
  ⇒ 制品不变 ⇒ **不发新版本**。

## 4.105 死键判据的**口径漏洞**：把「测试/护栏的提及」当成了使用 ⇒ 4 个「只被护栏维护」的死键（2026-10-06）

**背景**：§4.102 建的死键判据（目录 → 使用）把扫描面定为
「`apps` + `packages` + `tools` + **`tests`**」⇒ **只被某个护栏断言存在**的键被当成**活键**。

**而这恰恰是最该暴露的一类**：护栏断言了「这个键双语齐备」，却**没人问「谁在用」**。
（§4.102 当时只把这一句写成了「顺带信号」，没有把它变成判据 —— 现在补上。）

### 收紧口径后**正好多出 4 个**

| 死键 | 产品侧实际用的是什么 |
|---|---|
| `contextmenu.open` | 右键菜单用 `contextmenu.newFile` / `contextmenu.rename` / **`contextmenu.reveal`** 等 |
| `contextmenu.revealInTree` | 同上（实际是 `contextmenu.reveal`） |
| `files.newFile` | 新建文件的命令用**内联** `localizedTitle: { zh: '新文件', en: 'New File' }` |
| `files.newFolder` | 同上（`fileTree.newFolder` + 内联标题） |

⇒ 登记项 **26 → 30**，且**原有登记无一失效**（说明收紧只暴露了新问题，没有误伤）。

**这四个都只被 `verify-sidebar-contract.mjs` 的「双语文案」断言提到** ——
「**护栏在维护死键**」从一句推测变成了**4 个实例**。

### 动作

1. **收紧口径**：`DEAD_SCAN` 去掉 `tests/`（只留 `apps` / `packages` / `tools`），
   并在头部写明理由 + 更新 `MESSAGES_UNUSED_SCOPE_NOTE` + 输出文案。
2. **登记这 4 个**（逐条写明「产品从未使用；仅被侧栏护栏断言存在」）。
3. **移除侧栏护栏里的那 4 项断言**（`:322` 与 `:396`）——
   断言一个**死键**的「双语齐备」没有意义；移除后该护栏仍检查其余 6 个键，
   而**一旦将来有人接线**，`verify-i18n-contract.mjs` 判据 A（`t('字面量')` 必须可解析）会接管。

### 顺带确认：那 5 个「侧栏过滤」死键**确为化石**（不是未完成功能）

`docs/qualification/ui-review-2026-08-13.md` 记录 8 月的侧栏形态：
「header files/outline/search 切换 + **4 个 checkbox（showHidden / showNonMarkdown / 递归 / 摘要）**
+ 排序 select + asc checkbox + **2 个 glob 输入框** + root 路径行」。
而现在这些选项在**设置页**（`settings.file.*`，`App.tsx` 的 `setFileTreeOption`）——
⇒ 侧栏过滤面板是**被有意识地改版**掉的，键没删。
（另核实：`files.filterPlaceholder` / `sidebar.noFilterMatch` **仍在产品里用着**
—— 侧栏保留了**按名称过滤**的输入框，被移除的只是「选项面板」。）

**注入验证 6/6**：① 删登记项 ⇒ 报「无人使用」；
**② 新增一个键且只在 `tests/` 里提到 ⇒ 仍报「无人使用」（证明口径不含 tests）**；
**②b 同一个键改在产品代码里提到 ⇒ 不报**（②/②b 成对，证明差别确实来自扫描面）；
③ 在产品代码里真正使用已登记的键 ⇒ 报「已不再无人使用」；④ 目录新增死键 ⇒ 报；⑤ 清空表 ⇒ 报「不得为空」。

> ② 的**首版设计有误**：拿 `sidebar.tree` 当用例，但它**已在登记表里** ⇒ 什么都不该报。
> 改用「新增一个未登记的键 + 只在测试里提到」才真正验到口径。

### 本次改动

- **只改护栏**（`verify-i18n-contract.mjs` 收紧口径 + 登记 4 项；`verify-sidebar-contract.mjs` 移除 4 项断言），
  **无产品代码改动、未删任何键** ⇒ 制品不变 ⇒ **不发新版本**。

> **载体与裁决（2026-10-06）**：本节与 §4.102 的死键登记进「待裁决项登记表」**第 12 行**，
> 载体 = `docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（**已裁决 = Q1/A1：删除**，见审计 §4.107）。

## 4.106 自我纠错：本审计在 §4.99–§4.105 里**新增了未登记的裁决项** ⇒ 补载体 ADR-0032（2026-10-06）

### 问题（我自己造成的）

两条规则都明写在那里：

1. `AGENTS.md`「决策变更」+ 门禁 `PENDING_ADRS`：**待裁决项必须有 ADR 载体**；
2. 本审计「**待裁决项登记表**」头部：**「本文档此后不得新增未登记的裁决项」**。

而 2026-10-06 的 §4.99 / §4.102 / §4.105 在**正文里**写了「登记待裁决」，
却**没有**加登记表行、**也没有** ADR 载体 ⇒ **两条都违反了**。
（根因：我在写「登记待裁决」时，把「登记」理解成了「写进审计正文」，而不是「进登记表 + 有载体」。）

### 处置：按先例补载体（**不新建机制**）

先例是 **ADR-0029**（一份 ADR 集中承载审计里的 6 项未登记裁决项）。
本次同样：新立 **`ADR-0032`（Proposed）**，把四组裁决项写成 **Q1–Q4**，每问给
「现状证据（可复现）/ 选项 / 影响面 / **建议** / 需裁决点」：

| 问 | 内容 | 建议 |
|---|---|---|
| Q1 | **30 个「无人使用」的 i18n 键**如何处置 | **A1 删除**（已被护栏逐条证明无产品引用；保留只会误导「某功能存在吗」） |
| Q2 | **3 个「声明了但无人消费」的主题 token** | **B3 维持登记**（与 ADR-0027 Q3 对 `--mellow-md-fg` 的既有口径一致） |
| Q3 | **3 个零跨包消费者的包**（`document-model` / `shared` / `workspace`） | **C3 先明确计划**；`shared`/`workspace` 倾向删包，`document-model` 涉及 ADR-0008 ⇒ 需替代设计 |
| Q4 | **3 个不在设置 schema 的持久化键** | **D2 维持登记 + 文档写明「不受恢复默认影响」**（已有自己的 UI 入口，进设置页会造成双入口） |

**⚠️ 为什么不塞进 ADR-0029**：ADR-0029 已 `Accepted`，而门禁同时要求
「已裁决 ADR 必须 Accepted」与「待裁决 ADR 必须 Proposed」——
**把新的未裁决 Q 塞进已裁决的 ADR 会让这两条互相矛盾**。⇒ **新裁决项必须新立一份 Proposed ADR**。

**同步动作**：登记表新增 **第 12–15 行**（载体均指向 ADR-0032）+ 门禁 `PENDING_ADRS` 增列；
并在 §4.99 / §4.102 / §4.105 的「本次改动」后补了**载体指针**（便于读者双向追溯）。

**门禁输出随之变化**（这是**状态变化**，须如实声明）：
`Pending decisions:` 由 **「无」** 变为 `ADR-0032-audit-new-pending-decisions-2026-10-06.md（状态 Proposed，裁决前不生效）`。
—— **发布结论不变**（本就 `NO-GO`：9 项未闭环），但「无待裁决项」这句话**不再成立**。

### 顺带：那「没被守住的另一半」**实测仍不该硬守**

登记表头部已如实声明：护栏**不能**自动发现「新加 `待裁决` 字样却没登记」。
本次复核了能否用静态代理补上：

| 口径 | 命中 | 判定 |
|---|---|---|
| 表外含「待裁决/需裁决」的行 | **40 处** | 过宽（含护栏机制自身的叙述、历史记录、「无需裁决」） |
| 再加「含『登记』」且**段内无载体**（`ADR-N` / `已处置` / `登记表`） | **12 处** | **仍过宽** —— 多为**已登记**项（§4.5 / §4.39 / §4.40 / §4.51 等的正文叙述） |

⇒ **不造这个判据**（那 12 处是**合法的**，硬守只会产生噪声并诱发「加例外表」的退化）。
**这一半继续靠人工 + ADR-0032 的四问清单**，与仓里既有声明一致。

### 本次改动

- 新增 `docs/adr/ADR-0032-…md`（**Proposed**）；
- 审计登记表 **+4 行**（第 12–15 行）；§4.99 / §4.102 / §4.105 补载体指针；
- 门禁 `PENDING_ADRS` 增列（`tests/` 改动）；
- **无产品代码改动** ⇒ 制品不变 ⇒ **不发新版本**。

## 4.107 裁决并实施 ADR-0032 四问：删除 30 个死 i18n 键（目录 841 → 811）（2026-10-06）

**依据**：用户 **2026-09-30 的常设授权**「全部自行评估、决策、实施，不叫我人工参与」
（ADR-0024/25/26/29 同引）。
**⚠️ 一处按授权**不**执行的地方**：**Q3 不改架构** —— `AGENTS.md` 明写
「**不要自行修改架构，先报告冲突**」；该条**比常设授权更具体，因而优先**。

### 裁决与实施

| 问 | 裁决 | 实施 |
|---|---|---|
| **Q1** 30 个死 i18n 键 | **A1 删除** | ✅ 两 locale 各删 30 键（**841 → 811**）；`MESSAGES_UNUSED` **清空** ⇒ 判据 D 升级为**硬判据** |
| **Q2** 3 个死主题 token | **B3 维持登记** | 无代码改动（与 ADR-0027 Q3 口径一致） |
| **Q3** 3 个零消费者包 | **C3 保留 + 记录理由与触发条件** | 无代码改动（按 `AGENTS.md` 不自行改架构） |
| **Q4** 3 个 schema 外持久化键 | **D2 维持登记 + 补文档** | ✅ 在 master-plan 偏好设置小节写明「不在设置页、且不被『恢复默认』清理」 |

### Q1 的**删除前三项取证**（缺一不可 —— 删除不可逆）

1. **无产品 / 工具链引用** —— 判据 D 自身（口径 = 产品 + 工具链，**不含 `tests`**，见 §4.105）；
2. **无 `tests/` 功能引用** —— 实测：仅 `verify-i18n-contract.mjs` 的表与
   `verify-sidebar-contract.mjs` 的**说明注释**提到（**均非断言**）；
3. **无动态构造** —— 全仓 `` t(`前缀${…}`) `` 形态**实测 0 处**。

**回退方式**：git 历史（`packages/i18n/src/messages.ts` 单文件）。

### 判据随之升级：D 从「可登记」变为**硬判据**

`MESSAGES_UNUSED` 清空后，「目录里不得有无人使用的键」**不再有例外**，与 `src/` / `README.md` 同级。
**并去掉「登记表不得为空」这条断言** —— 真实死集合为空时它必然失败；
反空转改由「**双向核对 + 扫描面下限（≥100 文件）+ canary**」承担，
而不是靠「要求登记表非空」（那是**用错误的约束去防空转**）。

### 状态变化（如实声明）

- i18n 目录 **841 → 811**（两个 locale）；
- 门禁 `Pending decisions:` 由 ADR-0032 **回到「无」**（ADR-0032 移入 `DECIDED_ADRS`）；
- 登记表第 **12–15 行**全部改为**已裁决**；
- §4.99 / §4.102 / §4.105 的**载体指针**已同步为「已裁决 + 结论」；
- **`messages.ts` 是产品代码** ⇒ 制品变化 ⇒ **发 v1.5.32**。

## 4.108 发版流水线的**并发 find-or-create 竞态**：v1.5.32 一度卡在 Draft（2026-10-06）

### 现象

推 `v1.5.32` 标签后：**三个平台的构建 job 全部 success**，但 `finalize` 失败：

```
::error::v1.5.32 缺少关键制品: \.dmg$ —— 保持 Draft、不发布
```

⇒ **门禁工作正常**（它正是为此存在），但这次「不完整」的成因**不是构建失败**。

### 根因：三个平台 job **并发**做 find-or-create

三个 job 各自跑 `tauri-action`，而它的语义是「**找不到 draft 就创建**」。
实测它们**同一秒**启动、**都没找到** ⇒ **创建了两个同 tag 的 release**：

| release id | 资产 | 内容 |
|---|---|---|
| `404267684` | **4** | **macOS 的 `.dmg`** + `app.tar.gz`(+`.sig`) + `latest.json` |
| `404267671` | 12 | Windows + Linux 的 msi/exe/zip/rpm/deb/AppImage |

`finalize` 只看其中一个（缺 `.dmg`）⇒ 断言失败 ⇒ 保持 Draft。
**与本次代码改动无关**（三个平台构建均 success）。

**附带核实**（避免误判为长期缺陷）：v1.5.30 / v1.5.31 的 `latest.json` 都含**全部 9 个平台** ✓
⇒ 正常路径下 `tauri-action` 会**合并**各平台的 updater 条目；本次只因「两个 release 各自合并」才各不完整。

### 耐久修复（`.github/workflows/release.yml`）

新增 **`create-release`** job（**单一 owner**）：先**断言没有重复 release**（有则**响亮失败**），
再「不存在才创建」；三个平台 job 加 **`needs: [create-release]`** ⇒
它们只会「找到」而不会「创建」⇒ **竞态从根上消失**（`tauri-action` 的 find-or-create 逻辑保持原样）。

> 顺带：那条「断言没有重复」把「同 tag 两个 release」从**静默怪状**变成**响亮失败** ——
> 本次就是先被 `finalize` 的资产断言抓住的，这条让它在**更早**的步骤就暴露。

### 本次恢复（**非破坏性**，未删除任何东西）

1. 从 `404267684` 下载 macOS 的 3 个制品 + `latest.json`；
2. **合并** `latest.json`（**7 → 9 个平台**，与 v1.5.31 一致）；
3. 上传到 `finalize` 检查的那个 release（**12 → 15 个资产**，7 类关键制品齐全）；
4. **重跑失败的 `finalize`** ⇒ **成功发布** ✓
   （`draft=false` / `prerelease=false` / 15 资产 / `releases/latest` → v1.5.32 / `latest.json` 含 9 个平台）。

> ⚠️ 恢复过程中我用 REST 删掉过 `404267671` 的旧 `latest.json`（为替换成合并版），
> 上传 API 报 404 后改用 `gh release upload --clobber`（**需在 git 仓库目录下执行**）补回 ⇒ 最终 15 资产 ✓。

### ⚠️ 遗留：一个同 tag 的 **stray Draft**（`404267684`，4 资产）

**未擅自删除** —— 仓里记录了「远端破坏性操作不擅自执行」的口径；
且**现在已无紧迫性**（发布已完成、该 draft 不影响用户）。
清理（**保留发布出去的那个**）：

```sh
gh release delete v1.5.32 --yes   # ⚠️ tag 有歧义时请按 release id 指定；不加 --cleanup-tag
```

⇒ **需要你确认后执行**。

### 教训

- **并发 `find-or-create` 是竞态**：任何「找不到就创建」的多 job 流程都要**先有单一 owner**。
- **「保持 Draft」不是失败**：它是门禁在**如实报告构建不完整** —— 本次它做对了。
- **`gh release upload` 必须在 git 仓库目录下跑**（在 `/tmp` 里会 `fatal: not a git repository`）。

## 4.109 给 §4.108 的修复加护栏：**单一 owner 创建 release**（2026-10-06）

**动机**：§4.108 的竞态修复（`create-release` job + 三平台 `needs:`）**没有任何判据在守** ——
谁把 `needs:` 删掉，竞态就**静默复发**，而症状要等到下一次发版才出现（且表现为「缺 `.dmg`」，
与成因相隔很远）。

### 判据（并入 `verify-release-gate.mjs` 的 ④ 发布门禁，护栏数仍 22）

解析 `release.yml` 的 jobs（`jobs:` 之下 **2 空格缩进**的键 = job 名；job 内部键都是 4 空格），然后：

| # | 判据 |
|---|---|
| ① | **「创建 release」的 job 必须恰好 1 个**（`gh release create` 只允许出现在一个 job 里） |
| ② | **每个 `tauri-action` 打包 job 必须 `needs:` 那个 owner**（否则 find-or-create 会再次并发创建） |
| ③ | **owner 必须断言「没有重复 release」**（`::error::` + `-gt 1`）—— 把「同 tag 多个 release」从静默怪状变成**响亮失败** |
| ④ | 下限：解析出的 jobs ≥ 4、`tauri-action` job ≥ 3（防扫描面漂移） |

**canary 4 项**（合成夹具）：jobs 解析器取到正确 job 名、`needs: [owner]` 被识别（正样本）、
**缺少 `needs` 的 job 不得被判成「有依赖」**（负样本）、**带连字符的 job 名**（`create-release`）要被解析。

**注入验证 4/4**：① 摘掉 `linux` 的 `needs` ⇒ 报「未 needs」；
② 删掉 owner 的重复断言 ⇒ 报「未断言没有重复 release」；
③ 新增第二个 `gh release create` 的 job ⇒ 报「有 2 个 / 必须恰好 1 个」；
④ 去掉 owner 的 `gh release create` ⇒ 报「有 0 个」。

### ⚠️ canary 当场抓到解析器的一处脆弱

首版 `jobsOf()` 用 `indexOf('\njobs:')` ⇒ 对**以 `jobs:` 开头**的合成夹具返回 `null`
（真实文件里 `jobs:` 前有换行，所以只有 canary 会暴露）。4 条 canary **全部失败** ⇒ 改为
`/(?:^|\n)jobs:[ \t]*\n/`。**这正是 canary 的用途**：它测的是「判定逻辑能不能工作」，
而不是「现实数据恰好长什么样」。

### 本次改动

- **只改护栏**（`verify-release-gate.mjs` 增「单一 owner」判据 + canary），**无产品代码改动**
  ⇒ 制品不变 ⇒ **不发新版本**。

## 4.110 发版流水线的**同类第二处**：两次运行之间的并发 + owner 的 tag 守卫（2026-10-06）

§4.108 的竞态本质是「**并发操作同一个 release**」。顺着这条线复核，发现**同一形态还有两处没被覆盖**。

### (a) **两次运行之间**的并发（同一形态，且更难复现）

`release.yml` **没有 `concurrency:`**（三个 workflow 都没有）⇒ 重跑 / 重推标签时，
**两次运行会同时上传到同一个 release** —— 症状与 §4.108 相同（制品分落 / 断言失败），
但**更难复现**（不是每次都撞上）。

**修复**（`release.yml`）：

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

- **group 按 `github.ref`** ⇒ 不同 tag 之间互不影响（否则前一个版本的发布没跑完，后一个就得排队）；
- **`cancel-in-progress: false`（**不能取消**）** —— 取消正在跑的发布会**留下半成品 release**，
  而 release 是**对外**的 ⇒ 让后来的运行**排队**，而不是取消前者。

### (b) **owner 的 tag 守卫**（⚠️ 本轮我**自己踩过**的坑）

`create-release` **必须只在 tag 触发时**创建 release —— 否则 `workflow_dispatch`
（本 workflow 也支持）会为**分支名**建一个 release。

**⚠️ 但守卫的写法有陷阱**：本轮修竞态时，我初版给 owner 加了
**job 级** `if: startsWith(github.ref, 'refs/tags/')` ⇒ 手动触发时 owner 被**跳过**，
而三平台 job `needs: [create-release]` ⇒ **连带三个平台构建全被跳过**（把「仅构建」路径弄没了）。
⇒ 正确形态是「**job 总是运行、在步骤内按 `GITHUB_REF_TYPE` 判断**」。

### 新增判据（并入 `verify-release-gate.mjs` 的 ④ 发布门禁，护栏数仍 22）

| 判据 | 说明 |
|---|---|
| owner 必须含 `GITHUB_REF_TYPE` + `!= "tag"` | 只在 tag 触发时创建 release（谓词抽成**纯函数**供 canary 复用） |
| `concurrency` 必须存在 | 否则两次运行会并发操作同一个 release |
| `concurrency.group` 必须含 `github.ref` | 否则**不同 tag 之间**会互相阻塞 |
| `concurrency.cancel-in-progress` 必须是 `false` | **不能取消**发布（会留下半成品 release） |

**canary 新增 7 项**（合成夹具）：owner 两个谓词的正 / 负样本、`concurrency` 解析器的
正样本 / 缺 group / `cancel-in-progress: true` / 无 `concurrency` 四种。

**注入验证 4/4**：① 摘掉 owner 的 `GITHUB_REF_TYPE` 守卫 ⇒ 报；
② 删掉 `concurrency:` 块 ⇒ 报「缺少」；③ `cancel-in-progress: true` ⇒ 报「必须是 false」；
④ `group` 改成固定串 ⇒ 报「必须按 github.ref 分组」。

### 复核过但**未动**的两处（无证据 ⇒ 不加）

- `retryAttempts`（`tauri-action` 的构建/上传重试）：**未观测到**上传抖动 ⇒ 不加；
- `timeout-minutes`：12+ 次发版**未观测到**挂起 ⇒ 不加。
> 不凭猜加配置 —— 加了就多一份无人核对的设置。

### 本次改动

- `.github/workflows/release.yml` 增 `concurrency`；`verify-release-gate.mjs` 增 4 条判据 + canary。
- **无产品代码改动**（workflow 是 CI 配置，不进制品）⇒ **不发新版本**。

## 4.111 审 **e2e 的静默腐化**：`dispatch` 一个不存在的命令 id（2026-10-06）

**动机**：`tests/e2e/**`（**31 个脚本**）**不进 CI** —— 没人跑就会悄悄烂掉。
先做了两项体检：**31 个脚本全部 `node --check` 通过** ✓、引用的仓库内路径 **6 处 0 失效** ✓。
再查「引用的**跨层契约**是否还在」：e2e 引用 Tauri 命令 **0 处**、i18n 键 **0 处**（它靠 Playwright 驱动 UI），
但 **`dispatch('<字面量>')` 有 21 处** —— 这条值得查。

### 缺陷：`view.sidebar.close` **全仓不存在**

`tests/e2e/ux-flows-verify.mjs:157` 调 `dispatch('view.sidebar.close')`，
而注册表里只有 `view.sidebar.toggle` / `fileTree` / `fileList` / `outline` —— **没有 `close`**。

**为什么这是静默腐化**：`dispatch` 对**未知 id 不抛错** —— 它返回 `false` 并在状态栏显示
「命令不可用」（`msg.commandUnavailable`）⇒ **脚本会「什么都没做却继续往下跑」**；
而 e2e 不进 CI ⇒ **无人发现**。（症状与 §5.7 的「AUTO 把不可用功能当已闭环」同型：
**失败被降级成了一条没人看的提示**。）

**修复**：改用真实存在的 `view.sidebar.toggle`（上一步刚用 `view.sidebar.outline` 打开侧栏 ⇒ 此处即关闭），
并在原处写明原因与该判据的存在。

### 新增判据：**独立成第 23 个护栏** `verify-command-id-refs.mjs`

**全仓 `dispatch('<字面量>')` 的 id 必须属于（App 命令定义 ∪ `menuSchema` 的 id）**；
例外表 `DISPATCH_EXEMPT`（**刻意为空**）；下限：id 集合 ≥ 200、`dispatch` 调用 ≥ 15。
**id 集合故意取宽**（两个文件里所有 `id: '...'`）—— 本判据只需保证「不误报」，
收窄集合会制造假阳性，而假阳性会诱使后来者**加例外表**（那正是护栏退化的入口）。

> ⚠️ **为什么独立成护栏，而不是塞进 `verify-menu-contract.mjs`**：
> 首版就是塞进菜单护栏的 —— 而 `verify-menu-contract-guard.mjs` 会在**沙箱副本**里跑它，
> 沙箱**不含 `tests/e2e`** ⇒ 本判据在沙箱里扫到 **0 处** ⇒ 触发下限 ⇒ **自检失败**。
> ⇒ 判据归属应看**契约边界**：命令 id 的**跨仓引用完整性**是另一份契约，
> 不该放进一个会被沙箱变异、且扫描面更窄的文件。**护栏数量 22 → 23**（同步 `tests/qualification/README.md`）。

**canary 4 项**（合成夹具）：id 集合解析器覆盖 `{ id: 'x' }` 与 `id: 'x',` 两种形态；
`dispatch` 字面量解析器；**变量 / 模板 / 双引号参数不得被判成字面量**（防假阳性）；
**非 `.dispatch(` 的调用不得被误匹配**（`xxxdispatch(`）。

**注入验证 4/4**：① 把 e2e 改回 `view.sidebar.close`（**修前状态**）⇒ 报；
② 在产品代码里 dispatch 不存在的 id ⇒ 报；③ `dispatch(变量)` ⇒ **仍绿**（不误判）；
④ `dispatch('file.new')`（真实存在）⇒ **仍绿**。

### ⚠️ 过程中我自己的一个错误（被下限判据抓住）

首版遍历器用了该护栏**未导入**的 `readdirSync` ⇒ 抛错 ⇒ 被我的 `try { } catch { return out; }`
**吞成了「0 个文件」** ⇒ 扫描面为空。**是「`dispatch` 调用 ≥ 15」这条下限把它抓住的**
（若只写「有失效才报」，空扫描面会**永远绿**）。
⇒ 两条教训：① **`try/catch` 吞掉的错误会变成「空集合」**，必须配**下限**；
② 新写的遍历器要先确认依赖已导入。

### 本次改动

- **只改测试**（`tests/e2e/ux-flows-verify.mjs` 修 id；`verify-menu-contract.mjs` 增判据 + 补两个 import），
  **无产品代码改动** ⇒ 制品不变 ⇒ **不发新版本**。

## 4.112 审 e2e 的**选择器**与**「防线」声明** + 桥名正则的宽度（2026-10-06）

延续 §4.111（e2e 静默腐化）的两条同族线，**三条都实测干净**，只有一处值得加固。

### (a) e2e 的 CSS 选择器 ↔ 真实类名：**15 个候选，全部合法**

412 处选择器字面量里，15 个类名不在「CSS 规则 ∪ TSX `className`」集合中。逐条核实后**全是合法的**：

| 形态 | 例子 | 为什么不是缺陷 |
|---|---|---|
| **故意的负断言** | `.tabbar`（「B1 SDI：`.tabbar` 已从 DOM 删除 —— 断言恒为 null」）、`.sidebar-mode-menu` / `.sidebar-file-view-mode` / `.file-tree-filters-toggle` | 脚本**断言这些已删除的 UI 不得复活** |
| **多锚点探测** | `.wordcount-panel, .word-count-panel, .stats-panel` + **文本回退**（`阅读时间\|reading time`） | 注释写明「常见的两个锚点任一命中即可」 |
| **vendored / 引擎类名** | `.cm-searchMatch`（CodeMirror）、`.mellow-table-toolbar` / `.mellow-codeblock-lang`（引擎以**不带点**的字符串赋值 ⇒ 我的集合取不到） | 存在，只是我的「已知类名」集合口径偏窄 |

⇒ **该轴不加护栏**：负断言与「死引用」在静态上**长得一样**，加判据只会产生噪声。

### (b) e2e 里自称「防线 / 永久防线 / 回归门禁」的 7 处：**基本都有真正的执行者**

抽查结果：
- 「模式弹出菜单不得复活」 ⇒ **有护栏**（`verify-shell-widgets.mjs:166` 遍历 `.sidebar-mode-menu` / `.sidebar-mode-item`）✓
- 「dragend 清空 `draggedRef`」 ⇒ **有护栏**（`verify-sidebar-contract.mjs:437`）✓
- 「⇧⌘= 不向文档插入字面字符」 ⇒ **实现已就位且写明原因**（`App.tsx:5618`：「命中命令返回 true，**iframe 侧立即 preventDefault**（WKWebView 未拦截的 ⌘ 组合会明文插入字符）」），
  且该桥 `__MELLOW_SHORTCUT_API__` 已被 `verify-adapter-contract.mjs` 的「桥完整性」判据覆盖（**声明在 App.tsx、读取在 build-editor-bundle.mjs，两侧都在扫描面内**）✓

⇒ **e2e 的措辞偏强**（它自己不是防线），但**不变量没有裸奔** ⇒ **不改判据、只记结论**（避免将来重复劳动）。

### (c) 桥名正则**比语言标识符窄** ⇒ 加固（本次唯一改动）

`verify-adapter-contract.mjs` 的桥判据自述是「**把全部桥列全**」，
但正则写的是 `/__MELLOW_([A-Z_]+)__/` —— **比 JS 标识符规则窄**。
⇒ 将来若出现小写桥名（如 `__MELLOW_shortcutApi__`）会被**静默跳过**（不报死桥/断桥）。

**实测**：当前 **37 个** `__MELLOW_*__` 形态**全部**匹配 `[A-Z_]+` ⇒ **补宽今日零行为变化**（零风险）。
**改动**：两处正则（桥名 + 常量间接路径）改为 `[A-Za-z0-9_]+`，**并加 2 条 canary**
（「小写桥名必须被识别」× 两条路径）。
**注入验证**：把正则退回 `[A-Z_]+` ⇒ **2 条 canary 全部变红** ✓（证明加固真的被守住）。

> 依据：这不是「无证据地加东西」，而是**让实现与本节自述一致** ——
> 判据的用途是「列全」，而窄正则会**静默漏检**，属 §4.4「未判定是静默通过」的同一母题。

### 本次改动

- **只改护栏**（`verify-adapter-contract.mjs` 两处正则 + 2 条 canary），**无产品代码改动**
  ⇒ 制品不变 ⇒ **不发新版本**。

## 4.113 登记表第 7 行的「**已处置**」是过度声称 ⇒ 补载体 ADR-0033（2026-10-06）

### 缺陷（两个，且第二个是 §4.106 的同型复发）

「待裁决项登记表」**第 7 行**写着 `Allow Magnification` / 「使用主题的字体大小」**已处置**。
实测（2026-10-06）：

| 事实 | 证据 |
|---|---|
| `export.image.fontSize`（**自定义字号**）**已实施** | `packages/settings/src/index.ts`（number / 8–48 / 默认 16）✓ |
| 「**用主题字号**」这一半**未实施** | 设置里只有 `export.image.{format,width,fontSize,quality}`；全仓 `fontSizeMode` / `useThemeFont` / `themeFontSize` **实测 0 命中** |
| 它**明写着「需单独裁决」** | `master-plan` 行 14b：「❌ **仍缺**：Typora 该组的**另一半**（radio 的 `Use theme font size`）……**需单独裁决**，故本轮不做」 |

⇒ ① **「已处置」过度声称**（只覆盖了一半）；
② **该待裁决项没有 ADR 载体** —— 违反 `AGENTS.md`「待裁决项必须有 ADR 载体」
与登记表头的「本文档此后不得新增未登记的裁决项」，**与 §4.106 修过的形态同型**。

### 处置

1. **更正第 7 行**：拆清「前半（自定义字号）= 已处置」，并**指认第 16 行**为另一半的载体；
2. **新增第 16 行**（出处 §4.113）：图片导出的「用主题字号」—— **待裁决**；
3. **新立 `ADR-0033`（Proposed）** 承载它，并加入门禁 `PENDING_ADRS`。
   （**不塞进 ADR-0032**：它已 `Accepted`，而门禁要求「已裁决必须 Accepted」与「待裁决必须 Proposed」
   同时成立 ⇒ 新的未裁决项**必须新立** —— 同 §4.106 的结论。）

**门禁输出随之变化（如实声明）**：`Pending decisions:` 由 **「无」** 变为
`ADR-0033-image-export-theme-font-size.md（状态 Proposed，裁决前不生效）`。
**发布结论不变**（本就 `NO-GO`）。

### ADR-0033 记录的关键风险（**裁决时必须先解决**）

Typora 默认 **24px** vs Mellow **16px**；**对齐默认值会改变所有既有图片导出的输出**
（面积按 **1.5×** 放大，更易触及 `MAX_IMAGE_HEIGHT` / `MAX_IMAGE_PIXELS` 的**长图保护**）
⇒ 默认值是否对齐**必须经视觉 / 真机确认**，不能凭「对齐 Typora」一句话改。
另：Mellow 的图片导出是 **canvas 渲染**（显式 `fontFamily`），**没有主题 CSS 通道**
⇒ Typora 的 `fontSize = void 0` 交给 CSS **不可直接照搬**，等价物形态（A1 不做 / A2 跟随编辑器字号 /
A3 跟随主题定义字号）需裁决。

### 本次改动

- 更正登记表第 7 行 + 新增第 16 行；新增 `docs/adr/ADR-0033-…md`（**Proposed**）；
  门禁 `PENDING_ADRS` 增列。
- **无产品代码改动** ⇒ 制品不变 ⇒ **不发新版本**。

## 4.114 系统核对登记表**全部 16 行**：只有第 7 行过度声称；并补「取代关系」判据（2026-10-06）

§4.113 修掉第 7 行后，把**其余各行**逐一核对（「过期是双向的」纪律：既查「把没做的说成做了」，
也查「把做了的说成没做」）。

### 核对结果：**15 行准确，1 行（第 7 行）已修**

| 行 | 抽查项 | 结果 |
|---|---|---|
| 1 | `A3 / B1` | ⚠️ **发现问题（见下）** |
| 2 / 3 | 两个「已处置」（PRD 已判 / 一手证据已判） | ✓ 依据在位 |
| 6 | `ADR-0029 Q1=A3`「理由进 D 表」 | ✓ master-plan §12 的 `D-AF` 行在位（§4.67 已复核） |
| 8 | `Q4=D2`「表格 invalid 提示从 spec 移除」 | ✓ `table-editing-spec.md:127` 已划线 + `:130` 注明裁决 |
| 9 | `Q5=E1`「改写为『不适用』+ **保留明文残余风险说明**」 | ✓ `image-workflow-spec.md:153-176` 两半都在（改写 ✓ **且**保留了风险说明 ✓） |
| 10 | `Q6=F1`「`tests/visual/actual/*.png` 取消 git 跟踪」 | ✓ 实测 `git ls-files` **0 个**、`git check-ignore` **是**（目录内 17 个本地产物） |
| 11–15 | ADR-0030 / ADR-0032 的裁决 | ✓ 落地在位 |
| 16 | ADR-0033（本次新立） | ✓ Proposed |

> **顺带更正一处过期记忆**：长期记忆里写着「`tests/visual/actual/*.png` 是**被跟踪的**产物 ⇒
> 回退它们」—— **已过期**（F1 落地后既未跟踪、也被 gitignore）⇒ 已更正，
> 否则未来会话会去做一件不必要的事。

### 第 1 行的问题：「已裁决」≠「**仍有效**」

第 1 行写 `AUTO` 是否阻断发布 / `ux-gate` 是否逐项前置 = 「**已裁决**（A3 / B1）」，
载体只指 `ADR-0024`。而 **`ADR-0031` 明写「取代：ADR-0024 的 Q2 = B1」**（2026-10-05 用户裁决）
⇒ 读者会以为 **`B1` 仍然有效**。**`Q1 = A3` 继续有效**（ADR-0031 明示「不取代 Q1=A3」）。

**处置**：第 1 行注明取代关系 + 载体列加上**取代者** `ADR-0031`。

### 新增判据：ADR 的「取代」关系必须反映到登记表

**凡某 ADR 声明「`**取代：**` … ADR-NNNN」，则以**被取代 ADR** 为载体的登记表行必须提到取代者。**
理由：**「取代」这件事目前只存在于 ADR 内部，而登记表才是读者发现它的地方** ——
与 §4.67「唯一可发现处」母题同型。下限：解析到的取代关系 ≥ 1（基线 = ADR-0031 取代 ADR-0024 Q2=B1）。
**canary 3 项**（`**取代：**` 行解析 / 无取代声明时不误判 / 载体列能取到取代者）。

**注入验证 2/2**：① 把登记表第 1 行内**全部** `ADR-0031` 提及清掉（**修前状态**）⇒ 报
「未提到取代它的 ADR-0031」；② 删掉 `ADR-0031` 的 `**取代：**` 行 ⇒ 触发下限。

### ⚠️ 过程中我自己踩的两个坑（都被既有判据抓住）

1. **新增第二处换行归一化调用** ⇒ 本文件第 ⑤ 节的归一化 canary 用 `selfSrc.replace(anchored, …)`
   **只替换第一处**，随后检查「文件里是否还残留该转义序列」⇒ **误报**。
   修法：改用本文件自带的 `read()`（已归一化）—— 顺带符合「复用同一份助手」的风格。
2. **注释里写出了那个转义序列** ⇒ **同一条 canary 再次误报**。
   ⇒ 这正是 §4「注释被计入」的又一次复现：**对整文件做文本判据时，注释里写出该模式同样会命中**。

### 本次改动

- 更正登记表第 1 行；`verify-release-gate.mjs` 增「取代关系」判据 + canary；
- **无产品代码改动** ⇒ 制品不变 ⇒ **不发新版本**。

## 4.115 裁决并实施 ADR-0033：图片导出补上「字号来源」（**默认不变**）（2026-10-06）

**依据**：用户 2026-09-30 的常设授权（同 ADR-0032 的引法）。

### 裁决 = **A2（提供「跟随编辑器字号」开关）**，理由（**先证伪了 A3**）

| 选项 | 判定 |
|---|---|
| **A3 跟随主题定义的字号** | ❌ **实测等于空操作** —— Mellow 的主题**没有 per-theme 字号**，排版字号是常量 `TYPOGRAPHY_DEFAULTS.fontSize = 16`（与 `BODY_SIZE` 同值）⇒ 永远解析成 16 ⇒ **选项永不产生可观察差异**（**假控件**） |
| **A1 不做** | 会把这个 parity 缺口**永久留着**（Typora 确实有这一半） |
| **A2 跟随编辑器字号** | ✅ `editor.fontSize` 是**用户可改**的真实设置 ⇒ 语义明确、可解释 |

**⚠️ 有意的差异**：Typora 的 radio 是「让**主题 CSS** 的字号生效」；Mellow 的图片导出是
**canvas 渲染**（显式 `fontFamily`）、**没有主题 CSS 通道** ⇒ 取「跟随**编辑器**字号」作近似。
**该差异须登记 D**。

### 实施（**默认 `custom` ⇒ 既有输出逐字节不变**）

- 设置项 `export.image.fontSizeMode`（select / **默认 `custom`**）；
- App 接线：`followEditor` ⇒ `settingById('editor.fontSize')` 的值作为 `bodyFontSize`（非法/缺失回落既有路径）；
- i18n zh/en 各 **4** 条键（目录 811 → **815**）；
- 护栏：`verify-settings-contract.mjs` 的图片字号段扩展（schema 形态 + **默认必须是 `custom`**
  + App 两处读取 + **「跟随编辑器字号」必须读 `editor.fontSize`**（否则选项静默无效）+ 2 条 canary）；
- **`BODY_SIZE` 与既有护栏断言未动** ⇒ 既有导出输出不变 ✓。

### 状态变化（如实声明）

- 门禁 `Pending decisions:` 由 `ADR-0033` **回到「无」**（ADR-0033 移入 `DECIDED_ADRS`）；
- 登记表第 16 行 → **已裁决**；
- **产品代码改动**（设置 schema + App + i18n）⇒ 制品变化 ⇒ **发 v1.5.33**。

### ⚠️ 仍未裁的部分（**不要顺手改**）

**默认值是否对齐 Typora 的 24** —— 会改变**所有**既有图片导出输出（面积 **1.5×** 放大，
更易触及 `MAX_IMAGE_HEIGHT` / `MAX_IMAGE_PIXELS` 长图保护）⇒ **须经视觉 / 真机确认后另裁**
（ADR-0033「关键风险」节；`BODY_SIZE = 16` 的护栏断言**故意保留**）。

## 4.116 `create-release` job 缺 `actions/checkout` ⇒ v1.5.33 发布**首次运行即失败**（2026-10-06）

**现象**：推 `v1.5.33` 后 `Release Packaging` **10 秒即 failure**，三平台 job **全部 skipped**：

```
Create draft release (single owner; prevents concurrent find-or-create race) → failure
Linux / Windows / macOS / Finalize → skipped
```

日志：`failed to run git: fatal: not a git repository (or any of the parent directories): .git`

### 根因：**是 §4.108 那次修复引入的**

`gh release create` 需要**git 仓库上下文**，而新增的 `create-release` job **没有 `actions/checkout`**
⇒ exit 1。又因为三平台 job `needs: [create-release]` ⇒ **连带全部跳过** ⇒ 整个发布没跑。
**这是该 job 第一次运行**（v1.5.32 的 run 早于修复），所以此前没暴露。

### ⚠️ 两点「好消息」（都值得记）

1. **新守卫的「重复断言」本身工作正常** —— 日志里有 `现有同 tag release 数：0` ✓；
2. **失败是响亮的** —— job 直接 `failure`，而**不是**产出一个残缺的正式发布。
   这正是 §4.108 想达到的效果：**把「不完整」从静默变成响亮**。

### 修法

- 补 `actions/checkout@v4`（提供 git 上下文）；
- **顺带加固** `gh release create`：
  - **`--verify-tag`** —— tag 不存在就**中止**（否则 gh 会「自动从默认分支建 tag」，
    那会造出一个**与本次构建无关**的 tag）；
  - **`--generate-notes`** 取代 `--notes ""` —— 避免在**无 TTY** 的 CI 里因缺 notes 而卡住；
    正文随后由 `finalize` 覆盖（**它才是 notes 的真值源**）。

### 恢复：**移动标签**（产品代码不变 ⇒ 制品等价）

`Release Packaging` 用的是**标签所指提交**的 workflow 定义 ⇒ `gh run rerun` 仍会用**旧定义**（仍失败）
⇒ 必须把标签移到修复提交，重新触发。

> 与 MEMORY 的既有口径一致：「**标签里含偶发测试时必须移标签**（`git tag -f` + `git push -f`），
> **不接受「重跑变绿」**」。本次是**流水线缺陷**（非偶发），修好后移标签是唯一正确路径。

## 4.117 【两次更正】「插入文件夹链接」**确是 Typora 的功能**；而真正的错误根因是**「`head` 之后把前 N 条当成全部」**（2026-10-06）

**本节经历过两次结论翻转，两次都记在这里** —— 因为**第二次的教训**才是真正可复用的。

### 翻转一：结论错了（功能是真的）

**我原判**：「`Insert Folder Link` 只存在于 locale、代码无人引用 ⇒ Typora 自身的残留文案 ⇒ 从 parity 待办移除」。
**事实**：它在 **`TypeMark/page-dist/static/js/Preferences.*.js` 里有引用**：

```js
element(w.r, { keyName: "actionWhenDropFolder", …,
  options: { "": "Open in Typora", link: "Insert Folder Link" } })
```

⇒ 它是**「当拖入文件夹时」这个偏好的一项动作选项**（`Open in Typora` / `Insert Folder Link`）
⇒ **Typora 确有该功能** ⇒ **本项是真实的 parity 缺口，P2 判定不变** ✓。（方案行 14b 已回退并写明。）

### 翻转二：**我对「翻转一」的根因归因也错了** —— 与 `grep` 无关

**我先归因给「本机 `grep` 是 toybox、会静默漏匹配」**。**该归因同样是错的**，实测如下（同一目录、同一模式）：

| 量法 | 结果 |
|---|---|
| `grep -rl "Insert Folder Link" .`（Typora 资源根递归） | **40** 条 |
| 上面 40 条的**构成**（逐条分类） | **39 个 locale + 1 个非 locale** —— 那个非 locale **正是** `Preferences.*.js` |
| `grep -rl … ./TypeMark/page-dist` | **1**（就是它） |
| **node 逐文件读（真值）** | **40**，非 locale 同样是那一个 |

⇒ **`grep` 与 node 结果完全一致 ⇒ `grep` 没有漏任何东西。**
（`grep --version` 确实是 `toybox 0.8.13`，但**本案例的漏检与它无关**。）

**真正的根因（两条，都是我自己的读数错误）**：

1. **`| head -10` 之后，把「前 10 条」当成了「全部 40 条」** ——
   我打印了 10 条（**全是 locale**）就写下「**只**出现在 40 个 locale 文件里」，
   **从没看过剩下那 30 条**（其中 1 条就是 `Preferences.*.js`）。
   ⇒ **`head` 截断的输出不能用来做「全部」的断言**；要看全部就**别 `head`**，或**先分类再断言**。
2. **用「搜错了东西」的 0 命中当佐证** —— 我又搜了 `insertFolderLink` / `folderLink` 等
   **JS 标识符**，全部 0 命中，于是「佐证」了错误结论。而该文件的键是
   **英文原文**（`"Insert Folder Link"`）而非标识符 ⇒ **那两个 0 命中从一开始就没有证明力**。
   ⇒ **「0 命中」必须先确认「我搜的是对的东西」**。

### 处置

1. **回退**方案行 14b（恢复「❌ 仍未实现：`插入文件夹链接`（P2）」+ 写明证据与这次的错误）；
2. **回退**长期记忆与 skill 里「toybox grep 静默漏匹配」的归因（保留 `grep --version` 的事实，但**不再声称它导致了本次漏检**）；
3. **保留并推广工具** `tests/parity/tools/audit-typora-orphan-strings.mjs`（**node 实现**）：
   - `--check "<串>"`（**决定性用法**）：同时报**文案面命中**与**代码面命中**，直接回答「Typora 有没有在用它」；
   - `--list`：列出全部「locale 有、代码无」的串（**线索清单**，需人工分诊 —— 含**原生侧**假阳性）；
   - ⚠️ 该工具**自己**也踩过一次扫描面缺口：首版只扫 `appsrc` + `page-dist` ⇒ 把 `TypeMark/index.html`
     里的文案全判成孤立（**279/1014 = 27% 假阳性**）⇒ 改为扫**整个 `TypeMark/`（排除 `locales/`）**（降到 213）。
     这正是本仓「**扫描面缺口 = 尚未检查的样本**」的又一次复现。

### 教训（两次翻转之后剩下的那一条）

1. **`head` / `tail` / `grep -c` 的截断或计数输出，不得直接支撑「全部 / 只 / 唯一」这类断言** ——
   要断言「全部」，就**看全部**，或**先按类别聚合再断言**（本轮用 node 分类后一眼看出 39+1）。
2. **「0 命中」的先决条件是「搜对了东西」**：先问「如果它存在，**会以什么形态**出现？」
   （原文串？标识符？id？转义形态？）—— 形态猜错，0 命中就毫无证明力。
3. **两次翻转的代价都来自「用弱读数支撑强结论」** ⇒ 结论强度必须与**读数强度**匹配。

### 连带发现并修掉的一个**真实缺陷**：不进 CI 的脚本，语法坏了没人知道

改工具头部时我在**块注释里写出了 glob**（星号紧跟斜杠）⇒ **提前闭合注释** ⇒ 语法错误；
而该文件是**手工工具、不进 CI** ⇒ `npm run parity` **全绿**，坏掉的脚本会一直躺在仓库里。
（**同一个坑我连踩两次**：修完后又在新写的说明文字里写出了同一序列。）

⇒ **新增判据 ⑩（并入 `verify-build-pipeline.mjs`，护栏数仍 23）**：
**`tests/**` 与 `tools/**` 下的每个 `.mjs` 都必须通过 `node --check`**；
下限 30 个文件；**canary**：临时写一个语法坏掉的样本，检查器必须报出来。
**注入验证**：在块注释里注入 glob 写法 ⇒ **被检出「语法不通」** ✓。
（顺带覆盖 `tests/e2e/**` 的 31 个不进 CI 的脚本。）


## 4.118 补审 `desktop-ui-design-spec` 的 §6/§7/§9/§11/§12/§17/§18：**§11 整节失效**、**§6 数字不符**、**轮次表静默停止**；并**精确化**「`grep \|`」的根因（2026-10-06）

### 动因与范围

§4.69 记下「`desktop-ui-design-spec` **20 节只审过 §19**」并就地修了 §3/§4/§5/§8（§10 由单测覆盖）。
本轮补审**其余 7 节**：**§6 File Tree / §7 Outline / §9 Floating Toolbar / §11 Welcome /
§12 Settings / §17 Empty States / §18 Animation**。方法仍是「**谁在守**」：先把该节的**每一条**列出来，
再逐条找**可核实**的载体（断言本体 / 单测 / 现读的 CSS 值），**不用关键词命中判「已覆盖」**。

### 一、正向确认（5 节）

| 节 | 该节要求 | 载体（实测） |
|---|---|---|
| **§7 Outline** | heading tree / current highlight / click jump / **filter** / collapse / flat·tree；「当前 heading 变化不得导致侧栏剧烈滚动」 | 六项**全在**：`OutlineList.tsx`（层级 `item.level`、`currentId`、`onJump`、`collapse`、`flat`）+ `App.tsx` 的 `outlineFilter` state 与 `.outline-filter` 输入框（`filterOutline`）+ 键盘选中滚动跟随用 `scrollIntoView({ block: 'nearest' })`（**不扰动用户视口**，正是该节末句的要求） |
| **§9 Floating Toolbar** | 只在 selection 时出现；内容 H1/H2/H3·Bold·Italic·Strike·Code·Link·Quote·List；规则 **IME hidden** / **Escape closes** / keyboard accessible / **never cover selected line center** / **user can disable** | 载体是**引擎级** `selectionToolbar.ts`（不是壳层）：`shouldShowToolbar({enabled, composing, hasSelection, hidden})` 一条表达式同时承载「仅选区」「IME 隐藏」「可禁用」；`ACTION_IDS` 是**超集**（h1–h6 等 38 个）；`role="toolbar"` + aria-label + roving tabindex；Escape 由 keymap 归还焦点。`selectionToolbar.test.ts` **40+ 例**覆盖五条规则（含「shows above selection」与「Escape 后同一选区再 selectionSet 恢复」） |
| **§12 Settings** | 10 个分区；左栏 180–220 px；右内容 max 720 px | `SETTINGS_SECTIONS` 的 10 个 id（general/editor/markdown/files/image/appearance/export/shortcuts/extensions/advanced）**与本节列出的 10 个逐一对应**；`styles.css` 的 `.settings-nav` = `width: 200px` + `min 180` + `max 220`（**落在区间内**），`.settings-content` = `max-width: 720px`（**精确相符**） |
| **§17 Empty States** | File「打开文件夹以浏览文件」/ Outline「当前文档没有标题」/ Search「输入关键词搜索当前文件夹」；禁止插画占满空白区 | 三条文案在 `packages/i18n` 里**逐字相符**（`sidebar.emptyFiles` / `outline.empty` / `search.empty`），由 `.sidebar-empty` 渲染（**纯文字，无插画**）。Mellow 另多出两态（`sidebar.emptyFolder` / `sidebar.noFilterMatch`）—— 是**超集**，不违「禁止插画」 |
| **§18 Animation** | 允许 panel fade/slide **120–180ms**、menu native、toolbar fade；禁止 caret animation / spring editor layout / marker movement animation / table resize animation | 全仓 `animation`/`@keyframes`/`transition` 只有 **3 处**（`.context-menu` 120ms、`.quick-open-backdrop` 140ms、`.settings-backdrop` 140ms）—— **全部落在 120–180ms**；引擎侧另有 `focusMode.ts` 的 `opacity 120ms`（属「panel fade」允许项）与 `largeFile.ts` 的 `transition/animation: none !important`（大文件模式**主动关闭**动画，与该节同向）。**未发现**任何 caret / 编辑器布局 / marker / 表格尺寸的动画 |

### 二、真实发现 A：**§11 Welcome 整节失效**，且**从未与 B2 对账**（+ 81 行死 CSS）

**该节要求**：欢迎页「只包含 `Mellow` / 新建文档 / 打开文件 / 打开文件夹 / 最近使用」，且不含 news / login / AI prompt / mascot / marketing。

**实测**：欢迎页**已经不存在了** —— 它按 **B2** 决策「**停用并移除 —— 启动即文档，对齐 Typora**」被删掉，
而**这句话只写在 `packages/desktop-ui/src/index.ts` 的头部注释里**。三条独立取证：

1. `apps/desktop/src/App.tsx` 内 `welcome` 命中 **0**；
2. `packages/*/src` 与 `tests/` 内命中 **0**；
3. `styles.css` 里**仍有 81 行** `.welcome*` 规则（1617–1697），但**没有任何引用方** ⇒ **死代码**。

**为什么这是缺陷（三层）**：

- **权威层与产品不一致**：spec 是**权威层**（优先级高于 ADR / plan），它描述了一个**不会存在**的界面。
  与 **§4（Tabs 整节）** 同型 —— 区别只在 §4 由**架构**决策（SDI）导致、本节由**产品**决策（B2）导致；
  **§4 已登记 D-Y，本节什么都没登记**。
- **D 表无登记**：`grep -i "welcome\|欢迎页" docs/` 命中 **0** ⇒ §12 自称「唯一可发现处」而此处**没有任何条目**
  （正是 D-AC 记下的那条教训：「护栏注释**不是**决策登记处」）。
- **误导性死代码**：那 81 行原注释写着「Welcome（§11：只含三个入口）」—— 一个读者**只看 `styles.css`**
  会以为 §11 **已实现**。死代码本身不报错，但它让「这一节还有人管」看起来成立。

**处置**：① spec §11 加更正块（**作废但保留原文**，依据 = B2 的代码注释原文 + 三条取证，并**明确写下**
「`typora-menu-dump.txt` 里的 `welcomePanelItem` **不是反证**」—— 那是 Typora 自己的 Help → `Welcome Guide`，
Mellow 由 `help.quickStart`「快速上手」承载）；② **D 表新增 `D-AJ`**（与 §4 的 D-Y 并列）；
③ **删除那 81 行死 CSS**，在原位置留一段说明（谁删的、为什么、依据在哪）。

**⚠️ 一处必须写清楚的边界**：B2 是**已实施的产品决策**，不是待裁决项 ⇒ 本条**不新增 ADR**
（ADR 是**待裁决项**的载体；已决定且已实现的有意差异，载体是 **D 表**——同 D-AH/D-AG 的做法）。

### 三、真实发现 B：§6 的「行高 **26–30 px**」与实现不符 —— 这是**第三例**同型漂移

**实测**：`.tree-row` 的 `min-height: 24px`（`styles.css`），且**是有意对齐 Typora 真机**的结果 ——
同文件注释写明依据（Typora 文件行 `line-height: 22px` + `#777` 字色 + `14px` 字号），
Mellow 取 `padding: 1px` ⇒ `22 + 2 = 24`。**24 落在 [26, 30] 之外**。

**为什么值得单列**：§4.69 已经记了**两例**（§5 侧栏 260/200 → 270/160、§8 820/1.65 → 860/1.6），
并给了根因「`TYPOGRAPHY_DEFAULTS` 那次统一只覆盖了**代码侧三处**，**spec 这第四处被漏掉**」。
本节是**同一根因的第三例** —— 说明那次修复的**扫描面**（「哪几处副本」）没有系统性枚举，
只修了**当时发现的那几处**。**这正是「同一类缺陷必须靠判据拦，而不是靠再找一遍」的理由。**

**处置**：① spec §6 的声明行改为 `- **24** px`（并加更正块写明依据与「这是第三例」）；
② **扩 `verify-shell-typography.mjs` 的「spec 硬数字 = 代码单一真源」判据到 §6** ——
从 `.tree-row` 规则**现读** `min-height`（**不写死 24**，写死会在实现改动后仍然通过 = 恒真），
与 spec 的**声明行**交叉比对；**注入验证 2/2**（改 spec ⇒ 红；改 CSS 而不改 spec ⇒ 红）。

### 四、真实发现 C：施工计划的**轮次表在 §4.80 静默停止**，且**没有指针**

**实测**：`docs/plans/typora-parity-master-plan.md` 的轮次表最后一行是「**四十一续（审计 §4.80）**」，
而**审计文档已写到 §4.117** ⇒ **本表少记了 37 轮**，且**全文没有任何指针**说明「后面记在别处」。
（分工本身没问题：审计文档从 §4.81 起就是逐轮日志，`MEMORY.md` 也是这么记的；
问题在**没有指针** ⇒ 读者会把本表读成「**完整的轮次记录**」。）

**处置**：在轮次表末尾补**指针行**（指名审计文档 + 声明起始编号），
并在 `verify-doc-code-refs.mjs` 加**三条判据**：① 指针**必须存在**；
② 指针声明的起始编号必须**紧接**表中最后一个编号（防「停止点悄悄前移」）；
③ 审计文档里**必须真的有** `## 4.(M+1)` 小节（防指针指向**空承诺**）。
**注入验证 2/2**（抹掉指针里的编号 ⇒ 红；把 §4.81 写成 §4.82 ⇒ 红）。
⚠️ 编号**只从轮次表行**里取 —— 首版扫全文，被 D 表里我自己刚写的「审计 §4.118」抬到 118（**当场抓到**）。

### 五、⚠️ 本轮**差点写出一条假结论** —— 并把「`grep \|`」的根因**精确化**

**过程**：查 §16「不得强制捆绑超大 CJK font」时，先扫到
`apps/desktop/public/fonts/NotoSansSC-{Regular,Bold}.ttf` **各 10 MB**（共 **20 MB**，**git 已跟踪**，
Vite 会原样复制进 `dist/` 与安装包），而我用
`grep -rn "NotoSansSC\|Noto Sans SC\|noto-sans-sc" . --exclude-dir=node_modules …` 得到 **0 命中**，
据此**已经准备写下**「20 MB 字体无任何引用 ⇒ 违反 §16」。
**改用 Grep 工具复核，结论完全反转**：`packages/export/src/index.ts` 的 **PDF 导出**正在用它们
（`fetch(\`${baseUrl}/fonts/NotoSansSC-Regular.ttf\`)` → 内嵌进 PDF）。
⇒ **§16 没有被违反；这是一条我差点写进审计的假发现。**

**根因（本轮用最小 A/B 复现，不再是推测）**：本机 PATH 上的 `grep` 是 WorkBuddy 的垫片
（`grep --version` → `toybox 0.8.13 (is not GNU grep 9.0)`）。同一目录、同一意图：

| 写法 | 命中 |
|---|---|
| `grep -rn "A\|B" dir` | **0** ← 静默，**不报错** |
| `grep -rn -e A -e B dir` | **8** ✓ |
| `grep -rnE "A\|B"`（ERE） | **8** ✓ |

⇒ **toybox 的 BRE 不支持 `\|` 交替，且不报错。**

**与 §4.117 的关系（必须分清，否则会把两次结论搞混）**：
§4.117 的漏检**不是** `grep` 造成的（那次是「`| head -10` 之后把前 10 条当全部」+「用搜错形态的 0 命中当佐证」）；
**但 `grep \|` 确实会静默返回 0** —— 两条都成立，是本轮**用 A/B 把它坐实**了。
**共同的可复用判据只有一条：`0 命中` 必须先用一次「已知应当命中的对照」证明量具是好的。**

**处置（把这条从「纪律」变成「机器判据」）**：新增**判据 ⑪**（并入 `verify-build-pipeline.mjs`，
护栏数仍 **23**）—— **`.sh` 文件与 `.github/workflows/*.yml` 里不得出现依赖 BRE `\|` 交替的 `grep`**。
- **危害面正是本仓最在意的那一类**：这种写法在 **CI（GNU/BSD grep）能过**，而在本机**静默 0 命中**
  ⇒ 用它支撑的「命中 0 / 全仓无 / 无人引用」类结论**是假的**；
- **如实声明：本判据是预防性的** —— 立此条时仓库内**违规 0 处**（6 个 `.sh` + 3 个 workflow 实测）；
- **如实声明范围**：**不扫 `.mjs`**（那里 `\|` 大量是**JS 正则字面量**的合法转义，实测数十处，
  机械扫描会制造成片假阳性 —— **与其做一个会误报的判据，不如明确不做**）；
  明确**放行** `-E` / `-F`（两种情况下 `\|` 都是**字面竖线**，行为确定，不属本判据要防的形态）；
  跳过行首 `#` 的注释行；
- **canary 5 个方向**（双引号形态 / 单引号形态 / `-E` 不误报 / `-e -e` 不误报 / 注释行不误报），
  **与判据共用同一个纯函数**；**注入验证 2/2**（`.sh` 与 workflow 两种载体各一次，报错含 `文件:行号`）。

### 六、我自己的错（被自己的 canary 当场抓到）

写轮次表指针判据的 canary 时，我把「**过宽**」那一条的断言**写反了** ——
`if (!hasSection('## 4.8 x\n', 81))` 应为 `if (hasSection(...))`。
⇒ 结果不是「判据没抓到漂移」，而是**判据对正确行为报错**（首次运行即红）。
**可复用的点**：canary 的两个方向**语义相反**（「漏报」用 `!`、「误报」不用 `!`），
写反了会**立刻红**（这次是幸运），但也可能写成一个**恒不触发**的表达式而静默通过 ——
**每个 canary 都必须至少被实跑触发过一次**（本仓既定纪律）。

### 七、教训

1. **「权威 spec 有一整节不可满足」已经发生两次**（§4 Tabs、§11 Welcome），两次都**没有**任何东西在守
   —— 因为**「这一节还适用吗」无法自动判定**。能机械化的只有**它的下游**：
   一旦某节被声明为「不适用」，**必须**在 D 表里留下编号（本轮 D-AJ），
   否则「作废」这个动作本身**没有可发现处**。
2. **修「多处副本不一致」时，扫描面必须按「副本的类别」枚举，而不是按「这次发现的几处」**
   —— §5/§8 修完之后 §6 又冒出来，就是只修了「当时看到的」。
   这也是为什么**修完必须立刻加判据**：判据才是枚举。
3. **`0 命中` 的先决条件永远是「量具是好的」**。本轮把它从纪律升级成了判据 ⑪。
4. **死代码的注释也会「声称」**：`/* Welcome（§11：只含三个入口） */` 读起来像功能存在。
   删除死代码时**要留一段说明**（谁删、为什么、依据在哪），否则下一个人会以为是漏删。
5. **本轮所有新判据都做了注入验证**（§6 两向 / 轮次表指针两向 / 判据 ⑪ 两载体），
   且**每条 canary 都被实跑触发过一次**（第六条那个错就是这么抓到的）。



## 4.119 历史 Draft 实测：**5 个是完整构建**（更正旧记录）+ 同标签重复必须**按 release id** 删（2026-10-06）

**动因**：§4.68 ⑦ 记下的「6 个历史 Draft 仍遗留」一直没有机器可读的细节（只写了「`v1.5.12` 只有 12 制品、缺 `.dmg`」）。
本轮清掉 `v1.5.32` 的同标签重复 Draft 时顺手把**全部 Draft 的制品数**量了一遍。

**实测（`gh api repos/…/releases` 逐条）**：

| tag | 制品数 | 说明 |
|---|---|---|
| `v1.5.6` / `v1.5.7` / `v1.5.8` / `v1.5.11` / `v1.5.13` | **各 15** | **完整构建** —— 满足 finalize 的资产断言（7 关键制品 + 总数 ≥ 15） |
| `v1.5.12` | **4** 与 **12**（**两个同名 Draft**） | 两个都**不齐**（缺 `.dmg`） |

⇒ **更正一条旧记录**：此前把「6 个历史 Draft」笼统记成「不完整」是**不准确**的 ——
**真正不齐的只有 `v1.5.12`**；其余 5 个是**完整的、今天可以直接发布的构建**，
它们未发布的原因**只是「解除 Draft」这一步从没执行**（§4.68 记的那个人工门禁，漏检率 6/12）。
**这条更正改变了「清理」的性质**：它们**不是垃圾，是积压的成品**。

**处置（用户裁决 = 只删 `v1.5.32` 的重复 Draft）**：

1. **删前核验三步**：① 同标签两个 release 的身份（`draft=true` 4 制品 / `draft=false` 15 制品）；
   ② **逐条比对制品名** ⇒ Draft 那 4 个是已发布版 15 个的**严格子集** ⇒ **零信息损失**；
   ③ 确认删除目标无歧义。
2. **按 release id 删**（`gh api -X DELETE repos/<owner>/<repo>/releases/<id>`），
   **不加** `--cleanup-tag`。
   ⚠️ **不要用 `gh release delete <tag>`** —— **同标签存在多个 release 时目标有歧义**，
   可能删到**已发布**的那一个（这正是本仓刚修过的那类竞态留下的形态）。
3. **删后核验**：`v1.5.32` 只剩 1 个（`draft=false`、15 制品）；**tag `v1.5.32` 仍在**（`git ls-remote` 确认）；
   `releases/latest` 仍 = `v1.5.33`；远端 Draft **8 → 7**。

**遗留（未动，如实登记）**：**7 个 Draft 仍在** —— 其中 5 个是**完整构建**（可直接发布），
`v1.5.12` 的 2 个不齐（**不宜补发布**）。是否补发这 5 个属**产品/发布决策**（会改变用户可见的发布历史），
**本轮未擅自做**。

**教训**：**「遗留清单」本身也会失真** —— §4.68 只写了「6 个 Draft」和一个例子，
读者（包括我自己）就会**默认它们都不完整**。凡记「遗留 N 项」，**必须带逐项的机器可读数字**，
否则下一次会基于错的印象做决定（本轮差点把 5 个成品当垃圾一起清掉）。



## 4.120 「与 Typora 的差距」全量盘点 + 实装围栏数学 + 补上「待裁决」的机器可读载体（2026-10-07）

### 一、盘点口径（先定总量，再谈差距）

| 层 | 载体 | 总量 | 说明 |
|---|---|---|---|
| 发布门禁 | `tests/parity/typora-parity-ledger.json` | **50** 项 P0 | 唯一「发布阻断」口径 |
| 偏好逐键 | `tests/parity/fixtures/typora-preferences-matrix.json` | **84** 个 Typora 偏好键 | 一手来源 `frame.js` 的 `DEFAULT_OPTIONS` |
| 有意差异 | master-plan §12 **D 表** | **38** 行 | 裁决的唯一可发现处 |
| 静态护栏 | `tests/parity/verify-*.mjs` | **23** 个 | 以门禁自报为准 |
| 权威 spec | `docs/specs/*.md` | **10** 份 | 优先级最高（高于 ADR / plan） |

**方法**：三层各自独立清点，**不互相替代**（本仓反复踩过「拿 A 层的绿灯当 B 层已覆盖」）。

### 二、门禁层：50 项里 **9 项未闭环，且全部是环境 / 人工阻塞**

`P0-EDITOR-001` / `P0-EDITOR-003` / `P0-EDITOR-004` / `P0-SHELL-001` / `P0-MENU-001` / `P0-PERF-001` /
`P0-QA-001` / `P0-EDITOR-005` / `P0-LAYOUT-002`。

阻塞原因（门禁 `Blocked by:` 行现算）：`ux-gate-policy` 6 项（**按 ADR-0024 Q1=A3，含 `ux-gate` 的项不得以 `AUTO` 收口**）、
`ux-gate-policy + perf-harness-pending` 1 项、`human-ux-gate-session` 1 项、`runtime-verification-pending` 1 项。
⇒ **本环境（无 GUI / 无触控板 / 无人工会话）**能自主推进的部分**已经推完**；`PASS-E` 实测 **0/50** 依然成立。

### 三、偏好层：**47 gap / 31 implemented / 6 n/a**，其中**真正需要动作的只有 13 项**

84 键按 status 分：`gap` **47** / `implemented` **31** / `not-applicable` **6**。
但 `gap` **不等于缺陷**（本仓既定判据：「要紧的是 Mellow 的实际行为是否等于 Typora 默认」）——
47 个 gap 的行为判定是：**`matches-default` 37 / `differs` 8 / `n/a` 2**。

**另有一条被长期混谈的轴**：`deviation`（Mellow **有**该设置但**默认值**不同）= **7 条**
（`deliberate` 2 / `undecided` 5）。

⇒ **需要动作的 = 8（behavior differs）+ 5（undecided 默认值）= 13 项**，逐项归类如下。

#### 3.1 八项 `behavior: differs`（无该选项、且行为与 Typora 默认不同）

| 键 | Typora 默认 | 归类 | 处置 |
|---|---|---|---|
| **`gitlabMath`** | **`true`** | **可实装** | **本轮已实装**（见第四节）⇒ 判定改为 `matches-default`（37） |
| `mathFormatOnCopy` | `svg` | 需设计 | 复制公式要**同步**写剪贴板，而渲染是**异步** `tex2svgPromise` ⇒ 需预渲染缓存，属独立功能 |
| `noLegacyMath` | `false` | 需先定范围 | Typora **默认启用** legacy 数学解析；Mellow 无 legacy 分支 ⇒ 等价于 `noLegacyMath=true`。**先要明确「legacy 语法」的边界**再谈实现 |
| `presetSpellCheck` | `auto` | **⛔ 阻塞** | 依赖 `host-api` 的词典能力（`P0-EDITOR-005`，未闭环） |
| `wordCountDelimiter` | `0`（WORD） | 需裁决 | Typora 有 WORD/CHAR/LINE/TIME 四种模式；Mellow 固定同时展示多项统计 ⇒ **默认呈现口径不同**，需裁决（不能拿 CJK-aware 统计冒充对齐） |
| `autoEscapeImageURL` | `false` | **有意差异** | Mellow 恒做 `%XX` 转义（取互操作性）⇒ **应登记 D，但目前只在矩阵里** |
| `useRelativePathForImg` | `false` | **有意差异** | Mellow 恒写相对路径（取可移植性）⇒ 同上 |
| `useTreeStyle` | `false` | **有意差异** | Typora 默认列表、Mellow 默认树（产品默认）⇒ 同上 |
| `wordsPerMinute` | `382` | **有意差异** | Mellow 是 CJK-aware（中文 300 字/分 + 英文 200 词/分）⇒ 同上 |

> ⚠️ 上表最后四行（`autoEscapeImageURL` / `useRelativePathForImg` / `useTreeStyle` / `wordsPerMinute`）
> 都是**有意差异**，但**只在矩阵的 `behaviorNote` 里**，**没有进 D 表**。
> 与 §4.118 的 §11 Welcome、§4.67 的 `D-AB` **同型**：**「唯一可发现处」里没有它**。
> 本轮**只如实记录，未擅自补 D 行**（补 D 行要先确认它们是「有意」而不是「待修」，见第七节遗留）。

#### 3.2 五项 `deviation.kind === 'undecided'`（**本轮的主发现**，见第五节）

`enableHighlight` / `enableSubscript` / `enableSuperscript` / `enableDiagram` / `zoomByMouse`
—— Mellow 的默认值**全部与 Typora 相反**（Mellow 开、Typora 关），且**没有任何载体**。

### 四、本轮实装：**围栏数学**（Typora `gitlabMath`，**默认开启**）

#### 4.1 缺口是什么（**「半实现」而非「没实现」**）

| 部件 | 对 ```` ```math ```` 的态度 |
|---|---|
| 右键菜单 `contextMenu.ts` | **当成数学块**（`kind: 'math'`，有**专门的单测** `context-menu.test.ts:182` 锁着） |
| 代码围栏语言补全 `codeFence.ts` | **把 `math` 列进语言表**（`FENCE_LANGUAGES`），**主动引导用户去写它** |
| **渲染器 `math.ts`** | **完全不认** —— `parseMathSpans` 只处理 `$`/`$$`/`\(`/`\[`，且**把围栏整段跳过** |
| Typora（默认） | **渲染成公式块** |

⇒ 用户从语言下拉里选了 `math`，右键菜单也告诉他「这是公式块」，
**屏幕上却是一个代码块** —— 这是**Mellow 与自己矛盾**，不只是与 Typora 有差距。

#### 4.2 一手证据：Typora 的判定**只有 `math` 一个词**

```js
D.isMathType = function (e) {
  return File.option.gitlabMath && 'string' == typeof e && a.isType((e || '').toLowerCase(), 'math')
}
```
- `DEFAULT_OPTIONS` 里 **`gitlabMath: !0`（默认 true）**；
- `isMathType` 定义在模块 `1b`，其中 **`a = o.Node`（`o = e('11')`）**；
- `Node.isType(e, …)` 是**通用相等比较**（`var t = e.attributes ? e.attributes.type : e; … if (t == arguments[n]) return true`），
  且第二实参是**字符串字面量 `"math"`** ⇒ **等价于 `lang.toLowerCase() === 'math'`**。

⚠️ **一个容易读错的陷阱**：`main.js` 里另有
`case"stex":case"tex":case"latex":case"math": return "text/x-stex"` ——
那是 **CodeMirror 语法高亮模式**的别名表，**不是**数学判定
（`latex`/`tex` 围栏在 Typora 里是**按 TeX 高亮的代码块**）。

#### 4.3 处置

1. **`math.ts` 新增单源判定** `MATH_FENCE_LANGS = new Set(['math'])` + `isMathFenceLang(info)`（大小写不敏感），
   并把一手证据写进常量注释；
2. **`parseMathSpans` 认识围栏数学**：信息串为 `math` 的围栏 ⇒ 产出**一个 `kind: 'block'` 的 span**，
   覆盖**整段（含开/闭栏行）**，`tex` = 栏内内容；未闭合时**延伸到文末**（与未闭合 `$$` 同处置）；
3. **`contextMenu.ts` 收敛到同一真源**：删掉本地那份**更宽**的
   `new Set(['math','latex','tex','katex','texmath'])`，改为 `import { isMathFenceLang }`。
   ⇒ ```` ```latex ```` 等**改判为 `kind: 'code'`**（与 Typora 一致：它们是代码块）；
4. **顺带修一处类型混淆**：`mathBlockAt` / `mathBlockRangeAt` 等 5 处原用
   **`span.open === '$$'`** 当「块级数学」的**代理** ⇒ **静默漏掉 `\[…\]` 与新支持的围栏数学**。
   改用 **`span.kind === 'block'`**（`MathSpanKind` 的定义本来就是这件事）。

**测试**：新增 12 例（扫描器 7 + 真实编辑器 1 + 右键菜单 4），
覆盖「只有 math」「`~~~` 围栏」「大小写」「未闭合延伸到文末」「围栏内的 `$$`/`$x$` 不再被解析」
「4 空格缩进不算围栏」「两个围栏互不吞并」「光标在围栏外 ⇒ 整段替换为块级 widget、光标进入 ⇒ 显示源码」。
**非恒绿验证（两向）**：集合置空 ⇒ **6 例失败**；放宽回旧的 5 语言集合 ⇒ **1 例失败**（正是那条「只有 math」）。

**护栏**：`verify-shell-widgets.mjs` 新增判据（**单源**）—— `math.ts` 必须导出
`MATH_FENCE_LANGS = new Set(['math'])` + `isMathFenceLang`；`contextMenu.ts` 必须**导入**它
且**不得**再出现本地集合；**不得**再用 `open === '$$'` 当块级代理。
canary 6 向、与判据**共用同一组谓词**；**注入验证 3/3**（放宽集合 / 加回本地集合 / 退回定界符代理）。

### 五、本轮治理修复：**5 项「待裁决」没有载体，而门禁说「无」**

**实测**：矩阵里 5 条 `deviation.kind === 'undecided'`（见 3.2），
而它们在 `docs/` 里**只出现在 master-plan 的轮次叙述**（「**5 项待裁决**（方案与 PRD 均未见表述）」）
—— **审计的「待裁决项登记表（唯一声明处）」一行都没有**。
⇒ 门禁据此报 **`Pending decisions: 无`**：**项目在机器可读层面声称「没有任何待裁决项」**，而实际有 5 项。

**这正是 ADR-0029 自己留下的那半句**：登记表头部写着
「护栏**不能**自动发现『新加了 `待裁决` 字样却没登记』…… **要补上这一半需给标记定机器可读写法**」。
本轮把那半句**在「偏好默认值偏离」这条轴上补上**：

1. **`ADR-0034`（Proposed）** 承载这 5 项，逐项给出**一手证据 + 选项 + 建议**（见该 ADR）；
2. **登记表新增第 17 行**；门禁 `PENDING_ADRS` **重新非空**（这是**更准确**的信号，不是退步）；
3. **矩阵新增两个结构化字段**：`undecided` ⇒ **必须** `pendingRef`；`deliberate` ⇒ **必须** `carrier`；
4. **`verify-settings-contract.mjs` ⑭ 节新增判据**：`pendingRef` 必须指向**存在的 ADR 文件**且其
   **`**Status:**` 行仍为 `Proposed`**（裁决后必须把 `kind` 改为 `deliberate` 并去掉 `pendingRef`）。
   **注入验证 3/3**（删 `pendingRef` / 删 `carrier` / 把 ADR 改成 `Accepted`）；canary 含一条**防空转**断言
   （若矩阵已无 `undecided`，本判据必须被收掉，**不得留一个恒真的判据**）。

⚠️ **本轮刻意不改任何默认值**：这 5 项改的是**用户可见的默认行为**
（如 `==x==` 不再高亮、```` ```mermaid ```` 不再出图），属**产品决策**；
方案自己也写着「改这些默认会改变既有用户行为，故**只登记不擅改**」。
常设授权覆盖的是**审计程序**，不是**改变既有文档渲染结果**。
⇒ **登记 + 给建议**，把裁决成本降到「看一眼就能定」。

### 六、我自己的错（**同一坑 30 分钟内第二次**）

写「单源」判据的 canary 时，`noDelimiterProxy` 的**两个方向我写反了**：
该函数返回 **`true` = 没有代理（好）**，于是负样本（含代理）应当返回 `false` ——
而我写成 `if (!noDelimiterProxy(负样本)) 报错`，等于**在判据正确工作时报错**（首次运行即红）。
**这正是 §4.130 刚记下的那条**（「canary 两个方向语义相反」），**同一天第二次犯**。
⇒ 已在该判据处**就地写下方向语义注释**（「返回 true = 好」+ 两个样本各自的期望），
让下一个人不必再推一遍。

### 七、遗留（如实登记，本轮**未做**）

1. **4 项有意差异未进 D 表**（`autoEscapeImageURL` / `useRelativePathForImg` / `useTreeStyle` / `wordsPerMinute`）——
   补 D 行前需先确认「有意」而非「待修」，本轮只记录；
2. `noLegacyMath` 需先定义 **legacy 数学语法的边界**；
3. `wordCountDelimiter` 需裁决（是否提供 WORD/CHAR/LINE/TIME 四模式）；
4. `mathFormatOnCopy` 需设计（同步复制 + 异步渲染）；
5. **引擎级已渲染围栏数学，但与 CoreEditor 代码块包装器的视觉叠加未在真机验证**
   （`BlockWrapper` 与块级 replace 装饰**按 CM6 文档可嵌套**、且 `cm-md-codeBlockWrapper` **无样式**，
   但本环境无 GUI ⇒ **不得声称已验收**）。

### 八、教训

1. **「半实现」比「没实现」更难发现**：菜单认、语言表认、渲染器不认 ——
   **每一处单看都对**，只有**把三处摆在一起**才看出矛盾。
   发现它的入口是**跨部件的「同一语义有几个副本」清点**，不是逐个读代码。
2. **两条轴必须分开数**：`deviation`（有选项、默认值不同）与 `behavior: differs`（无选项、行为不同）
   在矩阵里是**两个字段**，历史上被混谈 ⇒ 结论会算错（把 13 项说成 9 项或 7 项）。
3. **「待裁决」写进散文就等于没写**：它必须能变成 `pendingRef` 这种**可判定的形态**，
   否则门禁会**替项目声称「没有待裁决项」**。
4. **canary 的方向语义要写在判据旁边**（§4.130 的补充）：写反了会「对正确行为报错」，
   而**写在旁边**能让下一个人不必重新推导。



## 4.121 把「**行为轴**」也纳入机器可读纪律 + 抓到一处**既有的判据缺陷**（「状态行」判据可被正文引用满足）（2026-10-07）

### 一、动因：上一轮只补了**一条轴**

§4.120 把「偏好默认值」那条轴的 5 项 `undecided` 补上了机器可读载体（`pendingRef`），
但**另一条轴没管**：`behavior: differs`（**Mellow 没有该选项、且行为与 Typora 默认不同**）共 **8 项**，
它们同样**只写在 master-plan 的轮次叙述里**，**没有任何载体**。

⇒ 本轮把两条轴**统一**：`behavior: differs` 的条目**必须**带
`disposition: { kind, ref }`，`kind ∈ {deliberate, gap, undecided}`，且 `ref` 的**形态决定它要解析成什么**：

| `kind` | `ref` 形态 | 必须解析到 |
|---|---|---|
| `deliberate` | `D-`+编号 | master-plan §12 的 **D 表声明行** |
| `gap` | 台账 id（`P0-<…>-<NNN>`） | `typora-parity-ledger.json` 里**存在** |
| `undecided` | `ADR-`+四位编号 | ADR 文件存在**且 `**Status:**` 行仍为 `Proposed`** |

### 二、8 项的处置分配（**依据是既有判定，不是本轮新造的判断**）

| 项 | 处置 | 依据（可回查） |
|---|---|---|
| `useTreeStyle` | **deliberate → `D-AK`** | 轮次表**第四十二轮**：「Typora 默认 fileList vs Mellow 默认 FileTree，判为**有意 differs**」 |
| `wordsPerMinute` | **deliberate → `D-AO`** | 轮次表**第二十九轮**：「Mellow 阅读时长是 CJK-aware…属**有意取舍**非缺陷」 |
| `presetSpellCheck` | **gap → `P0-EDITOR-005`** | 台账项「拼写检查词典与替换建议」（`IMPL`，未闭环）—— **依赖它，所以载体就是它** |
| `autoEscapeImageURL` | **undecided → ADR-0034 Q6** | 轮次表**第二十七轮**曾判「**2 项 differs（真缺陷：图片相对/绝对路径、URL 转义）**」，而**第二十九轮只把「真缺陷」这个措辞改成「未必是缺陷但需登记理由」，从未重判** ⇒ **必须重新裁决** |
| `useRelativePathForImg` | **undecided → ADR-0034 Q7** | 同上（同一条判定里的两项） |
| `mathFormatOnCopy` | **undecided → ADR-0034 Q8** | 需设计（同步复制 vs 异步渲染） |
| `noLegacyMath` | **undecided → ADR-0034 Q9** | **需先定义 legacy 数学语法的边界**（本轮未取到该集合，故不能判） |
| `wordCountDelimiter` | **undecided → ADR-0034 Q10** | 需裁决（是否提供 WORD/CHAR/LINE/TIME 四模式） |

⇒ 新增 **D-AK / D-AO** 两行（D 表声明行 38 → **40**）；ADR-0034 从 5 问扩到 **10 问**（并改名为 `…-preference-deviations-…`，因为它现在覆盖两条轴）。

### 三、⚠️ 连带更正：**D-AA 的一句「一致」站不住**

D-AA 行原文写「`insertLocalImage` 在同根时已默认输出相对路径，**与 Typora 该选项默认态一致**」。
本轮取一手证据（本机 Typora 1.14.9 的 `frame.js` / `main.js`）：

- `DEFAULT_OPTIONS.useRelativePathForImg = false`；
- `getLocalRootUrlForInsert()` 的取值链是「per-doc root → （`useRelativePathForImg` 时）当前文件目录 → 空串」
  ⇒ 默认态 root 为空；
- `resolveImagePath` 走「`!useRelativePathForImg` 或 root 不匹配 ⇒ **原样返回**」分支
  ⇒ **Typora 默认写「绝对」路径**。

而 Mellow 同根时写**相对**路径 ⇒ **两者默认行为不同**，与偏好矩阵的 `useRelativePathForImg: differs` **一致**，
与 D-AA 那句「一致」**矛盾**。⇒ 已**就地更正为如实表述**（**D-AA 的裁决「不加菜单开关」不受影响**，
改的是那句**未经一手核实的依据**）。是否改行为见 **ADR-0034 Q7**。

> **教训**：D 表条目里的**依据**也会过期/失真 —— 「某处一致」这种**未经核实**的断言
> 会和偏好矩阵这种**有实测**的登记处**互相矛盾**，而**两者都在「唯一可发现处」附近**。

### 四、⚠️ 本轮抓到的**既有判据缺陷**：「状态行」判据可被**正文里的一句引用**满足

**怎么发现的**：给「矩阵载体解析」写注入验证时，**注入「把 ADR-0034 改成 Accepted」⇒ 门禁仍然通过**。
追下去发现 `isProposed()` 用的是**无锚点**正则 `/\*\*Status:\*\*[^\n]*Proposed/`，
而 ADR-0034 的「机器可读化」节里**我自己写了一句话**：

> 「…`disposition.ref` 必须真的解析得到…其 `` `**Status:**` `` 行仍为 `Proposed`（裁决后必须改 `kind`，否则红）；」

⇒ 这句话**满足**了那个正则 ⇒ **把真 Status 行改成 Accepted 之后，判据照样通过**。

**影响面（普查结果）**：**34 份 ADR 里只有 ADR-0034 有 2 处 `**Status:**`**（因为是我写的这句），
⇒ 该缺陷**此前是潜伏的**，本轮被我自己的说明文字**触发**。
但它同时存在于 `PENDING_ADRS` 与 `DECIDED_ADRS` **两处既有判据**（同一写法）。

**修复**：三处一律**锚定行首** `/^\*\*Status:\*\*…/m`（正文里的引用行以 `>` 或中文开头，故不会被匹配）；
并给 canary **补一条本轮实测的负样本**（「状态行 + 正文里引用 `**Status:**`」的拼接样本必须**不被匹配**）
+ 一条「状态行不在文件首行时仍要检出」的正样本（锚点是**行首**，不是**文件首**）。
**注入验证**：改 ADR-0034 为 Accepted ⇒ 门禁报 **10 处解析失败**（5 个 `pendingRef` + 5 个 `undecided` 处置）✓。

> **教训（本仓第 N 次）**：**护栏会被自己写的说明文字满足** ——
> 而这次是**在写护栏的同一轮里**踩进去的。**凡对文本做判据，先问「我自己的解释性文字会不会满足它」。**
> 另一个可复用的点：**注入验证的价值不只是「证明判据能红」，更是「证明它红的理由是对的」** ——
> 本轮第一次注入时判据**没红**，我一度以为「注入没生效」，实际是**判据本身有洞**。

### 五、护栏分工（**形状 vs 解析**，避免同一个解析器写两份）

| 判据 | 位置 | 管什么 |
|---|---|---|
| 字段齐不齐、`kind` 与 `ref` 的**形态**是否匹配 | `verify-settings-contract.mjs` ⑭ | **形状**（矩阵自己的字段） |
| `ref` 是否**真的解析得到**（D 声明行 / 台账 id / Proposed ADR） | `verify-release-gate.mjs` | **解析**（那里已持有 D 表解析器、台账、ADR 三份数据） |

⇒ 上一轮写在 settings-contract 的 `pendingRef → ADR` 解析**已移到门禁**，避免把同一个 D 表解析器写第二份。
两处各带 canary，且**都带防空转断言**（`checkedRefs < 8` 即失败；矩阵里若已无 `undecided` 则要求把判据**收掉**）。

**注入验证（6 向，全部通过）**：`deliberate` 的 ref 指向不存在的 `D-`+两位占位字母 / `gap` 的 ref 指向不存在的台账 id /
`pendingRef` 指向不存在的 ADR / ADR 改成 `Accepted` / 删掉一条 `disposition` / `kind` 与 `ref` 形态不匹配。

### 六、施工中我自己的三个错（都当场被自己的判据/护栏抓到）

1. **`gap` 的形态正则写宽了**：首版 `^[A-Z0-9]+(-[A-Z0-9]+)+$` **把 `D-AK` 也匹配** ⇒ canary 当场报
   「gap 判定不能区分正/负样本」。改用台账 id 的真实形态 `^P0-[A-Z0-9]+-\d{3}$`（实测 50 个 id 全中，
   ⚠️ 注意 `P0-I18N-001` 中间**含数字**，故不能用 `[A-Z]+`）。
2. **在 D 表单元格里写了转义竖线 `\|`** ⇒ `split('|')` 照样切 ⇒ D-AA 行变成 **10 格** ⇒
   **D 表判据当场报出来**（正是它存在的理由：多余格在 GFM 渲染时会被静默丢弃）。改用无竖线的措辞。
3. **解释性文字写进了 `D-`+两位占位字母 这种占位编号** ⇒ 被 D 编号**引用扫描器**当成真引用（`D-[A-Z]{1,2}` 匹配）
   ⇒ 门禁报「`D-`+两位占位字母 被引用但没有声明行」。改为 `D-`+编号 的写法。



## 4.122 把围栏数学的**真实渲染**验掉（端到端探针）+ 一次「**对照组救回的错误结论**」（2026-10-07）

### 一、动因：还掉 §4.120 自己声明的那笔账

§4.120 实装围栏数学时，我在「遗留」里如实写下：
**「引擎级已渲染围栏数学，但与 CoreEditor 代码块包装器的视觉叠加未在真机验证」**。
本轮把它验掉 —— 用 `tests/e2e`（Playwright + 真实 dev server + 真实 CoreEditor 样式）。

**为什么这个风险是真的**：` ```math ` 围栏**同时**是两个东西的作用对象 ——
CoreEditor `codeBlockStyle` 给它 `BlockWrapper('cm-md-codeBlockWrapper')` + `Decoration.line('cm-md-monospace cm-md-codeBlock')`，
而引擎的数学块是 `Decoration.replace({ block: true })`。
CM6 文档说 BlockWrapper「affects any line or **block widget** that starts inside its range」⇒ **可以嵌套**，
但**「文档说可以」不等于「真的没问题」**。

### 二、两个前置（都不是「跑一下脚本」那么直接）

1. **dev server 服务的是预构建产物** ⇒ 我改的是 `packages/editor-engine/src`，而 `apps/desktop/public/editor/` 里
   还是 **2026-10-01 的 `engine-v1.5.18`**（含**旧的 5 语言集合**）。
   ⇒ **必须先重建 bundle**（`node apps/desktop/scripts/build-editor-bundle.mjs`），
   重建后核对：`engine-v1.5.33/math.js` 里有 `MATH_FENCE_LANGS = new Set(['math'])`、
   `contextMenu.js` 里旧宽集合已消失。
   **⚠️ 若跳过这一步，探针会「测到旧代码」并给出与事实相反的结论。**
2. Playwright 装在仓库外临时目录（`/tmp/pw`，沿用 README 的既有做法，不污染依赖）。

### 三、探针覆盖（`tests/e2e/fenced-math-verify.mjs`，12 项）

结构类：围栏被替换为块级 widget · widget 覆盖**整段（含围栏行）** · DOM 里不再有围栏文本 ·
**widget 有非零尺寸**（被包装器压成 0 高是这类叠加最典型的失败形态） ·
该围栏的「代码块行」已被替换掉（无 `.cm-md-codeBlock` 残留）·
**widget 不在 `.cm-md-monospace` 作用域内**。
行为类：光标进入块内 ⇒ 不再显示 widget 且源码回到 DOM。
对照组：`$$` 块（既有数学路径）· ` ```latex ` **不**被当作数学块且**仍按代码块渲染**。
健全性：渲染期间无 console 错误 / 未捕获异常。

### 四、⚠️ 首跑三处失败 —— 其中**两处是我的断言写错了**，一处靠**对照组**定性

**（a）「公式未被强制成等宽字体」误报** —— 我断言 `getComputedStyle(widget).fontFamily` 不含 `mono`，
实测读出来是 `ui-monospace, monospace, Menlo, system-ui, …`。
追到源头：CoreEditor 的 `setFontFace` 把 `.cm-content` 的字族写成
`<family>, ui-monospace, monospace, Menlo, …` ⇒ **任何**元素读出来都含 `mono`
⇒ 那个量**对「是否被代码块样式污染」没有判别力**（它量的是**正文字体回落链**）。
**换成有判别力的量**：`widget.closest('.cm-md-monospace') === null`（等宽规则的真正作用面）。
⇒ **不是「改断言求绿」**：原断言测的是**错的东西**，且已在文件里写明为什么错。

**（b）「widget 已渲染出内容」失败** —— widget 的 `innerHTML` 就是**原始 TeX**（`E = mc^2`）。
**加对照组后定性**：把文档换成**改动之前就存在**的 `$$` 块，它的 widget **同样**只显示原始 TeX
⇒ **本 harness 里数学渲染路径整体未接通**（引擎兜底成源码文本），**与围栏数学无关**。
⇒ 探针改为：**先探测对照组**，渲染接通才要求「与 `$$` 形态一致」；
未接通则只断言「两条路径表现一致」，并**在输出里明确说明**这不是围栏数学的缺陷。
（已把这条写进 `tests/e2e/README.md` 的「环境坑」第 8 条，供后续探针复用。）

**（c）「```latex 仍是代码块（围栏文本可见）」失败** —— 我假设 DOM 里能看到 ` ```latex `。
实测：CoreEditor 的 live-markdown 样式在**光标位于块外**时会**隐藏围栏标记**（数学块也一样）
⇒ 那个断言对**两种情况都会失败**。换成有判别力的量：**「文档里还有没有代码块行」** ——
数学块的行被 block replace 掉 ⇒ `.cm-md-codeBlock` 消失；代码块仍在 ⇒ 存在。

### 五、结论（**这是本轮真正的产出**）

- **叠加是良性的**：`insideCodeWrapper=true` 但 widget 尺寸正常（实测 `h≈22.4 / w≈844`），
  「代码块行」已被替换掉，widget **不在**等宽作用域内 ⇒ **§4.120 的那笔账可以还掉**；
- ` ```latex ` 的**行为变更**（本轮把菜单集合收敛到 `{math}`）已在真实浏览器里端到端确认；
- **非恒绿验证两向**：把 bundle 里的集合**置空** ⇒ **5 项失败**；
  **放宽回旧 5 语言** ⇒ ` ```latex ` 的两项失败 ✓（注入后均重建/还原并复跑通过）。

### 六、遗留（如实登记，**不得**读成「已全部验证」）

1. **Tauri 外壳（WebKit/系统字体/真实窗口）未验** —— 本轮验的是**浏览器层**（DOM/CSS 叠加，即风险所在处）；
2. **harness 里数学渲染未接通** ⇒ 「**真实公式**在代码块包装器里的排版形态」**仍未验**
   （验到的是「块被正确替换、尺寸正常、不在等宽作用域」，不是「公式画出来好不好看」）；
3. 探针**不进 CI**（e2e 通道）—— 其中的**不变量**已在引擎单测 + `verify-shell-widgets.mjs` 的单源判据里，
   本探针只承担「真实浏览器里也成立」这一层。

### 七、教训

1. **「文档说可以」不等于「验证过」** —— CM6 文档明确 BlockWrapper 可嵌套块级 widget，
   但那只是**允许**；「非零尺寸 / 无残留行 / 不在等宽作用域」才是**验证**。
2. **「新功能看起来没生效」的结论，必须先跑一条既有的等价路径做对照** ——
   对照组也坏 ⇒ 是 harness 的问题；对照组好 ⇒ 才是新功能的问题。
   本轮正是靠 `$$` 对照组，避免把**harness 的限制**写成**围栏数学的缺陷**。
3. **断言要挑「有判别力」的量**：`fontFamily` 这种「读出来必然长这样」的量，
   看着像在验字体，实际什么都没验。
4. **改的是源码、跑的是产物** ⇒ **先确认产物含你的改动**（本轮 bundle 落后 6 天、且含旧逻辑）。

### 八、连带发现：**e2e 的「启动器卫生」长期无人守**（同一类缺陷，视觉脚本修了、e2e 没修）

写本轮探针时我沿用了 `default-code-lang-verify.mjs` 的模板，而它用的是**裸 `spawn('npx')`** ——
这正是本仓**已经判定为缺陷**的模式：Windows 上 `npx` 实际是 `npx.cmd`，无 shell 时 spawn 抛 ENOENT
⇒ 脚本以「**超时**」静默失败（`P0-LAYOUT-002` 的视觉采集就是这么长期产出 0 文件的）。

**实测计数（剥注释后）**：

| 面 | 总数 | 用平台感知启动器 | 裸 `spawn('npx')` | 固定端口 |
|---|---|---|---|---|
| `tests/visual/**`（**有判据覆盖**） | 4 | **4** | **0** | — |
| `tests/e2e/**`（**无判据覆盖**） | **32** | **4**（3 旧 + 本轮 1 新） | **28** | **22** |

⇒ **同一类缺陷，被修的那一面有判据守着，没修的那一面 28/32 仍在。**
（固定端口那 22 个另有 `tests/e2e/README.md` 记录的「残留 vite 导致**假红**、且换任何等待时长都无效」。）

**处置（本轮）**：
1. **本轮的新探针改用** `tests/visual/dev-server.mjs` 的 `startViteDevServer()` + `describeSpawnFailure()`
   —— **不给仓库新增一处已知缺陷**；
2. **不批量改那 28 个**：它们大多需要特定条件才能跑（权限、真机、特定夹具），
   **盲改 = 改一堆跑不起来的探针**；
3. **新增判据 ⑫（棘轮）**（并入 `verify-build-pipeline.mjs`，护栏数仍 **23**）：
   用共享启动器的脚本数 **≥ 4**、裸 `spawn('npx')` 的脚本数 **≤ 28**（**存量欠债**上限），
   两个方向都带 canary（含「**注释里**提到该模式不算」——实测踩过：我的新脚本因注释里写了
   `spawn('npx')` 而被误计成裸用法）。**注入验证 2/2**（新增一个裸用法 ⇒ 红；删掉共享用法 ⇒ 红）。
   **降到 0 时应把本判据换成硬判据**（「不得出现裸 `spawn('npx')`」）—— 已写在判据注释里。

> **教训**：**「修了一处」不等于「修了这一类」**。视觉脚本那次修复有明确的现象（Windows 基线永远缺席）
> 与明确的范围（4 个脚本），修完就加了判据 —— 但**没有人问「同一模式在别处还有几处」**。
> 本轮是**写新脚本时踩到**才发现的 ⇒ 与 §4.120 的「半实现」同源：
> **发现同一类缺陷的入口，是「我正要写的东西在别处长什么样」，而不是逐个读代码。**



## 4.123 偏好矩阵的一处**错误判定**（`noLegacyMath`）+ 范围声明 + 反向语义的机器可读化（2026-10-07）

### 一、动因：把 ADR-0034 Q9 从「依赖一项未完成的取证」变成「可裁决」

§4.121 把 `noLegacyMath` 登记为 `behavior: differs` + `undecided → ADR-0034 Q9`，并在 Q9 里写下
「**本 Q 的第一步不是实现，而是定义范围**；本轮没有取证出 legacy 数学语法的确切集合」。
本轮把那项取证做掉 —— 结果**推翻了问题赖以成立的前提**。

### 二、取证（三条一手证据）

1. **键名与用户可见语义相反**：Typora 偏好面板（`page-dist/static/js/Preferences.*.js`）里该键的
   `label` 是 **`"LaTeX Math Delimiter \( \) \[ \]"`**，且带 **`reverse: !0`**
   （勾选态 = `!getValue(key)`）⇒ 它的语义是「**`\(` `\)` `\[` `\]` 是否作为数学定界符**」，
   **默认启用**。
2. **在渲染路径上恒为 no-op**：`main.js` 的三处守卫都是
   `File.option.enableInlineMath || !File.option.noLegacyMath`，而 **`enableInlineMath` 默认 `true`**
   ⇒ 该键在渲染路径上**无论取何值都不改变结果**。
3. **Mellow 本来就支持这四个定界符**：`parseMathSpans` 处理 `\(` `\)` `\[` `\]`；
   且 `tests/fixtures/math/typora-math-corpus.md` 里的 `\(\alpha + \beta\)` 与 `\[ E = mc^2 \]`
   **已被 `math.test.ts` 首条用例断言**（inline 断言 `tex === '\\alpha + \\beta'`，block 断言 `tex` 含 `E = mc^2`）。

⇒ **两边行为一致** ⇒ 矩阵条目由 `behavior: differs` **改判为 `matches-default`**，
`disposition`（`undecided → ADR-0034`）**一并移除** ⇒ **Q9 作废**（ADR 里保留编号并写明结论，以免破坏引用）。
⇒ 行为轴 `differs` 由 **8 → 7**、其中 `undecided` 由 **5 → 4**；ADR-0034 由 **10 问 → 9 问**。

> **为什么旧判定错了**：它是**照着键名**读出来的（`noLegacyMath` 读起来像「不做 legacy 数学解析」），
> 而该键的**用户可见语义恰恰相反**。
> **最刺眼的证据是：同文件里 `legacyInlineMathParse` 的注记早就写着**
> 「Mellow parseMathSpans 仅实现现代 `$`/`\(`/`\[` 分隔符」—— **两个相邻条目互相矛盾**，
> 而**没有任何判据发现它**。

### 三、按「同一类还有几处」的纪律做的普查：面板的**反向语义键**共 8 个

| 面板 `reverse:!0` 的键 | 面板 label | 矩阵状态 |
|---|---|---|
| `no_pairing_match` | Auto pair brackets and quotes | 在矩阵内（`noPairingMatch`，**已有** `polarity`） |
| `noEmojiAutoComplete` | Enable autocomplete for Emojis | 在矩阵内，**漏标** `polarity` ⇒ 已补 |
| `no_mid_caret` | Always keep caret in middle of screen… | **不在**矩阵范围（面板独有） |
| `noAutoLink` | Auto Links | 在矩阵内，**漏标** ⇒ 已补 |
| `no_line_wrapping` | Auto wrap long lines | 在矩阵内（`noLineWrapping`，**已有** `polarity`） |
| `noLegacyMath` | **LaTeX Math Delimiter `\( \) \[ \]`** | 在矩阵内，**漏标** ⇒ 已补（并改判） |
| `hideBrAndLineBreak` | Visible `<br/>` | 在矩阵内，**漏标** ⇒ 已补 |
| `noRecentFiles` | Record recent files and folders | **不在**矩阵范围（面板独有） |

**处置**：4 个漏标条目补 `polarity: 'inverted'`（它的语义正是「**UI 默认 = 存储值取反**」，
也是默认值比对里 `!e.default` 那一支的依据）；并在
`tests/parity/tools/audit-typora-preferences.mjs` 新增判据：
**凡面板标 `reverse: !0` 的键，矩阵条目必须带 `polarity: 'inverted'`**，
外加一条**防空转**断言（若一个都没匹配到 ⇒ 报「判据可能已失效，请修判据而不是放任它恒真」）。

### 四、⚠️ 我差点报的一条**假发现**：面板与矩阵「差 47 个键」

普查时我先比较了「面板的 `keyName` 集合」与「矩阵的键集合」，得到
**面板 91 个 / 矩阵 84 个 / 面板独有 64 个 / 矩阵独有 57 个** ⇒ 看起来像「矩阵漏了 64 个真实偏好」。
**归一化命名（camelCase ↔ snake_case）后**交集升到 44，但仍有 **47 个面板键不在矩阵里** ⇒ 假发现**仍像成立**。

**定性靠的是跑既有工具**：`audit-typora-preferences.mjs` 报
「Typora `DEFAULT_OPTIONS`：84 项 / 矩阵：84 项」⇒ **矩阵相对其声明来源是完备的**。
⇒ 真相是：**矩阵的范围是 `DEFAULT_OPTIONS`（84），面板是另一个面（91）**，
两者**键集合本来就不同**（面板含 `theme` / `userLanguage` / `zoomLevel` / `actionWhenDropFolder` /
`pandocPath` 等**不在 `DEFAULT_OPTIONS` 里**的键）。
⇒ 这**不是「漏登记」**，而是**范围边界**；**该修的是「范围声明」**，不是矩阵。

**处置**：矩阵顶层 `note` 增补**范围声明**（84 = `DEFAULT_OPTIONS`，**不是**「Typora 的全部偏好」；
面板去重后 91 个 keyName、其中约 47 个不在范围内 ⇒ **那一面本矩阵不覆盖**，默认值需另找来源）；
工具新增打印「面板有、本矩阵无」的那部分；工具头部补 `panelJsPath()` 的说明。

### 五、教训

1. **判定必须落在「用户能看到什么」上，而不是「这个名字听起来像什么」** ——
   `noLegacyMath` 的错误就是照键名读语义；而**同一个键在面板里就写着它的真实含义**。
2. **「两个相邻条目互相矛盾」是可以在无判据的情况下长期存活的** ——
   本轮发现的矛盾（`noLegacyMath` vs `legacyInlineMathParse`）**在同一份 JSON 里**，
   且**两处都自称有一手证据**。⇒ **「引用了证据」不等于「证据支持这个结论」。**
3. **比较两个集合前先归一化形态**（camelCase / snake_case），
   **比较之后要问「它们是不是本来就该不同」**（来源不同 ⇒ 范围不同）。
4. **既有工具是「定性」的最短路径**：我在抽取 `DEFAULT_OPTIONS` 时自己写坏了脚本（0 键），
   而仓库里**早就有**一个做完备性比对的工具 —— **先跑既有工具，再考虑自己写**。



## 4.124 「拖入文件 / 文件夹」整组偏好未实现 —— 而一处**手动验证项在声称它已通过**（2026-10-07）

### 一、动因：从 §4.117 登记的 P2「插入文件夹链接」出发

§4.117 把它登记为 **P2（边缘功能）**。本轮去核它的**作用域**（该选项属于哪个偏好、默认值是什么），
结果发现它**不是一个孤立的 P2 选项**，而是**一整组偏好的默认行为缺口**。

### 二、取证：Typora 有一整组「拖入时的行为」偏好，**默认是「打开」**

面板（`page-dist/static/js/Preferences.*.js`）里的原文：

```
title:"When drop file / folder into Typora"
  ["When drop folder",            { keyName:"actionWhenDropFolder", options:{"":"Open in Typora", link:"Insert Folder Link"} }]
  ["When drop markdown file",     { keyName:"actionWhenDropFile",   options:{"":"Open in Typora", link:"Insert File Link"}   }]
  ["When drop files that can be imported", { keyName:"actionWhenDropImport", options:{"":"Import File", link:"Insert File Link"} }]
```

⇒ **默认值都是第一项**（`""` = **Open in Typora** / Import File）⇒
Typora 拖入 `.md` 或文件夹会**打开**它；「插入链接」是**非默认**选项。

### 三、Mellow 的现状：**拖入 `.md` / 文件夹什么都不发生**

实测（读码 + 全仓检索，非推断）：
- 唯一的拖放处理在 `apps/desktop/src/App.tsx` 的 Tauri `onDragDropEvent` 回调里；
- 它**只**把路径写进 iframe 的 `window.__MELLOW_DROP_PATHS__`；
- 而全仓该变量的**唯一消费方**是 `packages/editor-engine/src/image/host.ts` 的
  `consumeDroppedFilePaths()` —— **图片管线**；
- **Rust 侧没有任何 drag-drop 处理**（`src-tauri/src/*.rs` 里搜不到 `DragDrop` / `on_drag`）。

⇒ **缺的是「默认行为」，不是那个非默认选项** ⇒ §4.117 的 **P2 定级低估了它**
（用户拖一个 `.md` 进来，期望是打开 —— 这是**默认路径**，不是边缘功能）。

### 四、连带（更该记的一条）：一处**手动验证项在声称一个未实现的行为**

`docs/qualification/phase1-runtime-qualification-manual.md` 的 2.4 拖放矩阵：

```
| D1 | 拖入单个 .md | 打开文档 |
```

而 `tests/e2e/drag-drop-verify.mjs` 的文件头还写着「由**真机手动项 D1**（拖入单个 .md → 打开文档）覆盖」——
即这条链路是：**e2e 注释把覆盖责任推给手动项 → 手动项把「打开文档」写成通过标准 → 而代码里没有这个行为**。

⇒ **一处「verification item」在 over-claim**：若真有人按它执行，**必然失败**；
而它被引用为「覆盖依据」⇒ **等于这条行为谁都没守**。

**处置**：手动清单 D1 那一行**就地标注「当前不可能通过」**（并写明依据）；
`drag-drop-verify.mjs` 文件头那句**同步更正**（保留原文以便追溯，加 2026-10-07 更正块）。

### 五、连带：这正是上一轮「范围声明」的**真实代价**

这 3 个键（`actionWhenDropFolder` / `actionWhenDropFile` / `actionWhenDropImport`）
**都是面板独有键**（不在 `DEFAULT_OPTIONS` 里）⇒ **§4.123 声明的「矩阵不覆盖那一面」不是文档洁癖，
它直接掩盖了真实缺口**：矩阵（以及它背后的完备性工具）**结构上就看不到这 3 个键**。

⇒ 上一轮把范围**写进声明**是对的，本轮补上它的**第一个实例**：
面板独有面里确实有**默认行为的缺口**。⇒ **「面板面未覆盖」应从「范围声明」升级为「待办的审计面」。**

### 六、本轮处置（**未做实现**，理由见第七节）

1. **登记**：master-plan §15.3 行 14b 的「仍未实现：插入文件夹链接（P2）」**扩写**为
   「整组偏好的默认行为缺口」+ 默认值证据 + 实现前置；
2. **改正三处过度声称**：手动清单 D1（不可能通过）、`drag-drop-verify.mjs` 文件头（把覆盖责任推给 D1）；
3. **顺手**：`drag-drop-verify.mjs` 的启动器由裸 `spawn('npx')` 换成共享的跨平台启动器
   （**实跑 7 项全绿**验证替换无误），并把 §4.122 的**棘轮收紧**（裸用法上限 28 → **27**、共享下限 4 → **5**）；
4. **未**新增设置项（若只加设置不接行为 = **空开关**，本仓明令禁止）。

### 七、为什么本轮**不**实现（前置与风险，如实登记）

1. **需要「判断路径是否为目录」的能力**：Rust 侧**没有 `stat` / `is_dir`**（只有 `read_dir(path)` 与
   `path_exists(path)`）⇒ 要么新增一个 Rust 命令（要动 `verify-tauri-command-contract.mjs` 与 capability ACL），
   要么用「试着 `read_dir`」当探针（会把**权限错误**与「不是目录」混为一谈）；
2. **「打开」会经过未保存文档守卫**（`guardSingleDocument`）—— 这是**数据丢失相邻**的路径，
   改动风险显著高于本轮其它项；
3. **核心链路（Tauri drop 事件）在本环境不可验证**：浏览器 dev 无 `__TAURI_INTERNALS__`，
   探针无法触发该事件 ⇒ 只能验「决策逻辑」（若提取成纯函数），**验不了接线**。
   ⇒ 与 §4.122 的教训一致：**不要在没有验证手段时改一条数据丢失相邻的路径**。

⇒ 结论：**登记 + 改正记录**是本轮的正确范围；实现应作为独立工作项，且**先补验证手段**
（例如给决策逻辑提取纯函数 + 给 drop 事件留一个可被 e2e 调用的入口）。

### 八、教训

1. **「某个选项是 P2」不代表「它所属的那组行为也是 P2」** —— 定级要看**默认值**：
   默认行为是「打开」时，缺它就不是边缘功能，而是**主路径缺失**。
2. **「verification item」也会 over-claim**，而且比代码注释更危险 ——
   它会被别的文档**当作覆盖依据**引用（本轮的 e2e 注释就是这么做的）。
   ⇒ **凡「覆盖依据」指向人工项，就要问：那条人工项**当前**能通过吗？**
3. **「范围声明」的价值取决于它后面有没有行动** —— §4.123 把「面板面未覆盖」写进声明，
   本轮立刻在那一面找到第一个**真实缺口**。⇒ 声明要**升级成待办**，否则它只是免责条款。



## 4.125 CI 缺 `concurrency` —— 一次 push 产生两个 run，且**被取代的提交会跑完整个 CI**（2026-10-07）

### 一、观察

推送 `09b9919` 后，同一个 SHA 上出现**两个** CI run（`37609597960` / `37609600391`），
**两者都是 `push` 事件**、都最终 `success`。而此前三次推送（`8061d36` / `7098646` / `b8fee4f`）
各自只有 **1** 个 run ⇒ 这一次是**异常**。

### 二、定性：重复投递本身不是仓库缺陷，但它暴露了一个**独立的事实**

两个 run 都是 `push` 事件 ⇒ 是 **GitHub 侧的重复投递**（webhook 重投），**不是**本仓的触发器写错
（`ci.yml` 的 `on:` 只有 `push: branches:[main]` + `pull_request:`，而这里没有 PR）。
⇒ 这一点**不作为缺陷登记**（无法归因到本仓）。

**但它顺带量出了一个真实缺陷**：`ci.yml` **没有 `concurrency`** ⇒
- **被取代的提交**（连续推送时）**仍会跑完整个 CI**（8 个 job）—— 白烧 runner 分钟数；
- 出现重复/并发运行时，两者**各跑一遍**，并制造「同一 SHA 两个 run、其中一个是旧的」这种混淆
  （排查 CI 时很容易读到旧的那一个 —— 本仓 §4.110 已有同类前科：并发操作同一 release）。

### 三、与 `release.yml` 的**方向相反**（这是本条最需要写清的地方）

`release.yml` 在 §4.110 加了 `concurrency` 且 **`cancel-in-progress: false`** ——
理由是 **release 是「对外」的**，取消会留下半成品。
而 **CI 恰好相反**：**被取代的提交的 CI 结论没有任何价值** ⇒ `cancel-in-progress: true`。

⇒ **两条判据共用同一解析形状，但期望值相反**；判据的 canary 专门锁这一点
（`true` 与 `false` 都必须能被识别，否则「互相抄期望值」不会被发现）。

### 四、处置

1. `ci.yml` 新增（**放在 `on:` 与 `jobs:` 之间**，与 `release.yml` 的位置一致）：
   `group: ci-${{ github.ref }}` + `cancel-in-progress: true`，并把「为什么与 release 相反」
   与「实测触发（一次 push 两个 run）」写进注释；
   ⚠️ **PR 的 `github.ref` 是 `refs/pull/N/merge`**，与 `refs/heads/main` **不同组** ⇒ 互不干扰；
2. **新增判据 ⑬**（并入 `verify-build-pipeline.mjs`，护栏数仍 **23**）：`ci.yml` 必须有 `concurrency`、
   `group` 必须是 `ci-${{ github.ref }}`、`cancel-in-progress` 必须是 `true`；
   **注入验证 2/2**（去掉 concurrency ⇒ 红；改成 `false` ⇒ 红），canary 三向（含方向区分）。

### 五、⚠️ 如实声明：**CI 行为本机验不了**

改的是**流水线配置**，本机只能验到：**YAML 可解析**（`js-yaml` 实解：顶层键
`name / on / concurrency / jobs`，`concurrency` 解析为预期对象，**8 个 job 一个不少**）+ **判据锁住结构**。
**真正的行为验证发生在下一次 push**（届时若出现「被取代的运行被取消」，即为生效）。

> **为什么仍然做**：① 风险面极小（`concurrency` 是顶层键，语法已实解验证；不影响任何 job 的步骤）；
> ② 收益明确（省 runner 分钟数 + 消除「同一 SHA 两个 run」的读错风险）；
> ③ 与 §4.110 对 `release.yml` 的处置构成**同一组判据的两个方向**，本仓已有先例可循。
> 但仍**如实标注**：本轮的验证强度低于前几轮（那几轮都有实跑或注入验证）。

### 六、教训

1. **「异常现象」与「缺陷」要分开归因**：重复投递**不是**本仓的问题，
   但「量出它的那一刻」顺带量出了一个**独立存在**的缺陷（缺 `concurrency`）。
   ⇒ 遇到异常时，除了问「谁造成的」，还要问「**它暴露了什么本来就存在的东西**」。
2. **同一个机制在不同流水线上可能有相反的期望值** —— 写判据时**不要复制期望值**，
   要**复制形状、重新论证期望值**（本轮 canary 专门锁这条）。
3. **改流水线必须如实声明验证强度**：本机只能验 YAML + 结构，**不能**声称「已生效」。



## 4.126 给「面板独有面」建立登记处（47 键）+ 逐项分诊（2026-10-07）

### 一、动因：把 §4.123 的范围声明**变成有主**

§4.123 把「矩阵只覆盖 `DEFAULT_OPTIONS`，不覆盖面板 UI」写进了声明；
§4.124 在那一面**取样一次**就找到了一个**默认行为缺口**（拖入文件/文件夹整组未实现）。
⇒ 本轮把那一面**建立登记处并逐项分诊**，否则那份声明只是免责条款。

### 二、方法（三条，都写清各自的**可靠性**）

1. **键集合**：从 `page-dist/static/js/Preferences.*.js` 抽 `keyName:"…"` 去重 ⇒ 91 个；
   减去矩阵已覆盖的（**归一化命名后**）⇒ **47 个面板独有键**。**这一步可靠**（`keyName` 形态无歧义）。
2. **默认值**：面板独有键**不在** `DEFAULT_OPTIONS` 里 ⇒ 没有现成的默认值表。
   本轮改用 **PITFALLS §4.142 的方法**：**从代码的比较里读** —— 例如拖入组的判据是
   `'link' === File.option.actionWhenDropFolder ? … : …` ⇒ **缺省即走 else 分支** ⇒ 默认是「打开」。
3. **Mellow 侧对照**：以 `packages/settings/src/index.ts` 的 **74 个设置项 id** 为对照面，
   逐项判「Mellow 有没有等价能力」。
   ⚠️ **如实声明一处不可靠**：面板**标签**的抽取**不可靠** —— 面板是压缩后的 React 产物，
   控件有两种形态（`label:"X",keyName:"Y"` 与 `["X", createElement(…{keyName:"Y"})]`），
   向后找最近标签会取到**邻居控件**的标签（实测 `zoomLevel` 取到 "Reset to Default"、
   `SmartyPantsOnRendering` 取到 "Diagram Options"）⇒ **键可靠、标签仅供参考**；
   故登记表的 `note` 以**代码证据**为准，不依赖标签。

### 三、分诊结果（47 项）

| status | 数量 | 含义 |
|---|---|---|
| `equivalent` | **25** | Mellow 有等价能力（**通常命名不同**），note 给出可核对的落点（设置 id 或代码符号） |
| **`gap`** | **3** | **真实缺口** —— 即拖入组（`actionWhenDropFile` / `actionWhenDropFolder` / `actionWhenDropImport`） |
| `not-applicable` | **5** | Typora 特有或 Mellow 有意不做（`runCommand` / `runCommandStr` / `showOutput` = **D-AM**；`useMirrorInCN`；`send_usage_info` = Mellow 无遥测） |
| **`unverified`** | **14** | **尚未核实（存量欠债）** —— 本机资源不足以判定 |

**14 项 `unverified`（下一轮的入口清单）**：`SmartyPantsOnRendering` · `allowPhysicsConflict` ·
`customExportPath` · `exportFolder` · `framelessWindow` · `line_ending_crlf` ·
`no_image_move_for_local` · `openExportFile` · `openExportLocation` · `pandocPath` ·
`quitAfterWindowClose` · `remapPunctuation` · `twoHyphensToEm` · `use_seamless_window`。

### 四、关键取证：拖入组的**决策表**（`main.js` 与 `frame.js` 两份一致）

```
if (isDirectory(path)) {
  if (supportTextBundle && /\.textbundle$/i) return actionWhenDropFile === 'link' ? insertLink : open;
  if (actionWhenDropFolder === 'link') return insertLink(path);
  return openFolder / switchFolder;                       // ← 默认
} else {
  const ext = …;
  if (IMPORTABLE.includes(ext)) return actionWhenDropImport === 'link' ? insertLink : importFile;
  if (File.SupportedFiles.includes(ext)) return (isKeyWindow || actionWhenDropFile === 'link') ? insertLink : open;
  if (!isKeyWindow()) return false;
  insert as markdown (image/link)                          // ← 不支持的文件
}
// insertLink(p) = 在文档里插入该路径的链接（source mode 下不插）
```

⇒ 缺的不止「插入文件夹链接」一个选项，而是**四类落点的默认行为**（打开文件夹 / 打开文档 / 导入 / 插成 markdown），
且该偏好**确实被消费**（在 `main.js` + `frame.js` 都有命中，非仅面板）。

### 五、处置

1. **新增登记处** `tests/parity/fixtures/typora-panel-only-keys.json`（47 条，含
   `key` / `consumer`（js / native）/ `status` / `mellow`（可核对落点）/ `note`）；
2. **本机工具**（`audit-typora-preferences.mjs`）新增判据：登记表 key 集合必须与
   「面板 keyName − 矩阵键」**双向**一致；状态合法；`mellow` 引用的设置 id **必须真实存在**；
   note 非空；并**打印** status 分布与 `unverified` 清单（**存量欠债必须可见**）。
   **注入验证 2/2**（删一条 ⇒ 「未登记」；加一条面板没有的 ⇒ 「登记表有但面板已无」）；
3. **CI 护栏**（`verify-settings-contract.mjs` ⑭）新增**自洽性**判据（覆盖面板集合需要本机 Typora，
   故留本机工具）：状态合法 / 引用的设置 id 存在 / note 非空 / 条目下限 40 /
   **`equivalent` 必须给出至少一处可核对落点**（设置 id 或 note 里的反引号符号）。
   ⇒ **该判据当场抓到 2 条**（`auto_expand_block` / `zoomLevel` 只有「同上」式说明）⇒ 已补真实落点。
   **注入验证 2/2**（引用不存在的设置 id ⇒ 红；条数低于下限 ⇒ 红），canary 四向。

### 六、教训

1. **「范围声明」之后必须**立刻**给那一面建登记处** —— 本轮把 47 个键落成 47 条，
   其中 **3 条是真缺口、14 条是明确的待核实**；不建表的话，那 17 条会继续「不存在于任何地方」。
2. **没有默认值表时，默认值要从代码的比较里读**（`=== 'link'` ⇒ 缺省即 else）——
   这正是 PITFALLS §4.142 那条教训的可复用形态。
3. **同一份产物里，不同字段的抽取可靠性可以差很多** —— 键可靠、标签不可靠。
   ⇒ **登记表的结论必须挂在可靠的证据上**（本轮挂在代码比较与设置清单上，不挂在标签上），
   并把「哪一步不可靠」**写进声明**。
4. **`unverified` 要允许存在，但必须可见**（打印计数 + 清单）——
   否则它会退化成「看起来都核过了」。



## 4.127 从 §4.126 的欠债清单里取 `pandocPath`：**本机复现了「GUI 应用找不到 pandoc」** + 两条跨层护栏（2026-10-07）

### 一、动因

§4.126 留下 **14 项 `unverified`**（明确写成「下一轮的入口清单」）。本轮从**清单里的第一项**开始：
`pandocPath` —— 该条当时的 note 是「需核：Mellow 的 Pandoc 路径是设置项、环境变量还是 PATH 查找
（设置清单里未见 pandoc 项）」。

### 二、一手证据（全部本机实测）

| 项 | 实测结果 |
|---|---|
| `which pandoc` | `/opt/homebrew/bin/pandoc`（→ `../Cellar/pandoc/3.11/bin/pandoc`） |
| `/usr/bin/pandoc` | **不存在** |
| `launchctl getenv PATH` | **空**（launchd 层**没有** PATH 覆盖 ⇒ 子进程拿系统默认） |
| `/etc/paths` | `/usr/local/bin` · `/System/Cryptexes/App/usr/bin` · `/usr/bin` · `/bin` · `/usr/sbin` · `/sbin` —— **不含** `/opt/homebrew/bin` |
| `/etc/paths.d/homebrew` | 内容是 `/opt/homebrew/bin` —— 但**只有 `path_helper`（登录 shell）读它** |
| Mellow 旧实现 | `Command::new("pandoc")` ⇒ **只查 PATH** |

**上游（Typora）侧的一手证据**：
- `appsrc/main.js`：`d = () => File.option.pandocPath || "pandoc"` ⇒ 默认**就是 PATH 查找**；
  找不到时弹「Pandoc Path」对话框（`placeholder='(auto detect)'`、选择按钮走
  `selectFile(…, [{name:"Executable", extensions:[isWin?"exe":""]}])`、另有 `#ty-pandoc-path-reset`）；
- `Preferences.*.js`：`title:"Pandoc Path"` · `keyName:"pandocPath"` ·
  `placeholder:"(Auto Detect)"` · **`defaultPath: window.isWin ? "C:\Program Files\Pandoc\pandoc.exe" : ""`** ·
  `hintLink:"https://support.typora.io/Install-and-Use-Pandoc/"`；
- `zh-Hans.lproj/Panel.strings`：`"Pandoc Path" => "Pandoc 路径"` · `"(Auto Detect)" => "(自动检测)"` ·
  `"Executable" => "可执行文件"`；
- ⚠️ `main.js` 里**没有** `/usr/local/bin/pandoc` 或 `/opt/homebrew` 字面量
  ⇒ **上游不做常见位置兜底**，只靠 PATH + 用户手填。

⇒ 两条结论：① **Typora 有 `pandocPath` 这个偏好本身，就是「PATH 查找不够用」的旁证**；
② 但上游的补救只有「弹框让用户填」，**Mellow 可以做得更完整**（自动兜底 + 持久化偏好）。

### 三、缺陷复现（**决定性，且完全本机**）

把 `PATH` 限制成 `/usr/bin:/bin`（= macOS **GUI 应用**（Finder/Dock 经 launchd 启动）的 PATH）：

```
$ env PATH=/usr/bin:/bin sh -c 'command -v pandoc || echo NOT_VISIBLE'
NOT_VISIBLE                     ← 旧实现 Command::new("pandoc") 即在此失败
```

对**已编译的测试二进制**在同样受限的 PATH 下运行：

```
$ env PATH=/usr/bin:/bin <lib test bin> pandoc_availability_detection
# 旧断言（assert_eq!(pandoc_available(None), probe)）：
thread panicked: assertion `left == right` failed
  left: true        ← 新实现（常见位置兜底）找到了
 right: false       ← 裸 PATH 探针找不到
```

⇒ **一个 `env PATH=…` 就复现了「装了 pandoc 却被告知需要安装」**。
⚠️ **该缺陷在 dev 里测不出来**：`npm run desktop:dev` 从终端启动 ⇒ 继承 shell 的 PATH
（含 `/opt/homebrew/bin`）⇒ 一切正常；**只有打包后从访达/Dock 启动才会暴露**。

### 四、处置

1. **Rust 侧三级解析**（`apps/desktop/src-tauri/src/pandoc.rs`）：
   `pandoc_candidates(explicit)` = **显式路径 → 裸名 `pandoc`（PATH，= Typora 默认）→ 常见安装位置**；
   `resolve_from(candidates, usable)` 抽成**接受谓词的纯函数**（单测不依赖本机装没装 pandoc）；
   `resolve_pandoc()` 用 `is_file()` 作谓词；**全部候选都不可用时回落裸名** ——
   让 spawn 报出**真实的 PATH 错误**，而不是把错误提前吞成一句「未安装」（那会误导用户去重装）。
   常见位置含 macOS（`/opt/homebrew/bin`、`/usr/local/bin`、`/opt/local/bin`）、
   Linux（`/usr/bin`、`/snap/bin`）、`~/.local/bin`，以及 **Windows 的
   `C:\Program Files\Pandoc\pandoc.exe`（**取自 Typora 的 `defaultPath`**，不是猜的）+ `(x86)` + `%LOCALAPPDATA%`**。
2. **偏好**：新增设置项 `export.pandocPath`（`type:'text'`、默认 `''`、无 `applyCommand`、导出/导入时读取）。
   **空串 = 自动检测** —— 与 Typora 的 `(Auto Detect)` 语义一致 ⇒ **默认行为不变**。
   文案取 Typora 官方译法：`settings.export.pandocPath` = **「Pandoc 路径」**（原稿「Pandoc 可执行文件路径」已改）。
3. **6 处调用全部传参**：`pandoc_available` ×3、`pandoc_export` ×2、`pandoc_import` ×1
   （`App.tsx` 新增 `pandocPathSetting()` 单点读取）。
4. **登记表更新**：`tests/parity/fixtures/typora-panel-only-keys.json` 的 `pandocPath`
   由 `unverified` → **`equivalent`**（`mellow: ["export.pandocPath"]`，note 记下上游三条一手证据）。
   ⇒ 分布从 `equivalent 25 / unverified 14` 变为 **`equivalent 26 / unverified 13`**；
   **`unverified` 从 14 降到 13** —— 这正是 §4.126 把欠债清单写成「入口」的用处。

### 五、两条新护栏（都带注入验证）

**护栏 A（`verify-tauri-command-contract.mjs` §⑤b）：「承载用户设置的 `Option<T>` 形参必须在每一处调用都传」。**
- 【为什么必须单立】§⑤ 只保证 ① 传了的键名与 `toArgKey(形参)` 一致、② **必填**形参被传了。
  而 **`Option<T>` 不传是合法的** —— Tauri 只在「非 optional」才报错
  （`tauri/src/ipc/command.rs:110-112`）⇒ 漏传一处**静默取 `None`**，没有任何信号。
  当这个 `Option` 承载**用户设置**时，「不传」≠「用默认值」，而是 **「忽略用户刚设的值」**。
- 判据：登记表 `OPTION_ARG_REQUIRED_AT_CALLSITE`（3 条，各带理由）中的每一项，
  其命令的**每一处**带实参调用都必须含该键；另用一条**窄**正则捕捉「**整个实参对象被去掉**」的形态
  （那种调用不在 `argCalls` 里 ⇒ ⑤/⑤b 都看不见）。canary 三向 + 化石条目检查。
- **注入验证 3/3**：① `pandoc_import` 漏传 ⇒ 红（`未传 pandocPath`）；
  ② `pandoc_available` 改成无实参 ⇒ 红（`以无实参形式调用`）；
  ③ 登记表加一条化石 `pandoc_export.ghost_path` ⇒ 红（既报「登记已过期」又被 canary 抓）。
- 【如实声明的扫描面】本判据与 ⑤ 一致，只扫 `apps/desktop/src` + `apps/desktop/scripts`。
  **实测：`packages/` 下真实 invoke 0 处**（只有 2 处文档注释里的示例文本，已被 `inComment()` 排除）
  ⇒ 现状无缺口；**若将来把 invoke 下移到包内，⑤ 与 ⑤b 必须同时扩**（否则两处一起变空）。

**护栏 B（`verify-settings-contract.mjs`）：「消费端引用的设置 id 必须存在」。**
- 【为什么必须单立】本护栏此前锁了 schema↔`applyCommand`（action 型）与 schema↔i18n，
  但**没锁 schema ↔ 消费端**。而 `settingById('<id>')` 对不存在的 id **返回 `undefined`**，
  消费端常见写法 `const def = settingById('x'); if (def === undefined) return '';`
  ⇒ **该设置静默失效**（界面照常渲染、值照常持久化、**没有任何报错**）。
  这与 i18n 的 `t('a.b')` 缺键是**同一类**陷阱（`t()` 返回键名本身、界面显示裸键、不报错）。
- 口径：`declaredIds` 取**同一行同时含 `type:`** 的 `id:`（69 个），**刻意排除** section id
  （`id: 'export'` 等 10 个）—— 否则 `settingById('export')` 这种**真 bug**（运行时返回 `undefined`）
  会被误判为合法；canary 直接锁住这个边界（断言 `export`/`editor`/`files` **不在** `declaredIds` 里）。
  代价如实声明：设置项若改成**多行**声明，本判据会把它当未声明（**偏严**，会响不会静默放行），
  且 `declaredIds.size ≥ 60` 的下限断言会把「大规模重排」当场拦住。
- **实测：24 个被引用的不同 id 全部存在** ⇒ 本判据是**加固**，不是修复现行缺陷
  （正因为现行干净，它落地即绿、可长期拦回归）。
- **注入验证 1/1**：把 `settingById('export.pandocPath')` 改成 `'export.pandocpathX'` ⇒ 红并指名到文件。
  诊断信息里行号标 `≈` 并注明原因：**行号是剥掉整行注释之后的位置**（`read()` 会删行）——
  实测真实第 1296 行被报成 1210，不标就会被当成精确坐标去找。

### 六、教训

1. **环境类缺陷的判据是「启动路径」，不是「代码逻辑」** —— 同一份代码，从终端启动正常、
   从访达启动失败。⇒ 凡「调用外部可执行文件 / 读环境变量 / 依赖 PATH」的接线，
   都必须问一句「**打包后由 launchd 启动时，这条路径还在吗？**」。
   **判据：把 PATH 限制成 `/usr/bin:/bin` 再跑一遍**（本轮就是这样复现的，一行命令）。
2. **「与独立探针一致」这类断言，在能力被有意放宽后会变成「把修复判成缺陷」** ——
   本轮实测：`assert_eq!(pandoc_available(None), probe)` 在受限 PATH 下 **FAILED**
   （`left:true right:false`），而那个 `true` 正是修复的目的。
   ⇒ **正确的关系是「包含」而不是「相等」**：改为断言「PATH 能找到 ⇒ 我们必须也能找到」
   +「常见位置有 ⇒ 我们必须报可用」+「都没有 ⇒ 不许报可用」。
   **放宽能力时必须回头检查有没有 `==` 型断言会因此变红**（否则会出现
   「修好了功能、测试却红了 ⇒ 把测试删掉」的坏路径）。
3. **「可选」≠「可以不传」** —— `Option<T>` 的默认值语义是「`None`」，不是「用户的设置」。
   承载用户设置的可选形参必须**在每一处调用都传**；这条以前没有任何机器在守。
4. **上游有同名偏好，不等于上游解决了同一问题** —— Typora 的补救是「失败时弹框让用户填」，
   不做自动兜底（`main.js` 里没有 Homebrew/MacPorts 字面量）。
   ⇒ 对标时要把「**它有这个开关**」与「**它怎么解决**」分开记，前者是 parity 目标，
   后者是**可选的设计参考**；Mellow 这轮取「自动兜底 + 持久化偏好」两者兼有。
5. **欠债清单要真的被消费** —— §4.126 的 14 项 `unverified` 写成「下一轮的入口」，
   本轮就从第一项开工，并把状态改到 `equivalent`（14 → 13）。
   ⇒ **清单的计数变化本身就是进度证据**；只在散文里写「已核实」不算。



## 4.128 「面板键 ≠ 内部选项名」—— 登记表 `consumer` 口径错（4/47 自相矛盾）+ 第二份默认值表交叉验证（2026-10-07）

### 一、动因

§4.127 把 `pandocPath` 结清时，需要判断它「在 Typora 里被谁消费」。按登记表声明的口径
（`consumer: js` = 「在 `main.js` / `frame.js` 里被消费」）去搜 `main.js` —— **0 处命中**，
而登记表写的是 `js`。追下去发现**口径与实现不是一回事**。

### 二、三个发现

**① `frame.js` 是偏好面板脚本 ⇒ 「出现在哪个文件」这个判据对全体恒真。**
登记表的 `consumer` 声明是「在 `main.js` / `frame.js` 里被消费」，但实现退化成
「**字符串出现在哪个文件**」—— 而 **47 个面板键全部都在 `frame.js` 里出现**（面板自己的
`getValue("K")` / `onChange` 代码）⇒ 该判据**不携带信息**。实测因此有 **4 条自相矛盾**：

| 键 | 登记 | 实测（`main.js` 里 `File.option.<键>`） | 真因 |
|---|---|---|---|
| `SmartyPantsOnRendering` | `js` | **0 处** | **改名**：`File.option.convertSmartOnRender`（main.js 13 处） |
| `remapPunctuation` | `js` | **0 处** | **改名**：`File.option.remapUnicodePunctuation`（main.js 1 处） |
| `showStatusBar` | `js` | **0 处** | 读点是 **`_options.showStatusBar`**（frame.js，面板窗口切 body class） |
| `zoomLevel` | `js` | **0 处** | 读点在 **Electron `webFrame`**（`setZoomLevel`/`getZoomLevel`），不在 Typora 树内 |

**② `consumer` 无法用机械搜索可靠判定（三种判据实测都不成立）。**
- **改名**：`remapPunctuation` → `File.option.remapUnicodePunctuation`；`SmartyPantsOnRendering` → `File.option.convertSmartOnRender`
  （原文：`File.option.remapUnicodePunctuation=e||!1,JSBridge.putSetting("remapPunctuation",e||!1)`）
  ⇒ 按面板键搜**必然 0 命中**，会把「被消费」误判成「无消费」。
- **通用选项包**：`allowPhysicsConflict` 的读点是 `(window._options||{}).allowPhysicsConflict`（main.js，传进 MathJax 配置）
  ⇒ 形态枚举不完备（我试了 `File.option.X` / `_options.X` / `window._options.X` / `i.option.X`，**都漏了**这一个）。
- **同名异物（假阳性）**：`n.openExportFile` 里的 `n` 是**导出配置对象**、`navigator.userLanguage` 是**浏览器 API**
  ⇒ 命中「同名」不等于命中「该偏好」。
- 我还试了两种**自动化**方案，都**不成立**（如实记录）：
  按窗口取最近邻 ⇒ 取到**邻居键**（`remapPunctuation` 被配成 `smartQuote`）；
  按「`putSetting("K",V)` 与 `File.option.<name>=V` 用**同一个值表达式** V」配对 ⇒
  `V` 常是 `e||!1` 这种通用表达式，**不具鉴别力**（`zoomFactor` 被配成 `showToolbar`）。

⇒ 结论：**`consumer` 只能是「带引用的判断」，不能假装成机械结论。**

**③ `main.js` 里还有一份**独立的**默认值表（同 84 键）。**
矩阵的声明源是 `frame.js` 的 `DEFAULT_OPTIONS`；而 `main.js` 的 `File.option` 默认值对象
（锚点 `convertSmartOnRender:!1,remapUnicodePunctuation:!1`）是**同一批 84 键**，
来自**不同文件、不同压缩产物** ⇒ 天然是一次**独立交叉验证**。实测：
- 键集 **84/84 双向一致**（0 差集）⇒ 矩阵的范围声明**被第二个来源证实**；
- 默认值 **84/84 逐条一致** —— ⚠️ 修前有 2 处「不一致」，根因是**矩阵把空数组编码成字符串**：
  `treeFileFilterPatterns` / `libraryFileFilterPatterns` 的 `default` 写成 `"[]"` 而 Typora 里是 `[]`。
  ⇒ 那是**矩阵的类型错误**（`default` 是 JSON 值字段，不该把数组字符串化），已改回 `[]`。

### 三、处置

1. **登记表 `consumer` 改为三值 + 新增 `anchor`**（`tests/parity/fixtures/typora-panel-only-keys.json`）：
   - `js` = Typora 的 JS 侧有**显式偏好读点**（`File.option.X` / `_options.X` / `i.option.X`，X 可为改名后的内部名）；
   - `native` = JS 侧无显式读点，但**原生二进制含该字符串**；
   - **`unknown`** = 两者皆无 ⇒ **消费方未确定**（必须写 `consumerNote` 声明试过哪些形态）；
   - **`anchor`** = 该判断的**可核对落点**（`js` 时是读点符号，`native` 时是键名，`unknown` 时是 `—`）；
   - **`internal`** = 面板键与内部名不同时的内部名（只在确实改名时写）。
   ⇒ 结果：**js 19 / native 21 / unknown 7**（`unknown` = `openExportFile`、`openExportLocation`、
   `picgo_app_path`、`runCommand`、`runCommandStr`、`showOutput`、`zoomLevel`）。
   ⚠️ 顶层 `note` 里把上面三条**不可靠性**逐条写清（否则下一个人会再按「出现在哪个文件」判一次）。
2. **结清智能标点家族 3 项 `unverified`**（`status` 轴，13 → **10**）：
   - `remapPunctuation` → `equivalent`：面板 label = **"Remap Unicode Punctuation on Parse"**，
     语义 = **解析时把 Unicode/全角标点也当 ASCII 语法**（hint：`》 blockquote → > blockquote`）；
     消费点 `shouldRemapPunctuation(){ return File.option.remapUnicodePunctuation || !File.option.convertSmartOnRender && (File.option.smartQuote || File.option.smartDash) }`
     —— 该表达式与面板 hint 的 **"It will be turned on automatically if smart quotes/dashes will be converted on input."** **逐字对应**，互为验证。
     **默认 false** ⇒ 默认不做 remap；Mellow 亦不做 ⇒ **默认行为一致**。
   - `SmartyPantsOnRendering` → `gap`：面板是 **radio**（`Convert on Input` / `Convert on Rendering`），**默认 false = Convert on Input**；
     Mellow `editor.smartPunctuation`（默认 false）的语义 = **输入时**改写弯引号 + `--␠`→`—`
     ⇒ **默认档已被复现 ⇒ 默认体验一致**；缺的是「**渲染时转换**」档（落盘保持 ASCII、只在渲染时显示）⇒ 按能力口径记 gap。
   - `twoHyphensToEm` → `equivalent`：面板里**仅非 macOS 且 `smartDash` 开启时**才出现；Typora 默认 false ⇒ `--`→`–`(en)、`---`→`—`(em)；
     Mellow 的 `shouldEmDash` 把 `--␠` 换成 `— `（**em**）⇒ 取的是 Typora 的 **true 档** ⇒ 记为 equivalent 并写明该偏离。
3. **矩阵修 2 处类型编码**：`default: "[]"` → `[]`。
4. **本机工具新增两条判据**（`tests/parity/tools/audit-typora-preferences.mjs`）：
   - **`anchor` 必须核对得上**：`js` ⇒ anchor 末段标识符必须在 Typora 的 JS 侧存在；
     `native` ⇒ anchor 必须**在原生二进制里精确行命中**（`strings -a Contents/MacOS/Typora`）；
     `unknown` ⇒ anchor 必须是 `—` 且必须有 `consumerNote`；`internal === key` 视为噪声。
     并**打印** consumer 分布与 `unknown` 清单（存量欠债必须可见）。
   - **第二份默认值表交叉验证**：键集双向 + 值逐条 + 3 条**绝对判据**（锚点命中 / 键数下限 80 / 三条已知值字面断言）
     —— 相对判据（两源互比）配绝对判据，防「一起变松」。
5. **CI 侧只锁形状**（`verify-settings-contract.mjs` ⑭）：`consumer ∈ {js,native,unknown}`、`anchor` 必填且与 consumer 相配、
   `unknown` 必须有 `consumerNote`、`internal ≠ key`；并加**两条棘轮**：`status=unverified ≤ 10`、`consumer=unknown ≤ 7`
   —— 防「把没查的项改标成 `unverified`/`unknown` 来绕开工作」（那会让欠债**回升**）。
   ⚠️ 事实核对（anchor 是否存在）**必须**在本机工具里做：CI 不装 Typora。

### 四、注入验证（全部实跑，含还原）

| # | 注入 | 期望 | 实得 |
|---|---|---|---|
| 1 | `pandocPath` 的 `anchor` 改成不存在的符号 | 本机工具报「anchor 核对不上」 | ✅ |
| 2 | `darkTheme`（native）的 `anchor` 改成不存在的字符串 | 同上（原生二进制无该串） | ✅ |
| 3 | `zoomLevel`（unknown）的 `anchor` 改成 `x` | 报「unknown 时 anchor 必须为 —」 | ✅ |
| 4 | 删掉 `runCommand` 的 `consumerNote` | 报「未确定必须写明试过哪些形态」 | ✅ |
| 5 | `remapPunctuation` 的 `internal` 写成等于 `key` | 报「internal 与 key 相同 ⇒ 不该写」 | ✅ |
| 6 | 把矩阵 `wordsPerMinute` 默认值改成 400 | 报「两源不一致（矩阵 400 / main.js 382）」 | ✅ |
| 7 | 删掉 `pandocPath` 的 `anchor` | CI 报「anchor 缺失」 | ✅ |
| 8 | `zoomLevel` 的 `anchor` 改成 `x` | CI 报「consumer=unknown 时 anchor 必须为 —」 | ✅ |
| 9 | 把 3 条已核实的改成 `unverified`（13 > 10） | CI 报棘轮回升 | ✅ |
| 10 | `remapPunctuation` 的 `internal` 等于 `key` | CI 报「internal 与 key 相同」 | ✅ |

### 五、教训

1. **「字符串出现在哪个文件」不是「被消费」** —— 尤其是当那个文件**就是这个 UI 的脚本**时，
   判据会对**全体**恒真。登记表里凡是「XX 有/没有」的字段，都要问一句
   **「它的判据在这个文件集上有没有鉴别力？」**（本例：`frame.js` 含全部 47 个键 ⇒ 零鉴别力）。
2. **跨层标识符可能被改名** —— 搜「某键有没有被消费」之前，先取**映射**。
   而且**不要**用「最近邻」或「同值表达式」自动配对：前者会取到邻居键，后者在 `e||!1` 这种通用值上不具鉴别力
   （两种我都试过，都被实测否掉）。⇒ 映射只能**逐条读原文确证**。
3. **「命中同名」≠「命中该物」** —— `n.openExportFile`（导出配置对象字段）、`navigator.userLanguage`（浏览器 API）
   都会让搜索**假阳性**。⇒ 判据要么能区分「同名异物」，要么就把不确定**显式登记**。
4. **不确定要允许，但必须可见且只能下降** —— 本轮新增 `unknown` 这个**合法**取值（7 项），
   并要求写清「试过哪些形态」+ 在 CI 里加**棘轮**。
   若不许 `unknown`，结果只会是「用一个看起来确定的错值填上」——那比留空更危险。
5. **相对判据必须配绝对判据** —— 两源互比（`frame.js` vs `main.js`）能防单边漂移，
   但防不了「一起变松」⇒ 同时锁锚点、键数下限与三条**对原文**的字面断言。
6. **字段的类型也是契约** —— 矩阵的 `default` 是 JSON 值字段，把空数组写成 `"[]"`（字符串）
   在 84 条里只占 2 条、当下也没影响任何判据；但它**让「两源一致」这个结论变成假的**。
   ⇒ 交叉验证的价值之一，正是把这种「无影响的类型错误」暴露出来。



## 4.129 结清「面板独有面」**7 项**（实装 1 + 定性 6）+ **3 项 note 收窄**：实装「默认行尾符」（2026-10-07）

### 一、动因

§4.128 把 `unverified` 从 13 压到 10，并留下 7 项 `consumer: unknown`。
本轮继续从这份欠债清单开工，优先选**能一手定性**的项。

### 二、一手证据（面板文案 = 用户可见语义的唯一来源）

§4.126 已声明「面板**标签**抽取不可靠（压缩 React 产物，控件有两种形态 ⇒ 取最近标签会取到邻居）」。
本轮改用**同一个 `createElement` 调用内**的 `label` / `title` / `hint` / `options`（与 `keyName` **同窗**）
⇒ 可靠。取到：

| 键 | 面板可见文案（一手） |
|---|---|
| `line_ending_crlf` | 组标题 **"Default Line Ending"** · hint **"Line ending for new file"** · `{false:"LF (Unix Style)", true:"CRLF (Windows Style)"}` · **仅非 macOS 显示** |
| `framelessWindow` | 组 **"Window Style"** · `{false:"Classic", true:"Unibody"}` · hint **"(applied after restart)"** · **仅 Windows** |
| `use_seamless_window` | 组 **"Window Style"** · `{false:"Classic", true:"Seamless"}` · **仅 macOS 且系统 < 26**（上游自己在 macOS 26+ 弃用） |
| `allowPhysicsConflict` | label **"Enable physics package"** · hint **"Physics package will redefine some latex macros, such as `\div`, `\Re`, etc."** |
| `no_image_move_for_local` | label **"Apply above rules to local images"** · **反向语义**（`reverse:!0` + `checked: !getValue(…)`） |
| `exportFolder` | 组 **"Default Folder for Exported File"** · `{"":"Auto", same:"Same folder with current file", custom:"Custom location"}` · `value: n.exportFolder \|\| ""` ⇒ **默认 Auto** |
| `customExportPath` | 是 `exportFolder` 的**从属字段**（仅 `"custom" === exportFolder` 时渲染）+ 文件夹选择器 |
| `quitAfterWindowClose` | 组 **"Quit"**（仅 macOS） · label **"Quit Typora when last window is closed"** · 默认 **false** |
| `openExportFile` / `openExportLocation` | 组 **"After Export"** · label **"Open exported file"** / **"Open exported file location"** · ⚠️ 默认值走「首个已定义者优先」（`ae(r.X, a.X, l.X)`）⇒ **本机资源判不了** |

### 三、处置 1：实装「默认行尾符」（`line_ending_crlf`）

**跨层链路（本轮查清）**：面板键 `line_ending_crlf` → **原生侧**
（实测 `strings -a Contents/MacOS/Typora` **含** `line_ending_crlf`、**不含** `preferCRLF`）
→ 字符串设置 `end-of-line`（`"crlf"`/`"lf"`）→ JS 侧 `preferCRLF()`
（`var e = this.getSetting("end-of-line") || ""; return e.length ? "crlf" == e.toLowerCase() : File.option.preferCRLF`）
→ 回落 `File.option.preferCRLF`。⇒ 它与矩阵里的 `preferCRLF` 是**同一件事的两层**，不是重复计数。

- 新增设置 `files.newFileLineEnding`（select `lf`/`crlf`，**默认 `lf`**，无 `applyCommand` —— 新建文档时读取）。
- `App.tsx` 新增 `newDocEol()`，**每一处**新建文档都改用它（3 处：`handleNew` / `ensureBlankDoc` / 启动空 tab）。
- **默认行为不变**：Mellow 此前硬编码 `eol: '\n'`，新默认 `'lf'` 映射到同一个 `'\n'`。
- 作用域一致：只影响**新建**文档；打开已有文件时行尾来自文件自身（`detectEol`），与 Typora 的 `decideLineEnding` 同向。
- ⚠️ **如实声明的差异**：Typora **仅在 Windows/Linux** 暴露该选择器，Mellow 三平台都暴露（有意放宽）。
- 文案取 Typora 面板原文：`默认行尾符` / `LF（Unix 风格）` / `CRLF（Windows 风格）`。

### 四、处置 2：其余 6 项的定性（+ 3 项 note 收窄，仍为 `unverified`）

> ⚠️ 计数口径：本轮 **`unverified` 从 10 降到 3**，即 **7 项离开了欠债清单**
> （1 项实装为 `equivalent` + 2 项 `not-applicable` + 4 项 `gap`）；
> 另有 **3 项仍在清单内**，但 note 已**收窄**（写明「已排除什么、还差什么」）。

| 键 | 新状态 | 依据（要点） |
|---|---|---|
| `line_ending_crlf` | `equivalent` | 见上（已实装） |
| `framelessWindow` | `not-applicable` | Windows 专属外观档；Mellow 外壳是 Tauri 原生装饰窗口（实测 `tauri.conf.json` 未设 `decorations`），无该切换 |
| `use_seamless_window` | `not-applicable` | macOS 专属且仅系统 < 26（上游已弃用）；同上一行 |
| `allowPhysicsConflict` | `gap` | 默认**关**（`!!getValue(…)` ⇒ false）⇒ **默认行为一致**；Mellow 未配置 physics 包（实测 `packages/` + `apps/desktop/src/` + `apps/desktop/public/` **0 处** `physics`）⇒ 缺能力 |
| `no_image_move_for_local` | `gap` | 与矩阵 `applyImageMoveForLocal` 是**同一事实的反向面板键**（不是两件事）⇒ 与矩阵同状态 |
| `exportFolder` | `gap` | 默认 `""` = **Auto = 当前文件所在目录**（`u()` = `File.bundle.currentFolderPath`）；Mellow 无该偏好，导出只给 `defaultName`、不给 `defaultPath` ⇒ **默认落点也不同** |
| `customExportPath` | `gap` | `exportFolder` 的从属字段 ⇒ 同一件事 |
| `quitAfterWindowClose` | `unverified`（note 收窄） | **已排除**：Mellow 的 Rust 侧**没有** `prevent_exit` / `exit_on_last_window_closed`（全 `src-tauri` 扫过）⇒ 走 Tauri 默认。**仍需实机**：关掉最后一个窗口后进程是否仍在 |
| `openExportFile` / `openExportLocation` | `unverified`（note 收窄） | 默认值走「首个已定义者优先」，其内置 schema 默认**不在** `DEFAULT_OPTIONS` 里 ⇒ 判不了。Mellow 侧**有底层能力**：命令 `file.revealInFinder` |

⇒ 分布：`equivalent 29 / gap 8 / not-applicable 7 / unverified **3**`（上轮 10）。
⚠️ **`gap` 从 4 升到 8 不是退步**：那是**从「不知道」变成「知道且登记」**——
`unverified` 降 7、`gap` 升 4、`not-applicable` 升 2、`equivalent` 升 1。**欠债的方向是「变清楚」，不是「变多」。**

### 五、护栏

1. **新增接线判据**（`verify-settings-contract.mjs`）：`files.newFileLineEnding` 必须是 `select` 且**默认 `lf`**、
   两个选项都在、`App.tsx` 必须读取它、`newDocEol` 必须把 `'crlf'` 映射成 `'\r\n'`；
   **`eol: newDocEol()` 出现次数 ≥ 3**（漏一处 ⇒ 该入口静默忽略用户设置）；
   **`eol: '\n'` 的硬编码必须恰好 1 次**（唯一允许处 = `docMetaRef` 初始值）。
   ⚠️ 这条判据踩了一个**新的字面量坑**：`eol: '\n'` 在 `App.tsx` 里还会命中
   ① **类型注解** `(eol: '\n' | '\r\n')`；② **注释里提到它**（含 `newDocEol` 的 JSDoc）
   ⇒ 朴素计数 3、精确计数（要求后接 `,` 或 `}`）1。
   更隐蔽的是：**正则里必须写 `'\\n'`** —— 写成 `'\n'` 匹配的是**真换行符**，而源码里是**反斜杠 + n**；
   实测写成 `'\n'` 时计数**恒为 0**（判据静默失效）。
2. **棘轮收紧**：`status=unverified ≤ 10` → **≤ 3**（记录 14 → 13 → 10 → 3 的收敛轨迹）。
3. **注入验证**：① 把一处 `newDocEol()` 改回硬编码 ⇒ 红（且报「只有 2 处使用」+「硬编码 2 次」）；
   ② 默认值改成 `crlf` ⇒ 红；③ 映射写错（`=== 'lf'`）⇒ 红；④ 把 1 条改回 `unverified`（4 > 3）⇒ 棘轮红。全部还原后通过。

### 六、教训

1. **面板文案要在「同一个 `createElement` 调用内」取** —— §4.126 记录的「取最近标签会取到邻居」是真的；
   与 `keyName` 同窗取 `label`/`title`/`hint`/`options` 才可靠。本轮 9 个键**一次取全**，且每条都能引用原文。
2. **「默认值一致」与「能力缺失」是两件事，必须分开写** ——
   `allowPhysicsConflict` / `SmartyPantsOnRendering` 都是「**默认行为一致**、缺一个开关/一档」；
   若只写 `gap` 会让人以为默认行为也偏离，若只写 `equivalent` 又会掩盖能力缺口。⇒ 状态取 `gap`，note 首句写明默认一致。
3. **`gap` 数量上升不一定是退步** —— 判据是**欠债的方向**：本轮 `unverified` 降 7、`gap` 升 4。
   把「不知道」变成「知道且登记」是进展；**只有当 `unverified` 上升时才是退步**（故棘轮只锁 `unverified` 与 `unknown`）。
4. **源码里的转义字面量，在判据里要再转义一层** —— 断言源码中出现 `'\n'`（反斜杠 + n）时，
   正则/字符串里必须写 `'\\n'`；写成 `'\n'` 会匹配**真换行符** ⇒ 计数恒 0、判据静默失效。
   **新写这类判据后必须看一次实际计数**（本轮就是靠「计数为 0」发现的）。



## 4.130 导出后行为族：**5 项 `consumer: unknown` 结清**，并抓到一处**默认行为偏离**（`openExportLocation` 默认开）（2026-10-07）

### 一、动因

§4.129 的入口清单写着：「导出后行为族……若确认『配置对象来自偏好存储』，则 5 项 `consumer` 可从 `unknown` 改成 `js`」。
本轮把它查到底。

### 二、关键取证：**原生把整个对象不透明转发**

| 事实 | 证据 |
|---|---|
| 面板把这些字段**持久化成偏好** | `te=function(e,t){return function(n,a){…o[n]=a; e.onChange("export."+t,o)}}` ⇒ 写 `export.general.<field>` / `export.<group>.<field>` |
| **全部 JS 文件里只有面板含 `export.general`** | 实测全树：仅 `page-dist/static/js/Preferences.*.js` ×2；`main.js` **0 处**、`frame.js` **0 处** |
| **原生二进制含 `export.general`** | `strings -a Contents/MacOS/Typora` 精确行命中 |
| 行为侧读的是**配置对象**的同名字段 | `n.openExportFile` / `n.openExportLocation` / `n.runCommand` / `n.runCommandStr` / `n.showOutput`（导出完成处理函数，`w = async function(e,t,n,…)` 的第 3 个形参） |
| 字段名**不在**原生二进制里 | `openExportFile` / `runCommand` / `showOutput` 实测 `strings` **未命中** |

⇒ **结论**：原生读取 `export.general`（所以二进制里有这个**对象名**），并把整个对象**不透明转发**给 JS 导出流程
（所以**字段名**不会作为原生字符串出现）。**这解释了「按字段名搜二进制搜不到」** ——
也说明此前判 `unknown` 是**判据太窄**，而不是真的没有消费方。
⇒ 这 5 项改判 **`consumer: js`**，anchor = 实际读点（`n.openExportFile` 等）。

### 三、抓到一处**默认行为偏离**：`openExportLocation` 默认是**开**

面板的勾选值是 `!!ae(r.X, a.X, l.X)`（**组配置 / `export.general` / schema**，**首个已定义者优先**）。
逐字段查 schema：

| 键 | 面板里 `<key>:` 形式的取值 | 全新安装下的默认 |
|---|---|---|
| `openExportLocation` | **`["!0"]`** —— 实测 `L={appendHead:{…}, appendBody:{…}, allowPerFileSetting:{…}, openExportLocation:!0}`（HTML 导出的 schema 片段） | **`true`（勾选）** |
| `openExportFile` | `[]`（**不在任何 schema 里**） | `false`（`!!undefined`） |
| `showOutput` / `runCommand` / `runCommandStr` | `[]` | `false` |

⇒ **Typora 默认在导出完成后 `JSBridge.showInFinder(t)`（在文件管理器中显示导出件）**；
Mellow 导出完成只弹 toast + 记录 `mellow.export.last`，**不做任何打开/定位** ⇒ **默认行为偏离**。
⚠️ **上游两处默认并不一致**（如实记录）：「通用导出设置」页用 `checked: !!n.openExportLocation`
（`export.general` 未设 ⇒ 默认**不**勾），而 HTML 导出的 schema 片段给的是 `!0`。

⇒ 处置：`openExportLocation` 记 **`gap`**（行为偏离），并**登记待裁决**（`pendingRef: ADR-0034 Q11`）——
选项 A1 默认对齐 / A2 新增开关+默认关 / A3 维持+登记 `D-`，**建议 A2**（Mellow 已有 `file.revealInFinder` 底层能力，
但**默认对齐会改变所有用户的导出后体验**，按纪律不得静默改）。
同族的 `openExportFile` **默认是关** ⇒ **默认行为一致**，只缺开关 ⇒ 记 **`equivalent`**，**不需要裁决**。

### 四、新增护栏

1. **本机工具**（`audit-typora-preferences.mjs`）：`consumer: native` **但键名出现在行为文件里** ⇒ **必须写 `consumerNote`**。
   出现只可能是三类：① 只是 `putSetting`（**写**）；② 命中的是**同名异物**；③ 持久化由**原生不透明转发** ⇒ 必须写明是哪一类。
   ⚠️ **扫描面必须排除面板** —— **面板含每一个键**，含它则本判据会对 **21 项全部**要求 note（那正是 §4.128 的「对全体恒真」）；
   排除后实测只有 **5 项**（`can_collapse_outline_panel` / `customExportPath` / `exportFolder` / `restoreWhenLaunch` / `userLanguage`）。
   canary 四向，其中一向**专门断言「扫描面含面板时会退化成全要求」**（把边界假设本身钉住）。
   **注入验证**：去掉 `userLanguage` 的 `consumerNote` ⇒ 红。
2. **CI 侧**（`verify-settings-contract.mjs` ⑭）：`pendingRef` 必须形态合法（`ADR-\d{4}` 或 `ADR-\d{4} Q\d+`）
   且**指向的 ADR 文件真实存在**（ADR 状态由 `verify-release-gate.mjs` 负责，分工不重复）。
   **注入验证 2/2**：指向 `ADR-9999` ⇒ 红；写成「见 ADR 0034」⇒ 红。
3. **棘轮再收紧**：`status=unverified ≤ 3` → **≤ 1**；`consumer=unknown ≤ 7` → **≤ 2**。
   收敛轨迹：`unverified` **14 → 13 → 10 → 3 → 1**；`unknown` **7 → 2**。

### 五、分布（成对报）

`equivalent 30 / gap 9 / not-applicable 7 / unverified **1**`；`consumer`：`js 24 / native 21 / unknown **2**`。
本轮的 5 项全部来自 `consumer` 轴（`unknown` 7 → 2），`status` 轴只动 2 项
（`openExportFile` → `equivalent`、`openExportLocation` → `gap`）。
⇒ **两条轴要分开报** —— 只看 `gap` 4→8→9 会以为一直在「变差」，而实际上**未知量在快速收敛**。

### 六、教训

1. **「搜不到」要分三种情况**：① 真的没有；② **改名**（§4.128）；③ **被不透明转发**（本轮）。
   第 ③ 类最隐蔽 —— 对象名在二进制里、**字段名不在**，只看字段名会得出「无消费方」的错结论。
   ⇒ 判据要问「**这个字符串会以什么形态跨过边界**」，而不是只搜一次名字。
2. **默认值必须从代码的比较里读，不能从「界面看起来」猜** ——
   本轮差一点把 `openExportLocation` 判成「默认关」（因为「通用导出设置」页里默认不勾）；
   真正决定行为的是 `ae(r.X, a.X, l.X)` 这个**首个已定义者优先**，而 schema 片段给的是 `!0`
   ⇒ **默认是开**。若按「通用页看起来不勾」下结论，就会把一个**默认行为偏离**判成 `equivalent`（**漏报缺口**）。
3. **「同一个键在上游的两处默认不一致」是合法发现** —— 不要为了给出一个干净结论而选一处当真相；
   如实记录两处，并说明**哪一处决定行为**（本轮：schema 片段经 `ae()` 生效）。
4. **扫描面的边界要作为 canary 钉住** —— 「`consumer: native` 但键名出现在行为文件里」这条判据，
   一旦有人把面板加进扫描面，就会从「5 项」退化成「21 项全要求」而**看起来仍然在工作**。
   ⇒ canary 里专门加一向：**扫描面含面板时必须是「全要求」** —— 断言退化本身，而不是假装它不会发生。



## 4.131 「面板独有面」的**未知量清零**：最后 1 项 `unverified` 定案（`quitAfterWindowClose`）（2026-10-07）

### 一、动因

§4.130 之后欠债剩：`status=unverified` **1 项**（`quitAfterWindowClose`）、`consumer=unknown` **2 项**（`picgo_app_path` / `zoomLevel`）。
本轮把它们逐一定案。

### 二、`quitAfterWindowClose` → `gap`（**源码级**证据，非真机观察）

Typora：面板组 **"Quit"**（仅 macOS）、label **"Quit Typora when last window is closed"**、默认 **false**
⇒ **macOS 默认「关掉最后一个窗口不退出」**（符合平台惯例）。

Mellow **会退出**，三段源码构成完整链路：
1. 本仓 `apps/desktop/src-tauri/src/lib.rs`：
   `RunEvent::ExitRequested { .. } | RunEvent::Exit => geometry::flush(app)`
   —— 模式里用 `{ .. }` **丢弃了 `api`** ⇒ **从不调用 `prevent_exit()`**；
2. vendored 依赖 `tauri-runtime-wry-2.11.4/src/lib.rs`（**本地 cargo registry 源码**，Tauri 2.11.5 为 Cargo.lock 解析版本）：
   ```rust
   TaoWindowEvent::Destroyed => {
     let removed = windows.0.borrow_mut().remove(&window_id).is_some();
     if removed {
       let is_empty = windows.0.borrow().is_empty();
       if is_empty {
         let (tx, rx) = channel();
         callback(RunEvent::ExitRequested { code: None, tx });
         let recv = rx.try_recv();
         let should_prevent = matches!(recv, Ok(ExitRequestedEventAction::Prevent));
         if !should_prevent { *control_flow = ControlFlow::Exit; }
       }
     }
   }
   ```
   ⇒ **最后一个窗口被销毁且未阻止 ⇒ 进程退出**；
3. `apps/desktop/src-tauri/src/window.rs` 的关闭门是 `api.prevent_close()` + 前端 dirty 确认后
   `allow_close_window` 登记再 `window.close()` ⇒ 窗口被**销毁**（不是隐藏）⇒ 上述路径**可达**。

⇒ **行为偏离** ⇒ 记 `gap` + **登记待裁决 `ADR-0034 Q12`**（A1 对齐不退出 / A2 新增开关+默认不退出 / A3 维持+登记 `D-`，**建议 A2**）。
⚠️ **证据级别如实声明**：这是**源码级**结论（本仓 handler + vendored 依赖源码），**非真机观察**；
将来真机验收请以「关掉最后一个窗口后进程是否仍在」为准。

### 三、`picgo_app_path` → `consumer: native`（**anchor 用原生符号**）

该键**不作为原生字面量**出现（`strings` 未命中），但消费方确在原生侧：
1. 面板 label **"PicGo Path"**（`"picgo-app" == g && window.isNodeHtml` 时才显示），
   `defaultPath: window.isWin ? "C:\Program Files\PicGo\PicGo.exe" : ""`、placeholder `/usr/bin/picgo`；
2. 面板把它的**值作为参数**传给原生桥：`window.Setting.testImageUploader(C, o, t.getValue("picgo_app_path"), t.getValue("piclistAppPath"))`；
3. 原生侧确有 PicGo 上传实现 —— `strings` 命中 `doUploadUsingPicgoAfterLaunch:callback:isRetry:`、
   `doUploadUsingPicgoLike:images:callback:`、`com.molunerfinn.picgo`、`Using picgo/piclist server http://127.0.0.1:36677/upload`。

⇒ `consumer: native`，**`anchor` 取原生符号**（`doUploadUsingPicgoAfterLaunch:callback:isRetry:`）而非键名 ——
anchor 的定义是「**可核对落点**」，当键名跨边界时是**参数**而非字面量时，用「证明消费方存在」的原生符号更可核对。

### 四、`zoomLevel` 仍 `unknown`，但范围已收窄

已排除：① JS 行为侧只有 `putSetting("zoomLevel", …)`（**写**），无读点（`customZoom` 同样只写）；
② 原生二进制**无** `zoomLevel`/`customZoom` 精确行（但 **`zoomFactor` 有** ⇒ 原生确实读 `zoomFactor`）；
③ 面板**有**读点，但那是**面板自身回显**（`value: this.getValue("zoomLevel")||0`）——
⚠️ **面板读点不能作为「被消费」的证据**（§4.128：面板含每一个键，零鉴别力）；④ 真正缩放由 **Electron `webFrame.setZoomLevel(n)`** 施加。
剩余两种可能：(a) 原生按**整体设置字典**泛化读取（键名不作字面量）；(b) 上游**遗留的只写键**。
⇒ 保持 `unknown` 并**收窄 note**（写明已排除什么、要核实什么）。

### 五、分布（两条轴分开报）

`equivalent 30 / gap 10 / not-applicable 7 / **unverified 0**`；`consumer`：`js 24 / native 22 / **unknown 1**`。
⇒ **`unverified` 清零**（轨迹 **14 → 13 → 10 → 3 → 1 → 0**），CI 棘轮收到 **`≤ 0`**（必须为空）。
⚠️ 棘轮到 0 后判据退化为「必须为空」，**保留它**（欠债一旦回升就会红），并保留打印清单的代码（机制还在，当前为空）。

### 六、教训

1. **依赖的行为也可以有「一手证据」——读 vendored 依赖的源码** ——
   本轮「关窗是否退出」本是**运行时**问题，靠读 `tauri-runtime-wry` 的源码定案（比查文档强：源码是**本机这一版**的）。
   ⚠️ 但必须**如实标注证据级别**（源码级 ≠ 真机观察），否则将来真机结果不同时会变成「曾声称已验」。
2. **`anchor` 不必是键名** —— 当键名跨边界时是**参数**而非字面量（`testImageUploader(…, t.getValue("picgo_app_path"), …)`），
   用「**证明消费方存在**」的原生符号作 anchor 更可核对。⇒ 判据要允许「落点」与「键名」不同。
3. **「无读取方」也是合法结论**，但必须写明**已排除什么**与**剩余假设** ——
   `zoomLevel` 可能是**只写键**（上游遗留）。⇒ 不许为了清零而硬填一个 `native`：
   **清零的是「未核实」，不是「未确定」**；两者是不同的轴，可以一个到 0、另一个留 1。
4. **面板读点不能当「被消费」的证据** —— 这是 §4.128 的教训在 `zoomLevel` 上的再次应用：
   面板对每个键都有 `getValue`（回显），零鉴别力。



## 4.132 补上 `exportFolder` 的「**Auto**」那一半：导出保存对话框默认落在**当前文件所在目录**（2026-10-07）

### 一、动因

§4.130 把 `exportFolder` 定为 `gap`，理由里有一条**不只是「缺选项」**：
Typora 的默认值 `""` = **Auto**，其语义是**当前文件所在目录**；
而 Mellow 只给对话框 `defaultName`、**不给目录** ⇒ **默认落点也不同**（用户在别的目录里找导出件）。

### 二、一手证据

- **Typora**（`main.js` 导出路径计算）：`"same" === t.exportFolder ? u() + r + o : "custom" === t.exportFolder ? …`，
  而 `u = function(){ return File.isMac ? File.bundle.currentFolderPath : … }` ⇒ **Auto 的落点 = 当前文件所在目录**；
  面板里该组的默认是 `value: n.exportFolder || ""` ⇒ `""` = Auto。
- **Mellow**（`src-tauri/src/fs.rs` 的 `pick_save_path`）：只有
  `app.dialog().file().set_file_name(&default_name)` —— **没有 `set_directory`** ⇒ 初始目录由系统决定。

### 三、处置

1. **Rust**（`pick_save_path`）：新增 `default_dir: Option<String>`；**仅在该目录确实存在时** `set_directory`
   —— 路径可能已失效（文档被移动/删除），把失效路径交给原生对话框会产生**平台相关的怪行为**，而且**只在真机上看得出来**。
2. **前端**（`App.tsx` 新增 `saveDialogDir()`）：**全部 6 处** `pick_save_path` 调用点都传：
   | 入口 | 默认落点 |
   |---|---|
   | PDF / pandoc / HTML / 图片 导出（4 处） | **当前文件所在目录**（= Typora 的 Auto） |
   | 渲染图（公式/图表）下载 | 当前文档目录 |
   | **导入**（pandoc → .md） | **被导入文件所在目录** —— ⚠️ 语义**不同**，不能机械复制 |
   `saveDialogDir()` 对「未命名/未保存文档」与「路径里没有分隔符」返回 `undefined` = **不指定**（由系统决定）。
3. **登记表**：`exportFolder` 的 note 记下「Auto 那一半已补上」，但「Default Folder for Exported File」**选项本身**
   （Same folder / Custom location 两档 + `customExportPath` 的持久化）仍缺 ⇒ 状态**保持 `gap`**。

### 四、护栏：§4.127 建的那条表**第一次被复用**，当场证明价值

新增形参**立刻**进 `verify-tauri-command-contract.mjs` §⑤b 的 `OPTION_ARG_REQUIRED_AT_CALLSITE`：

```js
['pick_save_path.default_dir', '承载「导出默认目录」（Typora `exportFolder` 的 Auto 语义）：漏传 ⇒ 该入口退回系统默认目录'],
```

⇒ 判据 = 「该命令的**每一处**调用都含该键」。**注入验证 1/1**：去掉 HTML 导出那处的 `defaultDir` ⇒ 红
（`pick_save_path（← …/App.tsx）**未传** defaultDir：该形参是 Option（漏传不报错），但承载用户设置 —— 不传 = 静默忽略用户设置`）。

⚠️ 这条护栏是 §4.127 为 `pandocPath` 建的，**本轮是它第一次服务于新改动** ——
若当时没建，本轮新加的 `default_dir` 就会成为**下一个静默漏传点**（4 个导出入口任漏一个都只在真机上可见）。

### 五、教训

1. **新建的护栏要在下一次改动里立刻复用** —— 本轮护栏的收益在**同一轮**就兑现了：
   它把一个「只在真机可见、静默」的缺陷变成一条**当场就红**的判据。
   ⇒ 判据建好后，**下一次加同类字段时先问「它该进哪张表」**。
2. **路径/外部资源类参数：只在「确实可用」时才用**（`is_dir()` 守卫）——
   失效路径交给原生对话框的后果**平台相关且只在真机可见**，属于「本地测不出来」的缺陷（PITFALLS §4.154 同族）。
3. **同族入口要全部覆盖，但语义不能机械复制** —— 6 处里 4 处是「当前文件所在目录」，
   而**导入**是「被导入文件所在目录」；把导入也写成 `tab.path` 会给出一个**看起来对、实际错**的落点。
4. **「补上了一半」要如实写** —— 本轮补的是 Auto 的**行为**，选项本身仍缺；
   若把 `exportFolder` 直接改成 `equivalent`，就会掩盖「用户仍无法选 Same folder / Custom location」这一事实。



### 六、⚠️ 更正（2026-10-07，§4.133）

本节把 **Auto 的语义实现错了**：写成「**当前文件所在目录**」，而 Typora 的 Auto 是
**`File.mountFolder_`（打开的工作区文件夹）**；「当前文件所在目录」对应的是 **`same`** 档（`u()`）。
⇒ 已由 §4.133 更正（`export.folder` 三档 + `auto` = `fileTreeRoot`）。
**错因**：只读了面板的**默认值**（`""` = Auto）就动手，**没有先把 `d()` 的优先级链逐字读出**。
⇒ 教训见 §4.133 的「教训 1」。



## 4.133 补上 `exportFolder` 的**选项本身**（三档）+ **更正 §4.132 的语义映射错误**（2026-10-07）

### 一、更正：§4.132 把 **Auto** 实现成了 **same**

本轮为了写「Same folder with current file」这一档，**逐字读出**了 `main.js` 的建议导出路径 `d()`：

```js
d = function (e, t, n) {                    // 建议导出路径
  var sep = File.isWin ? "\\" : "/";
  var name = e ? File.getSuggestedFileName() + "." + e : File.getSuggestedFileName();
  return (t = t || {}).path
    ? (!File.option.lastExport || File.option.lastExportNoOverwrite
        ? pathByDeleteLastComponent(t.path) + sep + name : t.path)      // ① 显式 path
    : File.option.lastSaveLocation
      ? File.option.lastSaveLocation + sep + name                        // ② **上次保存位置（高于本项）**
      : "same" === t.exportFolder
        ? u() + sep + name                                               // ③ same ⇒ u() = **当前文件所在目录**
        : "custom" === t.exportFolder
          ? (t.customExportPath = t.customExportPath || window._options.documentsPath,
             t.customExportPath + sep + name)                            // ④ custom
          : File.mountFolder_                                            // ⑤ **Auto ⇒ 工作区文件夹**
            ? File.mountFolder_ + sep + name
            : (n && n(name), name);                                      // ⑥ 兜底：只给文件名
};
u = function () {                            // ③ 的 u()
  return File.isMac ? File.bundle.currentFolderPath
    : (File.isNode && File.bundle.filePath
        ? reqnode("path").dirname(File.bundle.filePath || File.bundle.originalPath) : "");
};
```

⇒ **Auto = `File.mountFolder_`（打开的工作区文件夹）**，而 **「当前文件所在目录」是 `same`**。
§4.132 把 Auto 实现成了「当前文件所在目录」⇒ **映射错了**（在那个场景下两者的差别正是「打开了文件夹工作区」时）。
**错因**：只读了面板的**默认值**（`value: n.exportFolder || ""` ⇒ Auto）就动手，
**没有先把 `d()` 的优先级链逐字读出** —— 而「默认是哪一档」与「那一档取什么值」是两件事。

### 二、处置

1. **设置**（`packages/settings/src/index.ts`）：
   - `export.folder`（select `auto`/`same`/`custom`，**默认 `auto`**）；
   - `export.customPath`（text，默认空串；仅 `custom` 档生效，与 Typora 面板的渲染条件一致）。
2. **`App.tsx` 的 `saveDialogDir()` 重写**（`dirOfPath()` 抽成纯函数）：
   | 档 | 落点 | 对应 Typora |
   |---|---|---|
   | `auto`（默认） | **`fileTreeRoot`**（工作区文件夹）；无则**不指定** | `File.mountFolder_`（无则只给文件名） |
   | `same` | **当前文件所在目录** | `u()` |
   | `custom` | **`export.customPath`**；留空 ⇒ 不指定 | `customExportPath \|\| documentsPath` |
   ⚠️ `custom` 留空时 Mellow **不指定**（Typora 回落系统「文档」目录）—— 属**有意差异**（不替用户猜目录），已写进登记表。
3. **登记表**：`exportFolder` 与 `customExportPath` 均 **`gap` → `equivalent`**（`mellow` 分别指向 `export.folder` / `export.customPath`）。
   ⇒ 分布 `equivalent 30 → **32**`、`gap 10 → **8**`。
   ⚠️ 但 note 里**如实写出残留差异**：Typora 的 `File.option.lastSaveLocation`（记住上次保存位置）
   **优先级高于本项**，Mellow 未实现该前置项 ⇒ 在「用户刚保存过文件」的场景下两边落点可能不同。

### 三、护栏（注入验证 3/3）

`verify-settings-contract.mjs` 新增：
- `export.folder` 必须 `select` 且**默认 `auto`**、三档选项都在；`export.customPath` 必须 `text` 默认空串；
- `App.tsx` 必须读取这两项；**三个分支各自接到正确的来源**（`custom` ⇒ `customPath`（含留空 ⇒ 不指定）、
  `same` ⇒ `dirOfPath(path)`、`auto` ⇒ `fileTreeRoot`）—— 漏一支 = 该档静默退回系统默认；
- canary 用**同一份正则**做正/负样本（正样本合规、负样本「默认 same」必须被判为不合规）。

**注入验证 3/3**：① 默认值改成 `same` ⇒ 红；② 删掉 `custom` 选项 ⇒ 红；③ `auto` 档改成 `dirOfPath(path)` ⇒ 红。全部还原后通过。

### 四、教训

1. **「默认是哪一档」与「那一档取什么值」是两件事** —— 本轮 §4.132 的错就出在这里：
   读到「默认 = Auto」就动手，没读 **Auto 取什么值**。⇒ **凡「默认值 + 取值路径」的结构，
   必须把决定取值的优先级链逐字读出并抄进注释**（本轮 `d()` 的 5 级链）。
   ⚠️ 同一链里还藏着**别的东西**：`lastSaveLocation` 优先级高于本项 —— 只读「默认值」永远看不到它。
2. **自己的判定错了要「单独记一次更正」，并指出错在哪一步** ——
   §4.132 已提交，本轮在它末尾加**更正块**指向 §4.133，而不是悄悄改掉。
   读者若只看被改过的结论，就不知道原来错在哪、也就**无法判断是否还有同类错**。
3. **「补了一半」要接着补完，并说明每半各是什么** —— §4.132 补的是 Auto 的**行为**（且映射错了），
   本轮补的是**选项本身**（三档）。两半都做完，`exportFolder` 才配得上 `equivalent`。
4. **有意差异要写进登记表，而不是留在代码注释里** —— `custom` 留空时 Mellow 不指定（Typora 回落 `documentsPath`），
   这一条写在 note 里才能被下一个读者看见。



## 4.134 实装「拖入文件/文件夹」整组（3 项）：决策表**逐字转写成纯函数 + 39 例单测**（2026-10-07）

### 一、动因

§4.124 在那一面**取样一次**就找到了「拖入文件/文件夹」整组未实现，并留下决策表摘要；
§4.126 把它登记成 3 条 `gap`（面板独有面里**唯一的一整组**）。
本轮把它实装掉。

### 二、一手证据：**逐字读出** `File.onDropFile`（不是摘要）

```js
onDropFile: async function (paths, ev) {
  var isTyporaUrl = ev.types.indexOf("typora.url") > -1;      // 内部拖拽（大纲/标题）
  var p = paths[0];                                            // ⚠️ 只看**第一个**判分支
  function insertLink(path) { … if (!inSourceMode) insertURL(path); }   // source mode 下不插
  function openInTypora(path) { … }
  if (await isDirectory(p)) {                                  // ① 目录
    if (supportTextBundle && /\.textbundle$/i.exec(p))
      "link" === actionWhenDropFile ? insertLink(p) : openInTypora(p);       // ① textbundle 走**文件**开关
    else if ("link" === actionWhenDropFolder) insertLink(p);                 // ②a
    else if (File.bundle.filePath || File.getMountFolder()) openFolder(p);   // ②b
    else switchFolder(p);                                                    // ②c
  } else {
    var ext = (p.match(/(?:^|\.)([^.]+)$/)[1] || "").toLowerCase();
    if (~["latex","ltx","tex","wiki","dokuwiki","docx","rst","rest","org","textile","opml"].indexOf(ext))
      return "link" === actionWhenDropImport ? insertLink(p) : doImportFile(p);   // ③
    if (~File.SupportedFiles.indexOf(ext))
      return isTyporaUrl ? insertLink(p)
           : ("link" === actionWhenDropFile ? insertLink(p) : openInTypora(p));   // ④
    if (!isKeyWindow()) return false;                                            // ⑤a
    for (var i = 0; i < paths.length; i++) { i > 0 ? insertParagraph() : void 0; insertLink(paths[i]); }  // ⑤b
  }
}
```

面板侧（同一次取证，**同一个 `createElement` 内**）：
组标题 **"When drop file / folder into Typora"**，三行是 `w.v rows` 表格：
`["When drop folder", {"" :"Open in Typora", link:"Insert Folder Link"}]`、
`["When drop markdown file", {"" :"Open in Typora", link:"Insert File Link"}]`、
`["When drop files that can be imported", {"" :"Import File", link:"Insert File Link"}]`，
`value: this.getValue(<key>)` ⇒ **默认都是 `""`** ⇒ **打开 / 打开 / 导入**。

### 三、处置

1. **决策表落成纯函数**（`packages/app-core/src/dropAction.ts`）：`decideDropAction(ctx, prefs)`
   返回 `insert-link` / `open-document` / `open-folder` / `import-document` / `none`；
   常量 `IMPORTABLE_DROP_EXTS`（逐字）、`SUPPORTED_DOC_DROP_EXTS`、`dropExtOf()`。
   ⇒ **单测 39 例覆盖全部行**（`packages/app-core/test/dropAction.test.ts`），含
   「目录分支不受 file/import 开关影响」「`isKeyWindow=false` **只**影响第 ⑤ 行」「第 ⑤ 行不受任何开关影响」等**边界**。
2. **三档设置**：`files.dropFolderAction` / `files.dropFileAction` / `files.dropImportAction`
   （**默认 `open` / `open` / `import`**，与 Typora 一致）；文案取 Typora 官方原文（zh/en 各 8 键）。
3. **Rust 新增 `path_kind`**（`"dir"` / `"file"` / `"missing"`）：`path_exists()` 只回答「存在吗」，
   **无法区分目录与文件**；用 `symlink_metadata`（**不跟随符号链接**）与 Typora 的 `fs.lstat` 同语义。
4. **`App.tsx` 分派**（`handleDroppedPaths`）：`insert-link` ⇒ 注入 iframe（**沿用既有机制**：
   引擎对图片走图片管线、其余插为文件链接）；`open-folder` ⇒ `loadFolderRoot`；
   `open-document` ⇒ `openPathInTab`（自带未保存确认）；`import-document` ⇒ `importFromPath`。
   - 为此把 `handleImportDocument` 的**核心抽成 `importFromPath(input)`** —— 菜单入口先弹选文件，
     拖入入口**已经有路径** ⇒ 两者共用，避免两套逻辑分叉。
   - ⚠️ 顺手修了一处**既有小瑕疵**：`importFromPath` 现在**先**做未保存确认（此前要等到末尾
     `openPathInTab` 才确认 ⇒ 用户取消时导入的 `.md` **已经落盘**）。两个入口一起修好。
   - Tauri 的 drag-drop 监听在**挂载 effect**里注册一次，而决策所需的函数在本文件**更靠后**才定义
     ⇒ 用 `dropHandlerRef` 转一层（避免时序问题，也避免撑爆 effect 依赖数组）。

### 四、护栏（注入验证 3/3）

`verify-settings-contract.mjs` 新增：三档设置必须存在且**默认 open/open/import**、选项值正确、`App.tsx` 读取；
决策表文件与其单测**必须存在**；分派器**必须接全 5 种动作**；**分派器必须真的挂到 `dropHandlerRef`**
（否则它是一段**有单测但无人调用的死代码**），且 drag-drop 监听必须调用它。

**注入验证 3/3**：① 默认值改成 `link` ⇒ 红；② 分派器漏掉 `open-folder` 分支 ⇒ 红；
③ 把挂载那行注释掉 ⇒ 红（报「拖入分派器是死代码」）。全部还原后通过。

### 五、如实声明的差异与未验证项

| # | 差异 | 说明 |
|---|---|---|
| ① | **`.textbundle` 不生效** | Mellow 不支持 textbundle ⇒ 决策表第 ① 行不生效，`.textbundle` 目录按普通目录处理（`supportsTextBundle: false`） |
| ② | **`openFolder`/`switchFolder` 合并** | Typora 是两个动作（打开 / 替换工作区）；Mellow 是 SDI、工作区只有一个 ⇒ 合并为 `open-folder` |
| ③ | **「受支持文档」收窄** | Typora 用 `File.SupportedFiles`（含代码/纯文本）；Mellow 只把 **Markdown 家族**（`md/markdown/mdown/mkd`）当文档，其余文本文件落第 ⑤ 行 |
| ④ | **`typora.url` / source mode 不建模** | 属调用方职责（Mellow 无内部拖拽；source mode 由引擎的插入路径处理） |
| ⑤ | **多文件** | 与 Typora 一致：只用**第一个**判分支；`insert-link` 时把全部路径交给引擎 |

⚠️ **接线未经真机验证**：拖放事件需要 GUI（本机不可验）⇒ 决策表由**单测**锁、分派器由**静态判据**锁，
**「真机拖一次」仍待人工**。这一点已写进登记表，不得读作「已端到端验证」。

### 六、教训

1. **一整组「默认行为」比单个开关更值得优先做** —— §4.124 的判断在这里兑现：
   拖入组是 3 条 `gap`、涉及**四类落点**（打开文件夹 / 打开文档 / 导入 / 插成 Markdown），
   做成一条决策表 + 单测，一次覆盖 3 条。
2. **把「事件回调里的分支链」抽成纯函数** —— 否则只能靠**真机拖拽**来验（本机不可验）。
   抽出后 39 例单测把**每一行**都钉住，包括「`isKeyWindow=false` 只影响第 ⑤ 行」这类**反直觉边界**。
3. **逐字转写要连「没写的部分」一起写下来** —— 本轮在文件头列了 5 条**刻意不覆盖**的 Typora 细节
   （`typora.url` / source mode / 多文件展开 / openFolder 与 switchFolder / 只读态检查），
   否则下一个人会以为「决策表 = Typora 的全部行为」。
4. **canary 的样本必须与判据经过同一套预处理** —— 实测踩到：负样本写
   `'// dropHandlerRef.current = …'` 会**命中**（子串匹配），从而误报「canary 失效」；
   而真判据不会（`read()` 已剥整行注释）。⇒ **canary 不只是「共用谓词」，还要「共用输入管道」**。
5. **抽出共用函数时顺手修掉它带来的既有瑕疵** —— `importFromPath` 的「先确认再落盘」顺带修好了**菜单入口**
   的同一问题；只修拖入入口会让两个入口行为分叉。



## 4.135 逐条取证剩余 5 项 `gap` 的**阻塞原因** + 新增机器可读的 `blockedBy`（2026-10-07）

### 一、动因

§4.134 之后「面板独有面」剩 5 项 `gap`。本轮**不硬做**，而是逐条取证**为什么没做**，
并把结论落成**机器可读**字段 —— 否则「这 5 项还缺」这句话只存在于散文里。

### 二、逐条结论

| 键 | `blockedBy` | 证据与理由 |
|---|---|---|
| `openExportLocation` | `adr-pending` | 默认**开**（schema 片段 `openExportLocation:!0`）⇒ **默认行为偏离**，补它会改变用户可见默认 ⇒ 已登记 **ADR-0034 Q11**（`pendingRef` 在场） |
| `quitAfterWindowClose` | `adr-pending` | Typora macOS 默认**不退出**，Mellow **会退出**（源码级证据见 §4.131）⇒ 已登记 **ADR-0034 Q12** |
| `allowPhysicsConflict` | **`precondition`** | **前置能力「数学渲染」未接通** —— 见下面的更正块。⇒ **现有架构下不可实施**，属方案级 |
| `no_image_move_for_local` | `not-implemented` | 整族「图片移动规则」缺设置（矩阵里 `allowImageMove` / `applyImageMoveForLocal` / `applyImageMoveForWeb` **三条都是 `gap`**）；Mellow **有底层能力**（`image/ops.ts` 的 `planMove*`）⇒ 缺的是**开关与接线** ⇒ **可自主推进** |
| `SmartyPantsOnRendering` | `not-implemented` | 缺「**渲染期**转换」这一层：Mellow 的 `editor.smartPunctuation` 只在**输入期**改写（落盘即弯引号），而该档要求**输入与落盘保持 ASCII、只在显示上呈现** ⇒ 需新增**显示层**（CM6 decoration / view plugin），且要跳过代码上下文、与「光标行揭示」交互、**绝不改写文档** ⇒ 可自主推进，但规模大于其它项 |

⇒ **结论：5 项里只有 2 项可自主推进**（`not-implemented`），2 项待裁决、1 项前置缺失。
⇒ **「面板独有面」的自主可做项已基本见底** —— 剩下的要么需裁决，要么需先补前置能力。

### 三、⚠️ 更正（2026-10-07，更正 §4.134 报告里的一句）

§4.134 的**对话报告**里写过「`allowPhysicsConflict` ⇒ **MathJax 配置在 vendored CoreEditor 里，Mellow 不拥有**」。
本轮取证发现**这句不准确**：

- 实测**全仓（排除 `node_modules`）没有任何 MathJax 加载点/配置点**；
- `window.MathJax` **只被消费**（`packages/editor-engine/src/math.ts` 的 `tex2chtmlPromise` / `tex2svgPromise`）；
- `packages/editor-core/CoreEditor` 源码里 `mathjax` **0 命中**；三个 `index.html` 也没有相应 `<script>`；
- 全仓 79 处 `mathjax` 命中**全部**在 `dist/`、`public/`（构建产物）与引擎的消费点。

⇒ 真正的问题是**更靠前的一层**：**Mellow 根本没有提供 MathJax**（与既有记录一致：harness 下数学 widget 只显示原始 TeX）。
⇒ 错因：上一轮只看到「`window.MathJax` 被引擎消费」就推断「提供者在 vendored 里」，**没有搜「谁提供它」**。
⇒ 教训见下面「教训 2」。

### 四、`blockedBy`：机器可读的阻塞原因（新字段 + 判据 + 可见性）

- **词表**（`gap` 专用）：`not-implemented`（能力未实现，**可自主推进**）/
  `precondition`（**前置能力缺失 ⇒ 现有架构下不可实施**）/ `adr-pending`（**待裁决**，必须同时给 `pendingRef`）。
- **CI 判据**（`verify-settings-contract.mjs` ⑭）：取值必须在词表内；**只对 `gap` 有意义**（非 `gap` 项带 `blockedBy` ⇒ 红）；
  `adr-pending` 必须同时有 `pendingRef`（待裁决必须有机器可读载体）。canary 四向（含「合法组合不误报」）。
  **注入验证 3/3**：① 词表外的值 ⇒ 红；② `adr-pending` 去掉 `pendingRef` ⇒ 红；③ 把 `blockedBy` 加到 `equivalent` 项上 ⇒ 红。
- **可见性**：本机工具**按原因分组打印**，并给出三类的计数与「哪些可自主推进」——
  ⇒ 机器可读字段不能只躺在 JSON 里。
- ⚠️ **明确边界**：`blockedBy` **不是**「未确定/未核实」的存放处 —— 那是 `status` 与 `consumer` 两条轴的事；
  三者互不替代（本轮在顶层 note 里写明）。

### 五、教训

1. **「还缺 N 项」这句话必须落成机器可读字段** —— 否则下一轮只能重新读散文、重新判断哪些能做。
   ⇒ 有了 `blockedBy`，下一轮**一眼**就能看出「可自主推进 2 项 / 待裁决 2 项 / 前置缺失 1 项」。
2. **搜「谁消费」之后要搜「谁提供」** —— 本轮更正的就是这类：
   看到 `window.MathJax` 被消费，就推断「提供者在 vendored 里」；**实际全仓没有提供者**。
   ⇒ 对**全局对象**（`window.X`）的依赖，判据必须**同时**回答「谁读」与「谁写」；只答一半会得出方向相反的错误结论。
3. **「不可实施」也要有证据，而且要指出**卡在哪一层** —— 本项卡在「数学渲染」这一**前置能力**，
   不是卡在「配置归属」。⇒ 结论要精确到**层级**，否则裁决者无法判断该补哪一层。
4. **可自主推进的项要标出「缺的是开关还是能力」** —— `no_image_move_for_local` 缺的是**开关与接线**
   （底层能力 `planMove*` 已有）⇒ 工作量小得多；若只写「未实现」，下一轮会把它与「要从零做一套规则引擎」混为一谈。



## 4.136 准备实装「图片移动」时抓到：矩阵的一处 `behavior` 判定**与代码相反**（2026-10-07）

### 一、动因

§4.135 把 `no_image_move_for_local` 判为 `not-implemented`（**可自主推进**），本轮准备实装。
按 PITFALLS §4.173 的规矩，**动手前逐字读实现** —— 结果发现**默认行为本身就与 Typora 不同**，
而不是「只缺一个设置」。

### 二、一手证据

**Typora**（`main.js` 的 `shouldTriggerMove`，逐字）：

```js
shouldTriggerMove(src, target) {
  return !(("upload" === target && … ) || !src)
    && (/^\s*(https?|ftp):\/\//.exec(src)                    // src 是网络图
          ? (File.isTextBundle() || File.isTextPack() || File.option.applyImageMoveForWeb)
          : !((File.isTextBundle() || File.isTextPack() || File.option.applyImageMoveForLocal)   // 本地图
              || /^data:/.exec(src)                            // data: URI 不移动
              || (0 === src.indexOf(target) && !src.substring(target.length + 1).match(/[\\/]/g)))); // 已在目标目录
}
```

⇒ **本地图 ⇒ 看 `applyImageMoveForLocal`（默认 `true`）⇒ 复制/移动到目标目录**；
网络图 ⇒ 看 `applyImageMoveForWeb`（默认 `false`）；`data:` 与「已在目标目录内」⇒ 不移动。

**Mellow**（`packages/editor-engine/src/image/insert.ts`，逐字）：

```js
const strategy = opts.strategy ?? 'auto';
…
if (strategy === 'keep-original' || strategy === 'auto') {   // ← 默认 auto 走这里
  …return { markdown: buildImageMarkdown(rel, …), fsOps: [] };   // 不复制
}
```

⇒ **默认 `auto` 对 `kind:'file'` 走 keep-original（相对路径、不复制）**。
调用点（`image/input.ts`）**分两支**：
- **OS 级拖入**（`:199`）**不传 strategy** ⇒ keep-original（**不复制**）；
- **粘贴复制的文件 / 位图**（`:231` / `:242`）传 `copy-to-assets` ⇒ 复制。

⇒ **粘贴支一致；拖入支偏离**（Mellow 保持原路径、Typora 复制到目标目录）。

### 三、⚠️ 更正：矩阵的 `behavior: matches-default` 是错的

矩阵里 `applyImageMoveForLocal` 原为 `behavior: "matches-default"`，
`behaviorNote` 写「代码（image/insert.ts 本地图片 → **copy-to-assets**）：本地图片插入会落到 asset 目录 → 与 Typora 默认 true 一致」。
**逐字读代码后更正为 `behavior: "differs"`**：
- 错因：`behaviorNote` 说的「本地图片 → copy-to-assets」**只在粘贴支成立**；
  **拖入支**（`input.ts:199` 不传 strategy ⇒ `auto` ⇒ keep-original）**不复制** ⇒ 与 Typora 默认**相反**。
  ⇒ 也就是说：这条判定**只核了其中一个调用支**。
- 处置：`behavior` 改 `differs` + `disposition: { kind: 'undecided', ref: 'ADR-0034' }`，
  note 补「**且默认行为在「拖入」这一支与 Typora 不同**」。

### 四、处置

1. **矩阵更正**（见上）：`applyImageMoveForLocal` → `behavior: differs` + `disposition.undecided → ADR-0034`；
   另两条**复核后维持**（`applyImageMoveForWeb`：网络图直插、无 fsOps ⇒ 一致；
   `allowImageMove`：`planMoveImage`/`planMoveAll` **无门控** ⇒ 恒允许 ⇒ 与默认 true 一致；
   ⚠️ 该键在 JS 树里**无消费点** ⇒ Typora 侧由原生/菜单消费）。
2. **登记表**：`no_image_move_for_local` 的 `blockedBy` **由 `not-implemented` 改为 `adr-pending`**
   （`pendingRef: ADR-0034 Q13`）—— 补这个开关**必然要选一个默认值**：
   对齐 Typora ⇒ **改默认行为**；保持 keep-original ⇒ **默认偏离** ⇒ 必须先裁决。
3. **ADR-0034 新增 Q13**（A1 对齐 / A2 保持现状 + 登记 `D-` / A3 新增设置 + 默认对齐；**建议 A2**）：
   理由 = **复制用户的文件是「有副作用」的行为**，用户没明确要求时不应默认执行；
   且 Mellow 的 `spec §3` 已把「本地文件 → 相对路径」列为默认策略。
   ⚠️ 若采纳 A1/A3，**必须同时**处理「已在目标目录内 ⇒ 不重复复制」（Typora 有此判据）。
4. 待裁决计数 **11 问 → 12 问**。

⇒ 分布：`gap 5` 不变，但 `blockedBy` 变为 **`not-implemented 1 / precondition 1 / adr-pending 3`**
⇒ **可自主推进的只剩 1 项**（`SmartyPantsOnRendering`）。

### 五、教训

1. **「同一函数被多个调用点以不同参数调用」时，行为判定必须逐支核对** ——
   本轮的错误就是把**粘贴支**的结论当成了整条键的结论。⇒ 凡「默认参数 + 显式传参」并存的结构，
   要**按调用点列出每一支的取值**，再与上游逐支对比；只核一支会得出**方向相反**的结论。
2. **「准备动手实装」这个动作本身会暴露判定错误** —— 本轮是**要去改代码**时才逐字读实现，
   从而发现矩阵的 `behaviorNote` 与代码相反。⇒ **立项前先读实现**（不要只读文件头的注释/策略说明）。
   ⚠️ 反面同样要防：`insert.ts` 的**文件头注释**写「keep-original：本地文件 → 相对路径」是对的，
   而矩阵的 `behaviorNote` 却写成「copy-to-assets」—— **两处自述互相矛盾**，只有读代码才能判谁对。
3. **「缺一个设置」与「默认行为偏离」必须分开判** —— 前者是 `not-implemented`（可自主推进），
   后者是 `adr-pending`（**补设置时要选默认值 ⇒ 必然触碰默认行为**）。
   把它们混为一谈会让「可自主推进」的清单**虚高**。



## 4.137 把 §4.136 的教训**系统化**：给偏好矩阵的 `behavior` 断言补「可核对落点」（2026-10-07）

### 一、动因

§4.136 的错误形态是「**只核了一个调用支就下结论**」。要防它**复发**，得先问：
**这类错误为什么能长期存活？** 本轮量了一下：矩阵里 **45 条**在断言行为
（`matches-default` **37** / `differs` **8**），而其中**几乎都没有可核对的落点** ——
`differs` 8 条里只有 **1** 条引用了代码文件。
⇒ 它们是**自述**：机器核不了、下一个读者也核不了 ⇒ **判错了也没人会发现**。这就是结构性原因。

### 二、量出来的数（一手）

| 指标 | 值 |
|---|---|
| 矩阵条目 | 84 |
| 有 `note`/`behaviorNote` 的 | 78 |
| **其中引用了文件路径的** | **5** |
| `behavior` 分布 | `matches-default 37` / `differs 8` / `(无) 37` / `n/a 2` |
| `differs` 8 条里**有代码落点**的 | **1**（`applyImageMoveForLocal`，§4.136 补的） |

### 三、处置：两条判据 + 一次整改

**判据 A（硬）：`behaviorNote`/`note` 里的**仓库侧**文件引用必须能解析到真实文件。**
- 杀「死引用」（文件改名/搬走后留下的化石）。
- ⚠️ **必须排除 Typora 侧名字**（`main.js` / `frame.js` / `Preferences.*.js` / `index.html` / `content.html` / `Panel.strings`）——
  那是**上游**的文件，不在本仓；把它们算成死引用是**假阳性**
  （实测：`noLegacyMath` 就引用了上游的 `main.js`）。
  ⇒ canary 里**专门断言**这些名字走 `upstream` 分支而不是 `dead`（把边界假设钉住，PITFALLS §4.167 同法）。
- **注入验证**：把 `useTreeStyle` 的 `App.tsx` 改成 `AppRenamed.tsx` ⇒ 红（报「死引用」）。

**判据 B（棘轮）：`behavior === 'differs'` 的每一条都必须有**可核对落点**。**
- 当前 8 条里 7 条没有 ⇒ 本轮**逐条补上**（见下），棘轮直接收到 **`≤ 0`（清零）**。
- **注入验证**：去掉 `wordsPerMinute` 的落点 ⇒ 红。

**判据 C（棘轮）：`matches-default` 同样需要落点**（37 条里 34 条没有）⇒
一次性补完不现实 ⇒ 立棘轮 **`≤ 34`** 并**打印清单**（存量欠债必须可见）。
- **注入验证**：把 `allowImageMove` 的落点去掉 ⇒ 红（35 > 34）。

### 四、逐条补上的 7 个落点（每条都**读了代码**再写）

| 键 | 落点 | 代码事实 |
|---|---|---|
| `autoEscapeImageURL` | `packages/editor-engine/src/image/path.ts` | `escapeImageSrc()` 恒把 `%`/空格/`#`/`[]`/`()` 转 `%XX`（保留中文）⇒ **恒转义** |
| `mathFormatOnCopy` | `packages/editor-engine/src/clipboardCopy.ts` | 全文**无 math/SVG 分支** ⇒ 复制得到 LaTeX 源码 |
| `presetSpellCheck` | `tests/parity/typora-parity-ledger.json`（`P0-EDITOR-005`） | 词典/消费方未实现 ⇒ 无「预置拼写检查」能力 |
| `useRelativePathForImg` | `packages/editor-engine/src/image/insert.ts` | 默认分支（`keep-original`/`auto`）用 `computeRelativePath` ⇒ 恒写**相对**路径 |
| `useTreeStyle` | `apps/desktop/src/App.tsx` | `sidebarMode` 初值回落 `'files'`（目录树）⇒ 默认呈现**目录树** |
| `wordCountDelimiter` | `packages/app-core/src/wordCount.ts` | `countWords()` 一次返回多项 ⇒ **固定同时计算**，无四模式切换 |
| `wordsPerMinute` | `packages/app-core/src/wordCount.ts` | `Math.ceil(cjkChars / 300 + words / 200)` ⇒ **CJK-aware**（300 字/分 + 200 词/分） |

⇒ 这 7 条**结论本身都被复核为成立**（没有发现第二处 §4.136 式的错误）——
但**在此之前它们是不可核对的**；现在每一条都能被机器（引用可解析）与下一个人（按落点读代码）核对。

### 五、教训

1. **「判错了也没人发现」是结构性缺陷，要单独治** ——
   §4.136 抓到一处错判后，本轮问的是「**为什么它能长期存活**」，答案 = **断言没有可核对的落点**。
   ⇒ 修一处错判 ≠ 修这一类；**把「不可核对」本身变成判据**才算修了一类。
2. **棘轮要按「条数多少」分档** —— `differs` 只有 8 条 ⇒ **一次性补完并清零**；
   `matches-default` 有 37 条 ⇒ 立棘轮 + 打印清单。**同一条规则在不同规模下处置不同**，
   硬卡 37 条会让人绕过判据（而不是去补落点）。
3. **「上游文件」必须从死引用判据里排除** —— 否则 `main.js` 这类**合法引用**会被报成死引用
   （实测就报了）。⇒ 排除规则要**写进 canary**（断言它走 `upstream` 分支），
   否则下次有人「顺手收紧」就会把假阳性放回来。
4. **补落点时必须读代码** —— 7 条里每条都是先读实现再写落点；
   若只是「按印象补一个文件名」，那就是把**不可核对**换成了**看起来可核对**（更危险）。



## 4.138 把 `matches-default` 的 34 条落点**补齐清零** + 修正落点判据的「同名文件」缺陷（2026-10-07）

### 一、动因

§4.137 立了两把棘轮：`differs ≤ 0`（已清零）、`matches-default ≤ 34`。本轮把后者**逐条补齐并清零**，
同时**修正判据自身的一处缺陷**。

### 二、⚠️ 先修判据：`basename` 解析会**解析到错的文件**

§4.137 的判据用「basename → 存在与否」解析引用。本轮实测发现**同名文件会串**：
某条的 `image/host.ts` 被解析成 `packages/app-core/src/extensions/host.ts`
（本仓有两个 `host.ts`）⇒ 判据**会把引用"解析"到一个完全不相干的文件**，看起来还通过了。

⇒ 改为**后缀匹配 + 歧义检测**：
- 带目录的引用（`image/host.ts`）⇒ 要求某文件的**相对路径以它结尾**；
- 裸 basename ⇒ 若本仓**唯一** ⇒ `ok`；若**不唯一** ⇒ **`ambiguous` ⇒ 报错并要求写全路径**。
⇒ canary 补两条锁这个边界：`host.ts` 必须判 `ambiguous`、`image/host.ts` 必须判 `ok`。

### 三、34 条逐条补齐（每条都**读了代码**再写）

按模块归并（都是先确认该模块确实拥有/缺失所述行为）：

| 落点模块 | 覆盖的键 | 核对到的事实 |
|---|---|---|
| `packages/editor-engine/src/image/host.ts` / `image/insert.ts` | `allowImageUpload` / `applyImageMoveForWeb` | `uploadImages` 惰性读 `__MELLOW_IMAGE_UPLOAD__`；`kind:'url'` 直插、无 `fsOps` |
| `packages/editor-engine/src/smartPunctuation.ts` | `convertSmartOnRender` / `remapUnicodePunctuation` / `userQuotesArray` | 只在 `inputHandler` 改写；无 Unicode 重映射；引号对固定 |
| `packages/editor-engine/src/clipboardCopy.ts` | `copyMarkdownByDefault` / `lineWiseCopyCut` | 渲染后 text/plain+html+rtf；空选区返回 `null` |
| `packages/editor-engine/src/math.ts` | `autoNumberingForMath` / `htmlMath` / `legacyInlineMathParse` | 只解析+渲染 CHTML/SVG；无编号、无 HTML 数学、无 legacy 分支 |
| `packages/editor-engine/src/typewriterMode.ts` | `scrollWithCursor` | `computeTypewriterScrollTop` 是**独立手动模式** |
| `packages/editor-engine/src/mdLink.ts` | `noAutoLink` | `scanMdLinks` 只扫**显式** `[..](..)` |
| `packages/editor-engine/src/safeHtml.ts` | `hideBrAndLineBreak` | 内联 HTML live rendering 的 owner，**无隐藏 `<br>` 原文** |
| `packages/editor-engine/src/emoji.ts` | `monocolorEmoji` | 渲染**彩色** Emoji，无单色分支 |
| `packages/export/src/html/markdown.ts` | `ignoreLineBreak` | `breaks: ctx.preserveLineBreaks === true` ⇒ 默认保留为空格 |
| `packages/editor-core/CoreEditor/src/modules/commands/index.ts` | `headingStyle` / `olStyle` / `ulStyle` / `prettyIndent` | `toggleHeading` ⇒ `toggleLineLeadingMark('#', level)`；`toggleBullet` 回落 `'-'`；只改写列表标记 |
| `packages/editor-core/CoreEditor/src/styling/nodes/invisible.ts` | `expandSimpleBlock` | 标记隐藏是**默认行为**，无「简单块展开」开关 |
| `packages/editor-core/CoreEditor/src/@vendor/lang-markdown/markdown.ts` | `strictMarkdown` / `strictNumberStartOnNewLine` | 用的是**宽松** markdown 语言包 |
| `packages/app-core/src/fileTree.ts` | `sortType` / `treeNoGroup` | `DEFAULT_FILE_TREE_OPTIONS` = natural/asc/folderFirst；层级节点 |
| `packages/app-core/src/document.ts` | `defaultExtension` | `documentSuggestedName()` 只产出 `.md` |
| `packages/app-core/src/recovery.ts` | `noUnsavedDraftsBackup` | `RecoveryService` 提供恢复快照 |
| `packages/settings/src/index.ts` | `defaultImageStorage` / `sidebarWidth` | 无「默认存储位置」项；侧栏默认 270 |
| `apps/desktop/src/App.tsx` | `listNoGroup` | `fileListRecursive=true` ⇒ 分组 |
| `apps/desktop/src/host/searchServices.ts` | `fileSearchCaseSensitive` / `fileSearchWholeWord` | 固定传 `false` |
| `tests/parity/typora-parity-ledger.json` | `autoCorrectMisspell` / `spellcheckForCodeAndLink` | 台账 `P0-EDITOR-005`（拼写能力未实现） |
| `packages/editor-engine/test/math.test.ts` | `noLegacyMath` | 覆盖四种定界符（§4.123 改判依据） |

⇒ 棘轮收到 **`≤ 0`（清零）** ⇒ 现在 **45 条行为断言全部有可核对落点**（`differs` 8 + `matches-default` 37）。

### 四、⚠️ 如实声明：6 条「实测（探针）」类断言的**复现性有限**

`headingStyle` / `olStyle` / `ulStyle` / `hideBrAndLineBreak` / `noAutoLink` / `strictNumberStartOnNewLine`
的原始证据是**临时探针**（当时读了 DOM / 命令输出），**没有把探针脚本提交进仓库**（实测：`tests/` 下搜不到）。
⇒ 本轮给它们补的落点是**产生该行为的模块**（可被下一个人按代码复核），
但**「当时的实测」本身不可一键复现**。这一点已写进各自的 note，不当作「已验证」使用。

### 五、教训

1. **判据自己也会有「同名文件」这类缺陷** —— 本轮修的不是数据而是**判据**：
   basename 解析在有两个 `host.ts` 的仓库里会**静默解析到错的文件**。
   ⇒ 「按名字找文件」的判据，必须处理**重名**（唯一才可用 basename，否则要求全路径），并**用 canary 锁住**。
2. **「补落点」不是格式整理，是一次复核** —— 34 条里每条都先读代码再写落点；
   若只是把 prose 里的文件名加个反引号，就是把**不可核对**换成**看起来可核对**（§4.137 教训 4 的延续）。
3. **「实测（探针）」类断言要标注复现性** —— 没有 committed 探针的实测，
   其落点只能指向**模块**（供人复核），**不能**宣称「已可复现」。
   ⇒ 凡「实测/探针」措辞，note 里必须写清**探针在不在仓库里**。



## 4.139 差距评估：矩阵 47 条 `gap` 按「缺设置 / 缺能力」分档 + 实装图片两条（2026-10-07）

### 一、评估方法（把「还缺 47 条」拆成可判断的两类）

对矩阵的 **47 条 `gap`** 逐条读 note/behaviorNote 并分档：

| 档 | 条数 | 含义 |
|---|---|---|
| **A. 缺设置（能力已在）** | **9** | 底层行为已实现，只差暴露开关 ⇒ **最便宜** |
| **B. 缺能力/实现** | 14 | 需要新实现 |
| **C. 其它（含「默认一致但无设置」等）** | 24 | 需逐条细看 |

A 档 9 条：`allowImageMove` / `allowImageUpload` / `applyImageMoveForLocal` / `applyImageMoveForWeb` /
`defaultExtension` / `fileSearchCaseSensitive` / `mathFormatOnCopy` / `sidebarWidth` / `sortType`。

⚠️ **分档不能只看措辞** —— 本轮对 A 档逐条**读代码**后发现两类偏差：
- `applyImageMoveForLocal` ⇒ 其实**默认行为偏离**（§4.136）⇒ 应归「待裁决」，**不是**可自主做；
- `applyImageMoveForWeb` ⇒ note 写「未作为设置暴露」，但实测**底层能力已在**
  （`packages/app-core/src/imageFileOps.ts` 的 `downloadRemoteImage` / `planDownloadRemote`）
  ⇒ 真正缺的是「**插入远端图时按偏好自动下载**」的**接线** ⇒ 仍是「可自主做」，但**性质不同**。

⇒ 结论：A 档 9 条里，**2 条待裁决**（`applyImageMoveForLocal` 见 Q13、`mathFormatOnCopy` 见 Q8）、
**7 条可自主做**；其中本轮挑**同族且最干净的两条**先做。

### 二、实装：`allowImageMove` + `allowImageUpload`（同族「图片」，都是**单点门控**）

| 项 | Typora 真值 | Mellow 的对应物 | 改动 |
|---|---|---|---|
| `allowImageMove` | `DEFAULT_OPTIONS` 里默认 **true**（**非面板键**，由菜单/原生消费） | 两个移动入口：`runBatch('moveAll')` 与单图 `action === 'move'` | 新增 `image.allowMove`（toggle，**默认 true**）⇒ 关闭时**禁用并给状态提示**（`msg.imageMoveDisabled`），不静默无反应 |
| `allowImageUpload` | 面板 label **"Allow upload images automatically based on YAML settings"**，`checked: !!getValue(...)`（未设 ⇒ 关） | `App.tsx` 里 `__MELLOW_IMAGE_UPLOAD__` 的**注入** | 新增 `image.allowUpload`（toggle，**默认 true**）⇒ 关闭 ⇒ **不注入** ⇒ engine 的 `uploadImages` 全 null ⇒ 回退本地插入（等价 `upload: 'never'`） |

⚠️ **「默认 true」是否改变了默认行为？** —— **没有**：
- `image.allowMove`：默认 true = 现状（移动命令本来可用）；
- `image.allowUpload`：它只是**门控**，真正决定行为的是 `image.uploadService`（默认 `none`）
  ⇒ **有效默认 = 不上传**，与 Typora 的默认（面板未设即关）**一致**。

⇒ 矩阵：`implemented 31 → **33**`、`gap 47 → **45**`。

### 三、⚠️ 本轮自己踩的坑（被既有判据当场抓住）

把这两条的 `status` 写成 **`equivalent`** ⇒ **判据立刻报错**：
「偏好项矩阵非法条目（2）：… status=equivalent」+「非 gap 条目不应带 behavior」。
**错因**：把**面板独有面登记表**的词表（`equivalent` / `gap` / `not-applicable` / `unverified`）
用到了**偏好矩阵**的词表（`implemented` / `gap` / `not-applicable`）上 —— **两个登记处的词表不同**。
⇒ 已改回 `implemented`，并把证据挪进 `note`（`behavior` 只属于 `gap` 条目）。
⇒ **这是「两个登记处」这一设计本身的第一个摩擦点**，如实记录。

### 四、护栏（注入验证 3/3）

`verify-settings-contract.mjs` 新增：两项必须 `toggle` 且**默认 true**、`App.tsx` 必须用
`readBoolSetting('<id>', true)` 读取、**三个门控点必须真的存在**（单图移动 / 批量移动 / 上传注入）、
关闭时必须有**可见反馈**（`msg.imageMoveDisabled`）；canary 用同一份正则做正/负样本。

**注入验证 3/3**：① 默认值改 `false` ⇒ 红；② 去掉「移动全部」的门控 ⇒ 红；③ 去掉上传门控 ⇒ 红。全部还原后通过。

### 五、教训

1. **差距评估要先分档再动手** —— 「还缺 47 条」是不可执行的；拆成「缺设置 9 / 缺能力 14 / 其它 24」
   才看得出**哪一档最便宜**。但**分档不能只看措辞**：9 条里有 2 条经读代码后**改判**。
2. **「有效默认」≠「开关的默认值」** —— `image.allowUpload` 取 `true` 看着像「改变了默认」，
   但**真正决定行为的是另一个设置**（`image.uploadService`，默认 `none`）
   ⇒ 判「默认行为是否改变」必须看**整条取值链**（PITFALLS §4.173 的同一教训，这里是它的第二次应用）。
3. **两个登记处有不同的词表，这是设计摩擦点** —— 本轮被既有判据当场抓住；
   ⇒ 跨登记处搬条目时，**先查目标登记处的词表**（判据会拦，但别依赖它拦）。



## 4.140 差距评估的第二刀：**3 条「缺口」其实已被 D 表裁决为有意差异**（2026-10-07）

### 一、动因

§4.139 把 47 条 `gap` 分成三档，本轮准备从 A 档（缺设置）继续。
A 档里 `sortType` 的 note 是「未作为设置暴露」—— 但**Mellow 已经有排序菜单**（§4.139 顺带发现）。
⇒ 顺着这条线去查 **D 表**，发现**不止一条**。

### 二、发现：**3 条矩阵条目与 D 表裁决矛盾**

| 键 | 矩阵原判 | D 表裁决原文 | 矛盾点 |
|---|---|---|---|
| `sortType` | `gap`（未作为设置暴露） | **D-AG**（2026-09-30）：「保留 Mellow 形态（4 个可勾选键 + 升/降序），不改为 Typora 的 8 条平铺」·「**功能已等价且有护栏**」（`verify-sidebar-contract.mjs` 锁 4 个排序键） | D-AG 已裁决**形态差异为有意**，且声明**功能等价** ⇒ 不是缺口 |
| `useTreeStyle` | `gap`（「文件树样式（树形/平铺）未实装」） | **D-AK**（2026-10-07 补登记）：「保留 Mellow 默认（FileTree）」·「**该差异是产品默认呈现的选择，不是「缺一个开关」**；Mellow 的「侧栏默认视图」设置项提供等价的可配置性」 | D-AK 明确说**不是缺开关** ⇒ 不是缺口 |
| `wordsPerMinute` | `gap`（「阅读速度估算**未实装**」） | **D-AO**（2026-10-07 补登记）：「保留 Mellow 的 CJK-aware 估算」——Mellow 的 `packages/app-core/src/wordCount.ts` **有**估算（中文 300 字/分 + 英文 200 词/分），只是数值与 382 不同 | 「未实装」**与事实相反**（它实装了）⇒ 不是缺口 |

⇒ **差距评估因此虚高 3 条**（47 条里 3 条不是缺口）。

### 三、为什么能长期存活

1. **D 表是「裁决的唯一可发现处」，但矩阵的 `status` 判定没有任何判据去对照 D 表** ——
   两处都是「自述」，谁也不知道对方写了什么；
2. ⚠️ **机械判据「note 引用 `D-xx` ⇒ status 必须是 `implemented`」会误报** ——
   实测：`sidebarWidth` 的 note 提到 **D-AD**，但 **D-AD 只裁决「侧栏最大宽度 480px」**，
   **没有**裁决「要不要设置项」⇒ 该条记 `gap`（缺设置项）**与 D-AD 不矛盾**。
   ⇒ **「引用某 D」≠「被该 D 覆盖」**：D 可能只裁决该键的**某一面**。

### 四、处置

1. **三条改为 `implemented`** 并**引用对应 D**（note 里写明「此前误记 gap」与矛盾点）。
   ⇒ 矩阵：`implemented 33 → **36**`、`gap 45 → **42**`。
2. **新增机器可读字段 `dCarrier`**（= 「该键的行为由某条 D 承载」），并落判据（CI ⑭）：
   - 形态必须是 `D-<1~2 个字母>`；
   - **声明了 `dCarrier` ⇒ `status` 必须是 `implemented`**（D = 已裁决的**有意差异**，不是缺口）；
   - 该编号必须在 `master-plan` 里有**首格声明行**（表格首格形如「竖线 + 两个星号 + 编号」）—— 防「引用了不存在的裁决」；
   - 覆盖型下限（≥ 3）+ **打印清单**（当前 `sortType→D-AG` / `useTreeStyle→D-AK` / `wordsPerMinute→D-AO`）；
   - canary 四向（含「status=gap 必须被判违规」与「无声明行的编号必须被判违规」）。
3. **不**把「note 引用 D」当作判据（会误报，理由见上）—— **「引用」与「覆盖」分开**：
   覆盖关系必须**显式声明**（`dCarrier`），不能从散文里推断。

### 五、教训

1. **差距评估的第一步应是「先扣掉已被裁决的有意差异」** ——
   本轮 3/47 条是**已被 D 表裁决为有意**的差异，却被记成缺口 ⇒ **评估虚高**。
   ⇒ 数「还缺多少」之前，先问「**这里面有多少已经裁决过了**」。
2. **「引用某条裁决」≠「被该裁决覆盖」** —— D 可能只裁决该键的**某一面**
   （D-AD 只裁决上限，不裁决「要不要设置项」）。
   ⇒ 覆盖关系必须**显式声明**（新字段），**不能**从「note 里出现过 `D-xx`」推断；
   机械地从散文推断会**误报**（实测）。
3. **两个登记处之间的矛盾（D 表 ↔ 矩阵）没有任何判据** ——
   它是「PITFALLS §4.143 相邻条目互相矛盾」的**跨登记处版本**。
   ⇒ 本轮只落了「**声明了覆盖关系之后**的自洽性」，**「该声明哪些」仍需人逐条对照** ——
   这一点已如实登记（不宣称已全覆盖）。



## 4.141 **反向对照**：24 条 D 逐条对矩阵 —— 结果**干净**（首次），并把它可机械化的那一半落成判据（2026-10-07）

### 一、动因：§4.140 只做了**正向**对照

§4.140 是**从缺口清单出发**（`sortType` 的线索 → 查 D 表 → 又找到 2 条）—— 那只能发现**顺着线索**的矛盾。
本轮做**反向**：**从 D 表出发**（24 条声明行）逐条问「它对应矩阵里的哪个键？状态一致吗？」。

### 二、24 条 D 的分类结果（**无新的 status 矛盾**）

| 类别 | D 编号 | 核对结果 |
|---|---|---|
| **点名了矩阵键** | `D-AK`→`useTreeStyle`、`D-AO`→`wordsPerMinute` | ✅ 两条均 `implemented` + `dCarrier` 指向它（§4.140 已修） |
| 主题是 **UI / 菜单 / 行为决策**（不映射矩阵键） | `D-N` `D-O` `D-P` `D-A` `D-B` `D-C` `D-D` `D-E` `D-F` `D-G` `D-H` `D-I` `D-J` `D-K` `D-L` `D-M` `D-AH` `D-AI` `D-AJ` | ✅ 无对应矩阵键 ⇒ 无需一致 |
| 映射到**面板独有面**（非矩阵） | `D-AL`→`piclistAppPath`、`D-AM`→`runCommand` | ✅ 登记处里分别是 `equivalent` / `not-applicable`，均引用 D |
| 与某矩阵键**相关但不同键** | `D-AA`（Use Image Root Path）vs `useRelativePathForImg` | ✅ **已在 §4.121 就地更正**（见下面的「差点做重复劳动」） |

⇒ **24 条逐条核完，没有发现新的矛盾** —— 这是本程序里**第一次「对照回来是干净的」**（前几轮的对照都至少抓到一条）。

### 三、⚠️ 差点做重复劳动：准备「澄清 D-AA」时发现**它已被更正过**

本轮读 `D-AA` 时发现它的理由句写「与 Typora 该选项默认态一致」，而矩阵的 `useRelativePathForImg`
结论是「Typora 默认写**绝对**路径」⇒ 看起来矛盾，我**准备在 D-AA 里加一句澄清**。
动手前先**通读该行** —— 发现行尾已经有：

> **⚠️ 2026-10-07 更正（审计 §4.121）：上面那句「与 Typora 该选项默认态一致」站不住，已就地改为如实表述。**
> … ⇒ **Typora 默认写的是「绝对」路径**，而 Mellow 同根时写**相对**路径 ⇒ 两者**默认行为不同**…
> **是否把 Mellow 改成写绝对路径**属产品决策，已登记进 **ADR-0034 Q7**（Proposed）。

⇒ **它早就被更正过**（连 ADR 载体都补好了）。我差点重复一次「澄清」，而且**会写出与更正块重复的内容**。
⇒ 教训见「教训 2」。

### 四、处置：把反向对照里**可机械化**的那一半落成判据

反向对照里，**只有「D 表正文点名了某个矩阵键」这一种是可机械判定的** ⇒ 落判据（CI ⑭）：
- 从 D 表的**主题格 + 裁决格**抽 token，**只认恰好是矩阵键的驼峰标识符**（避免把普通英文单词当键名）；
- 该键必须 `status === 'implemented'` **且** `dCarrier` **指向该 D**；
- 下限 2（当前 `D-AK→useTreeStyle` / `D-AO→wordsPerMinute`）+ **打印清单**；canary 三向。

⚠️ **边界（如实声明）**：本判据**只覆盖「点名」的 D**；像 `D-AG`（主题是「侧栏排序菜单的形态」、**不点键名**）
那样的**覆盖不了** ⇒ 仍需人对照。**不得**把本判据读作「D 表与矩阵已完全一致」。

**注入验证 2/2**：① 点名键的 `dCarrier` 指向别的 D ⇒ 红；② 点名键改回 `gap` ⇒ 红（由 §4.140 的覆盖下限先拦）。

### 五、教训

1. **评估要做「正向 + 反向」两半** —— 正向（缺口 → 裁决表）只能发现**顺着线索**的矛盾；
   反向（裁决表 → 缺口）才能覆盖**你没想到的线索**。本轮反向对照**结果干净**，
   但**只有做了才知道**；不做就会把「没查」当成「没问题」。
2. **改文档前先通读那一行 —— 它可能已经被更正过** ——
   D 表里已有**就地更正块**（`⚠️ … 更正（审计 §4.xx）…`），那是「**这段已被审过**」的信号。
   我差点在 `D-AA` 上重复一次澄清，写出与既有更正块重复的内容。
   ⇒ **就地更正块 = 已审标记**；看到它要先读，再决定要不要动。
3. **「可机械化」的部分要落成判据，不可机械化的部分要如实声明边界** ——
   本轮只机械化了「点名」的情形，并明确写出「不点名的仍需人对照」——
   否则下一个人会以为「判据绿了 = D 表与矩阵一致」。
4. **「对照回来是干净的」也是一个结论，要写下来** ——
   否则下一次评估又会重做一遍这 24 条；写下来它就成了「已核对」的基线。



## 4.142 实装「插入远端图时自动本地化」（Typora `applyImageMoveForWeb`）+ 一处判据缺陷被注入验证**当场抓到**（2026-10-07）

### 一、动因

§4.139 把矩阵 47 条 `gap` 分档后，`applyImageMoveForWeb` 被列为「**可自主实施**」：
Typora 默认 **false**（`DEFAULT_OPTIONS`）⇒ **默认行为与 Mellow 一致**（都直插、不下载），
所以把它做成设置**不会改变现状**。而 Mellow 此前只有**手动通道**
（`packages/app-core/src/imageFileOps.ts` 的 `downloadRemoteImage` / `planDownloadRemote`，
由菜单「图片：下载远程到 asset 目录」触发），**插入**远端图时不会自动下载。

### 二、实现（跨 4 层）

| 层 | 落点 | 内容 |
|---|---|---|
| 设置 | `packages/settings/src/index.ts` | `image.downloadRemote`（toggle，**默认 false**） |
| 宿主注入 | `apps/desktop/src/App.tsx` | `__MELLOW_IMAGE_DOWNLOAD_REMOTE__ = () => readBoolSetting('image.downloadRemote', false)`（**惰性**读 ⇒ 改设置即时生效） |
| engine 消费 | `packages/editor-engine/src/image/host.ts` | `shouldDownloadRemoteImages()`（读注入探针）+ `downloadFile(url, to)` |
| 行为 | `packages/editor-engine/src/image/insert.ts` | `kind:'url'` 分支：宿主开启 **且文档已保存** ⇒ `mkdir` + `download`，src 改写为本地相对路径 |

Rust 侧**复用既有实现**：`apps/desktop/src-tauri/src/fs.rs` 的 `download_remote_impl` 提升为
`pub(crate)`，`apps/desktop/src-tauri/src/bridge.rs` 新增 `"download"` 分支 ——
与「下载远程图片」菜单命令**走同一条实现**（不新增第二条下载路径）。

**一处刻意加固**：`download_remote_impl` 是「写临时文件再 `rename`」⇒ 会**覆盖**同名目标。
故插入前先 `host.exists(target)` 探测，冲突则依次试 `-1`/`-2`…（防用户已有文件被**静默覆盖**）。

### 三、判据（跨 4 层，缺任一即功能不存在）

`verify-settings-contract.mjs` 新增一段：① 设置必须是 toggle 且**默认 false**；
② 宿主必须注入且用 `readBoolSetting('image.downloadRemote', false)`；③ engine host 的
`shouldDownloadRemoteImages` 必须**真的**读到注入探针；④ `insert.ts` 的 url 分支必须被它门控
且产出 `download` 操作、`executeFsOps` 必须处理 `download`。

**为什么必须跨 4 层**：只锁一处会出现三种**静默失效**（设置没人读 / 注入了没人问 / 问了没人消费），
三者**都不报错**。

### 四、⚠️ 注入验证当场抓到一处判据缺陷（本轮最有价值的部分）

首版第 ③ 条写的是 `/shouldDownloadRemoteImages/` —— **裸标识符**。
注入验证（把桥接 host 的属性改名为 `shouldDownloadRemoteImagesX`）⇒ **判据仍然绿**。
原因：`shouldDownloadRemoteImages` 是 `shouldDownloadRemoteImagesX` 的**子串**。

⇒ 收紧为**定义形态 + 同一函数体内读到探针**：
`/shouldDownloadRemoteImages:\s*\(\)\s*=>\s*\{[^}]*__MELLOW_IMAGE_DOWNLOAD_REMOTE__/`，
并补一条**专门断言「改名不被命中」**的 canary（PITFALLS §4.193）。

**注入验证 5/5**（全部「改坏 ⇒ 红」）：① 默认值改 true；② 注入点改名；③ host 属性改名；
④ `insert.ts` 门控摘掉；⑤ `executeFsOps` 丢掉 `download` 分支。还原后复跑**绿**。

**教训**：**「匹配标识符」在改名场景下会静默退化** —— 凡判据断言的是「某个名字存在」，
就必须锚定它的**语法位置**（定义/调用形态），而不是名字本身；且 canary 的**负样本必须就是「改名」**，
否则这条判据唯一的失效模式永远不会被 canary 覆盖。

### 五、矩阵

`applyImageMoveForWeb`：`gap` → **`implemented`**（`mellow: ["image.downloadRemote"]`），
并按词表规则**移除 `behavior`**（`behavior` 只属 `gap`）。
分布：`implemented 36 → 37` / `gap 42 → 41`。

**如实声明两点差异**（均为有意，写在矩阵 `note` 里）：
① Mellow 额外要求**文档已保存**（无 `docDir` 时算不出相对路径 ⇒ 回退直插）；
② Typora 的 `shouldTriggerMove` 对 web src 直接返回该偏好，Mellow 另**保留手动通道**（两者并存）。

### 六、测试

- `packages/editor-engine`：**79 suites / 1308 tests 全过**。
  其中 `test/image-insert.test.ts` 的 `makeHost` 扩展为
  `makeHost(docPath, { downloadRemote?, existing? })` + **5 个用例**：
  默认直插 / 开启且已保存 ⇒ `mkdir`+`download`+相对 src / 未保存 ⇒ 回退直插 /
  目标已存在 ⇒ `-1` / `executeFsOps` 调 `downloadFile`；
  `image-engine-api` / `image-widget` / `image-input` 三个测试文件补桩。
- `apps/desktop/src-tauri`：`cargo test` **81 + 16 + 4 全过**。
  ⚠️ **首跑曾出现 2 个 `spellcheck::mac` 失败**（`NSSpellServer … timed out`）——
  根因是**与后台的长跑 jest 并发**导致 `NSSpellServer` 超时；单独跑 `spellcheck::mac::tests`
  **6/6 通过**，且把改动 `stash` 后在 HEAD 上跑**也是绿的** ⇒ **与本轮改动无关的环境噪声**。
  （同 PITFALLS §4.134「长跑套件不得与注入实验并发」—— 这次是「不得与**性能敏感的系统服务**并发」。）
- `apps/desktop`：`tsc --noEmit` 通过（该包无 jest）。

### 七、残留（如实登记）

1. **同一批多个同源 URL** 仍可能重名 —— 去重只对**文件系统**做（`host.exists`），
   不对**同一批内**已分配的名字做；边界情形，已登记。
2. **未真机验证**：下载走的是既有 Rust 实现（已被「下载远程图片」菜单使用），
   但「插入时自动下载」这条**新接线**未做真机 e2e。


## 4.143 施工中发现：`§4.N` 在本仓有**两个命名空间**，且 `PITFALLS.md` 的标题有**两种格式** —— 我差点误报「死引用」（2026-10-07）

### 一、怎么撞上的

写 §4.142 前做了一次「审计文档里的 `§4.N` 引用是否都能解析」的普查，结果报出 **7 个「死引用」编号**
（`4.142`×2 / `4.143` / `4.154` / `4.167` / `4.173` / `4.1` / `4.2`；普查时它们都写作 `§` + 数字），
其中 `4.142` 恰好与我要新建的小节**同号** —— 差一点按「死引用」去改它，
并且差一点据此写一条「引用必须可解析」的护栏。

**回查后发现：7 个里 5 个根本不是死引用** —— 它们指向的是 **`PITFALLS.md`** 的同号小节
（PITFALLS 的 `4.143` =「两个相邻条目互相矛盾可以在没有任何判据的情况下长期存活」等，**语义逐条对得上**）。

### 二、根因（两条，都可核对）

1. **`§4.N` 有两个命名空间**：审计文档（本文件）的小节是 `## 4.N`（普查当时 1–141，本轮新增两节后为 1–143）；
   `PITFALLS.md` 的小节**也是** `## 4.N`（普查当时 1–192，规范化并归位后为 1–194）。
   两者在 **1–141 区间完全重叠** ⇒ 裸写一个 `§4.N` 形式的引用**无法判定**指哪一份。
2. **`PITFALLS.md` 的标题有两种格式**：`4.1`–`4.82` 的标题不带 `§`，
   `4.83`–`4.192` 的标题带 `§`。边界正好落在 `4.83` —— 那条的标题自己写着
   「**原记在 `MEMORY.md`，因体积超限移入本文件**」⇒ **一次批量迁移把标题风格带偏了**。
   用 `^#{2,4} 4\.(\d+)` 扫，只数到 82 条，于是把 `4.142` 等判成「全仓无定义」。

**顺带发现的第二处**：同一次普查发现 **`4.130` 有两个同名 h2**（第二个是「补记（同一天第二次犯）」，且被放在了 `4.134` 与 `4.135` 之间 —— 既重号、又错位）。

### 三、处置

1. **规范化 `PITFALLS.md` 标题**：带 `§` 的标题一律去掉 `§`（**111 处**），全文件统一为一种格式；
   校验结果：**192 个标题、编号 1–192、无重复、无缺号、残留带 `§` 的标题 0**。
2. **归位重号条目**：把 `4.130 补记` 从 `4.134`/`4.135` 之间**移回 `4.130` 之下**并降为 `###`；
   编号连续性恢复为 **194 条（1–194）**。
3. **消除已产生的歧义**：把审计文档里**指向 PITFALLS 的 7 处裸引用**加上 `PITFALLS ` 限定词
   （`4.142`×2、`4.143`、`4.154`、`4.167`、`4.173`）——
   否则本轮新建 `## 4.142` 之后，那两处裸引用会从「无法解析」变成「**可解析但指错**」（更危险）。
4. **如实登记未处置项**：审计文档里还有**指向其它文档**的裸引用
   （`4.1`/`4.3` 指三平台 runtime qualification 文档、`4.2`/`4.3` 指 master-plan 与台账）。
   本轮**不擅自**给它们加限定词 —— 「引用约定」是**跨文档**的选择，改动面覆盖全仓文档。
   **建议约定**（留待裁决）：引用 `PITFALLS.md` 写 `PITFALLS ` + 编号；引用本文档写 `审计 ` + 编号；
   引用其它文档写其文件名。

### 四、教训

1. **「扫不到」先怀疑量具，再怀疑事实** —— 本轮两次差点据此下结论（先是「死引用」，
   再是「`PITFALLS` 只有 82 条」）。**同一个编号空间被两个文件共享**时，
   「解析不到」的最可能原因是**扫错文件**，不是「引用坏了」。
2. **标题格式漂移会让所有基于标题的工具静默漏数** —— 带 `§` 与不带 `§` 的标题
   在人眼里是同一个编号、在正则眼里是两个东西。**批量迁移/追加时最容易带偏风格**。
3. **新建编号前先查该编号是否已被别的文件占用** —— 本轮 `4.142` 在 `PITFALLS.md` 里已存在；
   若未察觉就新建同名小节，会**加深**这两个命名空间的重叠。
4. ⚠️ **本节自己又踩了一次「说明文字被扫描器当成引用」**（**本仓第三次**，见 PITFALLS §4.190 / skill §120）：
   本节第一版把 7 个编号按 `§4.N` 的原样写进了**举例**里 ⇒ 复跑普查时它们**被当成真引用**
   （13 处「不可解析」里有 11 处来自本节自身）。⇒ **举例/引用报告时必须用不会被判据识别的写法**
   （本节现改为只写编号数字，不带 `§` 前缀）。**这条不是理论风险 —— 它每次都发生在「我正在写这条教训」的那一轮。**
5. **写进文档的「当前最大值」在同一个提交里就会过期** —— 本节初稿写「当前 1–141」，
   而同一提交新增了 `4.142`/`4.143` ⇒ 落笔即过期。⇒ 凡引「当前」数字，**要么带时点（「普查当时」），
   要么不写**（同 §4.140 的「同一组数值多处维护」）。
6. **`PITFALLS.md` 在 `.workbuddy-ai/` 下、不进仓库 ⇒ 没有任何 CI 护栏能守它** ——
   这类「本地记忆」的卫生只能靠**每次动手时的一致性**，所以**格式统一**比在仓库文档里更重要。
   （对比：仓库内文档的同类问题可以落成判据，见 §4.76/§4.80。）


## 4.144 `matches-default` 的「落点」只被查了**文件是否存在** —— 人工核 33 条抓到 1 条**假断言**（2026-10-07）

### 一、动因：上一轮留下的洞

§4.138 给 `matches-default` 批量补了「可核对落点」，而落点判据只查**引用的文件是否存在**
（外加排除上游文件名 / 死引用 / 歧义引用）⇒ **断言本身可以为假而护栏全绿**。

### 二、怎么发现的（读条目，不是读判据）

上一轮登记的可自主候选里有 `sidebarWidth`。按 PITFALLS §4.173 的规矩**动手前先读条目**，
发现**条目自相矛盾**：
- `note`：「侧栏宽度可拖拽…但**未作为设置项持久化**」
- `behaviorNote` 的落点：「`packages/settings/src/index.ts` —— 侧栏宽度设置默认 **270**」

**取证（三条，都可核对）**：
1. `packages/settings/src/index.ts` 里**没有** `sidebarWidth` / `sidebar.width`（0 命中）；
2. `mellow.sidebar.width` 是**显式登记的例外** —— `verify-settings-contract.mjs` 的
   `NON_SCHEMA_STORAGE_KEYS` 写着「侧栏宽度（拖拽产生的几何，不是偏好）」；
3. 270 这个常量在 `apps/desktop/src/App.tsx` 的 `SIDEBAR_DEFAULT_WIDTH`（配 160/480 范围校验）。

⇒ `note` 对、**`behaviorNote` 的落点断言为假**（文件存在 ⇒ 判据放行）。

### 三、逐条人工核对（不是抽样）

按「**每条期望都应由一次实跑确认**」的规矩，把**全部** `matches-default` 条目取出逐条核对：
**33 条 → 32 条正确、1 条为假**。
核对手法：把落点断言里的**关键符号**在该文件里 `grep`
（`documentSuggestedName` / `caseSensitive` / `preserveLineBreaks` / `scanMdLinks` /
`toggleHeading` / `computeTypewriterScrollTop` / `parseMathSpans` / `emojiSource` …）。

**⚠️ 一次假阳性如实记录**：`autoEscapeImageURL` 我按**自己猜的**符号（`escapeUrl` / `autoEscape`）去查 ⇒ 0 命中；
**读原文**才发现落点写的是 `escapeImageSrc()`，**该符号存在** ⇒ 是**我的核对方法**有问题，不是条目有问题。
**教训**：核对要用**落点自己写的符号**，不能用自己猜的近义词 —— 否则会把**正确的条目**判成错的。

**⚠️ 样本边界如实声明**：§4.138 的标记是**自由文本**（`【代码落点（2026-10-07，审计 §4.138）】`），
而我在更正 `sidebarWidth` 时**改动了标记本身**（加了「；落点更正于 §4.144」）
⇒ 按**整串**匹配会少数 1 条。⇒ 计数要按**前缀**。另发现 **2 条** `matches-default`
（`gitlabMath` / `noEmojiAutoComplete`）**不带 §4.138 标记**（它们的落点来自更早的轮次）—— 已**一并核对**。

### 四、⚠️ 我**实测并否决**了两条更严的判据（本轮的重要产出）

想给「落点是否支持断言」加判据，试了两条，**都不可用**：

| 候选判据 | 受检 | 结果 | 否决理由 |
|---|---|---|---|
| 「落点里**所有**反引号标识符都要能在落点文件里找到」 | 22 条 | **4 条违规** | **4/4 全是误报** —— Typora 侧符号（`shouldTriggerMove` / `getValue`），以及「该文件里**没有** X」这种**否定式**断言里的 X |
| 「落点里**至少一个**反引号标识符能在落点文件里找到」 | 49 条 | **18 条零命中** | 例外表会大到失去意义（大量条目的落点断言本就不含反引号标识符） |

⇒ **「落点是否支持断言」在当前形态下无法机械化**，只能逐条人工核对。
**「试过并否决」与「没试过」不是一回事** —— 数据记在判据注释里，避免下轮重做。

### 五、落判据：只落**可精确表达**的那一条

新增（`verify-settings-contract.mjs`）：**`mellow` 为空 ⇒ 条目文本不得出现「设置默认 <数字>」形态**。
理由：`mellow` 是**机器可读声明**（「该键对应这些 Mellow 设置 id」）⇒ 为空即**不存在**该设置；
而「有默认值的设置」蕴含「存在该设置」⇒ 两者矛盾。

- **精度**：修前命中 **1 条**（`sidebarWidth`）、**0 误报**；修后 **0 条**（硬判据）。
- **canary 三向**：正样本 / **否定式断言**（`defaultImageStorage` 的「**无**「默认存储位置」项」）/ **有 `mellow` 的条目**。
- **注入验证 2/2**：① 把落点改回假断言 ⇒ **红**；② 给**有 `mellow`** 的条目注入同样措辞 ⇒ **仍绿**
  （证明判据按 `mellow` **分岔**，不是全局禁词）。
- **适用域下限**：`mellow` 为空的条目 ≥ 30（当前 **53**）⇒ 防适用域萎缩致判据空转。

### 六、⚠️ 施工中**第 4 次**踩「自己的说明文字满足自己的判据」

修 `sidebarWidth` 时，我在**更正里原样复现**了那句假措辞 ⇒ **新判据当场红**。
这是本仓**第 4 次**（PITFALLS §4.190 / PITFALLS §4.195 / skill §120 / 本次）。
**处置**：更正改成**不复现原措辞**（改为描述「schema 里**有**侧栏宽度项、其默认值为 270」），
并把这条**局限写进判据注释**；**刻意不加**「更正块豁免」—— 那会让判据**可被措辞绕过**。

### 七、教训

1. **「落点存在」≠「落点支持断言」** —— §4.138 把「可核对」实现成了「文件存在」，
   于是**断言可以完全为假**。**凡判据只查「引用可解析」，就要问「它到底核对了什么」。**
2. **批量机械补齐的东西必须逐条人工过一遍** —— 33 条里 1 条错（≈3%）；
   而错的那条正好是**唯一「肯定式断言一个不存在的设置」**的 ⇒ **错误不是随机的**。
3. **判据要么精确、要么如实声明不可机械化** —— 两条更严的候选判据实测后**否决**，并把**测量数据**
   写进判据注释。**不要**因为「想不出精确判据」就落一条宽判据凑数（那只会制造例外表）。
4. **核对要用被核对对象自己写的符号** —— 用自己猜的近义词去查，会把正确的条目判成错的。


## 4.145 同一缺陷被分成**两种 status**（`caseSensitive` 判 `implemented`、`fileSearchCaseSensitive` 判 `gap`）+ 两个登记面之间的**缝隙**（2026-10-07）

### 一、动因：从 §4.144 的「可自主候选」出发

上一轮登记的候选里有 `fileSearchCaseSensitive` / `fileSearchWholeWord`（「把已有行为暴露为设置」）。
按 PITFALLS §4.173 的规矩**先读条目、先取一手证据** —— 一读就读出一个**成对的矛盾**。

### 二、一手证据（Typora `main.js`，逐字）

```
// 文件搜索项类
this.caseSensitive = File.option.fileSearchCaseSensitive
this.wholeWord    = File.option.fileSearchWholeWord
this.useRegexp    = File.option.fileSearchUseRegexp
JSBridge.putSetting("fileSearchCaseSensitive", e.caseSensitive)
JSBridge.putSetting("fileSearchWholeWord",     e.wholeWord)
// 查找 / 替换面板类
this.caseSensitive = File.option.caseSensitive
this.wholeWord     = File.option.wholeWord
this.useRegexp     = File.option.useRegexp
JSBridge.putSetting("caseSensitive", t.caseSensitive)
```

⇒ ① 两组是**两个不同面板**的选项（带 `fileSearch` 前缀 = 文件搜索面板；无前缀 = 查找/替换面板）；
② **Typora 全都持久化**（`JSBridge.putSetting`）；③ `DEFAULT_OPTIONS` 里这四个都是 `!1`（默认 false）。

### 三、读出的三处缺陷

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | `caseSensitive` / `wholeWord` 判 **`implemented`**，而**它们自己的 `note` 就写着**「未作为持久化设置（Typora 会记住）」 | **同一条目自相矛盾** |
| 2 | 同一个「未持久化」事实，在 `fileSearchCaseSensitive` / `fileSearchWholeWord` 里判成 **`gap`** | **同一缺陷两种 status**（PITFALLS §4.143 的实例） |
| 3 | `fileSearch*` 的 `behaviorNote` 断言「**选项未暴露**」—— **假的** | 侧栏**早就有**这两个复选框（`apps/desktop/src/App.tsx` 的 `searchCase` / `searchWholeWord`，`useState(false)` **字面量**）|

**缺陷 3 的根因值得单独记**：落点引的是 `apps/desktop/src/host/searchServices.ts` 的 **`searchFiles()`** ——
那是**兼容旧 API**（源码注释自述「streaming 是主路径」），它硬编码 `caseSensitive: false`；
而**主路径** `searchFilesStreaming()` 是**透传**的（调用方给什么用什么），侧栏传的正是 `searchCase`。
⇒ **文件对、符号对，但描述的是同一个文件里的另一条路径**（与 §4.144 的「断言为假」是**不同**的失效模式）。

### 四、处置

**A. 实装持久化**（关闭 2 个缺口）：新增 `files.searchCaseSensitive` / `files.searchWholeWord`
（toggle，**默认 false ⇒ 默认行为不变**）；侧栏复选框读写它；设置页改动经
`applyCommand: 'settings.searchOptions'` **同步面板 state**（两处同源，不会分叉）。
⇒ 这两条 `gap` → **`implemented`**（`mellow` 填真实 id）。

**B. 更正 2 条误标**：`caseSensitive` / `wholeWord` `implemented` → **`gap`**，
落点改到**真正的查找面板**（`packages/editor-engine/src/documentSearch.ts` 的 `lastQueryOptions`），
并**区分缺口性质**：`caseSensitive` = **未持久化**；`wholeWord` = **面板里根本没有该选项**（**能力缺口**）。

**C. 矩阵净变化 = 0**（2 关 2 开）。**如实说明**：本轮产出是**准确性**，不是「缺口变少」——
把 `implemented` 的**虚高**压掉 2 条，与关掉 2 条缺口**同等重要**；只报「净变化 0」会掩盖两件事同时发生。

### 五、判据（两条，均带 canary）

1. **`status: implemented` 却自述缺口**（措辞「未作为持久化设置」）⇒ 失败。canary **三向**
   （正样本 / `gap` 说同样的话 / `implemented` 但无该措辞）。
   ⚠️ **边界如实声明**：只覆盖**一种措辞**，**不能**取代人逐条核对（本轮另两条用的是别的措辞）。
2. **搜索选项的接线三层**：① 设置存在且**默认 false**；② 面板复选框必须 `persistBoolSetting(<同一个 id>, …)`；
   ③ `applySetting` 必须有 `settings.searchOptions` case —— 否则在设置页改完**已挂载的面板不同步**。
   canary：正样本 / **改名**负样本（`…X` 不被命中）。
**注入验证 4/4**（默认值改 true / 面板不再写盘 / `applySetting` 丢 case / 把条目改回原判定）⇒ 全红，还原后绿。

### 六、⚠️ 顺带量到的**结构性**发现：两个登记面之间的缝隙

`JSBridge.putSetting(...)` 是「**Typora 真的持久化哪些键**」的一手来源（机器可抽）。实测：

| 面 | 覆盖 |
|---|---|
| 偏好矩阵（= `DEFAULT_OPTIONS`，84 键） | 84 |
| 面板独有面（`keyName`，91 个去重） | 91（与矩阵有交集） |
| **`putSetting` 的键（并集 38）** | **15 个不在上述两面中的任何一个** |

那 15 个是：`useRegexp` · `fileSearchUseRegexp` · `listSortType` · `treeSortType` ·
`noFileNonExistWarning` · `noHintForOpenLink` · `noWarnigForDeleteFile` · `noWarnigUploadDisabled` ·
`noWarningForExportOverwrite` · `isDarkMode` · `isFocusMode` · `isTypeWriterMode` · `backgroundColor` ·
`customZoom` · `sidebar_tab`。

⇒ **`DEFAULT_OPTIONS` 与「面板 UI」都不是「全部被持久化的键」** —— 两个面之间**有缝**。
本轮的 `fileSearchUseRegexp` 正是落在缝里的一个（这解释了为什么它既不在矩阵、也不在面板独有面）。

⚠️ **为什么不落判据**：我试过「`putSetting` 的键 ⊆ 两个面」这条**看起来很强**的判据 ——
**实测它不成立**：那 15 个里至少有 6 个是**视图/会话状态**（`isDarkMode` / `isFocusMode` /
`isTypeWriterMode` / `backgroundColor` / `customZoom` / `sidebar_tab`），Typora 经同一通道持久化
**模式与视图**，它们**不该**进偏好矩阵。⇒ **先要给「哪些算偏好」下定义**，在那之前**不落判据**
（落一条宽判据只会制造一堆例外表）。**已如实登记为待办。**

### 七、残留（如实登记）

1. **同一面板的「正则」复选框仍不持久化** —— Typora `fileSearchUseRegexp` 落在上述**缝隙**里
   （既不在 `DEFAULT_OPTIONS`、也不在面板）⇒ 它**不在矩阵的登记范围**内。
2. **查找面板的 `caseSensitive` 持久化未做** —— `packages/editor-engine/src/documentSearch.ts` 在**引擎侧**，
   而本仓约定「**engine 不读存储，只问宿主**」⇒ 需要一条宿主注入通道（同 `__MELLOW_IMAGE_UPLOAD__` 模式）。
3. **`wholeWord`（查找面板）是能力缺口** —— 需要在查找面板加一个 toggle + 接线；未做。

### 八、教训

1. **「同一事实、两种 status」是本仓的结构性缺陷类** —— 它**跨条目**，**单看任一条都自洽**；
   本轮能发现，是因为**两条并排读**。⇒ **凡成组的键（同名不同前缀 / 同一面板的多项），要成组核对。**
2. **落点「文件对、符号对」仍可能描述错的路径** —— `searchFiles()` 与 `searchFilesStreaming()`
   在**同一个文件**里，前者是兼容垫片、后者是主路径。⇒ 落点要精确到**函数**，
   并在注释里写清**为什么是这条而不是旁边那条**（本例源码注释「streaming 是主路径」就是现成的判据）。
3. **「可自主」的候选要先读条目再动手** —— 若直接照 `behaviorNote` 的「选项未暴露」去实装，
   会**重复实现一个已存在的复选框**。
4. **判据要「先量再落」** —— 本轮那条看起来很强的 `putSetting ⊆ 两面` 判据，**量完才知道不成立**
   （15 个里 6 个是视图状态）。**没量就落，只会得到一张例外表。**
5. **登记面本身也要被审计** —— 此前只审过「矩阵里有没有错」，**没审过「矩阵这个面够不够宽」**。
   本轮第一次量化了两面之间的缝隙（15 个键）。


## 4.146 把 §4.145 量到的「**缝隙**」落成**第三个登记面** + 抓到 `sortType` 是 Typora 的**死键**（2026-10-07）

### 一、动因

§4.145 量到：`JSBridge.putSetting` 的 38 个键里 **15 个**既不在偏好矩阵（`DEFAULT_OPTIONS` 面）
也不在面板独有面（`keyName` 面）—— 两个面之间**有缝**。当时**没落判据**，因为
「`putSetting` ⊆ 两面」**实测不成立**（15 个里 ≥6 个是视图/会话状态）。
⇒ 本轮把这 15 个**逐条取证分类**，落成第三个面，让那条判据**变得可落**。

### 二、逐条分类（15 个，全部有一手证据）

| kind | 数量 | 键 | 判据（要点） |
|---|---|---|---|
| `preference-like` | **4** | `useRegexp` · `fileSearchUseRegexp` · `listSortType` · `treeSortType` | 用户主动切换的选项，Typora 持久化 |
| `warning-suppression` | **5** | `noFileNonExistWarning` · `noHintForOpenLink` · `noWarnigForDeleteFile` · `noWarnigUploadDisabled` · `noWarningForExportOverwrite` | 「不再提示」记忆（原生对话框的 checkbox / 一用就写死） |
| `view-state` | **6** | `backgroundColor` · `customZoom` · `isDarkMode` · `isFocusMode` · `isTypeWriterMode` · `sidebar_tab` | 主题派生值 / 缩放 / 模式开关 / 侧栏页签 |

⇒ **`preference-like` 只有 4 个**（其余 11 个**确实不该**进偏好矩阵）——
这正好说明 §4.145 里「先定义再落判据」的克制是对的：**若当时直接落判据，会得到一张 11 条的例外表**。

### 三、⚠️ 顺带抓到的**死键**：`sortType`

查 `listSortType` / `treeSortType` 时发现矩阵里的 `sortType`（`dCarrier: D-AG`）有问题：

| 量 | 结果 |
|---|---|
| `putSetting("sortType")` | **0 次**（**从不持久化**）|
| `File.option.sortType` | 只出现在 `… = File.option.sortType \|\| 0` 的**归一化行**里，**之后从未被读** |
| `main.js` 全文 20 处 `sortType` | 其余全是组件自身的 `this.sortType` / `.sortType()`（由 `listSortType`/`treeSortType` 初始化）|
| `strings` 原生二进制 | 含 `listSortType` / `treeSortType`，**不含** `sortType` |

⇒ **`sortType` 是 `DEFAULT_OPTIONS` 里的一个死默认**；**真正的持久化键是 `listSortType` / `treeSortType`**。
矩阵那条的**结论**（D-AG 已裁决排序形态等价）**不受影响** —— 但它**不是**通过 `sortType` 实现的；
已在条目里补证，并把活键登记进第三面。

**方法学收获**：这是「**矩阵追踪的键名 ≠ Typora 实际用的键名**」的第一个实例，
而**两个面都看不见它** —— 因为两个面一个按 `DEFAULT_OPTIONS` 抽、一个按面板 `keyName` 抽，
**都不看「谁真的被写」**。`putSetting` 正是补上这一维的通道。

### 四、落地

1. **新第三面**：`tests/parity/fixtures/typora-persisted-uncovered.json` —— 15 条，每条 `key` + `kind` + `reason`；
   含 `kindVocabulary` 与抽取命令（可复现）。
2. **CI 判据**（`verify-settings-contract.mjs`，**不需要 Typora**）：① 每条必须有 `key`/`kind`/`reason`
   且 `kind` 在词表内；② **每个键不得出现在另两个面里**（否则是**过期登记** ⇒ 应删除）；
   ③ 下限 10 + **每个 `kind` 桶非空**（防词表退化致分类退化成「都一样」）。
   canary 三向；诊断串**一律带键名**（否则「哪一条坏了」要靠数行找）。
3. **本机工具**（`audit-typora-preferences.mjs`，**需要 Typora**）：重抽 `putSetting` 的键，
   与第三面做**双向**核对 —— ① 漏登（实测 38 键 − 两面 − 登记表 == ∅）；② 失效登记
   （登记表 − `putSetting` 键 == ∅）。canary 三向（含「完全一致被判为不一致」）。
   ⇒ **分工**：CI 守**自洽**，本机守**完整**（与 §4.126 面板面的分工同型）。

**注入验证 4/4**：① 从第三面删键 ⇒ 本机工具报「漏登」；② 把矩阵已有键塞进第三面 ⇒ CI 报 `stale-matrix`；
③ `kind` 改非法值 ⇒ CI 红；④ `reason` 清空 ⇒ CI 红。还原后**双绿**（CI + 本机工具）。

### 五、教训

1. **「缝隙」本身要有一个登记处，否则它永远是「已知但不存在于任何地方」** ——
   §4.145 量到了它却没地方放；本轮给了它第三面，那条判据才落地。
2. **分类的价值在于「它让判据可落」** —— 不做分类，判据就是一张 11 条例外表；
   做完分类，「11 个非偏好」变成**有理由的登记**，判据变成 3 条硬判据。
3. **「追踪的键名 ≠ 实际用的键名」** —— 两个面都是按**声明**抽的（一个抽默认值表、一个抽面板 UI），
   **都不看「谁真的被写」**。⇒ 要问「**这个键真的被读写吗**」，得找**另一条通道**（这里是 `putSetting`）。
   **`sortType` 死键就是这么漏掉的。**
4. **分工要写清楚**：CI 能做的（自洽、双向的面内一致）与只有本机能做的（重抽上游）**必须分开声明**，
   否则「CI 绿」会被读成「上游也核过了」。


## 4.147 实装「查找面板三个选项」的持久化 + 补「全词匹配」+ **修掉一个潜伏的面板挂载 bug**（2026-10-08）

### 一、动因

§4.145 把 `caseSensitive` / `wholeWord` 更正为 `gap`（并区分了「未持久化」与「面板根本没有该选项」两种缺口性质），
§4.146 又把 `useRegexp` 登记进第三面。本轮把这三条一起收口。

### 二、一手证据（Typora `main.js`）

查找面板类读 `File.option.caseSensitive` / `wholeWord` / `useRegexp`；三个 toggle 的 `mousedown` 分别
`JSBridge.putSetting("caseSensitive"|"useRegexp", …)` ⇒ **Typora 会记住**；`DEFAULT_OPTIONS` 里三者都是 `!1`。

### 三、实现（跨 3 层；**engine 不读存储**）

| 层 | 落点 | 内容 |
|---|---|---|
| 设置 | `packages/settings/src/index.ts` | `editor.searchCaseSensitive` / `editor.searchWholeWord` / `editor.searchRegex`（toggle，**默认 false**）|
| 宿主注入 | `apps/desktop/src/App.tsx` | `__MELLOW_SEARCH_PREFS__`（getter，惰性读设置）+ `__MELLOW_SEARCH_PREF_SET__`（setter，把引擎键映射回**同一个**设置 id）|
| 引擎 | `packages/editor-engine/src/documentSearch.ts` | **补 `wholeWordBtn`**；面板创建时 `applyHostSearchPrefs()`；三个 toggle 调 `notifySearchPref()` |

**依赖已核**：`@codemirror/search` 的 `SearchQuery` **原生支持 `wholeWord`**
（vendored dist：`this.wholeWord = !!config.wholeWord` + 匹配处 `if (spec.wholeWord)`）⇒ 不自己造轮子。

### 四、⚠️ 顺带修掉一个**潜伏的面板挂载 bug**（本轮最有价值的产出）

`buildMellowSearchPanelDom()` 末尾有一句
`if (lastQueryOptions.caseSensitive || …) commitQuery();` —— 而该函数是**从 `ViewPlugin.update` 里**调用的
⇒ 那就是「**在 update 周期内 `view.dispatch(...)`**」，CM 会抛
`Calls to EditorView.update are not allowed while an update is in progress`。
又因为 `sync()` 是**在构建函数返回之后**才赋 `this.panel` 的 ⇒ 异常发生时面板**已构造完但还没 append**
⇒ 表现是「**面板再也不出现**」（而不是报错）。

**触发条件**：会话记忆里有任一开关为真 —— 即**用户开过「区分大小写」再关掉面板重开**。
⇒ 这是一条**此前没有任何测试覆盖**的真实路径（本轮补的用例才第一次走到它）。

**修法**：把这次 query 同步**推迟到微任务**（面板挂载本身仍是同步的，不受影响）。
**验证**：注入验证 ① 把「推迟」改回**同步** ⇒ 引擎测试**红**（面板找不到）⇒ **证实因果，不是猜测**。

### 五、判据（四层 + 一条「不得同步 dispatch」）

1. 三个设置存在且**默认 false**；
2. 引擎**补上全词按钮**且 `SearchQuery` 真的传 `wholeWord`（否则按钮是空开关）；
3. 引擎**读**注入 + 三个 toggle **都通知宿主**写回；
4. 宿主**注入**两个函数，且 getter 读的设置 id 与 setter 的映射**一一对应**（读一个写另一个 ⇒ 静默不一致）；
5. ⚠️ **不得同步 dispatch**：`queueMicrotask` 形态必须在、旧的同步形态必须**不在**（canary 双向）。
**注入验证 5/5**（同步化 / 去按钮 / 去通知 / 不传 `wholeWord` / 映射改名）⇒ 全红，还原后 **CI + 引擎测试双绿**。

### 六、矩阵与第三面

- `caseSensitive`：`gap` → **`implemented`**（`mellow: ["editor.searchCaseSensitive"]`）
- `wholeWord`：`gap` → **`implemented`**（`mellow: ["editor.searchWholeWord"]`）—— **能力缺口**已补
- 第三面的 `useRegexp`：`reason` 更新为「已实装持久化（`editor.searchRegex`）」；
  **仍留第三面** —— 本面登记的是「**不在矩阵与面板任一面**」这一事实，而**是否进矩阵仍需裁决**
  （它不在 `DEFAULT_OPTIONS`，登记会改矩阵的声明来源）。

矩阵净变化：`implemented 37 → 39` / `gap 41 → 39`。

### 七、残留（如实登记）

1. **改设置后需下次打开面板生效** —— 引擎在**面板创建时**读宿主偏好（本项**无** `applyCommand`）；
   已打开的旧面板不实时刷新（Typora 亦然）。
2. **`useRegexp` 是否进矩阵未裁决**（同 §4.146 的登记）。

### 八、教训

1. **补一个开关会走到从未被测试覆盖的路径** —— 那个潜伏 bug 需要「会话记忆里有开关为真」才触发，
   而**此前没有任何用例制造过这个状态**（原测试只验「扩展装上了」）。⇒ **加状态就要加「状态非默认」的用例。**
2. **「在 update 内 dispatch」是 CM 的硬约束，而它没有任何静态检查** —— 本轮把它落成判据（第 5 条）。
   同类形态：凡「回调在框架的更新周期内被调用」，dispatch / setState 都必须推迟。
3. **「构造」与「注册」分成两步时，中间抛错会留下半成品** —— `this.panel = build…()` 与
   `appendChild(this.panel)` 之间抛错 ⇒ 构造了但没挂上 ⇒ **表现从「报错」变成「静默不出现」**。
4. **注入验证能把「猜测」变成「因果」** —— 若没跑 ①，我只能说「**可能**是同步 dispatch 导致的」。


## 4.148 审计文档的 `§` 引用**可达性**普查：605 处里 **407 处不带文档限定词**（2026-10-08）

### 一、动因

上一轮（§4.147）修掉一个「潜伏的面板挂载 bug」后，自然要问「**同类潜伏问题还有没有**」——
于是先做了两次普查（在 CM `ViewPlugin` 的 `update`/`constructor` 内 `dispatch` 的**直接**与**间接**形态），
**都是负结果**（见第四节）。⇒ 转向本仓一贯的强项：**引用可达性**。

### 二、量化（口径先写清）

口径 = 「`§` 引用**前 30 字符**内是否出现文档限定词」。对审计文档全文统计：

| 量 | 数 |
|---|---|
| `§` 引用总数 | **605** |
| 其中**不带文档限定词** | **407** |
| `§4.N` 引用 | 440（其中 375 处无限定词） |
| **不可解析的裸 `§4.N`** | **2**（编号 **4.1** / **4.2** —— 本行刻意不带 `§` 前缀，否则它自己会被下面那条判据命中） |

### 三、⚠️ 三条具体缺陷

1. **本文档的日志从 `## 4.3` 起** —— **编号 4.1 / 4.2 不存在**（全文唯一的两处缺号）。
   ⇒ 裸写这两个编号**解析不到**（实测 2 处）。
2. **假解析（更危险）**：`master-plan §4.2` / `master-plan §4.3` 被**裸写**成 `§4.2` / `§4.3`
   ⇒ `§4.3` **能解析**，但会跳到**本文档的 `## 4.3`**（完全不同的内容）。**判据读不出这种错。**
3. **「本文件」指向错误（主动误导）**：§4.88 审的是 `docs/plans/packaging-release.md`，
   而原文写「与**本文件 §3.1** 自己的 2026-10-05 更正自相矛盾」——
   在**审计文档**里「本文件」= 审计文档 ⇒ **读者必然读错**。

### 四、两次普查（负结果，如实记录）

| 普查 | 命中 | 结论 |
|---|---|---|
| CM `ViewPlugin` 的 `update`/`constructor` **直接** `dispatch(` | 1 | **假阳性** —— 那是 `eventHandlers.contextmenu` 回调（DOM 事件里 dispatch **合法**） |
| ……**间接**形态（update 调用的函数体内 `dispatch(`） | 1 | **假阳性** —— `installApi()` 只**定义**闭包（`jumpToOffset`）并挂到 `window`，**不调用** |

⇒ **§4.147 那个形态在本仓是孤例**（至少这两个仪器扫不到别的）。
⚠️ **且第二个仪器也扫不到 §4.147 本身** —— 那里的 dispatch 在**构建函数内**、由 `sync()` 调用
⇒ 需要**跨函数的调用图**才能追上。⇒ **两个普查都只覆盖了「一层」。**

### 五、处置（只做能**复核**的那部分）

1. **修掉 3 条具体缺陷**：编号 **4.1** / **4.2** 那两处（连同同段落的 4.4 / `§五`）加**同文档**限定词；
   `master-plan §4.2`/`§4.3` 加 `master-plan`；§4.88 加**块级限定词**并把「本文件」改成
   「`packaging-release.md` 自己」。
2. **把约定写进文档开头**：裸 `§4.N` = 本文档；引用 `PITFALLS.md` 必须写前缀；
   引用其它文档写文档名**或**块级限定词；**不得**用「本文件」指别的文档。
3. **落判据**（`verify-doc-code-refs.mjs`）：**不可解析的裸 `§4.N` 必须带限定词**。
   canary 三向；**注入验证 2/2**（注入一个**不存在的编号** / 去掉 `master-plan` 限定词 ⇒ 都红）。

### 六、残量（如实登记，**不机械全改**）

**407 处无限定词**里绝大多数**靠上下文消歧**（表格标题 / 同段落的文档名）——
**人勉强能读，判据读不了**。**不做机械全改**，理由：
① 「该引用指哪份文档」**必须读上下文** —— 同一个 `§3` 在本文档里指过 **5 份不同文档**
   （clipboard-paste / file-safety / table-editing / image-workflow / updater 各自的 §3）；
② **机械补限定词没有判据能验证改对了** ⇒ 只会制造 400 处**无法复核**的改动；
③ 判据只覆盖**可机械判的那一半**（不可解析），**不得**读作「引用已全部可解析」。

**另登记**：**`## 4.1` / `## 4.2` 缺号**（本文档日志从 `## 4.3` 起）——
**未擅自补编号**（补了会与既有的历史引用错位）。

### 七、教训

1. **「同类普查」要问「我的仪器能扫到几层」** —— 直接形态的扫描器扫不到间接形态；
   间接形态的扫描器扫不到**跨函数**的形态。**负结果只在仪器覆盖的范围内成立。**
2. **「能解析」≠「指对了」** —— 假解析**比解析不到更危险**：解析不到会报错，
   假解析**静默给出错误的内容**。
3. **「本文件」这类相对指代在多文档语境里必须禁止** —— 同一句话在 A 文档里读是对的、
   在 B 文档里读是错的。
4. **量化能把「感觉有点乱」变成「605 里 407」** —— 有了数才知道该不该动、能动多少。


## 4.149 与 Typora 差距的**全量再评估**（2026-10-08）+ 一处落点更正 + 一条判据

### 一、四个登记面 + 门禁的**当前**状态（全部实跑）

| 面 | 状态 |
|---|---|
| ① 台账（发布门禁） | **NO-GO**：**9 项未闭环**；`PASS-E = 0/50`（门禁口径） |
| ② 偏好矩阵（`DEFAULT_OPTIONS`，84 键） | `implemented 39` / `gap 39` / `n/a 6` |
| ③ 面板独有面（`keyName`，47 键） | `equivalent 35` / `gap 5` / `n/a 7` / `unverified 0`；`consumer unknown 1` |
| ④ 第三面（缝隙，15 键） | `preference-like 4` / `warning-suppression 5` / `view-state 6` |
| ⑤ D 表 | **40** 条声明行 |
| ⑥ 默认值偏离（矩阵轴） | **7** 项 = `deliberate 2` / **`undecided 5`** |
| ⑦ 待裁决 | ADR-0034（**Proposed**） |

### 二、**可自主面**的量化（本轮的核心结论）

逐项问「**这一项能不能由本环境自主推进**」：

| 面 | 可自主 | 阻塞于什么 |
|---|---|---|
| 台账 9 未闭环 | **0** | `ux-gate-policy` 6 项（人工 UX Gate 会话）· `human-ux-gate-session` 1 · `perf-harness-pending` 1（ADR-0026 Q3）· `runtime-verification-pending` 1（拼写检查词典） |
| 矩阵 `gap` 39 | **0（有价值的）** | 31 条是 `matches-default`（**无害**：Typora 有开关、Mellow 硬编码**同一个**默认）⇒ 实现它们 = 加**没人要的开关**；6 条 `differs` 里 **5 条待裁决**、1 条阻塞于词典 |
| 面板 `gap` 5 | **1** | `SmartyPantsOnRendering`（**唯一**）；其余 1 precondition + 3 adr-pending |
| 第三面 15 | **0** | 登记性质；`preference-like` 4 条是否进矩阵**待裁决** |
| 默认值偏离 7 | **0** | 2 deliberate + **5 undecided（待裁决）** |

⇒ **结论：可自主面基本耗尽** —— 除 `SmartyPantsOnRendering` 外，**其余全部**阻塞于
**用户裁决**（ADR-0034 的 12 问 + ADR-0026 Q3）或**人工 UX Gate 会话**。
这与 §4.120 对台账的结论一致，但本轮把它**扩展到了四个面**。

### 三、⚠️ 一次**被自己否掉的假设**（如实记录）

我一度判定 `SmartyPantsOnRendering` 的 `blockedBy: not-implemented`（= 可自主）**是错的** ——
理由：master-plan 的架构原则写「Live Markdown 走 Decoration / Widget（**从不 replace 文本**）」，
而「渲染期转换」需要 `Decoration.replace` ⇒ 像是**架构冲突** ⇒ 应改 `precondition`。

**动手前取证**：全仓搜 `Decoration.replace` ⇒ **Mellow 已在 8 个文件里用了 12 处**
（`wysiwygBlocks.ts` 3 · `math.ts` 2 · `table/liveView.ts` 2 · `safeHtml` / `toc` / `taskCheckbox` / `image/widget` 各 1）。
⇒ 该原则指的是「**不改写文档文本**」（源文本是唯一真源），**不是**禁用 `Decoration.replace`。
⇒ **假设被否**：`blockedBy: not-implemented` **是对的**，该条**不改**。
（**「看起来冲突」要先取证再判** —— 本轮省下了一次错误更正。）

### 四、一处**落点更正**：`shiftTabAutoIndent`

面板 label 实测为 **"Use Shift+Tab to auto indent selected code"**，hint：
**"When disabled, Shift+Tab will outdent selected code or current line. When enabled, Shift+Tab will auto apply indentation for selected code"**
⇒ 该键管的是 **Shift+Tab**（缩进 vs 反缩进）。

而原 note 写「对应 Mellow 的 Tab 键行为（`insertTab` / 两空格 / 四空格）」并挂 `mellow: ["editor.tabBehavior"]`
⇒ **落点指错了**：`editor.tabBehavior` 管 **Tab 插入什么**，本键管 **Shift+Tab 是缩进还是反缩进**。

**真实证据**（已写进 note）：`main.js` 的
`"shift+tab"===File.option.autoIndentKey || File.option.shiftTabAutoIndent || (i.keyMap.default["Shift-Tab"]="indentLess")`
⇒ 默认（false）下**把 Shift-Tab 覆盖成 `indentLess`**；Mellow **没有全局 Shift+Tab 映射**
（只有表格内的 `packages/editor-engine/src/table/keymap.ts`）⇒ 走 CM 默认 `indentLess` ⇒ **行为一致**。
⇒ 结论（`equivalent`）**恰好仍成立**，但**落点必须换** —— 这正是 §4.144 那一类（**结论对、证据错**）。

### 五、一条判据（+ 一次**无结论**的取证尝试）

1. **判据**：面板 `equivalent` 的 note 里**带目录的路径落点必须真实存在**
   （`verify-settings-contract.mjs`）。实测基线 **10 个 token / 0 违规** ⇒ **硬判据**。
   ⚠️ **边界如实声明**：① 只查**带 `/`** 的路径（裸 basename 需全仓索引，且同名文件会误报）；
   ② **符号名不查**（§4.144 实测「符号必须出现在落点文件里」= 22 受检 / 4 违规 / **全部误报**）；
   ③ **不得**读作「`equivalent` 的落点已全部核对」。canary 三向；**注入验证 1/1**。
2. **`zoomLevel`（最后一处 `consumer: unknown`）的新通道尝试 —— 无结论**：
   原 note 列出的核实路径是「真机改一次缩放并重启，看是否恢复」。本轮改走**配置文件通道**：
   查 `~/Library/Application Support/abnerworks.Typora/`（**无 `conf*.json`**）与
   `~/Library/Preferences/abnerworks.Typora.plist`（文件在，但 `plutil -convert json` **输出为空**，读不出键）。
   ⇒ **本机没有可读的 Typora 偏好文件**（可能从未改过偏好，或该版本不落该路径）⇒ **无结论，欠债保留**。
   ⚠️ 如实登记：**「试过一条新通道但读不到」≠「已核实」**。

### 六、教训

1. **「可自主面耗尽」本身是一个**结论**，要能量化并写下来** —— 否则每一轮都要重新问一遍
   「还能做什么」，而答案分散在四个面里。
2. **「看起来冲突」必须先取证再判** —— 本轮差点把一条**正确**的 `blockedBy` 改成错的
   （架构原则的**字面**与**意图**不同）。**判「冲突」的判据是「现有代码里有没有先例」。**
3. **结论对 ≠ 证据对** —— `shiftTabAutoIndent` 的 `equivalent` 恰好成立，但落点指的是**另一个键**。
   这类「恰好对」最难发现：**判据全绿、结论也全绿**。
4. **取证失败要如实登记** —— `zoomLevel` 的新通道读不到文件，只能说「无结论」，
   不能因为「试过了」就当作已核实。


## 4.150 实装**渲染期智能标点**（Typora `convertSmartOnRender`）—— §4.149 认定的「唯一可自主项」（2026-10-08）

### 一、动因

§4.149 的全量评估结论是「**可自主面已耗尽**，只剩 `SmartyPantsOnRendering` 一项」。
本轮把它做掉。

### 二、一手证据（Typora `main.js` / `DEFAULT_OPTIONS`）

```
// DEFAULT_OPTIONS（三个键，默认都是 !1）
smartQuote:!1, smartDash:!1, convertSmartOnRender:!1
// 输入分支（引号）
File.isMac && File.option.smartQuote && !File.option.convertSmartOnRender && /["']$/.exec(l) && …
    l = l.replace(/["']$/, e => u.userQuote(…))
// 渲染分支
File.option.convertSmartOnRender && !document.body.contains(t[0])
    && t.find("[md-inline='pants']").text(function(){ return this.getAttribute("data-text") || this.textContent })
```

⇒ **关键结构**：`smartQuote` / `smartDash` 是**功能开关**（默认 `false` ⇒ **默认不转换**）；
`convertSmartOnRender` 只决定**何时**转换；且输入分支带 `!convertSmartOnRender` ⇒ **两档互斥**。
`[md-inline='pants']` 的 `data-text` 存 ASCII、渲染显示弯引号 ⇒ **文档保持 ASCII**。

### 三、实现（跨 4 层；**文档文本永不改写**）

| 层 | 落点 | 内容 |
|---|---|---|
| 设置 | `packages/settings/src/index.ts` | `editor.smartPunctuationOnRender`（toggle，**默认 false**）|
| 宿主 | `apps/desktop/src/App.tsx` | 启动恢复 + `applySetting` 分支**从存储重读两个设置** |
| 桥 | `packages/editor-core/src/core.ts` | `setSmartPunctuationOnRenderEnabled(on)` → `__MELLOW_SMART_PUNCTUATION__.setOnRender` |
| 引擎 | `packages/editor-engine/src/smartPunctuation.ts` | `buildSmartPunctuationRenderExtension()`：`ViewPlugin` + `Decoration.replace` + 文本 widget |

**三条约束**（都复用输入期同一套规则，保证两档结果一致）：
① **跳过代码上下文**（复用 `isInsideCodeContext`）；
② **光标所在行揭示源码**（与 Live Preview 的 marker reveal 同精神）；
③ **绝不改写文档**（只用 `Decoration.replace`；Mellow 已有 12 处同类用法）。

**为什么加 `applySetting` 时必须「从存储重读两个设置」**：两个设置**共用**同一个 `applyCommand`
（`settings.smartPunctuation`）⇒ 若用回调给的 `value` 去猜是哪一个，**会把另一个冲掉**。
判据已锁这一条。

### 四、⚠️ 施工中踩到的两个坑（如实记录）

1. **判据块的括号没闭合** ⇒ 把**后面**那段（用 `ds` 的）吸进了本块 ⇒ `ds is not defined`；
   修的过程中又把块**移错了位置**（移到 `ds` 作用域之外）。最终**回退该文件重做**。
   ⇒ **教训**：往一个「块作用域密集」的护栏文件里插块时，**插入点必须在块边界之外**，
   且**先 `node --check` 再跑判据**（语法错会把「判据失效」伪装成「判据报错」）。
2. **矩阵 JSON 多了一个 `},`** —— 我的 `new_string` 重复了对象闭合符。
   ⇒ **教训**：改 JSON fixture 后**先 `JSON.parse` 再跑护栏**；否则护栏会报一堆
   「矩阵无法读取 / 判据空转」，**看起来像判据坏了**，其实是数据坏了。

### 五、⚠️ 上一轮刚落的判据**当场抓到了旧数据**

§4.149 新增的「`equivalent` 的 note 里带目录的路径落点必须存在」判据，
**立刻**抓到 `SmartyPantsOnRendering` 的 note 里写了**不完整路径** `styling/nodes/invisible.ts`
（真实位置是 `packages/editor-core/CoreEditor/src/styling/nodes/invisible.ts`）⇒ 已补全。
⇒ 这是**新判据的第一笔收益**，且它抓的是**旧数据**（不是我本轮写的）。

### 六、登记面更新

- 矩阵 `convertSmartOnRender`：`gap` → **`implemented`**（`mellow: ["editor.smartPunctuationOnRender"]`）
- 面板独有面 `SmartyPantsOnRendering`：`gap`（`blockedBy: not-implemented`）→ **`equivalent`**
- 矩阵分布：`implemented 39 → 40` / `gap 39 → 38`；面板面 `gap 5 → 4`

### 七、测试与判据

- `packages/editor-engine/test/smart-punctuation.test.ts`：**18 → 25 例**（新增 7 例：
  默认不装饰 / 功能开但渲染期关不装饰 / 渲染期开 ⇒ 弯引号 + **文档仍 ASCII** /
  **光标行揭示** / 代码上下文跳过 / `-- ` → em dash + 文档不变 / **渲染期开时输入期停用**）。
- 新判据（`verify-settings-contract.mjs`）**五层**：设置默认 false · 引擎有渲染期扩展且真的用
  `Decoration.replace` · **两档互斥** · 注入通道暴露 `setOnRender`/`getOnRender` ·
  宿主侧 setter 存在 + applySetting **从存储重读** + **启动恢复**。canary 正/负（改名）。
- `verify-adapter-contract.mjs` 的启动状态下发清单 **+1**（`setSmartPunctuationOnRenderEnabled`）。
- **注入验证 3/3**（去互斥门控 / 改回用 `value` 猜 / 去启动恢复）⇒ 全红，还原后绿。

### 八、教训

1. **「先量再落」的判据会**立刻**回本** —— §4.149 落的路径判据在第一轮就抓到一条旧数据。
2. **往块作用域密集的文件里插块，先 `node --check`** —— 语法错会让「判据没生效」伪装成「判据报错」。
3. **改 JSON fixture 后先 `JSON.parse`** —— 否则护栏报的是「矩阵读不到」，看起来像判据坏了。
4. **共用 `applyCommand` 的设置必须「从存储重读」**，不能用回调的 `value` 猜 —— 否则互相冲掉。


## 4.151 把 e2e 探针的**裸 `spawn('npx')` 从 27 清零** —— 棘轮按当初的约定换成**硬判据**（2026-10-08）

### 一、动因

`verify-build-pipeline.mjs` §⑫ 是一条**棘轮**：`tests/e2e` 里裸 `spawn('npx')` 的脚本数 **≤ 27**，
共享启动器用法 **≥ 5**。它**自己写下了清偿路径**：

> 目标是把 28 降下来；**降到 0 时应把本判据换成硬判据**（「不得出现裸 `spawn('npx')`」）。

而它当初**不做批量修改**的理由是**充分的**：

> 本轮**不**批量改那 28 个脚本 —— 它们大多需要特定条件才能跑，**盲改 = 改一堆跑不起来的探针**。

⇒ 本轮把这件事做掉，**前提是把「盲」去掉**（见第三节）。

### 二、缺陷本身（为什么值得做）

`tests/e2e` 的探针用 `spawn('npx', ['vite', …])` 起 dev server。**Windows 上 `npx` 实际是 `npx.cmd`**，
Node 的 `spawn` 在无 shell 时**无法执行 `.cmd`**（抛 `ENOENT`）⇒ 脚本在 `waitForServer` **超时**后抛错
⇒ 表现是「**探针超时**」，而根因是**启动方式** ⇒ 那一面上**所有**探针在 Windows 上都是**假红**。

### 三、为什么这次可以改（「不盲改」的理由如何被解除）

| 当初的顾虑 | 本轮的处置 |
|---|---|
| 「盲改 = 改一堆跑不起来的探针」 | ① 27 处的 spawn 语句**形态统一**（只有 `PORT`/`port` 与 `cwd` 写法两种小差异）—— **先干跑打印计划**再写；② 迁移**只换启动方式**（同样的 `vite --port <p> --strictPort`、同样的 cwd），**不碰任何测试逻辑**；③ 迁移后**逐个 `node --check`**（27/27 通过） |
| 「需要特定条件才能跑」 | **静态**部分全部验掉；**运行**部分**实跑**（第五节） |

### 四、改动

- **27 个脚本**：`const vite = spawn('npx', […], { cwd: X, stdio: 'ignore' });`
  → `const server = startViteDevServer({ cwd: X, port: P });` + `const vite = server.child;`
  （`startViteDevServer` 内部按平台选 `npx.cmd` + `shell: true`，并把 spawn 失败原因保留下来）
- **27 个脚本**：`vite.kill('SIGTERM');` → `server.stop();`
- **27 个脚本**：删掉随之**未使用**的 `import { spawn } from 'node:child_process';`
- **判据**：棘轮 → **硬判据**（`bare.length > 0` 即失败）；共享启动器下限 **5 → 32**，
  且**抽成常量 `SHARED_MIN`** —— 否则「改了判据、报错文案还写着旧数」（本仓反复出现的
  「同一组数值多处维护」，§4.140 家族）。

### 五、验证

- **静态**：`node --check` × 27 **全通过**；全仓扫描**零残留**裸 `spawn('npx')`；
  迁移后 `tests/e2e` 里 **32/32** 个脚本使用共享启动器。
- **运行（抽样实跑，覆盖两种语句形态）**：
  `tests/e2e/zoom-verify.mjs`（单行选项 `{ cwd: DESKTOP_DIR, stdio: 'ignore' }`）⇒ **RC=0，8/8 全绿**；
  `tests/e2e/sidebar-verify.mjs`（**多行**选项，含 `detached: false`）⇒ **RC=0，全部检查全绿**。
  ⇒ dev server 都由共享启动器拉起 ⇒ 迁移**功能上可用**，不只是静态合法。
- **判据**：`verify-build-pipeline.mjs` 通过；**注入验证 2/2**
  （① 往一个脚本注入裸 `spawn('npx')` ⇒ 红；② 把 `SHARED_MIN` 调到 33 ⇒ 红）⇒ 还原后绿。

### 六、教训

1. **「存量欠债」的棘轮必须带「清偿路径」** —— 这条棘轮当初就写下了「降到 0 时换成硬判据」。
   **留一个「上限 0」的棘轮等于没判据**（它只保证不更差，而「已经不差」时它不表达任何东西）。
2. **「不盲改」是**推迟**的理由，不是**拒绝**的理由** —— 解除它的方式是**把「盲」去掉**：
   先**干跑打印计划**（量形态差异）→ 只做**机械替换**（不碰逻辑）→ **逐文件静态验证** → **抽样实跑**。
3. **批量替换要连带清理** —— 换掉启动器后 27 个文件的 `spawn` 导入**全部变成未使用**；
   不清理会留下 27 处「看起来还在用」的噪声（`tests/` 不进 eslint，**不会有任何东西提醒你**）。
4. **判据里的数字要抽成常量** —— 否则「改了判据、文案还写旧数」；本轮顺手改掉。


## 4.152 人工门禁的「**执行依据**」从未被核对 —— 五处失真 + 两条判据（2026-10-08）

### 一、动因：换一条**从未审过**的轴

前几轮把「可自主面」逐面量化并推完（§4.149 → §4.150 → §4.151）。本轮换对象：
`docs/qualification/phase1-runtime-qualification-manual.md` —— **人工门禁的执行依据**。
台账里 **7 项**阻塞于「人工 UX Gate 会话」，而人做这些会话时**照着这份手册执行**
⇒ 手册里每一条引用 / 注记**都是门禁链的一部分**，却**从未被核对过**（原因见第三节）。

### 二、实测五处失真

| # | 失真 | 一手证据 |
|---|---|---|
| ① | `tests/benchmark/ime-matrix-linux.mjs` 的 `--im` / `--scenario` / `--driver` **只认 `=` 形式** | 脚本**头部注释**与手册 §0.5 **都写空格形式** ⇒ 照文档跑 `--im ibus` **静默回落 `fcitx5`**；而 `im` 决定 `GTK_IM_MODULE` / `XMODIFIERS` ⇒ **测的根本不是 ibus**（结果抬头虽打印实际 `im`，但「照文档执行 = 测到的东西」这条链已断） |
| ② | `tests/benchmark/ime-matrix.mjs` 的 `--scenario` 同病 | 头部注释写 `[--scenario paragraph,heading]`；旧实现只认 `=` ⇒ 静默 `only=undefined` ⇒ **跑全部场景** |
| ③ | `tests/benchmark/generate-fixtures.mjs` 的 `[--seed 42] [--out fixtures]` **不存在** | 全文件**无 `process.argv`** ⇒ `SEED = 42` / `outDir` 是硬编码常量。spec §4 明写「**固定 seed**，内容可复现」⇒ 那两个 flag **本就不该存在**；照旧注释执行 `--seed 7` 会**静默按 42 生成**（同 §4.73「文档声称的接口，代码里没有」） |
| ④ | 手册 §0 的夹具路径 `tests/fixtures/` **错** | 那 7 个夹具由 `generate-fixtures.mjs` 写到 **`tests/benchmark/fixtures/`**（生成产物、gitignore）。`tests/fixtures/` 是**另一个目录**（Markdown 素材库：`math/` / `mermaid/` / `typora-parity/` / `ux-gate/` …），**一个也不含** ⇒ 照手册找素材**全找不到**。⚠️ 同仓的 `ux-score-gate-template.md` 写的是**正确路径**（`tests/benchmark/fixtures/10MB.md`）⇒ 这是手册**单方面漂移** |
| ⑤ | 手册 §2.4 的 D1 更正注记**已过期** | §4.124（2026-10-07）写「该行为**未实现** / Rust 侧无任何 drag-drop 处理」；而 **§4.134 当天就实装**了（`dropAction.ts` + Rust `path_kind` + `handleDroppedPaths`）⇒ 注记**从未回改**。⚠️ 方向是**保守**的（说「不可能通过」而实际已实装）⇒ 人做门禁时会**跳过**这一项 |

### 三、为什么五处都没被发现：**判据按「目录」当角色代理**

`verify-doc-code-refs.mjs` 有一条**明确的豁免**（写得很清楚、理由也成立）：

> ⚠️ **故意不含 `docs/qualification`**：审计 / 验收记录的职责就是**引用旧值**

这条理由对**审计记录**成立（§4.73 实测：审计正文被自己的判据命中 4 行，全是「在描述旧值」）。
但 **`phase1-runtime-qualification-manual.md` 不是审计记录** —— 它是**活的手册**，
是人**照着做**的执行依据 ⇒ 它的引用**必须**可核对。
⇒ **「用目录当角色代理」把两类不同职责的文件混在了一起**（该目录里既有历史快照，也有活文档）。

### 四、处置

| # | 处置 | 为什么选这一侧 |
|---|---|---|
| ① ② | **改代码**（接受两种形式） | 复用仓库**既有的** `flagArg()` 惯用法（`golden-journeys.mjs` 已有）；另给 `im` **补显式校验**（旧实现里非 `ibus` 的值一律按 fcitx 处理 ⇒ 拼错会静默跑成 fcitx5） |
| ③ | **改文档**（如实声明「无参数」） | 两个 flag **本就不该存在**（spec 要求固定 seed）；另 3 份文档（手册 §0.5 / ux 模板 / `tests/benchmark/README.md`）也都**无参数**调用 ⇒ 改文档是**唯一**正确的方向 |
| ④ | **改文档**（路径 + 注明生成方式 + 补漏掉的 `10MB.md`） | 并注明「生成产物、不入库 ⇒ 先跑生成器」 |
| ⑤ | **改文档**（注记改为「已实装 + 真机待验」） | 明确「既不是已通过、也不是不可能通过」 |

### 五、判据（两条）+ 行为探针 + 注入验证

- **⑮ 活文档声明的夹具目录 == 生成器的输出目录**（`generate-fixtures.mjs` 的 `outDir` 是**单一真源**）。canary 三向。
- **⑯ benchmark runner 头部用法注释里的 `--flag value`（空格形式）必须被解析接受**。谓词与 canary **共用**；
  「更正说明」逐行豁免（与文件头部 `LOOKS_LIKE_QUOTE` 同源）；下限 `checked ≥ 8`（实测 **10**）防空转。canary 三向。

**行为探针 4/4**（不靠静态判据，**真跑**）：

```text
--im bogus                   ⇒ Error: Unsupported input method: bogus   （空格形式**被解析**）
--im=bogus                   ⇒ Error: Unsupported input method: bogus   （等号形式未破）
--im ibus --driver bogus     ⇒ Error: Unsupported input driver: bogus   （空格形式下 im 已正确取到 ibus）
--im fcitx5 --scenario bogus ⇒ 解析通过、进入执行                        （合法参数不误报）
```

**注入验证 3/3**：① `--im` 改回「只认 `=`」⇒ 红；② `--scenario` 同 ⇒ 红；③ 夹具目录改回 `tests/fixtures/` ⇒ 红。还原后绿。

### 六、教训

1. **「按目录豁免」会把不同职责的文件混在一起** —— 豁免的依据应当是**职责**（审计记录），不是**位置**（`docs/qualification/`）。同一目录里既有「引用旧值是对的」的历史快照，也有「引用必须可核对」的活手册。
2. **「更正注记」会过期，且过期方向可以是保守的** —— 说「不可能通过」而实际已实装 ⇒ 人**跳过**这一项。**修完功能要回头改注记**。
3. **文档写的命令 = 契约** —— 照文档执行必须**得到文档说的事**；静默取默认值比报错更坏（报错会被发现）。
4. **单方面漂移的检测靠「同仓对照」** —— 手册写 `tests/fixtures/`、模板写 `tests/benchmark/fixtures/`，两者**只能有一个对**；「同一事实的另一处写法」是最省力的取证入口。
5. ⚠️ **我又一次被自己的新注释命中判据**（⑯ 的「更正说明豁免」）：`generate-fixtures.mjs` 的新注释里写了 `--seed 7`，而**那一行没有豁免关键词** ⇒ 判据当场报红。⇒ **写「举例 / 引用旧写法」时必须让它落在豁免规则内**（同 PITFALLS §4.195 与 PITFALLS §4.202 家族，**第 7 次**）。

### 七、产物

`tests/benchmark/{ime-matrix-linux,ime-matrix,generate-fixtures}.mjs` · 手册（§0 素材路径 + §2.4 D1 注记）·
`tests/parity/verify-doc-code-refs.mjs`（+⑮⑯ 两条判据与 canary）· 审计 **§4.152** ·
PITFALLS **§4.210–PITFALLS §4.211** · skill（+1 节 + 自查清单 +2 条）· `MEMORY.md` · `2026-10-08.md`。

---

## 4.153 `tests/qualification/README.md`：Pass/Fail 表的**包用例数与同文件真值源矛盾**（4/4）—— 并更正一条**过宽的覆盖边界声明**（2026-10-08）

### 一、动因

§4.152 的结论是「**豁免按目录写，把活文档一起豁免了**」。本轮顺着同一思路看同目录另一份**活文档**：
`tests/qualification/README.md` —— **ADR-0019 §3 Gate 条款指定的「三平台 Pass/Fail 表」载体**
（手册 §3 也要求把结果汇总到它）。

### 二、实测：**4/4 全部矛盾**

该文件里包用例数有**两处**写法（**单一真源** = 「各包规模」行，带日期）：

| Pass/Fail 表位置 | 表里写的 | 真值源 | |
|---|---|---|---|
| Live Markdown | `editor-engine 971` | 1277 | ❌ |
| PDF / HTML Export | `export 72` | 89 | ❌ |
| Settings / Theme / Export 契约 | `settings 13` | 17 | ❌ |
| File Safety | `app-core 200` | 258 | ❌ |

⇒ **4 处全部**是旧值，且比真值源行**更旧**（971 < 1135，而 1135 是 2026-09-12 那一版的数）。
另：**合计 1824 也写了两遍**（「12 包 jest 1824 例」与真值源行的「合计 1824 例」）—— 它是**可从各包派生**的数。

### 三、根因：**覆盖边界声明太宽**

该文件已有一条「数字一致性」判据（`verify-release-gate.mjs`），但它的注释写着：

> ⚠️ 覆盖边界：只锁**护栏数量**（可静态算）；**包用例数需实跑**，无法在此校验 —— 如实声明。

这句把**两件不同的事**混为一谈：

- ① **无法对「现实」校验**（需真跑 jest）—— **成立**；
- ② **无法对「同文件内的真值源」校验** —— **不成立**。文件里已有一个作者会刷新的真值源行，
  「其它位置必须与它一致」**完全可以机械判**（本轮实测 4/4 全可判）。

⇒ 与 §4.152 同族：**边界声明的粒度太粗，把「可查的那一半」也划进了「查不了」**。

### 四、处置

1. 4 处内联数字改为与真值源一致；
2. **更正那条覆盖边界声明**（写明「现实」与「同文件真值源」是两件事）；
3. 在既有块里**补两条判据**（判定与 canary **共用**谓词）：
   - **包用例数**：文件其它位置的 `<包名> <数字>` 必须 == 真值源（更正说明**逐行**豁免）；
   - **合计**：`jest N 例` / `合计 N 例` 必须 == 各包之和
     （⚠️ 谓词必须**收窄** —— 文件里还有「联合矩阵 8 例」「md-link 15 例」「corpus 4 例」这类**子集**）；
4. 表格标题下加一条**指向单一真值源**的说明（否则读者会以为表里的数是独立的）。

### 五、验证与施工记录

- **注入验证 5/5**：①②③ 三处包用例数改回旧值 ⇒ 红；④⑤ 两处合计改错 ⇒ 红；还原后绿。
- ⚠️ **新判据首跑当场抓到两个 bug**（都正是判据该做的事）：
  ① 包名正则 `[a-z-]+` **不含数字** ⇒ `i18n` 被**静默漏掉**、合计少 15 ⇒ 判据报「合计不一致」
     —— **把一个会静默的错误变成了响亮的失败**；
  ② 真值源行按「第一行含『各包规模』」查找 ⇒ 我在表格标题下加的**引用说明**（含 0 个包）被当成了真值源
     ⇒ 判据报「只解析出 0 个包」。**已改为「在候选行里取含包数最多的那一行」**。
- ⚠️ 另踩到：往该文件里加 CRLF 归一化（**哪怕写在注释里**）会**破坏既有的 CRLF canary**
  （它断言「去掉 `read()` 的归一化后文件里不再出现该转义序列」）—— 实测踩两次：先代码、再注释。
- ⚠️ **本轮第 3 次**踩「自己的新文字破坏判据」：说明里写旧值的那一行**没有豁免关键词** ⇒ 判据当场报红（已改写法）。

### 六、教训

1. **「无法对现实校验」≠「无法对同文件真值源校验」** —— 边界声明必须区分这两件事；后者几乎总是可机械判的。
2. **可派生的数不要手写**：合计 = 各包之和，写两遍必然漂移；有判据才能变成「改一处必须改两处」。
3. **正则的字符类要按「数据」来**：包名里有 `i18n` 这种**含数字**的名字 ⇒ `[a-z-]+` 会**静默**漏掉它，
   而表现是「合计对不上」而不是「解析失败」。
4. **按「第一行匹配」定位真值源是脆的** —— 文档里随时会出现**引用**该名字的句子；应**按内容选**
   （含目标最多的那一行）。
5. 同族：§4.152（豁免按目录写）—— 都是「**边界划得太粗**」。

### 七、残留（如实登记）

- 「各包规模」行本身是 **2026-10-01 的快照**；README 的「数字刷新纪律」要求**按包定向实跑**刷新。
  本轮**未刷新**（实跑耗时超出本轮预算、未完成）⇒ **登记为残留**。
  ⚠️ 本轮实跑核对到 **`host-api` 仍为 47**（与快照一致），但其余包**未逐一核对** ⇒
  **不得**据此读作「快照仍准确」。
- ⚠️ 本判据只保证**文件内自洽**（表 ↔ 真值源），**不保证真值源本身与现实一致** —— 后者仍需实跑。
  这条边界**如实声明**，不得读作「包用例数已核对」。

### 八、产物

`tests/qualification/README.md`（4 处数字 + 覆盖边界说明 + 表格标题下的真值源指针）·
`tests/parity/verify-release-gate.mjs`（+两条判据与 canary；`truthOf` 共用谓词）· 审计 **§4.153** ·
PITFALLS **§4.212–PITFALLS §4.213** · skill **§142–§143** + 自查清单 +2 条 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.154 `runtime-qualification-plan.md` 的 2026-10-01 复核把**已产出**的输出物判为「从未产出」—— 并闭合 §4.153 的残留（2026-10-08）

### 一、动因

§4.152 与 §4.153 的结论都是「**边界划得太粗**」。本轮顺着看同一批「人工门禁执行依据」的下一份：
`docs/specs/runtime-qualification-plan.md` §9 —— 它列了四个「输出物」，并在 2026-10-01 做过一次**逐项对账**。

### 二、实测：一条判定**是错的**

该对账表里有一行：

> | **platform issue list** | ❌ **不存在** —— 全仓无此文件。最接近的是 … |
>
> **结论**：§9 的四个输出物里 **3 个存在、1 个（platform issue list）从未产出**。

**实测**：`tests/qualification/README.md` **就有**「**Platform Issue 记录**」节 ——
列名 `日期 / 平台 / 现象 / 影响 / 状态`，正是该表所说的「**按平台聚合的问题清单**」，
且自 **2026-08-10**（commit `80603cc`）起就在（**远早于**这次 2026-10-01 复核）。

⇒ 判定「❌ 不存在」**不成立**。「**全仓无此文件**」这一半成立（它确实不是一个独立文件），
但由它推出「**从未产出**」**不成立** —— **产物以「章节」形态存在**。

### 三、根因：**核对的粒度（文件）与产物的形态（章节）不匹配**

与 §4.152（豁免按**目录**）· §4.153（边界按**文件**）同族：**用位置 / 形态当代理**。
这次的形态是「章节」，而扫描面只有「文件名」。

### 四、处置

1. 更正该行与结论（并写明「**全仓无此文件** 推不出 **从未产出**」）；
2. 落判据（`verify-doc-code-refs.mjs` ⑰）：**凡输出物表里标「不存在 / 从未产出」的行，
   其输出物名不得与 `tests/qualification/README.md` 的章节标题同义**（共同词 ≥2）；
   更正说明**逐行豁免**（与文件头部 `LOOKS_LIKE_QUOTE` 同源）；
   **防空转**：该表必须有 ≥3 行可判；canary 四向。
3. ⚠️ 施工踩到：**该表在引用块里**（行首是 `> |`），首版写 `^\|` ⇒ **一行都取不到** ⇒ 判据报「只解析出 0 行」。
   **防空转断言当场抓到** —— 这正是它的价值（否则判据会**静默空转**：一行都不看却报绿）。

### 五、闭合 §4.153 的残留：按纪律刷新「各包规模」

上一轮登记「各包规模」是 2026-10-01 快照、且**本轮未刷新**。本轮按 README 的「数字刷新纪律」**按包定向实跑**（12 包）：

| 包 | 2026-10-01 | **2026-10-08** |
|---|---|---|
| editor-engine | 1277 | **1318** |
| app-core | 258 | **297** |
| export | 89 | **100** |
| 其余 9 包 | — | **与上次一致** |
| **合计** | 1824 | **1915** |

同步更新：README 的「各包规模」行 · `12 包 jest N 例` · Pass/Fail 表的 3 处内联数字 ·
`runtime-qualification-plan.md` 里那句「已于 2026-10-01 刷新」。
并把 README 里**同样过宽**的那句边界声明（「**包用例数无法静态校验**（需实跑），故只锁护栏数量」）
**更正**为「**对现实**校验」与「**对同文件真值源**校验」两件事 ⇒ **§4.153 的残留已闭合**。

### 六、验证

- **注入验证 2/2**（§4.154：把 `platform issue list` / `pass/fail table` 改回「❌ 不存在」⇒ 红）；
- **注入验证 5/5**（§4.153 复跑：数字刷新后锚点同步更新）；
- `npm run parity` 全绿。

### 七、教训

1. **「全仓无此文件」推不出「从未产出」** —— 产物可以是**章节 / 表格 / 代码符号**；
   核对「某物有没有」时，扫描面**必须同时含「文件名」与「文档章节标题」**。
2. **防空转断言是第一道防线** —— 本轮 `specRows >= 3` 当场抓到「表格在引用块里」的解析 bug。
3. **边界声明要写清「查什么粒度」** —— §4.152（目录）· §4.153（文件）· §4.154（章节）：三次都是**粒度**出问题。
4. ⚠️ **第 13 次踩「自己的新文字命中自己的判据」**（本轮**两次**）：更正行引用了原判定（含「不存在」）、
   刷新记录行写了旧值（缺豁免关键词）⇒ 均按仓库惯例（**逐行豁免**）改写法。

### 八、产物

`docs/specs/runtime-qualification-plan.md`（§9 对账表 + 结论 + 刷新说明）·
`tests/qualification/README.md`（刷新 + 边界更正）· `tests/parity/verify-doc-code-refs.mjs`（+⑰）·
审计 **§4.154** · PITFALLS **§4.214–PITFALLS §4.215** · skill **§144** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.155 根 `README.md`（**用户第一眼看到的**那份）的两张清单漂移 —— spec 索引漏 1 / ADR 范围漂 3（2026-10-08）

### 一、动因

前几轮查的是 `docs/qualification` / `tests/qualification` 那一批。本轮看**最用户可见**的根 `README.md` ——
本仓已明确写过「README 是**用户第一眼看到的**那份，过期代价最高」，但目前**只有状态行**被护栏锁。

### 二、实测两处清单漂移

| # | 位置 | 现状 | 事实 |
|---|---|---|---|
| ① | 「文档索引 → ### 法律（Specs）」 | 列 **9** 条 | `docs/specs/` 有 **10** 个 ⇒ **漏 `performance-benchmark-spec.md`** |
| ② | 「### 判决（ADR）」 | 「ADR-0001 ~ **ADR-0031**」 | 目录里最大是 **ADR-0034** ⇒ **漂 3 个版本** |

⚠️ ②的根因值得单独记：**§4.94 那次只修了一半** ——
`docs/` 目录结构段的 `adr/` 已改为「最新编号见该目录」（**指向真值源**），
而**索引段仍硬编码**「~ ADR-0031」⇒ 之后每加一份 ADR（ADR-0032 / 0033 / 0034）**就漂一次**。
⇒ **同一事实的两处，修一处不修另一处 = 留一颗定时炸弹。**

### 三、处置

1. README 的 spec 索引补上 `performance-benchmark-spec.md`（**10/10**）；
2. README 的 ADR 段改为「~ **ADR-0034**（**最新编号以该目录为准**）」；
3. README 补一条更正说明（含**边界声明**）；
4. `docs/plans/typora-parity-master-plan.md` §2.1 **补一条边界声明**：那张表是「本方案**使用的**文档」的
   **优先级表**（**有意子集** —— 它别处也不引用未列入的那两份）⇒ **不是** spec 索引。
   （⇒ 这是**如实声明**，不是把它改成索引 —— 改成索引会篡改权威施工图的语义。）

### 四、判据（⑱）

- **spec 索引双向**：README「### 法律（Specs）」段里的 `docs/specs/*.md` **必须 ==** 目录集合（双向）+ 下限 8；
- **ADR 范围端点从目录现读**：README 里「`~ **ADR-NNNN**`」必须 == `docs/adr/` 的最大编号；
- 更正说明**逐行豁免**（`原写|实际已到|自相矛盾|…`）；canary 四向（含「非粗体写法不认」）。

### 五、验证

**注入验证 3/3**：① 删掉新补的 spec 行 ⇒ 红（漏了）；② ADR 端点改回 `ADR-0031` ⇒ 红；③ 索引里加一条**不存在**的 spec ⇒ 红。还原后绿。

### 六、教训

1. **「索引」与「子集」必须用不同措辞** —— 前者要**穷举**，后者要**明说自己是子集**；
   否则读者会把「表里没有」读成「仓库里没有」（同 PITFALLS §4.214 的「无此文件 ≠ 从未产出」）。
2. **修「多处副本」时必须逐处枚举** —— §4.94 修了一处（目录结构段）却漏了另一处（索引段），
   而**漏掉的那处**正是**用户最常读到的**。
3. **能机械化的编号就不要手写** —— ADR 范围端点可**从目录现读**；手写 = 每加一份 ADR 就漂一次。
4. ✅ **新判据 ⑱ 上没再踩「自己的文字命中判据」** —— 因为这次**先**把豁免规则（`原写|实际已到`）写进判据、
   **再**写更正说明（前几轮是反过来，**连踩 13 次**）。
   ⚠️ 但**老判据**（§4.N 必须带限定词）**又命中一次**：本节把 `PITFALLS §4.214` 裸写成了 `PITFALLS §4.214`
   ⇒ 这是同一族的**第 14 次** —— **说明该族的根因是「多命名空间共存」，不是「我忘了」**；
   每条新判据都只能防住它自己那一种。

### 七、产物

`README.md` · `docs/plans/typora-parity-master-plan.md` · `tests/parity/verify-doc-code-refs.mjs`（+⑱）·
审计 **§4.155** · PITFALLS **§4.216–PITFALLS §4.217** · skill **§145** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.156 `THIRD_PARTY_NOTICES.md`（**合规文档**）与实际依赖严重不符 —— npm 运行时依赖 28 漏 10、Rust 17 只列 2（2026-10-08）

### 一、动因

前几轮查的是「人照着做」的门禁文档。本轮换到**合规面**：`THIRD_PARTY_NOTICES.md` ——
它是**唯一**声明第三方组件与许可的地方，而**没有任何护栏覆盖它**。

### 二、实测

| 面 | 实际 | notices 里 |
|---|---|---|
| npm 运行时依赖（`dependencies`，3 个包去重） | **28** | 18（靠 `@codemirror/*` + `@lezer/*` 两个 glob）⇒ **漏 10** |
| Cargo 直接依赖（`[dependencies]` + target 段） | **17** | **2**（`tauri` / `tauri-plugin-dialog`）⇒ **漏 15** |

漏掉的 npm 侧 10 个：`markdown-it` / `markdown-it-footnote` / `markdown-it-task-lists` / `sanitize-html` /
`katex` / `mermaid` / `pdfmake` / `@tauri-apps/plugin-opener` / `plugin-process` / `plugin-updater`。

⚠️ **且表里列的多是构建工具**（Vite / TypeScript / Jest）—— **优先级是反的**：
把「不随产品分发」的工具列全了，却漏了「随产品分发」的运行时依赖。

另有一处**已过期**声称：「Mellow 自身代码默认 MIT（**待正式 LICENSE 文件发布时对齐**）」——
而根 `LICENSE` **早已存在**。

### 三、处置

重写 `THIRD_PARTY_NOTICES.md`：分五节（自身 / vendored / **npm 运行时** / **Cargo 运行时** / 构建工具），
逐项列出**实际版本与许可**（npm 从安装包现读；Cargo 从 **`Cargo.lock` 锁定版本** + registry 现读）；
修正过期声称；并**单列两个非 MIT 的运行时依赖**（`markdown-it-task-lists` = **ISC**、`notify` = **CC0-1.0**）。

### 四、判据（⑲）

**每个 workspace 包的 `dependencies` + `Cargo.toml` 各 `dependencies` 段的 crate 都必须在 notices 里出现**
（**表格行第一格**的精确名，或该格声明的 scope 通配 `@scope/*`）；防空转（npm ≥10 / cargo ≥8）；canary **五向**。
⚠️ **边界如实声明**：`devDependencies` / `[dev-dependencies]` **不在覆盖内**（不随产品分发）。

### 五、⚠️ 首版判据是**假门禁**，被注入验证当场揭穿

首版 `covered()` 用 `text.includes(name)` —— **裸子串**。而我在文件顶部写的**「重写原因」说明文字**里
正好提到了 `mermaid` / `katex` / `@codemirror/*` ⇒ **散文提及满足了判据**。
**注入验证 4 个只红了 1 个**（① `mermaid` ② `notify` ③ `@codemirror/*` **全部漏报**）。

⇒ 改为**只认表格行第一格**，并补一条 canary 专锁这个形态（「散文里提到 ⇒ **不算**覆盖」）⇒ **4/4**。
⚠️ 这正是本仓 `verify-parity-ledger.mjs` 早就写过的坑（「用裸子串判断会被**散文提及**满足」）—— **我又踩了一次**。

### 六、教训

1. **判据的谓词不能是「文本里出现过」** —— 文档里的**说明文字**会满足它；
   必须收窄到**结构位置**（表格行第一格 / 代码符号 / 行锚点）。
2. **「合规文档」是最该有护栏的** —— 它没有代码行为可对照，**漂了没人发现**；而它的读者是**外部审查者**。
3. **反方向的清单也要查** —— notices 列了 `markedit-api` / `@tauri-apps/cli`（**devDeps**）却漏了运行时依赖
   ⇒ 不是「漏了几个」，是**优先级反了**。
4. **别臆造版本 / 许可** —— npm 从安装包现读、Cargo 从 `Cargo.lock` + registry 现读；
   我第一版按 registry **目录名**猜版本，拿到的是**缓存里的任意版本**（如 `notify 7.0.0`，而锁定的是 `8.2.0`）。

### 七、产物

`THIRD_PARTY_NOTICES.md`（重写）· `tests/parity/verify-doc-code-refs.mjs`（+⑲）· 审计 **§4.156** ·
PITFALLS **§4.218–PITFALLS §4.219** · skill **§146** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.157 `packages/settings` 的三个文件都写着 **`PRD §531`**（一个**不存在**的节号）—— 而 PRD 只有 **0–150** 节（2026-10-08）

### 一、动因

§4.148 处理过**审计文档**里的 `§4.N` 引用（两个命名空间重叠）。本轮把同一条思路推广到**最高权威的命名空间**：
**`PRD §N`（宪法）** 与 **`master-plan §N`（唯一施工图）** —— 它们此前**没有任何判据**。

### 二、实测

全仓（护栏同口径，1096 个文本文件）扫 `PRD §N` / `master-plan §N`：**638 / 79** 处引用，
其中**引用不存在的节**的只有 **3 处**，且是同一个：

| 文件 | **原写**（**已更正**） |
|---|---|
| `packages/settings/README.md:3` | **原写** `PRD §531` |
| `packages/settings/package.json:4`（`description`） | **原写** `PRD §531` |
| `packages/settings/src/index.ts:2`（文件头注释） | **原写** `PRD §531` |

**PRD 只有 0–150 节，`§531` 不存在。**

**真实出处**：`One Settings Model` 这个短语在 PRD 里**只出现一次** —— **§4.7**（「多轮深度评估」的第七轮，
「Mellow 正式采用」清单）。⚠️ `531` 与它所在**行号 537** 很接近 ⇒ 疑似**把行号当成了节号**。

### 三、处置

三处都改为 **`PRD §4.7`**；README 与 `index.ts` 各留一条更正说明（`package.json` 是 JSON，无注释）。

### 四、判据（⑳）

**`PRD §N` 的 N 必须在 PRD 的顶层节号集合里；`master-plan §N` 同理**（从两份文档**现读**节号，不写死）；
更正说明**逐行豁免**；防空转（PRD ≥500 / master-plan ≥60，基线 **638 / 79**）；canary 四向。

⚠️ **本护栏自身必须排除出扫描面** —— 它含 canary 的**合成样本**（**原写** `PRD §531`）与说明文字，
不排除会**被自己命中**（实测踩到；本仓在 `MELLOW_*`/`TYPORA_*` 那节也踩过同一坑）。

### 五、验证

**注入验证 4/4**：① `package.json` 改回 `§531` ⇒ 红；② `index.ts` 改成 `§999` ⇒ 红；
③ 把一处**合法**引用 `PRD §109` 改成 `§151`（越界）⇒ 红；④ 把一处合法引用改成 `master-plan §99`（**不存在**）⇒ 红。还原后绿。

### 六、教训

1. **「节号」这类引用要在「每个命名空间」分别守** —— 审计文档有 `§4.N` 的判据，
   **不代表** PRD / master-plan 也有；**判据的作用域是「那一份文档」**，不是「`§` 引用」这件事。
2. **行号与节号长得很像**（`531` vs 行 `537`）⇒ 引用**必须带单位**（`§N` = 节号），不能只写数字。
3. **扫全仓比扫一份文档更容易看清「孤例」** —— 3 处错误在 638 处引用里，**只有全仓扫描**才敢说「只有这 3 处」。
4. ✅ **先配豁免规则、再写更正说明** —— 本轮按 PITFALLS §4.217 的顺序做，**一次通过**。

### 七、产物

`packages/settings/{README.md,package.json,src/index.ts}` · `tests/parity/verify-doc-code-refs.mjs`（+⑳）·
审计 **§4.157** · PITFALLS **§4.220–PITFALLS §4.221** · skill **§147** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.158 清掉 §4.88 登记的**三项「未审计」遗留** —— 其中 `ADR-0021` 的 CI 数字**已过期**；并把 `docs/superpowers/` **纳入扫描面**（2026-10-08）

### 一、动因

§4.88 的「文档分诊」表里登记了 **3 项「未审计 ⇒ 遗留」**：`docs/superpowers/` 的那份设计文档、
`ADR-0021`、`ADR-0023`。本轮**逐字审完**并清掉。

### 二、逐项结果

| # | 遗留 | 结果 |
|---|---|---|
| ① | `docs/superpowers/` 的设计文档 | **无失真**：6 个路径 token **全部有效**；`__MELLOW_ENGINE_API__` / `__MELLOW_IMAGE_ACTIONS__` **都在代码里**（`core.ts` / `App.tsx` / `image/widget.ts` / `image/engineApi.ts`）；计划映射 `T-0205` / `T-0405` / `T-0508` 都在 codex 计划里；`spec image-workflow §4/§6/§7/§9/§11` 与 `spec document-file-safety §8` 都指向**存在**的节。⚠️ 但它的快照声明写着「**不在任何护栏的扫描面内**」⇒ 见第四节 |
| ② | `ADR-0021` | ⚠️ **3 个数字已过期**（见下） |
| ③ | `ADR-0023` | **无失真**：`nativeMenu.ts` / `menu.rs` / `Cheatsheet.tsx` / `menuSchema.ts` / `layout-golden.json` **都在**；D3/D4/D9 的「已落地」与代码一致 |

**ADR-0021 的过期数字**（按当前仓库**现读**）：

| 原文（2026-08-17 快照） | 现状 |
|---|---|
| 「**5 job** 全绿」 | **8 job**（新增 `parity-guard` / `windows-parity-guard` / `rust-check-macos`） |
| 「wrapper **14**」 | **19** |
| 「editor-engine（**486**）」 | **1318** |

⇒ **结论（三平台全绿）仍成立，变的是规模**。按 ADR「**只追加、不改写**」惯例：**保留原文 + 追加更正块**。

### 三、⚠️ 一处**观察但不擅自补**（如实登记）

`.github/` 下的**每版仓库存档**（约定见 master-plan 第二十轮）。实测：从 `v1.4.8` 起 **35 份齐全**，
**只有 `v1.5.8` 缺**（`ce56430`，2026-09-13）。⚠️ 该文件**无功能作用**（release body 由
`release-template.md` + `git log` 生成）⇒ 属**归档缺口**；**没有任何护栏管它**。
⇒ **登记为观察**，**不擅自补写**（补写 = **事后编造发布说明**）。

### 四、处置：把 `docs/superpowers/` **纳入扫描面**（闭合 §4.89 的登记缺口）

`verify-doc-code-refs.mjs` 的「**反引号路径必须存在**」判据原只扫 `docs/architecture` ⇒
**扫描面扩到 `docs/superpowers`**（用 `walk` 递归，兼容嵌套的 `specs/`）；下限仍 ≥20（实测扩容后仍满足）。
并**更正**该文档里那句**已部分过期**的「不在任何护栏的扫描面内」，**如实声明仍未覆盖的边界**
（`DOC_GLOBS` 的另两项判据仍不含本目录）。

### 五、验证

**注入验证 2/2**：① `docs/architecture` 里的合法路径改成不存在的 ⇒ 红（**原有**扫描面）；
② `docs/superpowers` 里的合法路径改成不存在的 ⇒ 红（**新扩的扫描面真的生效**）。还原后绿。

### 六、教训

1. **「登记为遗留」不会自己消失** —— §4.88 登记了 3 项，**两周后仍未审**；清掉它们的成本很低
   （逐字读 + 现读核对），**收益是「遗留表变短」**。
2. **扫描面用「目录」写死时，新增同类目录会静默漏掉** —— `docs/superpowers` 被漏了两周，
   而它**自己**在快照声明里写了「我不在扫描面内」（**自述准确，但没人据此行动**）。
3. **「已过期的数字」在 ADR 里要用「追加更正块」处理**，**不要**改写原文（ADR 只追加）。
4. **无功能作用的归档物也要登记** —— **不要**因为「反正没人读」就忽略；但也**不要**事后编造内容。

### 七、产物

`docs/adr/ADR-0021-platform-build-matrix-pass.md`（追加更正块）·
`docs/superpowers/specs/2026-08-11-image-file-ops-design.md`（更正声明）·
`tests/parity/verify-doc-code-refs.mjs`（扫描面扩容）· 审计 **§4.158** · PITFALLS **§4.222–PITFALLS §4.223** ·
skill **§148** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.159 `docs/architecture/README.md` 的索引**漏了 `extension-api.md`**（7 个 `.md` 里列 5）+ `AGENTS.md` 的 `tests/` 段只列 **2/7**（2026-10-08）

### 一、动因

上一轮把 `docs/superpowers/` 纳入扫描面（§4.158）。本轮看**同一批「清单类」文档**里两个**只被查了一半**的：
`docs/architecture/README.md` 与 `AGENTS.md`。

### 二、实测两处

| # | 位置 | 现状 | 事实 |
|---|---|---|---|
| ① | `docs/architecture/README.md` 的「## 文档」索引 | 列 **5** 个 `.md` | 目录里有 **7** 个 ⇒ **漏 `extension-api.md`**（106 行，实打实的「Extension API 架构」） |
| ② | `AGENTS.md`「目录约定」的 `tests/` 段 | 列 **2** 个 | `tests/` 有 **7** 个顶层目录 ⇒ **漏 `benchmark/` 等 5 个** |

⚠️ **为什么都没被发现** —— 两处的**判据都只覆盖了一半**：

- ① 的护栏只查**反引号里的路径**，而这张索引写的是 **markdown 链接** ⇒ **索引完整性从来没有判据**；
- ② 的护栏只查 `packages/` 段（**双向穷举**），`tests/` 段**没查** ⇒
  **同一棵树里一段有护栏、一段没有**，读者无法分辨哪段是穷举。

⚠️ ② 尤其讽刺：**AGENTS.md 自己的规则 14** 要求「Typora 1.14.9 是功能和 UX 验收基线」，
而**对照 harness 就在 `tests/benchmark/`** —— 治理文件**没列它**。

### 三、处置

1. 架构索引补上 `extension-api.md`（**6 行 + `README.md` 自身 = 7**）；
2. `AGENTS.md` 的 `tests/` 段**列全 7 个**，并**声明两段都自称穷举、都由护栏双向锁定**；
3. 判据：
   - **架构索引双向**：`docs/architecture/README.md` 的**目录内** markdown 链接 **==** 目录里的 `.md`
     （排除 `README.md` 自身）+ 下限 5 + canary 三向（含「**外链 / 锚点不算**」）；
   - **`AGENTS.md` 两段双向**：把原「只查 `packages/`」的块**扩成 `packages/` + `tests/`**（各自下限）。

### 四、验证

**注入验证 4/4**：① 索引删 `extension-api.md` 行 ⇒ 红；② 索引加一条不存在的 `.md` ⇒ 红；
③ `AGENTS.md` 的 `tests/` 删 `benchmark/` ⇒ 红；④ 加一个不存在的目录 ⇒ 红。还原后绿。

### 五、教训

1. **「同一棵树里两段，一段有护栏一段没有」= 读者无法分辨** ——
   护栏的**覆盖边界必须与清单的声明对齐**（都自称穷举，就都要双向锁）。
2. **判据的形态要与文档的形态对齐** —— 索引写的是 **markdown 链接**，而判据只认**反引号**
   ⇒ **形态不匹配 = 判据看不见它**（与 §4.156「散文提及不算声明」同族：**形态决定判据能不能看见**）。
3. **治理文件的清单缺项，影响的是「任务入口」** —— `AGENTS.md` 是所有任务的**第一份必读**；
   它没列 `tests/benchmark/`，新 agent 就**不知道对照 harness 在哪**（而规则 14 要求用它）。

### 六、产物

`docs/architecture/README.md` · `AGENTS.md` · `tests/parity/verify-doc-code-refs.mjs`（+架构索引判据；AGENTS 块扩容）·
审计 **§4.159** · PITFALLS **§4.224–PITFALLS §4.225** · skill **§149** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.160 「零跨包消费者的包」**数量对、对象错**（3 写成 4 少一个）+ 一条「待裁决」的**前提已过期**（2026-10-08）

### 一、动因

前几轮查「清单不完整」。本轮从 `verify-package-conventions.mjs` 报的「`test(s)/` 已登记缺口 **3** 个」出发，
**往上追它的依据**。

### 二、实测两处

**① 「零跨包消费者的包」：数量对、对象错**

| 位置 | 写的 | 事实 |
|---|---|---|
| 本登记表**第 14 行** | 「**3 个零跨包消费者的包**（`document-model` / `shared` / `workspace`）」 | 零消费者的是 **4 个**（`PKG_NO_CONSUMER_EXEMPT` 四条 = 上述三个 + **`editor-react`**） |
| `ADR-0032 Q3`（**Accepted**） | 同上（标题与正文都写「3 个」） | 同上 |
| 审计 §4.95 | 「**4 个**包零跨包消费者」（表里 4 行，含 `editor-react`） | ✓ 与豁免表一致 |

⇒ **「3 个待裁决的」被写成了「3 个零消费者的」**：**数量对、对象错**。
后果：`editor-react` **只在豁免表里**（`PKG_NO_CONSUMER_EXEMPT`），
**在治理文档里查不到它的分诊** —— 它是「**有意预留**（阶段 2）」，与另三个的「**待裁决**」**性质不同**。

**② 一条「待裁决」的**前提已过期****

审计 §4.100 的处置第 3 点写：3 个缺测试的包「**是否补测取决于它们的去留**（**待裁决**）」。
而**去留已在 §4.95 裁决**（登记表第 14 行 = **ADR-0032 Q3 的 C3：保留 + 触发条件**）
⇒ **「待裁决」的前提已过期**；补测的**触发条件**随之明确 = **该包被真正接线时**（零消费者状态解除）。

⚠️ 且该标记**没有登记表行**（本表 17 行的「出处」列里**没有 §4.100**）——
违反表头纪律「**本文档此后不得新增未登记的裁决项**」。

### 三、处置

1. 更正**登记表第 14 行**：写明「零消费者 **4** 个 / 待裁决 **3** 个」，并把 `editor-react` 纳入（注明「有意预留 ⇒ 不待裁决」）；
2. **`ADR-0032 Q3` 追加更正块**（ADR **只追加、不改写**）；
3. 更正**审计 §4.100** 的「待裁决」（去留已裁 ⇒ 触发条件明确；该缺口**由第 14 行覆盖**，**不新增行**）；
4. 更正 `verify-package-conventions.mjs` 的注释（同 ① ②），并注明 **`PKG_CONTRACT_GAPS` 已随 `CONTRACT.md` 补齐而移除**；
5. **判据 ㉑**：**`PKG_NO_CONSUMER_EXEMPT` 的每个包名，必须出现在本登记表的区间里**
   （+ 条目数下限 3 + canary 三向）⇒ 零消费者包的分诊**必须在登记表里可发现**。

### 四、验证

**注入验证 2/2**：① 登记表第 14 行删掉 `editor-react` ⇒ 红；② 往豁免表加一个登记表里没有的包 ⇒ 红。

⚠️ 我最初写的 ② 用例（「删掉 `shared`」）**没红** —— 因为 `shared` 在登记表区间**别处仍出现**（第 14 行的触发条件那句）
⇒ **判据正确地没报**（它查的是「是否在区间里**出现**」，不是「在某一行」）。⇒ **是用例本身不对，不是判据不对**（已换用例）。

### 五、教训

1. **「数量对、对象错」是最难发现的一类** —— 「3 个」这个数字**没错**（确实 3 个**待裁决**），
   错的是**它描述的对象**（零消费者的是 4 个）⇒ **凡写「N 个 X」时，要问「X 的定义与实测一致吗」**。
2. **「待裁决」会随前提消失而过期** —— 前提（去留）已裁 ⇒ 标记应消失或改写为**触发条件**；
   **只删标记不写触发条件 = 把「待裁决」变成「没人管」**。
3. **纪律的价值在于「可发现」** —— 一条只写在散文里的处置，在登记表里**查不到** ⇒
   下一个审计者会**重新发现它**。

### 六、产物

`docs/qualification/release-blocker-audit-2026-09-25.md`（第 14 行 + §4.100）·
`docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md`（追加更正块）·
`tests/parity/verify-package-conventions.mjs`（注释更正）· `tests/parity/verify-doc-code-refs.mjs`（+㉑）·
审计 **§4.160** · PITFALLS **§4.226–PITFALLS §4.227** · skill **§150** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.161 `app-core/README.md` 的「导出 **124** 个符号」是**旧值**（实际 **130**）—— 13 个同类 README 的数字**此前没有任何判据**（2026-10-08）

### 一、动因

前几轮查「清单 / 判据只覆盖一半」。本轮从 `verify-package-conventions.mjs` 的**包 README** 出发 ——
它的判据只查**文件存在**，**不查内容**；而 **13 个**包 README 都写着「`src/index.ts` 导出 **N** 个符号」。

### 二、实测

| 包 | README 声称 | 实测（具名导出） |
|---|---|---|
| **`app-core`** | **124** | **130**（36 条 `export {}` 语句、**130 个唯一名字**） |
| 其余 **12** 个 | — | **全部一致** ✓ |

⇒ 只有 `app-core` 一处**过期**（差 6）。⚠️ 该数字**会随代码漂移**（每次加导出都要改），
而**此前没有任何判据**守它。

⚠️ 另核：`app-core/README.md` 的接口表表头本就写着「**代表**导出」⇒ 它是**选摘**（57 个名字），
**不是**全部 130 个 —— **措辞是对的**（本轮只修数字，并把「非全部」补进正文以免误读）。

### 三、处置

1. `app-core/README.md`：**124 → 130** + 更正说明；
2. **判据 C6**（`verify-package-conventions.mjs`）：**凡 `packages/*/README.md` 写「导出 N 个符号」，
   N 必须 == 该包 `src/index.ts` 的具名导出数**。
   **计数口径**（判定与 canary **共用**）：**计入** `export {…}` / `export type {…}` 与
   `export <decl>`（含 `async` / `declare`）；**不计入** `export * from '…'`（**转发**）。
   ⇒ 该口径与 13 个 README **全部吻合**（逐包实测）。
3. ⚠️ **连带修掉一处「手写计数」**：本护栏的收口行原**手写**「canary **5** 项全绿」，而实际只有 **4** 条断言
   （新增 C6 的 4 条后应为 **8**）⇒ **手写的计数必然漂移**。改为**从代码派生**（`canary()` 计数）⇒ 现打印 **8**。
   ⚠️ **量具教训**：我最初两次枚举都算错（漏 `export type {}` / `export async function`），
   得出「**5 个包不一致**」的**假结论**；修正后只剩 **1** 处 ⇒ **「判据说不一致」时，先验量具。**

### 四、验证

**注入验证 3/3**：① `app-core` 的 130 改回 124 ⇒ 红；② `settings` 的 17 改成 18 ⇒ 红；③ `export` 的 18 改成 99 ⇒ 红。还原后绿。

### 五、教训

1. **「数字」是最容易漂的东西，而它往往没有判据** —— 13 个 README 的数字**只有一个错**，
   但**错了没人知道** ⇒ **凡写数字，就要有一条能从真值源现算的判据**。
2. **判据的「计数」自己也会漂** —— 本护栏收口行的「canary 5 项」**本来就是错的**（实际 **4**）。
   ⇒ **能派生的就别手写**（同 §4.153 的「合计 = 各包之和」）。
3. **量具错了会给出「假的不一致」** —— 我两次枚举都漏形态，一度得出「5 个包不一致」；
   ⇒ **判据报「不一致」时，先验量具**（同 PITFALLS §4.213「正则字符类要按数据来」）。

### 六、产物

`packages/app-core/README.md` · `tests/parity/verify-package-conventions.mjs`（+C6；收口行改为**派生计数**）·
审计 **§4.161** · PITFALLS **§4.228–PITFALLS §4.229** · skill **§151** + 自查清单 +2 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.162 与 Typora 差距的**全量再评估**（2026-10-08）—— 附**三条被否的假设**与一处**再收窄**

### 一、四层 + 门禁的当前状态（全部**实跑**）

| 面 | 现状 |
|---|---|
| ① 台账（发布门禁） | **NO-GO**：**9 项未闭环**；`PASS-E = 0/50` |
| ② 偏好矩阵（`DEFAULT_OPTIONS`，84 键） | `implemented **40** / gap **38** / n/a **6**`；gap 的 behavior = **`matches-default` 30** / **`differs` 6** / **`n/a` 2**；`deviation` = `deliberate 2` / **`undecided 5`** |
| ③ 面板独有面（47 键） | `equivalent **36** / gap **4** / n/a **7**`；gap 的 `blockedBy` = `precondition 1` / `adr-pending 3` |
| ④ 第三面（缝隙，15 键） | `preference-like 4` / `warning-suppression 5` / `view-state 6` |
| ⑤ D 表 | **40** 条声明行 |
| ⑥ ADR-0034 | **Proposed**，**12 问**（Q1–Q13，Q9 已排除） |

### 二、结论：**可自主面 = 0**（与前几轮一致；本轮把「**有动作的**」逐条点清）

- ② 的 38 条 gap：**30 条 `matches-default`**（Mellow 硬编码的正是 Typora 默认 ⇒ 实现 = 加**没人要的开关**）；
  **6 条 `differs`** = **5 条 ADR-0034 待裁决** + **1 条 `presetSpellCheck`**（→ 台账 `P0-EDITOR-005`，`runtime-verification-pending`）；
  **2 条 `n/a`** = 「文件库」（见第三节 ①）。
- ③ 的 4 条 gap = **1 precondition + 3 adr-pending**（**全阻塞**）。
- ⑥ 的 12 问 = **待用户裁决**。

⇒ **能自主推进的：0**。剩余全部是 **ADR-0034 的 12 问** / **ADR-0026 Q3** / **第三面 `preference-like` 4 键** / **6 项 `ux-gate` 人工会话**。

### 三、⚠️ 三条**被否的假设**（如实记录 —— 免得下一个人重做）

① **「File Library」是不是一个「只在矩阵里」的隐形缺口？** —— **否**。
   Typora 1.14.9 **确有**「File Library」功能（面板里一整节：`libraryFileFilterMode` = supported/custom +
   `libraryFileFilterPatterns`），Mellow 完全没有；**但 master-plan 2026-10-07 已明写处置**：
   「Mellow 整体无「文件库」功能 → 行为不可比，**不进工作清单**」⇒ **不是「未登记」，是「已决定不做」**；
   且 **PRD §133 的 P0 范围不含它**（本轮复核）。
   ⇒ **完善**：把该**决定出处**补进矩阵那 2 条的 `note`（此前只有「Mellow 无对应实现」，读者找不到「谁决定不做」）。

② **`gap` + `behavior: n/a` 是不是词表错误？** —— **否**。`verify-settings-contract.mjs` **显式允许**该组合
   （`['matches-default','differs','unverified','n/a']`）⇒ **有意**。
   ⚠️ 但**报「gap 38」时必须知道其中 2 条属此类**，否则**虚高**（已写进 ① 的 note）。

③ **PRD §133 的 60 条 P0 是否都有台账项？** —— **不能机械判**（master-plan §7 的合同表**形态不一**，多数无「等级」列；
   机械对账会产生大量假阳性）。⇒ **如实声明该核对的边界**，**不做**。

### 四、一处**再收窄**（`zoomLevel`）

面板面最后 1 条 `consumer: unknown` 的 `consumerNote` 补了三条新证据（2026-10-08 实测）：

⑤ **`main.js`（编辑器窗口）里 `zoomLevel` 出现 0 次**（**连写点都没有**）；
⑥ 写入路径来自**面板**（`execCommand('File.option["zoomLevel"] = …')`，`Preferences.*.js` 的 case 151）
   ⇒ 与原有的 `putSetting` 是**同一个写**的两条通道；
⑦ `setZoomLevel(` **只在 `page-dist/static/js/` 出现，`main.js` 里没有** ⇒
   「Electron `webFrame.setZoomLevel` 施加缩放」这条**只解释了面板页自身**，**不能**解释编辑器窗口的缩放。

⇒ **(b)「上游遗留的只写键」证据更强**，但**仍未排除 (a)**（原生按整体设置字典泛化读）；**判定要真机**（本环境无）。

### 五、教训

1. **「看起来像缺口」的东西，先找「谁决定不做」** —— 本节 ① 的假设若直接动手「登记缺口」，
   会**凭空造出一条待裁决**（而它**已经被决定不做**）；
2. **词表的组合要读判据** —— ② 的假设若直接改 `status`，会**违反一条有意允许的判据**；
3. **「能不能机械对账」本身要如实声明** —— ③ **不做**，比**做一个会假阳性的判据**更好（同 PITFALLS §4.229「先验量具」）。

### 六、产物

`tests/parity/fixtures/typora-preferences-matrix.json`（2 条 `note` 补决定出处）·
`tests/parity/fixtures/typora-panel-only-keys.json`（`zoomLevel` 补 3 条证据）· 审计 **§4.162** ·
PITFALLS **§4.230** · skill **§152** + 自查清单 +1 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.163 「文件搜索」这一族的**第三个键**遗留未闭环 —— 实装 `files.searchRegex`（2026-10-08）

### 一、发现

第三面（`tests/parity/fixtures/typora-persisted-uncovered.json`）的 `fileSearchUseRegexp` 条目里，
`§4.145` 当时自己写着一句：

> Mellow 对应物 = 侧栏的「正则」复选框（`apps/desktop/src/App.tsx` 的 `searchRegex`，**仍不持久化**，见审计 §4.145 残留）。

而**同族的另两个键**（`fileSearchCaseSensitive` / `fileSearchWholeWord`）在 §4.145 就已经实装持久化
（`files.searchCaseSensitive` / `files.searchWholeWord`）。⇒ 这是「**同一族的三个键，两条已闭环、第三条被写进注释却没进处置清单**」的残量形态。

### 二、取证（一手，本机 Typora 1.14.9 / 7785）

在 `TypeMark/appsrc/main.js` 上实测：

| 键 | `putSetting` 次数 | 在 `DEFAULT_OPTIONS` | 在 `Preferences*.js`（面板） |
|---|---|---|---|
| `fileSearchCaseSensitive` | 1 | **在** | 0 命中 |
| `fileSearchWholeWord` | 1 | **在** | 0 命中 |
| `fileSearchUseRegexp` | 1 | **不在** | 0 命中 |

① 三个键**都**被 `JSBridge.putSetting(…)` 写入 ⇒ Typora **都持久化**（这解释了为什么三个复选框的行为在 Typora 侧一致）；
② 三个键**都不在**偏好面板 ⇒ 都是**面板状态**，不是 Preferences 项（与 §4.145 的判定一致）；
③ **只有 `fileSearchUseRegexp` 不在 `DEFAULT_OPTIONS`** ⇒ 它的默认值**不能**从该表读。
   从消费点读：`this.useRegexp = File.option.fileSearchUseRegexp`，而
   `File.option = i.extend(File.option, e || window._options)` ⇒ 从未设过时该值为 `undefined`
   ⇒ 复选框未勾选 ⇒ **有效默认 false**（与另两个的 `!1` 同向）。

⚠️ **量具纠错（本轮实测）**：首次用**非贪婪**正则
`/DEFAULT_OPTIONS\s*=\s*\{[\s\S]{0,20000}?\n\s*\}/` 提取默认值表，它在**第一个嵌套 `}`** 处就截断
（提取到的 body 仅约 400 字符），于是得出「**三个键都不在** `DEFAULT_OPTIONS`」的**假结论** ——
若照此下判断，会把 `fileSearchCaseSensitive` / `fileSearchWholeWord` 也误判成「缝隙里的键」。
改用**括号配平**提取后（body **1682** 字符 / 约 **84** 键）真相是「**两个在、一个不在**」。
⇒ 教训：**量具的「截断」比量具的「缺失」更危险** —— 缺失会报错，截断会给出一个看起来正常的假值。

### 三、处置

1. `packages/settings/src/index.ts`：新增 `files.searchRegex`（`toggle` / `storageKey: mellow.file.searchRegex` /
   `defaultValue: false` / `applyCommand: 'settings.searchOptions'`），并把该组注释从「两个选项」改写成
   「三个选项」，补上「哪个键在/不在 `DEFAULT_OPTIONS`」与「有效默认 false 的推导」；
2. `apps/desktop/src/App.tsx` 三处接线：
   - `useState(false)` 字面量 → `useState(() => readBoolSetting('files.searchRegex', false))`；
   - `case 'settings.searchOptions'` 的 state 同步补 `setSearchRegex(…)`（设置页与面板复选框是两个入口）；
   - 复选框 `onChange` 补 `persistBoolSetting('files.searchRegex', …)`；
3. `packages/i18n/src/messages.ts`：zh / en 各 +2 键（`settings.file.searchRegex` + `…Desc`）⇒ 目录 **855 → 857**；
4. 第三面夹具 `fileSearchUseRegexp` 的 `reason` 更新为「✅ 已实装持久化（`files.searchRegex`）」，
   并**保留它在本面**（本面登记的是「不在矩阵与面板任一面」这一事实；**是否进矩阵**仍是待裁决项）。
5. **默认行为不变**：此前是字面量 `false`，现默认 `false`。

### 四、判据（`verify-sidebar-contract.mjs` ㉟）

判据**从设置声明派生**，不写死 id 清单（写死的话新增第四个键时判据够不着）：

- 凡 `id: 'files.search*'` 的设置，必须 ①被侧栏 `persistBoolSetting('<id>', …)` 回写
  ②被 `readBoolSetting('<id>', …)` 读入面板 state；
- 防空转下限：派生出的 id 数 **≥3**；
- 字面量回退不得复活：`const [search(Regex|Case|WholeWord)…] = useState(false)` 不得再出现；
- 三条 canary：① 抹掉 `files.searchRegex` 的回写 ② 初始化退回字面量 ③ 整行删掉声明使派生面收缩。

⚠️ **首版判据是假门禁（靠 canary ② 当场抓到）**：字面量判据最初写成
`/const \[searchRegex\]\s*=\s*useState\(false\)/` —— 而**真实形态**是
`const [searchRegex, setSearchRegex] = useState(false);`（**有解构的第二位**）⇒ 该判据**永远匹配不到**，
即使把修复整个回退掉也照样绿。已改为容许解构位（`[^\]]*`）并由 canary ② 锁住这个形态。

**注入验证**：三处破坏（① 回写改 `noop()` ② 初始化退回 `useState(false)` ③ 删掉设置声明）
**全部转红**，还原后**转绿**（3/3）。

### 五、教训

1. **「同族项只做了一半」是最隐蔽的残量形态** —— §4.145 把 `searchRegex` 写进了代码注释，
   却没写进处置清单，于是它在两个面上都「看起来已被提到」，实际从未闭环。凡「同族的 N 个键」
   的处置，**必须逐键给出闭环证据**，不能以「已处理该族」收口（同 PITFALLS「已处置」那条）。
2. **量具截断 → 假结论**：非贪婪正则配嵌套结构会静默取到前缀。提取带嵌套的对象字面量必须**括号配平**。
3. **判据要容许解构位**：`const [a] = …` 与 `const [a, setA] = …` 是同一件事的两种写法，
   只按前者写的判据是**静默假门禁**（本仓第 N 次同型）。

### 六、产物

`packages/settings/src/index.ts`（+`files.searchRegex` + 注释改写）· `apps/desktop/src/App.tsx`（三处接线）·
`packages/i18n/src/messages.ts`（zh/en 各 +2）· `tests/parity/fixtures/typora-persisted-uncovered.json`
（`fileSearchUseRegexp` 的 `reason`）· `tests/parity/verify-sidebar-contract.mjs`（判据 ㉟ + 3 canary）·
审计 **§4.163** · PITFALLS **§4.231–PITFALLS §4.233** · skill **§153** + 自查清单 +3 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.164 第三面的 `listSortType`/`treeSortType` **没引用 `D-AG`** —— 读者会重新把它当缺口；并抓到 **parity 数据夹具从来不在 D 引用源里**（2026-10-08）

### 一、发现

沿 §4.163 的「**同族只做了一半**」模式继续排查时，看第三面的最后 2 条 `preference-like`
（`listSortType` / `treeSortType`）：它们是「**待裁决：要不要进矩阵**」，但 `reason` 里
**既没有「Mellow 对应物」**、**也没有引用任何 D 编号**。
而**矩阵**的 `sortType` 条目**已经**用 **`D-AG`** 承载「排序**形态**差异已被裁决为有意」。

⇒ 从**第三面**读这两个键，读者会得到「Mellow 不支持分模式排序 ⇒ **缺口**」的结论 ——
而这件事 **2026-09-30 就已被 `D-AG` 裁决**。**同一个决定，一个登记面写了、另一个没写。**

### 二、取证

1. **Mellow 确实共用一份排序设置**：`packages/app-core/src/fileList.ts` 第 94 行
   `sortEntries(entries.value, { ...treeOptions, folderFirst: false })` —— **列表模式复用 `treeOptions`**；
2. **Typora 分两份**：`putSetting("listSortType", …)` 与 `putSetting("treeSortType", …)`（§4.146 已量）；
3. **`D-AG`（master-plan 第 1426 行）原文**：
   「侧栏排序菜单的**形态** | **保留 Mellow 形态**（4 个可勾选键 + 升序/降序开关），不改为 Typora 的 8 条平铺 |
   … **功能已等价且有护栏**（`FileTreeOptions` 的 4 键 × 2 方向 = Typora 8 条的同一组合集；
   `verify-sidebar-contract.mjs` 锁 4 个排序项）」

⇒ 「一份 vs 两份」属**形态差异**，**已被裁决为有意**，**不是缺口**。

⚠️ **顺带量到一件事**：`verify-release-gate.mjs` 的 `REF_SOURCES` 此前只含
**master-plan / 审计文档 / `docs/adr/*.md`** —— 而 **parity 数据夹具**（台账 / 矩阵 /
面板独有键 / 第三面）**都在用 `D-` 编号指裁决**，却**从来没有任何东西核对过**。
即「D 表自称唯一可发现处」这条判据，**对整整一类引用源是空的**。

### 三、处置

1. 第三面 `listSortType` / `treeSortType` 的 `reason` 补上
   「**Mellow 对应物 = `FileTreeOptions.sortBy`/`sortAsc`（`mellow.fileTree.options`）**」
   + 「该形态差异**已由 `D-AG` 裁决为有意 ⇒ 不是缺口**」；
2. `REF_SOURCES` 纳入 **`tests/parity/typora-parity-ledger.json` + `tests/parity/fixtures/*.json`**。
   ✅ 纳入时**全部已声明**（实测 `D-AD`/`D-AG`/`D-AK`/`D-AO`/`D-B`/`D-AL`/`D-AM`/`D-C`/`D-D`/`D-H`/`D-N`/`D-R`/`D-S`）
   ⇒ **没有既存缺陷**，这一条纯粹是**补扫描面**。
   ⚠️ **刻意不含 `tests/parity/verify-*.mjs`**：它们含**三个两位字母的合成编号**（护栏自身的 canary **负样本**），
   本就**不该**被声明 —— 纳入会把**负样本判成缺陷**。
   ⚠️ 本节**刻意不写出那三个编号的字面量**：**审计文档本身是引用源**，写出字面量就会**被本条判据命中**
   （本轮实测：初稿写了，`npm run parity` 立刻报三个「被引用但无声明行」—— 见 §五·4）。

### 四、判据与注入验证

把「引用集收集」抽成**纯函数** `collectRefs(sources)`、把判定抽成 `isDangling(id)`（canary 与
主判据**共用同一谓词**），并补：

- **防空转下限**：`REF_SOURCES` 里的 parity 数据文件 **≥4**（台账 + 3 个夹具）——
  否则「夹具里的 D 引用也被核对」只是写在注释里；
- **canary ①（正样本）**：`collectRefs(['…/typora-panel-only-keys.json'])` 必须含 **`D-AL`**
  （该编号**只在**该夹具里出现）⇒ 证明夹具**真的进了引用集**；
- **canary ②（负样本）**：`isDangling(<一个两位字母的不存在编号>)` 必须为真；
- **canary ③（反向）**：`isDangling(<任一已声明编号>)` 必须为假。

**注入验证（3/3 + 1 次「非计划内」）**：往 **夹具 / 台账 / 矩阵** 各**种一个未声明的合成编号**
⇒ **全部转红**；还原后**转绿**。
**另有一次非计划内的转红**：本节初稿把护栏 canary 的那三个编号**字面**写进了审计文档 ——
而审计文档**本身是引用源** ⇒ `npm run parity` **当场报三个「被引用但无声明行」**。
⇒ 这既是本判据**真实生效**的证据，也是一条新教训（见 §五·4）。（第二次尝试台账注入时首版锚点 `"P0-"` **未命中** ⇒ 替换静默失败、脚本如实报
「替换未生效」而不是假绿 —— 换锚点 `"updatedAt"` 后通过。）

### 五、教训

1. **「已裁决」的编号必须出现在****每个**会让人重新起疑的登记面** —— 矩阵写了 `D-AG`、
   第三面没写 ⇒ 从第三面看它就是「未裁决的缺口」。同 §4.162（File Library 补决定出处）：
   **决定的可发现性不是「文档里某处有」，而是「读者会去看的那一处有」。**
2. **引用源清单就是判据的「扫描面」** —— 加「凡引用必须已声明」这类判据时，必须先问
   「**哪些文件会引用**」；漏掉一类源 = **给那一类开了豁免**（本节漏了整整一类：**数据夹具**）。
   同族：§4.152（豁免按目录）· §4.153（边界按文件）· §4.159（只查 `packages/` 段）。
3. **含负样本 canary 的文件不能进引用源** —— 判据自己的合成样本会被**自己命中**
   （若那个合成编号在引用源里，判据就会要求 master-plan 声明它）。同 §4.156 / §4.157「判据命中自己」。
4. **⚠️ 新形态（本轮实测）：「解释为什么排除」时也**不能写字面量**。**
   本节初稿为了说明「为什么不纳入 `verify-*.mjs`」，把那三个 canary 编号**原样写出** ——
   而**审计文档本身就是引用源** ⇒ 判据**当场命中我自己**。
   ⇒ 通则：**凡进引用源的文件，任何位置（含解释性文字、举例、canary 说明）都不得出现不存在的编号字面量**；
   要么**改用占位写法**（`D-` + 两字母 / `<一个合成编号>`），要么**把它登记进例外表并写理由**。
   ⚠️ 这条**不能**靠「把审计文档排除出引用源」解决 —— 那会**豁免掉最大的一份引用源**（同 §4.152 的教训）。

### 六、产物

`tests/parity/fixtures/typora-persisted-uncovered.json`（2 条 `reason` 补 Mellow 对应物 + `D-AG`）·
`tests/parity/verify-release-gate.mjs`（`REF_SOURCES` 纳入 parity 数据文件 + 纯函数化 + 3 canary + 防空转）·
审计 **§4.164** · PITFALLS **§4.234–PITFALLS §4.237** · skill **§154** + 自查清单 +4 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.165 D 表引用源**扩到全仓** —— 「按类枚举」永远会漏下一类；并抓到**循环判据**与**第 4 次「判据命中自己」**（2026-10-08）

### 一、发现

§4.164 把 parity 数据夹具纳入引用源之后，按同一方法继续问：「**还有哪一类会引用 D 编号却不在扫描面**？」
全仓普查（跳过依赖 / 构建产物 / gitignore 目录）结果：

| | |
|---|---|
| 引用 `D` 编号的文件 | **38 个** |
| 其中**不在** `REF_SOURCES` | **30 个** |

那 30 个包含 **源码注释**（`App.tsx` / `autosave.ts` / `menuSchema.ts` / `SidebarFooter.tsx` / `themes/index.ts` …）、
**spec**（`desktop-ui-design-spec.md`）、**发布说明**（`.github/release-notes-*.md`）、
**qualification 报告**（`tests/qualification/*.md`）、**旧计划**（`.trae/documents/*`，未入库）、
**构建产物**（`apps/desktop/public/editor/engine-*/selectionToolbar.js`，gitignore）。

⇒ **「按类枚举」这件事永远会漏下一类** —— 每补一类，下一类就冒出来（§4.164 补夹具、本轮又冒出 5 类）。

### 二、取证

1. **遍历成本可接受**：全仓 **1178** 个文本文件 / **35.9MB** / 遍历 **42ms**（读入也只需百毫秒级）；
2. **零噪声**：全仓匹配到的**不同** `D` 编号共 **45 个** = **41 已声明** + `D-AN`（例外表）+ **4 个**合成编号；
   **lockfile / 二进制类文件 0 匹配**（无随机字符串误判）；
3. **悬空引用 = 0**（除护栏自身的合成编号）⇒ 现状干净，本次纯粹是**补扫描面**；
4. ⚠️ 顺带查到一处**过期登记**：初版表里列的**第四个**编号 —— 在 HEAD 版本里它**只出现 1 次**，且那处是
   **§4.164 注释里的举例**（散文），**没有任何真实使用**。
   （⚠️ 本节**刻意不写出它的字面量** —— 审计文档**是引用源**，写了就会被 §四 的判据命中，见 `PITFALLS §4.237`。）

### 三、处置

1. `REF_SOURCES` 改为**遍历全仓**，只按「**生成物 / 不入库的目录**」排除
   （`node_modules` / `.git` / `target` / `dist` / `build` / `.cache` / `.workbuddy-ai` / `.trae` +
   `apps/desktop/public/editor/`）。⚠️ **排除项必须写明理由**，否则下一个人会以为漏了。
2. ⚠️ **不按文件排除 `verify-*.mjs`** —— 那会把护栏里**真实的** D 引用（如 `verify-sidebar-contract.mjs`
   的 `D-C`/`D-J`）**一起豁免掉**。改为新增**第三类**表 **`CANARY_SYNTHETIC_IDS`**：
   「**判据的测试数据**」（既非「决定不创建」，也非「泛指占位」）—— **刻意不声明**，但**必须仍被引用**。
3. **删除那个过期条目**（见 §二·4）。
4. 防空转**按类**（下限 **== 实测基线**）：总数 **≥1113**，且 `tests/parity/ ≥31` · `docs/ ≥84` ·
   `packages/ ≥532` · `apps/ ≥64`。⚠️ 首版拍脑袋写了 100，实测 `docs/` 只有 84、`apps/` 只有 64 ⇒
   **当场红**（防空转下限必须**贴着基线**，不能凭感觉）。

### 四、判据与注入验证 —— 本轮**两次被自己抓到**

**⚠️ 自抓 ①（循环判据）**：初版「过期检测」写的是 `if (!referenced.has(id))`。
但 **`CANARY_SYNTHETIC_IDS` 的声明块本身写在 `verify-release-gate.mjs` 里**，而该文件**是引用源**
⇒ 编号**永远「被引用」** ⇒ **过期检测永远是绿的**（退化成空真）。
**注入验证第 ④ 项（往表里加一个从未被引用的编号）当场没红**，于是抓到。
⇒ 修法：新增 `stripDeclBlocks()`，把**两个例外表的声明块**从自身文本里剥掉，过期检测改用
**剥离后**的引用集 `usedOutsideDecl`。

**⚠️ 自抓 ②（判据命中自己 —— 本会话第 4 次）**：为「剥离是否生效」写的机制自检是
`stripDeclBlocks(raw).includes('CANARY_SYNTHETIC_IDS = new Map')` —— 而**这个字符串也出现在
`DECL_BLOCKS` 自己的定义里**（**剥离器的定义含有它要匹配的文本**）⇒ `.includes()` **恒真** ⇒
canary **永远失败**。⇒ 改为**行首锚定正则** `/^\s*const CANARY_SYNTHETIC_IDS = new Map\(\[/m`
（数组字面量那行以 `/const` 开头，锚定后不会命中）。

**注入验证（4/4）**：
① **源码注释**里种一个未声明的编号 ② **`docs/specs`** 里种一个 ③ 从 `CANARY_SYNTHETIC_IDS` **删掉一个条目**
（该编号立刻变悬空）④ 往表里**加一个从未被引用的条目**（过期检测）⇒ **全部转红**，还原后**转绿**。
（第 ① 项首版锚点 `^//` 未命中 ⇒ 替换静默失败、脚本**如实报「替换未生效」而不是假绿**；换锚点后通过。）

### 五、教训

1. **「按类枚举」永远会漏下一类** —— 能「**遍历 + 排除**」就不要「枚举」；**排除项必须写理由**。
   （本节：补完夹具又冒出 5 类；同族 §4.152 / §4.153 / §4.159 / §4.164。）
2. **「声明块本身算不算引用」决定判据是否循环** —— 凡「某物**必须被引用**」的判据，若该物
   **写在被扫的面上**，就必须**先把它自己的声明剥离**，并**为「剥离本身」配 canary**。
3. **剥离器的定义里含有它要匹配的文本** ⇒ 机制自检**不能用 `.includes()`**，要**行首/结构锚定**
   （本会话第 4 次「判据命中自己」；同 §4.156 / §4.157 / `PITFALLS §4.237`）。
4. **「登记进表」≠「有使用」** —— 那个被清掉的条目是「**为了解释而写下的举例**」被误当 canary 登记
   （⚠️ 本节**刻意不写出它的字面量** —— 审计文档**是引用源**，写了会被 §四 的判据命中，同 `PITFALLS §4.237`）。
   ⇒ **凡登记项都要问「它的使用在哪」**，并把这个问题**机器化**（本节的过期检测）。

### 六、产物

`tests/parity/verify-release-gate.mjs`（引用源扩到全仓 + 排除项写理由 + `CANARY_SYNTHETIC_IDS`
第三类表 + `stripDeclBlocks` + 按类防空转 + 6 条 canary）· 审计 **§4.165** ·
PITFALLS **§4.238–PITFALLS §4.240** · skill **§155** + 自查清单 +3 · `MEMORY.md` · `2026-10-08.md`。

---

## 4.166 **本地绿、CI 红**：防空转下限锚在了「本地工作区」而判据跑在「干净检出」（2026-10-08）

### 一、发现

§4.165 推送后 **CI 两个 parity job 双双失败**，而本地 `npm run parity` **全绿**：

```
D 表引用源只枚举出 878 个文件（下限 1113 = 2026-10-08 实测全仓基线）
```

### 二、取证

| 环境 | 枚举到的文件数 |
|---|---|
| **本地工作区** | **1113** |
| **CI 干净检出** | **878** |

差 **235** 个，全部是**本地未跟踪 / 生成物**：

- `.workbuddy/memory/*.md`（4）—— **另一个** AI 工具的数据目录（注意：**不是** `.workbuddy-ai/`）；
- `tests/benchmark/fixtures/`（8）· `tests/benchmark/reports/`（97）· `tests/benchmark/results/`（126）—— **生成物**。

⇒ **四处全部在 `.gitignore` 里**（`.gitignore:24` / `tests/benchmark/fixtures/.gitignore:2` /
`tests/benchmark/.gitignore:3,4`）。**根因不是「漏了一类」，而是「下限锚错了环境」**：
判据真正运行的地方是**干净检出**，我却把基线量在**本地工作区**上。

### 三、处置（**两版，第二版才对**）

**第一版**：把「不入库目录」这一类**补全**（`SKIP_DIRS += .workbuddy`；
`SKIP_PATHS += tests/benchmark/{fixtures,reports,results}/`）⇒ 本地 **877**，**仍 ≠ 878**。

⚠️ **更深的原因**：`tests/benchmark/fixtures/` 整体是生成物（其 `.gitignore` 里是 `*`），
但其中 **`README.md` 是「强制加入」的跟踪文件**（`git ls-files` 可见）⇒ **目录级排除把它误伤了**。

**第二版（最终）**：**改用权威真值源 `git ls-files`**：

- 它就是「**哪些文件在仓库里**」的**定义**；
- **天然排除** gitignore 的生成物，**又天然包含**强制跟踪的文件；
- **本地与 CI 看到同一集合（实测两边都是 878）**；
- ⇒ **不再需要任何目录级排除** —— 依赖 / 构建产物 / 工具数据目录**本来就不被跟踪**。

### 四、教训

1. **防空转下限必须锚在「判据实际运行的环境」上** —— 这里是**干净检出**，不是本地工作区。
   **本地工作区 ⊃ 仓库**（未跟踪 + 生成物）；凡「与文件集有关的下限」，都要问
   「**这个数在干净检出里是多少**」。
2. **目录级排除会误伤「被强制跟踪的文件」** —— 凡「哪些文件在仓库里」这种问题，
   **用权威真值源**（`git ls-files`），**不要自己按目录 / 后缀拼**。
   同族：§4.165（**能遍历就别枚举**）—— 本节是它的下一层：**能问真值源就别自己遍历**。
3. **「本地绿、CI 红」的根因通常就是「环境差异」** —— 而**环境差异最常见的载体就是文件集**。
   ⚠️ 这条反过来也说明：**§4.165 的「遍历全仓」方向是对的，错的是「遍历的根」**。
4. ⚠️ **`git ls-files` 是本仓第一次给护栏引入 git 依赖**（此前护栏全是纯 node 读文件）。
   这是**有意的取舍**：判据的语义是「**仓库里**有没有这个引用」，而**只有 git 知道答案**；
   失败时**响亮报错**（`fail('…要求在有 git 的检出里运行')`），**不静默降级**。

### 五、验证

`git ls-files` 过滤后 = **878**（与 CI 一致）· 门禁绿 · **注入验证 4/4 复跑通过**
（源码注释 / `docs/specs` / 删表项 / 加未被引用的表项 ⇒ 全部转红，还原转绿）。

### 六、产物

`tests/parity/verify-release-gate.mjs`（枚举改 `git ls-files` + 去掉目录级排除 + 下限改 878）·
审计 **§4.166** · PITFALLS **§4.241–PITFALLS §4.243** · skill **§156** + 自查清单 +3 · `MEMORY.md` · `2026-10-08.md`。

---

## 五、本次审计做的改动（非策略性）


1. 台账 6 个未闭环项新增 `blockedBy` 字段（机器可读的阻塞原因）。
2. `verify-release-gate.mjs`：
   - NO-GO 输出改为带阻塞原因，并新增 `Blocked by:` 归类行；
   - **未闭环项未声明 `blockedBy` 即硬失败**（防未来的阻塞原因又只写在散文里）；
   - 新增 `Closure basis:` 一行：声明「不阻断口径」、报出 `实际 PASS-E = 0/50`、
     列出「标 AUTO 却要求 ux-gate」的 4 项、保留 §5.7 的警示；
   - 各配 canary，注入验证：移除一处 `blockedBy` → 门禁抛错；改写 `Closure basis:` →
     护栏报错；均还原后通过。
3. **新增三方一致护栏**（PRD §109 ↔ `packages/editor-engine/src/largeFile.ts` ↔
   `run-benchmark` 的复刻）：大文件模式的「严格大于」语义必须三处同时成立。
   只锁实现与 benchmark 仍可能双双偏离 PRD。注入验证：把 PRD 的 `>5MB` 改成 `>=5MB`
   → 护栏报错；还原 → 通过。
4. 未改动任何状态码、`requiredEvidence`、策略或产品代码。
   （**注（2026-09-30）**：§4.19 的「处置」子节**改了产品代码**
   —— `mdLink.ts` 断链指示补非颜色线索。那是**本节之后的独立跟进**，
   不在「本次审计」的改动范围内，故此条仍成立。）

## 六、结论

- **不发布**：6 项未闭环，且无一项能在本环境闭环（3 项等人工会话、1 项等实现、1 项等裁决、1 项即人工会话本身）。
- **且「6」是门禁口径**：按 master-plan §8 的 V1.0 Exit Gate（三平台全 PASS-E），
  实际是 **0/50 达 PASS-E**；`AUTO` 的含义是「真机体验验收未完成」，不是「已完成」。
- 能自主推进的事项已全部做完；剩余全部需要**人工 UX Gate 会话**或**方案级裁决**。
