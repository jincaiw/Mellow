/**
 * Selection Commands 测试（D1-4：Typora 编辑→选择 ⌘L 行 / ⌥⌘P 段落）。
 *
 * 覆盖：
 * - selectLine：选中当前行 / 整行已选中时扩展下一行 / 末行不再扩展；
 * - selectParagraph：空行界定的段落范围 / 文档首尾边界；
 * - API 未注册 view 时返回 false。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { installSelectionCommandsApi } from '../src/selectionCommands';

const api = (): { selectLine: () => boolean; selectParagraph: () => boolean } =>
  (window as unknown as { __MELLOW_SELECTION_COMMANDS__?: { selectLine: () => boolean; selectParagraph: () => boolean } }).__MELLOW_SELECTION_COMMANDS__!;

function makeView(doc: string): EditorView {
  return new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(false)],
  });
}

describe('Selection Commands — selectLine', () => {
  beforeEach(() => {
    installSelectionCommandsApi();
  });

  it('选中当前行（caret 行内 → 整行）', () => {
    const view = makeView('第一行\n第二行\n第三行');
    view.dispatch({ selection: { anchor: 4, head: 4 } }); // 「第二行」内
    expect(api().selectLine()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(7);
    view.destroy();
  });

  it('整行已选中 → 扩展到下一行（CM selectLine 语义）', () => {
    const view = makeView('第一行\n第二行\n第三行');
    view.dispatch({ selection: { anchor: 4, head: 7 } }); // 已选「第二行」
    api().selectLine();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(11); // 扩到「第三行」行尾
    view.destroy();
  });

  it('末行整行选中 → 不再扩展', () => {
    const view = makeView('第一行\n第二行');
    view.dispatch({ selection: { anchor: 4, head: 7 } }); // 末行整行
    api().selectLine();
    const sel = view.state.selection.main;
    expect(sel.to).toBe(7);
    view.destroy();
  });
});

describe('Selection Commands — selectParagraph', () => {
  beforeEach(() => {
    installSelectionCommandsApi();
  });

  it('空行界定的段落整体选中', () => {
    const view = makeView('前一段\n\n段落甲\n段落乙\n\n后一段');
    // 偏移：前一段 0-2 / \n3 / 空行4(\n) / 段落甲 5-7 / \n8 / 段落乙 9-11 / \n12 / 空行13(\n) / 后一段 14+
    view.dispatch({ selection: { anchor: 6, head: 6 } }); // 「段落甲」内
    expect(api().selectParagraph()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(5); // 「段落甲」行首
    expect(sel.to).toBe(12); // 「段落乙」行尾
    view.destroy();
  });

  it('文档首尾边界（无相邻空行）', () => {
    const view = makeView('唯一段落');
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    api().selectParagraph();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(4);
    view.destroy();
  });
});

describe('Selection Commands — 未就绪', () => {
  it('无 activeView 时返回 false（不 throw）', () => {
    installSelectionCommandsApi();
    // 未创建 view（或已 destroy）→ activeView 为 null
    expect(api().selectLine()).toBe(false);
    expect(api().selectParagraph()).toBe(false);
  });
});
