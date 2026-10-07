# ADR-0034 — 偏好默认值 5 项「未登记的待裁决偏离」（highlight / sub·sup / mermaid / zoomByMouse）

**Status:** **Proposed**（2026-10-07）—— 待裁决。

> **本 ADR 为什么是 Proposed 而不是像 ADR-0032 那样自裁**：
> 这 5 项改的是**用户可见的默认行为**（同一份 Markdown 在 Mellow 与 Typora 里**看起来不同**），
> 不是审计派生出来的死代码清理。方案自己也早已写下「**改这些默认会改变既有用户行为，故只登记不擅改**」。
> 常设授权（「全部自行评估、决策、实施」）覆盖的是**审计程序**，
> 而**改变既有文档的渲染结果**是产品决策 —— 猜错的代价由用户承担、且难以回滚。
> ⇒ **本 ADR 只做两件事**：① 把「待裁决」**从散文搬进机器可读的登记处**（这才是真正的缺陷）；
> ② 给出**逐项建议**，使裁决成本降到「看一眼就能定」。

## 背景：本 ADR 为什么存在（**登记处漏了一整条轴**）

项目规则是「**待裁决项必须有 ADR 载体**」，载体是审计文档的「**待裁决项登记表（唯一声明处）**」，
门禁 `verify-release-gate.mjs` 会断言该表存在、每行载体可解析、且 `PENDING_ADRS` **双向**一致。

**实测（2026-10-07，审计 §4.120）**：`tests/parity/fixtures/typora-preferences-matrix.json`
（84 个 Typora 偏好键的**唯一登记处**）里有 **7 条 `deviation`**：

| kind | 项 | 状态 |
|---|---|---|
| `deliberate` | `enableAutoSave`（依 PRD §101）、`showToolbar`（依方案 §5.1 / D-B） | 有据 ✓ |
| **`undecided`** | **`enableHighlight` / `enableSubscript` / `enableSuperscript` / `enableDiagram` / `zoomByMouse`** | **无载体 ✗** |

而这 5 项在 `docs/` 里**只出现在 master-plan 的轮次叙述**（「**5 项待裁决**（方案与 PRD 均未见表述）」），
**审计的登记表里一行都没有** ⇒ 门禁据此报 **`Pending decisions: 无`** ——
即项目在**机器可读的层面声称「没有任何待裁决项」**，而实际上有 5 项。

**这正是 ADR-0029 自己留下的那半句**：登记表头部写着
「护栏**不能**自动发现『新加了 `待裁决` 字样却没登记』—— …**要补上这一半需给标记定机器可读写法**」。
本 ADR 顺带把那半句**在「偏好默认值偏离」这条轴上补上**（见文末「机器可读化」）。

> ⚠️ **两条轴不要混**（矩阵里是两个独立字段，历史上被混谈过）：
> · `deviation`（7 条）= Mellow **有这个设置**，但**默认值**与 Typora 不同；
> · `behavior: differs`（9 条）= Mellow **没有这个设置**，且**实际行为**与 Typora 的默认不同。
> 本 ADR 只处理**前者**里的 5 条 `undecided`；后者见审计 §4.120 的逐项归类。

---

## 逐项事实（全部可复现；默认值取自 `packages/settings/src/index.ts`）

| # | Typora 键 | Typora 默认 | Mellow 设置 id | Mellow 默认 | 可感知差异 |
|---|---|---|---|---|---|
| Q1 | `enableHighlight` | `false` | `markdown.highlight` | **`true`** | `==文字==` 在 Mellow 渲染成**高亮**；Typora 默认按**字面文本**显示 |
| Q2 | `enableSubscript` | `false` | `markdown.supSub` | **`true`** | `~文字~` 在 Mellow 渲染成**下标**；Typora 默认字面显示 |
| Q3 | `enableSuperscript` | `false` | `markdown.supSub` | **`true`** | `^文字^` 在 Mellow 渲染成**上标**；Typora 默认字面显示 |
| Q4 | `enableDiagram` | `false` | `markdown.mermaid` | **`true`** | ```` ```mermaid ```` 在 Mellow 渲染成**图**；Typora 默认按**代码块**显示（需在偏好里开启） |
| Q5 | `zoomByMouse` | `false` | `editor.cmdWheelZoom` | **`true`** | Mellow 下 `Cmd/Ctrl+滚轮`**直接缩放**；Typora 默认不响应 |

**一手证据（本机 Typora 1.14.9 build 7785）**：`TypeMark/appsrc/window/frame.js` 的 `DEFAULT_OPTIONS`
含 `enableHighlight:!1` / `enableSubscript:!1` / `enableSuperscript:!1` / `enableDiagram:!1` / `zoomByMouse:!1`
（均为 `false`）；`Panel.strings` 有对应文案（如 `Enable Diagram` / `Zoom by Mouse`），
说明它们是**用户可开关的偏好**，而非内部状态。

---

## Q1 — `markdown.highlight` 默认是否改为 `false`（对齐 Typora）？

**选项**
- **A1 改为 `false`（对齐 Typora）**：`==x==` 恢复为字面文本。
  **代价**：已依赖高亮的用户文档**外观变化**；且该扩展是 Mellow 已宣传的能力之一。
- **A2 维持 `true`（登记为有意差异）**：Mellow 提供 Typora 默认关闭的扩展能力。
  **代价**：同一份文档两应用**看起来不同**（与「默认界面同样克制」的 §15.1 目标有张力）。
- **A3 维持 `true` 但登记 D + 在设置页文案里点明「Typora 默认关闭」**（折中）。

**建议：A1** —— 理由：`==` 是**非标准 Markdown 扩展**，开启后**改变普通文本的渲染**；
「默认不改写用户没打算当语法用的字符」比「多一个默认开启的语法糖」更符合本项目的 parity 基调。
（若采纳，需同步：`frame.js` 侧无对应项，只改 Mellow 默认值 + 更新矩阵 `deviation` → `deliberate`。）

## Q2 / Q3 — `markdown.supSub` 默认是否改为 `false`？**⚠️ 这两个开关在 Mellow 是合并的**

**结构性事实**：Typora 有**两个独立**偏好（`enableSubscript` / `enableSuperscript`），
Mellow 只有**一个** `markdown.supSub`（`mellow.engine.features.supSub`）
⇒ 「逐项对齐 Typora」在当前设置模型下**做不到**，必须先决定**要不要拆分**。

**选项**
- **B1 拆成两个设置**（`markdown.subscript` / `markdown.superscript`，默认均 `false`）。
  **代价**：设置项 +1、i18n +2、`engineFeature` 通道多一路；**收益**：与 Typora 1:1，可单独取舍。
- **B2 保持合并，两个都关**（默认 `false`）。**代价**：上标能力被一并关掉（`^x^` 不再渲染）。
- **B3 保持合并，维持开启**（登记为有意差异）。

**建议：B1** —— 理由：这两个语法的**风险不对称**（`~` 在中文排版里更常被当作普通字符；
`^` 较少），合并会让用户被迫二选一；拆分后默认都关即可对齐 Typora，且保留可开启的余地。
（若采纳，属**设置模型变更**：需同步 `verify-settings-contract.mjs` 的矩阵条目与 `engineFeature` 白名单。）

## Q4 — `markdown.mermaid` 默认是否改为 `false`（对齐 Typora）？

**选项**
- **C1 改为 `false`**：```` ```mermaid ```` 默认按代码块显示，需手动开启。
- **C2 维持 `true`，登记 D**（Mellow 的**增强**：Typora 需在偏好里开启）。

