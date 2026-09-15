/**
 * 「Tab 键缩进」的**运行时验证**（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因（V7-W6，G7-EDIT-13）：Typora 有「默认缩进」（`indentSize` 默认 **2 空格**）与
 * 「使用Tab」（`indentByTab` 默认 false），而 Mellow **从未调用**引擎早已提供的
 * `setTabKeyBehavior` → Tab 一直落到引擎默认 `insertTab`（插入**裸制表符**；
 * 行首制表符在 CommonMark 里是缩进代码块，属真实隐患）。
 *
 * ⚠️ 本脚本同时是**反例探针**：它先证明 `indentUnit` facet 在 Mellow **无消费方**
 * （设 2 空格 / 4 空格 / 制表符，Tab 行为完全一致）—— 这正是最初打算用 `setIndentUnit`
 * 实现该设置时被探针拦下的原因，用它会做出**空开关**。这个反例比正例更值钱，
 * 故长期保留为断言。
 *
 * 覆盖：
 *   1. 【反例】`indentUnit` 对 Tab 行为**无影响**（三个取值结果相同）
 *   2. `tabKeyBehavior = insertTwoSpaces` → Tab 插入 2 个空格
 *   3. `tabKeyBehavior = insertFourSpaces` → Tab 插入 4 个空格
 *   4. `tabKeyBehavior = insertTab` → Tab 插入制表符（引擎原默认，保留为可选项）
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/tab-indent-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
            const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor && window.webModules?.config?.setTabKeyBehavior)).catch(() => false);
            if (ready) return f;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready（或 setTabKeyBehavior 未挂到 webModules.config）');
    })();

    const docText = () => frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      return v.state.doc.toString();
    });
    const setDoc = (text) => frame.evaluate((t) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: t.length } });
    }, text);
    const setTabBehavior = (behavior) => frame.evaluate((b) => window.webModules.config.setTabKeyBehavior({ behavior: b }), behavior);
    const setIndentUnit = (unit) => frame.evaluate((u) => window.webModules.config.setIndentUnit({ unit: u }), unit);
    /** 在空文档上按 Tab，返回插入的字符（JSON 化以便看清制表符与空格）。 */
    const tabInsertion = async () => {
      await frame.click('.cm-content');
      await setDoc('a');
      await page.keyboard.press('Tab');
      await sleep(180);
      return (await docText()).slice(1);
    };

    // ── 1【反例】：indentUnit 对 Tab 行为无影响 ──────────────────────────────
    const byUnit = [];
    for (const unit of ['  ', '    ', '\t']) {
      await setIndentUnit(unit);
      await sleep(120);
      byUnit.push(await tabInsertion());
    }
    check(
      '【反例】indentUnit 对 Tab 行为无影响（三个取值结果相同 → 用它做设置会是空开关）',
      byUnit[0] === byUnit[1] && byUnit[1] === byUnit[2],
      JSON.stringify(byUnit),
    );
    // 同时证明**启动恢复**生效：未显式下发 tabKeyBehavior 时，Tab 已是 2 个空格
    // （引擎默认是 insertTab = 制表符；改动前实测确为 "\t"）。
    check(
      '启动恢复生效：未显式设置时 Tab 插入 2 个空格（Typora 默认；引擎原默认是制表符）',
      byUnit[0] === '  ',
      JSON.stringify(byUnit[0]),
    );

    // ── 2/3/4：tabKeyBehavior 三档 ─────────────────────────────────────────
    await setTabBehavior(1); // insertTwoSpaces
    await sleep(150);
    const twoSpaces = await tabInsertion();
    check('tabKeyBehavior=insertTwoSpaces → Tab 插入 2 个空格', twoSpaces === '  ', JSON.stringify(twoSpaces));

    await setTabBehavior(2); // insertFourSpaces
    await sleep(150);
    const fourSpaces = await tabInsertion();
    check('tabKeyBehavior=insertFourSpaces → Tab 插入 4 个空格', fourSpaces === '    ', JSON.stringify(fourSpaces));

    await setTabBehavior(0); // insertTab
    await sleep(150);
    const tabChar = await tabInsertion();
    check('tabKeyBehavior=insertTab → Tab 插入制表符（引擎原默认，保留为可选项）', tabChar === '\t', JSON.stringify(tabChar));

    // ── 5/6/7：代码块缩进宽度独立于正文（Typora `codeIndentSize` 默认 4）────────
    // Typora 里正文缩进（indentSize，默认 2）与代码块缩进（codeIndentSize，默认 4）是两个独立偏好。
    // 改动前实测：代码块内按 Tab 得到正文宽度（2）→ 与 Typora 默认不符。
    const setCodeIndent = (width) => frame.evaluate((w) => window.webModules.config.setCodeIndentSize({ width: w }), width);
    /** 在代码块内按 Tab，返回插入的空白 */
    const codeTabInsertion = async () => {
      await frame.evaluate(() => {
        const view = window.editor;
        const doc = '```js\ncode\n```';
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: doc.indexOf('code') } });
      });
      await frame.locator('.cm-content').focus();
      await sleep(180);
      await page.keyboard.press('Tab');
      await sleep(200);
      const text = await docText();
      const line = text.split('\n').find((l) => l.includes('code')) ?? '';
      return line.slice(0, line.indexOf('code'));
    };

    await setTabBehavior(1); // 正文两空格
    await sleep(120);
    const codeDefault = await codeTabInsertion();
    check(
      '代码块内 Tab 用独立宽度：默认 4 个空格（正文仍是 2 —— Typora codeIndentSize 默认 4）',
      codeDefault === '    ',
      JSON.stringify(codeDefault),
    );

    const bodyAfterCode = await tabInsertion();
    check('同一次运行里正文 Tab 仍为 2 个空格（两个偏好互不影响）', bodyAfterCode === '  ', JSON.stringify(bodyAfterCode));

    await setCodeIndent(2);
    await sleep(150);
    const codeTwo = await codeTabInsertion();
    check('codeIndentSize 可配置：设为 2 → 代码块内 Tab 插入 2 个空格', codeTwo === '  ', JSON.stringify(codeTwo));

    await setCodeIndent(4);
    await sleep(120);
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
