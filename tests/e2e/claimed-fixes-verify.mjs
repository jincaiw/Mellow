/**
 * 「已修复」项的运行时审计（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：本轮已三次遇到「结构/单测在，功能实际不工作」（浮动工具栏不显示、
 * 表格对齐连字符侵蚀、New Paragraph 被块级整行吞掉）。因此凡方案里标
 * 「已修复 / DONE」且**未经运行时验证**的项，都必须补一次实证，而不是采信文档。
 *
 * 覆盖（均可在本环境观测，无需真机）：
 *   1. 单图独占段落居中（G7-TYPO-01，W4.3）
 *   2. View → 状态栏开关（G7-MENU-03，W1.6）
 *   3. 字数统计面板入口（G7-SHELL-07，W2.7）
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/claimed-fixes-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1448;
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
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
    }, text);
    /**
     * 写入文档并把光标放到**末尾空行**。
     * 必须如此：图片 widget 有「光标/选区碰到节点 → 显示源码（不渲染 widget）」的语义
     * （image/widget.ts 约 366 行），若光标停在图片节点上，`.mellow-md-image-*` 根本不存在
     * （实测踩过：centered=0 且 widgets=0）。
     */
    const setDocCaretAway = (text) => frame.evaluate((t) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      const doc = `${t}\n`;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc }, selection: { anchor: doc.length, head: doc.length } });
    }, text);
    const dispatch = async (id) => {
      await page.evaluate((cid) => window.__MELLOW_COMMANDS__.dispatch(cid), id);
      await sleep(450);
    };

    await frame.click('.cm-content');

    // ── 1. 单图独占段落居中（G7-TYPO-01 / W4.3）─────────────────────────
    const centeredCount = () => frame.evaluate(() => document.querySelectorAll('.mellow-md-image-centered').length);
    const widgetCount = () => frame.evaluate(() => document.querySelectorAll('.mellow-md-image-wrapper, [class*="mellow-md-image"]').length);

    await setDocCaretAway('![a](x.png)');
    await sleep(800);
    const loneCentered = await centeredCount();
    check('单图独占段落 → 居中（Typora p > img:only-child）', loneCentered === 1,
      `centered=${loneCentered} widgets=${await widgetCount()}`);

    await setDocCaretAway('caption ![a](x.png)');
    await sleep(800);
    const mixedCentered = await centeredCount();
    check('图文混排 → 不居中', mixedCentered === 0, `centered=${mixedCentered}`);

    await setDocCaretAway('![a](x.png) ![b](y.png)');
    await sleep(800);
    const twoCentered = await centeredCount();
    check('两图并排 → 都不居中（only-child 语义）', twoCentered === 0, `centered=${twoCentered}`);

    // ── 2. View → 状态栏开关（G7-MENU-03 / W1.6）────────────────────────
    const statusbarVisible = () => page.evaluate(() => !!document.querySelector('.statusbar'));

    await setDoc('hello');
    await sleep(300);
    const before = await statusbarVisible();
    await dispatch('view.statusbar.toggle');
    const afterOn = await statusbarVisible();
    check('View → 状态栏开关可开启', afterOn === true, `before=${before} after=${afterOn}`);

    // ── 3. 字数统计面板入口（G7-SHELL-07 / W2.7）────────────────────────
    if (!afterOn) {
      check('字数统计面板入口（前置：状态栏可见）', false, '状态栏未显示，跳过');
    } else {
      const statsBtn = await page.evaluate(() => !!document.querySelector('.statusbar-stats'));
      check('状态栏字数项为可点击按钮', statsBtn === true, `statsBtn=${statsBtn}`);
      if (statsBtn) {
        await page.evaluate(() => {
          document.querySelector('.statusbar-stats')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await sleep(700);
        const panelOpen = await page.evaluate(() => {
          // 字数面板：常见的两个锚点任一命中即可
          const byClass = document.querySelector('.wordcount-panel, .word-count-panel, .stats-panel');
          const byText = Array.from(document.querySelectorAll('div,section'))
            .some((el) => /阅读时间|reading time|字 ·/.test(el.textContent ?? ''));
          return !!byClass || byText;
        });
        check('点击字数打开统计面板', panelOpen === true, `panelOpen=${panelOpen}`);
      }
    }

    // 收尾：关闭状态栏，避免影响后续脚本
    await dispatch('view.statusbar.toggle');
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ claimed-fixes-verify crashed:', error.message);
  process.exitCode = 1;
});
