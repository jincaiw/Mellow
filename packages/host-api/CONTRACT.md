# CONTRACT — `@mellow/host-api`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**，
> 否则它只是散文。

## 1. 职责与边界

- **属于本包**：定义宿主能力的**接口**（`DesktopHost` 及其各 Service）与两份**非平台**实现
  （`createNullHost` / `createMockHost`），以及它们的类型。
- **不属于本包**：任何平台调用。真机实现在 `apps/desktop/src/host/*`
  （**平台代码只允许在 `apps/desktop`**，ADR-0007）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**4** 个导出）：`createNullHost`、`createMockHost`、`createMockHostState`、`MockHostState`
- 类型面：`services.ts`（`WindowService` / `SpellcheckService` / `FileService` / `SearchService` /
  `WatcherService` / `UpdaterService` …）、`host.ts`、`types.ts`
- 跨包导入走**相对路径**（`package.json` 的 `name`/`main` 是装饰性的）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **核心包零运行时 Tauri 标识 / 零平台 API** | `tests/parity/verify-adapter-contract.mjs` ① ② |
| 每个 Service 方法在 **Null / Mock / 真机** 三处都有实现 | TypeScript（接口实现，编译期） |
| `createNullHost` 的每个方法返回 `notImplemented` 而非抛异常 | `test/host-api.test.ts` |
| 新增 Service 方法不得只加在一处 | 同上（类型层）+ 本文件的「谁在守」表 |

## 4. 错误语义

- 所有可失败操作返回 `Result<T>`（`ok()` / `err({ code, message })`），**不抛异常**
  —— 调用方据此降级；`code` 的取值集合见 `types.ts`。
- `null-host` 一律返回 `err({ code: 'unsupported' })` 风格（见 `null-host.ts` 的 `notImplemented`）。

## 5. 性能边界

- 纯类型 + 内存态 mock，无 I/O；**不承诺**任何吞吐/延迟指标。
- 真机实现的性能边界由各自 Service 的实现方负责（见 `apps/desktop/src/host/*`）。

## 6. 禁止行为

- ❌ 引入任何 `@tauri-apps/*` 依赖或 `__TAURI__` 全局读取。
- ❌ 引入 `process.platform` / `navigator.platform` / `navigator.userAgentData`。
- ❌ 在接口里泄漏平台专有类型（如 Tauri 的 `WebviewWindow`）。

## 7. Typora parity reference

本包是**基础设施**，无用户可见行为 ⇒ 无 parity 条目。
宿主能力与 Typora 的对应关系见 `docs/plans/typora-parity-master-plan.md` 的对应工作包。

## 8. golden fixtures

- 本包 `fixtures/` **为空** —— §117.1 的「`fixtures/` 目录必须存在」按**意图**判
  （git 无法跟踪空目录），偏离声明见审计 §4.100 与 `verify-package-conventions.mjs` 的 `PRD_117_1_DEVIATIONS`。
- 当前无 golden fixture 需求；一旦引入，**必须放本包 `fixtures/` 下**。

## 9. 测试入口

- `test/host-api.test.ts`
- 护栏：`verify-adapter-contract.mjs`、`verify-package-conventions.mjs`
