/**
 * 拼写建议列表的**端到端运行时验证**（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因（P0-EDITOR-005）：该项的 `blockedBy` 是 `runtime-verification-pending`，
 * 台账里写明的剩余缺口就是「**建议的端到端运行时行为**（右键真的弹出建议、点击真的替换）
 * 没有自动化测试覆盖」。此前只有**静态护栏**（`verify-context-menu-parity` 的契约模型
 * 允许携带 payload）与**引擎/Rust 单测** —— 而本项目反复出现的母题是
 * 「结构在、功能死」（§5.7 浮动工具栏、表格对齐连字符），故必须验到「点下去真生效」。
 *
 * 链路：右键（engine `posAtCoords` → `wordAt`）→ `window.__MELLOW_CONTEXT_MENU__(req)`
 *      → App 取 `createDesktopSpellcheckService().suggest(word)`（dev 走 `browserMockHost`
 *        内存词典，**确定性**：非词典词 → `[w+'s', w+'ed', w+'ing']`）
 *      → 建议**前插到菜单顶部** → 点击 → `run('edit.spelling.applySuggestion', payload)`
 *      → `applySpellingSuggestion` → 引擎 `replaceWordAtCursor`（**光标处词**，宿主不猜位置）。
 *
 * 覆盖（三个相位，各自独立可判定）：
 *   A. 右键文本 → 菜单顶部出现 3 条确定性建议；且「添加到字典」在场（同一 `spellcheckAvailableSync()` 门控）；
 *   B. 点击建议 → 文档**真的**被替换、菜单关闭；
 *   C. 反向：点「添加到字典」后再右键同一词 → **建议区消失**（证明 learn 真的写进了宿主词典，
 *      而不是「弹了个菜单什么也没做」）。只做 B 会放过「替换成功但 learn 是空开关」。
 *
 * 范围限制（如实声明）：dev 模式的词典是 **mock**，故本脚本**不能**证明
 * 「macOS `NSSpellChecker` 返回真实建议」—— 那一层由 Rust 单测（`spellcheck.rs`）覆盖，
 * 且仍需真机三平台证据。本脚本覆盖的是**应用侧**的端到端行为。
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不得直接改断言让它变绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/spellcheck-suggestions-verify.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1452;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WORD = 'hello';
// mock 的确定性建议（`packages/host-api/src/mock-host.ts`：非词典词 → [w+'s', w+'ed', w+'ing']）
const EXPECTED = [`${WORD}s`, `${WORD}ed`, `${WORD}ing`];
const LEARN_LABEL = /添加到字典|Learn Spelling/;

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

    // 可用性缓存由 App 启动时异步预取（`primeSpellcheckAvailability`）——
    // 未就绪时 `spellcheckAvailableSync()` 为 false，拼写区**不会**出现（设计如此：
    // 宁可不显示也不显示点了没反应的项）。故此处必须等它就绪，否则会把「还没预取到」
    // 误判成「功能缺失」。判据用**同一门控的另一处产物**：菜单里的「添加到字典」。
    await sleep(1200);

    const setDoc = (text, anchor = null, head = null) => frame.evaluate(([t, a, h]) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: t },
        ...(a === null ? {} : { selection: { anchor: a, head: h } }),
      });
    }, [text, anchor, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    /** iframe 内坐标 → 主页面坐标（coordsAtPos 给的是 iframe 视口内坐标） */
    const posXY = async (pos) => {
      const c = await frame.evaluate((p) => {
        const v = window.editor?.dispatch ? window.editor : window.editor?.view;
        const r = v.coordsAtPos(p);
        return r ? { x: r.left, y: r.top + 8 } : null;
      }, pos);
      if (c === null) return null;
      const box = await page.locator('iframe').first().boundingBox();
      return { x: box.x + c.x, y: box.y + c.y };
    };
    const menuState = () => page.evaluate(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return { open: false, items: [] };
      return {
        open: true,
        items: Array.from(menu.querySelectorAll('.context-menu-item-label')).map((el) => el.textContent?.trim() ?? ''),
      };
    });
    const clickItem = (predicateSrc) => page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const pred = new Function('label', `return (${src});`);
      const labels = Array.from(document.querySelectorAll('.context-menu .context-menu-item-label'));
      const idx = labels.findIndex((el) => pred(el.textContent?.trim() ?? ''));
      if (idx === -1) return false;
      const target = labels[idx]?.closest('[role="menuitem"]') ?? labels[idx]?.parentElement;
      if (!target) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }, predicateSrc);

    /** 打开文本右键菜单并返回菜单状态 */
    const openTextMenu = async () => {
      await frame.click('.cm-content');
      await setDoc(WORD, 0, WORD.length);
      await sleep(400);
      const xy = await posXY(2);
      if (xy === null) throw new Error('coordsAtPos 返回 null（编辑器未布局？）');
      await page.mouse.click(xy.x, xy.y, { button: 'right' });
      await sleep(900); // 建议是异步取回后**补入**的，必须等这一拍
      return menuState();
    };

    // ── 相位 A：右键 → 建议出现在菜单顶部 ────────────────────────────────
    const a = await openTextMenu();
    check('右键弹出上下文菜单', a.open && a.items.length > 0, `items=${a.items.length}`);
    if (a.items.length > 0) console.log(`   [info] 菜单项（前 8）: ${a.items.slice(0, 8).join(' / ')}`);
    check('菜单含「添加到字典」（同一可用性门控 → 证明拼写能力已就绪）',
      a.items.some((l) => LEARN_LABEL.test(l)), `items=${JSON.stringify(a.items.slice(0, 6))}`);
    const topThree = a.items.slice(0, 3);
    check(`建议出现在菜单**顶部**且内容确定（${EXPECTED.join(' / ')}）`,
      topThree.join('|') === EXPECTED.join('|'), `top3=${JSON.stringify(topThree)}`);

    // ── 相位 B：点击建议 → 文档真的被替换 ────────────────────────────────
    if (topThree.join('|') === EXPECTED.join('|')) {
      const clicked = await clickItem(`label === ${JSON.stringify(EXPECTED[0])}`);
      await sleep(700);
      const text = await getText();
      check('点击建议后文档**真的**被替换', clicked && text === EXPECTED[0], `clicked=${clicked} got=${JSON.stringify(text)}`);
      const b = await menuState();
      check('替换后菜单关闭', !b.open, `open=${b.open}`);
    } else {
      check('点击建议后文档真的被替换', false, '（前置断言失败，跳过）');
      check('替换后菜单关闭', false, '（前置断言失败，跳过）');
    }

    // ── 相位 C：反向 —— 「添加到字典」后建议消失（证明 learn 真的生效）────
    const c1 = await openTextMenu();
    const learnOk = c1.items.some((l) => LEARN_LABEL.test(l));
    if (learnOk) {
      await clickItem(`/${LEARN_LABEL.source}/.test(label)`);
      await sleep(700);
      const c2 = await openTextMenu();
      const stillHasSuggestion = EXPECTED.some((s) => c2.items.includes(s));
      check('「添加到字典」后同一词的**建议区消失**（learn 真的写进了宿主词典）',
        !stillHasSuggestion, `items=${JSON.stringify(c2.items.slice(0, 6))}`);
      check('「添加到字典」后菜单本身仍可弹出（不是把菜单弄坏了）', c2.open, `open=${c2.open}`);
    } else {
      check('「添加到字典」后同一词的建议区消失', false, '（前置：菜单未含「添加到字典」）');
      check('「添加到字典」后菜单本身仍可弹出', false, '（前置：菜单未含「添加到字典」）');
    }
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ spellcheck-suggestions-verify crashed:', error.message);
  process.exitCode = 1;
});
