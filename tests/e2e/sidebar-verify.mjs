/**
 * B1-2 侧边栏模式快捷键验证（浏览器 dev 模式，Playwright Chromium）。
 * 验证点（V5-A1 Typora 对齐：⌃⌘1 大纲 / ⌃⌘3 文件树；⌃⌘2 文件列表已随 list 视图退役）：
 *   1. 侧栏关闭时 ⌃⌘1 → 打开侧栏并切到大纲（aria-label + localStorage）
 *   2. ⌃⌘2 不再绑定任何模式切换（保持大纲态，不向文档插字符）
 *   3. ⌃⌘3 → files + tree（文件树）
 *   4. 快捷键不向文档插入字面字符（回归防线）
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1424;
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 预置：侧栏关闭（验证「未开则打开」分支）
    await context.addInitScript(() => localStorage.setItem('mellow.sidebar.visible', '0'));
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const sidebarState = () => page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      return {
        visible: !!aside,
        label: aside?.getAttribute('aria-label') ?? null,
        mode: localStorage.getItem('mellow.sidebar.mode'),
        fileMode: localStorage.getItem('mellow.fileSidebar.mode'),
        sidebarFlag: localStorage.getItem('mellow.sidebar.visible'),
      };
    });

    // CommandRegistry 是菜单、快捷键、Palette 的共同入口。同一平台同一快捷键只能
    // 指向一个命令，否则原生菜单与 iframe keydown 会表现不确定。
    const shortcutConflicts = await page.evaluate(() => {
      const normalized = (value) => String(value).replace(/Command/g, 'Cmd').replace(/Control/g, 'Ctrl').replace(/Option/g, 'Alt').toUpperCase();
      const conflicts = [];
      for (const platform of ['mac', 'winLinux']) {
        const used = new Map();
        for (const command of window.__MELLOW_COMMANDS__.all()) {
          const shortcut = command.shortcut?.[platform];
          if (!shortcut) continue;
          const key = normalized(shortcut);
          const existing = used.get(key);
          if (existing) conflicts.push({ platform, shortcut: key, ids: [existing, command.id] });
          else used.set(key, command.id);
        }
      }
      return conflicts;
    });
    check('command shortcuts are unique per platform', shortcutConflicts.length === 0, JSON.stringify(shortcutConflicts));

    check('initial: sidebar closed', (await sidebarState()).visible === false);

    // P2 默认桌面壳：文档优先。状态栏、Sidebar 与 Tabbar 都不可常驻；
    // B1（SDI）：.tabbar 已从 DOM 删除 —— 断言恒为 null（不依赖任何设置项）；
    // 其余只验证首次默认，不影响用户在设置中显式开启后的持久化行为。
    const desktopDefaults = await page.evaluate(() => ({
      sidebar: !!document.querySelector('aside.file-tree'),
      statusBar: !!document.querySelector('.status-bar'),
      tabBar: !!document.querySelector('.tabbar'),
      statusBarVisible: localStorage.getItem('mellow.statusbar.visible'),
    }));
    check(
      'document-first defaults hide sidebar, status bar, and tab bar (B1 SDI: .tabbar absent)',
      !desktopDefaults.sidebar && !desktopDefaults.statusBar && !desktopDefaults.tabBar
        && desktopDefaults.statusBarVisible !== '1',
      JSON.stringify(desktopDefaults),
    );

    // 编辑器 iframe 文本基准（字符插入回归防线）
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
      return null;
    })();
    let textBefore = frame ? await (async () => {
      // 编辑器语言状态异步初始化（lineBreak 未就绪会抛错）——重试至稳定
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        try {
          return await frame.evaluate(() => window.webModules.core.getEditorText());
        } catch { await new Promise((r) => setTimeout(r, 300)); }
      }
      return null;
    })() : '';
    const writingWidthBefore = frame
      // V5（A1 全幅化后）：外层 iframe full-bleed，写作限宽在内层 .cm-content
      ? await frame.evaluate(() => document.querySelector('.cm-content')?.getBoundingClientRect().width ?? null)
      : null;

    // Source Mode 是纯呈现切换：快捷键必须透传到 iframe，且不得改写 Markdown。
    if (frame) {
      const sourceModeBefore = await frame.evaluate(() => {
        const view = window.editor;
        const text = '# Source Mode\n\nunchanged';
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
        return {
          text: window.webModules.core.getEditorText(),
          active: window.__MELLOW_SOURCE_API__?.isActive() ?? null,
          parentShortcutApi: typeof window.parent.__MELLOW_SHORTCUT_API__?.dispatch,
          sourceCommand: window.parent.__MELLOW_COMMANDS__?.all().find((command) => command.id === 'view.source.toggle')?.shortcut ?? null,
        };
      });
      const forwarded = await frame.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: '/', code: 'Slash', metaKey: true, bubbles: true, cancelable: true,
        });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      });
      await new Promise((r) => setTimeout(r, 200));
      const sourceModeOn = await frame.evaluate(() => ({
        text: window.webModules.core.getEditorText(),
        active: window.__MELLOW_SOURCE_API__?.isActive() ?? null,
      }));
      const forwardedBack = await frame.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: '/', code: 'Slash', metaKey: true, bubbles: true, cancelable: true,
        });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      });
      await new Promise((r) => setTimeout(r, 200));
      const sourceModeOff = await frame.evaluate(() => ({
        text: window.webModules.core.getEditorText(),
        active: window.__MELLOW_SOURCE_API__?.isActive() ?? null,
      }));
      check('Cmd+/ toggles Source Mode through desktop command bridge', forwarded && forwardedBack && sourceModeBefore.active === false && sourceModeOn.active === true && sourceModeOff.active === false, JSON.stringify({ forwarded, forwardedBack, sourceModeBefore, sourceModeOn, sourceModeOff }));
      check('Source Mode preserves exact Markdown text', sourceModeBefore.text === sourceModeOn.text && sourceModeOn.text === sourceModeOff.text, JSON.stringify({ sourceModeBefore, sourceModeOn, sourceModeOff }));
      textBefore = sourceModeOff.text;

      // Reader 与编辑器共用同一 Markdown 文本；切换往返不能改变内容或丢失编辑表面。
      const newDocumentOpened = await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('file.new'));
      await new Promise((r) => setTimeout(r, 200));
      const readerSource = await frame.evaluate(() => {
        const view = window.editor;
        const text = '# Reader Title\n\nReader body';
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });
        return window.webModules.core.getEditorText();
      });
      const readerOpened = await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('reader.open'));
      await page.locator('.mellow-reader-shell').waitFor({ state: 'visible', timeout: 5000 });
      const readerState = await page.evaluate(() => ({
        renderedTitle: document.querySelector('.mellow-reader h1')?.textContent ?? null,
        renderedBody: document.querySelector('.mellow-reader')?.textContent ?? null,
        editorHidden: Array.from(document.querySelectorAll('.editor-container > div'))
          .filter((element) => !element.classList.contains('mellow-reader-shell'))
          .some((element) => getComputedStyle(element).display === 'none'),
      }));
      const editorReopened = await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('reader.openInEditor'));
      await page.locator('.mellow-reader-shell').waitFor({ state: 'detached', timeout: 5000 });
      const readerRoundTrip = await frame.evaluate(() => window.webModules.core.getEditorText());
      check('Reader opens semantic rendering and hides the editing surface', newDocumentOpened && readerOpened && readerState.renderedTitle === 'Reader Title' && readerState.renderedBody?.includes('Reader body') && readerState.editorHidden, JSON.stringify({ newDocumentOpened, readerOpened, readerState }));
      check('Reader round trip preserves exact Markdown and returns to editor', editorReopened && readerSource === readerRoundTrip, JSON.stringify({ editorReopened, readerSource, readerRoundTrip }));
      textBefore = readerRoundTrip;
    } else {
      check('editor iframe ready for Source Mode check', false);
    }

    // 1. ⌃⌘1 → 大纲（侧栏未开则打开）
    await page.keyboard.press('Control+Meta+1');
    await new Promise((r) => setTimeout(r, 300));
    let s = await sidebarState();
    check('⌃⌘1 opens sidebar in outline mode', s.visible && s.label === '大纲' && s.mode === 'outline', JSON.stringify(s));
    const writingWidthWithSidebar = frame
      ? await frame.evaluate(() => document.querySelector('.cm-content')?.getBoundingClientRect().width ?? null)
      : null;
    check(
      'sidebar keeps writing width at supported desktop size',
      writingWidthBefore !== null && writingWidthWithSidebar === writingWidthBefore,
      JSON.stringify({ writingWidthBefore, writingWidthWithSidebar }),
    );

    // 2. ⌃⌘2 不再绑定（V5-A1：list 视图退役，模式保持大纲不变）
    await page.keyboard.press('Control+Meta+2');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘2 unbound (V5-A1: list retired, mode unchanged)', s.visible && s.label === '大纲' && s.mode === 'outline', JSON.stringify(s));

    // 3. ⌃⌘3 → 文件树
    await page.keyboard.press('Control+Meta+3');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘3 switches to file tree (V5-A1: single tree view)', s.visible && s.label === '文件树' && s.mode === 'files', JSON.stringify(s));

    // V5-A1（Typora 1.14.9 完全对齐）：单标签下拉切换；树/列表切换、固定/最近文件夹、
    // 过滤面板与根路径条全部移除；文件树仅树形。
    const filesDefault = await page.evaluate(() => {
      const aside = document.querySelector('aside.file-tree');
      return {
        // 触发器文案取 label span（整个 trigger 含 ▾ caret）
        trigger: aside?.querySelector('.sidebar-mode-trigger-label')?.textContent?.trim() ?? null,
        hasModeMenuHidden: aside?.querySelector('.sidebar-mode-menu') === null,
        hasAdvancedViewMode: !!aside?.querySelector('.sidebar-file-view-mode'),
        hasFolderHistory: !!aside?.querySelector('.sidebar-folder-history'),
        hasMoreButton: !!aside?.querySelector('.file-tree-filters-toggle'),
        hasRootPathBar: !!aside?.querySelector('.file-tree-root'),
        hasQuickbar: !!aside?.querySelector('.file-quickbar'),
      };
    });
    check('files default shows single mode trigger without legacy panels', filesDefault.trigger === '文件' && filesDefault.hasModeMenuHidden && !filesDefault.hasAdvancedViewMode && !filesDefault.hasFolderHistory && !filesDefault.hasMoreButton && !filesDefault.hasRootPathBar && filesDefault.hasQuickbar, JSON.stringify(filesDefault));

    // 模式下拉：展开后含 文件/大纲/搜索 三项
    await page.locator('.sidebar-mode-trigger').click();
    const menu = await page.evaluate(() => Array.from(document.querySelectorAll('.sidebar-mode-item')).map((element) => element.textContent?.trim()));
    check('mode dropdown lists files/outline/search', JSON.stringify(menu) === JSON.stringify(['文件', '大纲', '搜索']), JSON.stringify(menu));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 100));
    check('mode dropdown closes on Escape', await page.evaluate(() => document.querySelector('.sidebar-mode-menu') === null));

    // 4. 文档文本不被插入字面字符
    if (frame && typeof textBefore === 'string') {
      const textAfter = await frame.evaluate(() => window.webModules.core.getEditorText());
      check('sidebar shortcuts do not insert literal chars', textAfter === textBefore, `text=${JSON.stringify(textAfter.slice(0, 40))}`);
    } else {
      check('editor iframe ready for text check', false);
    }

    // 5. 侧栏开时 ⌃⌘1 仅切模式（仍可见）
    await page.keyboard.press('Control+Meta+1');
    await new Promise((r) => setTimeout(r, 300));
    s = await sidebarState();
    check('⌃⌘1 with sidebar open switches mode only', s.visible && s.label === '大纲', JSON.stringify(s));

    // §7.7：窄于正式最小宽度时暂时收起，不抹除用户已打开 Sidebar 的偏好；
    // 回到 ≥900px 后恢复，保证正文优先且不丢用户工作上下文。
    await page.setViewportSize({ width: 800, height: 700 });
    await new Promise((r) => setTimeout(r, 200));
    const narrow = await sidebarState();
    check('narrow window temporarily hides sidebar without clearing preference', !narrow.visible && narrow.sidebarFlag === '1', JSON.stringify(narrow));
    await page.setViewportSize({ width: 1280, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const restored = await sidebarState();
    check('sidebar restores after window returns to supported width', restored.visible && restored.label === '大纲' && restored.sidebarFlag === '1', JSON.stringify(restored));
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
