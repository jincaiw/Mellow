/**
 * 生成 Mellow editor bundle：apps/desktop/public/editor/index.html
 *
 * 输入：
 *   1. packages/editor-core/CoreEditor/dist/index.html（MarkEdit 上游构建产物）
 *   2. packages/editor-engine/dist/*.js（Mellow Live Markdown Engine）
 *
 * 处理（平台无关注入由 editor-core 规范实现 buildBundleHtml）：
 *   1. 替换 "{{EDITOR_CONFIG}}" / "{{USER_SETTINGS}}" → 配置 JSON；
 *   2. 注入桥接脚本（webkit.messageHandlers.bridge → window.__MELLOW_BRIDGE__ 契约）；
 *   3. **注入 Tauri 适配器**（desktop 专属：把 __MELLOW_BRIDGE__ 接到 __TAURI__.core）；
 *      —— editor-core 不包含任何 Tauri 知识，Tauri 适配只存在于本 Adapter 层；
 *   4. 复制引擎到 public/editor/engine/ 并补 .js 扩展名（浏览器 ESM 要求）；
 *   5. 注入引擎 loader（MarkEdit.addExtension）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// editor-core 平台无关 bundle 构建模块（tsc 产物，CJS）
// eslint-disable-next-line import/no-unresolved
import { buildBundleHtml, DEFAULT_CONFIG } from '../../../packages/editor-core/dist/bundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../../packages/editor-core/CoreEditor/dist/index.html');
const engineDist = resolve(root, '../../packages/editor-engine/dist');
const targetDir = resolve(root, 'public/editor');
const target = resolve(targetDir, 'index.html');

// 与 packages/editor-core/src/bridge-injection.ts BRIDGE_INJECTION 保持一致（由 buildBundleHtml 注入）

/**
 * Tauri 适配器（desktop Adapter 层专属）：
 * 把 editor-core 的 __MELLOW_BRIDGE__ 契约接到 Tauri 2 的 __TAURI__.core.invoke。
 * 这是 editor-core 与 Tauri 之间唯一的知识边界 —— 存在于本脚本，不在 editor-core。
 */
const tauriBridgeAdapter = `<script>
(function () {
  if (window.parent && window.parent.__TAURI__) {
    try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) {}
  }
  if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
    window.__MELLOW_BRIDGE__ = {
      invoke: function (message) {
        return window.__TAURI__.core.invoke('bridge_call', { message: message });
      }
    };
    // 图片资源 URL 解析（本地绝对路径 → asset:// URL；URL/data 原样）
    try {
      var convertFileSrc = window.__TAURI__.core.convertFileSrc;
      window.__MELLOW_ASSET_RESOLVER__ = function (src) {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(src) || src.indexOf('data:') === 0) return src;
        try { return typeof convertFileSrc === 'function' ? convertFileSrc(src) : src; } catch (e) { return src; }
      };
    } catch (e) {}
    // 拖拽路径缓冲（desktop 宿主经 webview onDragDropEvent 写入；engine drop 时消费）
    if (typeof window.__MELLOW_DROP_PATHS__ === 'undefined') {
      window.__MELLOW_DROP_PATHS__ = [];
    }
  }
})();
</script>`;

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
        // image 扩展（桥接 host：fs 经 __MELLOW_BRIDGE__、资源 URL 经 __MELLOW_ASSET_RESOLVER__）
        window.MarkEdit.addExtension(MellowEngine.buildImageExtensions(MellowEngine.createBridgeImageHost()));
      } catch (e) {
        console.error('[mellow] image extensions install failed', e);
      }
      try {
        // 语法特性开关（PRD §94）：localStorage['mellow.engine.features']（设置 UI 写入）
        const features = MellowEngine.readEngineFeaturesFromStorage();
        window.MarkEdit.addExtension(MellowEngine.install(undefined, features));
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

/** 复制引擎 dist → public/editor/engine/（递归，保留子目录；浏览器 ESM 要求显式 .js 扩展名） */
function copyEngine() {
  const engineTargetDir = resolve(targetDir, 'engine');
  mkdirSync(engineTargetDir, { recursive: true });

  const copied = [];
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, `${rel}${entry.name}/`);
        continue;
      }
      if (!entry.name.endsWith('.js')) {
        continue;
      }
      const relPath = `${rel}${entry.name}`;
      const targetFile = resolve(engineTargetDir, relPath);
      mkdirSync(dirname(targetFile), { recursive: true });
      let content = readFileSync(srcPath, 'utf8');
      // 浏览器 ESM 要求显式 .js 扩展名（tsc 默认不带）
      content = content.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, '$1.js$2');
      writeFileSync(targetFile, content, 'utf8');
      copied.push(relPath);
    }
  };
  walk(engineDist);

  if (copied.length === 0) {
    throw new Error('editor-engine dist is empty, run `npm run build` in packages/editor-engine first');
  }
  console.log(`engine copied: ${copied.join(', ')}`);
}

function build() {
  const html = readFileSync(source, 'utf8');

  // 1-3. 平台无关注入（config 占位符替换 + 桥接注入）—— editor-core 规范实现
  let out = buildBundleHtml(html, { config: DEFAULT_CONFIG });

  // 3b. Tauri 适配器注入（desktop Adapter 层，editor-core 无 Tauri 知识）
  out = out.replace('</head>', `${tauriBridgeAdapter}\n</head>`);

  // 4. 引擎 loader（放在 body 尾部，CoreEditor bundle script 之后）
  out = out.replace('</body>', `${engineLoader}\n</body>`);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`editor bundle written: ${target} (${out.length} bytes)`);
}

copyEngine();
build();
