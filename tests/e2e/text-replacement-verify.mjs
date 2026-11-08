/**
 * G7-MENU-05：文本替换 —— 宿主词典 → App 注入 → iframe 引擎 → 文档的运行时闭环。
 *
 * 一手真值（Typora 1.14.9 `handleUserReplacement`，审计 §4.360「六」16）：
 * phrase 打完后**再键入一个字符**才触发替换，触发字符保留；词典来自 macOS 系统
 * 「键盘 → 文本替换」。本探针在**浏览器 dev**（mock 宿主，确定性词条）与真实
 * Chromium 输入管线中验证：
 *   1. 启动注入（可用性 + 词条 + 默认开）
 *   2. 真实键入触发替换 + Undo/Redo（单事务）
 *   3. 菜单命令 live 关闭/开启（勾选态 = 实际行为）
 *   4. 代码 / URL 保护上下文
 *   5. IME 合成期间不触发（composition guard）
 *
 * 证据边界：mock 宿主词条（`omw` / `(c)`）不是真实系统词典；原生 Tauri + macOS
 * 系统词典链路需在 GUI 环境补测，本文件不声称覆盖。
 * 运行：NODE_PATH=<playwright 的 node_modules> node tests/e2e/text-replacement-verify.mjs
 */
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const cwd = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let checks = 0;
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
  checks += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const port = await pickFreePort();
  const base = `http://localhost:${port}`;
  const server = startViteDevServer({ cwd, port });
  const browser = await chromium.launch();
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      try { if ((await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok) break; } catch { /* starting */ }
      if (Date.now() > deadline) throw new Error('vite dev server 未就绪');
      await sleep(200);
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    // 只操控临时文档；关掉自动配对，避免 `(` 被配成 `()` 干扰断言。
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('mellow.editor.autoPair', '0');
      localStorage.setItem('mellow.locale', 'zh-CN');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const ready = async () => {
      await page.waitForFunction(() => !!window.__MELLOW_COMMANDS__, { timeout: 20000 });
      const limit = Date.now() + 20000;
      while (Date.now() < limit) {
        for (const frame of page.frames()) {
          if (!frame.url().includes('/editor/index.html')) continue;
          const ok = await frame.evaluate(() => !!window.editor?.state && !!window.__MELLOW_TEXT_REPLACEMENT__).catch(() => false);
          if (ok) {
            // App 的词典是异步注入的：等词条真正到达引擎（证明宿主 → App → iframe 链路）
            const readyEntries = await frame.evaluate(() => window.__MELLOW_TEXT_REPLACEMENT__.get().length > 0).catch(() => false);
            if (readyEntries) return frame;
          }
        }
        await sleep(100);
      }
      throw new Error('editor / text replacement 未就绪');
    };
    const frame = await ready();

    const api = () => frame.evaluate(() => {
      const a = window.__MELLOW_TEXT_REPLACEMENT__;
      return { entries: a.get(), enabled: a.getEnabled() };
    });
    const text = () => frame.evaluate(() => window.editor.state.doc.toString());
    const setDoc = (value, pos = value.length) => frame.evaluate(([v, p]) => {
      window.editor.dispatch({
        changes: { from: 0, to: window.editor.state.doc.length, insert: v },
        selection: { anchor: p },
      });
      window.editor.focus();
    }, [value, pos]);
    const typeText = async (s) => {
      await frame.locator('.cm-content').focus();
      await page.keyboard.type(s, { delay: 20 });
      await sleep(150);
      return text();
    };
    const run = (cmd) => page.evaluate((id) => window.__MELLOW_COMMANDS__.dispatch(id), cmd);

    // ── 1. 启动注入：词条来自宿主 mock，开关默认开（Typora 默认勾选） ──
    const initial = await api();
    check('启动注入：词条到达 iframe（宿主 → App → 引擎）', initial.entries.length === 2, JSON.stringify(initial.entries));
    check('启动注入：默认开启（菜单勾选态 = 实际行为）', initial.enabled === true, String(initial.enabled));

    // ── 2. 真实键入触发替换；触发字符保留；单事务 Undo/Redo ──
    await setDoc('');
    const typed = await typeText('omw ');
    check('键入 `omw` + 空格 → `on my way `（触发字符保留）', typed === 'on my way ', JSON.stringify(typed));
    await frame.evaluate(() => window.require('@codemirror/commands').undo(window.editor));
    await sleep(120);
    check('Undo 一步回到键入后（单事务）', (await text()) === 'omw', JSON.stringify(await text()));
    await frame.evaluate(() => window.require('@codemirror/commands').redo(window.editor));
    await sleep(120);
    check('Redo 恢复替换结果', (await text()) === 'on my way ', JSON.stringify(await text()));

    // ── 3. 菜单命令 live 关闭 / 开启 ──
    await run('edit.textReplacement.toggle');
    await sleep(150);
    const off = await api();
    check('菜单关闭 → 引擎开关立即为 false', off.enabled === false, String(off.enabled));
    check('菜单关闭 → 设置持久化（存储 = 单一真值）',
      (await page.evaluate(() => localStorage.getItem('mellow.editor.textReplacement'))) === '0');
    await setDoc('');
    const literal = await typeText('(c) ');
    check('关闭期间 `(c)` + 空格 **不替换**', literal === '(c) ', JSON.stringify(literal));
    await run('edit.textReplacement.toggle');
    await sleep(150);
    check('菜单再开 → 引擎开关为 true', (await api()).enabled === true);
    await setDoc('');
    const replaced = await typeText('(c) ');
    check('开启后 `(c)` + 空格 → `© `', replaced === '© ', JSON.stringify(replaced));

    // ── 4. 保护上下文：行内代码 / URL 不替换 ──
    // `run \`omw\``：反引号在 4，omw = 5..7，闭合反引号在 8 ⇒ 光标 8 时 prefix 以 omw 结尾且在 InlineCode 内
    await setDoc('run `omw`', 8);
    const codeOut = await typeText('!');
    check('行内代码内不替换', codeOut === 'run `omw!`', JSON.stringify(codeOut));
    // `[a](http://h/omw)`：右括号在 16 ⇒ 光标 16 时 prefix 以 omw 结尾且在 URL 内
    await setDoc('[a](http://h/omw)', 16);
    const urlOut = await typeText('!');
    check('链接 URL 内不替换', urlOut === '[a](http://h/omw!)', JSON.stringify(urlOut));

    // ── 5. IME 合成期间不触发（引擎 composition 真值） ──
    await setDoc('你好 omw', 6);
    await frame.evaluate(() => document.dispatchEvent(new Event('compositionstart')));
    const composing = await typeText(' ');
    check('合成中键入不替换', composing === '你好 omw ', JSON.stringify(composing));
    await frame.evaluate(() => document.dispatchEvent(new Event('compositionend')));
    await setDoc('你好 omw', 6);
    const afterCompose = await typeText(' ');
    check('合成结束后恢复替换', afterCompose === '你好 on my way ', JSON.stringify(afterCompose));

    console.log(`\nText replacement: ${checks} 项检查全部通过`);
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
