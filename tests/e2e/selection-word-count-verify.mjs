/**
 * G7-SHELL-11（2026-11-08）：选区字数 —— 运行时实证。
 *
 * Typora 一手证据（`appsrc/window/frame.js` WordCount）：
 *  - 页脚 label：`updateLabel` 有选区且 `0<sel<all`（**值门**）→ `sel / all Unit`；
 *    全选（sel==all）回落单值 —— 本探针 D/E 段用**同一选区**分别验证两个门；
 *  - 字数面板：`getTextInSelection().length>0`（**长度门**）→ 加 `ty-show-word-count-in-selection`
 *    → 四数字行显示 `-sel` 单元；全选时页脚单值而**面板仍成对**；
 *  - 打字/选区变化都会刷新（Typora 每 selectionUpdate 跑 quickUpdate）。
 * Mellow 此前：打字时页脚**根本不刷新**（refreshStats 只在 open/重载/面板开合跑 ——
 * 本轮连带修复，见 viewUpdate 的 contentEdited 分支），选区无从谈起。
 *
 * 探针检查：
 *   A. 基线：无选区 → 页脚单值形态
 *   B. 部分选区 → 页脚 `sel / all 字`（解析数字，断言 0<sel<all，防「只有格式没有数值」）
 *   C. 光标收回（collapsed）→ 回到单值
 *   D. **全选** → 页脚按值门回落单值（防把长度门错装到页脚）
 *   E. 同一全选下打开面板 → 面板按长度门**仍成对**（与 D 相反 ⇒ 两门各自独立成立）
 *   F. 打字刷新：无选区追加单词 → 页脚词数 +1（打字路径此前不刷新，本轮修复的回归锁）
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/selection-word-count-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';

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

const waitFor = async (fn, timeoutMs = 8000, stepMs = 150) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
};

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

/** 页脚字数项文本（`.statusbar-stats`；stats 为空时不渲染） */
const footerStats = (page) => page.evaluate(() => document.querySelector('.statusbar-stats')?.textContent ?? null);

/** 在编辑器 iframe 上设置主选区（UTF-16 偏移） */
async function setEditorSelection(page, anchor, head) {
  const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
  if (!frame) throw new Error('编辑器 iframe 未找到');
  await frame.evaluate(([a, h]) => {
    const view = window.editor?.dispatch ? window.editor : window.editor?.view;
    view.dispatch({ selection: { anchor: a, head: h } });
  }, [anchor, head]);
  await sleep(200); // React 重渲染（viewUpdate → refreshSelectionStats → stats 派生）
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.statusbar.visible', '1'); // 页脚必须可见才有判据面
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });

    // 种子：新建 doc.txt「hello brave world\n」→ 打开（3 词 / 0 字 / 2 行）
    const { createWorkspaceEntry } = await import('../shared/in-app-dialog.mjs');
    const NAME = 'wc-sel.md';
    const ok = await createWorkspaceEntry(page, 'fileTree.newFile', NAME);
    if (!ok) throw new Error('fileTree.newFile 未弹出应用内输入框');
    await sleep(400);
    const opened = await waitFor(async () => {
      const clicked = await page.evaluate((n) => {
        const row = document.querySelector(`button.tree-row[title="/dir/${n}"]`);
        if (row === null) return false;
        row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return true;
      }, NAME);
      if (!clicked) return false;
      const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
      if (!frame) return false;
      return frame.evaluate(() => !!(window.editor?.dispatch || window.editor?.view?.dispatch)).catch(() => false);
    });
    if (!opened) throw new Error('打开后编辑器 iframe 未就绪');
    const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
    await frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({ changes: { from: 0, insert: 'hello brave world\n' } });
    });
    await sleep(300);
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
    await sleep(400);

    // A. 基线：光标 collapsed ⇒ 页脚单值形态（无 ` / `）
    const baseText = await waitFor(async () => (await footerStats(page)) !== null) ? await footerStats(page) : null;
    check('A 基线：页脚字数存在且为单值形态',
      baseText !== null && !baseText.includes(' / ') && /3 词/.test(baseText), JSON.stringify(baseText));

    // B. 部分选区 [0,5)「hello」⇒ 页脚 `1 / 3 字` 后缀（解析数值防格式假通过）
    await setEditorSelection(page, 0, 5);
    const selText = await footerStats(page);
    const m = selText !== null ? /(\d+) \/ (\d+) 字/.exec(selText) : null;
    check('B 部分选区：页脚出现 sel / all 且 0<sel<all',
      m !== null && Number(m[1]) === 1 && Number(m[2]) === 3, JSON.stringify(selText));

    // C. 光标收回 ⇒ 回单值
    await setEditorSelection(page, 0, 0);
    const collapseText = await footerStats(page);
    check('C 收回选区：页脚回到单值形态', collapseText !== null && !collapseText.includes(' / '), JSON.stringify(collapseText));

    // D. **全选**（值门：sel==all）⇒ 页脚单值 —— Typora updateLabel 的 `0<e&&e<t`
    const docLen = await frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      return view.state.doc.length;
    });
    await setEditorSelection(page, 0, docLen);
    const allSelText = await footerStats(page);
    check('D 全选：页脚按**值门**回落单值（无 sel / all）', allSelText !== null && !allSelText.includes(' / '), JSON.stringify(allSelText));

    // E. 全选下打开面板 ⇒ 面板按**长度门**仍成对（与 D 相反，证明两门独立装配）
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.wordCount'));
    const panelReady = await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.word-count-window .file-info-row').length)) >= 7);
    const panelValues = await page.evaluate(() => Array.from(document.querySelectorAll('.word-count-window .file-info-row'))
      .map((r) => [r.querySelector('.file-info-label')?.textContent ?? '', r.querySelector('.file-info-value')?.textContent ?? '']));
    const pairRows = panelValues.filter(([, v]) => v.includes(' / '));
    const singleRows = panelValues.filter(([, v]) => !v.includes(' / '));
    check('E 全选下：面板四数字行按**长度门**成对显示（段/paragraphs/readingTime 恒单值）',
      panelReady && pairRows.length === 4 && singleRows.length === 3
        && pairRows.every(([, v]) => /^\d+ \/ \d+$/.test(v)), JSON.stringify(panelValues));
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.wordCount')); // 关面板
    await sleep(200);

    // F. 打字刷新回归：无选区末尾追加 "again" ⇒ 页脚词数 3→4
    //（此前打字根本不进 refreshStats —— 本行锁住这条修复）
    const beforeWords = /(\d+) 词/.exec(allSelText)?.[1] ?? null;
    await frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({ changes: { from: view.state.doc.length, insert: 'again' } });
    });
    const typedOk = await waitFor(async () => {
      const t = await footerStats(page);
      return t !== null && /4 词/.test(t);
    });
    const typedText = await footerStats(page);
    check(`F 打字即刷新：词数 ${beforeWords} → 4（页脚随 contentEdited 更新）`, typedOk, JSON.stringify(typedText));

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    server.stop();
  }
}

main().catch((e) => { console.error('❌ 探针异常：', e); process.exitCode = 1; });
