/**
 * P2-2.7 视觉 Golden（900×600 / 1200×800 / 1440×900 / 200% Zoom）—— 防回退。
 *
 * 结构（零新增依赖，跟随 e2e 浏览器 dev 模式惯例）：
 *   1. vite dev server + Playwright Chromium；
 *   2. 四配置各建 tab（file.new）、等待编辑器 iframe 就绪；
 *   3. 采样布局契约（外层 shell + iframe 内编辑器排版）与基准对比（±1px）：
 *        - 外层：titlebar 高、tabbar 高、editor-container 框、editor-frame 通栏
 *          （A1 写作宽度内部化：max-width none）；sidebar/statusbar/mode-indicators 默认隐藏；
 *        - iframe：.cm-content paddingTop（P2-2.2 契约 56px）、fontSize（16px = 100% 基准 /
 *          32px = 200% Zoom）、lineHeight（fontSize × 1.6）、
 *          写作宽度 max-width（默认 860px）+ 内容居中（A1）。
 *   4. 整窗截图归档 tests/visual/actual/<config>.png（人工评审 + P2-2.8 素材）。
 *
 * V7-W2.2（G7-SHELL-03）：上列数值全部取自排版单一真源
 * `packages/settings/src/index.ts` 的 TYPOGRAPHY_DEFAULTS（16 / 1.6 / 860）。
 * 本脚本为纯 .mjs，不引 TS 源码，故此处以字面量复写；`tests/parity/verify-visual-golden.mjs`
 * 负责把这三个字面量与 TYPOGRAPHY_DEFAULTS 做交叉比对，漂移即红。
 * 历史值 17px / ×1.65 / 820px 已废弃：17 是 vendored CoreEditor iframe 的初始值（非 Mellow 默认），
 * 1.65 / 820 是运行时回落残留（Typora 真值为 html font-size 16px）。
 *
 * 基准：tests/visual/golden/layout-golden.json（首跑自动生成；--update 重建）。
 * 运行：node tests/visual/visual-golden.mjs [--update]
 * 前置：CoreEditor 上游构建（packages/editor-core/CoreEditor && yarn build）+
 *       pnpm --filter mellow-editor-core build +
 *       node apps/desktop/scripts/build-editor-bundle.mjs。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { goldenFile, platformLabel } from './golden-path.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1425;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const GOLDEN = goldenFile('layout');
const ACTUAL_DIR = resolve(HERE, 'actual');
const UPDATE = process.argv.includes('--update');
const TOLERANCE_PX = 1;

// V7-W2.2：fontSize 取自排版单一真源 TYPOGRAPHY_DEFAULTS.fontSize = 16（Typora 真值
// html font-size 16px）；100% 基准 = 16px，200% = 32px。
// 注意：vendored CoreEditor iframe 的初始 fontSize 是 17（上游值），Mellow 启动恢复
// 无条件 apply 设置值覆盖它，故采样到的必须是本表数值（差异即 G7-SHELL-03 回归）。
const TYPOGRAPHY_FONT_SIZE = 16;
const TYPOGRAPHY_LINE_HEIGHT = 1.6;
const TYPOGRAPHY_WRITING_WIDTH = 860;
const CONFIGS = [
  { name: 'win-900x600', width: 900, height: 600, fontSize: TYPOGRAPHY_FONT_SIZE },
  { name: 'win-1200x800', width: 1200, height: 800, fontSize: TYPOGRAPHY_FONT_SIZE },
  { name: 'win-1440x900', width: 1440, height: 900, fontSize: TYPOGRAPHY_FONT_SIZE },
  // Typora parity：⇧⌘= 放大至 200%（100% = 16px → 32px）
  { name: 'zoom-200', width: 1200, height: 800, fontSize: TYPOGRAPHY_FONT_SIZE * 2 },
  // V4 §14.3 Light-Dark：暗色模式布局契约（几何应与亮色一致，主题仅切换 CSS 变量）
  { name: 'dark-900x600', width: 900, height: 600, fontSize: TYPOGRAPHY_FONT_SIZE, mode: 'dark' },
  { name: 'dark-1440x900', width: 1440, height: 900, fontSize: TYPOGRAPHY_FONT_SIZE, mode: 'dark' },
];

const round1 = (n) => Math.round(n * 10) / 10;

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** 等编辑器 iframe 就绪（webModules.core + window.editor 均可用） */
async function waitEditorFrame(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (f.url().includes('/editor/index.html')) {
        const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
        if (ready) return f;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('editor iframe not ready（先构建 editor bundle：node apps/desktop/scripts/build-editor-bundle.mjs）');
}

/** 采样单配置布局契约 */
async function sampleLayout(page, frame, config) {
  const outer = await page.evaluate(() => {
    const round1 = (n) => Math.round(n * 10) / 10;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { x: round1(r.x), y: round1(r.y), w: round1(r.width), h: round1(r.height) };
    };
    const css = (sel, prop) => {
      const el = document.querySelector(sel);
      return el === null ? null : getComputedStyle(el).getPropertyValue(prop);
    };
    return {
      viewport: { w: round1(window.innerWidth), h: round1(window.innerHeight) },
      titlebar: box('.titlebar'),
      // B1（SDI）：已无 .tabbar —— 采样契约同步移除，防止 Tabbar UI 复活不被发现
      tabbarAbsent: document.querySelector('.tabbar') === null,
      editorContainer: box('.editor-container'),
      // A1（第四轮）：editor-frame 通栏（写作宽度内部化到 iframe .cm-content），
      // frame 不再自带 max-width/margin 约束 —— 采样 box 保留，宽度契约改采内区
      editorFrame: box('.mellow-editor-frame'),
      editorFrameFullBleed: (() => {
        const el = document.querySelector('.mellow-editor-frame');
        if (el === null) return null;
        const cs = getComputedStyle(el);
        return cs.maxWidth === 'none' && cs.marginLeft === '0px';
      })(),
      // Typora parity 默认隐藏项（任一可见即为布局回退）
      // V7-W2.9 修复：此前选择器为 `.sidebar`，而应用内不存在该 class
      // （侧栏节点是 `aside.file-tree`）→ 该采样恒为 false，永远抓不到
      // 「侧栏默认可见」回归（假护栏）。现改为真实节点选择器。
      sidebarVisible: document.querySelector('aside.file-tree') !== null,
      statusbarVisible: document.querySelector('.statusbar') !== null,
      modeIndicatorsVisible: document.querySelector('.mode-indicators') !== null,
      // 主题断言（V4 §14.3 Light-Dark）：暗色配置若静默回退亮色即在此暴露
      colorScheme: document.documentElement.dataset.colorScheme ?? null,
    };
  });
  const inner = await frame.evaluate(() => {
    const round1 = (n) => Math.round(n * 10) / 10;
    const content = document.querySelector('.cm-content');
    if (content === null) return null;
    // 行高契约目标：.cm-line（setLineHeight stylesheet 作用域；.cm-content 自身保持上游默认 1.4）
    const line = document.querySelector('.cm-line') ?? content;
    const cs = getComputedStyle(content);
    const lineCs = getComputedStyle(line);
    const lineHeightRaw = lineCs.lineHeight;
    return {
      fontSize: parseFloat(cs.fontSize),
      lineHeightPx: lineHeightRaw.endsWith('px') ? parseFloat(lineHeightRaw) : null,
      paddingTop: parseFloat(cs.paddingTop),
      contentWidth: round1(content.getBoundingClientRect().width),
      // A1（第四轮）：写作宽度内部化 —— .cm-content max-width（默认 860px，TYPOGRAPHY_DEFAULTS.writingWidth）+ 居中
      contentMaxWidth: cs.maxWidth === 'none' ? null : parseFloat(cs.maxWidth),
      contentCentered: (() => {
        const box = content.getBoundingClientRect();
        const scrollable = content.closest('.cm-scroller') ?? document.querySelector('.cm-editor');
        if (scrollable === null) return box.width === 0 ? null : true;
        const rect = scrollable.getBoundingClientRect();
        // clientWidth 排除垂直滚动条，避免居中判定受滚动条宽度伪差影响
        const visLeft = rect.x + (scrollable.clientLeft ?? 0);
        const visWidth = scrollable.clientWidth;
        const visCenter = visLeft + visWidth / 2;
        const boxCenter = box.x + box.width / 2;
        return box.width === 0 ? null : Math.abs(boxCenter - visCenter) <= 1;
      })(),
    };
  });
  if (inner === null) throw new Error('iframe 内未找到 .cm-content');
  return {
    viewport: outer.viewport,
    titlebarH: outer.titlebar?.h ?? null,
    tabbarAbsent: outer.tabbarAbsent,
    editorContainer: outer.editorContainer,
    editorFrame: outer.editorFrame,
    editorFrameFullBleed: outer.editorFrameFullBleed,
    sidebarVisible: outer.sidebarVisible,
    statusbarVisible: outer.statusbarVisible,
    modeIndicatorsVisible: outer.modeIndicatorsVisible,
    colorScheme: outer.colorScheme,
    editor: {
      ...inner,
      // P2-2.2 契约：Top Padding 56px；
      // V7-W2.2 契约：行高 = fontSize × TYPOGRAPHY_DEFAULTS.lineHeight（单一真源 1.6）。
      // expected* 字段与实测值由 assertEditorContract 做真实比对（非仅记录）。
      expectedFontSize: config.fontSize,
      expectedPaddingTop: 56,
      expectedLineHeightPx: round1(config.fontSize * TYPOGRAPHY_LINE_HEIGHT),
      expectedWritingWidth: TYPOGRAPHY_WRITING_WIDTH,
    },
  };
}

