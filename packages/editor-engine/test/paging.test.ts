import type { EditorView } from '@codemirror/view';
import { scrollPageSafely } from '../src/paging';
import { resetCompositionState } from '../src/composition';

describe('WKWebView-safe paging', () => {
  afterEach(() => resetCompositionState());

  test.each([
    [true, 'cursorPageDown'],
    [false, 'cursorPageUp'],
  ] as const)('用 CodeMirror caret transaction 翻页（forward=%s）', (forward, expected) => {
    const view = {} as EditorView;
    const commands = {
      cursorPageDown: jest.fn(() => true),
      cursorPageUp: jest.fn(() => true),
    };

    expect(scrollPageSafely(view, forward, commands)).toBe(true);
    expect(commands[expected]).toHaveBeenCalledWith(view);
    expect(commands[expected === 'cursorPageDown' ? 'cursorPageUp' : 'cursorPageDown']).not.toHaveBeenCalled();
  });
});
