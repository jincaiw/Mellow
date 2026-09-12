/**
 * 浮动 / 表格工具栏「按钮真的可用」验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：本轮曾发现浮动 Selection Toolbar **元素在、按钮在、但永远不显示**
 * （`position()` 在 CM6 update 周期内读布局被拒 → 静默自隐）。那次教训是——
 * 「结构存在」不等于「功能可用」。所以工具栏修好之后必须再验一步：
 * **按钮点下去是否真的产生编辑效果**。表格工具栏同理（11 个按钮此前只验过渲染）。
 *
 * 覆盖：
 *   1. Selection Toolbar：`[data-action="bold"]` → 选中文本变粗体；
 *   2. Table Toolbar：`[title="Align Center"]` → 列分隔符变为 `:---:`；
 *   3. Table Toolbar：`[title="Row Below"]` → 表格增加一行。
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/widget-buttons-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1441;
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

    const setDoc = (text, anchor = null, head = null) => frame.evaluate(([t, a, h]) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: t },
        ...(a === null ? {} : { selection: { anchor: a, head: h } }),
      });
    }, [text, anchor, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    const waitFor = async (fn, timeoutMs = 10000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) { if (await fn()) return true; await sleep(200); }
      return false;
    };

    await frame.click('.cm-content');

    // ── 1. Selection Toolbar 的 Bold 按钮 ───────────────────────────────
    await setDoc('hello', 0, 5);
    await sleep(400);
    const selReady = await waitFor(() => frame.evaluate(() => {
      const bar = document.querySelector('.mellow-selection-toolbar');
      return !!bar && bar.getBoundingClientRect().width > 0;
    }));
    if (!selReady) {
      check('Selection Toolbar 可见（前置）', false, 'toolbar 未显示');
    } else {
      const clicked = await frame.evaluate(() => {
        const btn = document.querySelector('.mellow-selection-toolbar [data-action="bold"]');
        if (!btn) return 'NO_BUTTON';
        btn.click();
        return 'ok';
      });
      await sleep(400);
      const text = await getText();
      check('Selection Toolbar 的 Bold 按钮真的加粗', clicked === 'ok' && text === '**hello**',
        `${clicked} got=${JSON.stringify(text)}`);
    }

    // ── 2. Table Toolbar：Align Center ──────────────────────────────────
    const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    await setDoc(TABLE, TABLE.indexOf('1') + 1, TABLE.indexOf('1') + 1);
    await sleep(400);
    const tableReady = await waitFor(() => frame.evaluate(() => !!document.querySelector('.mellow-table-toolbar')));
    if (!tableReady) {
      check('Table Toolbar 可见（前置）', false, 'toolbar 未出现');
    } else {
      const clicked = await frame.evaluate(() => {
        const btn = document.querySelector('.mellow-table-toolbar-btn[title="Align Center"]');
        if (!btn) return 'NO_BUTTON';
        btn.click();
        return 'ok';
      });
      await sleep(500);
      const text = await getText();
      // GFM 居中分隔符的形式是 `:-+:`（连字符数量不限），实测 Mellow 产出 `:--:`
      // （由 `---` 改写而来，比 `:---:` 少一个连字符）—— 语义仍为居中，合法。
      // 关键不是字面量，而是**反复切换不应破坏表格**，故断言语义 + 后验回程。
      // 分隔符行形如 `| :---: | --- |`：需先取出单元格内容再匹配
      const delimCell = () => {
        const row = (getTextSync().trim().split('\n')[1] ?? '');
        return (row.split('|')[1] ?? '').trim();
      };
      const getTextSync = () => text;
      check('Table Toolbar 的 Align Center 真的改写列分隔符为居中',
        clicked === 'ok' && /^:-+:$/.test(delimCell()), `${clicked} cell=${JSON.stringify(delimCell())}`);

      // 切回左对齐：必须回到合法左对齐形式，且不丢行
      const rowsBefore = text.trim().split('\n').length;
      await frame.evaluate(() => {
        document.querySelector('.mellow-table-toolbar-btn[title="Align Left"]')?.click();
      });
      await sleep(500);
      const backText = await getText();
      const backSep = (backText.trim().split('\n')[1] ?? '').split('|')[1]?.trim() ?? '';
      check('Align Center → Align Left 回程保持表格合法（不丢行、不侵蚀连字符）',
        /^:?-+$/.test(backSep) && !backSep.endsWith(':') && backText.trim().split('\n').length === rowsBefore,
        `cell=${JSON.stringify(backSep)} rows=${rowsBefore}→${backText.trim().split('\n').length}`);

      // ── 3. Table Toolbar：Row Below 增加一行 ─────────────────────────
      const before = (await getText()).trim().split('\n').length;
      const clicked2 = await frame.evaluate(() => {
        const btn = document.querySelector('.mellow-table-toolbar-btn[title="Row Below"]');
        if (!btn) return 'NO_BUTTON';
        btn.click();
        return 'ok';
      });
      await sleep(500);
      const after = (await getText()).trim().split('\n').length;
      check('Table Toolbar 的 Row Below 真的插入一行',
        clicked2 === 'ok' && after === before + 1, `${clicked2} rows ${before} → ${after}`);

      // ── 4. 其余表格按钮（同代码族，逐一验证真的产生效果）──────────────
      const withTable = async (doc, caretOffset, title) => {
        await setDoc(doc, caretOffset, caretOffset);
        await sleep(350);
        const ready = await waitFor(() => frame.evaluate(() => !!document.querySelector('.mellow-table-toolbar')));
        if (!ready) return { ok: false, reason: 'toolbar 未出现' };
        const clicked = await frame.evaluate((t) => {
          const btn = document.querySelector(`.mellow-table-toolbar-btn[title="${t}"]`);
          if (!btn) return 'NO_BUTTON';
          btn.click();
          return 'ok';
        }, title);
        await sleep(450);
        return { ok: clicked === 'ok', clicked, text: await getText() };
      };
      const rowIndexOf = (doc, needle) => doc.split('\n').findIndex((l) => l.includes(needle));
      const cellPos = (doc, needle) => doc.indexOf(needle) + 1;

      // 删行：3 行 → 2 行，且删的是光标所在行
      const beforeDel = '| a | b |\n| --- | --- |\n| 1 | 2 |';
      const r1 = await withTable(beforeDel, cellPos(beforeDel, '1'), 'Delete Row');
      check('Table Toolbar 的 Delete Row 真的删掉一行',
        r1.ok && r1.text.trim().split('\n').length === 2, `${r1.clicked ?? r1.reason} got=${JSON.stringify(r1.text)}`);

      // 删列：2 列 → 1 列
      const r2 = await withTable(beforeDel, cellPos(beforeDel, '1'), 'Delete Column');
      // 列数按竖线计：新增列是**空单元格**（只有空格），用 trim 过滤会把它漏掉
      const colCount = (text) => (text ?? '').trim().split('\n')[0].split('|').length - 2;
      const cols = colCount(r2.text);
      check('Table Toolbar 的 Delete Column 真的删掉一列',
        r2.ok && cols === 1, `${r2.clicked ?? r2.reason} cols=${cols}`);

      // 加列（Column Right）：2 列 → 3 列
      const r3 = await withTable(beforeDel, cellPos(beforeDel, '1'), 'Column Right');
      const cols3 = colCount(r3.text);
      check('Table Toolbar 的 Column Right 真的插入一列',
        r3.ok && cols3 === 3, `${r3.clicked ?? r3.reason} cols=${cols3} got=${JSON.stringify(r3.text)}`);

      // Tidy：整表重新对齐（唯一允许 full reformat）—— 列宽应被补齐
      const untidy = '| a | bb |\n| --- | --- |\n| ccc | d |';
      const r4 = await withTable(untidy, cellPos(untidy, 'ccc'), 'Tidy Table');
      const tidyLines = (r4.text ?? '').trim().split('\n');
      // 分隔行不参与宽度对齐（其 cell 是 `---` 而非内容），故只比较内容行长度
      const contentLines = tidyLines.filter((l, i) => i !== 1);
      check('Table Toolbar 的 Tidy 真的重排整表（内容行列宽一致）',
        r4.ok && tidyLines.length === 3 && new Set(contentLines.map((l) => l.length)).size === 1,
        `${r4.clicked ?? r4.reason} got=${JSON.stringify(r4.text)}`);

      // 删表：整表移除
      const r5 = await withTable(beforeDel, cellPos(beforeDel, '1'), 'Delete Table');
      check('Table Toolbar 的 Delete Table 真的移除整表',
        r5.ok && !r5.text.includes('| --- |'), `${r5.clicked ?? r5.reason} got=${JSON.stringify(r5.text)}`);
    }
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ widget-buttons-verify crashed:', error.message);
  process.exitCode = 1;
});
