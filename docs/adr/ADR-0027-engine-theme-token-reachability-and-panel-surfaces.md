# ADR-0027 — 引擎侧主题 token 的可达性判定与浮动面板表面取色

**Status:** **Accepted**（2026-10-01）—— 已裁决并生效（原 Proposed 同日）

## 裁决（2026-10-01）

> 依据：用户于 2026-09-30 授权「**全部自行评估、决策、实施，不叫我人工参与**」；
> 本会话用户连续指示「继续」「未完成，继续实施」。**授权不等于降低举证标准**。

### Q1 = **A1**（新增 md 面板 token，走**既有** md 桥）

**理由**：

1. **一手基线只要求这两个表面跟随主题。** Typora 的 `.ty-table-edit` 在**每个主题里显式上色**
   （`base.css` 基线透明；`night.css` = `#363B40` = 该主题 `--bg-color`；gothic/pixyll/whitey = `#ededed`；
   newsprint = `transparent`）。即「表格工具栏跟随主题」是**既定行为**，Mellow 暗色下的白底是**缺口**。
2. **A2（拓宽 token 桥）会顺带改动 6 处与表格工具栏无关的表面**（wikilink 强调色、kbd 边框、
   danger 色、quote hover 底、选区工具栏底/字色）→ **收益与风险不匹配**（§4.53 已实测列出这 6 处）。
3. **A1 是逐表面 opt-in**，与引擎既有的 `var(--mellow-md-*, fallback)` 惯例一致；
   且「新增 md token」不需要新桥（**与 ADR-0028 的 Q1=A2 解耦** —— 面板 token 复用既有 md 桥）。
4. **A3（维持现状并登记为 D 类有意差异）被否**：它与一手基线**直接冲突**，
   且把一处**可修**的缺陷固化成「有意差异」——属过度声称。

### Q2 = **B1**（那 6 个非 md 变量**保留登记**，本次不改写）

**理由**：迁移为 md token（B2）会**一次性激活 6 个表面**的外观变更，需重采多处视觉基线 ——
应与 Q1 的落地**分开评估**；去字面量（B3）会**丢弃**「这些表面想跟随主题」的既有意图。
B1 保持现状，且**已由护栏 R1/R3 覆盖**（登记 + 防新增 + 防死 token）。

### Q3 = **C1**（`--mellow-md-fg` **登记为「未接线」**）

**理由**：本会话已按 C1 处置（加入 `MD_TOKENS_UNUSED` 并写明原因，护栏 R3 防死 token 静默堆积）。
C2（接线）会**覆盖** CoreEditor 主题色 → 属外观变更，需视觉基线，另行评估；C3（删除）属主题面变更。

> **与 ADR-0028 的关系（已消解）**：起草时写「两者应一并裁决」，是担心出现两套互不兼容的通道。
> ADR-0028 裁决为 **A2（逐项加桥）** 后，本 ADR 的 A1 **复用既有 md 桥、不新增桥** →
> 两者**不再共享同一个决定**，可各自成立。

## 实施状态（2026-10-01）

**决策已定，实现未做** —— 本 ADR 的落地（新增 `--mellow-md-panel-*` 三个 token × 亮暗两套 +
`table/toolbar.ts` 改消费它们 + 暗色视觉基线重采）**排在 `P0-I18N-001` 之后**：
后者是**已确认的 P0 缺陷**（English 完整性），前者是**状态未变**的 `P0-THEME-001` 的未覆盖部分。
按影响面排序，先做前者。

> **本 ADR 只承载一个待裁决问题（Q1）与两个从属问题（Q2/Q3）。**
> 与之相关但**不属本 ADR** 的两项已于本次直接实施（它们是**缺陷修复**，不是取舍）：
>
> 1. `--mellow-md-list-bullet` **不可达**（`plugin.ts` 消费、`MD_TOKEN_DEFAULTS` 与主题基表**两端都没有**）
>    → 已补入两端（亮 `#8b949e` 沿用原 fallback ⇒ **零视觉变化**；暗 `#a0a0a0`，与同组 muted 灰同阶）。
> 2. 护栏 `verify-parity-ledger.mjs` 的判据由**按前缀**升级为**按可达性**（见下「已实施的护栏升级」）——
>    原判据「md 前缀 ⇒ 会跨 iframe」有一个**盲区**：md 前缀但两端未定义的 token 同样恒取 fallback，
>    而护栏看不见。这正是第 1 项能潜伏至今的原因。

