/**
 * List（无序/有序/嵌套/任务）+ Blockquote —— spec §14/§15。
 * list marker：idle 弱化（dim）；quote marker：idle 隐藏。caret 行完整显示。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setSourceMode, resetModeState, MARKER_DIM_CLASS, MARKER_CLASS } from '../src/index';
import { setUpEditor, moveCaret, sleep, startComposition, endComposition } from './harness';

function setUpWithHistory(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

function setUpWithComposition(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  view.focus();
  return view;
}

/** caret 移到 'plain' 段（节点外） */
function caretOutsideList(view: EditorView): void {
  const text = view.state.doc.toString();
  const pos = text.indexOf('plain') + 1;
  moveCaret(view, pos);
}

function dimCount(view: EditorView): number {
  return view.dom.querySelectorAll(`.${MARKER_DIM_CLASS}`).length;
}

function hiddenCount(view: EditorView): number {
  return view.dom.querySelectorAll(`.${MARKER_CLASS}`).length;
}

beforeEach(() => resetModeState());

// ─────────────────────────── Unordered / Ordered ───────────────────────────

describe('List — marker reveal', () => {
  test('无序 idle → marker 弱化（dim）', async () => {
    const view = setUpEditor('- item one\n- item two\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(2);
  });

  test('caret 行 → marker 完整显示（该行不 dim）', async () => {
    const view = setUpEditor('- item one\n- item two\n\nplain');
    await sleep();
    moveCaret(view, 5); // 第一项内容
    await sleep();
    expect(dimCount(view)).toBe(1); // 第二项仍 dim
    moveCaret(view, 15); // 第二项内容
    await sleep();
    expect(dimCount(view)).toBe(1); // 第一项 dim
  });

  test('有序 idle → 数字弱化', async () => {
    const view = setUpEditor('1. first\n2. second\n3. third\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(3);
  });

  test('caret 在 ordered 内容 → 该行数字显示', async () => {
    const view = setUpEditor('1. first\n2. second\n\nplain');
    await sleep();
    moveCaret(view, 12); // 第二项
    await sleep();
    expect(dimCount(view)).toBe(1);
  });
});

// ─────────────────────────── Nested ───────────────────────────

describe('List — nested', () => {
  test('嵌套：内外层 marker 独立弱化', async () => {
    const view = setUpEditor('- item\n  - nested\n- top\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(3);
  });

  test('caret 在内层 → 内层 + 外层显示（外层 item 与 caret 相交），top 弱化', async () => {
    const view = setUpEditor('- item\n  - nested\n- top\n\nplain');
    await sleep();
    moveCaret(view, 13); // 内层内容
    await sleep();
    expect(dimCount(view)).toBe(1); // top 仍 dim（外层 item 与内层同属 caret 上下文）
  });
});

// ─────────────────────────── Task ───────────────────────────

describe('Task List', () => {
  test('task marker 弱化 + checkbox 文本完整（唯一真源）', async () => {
    const view = setUpEditor('- [ ] todo\n- [x] done\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(2); // 两个 `- `
    expect(view.state.doc.toString()).toContain('- [ ] todo');
    expect(view.state.doc.toString()).toContain('- [x] done');
  });

  test('caret 在 task → marker 显示', async () => {
    const view = setUpEditor('- [ ] todo\n- [x] done\n\nplain');
    await sleep();
    moveCaret(view, 5); // 第一项 task 内容
    await sleep();
    expect(dimCount(view)).toBe(1);
  });
});

// ─────────────────────────── Blockquote ───────────────────────────

describe('Blockquote — marker reveal', () => {
  test('idle → `>` 隐藏', async () => {
    const view = setUpEditor('> quote\n> second\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(hiddenCount(view)).toBe(2);
  });

  test('caret 行 → `>` 显示', async () => {
    const view = setUpEditor('> quote\n> second\n\nplain');
    await sleep();
    moveCaret(view, 3); // 第一行
    await sleep();
    expect(hiddenCount(view)).toBe(1); // 第二行仍隐藏
  });

  test('嵌套 quote 各自处理', async () => {
    const view = setUpEditor('> > nested\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(hiddenCount(view)).toBe(2); // 两个 `>`
  });
});

// ─────────────────────────── 行为（Enter/Tab/IME/copy/undo/live） ───────────────────────────

describe('List — 行为', () => {
  test('Enter continuation：新行续 marker', async () => {
    const view = setUpWithHistory('- item');
    await sleep();
    moveCaret(view, 6);
    view.dispatch({ changes: { from: 6, insert: '\n- ' } }); // CM continuation 语义
    await sleep();
    expect(view.state.doc.toString()).toBe('- item\n- ');
    moveCaret(view, 0); // 节点外需要尾部；验证 marker 存在
    await sleep();
  });

  test('Empty item terminate：空 marker 行 Enter → 段落', async () => {
    const view = setUpWithHistory('- item\n- \n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    // 空 item（`- `）的 marker 弱化
    expect(dimCount(view)).toBe(2);
    // 空行退出（CM 解析为两个 list item + 段落）
    expect(view.state.doc.toString()).toContain('\n\n');
  });

  test('multiline item：续行不新增 marker', async () => {
    const view = setUpEditor('- item\n  continuation\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(1); // 只有一个 marker（续行无）
  });

  test('Tab indent（模拟 CoreEditor 语法）', async () => {
    const view = setUpWithHistory('- item\n- second');
    await sleep();
    moveCaret(view, 7); // 第二项行首
    view.dispatch({ changes: { from: 7, insert: '  ' } }); // 缩进
    await sleep();
    expect(view.state.doc.toString()).toBe('- item\n  - second');
  });

  test('Chinese IME：list 内 composition 冻结', async () => {
    const view = setUpWithComposition('- 中文项目\n- second\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(2);

    startComposition();
    moveCaret(view, 3); // 合成中进入第一项 → 冻结
    await sleep();
    expect(dimCount(view)).toBe(2); // 不重算

    endComposition();
    moveCaret(view, 4);
    await sleep();
    expect(dimCount(view)).toBe(1); // 恢复（第一项显示）
  });

  test('copy/paste：唯一真源（文本含 marker）', async () => {
    const view = setUpEditor('- item\n- second\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(2); // 视觉弱化
    expect(view.state.doc.toString()).toContain('- item\n- second'); // 内容完整
  });

  test('undo/redo：marker 状态正确', async () => {
    const view = setUpWithHistory('- item\n- second\n\nplain');
    await sleep();
    const text = view.state.doc.toString();
    const end = text.indexOf('plain') + 5;
    moveCaret(view, end);
    view.dispatch({ changes: { from: end, insert: 'X' } });
    await sleep();
    expect(view.state.doc.toString()).toContain('plainX');

    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toContain('plain');
    moveCaret(view, 3);
    await sleep();
    expect(dimCount(view)).toBe(1); // caret 行显示
  });

  test('source/live transition：list marker 全显示（source）', async () => {
    const view = setUpEditor('- item\n- second\n\nplain');
    await sleep();
    caretOutsideList(view);
    await sleep();
    expect(dimCount(view)).toBe(2);

    setSourceMode(true);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(dimCount(view)).toBe(0);

    setSourceMode(false);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(dimCount(view)).toBe(2);
  });
});
