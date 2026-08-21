/**
 * 删除行（⇧⌘⌫，Typora 编辑→删除→删除行）—— applyDeleteLine 行为矩阵。
 * 语义：删除受影响整行（含行尾换行）；文档尾行无换行时连同前置换行（不留空行）；
 * caret 落删除后行的行首（尾行场景落前一行行尾）。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { applyDeleteLine } from '../src/selectionToolbar';

describe('applyDeleteLine — 纯函数', () => {
  test('中间行：连同行尾换行删除，caret 落下一行行首', () => {
    const doc = '第一行\n第二行\n第三行';
    const r = applyDeleteLine(doc, { from: 4, to: 4 }); // caret 在「第二行」
    expect(r.changes).toEqual([{ from: 4, to: 8, insert: '' }]);
    expect(r.selection).toEqual({ from: 4, to: 4 });
    expect(doc.slice(0, 4) + doc.slice(8)).toBe('第一行\n第三行');
  });

  test('首行：连同行尾换行删除，caret 落 0', () => {
    const doc = 'a\nb';
    const r = applyDeleteLine(doc, { from: 0, to: 0 });
    expect(r.changes).toEqual([{ from: 0, to: 2, insert: '' }]);
    expect(r.selection).toEqual({ from: 0, to: 0 });
    expect(doc.slice(2)).toBe('b');
  });

  test('文档尾行（无尾随换行）：连同前置换行删除，不留空行，caret 落前一行行尾', () => {
    const doc = 'a\nb';
    const r = applyDeleteLine(doc, { from: 2, to: 2 });
    expect(r.changes).toEqual([{ from: 1, to: 3, insert: '' }]);
    expect(r.selection).toEqual({ from: 1, to: 1 });
    expect(doc.slice(0, 1)).toBe('a');
  });

  test('多行选区（选区跨行部分覆盖）：受影响整行全删', () => {
    const doc = 'a\nb\nc';
    const r = applyDeleteLine(doc, { from: 1, to: 4 }); // 行内选到 c 行首
    expect(r.changes).toEqual([{ from: 0, to: 4, insert: '' }]);
    expect(r.selection).toEqual({ from: 0, to: 0 });
    expect(doc.slice(4)).toBe('c');
  });

  test('空行：仅删换行符', () => {
    const doc = 'a\n\nb';
    const r = applyDeleteLine(doc, { from: 2, to: 2 }); // caret 在空行
    expect(r.changes).toEqual([{ from: 2, to: 3, insert: '' }]);
    expect(doc.slice(0, 2) + doc.slice(3)).toBe('a\nb');
  });

  test('空文档：no-op', () => {
    const r = applyDeleteLine('', { from: 0, to: 0 });
    expect(r.changes).toEqual([]);
    expect(r.selection).toEqual({ from: 0, to: 0 });
  });

  test('单行文档：整行删除', () => {
    const r = applyDeleteLine('abc', { from: 1, to: 1 });
    expect(r.changes).toEqual([{ from: 0, to: 3, insert: '' }]);
    expect(r.selection).toEqual({ from: 0, to: 0 });
  });
});

describe('deleteLine — format API + undo', () => {
  function setUp(doc: string): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    view.focus();
    return view;
  }

  test('format("deleteLine") 删除当前行，undo 一步恢复', () => {
    const view = setUp('第一行\n第二行\n第三行');
    view.dispatch({ selection: { anchor: 5 } });
    (window as unknown as { __MELLOW_FORMAT_API__: { format: (a: string) => void } }).__MELLOW_FORMAT_API__.format('deleteLine');
    expect(view.state.doc.toString()).toBe('第一行\n第三行');
    expect(view.state.selection.main.head).toBe(4);
    undo(view);
    expect(view.state.doc.toString()).toBe('第一行\n第二行\n第三行');
    view.destroy();
  });
});