## 背景

### 一、架构事实（非取舍，是现状）

编辑器运行在**独立 iframe**（独立 `document`），宿主的 CSS 变量**不会自动继承**。唯一通道是
`mdTokens.ts` 的 `setTokenProperties`，而它**显式过滤**：

```ts
if (key.startsWith('--mellow-md-')) { root.style.setProperty(key, value); }
```

宿主侧（`App.tsx` applyTheme）把 `activeTheme.variables` 全量设在 **app 根**，并经
`hostRef.current?.setMdTokens(activeTheme.variables)` 交给桥 —— **只有 md 那一批真正进得去**。

**后果**：引擎里 **6 个非 md 的 `var(--mellow-*, <fallback>)`**（分布 8 个文件）**永远取 fallback**：

| 变量 | 消费处 |
|---|---|
| `--mellow-accent` | `mdLink.ts` / `table/columnWidth.ts` / `table/liveView.ts` / `taskCheckbox.ts` / `wikilink.ts` |
| `--mellow-bg-hover` | `wysiwygBlocks.ts` |
| `--mellow-border` | `kbdCaps.ts` |
| `--mellow-danger` | `mdLink.ts` |
| `--mellow-toolbar-bg` / `--mellow-toolbar-fg` | `selectionToolbar.ts` |

### 二、一手基线（Typora 1.14.9，本机 `/Applications/Typora.app`）

表格浮动工具栏的类名是 **`.ty-table-edit`**（`appsrc/main.js` 中 15 处），其取色**逐主题显式声明**：

| 文件 | 规则（逐字） |
|---|---|
| `style/base-control.css`（基线） | `.ty-table-edit{width:100%;margin-left:-4px;position:absolute;background:0 0}` |
| `style/base-control.css`（按钮） | `.ty-table-edit button{border:1px solid transparent;background:0 0;padding:1px 5px;font-size:12px;line-height:1.5}` |
| **`style/themes/night.css`（暗色）** | `.ty-table-edit{border-top: 1px solid gray; background-color: #363B40;}` |
| `style/themes/gothic.css` / `pixyll.css` | `.ty-table-edit{background: #ededed;}` |
| `style/themes/whitey.css` | `.ty-table-edit{background: #ededed; padding-top: 4px;}` |
| `style/themes/newsprint.css` | `.ty-table-edit{background-color: transparent;}` |
| `style/themes/github.css` | 无覆盖 → 沿用基线「透明」（继承表格/正文底色） |

**关键**：`night.css` 的 `#363B40` **恰等于**该主题自己的 `--bg-color: #363B40`。
即「表格工具栏**跟随主题**」是 Typora 的**既定行为**，由主题作者逐主题声明（而非自动继承）。

### 三、实测缺口（Mellow 侧）

- `packages/editor-engine/src/table/toolbar.ts` 的 `toolbarStyle()` 有 **15 处硬编码色**，
  **一个主题变量都没用**：工具栏 `background:'rgba(255,255,255,0.92)'`、按钮 `background:'#fff'`、
  边框 `#ddd`/`#ccc`、阴影 `rgba(0,0,0,0.12)`、resize 弹层 `#fff`、网格单元 `#fff`/激活 `#cfe3ff`。
- 探针实测（`tests/e2e/theme-follow-probe.mjs`，app 侧 `data-theme=mellow-dark`、
  `--mellow-toolbar-bg=rgba(40,40,42,.95)`）：
  - iframe 根上非 md 变量**全为空**；
  - **表格工具栏计算背景 = `rgba(255,255,255,0.92)` → 暗色主题下是白底**；
  - 选区浮动工具栏背景 = `rgba(30,30,30,0.92)` = **fallback**（≠ app 的 `rgba(40,40,42,.95)`）。

