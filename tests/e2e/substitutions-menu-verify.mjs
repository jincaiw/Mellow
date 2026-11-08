/**
 * G7-MENU-05：替换菜单 → 设置存储 → iframe 引擎的运行时闭环。
 * Typora 1.14.9 菜单基线：typora-live-menu-1149-display.txt；菜单物化 / 勾选态另由 commands 单测覆盖。
 * 仅操控独立 Chromium 中的临时文档，不访问原生 App / 用户文件 / 打印。
 * 运行：NODE_PATH=<playwright 的 node_modules> node tests/e2e/substitutions-menu-verify.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startViteDevServer } from '../visual/dev-server.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 1471;
const BASE = `http://localhost:${PORT}`;
const server = startViteDevServer({ cwd: fileURLToPath(new URL('../../apps/desktop/', import.meta.url)), port: PORT });
let browser;
let checks = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  checks += 1;
  console.log(`✅ ${name}`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(`${BASE}/editor/index.html`, { method: 'HEAD' })).ok) break; } catch { /* starting */ }
    if (Date.now() > deadline) throw new Error('vite not ready');
    await pause(200);
  }
  browser = await chromium.launch({ executablePath: process.env.MELLOW_TEST_CHROMIUM });
  const context = await browser.newContext();
  let page = await context.newPage();
  await page.goto(BASE);
  // Seed once, rather than addInitScript: reload must exercise persistence, not reseed preferences.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('mellow.editor.smartPunctuation', 'true');
    localStorage.setItem('mellow.editor.smartQuotes', '0');
    localStorage.setItem('mellow.editor.autoPair', '0');
    localStorage.setItem('mellow.locale', 'zh-CN');
  });
  await page.reload();
  const ready = async () => {
    await page.waitForFunction(() => !!window.__MELLOW_COMMANDS__);
    const limit = Date.now() + 20000;
    while (Date.now() < limit) {
      for (const frame of page.frames()) {
        if (frame.url().includes('/editor/index.html') && await frame.evaluate(() => !!window.editor?.state && !!window.__MELLOW_SMART_PUNCTUATION__).catch(() => false)) return frame;
      }
      await pause(100);
    }
    throw new Error('editor not ready');
  };
  let frame = await ready();
  const flags = () => frame.evaluate(() => {
    const api = window.__MELLOW_SMART_PUNCTUATION__;
    return [api.getQuotes(), api.getDashes(), api.getOnRender()];
  });
  await page.waitForFunction(() => localStorage.getItem('mellow.editor.smartPunctuation') === null);
  check('旧偏好迁移并保留独立 false，启动恢复到 iframe', await flags(), [false, true, false]);
  const dispatch = (id) => page.evaluate((cmd) => window.__MELLOW_COMMANDS__.dispatch(cmd), id);
  const setDoc = (text, pos = text.length) => frame.evaluate(([text, pos]) => {
    const { isolateHistory } = window.require('@codemirror/commands');
    window.editor.dispatch({
      changes: { from: 0, to: window.editor.state.doc.length, insert: text },
      selection: { anchor: pos }, annotations: isolateHistory.of('full'),
    });
    window.editor.focus();
  }, [text, pos]);
  const text = () => frame.evaluate(() => window.editor.state.doc.toString());
  const widgets = () => frame.locator('.cm-smart-pants').allTextContents();

  await dispatch('edit.smartQuotes.toggle');
  await dispatch('edit.smartDashes.toggle');
  check('菜单切为仅引号，两个开关互不覆盖', await flags(), [true, false, false]);
  await setDoc('word ');
  await page.keyboard.type('"');
  check('输入档：实际键入直引号转换', await text(), 'word “');
  await frame.evaluate(() => window.require('@codemirror/commands').undo(window.editor));
  check('转换可撤销且不吞掉已有正文', await text(), 'word ');
  await frame.evaluate(() => window.require('@codemirror/commands').redo(window.editor));
  check('重做恢复转换结果', await text(), 'word “');
  await setDoc('word--');
  await page.keyboard.type(' ');
  check('仅引号时不转换破折号', await text(), 'word-- ');
  await setDoc('wait..');
  await page.keyboard.type('.');
  check('仅引号时不转换省略号', await text(), 'wait...');

  await dispatch('edit.smartQuotes.toggle');
  await dispatch('edit.smartDashes.toggle');
  await setDoc('word');
  await page.keyboard.type('--');
  check('第二个连字符立即转换为 en dash', await text(), 'word–');
  await page.keyboard.type('-');
  check('第三个连字符立即转换为 em dash', await text(), 'word—');
  await frame.evaluate(() => window.require('@codemirror/commands').undo(window.editor));
  check('第三键转换可单步撤销回 en dash', await text(), 'word–');
  await frame.evaluate(() => window.require('@codemirror/commands').redo(window.editor));
  check('连续破折号键入可重做', await text(), 'word—');
  await setDoc('[link](path-.md)', 12);
  await page.keyboard.type('-');
  check('实际键入不改写链接目标', await text(), '[link](path--.md)');
  await setDoc('word ');
  await page.keyboard.type('"');
  check('仅破折号时不转换直引号', await text(), 'word "');
  await setDoc('wait..');
  await page.keyboard.type('.');
  check('智能破折号在第三个句点转换省略号', await text(), 'wait…');
  await frame.evaluate(() => window.require('@codemirror/commands').undo(window.editor));
  check('省略号转换可单步撤销', await text(), 'wait..');
  await frame.evaluate(() => window.require('@codemirror/commands').redo(window.editor));
  check('省略号转换可重做且光标随文本恢复', await frame.evaluate(() => [window.editor.state.doc.toString(), window.editor.state.selection.main.head]), ['wait…', 5]);
  await setDoc('`wait..`', 7);
  await page.keyboard.type('.');
  check('代码中的省略号保持 ASCII', await text(), '`wait...`');
  await setDoc('\\..');
  await page.keyboard.type('.');
  check('显式转义的省略号不改写', await text(), '\\...');

  await dispatch('edit.smartQuotes.toggle');
  await dispatch('edit.substitutions.onRender');
  await dispatch('edit.substitutions.onRender');
  check('重复选渲染档仍为渲染档', await flags(), [true, true, true]);
  const source = 'word "hello"--test---end ...\ncursor';
  await setDoc(source);
  check('渲染档只改显示，源码逐字保持 ASCII', await text(), source);
  check('引号、破折号和省略号渲染装饰', await widgets(), ['“', '”', '–', '—', '…']);
  await dispatch('view.source.toggle');
  check('切到源码模式立即揭示所有 ASCII 标点', await widgets(), []);
  check('源码模式不改写文档', await text(), source);
  await dispatch('view.source.toggle');
  check('切回 Live 恢复智能标点装饰', await widgets(), ['“', '”', '–', '—', '…']);
  await dispatch('edit.smartQuotes.toggle');
  check('不键入即移除引号装饰，保留破折号与省略号', await widgets(), ['–', '—', '…']);
  await dispatch('edit.smartDashes.toggle');
  check('两个开关关闭即移除全部装饰', await widgets(), []);
  await dispatch('edit.smartQuotes.toggle');
  check('不键入即重新显示引号装饰', await widgets(), ['“', '”']);
  check('切换偏好不改写文档', await text(), source);
  await dispatch('edit.substitutions.onInput');
  await dispatch('edit.substitutions.onInput');
  check('输入档互斥且重复选择不反转', await flags(), [true, false, false]);
  check('切换回输入档立即清理装饰', await widgets(), []);

  // 真正合成管线；引号功能开启时，IME 提交的标点也必须保持原样。
  await setDoc('');
  await dispatch('edit.smartDashes.toggle');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '你"...' });
  await frame.waitForFunction(() => !window.editor.composing);
  check('IME 提交不丢字、不重复、不改写合成标点', await text(), '你"...');
  await cdp.detach();
  await dispatch('edit.smartDashes.toggle');

  await page.reload();
  frame = await ready();
  await frame.waitForFunction(() => window.__MELLOW_SMART_PUNCTUATION__.getQuotes());
  check('重载后独立开关与时机恢复', await flags(), [true, false, false]);
  await dispatch('edit.substitutions.settings');
  await page.getByText('智能引号', { exact: true }).waitFor();
  check('更多选项直接打开编辑器偏好', await page.getByText('智能破折号', { exact: true }).isVisible(), true);
  // 通过真实设置控件走反向入口，检查引擎即时响应（菜单 checked 来源另由静态护栏锁定）。
  const quoteLabel = page.getByText('智能引号', { exact: true });
  const row = quoteLabel.locator('..');
  await row.locator('input[type="checkbox"]').uncheck();
  check('设置页关闭引号即时同步到引擎', await flags(), [false, false, false]);
  check('macOS 不显示两连字符样式偏好', await page.getByText('将 -- 转换为 —', { exact: true }).count(), 0);
  await context.close();

  // 独立 Chromium context 模拟非 macOS Adapter，仅验证平台门控，不作为原生 Windows 证据。
  const nonMac = await browser.newContext();
  await nonMac.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }));
  page = await nonMac.newPage();
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('mellow.editor.smartQuotes', '0');
    localStorage.setItem('mellow.editor.smartDashes', '1');
    localStorage.setItem('mellow.editor.smartPunctuationOnRender', '0');
    localStorage.setItem('mellow.editor.autoPair', '0');
    localStorage.setItem('mellow.locale', 'zh-CN');
  });
  await page.reload();
  frame = await ready();
  await dispatch('edit.substitutions.settings');
  const dashStyle = page.getByText('将 -- 转换为 —', { exact: true }).locator('..').locator('input');
  await dashStyle.waitFor();
  check('非 macOS 智能破折号开启时样式默认 false', await dashStyle.isChecked(), false);
  await dashStyle.check();
  check('真实设置控件即时推送 em 偏好', await frame.evaluate(() => window.__MELLOW_SMART_PUNCTUATION__.getTwoHyphensToEm()), true);
  await page.locator('.settings-close').click();
  await setDoc('word');
  await page.keyboard.type('---');
  check('em 输入档按 Typora 实际规则保留第三个连字符', await text(), 'word—-');
  await dispatch('edit.substitutions.onRender');
  await setDoc('word--end word---end\ncursor');
  check('em 渲染档同时显示两 / 三连字符', await widgets(), ['—', '—']);
  await page.reload();
  frame = await ready();
  check('重载恢复 em 样式和渲染档', await frame.evaluate(() => [window.__MELLOW_SMART_PUNCTUATION__.getTwoHyphensToEm(), window.__MELLOW_SMART_PUNCTUATION__.getOnRender()]), [true, true]);
  await dispatch('edit.smartDashes.toggle');
  await dispatch('edit.substitutions.settings');
  await page.locator('.settings-panel').waitFor();
  check('关闭智能破折号后隐藏样式偏好', await page.getByText('将 -- 转换为 —', { exact: true }).count(), 0);
  await page.locator('.settings-close').click();
  await dispatch('edit.smartDashes.toggle');
  await dispatch('edit.substitutions.settings');
  const restoredStyle = page.getByText('将 -- 转换为 —', { exact: true }).locator('..').locator('input');
  check('重新开启后保留原样式', await restoredStyle.isChecked(), true);
  await restoredStyle.uncheck();
  await page.locator('.settings-close').click();
  await setDoc('word--end word---end\ncursor');
  check('设置页恢复 en 样式即时更新渲染', await widgets(), ['–', '—']);
  console.log(`Substitutions runtime: ${checks}/${checks} passed (Chromium; native host qualification remains separate)`);
} finally {
  await browser?.close();
  server.stop();
}
