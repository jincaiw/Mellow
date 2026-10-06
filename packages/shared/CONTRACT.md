# CONTRACT — `@mellow/shared`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：三个与业务无关的通用工具 —— `debounce`、`Emitter`、`assert`（约 70 行）。
- **不属于本包**：任何领域概念。一旦某个工具带上业务语义，它就不该放在这里。
- ⚠️ **当前零跨包消费者**（审计 §4.95，待裁决）：接线 或 删包，两条路都需决定。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**3** 个导出）：`debounce`、`Emitter`、`assert`
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **零跨包消费者这一状态必须被显式登记**（一旦接线 ⇒ 例外表双向报错） | `tests/parity/verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |
| 三个工具为**纯函数/纯类**，无 I/O、无全局状态 | 代码结构（本包无 import） |

## 4. 错误语义

- `assert(cond, msg)`：`cond` 为假时**抛 `Error(msg)`** —— 它是**开发期**不变量守卫，
  不得用于**用户输入校验**（用户可触发路径上的失败必须返回 `Result`，见 `host-api` 的契约）。
- `debounce(fn, ms)`：返回值带 `cancel()`（若实现提供）；**不承诺**尾部调用语义的跨实现一致性 ——
  使用方需自行断言其依赖的具体语义。

## 5. 性能边界

- 三个工具均无 I/O；`debounce` 的复杂度为 O(1)/次调用。
- **不承诺**任何吞吐/延迟指标。

## 6. 禁止行为

- ❌ 在本包内引入任何依赖（含跨包 import）—— 它是「零依赖工具」。
- ❌ 把带业务语义的工具塞进来（会让「共享工具」变成第二个 `app-core`）。
- ❌ 用 `assert` 做用户可触发的校验（会把可恢复错误变成崩溃）。

## 7. Typora parity reference

本包是**基础设施**，无用户可见行为 ⇒ 无 parity 条目。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- **无测试目录** —— 已在 `verify-package-conventions.mjs` 的 `PKG_TEST_GAPS` 登记为
  「未执行 + 待裁决」（是否补测取决于它是接线还是删除）。

## 9. 测试入口

- ⚠️ 无 `test/`（见上）。
- 护栏：`verify-doc-code-refs.mjs`（零消费者登记）、`verify-adapter-contract.mjs`、
  `verify-package-conventions.mjs`
