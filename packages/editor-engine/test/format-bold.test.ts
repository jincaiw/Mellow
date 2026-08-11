/**
 * Bold（StrongEmphasis）—— 完整行为矩阵。
 * marker: `**`（首尾各 2 字符）
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

describe('Bold — marker reveal', () => {
  test('idle → marker 隐藏', async () => {
    const view = setUpEditor('**bold**x');
    await sleep();
    moveCaret(view, 9); // x 后（节点外）
    await sleep();
    expect(markerTexts(view)).toEqual(['**', '**']);
  });

  test('caret inside → source（marker 显示）', async () => {
    const view = setUpEditor('**bold**x');
    await sleep();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret on marker → source', async () => {
    const view = setUpEditor('**bold**');
    await sleep();
    moveCaret(view, 1);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 部分 → source；节点外 → rendered', async () => {
    const view = setUpEditor('**bold**x');
    await sleep();
    selectRange(view, 3, 5);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    moveCaret(view, 9);
    await sleep();
    expect(markerTexts(view)).toEqual(['**', '**']);
  });
});

describe('Bold — nested formatting', () => {
  test('**bold with *italic* inside** → 内外独立 reveal', async () => {
    const view = setUpEditor('**bold with *italic* inside**x');
    await sleep();
    moveCaret(view, 30); // 节点外
    await sleep();
    // 两对 '**' + 一对 '*' 都隐藏
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '**').length).toBe(2);
    expect(texts.filter((t) => t === '*').length).toBe(2);
  });

  test('nested：caret 在外层内容中 → 外层 source', async () => {
    const view = setUpEditor('**outer *inner* text**x');
    await sleep();
    moveCaret(view, 8); // 'outer' 内（外层节点内）
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 整层 source
  });
});

describe('Bold — selection wrap / empty / toggle / undo', () => {
  test('selection wrap：选中文本包裹 ** → 文本 + reveal', async () => {
    const view = setUpWithHistory('bold');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '**');
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold**');
    // caret 在末尾（节点内）→ source
    expect(markerTexts(view).length).toBe(0);
  });

  test('empty selection：插入 ** 对，caret 居中（无 jump）', async () => {
    const view = setUpWithHistory('ab');
    await sleep();
    moveCaret(view, 1);
    insertPair(view, '**');
    await sleep();
    expect(view.state.doc.toString()).toBe('a****b');
    expect(caretPos(view)).toBe(3); // 居中（marker 之间）
    // caret 在 marker 上 → source（无视觉跳跃）
    expect(markerTexts(view).length).toBe(0);
  });

  test('toggle：已包裹再操作 → 移除 marker', async () => {
    const view = setUpWithHistory('**bold**');
    await sleep();
    selectRange(view, 2, 6); // 选中内容
    // 模拟 toggle 移除：删 marker
    view.dispatch({ changes: [
      { from: 0, to: 2, insert: '' },
      { from: 6, to: 8, insert: '' },
    ] });
    await sleep();
    expect(view.state.doc.toString()).toBe('bold');
    expect(markerTexts(view).length).toBe(0);
  });

  test('undo one action：wrap 后一次 undo 还原', async () => {
    const view = setUpWithHistory('word');
    await sleep();
    selectRange(view, 0, 4);
    wrapSelection(view, '**');
    await sleep();
    expect(view.state.doc.toString()).toBe('**word**');

    undo(view); // 一次撤销
    await sleep();
    expect(view.state.doc.toString()).toBe('word');
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Bold — IME', () => {
  test('composition 期间冻结，结束恢复', async () => {
    const view = setUpWithComposition('**bold**x');
    await sleep();
    moveCaret(view, 9); // 节点外 → rendered
    await sleep();
    expect(markerTexts(view).length).toBe(2);

    startComposition();
    moveCaret(view, 3); // 合成中进入 → 冻结（保持 rendered）
    await sleep();
    expect(markerTexts(view).length).toBe(2);

    endComposition();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 恢复 source
  });
});

describe('Bold — copy/paste & caret stability', () => {
  test('唯一真源：getText 始终含 marker（copy 语义）', async () => {
    const view = setUpEditor('**bold**x');
    await sleep();
    moveCaret(view, 9); // x 后（节点外）→ marker 视觉隐藏
    await sleep();
    expect(markerTexts(view).length).toBe(2); // 视觉隐藏
    // 但文本内容完整（copy 含 marker —— 唯一真源，spec §2）
    expect(view.state.doc.toString()).toBe('**bold**x');
  });

  test('无 caret jump：wrap 后 caret 位置精确', async () => {
    const view = setUpWithHistory('hello');
    await sleep();
    selectRange(view, 2, 4); // 'll'
    const before = caretPos(view);
    wrapSelection(view, '**');
    await sleep();
    // caret 在选区末尾 + 2 个闭合 marker（无跳跃）
    expect(caretPos(view)).toBe(before + 4);
  });

  test('插入后输入不破坏 reveal', async () => {
    const view = setUpWithHistory('**bo**x');
    await sleep();
    moveCaret(view, 4); // 节点内
    insertAt(view, 4, 'ld');
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold**x');
    expect(markerTexts(view).length).toBe(0); // caret 仍在内 → source
  });
});
