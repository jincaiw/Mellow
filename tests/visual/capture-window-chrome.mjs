/**
 * P2-2.8 三平台 window chrome 截图归档。
 *
 * 本机（当前平台）以 dev 浏览器模式归档 shell window chrome（titlebar / palette /
 * 留白），非当前平台标记 PENDING_REAL_MACHINE（Windows 走 D5 self-hosted runner 真机）。
 * manifest（tests/benchmark/screenshots/window-chrome-manifest.json）记录归档状态，
 * 供人工评审（验收：三平台 window chrome 一致性评审）。
 *
 * 运行：node tests/visual/capture-window-chrome.mjs
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
const SCREENSHOTS_DIR = new URL('../benchmark/screenshots/', import.meta.url).pathname;
const MANIFEST = resolve(SCREENSHOTS_DIR, 'window-chrome-manifest.json');

const isMac = process.platform === 'darwin';
const PLATFORMS = [
  { id: 'macos', file: 'p2-8-window-chrome-macos.png', label: 'macOS', realMachine: isMac },
  { id: 'windows', file: 'p2-8-window-chrome-windows.png', label: 'Windows', realMachine: process.platform === 'win32' },
  { id: 'linux', file: 'p2-8-window-chrome-linux.png', label: 'Linux', realMachine: process.platform === 'linux' },
];

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

async function main() {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { captures: [] };
  const captures = Array.isArray(manifest.captures) ? manifest.captures : [];

  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  const captured = [];
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    // B1（SDI）：单文档窗口采样（无 Tabbar）。等编辑器 iframe（webModules.core）
    // 就绪后即截图 —— 不再新建 tab（浏览器回落 file.new = 替换当前文档，无 UI 增量）。
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const ready = await page.evaluate(() => {
        for (const f of window.frames) { try { return !!(f.webModules?.core && f.editor); } catch { /* cross-frame */ } }
        return false;
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    await page.waitForTimeout(600);

    const platformClass = await page.evaluate(() => document.querySelector('.shell')?.className ?? '');
    const titlebarPaddingLeft = await page.evaluate(() => {
      const el = document.querySelector('.titlebar');
      return el === null ? null : getComputedStyle(el).paddingLeft;
    });

    for (const platform of PLATFORMS) {
      const target = resolve(SCREENSHOTS_DIR, platform.file);
      if (platform.realMachine) {
        await page.screenshot({ path: target, fullPage: false });
        captured.push({
          id: platform.id,
          label: platform.label,
          file: `tests/benchmark/screenshots/${platform.file}`,
          status: 'CAPTURED',
          mode: 'dev-browser（shell.titlebar 模拟 window chrome；原生 traffic lights 归真机评审）',
          viewport: '1440x900',
          platformMacClass: platformClass.includes('platform-mac'),
          titlebarPaddingLeft,
          capturedAt: new Date().toISOString(),
        });
        console.log(`📸 ${platform.label} → ${platform.file}`);
      } else {
        const previous = captures.find((c) => c.id === platform.id);
        captured.push({
          id: platform.id,
          label: platform.label,
          file: `tests/benchmark/screenshots/${platform.file}`,
          status: 'PENDING_REAL_MACHINE',
          note: 'dev 浏览器无法代表原生 window chrome；按 D5 由对应平台真机/runner 归档',
          capturedAt: previous?.capturedAt ?? null,
        });
        console.log(`⏳ ${platform.label} 待真机归档（D5）`);
      }
    }
    await context.close();
  } finally {
    await browser.close();
    vite.kill();
  }

  writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), captures: captured }, null, 2)}\n`);
  console.log(`manifest → tests/benchmark/screenshots/window-chrome-manifest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
