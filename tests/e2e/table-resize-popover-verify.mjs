/**
 * Resize Table 弹层（master-plan 任务 4.11 / spec §3b）—— 运行时验证。
 *
 * 此前只有 `planResizeTable` / `resizeTable` 的纯函数单测与工具栏装配的静态护栏；
 * master-plan 任务 4.11 自己登记了覆盖边界：「弹层视觉与真机交互无实测证据」。
 * 本脚本补上 **dev harness 层**（Playwright + 编辑器 iframe 内的真实 DOM 交互）。
 *
 * 覆盖：
 *   ① 光标进入表格后出现表格工具栏，**最左**按钮 =「调整」（title = Resize Table）；
 *   ② 点开后网格为 **6 列 × 10 行**（60 个单元格），数字输入 = 当前 **列 3 / 行 3**；
 *      高亮单元格 = 3×3 = 9 —— 证明「行」是**含表头的正文行数**（delimiter 不是行）；
 *   ③ hover 网格 r=2 / c=2 → 输入预填 2 / 2，高亮 4 格；
 *   ④ 点网格 r=2 / c=2 → 文档缩为 2 列 × 2 正文行（3 行文本，delimiter 在第 2 行）；
 *   ⑤ 数字输入路径：4 列 / 5 行 → 6 行文本且每行 4 格；
 *   ⑥ **单次 dispatch**：一次 Undo 精确还原到缩放前文本；
 *   ⑦ 再点「调整」→ 弹层关闭。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/table-resize-popover-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { startViteDevServer } from '../visual/dev-server.mjs';

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

/** 每行的单元格数（GFM：`| a | b |` → 2）。 */
const cellCount = (line) => line.split('|').length - 2;
const tableShape = (text) => {
  const lines = text.split('\n');
  return { lines: lines.length, cells: lines.map(cellCount), delimiterIndex: lines.findIndex((l) => /^\|(\s*:?-{2,}:?\s*\|)+$/.test(l)) };
};