/**
 * V7-W2.2：把「实测 vs 期望」做真实比对。
 * 历史缺陷：expected* 字段只写入基准、从不与实测比对，且期望公式停在 ×1.65 ——
 * 于是基准里同时存在 lineHeightPx 27.2（实测）与 expectedLineHeightPx 28.1（期望），
 * 二者自相矛盾却永远为绿。此处改为硬断言。
 */
function assertEditorContract(name, sample) {
  const problems = [];
  const e = sample.editor;
  if (e.fontSize !== e.expectedFontSize) {
    problems.push(`${name}: 实测 fontSize ${e.fontSize} ≠ 期望 ${e.expectedFontSize}（V7-W2.2：启动恢复未覆盖 CoreEditor 上游 17px？）`);
  }
  if (Math.abs(e.paddingTop - e.expectedPaddingTop) > TOLERANCE_PX) {
    problems.push(`${name}: 实测 paddingTop ${e.paddingTop} ≠ 期望 ${e.expectedPaddingTop}`);
  }
  if (e.lineHeightPx === null || Math.abs(e.lineHeightPx - e.expectedLineHeightPx) > TOLERANCE_PX) {
    problems.push(`${name}: 实测 lineHeightPx ${e.lineHeightPx} ≠ 期望 ${e.expectedLineHeightPx}（V7-W2.2：行高应 = fontSize × ${TYPOGRAPHY_LINE_HEIGHT}）`);
  }
  // 写作宽度：viewWidth 足够宽时（≥ 限宽）必须精确等于单一真源；否则应等于可用宽度（auto/窄窗）
  if (e.contentMaxWidth !== null && Math.abs(e.contentMaxWidth - e.expectedWritingWidth) > TOLERANCE_PX) {
    problems.push(`${name}: 实测 contentMaxWidth ${e.contentMaxWidth} ≠ 期望 ${e.expectedWritingWidth}（V7-W2.2：写作宽度单一真源）`);
  }
  if (e.contentCentered !== true) {
    problems.push(`${name}: 内容未在滚动容器内居中（contentCentered=${e.contentCentered}）`);
  }
  return problems;
}

