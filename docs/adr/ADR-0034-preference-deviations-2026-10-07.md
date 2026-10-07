# ADR-0034 — 偏好矩阵的 **9 项**「未登记的待裁决偏离」（**默认值轴 5 + 行为轴 4**）

**Status:** **Proposed**（2026-10-07）—— 待裁决。

> **本 ADR 为什么是 Proposed 而不是像 ADR-0032 那样自裁**：
> 这 10 项改的是**用户可见的行为**（同一份 Markdown 在 Mellow 与 Typora 里**看起来不同**，
> 或 Mellow 默认打开/关闭了 Typora 默认相反的能力），不是审计派生出来的死代码清理。
> 方案自己也早已写下「**改这些默认会改变既有用户行为，故只登记不擅改**」。
> 常设授权（「全部自行评估、决策、实施」）覆盖的是**审计程序**，
> 而**改变既有文档的渲染结果**是产品决策 —— 猜错的代价由用户承担、且难以回滚。
> ⇒ **本 ADR 只做两件事**：① 把「待裁决」**从散文搬进机器可读的登记处**（这才是真正的缺陷）；
> ② 给出**逐项建议**，使裁决成本降到「看一眼就能定」。
>
> **命名说明**：文件名是 `ADR-0034-preference-deviations-2026-10-07.md`
> —— 本 ADR 覆盖偏好矩阵的**两条轴**（`deviation` 默认值轴 + `behavior: differs` 行为轴），
> 故用中性的「deviations」而非早期的「default-deviations」。

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
> · `behavior: differs`（8 条）= Mellow **没有这个设置**，且**实际行为**与 Typora 的默认不同。
> **本 ADR 两条轴都管**：默认值轴的 5 条 `undecided`（Q1–Q5）+ 行为轴的 5 条 `undecided`（Q6–Q10）。
> 行为轴另外 3 条**不在此列**，因为它们的处置**已有载体**（见下表）。
>
> **行为轴 8 条的处置分配（依据是既有判定，不是本轮新造的判断）**：
>
> | 项 | 处置 | 依据 |
> |---|---|---|
> | `useTreeStyle` | **deliberate → `D-AK`** | master-plan 轮次表**第四十二轮**已判「有意 differs」 |
> | `wordsPerMinute` | **deliberate → `D-AO`** | 轮次表**第二十九轮**已判「有意取舍（CJK-aware）」 |
> | `presetSpellCheck` | **gap → `P0-EDITOR-005`** | 台账项「拼写检查词典与替换建议」（`IMPL`，未闭环） |
> | `autoEscapeImageURL` / `useRelativePathForImg` | **undecided → 本 ADR Q6/Q7** | 轮次表**第二十七轮**曾判「**真缺陷**」，**第二十九轮只改了措辞、从未重判** ⇒ 必须重新裁决 |
> | `mathFormatOnCopy` / `wordCountDelimiter` | **undecided → 本 ADR Q8/Q10** | 均需先设计或先裁决 |
> | ~~`noLegacyMath`~~ | **已排除 → 不需要裁决** | 2026-10-07 取证推翻原前提（审计 §4.123）：该键的**用户可见语义**是「`\( \) \[ \]` 作数学定界符」、**默认启用**，而 Mellow **已支持** ⇒ 改判 `matches-default`，**Q9 作废** |

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

## 行为轴（`behavior: differs`）的 4 项（原 5 项，`noLegacyMath` 已排除）

> 这一轴的定义是「**Mellow 没有这个设置**，且**实际行为**与 Typora 的默认不同」。
> 与默认值轴的区别：默认值轴**有**设置、只是默认值不同（用户可改）；行为轴**没有**设置（用户改不了）。

## Q6 — `autoEscapeImageURL`：图片路径是否继续**恒做 `%XX` 转义**？

**事实**：Typora `DEFAULT_OPTIONS.autoEscapeImageURL = false`，其 `resolveImagePath` 里
`t(e) = autoEscapeImageURL ? escapeURL(e) : e` ⇒ **默认原样返回**（不转义）。
Mellow **恒做 `%XX` 转义**（空格 / 括号 / `[]` / `#` / `%`）。

