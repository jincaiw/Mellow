/**
 * Table 键盘测试（spec table-editing §5/§8）——真实按键管道 + IME guard。
 *
 * §5：Tab next / Shift+Tab prev / last+Tab add row / Mod+Enter add row /
 *      arrows normal caret / Escape closes toolbar
 * §8：composition 期间 keymap 不得移动 caret（不干扰 IME）
 */

import { EditorView, keymap } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, TOOLBAR_CLASS } from '../src/index';
import { tableKeymap, tableContext } from '../src/table/keymap';
import { resetCompositionState } from '../src/composition';
import { moveCaret, sleep, caretPos, startComposition, endComposition } from './harness';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), keymap.of(tableKeymap()), install()],
  });
  view.focus();
  return view;
}

function setUpProductionEngine(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    // Deliberately omit the test-only keymap injection: this is the extension
    // list used by the desktop editor through install().
    extensions: [markdown({ base: markdownLanguage }), install()],
  });
  view.focus();
  return view;
}

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';

/** 真实按键：dispatch keydown 到 contentDOM（CM6 keymap 管道） */
function pressKey(view: EditorView, key: string, init: KeyboardEventInit = {}): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );
}

/** caret 所在单元格文本；不在表格内返回 null */
function caretCell(view: EditorView): string | null {
  const ctx = tableContext(view, caretPos(view));
  return ctx === null ? null : ctx.cell.text;
}

function toolbarVisible(view: EditorView): boolean {
  const el = view.dom.querySelector(`.${TOOLBAR_CLASS}`) as HTMLElement | null;
  return el !== null && el.style.display !== 'none';
}

beforeEach(() => resetCompositionState());

describe('Table — 真实按键管道（spec §5）', () => {
  test('production install：源码态 Tab 进入下一单元格且不写入制表符', async () => {
    const view = setUpProductionEngine(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a' 内，Live View 按 reveal policy 显示源码
    const before = view.state.doc.toString();
    pressKey(view, 'Tab'); await sleep();
    expect(caretCell(view)).toBe('b');
    expect(view.state.doc.toString()).toBe(before);
    view.destroy();
  });

  test('Tab：a → b → 1 → 2（keydown dispatch 触发 keymap）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a' 内
    pressKey(view, 'Tab'); await sleep();
    expect(caretCell(view)).toBe('b');
    pressKey(view, 'Tab'); await sleep();
    expect(caretCell(view)).toBe('1'); // 跳过 delimiter 行
    pressKey(view, 'Tab'); await sleep();
    expect(caretCell(view)).toBe('2');
  });

  test('Shift+Tab：2 → 1 → b', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // '2' 内
    pressKey(view, 'Tab', { shiftKey: true }); await sleep();
    expect(caretCell(view)).toBe('1');
    pressKey(view, 'Tab', { shiftKey: true }); await sleep();
    expect(caretCell(view)).toBe('b');
  });

  test('last cell + Tab → add row + 进入新行首格', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // '2'（last cell）
    pressKey(view, 'Tab'); await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
    const ctx = tableContext(view, caretPos(view));
    expect(ctx?.cell.row).toBe(3);
    expect(ctx?.cell.col).toBe(0);
  });

  test('Mod+Enter → 当前行后 add row', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 5); // 'b' 内（header 行）
    // jsdom 非 macOS：CM 的 Mod 映射到 Ctrl
    pressKey(view, 'Enter', { ctrlKey: true }); await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
    const ctx = tableContext(view, caretPos(view));
    expect(ctx).not.toBeNull();
  });

  test('Escape 真实按键关闭 toolbar', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(toolbarVisible(view)).toBe(true);
    pressKey(view, 'Escape');
    await sleep();
    expect(toolbarVisible(view)).toBe(false);
  });

  test('arrows normal caret：方向键在单元格内正常移动（不触发跳格）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a' 内
    pressKey(view, 'ArrowRight');
    await sleep();
    // 方向键不触发表格导航：仍在 'a' 单元格（未跳去 'b'）
    expect(caretCell(view)).toBe('a');
  });
});

describe('Table — IME guard（spec §8）', () => {
  test('composition 期间 Tab 不移动 caret', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a' 内
    startComposition();
    pressKey(view, 'Tab'); await sleep();
    // 合成中：caret 不得被 keymap 移动
    expect(caretCell(view)).toBe('a');
    endComposition();
  });

  test('composition 期间 Mod+Enter 不 add row', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 5); // 'b' 内
    startComposition();
    pressKey(view, 'Enter', { metaKey: true }); await sleep();
    // 合成中：不得插入行
    expect(view.state.doc.toString().split('\n').length).toBe(3);
    endComposition();
  });
});

describe('Table — 表格外不拦截（交回默认）', () => {
  test('表格外 Tab：caret 不变（keymap 返回 false）', async () => {
    const view = setUp('plain text\n\n' + TABLE);
    await sleep();
    moveCaret(view, 3); // 'plain' 内（表格外）
    pressKey(view, 'Tab'); await sleep();
    expect(caretCell(view)).toBeNull();
    expect(caretPos(view)).toBe(3);
  });

  test('Shift+Tab 在表格首格：交回默认（不移到表格外）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a'（首格）
    pressKey(view, 'Tab', { shiftKey: true }); await sleep();
    expect(caretCell(view)).toBe('a'); // 不越界
  });
});
