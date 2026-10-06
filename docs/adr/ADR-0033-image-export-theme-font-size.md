# ADR-0033 — 图片导出的「用主题字号」等价物（Typora `useThemeFontSize` 的另一半）

**Status:** **Accepted**（2026-10-06）—— 已裁决并生效（原 Proposed 同日裁决）

> **裁决依据**：用户于 2026-09-30 的常设授权「**全部自行评估、决策、实施，不叫我人工参与**」
> （ADR-0024/25/26/29/32 同引）。

## 背景：本 ADR 为什么存在（**又一次「已处置」的过度声称**）

`docs/qualification/release-blocker-audit-2026-09-25.md` 的「**待裁决项登记表**」**第 7 行**写着：

> `Allow Magnification` / 「使用主题的字体大小」 —— **已处置**（前者已实装；后者「自定义字号」已实装、
> 刻意不对齐 Typora 的 24，已登记 D）

而**实测**（2026-10-06）：

| 事实 | 证据 |
|---|---|
| `export.image.fontSize`（**自定义字号**）**已实施** | `packages/settings/src/index.ts`（number / 8–48 / **默认 16**）✓ |
| 「**用主题字号**」这一半**未实施** | 设置里只有 `export.image.{format,width,fontSize,quality}`；全仓无 `fontSizeMode` / `useThemeFont` / `themeFontSize` 标识（实测 0 命中） |
| 它**明写着「需单独裁决」** | `docs/plans/typora-parity-master-plan.md` 行 14b：「❌ **仍缺**：Typora 该组的**另一半**（radio 的 `Use theme font size`）……**需单独裁决**，故本轮不做」 |

⇒ **两个问题**：
1. 登记表第 7 行的「**已处置**」是**过度声称** —— 它只覆盖了「自定义字号」那一半；
2. 该待裁决项**没有 ADR 载体**（违反 `AGENTS.md`「待裁决项必须有 ADR 载体」与登记表头的
   「本文档此后不得新增未登记的裁决项」）—— 与 §4.106 修过的形态**同型**。

> **为什么本 ADR 不塞进 ADR-0032**：ADR-0032 已 `Accepted`，而门禁同时要求
> 「已裁决 ADR 必须 Accepted」与「待裁决 ADR 必须 Proposed」⇒ 塞进去会让两条**互相矛盾**。
> ⇒ **新的未裁决项必须新立一份 Proposed ADR**（同 §4.106 的结论）。

## 一手证据（Typora 侧，2026-09-30 已取证，见 master-plan 行 14b）

- `useThemeFontSize` **不是通用偏好**，而是**图片导出**分区 `Font Size` 组的一个 **radio**：
  `0: Use custom font size`（**默认**）/ `1: Use theme font size`；
  配套 `imageFontSize`（**默认 24px**，`visible: !useThemeFontSize`）；
- 消费点 `exportToImage`：`o.useThemeFontSize && (o.fontSize = void 0)` = **让主题 CSS 的字号生效**。

## 问题（本 ADR 要裁决的）

Mellow 的图片导出是 **canvas 渲染**（显式 `fontFamily`），**没有主题 CSS 通道** ⇒
Typora 那种「`fontSize = void 0` 交给 CSS」的做法**不可直接照搬**。
需要决定：**「用主题字号」的等价物是什么，以及要不要做。**

## 选项

- **A1 — 不做**（维持现状）。理由：canvas 无主题 CSS 通道，做一个「近似」的等价物会引入
  与 Typora **不同**的行为（而差异必须登记为 D）。代价：该 radio 的对应项永久缺失。
- **A2 — 提供「跟随**编辑器字号**」开关**（把 `--mellow-content-font-size` 或编辑器当前字号
  作为 `bodyFontSize` 的取值来源）。**影响**：需新增设置项 + 接线；语义与 Typora 的
  「跟随**主题 CSS**」**不等价**（Mellow 的编辑器字号可由用户改）⇒ 须登记为 D 并写明差异。
- **A3 — 提供「跟随主题定义的字号」**（从当前主题的排版变量取 `bodyFontSize`）。
  **影响**：更接近 Typora 语义；但仍受 canvas 无 CSS 通道的限制（需把主题变量读成数值）。

## ⚠️ 关键风险（**必须先解决，才能动默认值**）

`master-plan` 行 14b 已记录：Typora 默认 **24px**，Mellow 现为 **16px**；
**对齐默认值会改变所有既有图片导出的输出**（面积按 **1.5×** 放大，更易触及
`MAX_IMAGE_HEIGHT` / `MAX_IMAGE_PIXELS` 的**长图保护**）。
⇒ **默认值是否对齐，必须经视觉 / 真机确认后才能改**，不能凭「对齐 Typora」一句话改。
（本 ADR 只裁决「等价物形态」；**默认值另需一次视觉确认**。）

## 裁决（2026-10-06）= **A2（提供「跟随编辑器字号」开关）** ✅ 已实施

**为什么选 A2 而不是 A1 / A3**：

- **A3（跟随主题定义的字号）实测等于空操作**：Mellow 的主题**没有** per-theme 字号 ——
  排版字号是常量 `TYPOGRAPHY_DEFAULTS.fontSize = 16`（与 `BODY_SIZE` 同值）
  ⇒ 「跟随主题字号」永远解析成 16 ⇒ **选项永不产生可观察差异**（假控件）。
- **A1（不做）** 会把这个 parity 缺口**永久留着**，而 Typora 确实有这一半；
- **A2** 是**最接近且可控**的等价物：`editor.fontSize` 是**用户可改**的真实设置
  ⇒ 「导出跟随编辑器字号」有明确、可解释的语义。

**⚠️ 这是有意的差异（非 Typora 等价）**：Typora 的 radio 是「让**主题 CSS** 的字号生效」，
而 Mellow 的图片导出是 **canvas 渲染**（显式 `fontFamily`），**没有主题 CSS 通道**
⇒ 取「跟随**编辑器**字号」作为近似。**该差异须登记 D**（属「与 Typora 不同但有意」的一类）。

### 实施（默认 `custom` ⇒ **既有行为不变**）

| 项 | 内容 |
|---|---|
| 设置项 | `export.image.fontSizeMode`（select：`custom` / `followEditor`，**默认 `custom`**） |
| App 接线 | `followEditor` ⇒ 取 `settingById('editor.fontSize')` 的值作为 `bodyFontSize`；非法/缺失回落既有路径 |
| i18n | zh/en 各 **4** 条键（label / 两个选项 / description） |
| 护栏 | `verify-settings-contract.mjs` 的图片字号段**扩展**：锁 schema 形态 + **默认必须是 `custom`** + App 两处读取 + `editor.fontSize` 读取 + 2 条 canary |
| 单测 | **无需新增**：纯函数部分（`resolveImageBodyFontSize` 的回落 + clamp）已由 `packages/export/test/image.test.ts` 锁住；本次新增的只是 App 侧的取值分支（由护栏锁接线） |

**⚠️ 默认值仍为 16 且仍走 `custom`** ⇒ **所有既有图片导出的输出逐字节不变** ✓
（`BODY_SIZE = 16` 与既有护栏断言**保持原样**）。**默认值是否对齐 Typora 的 24，
仍按本 ADR 的「关键风险」节 —— 需视觉 / 真机确认后另裁。**

## 影响

- 现状：新增一个**默认不生效**的选项 ⇒ 既有行为不变。
- 制品变化（设置 schema + App 接线 + i18n）⇒ 随下一版本发布。

