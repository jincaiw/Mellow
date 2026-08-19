/**
 * 阶段 0-4 E2E 冒烟测试 —— 白屏防线回归门禁。
 *
 * 背景（2026-08-19 评估）：789 个单元测试全绿但应用真机白屏 ——
 * "零件测试全过、整车点不着火"。本脚本补上"整车点火"检查：
 *
 *   1. React App 挂载（root 非空、shell 骨架渲染）
 *   2. 编辑器 iframe 加载且 webModules.core 就绪（启动竞态修复回归）
 *   3. bundle 注入脚本零语法错误（tauriBridgeAdapter 正则回归）
 *   4. 引擎扩展安装成功（MellowEngine 可用）
 *   5. 输入闭环：点击 → 输入 Markdown → doc 内容一致
 *   6. WYSIWYG：失焦行 marker 视觉隐藏（宽度 0）
 *
 * 运行：node tests/e2e/smoke.mjs
 * 依赖：apps/desktop 依赖已安装（pnpm install）；自动拉起 vite dev server。
 * 退出码：0 = 全部通过；1 = 存在失败项（防白屏回归的 CI 门禁）。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1421;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;

/** 等待端口可访问（vite 就绪信号） */
async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** 单条断言记录 */
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // 1. 启动 vite dev server（隔离端口，不干扰并行开发）
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR,
    stdio: 'ignore',
    detached: false,
  });
  try {
    if (!(await waitForServer(30000))) {
      console.error('vite dev server 未能在 30s 内就绪');
      process.exitCode = 1;
      return;
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    // 等待：idle 挂载 iframe → load → webModules → 会话恢复（首次约 2-4s）
    await page.waitForTimeout(5000);

    // 2. React App 挂载
    const rootLen = await page.evaluate("document.getElementById('root')?.innerHTML?.length ?? -1");
    check('React root 渲染（非白屏）', rootLen > 100, `root innerHTML ${rootLen} chars`);

    // 3. 编辑器 iframe 与 webModules
    const editorState = await page.evaluate(`
      (() => {
        const f = document.querySelector('iframe.mellow-editor-frame');
        if (!f) return { iframe: false };
        const w = f.contentWindow;
        return {
          iframe: true,
          webModulesCore: !!w?.webModules?.core,
          markEditApi: !!w?.MarkEdit,
          editorInstance: !!w?.editor,
          engine: !!w?.MellowEditorEngine,
        };
      })()
    `);
    check('编辑器 iframe 挂载', editorState.iframe === true);
    check('webModules.core 就绪（启动竞态回归）', editorState.webModulesCore === true);
    check('MarkEdit API 就绪', editorState.markEditApi === true);
    check('CodeMirror editor 实例就绪', editorState.editorInstance === true);
    check('Mellow 引擎扩展安装', editorState.engine === true);

    // 4. 输入闭环
    const cm = page.frameLocator('iframe.mellow-editor-frame').locator('.cm-content');
    await cm.click();
    const typedDoc = '# 冒烟标题\n\n正文 **加粗** 与 `code`。\n\n- 列表项';
    await page.keyboard.type(typedDoc, { delay: 15 });
    await page.waitForTimeout(800);
    const docText = await page.evaluate(`
      (() => document.querySelector('iframe.mellow-editor-frame')
        ?.contentWindow?.editor?.state?.doc?.toString() ?? '')()
    `);
    check('输入闭环（doc 内容一致）', docText === typedDoc, `len=${docText.length}`);

    // 5. WYSIWYG marker 隐藏（光标在列表行，标题/加粗行为 rendered）
    const markers = await page.evaluate(`
      (() => [...document.querySelector('iframe.mellow-editor-frame')
        ?.contentWindow?.document?.querySelectorAll('.mellow-md-marker') ?? []]
        .map((m) => ({ t: m.textContent, w: Math.round(m.getBoundingClientRect().width) })))()
    `);
    const hiddenCount = markers.filter((m) => m.w === 0).length;
    check(
      'WYSIWYG marker 视觉隐藏（宽度 0）',
      markers.length >= 4 && hiddenCount === markers.length,
      `${hiddenCount}/${markers.length} hidden`,
    );

    // 6. 零页面错误（含 bundle 语法错误回归：Unexpected token / bare specifier / 404）
    check('零页面错误', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');
    check('零控制台错误', consoleErrors.length === 0, consoleErrors.join(' | ') || 'clean');

    await browser.close();
  } finally {
    vite.kill('SIGTERM');
  }

  // 汇总
  const failed = results.filter((r) => !r.ok);
  console.log(`\n冒烟结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('smoke crashed:', err);
  process.exitCode = 1;
});
