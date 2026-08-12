import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { buildScrollBridgeExtension } from '../src/scrollBridge';

function setUp(doc: string): { view: EditorView; api: import('../src/scrollBridge').ScrollBridgeApi } {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), buildScrollBridgeExtension()],
  });
  // jsdom 无布局：注入伪尺寸
  Object.defineProperty(view.scrollDOM, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 400, configurable: true });
  view.focus();
  const api = (window as unknown as { __MELLOW_SCROLL_BRIDGE__?: import('../src/scrollBridge').ScrollBridgeApi }).__MELLOW_SCROLL_BRIDGE__!;
  return { view, api };
}

describe('Scroll Bridge (Split bidirectional sync)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).__MELLOW_SCROLL_BRIDGE__;
  });

  test('setScrollRatio positions editor scroll and getScrollRatio reads it back', () => {
    const { view, api } = setUp('line\n'.repeat(100));
    api.setScrollRatio(0.5);
    expect(view.scrollDOM.scrollTop).toBe(300); // 0.5 * (1000 - 400)
    expect(api.getScrollRatio()).toBeCloseTo(0.5, 5);
  });

  test('clamps ratio to [0,1] and ignores no-op assignments', () => {
    const { view, api } = setUp('line\n'.repeat(100));
    api.setScrollRatio(1.5);
    expect(view.scrollDOM.scrollTop).toBe(600);
    api.setScrollRatio(0.5);
    const before = view.scrollDOM.scrollTop;
    api.setScrollRatio(0.5);
    expect(view.scrollDOM.scrollTop).toBe(before);
    void view;
  });

  test('onScroll notifies listeners with current ratio', () => {
    const { view, api } = setUp('line\n'.repeat(100));
    const seen: number[] = [];
    const unsub = api.onScroll((r) => seen.push(r));
    api.setScrollRatio(0.25);
    // jsdom 不因 scrollTop 赋值触发 scroll 事件（浏览器标准会触发）；手动派发验证监听
    view.scrollDOM.dispatchEvent(new Event('scroll'));
    expect(seen.length).toBe(1);
    expect(seen[0]).toBeCloseTo(0.25, 5);
    unsub();
    view.scrollDOM.dispatchEvent(new Event('scroll'));
    expect(seen.length).toBe(1);
  });
});
