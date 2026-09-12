/**
 * B1-3/B1-4/B1-5 快捷键链路验证（浏览器 dev 模式，Playwright Chromium）。
 * 全部走真实路径：点击编辑器聚焦 iframe → keydown → keyForwarder 同步桥 →
 * 父窗口 dispatchShortcut → findByShortcut（含别名）→ dispatchCommand → 引擎格式桥。
 *
 * 验证点：
 *   B1-3 段落块级：⌥⌘Q 引用 / ⌥⌘U 列表 / ⌥⌘O 有序列表 / ⌥⌘X 任务列表 /
 *                  ⌥⌘C 代码块 / ⌥⌘B 数学块（空行 caret 作用于当前行）
 *   B1-4 格式类：⌘⇧` 行内代码 / ⌃⇧` 删除线 / ⌘\ 清除样式
 *   B1-5 查找替换：⌥⌘F 替换面板（主键）+ ⌘F 查找（回归）
 *
 * 断言过期史（记录以免重蹈）：本文件原断言「⌃` 行内代码」。W1.9 已按 Typora 官方表
 * 将行内 Code 的 macOS 键位改为 ⌘⇧`（⌃⇧` 为删除线），实现是对的、断言是错的，
 * 长期呈现 1 项 ❌。键位真值现由 tests/parity/verify-menu-contract.mjs §11
 * 「官方快捷键表真值合同」锁定，本脚本只验证「键位能走到正确格式」。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1425;
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

    // 等编辑器 iframe 就绪
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

    // 点击编辑区：焦点进入 iframe（keyForwarder 真实路径）
    await frame.click('.cm-content');
    await new Promise((r) => setTimeout(r, 200));

    const setDoc = (text, anchor, head) => frame.evaluate(([t, a, h]) => {
      window.editor.dispatch({
        changes: { from: 0, to: window.editor.state.doc.length, insert: t },
        selection: { anchor: a, head: h },
      });
    }, [text, anchor, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    const press = async (combo) => { await page.keyboard.press(combo); await new Promise((r) => setTimeout(r, 350)); };

    // ── B1-3 段落块级快捷键（caret 在行内 → 作用于当前行）────────────
    const blockCases = [
      ['Meta+Alt+Q', '⌥⌘Q applies blockquote', '> hello'],
      ['Meta+Alt+U', '⌥⌘U applies bulleted list', '- hello'],
      ['Meta+Alt+O', '⌥⌘O applies ordered list', '1. hello'],
      ['Meta+Alt+X', '⌥⌘X applies task list', '- [ ] hello'],
      ['Meta+Alt+C', '⌥⌘C applies code fence', '```\nhello\n```'],
      ['Meta+Alt+B', '⌥⌘B applies math fence', '$$\nhello\n$$'],
    ];
    for (const [combo, name, expected] of blockCases) {
      await setDoc('hello', 5, 5);
      await press(combo);
      const text = await getText();
      check(name, text === expected, `got=${JSON.stringify(text)}`);
    }

    // ── B1-4 格式类快捷键 ────────────────────────────────────────────
    // ⌘⇧` 行内代码（选区包裹；Typora 官方表 Code = Command+Shift+`，W1.9 纠偏）
    await setDoc('hello', 0, 5);
    await press('Meta+Shift+`');
    check('⌘⇧` wraps selection as inline code', (await getText()) === '`hello`', `got=${JSON.stringify(await getText())}`);

    // ⌃⇧` 删除线（Typora 官方表 Strike = Control+Shift+`）
    await setDoc('hello', 0, 5);
    await press('Control+Shift+`');
    check('⌃⇧` wraps selection as strikethrough', (await getText()) === '~~hello~~', `got=${JSON.stringify(await getText())}`);

    // 反残留：⌃` 在官方表 macOS 下不绑定行内代码（否则意味着 W1.9 纠偏被回退）
    await setDoc('hello', 0, 5);
    await press('Control+`');
    check('⌃` must not wrap as inline code (W1.9 regression guard)', (await getText()) === 'hello', `got=${JSON.stringify(await getText())}`);

    // ⌘\ 清除样式（行内 marker + 链接剥除）
    await setDoc('**bold** and ~~strike~~', 0, 23);
    await press('Meta+\\');
    check('⌘\\ clears inline markers', (await getText()) === 'bold and strike', `got=${JSON.stringify(await getText())}`);

    // ── B1-5 查找替换 ────────────────────────────────────────────────
    const panelState = () => frame.evaluate(() => {
      const panel = document.querySelector('.cm-search');
      const replace = panel?.querySelector('input[name="replace"]');
      return {
        open: !!panel,
        replaceFocused: replace !== null && replace === document.activeElement,
      };
    });

    await setDoc('hello world', 11, 11);
    await press('Meta+Alt+F');
    let ps = await panelState();
    check('⌥⌘F opens replace panel focused on replace field', ps.open && ps.replaceFocused, JSON.stringify(ps));

    await press('Escape');
    await press('Meta+H');
    ps = await panelState();
    check('⌘H alias opens replace panel', ps.open && ps.replaceFocused, JSON.stringify(ps));

    await press('Escape');
    await press('Meta+F');
    ps = await panelState();
    check('⌘F opens find panel (regression)', ps.open, JSON.stringify(ps));

    // 面板功能性：输入查找词 + 替换词 → 全部替换 → 文档更新（按钮接线验证）
    await frame.evaluate(() => {
      const panel = document.querySelector('.cm-search');
      const find = panel?.querySelector('input[name="search"]');
      const replace = panel?.querySelector('input[name="replace"]');
      if (find instanceof HTMLInputElement && replace instanceof HTMLInputElement) {
        find.value = 'hello';
        find.dispatchEvent(new Event('input', { bubbles: true }));
        replace.value = 'hi';
        replace.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 100));

    // 高亮激活验证（面板打开期间 cm-searchMatch 存在；需在 replaceAll 前查）
    const highlightCount = await frame.evaluate(() => document.querySelectorAll('.cm-searchMatch').length);
    check('search matches highlighted while panel open', highlightCount > 0, `matches=${highlightCount}`);

    await frame.evaluate(() => {
      document.querySelector('.cm-search button[name="replaceAll"]')?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    check('replaceAll via panel updates document', (await getText()) === 'hi world', `got=${JSON.stringify(await getText())}`);

    // ── G7-KEY-07：Find Next 别名（官方表 F3 / Enter）───────────────────
    // 官方 Typora：Find Next = `F3` / `Enter`（Win/Linux）、`Cmd+G` / `Enter`（macOS）。
    // Mellow：主绑定 `Cmd+G`；`F3` / `Shift+F3` 别名已在两平台注册（App.tsx:4477-4478）；
    // `Enter` 由 CM 查找面板在输入框聚焦时接管。此处验证「Enter 与 F3 都能推进到下一个匹配」。
    await press('Escape');
    await setDoc('alpha beta alpha', 0, 0);
    await press('Meta+F');
    await frame.evaluate(() => {
      const find = document.querySelector('.cm-search input[name="search"]');
      if (find instanceof HTMLInputElement) {
        find.value = 'alpha';
        find.dispatchEvent(new Event('input', { bubbles: true }));
        find.focus();
      }
    });
    await new Promise((r) => setTimeout(r, 250));
    const selPos = () => frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      const s = v.state.selection.main;
      return { from: s.from, to: s.to, text: v.state.sliceDoc(s.from, s.to) };
    });
    const at = (p) => `${p.from}-${p.to}`;
    const p0 = await selPos();
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
    const p1 = await selPos();
    // Enter 由 CM 查找面板接管（输入框聚焦时）：无选区 → 首个匹配
    check('Enter in find panel selects next match (G7-KEY-07)',
      p1.text === 'alpha' && at(p1) !== at(p0), `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
    const p2 = await selPos();
    check('Enter again advances to the following match (G7-KEY-07)',
      p2.text === 'alpha' && at(p2) !== at(p1), `${JSON.stringify(p1)} → ${JSON.stringify(p2)}`);
    // F3：把焦点交回编辑区后再按（dev 环境没有原生菜单 accelerator 通道，
    // 查找输入框聚焦时按键不会经 keymap 分发；真机由菜单快捷键分发，此处不作断言）。
    await frame.click('.cm-content');
    await new Promise((r) => setTimeout(r, 250));
    await press('F3');
    const p3 = await selPos();
    check('F3 alias advances to another match with editor focused (G7-KEY-07)',
      p3.text === 'alpha' && at(p3) !== at(p2), `${JSON.stringify(p2)} → ${JSON.stringify(p3)}`);

    // 关闭面板，恢复干净文档
    await press('Escape');
    await setDoc('', 0, 0);
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
