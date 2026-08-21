/**
 * 链接引用（⌥⌘L，Typora 段落→链接引用）—— applyReferenceLink 行为矩阵。
 * 语义：选区文本 → [text][n]；当前段落块（连续非空行）下方插入 [n]: 定义行。
 * 空选区 → [][n]，caret 落 label 括号内；有选区 → caret 落定义行 URL 位。
 * n = 文档中最小未占用引用号（扫描行首 [n]: 定义）。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { applyReferenceLink } from '../src/selectionToolbar';

type Change = { from: number; to: number; insert: string };

/** 按 from 升序应用 changes，得到结果文档 */
function applyChanges(doc: string, changes: Change[]): string {
  let out = '';
  let pos = 0;
  for (const c of changes) {
    out += doc.slice(pos, c.from) + c.insert;
    pos = c.to;
  }
  return out + doc.slice(pos);
}

describe('applyReferenceLink — 纯函数', () => {
  test('空选区：[][1] + 定义行，caret 落 label 括号内', () => {
    const doc = '段落文本';
    const r = applyReferenceLink(doc, { from: 2, to: 2 });
    expect(r.changes).toEqual([
      { from: 2, to: 2, insert: '[][1]' },
      { from: 4, to: 4, insert: '\n[1]: ' },
    ]);
    expect(r.selection).toEqual({ from: 3, to: 3 });
    expect(applyChanges(doc, r.changes as Change[])).toBe('段落[][1]文本\n[1]: ');
  });

  test('有选区：[text][1]，caret 落定义行 URL 位', () => {
    const doc = 'use Typora now';
    const r = applyReferenceLink(doc, { from: 4, to: 10 });
    const result = applyChanges(doc, r.changes as Change[]);
    expect(result).toBe('use [Typora][1] now\n[1]: ');
    const urlPos = result.indexOf('[1]: ') + '[1]: '.length;
    expect(r.selection).toEqual({ from: urlPos, to: urlPos });
  });

  test('编号复用：已有 [1]/[2] 定义 → 用 3；仅 [1] → 用 2', () => {
    const doc = 'a\n\n[1]: http://x\n[2]: http://y';
    const r = applyReferenceLink(doc, { from: 0, to: 1 });
    expect(applyChanges(doc, r.changes as Change[])).toContain('[a][3]');
    expect(applyChanges(doc, r.changes as Change[])).toContain('\n[3]: ');

    const doc2 = 'a\n\n[1]: http://x';
    const r2 = applyReferenceLink(doc2, { from: 0, to: 1 });
    expect(applyChanges(doc2, r2.changes as Change[])).toContain('[a][2]');
  });

  test('引用用法（非定义）不占用编号：只有引用 [2] 无定义行 → 仍用 1', () => {
    const doc = '见 [2] 文本';
    const r = applyReferenceLink(doc, { from: 0, to: 1 });
    const result = applyChanges(doc, r.changes as Change[]);
    expect(result).toContain('[见][1]');
    expect(result).toContain('\n[1]: ');
  });

  test('段落块扩展：多行段落，定义插在块末（非当前行后）', () => {
    const doc = '第一段\n续行\n\n第二段';
    const r = applyReferenceLink(doc, { from: 0, to: 0 }); // caret 在第一段
    const result = applyChanges(doc, r.changes as Change[]);
    expect(result).toBe('[][1]第一段\n续行\n[1]: \n\n第二段');
  });

  test('文档以非空行结尾：定义追加在文档尾', () => {
    const doc = 'hello';
    const r = applyReferenceLink(doc, { from: 5, to: 5 });
    expect(applyChanges(doc, r.changes as Change[])).toBe('hello[][1]\n[1]: ');
  });

  test('空文档：单 change 顺序（ref 在前 def 在后），caret 落 label', () => {
    const r = applyReferenceLink('', { from: 0, to: 0 });
    expect(r.changes).toEqual([
      { from: 0, to: 0, insert: '[][1]' },
      { from: 0, to: 0, insert: '\n[1]: ' },
    ]);
    expect(r.selection).toEqual({ from: 1, to: 1 });
  });
});

describe('referenceLink — format API + undo', () => {
  function setUp(doc: string): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    view.focus();
    return view;
  }

  test('format("referenceLink") 空选区插入 [][n] + 定义，undo 一步恢复', () => {
    const view = setUp('段落文本');
    view.dispatch({ selection: { anchor: 2 } });
    (window as unknown as { __MELLOW_FORMAT_API__: { format: (a: string) => void } }).__MELLOW_FORMAT_API__.format('referenceLink');
    expect(view.state.doc.toString()).toBe('段落[][1]文本\n[1]: ');
    expect(view.state.selection.main.head).toBe(3); // label 括号内
    undo(view);
    expect(view.state.doc.toString()).toBe('段落文本');
    view.destroy();
  });
});
