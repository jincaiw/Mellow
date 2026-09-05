/**
 * 视觉 Golden 契约护栏（P2-2.7，静态结构断言；布局级对比由 visual-golden.mjs 真跑执行）。
 *
 * 断言：
 *   ① visual-golden.mjs 覆盖四配置（900×600 / 1200×800 / 1440×900 / 200% Zoom）；
 *   ② 采样契约点齐备：56px paddingTop、fontSize（17/34）、行高、写作宽度、
 *      sidebar/statusbar/mode-indicators 默认隐藏、editor-frame 居中；
 *   ③ 截图归档到 tests/visual/actual/、基准 tests/visual/golden/layout-golden.json
 *      存在且含四配置（--update 可重建）；
 *   ④ P2-2.8 截图归档脚本存在且写 manifest（三平台状态可追溯）。
 *   ⑤ drift canary。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const scriptPath = 'tests/visual/visual-golden.mjs';
if (!existsSync(resolve(root, scriptPath))) {
  fail(`缺少 ${scriptPath}（P2-2.7 视觉 Golden 主脚本）`);
} else {
  const source = read(scriptPath);
  for (const config of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
    if (!source.includes(`'${config}'`)) fail(`visual-golden 缺少配置 ${config}（P2-2.7 四配置）`);
  }
  for (const assertion of [
    ['expectedPaddingTop: 56', 'paddingTop 56px 契约采样（P2-2.2）'],
    ['expectedFontSize: config.fontSize', 'fontSize 采样（17px 基准 / 34px = 200% Zoom）'],
    ['expectedLineHeightPx: round1(config.fontSize * 1.65)', '行高 = fontSize × 1.65 采样（P2-2.1）'],
    // A1（第四轮）：写作宽度内部化到 iframe .cm-content（frame 通栏，不再采 max-width）
    ['contentMaxWidth', '写作宽度采样（A1 内部化：.cm-content max-width，PRD §18 默认 820px）'],
    ['editorFrameFullBleed', 'editor-frame 通栏采样（A1：max-width none）'],
    ['sidebarVisible', 'sidebar 默认隐藏采样'],
    ['statusbarVisible', 'statusbar 默认隐藏采样'],
    ['modeIndicatorsVisible', 'mode-indicators 默认隐藏采样（P2-2.5 不常驻）'],
    ["resolve(ACTUAL_DIR, `${config.name}.png`)", '截图归档到 actual/'],
    ['layout-golden.json', '基准文件名'],
    ['--update', '基准重建开关'],
    ['TOLERANCE_PX = 1', '±1px 容差'],
  ]) {
    if (!source.includes(assertion[0])) fail(`visual-golden 缺少 ${assertion[1]}（${assertion[0]}）`);
  }
}

const goldenPath = resolve(root, 'tests/visual/golden/layout-golden.json');
if (!existsSync(goldenPath)) {
  fail('tests/visual/golden/layout-golden.json 缺失（首跑 node tests/visual/visual-golden.mjs 生成）');
} else {
  const golden = JSON.parse(read('tests/visual/golden/layout-golden.json'));
  for (const config of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
    const sample = golden[config];
    if (sample === undefined) fail(`golden 基准缺少配置 ${config}`);
    else if (sample.editor?.expectedPaddingTop !== 56) fail(`golden ${config} paddingTop 契约应为 56（实际 ${sample.editor?.expectedPaddingTop}）`);
    else if (sample.sidebarVisible !== false || sample.statusbarVisible !== false || sample.modeIndicatorsVisible !== false) {
      fail(`golden ${config} 存在默认可见的 sidebar/statusbar/mode-indicators（违反 Typora parity 隐藏契约）`);
    }
  }
}

for (const png of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
  if (!existsSync(resolve(root, `tests/visual/actual/${png}.png`))) {
    fail(`tests/visual/actual/${png}.png 缺失（跑 visual-golden.mjs 归档）`);
  }
}

// P2-2.8：三平台 window chrome 截图归档脚本 + manifest
const chromeScript = 'tests/visual/capture-window-chrome.mjs';
if (!existsSync(resolve(root, chromeScript))) {
  fail(`缺少 ${chromeScript}（P2-2.8 截图归档）`);
} else {
  const chrome = read(chromeScript);
  for (const item of ['macOS', 'manifest', 'platform-mac', 'screenshots']) {
    if (!chrome.includes(item)) fail(`capture-window-chrome 缺少 ${item}（P2-2.8 归档可追溯性）`);
  }
}
const manifestPath = resolve(root, 'tests/benchmark/screenshots/window-chrome-manifest.json');
if (!existsSync(manifestPath)) {
  fail('tests/benchmark/screenshots/window-chrome-manifest.json 缺失（P2-2.8 归档状态）');
}

// ── drift canary：护栏必须能抓住契约漂移 ─────────────────────────────────
if (existsSync(resolve(root, scriptPath))) {
  const drifted = read(scriptPath).replace('expectedPaddingTop: 56', 'expectedPaddingTop: 2');
  if (!drifted.includes('expectedPaddingTop: 2') || drifted.includes('expectedPaddingTop: 56')) {
    fail('视觉 Golden 护栏自检失败：无法模拟 paddingTop 契约漂移，护栏已失效');
  }
}

if (errors.length > 0) {
  throw new Error(`Visual golden contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Visual golden: 4-config layout contract armed (900x600 / 1200x800 / 1440x900 / 200% zoom); padding 56px + writing width + hidden-by-default asserted; screenshots archived; window-chrome manifest present');
