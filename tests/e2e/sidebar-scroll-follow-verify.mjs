/**
 * 侧栏虚拟列表「选中项滚动跟随」运行时验证（2026-11-08）。
 *
 * 缺陷：VirtualRows 只按 scrollTop 计算渲染窗口。FileList / OutlineList / SearchResultsList
 * 用 `querySelector('.selected')?.scrollIntoView()`、FileTree 完全没有跟随 —— 选中目标
 * 离屏时该 DOM 未挂载，查询为空：**选中态变了，视口不动**。
 *
 * 本探针在独立 Chromium + Vite dev 的浏览器 mock 文件系统（不触碰用户文件/原生 App）里：
 *   A. File Tree：225 行，Home/End/连续 ArrowDown，目标挂载且矩形在 scroller 可视区内；
 *      过滤框 Home/End/Shift+Home/Shift+End 走原生光标与选区（真实键盘断言 selectionStart/End）
 *   B. File List：466 虚拟行（461 项 + 5 个分组标题），Home/End/连续 ArrowDown/PageDown，
 *      并锁定「逻辑项 → 虚拟行」映射（分组标题占行）；Articles 过滤框同 A 的原生选区断言
 *   C. Outline：220 headings，Home/End + 手动滚动不被选中跟随回拉 + 右键
 *      `Highlight Current Header`（nonce 重触发滚入离屏末 heading）
 *   D. Search：920 虚拟行（460 匹配文件 × 「组标题 + 匹配行」）；Home/End/ArrowDown +
 *      折叠首组后的映射重算；include/exclude 默认收起（PRD §17）、summary 键盘展开/收起、
 *      收起再展开保留值、展开后 160/270px 无横向溢出
 *   E. 每阶段 DOM 行数保持虚拟化上界（≤90），不随数据量增长
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：
 *   NODE_PATH=<playwright node_modules> MELLOW_TEST_CHROMIUM=<chrome> \
 *   node tests/e2e/sidebar-scroll-follow-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1475;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT_FILE_COUNT = 220;
const GROUP_COUNT = 4;
const GROUP_FILE_COUNT = 60;
const OUTLINE_HEADINGS = 220;
/** 文件树可见行：4 个文件夹 + 220 根文件 + outline.md */
const TREE_ROWS = GROUP_COUNT + ROOT_FILE_COUNT + 1;
/** 文件列表项：220 根文件 + outline.md + 4×60 分组文件；虚拟行再加 5 个组标题（含根分组「.」） */
const LIST_ITEMS = ROOT_FILE_COUNT + 1 + GROUP_COUNT * GROUP_FILE_COUNT;
const LIST_ROWS = LIST_ITEMS + (GROUP_COUNT + 1);
/** 搜索：结果按**文件**分组（PRD §17 file grouping）→ 每个匹配文件 = 组标题 + 1 条匹配。
 *  除 outline.md 外每文件恰有 1 行匹配 → 460 组 + 460 匹配 = 920 虚拟行。 */
const SEARCH_MATCHES = ROOT_FILE_COUNT + GROUP_COUNT * GROUP_FILE_COUNT;
const SEARCH_ROWS = SEARCH_MATCHES * 2;
/** 虚拟化上界：最坏 48px 行 + overscan 10×2，900px 视口远小于该值 */
const DOM_ROW_BOUND = 90;

let checks = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
  checks += 1;
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await sleep(250);
  }
  return false;
}

const waitFor = async (fn, timeoutMs = 8000, stepMs = 100) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
};

/** 合成 keydown 到侧栏（与应用内真实 onKeyDown 同源；物理键可能被编辑器 iframe 截走）。 */
const pressSidebar = (page, key) => page.evaluate((k) => {
  const aside = document.querySelector('aside.file-tree');
  if (aside === null) return false;
  aside.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));
  return true;
}, key);

/** 虚拟行总数（data-virtual-count，不依赖 DOM 行数）。 */
const virtualCount = (page, scrollerSel) => page.evaluate((sel) => {
  const value = document.querySelector(`${sel} .virtual-rows`)?.getAttribute('data-virtual-count');
  return value === null || value === undefined ? -1 : Number(value);
}, scrollerSel);