async function main() {
  const port = await pickFreePort();
  const base = `http://localhost:${port}`;
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: port });
  const browser = await chromium.launch();
  try {
    const deadline0 = Date.now() + 40000;
    let up = false;
    while (Date.now() < deadline0 && !up) {
      try { up = (await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok; } catch { /* not yet */ }
      if (!up) await sleep(300);
    }
    if (!up) throw new Error('vite dev server 未就绪');

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    // 编辑器 iframe 面（先例 = edit-menu-4362-verify）
    const frame = await (async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ok = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
            if (ok) return f;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready');
    })();
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    // 就绪门：`window.editor` 已挂但 core 内部状态可能未初始化（getEditorText 抛 lineBreak）
    let readback = null;
    const deadlineText = Date.now() + 15000;
    while (Date.now() < deadlineText && readback === null) {
      readback = await getText().catch(() => null);
      if (readback === null) await sleep(200);
    }
    check('编辑器文档可读（getEditorText 就绪）', readback !== null, JSON.stringify(readback));

    // 3 列 × 3 正文行（表头 + 2 数据行）；光标放在第一个单元格内
    const ORIGINAL = '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |';
    const setDoc = (text, anchor) => frame.evaluate(([t, a]) => {
      window.editor.dispatch({
        changes: { from: 0, to: window.editor.state.doc.length, insert: t },
        selection: { anchor: a, head: a },
      });
    }, [text, anchor]);
    await setDoc(ORIGINAL, 4);
    await sleep(500);

    const toolbar = frame.locator('.mellow-table-toolbar');
    await toolbar.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    check('光标在表格内 → 表格工具栏可见', await toolbar.isVisible().catch(() => false));

    const buttons = toolbar.locator('.mellow-table-toolbar-btn');
    const first = await buttons.first().evaluate((b) => ({ text: b.textContent, title: b.title })).catch(() => null);
    check('最左按钮 =「调整」（title = Resize Table；Typora tooltip 最左图标）',
      first?.text === '调整' && first?.title === 'Resize Table', JSON.stringify(first));

    const popover = frame.locator('.mellow-table-resize-popover');
    const resizeBtn = buttons.first();
    const popState = () => frame.evaluate(() => {
      const p = document.querySelector('.mellow-table-resize-popover');
      if (p === null) return null;
      const inputs = [...p.querySelectorAll('.mellow-table-resize-popover-input')];
      return {
        visible: p.style.display !== 'none',
        cells: p.querySelectorAll('.mellow-table-resize-cell').length,
        activeCells: p.querySelectorAll('.mellow-table-resize-cell-active').length,
        gridCols: new Set([...p.querySelectorAll('.mellow-table-resize-cell')].map((c) => c.dataset.col)).size,
        gridRows: new Set([...p.querySelectorAll('.mellow-table-resize-cell')].map((c) => c.dataset.row)).size,
        values: inputs.map((i) => i.value),
        applyLabel: p.querySelector('.mellow-table-resize-popover-form .mellow-table-toolbar-btn')?.textContent ?? '',
      };
    });

    // ── ① 打开弹层：6×10 网格 + 当前尺寸 ────────────────────────────
    await resizeBtn.click();
    await sleep(300);
    const opened = await popState();
    check('弹层可见', opened?.visible === true, JSON.stringify(opened));
    check('网格 = 6 列 × 10 行（60 格；Typora md-grid-board 一手基线）',
      opened?.cells === 60 && opened?.gridCols === 6 && opened?.gridRows === 10, JSON.stringify({ cells: opened?.cells, cols: opened?.gridCols, rows: opened?.gridRows }));
    check('数字输入回显当前尺寸 列=3 / 行=3（行 = 含表头的正文行数）',
      JSON.stringify(opened?.values) === JSON.stringify(['3', '3']), JSON.stringify(opened?.values));
    check('高亮 = 当前 3×3 = 9 格', opened?.activeCells === 9, String(opened?.activeCells));
    check('应用按钮 =「应用」', opened?.applyLabel === '应用', JSON.stringify(opened?.applyLabel));

    // ── ② hover 预选（r=2, c=2）──────────────────────────────────
    const cell22 = frame.locator('.mellow-table-resize-cell[data-row="2"][data-col="2"]');
    await cell22.hover();
    await sleep(200);
    const hovered = await popState();
    check('hover r=2 / c=2 → 输入预填 2 / 2', JSON.stringify(hovered?.values) === JSON.stringify(['2', '2']), JSON.stringify(hovered?.values));
    check('hover r=2 / c=2 → 高亮 4 格', hovered?.activeCells === 4, String(hovered?.activeCells));

    // ── ③ 点网格 → 2 列 × 2 行，弹层关闭 ───────────────────────────
    await cell22.click();
    await sleep(400);
    const afterGridClick = await getText();
    const shapeGrid = tableShape(afterGridClick);
    check('点 2×2 后：3 行文本（2 正文行 + 1 delimiter）', shapeGrid.lines === 3, JSON.stringify({ text: afterGridClick, shape: shapeGrid }));
    check('点 2×2 后：每行 2 格，delimiter 在第 2 行', JSON.stringify(shapeGrid.cells) === JSON.stringify([2, 2, 2]) && shapeGrid.delimiterIndex === 1, JSON.stringify(shapeGrid));
    check('应用后弹层关闭', (await popState())?.visible === false, JSON.stringify(await popState()));

    // ── ④ Undo 一次 → 精确还原（单次 dispatch）────────────────────
    const beforeResize = ORIGINAL;
    await frame.evaluate(() => window.require('@codemirror/commands').undo(window.editor));
    await sleep(300);
    check('一次 Undo 精确还原到缩放前文本（证明单次 dispatch / 最小 patch）',
      (await getText()) === beforeResize, JSON.stringify(await getText()));

    // ── ⑤ 数字输入路径：4 列 / 5 行 ────────────────────────────────
    await resizeBtn.click();
    await sleep(300);
    const inputs = frame.locator('.mellow-table-resize-popover-input');
    await inputs.nth(0).fill('4');
    await inputs.nth(1).fill('5');
    await frame.locator('.mellow-table-resize-popover-form .mellow-table-toolbar-btn').click();
    await sleep(400);
    const afterInput = await getText();
    const shapeInput = tableShape(afterInput);
    check('数字输入 4 列 / 5 行 → 6 行文本（5 正文行 + 1 delimiter）', shapeInput.lines === 6, JSON.stringify(shapeInput));
    check('数字输入 4 列 / 5 行 → 每行 4 格', shapeInput.cells.every((n) => n === 4), JSON.stringify(shapeInput.cells));
    check('delimiter 行仍存在（永不删 delimiter）', shapeInput.delimiterIndex === 1, JSON.stringify(shapeInput));
    check('数字输入路径应用后弹层关闭', (await popState())?.visible === false, JSON.stringify(await popState()));

    // ── ⑥ 再点「调整」可关闭；且打开时高亮 = 4×5 = 20 ─────────────
    await resizeBtn.click();
    await sleep(300);
    const reopened = await popState();
    check('再次打开：输入回显 4 / 5、高亮 20 格（4×5）',
      JSON.stringify(reopened?.values) === JSON.stringify(['4', '5']) && reopened?.activeCells === 20, JSON.stringify(reopened));
    await resizeBtn.click();
    await sleep(300);
    check('再点「调整」关闭弹层（toggle 语义）', (await popState())?.visible === false, JSON.stringify(await popState()));
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
