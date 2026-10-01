/**
 * 探针：**冷启动时，非默认的持久化设置是否真的到达了引擎**（2026-10-01）。
 *
 * ## 为什么需要
 *
 * `App.tsx` 把「持久化设置 → 运行时」分成两类路径：
 * ① 在 **「引擎就绪」回调**里下发（稳）；
 * ② 在某个 `useEffect` 里下发 —— 而 effect **可能早于引擎就绪** → 调用**静默 no-op**。
 *
 * 实测（审计 §4.59）：**主题这一族**（编辑器主题 / md token / 字体）走的是路径 ②，
 * 于是「以暗色启动」时编辑器用**默认（亮）主题**渲染、md token **全空**。
 * 同族嫌疑还有：`appearance.toolbar`（格式工具栏开关）等**只在回调里下发**的设置。
 *
 * ## 为什么以前没发现
 *
 * 已有的 e2e 与视觉 Golden **都在默认值下采样**（亮色主题 / 工具栏默认开 / 中文）。
 * **「默认能跑」被当成了「能跑」** —— 本探针专门走**非默认入口**。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node <此文件>
 * 前置：编辑器 bundle 已构建（node apps/desktop/scripts/build-editor-bundle.mjs）
 */
import { startViteDevServer, describeSpawnFailure } from '../visual/dev-server.mjs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1467;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let exitCode = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) exitCode = 1;
};

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

/** 冷启动一次，带给定 localStorage 预设；返回 { page, frame } */
async function coldStart(browser, preset) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((p) => {
    try {
      for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
    } catch { /* noop */ }
  }, preset);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root > *', { timeout: 15000 });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (f.url().includes('/editor/index.html')) {
        const ok = await f.evaluate(() => !!(window.webModules?.core && window.editor && document.querySelector('.cm-content'))).catch(() => false);
        if (ok) return { context, page, frame: f };
      }
    }
    await sleep(300);
  }
  throw new Error('editor iframe not ready');
}

const DOC = 'hello world\n\n可选中的正文文字\n';

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error(`vite dev server 未就绪${describeSpawnFailure(server)}`);

    // ── 用例 1：`appearance.toolbar` = **false**（非默认）────────────────
    // 期望：冷启动后选中文本**不出现**格式工具栏。
    // 已知风险：该设置只在「菜单/设置回调」里下发，若启动时没下发，引擎会按**默认（开）**渲染。
    {
      const { context, page, frame } = await coldStart(browser, {
        'mellow.selectionToolbar.enabled': 'false',
      });
      await frame.click('.cm-content');
      await frame.evaluate((doc) => {
        const v = window.editor?.dispatch ? window.editor : window.editor?.view;
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
        v.dispatch({ selection: { anchor: 0, head: 5 } });
        v.focus();
      }, DOC);
      await sleep(800);
      const bar = await frame.evaluate(() => {
        const el = document.querySelector('.mellow-selection-toolbar');
        return { found: el !== null, display: el === null ? null : getComputedStyle(el).display };
      });
      const visible = bar.found && bar.display !== 'none';
      console.log(`\n=== 用例 1：appearance.toolbar=false（非默认）→ 选中文本 ===`);
      console.log(JSON.stringify(bar));
      check('冷启动后「格式工具栏已关闭」这一设置到达引擎（选中文本不应出现工具栏）',
        !visible, `found=${bar.found} display=${bar.display}`);
      await context.close();
    }

    // ── 用例 2：对照 —— 默认（true）下选中文本**应当**出现工具栏 ─────────
    {
      const { context, frame } = await coldStart(browser, {});
      await frame.click('.cm-content');
      await frame.evaluate((doc) => {
        const v = window.editor?.dispatch ? window.editor : window.editor?.view;
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
        v.dispatch({ selection: { anchor: 0, head: 5 } });
        v.focus();
      }, DOC);
      await sleep(800);
      const bar = await frame.evaluate(() => {
        const el = document.querySelector('.mellow-selection-toolbar');
        return { found: el !== null, display: el === null ? null : getComputedStyle(el).display };
      });
      const visible = bar.found && bar.display !== 'none';
      console.log(`\n=== 用例 2：对照（默认开）→ 选中文本 ===`);
      console.log(JSON.stringify(bar));
      check('对照：默认设置下格式工具栏**应当**出现（证明用例 1 的判据有效）', visible,
        `found=${bar.found} display=${bar.display}`);
      await context.close();
    }

    process.exitCode = exitCode;
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((e) => { console.error('❌ probe crashed:', e.message); process.exitCode = 1; });