**选项**
- **A1 改为不转义**（对齐 Typora）：Markdown 更可读（`![x](my file.png)`）。
- **A2 维持转义 + 登记 D**：`%20` 是**正确 URL 编码**，在 GitHub / VS Code / pandoc 等
  **所有**渲染器里都能工作；不转义只对「会自行解码的渲染器」有效。
- **A3 加设置项**（Typora 有该偏好）。

**建议：A2（维持 + 登记 D）** —— 理由：转义是**互操作性**取向，代价只是源码可读性；
反过来（不转义）会让带空格的路径在**一部分**渲染器里断图。
⚠️ 注意本条与 `useRelativePathForImg`（Q7）**是两件独立的事**（转义 vs 相对/绝对），历史上被并列提及，别合并。

## Q7 — `useRelativePathForImg`：插入本地图片时是否继续**恒写相对路径**？

**事实（一手证据）**：Typora `DEFAULT_OPTIONS.useRelativePathForImg = false`，且
`getLocalRootUrlForInsert() = docMenu.getLocalRootUrl() || (useRelativePathForImg && 当前文件目录) || ""`
⇒ 默认（无 per-doc root）时 root 为空，`resolveImagePath` 走
`if (!useRelativePathForImg || !i || 0 !== e.indexOf(i)) return t(e)` ⇒ **原样返回绝对路径**。
Mellow 在同根时**默认输出相对路径**（`fileTreeRelativePath`）。

**选项**
- **A1 改为写绝对路径**（对齐 Typora）。
- **A2 维持相对 + 登记 D**（可移植性：整个目录搬走仍可用；绝对路径换机器/换路径即**全部断链**）。
- **A3 加设置项**（对齐 Typora 的 `useRelativePathForImg`）。

**建议：A2（维持 + 登记 D）** —— 理由同上（相对路径的可移植性收益 > 「与默认一致」的形式收益），
且 Mellow 的行为**有边界**（只在同根时走相对，跨根仍写绝对）。

> ⚠️ **连带更正（审计 §4.121）**：D 表 **D-AA** 行里写着「`insertLocalImage` 在同根时已默认输出相对路径，
> **与 Typora 该选项默认态一致**」—— 本轮的取证表明**这句「一致」站不住**：
> Typora 在默认态下写的是**绝对**路径。该括号内文字是**未经一手核实**的断言，
> 且与偏好矩阵的 `useRelativePathForImg: differs` **读起来互相矛盾**。
> **D-AA 的裁决（不加菜单开关）不受影响**，但该处措辞已按本仓惯例**就地更正为如实表述**。

## Q8 — `mathFormatOnCopy`：复制公式时给 **SVG** 还是 **LaTeX 源码**？

**事实**：Typora `DEFAULT_OPTIONS.mathFormatOnCopy = "svg"` ⇒ 复制公式得到**渲染图**（SVG）；
其 `getSVGForExport` 在 `isMathType(lang)` 为真时返回 SVG，否则才回落到 `<pre lang='math'><code>`。
Mellow 的复制路径**无 math/SVG 处理** ⇒ 复制得到 **LaTeX 源码**。

**选项**
- **A1 实装 SVG 复制**。**已知障碍**：渲染走 **异步** `tex2svgPromise`，而复制必须在 `copy` 事件里**同步**写剪贴板
  ⇒ 需要**预渲染缓存**（宿主已有 `__MELLOW_KATEX_RENDER__` 通道，但那是**按需渲染**，不是缓存）。
- **A2 维持 LaTeX 源码 + 登记 D**：对「想把公式拿去别处用」的用户，源码往往**比图更有用**。

**建议：A2（维持 + 登记 D），并把 A1 作为独立工作项** —— 理由：A1 的收益（粘贴到 Word/PPT 得图）
需要付出「预渲染缓存 + 失效策略」的成本，属**功能增量**而非 parity 修补；
在裁决前**不应**把它记成「待实现的小项」（本仓 §4.10 的教训：别把「我没想到路径」写成「不可行」，
但也别把**需要设计的项**写成「一个下午就能做完」）。

