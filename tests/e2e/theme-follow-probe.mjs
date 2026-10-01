/**
 * 探针：**暗色主题下，引擎侧浮动 UI 是否跟随主题**（2026-10-01）。
 *
 * 背景：引擎里存在 `var(--mellow-*, <fallback>)` 约定（`packages/themes` 定义了 206 个变量），
 * 但**应用不一致**：`selectionToolbar` 用 `var(--mellow-toolbar-bg, rgba(30,30,30,.92))`（暗），
 * 而 `table/toolbar` 用硬编码 `rgba(255,255,255,.92)`（亮）—— 两个**同类浮动工具栏默认值相反**。
 *
 * 本探针只断言**前置条件**（暗色确实生效、两个工具栏都渲染出来），把读到的计算样式**打印**出来；
 * 「是否跟随主题」的判断留给读者与审计文档（不把缺陷写成断言，skill §14）。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node <此文件>
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1463;
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

const TABLE_DOC = '| a | b |\n|---|---|\n| 1 | 2 |\n\n可选中的正文文字\n';

let exitCode = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) exitCode = 1;
};

/**
 * 解析 `rgb()/rgba()` 并算感知亮度（0–255）。
 *
 * ⚠️ **必须先处理透明**：`rgba(0,0,0,0)` 的 RGB 是**黑**，直接算亮度会把「透明」判成「深色」——
 * 本文件早期就踩过这个坑（首版读 `.cm-content` 的透明底，得到「暗色下文字为深色」的假结论）。
 * 故 alpha = 0 时返回 `null`（不可判定），由调用方决定怎么处理。
 */
function colorLuminance(css) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/.exec(css ?? '');
  if (m === null) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha === 0) return null;
  return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
}

