# 发布阻塞项审计（2026-09-25）

**审计结论**：**未完成 → 不发布**。50 项 P0 中 44 项 `AUTO`（门禁视为闭环），
**6 项未闭环**，且其中 **3 项的自身 requiredEvidence 已全部取得**，
仅因一条**全局策略**而未升 PASS-E。

> 本次审计的判定依据全部来自**实跑命令**（`verify-release-gate.mjs` / `verify-parity-ledger.mjs`
> + 台账 JSON + 证据文件存在性），**不采信文档自述**。

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
| 1 | §3（2026-09-29） | `AUTO` 是否阻断发布 / `ux-gate` 是否逐项前置 | **已裁决**（A3 / B1） | `docs/adr/ADR-0024-release-closure-semantics.md` |
| 2 | §3.1 | `P0-PERF-001` 的 5 项口径中有两项是否开放 | **已由 PRD 判定**（宪法已判，无需裁决） | `已处置`（§3.1 记录依据） |
| 3 | §4.3 | 远程图片默认值（安全相关默认值） | **已由两处独立一手证据判定**（Typora 始终加载远程图片且无退出选项） | `已处置`（§4.3 记录 `frame.js` 的 `DEFAULT_OPTIONS`） |
| 4 | §4.4 | **安全验收是否应进入台账**（新增安全域与条目） | **已裁决**（B2：不新增，改在验收文档单列） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q2） |
| 5 | §4.5 | **V1.0 发布时是否把「Apple 凭据缺失」改为硬失败** | **已裁决**（C2：保持警告 + 现状护栏） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q3） |
| 6 | §4.10.1 | **`settings.open` 在 Win/Linux 的菜单入口**（D 还是缺口） | **已裁决**（A3：维持现状 + 理由进 D 表；**证据缺口已注明**）—— D 表载体 = master-plan §12 的 **`D-AF`**，**2026-09-30 已落地**（2026-10-01 复核确认，见 §4.67） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q1） |
| 7 | §4.14 / §4.29–§4.30 | `Allow Magnification` / 「使用主题的字体大小」 | **已处置**（前者已实装；后者「自定义字号」已实装、刻意不对齐 Typora 的 24，已登记 D） | `已处置`（§4.28 / §4.30） |
| 8 | §4.39 | **表格 `invalid` 提示**：Mellow 自有提示 or 从 spec 移除 | **未裁决（留在 ADR-0029）** —— 需产品判断且缺 Typora 对应行为的一手证据 | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q4） |
| 9 | §4.40 | **上传「密钥」的 spec 表述**（不适用 / keychain / UI 禁止） | **已裁决**（E1：改写为「不适用」+ **保留明文残余风险说明**） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q5） |
| 10 | §4.51 | **`tests/visual/actual/*.png` 是否取消 git 跟踪** | **已裁决**（F1：取消跟踪 + 改护栏 + README 同步） | `docs/adr/ADR-0029-audit-pending-decisions-registry.md`（Q6） |

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
   的 §4.1/§4.3 已记录 Windows 基线修复完成，而 §4.4 / §五 仍写「待 runner 确认」；
   §五 还留着**已作废**的「10MB 打开 2.59× 于 Typora」（该 Typora 侧数字实为画提示页的耗时）。
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
