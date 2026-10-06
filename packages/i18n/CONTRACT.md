# CONTRACT — `@mellow/i18n`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：文案目录（zh-CN / en-US）、ICU 子集格式化、数字/日期格式化、
  平台感知的键位标签、locale 解析与系统检测、目录完整性报告。
- **不属于本包**：**引擎侧** UI 文案 —— 那是 `packages/editor-engine/src/engineI18n.ts` 的 `tEngine()` +
  locale 桥（ADR-0028），本包只提供宿主侧目录。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**19** 个导出）：`MESSAGES`、`LOCALES`、`DEFAULT_LOCALE`、`Locale`、
  `LocaleSetting`、`Messages`、`MessageCatalog`、`formatMessage`、`formatNumber`、`formatDate`、
  `pluralRule`、`keyboardLabel`、`localeDir`、`resolveLocale`、`detectSystemLocale`、
  `completenessReport`、`CompletenessReport`、`createI18n`、`I18nInstance`
- 目录规模：zh **841** / en **841** 键。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **zh 与 en 的键集合完全一致、无空值** | `test/index.test.ts` 的 `completenessReport(MESSAGES).complete === true` |
| **全仓 `t('<字面量>')` 的键 + 各 schema 的 `labelKey`/`descriptionKey` 在 zh 与 en 都非空存在** | `tests/parity/verify-i18n-contract.mjs` 判据 A |
| **目录里每个键（`menu.*` 除外）必须被某处使用，否则登记** | 同上 判据 D（`MESSAGES_UNUSED`，26 项；`menu.*` 由 `verify-menu-contract.mjs` 的 `ORPHAN_ALLOWED` 负责） |
| 引擎侧键与 `packages/i18n` 键**不重叠**、两 locale 齐备、接线链完整 | 同上 判据 E1–E4（ADR-0028） |
| 菜单文案键被 schema 引用或登记白名单 | `tests/parity/verify-menu-contract.mjs` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |

## 4. 错误语义

- ⚠️ **`t()` 对缺失键返回键名本身**（`table[key] ?? catalog['en-US'][key] ?? key`）
  ⇒ 界面显示**裸键**且**不报错**。这就是「键存在」必须由护栏硬守的原因。
- `formatMessage` 对缺失变量返回空串（不是抛错）—— 见 `test/index.test.ts` 的 `brace escaping`。

## 5. 性能边界

- `t()` 在渲染热路径上 ⇒ 查表为对象属性访问；**不承诺**缓存层。
- `completenessReport` 为**开发/测试期**工具，允许 O(n) 遍历全目录；**不得**在渲染路径调用。

## 6. 禁止行为

- ❌ 只加一个 locale 的键（会被 `completenessReport` 与护栏同时拦下）。
- ❌ 用 `t(变量)` 构造键而不在 schema 声明处留字面量（`t(变量)` 静态不可解析 ⇒ 护栏覆盖不到）。
- ❌ 在目录里保留**无人使用**的键而不登记（会被判据 D 拦下）。
- ❌ 把引擎侧文案写进本包（会与 `tEngine()` 的键空间冲突，判据 E3 会拦）。

## 7. Typora parity reference

- 菜单/界面文案的官方真值：`TypeMark/{lang}.lproj/*.strings`
  （`plutil -convert json -o - <f>`）—— 由 `tests/parity/tools/audit-typora-menu-labels.mjs` 对照（需本机 Typora，不进 CI）。
- ⚠️ **不得从自己的实现取值填官方列**（曾抓到 2 条把 Mellow 自己的英文填进官方列）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 目录本身即是「夹具」：`MESSAGES` 就是被断言的数据。

## 9. 测试入口

- `test/index.test.ts`
- 护栏：`verify-i18n-contract.mjs`、`verify-menu-contract.mjs`、`verify-adapter-contract.mjs`、
  `verify-package-conventions.mjs`