## Q9 — ~~`noLegacyMath`：Mellow 是否要支持 legacy 数学语法？~~ ⇒ **已由取证排除，不需要裁决**（2026-10-07）

**本问作废** —— 2026-10-07 的取证推翻了它赖以成立的前提（详见审计 §4.123）。

**原前提（错）**：「Typora 默认 `noLegacyMath = false` ⇒ legacy 数学解析启用；Mellow 没有 legacy 分支
⇒ 等价于 `noLegacyMath = true` ⇒ 行为不同。」

**取证（三条一手证据）**：

1. **键名与语义相反**：Typora 偏好面板里该键的 `label` 是
   **`"LaTeX Math Delimiter \( \) \[ \]"`**，且带 **`reverse: !0`**（勾选态 = `!getValue(key)`）
   ⇒ 它的用户可见语义是「**`\(` `\)` `\[` `\]` 是否作为数学定界符**」，**默认启用**；
2. **在渲染路径上恒为 no-op**：`main.js` 的三处守卫都是
   `File.option.enableInlineMath || !File.option.noLegacyMath`，而 **`enableInlineMath` 默认 `true`**
   ⇒ 该键在渲染路径上**无论取何值都不影响结果**；
3. **Mellow 本来就支持这四个定界符**：`parseMathSpans` 处理 `\(` `\)` `\[` `\]`，
   且 `tests/fixtures/math/typora-math-corpus.md` 的 `\(\alpha + \beta\)` 与 `\[ E = mc^2 \]`
   **已被 `math.test.ts` 首条用例断言**。

⇒ **两边行为一致** ⇒ 矩阵条目由 `behavior: differs` 改判为 **`matches-default`**，
`disposition`（`undecided → ADR-0034`）**一并移除** ⇒ **本问不需要裁决**。

> **教训**：这条判定是**照着键名读出来的**（`noLegacyMath` 读起来像「不做 legacy 数学解析」），
> 而它的**用户可见语义**恰恰相反。⇒ 与 §4.121 的「状态行判据被正文满足」同族：
> **判定必须落在「用户能看到什么」上，而不是「这个名字听起来像什么」。**
>
> ⚠️ 另一处佐证：**同文件**的 `legacyInlineMathParse` 条目早已写明
> 「Mellow parseMathSpans 仅实现现代 `$`/`\(`/`\[` 分隔符」——
> **两个相邻条目互相矛盾**，而没有任何判据发现它（见「机器可读化」一节的范围声明）。

## Q10 — `wordCountDelimiter`：字数统计是否要提供 **WORD / CHAR / LINE / TIME 四模式**？

**事实**：Typora `DEFAULT_OPTIONS.wordCountDelimiter = 0`（= **WORD**），
且 Word Count 面板可按 WORD / CHAR / LINE / TIME **四种模式**切换。
Mellow 的 `app-core/wordCount.ts` **固定同时计算并展示** words / chars / lines / readingTime。

**选项**
- **A1 提供四模式切换**（对齐 Typora 的交互形态）。
- **A2 维持「同时展示多项」+ 登记 D**：信息**更多**，用户不必切换。

**建议：A2（维持 + 登记 D）** —— 理由：Mellow 的形态是**超集**（Typora 一次只显示一种，Mellow 同时给出），
不存在「用户看不到某项统计」的问题；差异只在**交互形态**（切换 vs 并列），与 `D-AG`（侧栏排序菜单形态）同类。
⚠️ **但不得把 CJK-aware 的统计口径当作已对齐** —— 那是 `wordsPerMinute`（已由 **D-AO** 登记），**是另一件事**。

---

## Q11 — 导出完成后是否**默认在文件管理器中显示导出件**（`openExportLocation`；默认行为偏离）？