**建议：C2** —— 理由：渲染 mermaid 是**独立能力的体现**，且**不改变普通文本的渲染**
（只影响**显式写了 ```` ```mermaid ````** 的块）⇒ 不像 `==`/`~`/`^` 那样会「改写用户没当语法用的字符」。
属本仓既有的「**B 级增强**」类别（同 `D-Z` 的 macOS 缩放、`D-AI` 的虚拟化）。
**但必须登记**（D 表新行），否则又是一次「有意差异没进唯一可发现处」。

## Q5 — `editor.cmdWheelZoom` 默认是否改为 `false`（对齐 Typora）？

**选项**
- **D1 改为 `false`**：与 Typora 一致（Typora 的缩放是菜单/快捷键，不是滚轮）。
- **D2 维持 `true`，登记 D**：便利性增强。

**建议：D1** —— 理由：`Cmd/Ctrl+滚轮` 是**易误触**的组合（很多鼠标/触控板手势会触发滚轮事件），
且 Mellow **另有** `Cmd+=` / `Cmd+-` / `Cmd+0` 三档缩放（`D-Z` 已登记），
能力不因关闭而缺失；对齐 Typora 可消除「不小心把编辑器缩放了」这类投诉。

---

## 影响与代价（**若全部采纳建议**）

| 项 | 变更 | 用户可感知 |
|---|---|---|
| Q1 | `markdown.highlight` 默认 `true → false` | `==x==` 不再高亮 |
| Q2/Q3 | 拆分 `markdown.supSub` → 两个开关，默认均 `false` | `~x~` / `^x^` 不再上/下标 |
| Q4 | 不变（登记 D） | 无 |
| Q5 | `editor.cmdWheelZoom` 默认 `true → false` | `Cmd+滚轮` 不再缩放（`Cmd+=/-/0` 仍在） |

⚠️ **既有用户**：若其 `localStorage` 里**没有**该键（即从未改过），改默认值会**立刻改变其观感**。
本仓既有做法是「**默认值变更照实做，并在发布说明里写明**」（先例：`v1.5.x` 的多轮默认值对齐）。
⇒ 裁决通过后需在 `.github/release-notes-v<版本>.md` 里逐条写明。

---

## 机器可读化（**本 ADR 顺带补上的那一半**）

`verify-settings-contract.mjs` ⑭ 节新增两条判据：

1. `deviation.kind === 'undecided'` ⇒ **必须**带 `pendingRef`（形如 `ADR-0034`），
   且该 ADR **文件存在**、状态为 **`Proposed`**（已裁决后必须把 `kind` 改为 `deliberate` 并去掉 `pendingRef`）；
2. `deviation.kind === 'deliberate'` ⇒ **必须**带 `carrier`（非空的「依据在哪」）。

⇒ 从此「矩阵里标了待裁决却没人管」**会红**，而不是像这次一样**静默地让门禁报「无」**。

## 裁决

**待裁决。** 裁决后请：① 更新本 ADR 的 `Status` 为 `Accepted` 并逐问写入结论；
② 把矩阵对应条目的 `kind` 改为 `deliberate`（并去掉 `pendingRef`）/ 或按结论改默认值后同样改 `kind`；
③ 从门禁 `PENDING_ADRS` 移入 `DECIDED_ADRS`；④ 审计登记表第 17 行改为「已裁决」。