**与 Typora 对照**：Typora 暗色下工具栏是 `#363B40`（暗）；Mellow 是白底 ⇒ **属缺口，不是有意差异**。

### 四、与台账 `P0-THEME-001` 的关系（不变）

该台账项状态**不因本 ADR 改动**。理由见其 `mellowTarget`：本项主张是「主题和字体改变**阅读外观**」
+「主题**注册/菜单/设置/UI 同步**」，**都没有**声称「引擎侧每个表面都跟随主题」——
本缺口属它**未覆盖**的部分，不构成对其主张的反驳。
（与 `P0-I18N-001` 不同：那条的能力名就是「English **完整性**」，故必须降级为 IMPL。）

## 待决问题

### Q1 — 浮动面板表面（表格工具栏 / 选区工具栏）应如何取色？

| 选项 | 内容 | 后果 |
|---|---|---|
| **A1** | **新增 md 面板 token**：`--mellow-md-panel-bg` / `-fg` / `-border`，由主题基表定义真值，走**既有 md 桥**跨进 iframe；`table/toolbar.ts` 与 `selectionToolbar.ts` 改为消费它们 | 不拓宽桥（`setTokenProperties` 的过滤不变）；**逐表面 opt-in**，影响面可控；需视觉 Golden 重采（工具栏此前是白底） |
| **A2** | **拓宽 token 桥**：`setTokenProperties` 放行一份 `--mellow-*` 白名单（至少含那 6 个） | 一次性激活 6 个变量（8 个文件的表面同时变样）；**影响面最大**，需重采多处视觉基线；好处是「写了就生效」的语义最直白 |
| **A3** | **维持现状**：工具栏保持硬编码，那 6 个变量继续登记为 inert，把「暗色白底」登记为**已知差异（D 类）** | 零风险；但与 Typora 一手基线冲突，且把一处**可修**的缺陷固化为「有意差异」 |

> **注**：A1 与 A2 并非互斥 —— A1 可先落地（只动 2 个表面），A2 留作后续统一。但若最终选 A2，
> A1 新增的 panel token 会与 `--mellow-toolbar-bg` 语义重叠，需合并（避免两套面板 token 并存）。

### Q2 — 那 6 个非 md 变量如何处置？

| 选项 | 内容 |
|---|---|
| **B1** | 保留 `var(--mellow-X, fallback)` 写法 + 继续登记为 inert（现状；本 ADR 不改） |
| **B2** | 迁移为 md token（`--mellow-md-accent` / `-danger` / `-border` / `-bg-hover` / `-panel-bg` / `-panel-fg`），与 A1 配套 ⇒ 它们**真正生效** |
| **B3** | 去掉 `var()` 改字面量 ⇒ **明确放弃**这些表面的主题跟随意图（并在登记表写明） |

### Q3 — `--mellow-md-fg`（**死 token**）如何处置？

它在 `MD_TOKEN_DEFAULTS` 与主题基表**两端都有**，但**引擎源码从不消费**（全仓扫描确认）。
其文档化用途是 Typora 的 `body{color:rgb(51,51,51)}`（master-plan §3 真值表），
而正文色实际由 CoreEditor 主题（`App.tsx` 的 `setTheme(activeTheme.editorTheme)`）提供。

| 选项 | 内容 |
|---|---|
| **C1** | 登记为「未接线」（**本次已按此处置**：加入 `MD_TOKENS_UNUSED` 并写明原因；护栏 R3 防死 token 静默堆积） |
| **C2** | **接线**：让引擎用 `--mellow-md-fg` 自持正文色 ⇒ 会**覆盖** CoreEditor 主题色，属外观变更 |
| **C3** | 删除（三处：`mdTokens.ts` + 主题亮/暗）—— 属主题面变更，且失去预留接线点 |

