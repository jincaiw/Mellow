/**
 * contract tests —— EditorCore public API 契约。
 * 不依赖真实 WebView/bundle：jsdom iframe + mock webModules 验证接口行为。
 */

import { EditorCore } from '../src/core';
import type { CoreWebModule } from '../src/contract';

function createMockCoreModule(): CoreWebModule & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resetEditor: async () => { calls.push('resetEditor'); return true; },
    getEditorState: () => { calls.push('getEditorState'); return { hasFocus: true, hasSelection: false }; },
    getEditorText: () => { calls.push('getEditorText'); return '# mock'; },
    insertText: () => { calls.push('insertText'); },
    replaceText: () => { calls.push('replaceText'); },
  };
}

/** 挂载 EditorCore 并注入 mock webModules（jsdom 无法加载真实 bundle） */
async function setUpWithMock(): Promise<{ core: EditorCore; mock: CoreWebModule & { calls: string[] }; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const core = new EditorCore({ bundleUrl: 'about:blank' });
  core.mount(container);

  const iframe = container.querySelector('iframe') as HTMLIFrameElement;
  const mock = createMockCoreModule();
  const win = iframe.contentWindow as unknown as { webModules: { core: CoreWebModule } };
  win.webModules = { core: mock };

  // 触发 load + waitForModules
  iframe.dispatchEvent(new Event('load'));
  await core.ready();
  return { core, mock, container };
}

describe('EditorCore — public API', () => {
  test('ready 后发出 ready 事件', async () => {
    const events: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const core = new EditorCore({ bundleUrl: 'about:blank', onEvent: (e) => events.push(e.type) });
    core.mount(container);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    (iframe.contentWindow as unknown as { webModules: { core: CoreWebModule } }).webModules = { core: createMockCoreModule() };
    iframe.dispatchEvent(new Event('load'));
    await core.ready();
    expect(events).toContain('ready');
    core.destroy();
  });

  test('open/getText/getState/insertText/replaceText 委托给 webModules.core', async () => {
    const { core, mock } = await setUpWithMock();

    await core.open('# doc', { anchor: 0, head: 0 }, true);
    expect(mock.calls).toContain('resetEditor');

    expect(core.getText()).toBe('# mock');
    expect(core.getState()).toEqual({ hasFocus: true, hasSelection: false });

    core.insertText('x', 0, 0);
    core.replaceText('y', 'wholeDocument');
    expect(mock.calls).toContain('insertText');
    expect(mock.calls).toContain('replaceText');

    core.destroy();
  });

  test('onEvent 订阅与取消订阅', async () => {
    const { core } = await setUpWithMock();
    const received: string[] = [];
    const unsubscribe = core.onEvent((e) => received.push(e.type));

    core.emitExternalEvent({ type: 'viewUpdate', contentEdited: true, isDirty: true });
    expect(received).toEqual(['viewUpdate']);

    unsubscribe();
    core.emitExternalEvent({ type: 'viewUpdate', contentEdited: false, isDirty: false });
    expect(received).toEqual(['viewUpdate']); // 不再增长

    core.destroy();
  });

  test('未 mount 时 ready 抛错；未就绪时 core 抛错', async () => {
    const core = new EditorCore();
    await expect(core.ready()).rejects.toThrow('mount()');
    expect(() => core.getText()).toThrow('not ready');
  });

  test('destroy 清理 iframe 与监听器', async () => {
    const { core, container } = await setUpWithMock();
    core.destroy();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
