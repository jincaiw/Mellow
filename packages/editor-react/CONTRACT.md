# CONTRACT — `@mellow/editor-react`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：把 vendored 的 `editor-core`（CodeMirror 6 内核）以 **iframe + 桥协议**装配进宿主 ——
  构建 bundle HTML、注入桥（`BRIDGE_INJECTION`）、提供 `EditorCore` 组件与事件/配置类型。
- **不属于本包**：编辑器的**行为**（`editor-engine` 的注入式扩展）与**内核**（vendored `editor-core`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**17** 个导出）：
  - 组件与装配：`EditorCore`、`EditorCoreOptions`、`buildBundleHtml`、`installBridge`、
    `BRIDGE_INJECTION`、`EDITOR_BUNDLE_URL`
  - 配置与事件：`EditorConfig`、`DEFAULT_CONFIG`、`EditorEvent`、`EditorEventListener`、
    `EditorViewState`、`SelectionRange`、`ReplaceGranularity`
  - 桥协议：`BridgeMessage`、`BridgeAdapter`、`CoreWebModule`、`WebModules`

## 3. ⚠️ 当前状态：**零跨包消费者 + 无测试**（审计 §4.95 / §4.100）

README 与 `AGENTS.md` 均注明「组件化 UI 见**阶段 2 计划**」⇒ **有意预留**。
是否接线（或删除）**需裁决**。

| 不变量 | 执行者 |
|---|---|
| **「零消费者」这一状态必须被显式登记**（一旦接线 ⇒ 例外表双向报错） | `tests/parity/verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` |
| 桥协议**两端一致**：注入侧（`build-editor-bundle.mjs`）↔ 消费侧（editor-core 契约） | `tests/parity/verify-adapter-contract.mjs` ③ |
| 每个 `__MELLOW_*` 桥既有声明点也有读取方（无死桥/断桥） | 同上 |
| **核心包零平台 API** | 同上 ① ② |

## 4. 错误语义

- `installBridge` 在宿主未提供 Tauri 全局时**不得抛**（dev 环境走 mock 桥）。
- 组件在 bundle 加载失败时应给出**可诊断**的失败态，而不是静默空白。

## 5. 性能边界

- bundle 由 `build-editor-bundle.mjs` 构建并**指纹化**（版本化文件名）⇒ 指纹错配会静默降级
  ⇒ 由 `verify-build-pipeline.mjs` + CI 的 `Verify editor release bundle fingerprint` 步骤守。
- iframe 隔离 ⇒ 宿主与引擎**不共享 DOM**；跨帧通信只走桥协议。

## 6. 禁止行为

- ❌ **fork 上游**：`editor-core` 是 vendored 上游（`UPSTREAM.md` 只读）⇒ 本包只做**注入式扩展**。
- ❌ 在宿主侧直接访问 iframe 内部 DOM（必须走桥协议 / `frame.locator` 仅限测试）。
- ❌ 新增桥而不在两端同时落地（会被 `verify-adapter-contract.mjs` ③ 拦下）。

## 7. Typora parity reference

本包是**装配层**，无用户可见行为 ⇒ 无直接 parity 条目；
编辑器行为 parity 见 `editor-engine` 的契约。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- **无测试目录** —— 已在 `verify-package-conventions.mjs` 的 `PKG_TEST_GAPS` 登记为
  「未执行 + 待裁决」（是否补测取决于它是接线还是删除）。

## 9. 测试入口

- ⚠️ 无 `test/`（见上）。
- 护栏：`verify-adapter-contract.mjs`（桥链锚点 + 平台边界）、`verify-doc-code-refs.mjs`
  （零消费者登记）、`verify-package-conventions.mjs`
