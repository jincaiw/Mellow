/**
 * Enter / Shift+Enter 语义（PRD §34 + G7-EDIT-07）。
 *
 * 真实装配栈（jsdom）：`markdown()`（含 lang-markdown Prec.high Enter 键位）
 * + `defaultKeymap`（Shift+Enter / undo）+ 引擎 `install(false)`（本模块
 * Prec.highest 接管普通段落）。断言全部通过**真实 keydown 事件**驱动，
 * 不做程序化 dispatch —— 否则输入路径根本没有被覆盖。
 */

import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, isParagraphBreakContext } from '../src/index';
import { installCompositionTracking, resetCompositionState } from '../src/composition';

function makeView(doc: string, caretPos = doc.length): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      keymap.of(defaultKeymap),
      keymap.of(historyKeymap),
      install(false),
    ],
  });
  view.dispatch({ selection: { anchor: caretPos } });
  view.focus();
  return view;
}

function pressKey(
  view: EditorView,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; meta?: boolean; alt?: boolean } = {},
): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
  }));
}

function text(view: EditorView): string {
  return view.state.doc.toString();
}

function caret(view: EditorView): number {
  return view.state.selection.main.head;
}

describe('G7-EDIT-07 — Enter = 新段落（PRD §34）', () => {
  test('段落末尾 Enter 插入空行（\\n\\n），caret 落到新段落行首', () => {
    const view = makeView('abc');
    pressKey(view, 'Enter');
    expect(text(view)).toBe('abc\n\n');
    expect(caret(view)).toBe(5);
    view.destroy();
  });

  test('行中 Enter 把段落切成两段', () => {
    const view = makeView('abcd', 2);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('ab\n\ncd');
    expect(caret(view)).toBe(4);
    view.destroy();
  });

  test('行尾空白被吃掉（不把硬换行空格带进新段落）', () => {
    const view = makeView('abc  ', 5);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('abc\n\n');
    expect(caret(view)).toBe(5);
    view.destroy();
  });

  test('标题末 Enter 开启普通段落', () => {
    const view = makeView('# 标题');
    pressKey(view, 'Enter');
    expect(text(view)).toBe('# 标题\n\n');
    view.destroy();
  });

  test('Shift+Enter 仍是段内软换行（单个 \\n，与 Typora 配对）', () => {
    const view = makeView('abc');
    pressKey(view, 'Enter', { shift: true });
    expect(text(view)).toBe('abc\n');
    expect(caret(view)).toBe(4);
    view.destroy();
  });

  test('一次 Enter = 一个撤销步骤', () => {
    const view = makeView('abc');
    pressKey(view, 'Enter');
    expect(text(view)).toBe('abc\n\n');
    pressKey(view, 'z', { ctrl: true });
    expect(text(view)).toBe('abc');
    view.destroy();
  });

  test('IME 合成期间不接管（合成结束后恢复）', () => {
    installCompositionTracking();
    const view = makeView('你好');
    try {
      document.dispatchEvent(new Event('compositionstart'));
      pressKey(view, 'Enter');
      expect(text(view)).not.toBe('你好\n\n');
      document.dispatchEvent(new Event('compositionend'));
      pressKey(view, 'Enter');
      expect(text(view)).toBe('你好\n\n');
    } finally {
      resetCompositionState();
      view.destroy();
    }
  });
});

describe('G7-EDIT-07 — 非段落上下文原样交还既有实现', () => {
  test('列表项 Enter 续写标记（不插空行）', () => {
    const view = makeView('- a', 3);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('- a\n- ');
    view.destroy();
  });

  test('空列表项 Enter 交还 lang-markdown（不插入段落分隔）', () => {
    // 单测栈用的是 npm 版 @codemirror/lang-markdown（vendored 版有独立 CM 实例，
    // 不能在 jest 里混装）：它对空的次项插空行（nonTightLists 默认开），而
    // CoreEditor 的 vendored 版配置 `nonTightLists:false`（空项删除标记、退出列表）。
    // 两者都**不是**本模块的行为 —— 这里只锁「Enter 没有被段落分隔接管」。
    const view = makeView('- a\n- ', 6);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('- a\n\n- ');
    view.destroy();
  });

  test('引用内 Enter 续写 > 标记', () => {
    const view = makeView('> a', 3);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('> a\n> ');
    view.destroy();
  });

  test('围栏代码内 Enter 只插源码换行', () => {
    const doc = '```\ncode';
    const view = makeView(doc, doc.length);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('```\ncode\n');
    view.destroy();
  });

  test('行内代码内 Enter 不制造段落', () => {
    const view = makeView('`a`', 2);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('`a\n`');
    view.destroy();
  });

  test('数学块内 Enter 只插源码换行（$$…$$ 不被空行打断）', () => {
    const doc = '$$\nx^2\n$$';
    const view = makeView(doc, 5);
    pressKey(view, 'Enter');
    expect(text(view)).toBe('$$\nx^\n2\n$$');
    view.destroy();
  });

  test('空行上 Enter 不接管（由默认实现增加空行）', () => {
    const view = makeView('abc\n\n', 5);
    pressKey(view, 'Enter');
    expect(text(view)).not.toBe('abc\n\n\n\n');
    view.destroy();
  });
});

describe('G7-EDIT-07 — isParagraphBreakContext 判定', () => {
  test('普通段落 / 标题为真；列表 / 引用 / 代码为假', () => {
    const view = makeView('para\n\n- item\n\n> quote\n\n```\ncode\n```\n', 2);
    const state = view.state;
    expect(isParagraphBreakContext(state, 0)).toBe(true); // para
    expect(isParagraphBreakContext(state, state.doc.line(3).from + 2)).toBe(false); // list
    expect(isParagraphBreakContext(state, state.doc.line(5).from + 2)).toBe(false); // quote
    expect(isParagraphBreakContext(state, state.doc.line(8).from)).toBe(false); // fenced code
    view.destroy();
  });
});
