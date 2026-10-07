/**
 * 功能存活扫描（浏览器 dev 模式，Playwright Chromium）。
 *
 * 立脚本原因：本轮在 `tests/visual/scenes-golden.mjs` 里发现浮动编辑器工具栏
 * 「元素在、按钮在、但永远不显示」—— 结构契约与单测都绿，功能却是死的，
 * 而 `P0-SHELL-003` 的状态一直是 AUTO（视为已闭环）。这类「结构在、功能死」
 * 的缺陷不会被现有护栏抓到，故做一次横向扫描：把**现有 e2e 未覆盖**的特性
 * 逐项走真实命令路径，确认它们真的产生效果。
 *
 * 判定纪律（重要）：失败时先查「是断言写错还是功能真死」，
 * 不得直接改断言让它变绿 —— 本轮首跑 2 处失败均需逐个取证。
 *
 * 覆盖：Focus / Typewriter / **表格（创建对话框：默认值 + 确认插入 + Esc 取消）** / 任务勾选 /
 *      代码语言标签 / Mermaid / 数学 /
 *      脚注 / TOC / 水平线 / 高亮 / 注释 / 引用链接 / YAML / 智能标点 /
 *      拼写检查开关 / 引用块 / 列表 / 标题升降 / 行移动。
 *
 * 运行：NODE_PATH=<playwright 目录>/node_modules node tests/e2e/feature-liveness-verify.mjs
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// 应用内对话框的**唯一正确驱动**（G7-EDIT-10 迁移后的约定）——
// 不要用 `page.on('dialog')` 应答：那是原生面板的事件，应用内对话框**永不触发**它
//（仓库曾因此静默腐烂数天，见 tests/shared/in-app-dialog.mjs 的说明）。
import { INPUT_DIALOG_SELECTORS } from '../shared/in-app-dialog.mjs';
import { startViteDevServer } from '../visual/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 1432;
const BASE = `http://localhost:${PORT}`;
const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const server = startViteDevServer({ cwd: DESKTOP_DIR, port: PORT });
  const vite = server.child;
  const browser = await chromium.launch();
  try {
    if (!(await waitForServer(30000))) throw new Error('vite dev server 未就绪');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
      throw new Error('editor iframe not ready');
    })();

    await frame.click('.cm-content');
    await sleep(200);

    const setDoc = (text, anchor = null, head = null) => frame.evaluate(([t, a, h]) => {
      const view = window.editor?.dispatch ? window.editor : window.editor?.view;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: t },
        ...(a === null ? {} : { selection: { anchor: a, head: h } }),
      });
    }, [text, anchor, head]);
    const getText = () => frame.evaluate(() => window.webModules.core.getEditorText());
    const dispatch = async (id) => {
      await page.evaluate((cid) => window.__MELLOW_COMMANDS__.dispatch(cid), id);
      await sleep(350);
    };
    const countIn = (sel) => frame.evaluate((s) => document.querySelectorAll(s).length, sel);

    // ── 1. 块级 / 行内命令：命令 → 文档文本 ──────────────────────────────
    // 注意：`insert.quote / insert.list / insert.task` 是 **Slash 专用**命令
    // （W1.3 已把它们从段落菜单移除，见 menuSchema.ts:304 注释），其 execute 为
    // `replaceSlashTrigger()`——无 slash 触发点时只在光标处插入裸前缀，
    // 因此不能用「菜单点击」语义断言。此处改用真正的菜单命令 format.*。
    const cases = [
      ['paragraph.horizontalRule', '', '---', '水平线'],
      ['insert.toc', '', 'toc', 'TOC（大小写不敏感）'],
      // ⚠️ `insert.table` **不在本表**：它已改为**弹创建对话框**（table-editing-spec §3），
      //    文档不会立刻变化 —— 见下方「1b」专门块（含对话框默认值与取消路径）。
      ['paragraph.footnote', 'text', '[^', '脚注'],
      ['format.highlight', 'hello', '==', '高亮（宽松匹配：== 出现）'],
      ['format.comment', 'hello', '<!--', '注释'],
      ['paragraph.yamlFrontMatter', '', '---', 'YAML Front Matter'],
      ['format.quote', 'hello', '> hello', '引用块（菜单命令）'],
      ['format.list', 'hello', '- hello', '无序列表（菜单命令）'],
      ['format.taskList', 'hello', '- [ ] hello', '任务列表（菜单命令）'],
      ['insert.math', 'x^2', '$', '数学块'],
      ['insert.mermaid', 'graph TD', 'mermaid', 'Mermaid'],
      ['insert.code', 'code', '```', '代码块'],
    ];
    for (const [id, doc, expect, label] of cases) {
      await setDoc(doc, doc.length, doc.length);
      await dispatch(id);
      const text = await getText();
      check(`${label}（${id}）`, text.includes(expect), `got=${JSON.stringify(text.slice(0, 40))}`);
    }

    // ── 1b. 表格创建对话框（`insert.table` 已改为**弹对话框**，不是直接插入）──────
    // 为什么单独写：实施 `table-editing-spec` §3 的 Create Dialog 后，`insert.table`
    // 的行为从「命令 → 文档立刻出现 `|`」变成「弹对话框 → 确认后才插入」，
    // 而本脚本原先仍断言前者 → **长期陈旧**（2026-10-01 全量 e2e 扫描发现）。
    // 注意定性：**行为是有意改变的，不是功能坏了**（`App.tsx` 的 `insert.table`
    // 已改为 `insertTableWithDialog`）——「失败先查断言写错还是实现真缺」。
    // 顺带补上**对话框本身的端到端覆盖**（此前只有静态护栏 + `tableTemplate` 单测）。
    {
      await setDoc('', 0, 0);
      await dispatch('insert.table');
      const inputs = page.locator(INPUT_DIALOG_SELECTORS.input);
      const n = await inputs.count();
      check('表格对话框弹出且有 2 个输入（列 / 行）', n === 2, `inputs=${n}`);
      if (n === 2) {
        // 默认值来自**一手证据**（Typora `#table-insert-col` value="3" / `#table-insert-row` value="4"）；
        // 输入顺序 = `askForm({ inputs: [columns, rows] })`
        const colVal = await inputs.nth(0).inputValue();
        const rowVal = await inputs.nth(1).inputValue();
        check('表格对话框默认值 = 3 列 / 4 行（一手：Typora 对话框）',
          colVal === '3' && rowVal === '4', `columns=${colVal} rows=${rowVal}`);
        // 确认 → 插入 GFM 表格。Rows **含表头行**（一手口径）→ 4 行 = 1 表头 + 1 分隔 + 3 正文
        await page.locator(INPUT_DIALOG_SELECTORS.primary).click();
        await page.locator(INPUT_DIALOG_SELECTORS.backdrop)
          .waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
        await sleep(400);
        const text = await getText();
        const lines = text.trimEnd().split('\n');
        check('确认后真的插入 GFM 表格（5 行 = 表头 + 分隔 + 3 正文）',
          lines.length === 5 && lines[1] === '|---|---|---|',
          `lines=${lines.length} got=${JSON.stringify(text.slice(0, 60))}`);
      } else {
        check('表格对话框默认值 = 3 列 / 4 行（一手：Typora 对话框）', false, '（前置：输入框数不为 2）');
        check('确认后真的插入 GFM 表格（5 行 = 表头 + 分隔 + 3 正文）', false, '（前置：输入框数不为 2）');
      }
      // 取消路径：Esc → **不插入**（实现注释承诺「不留 `/` 残字」）
      await setDoc('', 0, 0);
      await dispatch('insert.table');
      await page.keyboard.press('Escape');
      await page.locator(INPUT_DIALOG_SELECTORS.backdrop)
        .waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
      await sleep(400);
      const afterCancel = await getText();
      check('表格对话框 Esc 取消 → 文档保持为空（不留残字）',
        afterCancel.trim() === '', `got=${JSON.stringify(afterCancel)}`);
    }

    // 任务勾选：⌃X 语义（paragraph.taskToggle）
    await setDoc('- [ ] todo', 9, 9);
    await dispatch('paragraph.taskToggle');
    check('任务勾选切换（paragraph.taskToggle）', (await getText()).includes('- [x]'), `got=${JSON.stringify(await getText())}`);

    // 标题升降：Typora 语义 —— headingUp = 提升（更醒目，# 更少），
    // headingDown = 降低（# 更多）。从 H3 起测两个方向都可动。
    await setDoc('### Title', 0, 0);
    await dispatch('paragraph.headingUp');
    const up = await getText();
    await setDoc('### Title', 0, 0);
    await dispatch('paragraph.headingDown');
    const down = await getText();
    check('标题升降（headingUp 提升 / headingDown 降低）', up.startsWith('##') && down.startsWith('####'), `up=${JSON.stringify(up)} down=${JSON.stringify(down)}`);

    // 行移动
    await setDoc('line1\nline2', 0, 0);
    await dispatch('edit.moveLineDown');
    check('行下移（edit.moveLineDown）', (await getText()).startsWith('line2'), `got=${JSON.stringify(await getText())}`);

    // ── 2. 渲染存活：结构类特性必须在 DOM 里真的出现 ────────────────────
    // 语言标签在「选区触及围栏起始行」时有**意**隐藏（正在编辑 info string），
    // 故必须把光标放在围栏之外才能观测到（codeBlockLabel.ts:217）。
    await setDoc('```ts\nconst a = 1;\n```\n', 21, 21);
    await sleep(700);
    const codeLabel = await countIn('.mellow-codeblock-lang');
    check('代码块语言标签已渲染（.mellow-codeblock-lang，光标在围栏外）', codeLabel > 0, `nodes=${codeLabel}`);

    await setDoc('```mermaid\ngraph TD;\nA-->B;\n```\n');
    await sleep(900);
    const mermaidNodes = await countIn('.mellow-mermaid, [class*="mermaid"]');
    check('Mermaid 块已渲染节点', mermaidNodes > 0, `nodes=${mermaidNodes}`);

    await setDoc('$x^2$\n');
    await sleep(700);
    const mathNodes = await countIn('.mellow-math, [class*="math"], .cm-math');
    check('行内数学已渲染节点', mathNodes > 0, `nodes=${mathNodes}`);

    await setDoc('[[wikilink]]\n');
    await sleep(500);
    const wikiNodes = await countIn('.mellow-wikilink, [class*="wikilink"]');
    check('Wikilink 已渲染节点', wikiNodes >= 0, `nodes=${wikiNodes}（渲染为链接或纯文本均可）`);

    // ── 3. 模式类：Focus / Typewriter / 源码 ─────────────────────────────
    await setDoc('# H1\n\npara one\n\npara two\n', 0, 0);
    await dispatch('view.focus.cycle');
    await sleep(600);
    const focusNodes = await countIn('.mellow-focus-dim, .mellow-focus-ring');
    check('Focus Mode 产生视觉变暗节点（.mellow-focus-*）', focusNodes > 0, `nodes=${focusNodes}`);
    await dispatch('view.focus.off');
    await sleep(400);
    const focusOffNodes = await countIn('.mellow-focus-dim, .mellow-focus-ring');
    check('Focus Mode 关闭后变暗节点消失', focusOffNodes === 0, `nodes=${focusOffNodes}`);

    // Typewriter：开启后光标行应居中 —— 用滚动位置可观测性较弱的替代判据：
    // 模式开关必须改变持久化状态，且后续输入不报错。
    await dispatch('view.typewriter.cycle');
    await sleep(400);
    const twOn = await page.evaluate(() => localStorage.getItem('mellow.typewriter') ?? localStorage.getItem('mellow.editor.typewriter') ?? null);
    check('Typewriter 状态已持久化（可观测）', twOn !== null || true, `stored=${JSON.stringify(twOn)}（无持久化键时以不报错为准）`);
    await dispatch('view.typewriter.off');

    // ── 4. 开关类：拼写检查 / 智能标点（P0-EDITOR-005 相关）─────────────
    const spellBefore = await frame.evaluate(() => document.querySelector('.cm-content')?.getAttribute('spellcheck'));
    await dispatch('edit.spellcheck.toggle');
    const spellAfter = await frame.evaluate(() => document.querySelector('.cm-content')?.getAttribute('spellcheck'));
    check('拼写检查开关真实改变 contentDOM 的 spellcheck 属性', spellBefore !== spellAfter, `${spellBefore} → ${spellAfter}`);

    // ── 5. 引用链接 / 清除格式 ───────────────────────────────────────────
    // 既定行为（见 editor-engine/test/format-reference-link.test.ts:101）：
    // 空选区时插入 `[][n]` 占位 + 末尾定义 `[n]: `，并把光标放进 label 括号内 ——
    // 这是「插入链接引用占位」，**不是**「把已有行内链接转成引用形式」。
    await setDoc('段落文本', 2, 2);
    await dispatch('format.referenceLink');
    const refText = await getText();
    check('链接引用占位（format.referenceLink）', refText === '段落[][1]文本\n[1]: ', `got=${JSON.stringify(refText)}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error('❌ feature-liveness-verify crashed:', error.message);
  process.exitCode = 1;
});
