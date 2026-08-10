/**
 * editor-react —— 编辑器 React 绑定层。
 *
 * 当前：重新导出 editor-core 的 EditorCore 与契约（React 组件绑定在 Phase 3 UI 时提供）。
 * 依赖：@mellow/editor-core（platform-neutral 核心）。
 */

export { EditorCore, EDITOR_BUNDLE_URL, installBridge, BRIDGE_INJECTION, buildBundleHtml, DEFAULT_CONFIG } from '../../editor-core/src';
export type {
  EditorCoreOptions,
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
} from '../../editor-core/src';
