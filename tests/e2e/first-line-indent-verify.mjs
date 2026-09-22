/**
 * 首行缩进的运行时验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * Typora 真值：`indentFirstLine` 默认 false；Mellow 实现为仅 Paragraph 首行
 * `text-indent: 2em` 的 CoreEditor decoration（G7-EDIT-15）。
 *
 * 覆盖：
 *   1. 开关关闭：普通段落首行无 text-indent
 *   2. 开关开启：普通段落首行 = 2em，段落第二行不缩进
 *   3. 列表 / 引用 / 代码块不叠加首行缩进（其结构自己的 indent decoration 保留）
 *   4. live toggle 回关：关闭 → 开启 → 关闭，DOM style 随 compartment 双向变化
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/first-line-indent-verify.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
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
        if ((await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok) {
          ready = true;
          break;
        }
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
            const isReady = await candidate.evaluate(() => !!(window.webModules?.core && window.editor && window.webModules?.config?.setFirstLineIndent)).catch(() => false);
            if (isReady) return candidate;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready（或 setFirstLineIndent 未挂到 webModules.config）');
    })();
    const setDoc = (text) => frame.evaluate((value) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!view) throw new Error('editor view unavailable');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, selection: { anchor: 0 } });
    }, text);
    const toggle = (enabled) => frame.evaluate((value) => {
      window.webModules.config.setFirstLineIndent({ enabled: value });
    }, enabled);
    const inspect = () => frame.evaluate(() => [...document.querySelectorAll('.cm-line')].slice(0, 12).map((element) => ({
      text: element.textContent,
      textIndent: getComputedStyle(element).textIndent,
      style: element.getAttribute('style'),
      className: element.className,
    })));

    const documentText = 'para one\npara two\n\n- item\n> quote\n```js\ncode\n```';
    await toggle(false);
    await setDoc(documentText);
    await sleep(250);
    const off = await inspect();
    const paraFirstOff = off.find((line) => line.text === 'para one');
    check('关闭：普通段落首行无缩进', paraFirstOff?.textIndent === '0px', JSON.stringify(paraFirstOff));

    await toggle(true);
    await sleep(250);
    const on = await inspect();
    const paraFirstOn = on.find((line) => line.text === 'para one');
    const paraSecondOn = on.find((line) => line.text === 'para two');
    check('开启：普通段落首行 text-indent = 2em', paraFirstOn?.textIndent === '32px' && paraFirstOn?.style?.includes('text-indent: 2em'), JSON.stringify(paraFirstOn));
    check('开启：同一段落第二行不缩进', paraSecondOn?.textIndent === '0px' && paraSecondOn?.style === null, JSON.stringify(paraSecondOn));

    const listLine = on.find((line) => line.text === '- item');
    const quoteLine = on.find((line) => line.text === '> quote');
    const codeLine = on.find((line) => line.text === 'code');
    check('开启：列表不叠加首行 text-indent（只保留列表自身结构缩进）', !listLine?.style?.includes('2em'), JSON.stringify(listLine));
    check('开启：引用不叠加首行 text-indent（只保留引用自身结构缩进）', !quoteLine?.style?.includes('2em'), JSON.stringify(quoteLine));
    check('开启：代码块不叠加首行 text-indent', !codeLine?.style?.includes('2em'), JSON.stringify(codeLine));

    await toggle(false);
    await sleep(250);
    const backOff = await inspect();
    const paraFirstBackOff = backOff.find((line) => line.text === 'para one');
    check('live toggle：关闭 → 开启 → 关闭后首行缩进撤销', paraFirstBackOff?.textIndent === '0px' && paraFirstBackOff?.style === null, JSON.stringify(paraFirstBackOff));

    // ── 菜单命令链路：Edit → 空格与换行 → 首行缩进（G7-EDIT-15）────────────
    // 该菜单项与设置面板是同一真值；此处验证「命令 → Settings Store → 编辑器」整条链，
    // 而不是只验证引擎的 bridge（bridge 已由上面的 toggle 覆盖）。
    const commandReady = await page.evaluate(() => typeof window.__MELLOW_COMMANDS__?.dispatch === 'function');
    check('命令注册表可派发（__MELLOW_COMMANDS__）', commandReady, String(commandReady));
    if (commandReady) {
      await page.evaluate(() => localStorage.removeItem('mellow.editor.firstLineIndent'));
      await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('edit.firstLineIndent.toggle'));
      await sleep(300);
      const afterOn = await page.evaluate(() => localStorage.getItem('mellow.editor.firstLineIndent'));
      const onLines = await inspect();
      const onFirst = onLines.find((line) => line.text === 'para one');
      check('菜单命令开启：写回 Settings Store（mellow.editor.firstLineIndent = 1）', afterOn === '1', JSON.stringify(afterOn));
      check('菜单命令开启：编辑器首行缩进即时生效', onFirst?.style?.includes('text-indent: 2em'), JSON.stringify(onFirst?.style));

      await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('edit.firstLineIndent.toggle'));
      await sleep(300);
      const afterOff = await page.evaluate(() => localStorage.getItem('mellow.editor.firstLineIndent'));
      const offLines = await inspect();
      const offFirst = offLines.find((line) => line.text === 'para one');
      check('菜单命令再点一次：写回 Settings Store（= 0）', afterOff === '0', JSON.stringify(afterOff));
      check('菜单命令再点一次：编辑器首行缩进撤销', offFirst?.style === null, JSON.stringify(offFirst?.style));
    }
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
