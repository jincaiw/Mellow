import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  applyBlockPrefix,
  applyHeading,
  applyInlineFormat,
  applyLink,
  buildSelectionToolbarExtension,
  installFormatApi,
  setSelectionToolbarEnabled,
  shouldShowToolbar,
} from '../src/selectionToolbar';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { moveCaret, sleep } from './utils/editor';

function setUp(doc: string): EditorView {
  installFormatApi();
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      buildSelectionToolbarExtension({ getAnchor: () => ({ top: 200, left: 40 }) }),
    ],
  });
  view.focus();
  return view;
}

function toolbarEl(): HTMLDivElement | null {
  return document.querySelector('.mellow-selection-toolbar');
}

function select(view: EditorView, from: number, to: number): void {
  view.dispatch({ selection: EditorSelection.range(from, to) });
}

function key(view: EditorView, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
}

describe('Selection Toolbar — formatting pure functions', () => {
  test('inline format wraps selection and unwraps on toggle', () => {
    const wrap = applyInlineFormat('abc', { from: 0, to: 3 }, '**');
    expect(wrap.changes).toEqual([{ from: 0, to: 3, insert: '**abc**' }]);
    expect(wrap.selection).toEqual({ from: 2, to: 5 });

    const unwrap = applyInlineFormat('**abc**', { from: 2, to: 5 }, '**');
    expect(unwrap.changes).toEqual([{ from: 0, to: 7, insert: 'abc' }]);
    expect(unwrap.selection).toEqual({ from: 0, to: 3 });
  });

  test('link wraps selection with empty url placeholder selected', () => {
    const result = applyLink('abc', { from: 0, to: 3 });
    expect(result.changes).toEqual([{ from: 0, to: 3, insert: '[abc]()' }]);
    expect(result.selection).toEqual({ from: 6, to: 6 });
  });

  test('block prefix toggles and maps selection', () => {
    const add = applyBlockPrefix('hello', { from: 0, to: 5 }, '# ');
    expect(add.changes).toEqual([{ from: 0, to: 5, insert: '# hello' }]);
    expect(add.selection).toEqual({ from: 2, to: 7 });

    const remove = applyBlockPrefix('# hello', { from: 2, to: 7 }, '# ');
    expect(remove.changes).toEqual([{ from: 0, to: 7, insert: 'hello' }]);
    expect(remove.selection).toEqual({ from: 0, to: 5 });
  });

  test('multi-line prefix applies to each selected line', () => {
    const result = applyBlockPrefix('a\nb', { from: 0, to: 3 }, '- ');
    expect(result.changes).toEqual([{ from: 0, to: 3, insert: '- a\n- b' }]);
    expect(result.selection).toEqual({ from: 2, to: 7 });
  });

  test('heading replaces existing heading level and toggles off when same level', () => {
    const up = applyHeading('# hello', { from: 2, to: 7 }, 2);
    expect(up.changes).toEqual([{ from: 0, to: 7, insert: '## hello' }]);
    expect(up.selection).toEqual({ from: 3, to: 8 });

    const off = applyHeading('## hello', { from: 3, to: 8 }, 2);
    expect(off.changes).toEqual([{ from: 0, to: 8, insert: 'hello' }]);
    expect(off.selection).toEqual({ from: 0, to: 5 });
  });

  test('visibility model requires enabled, non-composing, selection and not hidden', () => {
    expect(shouldShowToolbar({ enabled: true, composing: false, hasSelection: true, hidden: false })).toBe(true);
    expect(shouldShowToolbar({ enabled: false, composing: false, hasSelection: true, hidden: false })).toBe(false);
    expect(shouldShowToolbar({ enabled: true, composing: true, hasSelection: true, hidden: false })).toBe(false);
    expect(shouldShowToolbar({ enabled: true, composing: false, hasSelection: false, hidden: false })).toBe(false);
    expect(shouldShowToolbar({ enabled: true, composing: false, hasSelection: true, hidden: true })).toBe(false);
  });
});

describe('Selection Toolbar — plugin behavior', () => {
  beforeEach(() => {
    resetCompositionState();
    setSelectionToolbarEnabled(true);
    document.body.innerHTML = '';
  });

  test('shows above selection, applies bold without stealing focus, hides on empty selection', async () => {
    const view = setUp('abc def');
    select(view, 0, 3);
    await sleep(30);
    const el = toolbarEl();
    expect(el).not.toBeNull();
    expect(el?.style.display).not.toBe('none');
    expect(el?.style.top).toBe('158px'); // 200 - 32 - 10，上方不遮挡
    expect(el?.style.left).toBe('40px');

    const bold = el?.querySelector('button[data-action="bold"]') as HTMLButtonElement | null;
    bold?.click();
    await sleep(10);
    expect(view.state.doc.toString()).toBe('**abc** def');
    expect(view.hasFocus).toBe(true);

    select(view, 0, 0);
    await sleep(30);
    expect(toolbarEl()?.style.display).toBe('none');
  });

  test('IME composition hides toolbar', async () => {
    installCompositionTracking();
    const view = setUp('abc');
    select(view, 0, 3);
    await sleep(30);
    document.dispatchEvent(new CompositionEvent('compositionstart'));
    select(view, 0, 2);
    await sleep(30);
    expect(toolbarEl()?.style.display).toBe('none');
  });

  test('Escape hides toolbar and returns focus to editor', async () => {
    const view = setUp('abc');
    select(view, 0, 3);
    await sleep(30);
    expect(toolbarEl()?.style.display).not.toBe('none');
    key(view, 'Escape');
    await sleep(30);
    expect(toolbarEl()?.style.display).toBe('none');
    expect(view.hasFocus).toBe(true);
  });

  test('disabled feature never shows toolbar', async () => {
    setSelectionToolbarEnabled(false);
    const view = setUp('abc');
    select(view, 0, 3);
    await sleep(30);
    expect(toolbarEl()?.style.display).toBe('none');
  });
});

describe('Format menu actions（Typora 对齐）', () => {
  test('空选区 Cmd+B 插入成对 marker caret 居中', async () => {
    const view = setUp('hello');
    await sleep();
    moveCaret(view, 5);
    await sleep();
    (window as unknown as { __MELLOW_FORMAT_API__?: { format: (a: string) => void } }).__MELLOW_FORMAT_API__?.format('bold');
    await sleep();
    expect(view.state.doc.toString()).toBe('hello****');
    expect(view.state.selection.main.head).toBe(7);
    view.destroy();
  });

  test('空选区 Cmd+1 当前行变一级标题', async () => {
    const view = setUp('line one\nline two');
    await sleep();
    moveCaret(view, 3); // 第一行
    await sleep();
    (window as unknown as { __MELLOW_FORMAT_API__?: { format: (a: string) => void } }).__MELLOW_FORMAT_API__?.format('h1');
    await sleep();
    expect(view.state.doc.toString()).toBe('# line one\nline two');
    view.destroy();
  });
});
