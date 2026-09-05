/**
 * P3.8 Sidebar resize / 记忆 / 窄化 / 200% Zoom E2E 验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 验证点（功能在 D-J / §7.7 已实现，本任务补齐自动化验证；200% Zoom 口径 = R2-4：
 * editor fontSize 17px = 100% → 34px = 200%，与 tests/visual/visual-golden.mjs 对齐）：
 *   1. resize 拖拽：mouse 拖 .sidebar-resizer → aside 宽度跟随（clamp 200–480）
 *   2. clamp 边界：超界拖拽收在 200 / 480
 *   3. 记忆：拖拽后 reload 宽度保持；预置越界值（999）→ 初始化 clamp 到 480
 *   4. 窄化：<900px 临时收起且不覆盖显示偏好，恢复 ≥900px 后还原（§7.7）
 *   5. 200% Zoom：sidebar 可见时 quickbar 无横向溢出（200% Zoom 不截断关键控件）、
 *      resizer 可交互、resize 拖拽照常工作
 *
 * 运行：node tests/e2e/sidebar-resize-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1430;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;

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

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');

    /** 采样 aside 宽度与 resizer 几何 */
    const sample = (page) => page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      const resizer = document.querySelector('.sidebar-resizer');
      const box = (el) => {
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const quickbar = document.querySelector('.file-quickbar');
      return {
        asideW: aside === null ? null : aside.getBoundingClientRect().width,
        asideVisible: aside !== null,
        resizer: box(resizer),
        quickbarOverflow: quickbar === null ? null : quickbar.scrollWidth - quickbar.clientWidth,
      };
    });

    /** 拖动 resizer 到目标 x（clientX 即侧栏宽度，workspace-shell 贴视口左缘）。
     * 页面内合成 mouse 事件驱动（与 drag-drop-verify.mjs 同模式）：mousedown 派发到
     * resizer 元素触发 React 委托的 handleSidebarDragStart，mousemove/mouseup 派发到
     * window 驱动其注册的原生 listener。CDP 真实输入（page.mouse）在 mouse.down 后
     * 事件整体丢失（window 级 listener 均收不到），不用于本文件的拖拽断言。 */
    const dragResizer = async (page, targetX) => {
      await page.evaluate((tx) => {
        const resizer = document.querySelector('.sidebar-resizer');
        if (resizer === null) throw new Error('resizer 不可见');
        const rect = resizer.getBoundingClientRect();
        const y = rect.y + rect.height / 2;
        const startX = rect.x + rect.width / 2;
        const fire = (type, x, target) => {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        };
        fire('mousedown', startX, resizer);
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          fire('mousemove', Math.round(startX + ((tx - startX) * i) / steps), window);
        }
        fire('mousemove', tx, window);
        fire('mouseup', tx, window);
      }, targetX);
      // React setState 异步 flush（合成事件后立即读 DOM 不可靠）
      await new Promise((r) => setTimeout(r, 120));
    };

    const near = (actual, expected, tol = 2) => actual !== null && Math.abs(actual - expected) <= tol;

    // ── 1–2. resize 拖拽 + clamp 边界 ──────────────────────────────────────
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem('mellow.sidebar.visible', '1');
        localStorage.setItem('mellow.sidebar.mode', 'files');
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });

      let s = await sample(page);
      check('initial sidebar width 260 (default)', near(s.asideW, 260), JSON.stringify({ asideW: s.asideW }));

      await dragResizer(page, 380);
      s = await sample(page);
      check('drag resizer to 380 follows pointer', near(s.asideW, 380), JSON.stringify({ asideW: s.asideW }));

      await dragResizer(page, 60);
      s = await sample(page);
      check('drag below 200 clamps to 200', near(s.asideW, 200), JSON.stringify({ asideW: s.asideW }));

      await dragResizer(page, 900);
      s = await sample(page);
      check('drag above 480 clamps to 480', near(s.asideW, 480), JSON.stringify({ asideW: s.asideW }));

      // ── 3a. 记忆：拖拽结果持久化，reload 保持 ─────────────────────────────
      await dragResizer(page, 360);
      s = await sample(page);
      const persisted = await page.evaluate(() => localStorage.getItem('mellow.sidebar.width'));
      check('width persisted to localStorage on drag', near(s.asideW, 360) && persisted === '360', JSON.stringify({ asideW: s.asideW, persisted }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });
      s = await sample(page);
      check('width restored after reload', near(s.asideW, 360), JSON.stringify({ asideW: s.asideW }));
      await context.close();
    }

    // ── 3b. 记忆：越界存储值视为损坏存档，初始化回退默认 260 ───────────────
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem('mellow.sidebar.visible', '1');
        localStorage.setItem('mellow.sidebar.mode', 'files');
        localStorage.setItem('mellow.sidebar.width', '999');
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });
      const s = await sample(page);
      check('out-of-range saved width falls back to default 260 on init', near(s.asideW, 260), JSON.stringify({ asideW: s.asideW }));
      await context.close();
    }

    // ── 4. 窄化：<900px 临时收起（不覆盖偏好），恢复后还原 ─────────────────
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem('mellow.sidebar.visible', '1');
        localStorage.setItem('mellow.sidebar.mode', 'outline');
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });

      await page.setViewportSize({ width: 800, height: 700 });
      await new Promise((r) => setTimeout(r, 250));
      const narrow = await page.evaluate(() => ({
        asideVisible: document.querySelector('aside.file-tree') !== null,
        pref: localStorage.getItem('mellow.sidebar.visible'),
      }));
      check('narrow window (<900px) temporarily hides sidebar without clearing preference', !narrow.asideVisible && narrow.pref === '1', JSON.stringify(narrow));

      await page.setViewportSize({ width: 1280, height: 900 });
      await new Promise((r) => setTimeout(r, 250));
      const restored = await page.evaluate(() => document.querySelector('aside.file-tree') !== null);
      check('sidebar restores after window returns to ≥900px', restored);
      await context.close();
    }

    // ── 5. 200% Zoom（editor fontSize 34px = 200%）：侧栏关键控件不截断 ────
    {
      const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await context.addInitScript(() => {
        localStorage.setItem('mellow.sidebar.visible', '1');
        localStorage.setItem('mellow.sidebar.mode', 'files');
        localStorage.setItem('mellow.editor.fontSize', '34');
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });
      await new Promise((r) => setTimeout(r, 400));

      let s = await sample(page);
      check('200% zoom: sidebar visible with resizer', s.asideVisible && s.resizer !== null && s.resizer.w > 0, JSON.stringify({ asideW: s.asideW, resizer: s.resizer }));

      // zoom 下 resize 拖拽照常工作
      await dragResizer(page, 420);
      s = await sample(page);
      check('200% zoom: resize drag still works', near(s.asideW, 420), JSON.stringify({ asideW: s.asideW }));

      // V6-P2 2.1：quickbar 常驻条退役；⌘F 临时过滤框在 200% zoom 下可唤出且无横向截断
      await page.evaluate(() => { document.querySelector('aside.file-tree')?.focus(); });
      await page.keyboard.press('ControlOrMeta+f');
      await new Promise((r) => setTimeout(r, 250));
      const controls = await page.evaluate(() => {
        const input = document.querySelector('.file-filter-input');
        const quickbar = document.querySelector('.file-quickbar');
        if (input === null || quickbar === null) return { input: false, overflow: null };
        const r = input.getBoundingClientRect();
        return { input: r.width > 0 && r.height > 0, overflow: quickbar.scrollWidth - quickbar.clientWidth };
      });
      check('200% zoom: ⌘F transient filter visible without horizontal overflow', controls.input && controls.overflow !== null && controls.overflow <= 1, JSON.stringify(controls));
      await context.close();
    }
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
