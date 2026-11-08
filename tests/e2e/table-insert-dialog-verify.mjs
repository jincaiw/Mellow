/**
 * 表格创建对话框（任务 4.10 / `insert.table`）—— 运行时验证。
 *
 * 为什么此前只有纯函数单测：`insertTableWithDialog` 经 `askForm` 走**应用内**多字段
 * 对话框，本环境没有「对话框真的弹出 / 两个框可用 / 确定后插入正确表格」这一层的探针。
 * 本脚本补上该层（与 `in-app-input-dialog-verify.mjs` 同一驱动方式）。
 *
 * 覆盖：
 *   ① `insert.table` 已注册，派发后出现**应用内**对话框（不是原生 prompt）；
 *   ② 两个字段都是 `type=number`、`min=1`，标签为「列 / 行」，默认 **3 / 4**；
 *   ③ Esc = 取消：对话框关闭，**文档无任何改动**（不留 `/` 残字）；
 *   ④ 输入 列=2 / 行=3 + Enter → 对话框关闭，插入 GFM 表格：
 *      2 列、Rows **含表头行**（1 表头 + 1 分隔 + 2 数据行 = 4 行文本）；
 *   ⑤ 全流程零原生面板调用（confirm / alert / prompt 均被 spy 记录）。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/table-insert-dialog-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const port = await pickFreePort();
  const base = `http://localhost:${port}`;
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: port });
  const browser = await chromium.launch();
  try {
    // README 陷阱 1：先等 vite 真正就绪（编辑器子资源 HEAD 200），防陈旧 dev server 假红
    const deadline0 = Date.now() + 40000;
    let up = false;
    while (Date.now() < deadline0 && !up) {
      try { up = (await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok; } catch { /* not yet */ }
      if (!up) await sleep(300);
    }
    if (!up) throw new Error('vite dev server 未就绪');

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 记录任何原生面板调用（本命令应全程走应用内对话框）
    await context.addInitScript(() => {
      window.__nativePanels = [];
      window.confirm = () => { window.__nativePanels.push('confirm'); return false; };
      window.alert = () => { window.__nativePanels.push('alert'); };
      window.prompt = () => { window.__nativePanels.push('prompt'); return null; };
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    // 命令注册表就绪
    let ready = false;
    const deadline1 = Date.now() + 20000;
    while (Date.now() < deadline1 && !ready) {
      ready = await page.evaluate(() => !!window.__MELLOW_COMMANDS__).catch(() => false);
      if (!ready) await sleep(300);
    }
    check('命令注册表就绪（__MELLOW_COMMANDS__）', ready);
    const ids = await page.evaluate(() => window.__MELLOW_COMMANDS__.all().map((c) => c.id));
    check('insert.table 已注册（菜单 / Slash 共用同一命令）', ids.includes('insert.table'));

    // 引擎 iframe 面（文档读取；先例 = edit-menu-4362-verify）
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
    // 编辑器视图就绪门：`window.editor` 已挂但 core 内部状态可能尚未初始化
    // （实测 getEditorText 会抛 `reading 'lineBreak'`）。轮询到首次可读为止。
    let before = null;
    const deadlineText = Date.now() + 15000;
    while (Date.now() < deadlineText && before === null) {
      before = await getText().catch(() => null);
      if (before === null) await sleep(200);
    }
    check('编辑器文档可读（getEditorText 就绪）', before !== null, JSON.stringify(before));

    // ⚠️ 必须 fire-and-forget：execute 会 await 一个「只有用户点击才 resolve」的对话框，
    // Playwright 的 page.evaluate 会 await 返回的 Promise → 直接返回它会永久挂起。
    const dispatch = () => page.evaluate(() => {
      void window.__MELLOW_COMMANDS__.dispatch('insert.table');
      return true;
    });
    const modal = () => page.evaluate(() => {
      const m = document.querySelector('.confirm-modal');
      if (m === null) return null;
      const fields = [...m.querySelectorAll('.confirm-modal-fields input')];
      return {
        title: m.querySelector('.confirm-modal-title')?.textContent ?? '',
        fields: fields.map((input) => ({
          value: input.value,
          type: input.type,
          min: input.min,
          label: input.closest('.confirm-modal-field')?.querySelector('.confirm-modal-field-label')?.textContent ?? '',
        })),
        buttons: [...m.querySelectorAll('button')].map((b) => b.textContent),
        activeClass: document.activeElement?.className ?? '',
      };
    });

    // ── ① 派发命令 → 应用内多字段对话框 ─────────────────────────────
    await dispatch();
    await page.waitForSelector('.confirm-modal-fields input', { timeout: 5000 }).catch(() => null);
    const opened = await modal();
    check('出现【应用内】对话框且含多字段区（非原生面板）', opened !== null && (opened.fields ?? []).length === 2, JSON.stringify(opened));
    check('对话框标题为「插入表格」', opened?.title === '插入表格', JSON.stringify(opened?.title));
    check('两个字段都是 type=number 且 min=1', (opened?.fields ?? []).every((f) => f.type === 'number' && f.min === '1'), JSON.stringify(opened?.fields));
    check('字段标签为「列 / 行」', JSON.stringify((opened?.fields ?? []).map((f) => f.label)) === JSON.stringify(['列', '行']), JSON.stringify((opened?.fields ?? []).map((f) => f.label)));
    check('默认值 列=3 / 行=4（Typora 一手基线）', JSON.stringify((opened?.fields ?? []).map((f) => f.value)) === JSON.stringify(['3', '4']), JSON.stringify((opened?.fields ?? []).map((f) => f.value)));
    check('按钮为「确定 / 取消」', JSON.stringify(opened?.buttons) === JSON.stringify(['确定', '取消']), JSON.stringify(opened?.buttons));
    check('首个字段自动获得焦点（键盘可直接输入）', (opened?.activeClass ?? '').includes('confirm-modal-input'), JSON.stringify(opened?.activeClass));

    // ── ② Esc = 取消 → 文档不变 ────────────────────────────────────
    // ⚠️ 先显式聚焦字段再按 Esc：键盘事件从**当前焦点**派发，若焦点还在编辑器 iframe
    // 内，Esc 不会到达主窗口的全局 handler（README 陷阱 5 同类）。
    await page.locator('.confirm-modal-fields input').first().focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.confirm-modal') === null, { timeout: 3000 }).catch(() => null);
    check('Esc 后对话框关闭', (await modal()) === null);
    check('取消不插入任何内容（文档未变）', (await getText()) === before, `${JSON.stringify(before)} → ${JSON.stringify(await getText())}`);

    // ── ③ 确定路径：列=2 / 行=3 → 插入 2 列、3 行（含表头）表格 ─────
    await dispatch();
    await page.waitForSelector('.confirm-modal-fields input', { timeout: 5000 }).catch(() => null);
    const inputs = page.locator('.confirm-modal-fields input');
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('3');
    await inputs.nth(1).press('Enter');
    await sleep(400);
    check('Enter（主按钮）后对话框关闭', (await modal()) === null);
    const after = await getText();
    const expected = '|  |  |\n|---|---|\n|  |  |\n|  |  |';
    check('插入的 GFM 表格 = 2 列 × 3 行（Rows 含表头行）', after === expected, JSON.stringify(after));
    const lines = after.split('\n');
    check('表头行 2 列、分隔行 2 列、数据行 2 行', lines.length === 4 && lines[0] === '|  |  |' && lines[1] === '|---|---|' && lines.slice(2).every((l) => l === '|  |  |'), JSON.stringify(lines));

    // ── ④ 全流程零原生面板 ────────────────────────────────────────
    const natives = await page.evaluate(() => window.__nativePanels);
    check('全流程未出现任何原生面板（confirm / alert / prompt）', natives.length === 0, JSON.stringify(natives));
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
