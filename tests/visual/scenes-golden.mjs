/**
 * §9.3 视觉 Golden — 补齐 14 场景中尚未覆盖的 7 个（P0-LAYOUT-002 / W2.9）。
 *
 * 背景：plan §9.3 定义每平台 14 场景：
 *   首次启动 · 单文档 Live · File Tree · File List · Outline · Search · Settings ·
 *   Selection Toolbar · Table Toolbar · Reader · Light / Dark · 900×600 · 200% Zoom
 * `visual-golden.mjs`（6 配置）与 `sidebar-golden.mjs`（4 视图）合计只覆盖其中 7 个
 * （File Tree / Outline / Search / Light / Dark / 900×600 / 200% Zoom）。
 * 本文件补齐剩余 7 个，使 macOS 侧 14 场景全覆盖。
 *
 * 覆盖（本文件）：
 *   1. first-run       首次启动（无 localStorage 覆写：侧栏 / 状态栏 / Tabbar 默认隐藏）
 *   2. single-doc-live 单文档 Live（标题 / 列表 / 代码 / 表格混排，写作宽度与行高）
 *   3. file-list       File List（Articles，W1.5 恢复的 ⌃⌘2 视图）
 *   4. settings        Settings 面板
 *   5. selection-toolbar 浮动编辑器工具栏（选中态）
 *   6. table-toolbar   表格工具栏
 *   7. reader          Reader 语义渲染
 *
 * 与同目录另两个 Golden 一样的约定：
 *   - 基准 tests/visual/golden/scenes-golden.json（首跑自动生成；--update 重建）
 *   - 整窗截图归档 tests/visual/actual/scene-<name>.png（人工评审素材）
 *   - 场景无法建立时**抛错**，不得静默跳过（否则又是一个假绿护栏）
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/visual/scenes-golden.mjs [--update]
 * 前置：CoreEditor 已构建 + node apps/desktop/scripts/build-editor-bundle.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { goldenFile, platformLabel } from './golden-path.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1427;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const GOLDEN = goldenFile('scenes');
const ACTUAL_DIR = resolve(HERE, 'actual');
const UPDATE = process.argv.includes('--update');
const TOLERANCE_PX = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

/** 单文档 Live 用正文：标题 / 列表 / 任务 / 代码 / 引用 / 表格 混排 */
const LIVE_DOC = [
  '# Mellow Golden',
  '',
  'Live markdown with **bold** and `code`.',
  '',
  '- alpha',
  '- beta',
  '',
  '1. first',
  '2. second',
  '',
  '- [ ] todo',
  '',
  '> quote line',
  '',
  '```ts',
  'const answer = 42;',
  '```',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
].join('\n');

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await sleep(300);
  }
  return false;
}

async function waitEditorFrame(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (f.url().includes('/editor/index.html')) {
        const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
        if (ready) return f;
      }
    }
    await sleep(300);
  }
  throw new Error('editor iframe not ready（先构建 editor bundle：node apps/desktop/scripts/build-editor-bundle.mjs）');
}

const waitFor = async (fn, timeoutMs = 8000, stepMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
};

