/**
 * Editor interaction state isolation.
 *
 * A composition in one CodeMirror surface must not freeze marker updates in
 * another document, and Source Mode must remain local to the active view.
 */
import { installCompositionTracking, isComposing, resetCompositionState } from '../src/composition';
import { isSourceMode, resetModeState, setSourceMode } from '../src/mode';

describe('editor interaction state is view-scoped', () => {
  beforeAll(() => installCompositionTracking());

  afterEach(() => {
    resetCompositionState();
    resetModeState();
    document.body.replaceChildren();
  });

  test('composition only guards the editor that owns the composition event', () => {
    const first = document.createElement('div');
    const firstContent = document.createElement('div');
    first.className = 'cm-editor';
    first.append(firstContent);
    const second = document.createElement('div');
    second.className = 'cm-editor';
    document.body.append(first, second);

    firstContent.dispatchEvent(new Event('compositionstart', { bubbles: true }));

    expect(isComposing({ dom: first })).toBe(true);
    expect(isComposing({ dom: second })).toBe(false);
  });

  test('source mode supports a view-local override without changing the default mode', () => {
    const first = {};
    const second = {};

    setSourceMode(true, first);

    expect(isSourceMode(first)).toBe(true);
    expect(isSourceMode(second)).toBe(false);
    expect(isSourceMode()).toBe(false);
  });
});
