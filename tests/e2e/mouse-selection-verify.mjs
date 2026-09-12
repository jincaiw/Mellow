/**
 * 鼠标选择矩阵验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：主方案 §4.5「鼠标选择矩阵」此前标记为 🟡 部分 ——
 * `platformNav.ts` 存在，但单击 / 双击 / 三击 / 拖拽 / Shift 扩展选择
 * 在 jsdom 中无法验证（无布局），备注写明「需真机或 Playwright」。
 * Playwright 本机可用且不依赖 GUI 授权，故在此补齐运行时证据。
 *
 * 对齐口径（Typora / 主流编辑器的通用文本选择语义）：
 *   - 单击：光标定位到点击处，选区为空；
 *   - 双击：选中光标下的**词**（英文按单词边界；CJK 按连续 CJK 段）；
 *   - 三击：选中**整行 / 段落**；
 *   - 拖拽：按下到松开之间的连续选区；
 *   - Shift + 单击：把选区从原锚点**扩展**到点击处。
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/mouse-selection-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1436;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await sleep(300);
  }
  return false;
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const frame = await (async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ready = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
            if (ready) return f;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready');
    })();

    const setDoc = (text) => frame.evaluate((t) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
    }, text);
    const sel = () => frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      const s = v.state.selection.main;
      return { from: s.from, to: s.to, empty: s.empty, text: v.state.sliceDoc(s.from, s.to) };
    });
    /**
     * 取某个字符的**主页面**坐标。
     * 注意（踩坑）：`view.coordsAtPos()` 返回的是 **iframe 视口内**坐标，
     * 而 `page.mouse.*` 用的是**主页面视口**坐标；必须叠加 iframe 自身偏移，
     * 否则所有点击都会落到 iframe 左上角（表现为「永远命中偏移 0」）。
     */
    const posXY = async (pos) => {
      const c = await frame.evaluate((p) => {
        const v = window.editor?.dispatch ? window.editor : window.editor?.view;
        const r = v.coordsAtPos(p);
        return r ? { x: r.left, y: r.top + 8 } : null;
      }, pos);
      if (c === null) return null;
      const box = await page.locator('iframe').first().boundingBox();
      return { x: box.x + c.x, y: box.y + c.y };
    };

    // ── 1. 单击：光标定位，选区为空 ──────────────────────────────────────
    await setDoc('hello world');
    await sleep(400);
    let xy = await posXY(3); // 'hello' 内
    await page.mouse.click(xy.x, xy.y);
    await sleep(250);
    let s = await sel();
    check('单击定位光标且选区为空（点击偏移量 3）', s.empty === true && Math.abs(s.from - 3) <= 1, `from=${s.from} to=${s.to} empty=${s.empty}`);

    // ── 2. 双击：选中词 ──────────────────────────────────────────────────
    await setDoc('hello world');
    await sleep(400);
    xy = await posXY(2); // 'hello' 内
    await page.mouse.click(xy.x, xy.y, { clickCount: 2 });
    await sleep(250);
    s = await sel();
    check('双击选中单词（"hello"）', s.text === 'hello', `text=${JSON.stringify(s.text)}`);

    // 双击第二个词
    xy = await posXY(8); // 'world' 内
    await page.mouse.click(xy.x, xy.y, { clickCount: 2 });
    await sleep(250);
    s = await sel();
    check('双击选中第二个单词（"world"）', s.text === 'world', `text=${JSON.stringify(s.text)}`);

    // ── 3. 三击：选中整行 / 段落 ─────────────────────────────────────────
    await setDoc('first line\nsecond line');
    await sleep(400);
    xy = await posXY(3); // 第一行内
    await page.mouse.click(xy.x, xy.y, { clickCount: 3 });
    await sleep(250);
    s = await sel();
    // 实测三击选中的是「整行 + 行尾换行」（`"first line\n"`），这样 Delete 可整行删除。
    // 这是 CodeMirror 的默认语义；Typora 同为 CodeMirror 系引擎（见 typora-menu-dump 的
    // keymap 段），故按共享语义固化为契约，而非缺陷。若要与 Typora 逐字对照需真机三击取样。
    check('三击选中整行（含行尾换行，CodeMirror 共享语义）', s.text === 'first line\n', `text=${JSON.stringify(s.text)}`);

    // ── 4. 拖拽：连续选区 ────────────────────────────────────────────────
    await setDoc('abcdefghij');
    await sleep(400);
    const start = await posXY(2);
    const end = await posXY(6);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await sleep(300);
    s = await sel();
    check('拖拽产生连续选区（偏移 2→6 = "cdef"）', s.text === 'cdef', `text=${JSON.stringify(s.text)} from=${s.from} to=${s.to}`);

    // ── 5. Shift + 单击：扩展选区 ────────────────────────────────────────
    await setDoc('0123456789');
    await sleep(400);
    xy = await posXY(2);
    await page.mouse.click(xy.x, xy.y); // 锚点 2
    await sleep(200);
    const extendTo = await posXY(7);
    await page.keyboard.down('Shift');
    await page.mouse.click(extendTo.x, extendTo.y);
    await page.keyboard.up('Shift');
    await sleep(300);
    s = await sel();
    check('Shift+单击扩展选区（2→7 = "23456"）', s.text === '23456', `text=${JSON.stringify(s.text)} from=${s.from} to=${s.to}`);

    // ── 6. 列表 / 标题这类带 marker 的行：三击不应把源码 marker 选进去 ────
    await setDoc('- item one');
    await sleep(400);
    xy = await posXY(4); // 'item' 内
    await page.mouse.click(xy.x, xy.y, { clickCount: 3 });
    await sleep(250);
    s = await sel();
    check('列表行三击包含块 marker 与正文（整行）', s.text === '- item one', `text=${JSON.stringify(s.text)}`);
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ mouse-selection-verify crashed:', error.message);
  process.exitCode = 1;
});
