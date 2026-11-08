import type { OutlineBridgeApi } from '../src/index';
import { setUpEditor } from './harness';

type OutlineWindow = Window & { __MELLOW_OUTLINE_API__?: OutlineBridgeApi };

describe('Outline bridge lifecycle', () => {
  afterEach(() => {
    delete (window as OutlineWindow).__MELLOW_OUTLINE_API__;
    document.body.innerHTML = '';
  });

  test('jumpToOffset 更新当前 EditorView 的选区', () => {
    jest.useFakeTimers();
    const view = setUpEditor('# A\n\n## B');
    const api = (window as OutlineWindow).__MELLOW_OUTLINE_API__;

    expect(api?.jumpToOffset(7)).toBe(true);
    jest.runAllTimers();
    expect(view.state.selection.main.head).toBe(7);
    expect(api?.getSelectionHead()).toBe(7);

    view.destroy();
    jest.useRealTimers();
  });

  // G7-SHELL-11（选区字数）：宿主每次 viewUpdate 经 getSelectedText() 取主选区文本
  //（Typora 同源 `getTextInSelection()`）。collapsed ⇒ ''；多行选区 ⇒ 精确切片。
  test('getSelectedText 返回主选区文本，collapsed 时为空串', () => {
    const view = setUpEditor('hello 世界 second line');
    const api = (window as OutlineWindow).__MELLOW_OUTLINE_API__;

    expect(api?.getSelectedText()).toBe('');
    view.dispatch({ selection: { anchor: 6, head: 8 } }); // 「世界」= UTF-16 偏移 6..8
    expect(api?.getSelectedText()).toBe('世界');
    // 反向选区（head < anchor）同样按 from/to 切片，不返回负长度
    view.dispatch({ selection: { anchor: 14, head: 8 } });
    expect(api?.getSelectedText()).toBe(' secon');

    view.destroy();
  });

  test('旧视图销毁不会删除新视图的 bridge', () => {
    jest.useFakeTimers();
    const oldView = setUpEditor('# Old');
    const newView = setUpEditor('# New');
    const newApi = (window as OutlineWindow).__MELLOW_OUTLINE_API__;

    oldView.destroy();
    expect((window as OutlineWindow).__MELLOW_OUTLINE_API__).toBe(newApi);
    expect(newApi?.jumpToOffset(3)).toBe(true);
    jest.runAllTimers();
    expect(newView.state.selection.main.head).toBe(3);

    newView.destroy();
    expect((window as OutlineWindow).__MELLOW_OUTLINE_API__).toBeUndefined();
    jest.useRealTimers();
  });
});
