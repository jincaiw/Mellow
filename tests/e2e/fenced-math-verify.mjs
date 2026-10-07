/**
 * 围栏数学（Typora `gitlabMath`，默认开）的**真实渲染**端到端验证（审计 §4.122）。
 *
 * 【为什么要写这个脚本】
 * 围栏数学的实现只在**引擎级单测**（jsdom）里验过 —— 而本轮真正担心的风险不在引擎里：
 * ` ```math ` 围栏**同时**是 CoreEditor `codeBlockStyle` 的作用对象
 * （它给 `FencedCode` 加 `BlockWrapper('cm-md-codeBlockWrapper')` + `Decoration.line('cm-md-monospace cm-md-codeBlock')`），
 * 而引擎的数学块是 `Decoration.replace({ block: true })`。
 * CM6 文档说 BlockWrapper「affects any line or **block widget** that starts inside its range」⇒ 可嵌套，
 * 但**「文档说可以」不等于「真的没问题」** —— 本脚本用真实浏览器 + 真实 CoreEditor 样式验一次：
 *   · 围栏是否真的被替换成数学块；
 *   · 块是否**有非零尺寸**（被包装器压成 0 高是这类叠加最典型的失败形态）；
 *   · 公式**没有被强制成等宽字体**（`cm-md-monospace *` 的作用面）；
 *   · 光标进入块内是否恢复源码（与 `$$` 块同一套语义）；
 *   · 对照组：` ```latex ` 必须**仍按代码块**渲染（本轮把菜单的宽集合收敛到 `{math}` 之后的行为）。
 *
 * ⚠️ harness 限制（沿用 `default-code-lang-verify.mjs` 的实测结论）：
 *   headless 下**未被 inputHandler 拦截的默认输入不会同步到 CM6 state** ⇒
 *   本脚本**用 dispatch 改文档**，不靠合成按键。
 *
 * 运行：NODE_PATH=<playwright>/node_modules node tests/e2e/fenced-math-verify.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

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

const MATH_DOC = '前置段落\n\n```math\nE = mc^2\n```\n\n后置段落';
const LATEX_DOC = '前置段落\n\n```latex\nE = mc^2\n```\n\n后置段落';
/** 对照组：`$$` 块 —— 它是**改动之前就存在**的数学路径，用来区分
 *  「围栏数学坏了」与「本 harness 里数学渲染本来就没接上」。 */
const DOLLAR_DOC = '前置段落\n\n$$\nE = mc^2\n$$\n\n后置段落';

