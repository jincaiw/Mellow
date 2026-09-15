/**
 * 默认代码块语言的**跨层接线**运行时验证（G7-EDIT-16）。
 *
 * ⚠️ 本脚本**有意只覆盖 bridge 接线**，不覆盖「输入反引号展开代码块」的端到端路径 ——
 * 后者在本 harness 中**无法**用合成按键走通，实测证据（2026-09-15）：
 *   · headless 下 **未被 inputHandler 拦截的默认输入不会同步到 CM6 state**
 *     （空文档打 `a` → DOM 有 `a`、`state.doc` 仍为 `''`）；
 *   · 围栏展开分支经 CM6 `snippet()` 提交，`press('`')` 与 `press('Backquote')`
 *     两种写法都不产生 state 变更（已排除按键名问题）。
 * 故围栏文本行为由**纯函数单测**锁定
 * （`packages/editor-core/CoreEditor/test/codeBlockFence.test.ts`，6 例），
 * 跨层接线由本脚本 + `verify-settings-contract.mjs` ⑬ 节静态契约共同锁定。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/default-code-lang-verify.mjs
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
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
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

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    const frame = await (async () => {
      const limit = Date.now() + 20000;
      while (Date.now() < limit) {
        for (const candidate of page.frames()) {
          if (candidate.url().includes('/editor/index.html')) {
            const isReady = await candidate.evaluate(() => !!(window.webModules?.core && window.editor && window.webModules?.config?.setDefaultCodeLang)).catch(() => false);
            if (isReady) return candidate;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready（或 setDefaultCodeLang 未挂到 bridge）');
    })();

    const readConfig = () => frame.evaluate(() => window.config?.defaultCodeLang);
    const setCodeLang = (lang) => frame.evaluate((value) => window.webModules.config.setDefaultCodeLang({ lang: value }), lang);

    // 默认值必须是空串（Typora `defaultCodeLang` 默认空串 = 不自动添加语言）
    check('初始 config.defaultCodeLang 为空串（不自动添加语言）', (await readConfig()) === '', JSON.stringify(await readConfig()));

    await setCodeLang('js');
    await sleep(150);
    check('bridge 下发 js：engine config 已更新', (await readConfig()) === 'js', JSON.stringify(await readConfig()));

    await setCodeLang('python');
    await sleep(150);
    check('bridge 再下发 python：live 生效（非启动快照）', (await readConfig()) === 'python', JSON.stringify(await readConfig()));

    await setCodeLang('');
    await sleep(150);
    check('bridge 下发空串：回落不添加语言', (await readConfig()) === '', JSON.stringify(await readConfig()));
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
