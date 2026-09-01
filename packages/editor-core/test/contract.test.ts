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
    const received: Array<{ type: string; compositionEnded?: boolean }> = [];
    const unsubscribe = core.onEvent((e) => received.push({ type: e.type, compositionEnded: e.type === 'viewUpdate' ? e.compositionEnded : undefined }));

    core.emitExternalEvent({ type: 'viewUpdate', contentEdited: true, isDirty: true, compositionEnded: false });
    expect(received).toEqual([{ type: 'viewUpdate', compositionEnded: false }]);

    unsubscribe();
    core.emitExternalEvent({ type: 'viewUpdate', contentEdited: false, isDirty: false });
    expect(received).toEqual([{ type: 'viewUpdate', compositionEnded: false }]); // 不再增长

    core.destroy();
  });

  test('focus 同时聚焦 iframe 与真实 EditorView，避免大文档 open 后键盘落到外壳', async () => {
    const { core, container } = await setUpWithMock();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const win = iframe.contentWindow as Window;
    const frameFocus = jest.spyOn(win, 'focus').mockImplementation(() => undefined);
    const editorFocus = jest.fn();
    Object.defineProperty(win, 'editor', { configurable: true, value: { focus: editorFocus } });

    core.focus();

    expect(frameFocus).toHaveBeenCalledTimes(1);
    expect(editorFocus).toHaveBeenCalledTimes(1);
    frameFocus.mockRestore();
    core.destroy();
  });

  test('未 mount 时 ready 安全等待挂载；未就绪时 API 返回安全默认值（防御性降级）', async () => {
    const core = new EditorCore();
    // 新语义（宿主 idle 调度延迟 mount）：ready() 可在 mount 前调用，等待挂载而非立即抛错
    const readyPromise = core.ready();
    // 白屏防线：启动竞态期间的任何调用不得抛错（App.tsx effect 曾因此崩溃）
    expect(core.isReady()).toBe(false);
    expect(core.getText()).toBe('');
    expect(core.getState()).toEqual({ hasFocus: false, hasSelection: false });
    await expect(core.open('# x')).resolves.toBe(false);
    expect(() => core.insertText('x', 0, 0)).not.toThrow();
    expect(() => core.replaceText('x', 'wholeDocument')).not.toThrow();
    // 挂载后 ready() 正常就绪（不依赖 15s 轮询超时）
    const container = document.createElement('div');
    document.body.appendChild(container);
    core.mount(container);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    (iframe.contentWindow as unknown as { webModules: { core: CoreWebModule } }).webModules = { core: createMockCoreModule() };
    iframe.dispatchEvent(new Event('load'));
    await readyPromise;
    expect(core.isReady()).toBe(true);
    core.destroy();
  });

  test('mount 后、webModules 就绪前同样安全降级；isReady 反映就绪状态', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const core = new EditorCore({ bundleUrl: 'about:blank' });
    core.mount(container);
    // iframe 已挂载但 load 未触发（真实启动竞态窗口期）
    expect(core.isReady()).toBe(false);
    expect(core.getText()).toBe('');
    await expect(core.open('# x')).resolves.toBe(false);

    // 就绪后恢复正常委托
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    (iframe.contentWindow as unknown as { webModules: { core: CoreWebModule } }).webModules = { core: createMockCoreModule() };
    iframe.dispatchEvent(new Event('load'));
    await core.ready();
    expect(core.isReady()).toBe(true);
    expect(core.getText()).toBe('# mock');
    core.destroy();
  });

  test('webModules 就绪但 EditorView 未创建时（iframe 内抛错）不向宿主传播异常', async () => {
    // 复现 2026-08-23 启动报错：webModules.core 已可用，但 CoreEditor 异步初始化
    // 未完成，window.editor 仍是宿主 <div id="editor"> 命名元素引用（无 state），
    // iframe 内 getEditorState 访问 window.editor.state.selection 抛 TypeError
    const container = document.createElement('div');
    document.body.appendChild(container);
    const core = new EditorCore({ bundleUrl: 'about:blank' });
    core.mount(container);

    const notReady = {
      ...createMockCoreModule(),
      getEditorState: () => { throw new TypeError("undefined is not an object (evaluating 'window.editor.state.selection')"); },
      getEditorText: () => { throw new TypeError("undefined is not an object (evaluating 'window.editor.state.doc')"); },
      insertText: () => { throw new TypeError('EditorView not ready'); },
      replaceText: () => { throw new TypeError('EditorView not ready'); },
    };
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    (iframe.contentWindow as unknown as { webModules: { core: CoreWebModule } }).webModules = { core: notReady };
    iframe.dispatchEvent(new Event('load'));
    await core.ready();

    // App.tsx commandContext 启动期调用路径：降级为安全默认值而非崩溃
    expect(core.getState()).toEqual({ hasFocus: false, hasSelection: false });
    expect(core.getText()).toBe('');
    expect(() => core.insertText('x', 0, 0)).not.toThrow();
    expect(() => core.replaceText('x', 'wholeDocument')).not.toThrow();
    core.destroy();
  });

  test('destroy 清理 iframe 与监听器', async () => {
    const { core, container } = await setUpWithMock();
    core.destroy();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
