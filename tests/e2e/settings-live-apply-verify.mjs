/**
 * 设置项「启动生效」运行时审计（浏览器 dev 模式，Playwright Chromium）。
 *
 * 动机同前两批：本轮多次遇到「代码在、功能不工作」。「设置项读到了没有」
 * 最容易断链 —— 存储键写对、解析函数写对，但 App 侧根本没接线，静态看全是绿的。
 * 故本文件用**可观测副作用**验证，而不是读代码：
 *   A. G7-FEAT-03 定时自动保存：`setInterval` 真的按 autosaveIntervalMs 排程
 *      （用 addInitScript 包住 setInterval 记录 delay）
 *   B. G7-FEAT-03 间隔设置生效：`mellow.file.autosaveTimer = 2` → 120000ms（默认 5 → 300000ms）
 *   C. W5.5 Reader 字号同源：`editor.fontSize = 20` → `--mellow-content-font-size` 为 20px
 *      （Reader 与编辑器同源，此前 Reader 硬编码 16px）
 *   D. G7-SHELL-06 标题栏字数：`appearance.wordCount = true` → document.title 含字数
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/settings-live-apply-verify.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1451;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
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

/** 打开一页，预置 localStorage，并记录 App 排程的所有 setInterval 间隔 */
async function openWith(browser, settings) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((entries) => {
    for (const [k, v] of entries) localStorage.setItem(k, v);
    // 在 App 脚本之前包住 setInterval，记录排程间隔
    const w = window;
    w.__INTERVALS__ = [];
    const orig = window.setInterval.bind(window);
    window.setInterval = function patched(fn, ms, ...rest) {
      w.__INTERVALS__.push(ms);
      return orig(fn, ms, ...rest);
    };
  }, Object.entries(settings));
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root > *', { timeout: 15000 });
  await sleep(1200);
  return { page, context };
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');

    // ── A / B：自动保存定时器 ─────────────────────────────────────────
    const a = await openWith(browser, { 'mellow.file.autosave': '1', 'mellow.file.autosaveTimer': '5' });
    const intervalsA = await a.page.evaluate(() => window.__INTERVALS__ ?? []);
    check('G7-FEAT-03 自动保存已排程（5 分钟 = 300000ms）',
      intervalsA.includes(300000), `intervals=${JSON.stringify(intervalsA)}`);
    await a.context.close();

    const b = await openWith(browser, { 'mellow.file.autosave': '1', 'mellow.file.autosaveTimer': '2' });
    const intervalsB = await b.page.evaluate(() => window.__INTERVALS__ ?? []);
    check('G7-FEAT-03 autosaveTimer=2 生效（120000ms）',
      intervalsB.includes(120000), `intervals=${JSON.stringify(intervalsB)}`);
    await b.context.close();

    // 关闭开关后不应排程自动保存
    const c = await openWith(browser, { 'mellow.file.autosave': '0', 'mellow.file.autosaveTimer': '5' });
    const intervalsC = await c.page.evaluate(() => window.__INTERVALS__ ?? []);
    check('G7-FEAT-03 关闭自动保存后不再排程 300000ms',
      !intervalsC.includes(300000), `intervals=${JSON.stringify(intervalsC)}`);
    await c.context.close();

    // ── C：Reader 字号同源（W5.5）─────────────────────────────────────
    const d = await openWith(browser, { 'mellow.editor.fontSize': '20' });
    const fsVar = await d.page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--mellow-content-font-size').trim();
      return v;
    });
    check('W5.5 `editor.fontSize=20` 写入 --mellow-content-font-size',
      fsVar === '20px', `var=${JSON.stringify(fsVar)}`);
    // Reader 规则消费该变量（样式层面）：确认 CSS 里 Reader 用的是变量而非硬编码
    const readerFollows = await d.page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'mellow-reader';
      document.body.appendChild(el);
      const size = getComputedStyle(el).fontSize;
      el.remove();
      return size;
    });
    check('W5.5 `.mellow-reader` 跟随该变量（非硬编码 16px）',
      readerFollows === '20px', `readerFontSize=${JSON.stringify(readerFollows)}`);

    // ── D：标题栏字数（G7-SHELL-06）───────────────────────────────────
    // **本环境无法运行时观测**：该行为的 effect 首行是 `if (!isTauri()) return;`
    // （App.tsx:710），浏览器 dev harness 下必然早退，document.title 恒为 'Mellow'。
    // 这不是缺陷，而是 Tauri-only 路径。此处退化为**静态契约断言**（证据等级更低，
    // 已如实标注），运行时证据需在原生 App 中取得。
    const src = await d.page.evaluate(async () => {
      const res = await fetch('/src/App.tsx');
      return res.ok ? await res.text() : '';
    });
    if (src === '') {
      check('G7-SHELL-06 标题栏字数接线（静态契约）', false, '无法读取 App.tsx 源码');
    } else {
      const hasTauriGate = /if \(!isTauri\(\)\) return;/.test(src);
      // 放宽引号/空白：vite 转译后的源码引号形式可能与源码不同
      const initsFromSetting = /settingById\(\s*['"]appearance\.wordCount['"]\s*\)/.test(src);
      const appendsWords = /wordCountShort/.test(src) && /wordCountInTitle && wordCountData !== null/.test(src);
      check('G7-SHELL-06 标题栏字数接线（静态契约：设置单一真源 + 字数并入 + Tauri 门控）',
        hasTauriGate && initsFromSetting && appendsWords,
        `tauriGate=${hasTauriGate} fromSetting=${initsFromSetting} appends=${appendsWords}`);
      check('G7-SHELL-06 如实记录：dev 环境不可观测（isTauri 早退）', hasTauriGate,
        '运行时证据需在原生 App 取得');
    }
    await d.context.close();
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ settings-live-apply-verify crashed:', error.message);
  process.exitCode = 1;
});