/** 当前挂载的虚拟行数（虚拟化上界断言）。 */
const mountedRows = (page, scrollerSel) => page.evaluate((sel) => (
  document.querySelectorAll(`${sel} [data-vrow]`).length
), scrollerSel);

/**
 * 选中目标状态：是否真实挂载在 [data-vrow] 内、虚拟行索引、矩形是否完整落在
 * scroller 可视区（1px 容差），以及 button title。
 */
const selectedState = (page, scrollerSel, selectedSel) => page.evaluate(([scroller, selected]) => {
  const scrollerEl = document.querySelector(scroller);
  if (scrollerEl === null) return { scroller: false };
  const el = document.querySelector(selected);
  if (el === null) return { scroller: true, mounted: false };
  const rowEl = el.closest('[data-vrow]');
  const scrollerRect = scrollerEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const top = scrollerRect.top + scrollerEl.clientTop;
  const bottom = top + scrollerEl.clientHeight;
  return {
    scroller: true,
    mounted: rowEl !== null,
    row: rowEl === null ? -1 : Number(rowEl.getAttribute('data-vrow')),
    inView: elRect.top >= top - 1 && elRect.bottom <= bottom + 1,
    top: elRect.top,
    bottom: elRect.bottom,
    viewTop: top,
    viewBottom: bottom,
    text: (el.textContent ?? '').trim().slice(0, 80),
    title: el.getAttribute('title'),
    scrollTop: scrollerEl.scrollTop,
  };
}, [scrollerSel, selectedSel]);

const waitForSelected = (page, scrollerSel, selectedSel, expectedRow, timeoutMs = 8000) => waitFor(async () => {
  const state = await selectedState(page, scrollerSel, selectedSel);
  if (state.scroller !== true || state.mounted !== true || state.inView !== true) return false;
  return expectedRow === undefined || expectedRow === null || state.row === expectedRow;
}, timeoutMs, 80);

const domBoundOk = async (page, scrollerSel, label) => {
  const rows = await mountedRows(page, scrollerSel);
  check(`${label}: DOM 行数保持虚拟化上界`, rows > 0 && rows <= DOM_ROW_BOUND, `mounted=${rows}`);
};

/** 等待编辑器 iframe 就绪且内容含指定片段（文档从 mock fs 打开需要时间）。 */
async function waitEditorText(page, needle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (!frame.url().includes('/editor/index.html')) continue;
      const ok = await frame.evaluate((text) => {
        const view = window.editor?.state ? window.editor : window.editor?.view;
        return !!view && String(view.state.doc).includes(text);
      }, needle).catch(() => false);
      if (ok) return frame;
    }
    await sleep(200);
  }
  return null;
}

async function verifyFilterCaret(page, selectedSelector, label) {
  await page.evaluate(() => document.querySelector('aside.file-tree')?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', metaKey: true, bubbles: true, cancelable: true }),
  ));
  const input = page.locator('.file-filter-input');
  await input.waitFor({ state: 'visible' });
  await input.fill('file');
  await page.waitForTimeout(1300); // 临时过滤框的首次焦点恢复窗口结束后验证真实按键。
  const selected = () => page.locator(selectedSelector).getAttribute('title');
  const before = await selected();
  const caret = () => input.evaluate((el) => [el.selectionStart, el.selectionEnd]);
  await input.evaluate((el) => { el.focus(); el.setSelectionRange(2, 2); });
  await input.press('Home');
  check(`${label} 输入框 Home 保留原生光标`, JSON.stringify(await caret()) === '[0,0]');
  await input.press('End');
  check(`${label} 输入框 End 保留原生光标`, JSON.stringify(await caret()) === '[4,4]');
  await input.press('Shift+Home');
  check(`${label} 输入框 Shift+Home 保留原生选区`, JSON.stringify(await caret()) === '[0,4]');
  await input.evaluate((el) => el.setSelectionRange(0, 0));
  await input.press('Shift+End');
  check(`${label} 输入框 Shift+End 保留原生选区`, JSON.stringify(await caret()) === '[0,4]');
  check(`${label} 输入框 Home/End 不改变列表选中项`, before !== null && await selected() === before);
  await input.press('Escape');
  await input.waitFor({ state: 'detached' });
}

