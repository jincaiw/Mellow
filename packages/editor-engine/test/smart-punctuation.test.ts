/**
 * Smart Punctuation 测试（master-plan R2-1：Typora 智能标点 parity）。
 * 覆盖：弯引号上下文判定 / em-dash 安全约束（hr、表格、三连击）/ 开关状态
 * / **代码上下文守卫（spec §11 / §16）**。
 */

import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  isInsideCodeContext,
  isSmartDashesEnabled,
  isSmartPunctuationEnabled,
  isSmartQuotesEnabled,
  setSmartDashes,
  setSmartPunctuation,
  setSmartPunctuationOnRender,
  setSmartQuotes,
  setTwoHyphensToEm,
  shouldEmDash,
  smartQuoteFor,
} from '../src/smartPunctuation';
import { install, resetModeState } from '../src/index';
import { setSourceMode } from '../src/mode';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { setUpEditor, sleep, waitFor } from './harness';

describe('smartQuoteFor（直引号 → 弯引号）', () => {
  it('行首/空前置 → 左引号', () => {
    expect(smartQuoteFor('"', '')).toBe('“');
    expect(smartQuoteFor("'", '')).toBe('‘');
  });

  it('空白/开括号前置 → 左引号', () => {
    expect(smartQuoteFor('"', ' ')).toBe('“');
    expect(smartQuoteFor('"', '(')).toBe('“');
    expect(smartQuoteFor('"', '（')).toBe('“');
  });

  it('字母/中文后 → 右引号', () => {
    expect(smartQuoteFor('"', 'a')).toBe('”');
    expect(smartQuoteFor('"', '文')).toBe('”');
    expect(smartQuoteFor("'", 's')).toBe('’');
  });

  it('闭合引号后再输 → 交替', () => {
    // “abc 后输入 → 右引号（成对闭合）
    expect(smartQuoteFor('"', 'c')).toBe('”');
  });

  it('非引号输入原样返回', () => {
    expect(smartQuoteFor('a', ' ')).toBe('a');
    expect(smartQuoteFor('，', 'x')).toBe('，');
  });
});

describe('shouldEmDash（-- + 空格 → em-dash 安全判定）', () => {
  it('行内 -- 触发', () => {
    expect(shouldEmDash('word --')).toBe(true);
    expect(shouldEmDash('中 --')).toBe(true);
  });

  it('行首 -- 不触发（hr 输入中途）', () => {
    expect(shouldEmDash('--')).toBe(false);
  });

  it('三连 - 中途不触发（hr 语法保护）', () => {
    expect(shouldEmDash('x ---')).toBe(false);
  });

  it('表格 delimiter 行不触发（| --- | 内）', () => {
    expect(shouldEmDash('| a | b |')).toBe(false); // 无 -- 结尾
    expect(shouldEmDash('| --- | --')).toBe(false); // 有 -- 结尾但含 |：不触发
  });

  it('非 -- 结尾不触发', () => {
    expect(shouldEmDash('word -')).toBe(false);
    expect(shouldEmDash('word')).toBe(false);
  });
});

describe('开关状态', () => {
  afterEach(() => {
    setSmartPunctuation(false); // 复位默认
  });

  it('默认关闭', () => {
    expect(isSmartPunctuationEnabled()).toBe(false);
  });

  it('setSmartPunctuation 切换', () => {
    setSmartPunctuation(true);
    expect(isSmartPunctuationEnabled()).toBe(true);
    setSmartPunctuation(false);
    expect(isSmartPunctuationEnabled()).toBe(false);
  });
});

