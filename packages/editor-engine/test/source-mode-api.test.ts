import { setSourceMode } from '../src/index';
import { insertAt, markerTexts, moveCaret, selectRange, setUpEditor, sleep } from './harness';

interface SourceApi {
  toggle: () => void;
  isActive: () => boolean;
}

function bindSourceApi(view: unknown): SourceApi {
  const win = window as unknown as { editor?: unknown; __MELLOW_SOURCE_API__?: SourceApi };
  win.editor = view;
  return win.__MELLOW_SOURCE_API__ as SourceApi;
}

describe('Source Mode host API', () => {
  afterEach(() => {
    setSourceMode(false);
    delete (window as unknown as { editor?: unknown }).editor;
    document.body.innerHTML = '';
  });

  test('toggle 在同一命令内刷新 Source / Live decorations', async () => {
    const view = setUpEditor('# Title\n\nplain');
    const win = window as unknown as {
      editor?: typeof view;
      __MELLOW_SOURCE_API__?: { toggle: () => void; isActive: () => boolean };
    };
    win.editor = view;

    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(markerTexts(view)).toContain('# ');

    win.__MELLOW_SOURCE_API__?.toggle();
    await sleep();
    expect(win.__MELLOW_SOURCE_API__?.isActive()).toBe(true);
    expect(markerTexts(view)).toHaveLength(0);

    win.__MELLOW_SOURCE_API__?.toggle();
    await sleep();
    expect(win.__MELLOW_SOURCE_API__?.isActive()).toBe(false);
    expect(markerTexts(view)).toContain('# ');

    view.destroy();
  });
});

describe('P4.8 Source↔Live 往返保持 caret / selection / scroll', () => {
  afterEach(() => {
    setSourceMode(false);
    delete (window as unknown as { editor?: unknown }).editor;
    document.body.innerHTML = '';
  });

  test('往返保持空选区 caret 位置', async () => {
    const view = setUpEditor('# Title\n\nsome **bold** text');
    const api = bindSourceApi(view);
    moveCaret(view, 8);
    await sleep();

    api.toggle();
    await sleep();
    expect(api.isActive()).toBe(true);
    expect(view.state.selection.main.head).toBe(8);
    expect(view.state.selection.main.empty).toBe(true);

    api.toggle();
    await sleep();
    expect(api.isActive()).toBe(false);
    expect(view.state.selection.main.head).toBe(8);
    view.destroy();
  });

  test('往返保持非空选区（anchor / head 双向不变）', async () => {
    const view = setUpEditor('# Title\n\nsome **bold** text');
    const api = bindSourceApi(view);
    selectRange(view, 9, 13); // 'some' 内
    await sleep();

    api.toggle();
    await sleep();
    let main = view.state.selection.main;
    expect(main.anchor).toBe(9);
    expect(main.head).toBe(13);

    api.toggle();
    await sleep();
    main = view.state.selection.main;
    expect(main.anchor).toBe(9);
    expect(main.head).toBe(13);
    view.destroy();
  });

  test('往返保持滚动位置（toggle 无 scrollIntoView）', async () => {
    const view = setUpEditor('# Title\n\nsome text');
    const api = bindSourceApi(view);
    moveCaret(view, 0);
    await sleep();
    const before = view.scrollDOM.scrollTop;

    api.toggle();
    await sleep();
    expect(view.scrollDOM.scrollTop).toBe(before);

    api.toggle();
    await sleep();
    expect(view.scrollDOM.scrollTop).toBe(before);
    view.destroy();
  });

  test('往返 doc 逐字不变（Source Fidelity）', async () => {
    const doc = '# Title\n\nsome **bold** and ~~strike~~ and `code`';
    const view = setUpEditor(doc);
    const api = bindSourceApi(view);
    moveCaret(view, doc.length);
    await sleep();

    api.toggle();
    await sleep();
    expect(view.state.doc.toString()).toBe(doc);

    api.toggle();
    await sleep();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  test('Source 全显 ↔ Live rendered 往返（多节点类型）', async () => {
    const doc = '# H\n\n**b** ~~s~~ `c` text';
    const view = setUpEditor(doc);
    const api = bindSourceApi(view);
    moveCaret(view, doc.length); // 全部节点外
    await sleep();
    const liveHidden = markerTexts(view);
    expect(liveHidden.length).toBeGreaterThan(0); // Live 下有隐藏 marker

    api.toggle();
    await sleep();
    expect(markerTexts(view)).toHaveLength(0); // Source 全显

    api.toggle();
    await sleep();
    expect(markerTexts(view)).toEqual(liveHidden); // Live 恢复原状
    view.destroy();
  });

  test('Source 模式内编辑 → 回 Live 后 reveal 反映新内容', async () => {
    const doc = '# Title\n\nplain';
    const view = setUpEditor(doc);
    const api = bindSourceApi(view);
    moveCaret(view, doc.length);
    await sleep();

    api.toggle();
    await sleep();
    // Source 模式下追加一行 bold（insertAt 光标移到插入后）
    insertAt(view, doc.length, '\n\n**new bold**');
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\nplain\n\n**new bold**');

    api.toggle();
    await sleep();
    expect(api.isActive()).toBe(false);
    // caret 在新 bold 末尾（节点内 → 新 bold source），不影响既有 heading 恢复 rendered
    moveCaret(view, view.state.doc.length);
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toContain('# '); // 既有 heading 恢复 rendered
    view.destroy();
  });

  test('未注册 editor 时 toggle 不崩溃（全局模式翻转）', async () => {
    const win = window as unknown as { editor?: unknown; __MELLOW_SOURCE_API__?: SourceApi };
    delete win.editor;
    const api = win.__MELLOW_SOURCE_API__ as SourceApi | undefined;
    // installSourceApi 未执行时 API 可能不存在；仅在存在时验证健壮性
    if (api) {
      expect(() => api.toggle()).not.toThrow();
      await sleep();
      setSourceMode(false); // 复位全局模式
    }
  });
});
