/**
 * 方案「已完成」项的第二批运行时审计（浏览器 dev 模式，Playwright Chromium）。
 *
 * 动机同 `claimed-fixes-verify.mjs`：本轮已多次遇到「代码在、功能不工作」。
 * 本文件专审 §5.4 / §5.6 / §5.7 中标「已修复」但**从未运行时验证**的项：
 *   1. G7-SIDE-02 侧栏底部文件夹操作条（`SidebarFooter`）真的渲染
 *   2. G7-SIDE-02 底部菜单真的能弹出（刷新 / 打开文件夹 / 排序 / 最近文件夹）
 *   3. G7-SIDE-05 排序子菜单真的含 Typora 的 5 组 + 升降序
 *   4. G7-SIDE-04 「展开全部 / 折叠全部」条目真的可达
 *   5. §5.6 Search 非法正则**就地提示**（此前被静默吞成「无结果」）
 *   6. G7-FEAT-05 `theme.getThemes` 命令已注册
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不直接改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/remaining-claims-verify.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1449;
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

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    // 预置 mock 工作区根 + 侧栏可见 + files 模式（SidebarFooter 仅在 Files 模式渲染）
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.fileTree.root', '/dir');
      localStorage.setItem('mellow.sidebar.visible', '1');
      localStorage.setItem('mellow.sidebar.mode', 'files');
      localStorage.setItem('mellow.fileSidebar.mode', 'tree');
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('aside.file-tree').waitFor({ state: 'visible', timeout: 15000 });
    await sleep(600);

    // ── 1. 侧栏底部操作条真的渲染 ──────────────────────────────────────
    const footer = await page.evaluate(() => {
      const el = document.querySelector('.sidebar-footer');
      if (el === null) return { present: false };
      const r = el.getBoundingClientRect();
      return {
        present: true,
        w: Math.round(r.width),
        h: Math.round(r.height),
        name: document.querySelector('.sidebar-footer-name')?.textContent?.trim() ?? null,
        hasCaret: document.querySelector('.sidebar-footer-caret') !== null,
      };
    });
    check('G7-SIDE-02 侧栏底部操作条已渲染且可见',
      footer.present && footer.w > 0 && footer.h > 0, JSON.stringify(footer));
    check('G7-SIDE-02 底部操作条显示当前文件夹名',
      footer.name !== null && footer.name.length > 0, `name=${JSON.stringify(footer.name)}`);

    // ── 2. 底部菜单可弹出 ──────────────────────────────────────────────
    await page.evaluate(() => {
      document.querySelector('.sidebar-footer')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(700);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('.context-menu');
      if (m === null) return { open: false, items: [] };
      return {
        open: true,
        items: Array.from(m.querySelectorAll('.context-menu-item-label')).map((el) => el.textContent?.trim() ?? ''),
      };
    });
    check('G7-SIDE-02 底部菜单可弹出', menu.open && menu.items.length > 0, `items=${JSON.stringify(menu.items)}`);

    // ── 3. 排序子菜单含 Typora 5 组 + 升降序 ───────────────────────────
    const sortIdx = menu.items.findIndex((l) => l.includes('排序') || /^sort/i.test(l));
    if (sortIdx === -1) {
      check('G7-SIDE-05 底部菜单含「排序」入口', false, `实际项=${JSON.stringify(menu.items)}`);
    } else {
      await page.evaluate((idx) => {
        const labels = Array.from(document.querySelectorAll('.context-menu .context-menu-item-label'));
        const target = labels[idx]?.closest('[role="menuitem"]') ?? labels[idx]?.parentElement;
        if (!target) return;
        for (const type of ['mouseover', 'mouseenter', 'mousemove']) {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        }
      }, sortIdx);
      await sleep(700);
      const sub = await page.evaluate(() => {
        const m = document.querySelector('.context-menu-submenu');
        if (m === null) return { open: false, items: [] };
        return { open: true, items: Array.from(m.querySelectorAll('.context-menu-item-label')).map((el) => el.textContent?.trim() ?? '') };
      });
      check('G7-SIDE-05 排序子菜单可展开', sub.open, `items=${JSON.stringify(sub.items)}`);
      // Typora 5 组：文件夹分组 / 自然 / 名称 / 修改时间 / 创建时间
      const groups = ['文件夹', '自然', '名称', '修改时间', '创建时间'];
      const hit = groups.filter((g) => sub.items.some((l) => l.includes(g)));
      check('G7-SIDE-05 排序含 Typora 5 组', hit.length === 5, `命中=${JSON.stringify(hit)} items=${JSON.stringify(sub.items)}`);
      const hasAsc = sub.items.some((l) => l.includes('升序'));
      const hasDesc = sub.items.some((l) => l.includes('降序'));
      check('G7-SIDE-05 排序含升序 / 降序', hasAsc && hasDesc, `升序=${hasAsc} 降序=${hasDesc}`);
    }
    await page.keyboard.press('Escape');
    await sleep(300);

    // ── 4. 「展开全部 / 折叠全部」条目可达 ──────────────────────────────
    await page.evaluate(() => {
      document.querySelector('.sidebar-footer')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(700);
    const menu2 = await page.evaluate(() => Array.from(document.querySelectorAll('.context-menu .context-menu-item-label')).map((el) => el.textContent?.trim() ?? ''));
    check('G7-SIDE-04 底部菜单含「展开全部 / 折叠全部」',
      menu2.some((l) => l.includes('展开')) && menu2.some((l) => l.includes('折叠')), `items=${JSON.stringify(menu2)}`);
    await page.keyboard.press('Escape');
    await sleep(300);

    // ── 5. Search 非法正则就地提示（§5.6）───────────────────────────────
    // 打开全局搜索 → 开启正则 → 输入非法模式，应出现 .search-regex-invalid 而非静默「无结果」
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('search.global'));
    await sleep(800);
    const searchReady = await page.evaluate(() => document.querySelector('.search-panel') !== null);
    if (!searchReady) {
      check('§5.6 全局搜索面板可打开（前置）', false, '.search-panel 未出现');
    } else {
      // 正则开关是 `.search-toggles` 内 label 包裹的 checkbox（不是 button）。
      // React 受控组件必须用原生 setter + 原生事件，直接改 .checked / .value 不会更新 state。
      const regexToggled = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('.search-panel .search-toggles input[type="checkbox"]'));
        // 开关文案实际是 `Aa` / `全词` / `.*`（不是「正则」）—— 以 `.*` 为锚点
        const re = boxes.find((b) => /\.\*/.test(b.parentElement?.textContent ?? ''));
        if (!(re instanceof HTMLInputElement)) return false;
        // React 对 checkbox/radio 的 onChange 由 **click** 事件触发（ChangeEventPlugin
        // 对 checkbox 走 click 而非 change）—— 派发 change 不会更新 state。
        re.click();
        return re.checked === true;
      });
      await sleep(400);
      const typed = await page.evaluate(() => {
        const input = document.querySelector('.search-panel .search-input');
        if (!(input instanceof HTMLInputElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, '[');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      await sleep(600);
      const invalidHint = await page.evaluate(() => document.querySelector('.search-regex-invalid') !== null);
      check('§5.6 非法正则就地提示出现（非静默「无结果」）',
        typed && invalidHint, `regexToggled=${regexToggled} typed=${typed} hint=${invalidHint}`);
    }

    // ── 6. theme.getThemes 命令已注册 ──────────────────────────────────
    const themesRegistered = await page.evaluate(() => {
      const reg = window.__MELLOW_COMMANDS__;
      if (reg === undefined) return 'NO_REGISTRY';
      if (typeof reg.has === 'function') return reg.has('theme.getThemes');
      // 退化：尝试派发，不抛错即视为已注册
      try { reg.dispatch('theme.getThemes'); return true; } catch { return false; }
    });
    check('G7-FEAT-05 `theme.getThemes` 命令已注册', themesRegistered === true, `result=${themesRegistered}`);
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('❌ remaining-claims-verify crashed:', error.message);
  process.exitCode = 1;
});
