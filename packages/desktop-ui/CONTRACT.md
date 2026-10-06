# CONTRACT — `@mellow/desktop-ui`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：从 `apps/desktop/src/App.tsx` **增量抽取**的展示层组件（**阶段 2，行为等价**）——
  侧栏（文件树 / 文件列表 / 大纲 / 搜索结果）、状态栏、虚拟滚动。
- **不属于本包**：业务逻辑（`app-core`）、平台能力（`host-api`）、设置的持久化（`settings`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**23** 个导出）：
  - 状态栏：`StatusBar`、`StatusBarProps`、`StatusBarField`、`STATUSBAR_DEFAULT_HIDDEN`、`fieldVisible`
  - 面板：`OutlineList`、`SearchResultsList`、`FileList`、`FileTree`（各带 `*Props`）
  - 骨架：`SidebarHeader`、`SidebarFooter`、`SidebarMode`
  - 虚拟滚动：`VirtualRows`、`buildOffsets`、`findRange`、`VirtualRange`

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **抽取必须行为等价**（外观/交互不得变） | `tests/parity/verify-visual-golden.mjs` + `tests/visual/{visual,sidebar,scenes}-golden.mjs` |
| 侧栏交互契约（键盘 / 焦点 / 模式切换） | `tests/parity/verify-sidebar-contract.mjs` |
| 状态栏字段默认可见性 | `test/statusbar-defaults.test.ts` + `verify-sidebar-contract.mjs` |
| 虚拟滚动的偏移/范围计算正确 | `test/virtual.test.ts` |
| 大列表下的虚拟滚动性能 | `test/virtual-bench.test.ts`（**实测**而非声明） |
| 语义状态色不得只靠颜色 | `tests/parity/verify-no-color-only-status.mjs` |

## 4. 错误语义

- 展示层组件**不产生 I/O 错误**：数据由 props 传入，失败态由调用方表达。
- 空数据（空树 / 空结果）渲染**空态**而非抛错。

## 5. 性能边界

- 列表渲染必须走**虚拟滚动**（`VirtualRows`），不得直接 map 全量节点。
- 大列表基准：`test/virtual-bench.test.ts`（实测）。
- **采样前必须等「状态」**：视觉/交互测量用 `tests/visual/wait-rendered.mjs` 的
  `waitForAnimationsSettled` / `waitForFocusSettled`，**未收敛即 throw**（禁止用 `sleep` 猜时长）。

## 6. 禁止行为

- ❌ **改变外观/交互**地做抽取（Golden 会拦；`--update` 前必须逐条核对无无关漂移）。
- ❌ 直接读 `localStorage`（持久化经 `settings` schema / `apps/desktop` 适配层）。
- ❌ 在组件内做业务计算（应回到 `app-core` 的纯函数）。
- ❌ 只靠颜色传达状态（会被 `verify-no-color-only-status.mjs` 拦下）。

## 7. Typora parity reference

- 侧栏形态与状态栏：`docs/plans/typora-parity-master-plan.md` §3 真值表。
- 排版：Typora github 主题 16px / line-height 1.6 / max-width 860px
  （`verify-shell-typography.mjs` 与 `verify-visual-golden.mjs` 锁）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- **Golden 在仓库级** `tests/visual/golden/`（**按平台分离**），实际产物在 `tests/visual/actual/`
  —— ⚠️ 后者是**被跟踪的**产物，跑一次本地视觉套件就会弄脏，**回退后不要再跑生成它的脚本**。

## 9. 测试入口

- `test/statusbar-defaults.test.ts`、`test/virtual.test.ts`、`test/virtual-bench.test.ts`
- 护栏：`verify-visual-golden.mjs`、`verify-sidebar-contract.mjs`、`verify-shell-*.mjs`、
  `verify-no-color-only-status.mjs`、`verify-package-conventions.mjs`
