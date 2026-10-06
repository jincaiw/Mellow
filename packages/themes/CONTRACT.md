# CONTRACT — `@mellow/themes`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：**主题变量的真值源**（`--mellow-*` 基表，亮/暗两套）、内置主题集合、
  用户主题的加载与解析（`parseUserThemeCss`）、「当前生效主题」的解析。
- **不属于本包**：把主题**应用到 DOM**（`apps/desktop` 的 `applyTheme` 设到 app 根）与
  **引擎侧** token 桥（`packages/editor-engine/src/mdTokens.ts`，只放行 `--mellow-md-*`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**11** 个导出）：`MellowTheme`、`ThemeKind`、`ThemeSettings`、
  `DEFAULT_THEME_SETTINGS`、`BUILTIN_THEMES`、`registerUserThemes`、`allThemes`、`userThemes`、
  `parseUserThemeCss`、`themeById`、`resolveActiveTheme`
- 规模：基表 **68** 个非 md token + 主题的 md token 段。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **引擎侧 md token 两端同锁**：`--mellow-md-*` 必须**同时**在本包基表与 `mdTokens.ts` | `tests/parity/verify-parity-ledger.mjs` R2（双向） |
| **引擎里不可达的非 md 变量必须登记** | 同上 R1（`ENGINE_THEME_VARS_INERT`） |
| **基表里引擎从不消费的 md token 必须登记** | 同上 R3（`MD_TOKENS_UNUSED`，现 1 项：`--mellow-md-fg`） |
| **基表里每个非 md token 必须至少在某处被消费，否则登记** | 同上 R4（`HOST_TOKENS_UNUSED`，现 3 项，见审计 §4.99） |
| 主题 id 唯一、`resolveActiveTheme` 对未知 id 有确定回落 | `test/index.test.ts` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |

## 4. 错误语义

- `parseUserThemeCss` 对**非法 CSS** 不抛 ⇒ 返回可用的部分（用户主题是可选增强，不应打断启动）。
- `themeById` 对未知 id 返回**默认主题**（不是 undefined）—— 调用方无需判空。

## 5. 性能边界

- `applyTheme` 在**主题切换**时触发（低频）；基表规模 ~10² ⇒ 无热路径约束。
- **不承诺**运行时按需计算 token（基表是静态对象）。

## 6. 禁止行为

- ❌ **只在一端**新增 md token（R2 会拦：宿主传不到 / 无 fallback）。
- ❌ 新增**无人消费**的 token 而不登记（R4 会拦 —— 主题作者会以为设了生效）。
- ❌ **删除**基表里的 token（属**主题面变更**，用户主题可能引用它）—— 先登记待裁决。
- ❌ 让引擎侧直接读宿主非 md 变量（iframe 拿不到 ⇒ 恒取 fallback）。

## 7. Typora parity reference

- 内置主题对应 Typora 官方主题（github / night / pixyll / whitey / gothic / newsprint / paper）；
  排版真值取自 Typora 主题 CSS（github：16px / line-height 1.6 / max-width 860px）。
- 主题**列表与命名**的对照见 `docs/plans/typora-parity-master-plan.md`。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 主题的**视觉**夹具在 `tests/visual/golden/`（按平台分离），由 `verify-visual-golden.mjs` 锁。

## 9. 测试入口

- `test/index.test.ts`
- 护栏：`verify-parity-ledger.mjs`（token 可达性 R1–R4）、`verify-visual-golden.mjs`、
  `verify-adapter-contract.mjs`、`verify-menu-contract.mjs`（主题菜单项）、
  `verify-no-color-only-status.mjs`、`verify-package-conventions.mjs`
