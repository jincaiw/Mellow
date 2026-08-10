/**
 * Undo/Redo 测试（live-markdown-engine-spec §7 Undo Contract）。
 *
 * - 引擎只用 mark decoration，从不修改文档文本 → undo/redo 语义天然正确；
 * - 验证：输入 → undo → 文本还原；redo → 恢复；marker reveal 始终正确。
 */

import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { moveCaret, markerElements, sleep } from './utils/editor';

function setUpWithHistory(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      install(false),
    ],
  });
  view.focus();
  return view;
}

describe('Undo / Redo', () => {
  test('输入后 undo 还原文本，marker reveal 正确', async () => {
    const view = setUpWithHistory('# Title\n\n**bold**\n\nplain');
    await sleep();
    moveCaret(view, 24); // 文档末尾（plain 后）→ 全部 idle
    await sleep();
    expect(markerElements(view).length).toBe(3); // '# ' + '**' x2

    // 输入一个字符
    view.dispatch({ changes: { from: 24, insert: 'X' } });
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplainX');

    // undo：文本还原
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplain');
    // marker 状态保持正确（caret 仍在 24，idle → 隐藏）
    expect(markerElements(view).length).toBe(3);

    // redo：恢复
    redo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplainX');
  });

  test('marker 隐藏不进入 undo 历史（纯视觉）', async () => {
    const view = setUpWithHistory('**bold**x');
    await sleep();
    moveCaret(view, 9); // 'x' 之后 → idle → 隐藏 marker
    await sleep();
    expect(markerElements(view).length).toBe(2);

    // undo 空栈：不改变文档
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold**x');
    expect(markerElements(view).length).toBe(2);
  });

  test('caret 移动（selection）不进入 undo 历史', async () => {
    const view = setUpWithHistory('# Title\n\nplain');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    moveCaret(view, 3);
    await sleep();
    undo(view);
    await sleep();
    // 文档未被 selection 变化影响
    expect(view.state.doc.toString()).toBe('# Title\n\nplain');
  });
});
