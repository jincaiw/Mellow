/**
 * bundle —— CoreEditor 构建产物 → 平台无关 editor bundle。
 *
 * 输入：CoreEditor dist/index.html（上游 vite singlefile 产物，含占位符）
 * 处理（与 MarkEdit native 的 EditorIndexHtml.toHtml 同法，属注入而非重写）：
 *   1. "{{EDITOR_CONFIG}}" → EditorConfig JSON
 *   2. "{{USER_SETTINGS}}" → "{}"
 *   3. 注入桥接脚本（BRIDGE_INJECTION，消除 webkit 依赖）
 * 输出：可直接在任何 WebView / iframe 加载的平台无关 bundle。
 */

import type { EditorConfig } from './contract';
import { BRIDGE_INJECTION } from './bridge-injection';

/** V0.x 默认配置（与 CoreEditor dev config 对齐） */
export const DEFAULT_CONFIG: EditorConfig = {
  host: 'mainApp',
  text: '',
  theme: 'github-light',
  fontFace: { family: 'ui-monospace' },
  fontSize: 17,
  showLineNumbers: true,
  showActiveLineIndicator: true,
  invisiblesBehavior: 'always',
  readOnlyMode: false,
  typewriterMode: false,
  focusMode: false,
  lineWrapping: true,
  lineHeight: 1.5,
  suggestWhileTyping: false,
  autoCharacterPairs: true,
  indentBehavior: 'paragraph',
  standardDirectories: {},
  localizable: {
    previewButtonTitle: 'Preview',
    cmdClickToFollow: '⌘-click to follow',
    cmdClickToToggleTodo: '⌘-click to toggle todo',
  },
};

export interface BuildBundleOptions {
  /** 自定义配置（与默认合并） */
  config?: Partial<EditorConfig>;
  /** 自定义桥接注入（默认 BRIDGE_INJECTION） */
  bridgeInjection?: string;
}

/**
 * 构建平台无关的 editor bundle HTML。
 *
 * @param source CoreEditor 构建产物（dist/index.html）
 * @returns 注入完成的 bundle
 */
export function buildBundleHtml(source: string, options: BuildBundleOptions = {}): string {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const injection = options.bridgeInjection ?? BRIDGE_INJECTION;

  // 1. config 注入（带引号占位符 → 裸 JSON，与 EditorIndexHtml.swift 一致）
  let out = source.replace('"{{EDITOR_CONFIG}}"', JSON.stringify(config));
  if (out === source) {
    throw new Error('[editor-core] {{EDITOR_CONFIG}} placeholder not found in CoreEditor bundle');
  }

  // 2. userSettings 注入
  out = out.replace('"{{USER_SETTINGS}}"', '{}');

  // 3. 桥接注入（</head> 之前，早于页面脚本）
  out = out.replace('</head>', `<script>${injection}</script>\n</head>`);

  return out;
}
