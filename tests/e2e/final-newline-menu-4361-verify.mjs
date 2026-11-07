/**
 * §4.360「六」6 保存时在文末添加空行（Edit → 换行符 → Insert Final New Line On Save）
 * —— 菜单命令装配存活探针。
 *
 * 立脚本原因：Typora 1.14.9 实机换行符子菜单第三项（基线 fixture L216-220）是本轮
 * 差集分流中编辑菜单唯一的**真缺口**（其余条目命中在册裁决）。能力面 G7-FEAT-12
 * （`files.finalNewline`，保存路径读时生效）早已实装，缺的是菜单入口 + 勾选态环 +
 * 双入口 tick 纪律。本探针经 `__MELLOW_COMMANDS__.dispatch(id)` 驱动与菜单点击
 * **同一命令树**，验收注册/localStorage/状态栏三环；原生勾选回显（checked →
 * CheckMenuItem）与 radio 对（docEol）属 NativeMenuSpec 面，由 verify-menu-contract
 * 的 CHECK_STATE_CONTRACT/LS_CHECKED_SETTINGS 护栏承载，不在此重复。
 *
 * 判据：
 *   1. edit.finalNewline.toggle 注册于命令树
 *   2. 第一轮 dispatch → localStorage 'mellow.file.finalNewline' === '1'
 *      且状态栏「保存时将在文末添加空行」
 *   3. 第二轮 dispatch → '0' 且状态栏「保存时不再添加文末空行」（toggle 双向，
 *      默认值 false = settings schema `defaultValue: false`）
 *
 * ⚠️ 启动恢复段（文档恢复/编辑器就绪）会在约 1~2s 内持续重写状态栏 —— 首轮
 * dispatch 若在稳定前发出，其文案会被「编辑器就绪」覆盖（§4.360「六」5 实测教训：
 * 0ms 出现、120ms 被覆盖 ⇒ 探针时序，非产品缺陷）。故先过「编辑器就绪」稳定门。
 *
 * 运行：NODE_PATH=/tmp/pw/node_modules node tests/e2e/final-newline-menu-4361-verify.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1469;
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
  check('edit.finalNewline.toggle 已注册', ids.includes('edit.finalNewline.toggle'));

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
  const storageOf = () => page.evaluate(() => localStorage.getItem('mellow.file.finalNewline'));
  const toggle = () => page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('edit.finalNewline.toggle'));

  await toggle();
  await sleep(400);
  check('开启 → localStorage "1"（writeSetting 布尔序列化面；默认 false 取反）', (await storageOf()) === '1');
  let onText = await statusOf();
  const deadline3 = Date.now() + 3000;
  while (onText !== '保存时将在文末添加空行' && Date.now() < deadline3) {
    await sleep(150);
    onText = await statusOf();
  }
  check('状态栏「保存时将在文末添加空行」', onText === '保存时将在文末添加空行', JSON.stringify(onText));

  await toggle();
  await sleep(400);
  check('再点 → localStorage "0"（双向 toggle；保存路径读时生效由 files.finalNewline 既有实装承载）', (await storageOf()) === '0');
  check('状态栏「保存时不再添加文末空行」', (await statusOf()) === '保存时不再添加文末空行');
} finally {
  await browser.close().catch(() => {});
  server.child.kill('SIGTERM');
}
process.exit(fail);
