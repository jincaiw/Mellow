/**
 * 脏文档离开确认的**运行时探针**（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因（G7-EDIT-09）：`verify-shell-widgets.mjs` 只能证明「代码里存在这些调用」，
 * 证明不了「点取消真的不会切走」。而这次改的是**文档切换主流程**且把同步守卫改成了
 * async —— 漏 await 的后果是「Promise 恒为真 → 取消静默失效 → 点取消仍会切走并丢内容」，
 * 属于**屏幕上看不出来**的缺陷，值得补运行时实证。
 *
 * ⚠️ **实测结论：本 dev harness 无法制造脏文档**（2026-09-13 实测，非推测）：
 *   · 在 iframe 内真实键盘输入后，编辑器内容确实变了（`doc = "hello world"`），
 *     但 App 的 `document.title` 不带 dirty 标记，⌘N 直接**无对话框**清空文档；
 *   · `dirty` 的唯一建立点是 `host.onEvent(e => e.type === 'viewUpdate' && e.contentEdited)`
 *     （App.tsx 约 3440 行），而 dev harness 的宿主不投递编辑器事件
 *     （`host/browserMockHost.ts` 无 onEvent/viewUpdate 通道）→ `docStateRef.doc.dirty`
 *     恒为 false；
 *   · ⌘S 同样无效（mock 保存不落盘、不改标题），无法借「保存后重命名」间接置脏。
 *   故本脚本**自动降级为能力探针**：先探测「打字 + ⌘N 是否出现对话框」，
 *   出现则跑完整断言；不出现则明确 SKIP 并说明原因，**不伪造通过**。
 *
 * 同时它断言一个仍然有意义的不变量：**任何路径都不得再弹出 WebView 原生确认面板**
 * （`page.on('dialog')` 在整个流程中必须为空）—— 这正是本次迁移要消除的东西。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/dirty-leave-dialog-verify.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 动态选空闲端口：固定端口 + --strictPort 时残留 vite 会让新实例静默启动失败，
 *  测试连上旧实例 → 断言集体假红且延长等待无效（tests/e2e/README.md 坑 1）。 */
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

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}
function skip(name, reason) {
  console.log(`⏭  SKIP ${name}\n     原因：${reason}`);
}

async function main() {
  const PORT = await pickFreePort();
  const BASE = `http://localhost:${PORT}`;
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  const nativeDialogs = [];
  try {
    const deadline = Date.now() + 40000;
    let up = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
        if (res.ok) { up = true; break; }
      } catch { /* not ready */ }
      await sleep(300);
    }
    if (!up) throw new Error('vite dev server 未就绪');

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // WebView 原生面板（window.confirm / alert / prompt）都会被这里记录 —— 本次迁移要消除它们。
    page.on('dialog', async (dialog) => {
      nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.dismiss().catch(() => undefined);
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const frame = await (async () => {
      const limit = Date.now() + 20000;
      while (Date.now() < limit) {
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

    const docText = () => frame.evaluate(() => {
      const v = window.editor?.dispatch ? window.editor : window.editor?.view;
      return v.state.doc.toString();
    });
    const modal = page.locator('.confirm-modal');
    /** 快捷键分发挂在**主窗口** window 上，故先点主页面把焦点移出 iframe。 */
    const pressAppShortcut = async (keys) => {
      await page.locator('.editor-topbar').first().click({ timeout: 3000 }).catch(() => undefined);
      await page.keyboard.press(keys);
    };

    // ── 前置：尝试制造脏文档（真实键盘输入）─────────────────────────────
    await frame.click('.cm-content');
    await page.keyboard.type('hello world');
    await sleep(400);
    const typed = await docText();
    check('编辑器内容已变更（iframe 侧）', typed.includes('hello world'), JSON.stringify(typed));

    await pressAppShortcut('Meta+n');
    let dirtyReachable = true;
    try {
      await modal.waitFor({ state: 'visible', timeout: 4000 });
    } catch {
      dirtyReachable = false;
    }

    if (!dirtyReachable) {
      // 如实降级：不把「harness 造不出脏文档」写成失败，也不伪造通过。
      skip(
        '脏文档离开确认的完整运行时断言',
        'dev harness 不投递编辑器 viewUpdate 事件 → App 的 dirty 恒为 false（详见文件头注释）；'
        + '需真机或补齐 harness 事件通道后重跑',
      );
      check(
        '⌘N 在不脏时正常替换文档（守卫未误拦）',
        !(await docText()).includes('hello world'),
        JSON.stringify(await docText()),
      );
      check(
        '全流程未出现 WebView 原生确认面板（window.confirm/alert/prompt）',
        nativeDialogs.length === 0,
        nativeDialogs.join(' | ') || '无',
      );
      return;
    }

    // ── 以下在 harness 具备事件通道后自动生效 ────────────────────────────
    const labels = await page.locator('.confirm-modal-actions button').allInnerTexts();
    check(
      '按钮为三选一且文案对齐 Typora 真值（保存 / 放弃更改 / 取消）',
      labels.length === 3 && labels[0] === '保存' && labels[1] === '放弃更改' && labels[2] === '取消',
      JSON.stringify(labels),
    );
    check(
      '标题与正文对齐 Typora 原文',
      (await page.locator('.confirm-modal-title').innerText()) === '保存'
        && (await page.locator('.confirm-modal-message').innerText()).includes('是否要保存对文档的更改？'),
    );
    await page.getByRole('button', { name: '取消' }).click();
    await sleep(400);
    check('点「取消」后对话框关闭', (await modal.count()) === 0);
    check(
      '点「取消」后**文档内容不变**（漏 await 时这里会变成空文档）',
      (await docText()).includes('hello world'),
      JSON.stringify(await docText()),
    );
    await frame.click('.cm-content');
    await page.keyboard.type(' again');
    await sleep(200);
    await pressAppShortcut('Meta+n');
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: '放弃更改' }).click();
    await sleep(600);
    check(
      '点「放弃更改」后切换真的发生（文档被替换为新的未命名空文档）',
      !(await docText()).includes('hello world'),
      JSON.stringify(await docText()),
    );
    check(
      '全流程未出现 WebView 原生确认面板（window.confirm/alert/prompt）',
      nativeDialogs.length === 0,
      nativeDialogs.join(' | ') || '无',
    );
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
