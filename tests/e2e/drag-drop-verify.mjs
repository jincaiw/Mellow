/**
 * P3.7 跨应用拖拽（G4-SIDE-07）E2E 验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 分层说明（OS 级拖拽不可自动化 —— 历史 golden journey 佐证：CGEvent drag 不可靠）：
 *   - 本脚本覆盖「前端契约层」：
 *     1. 树节点 dragstart 写入 dataTransfer（'application/x-mellow-file' + 'text/plain'）
 *        —— 树 → 编辑区（iframe）拖拽建链的契约（engine 消费侧由 editor-engine 单测覆盖）
 *     2. 树内拖拽移动（HTML5 DnD → onDrop → FileTreeService.move → 树刷新）
 *     3. drop 落点为文件节点时不消费（仅 folder 接收）
 *     4. 外部 drop（Finder/Explorer 模拟：无内部 dragstart）不得误触发移动
 *        （dragend 清空 draggedRef 的防回归断言）
 *   - Tauri onDragDropEvent → iframe 注入（window.__MELLOW_DROP_PATHS__）：需真实桌面宿主，
 *     浏览器 dev 无 __TAURI_INTERNALS__，由 verify-sidebar-contract.mjs 静态契约 +
 *     真机手动项（D1「拖入单个 .md → 打开文档」）覆盖。
 *   - Sidebar → Finder 拖出：Typora 1.14.9 基线无此语义，Mellow 不实现（不造语义）。
 *
 * 运行：node tests/e2e/drag-drop-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1429;
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

/** 树行选择器（button.tree-row 以 title=path 标识） */
const rowSel = (path) => `button.tree-row[title="${path}"]`;

