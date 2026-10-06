# CONTRACT — `@mellow/commands`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：定义「命令」这一跨层对象的**唯一形状**（id / 本地化标题 / 分类 / 快捷键 /
  可用性上下文 / 呈现方式）、注册表与搜索（命令面板、斜杠命令），以及**菜单 schema**
  （`menuSchema.ts` / `menuContract.ts`）。
- **不属于本包**：命令的**执行**。执行在 `apps/desktop` 的 `dispatchCommand`；
  本包只声明「有哪些命令、叫什么、什么键位、何时可用」。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**22** 个导出）：
  - 模型：`Command`、`CommandContext`、`CommandAvailabilityContext`、`CommandPresentation`、
    `CommandCategory`、`CommandShortcut`、`LocalizedTitle`、`LocaleCode`、`CommandSource`、`CommandPlatform`
  - 工具：`createCommandContext`、`normalizeShortcut`、`titleFor`
  - 面板/斜杠：`CommandPaletteItem`、`commandPaletteSearch`、`slashCommandSearch`、`SlashSearchOptions`
  - 注册：`CommandRegistry`、`RegisterOptions`、`CommandEntryPoint`、`createCommandEntryPoint`

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **schema 声明的每个命令，App 侧必须有 `dispatchCommand` 分支**（否则「可点击且点击无反应」） | `tests/parity/verify-menu-contract.mjs` |
| **schema 的 `labelKey` 在 zh/en 都非空存在**；`menu.*` 键被 schema 引用或登记白名单 | 同上 + `verify-i18n-contract.mjs` |
| **快捷键单一真源 = schema**；App 内联快捷键仅限白名单 | `verify-menu-contract.mjs` §7 |
| 快捷键**无冲突**（唯一性） | 同上 §13（曾由 e2e 报出 `Cmd+Alt+F` 冲突后提升为护栏） |
| 菜单项**平台互补键位**正确 | 同上 §11 |
| 菜单护栏自身能被注入检出（防「永远绿」） | `tests/parity/verify-menu-contract-guard.mjs` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |

## 4. 错误语义

- `CommandRegistry.register` 对重复 id **抛错**（开发期即暴露），不静默覆盖。
- `titleFor` 在 `localizedTitle` 缺当前 locale 时**回落**另一 locale（不返回裸键）。
- 命令的 `enabled(ctx)` 返回 false 时，UI 应**置灰**而非隐藏（表现契约）。

## 5. 性能边界

- `commandPaletteSearch` / `slashCommandSearch` 在**每次按键**触发 ⇒ 必须为纯函数且 O(n) 量级
  （命令数 ~10²），**不得**在其中做 I/O。
- 注册表在启动时一次性构建；**不得**在渲染路径重复注册。

## 6. 禁止行为

- ❌ 在本包内直接触碰 DOM / 平台 API（执行属 App 层）。
- ❌ 在 schema 之外**第二处**声明快捷键（除 §7 白名单外会被护栏拦下）。
- ❌ 新增命令时只加 schema 不加 `dispatchCommand`（会被护栏拦下）。
- ❌ 让 `labelKey` 指向不存在的键（`t()` 会显示裸键且不报错）。

## 7. Typora parity reference

- 菜单**层级与键位**真值：Typora 1.14.9 的 `main.js`（行为）与
  `tests/benchmark/fixtures/typora-menu-dump.txt`（**不能**用它判层级）。
- 文案真值：`TypeMark/{lang}.lproj/*.strings`。
- 对照脚本：`tests/parity/tools/audit-typora-menu-labels.mjs`（需本机 Typora，不进 CI）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）；菜单夹具在
  `tests/benchmark/fixtures/typora-menu-dump.txt` 与 `tests/fixtures/typora-parity/`。

## 9. 测试入口

- `test/registry.test.ts`、`test/menu-schema.test.ts`
- 护栏：`verify-menu-contract.mjs`、`verify-menu-contract-guard.mjs`、`verify-i18n-contract.mjs`、
  `verify-adapter-contract.mjs`、`verify-package-conventions.mjs`
