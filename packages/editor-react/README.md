# @mellow/editor-react

Mellow 编辑器 React 封装（EditorHost + 桥契约）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

把 vendored 的 `editor-core`（CodeMirror 6 内核）以 **iframe + 桥协议** 的方式装配进宿主：
构建 bundle HTML、注入桥（`BRIDGE_INJECTION`）、提供 `EditorCore` 组件与事件/配置类型。

## 公开接口

`src/index.ts` 导出 **17** 个符号：

- 组件与装配：`EditorCore`、`EditorCoreOptions`、`buildBundleHtml`、`installBridge`、`BRIDGE_INJECTION`、`EDITOR_BUNDLE_URL`
- 配置与事件：`EditorConfig`、`DEFAULT_CONFIG`、`EditorEvent`、`EditorEventListener`、`EditorViewState`、`SelectionRange`、`ReplaceGranularity`
- 桥协议：`BridgeMessage`、`BridgeAdapter`、`CoreWebModule`、`WebModules`

## ⚠️ 当前状态：**零跨包消费者 + 无测试**（审计 §4.95 / §4.100）

- 实测**无任何跨包导入**；README 与 `AGENTS.md` 均注明「组件化 UI 见**阶段 2 计划**」⇒ **有意预留**。
- 也因此**没有 `test/`**（§117.1 要求）—— 已在 `verify-package-conventions.mjs` 的
  `PKG_TEST_GAPS` 登记为「未执行 + 待裁决」（是否补测取决于它是接线还是删除）。

## 依赖关系（实测）

- **依赖**：`editor-core`（vendored）
- **被消费**：**无**

## 边界与约束

- `editor-core` 是 **vendored 上游**（`UPSTREAM.md` 只读）⇒ 本包是**注入式扩展**，不 fork 上游。
