/**
 * 文档内查找（RC parity：Cmd+F）——验证 search 扩展已安装、面板可打开。
 * 2026-10-08（审计 §4.147）补：三个 toggle（含**全词匹配**）+ 宿主偏好注入 + 切换写回。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';

type Win = {
  __MELLOW_SEARCH_PREFS__?: () => unknown;
  __MELLOW_SEARCH_PREF_SET__?: (key: string, value: boolean) => void;
};

const openPanel = async (doc = 'hello world\nfind me') => {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  const { openSearchPanel } = await import('@codemirror/search');
  view.focus();
  openSearchPanel(view);
  // ⚠️ **必须排除 CM 内置面板**：真实应用里 vendored CoreEditor 把 `search({createPanel})`
  //    覆盖成**空 span**，但本测试的扩展装配**不含**那个覆盖 ⇒ CM 会渲染它**完整的**内置面板
  //    （`class="cm-search cm-panel"`），而它在文档顺序上**排在我的自建面板之前**。
  //    ⇒ 只用 `.cm-search` 会命中内置那个（按钮是 `cm-button`，不是 `cm-search-toggle`）。
  const panel = view.dom.querySelector('.cm-search:not(.cm-panel)') as HTMLElement | null;
  return { view, panel };
};

describe('Document search（parity Cmd+F）', () => {
  afterEach(() => {
    delete (window as unknown as Win).__MELLOW_SEARCH_PREFS__;
    delete (window as unknown as Win).__MELLOW_SEARCH_PREF_SET__;
  });

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

  // ⚠️ **本用例必须排在最前**：`documentSearch.ts` 的 `lastQueryOptions` 是**模块级会话记忆**，
  //    面板创建时只被宿主偏好**覆盖**（不会被重置）⇒ 一旦前面的用例把某个开关打开，
  //    这里就再也读不到「默认」了。**这是测试顺序约束，不是产品行为约束**（真实会话里
  //    宿主每次都注入持久化值）。
  test('无宿主注入时回落到默认（三个都关）', async () => {
    const { view, panel } = await openPanel();
    const pressed = (n: string) => panel!.querySelector(`button[name="${n}"]`)!.getAttribute('aria-pressed');
    expect([pressed('caseSensitive'), pressed('wholeWord'), pressed('regexp')]).toEqual(['false', 'false', 'false']);
    view.destroy();
  });

  test('面板有三个 toggle（区分大小写 / 全词匹配 / 正则），且按宿主偏好初始化', async () => {
    (window as unknown as Win).__MELLOW_SEARCH_PREFS__ = () => ({
      caseSensitive: true, wholeWord: true, regexp: false,
    });
    const { view, panel } = await openPanel();
    expect(panel).not.toBeNull();
    const names = Array.from(panel!.querySelectorAll('button.cm-search-toggle')).map((b) => b.getAttribute('name'));
    expect(names).toEqual(['caseSensitive', 'wholeWord', 'regexp']);
    const pressed = (n: string) => panel!.querySelector(`button[name="${n}"]`)!.getAttribute('aria-pressed');
    expect(pressed('caseSensitive')).toBe('true');
    expect(pressed('wholeWord')).toBe('true');
    expect(pressed('regexp')).toBe('false');
    view.destroy();
  });

  test('切换「全词匹配」会把新值**通知宿主**（engine 不写存储）', async () => {
    // 先注入全 false ⇒ 让本用例与前面用例的模块级会话记忆解耦（`lastQueryOptions` 是模块态）
    (window as unknown as Win).__MELLOW_SEARCH_PREFS__ = () => ({
      caseSensitive: false, wholeWord: false, regexp: false,
    });
    const calls: Array<[string, boolean]> = [];
    (window as unknown as Win).__MELLOW_SEARCH_PREF_SET__ = (k, v) => { calls.push([k, v]); };
    const { view, panel } = await openPanel();
    (panel!.querySelector('button[name="wholeWord"]') as HTMLButtonElement).click();
    expect(calls).toEqual([['wholeWord', true]]);
    expect(panel!.querySelector('button[name="wholeWord"]')!.getAttribute('aria-pressed')).toBe('true');
    view.destroy();
  });
});
