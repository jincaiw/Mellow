/**
 * 文档内查找（RC parity：Cmd+F）——验证 search 扩展已安装、面板可打开。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';

describe('Document search（parity Cmd+F）', () => {
  test('search 扩展安装且 openSearchPanel 可打开面板', async () => {
    // 与 install(true) 相同的扩展装配（install 在 setup 中已 mock window.require）
    const view = new EditorView({
      doc: 'hello world\nfind me',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    const { openSearchPanel, searchPanelOpen } = await import('@codemirror/search');
    view.focus();
    openSearchPanel(view);
    expect(searchPanelOpen(view.state)).toBe(true);
    view.destroy();
  });
});
