/**
 * 编辑器桥接契约（与 CoreEditor window.webModules / window.nativeModules 对齐）。
 * 只定义 V0.x 需要的子集，其余模块保持 unknown（不承诺）。
 */

/** CoreEditor 的 selection range（锚点/焦点，字符偏移） */
export interface SelectionRange {
  anchor: number;
  head: number;
}

export type ReplaceGranularity = 'wholeDocument' | 'selection';

/** window.webModules.core —— Native→Web 方向（宿主/UI 调编辑器） */
export interface CoreWebModule {
  resetEditor(p: {
    text: string;
    selectionRange?: SelectionRange;
    documentChanged: boolean;
  }): Promise<boolean>;
  getEditorState(): { hasFocus: boolean; hasSelection: boolean };
  getEditorText(): string;
  insertText(p: { text: string; from: number; to: number }): void;
  replaceText(p: { text: string; granularity: ReplaceGranularity }): void;
}

/** window.webModules —— CoreEditor 暴露给宿主的所有模块（V0.x 只用 core） */
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

/** Web→Native 消息格式（与 CoreEditor nativeModule.ts 完全一致） */
export interface NativeMessage {
  moduleName: string;
  methodName: string;
  parameters: string; // JSON 字符串
}

/** CoreEditor 启动配置（EditorConfig 接口子集） */
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
