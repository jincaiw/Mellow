/**
 * B5 图片上传服务 E2E 验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 验证点（前端装配链路：设置 → localStorage → 命令 → runBatch → 状态文案）：
 *   1. image.uploadAll 命令已注册（__MELLOW_COMMANDS__）
 *   2. 设置面板：图片分类含上传服务 select（4 通道）/ 地址 / 自定义命令输入框（默认值）
 *   3. 修改 select → 持久化 localStorage('mellow.image.uploadService')
 *   4. 空文档（无本地图片）→ 「没有可上传的本地图片」（任意通道，uploadAll 空集早退）
 *   5. 含本地图片引用（文件不存在，exists=false）→ 同分支且文档零改动（安全保证）
 *
 * 覆盖范围说明：浏览器 dev 模式下 mock fs state 私有，无法构造 exists=true 的
 * 本地图片，故「未配置图片上传服务」「上传失败逐项报告」两分支不在 E2E 验证
 * （由 app-core/test/imageFileOps.test.ts 单测覆盖）。
 *
 * 运行：node tests/e2e/image-upload-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1426;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;

const MSG_NONE_LOCAL = '没有可上传的本地图片';

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

/** 等待状态栏文案达到期望值（runBatch 异步完成） */
async function waitForStatus(page, expected, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.locator('footer.statusbar span.status').textContent().catch(() => null);
    if (last === expected) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 预置：状态栏可见（默认隐藏）+ 上传通道 none
    await context.addInitScript(() => {
      localStorage.setItem('mellow.statusbar.visible', '1');
      localStorage.setItem('mellow.image.uploadService', 'none');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    // 编辑器 iframe 就绪（webModules.core 可用）
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
    check('editor iframe ready', frame !== null);

    // __MELLOW_COMMANDS__ 就绪
    const commandsReady = await (async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const ok = await page.evaluate(() => !!window.__MELLOW_COMMANDS__).catch(() => false);
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    })();
    check('__MELLOW_COMMANDS__ ready', commandsReady);

    // 1. 命令注册
    const registered = await page.evaluate(() => window.__MELLOW_COMMANDS__.all().some((c) => c.id === 'image.uploadAll'));
    check('command image.uploadAll registered', registered);

    // 编辑器内部状态稳定（初始异步配置期间 getEditorState/getEditorText 可能抛错）
    const editorStable = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const ok = await frame.evaluate(() => {
          try {
            window.webModules.core.getEditorState();
            window.webModules.core.getEditorText();
            return true;
          } catch {
            return false;
          }
        }).catch(() => false);
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 300));
      }
      return false;
    })();
    check('editor state stable (getEditorState/getEditorText)', editorStable);

    // 2. 通道 none + 空文档 → 「没有可上传的本地图片」（uploadAll 空集早退在通道校验之前）
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('image.uploadAll'));
    check('none channel + empty doc → none-local message', await waitForStatus(page, MSG_NONE_LOCAL),
      await page.locator('footer.statusbar span.status').textContent().catch(() => null) ?? '');

    // 3. 设置面板：图片分类上传配置
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('settings.open'));
    await page.waitForSelector('.settings-panel', { timeout: 5000 });
    await page.locator('.settings-nav-item', { hasText: '图片' }).first().click();
    await page.waitForSelector('.settings-row', { timeout: 5000 });

    const serviceRow = page.locator('.settings-row', { hasText: '图片上传服务' }).first();
    check('settings: upload service select row', await serviceRow.count() > 0);
    const select = serviceRow.locator('select');
    const optionValues = await select.locator('option').evaluateAll((opts) => opts.map((o) => o.value));
    check('settings: select has 4 channels (none/picgo-http/picgo-cli/custom-command)',
      JSON.stringify(optionValues) === JSON.stringify(['none', 'picgo-http', 'picgo-cli', 'custom-command']),
      JSON.stringify(optionValues));
    check('settings: default channel none', (await select.inputValue()) === 'none');

    const urlRow = page.locator('.settings-row', { hasText: '上传服务地址' }).first();
    const urlInput = urlRow.locator('input[type=text]');
    check('settings: http url default', (await urlInput.inputValue()) === 'http://127.0.0.1:36677/upload');

    const cmdRow = page.locator('.settings-row', { hasText: '自定义上传命令' }).first();
    check('settings: custom command input present', (await cmdRow.locator('input[type=text]').count()) > 0);

    // 4. 修改 select → localStorage 持久化
    await select.selectOption('picgo-http');
    const persisted = await page.evaluate(() => localStorage.getItem('mellow.image.uploadService'));
    check('settings: select persists to localStorage', persisted === 'picgo-http', String(persisted));
    await page.locator('.settings-close').click();
    await page.waitForSelector('.settings-panel', { state: 'detached', timeout: 5000 });

    // 5. 通道已配置 + 空文档 → 没有可上传的本地图片
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('image.uploadAll'));
    check('configured channel + empty doc → none-local message', await waitForStatus(page, MSG_NONE_LOCAL));

    // 6. 本地图片引用（文件不存在）→ 同分支 + 文档零改动
    const docWithImage = '# B5\n\n![alt](assets/foo.png)\n';
    await frame.evaluate((text) => window.webModules.core.resetEditor({ text, documentChanged: true }), docWithImage);
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('image.uploadAll'));
    check('missing local image → none-local message (exists=false)', await waitForStatus(page, MSG_NONE_LOCAL));
    const afterText = await frame.evaluate(() => window.webModules.core.getEditorText());
    check('document unchanged after no-op upload', afterText === docWithImage,
      JSON.stringify(afterText));

    // 汇总
    const failures = process.exitCode ? '（存在失败项）' : '';
    console.log(`\nB5 图片上传 E2E 验证完成${failures}`);
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error('❌ E2E 运行异常:', e.message);
  process.exitCode = 1;
});
