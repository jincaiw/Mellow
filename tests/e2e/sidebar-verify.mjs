/**
 * B1-2 侧边栏模式快捷键验证（浏览器 dev 模式，Playwright Chromium）。
 * 验证点（Typora 对齐：⌃⌘1 大纲 / ⌃⌘2 文件列表 / ⌃⌘3 文件树）：
 *   1. 侧栏关闭时 ⌃⌘1 → 打开侧栏并切到大纲（aria-label + localStorage）
 *   2. ⌃⌘2 → files + list（文件列表）
 *   3. ⌃⌘3 → files + tree（文件树）
 *   4. 三键不向文档插入字面字符（回归防线）
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1424;
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 预置：侧栏关闭（验证「未开则打开」分支）
    await context.addInitScript(() => localStorage.setItem('mellow.sidebar.visible', '0'));
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const sidebarState = () => page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      return {
        visible: !!aside,
        label: aside?.getAttribute('aria-label') ?? null,
        mode: localStorage.getItem('mellow.sidebar.mode'),
        fileMode: localStorage.getItem('mellow.fileSidebar.mode'),
        sidebarFlag: localStorage.getItem('mellow.sidebar.visible'),
      };
    });

    check('initial: sidebar closed', (await sidebarState()).visible === false);

    // 编辑器 iframe 文本基准（字符插入回归防线）
    const frame = await (async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
            if (ready) return f;
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    })();
    const textBefore = frame ? await (async () => {
      // 编辑器语言状态异步初始化（lineBreak 未就绪会抛错）——重试至稳定
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        try {
          return await frame.evaluate(() => window.webModules.core.getEditorText());
        } catch { await new Promise((r) => setTimeout(r, 300)); }
      }
      return null;
    })() : '';

    // 1. ⌃⌘1 → 大纲（侧栏未开则打开）
    await page.keyboard.press('Control+Meta+1');
    await new Promise((r) => setTimeout(r, 300));
    let s = await sidebarState();
    check('⌃⌘1 opens sidebar in outline mode', s.visible && s.label === '大纲' && s.mode === 'outline', JSON.stringify(s));

    // 2. ⌃⌘2 → 文件列表
    await page.keyboard.press('Control+Meta+2');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘2 switches to file list', s.visible && s.label === '文件列表' && s.mode === 'files' && s.fileMode === 'list', JSON.stringify(s));

    // 3. ⌃⌘3 → 文件树
    await page.keyboard.press('Control+Meta+3');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘3 switches to file tree', s.visible && s.label === '文件树' && s.mode === 'files' && s.fileMode === 'tree', JSON.stringify(s));

    // 4. 文档文本不被插入字面字符
    if (frame && typeof textBefore === 'string') {
      const textAfter = await frame.evaluate(() => window.webModules.core.getEditorText());
      check('sidebar shortcuts do not insert literal chars', textAfter === textBefore, `text=${JSON.stringify(textAfter.slice(0, 40))}`);
    } else {
      check('editor iframe ready for text check', false);
    }

    // 5. 侧栏开时 ⌃⌘1 仅切模式（仍可见）
    await page.keyboard.press('Control+Meta+1');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘1 with sidebar open switches mode only', s.visible && s.label === '大纲', JSON.stringify(s));
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