/** 是否「暗」——不可判定（透明/无法解析）返回 false，由调用方另行断言前置。 */
const isDarkColor = (css) => {
  const l = colorLuminance(css);
  return l !== null && l < 128;
};

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('mellow.theme.settings', JSON.stringify({
          mode: 'dark', lightThemeId: 'mellow-light', darkThemeId: 'mellow-dark',
        }));
      } catch { /* noop */ }
    });
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

    // ① 前置：**app 侧**主题已生效（读 app 根的 data-theme 与主题变量）。
    // ⚠️ 两个自伤记录：
    //   ① 首版读 `.cm-content` 的 backgroundColor —— 它是 `rgba(0,0,0,0)`（**透明**），
    //      而判定把「透明黑」当深色 → 前置**空泛通过**（量具骗过自己）；
    //   ② 第二版改成断言「暗色下**编辑器文字**为浅色」—— 而那**正是本探针要查的缺陷本身**，
    //      于是「前置失败」被误当成「探针坏了」。**前置只能断言「量具就位」，不能断言「被测对象正确」。**
    const themeState = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        settings: localStorage.getItem('mellow.theme.settings'),
        dataTheme: document.documentElement.getAttribute('data-theme'),
        bg: cs.getPropertyValue('--mellow-bg').trim(),
        toolbarBg: cs.getPropertyValue('--mellow-toolbar-bg').trim(),
      };
    });
    console.log('=== 前置（app 侧主题）===');
    console.log('mellow.theme.settings =', themeState.settings);
    console.log('app 根 data-theme =', themeState.dataTheme, '| --mellow-bg =', themeState.bg,
      '| --mellow-toolbar-bg =', themeState.toolbarBg);
    check('前置：app 侧主题已生效（根上有 data-theme 与主题变量）',
      themeState.dataTheme !== null && themeState.bg !== '',
      `data-theme=${themeState.dataTheme} bg=${themeState.bg}`);

    // ② 表格工具栏
    await frame.click('.cm-content');
    await frame.evaluate((doc) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
      const pos = v.state.doc.toString().indexOf('| 1 | 2 |') + 2;
      v.dispatch({ selection: { anchor: pos, head: pos } });
      v.focus();
    }, TABLE_DOC);
    await sleep(800);
    const tableBar = await frame.evaluate(() => {
      const bar = document.querySelector('.mellow-table-toolbar');
      if (bar === null) return { found: false };
      const cs = getComputedStyle(bar);
      const btn = bar.querySelector('.mellow-table-toolbar-btn');
      return {
        found: true,
        bg: cs.backgroundColor,
        border: cs.borderTopColor,
        fg: cs.color,
        btnBg: btn === null ? null : getComputedStyle(btn).backgroundColor,
      };
    });
    console.log('\n=== 表格工具栏（table/toolbar.ts：走 --mellow-md-panel-*）===');
    console.log(JSON.stringify(tableBar));
    check('前置：表格工具栏出现', tableBar.found === true);
    // ADR-0027 落地后的**正面断言**：暗色主题下浮动面板必须是**暗**的。
    // 一手基线：Typora 的 `.ty-table-edit` 每个主题显式上色（night = `#363B40` = 该主题 `--bg-color`）。
    // 修复前此处恒为 `rgba(255,255,255,0.92)`（**白底**）—— 那是缺口，不是有意差异。
    check('表格工具栏**面板底**在暗色下为暗（ADR-0027：跟随主题）',
      tableBar.found === true && isDarkColor(tableBar.bg),
      `bg=${JSON.stringify(tableBar.bg)} 亮度=${colorLuminance(tableBar.bg)}`);
    check('表格工具栏**按钮底**在暗色下为暗（同 token）',
      tableBar.found === true && isDarkColor(tableBar.btnBg),
      `btnBg=${JSON.stringify(tableBar.btnBg)}`);
    check('表格工具栏**文字**在暗色下为浅色（可读）',
      tableBar.found === true && !isDarkColor(tableBar.fg),
      `fg=${JSON.stringify(tableBar.fg)}`);

    // ③ 选区浮动工具栏（selectionToolbar.ts：走 --mellow-toolbar-bg）
    await frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      const text = v.state.doc.toString();
      const from = text.indexOf('可选中的正文文字');
      v.dispatch({ selection: { anchor: from, head: from + 3 } });
      v.focus();
    });
    await sleep(900);
    const selBar = await frame.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div'))
        .filter((e) => e.className !== '' && typeof e.className === 'string'
          && /selection-toolbar|mellow-selection/i.test(e.className));
      const el = els[0] ?? null;
      if (el === null) return { found: false, classes: els.length };
      const cs = getComputedStyle(el);
      return { found: true, cls: el.className, bg: cs.backgroundColor, fg: cs.color };
    });
    console.log('\n=== 选区浮动工具栏（selectionToolbar.ts：var(--mellow-toolbar-bg)）===');
    console.log(JSON.stringify(selBar));
    check('前置：选区浮动工具栏出现', selBar.found === true, `classes=${selBar.classes ?? ''}`);

    // ④ iframe 根上的主题变量（**观察**，不断言）：区分 md / 非 md
    const iframeVars = await frame.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const read = (k) => cs.getPropertyValue(k).trim();
      return {
        dataTheme: document.documentElement.getAttribute('data-theme'),
        md: { inlineCodeBg: read('--mellow-md-inline-code-bg'), link: read('--mellow-md-link') },
        other: { bg: read('--mellow-bg'), toolbarBg: read('--mellow-toolbar-bg'), accent: read('--mellow-accent') },
      };
    });
    console.log('\n=== iframe 根上的主题变量（观察）===');
    console.log(JSON.stringify(iframeVars));

    console.log('\n[观察] 若 tableBar.bg 为浅色而 selBar.bg 为深色 → 同类浮动 UI 在暗色下不一致');
    console.log('[观察] 若 iframeVars.md 非空而 iframeVars.other 为空 → 与 mdTokens.ts:39 的过滤一致'
      + '（只有 --mellow-md-* 跨进 iframe；其余 var(--mellow-*) 永远取 fallback）');
    process.exitCode = exitCode;
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((e) => { console.error('❌ probe crashed:', e.message); process.exitCode = 1; });