async function main() {
  mkdirSync(ACTUAL_DIR, { recursive: true });
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  const samples = {};
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');

    // ── 场景 1：首次启动（不注入任何 localStorage 覆写 = 全新 profile）──────
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#root > *', { timeout: 15000 });
      await waitEditorFrame(page);
      await sleep(500);
      samples['first-run'] = await page.evaluate(() => {
        const round = (n) => Math.round(n * 10) / 10;
        const content = document.querySelector('iframe')?.contentDocument?.querySelector('.cm-content');
        return {
          sidebar: document.querySelector('aside.file-tree') !== null,
          tabbar: document.querySelector('.tabbar') !== null,
          statusBar: document.querySelector('.status-bar, .statusbar') !== null,
          writingWidth: content ? round(content.getBoundingClientRect().width) : null,
        };
      });
      await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-first-run.png') });
      await context.close();
    }

    // 以下场景共用「侧栏可见 + files 模式 + mock workspace」的上下文
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });
    const frame = await waitEditorFrame(page);

    // 写入混排正文
    const inserted = await frame.evaluate((content) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!view?.dispatch) return false;
      view.dispatch({ changes: { from: 0, insert: content } });
      return true;
    }, LIVE_DOC);
    if (!inserted) throw new Error('window.editor 不可用（无法写入正文）');
    await sleep(500);

    // ── 场景 2：单文档 Live ─────────────────────────────────────────────
    samples['single-doc-live'] = await frame.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const content = document.querySelector('.cm-content');
      const lines = document.querySelectorAll('.cm-line');
      const style = content ? getComputedStyle(content) : null;
      return {
        writingWidth: content ? round(content.getBoundingClientRect().width) : null,
        lineCount: lines.length,
        fontSize: style ? Number.parseFloat(style.fontSize) : null,
        lineHeight: style ? round1Local(Number.parseFloat(style.lineHeight)) : null,
        // WYSIWYG：粗体 marker 在视觉上必须被隐藏（不占宽）
        boldMarkerWidth: (() => {
          const el = document.querySelector('.cm-line *[class*="formatting-md"]') ?? document.querySelector('.cm-line span[class*="marker"]');
          return el ? round(el.getBoundingClientRect().width) : null;
        })(),
      };
      function round1Local(n) { return Math.round(n * 10) / 10; }
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-single-doc-live.png') });

    // ── 场景 3：File List（Articles，⌃⌘2）────────────────────────────────
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.sidebar.fileList'));
    const fileListReady = await waitFor(async () => page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      return aside?.querySelectorAll('.file-list-item, .file-list-group').length > 0
        || aside?.querySelector('.sidebar-empty') !== null;
    }));
    if (!fileListReady) throw new Error('File List 场景建立失败（未切到 fileList 模式）');
    await sleep(300);
    samples['file-list'] = await page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const aside = document.querySelector('aside.file-tree');
      const r = aside.getBoundingClientRect();
      return {
        aside: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
        label: document.querySelector('.sidebar-mode-trigger-label')?.textContent?.trim() ?? null,
        itemCount: aside.querySelectorAll('.file-list-item').length,
        groupCount: aside.querySelectorAll('.file-list-group').length,
        empty: aside.querySelector('.sidebar-empty') !== null,
      };
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-file-list.png') });

    // ── 场景 4：Settings ────────────────────────────────────────────────
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('settings.open'));
    const settingsReady = await waitFor(async () => page.evaluate(() => document.querySelector('.settings-panel') !== null));
    if (!settingsReady) throw new Error('Settings 场景建立失败（.settings-panel 未出现）');
    await sleep(400);
    samples.settings = await page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const panel = document.querySelector('.settings-panel');
      const r = panel.getBoundingClientRect();
      return {
        panel: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
        categoryCount: panel.querySelectorAll('.settings-category, .settings-nav-item, nav button').length,
        scrollable: panel.scrollHeight > panel.clientHeight,
      };
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-settings.png') });
    // 关闭：settings.open 为切换，再 dispatch 一次；失败则按 Esc
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('settings.open'));
    await sleep(300);

    // ── 场景 5：Selection Toolbar（浮动编辑器工具栏）─────────────────────
    await frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({ selection: { anchor: 0, head: 24 } });
      view.focus();
    });
    const selReady = await waitFor(async () => frame.evaluate(() => document.querySelector('.mellow-selection-toolbar') !== null), 10000);
    if (!selReady) throw new Error('Selection Toolbar 场景建立失败（未出现 .mellow-selection-toolbar）');
    await sleep(300);
    samples['selection-toolbar'] = await frame.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const bar = document.querySelector('.mellow-selection-toolbar');
      const r = bar.getBoundingClientRect();
      return {
        bar: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
        buttonCount: bar.querySelectorAll('button').length,
        visible: r.width > 0 && r.height > 0,
      };
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-selection-toolbar.png') });

    // ── 场景 6：Table Toolbar ───────────────────────────────────────────
    // 把光标放进表格（正文末行是表格）以唤起表格工具栏
    await frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      const text = view.state.doc.toString();
      const pos = text.indexOf('| 1 | 2 |');
      view.dispatch({ selection: { anchor: pos + 2, head: pos + 2 } });
      view.focus();
    });
    const tableReady = await waitFor(async () => frame.evaluate(() => document.querySelector('.mellow-table-toolbar') !== null), 10000);
    if (!tableReady) throw new Error('Table Toolbar 场景建立失败（未出现 .mellow-table-toolbar）');
    await sleep(300);
    samples['table-toolbar'] = await frame.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const bar = document.querySelector('.mellow-table-toolbar');
      const r = bar.getBoundingClientRect();
      return {
        bar: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
        buttonCount: bar.querySelectorAll('.mellow-table-toolbar-btn').length,
        visible: r.width > 0 && r.height > 0,
      };
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-table-toolbar.png') });

    // ── 场景 7：Reader ──────────────────────────────────────────────────
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
    await sleep(500);
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('reader.open'));
    const readerReady = await waitFor(async () => page.evaluate(() => document.querySelector('.mellow-reader-shell') !== null), 10000);
    if (!readerReady) throw new Error('Reader 场景建立失败（未出现 .mellow-reader-shell）');
    await sleep(400);
    samples.reader = await page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const shell = document.querySelector('.mellow-reader-shell');
      const r = shell.getBoundingClientRect();
      return {
        shell: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
        hasTitle: shell.querySelector('h1') !== null,
        tableCount: shell.querySelectorAll('table').length,
        codeBlockCount: shell.querySelectorAll('pre').length,
      };
    });
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'scene-reader.png') });

    await context.close();
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }

  // ── 实测 vs 期望硬断言 ──────────────────────────────────────────────────
  // 与 visual-golden.mjs 的 assertEditorContract 同思路：期望字段不能「只记录不比对」。
  // 立此断言的直接原因：首跑时 selection-toolbar 采到 {w:0,h:0,visible:false} ——
  // 若只做基线 diff，就会把「浮动工具栏不显示」这个真 bug 烘进基准，成为永久假绿。
  const EXPECT = (s) => ([
    ['first-run 默认隐藏侧栏 / 状态栏 / Tabbar（文档优先）',
      s['first-run'].sidebar === false && s['first-run'].tabbar === false && s['first-run'].statusBar === false],
    ['single-doc-live 写作宽度 860 / 字号 16 / marker 视觉隐藏',
      s['single-doc-live'].writingWidth === 860 && s['single-doc-live'].fontSize === 16 && s['single-doc-live'].boldMarkerWidth === 0],
    ['file-list 切到 Articles（文档列表）',
      s['file-list'].label === '文档列表'],
    ['settings 面板已渲染且有分类',
      s.settings.panel.w > 0 && s.settings.categoryCount > 0],
    ['selection-toolbar 必须真实可见（防 V7-W2.4 回归）',
      s['selection-toolbar'].visible === true && s['selection-toolbar'].buttonCount === 10],
    ['table-toolbar 必须真实可见且有按钮',
      s['table-toolbar'].visible === true && s['table-toolbar'].buttonCount > 0],
    ['reader 语义渲染出标题 / 表格 / 代码块',
      s.reader.hasTitle === true && s.reader.tableCount === 1 && s.reader.codeBlockCount === 1],
  ]);
  const hardFail = EXPECT(samples).filter(([, ok]) => !ok).map(([name]) => name);
  if (hardFail.length > 0) {
    console.error('Scenes golden: 硬断言失败');
    for (const name of hardFail) console.error(`  ✗ ${name}`);
    console.error(JSON.stringify(samples, null, 2));
    process.exit(1);
  }

  // ── 与基准对比 ────────────────────────────────────────────────────────
  const names = Object.keys(samples);
  if (UPDATE || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, `${JSON.stringify(samples, null, 2)}\n`);
    console.log(`Scenes golden: 基准已写入（${names.length} 场景）→ ${GOLDEN}`);
    return;
  }
  const baseline = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const drift = [];
  const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
    v !== null && typeof v === 'object'
      ? flat(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v]]
  ));
  for (const name of names) {
    if (!(name in baseline)) { drift.push(`${name}: 基准缺少该场景`); continue; }
    const b = Object.fromEntries(flat(baseline[name]));
    const a = Object.fromEntries(flat(samples[name]));
    for (const key of Object.keys(b)) {
      if (!(key in a)) { drift.push(`${name}.${key}: 采样缺失`); continue; }
      const bv = b[key]; const av = a[key];
      if (typeof bv === 'number' && typeof av === 'number') {
        if (Math.abs(bv - av) > TOLERANCE_PX) drift.push(`${name}.${key}: ${bv} → ${av}`);
      } else if (bv !== av) {
        drift.push(`${name}.${key}: ${JSON.stringify(bv)} → ${JSON.stringify(av)}`);
      }
    }
  }
  if (drift.length > 0) {
    console.error(`Scenes golden: ${drift.length} 项偏离基准（±${TOLERANCE_PX}px）`);
    for (const d of drift) console.error(`  ✗ ${d}`);
    process.exit(1);
  }
  console.log(`Scenes golden: ${names.length} 场景命中基准（±${TOLERANCE_PX}px）`);
  for (const n of names) console.log(`  ✅ ${n}`);
}

main().catch((error) => {
  console.error(`❌ scenes-golden 失败：${error.message}`);
  process.exit(1);
});
