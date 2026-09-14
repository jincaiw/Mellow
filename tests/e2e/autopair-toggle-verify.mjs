/**
 * 自动配对开关的**运行时验证**（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因（V7-W6，G7-EDIT-12）：Typora 有「匹配括号和引号」开关（配置键
 * `noPairingMatch`，默认 false 即默认开启），而 Mellow 把 `autoCharacterPairs` 写死为
 * `true` 且无 UI —— 用户无法关闭自动配对。该开关横跨四层（设置 → App → editor-core
 * wrapper → vendored CoreEditor 的 compartment），护栏只能证明「代码里存在这些调用」，
 * 证明不了「关掉之后真的不再补全」。故补运行时实证：
 *
 *   1. 默认（开关开）输入 `(` → 文档为 `()`（补全生效）
 *   2. 下发 setAutoPair({enabled:false}) 后再输入 `(` → 文档为 `(`（补全已撤销）
 *   3. 再下发 setAutoPair({enabled:true}) → 恢复补全（证明 compartment **双向**可重配，
 *      不是单向失效）
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/autopair-toggle-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 动态选空闲端口（固定端口 + --strictPort 时残留 vite 会让新实例静默启动失败）。 */
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
  const PORT = await pickFreePort();
  const BASE = `http://localhost:${PORT}`;
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    const deadline = Date.now() + 40000;
    let up = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
        if (res.ok) { up = true; break; }
      } catch { /* not ready */ }
      await sleep(300);
    }
    if (!up) throw new Error('vite dev server 未就绪');

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const frame = await (async () => {
      const limit = Date.now() + 20000;
      while (Date.now() < limit) {
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor && window.webModules?.config?.setAutoPair)).catch(() => false);
            if (ready) return f;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready（或 setAutoPair 未挂到 webModules.config）');
    })();

    const docText = () => frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      return v.state.doc.toString();
    });
    /** 重置文档并把光标放到末尾（按键类探针必须显式设置 selection，否则光标停在 0）。 */
    const resetDoc = (text) => frame.evaluate((t) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: t.length } });
    }, text);
    const setAutoPair = (enabled) => frame.evaluate((on) => {
      window.webModules.config.setAutoPair({ enabled: on });
    }, enabled);
    /** 真实键盘输入一个 `(`（走编辑器完整输入管线）。 */
    const typeOpenParen = async () => {
      await frame.click('.cm-content');
      await resetDoc('');
      await page.keyboard.type('(');
      await sleep(200);
      return docText();
    };

    // ── 1：默认开启 ────────────────────────────────────────────────────────
    check(
      'setAutoPair 已挂到 webModules.config（跨层消息可达）',
      true,
    );
    const withPair = await typeOpenParen();
    check('默认（开关开）：输入 `(` → 自动补全为 `()`', withPair === '()', JSON.stringify(withPair));

    // ── 2：关闭后不再补全 ─────────────────────────────────────────────────
    await setAutoPair(false);
    await sleep(200);
    const withoutPair = await typeOpenParen();
    check('关闭后：输入 `(` → 只有 `(`（补全已撤销）', withoutPair === '(', JSON.stringify(withoutPair));

    // ── 3：重新开启 → 恢复（证明 compartment 双向可重配）──────────────────
    await setAutoPair(true);
    await sleep(200);
    const restored = await typeOpenParen();
    check('重新开启后：恢复为 `()`（compartment 双向可重配）', restored === '()', JSON.stringify(restored));
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
