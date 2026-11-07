/**
 * §4.360「六」7 编辑/查找菜单差集收口 —— 装配存活探针。
 *
 * 覆盖本轮三项新装配的**命令树 + 引擎桥**全链（原生勾选/物化面由
 * verify-menu-contract 承载，不在此重复）：
 *   1. search.replaceNext：注册 + 引擎桥存活 + **真实替换下一个**
 *      （面板 query/replace 输入 → dispatch('search.replaceNext') → 文档首匹配被替换）；
 *   2. edit.deleteSelection：注册 + 有选区删除 + 空选区 no-op（Typora「删除」语义）；
 *   3. edit.gotoLineEnd：注册 + 键位单一真源注入后 ⇧… 无关，本探针只锁注册面
 *      （accel 物化断言在 jest menu-schema.test，勿重复）。
 *
 * ⚠️ 启动恢复段会重写状态栏（「六」5 实测教训）⇒ 先过「编辑器就绪」稳定门。
 *
 * 运行：NODE_PATH=/tmp/pw/node_modules node tests/e2e/edit-menu-4362-verify.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1470;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
const browser = await chromium.launch();
let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail = 1;
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('mellow.statusbar.visible', '1');
    localStorage.setItem('mellow.statusbar.fields', JSON.stringify({ status: true }));
  });
  // README 陷阱 1：先等 vite 真正就绪（编辑器子资源 HEAD 200），防陈旧 dev server 假红
  const deadline0 = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline0 && !up) {
    try { up = (await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' })).ok; } catch { /* not yet */ }
    if (!up) await sleep(300);
  }
  check('vite ready', up);

  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app, #root > *', { timeout: 15000 });
  let ready = false;
  const deadline1 = Date.now() + 20000;
  while (Date.now() < deadline1 && !ready) {
    ready = await page.evaluate(() => !!window.__MELLOW_COMMANDS__).catch(() => false);
    if (!ready) await sleep(300);
  }
  check('commands ready', ready);

  // 启动恢复段结束门
  let settled = false;
  const deadline2 = Date.now() + 15000;
  while (Date.now() < deadline2 && !settled) {
    settled = (await page.locator('footer.statusbar span.status').textContent().catch(() => null)) === '编辑器就绪';
    if (!settled) await sleep(200);
  }
  check('启动恢复段结束（状态栏 =「编辑器就绪」）', settled);

  const ids = await page.evaluate(() => window.__MELLOW_COMMANDS__.all().map((c) => c.id));
  check('search.replaceNext 已注册', ids.includes('search.replaceNext'));
  check('edit.deleteSelection 已注册', ids.includes('edit.deleteSelection'));
  check('edit.gotoLineEnd 已注册', ids.includes('edit.gotoLineEnd'));

  // 引擎 iframe 面（桥与文档读写；先例 = block-shortcuts-verify）
  const frame = await (async () => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        if (f.url().includes('/editor/index.html')) {
          const ok = await f.evaluate(() => !!(window.webModules?.core && window.editor)).catch(() => false);
          if (ok) return f;
        }
      }
      await sleep(300);
    }
    throw new Error('editor iframe not ready');
  })();

  const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
  // dispatch → 引擎应用有延迟（本轮实测：固定 sleep 读到旧值），统一轮询到期望值或超时
  const waitForText = async (expect, ms = 5000) => {
    const deadline = Date.now() + ms;
    let last = null;
    while (Date.now() < deadline) {
      last = await getText();
      if (last === expect) return last;
      await sleep(150);
    }
    return last;
  };
  const setDoc = (text, anchor, head) => frame.evaluate(([t, a, h]) => {
    window.editor.dispatch({
      changes: { from: 0, to: window.editor.state.doc.length, insert: t },
      selection: a === h ? { anchor: a } : { anchor: a, head: h },
    });
  }, [text, anchor, head]);

  // ── 1. edit.deleteSelection 行为面 ─────────────────────────────
  await frame.click('.cm-content');
  await sleep(200);
  await setDoc('hello world', 0, 5); // 选中 hello
  await waitForText('hello world'); // dispatch 必须发生在选区就位之后
  await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('edit.deleteSelection'));
  const afterDel = await waitForText(' world');
  check('有选区 dispatch → 删除所选（"hello world" → " world"）', afterDel === ' world', JSON.stringify(afterDel));

  await setDoc('abc', 1, 1); // 空选区
  const seeded = await waitForText('abc'); // 先确认 setDoc 已生效，再谈 no-op
  await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('edit.deleteSelection'));
  await sleep(1000); // 给迟到的应用留窗口：若误当第二删除键，此处必现形
  const afterNoop = await getText();
  check('空选区 dispatch → no-op（"abc" 原样；不做第二删除键）', seeded === 'abc' && afterNoop === 'abc', JSON.stringify(afterNoop));

  // ── 2. search.replaceNext 全链 ────────────────────────────────
  await setDoc('foo bar foo baz', 0, 0);
  await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('search.replace'));
  await sleep(500);
  const panelUp = await frame.evaluate(() => !!document.querySelector('.cm-search input[name="search"]'));
  check('查找和替换面板打开（桥 search.replace 存活）', panelUp);
  if (panelUp) {
    await frame.evaluate(() => {
      const q = document.querySelector('.cm-search input[name="search"]');
      const r = document.querySelector('.cm-search input[name="replace"]');
      q.value = 'foo';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      r.value = 'X';
      r.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    // ⚠️ CM6 replaceNext 是**两步语义**（dist L915：仅当选区恰落在当前匹配上才替换，
    // 否则第一次调用只把选区移到首匹配）——面板「替换」按钮同一实现，桥有意复用。
    // 探针按真实合同断言：dispatch① 定位（文档不变）→ dispatch② 替换首匹配 → dispatch③ 替换次匹配。
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('search.replaceNext'));
    await sleep(600);
    const after1 = await getText();
    check('replaceNext dispatch① → 定位首匹配（两步语义，文档不变）', after1 === 'foo bar foo baz', JSON.stringify(after1));
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('search.replaceNext'));
    const after2 = await waitForText('X bar foo baz');
    check('replaceNext dispatch② → 替换首匹配（foo bar foo baz → X bar foo baz）', after2 === 'X bar foo baz', JSON.stringify(after2));
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('search.replaceNext'));
    const after3 = await waitForText('X bar X baz');
    check('replaceNext dispatch③ → 替换次匹配（→ X bar X baz）', after3 === 'X bar X baz', JSON.stringify(after3));
  }
} finally {
  await browser.close().catch(() => {});
  server.child.kill('SIGTERM');
}
process.exit(fail);