function diffSample(name, golden, actual) {
  const problems = [];
  const walk = (g, a, path) => {
    if (typeof g === 'number' && typeof a === 'number') {
      if (Math.abs(g - a) > TOLERANCE_PX) problems.push(`${path}: golden ${g} vs actual ${a}`);
      return;
    }
    if (g === null || typeof g !== 'object') {
      if (g !== a) problems.push(`${path}: golden ${String(g)} vs actual ${String(a)}`);
      return;
    }
    for (const key of Object.keys(g)) {
      if (!(key in a)) problems.push(`${path}.${key}: 缺失`);
      else walk(g[key], a[key], `${path}.${key}`);
    }
  };
  walk(golden, actual, name);
  return problems;
}

async function main() {
  mkdirSync(ACTUAL_DIR, { recursive: true });
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  const samples = {};
  let failed = false;
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    for (const config of CONFIGS) {
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height } });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      // 配置写入（fontSize 写完需重载走启动恢复链路；mode 走 mellow.theme.settings）
      await page.evaluate(({ size, mode }) => {
        localStorage.clear();
        localStorage.setItem('mellow.editor.fontSize', String(size));
        if (mode === 'dark') {
          localStorage.setItem('mellow.theme.settings', JSON.stringify({ mode: 'dark' }));
        }
      }, { size: config.fontSize, mode: config.mode });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const frame = await waitEditorFrame(page);
      // B1（SDI）：单文档采样（无 Tabbar，无需再建双 tab；file.new 在浏览器回落 = 替换当前文档）
      await page.waitForTimeout(600);
      const sample = await sampleLayout(page, frame, config);
      samples[config.name] = sample;
      await page.screenshot({ path: resolve(ACTUAL_DIR, `${config.name}.png`), fullPage: false });
      await context.close();
    }
  } finally {
    await browser.close();
    vite.kill();
  }

  if (UPDATE || !existsSync(GOLDEN)) {
    mkdirSync(resolve(HERE, 'golden'), { recursive: true });
    writeFileSync(GOLDEN, `${JSON.stringify(samples, null, 2)}\n`);
    console.log(`Visual golden baseline ${UPDATE ? 'updated' : 'created'}: ${GOLDEN}`);
    for (const config of CONFIGS) console.log(`  📸 ${config.name} → tests/visual/actual/${config.name}.png`);
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const problems = [];
  for (const config of CONFIGS) {
    // V7-W2.2：先做「实测 vs 期望」硬断言（含字号/行高/写作宽度单一真源），再比对基准
    problems.push(...assertEditorContract(config.name, samples[config.name]));
    if (!(config.name in golden)) problems.push(`${config.name}: golden 基准缺失（--update 重建）`);
    else problems.push(...diffSample(config.name, golden[config.name], samples[config.name]));
  }
  if (problems.length > 0) {
    console.error('Visual golden regressions:');
    for (const p of problems) console.error(`  ❌ ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Visual golden: ${CONFIGS.length} configs match baseline (±${TOLERANCE_PX}px)`);
  for (const config of CONFIGS) console.log(`  ✅ ${config.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
