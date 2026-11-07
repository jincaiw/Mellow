/**
 * G7-SIDE-11（2026-11-08）：搜索结果按文件分组折叠/展开 —— 运行时实证。
 *
 * 立此探针的原因：Typora 一手证据（`window/frame.js` 的 `.ty-search-item-collapse-icon`
 * click 切换 `.ty-search-item-collapse` / `.ty-search-item-expand`）表明**每个结果文件组
 * 独立可折叠**。§7.3 Search 行原写「advanced 折叠」系转述层失真（见审计 §4.360「六」12），
 * 核对后装配的是**分组折叠**（本探针），而非 option 按钮折叠（Typora 侧为
 * hover/search-active 显隐的 CSS 揭示，Mellow 恒显 = 形态差非缺口）。
 * 护栏（verify-sidebar-contract G7-SIDE-11 节）只能证明「代码里存在折叠集/图标/过滤」，
 * 证明不了「点图标后匹配行真的消失、组标题真的保留、键盘真的跳过折叠组」，故运行时实证：
 *
 *   A. 基线：两组结果、每组匹配行数与展开态一致
 *   B. 折叠第一组：该组匹配行消失、**组标题保留**（Typora collapse 同样保留文件行）、另一组不受影响
 *   C. 再展开：匹配行数回到基线（双向开关，非单向）
 *   D. 键盘同源：折叠态下 ArrowDown 序列只经过**可见**匹配（键盘序 = 渲染序，母题同 D-C/W3.2）
 *   E. 查询变化重置：改查询后折叠态不跨查询残留
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/search-group-collapse-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1461;
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

const waitFor = async (fn, timeoutMs = 8000, stepMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
};

/** 页面内合成 click（虚拟列表重渲染下 Playwright action 类不收敛，同 sidebar-golden 结论） */
const syntheticClick = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (el === null) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}, selector);

/** 采样：group 标题列表 + 每组可见匹配行数（按 DOM 顺序归组） */
const sampleGroups = (page) => page.evaluate(() => {
  const groups = [];
  let current = null;
  for (const el of document.querySelectorAll('.search-results .search-group-title, .search-results .search-match')) {
    if (el.classList.contains('search-group-title')) {
      current = { title: el.textContent.trim(), matches: 0, collapsed: el.classList.contains('collapsed') };
      groups.push(current);
    } else if (current !== null) {
      current.matches += 1;
    }
  }
  return groups;
});

