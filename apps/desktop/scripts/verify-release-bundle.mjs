/**
 * V6-P0 发布包自检守卫：editor bundle 渲染层真值校验。
 *
 * 背景（v1.4.8 真机截图审计）：渲染真值已在库，但真机呈现旧渲染层——
 * 根因有二：① desktopEditorConfig.headerFontSizeDiffs 运行时覆盖了 CoreEditor
 * 默认值（改 heading.ts 无效）；② bundle 资产文件名无版本指纹，WKWebView
 * 升级后可能命中旧缓存。本守卫在打包/测试链上锁定：
 *   ① index.html 引用必须带版本指纹（core-main-vX / engine-vX/）；
 *   ② config 真值 headerFontSizeDiffs=[20,12,8,4,0,0] 必须写入 core-main；
 *   ③ engine 目录必须含 wysiwygBlocks.js / mdTokens.js 及其特征串；
 *   ④ YAML 常驻卡片（mellow-yaml-card-line）必须在 engine index。
 *
 * 运行：node apps/desktop/scripts/verify-release-bundle.mjs
 * 前置：node apps/desktop/scripts/build-editor-bundle.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const editorDir = resolve(root, 'public/editor');
const appVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(editorDir)) {
  fail('public/editor/ 不存在——先跑 build-editor-bundle.mjs');
} else {
  const indexPath = resolve(editorDir, 'index.html');
  if (!existsSync(indexPath)) {
    fail('public/editor/index.html 缺失');
  } else {
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes(`core-main-v${appVersion}.js`)) {
      fail(`index.html 未引用版本化 core-main（core-main-v${appVersion}.js）——资产指纹失效（V6-P0）`);
    }
    if (!html.includes(`engine-v${appVersion}/index.js`)) {
      fail(`index.html 未引用版本化引擎目录（engine-v${appVersion}/index.js）——资产指纹失效（V6-P0）`);
    }
    if (!html.includes('__MELLOW_BUNDLE_VERSION__')) {
      fail('index.html 缺少 __MELLOW_BUNDLE_VERSION__（诊断指纹）');
    }
    // config 真源在 index.html 的 window.config JSON（运行时覆盖 heading.ts 默认值）
    if (!html.includes('"headerFontSizeDiffs":[20,12,8,4,0,0]')) {
      fail('index.html window.config 未含 headerFontSizeDiffs=[20,12,8,4,0,0]（V5-B 标题阶梯真值被旧 config 覆盖）');
    }
  }

  const coreMainPath = resolve(editorDir, `core-main-v${appVersion}.js`);
  if (!existsSync(coreMainPath)) {
    fail(`core-main-v${appVersion}.js 缺失（版本指纹抽取未执行）`);
  }

  const engineDir = resolve(editorDir, `engine-v${appVersion}`);
  if (!existsSync(engineDir) || !statSync(engineDir).isDirectory()) {
    fail(`engine-v${appVersion}/ 目录缺失（引擎未按版本指纹复制）`);
  } else {
    const list = readdirSync(engineDir, { recursive: true }).map(String);
    for (const required of ['wysiwygBlocks.js', 'mdTokens.js', 'yamlFrontMatter.js', 'index.js']) {
      if (!list.some((f) => f === required || f.endsWith(`/${required}`))) {
        fail(`engine-v${appVersion}/ 缺少 ${required}（editor-engine dist 过期——先重建 engine）`);
      }
    }
    const findFile = (name) => list.find((f) => f === name || f.endsWith(`/${name}`));
    const checks = [
      ['wysiwygBlocks.js', 'mellow-quote-line', 'wysiwygBlocks 装配'],
      ['yamlFrontMatter.js', 'mellow-yaml-card-line', 'YAML 常驻卡片'],
    ];
    for (const [file, marker, label] of checks) {
      const rel = findFile(file);
      if (rel === undefined) continue; // 缺文件已在上面报过
      const content = readFileSync(resolve(engineDir, rel), 'utf8');
      if (!content.includes(marker)) fail(`engine ${file} 缺少${label}特征串（${marker}）——渲染真值未进产物`);
    }

    // ── 引擎模块集合 == 源码模块集合（2026-10-01）──────────────────────────
    // 上面那 4 个固定文件名只能证明「产物非空」，证明不了「产物是这一版源码」。
    // 实测事故：`packages/editor-engine/dist/` 停留在 2026-09-25，而 09-30 新增的
    // `inputLatency.ts`（W-PERF-1 埋点）从未编译 → 埋点不在任何交付产物里，应用内
    // 延迟读数恒为 null，屏幕上看不出原因、CI 也不会红（CI 先跑引擎构建）。
    // 判据确定性（不比 mtime）：src/**/*.ts（去掉 .d.ts）↔ engine-v*/**/*.js 严格相等。
    const engineSrcDir = resolve(root, '../../packages/editor-engine/src');
    if (existsSync(engineSrcDir)) {
      const walk = (dir, keep, rel = '') => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(resolve(dir, e.name), keep, `${rel}${e.name}/`)
          : keep(e.name) ? [`${rel}${e.name}`] : []);
      const expected = new Set(
        walk(engineSrcDir, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts')).map((f) => `${f.slice(0, -3)}.js`),
      );
      const shipped = new Set(walk(engineDir, (n) => n.endsWith('.js')));
      const notShipped = [...expected].filter((f) => !shipped.has(f)).sort();
      const deadCode = [...shipped].filter((f) => !expected.has(f)).sort();
      if (notShipped.length > 0) {
        fail(`engine-v${appVersion}/ 缺少 ${notShipped.length} 个源码模块：${notShipped.join(', ')}`
          + '（editor-engine dist 陈旧 —— 交付包里的引擎不是这一版源码；先重建 engine）');
      }
      if (deadCode.length > 0) {
        fail(`engine-v${appVersion}/ 含 ${deadCode.length} 个无源文件的产物：${deadCode.join(', ')}`
          + '（tsc 不清 outDir 的孤儿 —— copyEngine 应已跳过，此处说明产物目录有旧残留）');
      }
    }
  }

  // 旧版无指纹资产残留（会进 frontendDist 打包且证明清理未执行）
  for (const name of readdirSync(editorDir)) {
    if (name === 'engine' || (name === 'core-main.js')) {
      fail(`旧版无指纹资产残留：public/editor/${name}（清理规则未生效）`);
    }
  }
}

if (problems.length > 0) {
  console.error('Release bundle self-check FAILED:');
  for (const p of problems) console.error(`  ❌ ${p}`);
  process.exit(1);
}
console.log(`Release bundle self-check OK: v${appVersion} fingerprint + heading diffs [20,12,8,4,0,0] + engine truth markers`);
