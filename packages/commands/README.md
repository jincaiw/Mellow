# @mellow/commands

命令注册与执行（菜单 / 命令面板 / 斜杠命令的**统一命令模型**）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口。契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）。

## 职责

定义「命令」这一跨层对象的**唯一形状**（id / 本地化标题 / 分类 / 快捷键 / 可用性上下文 /
呈现方式），并提供注册表与搜索（命令面板、斜杠命令）。菜单 schema 也在此包
（`menuSchema.ts` / `menuContract.ts`）—— 它是**菜单文案与层级的真值源之一**，
由 `verify-menu-contract.mjs` 与官方 Typora 文案对账。

## 公开接口

`src/index.ts` 导出 **22** 个符号：

- 模型：`Command`、`CommandContext`、`CommandAvailabilityContext`、`CommandPresentation`、
  `CommandCategory`、`CommandShortcut`、`LocalizedTitle`、`LocaleCode`、`CommandSource`、`CommandPlatform`
- 工具：`createCommandContext`、`normalizeShortcut`、`titleFor`
- 面板 / 斜杠：`CommandPaletteItem`、`commandPaletteSearch`、`slashCommandSearch`、`SlashSearchOptions`
- 注册：`CommandRegistry`、`RegisterOptions`、`CommandEntryPoint`、`createCommandEntryPoint`

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`apps/desktop`

## 测试

- `test/registry.test.ts` —— 注册表行为
- `test/menu-schema.test.ts` —— 菜单 schema 结构

## 边界与约束

- **纯数据 + 纯函数**：不直接触碰 DOM / 平台 API；执行由 `apps/desktop` 的 `dispatchCommand` 承担。
- 菜单项若在本包注册却未在 `dispatchCommand` 接上，会表现为「**可点击且点击无反应**」
  —— 该跨层不变量由 `verify-menu-contract.mjs` / `verify-context-menu-parity.mjs` 守。
