import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { buildSlashCommandsExtension } from '../src/slashCommands';
import { installCompositionTracking, resetCompositionState } from '../src/composition';

function setUp(doc: string, onOpen = jest.fn()): { view: EditorView; onOpen: jest.Mock } {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), buildSlashCommandsExtension({ onOpen })],
  });
  view.focus();
  return { view, onOpen };
}

function keySlash(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('Slash Commands trigger bridge', () => {
  beforeEach(() => {
    resetCompositionState();
    document.body.innerHTML = '';
  });

  test('opens only at line start whitespace and prevents inserting slash', () => {
    const { view, onOpen } = setUp('   \nparagraph');
    view.dispatch({ selection: EditorSelection.cursor(3) });
    const event = keySlash(view.contentDOM);
    expect(event.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledWith({ from: 0, to: 3, query: '', context: 'line-start' });
  });

  test('does not trigger in middle of non-empty line', () => {
    const { view, onOpen } = setUp('hello');
    view.dispatch({ selection: EditorSelection.cursor(5) });
    const event = keySlash(view.contentDOM);
    expect(event.defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test('does not trigger during IME composition', () => {
    installCompositionTracking();
    const { view, onOpen } = setUp('');
    document.dispatchEvent(new CompositionEvent('compositionstart'));
    const event = keySlash(view.contentDOM);
    expect(event.defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
