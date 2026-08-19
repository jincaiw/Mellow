/**
 * 10MB 白屏诊断 v2 —— 检查点式：定位 resetEditor 内部卡点。
 * 通过 console 事件流式输出阶段进度（主线程阻塞时最后的 checkpoint 即卡点）。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1424;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = new URL('../../apps/desktop/', import.meta.url).pathname;

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const MB = 1024 * 1024;

async function main() {
  const sizeArg = Number(process.argv[2] ?? 1); // MB
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  try {
    if (!(await waitForServer(30000))) { console.error('vite 未就绪'); process.exitCode = 1; return; }
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('console', (m) => {
      const t = m.text();
      if (t.startsWith('[diag]')) console.log(t);
    });
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(5000);

    const r = await page.evaluate(`
      (async () => {
        const w = document.querySelector('iframe.mellow-editor-frame').contentWindow;
        const log = (s) => console.log('[diag] ' + s);
        log('target ' + ${sizeArg} + 'MB');
        const words = ['entity','structure','strong','highlight','scroll','inline','列表','引擎','中位数','流程图','装饰','序列图','图片','高亮','表格','文档','阈值','指标','视口','性能','语料','无序','光标','夹具','合成','输入','渲染','异步','测试','标记','内容','模式'];
        const lines = [];
        let total = 0; let i = 0;
        const target = ${sizeArg} * ${MB};
        while (total < target) {
          let line;
          const k = i % 7;
          if (k === 0) line = '- ' + words[(i*3)%words.length] + ' ' + words[(i*5)%words.length];
          else if (k === 3) line = '* ' + words[(i*7)%words.length] + words[(i*11)%words.length] + ' 视口性能';
          else line = words[(i*13)%words.length] + ' ' + words[(i*17)%words.length] + words[(i*19)%words.length] + ' 对照图片高亮表格';
          lines.push(line); total += line.length + 1; i++;
        }
        const text = lines.join('\\n');
        log('generated ' + Math.round(text.length/1024) + 'KB, ' + lines.length + ' lines');
        const t0 = performance.now();
        const p = w.webModules.core.resetEditor({ text, documentChanged: true });
        log('resetEditor called, awaiting…');
        // 主线程若阻塞，下面的 timeout 回调不会执行 —— 用它做心跳
        let heartbeat = 0;
        const hb = setInterval(() => { heartbeat++; log('heartbeat ' + heartbeat + ' @ ' + Math.round(performance.now() - t0) + 'ms'); }, 1000);
        let ok = false, err = null;
        try { ok = await p; } catch (e) { err = String(e && e.message || e).slice(0, 200); }
        clearInterval(hb);
        log('resetEditor done ok=' + ok + ' err=' + err + ' in ' + Math.round(performance.now() - t0) + 'ms');
        await new Promise((r2) => setTimeout(r2, 300));
        const cm = w.document.querySelector('.cm-content');
        return {
          lines: w.editor.state.doc.lines,
          cmChildren: cm ? cm.children.length : -1,
          cmTextLen: cm ? (cm.textContent || '').length : -1,
        };
      })()
    `).catch((e) => ({ error: String(e).slice(0, 300) }));
    console.log('RESULT:', JSON.stringify(r));
    await browser.close();
  } finally {
    vite.kill('SIGTERM');
  }
}

main().catch((err) => { console.error('diag crashed:', err); process.exitCode = 1; });
