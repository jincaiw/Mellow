/**
 * B1-1 字体缩放链路验证（浏览器 dev 模式，Playwright Chromium）。
 * 验证点：
 *   1. iframe 数量与 webModules 归属（排除「桥失效」探测误差）
 *   2. webModules.config.setFontSize 直调 → computed fontSize 变化
 *   3. 快捷键 ⇧⌘= / ⇧⌘- / ⇧⌘0 全链路：keydown → 命令 → localStorage → computed fontSize
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1423;
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // 等编辑器 iframe 就绪（webModules.core + window.editor 均可用）
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
      throw new Error('editor iframe not ready');
    })();

    // 1. 父窗口视角的 iframe 探测（复现此前「桥失效」探测口径）
    const probe = await page.evaluate(() => {
      const frames = [...document.querySelectorAll('iframe')];
      return frames.map((f) => {
        let hasWebModules = false, hasConfig = false, err = '';
        try {
          const w = f.contentWindow;
          hasWebModules = !!w?.webModules;
          hasConfig = !!w?.webModules?.config;
        } catch (e) { err = String(e); }
        return { src: f.getAttribute('src'), title: f.title, hasWebModules, hasConfig, err };
      });
    });
    console.log('iframe probe:', JSON.stringify(probe));
    check('editor iframe exposes webModules.config', probe.some((p) => p.hasConfig));

    const fontSizeOf = () => frame.evaluate(() => {
      const el = document.querySelector('.cm-content') ?? document.querySelector('.cm-editor');
      return el ? getComputedStyle(el).fontSize : null;
    });
    const lineBoxOf = () => frame.evaluate(() => {
      const line = document.querySelector('.cm-line');
      return line ? Math.round(line.getBoundingClientRect().height) : null;
    });

    const base = await fontSizeOf();
    const baseBox = await lineBoxOf();
    console.log(`baseline fontSize=${base} lineBox=${baseBox}px`);

    // 2. 直调 setFontSize(26)
    await frame.evaluate(() => window.webModules.config.setFontSize({ fontSize: 26 }));
    await new Promise((r) => setTimeout(r, 200));
    const after26 = await fontSizeOf();
    const box26 = await lineBoxOf();
    check('direct webModules.config.setFontSize(26) applies', after26 === '26px', `computed=${after26} lineBox=${box26}px`);

    // 3. 快捷键全链路（localStorage 默认 17 → 18 → 17 → 重置 17）
    // 同时断言文档文本不被插入字面字符（WKWebView ⇧⌘= 明文插入回归防线）
    const textBefore = await frame.evaluate(() => window.webModules.core.getEditorText());
    await page.keyboard.press('Meta+Shift+=');
    await new Promise((r) => setTimeout(r, 400));
    const ls1 = await page.evaluate(() => localStorage.getItem('mellow.editor.fontSize'));
    const afterKey = await fontSizeOf();
    const textAfterIn = await frame.evaluate(() => window.webModules.core.getEditorText());
    check('shortcut ⇧⌘= bumps fontSize to 18', ls1 === '18' && afterKey === '18px', `localStorage=${ls1} computed=${afterKey}`);
    check('shortcut ⇧⌘= does not insert literal char', textAfterIn === textBefore, `text=${JSON.stringify(textAfterIn.slice(0, 40))}`);

    await page.keyboard.press('Meta+Shift+-');
    await new Promise((r) => setTimeout(r, 400));
    const ls2 = await page.evaluate(() => localStorage.getItem('mellow.editor.fontSize'));
    const afterKey2 = await fontSizeOf();
    const textAfterOut = await frame.evaluate(() => window.webModules.core.getEditorText());
    check('shortcut ⇧⌘- decreases fontSize to 17', ls2 === '17' && afterKey2 === '17px', `localStorage=${ls2} computed=${afterKey2}`);
    check('shortcut ⇧⌘- does not insert literal char', textAfterOut === textBefore, `text=${JSON.stringify(textAfterOut.slice(0, 40))}`);

    await page.keyboard.press('Meta+Shift+0');
    await new Promise((r) => setTimeout(r, 400));
    const afterReset = await fontSizeOf();
    const textAfterReset = await frame.evaluate(() => window.webModules.core.getEditorText());
    check('shortcut ⇧⌘0 resets fontSize', afterReset === '17px', `computed=${afterReset}`);
    check('shortcut ⇧⌘0 does not insert literal char', textAfterReset === textBefore, `text=${JSON.stringify(textAfterReset.slice(0, 40))}`);
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