// ─────────────────────── 代码上下文守卫（spec §11 / §16） ───────────────────────
//
// 立此分节的理由（2026-10-01 审计 §4.35）：
// 智能标点是**全局 inputHandler**，原先**没有代码感知** —— 开启后，在 `` `code` ``
// 或代码围栏内键入 `"` 会被改写成弯引号，即**静默改写代码文本**（spec §2 唯一真源 / §16）。
// 而既有用例 `format-code-fence.test.ts`「code 内编辑保留源码（无 smart punctuation 改写）」
// 用的是**程序化 `dispatch`** —— inputHandler 只对**用户输入**触发，故该断言恒真、覆盖为零。
//
// 本节的测试**走真实的 inputHandler facet 链**（`state.facet(EditorView.inputHandler)`），
// 这是 jsdom 下能到达的最接近真实按键的路径；不是 `view.dispatch` 那种绕过 handler 的形态。

/** 依次调用已注册的 inputHandler，直到某个接管（返回 true）—— 与 CodeMirror 的调用方式一致 */
function typeThroughInputHandler(view: EditorView, from: number, text: string): boolean {
  const handlers = view.state.facet(EditorView.inputHandler);
  // 第 5 个参数是**惰性事务工厂**（`() => Transaction`），即「未被接管时 CodeMirror 会插入的事务」
  const insert = () => view.state.update({ changes: { from, insert: text } });
  for (const handler of handlers) {
    if (handler(view, from, from, text, insert)) return true;
  }
  return false;
}

describe('代码上下文守卫（spec §11 inline code / §16 code fence）', () => {
  beforeEach(() => {
    resetModeState();
    setSmartPunctuation(true); // 守卫只在功能开启时才可能被触发，故本分节全程开启
  });
  afterEach(() => {
    setSmartPunctuation(false);
  });

  it('isInsideCodeContext：行内代码内为 true、普通文本为 false', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const inside = doc.indexOf('code') + 2; // `code` 内部
      const outside = doc.indexOf(' b') + 1; // 节点外
      expect(isInsideCodeContext(view.state, inside)).toBe(true);
      expect(isInsideCodeContext(view.state, outside)).toBe(false);
    } finally { view.destroy(); }
  });

  it('isInsideCodeContext：代码围栏内为 true、围栏外为 false', async () => {
    const view = setUpEditor('```\nconst x = 1;\n```\n\nplain');
    try {
      await sleep();
      expect(isInsideCodeContext(view.state, 8)).toBe(true); // 'const' 内
      expect(isInsideCodeContext(view.state, 21)).toBe(false); // 'plain' 内
    } finally { view.destroy(); }
  });

  it('行内代码内键入 " → inputHandler 不接管（保持直引号，不被改成弯引号）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const pos = doc.indexOf('code') + 4; // `code` 末尾
      const handled = typeThroughInputHandler(view, pos, '"');
      expect(handled).toBe(false);
      // handler 未接管 → 文本一字未改（真实浏览器中 CodeMirror 会插入用户输入的直引号）
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  it('代码围栏内键入 " → inputHandler 不接管', async () => {
    const view = setUpEditor('```\nconst x = "abc"\n```');
    try {
      await sleep();
      const before = view.state.doc.toString();
      const pos = before.indexOf('"abc"') + 5; // 代码文本内
      const handled = typeThroughInputHandler(view, pos, '"');
      expect(handled).toBe(false);
      expect(view.state.doc.toString()).toBe(before);
    } finally { view.destroy(); }
  });

  it('反向对照：普通文本中键入 " → inputHandler 接管并转成弯引号（守卫不是「一律不转」）', async () => {
    const view = setUpEditor('a b');
    try {
      await sleep();
      const handled = typeThroughInputHandler(view, 3, '"');
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe('a b”'); // 'b' 之后 → 右引号
    } finally { view.destroy(); }
  });

  it('反向对照：行内代码**之后**的普通文本仍可转换（守卫范围不越界）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const afterCode = doc.length; // 文档末尾，已在节点外
      const handled = typeThroughInputHandler(view, afterCode, '"');
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe('a `code` b”');
    } finally { view.destroy(); }
  });
});

