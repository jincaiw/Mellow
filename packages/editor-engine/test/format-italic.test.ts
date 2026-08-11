/**
 * Italic（Emphasis）—— 完整行为矩阵。
 * marker: `*`（首尾各 1 字符）
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

describe('Italic — marker reveal', () => {
  test('idle → marker 隐藏', async () => {
    const view = setUpEditor('*italic*x');
    await sleep();
    moveCaret(view, 9); // x 后（节点外）
    await sleep();
    expect(markerTexts(view)).toEqual(['*', '*']);
  });

  test('caret inside → source', async () => {
    const view = setUpEditor('*italic*x');
    await sleep();
    moveCaret(view, 3);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret on marker → source', async () => {
    const view = setUpEditor('*italic*');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Italic — nested formatting', () => {
  test('*italic with **bold** inside* → 内外独立 reveal', async () => {
    const view = setUpEditor('*italic with **bold** inside*x');
    await sleep();
    moveCaret(view, 30); // 节点外
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '*').length).toBe(2); // 外层 italic
    expect(texts.filter((t) => t === '**').length).toBe(2); // 内层 bold
  });

  test('***both*** 三层解析：strong 内 emphasis（marker 整体隐藏）', async () => {
    const view = setUpEditor('***both***x');
    await sleep();
    moveCaret(view, 11); // 节点外
    await sleep();
    // 视觉上全部隐藏（'*' run 被标记）
    expect(markerTexts(view).length).toBeGreaterThan(0);
    expect(markerTexts(view).join('').replace(/\*/g, '')).toBe('');
  });
});

describe('Italic — selection wrap / empty / toggle / undo', () => {
  test('selection wrap：*italic*', async () => {
    const view = setUpWithHistory('italic');
    await sleep();
    selectRange(view, 0, 6);
    wrapSelection(view, '*');
    await sleep();
    expect(view.state.doc.toString()).toBe('*italic*');
    expect(markerTexts(view).length).toBe(0); // caret 在末尾节点内
  });

  test('empty selection：插入 * 对，caret 居中', async () => {
    const view = setUpWithHistory('ab');
    await sleep();
    moveCaret(view, 1);
    insertPair(view, '*');
    await sleep();
    expect(view.state.doc.toString()).toBe('a**b');
    expect(caretPos(view)).toBe(2); // 居中
  });

  test('toggle：移除 marker', async () => {
    const view = setUpWithHistory('*italic*');
    await sleep();
    view.dispatch({ changes: [
      { from: 0, to: 1, insert: '' },
      { from: 7, to: 8, insert: '' },
    ] });
    await sleep();
    expect(view.state.doc.toString()).toBe('italic');
  });

  test('undo one action：wrap 后一次 undo 还原', async () => {
    const view = setUpWithHistory('word');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '*');
    await sleep();
    expect(view.state.doc.toString()).toBe('*word*');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('word');
  });
});

describe('Italic — IME', () => {
  test('composition 期间冻结，结束恢复', async () => {
    const view = setUpWithComposition('*italic*x');
    await sleep();
    moveCaret(view, 9); // 节点外 → rendered
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

describe('Italic — copy/paste & caret stability', () => {
  test('唯一真源：文本含 marker', async () => {
    const view = setUpEditor('*italic*x');
    await sleep();
    moveCaret(view, 9);
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 视觉隐藏
    expect(view.state.doc.toString()).toBe('*italic*x'); // 内容完整
  });

  test('no caret jump：wrap 后 caret 精确', async () => {
    const view = setUpWithHistory('hello');
    await sleep();
    selectRange(view, 1, 4);
    const before = caretPos(view);
    wrapSelection(view, '*');
    await sleep();
    expect(caretPos(view)).toBe(before + 2);
  });

  test('插入不破坏 reveal', async () => {
    const view = setUpWithHistory('*it*x');
    await sleep();
    moveCaret(view, 3);
    insertAt(view, 3, 'al');
    await sleep();
    expect(view.state.doc.toString()).toBe('*ital*x');
  });
});
