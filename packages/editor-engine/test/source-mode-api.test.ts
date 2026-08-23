import { setSourceMode } from '../src/index';
import { markerTexts, moveCaret, setUpEditor, sleep } from './harness';

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