// ─────────────────── 渲染期转换（Typora `convertSmartOnRender`，2026-10-08 审计 §4.150） ───────────────────
//
// 语义：**文档文本保持 ASCII**，只在**显示**上呈现弯引号 / em dash。
// ⚠️ 被测内容一律放在**第 2 行**：本实现与 Live Preview 的 marker reveal 同精神 ——
//    **光标所在行揭示源码**，而 `setUpEditor` 后光标在 0（第 1 行）⇒ 第 1 行永远不装饰。

/** 当前渲染的弯引号 / em dash 装饰文本（按 DOM 顺序） */
function smartPants(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.cm-smart-pants'))
    .map((e) => e.textContent ?? '');
}

describe('渲染期转换（convertSmartOnRender）', () => {
  const CURSOR_LINE = 'cursor line\n';

  beforeEach(() => { resetModeState(); });
  afterEach(() => {
    setSmartPunctuation(false);
    setSmartPunctuationOnRender(false);
  });

  it('默认（功能关）⇒ 不装饰', () => {
    const view = setUpEditor(`${CURSOR_LINE}say "hi" here`);
    try { expect(smartPants(view)).toEqual([]); } finally { view.destroy(); }
  });

  it('功能开但**渲染期关** ⇒ 仍不装饰（那是输入期档）', () => {
    setSmartPunctuation(true);
    const view = setUpEditor(`${CURSOR_LINE}say "hi" here`);
    try { expect(smartPants(view)).toEqual([]); } finally { view.destroy(); }
  });

  it('功能开 + 渲染期开 ⇒ 直引号渲染为弯引号，且**文档文本保持 ASCII**', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor(`${CURSOR_LINE}say "hi" here`);
    try {
      expect(smartPants(view)).toEqual(['“', '”']);
      expect(view.state.doc.toString()).toBe(`${CURSOR_LINE}say "hi" here`); // 源文本未变
    } finally { view.destroy(); }
  });

  it('**光标所在行揭示源码**（该行不装饰）', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    // 光标在第 1 行 ⇒ 第 1 行的引号不装饰、第 2 行装饰
    const view = setUpEditor('say "hi"\nand "x"');
    try { expect(smartPants(view)).toEqual(['“', '”']); } finally { view.destroy(); }
  });

  it('代码上下文跳过（行内代码内的直引号不装饰）', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor(`${CURSOR_LINE}a \`x = "1"\` b`);
    try { expect(smartPants(view)).toEqual([]); } finally { view.destroy(); }
  });

  it('`-- ` 渲染为 em dash，文档仍是 `--`', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor(`${CURSOR_LINE}word -- end`);
    try {
      expect(smartPants(view)).toEqual(['–']);
      expect(view.state.doc.toString()).toBe(`${CURSOR_LINE}word -- end`);
    } finally { view.destroy(); }
  });

  it('渲染期开时**输入期改写停用**（inputHandler 不接管 —— 与 Typora 的 `!convertSmartOnRender` 同语义）', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor(`${CURSOR_LINE}say `);
    try {
      expect(typeThroughInputHandler(view, CURSOR_LINE.length + 4, '"')).toBe(false);
      expect(view.state.doc.toString()).toBe(`${CURSOR_LINE}say `); // 未被改写
    } finally { view.destroy(); }
  });
});

