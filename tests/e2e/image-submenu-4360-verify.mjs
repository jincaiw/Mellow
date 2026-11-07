/**
 * §4.360 图像子菜单全量装配 —— 命令路径功能存活探针（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：原生 GUI 轮（打包 App）受 §4.358 轮事故遗留的崩溃恢复会话污染
 * （陈旧脏缓冲 + System Events 焦点漂移），且本环境任何原生键入/点击需先过
 * 「窗口标题白名单」安全门（用户真实文件在会话复活名单内即中止）⇒ 功能验收
 * 改走 e2e 层：`__MELLOW_COMMANDS__.dispatch(id)` 与菜单点击走**同一命令树**
 * （menuSchema 条目 → CommandRegistry → App.tsx execute），判据等价且不触碰磁盘/焦点。
 *
 * 覆盖（只测本轮新增的纯缓冲/引擎操作；文件 IO 项 copy/rename/move/delete/upload
 * 由 app-core/imageFileOps 单测 + 既有 e2e 覆盖，不在本探针重复驱动真实磁盘）：
 *   1. 17 个图像子菜单命令 id 全部注册
 *   2. image.scale50：![probe](x.png)（无尺寸后缀、图未加载 ⇒ 引擎回退链全 false）
 *      → 状态栏「无法确定图片原始尺寸」；带 =WxH 后缀 → 文档改写为新尺寸
 *   3. image.scale200 复位链：=100x50 ×200 ⇒ =200x100；scale100 保持
 *   4. 光标不在图上 → 「请先将光标移到图片上」（无光标目标的显式反馈母题）
 *   5. image.mdStyle ↔ image.htmlStyle 语法转换 round-trip
 *   6. image.reloadAll 执行且状态栏反馈（幂等安全）
 *
 * 运行：node tests/e2e/image-submenu-4360-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1438;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

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

async function waitForStatus(page, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.locator('footer.statusbar span.status').textContent().catch(() => null);
    if (last === expected) return true;
    await sleep(150);
  }
  return false;
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const vite = server.child;
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.statusbar.visible', '1');
      localStorage.setItem('mellow.statusbar.fields', JSON.stringify({ status: true }));
    });
    const page = await context.newPage();
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
      return null;
    })();
    check('editor iframe ready', frame !== null);
    if (frame === null) throw new Error('editor iframe never ready');

    const commandsReady = await (async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const ok = await page.evaluate(() => !!window.__MELLOW_COMMANDS__).catch(() => false);
        if (ok) return true;
        await sleep(200);
      }
      return false;
    })();
    check('__MELLOW_COMMANDS__ ready', commandsReady);

    const setDoc = (text, head = null) => frame.evaluate(([t, h]) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: t },
        ...(h === null ? {} : { selection: { anchor: h, head: h } }),
      });
    }, [text, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    const dispatch = async (id) => {
      await page.evaluate((cid) => window.__MELLOW_COMMANDS__.dispatch(cid), id);
      await sleep(350);
    };

    // —— 1. 注册覆盖：本轮 17 个新命令 id（menuSchema format.image 子菜单 1:1）
    const IDS = [
      'image.insertLocal', 'image.openLocation',
      'image.scale25', 'image.scale33', 'image.scale50', 'image.scale67', 'image.scale80',
      'image.scale100', 'image.scale150', 'image.scale200',
      'image.mdStyle', 'image.htmlStyle', 'image.deleteFile', 'image.copyOne',
      'image.renameMove', 'image.uploadOne', 'image.reloadAll', 'image.globalSettings',
    ];
    const all = await page.evaluate(() => window.__MELLOW_COMMANDS__.all().map((c) => c.id));
    const missing = IDS.filter((id) => !all.includes(id));
    check(`18 个图像子菜单命令全部注册`, missing.length === 0, missing.join(','));

    // —— 2. 无光标目标 → 显式反馈（点击永不静默）
    await setDoc('普通文本，没有图片。', 3);
    await dispatch('image.scale50');
    check('光标不在图上 → 「请先将光标移到图片上」',
      await waitForStatus(page, '请先将光标移到图片上'));

    // —— 3. 有图但无可解析尺寸（引擎回退链 false → 状态栏第二文案）
    await setDoc('![probe](nope.png)', 4);
    await dispatch('image.scale50');
    check('无尺寸后缀且图未加载 → 「无法确定图片原始尺寸」',
      await waitForStatus(page, '无法确定图片原始尺寸（图片尚未加载完成）'));
    check('失败路径文档零改写', (await getText()) === '![probe](nope.png)');

    // —— 4. scale 改写链（相对显示尺寸回退；jsdom 之外的真实 CodeMirror 路径）
    await setDoc('![probe](nope.png =200x100)', 4);
    await dispatch('image.scale50');
    let text = await getText();
    check('=200x100 × 50% ⇒ =100x50', text === '![probe](nope.png =100x50)', text);
    check('应用后状态栏「50%」', (await page.locator('footer.statusbar span.status').textContent()) === '50%');
    await dispatch('image.scale200');
    text = await getText();
    check('=100x50 × 200% ⇒ =200x100（连续缩放叠加）', text === '![probe](nope.png =200x100)', text);
    await dispatch('image.scale100');
    text = await getText();
    check('=200x100 × 100% ⇒ 不变（复位语义）', text === '![probe](nope.png =200x100)', text);

    // —— 5. 语法转换 round-trip
    await setDoc('![alt](pic.png =640x480)', 4);
    await dispatch('image.mdStyle');
    text = await getText();
    check('Markdown → HTML（尺寸转 style）',
      text === '<img src="pic.png" alt="alt" style="width:640px;height:480px;" />', text);
    await dispatch('image.htmlStyle');
    text = await getText();
    check('HTML → Markdown（style 转 =WxH）', text === '![alt](pic.png =640x480)', text);

    // —— 6. Undo 验证（统一规则 13/AGENTS 修改后必验 Undo；先聚焦正文再键入，同 ime 探针手法）
    await frame.evaluate(() => document.querySelector('.cm-content')?.focus());
    await page.keyboard.press('Meta+z');
    await sleep(300);
    text = await getText();
    check('⌘Z 撤销语法转换 → 回到 HTML 形态',
      text === '<img src="pic.png" alt="alt" style="width:640px;height:480px;" />', text);

    // —— 7. reloadAll（幂等 + 反馈）
    await dispatch('image.reloadAll');
    check('image.reloadAll → 状态栏「已重新加载所有图片」',
      await waitForStatus(page, '已重新加载所有图片'));

    console.log('\n图像子菜单 §4.360 命令路径功能存活探针完成。');
  } finally {
    await browser.close().catch(() => {});
    vite.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
