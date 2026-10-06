# @mellow/themes

主题契约与内置主题。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口。契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）。

## 职责

定义**主题变量的基表**（`--mellow-*`，亮 / 暗两套）、内置主题集合、用户主题的加载与解析
（`parseUserThemeCss`）、以及「当前生效主题」的解析（`resolveActiveTheme`）。

本包是**宿主侧主题变量的真值源** —— `apps/desktop` 的 `applyTheme` 把它设到 app 根上；
引擎 iframe 只接收 `--mellow-md-*` 那一批（见 `packages/editor-engine/src/mdTokens.ts` 的过滤）。

## 公开接口

`src/index.ts` 导出 **11** 个符号：

`MellowTheme`、`ThemeKind`、`ThemeSettings`、`DEFAULT_THEME_SETTINGS`、`BUILTIN_THEMES`、
`registerUserThemes`、`allThemes`、`userThemes`、`parseUserThemeCss`、`themeById`、`resolveActiveTheme`

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`apps/desktop`

## 测试

- `test/index.test.ts`

## 边界与约束

- **token 可达性有两套判据**（`verify-parity-ledger.mjs`）：
  - **引擎侧**（ADR-0027）：`--mellow-md-*` 必须同时在本包基表与 `mdTokens.ts`；
    引擎里**不可达**的非 md 变量必须登记进 `ENGINE_THEME_VARS_INERT`；
  - **宿主侧**（审计 §4.99）：基表里每个**非 md** token 必须至少在**某处**被消费，
    否则登记进 `HOST_TOKENS_UNUSED`。当前 3 项：
    `--mellow-tab-underline`（SDI 迁移删标签栏后的**化石**）、
    `--mellow-warning-fg`、`--mellow-mermaid-border`。
- ⚠️ 删除 token 属**主题面变更**、接线属**外观变更** ⇒ 二者都需裁决（口径见 ADR-0027 Q3=C1）。
