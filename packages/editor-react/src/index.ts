/**
 * editor-react —— 编辑器 React 封装。
 *
 * 提供：
 * - EditorHost：CoreEditor iframe 生命周期管理（无 UI，纯逻辑）
 * - useEditorHost：React hook 薄封装
 * - 桥接契约类型（CoreWebModule/WebModules/EditorConfig）
 * - BRIDGE_INJECTION：构建期注入脚本（消除 CoreEditor 的 webkit 依赖）
 *
 * 依赖：host-api（可选，类型层面无运行时依赖）。
 */

export { EditorHost, EDITOR_BUNDLE_URL } from './editorHost';
export { BRIDGE_INJECTION, isCoreEditorReady } from './bridge';
export type {
  SelectionRange,
  ReplaceGranularity,
  CoreWebModule,
  WebModules,
  NativeMessage,
  EditorConfig,
} from './types';
