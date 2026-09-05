/**
 * V5-A Typora 化三模式 Sidebar Screenshot Golden（files-tree / outline / search）—— 防回退。
 *
 * 结构（跟随 visual-golden.mjs 惯例，零新增依赖）：
 *   1. vite dev server + Playwright Chromium（浏览器 dev 走 host-api mock fs）；
 *   2. mock workspace：/dir/{a.md, notes.md, sub/}（fileTree.newFile/newFolder + prompt accept）；
 *   3. 打开 a.md，经 iframe window.editor.view.dispatch 写入含 3 个 heading 的正文并
 *      file.save 落盘（mock fs writeText 持久化 → 全局搜索可命中）；
 *   4. 三视图各采样布局契约（aside / quickbar / 行数 / 首行几何）与基准对比（±1px）：
 *        - files-tree：quickbar 存在、树行数、首行框；
 *        - outline：heading 行数（1×h1 + 2×h2）、首行框；
 *        - search：分组数 + 匹配行数、首匹配框（查询 'Mellow'）。
 *      模式切换经头部单标签下拉（.sidebar-mode-trigger → .sidebar-mode-item）。
 *   5. 整窗截图归档 tests/visual/actual/sidebar-<view>.png（人工评审素材）。
 *
 * 基准：tests/visual/golden/sidebar-golden.json（首跑自动生成；--update 重建）。
 * 运行：node tests/visual/sidebar-golden.mjs [--update]
 * 前置：与 visual-golden.mjs 相同（CoreEditor 构建 + build-editor-bundle）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1426;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const GOLDEN = resolve(HERE, 'golden/sidebar-golden.json');
const ACTUAL_DIR = resolve(HERE, 'actual');
const UPDATE = process.argv.includes('--update');
const TOLERANCE_PX = 1;

const round1 = (n) => Math.round(n * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 写入 a.md 的正文：3 个 heading（outline 契约）+ 'Mellow' 出现 2 行（search 契约） */
const DOC_CONTENT = [
  '# Mellow Guide',
  '',
  'Welcome to Mellow.',
  '',
  '## Getting Started',
  '',
  'Follow the quick start steps.',
  '',
  '## Tips',
  '',
  'Global search keeps notes findable.',
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
    await sleep(300);
  }
  throw new Error('editor iframe not ready（先构建 editor bundle：node apps/desktop/scripts/build-editor-bundle.mjs）');
}

/** 通过命令 + prompt 对话框在 mock workspace 中创建文件/文件夹（同 drag-drop-verify.mjs） */
async function createEntry(page, commandId, name) {
  const dialogTaker = (dialog) => dialog.accept(name).catch(() => {});
  page.on('dialog', dialogTaker);
  try {
    await page.evaluate((id) => window.__MELLOW_COMMANDS__.dispatch(id), commandId);
    await sleep(400);
  } finally {
    page.off('dialog', dialogTaker);
  }
}

