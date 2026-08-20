/**
 * 生成 Mellow QuickLook bundle：apps/desktop/quicklook/Resources/quicklook.html
 *
 * B4（PRD §82）：Finder 空格预览 .md。
 * 输入：packages/editor-core/CoreEditor/dist/index.html（上游 vite singlefile 产物）
 * 处理：
 *   1. buildBundleHtml 注入 config（host='quicklook' → setUpQuickLook 只读编辑器）；
 *   2. 不注入 Tauri 适配器 / 引擎 loader（QuickLook 无桥、纯源码预览）；
 *   3. 文本由 appex 的 PreviewViewController 经 evaluateJavaScript dispatch 注入。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// editor-core 平台无关 bundle 构建模块（tsc 产物，CJS）
// eslint-disable-next-line import/no-unresolved
import { buildBundleHtml } from '../../../packages/editor-core/dist/bundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../../packages/editor-core/CoreEditor/dist/index.html');
const targetDir = resolve(root, 'quicklook/Resources');
const target = resolve(targetDir, 'quicklook.html');

function build() {
  const html = readFileSync(source, 'utf8');

  // QuickLook 配置：只读 + 无行号 + 跟随系统主题（setUpQuickLook 内部处理亮暗）
  let out = buildBundleHtml(html, {
    config: {
      host: 'quicklook',
      text: '',
      theme: 'github-light',
      readOnlyMode: true,
      showLineNumbers: false,
      showActiveLineIndicator: false,
      invisiblesBehavior: 'never',
      lineWrapping: true,
    },
    // 空桥接（QuickLook 无 native bridge；BRIDGE_INJECTION 的 no-op 语义已满足）
    bridgeInjection: '/* mellow quicklook: no bridge */',
  });

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`quicklook bundle written: ${target} (${out.length} bytes)`);
}

build();
