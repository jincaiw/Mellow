/**
 * @mellow/editor-core —— 平台无关的编辑器核心 package。
 *
 * 组成：
 * - vendored MarkEdit CoreEditor（CoreEditor/，只读，测试 185 用例）
 * - 平台适配层：EditorCore（public API）/ BridgeInjection（webkit 依赖消除）/ Bundle（构建注入）
 * - 契约：contract.ts（平台无关类型）
 *
 * 约束（AGENTS.md 统一规则 2/3/4 + PRD §113.4）：
 * - 不依赖 Tauri / Node / OS API；
 * - 无 OS-specific API（webkit 耦合由构建期注入消除，唯一豁免在 CoreEditor 源码内）。
 */

export { EditorCore, EDITOR_BUNDLE_URL } from './core';
export type { EditorCoreOptions } from './core';
export { BRIDGE_INJECTION, installBridge } from './bridge-injection';
export { buildBundleHtml, DEFAULT_CONFIG } from './bundle';
export type { BuildBundleOptions } from './bundle';
export type {
  EditorConfig,
  EditorEvent,
  EditorEventListener,
  EditorViewState,
  SelectionRange,
  ReplaceGranularity,
  BridgeMessage,
  BridgeAdapter,
  CoreWebModule,
  WebModules,
} from './contract';
