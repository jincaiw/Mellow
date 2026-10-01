/**
 * 探针：**en-US 界面下，引擎侧 UI 文案是否已本地化**（2026-10-01；ADR-0028 落地后改为正面断言）。
 *
 * 背景：`general.language` 支持 zh-CN / en-US / system，但引擎运行在**独立 iframe** ——
 * 宿主的 i18n 目录与 `t()` 都到不了，引擎自己渲染的文案（表格工具栏 / 查找面板 / 选区工具栏 /
 * 图片操作提示）曾是**硬编码中文**（实测 79 条 / 8 文件，见审计 §4.52 / §4.57）。
 * ADR-0028 裁决为「逐项加桥 + 引擎自带目录 + 默认 zh-CN」，现已接入 `tEngine()` + `__MELLOW_ENGINE_LOCALE__`。
 *
 * 本探针把界面切到 en-US，然后**读引擎渲染出来的真实文案**并**断言是英文** ——
 * 这是「读代码推断」与「实测」的分界；也是 `P0-I18N-001` 从 `IMPL` 升回 `AUTO` 的 integration 证据。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node <此文件>
 * 前置：编辑器 bundle 已构建（node apps/desktop/scripts/build-editor-bundle.mjs）
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1462;
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

const TABLE_DOC = '| a | b |\n|---|---|\n| 1 | 2 |\n';

let exitCode = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) exitCode = 1;
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // 关键：在页面脚本执行前把 locale 设为 en-US
    await page.addInitScript(() => { try { localStorage.setItem('mellow.locale', 'en-US'); } catch { /* noop */ } });
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

    // ① 先确认**界面语言确实切成了 en**（否则下面的结论无效）。
    //    注意：App 的 DOM 文本几乎为空（编辑器在 iframe 里、菜单是原生的），
    //    故必须打开一个 **t() 驱动的面板**（Settings）来验证 locale 生效。
    await page.evaluate(() => window.__MELLOW_COMMANDS__?.dispatch('settings.open'));
    await sleep(800);
    const appProbe = await page.evaluate(() => {
      const panel = document.querySelector('.settings-panel');
      return {
        locale: localStorage.getItem('mellow.locale'),
        panelFound: panel !== null,
        panelText: (panel?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300),
      };
    });
    console.log('=== 界面语言探针（Settings 面板，t() 驱动）===');
    console.log('localStorage mellow.locale =', appProbe.locale);
    console.log('面板是否出现 =', appProbe.panelFound);
    console.log('面板文案 =', JSON.stringify(appProbe.panelText));
    // 前置断言：**必须证明界面确实切到了 en**，否则下面的观察无效（这是本探针的自证）
    check('前置：Settings 面板显示英文（locale 生效）',
      appProbe.panelFound && /Settings/.test(appProbe.panelText) && !/设置/.test(appProbe.panelText),
      `panelText=${JSON.stringify(appProbe.panelText.slice(0, 80))}`);
    // 关掉设置面板（Escape 关不掉 → 点面板内的 ✕；否则 backdrop 会拦截后续点击）
    await page.evaluate(() => {
      const panel = document.querySelector('.settings-panel');
      const close = Array.from(panel?.querySelectorAll('button') ?? []).find((b) => /✕|×|Close/i.test(b.textContent ?? ''));
      close?.click();
    });
    await sleep(500);
    const panelGone = await page.evaluate(() => document.querySelector('.settings-panel') === null);
    console.log('设置面板已关闭 =', panelGone);
    if (!panelGone) throw new Error('设置面板未关闭（会拦截后续交互）');

    // ② 把文档设成表格并把光标放进单元格 → 表格工具栏出现
    await frame.click('.cm-content');
    await frame.evaluate((doc) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
      const pos = v.state.doc.toString().indexOf('| 1 | 2 |') + 2;
      v.dispatch({ selection: { anchor: pos, head: pos } });
      v.focus();
    }, TABLE_DOC);
    await sleep(800);

    const toolbar = await frame.evaluate(() => {
      const bar = document.querySelector('.mellow-table-toolbar');
      if (bar === null) return { found: false };
      return {
        found: true,
        buttons: Array.from(bar.querySelectorAll('.mellow-table-toolbar-btn')).map((b) => b.textContent?.trim() ?? ''),
      };
    });
    console.log('\n=== 表格工具栏（引擎侧渲染）===');
    console.log(JSON.stringify(toolbar));
    check('前置：表格工具栏出现且能读到按钮（引擎侧渲染）',
      toolbar.found && (toolbar.buttons ?? []).length > 0,
      `buttons=${(toolbar.buttons ?? []).length}`);
    // ADR-0028 落地后的**正面断言**：en 界面下引擎文案必须是英文。
    // 注意：这里断言的是「读到的真实 DOM 文案」，不是「代码里没有中文」（那是静态护栏 E1 的活）。
    const barText = (toolbar.buttons ?? []).join(' ');
    check('表格工具栏文案已本地化为英文（ADR-0028）',
      !/[\u4e00-\u9fa5]/.test(barText) && /Row|Col|Align|Delete|Tidy|Resize|Apply/.test(barText),
      `buttons=${JSON.stringify(toolbar.buttons)}`);

    // ③ 查找面板占位符（engine documentSearch 设的）
    // ⚠️ 必须用 `ControlOrMeta`（macOS→Cmd / 其它平台→Ctrl）—— 本探针现在**挂进 Linux CI**，
    // 写死 `Meta+f` 在 Linux 上开不出查找面板（实测：Runtime Qualification Linux job 失败于
    // 「前置：查找面板出现」）。本仓既有约定见 `sidebar-golden.mjs` 的 `ControlOrMeta+f`。
    await page.keyboard.press('ControlOrMeta+f');
    await sleep(700);
    const find = await frame.evaluate(() => {
      const panel = document.querySelector('.cm-search');
      if (panel === null) return { found: false };
      const inputs = Array.from(panel.querySelectorAll('input')).map((i) => ({ name: i.name, ph: i.placeholder }));
      const btns = Array.from(panel.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      return { found: true, inputs, btns };
    });
    console.log('\n=== 查找面板（引擎侧渲染）===');
    console.log(JSON.stringify(find));
    check('前置：查找面板出现且能读到输入框（引擎侧渲染）',
      find.found && (find.inputs ?? []).length > 0,
      `inputs=${(find.inputs ?? []).length}`);
    // 正面断言：占位符取自 `tEngine('engine.search.find'/'engine.search.replace')`（Typora 真值 Find / Replace）
    const phs = (find.inputs ?? []).map((i) => i.ph).filter((x) => x !== undefined && x !== '');
    check('查找面板占位符已本地化为英文（Find / Replace）',
      phs.includes('Find') && phs.includes('Replace'),
      `placeholders=${JSON.stringify(phs)}`);

    // ④ 选区浮动工具栏标题（selectionToolbar）
    // 先**关掉查找面板并全选**，让选区工具栏真正显示 —— 它的标题在 `showEl()` 时同步
    // （构造期求值早于 locale 桥，故**未显示**的工具栏会留着默认语言；用户看不到它，
    //  但探针若直接扫全 DOM 会把「隐藏的陈旧 title」误报成缺陷 —— 断言应落在**可见态**）。
    await frame.evaluate(() => {
      const btn = document.querySelector('.cm-search button[name="close"]')
        ?? Array.from(document.querySelectorAll('.cm-search button')).find((b) => /✕/.test(b.textContent ?? ''));
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(300);
    await frame.click('.cm-content');
    await frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
      v.focus();
    });
    await sleep(700);
    const selBar = await frame.evaluate(() => {
      const bar = document.querySelector('.mellow-selection-toolbar');
      const visible = bar !== null && getComputedStyle(bar).display !== 'none';
      const titles = bar === null ? [] : Array.from(bar.querySelectorAll('button[title]')).map((b) => b.getAttribute('title'));
      return { found: bar !== null, visible, titles, ariaLabel: bar?.getAttribute('aria-label') ?? null };
    });
    console.log('\n=== 选区浮动工具栏（引擎侧渲染，显示态）===');
    console.log(JSON.stringify(selBar));
    check('前置：选区工具栏已显示且能读到按钮标题', selBar.visible && (selBar.titles ?? []).length > 0,
      `visible=${selBar.visible} titles=${(selBar.titles ?? []).length}`);
    const barTitles = (selBar.titles ?? []).join(' ');
    check('选区工具栏标题已本地化为英文（ADR-0028）',
      !/[\u4e00-\u9fa5]/.test(barTitles) && /Heading|Strong|Emphasis|Strike|Inline Code|Hyperlink|Quote|List/.test(barTitles),
      `titles=${JSON.stringify(selBar.titles)}`);
    check('选区工具栏 aria-label 已本地化为英文', selBar.ariaLabel === 'Format toolbar',
      `aria-label=${JSON.stringify(selBar.ariaLabel)}`);

    // ⑤ 全 DOM 兜底：可见区域不应残留中文 title
    const sel = await frame.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[title]'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;   // 只算**可见**元素
        })
        .map((e) => e.getAttribute('title'))
        .filter((x) => x !== null && /[\u4e00-\u9fa5]/.test(x));
      return els.slice(0, 12);
    });
    console.log('\n=== 引擎 DOM 里**可见**元素中 title 含中文的（前 12）===');
    console.log(JSON.stringify(sel));
    // 正面断言：en 界面下引擎**可见**元素不应再有中文 title
    check('引擎可见元素无残留中文 title（ADR-0028 落地）', sel.length === 0, `含中文 title 的可见元素=${sel.length}`);
    console.log('\n[结论] en 界面下引擎侧文案已本地化（ADR-0028）；'
      + '静态侧由 tests/parity/verify-i18n-contract.mjs 的 E1–E4 四条判据守');
    process.exitCode = exitCode;
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((e) => { console.error('❌ probe crashed:', e.message); process.exitCode = 1; });
