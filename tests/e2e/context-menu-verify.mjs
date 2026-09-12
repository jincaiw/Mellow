/**
 * 右键菜单运行时验证（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：此前上下文菜单只有**静态护栏**（verify-context-menu-parity / guard），
 * 没有运行时证据。考虑到本轮已两次遇到「结构在、功能死」（浮动工具栏不显示、
 * 表格对齐连字符侵蚀），右键菜单这种高频交互必须验到「点下去真生效」。
 *
 * 链路：engine `contextMenu.ts` → `window.__MELLOW_CONTEXT_MENU__(request)`
 *      → App 渲染 `.context-menu`（ContextMenu.tsx）。
 *
 * 覆盖：
 *   1. 编辑器内右键 → 菜单出现且有条目；
 *   2. 选中文本后右键 → 菜单含格式化项；
 *   3. 点击「加粗」→ 文档真的变成 `**hello**` 且菜单关闭。
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」；标签不确定时先 dump 再看。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/context-menu-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1442;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
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

    await frame.click('.cm-content');
    await setDoc('hello', 0, 5);
    await sleep(400);

    const xy = await posXY(2);
    await page.mouse.click(xy.x, xy.y, { button: 'right' });
    await sleep(700);

    const menuState = () => page.evaluate(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return { open: false, items: [] };
      const items = Array.from(menu.querySelectorAll('.context-menu-item-label'))
        .map((el) => el.textContent?.trim() ?? '');
      return { open: true, items };
    });

    const m1 = await menuState();
    check('编辑器内右键弹出菜单且有条目', m1.open && m1.items.length > 0,
      `items=${m1.items.length}`);
    if (m1.items.length > 0) console.log(`   [info] 菜单项: ${m1.items.slice(0, 12).join(' / ')}`);

    // 「加粗」不在一级菜单，而在 **格式** 子菜单内（一级为：剪切/复制/粘贴/段落/格式/复制为 Markdown/复制为纯文本）
    const formatIdx = m1.items.findIndex((l) => l.includes('格式') || /^format$/i.test(l));
    if (formatIdx === -1) {
      check('菜单含「格式」子菜单入口', false, `实际项=${JSON.stringify(m1.items)}`);
    } else {
      // 展开子菜单：Hover（ContextMenu 用 hover 打开子菜单）
      await page.evaluate((idx) => {
        const labels = Array.from(document.querySelectorAll('.context-menu .context-menu-item-label'));
        const target = labels[idx]?.closest('[role="menuitem"]') ?? labels[idx]?.parentElement;
        if (!target) return;
        for (const type of ['mouseover', 'mouseenter', 'mousemove']) {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        }
      }, formatIdx);
      await sleep(700);

      const sub = await page.evaluate(() => {
        const menu = document.querySelector('.context-menu-submenu');
        if (!menu) return { open: false, items: [] };
        return {
          open: true,
          items: Array.from(menu.querySelectorAll('.context-menu-item-label')).map((el) => el.textContent?.trim() ?? ''),
        };
      });
      check('「格式」子菜单可展开', sub.open && sub.items.length > 0, `items=${JSON.stringify(sub.items)}`);
      if (sub.items.length > 0) console.log(`   [info] 格式子菜单: ${sub.items.join(' / ')}`);

      const boldIdx = sub.items.findIndex((l) => l.includes('加粗') || /^bold$/i.test(l));
      if (boldIdx === -1) {
        check('子菜单含加粗项', false, `实际项=${JSON.stringify(sub.items)}`);
      } else {
        const clicked = await page.evaluate((idx) => {
          const menu = document.querySelector('.context-menu-submenu');
          const labels = Array.from(menu?.querySelectorAll('.context-menu-item-label') ?? []);
          const target = labels[idx]?.closest('[role="menuitem"]') ?? labels[idx]?.parentElement;
          if (!target) return false;
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }, boldIdx);
        await sleep(600);
        const text = await getText();
        check('右键菜单「格式 → 加粗」真的加粗文档', clicked && text === '**hello**', `got=${JSON.stringify(text)}`);

        const m2 = await menuState();
        check('执行后菜单关闭', !m2.open, `open=${m2.open}`);
      }
    }
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ context-menu-verify crashed:', error.message);
  process.exitCode = 1;
});
