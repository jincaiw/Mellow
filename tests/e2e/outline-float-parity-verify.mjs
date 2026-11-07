/**
 * 浮动大纲 Typora 对齐（§4.360「六」10，G7-SHELL-08 收口探针）。
 *
 * 立此探针的原因：G7-SHELL-08 原登记「尺寸/位置硬编码、不可拖拽/停靠 = D（增强）」，
 * 本轮用**一手证据**（本机 Typora 1.14.9 `base-control.css` + `index.html` +
 * `frame.js`）复核后推翻其前提 —— Typora 的浮动大纲 `#toc-dropmenu` 自己就是
 * `position:fixed` + 硬编码 `width:300px` 的下拉面板，**同样不可拖拽**；真正的
 * 缺口是三件 Mellow 没有的事：
 *   1. 几何：300px / right:4px / 高度随内容（max-height 上限）vs Mellow 240px / right:12 / 上下拉伸
 *   2. 停靠入口：`.outline-title-wrapper` 里的 `#pin-outline-btn`（hover 标题区出现，
 *      click → showSidebar("outline")）—— Mellow 完全没有
 *   3. 跳转即收起：`bindEventForOutline` 的 `.outline-item` click → `autoHideOutline()`
 *      （DEFAULT_OPTIONS 无开关 ⇒ 出厂即开不可关）—— Mellow 浮层点了不关
 *
 * 探针断言：
 *   A1/A2 几何：宽 300、右缘留 4px、高度**不为**上下拉伸钉死（max-height 语义）
 *   B1/B2/B3 pin 按钮：默认 display:none（Typora hover 才现）→ hover 标题区可见
 *          → 点击后浮层关闭、侧栏进入大纲模式且有行
 *   C1/C2 自动收起：浮层内点标题行 ⇒ 浮层消失（Typora autoHideOutline 同型）
 *   D     反向确认：侧栏（停靠形态）里点行**不**收起 —— 侧栏仍在大纲模式，
 *         与 Typora「pinned 形态不 auto-hide」一致
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/outline-float-parity-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';
import { createWorkspaceEntry } from '../shared/in-app-dialog.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1456;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const waitFor = async (fn, timeoutMs = 8000, stepMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
};

/** 种子一个带标题的文档（同 file-list-summary-verify 的写判据：连续两次读回一致再存） */
const SEED = '# First Head\n\nBody one.\n\n## Second Head\n\nBody two.\n';

async function seedDoc(page) {
  const ok = await createWorkspaceEntry(page, 'fileTree.newFile', 'float.md');
  if (!ok) throw new Error('fileTree.newFile 未弹出应用内输入框');
  await sleep(400);
  const opened = await waitFor(async () => page.evaluate(() => {
    const row = document.querySelector('button.tree-row');
    if (row === null) return false;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return true;
  }));
  if (!opened) throw new Error('tree-row 未出现（无法打开以写入正文）');
  await sleep(400);
  const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
  if (!frame) throw new Error('editor iframe 未就绪');
  const writeOnce = () => frame.evaluate((content) => {
    const view = window.editor?.dispatch ? window.editor : window.editor?.view;
    if (!view?.dispatch) return false;
    if (window.webModules.core.getEditorText() !== content) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: { anchor: content.length } });
    }
    return window.webModules.core.getEditorText() === content;
  }, SEED);
  const deadline = Date.now() + 15000;
  for (;;) {
    if (await writeOnce().catch(() => false)) {
      await sleep(300);
      if (await writeOnce().catch(() => false)) break;
    }
    if (Date.now() > deadline) throw new Error('正文写入不稳定（异步加载竞态未收敛）');
    await sleep(300);
  }
  await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
  await sleep(600);
}

