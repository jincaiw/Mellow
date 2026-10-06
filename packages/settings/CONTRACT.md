# CONTRACT — `@mellow/settings`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：设置项的**唯一声明处** —— 分区、单项定义、类型、选项、读写、**恢复全部默认**、
  快捷键覆盖；以及排版默认值 `TYPOGRAPHY_DEFAULTS`。
- **不属于本包**：设置的**消费**（把值应用到编辑器/UI）。消费在 `apps/desktop`
  （`applySetting` switch）与各包；本包只声明「有什么设置、默认多少、存在哪个键」。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**17** 个导出）：`SETTINGS_SECTIONS`、`SettingsSection`、`SettingsSectionId`、
  `SettingDefinition`、`SettingType`、`SettingOption`、`settingById`、`sectionById`、
  `readSetting`、`writeSetting`、`restoreAllSettingsDefaults`、`TYPOGRAPHY_DEFAULTS`、
  `SHORTCUT_OVERRIDES_KEY`、`ShortcutOverrideEntry`、`ShortcutOverrideMap`、
  `readShortcutOverrides`、`writeShortcutOverrides`
- 规模：**76** 个条目，其中 **68** 个带 `storageKey`（值型）、**52** 个同时带 `applyCommand`（值 + 实时生效）。
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **action 型设置必须有 `applyCommand`，且 App 的 `applySetting` switch 有对应 case** | `tests/parity/verify-settings-contract.mjs`（判据 A/B/C/D） |
| **值型设置必须有 `storageKey`**（「无 case」≠「无消费方」：值本身持久化，消费者可在别处读） | 同上 |
| **持久化键 ⊆（schema ∪ 显式例外表）** | 同上（例外表**双向**，防化石） |
| 设置的 `labelKey` / `descriptionKey` 在 **zh 与 en 都非空存在** | `tests/parity/verify-i18n-contract.mjs` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |
| 排版默认值 `TYPOGRAPHY_DEFAULTS` 与 golden 一致 | `tests/parity/verify-visual-golden.mjs` |

## 4. 错误语义

- `readSetting` 在键缺失时返回 `defaultValue`（**不抛**）；`writeSetting` 失败静默（localStorage 配额）
  —— 调用方不依赖写入成功的返回值。
- `restoreAllSettingsDefaults` **只遍历 `SETTINGS_SECTIONS`** ⇒ **不在 schema 的键既不出现在设置页、
  也不会被「恢复默认」清理**。这是**已知语义**，不是 bug；当前 3 个例外键已登记在护栏里：
  `mellow.fileTree.options`、`mellow.outline.options`、`mellow.statusbar.fields`（待裁决，见审计 §4.85）。

## 5. 性能边界

- `settingById` / `sectionById` 的调用方在**热路径**（每次渲染）上；实现为线性查找即可
  （76 条量级），**不承诺**索引加速。
- 读写走 `localStorage` 同步 API ⇒ **不得在每帧调用**（`writeSetting` 只在用户操作时触发）。

## 6. 禁止行为

- ❌ 在 schema 之外**新增持久化键**而不登记（会被护栏拦下）。
- ❌ 让 `applyCommand` 与 App 的 `applySetting` case **只在一端存在**（表现：设置项「可点击且点击无反应」）。
- ❌ 在 `labelKey` / `descriptionKey` 里写裸键（`t()` 对缺失键返回键名本身 ⇒ 界面显示裸键且不报错）。

## 7. Typora parity reference

- 设置项与 Typora 偏好面板的对应关系：`docs/plans/typora-parity-master-plan.md` §3 真值表
  与 `TypeMark/appsrc/window/frame.js` 的 `DEFAULT_OPTIONS`（84 键＝偏好默认值）。
- 排版默认值真值：Typora github 主题 = 16px / line-height 1.6 / max-width 860px。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）；夹具需求当前在**仓库级**
  `tests/fixtures/`（如 `tests/fixtures/typora-parity/`）。

## 9. 测试入口

- `test/index.test.ts`
- 护栏：`verify-settings-contract.mjs`、`verify-i18n-contract.mjs`、`verify-adapter-contract.mjs`、
  `verify-visual-golden.mjs`、`verify-package-conventions.mjs`