async function runSearch(page, query) {
  await page.evaluate((q) => {
    const input = document.querySelector('.search-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await sleep(200);
  const runClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('aside.file-tree button'))
      .filter((b) => b.closest('.sidebar-mode-nav') === null);
    const target = buttons.find((b) => !b.disabled && ['搜索', 'Search'].includes(b.textContent.trim())) ?? null;
    if (target === null) return false;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!runClicked) throw new Error('search 运行按钮未找到');
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      // 种子阶段必须是 files/tree 模式（有 button.tree-row 可双击打开）；
      // search 模式在种子完成后经 .sidebar-search-btn 切入。
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });

    // 种子：mock fs 经应用内命令落盘（fileTree.newFile 建文件 → 打开 → 写正文 → 保存）。
    const { createWorkspaceEntry } = await import('../shared/in-app-dialog.mjs');
    // 两个文件各含 'Mellow' 3 行，但正文带**可区分标记**（alpha/beta）——
    // D 段要断言「键盘选中从不落在折叠组上」，内容相同则两个文件的选择不可区分（假通过风险）。
    const DOC_SEED = { 'a.md': 'Mellow alpha', 'b.md': 'Mellow beta' };
    for (const name of ['a.md', 'b.md']) {
      const ok = await createWorkspaceEntry(page, 'fileTree.newFile', name);
      if (!ok) throw new Error(`fileTree.newFile ${name} 未弹出应用内输入框`);
      await sleep(400);
      const opened = await waitFor(async () => {
        const clicked = await page.evaluate((n) => {
          const row = document.querySelector(`button.tree-row[title="/dir/${n}"]`);
          if (row === null) return false;
          row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          return true;
        }, name);
        if (!clicked) return false;
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ready = await f.evaluate(() => !!(window.editor?.dispatch || window.editor?.view?.dispatch)).catch(() => false);
            if (ready) return true;
          }
        }
        return false;
      });
      if (!opened) throw new Error(`${name} 打开后编辑器 iframe 未就绪`);
      const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
      await frame.evaluate((content) => {
        const view = window.editor?.dispatch ? window.editor : window.editor?.view;
        view.dispatch({ changes: { from: 0, insert: content } });
      }, `# Mellow Note ${DOC_SEED[name]}\n\nMellow appears here (${DOC_SEED[name]}).\nAnd Mellow appears again (${DOC_SEED[name]}).\n`);
      await sleep(300);
      await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
      await sleep(400);
    }

    // 进入 search 模式（mode 预设即 search；保险再点 🔍）
    if ((await page.evaluate(() => document.querySelector('.search-input'))) === null) {
      await syntheticClick(page, '.sidebar-search-btn');
    }
    await waitFor(async () => (await page.evaluate(() => document.querySelector('.search-input') !== null)));

    await runSearch(page, 'Mellow');
    const ready = await waitFor(async () => (await sampleGroups(page)).length >= 2);
    check('A0 搜索出结果（≥2 文件组）', ready, JSON.stringify(await sampleGroups(page)));
    // 正文含 'Mellow' 3 行（标题 + 两句正文）——断言用**动态基线**，不硬编码计数
    const baseline = await sampleGroups(page);
    check('A1 两组、每组匹配数 > 0、全部展开态', baseline.length === 2 && baseline.every((g) => g.matches > 0 && !g.collapsed), JSON.stringify(baseline));
    const n1 = baseline[0].matches;
    const n2 = baseline[1].matches;

    // B. 折叠第一组（点击其 .search-group-collapse）
    const collapsedOnce = await page.evaluate(() => {
      const icon = document.querySelector('.search-group-title .search-group-collapse');
      if (!icon) return false;
      icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    check('B1 折叠图标存在且可点击', collapsedOnce);
    const afterCollapse = await waitFor(async () => {
      const g = await sampleGroups(page);
      return g.length === 2 && g[0].matches === 0 && g[0].collapsed && g[1].matches === n2;
    }) ? await sampleGroups(page) : await sampleGroups(page);
    check('B2 折叠后：第一组匹配行消失、组标题保留（Typora collapse 语义）、另一组不受影响',
      afterCollapse.length === 2
        && afterCollapse[0].matches === 0 && afterCollapse[0].collapsed
        && afterCollapse[1].matches === n2 && !afterCollapse[1].collapsed,
      JSON.stringify(afterCollapse));

    // C. 再展开：回到基线
    await page.evaluate(() => {
      const icon = document.querySelector('.search-group-title .search-group-collapse');
      if (icon) icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const reExpanded = await waitFor(async () => {
      const g = await sampleGroups(page);
      return g.length === 2 && g[0].matches === n1 && g[1].matches === n2 && g.every((x) => !x.collapsed);
    });
    check('C 再展开：匹配行数回到基线（双向开关）', reExpanded, JSON.stringify(await sampleGroups(page)));

    // D. 键盘同源：折叠第一组后，ArrowDown 只经过可见匹配（序列 = 渲染序，母题同 D-C/W3.2）。
    // 判据 = 走「可见数 + 越界余量」次 ArrowDown，选中项文本恒含**未折叠组**标记、永不含折叠组标记
    // （种子内容带 alpha/beta 区分标记 —— 否则两组文本相同，「未落到折叠组」无法证伪）。
    await page.evaluate(() => {
      document.querySelector('.search-group-title .search-group-collapse')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await waitFor(async () => (await sampleGroups(page)).find((g) => g.collapsed) !== undefined);
    const snapBeforeD = await sampleGroups(page);
    const collapsedIdx = snapBeforeD.findIndex((g) => g.collapsed);
    const markerOf = (g) => (g.title.includes('a.md') ? 'alpha' : 'beta');
    const collapsedMarker = markerOf(snapBeforeD[collapsedIdx]);
    const keptMarker = markerOf(snapBeforeD[1 - collapsedIdx]);
    const visibleCount = snapBeforeD.filter((g) => !g.collapsed).reduce((n, g) => n + g.matches, 0);
    await page.evaluate(() => document.querySelector('aside.file-tree')?.focus());
    const selections = [];
    for (let i = 0; i < visibleCount + 2; i += 1) { // 走完整序列 + clamp 余量
      await page.evaluate(() => {
        document.querySelector('aside.file-tree')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      });
      await sleep(80);
      selections.push(await page.evaluate(() => document.querySelector('.search-match.selected')?.textContent ?? null));
    }
    const allInKept = selections.every((s) => s !== null && s.includes(keptMarker) && !s.includes(collapsedMarker));
    check(`D 键盘跳过折叠组（可见 ${visibleCount} 条，${selections.length} 次选中恒在未折叠组 ${keptMarker}、恒不含 ${collapsedMarker}）`,
      visibleCount === snapBeforeD[1 - collapsedIdx].matches && allInKept,
      JSON.stringify({ collapsedMarker, keptMarker, selections }));

    // E. 查询变化重置折叠态
    await runSearch(page, 'Mellow appears');
    const restReady = await waitFor(async () => {
      const g = await sampleGroups(page);
      return g.length > 0 && g.some((x) => x.matches > 0);
    }, 12000);
    const afterQuery = await sampleGroups(page);
    check('E 新查询后折叠态不残留（collapsed 全 false）',
      restReady && afterQuery.length > 0 && afterQuery.every((g) => !g.collapsed), JSON.stringify(afterQuery));

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    server.stop();
  }
}

main().catch((e) => { console.error('❌ 探针异常：', e); process.exitCode = 1; });
