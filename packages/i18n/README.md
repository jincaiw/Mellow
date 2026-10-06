# @mellow/i18n

国际化（zh-CN / en-US）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口。契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）。

## 职责

文案目录（**zh 与 en 两个 locale 的键集合必须完全一致**）+ ICU 子集格式化
（插值 / `plural` / `select`）+ 数字 / 日期格式化 + 平台感知的键位标签 + locale 解析与系统检测。

## 公开接口

`src/index.ts` 导出 **19** 个符号：

- 目录：`MESSAGES`、`MessageCatalog`、`Messages`、`LOCALES`、`DEFAULT_LOCALE`、`Locale`、`LocaleSetting`
- 格式化：`formatMessage`、`formatNumber`、`formatDate`、`pluralRule`
- 平台：`keyboardLabel`、`localeDir`
- 解析：`resolveLocale`、`detectSystemLocale`
- 完整性：`completenessReport`、`CompletenessReport`
- 实例：`createI18n`、`I18nInstance`

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`apps/desktop`

## 测试

- `test/index.test.ts` —— ICU 子集、数字/日期、locale 解析，以及
  **`completenessReport(MESSAGES).complete === true`**（zh / en 键集合一致 + 无空值）

## 边界与约束

- ⚠️ **`t()` 对缺失键返回键名本身** ⇒ 界面会显示**裸键**且**不报错**。
  因此「键存在」必须由护栏守：`verify-i18n-contract.mjs` 断言
  全仓 `t('<字面量>')` 的键 + 各 schema 的 `labelKey`/`descriptionKey` 在 **zh 和 en 都非空存在**。
- 引擎侧 UI 文案走 `tEngine()` + locale 桥（ADR-0028），判据在同一个护栏里（E1–E4）。
