# @mellow/settings

设置共享 schema（**One Settings Model**，PRD §531）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

设置项的**唯一声明处**：分区（`SettingsSection`）、单项定义（`SettingDefinition`）、
类型（`SettingType`）、选项（`SettingOption`）、排版默认值（`TYPOGRAPHY_DEFAULTS`）、
读写（`readSetting` / `writeSetting`）、**恢复全部默认**（`restoreAllSettingsDefaults`）、
快捷键覆盖（`ShortcutOverrideMap`）。

## 公开接口

`src/index.ts` 导出 **17** 个符号：

`SETTINGS_SECTIONS`、`SettingsSection`、`SettingsSectionId`、`SettingDefinition`、`SettingType`、
`SettingOption`、`settingById`、`sectionById`、`readSetting`、`writeSetting`、
`restoreAllSettingsDefaults`、`TYPOGRAPHY_DEFAULTS`、
`SHORTCUT_OVERRIDES_KEY`、`ShortcutOverrideEntry`、`ShortcutOverrideMap`、
`readShortcutOverrides`、`writeShortcutOverrides`

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`apps/desktop`

## 测试

- `test/index.test.ts`

## 边界与约束

- ⚠️ **`restoreAllSettingsDefaults` 只遍历 `SETTINGS_SECTIONS`** ⇒
  **不在 schema 的持久化键既不出现在设置页、也不会被「恢复默认」清理**。
  已由 `verify-settings-contract.mjs` 锁定「持久化键 ⊆ (schema ∪ 例外表)」+ 例外表**双向**。
  当前 3 个已登记例外：`mellow.fileTree.options`、`mellow.outline.options`、`mellow.statusbar.fields`。
- 设置项的 `applyCommand` 必须与 `apps/desktop` 的 `applySetting` switch **两端同时锁**
  （只在一端加 ⇒ 设置项「可点击且点击无反应」），判据在 `verify-settings-contract.mjs`。
