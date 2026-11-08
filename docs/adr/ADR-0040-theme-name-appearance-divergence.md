# ADR-0040 — 内置主题与 Typora 同名而外观不同（G7-TYPO-05）

**Status:** **Accepted**（2026-11-08，**用户裁决**）—— 已裁决（选项 A）。

## 背景（一手证据）

master-plan §5.6 的 **G7-TYPO-05**（2026-09-13 实机核对，本机 Typora 1.14.9 build 7785）登记：

- Typora 内置主题**恰好 6 个**：`github` / `gothic` / `newsprint` / `night` / `pixyll` / `whitey`。
- Mellow 内置 **8 个**主题（`packages/themes/src/index.ts`）：`mellow-light` / `mellow-dark` /
  `paper` / `git-light` / `git-dark` / `newsprint` / `whitey` / `gothic`。
- **3 个与 Typora 同名而外观不同**：

| 主题 | Typora 1.14.9 | Mellow | 冲突程度 |
|---|---|---|---|
| `newsprint` | `#f3f2ee` 灰白 | `#f4ecd8` 米黄 | 观感不同 |
| `whitey` | `#fefefe` | `#ffffff` | 接近 |
| `gothic` | `#fcfcfc` **浅色** | `#17141f` **深色**（kind: dark） | **明暗相反** |

- 另：Mellow **无** `night`（Typora 的深色主题名）。

**影响**：Typora 迁移用户按名字选主题会得到预期外的外观；`gothic` 尤其严重（名字在 Typora 里
是浅色主题，Mellow 里是深色）。这违背 §6.2 不变量 10「原创品牌视觉，不复制 Typora 专有资源」
的**精神**（借用其品牌名却给出不同产品），并制造预期落差。

**登记纪律补记（2026-11-03 审计）**：master-plan §5.6 自 2026-09-13 起写「**待裁决**（已登记，
未擅自改）」，但审计「待裁决项登记表（唯一声明处）」21 行里一行都没有 —— 违反本仓
「待裁决项必须有 ADR 载体」规则（§4.328/§4.329 同型）。**本 ADR 是该欠债的补载体**，
不是新问题。

## 选项

- **A 改原创名（配色不动）**：把 `newsprint` / `whitey` / `gothic` 改为不与 Typora 撞名的
  原创名（如 `newsprint → kraft`、`whitey → snow`、`gothic → inkwell` 之类，最终名以裁决为准），
  并**迁移已保存的主题 id**（localStorage `mellow.theme`/`mellow.darkTheme` 读到老 id 时映射，
  用户选择与观感都不变）。
  - 收益：**从根上消除「同名异物」**；`gothic` 明暗相反的困惑随改名消失；不复制 Typora 外观
    （正面符合不变量 10）。
  - 代价：改名的代码/文案/i18n 面 + 一次性存储迁移；Typora 迁移用户按老名字**找不到**（但
    「找不到」比「找到后外观相反」是更小的惊讶 —— 名字与 Typora 无关了，落差预期自然建立）。
- **B 改配色对齐 Typora**：3 个主题改成 Typora 的实际外观（`gothic` 翻浅、补 `night`）。
  - ⚠️ **与 §6.2 不变量 10 直接冲突**（复制 Typora 专有主题外观），且改变现有用户的视觉环境
    （已保存选择没变、外观却变）。除非先有一个**取代不变量 10 的新 ADR**，本 ADR 内不可选。
- **C 维持现状 + 文档说明**：承认「同名异物」为已知 D 类差异。
  - `gothic` 明暗相反对迁移用户是**主动误导**（点了叫 gothic 的浅色名字得到深色），文档说明
    不改变产品表面的即时困惑。

## 初步建议

**A**（改名 + 存储迁移）。它是唯一同时满足「不复制 Typora 专有资源」「消除同名异物」
「现有用户观感不变」三个约束的选项。B 需要先推翻一条宪法级不变量；C 把误导留在产品表面。

## 待裁决问题

- **Q1（改名与映射）**：是否采 A？3 个新名字定名。
- **Q2（是否补 `night`）**：Typora 深色主题叫 `night`；Mellow 已有 `mellow-dark` / `git-dark`
  覆盖深色需求。补 `night` 属**新增主题**（需设计），或维持「深色由 Mellow 自有主题承载」。

## 裁决

**裁决 = A（改原创名 + 存储迁移），不补 `night`** —— 用户 2026-11-08 拍板（最终对标轮）。

- **Q1（改名与映射）= A**：
  - `newsprint → kraft`（显示名 `Kraft`）；
  - `whitey → snow`（显示名 `Snow`）；
  - `gothic → inkwell`（显示名 `Inkwell`）。
  - 配色、字体族与 `themeCss` 参数**一律不动**（只改 id / 显示名 / 选择器）。
- **Q2（是否补 `night`）= 不补**：深色需求由既有 `mellow-dark` / `git-dark` / `inkwell` 承载；
  不与 Typora 的深色主题同名，也就不需要「补一个同名主题」来对齐。

**实现约束**（落地时执行，不改变 Markdown 真源、不动 vendored 引擎）：

1. 迁移**只在读取时映射**：`LEGACY_THEME_ID_ALIASES` + `migrateThemeId` / `migrateThemeSettings`；
   `resolveActiveTheme` 对旧 id 做防御性映射（未迁移的存储也能命中原主题）。
2. `apps/desktop` 启动读取 `mellow.theme.settings` 时迁移并**立即写回**（一次性），
   保证用户既有的主题选择与观感不变。
3. 改名面同步：主题表头注释、`themeCss` 选择器、i18n `menu.theme.*` 键、主题包 README/CONTRACT、
   e2e `theme-verify.mjs`；**Typora 自身的主题名**（ADR-0027 证据、引擎注释、台账注释）不改。
4. 门禁：`PENDING_ADRS` → `DECIDED_ADRS`；master-plan §5.6 G7-TYPO-05 与审计登记表同步
   「已裁决」；本 ADR 其余部分不改写（只追加）。
5. 回归证据：`packages/themes/test/index.test.ts`（映射 + 旧 id 解析 + 外观 token 不变）、
   `tests/e2e/theme-verify.mjs`（启动迁移的端到端断言）。