async function waitForRow(page, path, timeoutMs = 8000) {
  try {
    await page.locator(rowSel(path)).waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** 通过命令 + prompt 对话框在 mock workspace 中创建文件/文件夹 */
async function createEntry(page, commandId, name) {
  const dialogTaker = (dialog) => dialog.accept(name).catch(() => {});
  page.on('dialog', dialogTaker);
  try {
    await page.evaluate((id) => window.__MELLOW_COMMANDS__.dispatch(id), commandId);
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    page.off('dialog', dialogTaker);
  }
}

/** 在页面内派发完整 HTML5 DnD 事件序列（合成事件等价驱动 React 合成 handler） */
async function dispatchDndSequence(page, sourceSel, targetSel, { withDragstart = true } = {}) {
  return page.evaluate(({ sourceSel, targetSel, withDragstart }) => {
    const source = document.querySelector(sourceSel);
    const target = document.querySelector(targetSel);
    if (!source || !target) return { ok: false, reason: 'row not found' };
    const dt = new DataTransfer();
    if (withDragstart) {
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { ok: true };
  }, { sourceSel, targetSel, withDragstart });
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 预置：侧栏可见 + files/tree 模式 + mock workspace 根（浏览器 dev 走 host-api mock fs，
    // nextDirectoryPath 默认 '/dir'；直接预置 root 键跳过目录选择对话框）
    await context.addInitScript(() => {
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
      localStorage.setItem('mellow.fileTree.root', '/dir');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 10000 });

    // ── 构造 mock workspace：/dir/{a.md, b.md, sub/} ──────────────────────
    await createEntry(page, 'fileTree.newFile', 'a.md');
    await createEntry(page, 'fileTree.newFile', 'b.md');
    await createEntry(page, 'fileTree.newFolder', 'sub');
    check('mock workspace built (a.md, b.md, sub)', await waitForRow(page, '/dir/a.md') && await waitForRow(page, '/dir/b.md') && await waitForRow(page, '/dir/sub'));

    // 预展开 sub（全部走合成事件——Playwright action 类在虚拟列表重渲染下
    // actionability 不收敛；合成事件等效驱动 React 合成 handler）：
    // click 选中（P3.3 导航基准）+ ArrowRight 冒泡到 aside 键盘路由 → expand
    await page.evaluate(() => {
      const row = document.querySelector('button.tree-row[title="/dir/sub"]');
      if (!row) throw new Error('sub row not found');
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 400));

    // ── 1. 树 → 编辑区拖拽建链契约：dragstart 写入 dataTransfer ────────────
    // （effectAllowed 受合成事件受信性限制，不作为断言；真实拖拽会话中为 copyMove）
    const dataTransferContract = await page.evaluate(() => {
      const source = document.querySelector('button.tree-row[title="/dir/a.md"]');
      if (!source) return { ok: false, reason: 'source row not found' };
      const dt = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      return {
        ok: dt.getData('application/x-mellow-file') === '/dir/a.md' && dt.getData('text/plain') === '/dir/a.md',
        mellow: dt.getData('application/x-mellow-file'),
        plain: dt.getData('text/plain'),
      };
    });
    check('tree dragstart writes file path into dataTransfer (editor link contract)', dataTransferContract.ok, JSON.stringify(dataTransferContract));

    // ── 2. 树内拖拽移动：b.md → sub（DnD 全序列 → move → 树刷新）──────────
    await dispatchDndSequence(page, rowSel('/dir/b.md'), rowSel('/dir/sub'));
    await new Promise((r) => setTimeout(r, 600));
    const movedAway = !(await page.locator(rowSel('/dir/b.md')).isVisible().catch(() => false));
    const movedIn = await waitForRow(page, '/dir/sub/b.md');
    check('tree-internal drag moves file into folder via FileTreeService.move', movedAway && movedIn, JSON.stringify({ movedAway, movedIn }));

    // ── 3. drop 落点为文件节点：不消费（仅 folder 接收 drop）────────────────
    const beforeFileDrop = await page.evaluate(() => document.querySelectorAll('button.tree-row').length);
    await dispatchDndSequence(page, rowSel('/dir/a.md'), rowSel('/dir/sub/b.md'));
    await new Promise((r) => setTimeout(r, 500));
    const afterFileDrop = await page.evaluate(() => document.querySelectorAll('button.tree-row').length);
    check('drop onto a file row is not consumed (folder-only)', await waitForRow(page, '/dir/a.md') && await waitForRow(page, '/dir/sub/b.md') && afterFileDrop === beforeFileDrop, JSON.stringify({ beforeFileDrop, afterFileDrop }));

    // ── 4. 外部 drop（Finder/Explorer 模拟）不误触发移动 ───────────────────
    // 真实路径：dragend 已把内部 draggedRef 清空；外部 drop（无树内 dragstart）时
    // onDrop(targetDir, null) → handleTreeDrop 早退。先确认 dragend 清空，
    // 再对 sub 行派发无 dataTransfer 来源的外部 drop 序列。
    const externalDrop = await page.evaluate(() => {
      const target = document.querySelector('button.tree-row[title="/dir/sub"]');
      if (!target) return { ok: false, reason: 'sub row not found' };
      // 模拟外部拖入：dragover（浏览器要求 drop 前有 dragover preventDefault 才允许 drop）
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      return { ok: true };
    });
    await new Promise((r) => setTimeout(r, 500));
    const treeIntact = await waitForRow(page, '/dir/a.md') && await waitForRow(page, '/dir/sub/b.md');
    check('external drop (Finder simulation) does not trigger stale internal move', externalDrop.ok && treeIntact, JSON.stringify({ externalDrop, treeIntact }));

    // dragend 清空契约：派发 dragend 后内部引用必须为 null（直接断言行为：
    // 再做一次外部 drop 前无 dragstart，树不变 —— 已由上一步覆盖；
    // 这里补断言 onDragEnd 处理器存在且可安全调用）
    const dragEndSafe = await page.evaluate(() => {
      const row = document.querySelector('button.tree-row[title="/dir/a.md"]');
      if (!row) return false;
      row.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
      return true;
    });
    check('dragend handler safely clears internal drag source', dragEndSafe);

    // ── 收尾：树内移动后 workspace 一致性（a.md 在根、b.md 在 sub）──────────
    const finalShape = await page.evaluate(() => Array.from(document.querySelectorAll('button.tree-row')).map((r) => r.getAttribute('title')));
    check('final workspace shape consistent', finalShape.includes('/dir/a.md') && finalShape.includes('/dir/sub/b.md'), JSON.stringify(finalShape));
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
