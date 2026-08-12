import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { buildFocusModeExtension, FOCUS_DIM_CLASS, setFocusMode } from '../src/focusMode';
import { resetCompositionState } from '../src/composition';
import { sleep } from './utils/editor';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), buildFocusModeExtension()],
  });
  view.focus();
  return view;
}

describe('Focus Mode', () => {
  beforeEach(() => {
    resetCompositionState();
    setFocusMode('off');
    document.body.innerHTML = '';
  });

  test('current line dims other lines without changing document or selection', async () => {
    const view = setUp('one\ncurrent\nthree');
    view.dispatch({ selection: EditorSelection.cursor(5) });
    const before = view.state.selection.main.head;
    setFocusMode('line');
    view.dispatch({ effects: [] });
    await sleep(20);

    expect(view.state.doc.toString()).toBe('one\ncurrent\nthree');
    expect(view.state.selection.main.head).toBe(before);
    expect(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`).length).toBeGreaterThan(0);
    expect(Array.from(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`)).map((el) => el.textContent)).not.toContain('current');
  });

  test('current paragraph keeps paragraph visible and dims other paragraphs', async () => {
    const view = setUp('para one\nline two\n\nfocus para\nline\n\nlast');
    view.dispatch({ selection: EditorSelection.cursor(22) });
    setFocusMode('paragraph');
    view.dispatch({ effects: [] });
    await sleep(20);
    const dimTexts = Array.from(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`)).map((el) => el.textContent ?? '');
    expect(dimTexts.join('\n')).toContain('para one');
    expect(dimTexts.join('\n')).toContain('last');
    expect(dimTexts.join('\n')).not.toContain('focus para');
  });
});