## 建议（供裁决参考，非结论）

- **Q1 → A1**：一手基线（Typora 逐主题显式上色）只要求**这两个表面**跟随主题；A2 顺带改动 6 处
  与表格工具栏无关的表面（wikilink 强调色、kbd 边框、danger 色…），**收益与风险不匹配**。
  A1 的「逐表面 opt-in」也更符合本仓既有的 `var(--mellow-md-*, fallback)` 惯例。
- **Q2 → B1（暂）**：B2 会一次性激活 6 个表面 ⇒ 应作为 A1 之后的**独立变更**评估；
  B3 会丢弃现有意图，需先确认那些表面确实不该跟随主题。
- **Q3 → C1**：本次已实施；若后续确需「引擎自持正文色」再走 C2（那是一次外观变更，需视觉基线）。

## 后果（若 Q1 采纳 A1、Q2 维持 B1、Q3 维持 C1）

- `packages/themes/src/index.ts`：亮/暗基表各新增 `--mellow-md-panel-bg` / `-fg` / `-border`；
  暗色真值参照 `night.css` 的「面板底 = 该主题 `--bg-color` 同阶」，映射到 Mellow 的
  `--mellow-bg-elevated` 档（`#252526` 暗 / `#ffffff` 亮）。
- `packages/editor-engine/src/table/toolbar.ts`：15 处硬编码色改为消费 panel token（fallback 保留现值，
  保证「桥未就绪」时观感不劣化）。
- `packages/editor-engine/src/selectionToolbar.ts`：可一并改用 panel token（或维持 B1 的 inert 登记）。
- 视觉 Golden（`tests/visual/scenes-golden.mjs` 等）需重采 —— 暗色下工具栏由白底变暗底。
- 护栏 R1 自动覆盖：新增的 md token 若只加一端，`verify-parity-ledger.mjs` 会失败。

## 已实施的护栏升级（不属待裁决项）

`tests/parity/verify-parity-ledger.mjs` 的「引擎侧主题 token」一节，判据由**前缀**改为**可达性**：

- **R1 可达性**：引擎里每个 `var(--mellow-X, …)` 必须可达 —— md 前缀 ⇒ 必须**同时**在
  `MD_TOKEN_DEFAULTS` 与主题基表；非 md ⇒ 必须在 `ENGINE_THEME_VARS_INERT` 登记。
- **R2 两端同锁**：`MD_TOKEN_DEFAULTS` 的 md 键集合 ≡ 主题基表的 md 键集合（双向）。
- **R3 防死 token**：`MD_TOKEN_DEFAULTS` 里引擎从不消费的键必须在 `MD_TOKENS_UNUSED` 登记。

判定函数 `classify(name, ctx)` **具名且参数化**，canary 复用同一份（避免「canary 测的是副本」），
并逐方向验证**能翻转**（清空 inert 名单 ⇒ 非 md 变量判未登记；清空主题表 / token 表 ⇒ md 变量判不可达）。
已按「注入 → 报错 → 还原 → 通过」验证 9 个用例（含「清空登记表即全绿」的反例锁）。

> **⚠️ 与 ADR-0028 应一并裁决**：本 ADR 的 Q1（面板 token 走哪条通道）与
> ADR-0028 的 Q1（是否建**统一的 UI 上下文桥**）是**同一个决定的两面** ——
> 若 ADR-0028 选 A1（统一桥），本 ADR 的 A1/A2 就应改为「经统一桥下发面板 token」。
> 分开裁决可能落地**两套互不兼容的通道**。

## 关联

- `docs/qualification/release-blocker-audit-2026-09-25.md` §4.53 / §4.55
- `tests/parity/typora-parity-ledger.json` → `P0-THEME-001`
- `tests/e2e/theme-follow-probe.mjs`（探针）
- `packages/editor-engine/src/mdTokens.ts`、`packages/themes/src/index.ts`
- `docs/adr/ADR-0016-cross-platform-first-native-enhancement.md`（平台差异只允许在 Adapter 层）