async function seedWorkspace(page) {
  return page.evaluate(async ({ rootFiles, groups, groupFiles, headings }) => {
    // Vite dev 把 apps/desktop 作为根：动态 import 得到的与应用同一单例
    // （browserMockHost 是共享 mock 宿主，所有 browser service 复用）。
    const { browserMockHost } = await import('/src/host/browserMockHost.ts');
    for (let i = 0; i < rootFiles; i++) {
      const n = String(i).padStart(3, '0');
      await browserMockHost.fs.save(`/dir/file-${n}.md`, `# Root ${i}\n\nMellow root ${i}\n`);
    }
    for (let g = 1; g <= groups; g++) {
      for (let i = 0; i < groupFiles; i++) {
        const n = String(i).padStart(3, '0');
        await browserMockHost.fs.save(`/dir/group-${g}/match-${n}.md`, `# Group ${g} ${i}\n\nMellow grouped ${g}-${i}\n`);
      }
    }
    const outline = Array.from({ length: headings }, (_, i) => `# Heading ${String(i).padStart(3, '0')}`).join('\n\n');
    await browserMockHost.fs.save('/dir/outline.md', `${outline}\n\nbody\n`);
    return true;
  }, { rootFiles: ROOT_FILE_COUNT, groups: GROUP_COUNT, groupFiles: GROUP_FILE_COUNT, headings: OUTLINE_HEADINGS });
}

