/**
 * 文件列表摘要开关（§4.360「六」8，G7-SIDE/File List E 合同收口）。
 *
 * 立此探针的原因：Typora Articles 的「可选 summary」在本仓**两头早就支持、中间没有入口**
 * —— app-core/fileList.ts 的 readList 会算 summary、FileList.tsx 会渲染 `.file-list-summary`，
 * 但 App.tsx 把 includeSummary 写死 `{false}`，设置里无开关 ⇒ §7.3 E 合同
 * 「File List | title + filename（可选 modified / summary）」永远兑现不了摘要那一档。
 * 本轮装配 = schema(files.listSummary) → i18n → App state(启动恢复) → refreshFileList
 * 传参 + 专用 effect 重取 → applySetting case → 面板开关。链路横跨 5 层，护栏只能证明
 * 「代码里存在这些调用」，证明不了「勾上之后列表里真的出现摘要」，故运行时实证：
 *
 *   A. 默认关闭：Articles 视图无 `.file-list-summary` 节点（Typora 默认不显示摘要）
 *   B. 实时开启：设置面板勾选 → 无需重启/刷新，摘要立即出现且为正文首段纯文本
 *      （走 onChange → applySetting('settings.fileListSummary') → setFileListSummary
 *        → 专用 effect(ref 守卫) → refreshFileList 重取 的完整闭环）
 *   C. 落盘 + 启动恢复：storageKey 写 '1'/'0'（非 'true' 漂移）；受控 checkbox 不弹回；
 *      带预置 '1' 冷启动 ⇒ **不点任何开关**、仅数据刷新即出摘要（验证 settingById +
 *      readSetting 启动路径，非仅 live 路径；注：mock fs 按 context 独立，种子后才有数据）
 *   D. 再关闭：反向同样实时生效（不是单向开关）
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿（CM6 两步语义教训）。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/file-list-summary-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';
import { createWorkspaceEntry } from '../shared/in-app-dialog.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1455;
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

/** mock 工作区种子（同 sidebar-golden）：/dir/{a.md, notes.md}，标题 + 正文可区分 */
const DOCS = [
  { name: 'a.md', body: '# Alpha Doc\n\nAlpha body text.\n', summary: 'Alpha body text.' },
  { name: 'notes.md', body: '# Notes Title\n\nNotes first paragraph.\n', summary: 'Notes first paragraph.' },
];

async function seedWorkspace(page) {
  for (const doc of DOCS) {
    const ok = await createWorkspaceEntry(page, 'fileTree.newFile', doc.name);
    if (!ok) throw new Error('fileTree.newFile 未弹出应用内输入框（.confirm-modal-input）');
    await sleep(400);
    // newFile 不自动打开 ⇒ 先合成点击打开（同 sidebar-golden：Playwright action
    // 类在虚拟列表重渲染下不收敛，用页面内合成事件）。tree 模式 dblclick 树行；
    // fileList 模式单击 .file-list-item 即 onOpen（两种模式都试）。
    const opened = await waitFor(async () => page.evaluate((path) => {
      const row = document.querySelector(`button.tree-row[title="${path}"]`);
      if (row !== null) {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return true;
      }
      const item = document.querySelector(`button.file-list-item[title="${path}"]`);
      if (item !== null) {
        item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    }, `/dir/${doc.name}`));
    if (!opened) throw new Error(`tree-row /dir/${doc.name} 未出现（无法打开以写入正文）`);
    await sleep(400);
    const frame = page.frames().find((f) => f.url().includes('/editor/index.html'));
    if (!frame) throw new Error('editor iframe 未就绪（无法写入正文）');
    // ⚠️ 竞态实录（本探针首跑）：dblclick 打开是**异步加载**，写入若发生在加载完成前，
    // 随后加载会用空文档**覆盖**刚插入的正文 ⇒ 存盘成空文件（title 回落文件名）。
    // 判据 = 「连续两次读回都等于目标文本」再保存（写后 300ms 复查，被覆盖则重写）。
    const writeOnce = () => frame.evaluate((content) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!view?.dispatch) return false;
      if (window.webModules.core.getEditorText() !== content) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: { anchor: content.length } });
      }
      return window.webModules.core.getEditorText() === content;
    }, doc.body);
    const deadline = Date.now() + 15000;
    let stable = false;
    for (;;) {
      if (await writeOnce().catch(() => false)) {
        await sleep(300);
        if (await writeOnce().catch(() => false)) { stable = true; break; }
      }
      if (Date.now() > deadline) break;
      await sleep(300);
    }
    if (!stable) throw new Error(`${doc.name} 正文写入不稳定（异步加载竞态未收敛）`);
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.save'));
    await sleep(600);
  }
}

