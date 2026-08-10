/**
 * editor-core 契约 —— 平台无关的编辑器接口定义。
 *
 * 与 CoreEditor（vendored）的 window.webModules / window.nativeModules 协议对齐，
 * 但对外只暴露干净、平台无关的类型。宿主不得感知 WebKit/Tauri 细节。
 */

/** Selection range（锚点/焦点，字符偏移） */
export interface SelectionRange {
  anchor: number;
  head: number;
}

export type ReplaceGranularity = 'wholeDocument' | 'selection';

/** CoreEditor 启动配置（EditorConfig 契约子集，完整见 CoreEditor/src/config.ts） */
export interface EditorConfig {
  host: 'mainApp' | 'quicklook';
  text: string;
  theme: string;
  fontFace: { family: string };
  fontSize: number;
  showLineNumbers: boolean;
  showActiveLineIndicator: boolean;
  invisiblesBehavior: 'never' | 'selection' | 'trailing' | 'always';
  readOnlyMode: boolean;
  typewriterMode: boolean;
  focusMode: boolean;
  lineWrapping: boolean;
  lineHeight: number;
  suggestWhileTyping: boolean;
  autoCharacterPairs: boolean;
  indentBehavior: 'never' | 'paragraph' | 'line';
  standardDirectories: Record<string, string>;
  localizable?: Record<string, string>;
}

/** Web→宿主 消息（与 CoreEditor nativeModule.ts 格式一致） */
export interface BridgeMessage {
  moduleName: string;
  methodName: string;
  parameters: string; // JSON 字符串
}

/** 宿主桥接适配器（平台无关：Tauri/Electron/测试注入不同实现） */
export interface BridgeAdapter {
  invoke(message: BridgeMessage): Promise<unknown>;
}

/** 编辑器状态（CoreWebModule.getEditorState 返回） */
export interface EditorViewState {
  hasFocus: boolean;
  hasSelection: boolean;
}

/** 编辑器 → 宿主 事件（V0.x 子集） */
export type EditorEvent =
  | { type: 'ready' }
  | { type: 'viewUpdate'; contentEdited: boolean; isDirty: boolean };

export type EditorEventListener = (event: EditorEvent) => void;

/** window.webModules.core —— 宿主调编辑器的方法（Native→Web 方向） */
export interface CoreWebModule {
  resetEditor(p: {
    text: string;
    selectionRange?: SelectionRange;
    documentChanged: boolean;
  }): Promise<boolean>;
  getEditorState(): EditorViewState;
  getEditorText(): string;
  insertText(p: { text: string; from: number; to: number }): void;
  replaceText(p: { text: string; granularity: ReplaceGranularity }): void;
}

/** window.webModules 全集（V0.x 只用 core） */
export interface WebModules {
  core: CoreWebModule;
  config?: unknown;
  history?: unknown;
  lineEndings?: unknown;
  selection?: unknown;
  format?: unknown;
  search?: unknown;
  toc?: unknown;
  api?: unknown;
  writingTools?: unknown;
  foundationModels?: unknown;
}
