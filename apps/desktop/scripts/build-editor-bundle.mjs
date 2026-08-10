/**
 * 生成 Mellow editor bundle：apps/desktop/public/editor/index.html
 *
 * 输入：packages/core-editor/CoreEditor/dist/index.html（MarkEdit 上游构建产物）
 * 处理：
 *   1. 替换 "{{EDITOR_CONFIG}}" → V0.0 默认 EditorConfig JSON（与 MarkEdit native 的
 *      EditorIndexHtml.toHtml 做法一致，属"注入"而非"重写"CoreEditor）；
 *   2. 替换 "{{USER_SETTINGS}}" → "{}"；
 *   3. 注入桥接脚本（mock webkit.messageHandlers.bridge → Tauri invoke）。
 *
 * 注意：注入脚本内容必须与 src/host/bridge.ts 的 BRIDGE_INJECTION 保持一致。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(
  root,
  '../../packages/core-editor/CoreEditor/dist/index.html',
);
const targetDir = resolve(root, 'public/editor');
const target = resolve(targetDir, 'index.html');

// 与 src/host/bridge.ts BRIDGE_INJECTION 保持一致
const bridgeInjection = `(function () {
  if (window.parent && window.parent.__TAURI__) {
    try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) {}
  }
  var handler = {
    postMessage: function (message) {
      if (!window.__TAURI__ || !window.__TAURI__.core) {
        return Promise.resolve(null);
      }
      return window.__TAURI__.core.invoke('bridge_call', { message: message });
    }
  };
  if (!window.webkit) { window.webkit = {}; }
  if (!window.webkit.messageHandlers) { window.webkit.messageHandlers = {}; }
  window.webkit.messageHandlers.bridge = handler;
})();`;

const defaultConfig = {
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

function build() {
  const html = readFileSync(source, 'utf8');

  // 1. config 注入（带引号占位符 → 裸 JSON）
  let out = html.replace('"{{EDITOR_CONFIG}}"', JSON.stringify(defaultConfig));
  if (out === html) {
    throw new Error('{{EDITOR_CONFIG}} placeholder not found in CoreEditor bundle');
  }

  // 2. userSettings 注入
  out = out.replace('"{{USER_SETTINGS}}"', '{}');

  // 3. 桥接注入（放在 </head> 之前，早于页面脚本）
  out = out.replace('</head>', `<script>${bridgeInjection}</script>\n</head>`);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`editor bundle written: ${target} (${out.length} bytes)`);
}

build();
