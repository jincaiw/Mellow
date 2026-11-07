/**
 * §4.360「六」5 双指缩放（View → 双指缩放 / Allow Magnification）—— 菜单命令装配存活探针。
 *
 * 立脚本原因：Typora 1.14.9 显示菜单 View 段的「双指缩放」CheckMenuItem 是本轮
 * View 菜单差集分流中唯一的**真缺口**（其余条目均有在册裁决：tab=B1 SDI、只读=D-AC、
 * 字数/大纲窗口=四.4 等价物、全屏 accel=官方表判决）。引擎面 §4.28 早已完整
 * （editor.allowMagnification 设置 + setAllowMagnification 配置通道），缺的是菜单
 * 入口 + checked 状态环。本探针经 `__MELLOW_COMMANDS__.dispatch(id)` 驱动与菜单
 * 点击**同一命令树**，验收七环中的 localStorage/状态栏两环；引擎生效面（disposer）
 * 由 §4.28 单测 + verify-settings-contract 七环正则承载，不在此重复。
 *
 * 判据：
 *   1. view.magnification.toggle 注册于命令树
 *   2. 第一轮 dispatch → localStorage 'mellow.editor.allowMagnification' === '1'
 *      且状态栏「双指缩放已开启」
 *   3. 第二轮 dispatch → '0' 且状态栏「双指缩放已关闭」（toggle 双向）
 *
 * ⚠️ 启动恢复段（文档恢复/编辑器就绪）会在约 1~2s 内持续重写状态栏 —— 首轮
 * dispatch 若在稳定前发出，其文案会被「编辑器就绪」覆盖（调试期实测：文案于
 * 0ms 出现、120ms 被覆盖 ⇒ 探针时序，非产品缺陷）。故先发「启动恢复段结束」
 * 门（状态栏 === 「编辑器就绪」），再发第一轮 toggle。
 *
 * 运行：NODE_PATH=/tmp/pw/node_modules node tests/e2e/magnification-menu-4360-verify.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1468;
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

  const ids = await page.evaluate(() => window.__MELLOW_COMMANDS__.all().map((c) => c.id));
  check('view.magnification.toggle 已注册', ids.includes('view.magnification.toggle'));

  // 启动恢复段结束门（见文件头 ⚠️）
  let settled = false;
  const deadline2 = Date.now() + 15000;
  while (Date.now() < deadline2 && !settled) {
    settled = (await page.locator('footer.statusbar span.status').textContent().catch(() => null)) === '编辑器就绪';
    if (!settled) await sleep(200);
  }
  check('启动恢复段结束（状态栏 =「编辑器就绪」）', settled);

  const statusOf = async () =>
    page.locator('footer.statusbar span.status').textContent().catch(() => null);
  const storageOf = () => page.evaluate(() => localStorage.getItem('mellow.editor.allowMagnification'));
  const toggle = () => page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('view.magnification.toggle'));

  await toggle();
  await sleep(400);
  check('开启 → localStorage "1"（writeSetting 布尔序列化面）', (await storageOf()) === '1');
  let onText = await statusOf();
  const deadline3 = Date.now() + 3000;
  while (onText !== '双指缩放已开启' && Date.now() < deadline3) {
    await sleep(150);
    onText = await statusOf();
  }
  check('状态栏「双指缩放已开启」', onText === '双指缩放已开启', JSON.stringify(onText));

  await toggle();
  await sleep(400);
  check('再点 → localStorage "0"（双向 toggle；disposer 生效面由 §4.28 单测+护栏承载）', (await storageOf()) === '0');
  check('状态栏「双指缩放已关闭」', (await statusOf()) === '双指缩放已关闭');
} finally {
  await browser.close().catch(() => {});
  server.child.kill('SIGTERM');
}
process.exit(fail);