**事实**（一手证据，2026-10-07 审计 §4.130）：Typora 面板键 `openExportLocation`
（label **"Open exported file location"**，"After Export" 组）的勾选值是
`!!ae(r.X, a.X, l.X)`（组配置 / `export.general` / **schema**，**首个已定义者优先**），
而 **schema 里该字段是 `!0`** —— 实测
`L={appendHead:{…}, appendBody:{…}, allowPerFileSetting:{…}, openExportLocation:!0}`（HTML 导出的 schema 片段）
⇒ `ae(…)` 取到 `true` ⇒ **全新安装下该复选框默认勾选**
⇒ **Typora 默认在导出完成后 `JSBridge.showInFinder(t)`（在 Finder/资源管理器中显示导出件）**。
⚠️ **上游两处默认并不一致**，如实记录：「通用导出设置」页用 `checked: !!n.openExportLocation`
（`export.general` 未设 ⇒ 默认**不**勾），而 HTML 导出的 schema 片段给的是 `!0`。
Mellow 当前：导出完成只弹 toast + 记录 `mellow.export.last`，**不做任何打开 / 定位** ⇒ **默认行为偏离**。

**选项**
- **A1 对齐 Typora：默认「显示导出件」** —— 但会**改变用户可见的默认行为**（每次导出后多弹一个文件管理器窗口）。
- **A2 新增开关 + 默认关**（= Mellow 现状）—— 补齐能力、默认不变；但默认值与 Typora 不同，需登记一条 `D-`。
- **A3 维持现状 + 登记 `D-`** —— 只登记偏离，不补能力。

**建议：A2** —— 理由：Mellow **已有底层能力**（命令 `file.revealInFinder`，`App.tsx`），补开关成本极低；
而**默认对齐 Typora 会改变所有用户的导出后体验**（属行为变更，按本项目纪律不得静默改默认）。
⇒ 若采纳 A2，需**同时**登记一条默认值偏离（`D-`+编号）。

**关联**：同族的 `openExportFile`（label "Open exported file"）**默认是关**（它**不在任何 schema 里**，
实测面板里 `openExportFile:` 形式 0 处 ⇒ 三处皆 undefined ⇒ `!!undefined` = false）⇒ 该项**默认行为一致**，
只缺开关，**不需要裁决**（登记表已记 `equivalent`）。

---

## Q12 — 关掉**最后一个窗口**时是否退出应用？（`quitAfterWindowClose`；默认行为偏离）

**事实**（一手证据，2026-10-07 审计 §4.131）：
Typora 的面板键 `quitAfterWindowClose`（组 **"Quit"**，**仅 macOS 显示**，label
**"Quit Typora when last window is closed"**）默认 **`false`**（`checked: !!this.getValue(...)` ⇒ 未设即 false）
⇒ **Typora 在 macOS 的默认是「关掉最后一个窗口**不**退出」**（符合 macOS 惯例：应用留在 Dock 里）。

**Mellow 侧（源码级证据，非真机观察）**：**会退出** ——
① 本仓 `apps/desktop/src-tauri/src/lib.rs`：
   `RunEvent::ExitRequested { .. } | RunEvent::Exit => geometry::flush(app)`
   —— 模式里用 `{ .. }` **丢弃了 `api`** ⇒ **从不调用 `prevent_exit()`**；
② vendored 依赖 `tauri-runtime-wry-2.11.4/src/lib.rs`（本地 cargo registry 源码，Tauri 2.11.5）：
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
③ `apps/desktop/src-tauri/src/window.rs` 的关闭门是 `api.prevent_close()` + 前端 dirty 确认后
   `allow_close_window` 登记再 `window.close()` ⇒ 窗口被**销毁**（不是隐藏）⇒ 上述路径可达。

⇒ **Mellow 关掉最后一个窗口会退出，而 Typora 的 macOS 默认是不退出 ⇒ 行为偏离。**

