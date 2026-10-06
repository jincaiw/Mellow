# @mellow/host-api

Mellow 系统能力契约（PRD §116 `DesktopHost` + notification / opener）—— **纯类型包 + Null / Mock 实现**。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

定义宿主能力的**接口**（`DesktopHost` 及其各 Service），并提供两份实现：
`createNullHost()`（全部 `notImplemented`）与 `createMockHost()`（内存态，供浏览器 dev / e2e 用）。
真机实现位于 `apps/desktop/src/host/*`（**平台代码只允许在 `apps/desktop`**，ADR-0007）。

## 公开接口

`src/index.ts` 导出 **4** 个符号：

- `createNullHost`、`createMockHost`、`createMockHostState`、`MockHostState`

类型面（`services.ts` / `types.ts` / `host.ts`）随类型导出：`WindowService`、`SpellcheckService`、
`FileService`、`SearchService`、`WatcherService`、`UpdaterService` 等。

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`app-core`、`apps/desktop`

## 测试

- `test/host-api.test.ts`

## 边界与约束

- **纯类型 + 无平台 API**：由 `verify-adapter-contract.mjs` 静态守。
- 新增 Service 方法时，**三份实现必须同时补**（Null / Mock / `apps/desktop` 的 Tauri 实现）
  —— TypeScript 会在类型层面报错，属编译期保障。