async function runSearch(page, query) {
  await page.evaluate((q) => {
    const input = document.querySelector('.search-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await sleep(200);
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside.file-tree button'))
      .filter((b) => b.closest('.sidebar-mode-nav') === null);
    const target = buttons.find((b) => !b.disabled && ['搜索', 'Search'].includes(b.textContent.trim())) ?? null;
    if (target === null) return false;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  let browser = null;
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    browser = await chromium.launch({ executablePath: process.env.MELLOW_TEST_CHROMIUM });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
      localStorage.setItem('mellow.locale', 'zh-CN');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });

    // ── 种子（浏览器 mock fs；不读写用户文件）──
    await seedWorkspace(page);
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('workspace.refresh'));
    const treeReady = await waitFor(async () => (await virtualCount(page, '.file-tree-list')) === TREE_ROWS, 10000);
    check('种子：文件树可见行数符合预期', treeReady, `count=${await virtualCount(page, '.file-tree-list')} expected=${TREE_ROWS}`);

    // ── A. File Tree：Home / End / 连续 ArrowDown ──
    await pressSidebar(page, 'Home');
    check('A1 File Tree Home：选中首行已挂载且在可视区', await waitForSelected(page, '.file-tree-list', '.tree-row.selected', 0), JSON.stringify(await selectedState(page, '.file-tree-list', '.tree-row.selected')));
    await domBoundOk(page, '.file-tree-list', 'A1');

    await pressSidebar(page, 'End');
    check('A2 File Tree End：选中末行（离屏目标）已挂载且在可视区', await waitForSelected(page, '.file-tree-list', '.tree-row.selected', TREE_ROWS - 1), JSON.stringify(await selectedState(page, '.file-tree-list', '.tree-row.selected')));
    await domBoundOk(page, '.file-tree-list', 'A2');

    await pressSidebar(page, 'Home');
    await waitForSelected(page, '.file-tree-list', '.tree-row.selected', 0);
    for (let i = 0; i < 40; i++) {
      await pressSidebar(page, 'ArrowDown');
      await sleep(35);
    }
    check('A3 File Tree 连续 ArrowDown 40 次跨视口：末目标已挂载且在可视区', await waitForSelected(page, '.file-tree-list', '.tree-row.selected', 40), JSON.stringify(await selectedState(page, '.file-tree-list', '.tree-row.selected')));
    await domBoundOk(page, '.file-tree-list', 'A3');
    await verifyFilterCaret(page, '.tree-row.selected', 'File Tree');

    // ── B. File List：Home / End / ArrowDown / PageDown + 分组行映射 ──
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.sidebar.fileList'));
    const listReady = await waitFor(async () => (await virtualCount(page, '.file-list')) === LIST_ROWS, 10000);
    check('B0 File List 虚拟行数含 5 个分组标题', listReady, `count=${await virtualCount(page, '.file-list')} expected=${LIST_ROWS}`);
    await domBoundOk(page, '.file-list', 'B0');

    await pressSidebar(page, 'Home');
    // 根分组「.」在前：组标题占 row 0，首个逻辑项 = row 1
    check('B1 File List Home：逻辑首项映射到 row 1（组标题占行）且可视', await waitForSelected(page, '.file-list', '.file-list-item.selected', 1), JSON.stringify(await selectedState(page, '.file-list', '.file-list-item.selected')));

    await pressSidebar(page, 'End');
    const listEnd = await waitForSelected(page, '.file-list', '.file-list-item.selected', LIST_ROWS - 1);
    const listEndState = await selectedState(page, '.file-list', '.file-list-item.selected');
    check('B2 File List End：末项映射到末虚拟行且可视', listEnd && String(listEndState.title).endsWith('/group-4/match-059.md'), JSON.stringify(listEndState));
    await domBoundOk(page, '.file-list', 'B2');

    await pressSidebar(page, 'Home');
    await waitForSelected(page, '.file-list', '.file-list-item.selected', 1);
    for (let i = 0; i < 70; i++) {
      await pressSidebar(page, 'ArrowDown');
      await sleep(25);
    }
    const listArrow = await selectedState(page, '.file-list', '.file-list-item.selected');
    check('B3 File List 连续 ArrowDown 70 次：目标已挂载且在可视区（row 71）', await waitForSelected(page, '.file-list', '.file-list-item.selected', 71) && String(listArrow.title).endsWith('/file-070.md'), JSON.stringify(listArrow));
    await domBoundOk(page, '.file-list', 'B3');

    await pressSidebar(page, 'Home');
    await waitForSelected(page, '.file-list', '.file-list-item.selected', 1);
    for (let i = 0; i < 12; i++) {
      await pressSidebar(page, 'PageDown');
      await sleep(45);
    }
    const listPageDown = await selectedState(page, '.file-list', '.file-list-item.selected');
    check('B4 File List PageDown×12：目标已挂载且在可视区（row 121）', await waitForSelected(page, '.file-list', '.file-list-item.selected', 121) && String(listPageDown.title).endsWith('/file-120.md'), JSON.stringify(listPageDown));
    await domBoundOk(page, '.file-list', 'B4');
    await verifyFilterCaret(page, '.file-list-item.selected', 'Articles');

    // ── C. 打开 outline.md（文件列表临时过滤，仅 mock fs）──
    await page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      aside?.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', metaKey: true, bubbles: true, cancelable: true }));
    });
    await page.locator('.file-filter-input').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => {
      const input = document.querySelector('.file-filter-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'outline');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const outlineRowReady = await waitFor(async () => (await page.evaluate(() => (
      Array.from(document.querySelectorAll('.file-list-item')).some((el) => el.getAttribute('title') === '/dir/outline.md')
    ))), 8000);
    check('C0 过滤后 outline.md 可在列表定位', outlineRowReady);
    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('.file-list-item')).find((el) => el.getAttribute('title') === '/dir/outline.md');
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const outlineFrame = await waitEditorText(page, 'Heading 219');
    check('C1 outline.md 已打开且包含 220 headings', outlineFrame !== null);

    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.sidebar.outline'));
    const outlineReady = await waitFor(async () => (await virtualCount(page, '.outline-list')) === OUTLINE_HEADINGS, 10000);
    check('C2 Outline 虚拟行数 = 220', outlineReady, `count=${await virtualCount(page, '.outline-list')}`);
    await domBoundOk(page, '.outline-list', 'C2');

    // ── D. Outline：Home / End + Highlight Current Header ──
    await pressSidebar(page, 'Home');
    check('D1 Outline Home：首行已挂载且在可视区', await waitForSelected(page, '.outline-list', '.outline-row.selected', 0), JSON.stringify(await selectedState(page, '.outline-list', '.outline-row.selected')));

    await pressSidebar(page, 'End');
    check('D2 Outline End：末 heading（离屏目标）已挂载且在可视区', await waitForSelected(page, '.outline-list', '.outline-row.selected', OUTLINE_HEADINGS - 1), JSON.stringify(await selectedState(page, '.outline-list', '.outline-row.selected')));
    await domBoundOk(page, '.outline-list', 'D2');

    // 点击末行 → 光标跳到最后 heading（currentOutlineId = 末项）
    await page.evaluate(() => {
      document.querySelector('.outline-row.selected')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(600);

    // 手动滚回顶部（不得被「选中跟随」回拉 —— 只有显式请求才滚动）
    await page.evaluate(() => {
      const scroller = document.querySelector('.outline-list');
      if (scroller !== null) scroller.scrollTop = 0;
    });
    const topVisible = await waitFor(async () => (await page.evaluate(() => !!document.querySelector('.outline-list [data-vrow="0"] .outline-row'))), 5000);
    const selectedAfterManualScroll = await selectedState(page, '.outline-list', '.outline-row.selected');
    check('D3 手动滚回顶部后不被选中跟随回拉（保留手动滚动行为）', topVisible && selectedAfterManualScroll.row !== OUTLINE_HEADINGS - 1, JSON.stringify(selectedAfterManualScroll));

    // 右键 → Highlight Current Header（选中项已经是末项，靠 highlightNonce 重新触发）
    await page.evaluate(() => {
      const row = document.querySelector('.outline-list [data-vrow="0"] .outline-row');
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 160 }));
    });
    await page.locator('.context-menu').waitFor({ state: 'visible', timeout: 5000 });
    const highlightClicked = await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll('.context-menu-item'))
        .find((el) => /定位当前标题|Highlight Current Header/.test(el.textContent ?? ''));
      if (target === undefined) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    check('D4 Outline 右键菜单存在 Highlight Current Header', highlightClicked);
    check('D5 Highlight Current Header：末 heading（离屏）被重新滚入视口并挂载', await waitForSelected(page, '.outline-list', '.outline-row.selected', OUTLINE_HEADINGS - 1, 10000), JSON.stringify(await selectedState(page, '.outline-list', '.outline-row.selected')));
    await domBoundOk(page, '.outline-list', 'D5');

    // ── E. Search：分组行映射（含折叠后重算）──
    await page.evaluate(() => {
      document.querySelector('.sidebar-search-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.locator('.search-input').first().waitFor({ state: 'visible', timeout: 5000 });
    const ran = await runSearch(page, 'Mellow');
    check('E0 搜索运行按钮可点击', ran);
    const searchReady = await waitFor(async () => (await virtualCount(page, '.search-results')) === SEARCH_ROWS, 15000);
    check('E1 Search 虚拟行数 = 每匹配文件「组标题 + 匹配行」×2', searchReady, `count=${await virtualCount(page, '.search-results')} expected=${SEARCH_ROWS}`);
    await domBoundOk(page, '.search-results', 'E1');

    const advanced = page.locator('.search-advanced');
    const summary = advanced.locator('summary');
    const include = advanced.locator('input').nth(0);
    const exclude = advanced.locator('input').nth(1);
    check('Search include/exclude 默认收起', !await include.isVisible() && !await exclude.isVisible());
    await summary.focus();
    await summary.press('Enter');
    check('Search 文件筛选支持键盘展开', await include.isVisible() && await exclude.isVisible());
    await include.fill('**/*.md');
    await exclude.fill('**/missing.md');
    await summary.focus();
    await summary.press('Space');
    check('Search 文件筛选支持键盘收起', !await include.isVisible() && !await exclude.isVisible());
    await summary.press('Enter');
    check('Search 收起再展开保留筛选值', await include.inputValue() === '**/*.md' && await exclude.inputValue() === '**/missing.md');
    for (const width of [160, 270]) {
      // 与 sidebar-resize-verify 共用事件路径：CDP 拖拽在此宿主会丢失 window mousemove。
      await page.evaluate((targetX) => {
        const grip = document.querySelector('.sidebar-resizer');
        const rect = grip.getBoundingClientRect();
        const fire = (target, type, x) => target.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: rect.y + 100, button: 0,
        }));
        fire(grip, 'mousedown', rect.x + rect.width / 2);
        fire(window, 'mousemove', targetX);
        fire(window, 'mouseup', targetX);
      }, width);
      await page.waitForFunction((w) => Math.abs(document.querySelector('aside.file-tree').getBoundingClientRect().width - w) <= 1, width);
      const layout = await page.locator('aside.file-tree').evaluate((el) => ({
        width: el.getBoundingClientRect().width, overflow: el.scrollWidth - el.clientWidth,
        fields: [...el.querySelectorAll('.search-advanced input')].map((input) => {
          const a = el.getBoundingClientRect(); const r = input.getBoundingClientRect();
          return r.left >= a.left && r.right <= a.right + 1;
        }),
      }));
      check(`Search 展开高级筛选在 ${width}px 无横向溢出`, Math.abs(layout.width - width) <= 1 && layout.overflow <= 1 && layout.fields.every(Boolean), JSON.stringify(layout));
    }
    await include.fill('');
    await exclude.fill('');
    await summary.click();

    await pressSidebar(page, 'Home');
    const searchHome = await waitForSelected(page, '.search-results', '.search-match.selected', 1);
    const searchHomeState = await selectedState(page, '.search-results', '.search-match.selected');
    check('E2 Search Home：首个匹配 = row 1（组标题占 row 0）且可视', searchHome && searchHomeState.text.includes('Mellow root 0'), JSON.stringify(searchHomeState));

    await pressSidebar(page, 'End');
    const searchEnd = await waitForSelected(page, '.search-results', '.search-match.selected', SEARCH_ROWS - 1);
    const searchEndState = await selectedState(page, '.search-results', '.search-match.selected');
    check('E3 Search End：末个匹配映射到末虚拟行且可视', searchEnd && searchEndState.text.includes('Mellow grouped 4-59'), JSON.stringify(searchEndState));
    await domBoundOk(page, '.search-results', 'E3');

    await pressSidebar(page, 'Home');
    await waitForSelected(page, '.search-results', '.search-match.selected', 1);
    for (let i = 0; i < 60; i++) {
      await pressSidebar(page, 'ArrowDown');
      await sleep(25);
    }
    const searchArrow = await selectedState(page, '.search-results', '.search-match.selected');
    // 每匹配前有 1 个文件组标题：逻辑匹配索引 n → 虚拟行 2n+1
    check('E4 Search 连续 ArrowDown 60 次：目标已挂载且在可视区（row 121）', await waitForSelected(page, '.search-results', '.search-match.selected', 121) && searchArrow.text.includes('Mellow root 60'), JSON.stringify(searchArrow));
    await domBoundOk(page, '.search-results', 'E4');

    // 折叠首个文件组：只隐藏其匹配行、组标题保留 → 可见匹配 -1 → Home 后首个匹配应在 row 2
    await page.evaluate(() => {
      const scroller = document.querySelector('.search-results');
      if (scroller !== null) scroller.scrollTop = 0;
    });
    await waitFor(async () => (await page.evaluate(() => !!document.querySelector('.search-results [data-vrow="0"] .search-group-collapse'))), 5000);
    const collapsed = await page.evaluate(() => {
      const icon = document.querySelector('.search-results [data-vrow="0"] .search-group-collapse');
      if (icon === null) return false;
      icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    const collapsedCount = await waitFor(async () => (await virtualCount(page, '.search-results')) === SEARCH_ROWS - 1, 8000);
    check('E5 折叠首个文件组：虚拟行数按可见匹配收缩、组标题保留', collapsed && collapsedCount, `collapsed=${collapsed} count=${await virtualCount(page, '.search-results')} expected=${SEARCH_ROWS - 1}`);

    await pressSidebar(page, 'Home');
    const searchCollapsedHome = await waitForSelected(page, '.search-results', '.search-match.selected', 2);
    const searchCollapsedState = await selectedState(page, '.search-results', '.search-match.selected');
    check('E6 折叠后 Home：首个可见匹配映射到 row 2（折叠组标题 + 下一组标题占行）且可视', searchCollapsedHome && searchCollapsedState.text.includes('Mellow root 1'), JSON.stringify(searchCollapsedState));
    await domBoundOk(page, '.search-results', 'E6');

    console.log(`\nSidebar scroll-follow runtime: ${checks} checks executed (Chromium; native host qualification separate)`);
  } finally {
    await browser?.close().catch(() => {});
    server.stop();
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
