/**
 * Typora 第二个自动配对开关的运行时验证（G7-EDIT-12）。
 *
 * Typora `autoPairExtendSymbol` /「匹配 Markdown 字符」默认 false，独立于
 * `noPairingMatch` / 括号引号自动配对。它控制 Mellow `modules/input` 的两类 Markdown 辅助：
 * 选区包裹（输入 `*`）与反引号代码块快捷插入。
 *
 * 覆盖：默认关闭（设置值 false）输入 Markdown 字符不触发辅助；live 开启后选区包裹恢复；
 * 关闭后再次撤销（证明 live 值是动态读取，不是启动快照）。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const cwd = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
function check(name, ok, detail = '') { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) process.exitCode = 1; }
async function main() {
  const port = await pickFreePort(); const base = `http://localhost:${port}`;
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    const deadline = Date.now() + 40000; let ready = false;
    while (Date.now() < deadline) { try { if ((await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok) { ready = true; break; } } catch {} await sleep(300); }
    if (!ready) throw new Error('vite dev server 未就绪');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    const frame = await (async () => {
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        for (const f of page.frames()) if (f.url().includes('/editor/index.html')) {
          if (await f.evaluate(() => !!(window.webModules?.core && window.editor && window.webModules?.config?.setMarkdownSyntaxPairs)).catch(() => false)) return f;
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready（或 setMarkdownSyntaxPairs 未挂到 bridge）');
    })();
    const text = () => frame.evaluate(() => { const v = window.editor?.dispatch ? window.editor : window.editor?.view; return v.state.doc.toString(); });
    const setDoc = (value, from = 0, to = value.length) => frame.evaluate(({ value, from, to }) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!v) throw new Error('editor view unavailable');
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: from, head: to } });
    }, { value, from, to });
    const setPairs = (enabled) => frame.evaluate((value) => window.webModules.config.setMarkdownSyntaxPairs({ enabled: value }), enabled);
    const type = async (key) => { await frame.locator('.cm-content').focus(); await page.keyboard.press(key); await sleep(180); return text(); };

    await setPairs(false); await setDoc('abc', 0, 3); const off = await type('*');
    check('默认关闭：选区输入 * 不自动包裹', off !== '*abc*', JSON.stringify(off));

    await setPairs(true); await setDoc('abc', 0, 3); const on = await type('*');
    check('开启：选区输入 * 自动包裹为 *abc*', on === '*abc*', JSON.stringify(on));

    await setPairs(false); await setDoc('abc', 0, 3); const backOff = await type('*');
    check('再次关闭：自动包裹撤销（live 值动态生效）', backOff !== '*abc*', JSON.stringify(backOff));
  } finally { await browser.close(); vite.kill('SIGTERM'); }
}
main().catch((error) => { console.error(error); process.exit(1); });
