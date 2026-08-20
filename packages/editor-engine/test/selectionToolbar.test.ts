import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  applyBlockPrefix,
  applyClearFormat,
  applyCodeBlock,
  applyFootnote,
  applyHeading,
  applyHeadingShift,
  applyHorizontalRule,
  applyInlineFormat,
  applyLink,
  applyMathBlock,
  applyOrderedList,
  applyTaskList,
  applyTaskToggle,
  applyYamlFrontMatter,
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

  test('ordered list numbers sequentially, strips block markers, and toggles off', () => {
    // 多行序号递增；既有引用 marker 剥离后编号（Typora 段落互转）
    const on = applyOrderedList('> a\nb', { from: 0, to: 5 });
    expect(on.changes).toEqual([{ from: 0, to: 5, insert: '1. a\n2. b' }]);

    const off = applyOrderedList('1. a\n2. b', { from: 0, to: 9 });
    expect(off.changes).toEqual([{ from: 0, to: 9, insert: 'a\nb' }]);

    // caret 位（from === to）：作用于当前行（空行也生效）
    const emptyLine = applyOrderedList('a\n\nb', { from: 2, to: 2 });
    expect(emptyLine.changes).toEqual([{ from: 2, to: 2, insert: '1. ' }]);
  });

  test('task list toggles "- [ ] " prefix per line', () => {
    const on = applyTaskList('a\nb', { from: 0, to: 3 });
    expect(on.changes).toEqual([{ from: 0, to: 3, insert: '- [ ] a\n- [ ] b' }]);

    // 已勾选任务也识别为 task 行（toggle off）
    const off = applyTaskList('- [x] done', { from: 0, to: 10 });
    expect(off.changes).toEqual([{ from: 0, to: 10, insert: 'done' }]);
  });

  test('code block wraps selection in ``` fences and unwraps', () => {
    const on = applyCodeBlock('code', { from: 0, to: 4 });
    expect(on.changes).toEqual([
      { from: 0, to: 0, insert: '```\n' },
      { from: 4, to: 4, insert: '\n```' },
    ]);
    expect(on.selection).toEqual({ from: 4, to: 8 });

    // 已包裹 → toggle off（删除两行 fence；后 fence 为末行，连同其前换行）
    const off = applyCodeBlock('```\ncode\n```', { from: 4, to: 8 });
    expect(off.changes).toEqual([
      { from: 0, to: 4, insert: '' },
      { from: 8, to: 12, insert: '' },
    ]);
    expect(off.selection).toEqual({ from: 0, to: 4 });
  });

  test('math block wraps selection in $$ fences and unwraps', () => {
    const on = applyMathBlock('E=mc^2', { from: 0, to: 6 });
    expect(on.changes).toEqual([
      { from: 0, to: 0, insert: '$$\n' },
      { from: 6, to: 6, insert: '\n$$' },
    ]);

    const off = applyMathBlock('$$\nE=mc^2\n$$', { from: 3, to: 9 });
    expect(off.changes).toEqual([
      { from: 0, to: 3, insert: '' },
      { from: 9, to: 12, insert: '' },
    ]);
  });

  test('clear format strips inline markers and link syntax (⌘\\)', () => {
    const markers = applyClearFormat('**bold** and ~~strike~~', { from: 0, to: 23 });
    expect(markers.changes).toEqual([{ from: 0, to: 23, insert: 'bold and strike' }]);

    const link = applyClearFormat('see [docs](https://example.com) now', { from: 0, to: 35 });
    expect(link.changes).toEqual([{ from: 0, to: 35, insert: 'see docs now' }]);

    // 嵌套 marker 反复剥离
    const nested = applyClearFormat('**`code`**', { from: 0, to: 10 });
    expect(nested.changes).toEqual([{ from: 0, to: 10, insert: 'code' }]);

    // 无 marker → 无变更
    const plain = applyClearFormat('plain text', { from: 0, to: 10 });
    expect(plain.changes).toEqual([]);
  });

  test('block prefix works on empty line at caret position', () => {
    // affectedLines 放宽 from === to：caret 所在空行插入 "> "（Typora ⌥⌘Q 空行语义）
    const result = applyBlockPrefix('a\n\nb', { from: 2, to: 2 }, '> ');
    expect(result.changes).toEqual([{ from: 2, to: 2, insert: '> ' }]);
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

describe('Paragraph menu actions（B2 菜单结构补全，Typora 对齐）', () => {
  test('headingUp：h2 → h1；非标题行 → h1；h1 保持 h1', () => {
    expect(applyHeadingShift('## hello', { from: 3, to: 8 }, -1).changes)
      .toEqual([{ from: 0, to: 8, insert: '# hello' }]);
    expect(applyHeadingShift('hello', { from: 0, to: 5 }, -1).changes)
      .toEqual([{ from: 0, to: 5, insert: '# hello' }]);
    expect(applyHeadingShift('# hello', { from: 2, to: 7 }, -1).changes)
      .toEqual([{ from: 0, to: 7, insert: '# hello' }]);
  });

  test('headingDown：h2 → h3；非标题行 → h2；h6 保持 h6', () => {
    expect(applyHeadingShift('## hello', { from: 3, to: 8 }, 1).changes)
      .toEqual([{ from: 0, to: 8, insert: '### hello' }]);
    expect(applyHeadingShift('hello', { from: 0, to: 5 }, 1).changes)
      .toEqual([{ from: 0, to: 5, insert: '## hello' }]);
    expect(applyHeadingShift('###### hello', { from: 7, to: 12 }, 1).changes)
      .toEqual([{ from: 0, to: 12, insert: '###### hello' }]);
  });

  test('horizontalRule：当前行下方插入 --- 空行分隔', () => {
    const r = applyHorizontalRule('hello\nworld', { from: 0, to: 5 });
    expect(r.changes).toEqual([{ from: 5, to: 5, insert: '\n\n---\n' }]);
  });

  test('footnote：插入引用并在文末附定义（编号递增）', () => {
    const r = applyFootnote('hello[^1] world', { from: 11, to: 11 });
    expect(r.changes).toEqual([
      { from: 11, to: 11, insert: '[^2]' },
      { from: 15, to: 15, insert: '\n\n[^2]: ' },
    ]);
  });

  test('yamlFrontMatter：顶部插入；已有则忽略', () => {
    const add = applyYamlFrontMatter('hello', { from: 0, to: 5 });
    expect(add.changes[0].insert).toBe('---\ntitle: \n---\n\n');
    const skip = applyYamlFrontMatter('---\ntitle: x\n---\nbody', { from: 17, to: 21 });
    expect(skip.changes).toEqual([]);
  });

  test('taskToggle：[ ] ↔ [x] 切换；非任务行忽略', () => {
    const on = applyTaskToggle('- [ ] task', { from: 7, to: 11 });
    expect(on.changes).toEqual([{ from: 3, to: 4, insert: 'x' }]);
    const off = applyTaskToggle('- [x] task', { from: 7, to: 11 });
    expect(off.changes).toEqual([{ from: 3, to: 4, insert: ' ' }]);
    const none = applyTaskToggle('plain', { from: 0, to: 5 });
    expect(none.changes).toEqual([]);
  });

  test('h4-h6：格式桥 ACTION_IDS 支持 4-6 级标题（段落菜单 ⌘4-6）', () => {
    expect(applyHeading('hello', { from: 0, to: 5 }, 4).changes)
      .toEqual([{ from: 0, to: 5, insert: '#### hello' }]);
    expect(applyHeading('hello', { from: 0, to: 5 }, 5).changes)
      .toEqual([{ from: 0, to: 5, insert: '##### hello' }]);
    expect(applyHeading('hello', { from: 0, to: 5 }, 6).changes)
      .toEqual([{ from: 0, to: 5, insert: '###### hello' }]);
  });
});
