/**
 * Strike（Strikethrough）—— 完整行为矩阵。
 * marker: `~~`（首尾各 2 字符）
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

describe('Strike — marker reveal', () => {
  test('idle → marker 隐藏', async () => {
    const view = setUpEditor('~~strike~~x');
    await sleep();
    moveCaret(view, 11); // x 后（节点外）
    await sleep();
    expect(markerTexts(view)).toEqual(['~~', '~~']);
  });

  test('caret inside → source', async () => {
    const view = setUpEditor('~~strike~~x');
    await sleep();
    moveCaret(view, 5);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret on marker → source', async () => {
    const view = setUpEditor('~~strike~~');
    await sleep();
    moveCaret(view, 1);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Strike — nested formatting', () => {
  test('~~strike with **bold** inside~~ → 内外独立', async () => {
    const view = setUpEditor('~~strike with **bold** inside~~x');
    await sleep();
    moveCaret(view, 32); // 节点外
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '~~').length).toBe(2);
    expect(texts.filter((t) => t === '**').length).toBe(2);
  });
});

describe('Strike — selection wrap / empty / toggle / undo', () => {
  test('selection wrap：~~strike~~', async () => {
    const view = setUpWithHistory('strike');
    await sleep();
    selectRange(view, 0, 6);
    wrapSelection(view, '~~');
    await sleep();
    expect(view.state.doc.toString()).toBe('~~strike~~');
    expect(markerTexts(view).length).toBe(0);
  });

  test('empty selection：插入 ~~ 对，caret 居中', async () => {
    const view = setUpWithHistory('ab');
    await sleep();
    moveCaret(view, 1);
    insertPair(view, '~~');
    await sleep();
    expect(view.state.doc.toString()).toBe('a~~~~b');
    expect(caretPos(view)).toBe(3); // 居中（marker 之间）
  });

  test('toggle：移除 marker', async () => {
    const view = setUpWithHistory('~~strike~~');
    await sleep();
    view.dispatch({ changes: [
      { from: 0, to: 2, insert: '' },
      { from: 8, to: 10, insert: '' },
    ] });
    await sleep();
    expect(view.state.doc.toString()).toBe('strike');
  });

  test('undo one action：wrap 后一次 undo 还原', async () => {
    const view = setUpWithHistory('word');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '~~');
    await sleep();
    expect(view.state.doc.toString()).toBe('~~word~~');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('word');
  });
});

describe('Strike — IME', () => {
  test('composition 期间冻结，结束恢复', async () => {
    const view = setUpWithComposition('~~strike~~x');
    await sleep();
    moveCaret(view, 11); // 节点外 → rendered
    await sleep();
    expect(markerTexts(view).length).toBe(2);

    startComposition();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 冻结

    endComposition();
    moveCaret(view, 5);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 恢复
  });
});

describe('Strike — copy/paste & caret stability', () => {
  test('唯一真源：文本含 marker', async () => {
    const view = setUpEditor('~~strike~~x');
    await sleep();
    moveCaret(view, 11);
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 视觉隐藏
    expect(view.state.doc.toString()).toBe('~~strike~~x'); // 内容完整
  });

  test('no caret jump：wrap 后 caret 精确', async () => {
    const view = setUpWithHistory('hello');
    await sleep();
    selectRange(view, 0, 5);
    const before = caretPos(view);
    wrapSelection(view, '~~');
    await sleep();
    expect(caretPos(view)).toBe(before + 4);
  });

  test('插入不破坏 reveal', async () => {
    const view = setUpWithHistory('~~st~~x');
    await sleep();
    moveCaret(view, 4);
    insertAt(view, 4, 'ri');
    await sleep();
    expect(view.state.doc.toString()).toBe('~~stri~~x');
  });
});