const floatState = (page) => page.evaluate(() => {
  const float = document.querySelector('.outline-float');
  if (float === null) return null;
  const host = document.querySelector('.editor-container');
  const fr = float.getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  const pin = document.querySelector('.outline-float-pin');
  return {
    width: Math.round(fr.width),
    rightGap: Math.round(hr.right - fr.right),
    stretchedToBottom: Math.abs(fr.height - (hr.height - 42 - 42)) < 4,
    rows: float.querySelectorAll('.outline-row').length,
    pinDisplay: pin === null ? null : getComputedStyle(pin).display,
  };
});

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });
    await sleep(1200);
    await seedDoc(page);

    // 顶栏大纲开关（aria-label = t('sidebar.outline')）
    const openFloat = () => page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.editor-topbar-btn'))
        .find((b) => (b.getAttribute('aria-label') ?? '') === '大纲');
      if (!btn) return false;
      btn.click();
      return true;
    });

    check('C0 顶栏大纲开关存在', await openFloat() === true || (await floatState(page)) !== null);
    await waitFor(async () => (await floatState(page))?.rows === 2);
    const st = await floatState(page);
    // A. 几何（Typora `#toc-dropmenu`：width:300px; right:4px; 高度随内容 max-height 上限）
    check('A1 浮层宽 300px（Typora 一手几何）', st?.width === 300, JSON.stringify(st));
    check('A2 右缘留 4px（Typora right:4px）', st?.rightGap === 4, JSON.stringify(st));
    check('A3 高度非上下拉伸钉死（max-height 语义，随内容）', st !== null && st.stretchedToBottom === false, JSON.stringify(st));

    // B. pin 按钮（Typora：`.outline-title-wrapper .btn{display:none}` + hover 才现）
    check('B1 pin 按钮默认不可见（hover 才现，Typora 同型）', st?.pinDisplay === 'none', JSON.stringify(st?.pinDisplay));
    await page.hover('.outline-float-header');
    await sleep(150);
    const pinShown = await page.evaluate(() => {
      const pin = document.querySelector('.outline-float-pin');
      return pin === null ? null : getComputedStyle(pin).display;
    });
    // ⚠️ 判据语义实录：pin 在 `.outline-float-actions`（flex 容器）内，CSS「块级化」
    // 把声明值 inline-flex 计算成 flex ⇒ 判据 = 「非 none（可见）」，不断具体形态。
    check('B2 hover 标题区后 pin 可见', pinShown !== null && pinShown !== 'none', JSON.stringify(pinShown));
    await page.evaluate(() => document.querySelector('.outline-float-pin')?.click());
    await sleep(400);
    const afterPin = await page.evaluate(() => ({
      float: document.querySelector('.outline-float') !== null,
      sidebarLabel: document.querySelector('aside.file-tree')?.getAttribute('aria-label') ?? null,
      sidebarRows: document.querySelectorAll('.outline-list .outline-row').length,
    }));
    check('B3 点 pin ⇒ 浮层关闭、侧栏进入大纲模式且有行（Typora #pin-outline-btn → showSidebar("outline")）',
      afterPin.float === false && afterPin.sidebarRows >= 1, JSON.stringify(afterPin));

    // C. 跳转即收起（Typora autoHideOutline；浮层实例点行 ⇒ 关闭）
    await openFloat();
    await waitFor(async () => (await floatState(page))?.rows === 2);
    await page.evaluate(() => document.querySelector('.outline-float .outline-row')?.click());
    const closed = await waitFor(async () => (await floatState(page)) === null, 3000);
    check('C1 浮层内点标题行 ⇒ 立即收起（Typora autoHideOutline 同型）', closed);

    // D. 停靠形态（侧栏大纲）点行不收起
    const still = await page.evaluate(() => ({
      sidebar: document.querySelector('aside.file-tree') !== null,
      rows: document.querySelectorAll('.outline-list .outline-row').length,
    }));
    await page.evaluate(() => document.querySelector('.outline-list .outline-row')?.click());
    await sleep(400);
    const afterJump = await page.evaluate(() => ({
      rows: document.querySelectorAll('.outline-list .outline-row').length,
      float: document.querySelector('.outline-float') !== null,
    }));
    check('D 侧栏（停靠形态）点行不收起、侧栏保留（Typora pinned 不 auto-hide）',
      still.rows >= 1 && afterJump.rows >= 1 && afterJump.float === false, JSON.stringify(afterJump));
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error('❌ outline-float-parity-verify crashed:', error.message);
  process.exitCode = 1;
});
