/**
 * 生成 Mellow editor bundle：apps/desktop/public/editor/index.html
 *
 * 输入：
 *   1. packages/editor-core/CoreEditor/dist/index.html（MarkEdit 上游构建产物）
 *   2. packages/editor-engine/dist/*.js（Mellow Live Markdown Engine）
 *
 * 处理：
 *   1. 替换 "{{EDITOR_CONFIG}}" → V0.0 默认 EditorConfig JSON（与 MarkEdit native 的
 *      EditorIndexHtml.toHtml 做法一致，属"注入"而非"重写"CoreEditor）；
 *   2. 替换 "{{USER_SETTINGS}}" → "{}"；
 *   3. 注入桥接脚本（mock webkit.messageHandlers.bridge → Tauri invoke）；
 *   4. 复制引擎到 public/editor/engine/ 并补 .js 扩展名（浏览器 ESM 要求）；
 *   5. 注入引擎 loader（MarkEdit.addExtension）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../../packages/editor-core/CoreEditor/dist/index.html');
const engineDist = resolve(root, '../../packages/editor-engine/dist');
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

/**
 * 引擎 loader：等待 MarkEdit 就绪后注入引擎扩展。
 * 放在 CoreEditor bundle script 之后（模块按文档顺序执行）：
 * bundle 顶层同步执行 initMarkEditModules → MarkEdit 已存在 → addExtension 推入扩展存储；
 * resetEditor（window.onload）创建编辑器时自动包含用户扩展。
 */
const engineLoader = `<script type="module">
import * as MellowEngine from './engine/index.js';
window.MellowEditorEngine = MellowEngine;
(function () {
  function tryInit() {
    if (window.MarkEdit && typeof window.MarkEdit.addExtension === 'function') {
      try {
        window.MarkEdit.addExtension(MellowEngine.install());
      } catch (e) {
        console.error('[mellow] engine install failed', e);
      }
    } else {
      setTimeout(tryInit, 100);
    }
  }
  tryInit();
})();
</script>`;

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

/** 复制引擎 dist → public/editor/engine/，补 .js 扩展名 */
function copyEngine() {
  const engineTargetDir = resolve(targetDir, 'engine');
  mkdirSync(engineTargetDir, { recursive: true });

  const files = readdirSync(engineDist).filter((f) => f.endsWith('.js'));
  if (files.length === 0) {
    throw new Error('editor-engine dist is empty, run `npm run build` in packages/editor-engine first');
  }

  for (const file of files) {
    let content = readFileSync(resolve(engineDist, file), 'utf8');
    // 浏览器 ESM 要求显式 .js 扩展名（tsc 默认不带）
    content = content.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, '$1.js$2');
    writeFileSync(resolve(engineTargetDir, file), content, 'utf8');
  }
  console.log(`engine copied: ${files.join(', ')}`);
}

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

  // 4. 引擎 loader（放在 body 尾部，CoreEditor bundle script 之后）
  out = out.replace('</body>', `${engineLoader}\n</body>`);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`editor bundle written: ${target} (${out.length} bytes)`);
}

copyEngine();
build();