**选项**
- **A1 对齐 macOS 惯例：不退出**（`ExitRequested` 里 `api.prevent_exit()`；点 Dock 图标再开窗）—— 但改变现有行为。
- **A2 新增开关 + 默认「不退出」**（对齐 Typora）—— 能力与默认都对齐，代价是多一个设置项。
- **A3 维持「退出」+ 登记 `D-`** —— 与 Mellow 的 SDI 定位一致（一窗一文档，关窗即结束），但**偏离 macOS 惯例**。

**建议：A2** —— 理由：这是 **macOS 平台惯例**问题（不是纯口味），对齐代价很低；
且 Mellow 是 SDI（一窗一文档）⇒ 「关窗即退出」在某些用户眼里是**数据丢失的错觉**（其实已保存）。
⚠️ 若采纳 A1/A2，**注意 `window.rs` 的关闭门与 `ExitRequested` 的交互**（关闭门是异步确认的，`prevent_exit` 不能破坏 dirty 确认流程）。
⇒ 采纳 A2 需**同时**登记一条默认值偏离（`D-`+编号）。

---

## 机器可读化（**本 ADR 顺带补上的那一半**）

判据分两处（**形状** vs **解析**，各自只做一件事）：

**A. `verify-settings-contract.mjs` ⑭ 节（矩阵的**形状**）**

1. `deviation.kind === 'undecided'` ⇒ **必须**带 `pendingRef`（形如 `ADR-0034`）；`deliberate` ⇒ **必须**带 `carrier`（非空的「依据在哪」）；
2. **行为轴同理**：`behavior === 'differs'` ⇒ **必须**带 `disposition: { kind, ref }`，且
   `kind ∈ {deliberate, gap, undecided}`、`ref` 非空且**形态与 kind 匹配**
   （`deliberate` ⇒ `D-`+编号；`gap` ⇒ 台账 id；`undecided` ⇒ `ADR-`+四位编号）。

**B. `verify-release-gate.mjs`（**引用解析**；它已持有 D 表解析器、台账与 ADR 三份数据）**

- `disposition.ref` 必须**真的解析得到**：`D-`+编号 ⇒ 有 D 表**声明行**；台账 id ⇒ 台账里存在；
  `ADR-NNNN` ⇒ ADR 文件存在**且**其 `**Status:**` 行仍为 `Proposed`（裁决后必须改 `kind`，否则红）；
- 上一轮写在 settings-contract 的 `deviation.pendingRef → ADR` 解析**移到这里**（避免同一个 D 表解析器两处各写一份）。

⇒ 从此「矩阵里标了待裁决却没人管」**会红**，而不是像这次一样**静默地让门禁报「无」**。

## 裁决

**待裁决（11 问：Q1–Q8、Q10、Q11、Q12；Q9 已由取证排除）。** 裁决后请：

> ⚠️ **Q11 / Q12 的登记面与 Q1–Q10 不同**：Q1–Q10 来自**偏好矩阵**
> （`typora-preferences-matrix.json`，范围 = `frame.js` 的 `DEFAULT_OPTIONS`）；
> **Q11 / Q12 来自「面板独有面」登记处**（`typora-panel-only-keys.json`，范围 = 面板 `keyName` − 矩阵键），
> 二者都带 `pendingRef`。
> ⇒ 若采纳 Q11 的 A2 / Q12 的 A2（都是「新增开关 + 默认关/不退出」），需**同时**登记默认值偏离（`D-`+编号），
> 并更新该登记表里对应条目的 `status` / `pendingRef`（当前：`openExportLocation` = `gap` + `Q11`；`quitAfterWindowClose` = `gap` + `Q12`）。

① 更新本 ADR 的 `Status` 为 `Accepted` 并**逐问**写入结论；
② 按结论更新矩阵：`deviation.kind` 改 `deliberate`（并去掉 `pendingRef`）/ 或改默认值；
   行为轴的 `disposition.kind` 改 `deliberate`（并给 `D-`+编号）或 `gap`（并给台账 id）；
③ 从门禁 `PENDING_ADRS` 移入 `DECIDED_ADRS`；
④ 审计登记表第 17 行改为「已裁决」。