/** 页面内合成 click（Playwright action 类在虚拟列表重渲染下不收敛，同 P3.7 结论） */
async function syntheticClick(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, selector);
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 预置：侧栏可见 + files/tree 模式 + mock workspace 根（同 drag-drop-verify.mjs）
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });
    await waitEditorFrame(page);

    // ── mock workspace：/dir/{a.md, notes.md, sub/} ─────────────────────────
    await createEntry(page, 'fileTree.newFile', 'a.md');
    await createEntry(page, 'fileTree.newFile', 'notes.md');
    await createEntry(page, 'fileTree.newFolder', 'sub');
    const workspaceReady = await waitFor(async () => {
      const titles = await page.evaluate(() => Array.from(document.querySelectorAll('button.tree-row')).map((r) => r.getAttribute('title')));
      return titles.includes('/dir/a.md') && titles.includes('/dir/notes.md') && titles.includes('/dir/sub');
    });
    if (!workspaceReady) throw new Error('mock workspace 构建失败');

    // ── 打开 a.md 并写入正文（双击 = onOpen；view.dispatch 绕开 CDP 键盘不可靠）──
    await syntheticClick(page, 'button.tree-row[title="/dir/a.md"]'); // 先选中
    await page.evaluate(() => {
      const row = document.querySelector('button.tree-row[title="/dir/a.md"]');
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    const frame = await waitEditorFrame(page);
    const inserted = await frame.evaluate((content) => {
      // MarkEdit core：window.editor 即 CodeMirror EditorView（dispatch/state 直挂）
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!view?.dispatch) return false;
      view.dispatch({ changes: { from: 0, insert: content } });
      return true;
    }, DOC_CONTENT);
    if (!inserted) throw new Error('window.editor 不可用（无法写入正文）');
    await sleep(400);
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
    await sleep(600);

    /** 通用采样：aside 框 + 视图特定结构 */
    const sampleView = (view) => page.evaluate((v) => {
      const round = (n) => Math.round(n * 10) / 10;
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
      };
      const count = (sel) => document.querySelectorAll(sel).length;
      const base = {
        aside: box('aside.file-tree'),
        widthSaved: localStorage.getItem('mellow.sidebar.width'),
      };
      if (v === 'files-tree') {
        return {
          ...base,
          quickbar: box('.file-quickbar'),
          filterInput: box('.file-filter-input'),
          quickBtnCount: count('.file-quickbtn'),
          rowCount: count('button.tree-row'),
          firstRow: box('button.tree-row'),
        };
      }
      if (v === 'outline') {
        return {
          ...base,
          rowCount: count('.outline-row'),
          firstRow: box('.outline-row'),
        };
      }
      return {
        ...base,
        searchInput: box('.search-input'),
        groupCount: count('.search-group-title'),
        matchCount: count('.search-match'),
        firstMatch: box('.search-match'),
      };
    }, view);

    // ── 视图 1：files-tree（当前态） ─────────────────────────────────────────
    samples['files-tree'] = await sampleView('files-tree');
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'sidebar-files-tree.png'), fullPage: false });

    // ── 视图 2：outline（头部单标签下拉切换） ────────────────────────────────
    await syntheticClick(page, '.sidebar-mode-trigger');
    const menuOpen = await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.sidebar-mode-item').length)) >= 3);
    if (!menuOpen) throw new Error('模式下拉菜单未展开');
    await syntheticClick(page, '.sidebar-mode-item:nth-of-type(2)'); // files → outline
    const outlineReady = await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.outline-row').length)) >= 3);
    if (!outlineReady) throw new Error('outline 视图未就绪（heading 行数不足）');
    await sleep(300);
    samples['outline'] = await sampleView('outline');
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'sidebar-outline.png'), fullPage: false });

    // ── 视图 3：search（下拉切换 + 填查询 + 点运行按钮，不用 Enter 免触发 aside 导航跳转） ──
    await syntheticClick(page, '.sidebar-mode-trigger');
    await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.sidebar-mode-item').length)) >= 3);
    await syntheticClick(page, '.sidebar-mode-item:nth-of-type(3)'); // outline → search
    const searchInputReady = await waitFor(async () => (await page.evaluate(() => document.querySelector('.search-input'))) !== null);
    if (!searchInputReady) throw new Error('search 输入框未出现');
    await page.evaluate(() => {
      const input = document.querySelector('.search-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Mellow');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    const runClicked = await page.evaluate(() => {
      // 运行按钮：search 分支内的动作按钮（zh「搜索」/ en「Search」）。
      // 必须排除 .sidebar-mode-nav 内的下拉触发/菜单项（其文本同为「搜索」，但点击只切模式不执行搜索）
      const buttons = Array.from(document.querySelectorAll('aside.file-tree button'))
        .filter((b) => b.closest('.sidebar-mode-nav') === null);
      const target = buttons.find((b) => !b.disabled && ['搜索', 'Search'].includes(b.textContent.trim())) ?? null;
      if (target === null) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    if (!runClicked) throw new Error('search 运行按钮未找到');
    const searchReady = await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.search-match').length)) >= 2);
    if (!searchReady) throw new Error('search 结果未就绪（匹配数不足）');
    await sleep(300);
    samples['search'] = await sampleView('search');
    await page.screenshot({ path: resolve(ACTUAL_DIR, 'sidebar-search.png'), fullPage: false });

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }

  if (UPDATE || !existsSync(GOLDEN)) {
    mkdirSync(resolve(HERE, 'golden'), { recursive: true });
    writeFileSync(GOLDEN, `${JSON.stringify(samples, null, 2)}\n`);
    console.log(`Sidebar golden baseline ${UPDATE ? 'updated' : 'created'}: ${GOLDEN}`);
    for (const view of Object.keys(samples)) console.log(`  📸 sidebar-${view} → tests/visual/actual/sidebar-${view}.png`);
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
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
  for (const view of ['files-tree', 'outline', 'search']) {
    if (!(view in golden)) problems.push(`${view}: golden 基准缺失（--update 重建）`);
    else walk(golden[view], samples[view], view);
  }
  if (problems.length > 0) {
    console.error('Sidebar golden regressions:');
    for (const p of problems) console.error(`  ❌ ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log('Sidebar golden: 3 views match baseline (±1px)');
  for (const view of ['files-tree', 'outline', 'search']) console.log(`  ✅ ${view}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
