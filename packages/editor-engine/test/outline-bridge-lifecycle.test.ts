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
