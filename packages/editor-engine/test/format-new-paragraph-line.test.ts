/**
 * Edit → New Paragraph / New Line（Typora 官方 Shortcut Keys 表 Edit 段开头两项）。
 *
 * 语义（**由 2026-09-13 实测确定的真值**）：
 * - Mellow 的 Enter 只插入单个 `\n`，而单个 `\n` 在 Markdown 中是**段内软换行**
 *   （渲染属同一段落：行高 32px、行距 32px 紧凑）；真正的分段需要空行分隔
 *   （`\n\n`：行高 38px、段间距 64px）。
 * - 故 New Paragraph 按官方定义插入 `\n\n`，**不复用 Enter**；New Line 插入单个 `\n`。
 * - Enter 本身不在本轮改动（输入路径为最高风险面，同 D-V 判据），仅经菜单暴露两项能力。
 *
 * 另：**空选区必须走 caret 插入而非块级整行** —— `applyToView` 的空选区分支默认是
 * 「块级作用于整行」，若不加特殊处理，New Paragraph 会把当前行整行替换掉（实测踩过：
 * `abc` → `\n\n` 而非 `abc\n\n`）。该特殊分支位于 `applyToView`（与 referenceLink 同类），
 * 由下方「编辑器集成」用例守护。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { applyNewParagraph, applyNewLine } from '../src/selectionToolbar';

/** 宿主 → 引擎格式桥（与菜单同一条通路） */
function format(action: string): void {
  (window as unknown as { __MELLOW_FORMAT_API__: { format: (a: string) => void } })
    .__MELLOW_FORMAT_API__.format(action);
}

describe('applyNewParagraph — 纯函数', () => {
  test('行尾：插入空行形成真分段，caret 落新段', () => {
    const doc = 'abc';
    const r = applyNewParagraph(doc, { from: 3, to: 3 });
    expect(r.changes).toEqual([{ from: 3, to: 3, insert: '\n\n' }]);
    expect(r.selection).toEqual({ from: 5, to: 5 });
    expect(doc.slice(0, 3) + '\n\n' + doc.slice(3)).toBe('abc\n\n');
  });

  test('行中：在光标处断开为两个段落', () => {
    const doc = 'abcdef';
    const r = applyNewParagraph(doc, { from: 3, to: 3 });
    expect(doc.slice(0, 3) + r.changes[0].insert + doc.slice(3)).toBe('abc\n\ndef');
  });

  test('已有空行分隔时只补一个换行（避免连按堆叠连续空行）', () => {
    const doc = 'abc\n\n';
    const r = applyNewParagraph(doc, { from: 5, to: 5 });
    expect(r.changes[0].insert).toBe('\n');
  });

  test('带选区：替换选区为空行分隔', () => {
    const doc = 'abcdef';
    const r = applyNewParagraph(doc, { from: 1, to: 4 });
    expect(doc.slice(0, 1) + r.changes[0].insert + doc.slice(4)).toBe('a\n\nef');
  });
});

describe('applyNewLine — 纯函数', () => {
  test('行尾：插入单个换行（段内软换行）', () => {
    const doc = 'abc';
    const r = applyNewLine(doc, { from: 3, to: 3 });
    expect(r.changes).toEqual([{ from: 3, to: 3, insert: '\n' }]);
    expect(r.selection).toEqual({ from: 4, to: 4 });
    expect(doc.slice(0, 3) + '\n' + doc.slice(3)).toBe('abc\n');
  });

  test('与 New Paragraph 的区别：单个 \\n vs 空行 \\n\\n', () => {
    const doc = 'abc';
    expect(applyNewLine(doc, { from: 3, to: 3 }).changes[0].insert).toBe('\n');
    expect(applyNewParagraph(doc, { from: 3, to: 3 }).changes[0].insert).toBe('\n\n');
  });
});

describe('New Paragraph / New Line — 编辑器集成', () => {
  function setUp(doc: string, caret: number): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    view.dispatch({ selection: { anchor: caret } });
    return view;
  }

  test('菜单「新段落」在光标处插入真分段，不吞掉当前行', () => {
    const view = setUp('abc', 3);
    format('newParagraph');
    expect(view.state.doc.toString()).toBe('abc\n\n');
    view.destroy();
  });

  test('菜单「新行」在光标处插入软换行，不吞掉当前行', () => {
    const view = setUp('abc', 3);
    format('newLine');
    expect(view.state.doc.toString()).toBe('abc\n');
    view.destroy();
  });

  test('一次 undo 还原（一个 GUI 动作 = 一个 undo）', () => {
    const view = setUp('abc', 3);
    format('newParagraph');
    expect(view.state.doc.toString()).toBe('abc\n\n');
    undo(view);
    expect(view.state.doc.toString()).toBe('abc');
    view.destroy();
  });

  test('行中调用：断成两段而非替换整行（空选区块级陷阱回归）', () => {
    const view = setUp('abcdef', 3);
    format('newParagraph');
    expect(view.state.doc.toString()).toBe('abc\n\ndef');
    view.destroy();
  });
});
