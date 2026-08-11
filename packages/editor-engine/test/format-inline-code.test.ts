/**
 * Inline Code —— 完整行为矩阵。
 * marker: backtick（`` ` ``；GFM 多 backtick 包裹时数量一致）
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import {
  setUpEditor, moveCaret, selectRange, markerTexts, caretPos,
  wrapSelection, insertPair, insertAt, sleep, startComposition, endComposition,
} from './harness';

function setUpWithHistory(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

function setUpWithComposition(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  view.focus();
  return view;
}

describe('InlineCode — marker reveal', () => {
  test('idle → backtick 隐藏', async () => {
    const view = setUpEditor('`code`x');
    await sleep();
    moveCaret(view, 7); // x 后（节点外）
    await sleep();
    expect(markerTexts(view)).toEqual(['`', '`']);
  });

  test('caret inside → source（backtick 显示）', async () => {
    const view = setUpEditor('`code`x');
    await sleep();
    moveCaret(view, 3);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('多 backtick（``code``）→ 两个 backtick 各隐藏', async () => {
    const view = setUpEditor('``code``x');
    await sleep();
    moveCaret(view, 9); // x 后
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toEqual(['``', '``']);
  });

  test('内容含 backtick（``a`b``）GFM 双包裹', async () => {
    const view = setUpEditor('``a`b``x');
    await sleep();
    moveCaret(view, 8); // x 后
    await sleep();
    expect(markerTexts(view)).toEqual(['``', '``']);
  });
});

describe('InlineCode — nested（code 内字面量）', () => {
  test('code 内 ** 是字面量（不解析为 bold）', async () => {
    const view = setUpEditor('`a **b** c`x');
    await sleep();
    moveCaret(view, 12); // x 后
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '`').length).toBe(2);
    // 内容中 ** 保持字面（不被标记为 bold marker）
    expect(texts.filter((t) => t === '**').length).toBe(0);
  });
});

describe('InlineCode — selection wrap / empty / toggle / undo', () => {
  test('selection wrap：`code`', async () => {
    const view = setUpWithHistory('code');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '`');
    await sleep();
    expect(view.state.doc.toString()).toBe('`code`');
    expect(markerTexts(view).length).toBe(0);
  });

  test('empty selection：插入 ` 对（caret 居中，无 jump）', async () => {
    const view = setUpWithHistory('ab');
    await sleep();
    moveCaret(view, 1);
    insertPair(view, '`');
    await sleep();
    expect(view.state.doc.toString()).toBe('a``b');
    expect(caretPos(view)).toBe(2);
  });

  test('toggle：移除 backtick', async () => {
    const view = setUpWithHistory('`code`');
    await sleep();
    view.dispatch({ changes: [
      { from: 0, to: 1, insert: '' },
      { from: 5, to: 6, insert: '' },
    ] });
    await sleep();
    expect(view.state.doc.toString()).toBe('code');
  });

  test('undo one action：wrap 后一次 undo 还原', async () => {
    const view = setUpWithHistory('word');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '`');
    await sleep();
    expect(view.state.doc.toString()).toBe('`word`');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('word');
  });
});

describe('InlineCode — IME', () => {
  test('composition 期间冻结，结束恢复', async () => {
    const view = setUpWithComposition('`code`x');
    await sleep();
    moveCaret(view, 7); // 节点外 → rendered
    await sleep();
    expect(markerTexts(view).length).toBe(2);

    startComposition();
    moveCaret(view, 3);
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 冻结

    endComposition();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 恢复
  });
});

describe('InlineCode — copy/paste & caret stability', () => {
  test('唯一真源：文本含 backtick', async () => {
    const view = setUpEditor('`code`x');
    await sleep();
    moveCaret(view, 7);
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 视觉隐藏
    expect(view.state.doc.toString()).toBe('`code`x'); // 内容完整
  });

  test('no caret jump：wrap 后 caret 精确', async () => {
    const view = setUpWithHistory('hello');
    await sleep();
    selectRange(view, 1, 5);
    const before = caretPos(view);
    wrapSelection(view, '`');
    await sleep();
    expect(caretPos(view)).toBe(before + 2);
  });

  test('插入不破坏 reveal', async () => {
    const view = setUpWithHistory('`co`x');
    await sleep();
    moveCaret(view, 3);
    insertAt(view, 3, 'de');
    await sleep();
    expect(view.state.doc.toString()).toBe('`code`x');
  });
});
