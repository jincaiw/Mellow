/**
 * IME 合成链路验证（浏览器 dev 模式，Playwright Chromium + CDP Input.imeSetComposition）。
 *
 * 立脚本原因：P0-EDITOR-004（IME 与 Undo/Redo）此前只有 unit 证据 ——
 * packages/editor-engine/test/interaction-scope.test.ts 验证 Composition Guard 的
 * 状态机，但没有「真实合成事件穿过 CodeMirror DOMObserver」的运行时证据。
 * 常规路径 tests/benchmark/ime-matrix.mjs 依赖 System Events 向原生 App 发键，
 * 在本机被 TCC 拦截（osascript -10004 / -609），无法通过授权取得。
 *
 * 替代路径：CDP `Input.imeSetComposition` 直接驱动渲染进程的合成输入管线，
 * 产生真实的 compositionstart / compositionupdate / compositionend 与文本提交，
 * 不经过 GUI 自动化，因此不需要辅助功能授权。
 *
 * 证据边界（必须如实记录）：本脚本运行在 dev server + Chromium，覆盖的是
 * 「编辑器内核 + Mellow 扩展」的合成行为；原生 macOS 输入法面板/候选窗交互、
 * 以及 Tauri WKWebView 宿主行为不在覆盖范围内，仍需 System Events 授权后补。
 *
 * 验证点：
 *   1. 拼音中间态 → 提交：文本精确等于提交串（无丢字 / 无重复）
 *   2. 合成中不触发自动配对（autoCharacterPairs 的 isComposing 守卫）
 *   3. 合成中不重建装饰（Composition Guard：合成期间 marker 不闪烁/不误隐藏）
 *   4. 行内 marker 边界合成不破坏结构
 *   5. 撤销后无中文残留（IME corruption = 0）
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1431;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
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
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error('editor iframe not ready');
    })();

    await frame.click('.cm-content');
    await new Promise((r) => setTimeout(r, 200));

    // CDP 会话：Input.imeSetComposition 走渲染进程真实合成管线
    const cdp = await page.context().newCDPSession(page);

    const setDoc = (text, anchor, head) => frame.evaluate(([t, a, h]) => {
      window.editor.dispatch({
        changes: { from: 0, to: window.editor.state.doc.length, insert: t },
        selection: { anchor: a, head: h },
      });
    }, [text, anchor, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());

    /** 合成一段拼音中间态再提交，返回提交后的文档文本。 */
    const compose = async (stages, finalText) => {
      for (const [text, cursor] of stages) {
        await cdp.send('Input.imeSetComposition', {
          text,
          selectionStart: cursor ?? text.length,
          selectionEnd: cursor ?? text.length,
        });
        await new Promise((r) => setTimeout(r, 80));
      }
      await cdp.send('Input.insertText', { text: finalText });
      await new Promise((r) => setTimeout(r, 250));
      return getText();
    };

    // ── 1. 拼音中间态 → 提交（无丢字 / 无重复）─────────────────────────
    await setDoc('', 0, 0);
    let text = await compose(
      [['n', 1], ['ni', 2], ['ni h', 4], ['ni hao', 6]],
      '你好',
    );
    check('IME commit lands exactly once (no drop / no duplicate)', text === '你好', `got=${JSON.stringify(text)}`);

    // ── 2. 合成中不触发自动配对（autoCharacterPairs 的 isComposing 守卫）──
    // 输入左括号的拼音中间态不应产生成对的 `()`。
    await setDoc('', 0, 0);
    text = await compose([['k', 1], ['kuo', 3]], '（');
    check('auto pairing suppressed during composition', text === '（', `got=${JSON.stringify(text)}`);

    // ── 3. 合成中不重建装饰（Composition Guard）─────────────────────────
    // 在已有加粗行内合成（caret 位于 `ab` 之后 = 偏移 4）：合成期间 marker
    // 不得被吞掉或重排。
    await setDoc('**ab**', 4, 4);
    text = await compose([['z', 1], ['zh', 2], ['zhong', 5]], '中');
    check('composition inside inline markers preserves structure', text === '**ab中**', `got=${JSON.stringify(text)}`);

    // ── 4. 行首合成（块级 marker 边界）──────────────────────────────────
    await setDoc('- item', 2, 2);
    text = await compose([['x', 1], ['xin', 3]], '新');
    check('composition right after block marker keeps block intact', text === '- 新item', `got=${JSON.stringify(text)}`);

    // ── 5. 撤销 / 重做往返完整性（IME corruption = 0）────────────────────
    // 不假设「一次输入 = 一步撤销」（合成提交在 CodeMirror 里可拆成多步 history
    // event），改为「撤销到空 → 同次数重做必须逐字回到原状」。任何丢字、重复、
    // 残留都会让往返断言失败，这才是 corruption 的可判定形式。
    await setDoc('', 0, 0);
    await compose([['n', 1], ['ni', 2]], '你');
    await compose([['h', 1], ['hao', 3]], '好');
    const beforeUndo = await getText();

    let undoSteps = 0;
    while (undoSteps < 15 && (await getText()) !== '') {
      await page.keyboard.press('Meta+z');
      await new Promise((r) => setTimeout(r, 220));
      undoSteps += 1;
    }
    const afterUndo = await getText();
    check('undo reaches empty document (no CJK residue)', beforeUndo === '你好' && afterUndo === '', `before=${JSON.stringify(beforeUndo)} after=${JSON.stringify(afterUndo)} steps=${undoSteps}`);

    for (let i = 0; i < undoSteps; i += 1) {
      await page.keyboard.press('Meta+Shift+z');
      await new Promise((r) => setTimeout(r, 220));
    }
    const afterRedo = await getText();
    check('redo replays the same steps back to original', afterRedo === beforeUndo, `afterRedo=${JSON.stringify(afterRedo)} expected=${JSON.stringify(beforeUndo)} steps=${undoSteps}`);

    // ── 6. 表格 cell 内合成（§913「表格 cell IME」）───────────────────────
    // 表格 + 中文输入是经典 corruption 源：合成期间的 Live Table 重绘若误判 `|`
    // 边界，会撕裂列结构。此处验证合成后列结构完整、撤销可回到原表。
    const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const caretInCell = TABLE.indexOf('1') + 1; // 单元格 "1" 之后
    await setDoc(TABLE, caretInCell, caretInCell);
    await compose([['z', 1], ['zhong', 5]], '中');
    const tableText = await getText();
    const rows = tableText.trim().split('\n');
    const pipeCount = (s) => (s.match(/\|/g) ?? []).length;
    check('composition inside a table cell preserves table structure',
      rows.length === 3 && rows[0] === '| a | b |' && rows[2].includes('中') && pipeCount(rows[2]) === 3,
      JSON.stringify(tableText));

    // 撤销回到原表
    let tableUndoSteps = 0;
    while (tableUndoSteps < 15 && (await getText()) !== TABLE) {
      await page.keyboard.press('Meta+z');
      await new Promise((r) => setTimeout(r, 220));
      tableUndoSteps += 1;
    }
    check('undo restores the original table after cell composition',
      (await getText()) === TABLE, `steps=${tableUndoSteps} got=${JSON.stringify(await getText())}`);
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ ime-composition-verify crashed:', error.message);
  process.exitCode = 1;
});
