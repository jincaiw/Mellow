/**
 * A38 / D-AT / D-AU 的**端到端运行时验证**（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因（本项目母题「结构在、功能死」）：三条链都跨层 ——
 *   A38：SettingsPanel 行 → applySetting case → EditorCore wrapper → iframe
 *        `__MELLOW_SPELLCHECK_SCOPE__` → inlineCodeAttrs 装饰重算。
 *        护栏（verify-settings-contract 跨层 case / 命令三元组）只能证明**代码存在**，
 *        证明不了「打开开关后行内码真的不再标红」。
 *   D-AT：设置行存在 + 持久化（生效点在原生导出路径，dev 无 Tauri ⇒ 不可观测，
 *        静态契约兜底，等级如实标注 —— 同 settings-live-apply-verify 的 G7-SHELL-06 处理）。
 *   D-AU：设置行在 mac 上可见 + 持久化；`set_quit_after_window_close` 是 Tauri-only，
 *        dev 下 applySetting 的 `platformMac && isTauri()` 门早退 ⇒ 只能验到 UI 层。
 *
 * 覆盖：
 *   1. 编辑器分类出现 A38 三行（开关 / 只读语言展示 = mock 'en-US' / 系统设置入口按钮）；
 *   2. 开关默认关；行内码带 spellcheck=false（= 开关引入前现状）；
 *   3. 点开关开 ⇒ localStorage 写入 ⇒ **iframe 内行内码真的丢掉 spellcheck 属性**
 *      （live apply 全链，非 reload 生效）；再点关 ⇒ 恢复；
 *   4. 「打开系统拼写设置」按钮点击 ⇒ 状态栏出现降级或成功文案（命令在 dev 不存在 ⇒
 *      invoke 抛错被 catch ⇒ 走 unavailable 分支；不崩即过）；
 *   5. D-AT 行（导出分类）存在且默认关；D-AU 行（通用分类）在 mac 平台显示且默认关。
 *
 * 判定纪律：失败先查「断言写错还是实现真缺」，不得改断言求绿。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/a38-spellcheck-scope-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const PORT = await pickFreePort();
  const BASE = `http://localhost:${PORT}`;
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const browser = await chromium.launch();
  try {
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { ready = (await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' })).ok; } catch { /* not yet */ }
      if (!ready) await sleep(300);
    }
    if (!ready) throw new Error('vite dev server 未就绪');

    // E7 默认集里 status 字段隐藏（image-upload-verify 同处理）⇒ 预置显式开启
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mellow.statusbar.visible', '1');
      localStorage.setItem('mellow.statusbar.fields', JSON.stringify({ status: true }));
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    // 编辑器 iframe 就绪
    const frame = await (async () => {
      const d = Date.now() + 20000;
      while (Date.now() < d) {
        for (const f of page.frames()) {
          if (f.url().includes('/editor/index.html')) {
            const ok = await f.evaluate(() => !!(window.webModules?.core && window.editor
              && window.__MELLOW_SPELLCHECK_SCOPE__)).catch(() => false);
            if (ok) return f;
          }
        }
        await sleep(300);
      }
      return null;
    })();
    if (frame === null) throw new Error('编辑器 iframe 未就绪');
    check('iframe 通道 __MELLOW_SPELLCHECK_SCOPE__ 已安装（A38）', true);

    const inlineCodeAttr = () => frame.evaluate(() => {
      const el = document.querySelector('.mellow-md-inlinecode-attr');
      if (el === null) return { present: false };
      return { present: true, spellcheck: el.getAttribute('spellcheck'), autocorrect: el.getAttribute('autocorrect') };
    });
    const resetDoc = (text) => frame.evaluate((t) => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: t.length } });
    }, text);

    await resetDoc('a `code` b');
    await sleep(600);

    // ── 1. 设置面板：编辑器分类的 A38 三行 ────────────────────────────
    await page.evaluate(() => window.__MELLOW_COMMANDS__.dispatch('settings.open'));
    await page.waitForSelector('.settings-panel', { timeout: 5000 });
    await page.locator('.settings-nav-item', { hasText: /编辑器|Editor/ }).first().click();
    await page.waitForSelector('.settings-row', { timeout: 5000 });

    const scopeRow = page.locator('.settings-row', { hasText: /代码与链接|code and links/i }).first();
    check('A38：拼写作用域开关行出现（mock available ⇒ 不隐藏）', (await scopeRow.count()) > 0);
    const scopeCheckbox = scopeRow.locator('input[type=checkbox]');
    check('A38：开关默认关', (await scopeCheckbox.count()) > 0 && !(await scopeCheckbox.first().isChecked()));

    const langRow = page.locator('.settings-row', { hasText: /当前拼写检查语言|Current spell-check language/i }).first();
    // 语言值来自打开面板时的异步拉取（App.tsx settingsOpen effect）⇒ 显式等待渲染
    await langRow.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    check('A38：只读语言展示行出现', (await langRow.count()) > 0);
    const langText = (await langRow.count()) > 0 ? (await langRow.locator('.settings-row-value').first().textContent()) : '';
    check('A38：语言值 = mock 的 en-US（真实值来自 NSSpellChecker）', (langText ?? '').trim() === 'en-US', JSON.stringify(langText));

    const actionRow = page.locator('.settings-row', { hasText: /打开系统拼写设置|Open System Spelling/i }).first();
    check('A38：系统设置入口按钮行出现', (await actionRow.count()) > 0
      && (await actionRow.locator('button').count()) > 0);

    // ── 2/3. live apply 全链：开 ⇒ 行内码丢属性；关 ⇒ 恢复 ────────────
    await scopeCheckbox.first().check();
    // 受控 checkbox 必须真的停在勾选态（2026-11-06：SettingsPanel 曾因 applySetting
    // 不 bump state 而被 React 弹回 ⇒ 用户看到「点了自己跳回去」）
    check('A38 开：checkbox 视觉状态跟随（受控回弹缺陷回归）', await scopeCheckbox.first().isChecked());
    await sleep(600);
    const on = await inlineCodeAttr();
    check('A38 开：行内码**省略** spellcheck（继承 cm-content 有效态）',
      on.present && on.spellcheck === null, JSON.stringify(on));
    check('A38 开：其余代码属性不受波及（copy-then-delete 只删一键）',
      on.present && on.autocorrect === 'off', JSON.stringify(on));
    const persistedOn = await page.evaluate(() => localStorage.getItem('mellow.editor.spellcheckForCodeAndLink'));
    check('A38：localStorage 持久化 = 1', persistedOn === '1', String(persistedOn));

    await scopeCheckbox.first().uncheck();
    await sleep(600);
    const off = await inlineCodeAttr();
    check('A38 关：行内码恢复 spellcheck=false（双向 live apply，非 reload 生效）',
      off.present && off.spellcheck === 'false', JSON.stringify(off));

    // ── 4. 系统设置入口：dev 无 Tauri ⇒ 降级路径不崩 ──────────────────
    await actionRow.locator('button').first().click();
    await sleep(400);
    const status = await page.locator('footer.statusbar span.status, .status').first().textContent().catch(() => '');
    check('A38：入口点击走降级文案（命令不存在 ⇒ catch ⇒ unavailable 提示）',
      /拼写|spell/i.test(status ?? ''), JSON.stringify(status));

    // ── 5. D-AT / D-AU 行 ────────────────────────────────────────────
    await page.locator('.settings-nav-item', { hasText: /导出|Export/ }).first().click();
    const atRow = page.locator('.settings-row', { hasText: /后打开文件所在位置|Open exported file location/i }).first();
    check('D-AT：导出后打开位置开关行出现', (await atRow.count()) > 0);
    check('D-AT：默认关（= Mellow 现状，ADR-0034 Q11=A2）',
      (await atRow.count()) > 0 && !(await atRow.locator('input[type=checkbox]').first().isChecked()));

    await page.locator('.settings-nav-item', { hasText: /通用|General/ }).first().click();
    const auRow = page.locator('.settings-row', { hasText: /关闭最后一个窗口时退出|Quit when the last window/i }).first();    check('D-AU：退出行为开关行出现（Chromium on macOS ⇒ platformMac 真）', (await auRow.count()) > 0);
    check('D-AU：默认「不退出」（对齐 Typora macOS 惯例）',
      (await auRow.count()) > 0 && !(await auRow.locator('input[type=checkbox]').first().isChecked()));
    // 点开后仅断言持久化（invoke 下发在 dev 被 isTauri 门早退，属原生层证据）
    await auRow.locator('input[type=checkbox]').first().check();
    const auPersist = await page.evaluate(() => localStorage.getItem('mellow.general.quitAfterWindowClose'));
    check('D-AU：localStorage 持久化 = 1（Tauri 下发不可在 dev 观测，等级如实）', auPersist === '1', String(auPersist));
    await auRow.locator('input[type=checkbox]').first().uncheck();

    await page.locator('.settings-close').click();
    await page.waitForSelector('.settings-panel', { state: 'detached', timeout: 5000 });
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
