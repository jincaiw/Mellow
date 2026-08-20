/**
 * B1-3/B1-4/B1-5 快捷键链路验证（浏览器 dev 模式，Playwright Chromium）。
 * 全部走真实路径：点击编辑器聚焦 iframe → keydown → keyForwarder 同步桥 →
 * 父窗口 dispatchShortcut → findByShortcut（含别名）→ dispatchCommand → 引擎格式桥。
 *
 * 验证点：
 *   B1-3 段落块级：⌥⌘Q 引用 / ⌥⌘U 列表 / ⌥⌘O 有序列表 / ⌥⌘X 任务列表 /
 *                  ⌥⌘C 代码块 / ⌥⌘B 数学块（空行 caret 作用于当前行）
 *   B1-4 格式类：⌃` 行内代码 / ⌃⇧` 代码块别名 / ⌘\ 清除样式
 *   B1-5 查找替换：⌥⌘F 替换面板（主键）+ ⌘H 别名 + ⌘F 查找（回归）
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
    // ⌃` 行内代码（选区包裹）
    await setDoc('hello', 0, 5);
    await press('Control+`');
    check('⌃` wraps selection as inline code', (await getText()) === '`hello`', `got=${JSON.stringify(await getText())}`);

    // ⌃⇧` 删除线（Typora 格式菜单基准：删除线 [⌃⇧`]；B2 修正原 codeBlock 归属）
    await setDoc('hello', 0, 5);
    await press('Control+Shift+`');
    check('⌃⇧` wraps selection as strikethrough', (await getText()) === '~~hello~~', `got=${JSON.stringify(await getText())}`);

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

    // 关闭面板，恢复干净文档
    await press('Escape');
    await setDoc('', 0, 0);
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
