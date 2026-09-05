/**
 * P2-2.7 视觉 Golden（900×600 / 1200×800 / 1440×900 / 200% Zoom）—— 防回退。
 *
 * 结构（零新增依赖，跟随 e2e 浏览器 dev 模式惯例）：
 *   1. vite dev server + Playwright Chromium；
 *   2. 四配置各建 tab（file.new）、等待编辑器 iframe 就绪；
 *   3. 采样布局契约（外层 shell + iframe 内编辑器排版）与基准对比（±1px）：
 *        - 外层：titlebar 高、tabbar 高、editor-container 框、editor-frame 通栏
 *          （A1 写作宽度内部化：max-width none）；sidebar/statusbar/mode-indicators 默认隐藏；
 *        - iframe：.cm-content paddingTop（P2-2.2 契约 56px）、fontSize（17px 基准 /
 *          34px = 200% Zoom）、lineHeight（fontSize × 1.65）、
 *          写作宽度 max-width（默认 820px）+ 内容居中（A1）。
 *   4. 整窗截图归档 tests/visual/actual/<config>.png（人工评审 + P2-2.8 素材）。
 *
 * 基准：tests/visual/golden/layout-golden.json（首跑自动生成；--update 重建）。
 * 运行：node tests/visual/visual-golden.mjs [--update]
 * 前置：CoreEditor 上游构建（packages/editor-core/CoreEditor && yarn build）+
 *       pnpm --filter mellow-desktop exec node scripts/build-editor-bundle.mjs。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1425;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const GOLDEN = resolve(HERE, 'golden/layout-golden.json');
const ACTUAL_DIR = resolve(HERE, 'actual');
const UPDATE = process.argv.includes('--update');
const TOLERANCE_PX = 1;

const CONFIGS = [
  { name: 'win-900x600', width: 900, height: 600, fontSize: 17 },
  { name: 'win-1200x800', width: 1200, height: 800, fontSize: 17 },
  { name: 'win-1440x900', width: 1440, height: 900, fontSize: 17 },
  // Typora parity：⇧⌘= 放大至 200%（R2-4 口径 17px = 100% → 34px）
  { name: 'zoom-200', width: 1200, height: 800, fontSize: 34 },
  // V4 §14.3 Light-Dark：暗色模式布局契约（几何应与亮色一致，主题仅切换 CSS 变量）
  { name: 'dark-900x600', width: 900, height: 600, fontSize: 17, mode: 'dark' },
  { name: 'dark-1440x900', width: 1440, height: 900, fontSize: 17, mode: 'dark' },
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
      tabbar: box('.tabbar'),
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
      sidebarVisible: document.querySelector('.sidebar') !== null,
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
      // A1（第四轮）：写作宽度内部化 —— .cm-content max-width（默认 820px）+ 居中
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
    tabbarH: outer.tabbar?.h ?? null,
    editorContainer: outer.editorContainer,
    editorFrame: outer.editorFrame,
    editorFrameFullBleed: outer.editorFrameFullBleed,
    sidebarVisible: outer.sidebarVisible,
    statusbarVisible: outer.statusbarVisible,
    modeIndicatorsVisible: outer.modeIndicatorsVisible,
    colorScheme: outer.colorScheme,
    editor: {
      ...inner,
      // P2-2.2 契约：Top Padding 56px；行高 = fontSize × 1.65（默认设置）
      expectedFontSize: config.fontSize,
      expectedPaddingTop: 56,
      expectedLineHeightPx: round1(config.fontSize * 1.65),
    },
  };
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
      // 新建两个 tab：单 tab 自动隐藏（Typora parity），双 tab 才能采样 tabbar
      await page.evaluate(() => {
        void window.__MELLOW_COMMANDS__?.dispatch('file.new');
        void window.__MELLOW_COMMANDS__?.dispatch('file.new');
      });
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
