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
> - `docs/adr/ADR-0024-release-closure-semantics.md`（状态 **Proposed**）
> - `docs/adr/ADR-0025-evidence-policy-when-baseline-refuses.md`（状态 **Proposed**）
>
> 两份 ADR 各含背景（含实跑数字与一级证据）、待决问题、选项与后果、以及供参考的建议。
> 门禁输出已新增 `Pending decisions:` 行指向它们；护栏锁定「待裁决 ADR 必须存在且状态为
> Proposed」（注入验证：改成 Accepted → 门禁抛错）。
> **在状态变为 Accepted 之前，现有实现保持不动。**

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

## 六、结论

- **不发布**：6 项未闭环，且无一项能在本环境闭环（3 项等人工会话、1 项等实现、1 项等裁决、1 项即人工会话本身）。
- **且「6」是门禁口径**：按 master-plan §8 的 V1.0 Exit Gate（三平台全 PASS-E），
  实际是 **0/50 达 PASS-E**；`AUTO` 的含义是「真机体验验收未完成」，不是「已完成」。
- 能自主推进的事项已全部做完；剩余全部需要**人工 UX Gate 会话**或**方案级裁决**。
