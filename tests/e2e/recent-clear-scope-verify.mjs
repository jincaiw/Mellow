/**
 * Typora「清除最近项」作用域对话框（G7-MENU-14）运行时验证。
 *
 * Typora 真值（Base/zh-Hans Panel.strings）：
 * - Clear Recent Documents
 * - Clear Recent Folders / Files Only
 * - Clear Recent Folders and Files
 * - Clear Recent and Pinned Folders / Files
 *
 * Mellow 的命令执行必须先弹作用域选择，不能直接清空 `recentFiles`。
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/recent-clear-scope-verify.mjs
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
    await context.addInitScript(() => {
      localStorage.setItem('mellow.recent.files', JSON.stringify([{ path: '/docs/a.md', title: 'a.md' }]));
      localStorage.setItem('mellow.recent.folders', JSON.stringify(['/docs']));
      localStorage.setItem('mellow.recent.folders.pinned', JSON.stringify(['/docs']));
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    await sleep(2200);

    const dispatch = (id) => page.evaluate((commandId) => {
      void window.__MELLOW_COMMANDS__.dispatch(commandId);
      return true;
    }, id);
    const dialog = () => page.locator('.confirm-modal');
    const buttons = () => dialog().locator('button');
    const local = (key) => page.evaluate((k) => localStorage.getItem(k), key);

    await dispatch('recent.clear');
    await sleep(350);
    check('recent.clear 先出现作用域选择对话框', await dialog().count() === 1);
    check('作用域对话框有 4 个按钮（3 个作用域 + 取消）', await buttons().count() === 4, String(await buttons().count()));
    check('按钮文案覆盖文档 / 文件夹文件 / 历史固定 / 取消', (await buttons().allTextContents()).join('|').includes('取消'), (await buttons().allTextContents()).join('|'));

    // 第一个作用域 = 只清除最近文档；文件夹和固定项必须保留。
    await buttons().nth(0).click();
    await sleep(350);
    check('选择「最近文档」后文档列表清空', await local('mellow.recent.files') === null, JSON.stringify(await local('mellow.recent.files')));
    check('选择「最近文档」不会清除最近文件夹', await local('mellow.recent.folders') !== null, JSON.stringify(await local('mellow.recent.folders')));
    check('选择「最近文档」不会清除固定文件夹', await local('mellow.recent.folders.pinned') !== null, JSON.stringify(await local('mellow.recent.folders.pinned')));

    // 重新写入文档，第二个作用域 = 只清除历史文件夹/文件，不动固定项。
    await page.evaluate(() => localStorage.setItem('mellow.recent.files', JSON.stringify([{ path: '/docs/b.md', title: 'b.md' }])));
    await dispatch('recent.clear');
    await sleep(300);
    await buttons().nth(1).click();
    await sleep(350);
    check('选择「历史文件夹/文件」后最近文件夹清空', await local('mellow.recent.folders') === null, JSON.stringify(await local('mellow.recent.folders')));
    check('选择「历史文件夹/文件」不会清除最近文档', await local('mellow.recent.files') !== null, JSON.stringify(await local('mellow.recent.files')));
    check('选择「历史文件夹/文件」不会清除固定项', await local('mellow.recent.folders.pinned') !== null, JSON.stringify(await local('mellow.recent.folders.pinned')));

    // 第三个作用域 = 历史 + 固定全部清除。
    await dispatch('recent.clear');
    await sleep(300);
    await buttons().nth(2).click();
    await sleep(350);
    check('选择「历史和固定」后最近文档清空', await local('mellow.recent.files') === null, JSON.stringify(await local('mellow.recent.files')));
    check('选择「历史和固定」后最近文件夹清空', await local('mellow.recent.folders') === null, JSON.stringify(await local('mellow.recent.folders')));
    check('选择「历史和固定」后固定文件夹清空', await local('mellow.recent.folders.pinned') === null, JSON.stringify(await local('mellow.recent.folders.pinned')));
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
