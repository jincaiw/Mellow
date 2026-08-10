/**
 * 生成 Mellow editor bundle：apps/desktop/public/editor/index.html
 *
 * 输入：
 *   1. packages/editor-core/CoreEditor/dist/index.html（MarkEdit 上游构建产物）
 *   2. packages/editor-engine/dist/*.js（Mellow Live Markdown Engine）
 *
 * 处理（平台无关注入由 editor-core 规范实现 buildBundleHtml）：
 *   1. 替换 "{{EDITOR_CONFIG}}" / "{{USER_SETTINGS}}" → 配置 JSON；
 *   2. 注入桥接脚本（webkit.messageHandlers.bridge → 宿主桥，__MELLOW_BRIDGE__/__TAURI__）；
 *   3. 复制引擎到 public/editor/engine/ 并补 .js 扩展名（浏览器 ESM 要求）；
 *   4. 注入引擎 loader（MarkEdit.addExtension）。
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

  // 1-3. 平台无关注入（config 占位符替换 + 桥接注入）—— editor-core 规范实现
  let out = buildBundleHtml(html, { config: DEFAULT_CONFIG });

  // 4. 引擎 loader（放在 body 尾部，CoreEditor bundle script 之后）
  out = out.replace('</body>', `${engineLoader}\n</body>`);

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`editor bundle written: ${target} (${out.length} bytes)`);
}

copyEngine();
build();
