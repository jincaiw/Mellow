/**
 * 探针：**en-US 界面下，引擎侧 UI 文案是否仍为中文**（2026-10-01）。
 *
 * 背景：扫描发现 `packages/editor-engine/src` 有 47 处**硬编码中文 UI 文案**
 * （`image/widget.ts` 14 / `table/toolbar.ts` 13 / `selectionToolbar.ts` 10 / `documentSearch.ts` 9 …），
 * 而 `general.language` 支持 zh-CN / en-US / system，CI 的 i18n 护栏只覆盖 `t('字面量')` 与 schema 声明。
 * 本探针把界面切到 en-US，然后**读引擎渲染出来的真实文案** —— 是「读代码推断」还是「实测」的分界。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node <此文件>
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
    // 前置断言（**不断言「缺口存在」** —— 那会把缺陷写成契约，skill §14）：
    // 只断言「读到了引擎渲染的按钮」，缺口本身只**记录**，清单由 verify-i18n-contract 的登记表守。
    check('前置：表格工具栏出现且能读到按钮（引擎侧渲染）',
      toolbar.found && (toolbar.buttons ?? []).length > 0,
      `buttons=${(toolbar.buttons ?? []).length}`);
    console.log('   [观察] en 界面下表格工具栏文案 =', JSON.stringify(toolbar.buttons));

    // ③ 查找面板占位符（engine documentSearch 设的）
    await page.keyboard.press('Meta+f');
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

    // ④ 选区浮动工具栏标题（selectionToolbar 硬编码）
    const sel = await frame.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[title]'))
        .map((e) => e.getAttribute('title'))
        .filter((x) => x !== null && /[\u4e00-\u9fa5]/.test(x));
      return els.slice(0, 12);
    });
    console.log('\n=== 引擎 DOM 里 title 含中文的元素（前 12）===');
    console.log(JSON.stringify(sel));
    console.log('\n[结论] 前置成立（界面为 en）而引擎文案为中文 → 见审计 §4.52 与 P0-I18N-001；'
      + '清单在 tests/parity/verify-i18n-contract.mjs 的 ENGINE_I18N_REGISTERED');
    process.exitCode = exitCode;
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((e) => { console.error('❌ probe crashed:', e.message); process.exitCode = 1; });
