import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { buildTypewriterModeExtension, computeTypewriterScrollTop, setTypewriterMode } from '../src/typewriterMode';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { sleep } from './utils/editor';

const created: EditorView[] = [];

function setUp(doc: string, getCaretTop?: (view: EditorView, head: number) => number | null): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), buildTypewriterModeExtension(getCaretTop === undefined ? {} : { getCaretTop })],
  });
  // jsdom 无真实布局：注入伪布局，模拟 viewport 400px、内容 1000px
  Object.defineProperty(view.scrollDOM, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 400, configurable: true });
  view.focus();
  created.push(view);
  return view;
}

afterEach(() => {
  for (const view of created.splice(0)) view.destroy();
});

describe('Typewriter Mode', () => {
  beforeEach(() => {
    resetCompositionState();
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  test('computeTypewriterScrollTop centers caret and clamps to bounds', () => {
    expect(computeTypewriterScrollTop(500, 400, 600)).toBe(300);
    expect(computeTypewriterScrollTop(100, 400, 600)).toBe(0);
    expect(computeTypewriterScrollTop(1000, 400, 600)).toBe(600);
  });

  test('enabled mode scrolls caret to viewport middle after caret move', async () => {
    const getCaretTop = jest.fn(() => 500);
    const view = setUp('a\nb\nc\nd\ne\nf\ng', getCaretTop);
    setTypewriterMode(true);
    view.dispatch({ selection: EditorSelection.cursor(2) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300);
  });

  test('disabled mode never scrolls', async () => {
    const view = setUp('a\nb\nc', () => 500);
    view.dispatch({ selection: EditorSelection.cursor(2) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  test('IME composition suppresses centering', async () => {
    installCompositionTracking();
    const view = setUp('a\nb\nc', () => 500);
    setTypewriterMode(true);
    document.dispatchEvent(new CompositionEvent('compositionstart'));
    view.dispatch({ selection: EditorSelection.cursor(2) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(0);
  });

  test('drag selection does not center, caret click does', async () => {
    const view = setUp('a\nb\nc\nd\ne\nf\ng', () => 500);
    setTypewriterMode(true);
    view.dispatch({ selection: EditorSelection.range(0, 3) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(0);
    view.dispatch({ selection: EditorSelection.cursor(2) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300);
  });
});
