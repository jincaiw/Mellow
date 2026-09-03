/**
 * P4.6 nested inline formatting（Typora parity V4）—— spec §10「nested marks independent」。
 *
 * 引擎语义（plugin.ts / state.ts 已核实）：
 * - 嵌套内容节点（StrongEmphasis/Emphasis/Strike/InlineCode）各自独立 classify；
 * - rule 1：caret 相交节点范围 → source（marker 显示）；内层相交必然外层相交
 *   （range 包含）→ 整链 source；仅外层内容相交 → 内层仍 rendered（marker 隐藏）；
 * - markerTexts(view) 返回当前被隐藏的 marker 元素文本。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { applyClearFormat } from '../src/selectionToolbar';
import {
  setUpEditor, moveCaret, selectRange, markerTexts, insertAt, sleep,
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

/**
 * 基准文档：**bold with *italic* inside**x（length 30）
 * 外层 StrongEmphasis 0..29（marker 0..2 / 27..29）；
 * 内层 Emphasis 12..20（marker 12..13 / 19..20，内容 13..19）。
 */
const NESTED_DOC = '**bold with *italic* inside**x';

describe('P4.6 嵌套 reveal —— 层级独立性（spec §10）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('idle（节点外）→ 全链 rendered：内外 marker 全部隐藏', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    // intersects 为闭区间（types.ts:60）：caret 须越过外层 node.to=29（'x' 之后）
    moveCaret(view, view.state.doc.length);
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '**').length).toBe(2);
    expect(texts.filter((t) => t === '*').length).toBe(2);
    view.destroy();
  });

  test('caret 仅在外层内容（内层之前）→ 外层 source，内层仍 rendered', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    moveCaret(view, 4); // 'bold' 内（内层 12..20 之前）
    await sleep();
    const texts = markerTexts(view);
    // 外层 '**' 显示（不在隐藏列表），内层 '*' 隐藏
    expect(texts.filter((t) => t === '**').length).toBe(0);
    expect(texts.filter((t) => t === '*').length).toBe(2);
    view.destroy();
  });

  test('caret 在内层内容 → 内层相交连带外层相交 → 整链 source', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    moveCaret(view, 15); // 'italic' 内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('caret 在外层 marker 上 → 外层 source，内层仍 rendered', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    moveCaret(view, 1); // 外层开 marker '**' 上
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '**').length).toBe(0);
    expect(texts.filter((t) => t === '*').length).toBe(2);
    view.destroy();
  });

  test('caret 在内层 marker 上 → 整链 source', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    moveCaret(view, 12); // 内层开 marker '*'
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('选区在内层内容内 → 整链 source', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    selectRange(view, 14, 17);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('选区覆盖整个嵌套构造 → 整链 source', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    selectRange(view, 0, 30);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('三种格式互嵌：~~s **b** e~~ → caret 语义与 bold/italic 一致', async () => {
    const view = setUpEditor('~~s **b** e~~x');
    await sleep();
    moveCaret(view, view.state.doc.length); // 全部节点外（闭区间语义）
    await sleep();
    let texts = markerTexts(view);
    expect(texts.filter((t) => t === '~~').length).toBe(2);
    expect(texts.filter((t) => t === '**').length).toBe(2);

    moveCaret(view, 3); // 外层内容（内层之前）
    await sleep();
    texts = markerTexts(view);
    expect(texts.filter((t) => t === '~~').length).toBe(0);
    expect(texts.filter((t) => t === '**').length).toBe(2);

    moveCaret(view, 6); // 内层 'b' 内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('inline code 嵌在 bold 内：code span 内的字面 marker 不参与解析', async () => {
    // '**a `b *c*` d**x' —— *c* 在 code span 内是字面量，无 Emphasis 节点
    const view = setUpEditor('**a `b *c*` d**x');
    await sleep();
    moveCaret(view, view.state.doc.length); // 全部节点外（闭区间语义）
    await sleep();
    const texts = markerTexts(view);
    expect(texts.filter((t) => t === '**').length).toBe(2);
    expect(texts.filter((t) => t === '`').length).toBe(2);
    // code 内容中的 '*' 不是语法 marker → 无 '*' 隐藏项
    expect(texts.filter((t) => t === '*').length).toBe(0);
    view.destroy();
  });

  test('inline code 在内层：caret 进入 code → 整链 source', async () => {
    const view = setUpEditor('**a `b` c**x');
    await sleep();
    moveCaret(view, 5); // code 内容 'b' 内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });
});

describe('P4.6 嵌套编辑 —— Source Fidelity 与 undo', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('内层内容中插入文本：原文完整保留（嵌套 marker 无损）', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    moveCaret(view, 15);
    await sleep();
    insertAt(view, 15, 'X');
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold with *itXalic* inside**x');
    // caret 仍在内层 → 整链 source
    expect(markerTexts(view).length).toBe(0);
    view.destroy();
  });

  test('删除内层 marker 之一：结构退化不崩溃，doc 保持字面（唯一真源）', async () => {
    const view = setUpEditor(NESTED_DOC);
    await sleep();
    view.dispatch({ changes: [{ from: 12, to: 13, insert: '' }] });
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold with italic* inside**x');
    view.destroy();
  });

  test('内层输入一次 undo 还原（嵌套不破坏 undo 分组）', async () => {
    const view = setUpWithHistory(NESTED_DOC);
    await sleep();
    moveCaret(view, 15);
    await sleep();
    insertAt(view, 15, 'X');
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold with *itXalic* inside**x');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(NESTED_DOC);
    view.destroy();
  });
});

describe('P4.6 嵌套清除 —— applyClearFormat 多层剥离', () => {
  test('bold 内 italic：双层 marker 一次全剥', () => {
    const result = applyClearFormat('**a *b* c**', { from: 0, to: 11 });
    expect(result.changes).toEqual([{ from: 0, to: 11, insert: 'a b c' }]);
  });

  test('italic 内 inline code：` 与 * 全剥', () => {
    const result = applyClearFormat('*em `code`*', { from: 0, to: 11 });
    expect(result.changes).toEqual([{ from: 0, to: 11, insert: 'em code' }]);
  });

  test('strike 内 bold：~~ 与 ** 全剥', () => {
    const result = applyClearFormat('~~s **b**~~', { from: 0, to: 11 });
    expect(result.changes).toEqual([{ from: 0, to: 11, insert: 's b' }]);
  });

  test('三层嵌套 ***a***：三对 marker 全剥为纯文本', () => {
    const result = applyClearFormat('***a***', { from: 0, to: 7 });
    expect(result.changes).toEqual([{ from: 0, to: 7, insert: 'a' }]);
  });
});
