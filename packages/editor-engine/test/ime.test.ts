/**
 * IME Composition Guard 测试（live-markdown-engine-spec §6）。
 *
 * compositionstart → compositionend 期间：
 * - caret 移动 / 文本变化只映射 decoration 位置，不重建（渲染状态冻结）；
 * - 结束后恢复实时 reveal。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { moveCaret, markerElements, sleep } from './utils/editor';
import { resetCompositionState } from '../src/composition';

function setUpWithComposition(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      install(true), // 安装 composition 监听（document 事件驱动 composing 状态）
    ],
  });
  view.focus();
  return view;
}

function startComposition(): void {
  document.dispatchEvent(new Event('compositionstart'));
}

function endComposition(): void {
  document.dispatchEvent(new Event('compositionend'));
}

describe('Composition Guard', () => {
  beforeEach(() => {
    resetCompositionState();
  });

  test('合成期间 caret 移动不触发重算（渲染冻结）', async () => {
    const view = setUpWithComposition('**bold**x');
    await sleep();
    moveCaret(view, 9); // 'x' 之后 → idle：marker 隐藏
    await sleep();
    expect(markerElements(view).length).toBe(2);

    startComposition();
    // 合成中 caret 进入节点：不应重算（marker 保持隐藏）
    moveCaret(view, 3);
    await sleep();
    expect(markerElements(view).length).toBe(2);

    endComposition();
    // 合成结束：恢复实时 reveal（caret 在节点内 → source）
    moveCaret(view, 4);
    await sleep();
    expect(markerElements(view).length).toBe(0);
  });

  test('合成期间 doc 变化只映射位置', async () => {
    const view = setUpWithComposition('**bold**x');
    await sleep();
    moveCaret(view, 9);
    await sleep();
    expect(markerElements(view).length).toBe(2);

    startComposition();
    // 合成输入（doc 变化）→ decoration 应 map 而非重建
    view.dispatch({
      changes: { from: 9, insert: 'x' },
    });
    await sleep();
    // doc 变了（9 → 10），但渲染冻结：marker 仍在（映射后）
    expect(markerElements(view).length).toBe(2);

    endComposition();
    // 结束 + caret 移动 → 重算
    moveCaret(view, 0);
    await sleep();
    expect(markerElements(view).length).toBe(0);
  });

  test('Escape 兜底结束合成', async () => {
    const view = setUpWithComposition('**bold**');
    await sleep();
    startComposition();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    moveCaret(view, 3);
    await sleep();
    // 合成已结束 → 重算 → source
    expect(markerElements(view).length).toBe(0);
  });
});
