/**
 * B3-2 主题细节链路验证（浏览器 dev 模式，Playwright Chromium）。
 * 验证点：
 *   1. Newsprint 主题：data-theme + --mellow-content-font（Reader 衬线）+ themeCss 注入（报纸标题规则）
 *   2. 主题级编辑器字体：用户未设置 fontFamily → Georgia；切回 Mellow Light → 还原 ui-monospace
 *   3. 用户优先级：显式 fontFamily 设置覆盖主题字体
 *   4. 视觉对照截图（mellow-light / paper / newsprint）
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

    const applyTheme = async (themeId) => {
      await page.evaluate((id) => {
        localStorage.setItem('mellow.theme.settings', JSON.stringify({ mode: 'light', lightThemeId: id, darkThemeId: 'mellow-dark' }));
      }, themeId);
      await page.reload({ waitUntil: 'domcontentloaded' });
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
    };

    const editorFontFamily = (frame) => frame.evaluate(() => {
      const el = document.querySelector('.cm-content') ?? document.querySelector('.cm-editor');
      return el ? getComputedStyle(el).fontFamily : null;
    });

    // 1. Newsprint 主题
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mellow.editor.fontFamily'));
    let frame = await applyTheme('newsprint');
    await new Promise((r) => setTimeout(r, 600)); // 等主题 useEffect + host ready 恢复
    const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    check('data-theme=newsprint applied', dataTheme === 'newsprint', `dataTheme=${dataTheme}`);

    const contentFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mellow-content-font'));
    check('newsprint --mellow-content-font (serif stack)', contentFont.includes('Georgia') && contentFont.includes('serif'), `value=${contentFont.trim()}`);

    const themeCss = await page.evaluate(() => document.getElementById('mellow-theme-css')?.textContent ?? '');
    check('newsprint themeCss injected (h1/h2 rules)', themeCss.includes("[data-theme='newsprint'] .mellow-reader h1"), `len=${themeCss.length}`);

    let ef = await editorFontFamily(frame);
    check('theme-level editor font (Georgia) applied', ef.startsWith('Georgia') || ef.includes('Georgia'), `computed=${ef}`);

    await page.screenshot({ path: 'tests/benchmark/screenshots/b3-2-newsprint.png' });

    // 2. Paper 主题（Pixyll 衬线方向）
    frame = await applyTheme('paper');
    await new Promise((r) => setTimeout(r, 600));
    const paperFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mellow-content-font'));
    check('paper --mellow-content-font (serif stack)', paperFont.includes('Georgia'), `value=${paperFont.trim()}`);
    ef = await editorFontFamily(frame);
    check('paper theme-level editor font (Georgia)', ef.includes('Georgia'), `computed=${ef}`);

    await page.screenshot({ path: 'tests/benchmark/screenshots/b3-2-paper.png' });

    // 3. 切回 Mellow Light：编辑器字体还原 CoreEditor 默认（ui-monospace）
    frame = await applyTheme('mellow-light');
    await new Promise((r) => setTimeout(r, 600));
    ef = await editorFontFamily(frame);
    check('mellow-light restores default editor font (ui-monospace)', ef.startsWith('ui-monospace'), `computed=${ef}`);

    // 4. 用户显式 fontFamily 优先于主题字体
    await page.evaluate(() => localStorage.setItem('mellow.editor.fontFamily', 'PingFang SC'));
    frame = await applyTheme('newsprint');
    await new Promise((r) => setTimeout(r, 600));
    ef = await editorFontFamily(frame);
    check('user fontFamily overrides theme font', ef.includes('PingFang SC'), `computed=${ef}`);

    await page.screenshot({ path: 'tests/benchmark/screenshots/b3-2-newsprint-user-font.png' });

    // 清理
    await page.evaluate(() => {
      localStorage.removeItem('mellow.editor.fontFamily');
      localStorage.setItem('mellow.theme.settings', JSON.stringify({ mode: 'system', lightThemeId: 'mellow-light', darkThemeId: 'mellow-dark' }));
    });
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
