/**
 * B3-1 字体族选择链路验证（浏览器 dev 模式，Playwright Chromium）。
 * 验证点：
 *   1. 直调 webModules.config.setFontFace → .cm-content computed fontFamily 变化
 *   2. 设置面板 UI 全链路：Cmd+, → 编辑器分类 → 字体 select → localStorage 持久化 + live apply
 *   3. 重启恢复：reload 后启动路径重放 setFontFace（此前仅 live apply 无恢复的回归防线）
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

    const fontFamilyOf = () => frame.evaluate(() => {
      const el = document.querySelector('.cm-content') ?? document.querySelector('.cm-editor');
      return el ? getComputedStyle(el).fontFamily : null;
    });

    // 0. 基线（system-ui + fallbacks）
    await page.evaluate(() => localStorage.removeItem('mellow.editor.fontFamily'));
    const base = await fontFamilyOf();
    console.log(`baseline fontFamily=${base}`);

    // 1. 直调 setFontFace（WebFontFace 契约：{ fontFace: { family } }）
    await frame.evaluate(() => window.webModules.config.setFontFace({ fontFace: { family: 'PingFang SC' } }));
    await new Promise((r) => setTimeout(r, 200));
    const afterDirect = await fontFamilyOf();
    check('direct webModules.config.setFontFace applies', afterDirect.startsWith('\'PingFang SC\'') || afterDirect.startsWith('"PingFang SC"') || afterDirect.includes('PingFang SC'), `computed=${afterDirect}`);

    // 2. 设置面板 UI 全链路（Cmd+, → 编辑器 → 字体 select → PingFang SC）
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('.settings-panel', { timeout: 5000 });
    await page.click('.settings-nav-item:nth-child(2)'); // 分类顺序：general / editor / …
    // fontFamily select：含 option[value="PingFang SC"] 的 select
    const fontSelect = page.locator('.settings-content select', { has: page.locator('option[value="PingFang SC"]') });
    await fontSelect.waitFor({ state: 'visible', timeout: 5000 });
    await fontSelect.selectOption('PingFang SC');
    await new Promise((r) => setTimeout(r, 400));
    const ls = await page.evaluate(() => localStorage.getItem('mellow.editor.fontFamily'));
    const afterUi = await fontFamilyOf();
    check('settings UI select persists to localStorage', ls === 'PingFang SC', `localStorage=${ls}`);
    check('settings UI live-applies font family', afterUi.includes('PingFang SC'), `computed=${afterUi}`);

    // 3. 重启恢复（reload → 启动路径重放 setFontFace）
    await page.reload({ waitUntil: 'domcontentloaded' });
    const frame2 = await (async () => {
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
      throw new Error('editor iframe not ready after reload');
    })();
    await new Promise((r) => setTimeout(r, 600)); // 等 host.ready() 恢复链路
    const afterReload = await frame2.evaluate(() => {
      const el = document.querySelector('.cm-content') ?? document.querySelector('.cm-editor');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    check('font family survives reload (startup restore)', afterReload.includes('PingFang SC'), `computed=${afterReload}`);

    // 4. 清理：恢复 system-ui（不污染后续测试 / 其他会话）
    await page.evaluate(() => localStorage.removeItem('mellow.editor.fontFamily'));
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
