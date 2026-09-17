/**
 * 输入型应用内对话框（G7-EDIT-10）—— 替代 `window.prompt` 的运行时验证。
 *
 * 为什么能可靠验证：`image.setAssetDir` 命令的 `enabled: always`，可在 harness 中经
 * `__MELLOW_COMMANDS__` 直接派发（不同于 file.trash 需要 filePathRef 非空）。
 * 该命令正是本轮从 `window.prompt` 迁到 `askInput` 的 9 处之一。
 *
 * 覆盖：
 *   ① 派发后出现**应用内**输入框（.confirm-modal-input），不是原生面板；
 *   ② 输入框预填当前值（initialValue 生效）；
 *   ③ 输入新值 + Enter（主按钮）→ 值真的被应用（localStorage 可观测）；
 *   ④ 取消路径（点遮罩 / Esc）→ 返回 null，**不应用**任何改动；
 *   ⑤ 全流程零原生面板调用（window.confirm / alert / prompt 均被 spy 记录）。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/in-app-input-dialog-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const port = await pickFreePort();
  const base = `http://localhost:${port}`;
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: DESKTOP_DIR, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    const deadline = Date.now() + 40000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok) { ready = true; break; }
      } catch { /* not ready */ }
      await sleep(300);
    }
    if (!ready) throw new Error('vite dev server 未就绪');

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 记录任何原生面板调用（迁移后应为零）
    await context.addInitScript(() => {
      window.__nativePanels = [];
      window.confirm = () => { window.__nativePanels.push('confirm'); return false; };
      window.alert = () => { window.__nativePanels.push('alert'); };
      window.prompt = () => { window.__nativePanels.push('prompt'); return null; };
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    await sleep(2500);

    // ⚠️ 必须 fire-and-forget：`image.setAssetDir` 的 execute 现在是 async（await askInput），
    // 而 Playwright 的 page.evaluate 会 **await 返回的 Promise** → 直接返回它会永久挂起
    // （等一个只有用户点击才会 resolve 的对话框）。故只派发、不 await 其返回值。
    const dispatch = (id) => page.evaluate((commandId) => {
      void window.__MELLOW_COMMANDS__.dispatch(commandId);
      return true;
    }, id);
    const modal = () => page.evaluate(() => {
      const m = document.querySelector('.confirm-modal');
      if (m === null) return null;
      const input = m.querySelector('.confirm-modal-input');
      return {
        title: m.querySelector('.confirm-modal-title')?.textContent ?? '',
        hasInput: input !== null,
        inputValue: input === null ? null : input.value,
        buttons: [...m.querySelectorAll('button')].map((b) => b.textContent),
      };
    });

    // ── ① 派发命令 → 应用内输入框出现 ──────────────────────────────────
    await dispatch('image.setAssetDir');
    await sleep(500);
    const opened = await modal();
    check('出现【应用内】对话框且含输入框（非原生面板）', opened !== null && opened.hasInput === true, JSON.stringify(opened));
    check('对话框标题为「图片资源目录」（prompt.assetDir 文案）', (opened?.title ?? '').length > 0, JSON.stringify(opened?.title));
    check('按钮为「确定 / 取消」', (opened?.buttons ?? []).length === 2, JSON.stringify(opened?.buttons));

    // ── ② 输入框预填当前值（initialValue）────────────────────────────
    const prefilled = opened?.inputValue ?? null;
    check('输入框预填当前 asset 目录（initialValue 生效）', prefilled !== null, JSON.stringify(prefilled));

    // ── ③ 取消路径：点遮罩 → 不应用改动 ────────────────────────────
    const beforeCancel = await page.evaluate(() => localStorage.getItem('mellow.assetDir'));
    await page.mouse.click(20, 20); // 遮罩区域
    await sleep(300);
    check('点遮罩后对话框关闭', (await modal()) === null);
    const afterCancel = await page.evaluate(() => localStorage.getItem('mellow.assetDir'));
    check('取消不应用任何改动（asset 目录未变）', afterCancel === beforeCancel, `${JSON.stringify(beforeCancel)} → ${JSON.stringify(afterCancel)}`);

    // ── ④ 确定路径：输入新值 + Enter → 值被应用 ──────────────────────
    await dispatch('image.setAssetDir');
    await sleep(400);
    const input = page.locator('.confirm-modal-input');
    await input.fill('mellow-assets');
    await input.press('Enter');
    await sleep(400);
    check('Enter（主按钮）后对话框关闭', (await modal()) === null);
    const applied = await page.evaluate(() => localStorage.getItem('mellow.assetDir'));
    check('输入的值真的被应用（localStorage 可观测）', applied === 'mellow-assets', JSON.stringify(applied));

    // ── ⑤ 全流程零原生面板 ────────────────────────────────────────
    const natives = await page.evaluate(() => window.__nativePanels);
    check('全流程未出现任何原生面板（confirm / alert / prompt）', natives.length === 0, JSON.stringify(natives));
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