/** 打开 Articles（文档列表）视图并**强制重取**，返回本探针种子文档的摘要文本列表。
 *  ⚠️ 实录（本探针调试轮）：handleSave **不**刷新侧栏数据（App.tsx:4914 起全程无
 *  refreshFilesSidebar）⇒ 列表 title/summary 停在 newFile 后那次刷新（空文档 ⇒
 *  title 回落文件名）。视图切换本身也不重取（setSidebarMode 只写 state + localStorage）。
 *  判据要读磁盘最新内容必须显式走 `workspace.refresh`（execute = refreshFilesSidebar，
 *  App.tsx:5755）。Typora 同型（Articles 亦为刷新时重算），非缺陷。 */
async function openArticles(page, { refresh = true } = {}) {
  await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.sidebar.fileList'));
  if (refresh) await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('workspace.refresh'));
  const listed = await waitFor(() => page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll('.file-list-title')).map((n) => n.textContent);
    return titles.includes('Alpha Doc') && titles.includes('Notes Title');
  }, 15000));
  if (!listed) {
    const diag = await page.evaluate(() => ({
      titles: Array.from(document.querySelectorAll('.file-list-title')).map((n) => n.textContent),
      rows: Array.from(document.querySelectorAll('.file-list-item')).length,
      aside: document.querySelector('aside.file-tree')?.getAttribute('aria-label') ?? null,
    }));
    throw new Error(`Articles 列表未出现种子文档（Alpha Doc / Notes Title）。诊断：${JSON.stringify(diag)}`);
  }
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.file-list-item'));
    return items
      .filter((item) => /Alpha Doc|Notes Title/.test(item.querySelector('.file-list-title')?.textContent ?? ''))
      .map((item) => ({
        title: item.querySelector('.file-list-title')?.textContent ?? null,
        summary: item.querySelector('.file-list-summary')?.textContent ?? null,
      }));
  });
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');

    // ══ A/B/D：冷启动默认关闭 → 面板实时开 → 实时关 ══════════════════
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });
    await sleep(1200);

    await seedWorkspace(page);

    // A. 默认关闭：无摘要节点（Typora Articles 默认不显示摘要）
    const off = await openArticles(page);
    check('A 默认关闭：列表项无 .file-list-summary',
      off.length === 2 && off.every((r) => r.summary === null), JSON.stringify(off));

    // B. 经设置面板实时开启（onChange 写盘 + applySetting → state → effect → readList 全闭环）
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('settings.open'));
    await page.locator('.settings-body').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('.settings-nav-item'))
        .find((b) => /文件|Files/.test(b.textContent ?? ''));
      nav?.click();
    });
    await sleep(300);
    const rowFound = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.settings-row'));
      return rows.some((r) => r.querySelector('.settings-row-label')?.textContent === '在文件列表中显示摘要');
    });
    check('B1 设置面板出现「在文件列表中显示摘要」（i18n 键非裸键）', rowFound);
    const toggled = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.settings-row'));
      const row = rows.find((r) => r.querySelector('.settings-row-label')?.textContent === '在文件列表中显示摘要');
      const box = row?.querySelector('input[type="checkbox"]');
      if (!box) return false;
      box.click(); // 真实 click ⇒ 触发 React onChange（fill/set 不会）
      return true;
    });
    check('B2 开关可点击', toggled);
    // B3 判据**不得**带 workspace.refresh —— 否则「专用 effect 没装、仅靠下次刷新」
    // 也会被判绿（refresh 走的是刷新时闭包，同样读得到新 state）。这里以
    // refresh:false 纯采样：摘要出现 ⇔ 勾选那一刻的专用 effect 真的重取了列表。
    const liveOn = await waitFor(async () => (await openArticles(page, { refresh: false })).every((r) => r.summary !== null));
    const on = await openArticles(page, { refresh: false });
    check('B3 实时开启：勾选后未做任何刷新，摘要立即出现（专用 effect 闭环）',
      liveOn && on.length === 2
        && on.find((r) => r.title === 'Alpha Doc')?.summary === 'Alpha body text.'
        && on.find((r) => r.title === 'Notes Title')?.summary === 'Notes first paragraph.',
      JSON.stringify(on));

    // D. 再关闭：反向实时生效（非单向开关）
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.settings-row'));
      const row = rows.find((r) => r.querySelector('.settings-row-label')?.textContent === '在文件列表中显示摘要');
      row?.querySelector('input[type="checkbox"]')?.click();
    });
    const liveOff = await waitFor(async () => (await openArticles(page, { refresh: false })).every((r) => r.summary === null));
    const offAgain = await openArticles(page, { refresh: false });
    check('D 实时关闭：取消勾选后未做任何刷新，摘要立即消失（开关双向生效）',
      liveOff && offAgain.length === 2 && offAgain.every((r) => r.summary === null), JSON.stringify(offAgain));

    // C1. 落盘键与 schema 一致（关闭态 = '0'，非 'true'/'false' 漂移）
    const persisted = await page.evaluate(() => localStorage.getItem('mellow.file.listSummary'));
    check('C1 storageKey `mellow.file.listSummary` 落盘（关闭态 "0"）',
      persisted === '0', JSON.stringify(persisted));

    // 开启后重开面板：受控 checkbox 应跟随存储值（回弹母题回归防线）
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.settings-row'));
      const row = rows.find((r) => r.querySelector('.settings-row-label')?.textContent === '在文件列表中显示摘要');
      row?.querySelector('input[type="checkbox"]')?.click();
    });
    await sleep(400);
    const boxChecked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.settings-row'));
      const row = rows.find((r) => r.querySelector('.settings-row-label')?.textContent === '在文件列表中显示摘要');
      return row?.querySelector('input[type="checkbox"]')?.checked ?? null;
    });
    check('C2 开关重渲染不弹回（受控值跟随存储）', boxChecked === true, JSON.stringify(boxChecked));
    await context.close();

    // C3. 启动恢复：带预置 '1' 冷启动 ⇒ 首帧列表即含摘要（readSetting 启动路径）
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context2.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'fileList');
      localStorage.setItem('mellow.fileTree.root', '/dir');
      localStorage.setItem('mellow.file.listSummary', '1');
    });
    const page2 = await context2.newPage();
    await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page2.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 30000 });
    await sleep(1200);
    // 新 context 的 mock fs 是独立实例（空）⇒ 先种子；启动恢复判据 = 种子后**不碰开关**、
    // 仅经 refresh 取数，摘要即在（fileListSummary 启动 state 已从 '1' 读回 true）。
    await seedWorkspace(page2);
    await waitFor(async () => (await openArticles(page2)).every((r) => r.summary !== null));
    const restored = await openArticles(page2);
    check('C3 启动恢复：预置 "1" ⇒ 全程未点开关，仅数据刷新即出摘要（settingById + readSetting 启动路径）',
      restored.length === 2
        && restored.every((r) => typeof r.summary === 'string' && r.summary.length > 0),
      JSON.stringify(restored));
    await context2.close();
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error('❌ file-list-summary-verify crashed:', error.message);
  process.exitCode = 1;
});