async function main() {
  const port = await pickFreePort();
  const base = `http://localhost:${port}`;
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: DESKTOP_DIR, stdio: 'ignore', detached: false,
  });
  const browser = await chromium.launch();
  const consoleErrors = [];
  try {
    const deadline = Date.now() + 40000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${base}/editor/index.html`, { method: 'HEAD' })).ok) { ready = true; break; }
      } catch { /* not ready */ }
      await sleep(300);
    }
    if (!ready) throw new Error('vite dev server 未就绪');

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app, #root > *', { timeout: 15000 });

    const frame = await (async () => {
      const limit = Date.now() + 20000;
      while (Date.now() < limit) {
        for (const candidate of page.frames()) {
          if (candidate.url().includes('/editor/index.html')) {
            const isReady = await candidate.evaluate(() => !!(window.editor || window.webModules?.core)).catch(() => false);
            if (isReady) return candidate;
          }
        }
        await sleep(300);
      }
      throw new Error('editor iframe not ready');
    })();

    // 用 dispatch 改文档（不靠合成按键），并把光标放到块外
    const setDoc = (text, anchor) => frame.evaluate(({ t, a }) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      if (!view) throw new Error('editor view unavailable');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t }, selection: { anchor: a } });
    }, { t: text, a: anchor });

    const probe = () => frame.evaluate(() => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      const dom = view.dom;
      const widget = dom.querySelector('.mellow-math-widget.mellow-math-block');
      const rect = widget ? widget.getBoundingClientRect() : null;
      return {
        doc: view.state.doc.toString(),
        domText: dom.textContent,
        hasWidget: widget !== null,
        widgetHtml: widget ? widget.innerHTML.slice(0, 200) : null,
        widgetSource: widget ? widget.getAttribute('data-mellow-math-source') : null,
        height: rect ? rect.height : null,
        width: rect ? rect.width : null,
        // 该块是否落在 CoreEditor 的代码块包装器里（叠加是否真的发生）
        insideCodeWrapper: widget ? widget.closest('.cm-md-codeBlockWrapper') !== null : null,
        // ⚠️ 「是否被强制等宽」的**有判别力**的量：CoreEditor 的等宽规则是
        //    `.cm-md-monospace, .cm-md-monospace *, .cm-md-codeBlock *, .cm-md-table *`
        //    ⇒ 只有落在 `.cm-md-monospace` **之内**才会被强制。
        //    ❌ 首版断言的是 `getComputedStyle(widget).fontFamily` 不含 mono ——
        //    那量的是 `.cm-content` 的**正文字体回落链**（CoreEditor `setFontFace` 写的是
        //    `<family>, ui-monospace, monospace, Menlo, …`），**任何**元素读出来都含 "mono"
        //    ⇒ 它对「是否被代码块样式污染」**没有判别力**（首跑因此误报）。
        insideMonospaceScope: widget ? widget.closest('.cm-md-monospace') !== null : null,
        // 文档里是否还有「代码块行」（latex 对照用）：数学块的行会被 block replace 掉 ⇒ 应为 false
        hasCodeBlockLine: dom.querySelector('.cm-md-codeBlock') !== null,
      };
    });

    const waitForWidget = async (want) => {
      const limit = Date.now() + 8000;
      while (Date.now() < limit) {
        const p = await probe();
        if (p.hasWidget === want) return p;
        await sleep(150);
      }
      return probe();
    };

    // ── 1. ```` ```math ```` → 渲染成数学块 ────────────────────────────────
    await setDoc(MATH_DOC, 0);
    let p = await waitForWidget(true);
    check('```math 围栏被替换为块级数学 widget', p.hasWidget, JSON.stringify(p.widgetSource));
    check('widget 覆盖整段（含围栏行）', p.widgetSource === '```math\nE = mc^2\n```', JSON.stringify(p.widgetSource));
    check('DOM 里不再出现围栏文本 ```math', !p.domText.includes('```math'), JSON.stringify(p.domText.slice(0, 60)));
    check('widget 有非零尺寸（未被包装器压成 0 高）',
      p.height !== null && p.height > 4 && p.width !== null && p.width > 4,
      `h=${p.height} w=${p.width}`);
    check('该围栏的「代码块行」已被替换掉（无 .cm-md-codeBlock 残留）', p.hasCodeBlockLine === false);
    check('widget **不在**等宽作用域内（`.cm-md-monospace` 之内会被强制等宽字体）',
      p.insideMonospaceScope === false);
    console.log(`ℹ️ 叠加实况：insideCodeWrapper=${p.insideCodeWrapper}  insideMonospaceScope=${p.insideMonospaceScope}`);

    // ── 2. 对照组 `$$`：区分「围栏数学坏了」与「harness 里数学渲染本来就没接上」──
    await setDoc(DOLLAR_DOC, 0);
    const dollar = await waitForWidget(true);
    const mathRendersInHarness = dollar.hasWidget
      && typeof dollar.widgetHtml === 'string' && /mjx|katex|svg|mathml/i.test(dollar.widgetHtml);
    console.log(`ℹ️ 对照组 \`$$\`：hasWidget=${dollar.hasWidget}  html=${String(dollar.widgetHtml).slice(0, 80)}`);
    console.log(`ℹ️ ⇒ 本 harness 里数学**渲染**是否接通 = ${mathRendersInHarness}`);
    check('对照组 `$$` 也被替换为数学 widget（数学块路径本身可用）', dollar.hasWidget);
    if (mathRendersInHarness) {
      // 渲染接通时，围栏数学也必须渲染出同样的形态
      check('围栏数学与 `$$` 的渲染形态一致（都渲染出 mjx/katex/svg）',
        /mjx|katex|svg|mathml/i.test(String(p.widgetHtml)));
    } else {
      // ⚠️ 渲染未接通 ⇒ **不得**把「显示原始 TeX」记成围栏数学的缺陷：
      //    两条路径都只是 fallback 到源码文本（`renderMathSource` 的兜底）。
      console.log('ℹ️ 渲染未接通 ⇒ 「widget 显示原始 TeX」是 harness 的**共同**表现，不是围栏数学的缺陷');
      check('未接通时两条路径表现一致（都不含 mjx/katex）',
        !/mjx|katex/i.test(String(p.widgetHtml)) && !/mjx|katex/i.test(String(dollar.widgetHtml)));
    }

    // ── 3. 光标进入块内 → 恢复源码 ─────────────────────────────────────────
    await setDoc(MATH_DOC, MATH_DOC.indexOf('E = mc^2'));
    const inside = await waitForWidget(false);
    check('光标进入块内 ⇒ 不再显示 widget', !inside.hasWidget);
    check('光标进入块内 ⇒ 源码可见（围栏文本回到 DOM）', inside.domText.includes('```math'));

    // ── 4. 对照组：```latex 仍是代码块（本轮把菜单集合收敛到 {math}）──────
    // ⚠️ 断言形态的教训：**不能**用「DOM 里能看到 ```latex 文本」来判「它是代码块」——
    //    CoreEditor 的 live-markdown 样式在光标位于块外时会**隐藏围栏标记**（数学块也一样），
    //    故那个断言对两种情况都会失败。有判别力的量是「**有没有代码块行**」：
    //    数学块的行被 block replace 掉 ⇒ `.cm-md-codeBlock` 消失；代码块仍在 ⇒ 存在。
    await setDoc(LATEX_DOC, 0);
    await sleep(800);
    const latex = await probe();
    check('```latex **不**被当作数学块', !latex.hasWidget);
    check('```latex 仍按**代码块**渲染（.cm-md-codeBlock 行仍在）', latex.hasCodeBlockLine === true);

    // ── 5. 无装饰冲突导致的 console 报错 ──────────────────────────────────
    const relevant = consoleErrors.filter((t) => !/favicon|Download the React DevTools/i.test(t));
    check('渲染期间无 console 错误 / 未捕获异常', relevant.length === 0, relevant.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
    vite.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