// ───────────── 智能引号 / 智能破折号独立开关（G7-MENU-05，Typora smartQuote / smartDash） ─────────────
//
// Typora 的 Edit → Substitutions 把 Smart Quotes 与 Smart Dashes 作为**两个独立**
// 偏好项。Mellow 原先只有一个 `setSmartPunctuation` ⇒ 无法只开其一。
// 本节覆盖：兼容 API 语义 / 输入期独立 / 渲染期独立 / 运行期切换立即重绘 / undo。
describe('独立开关（smart quotes / smart dashes）', () => {
  beforeEach(() => {
    resetModeState();
    setSmartPunctuation(false);
    setSmartPunctuationOnRender(false);
  });
  afterEach(() => {
    setSmartPunctuation(false);
    setSmartPunctuationOnRender(false);
  });

  it('兼容 API：set(true) 同时开启两者，set(false) 同时关闭两者', () => {
    setSmartPunctuation(true);
    expect(isSmartQuotesEnabled()).toBe(true);
    expect(isSmartDashesEnabled()).toBe(true);
    setSmartPunctuation(false);
    expect(isSmartQuotesEnabled()).toBe(false);
    expect(isSmartDashesEnabled()).toBe(false);
  });

  it('兼容 API：get 在任一开启时返回 true（只开其一不被误报为关闭）', () => {
    setSmartQuotes(true);
    expect(isSmartPunctuationEnabled()).toBe(true);
    setSmartQuotes(false);
    setSmartDashes(true);
    expect(isSmartPunctuationEnabled()).toBe(true);
    setSmartDashes(false);
    expect(isSmartPunctuationEnabled()).toBe(false);
  });

  it('独立 setter 互不牵连', () => {
    setSmartQuotes(true);
    expect(isSmartQuotesEnabled()).toBe(true);
    expect(isSmartDashesEnabled()).toBe(false);
    setSmartDashes(true);
    setSmartQuotes(false);
    expect(isSmartQuotesEnabled()).toBe(false);
    expect(isSmartDashesEnabled()).toBe(true);
  });

  it('输入期：只开智能引号 ⇒ 引号转换、`-- ` 不转换', () => {
    setSmartQuotes(true);
    const view = setUpEditor('word --');
    try {
      // 在 `--` 之后键入空格：dash 分支独立关闭 ⇒ 不接管
      expect(typeThroughInputHandler(view, 7, ' ')).toBe(false);
      expect(view.state.doc.toString()).toBe('word --'); // 未被改写
      // 引号仍工作（'word --' 末尾 → 右引号）
      expect(typeThroughInputHandler(view, 7, '"')).toBe(true);
      expect(view.state.doc.toString()).toBe('word --”');
    } finally { view.destroy(); }
  });

  it.each(['', ' end'])('输入期：只开破折号在第二个连字符转换且光标紧随符号（后续正文 %j）', (suffix) => {
    setSmartDashes(true);
    const view = setUpEditor(`word -${suffix}`);
    try {
      expect(typeThroughInputHandler(view, 6, '-')).toBe(true);
      expect(view.state.doc.toString()).toBe(`word –${suffix}`);
      expect(view.state.selection.main.anchor).toBe(6);
      const end = view.state.doc.length;
      expect(typeThroughInputHandler(view, end, '"')).toBe(false);
      expect(view.state.doc.toString()).toBe(`word –${suffix}`);
    } finally { view.destroy(); }
  });

  it.each(['', ' end'])('输入期：智能破折号在第三个句点转换省略号并保持光标（后续正文 %j）', (suffix) => {
    setSmartDashes(true);
    const view = setUpEditor(`wait..${suffix}`);
    try {
      expect(typeThroughInputHandler(view, 6, '.')).toBe(true);
      expect(view.state.doc.toString()).toBe(`wait…${suffix}`);
      expect(view.state.selection.main.anchor).toBe(5);
    } finally { view.destroy(); }
  });

  it.each([false, true])('仅引号或渲染档不在输入期转换省略号（渲染档 %j）', (onRender) => {
    setSmartQuotes(true);
    setSmartDashes(onRender);
    setSmartPunctuationOnRender(onRender);
    const view = setUpEditor('wait..');
    try {
      expect(typeThroughInputHandler(view, 6, '.')).toBe(false);
      expect(view.state.doc.toString()).toBe('wait..');
    } finally { view.destroy(); }
  });

  it.each(['a `wait..` b', '```\nwait..\n```', 'wait\\..'])('省略号不改写代码或转义序列 %j', (source) => {
    setSmartDashes(true);
    const view = setUpEditor(source);
    try {
      const pos = source.indexOf('..') + 2;
      expect(typeThroughInputHandler(view, pos, '.')).toBe(false);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it('渲染期省略号只随智能破折号开关显示，源码与选区不变', () => {
    setSmartPunctuationOnRender(true);
    const source = 'cursor\nwait... here...';
    const view = setUpEditor(source);
    try {
      setSmartQuotes(true);
      expect(smartPants(view)).toEqual([]);
      const selection = view.state.selection;
      setSmartDashes(true);
      expect(smartPants(view)).toEqual(['…', '…']);
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.eq(selection)).toBe(true);
      setSmartDashes(false);
      expect(smartPants(view)).toEqual([]);
    } finally { view.destroy(); }
  });

  it('渲染期省略号跳过代码与转义，并在光标行揭示源码', () => {
    setSmartDashes(true);
    setSmartPunctuationOnRender(true);
    const source = 'cursor\nwait... `code...` \\...\n```\ncode...\n```';
    const view = setUpEditor(source);
    try {
      expect(smartPants(view)).toEqual(['…']);
      view.dispatch({ selection: { anchor: source.indexOf('wait') } });
      expect(smartPants(view)).toEqual([]);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it('Source Mode 初始不装饰智能标点', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    setSourceMode(true);
    const source = 'cursor\nsay "hi" -- wait...';
    const view = setUpEditor(source);
    try {
      expect(smartPants(view)).toEqual([]);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it('按 view 切换 Source/Live 时立即移除与恢复装饰，源码及选区不变', () => {
    setSmartPunctuation(true);
    setSmartPunctuationOnRender(true);
    const source = 'cursor\nsay "hi" -- wait...';
    const view = setUpEditor(source);
    try {
      expect(smartPants(view)).toEqual(['“', '”', '–', '…']);
      const selection = view.state.selection;
      setSourceMode(true, view);
      view.dispatch({ selection });
      expect(smartPants(view)).toEqual([]);
      setSourceMode(false, view);
      view.dispatch({ selection });
      expect(smartPants(view)).toEqual(['“', '”', '–', '…']);
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.eq(selection)).toBe(true);
    } finally { view.destroy(); }
  });

  it('省略号转换可单步 Undo/Redo', () => {
    setSmartDashes(true);
    const view = new EditorView({
      doc: 'wait..', selection: { anchor: 6 }, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    try {
      expect(typeThroughInputHandler(view, 6, '.')).toBe(true);
      expect(view.state.doc.toString()).toBe('wait…');
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('wait..');
      expect(redo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('wait…');
      expect(view.state.selection.main.anchor).toBe(5);
    } finally { view.destroy(); }
  });

  it('输入期：只开智能引号时，代码守卫仍生效（代码内引号不改写）', () => {
    setSmartQuotes(true);
    const view = setUpEditor('a `code` b');
    try {
      const pos = view.state.doc.toString().indexOf('code') + 4;
      expect(typeThroughInputHandler(view, pos, '"')).toBe(false);
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  it('渲染期：只开智能引号 ⇒ 仅引号装饰、`-- ` 不装饰', () => {
    setSmartQuotes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\nsay "hi" and -- end');
    try {
      expect(smartPants(view)).toEqual(['“', '”']);
      expect(view.state.doc.toString()).toBe('cursor line\nsay "hi" and -- end');
    } finally { view.destroy(); }
  });

  it('渲染期：只开智能破折号 ⇒ 仅 em dash 装饰、引号不装饰', () => {
    setSmartDashes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\nsay "hi" and -- end');
    try {
      expect(smartPants(view)).toEqual(['–']);
      expect(view.state.doc.toString()).toBe('cursor line\nsay "hi" and -- end');
    } finally { view.destroy(); }
  });

  it('渲染期：代码守卫对独立开关同样生效', () => {
    setSmartQuotes(true);
    setSmartDashes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\na `x = "1"` and `y -- z`');
    try { expect(smartPants(view)).toEqual([]); } finally { view.destroy(); }
  });

  it('运行期切换（无输入）立即刷新既有装饰', async () => {
    setSmartQuotes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\nsay "hi" and -- end');
    try {
      expect(smartPants(view)).toEqual(['“', '”']);
      // 关闭智能引号：无需任何输入 / 光标移动，装饰应立刻消失
      setSmartQuotes(false);
      expect(await waitFor(() => smartPants(view).length === 0)).toBe(true);
      // 打开智能破折号：同理立即出现
      setSmartDashes(true);
      expect(await waitFor(() => smartPants(view).join('') === '–')).toBe(true);
      // 关闭渲染期档：全部清除
      setSmartPunctuationOnRender(false);
      expect(await waitFor(() => smartPants(view).length === 0)).toBe(true);
    } finally { view.destroy(); }
  });

  it('运行期切换不影响文档文本（source fidelity）', async () => {
    setSmartQuotes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\nsay "hi"');
    try {
      setSmartQuotes(false);
      setSmartDashes(true);
      setSmartPunctuationOnRender(false);
      await sleep(10);
      expect(view.state.doc.toString()).toBe('cursor line\nsay "hi"');
    } finally { view.destroy(); }
  });

  it('合成期间开关变更不重建装饰；合成结束补刷新（IME guard）', async () => {
    installCompositionTracking();
    resetCompositionState();
    setSmartQuotes(true);
    setSmartPunctuationOnRender(true);
    const view = setUpEditor('cursor line\nsay "hi"');
    try {
      expect(smartPants(view)).toEqual(['“', '”']);
      document.dispatchEvent(new Event('compositionstart'));
      setSmartQuotes(false); // 合成中：只记版本，不重建
      await sleep(10);
      expect(smartPants(view)).toEqual(['“', '”']);
      document.dispatchEvent(new Event('compositionend'));
      expect(await waitFor(() => smartPants(view).length === 0)).toBe(true);
    } finally {
      resetCompositionState();
      view.destroy();
    }
  });

  it('输入期改写可 undo/redo（兼容 API 与独立开关同一路径）', () => {
    setSmartQuotes(true);
    const view = new EditorView({
      doc: 'a b',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    try {
      expect(typeThroughInputHandler(view, 3, '"')).toBe(true);
      expect(view.state.doc.toString()).toBe('a b”');
      undo(view);
      expect(view.state.doc.toString()).toBe('a b');
      redo(view);
      expect(view.state.doc.toString()).toBe('a b”');
    } finally { view.destroy(); }
  });
});

// Typora main.js：第二个连字符触发 en dash，en dash 后再键入连字符触发 em dash。
describe('Typora en/em dash 触发时机', () => {
  beforeEach(() => {
    resetModeState();
    setSmartPunctuation(false);
    setSmartPunctuationOnRender(false);
    setTwoHyphensToEm(false);
    setSmartDashes(true);
  });
  afterEach(() => {
    setSmartPunctuation(false);
    setSmartPunctuationOnRender(false);
    setTwoHyphensToEm(false);
  });

  it('twoHyphensToEm 输入档第二键转 em dash，第三键按 Typora 实际分支保留', () => {
    setTwoHyphensToEm(true);
    const view = setUpEditor('word-');
    try {
      expect(typeThroughInputHandler(view, 5, '-')).toBe(true);
      expect(view.state.doc.toString()).toBe('word—');
      // Typora 输入分支只匹配 -- / – / -，不会吞掉 em dash 后的新连字符。
      expect(typeThroughInputHandler(view, 5, '-')).toBe(false);
      expect(view.state.doc.toString()).toBe('word—');
    } finally { view.destroy(); }
  });

  it('em dash 转换后往返移动光标不吞掉后续连字符', () => {
    setTwoHyphensToEm(true);
    const view = setUpEditor('word-');
    try {
      expect(typeThroughInputHandler(view, 5, '-')).toBe(true);
      view.dispatch({ selection: { anchor: 0 } });
      view.dispatch({ selection: { anchor: 5 } });
      expect(typeThroughInputHandler(view, 5, '-')).toBe(false);
    } finally { view.destroy(); }
  });

  it('不等待空格的转换可单步 Undo/Redo，光标位置随之恢复', () => {
    const view = new EditorView({
      doc: 'word-', selection: { anchor: 5 }, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    try {
      expect(typeThroughInputHandler(view, 5, '-')).toBe(true);
      expect(view.state.doc.toString()).toBe('word–');
      expect(undo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('word-');
      expect(redo(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('word–');
      expect(view.state.selection.main.head).toBe(5);
    } finally { view.destroy(); }
  });

  it('en/em 设置无输入即时重绘，文档与选区不变', () => {
    setSmartPunctuationOnRender(true);
    const source = 'cursor\nword--end word---end';
    const view = setUpEditor(source);
    try {
      const selection = view.state.selection;
      expect(smartPants(view)).toEqual(['–', '—']);
      setTwoHyphensToEm(true);
      expect(smartPants(view)).toEqual(['—', '—']);
      setTwoHyphensToEm(false);
      expect(smartPants(view)).toEqual(['–', '—']);
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.eq(selection)).toBe(true);
    } finally { view.destroy(); }
  });

  it.each(['', ' end'])('第二个连字符立即转换 en dash，不等待空格（后续正文 %j）', (suffix) => {
    const view = setUpEditor(`word-${suffix}`);
    try {
      expect(typeThroughInputHandler(view, 5, '-')).toBe(true);
      expect(view.state.doc.toString()).toBe(`word–${suffix}`);
      expect(view.state.selection.main.head).toBe(5);
    } finally { view.destroy(); }
  });

  it.each(['word–', 'word--'])('第三个连字符转换 em dash（前缀 %j）', (prefix) => {
    const view = setUpEditor(prefix);
    try {
      expect(typeThroughInputHandler(view, prefix.length, '-')).toBe(true);
      expect(view.state.doc.toString()).toBe('word—');
      expect(view.state.selection.main.head).toBe(5);
    } finally { view.destroy(); }
  });

  it.each(['-', '  --', 'word\\-', '| --- | :-', 'a `x-` b', '```\nx-\n```'])('不改写结构、转义或代码 %j', (source) => {
    const view = setUpEditor(source);
    try {
      const pos = source.lastIndexOf('-') + 1;
      expect(typeThroughInputHandler(view, pos, '-')).toBe(false);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it.each([
    '[label](https://host/path-)', '![alt](image-.png)', '<https://host/path->',
    '[id]: path-.md', '[label](path-', '![alt](image-', 'https://host/path-',
  ])('链接与图片目标不转换连字符 %j', (source) => {
    const view = setUpEditor(source);
    try {
      const pos = source.lastIndexOf('-') + 1;
      expect(typeThroughInputHandler(view, pos, '-')).toBe(false);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it('渲染档保留链接、图片与裸 URL 目标，但正常转换链接标签', () => {
    setSmartPunctuationOnRender(true);
    const source = 'cursor\n[word--label](path--name.md) ![alt](image--name.png) <https://host/a--b> https://host/c--d';
    const view = setUpEditor(source);
    try {
      expect(smartPants(view)).toEqual(['–']);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });

  it('渲染档识别不带空格的 -- 与 ---，保留 ASCII 源码', () => {
    setSmartPunctuationOnRender(true);
    const source = 'cursor\nword--end word---end';
    const view = setUpEditor(source);
    try {
      expect(smartPants(view)).toEqual(['–', '—']);
      expect(view.state.doc.toString()).toBe(source);
    } finally { view.destroy(); }
  });
});
