/**
 * Table Engine 集成测试（spec table-editing §5/§6）。
 * 验证 minimal patch + 键盘导航 + 唯一真源。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { install } from '../src/index';
import { tableKeymap, tableContext } from '../src/table/keymap';
import { addRow, deleteRow, addColumn, deleteColumn, setColumnAlignment } from '../src/table/commands';
import { parseTable } from '../src/table/parser';
import type { TableCell } from '../src/table/parser';
import { moveCaret, sleep, caretPos } from './harness';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), keymap.of(tableKeymap()), install(false)],
  });
  view.focus();
  return view;
}

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';

/** 执行 keymap 绑定（KeyBinding.run 可选） */
function runKey(view: EditorView, key: string): void {
  const binding = tableKeymap().find((k) => k.key === key);
  binding?.run?.(view);
}

function caretIn(view: EditorView): { model: ReturnType<typeof parseTable>; cell: TableCell } | null {
  const ctx = tableContext(view, view.state.selection.main.head);
  return ctx === null ? null : { model: ctx.model, cell: ctx.cell };
}

describe('Table — Tab 导航（spec §5）', () => {
  test('Tab：a → b → 1 → 2', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 'a' 内
    runKey(view, 'Tab'); await sleep();
    expect(caretIn(view)?.cell.text).toBe('b');
    runKey(view, 'Tab'); await sleep();
    expect(caretIn(view)?.cell.text).toBe('1'); // 跳过 delimiter 行
    runKey(view, 'Tab'); await sleep();
    expect(caretIn(view)?.cell.text).toBe('2');
  });

  test('Shift+Tab：2 → 1 → b', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // '2' 内
    runKey(view, 'Shift-Tab'); await sleep();
    expect(caretIn(view)?.cell.text).toBe('1');
    runKey(view, 'Shift-Tab'); await sleep();
    expect(caretIn(view)?.cell.text).toBe('b');
  });

  test('last cell + Tab → add row + 进入新行首格', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // '2'（last cell）
    runKey(view, 'Tab'); await sleep();
    const text = view.state.doc.toString();
    expect(text.split('\n').length).toBe(4); // 新行已添加
    const ctx = caretIn(view);
    expect(ctx?.cell.row).toBe(3);
    expect(ctx?.cell.col).toBe(0);
  });

  test('Ctrl+Enter → 当前行后 add row', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 5); // 'b' 内（header 行）
    runKey(view, 'Mod-Enter'); await sleep();
    const ctx = caretIn(view);
    expect(ctx).not.toBeNull();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
  });
});

describe('Table — add/delete row（spec §6 minimal）', () => {
  test('addRow：插入一行（1 处 insert）', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    const before = view.state.doc.toString();
    addRow(view, model, 2); // 数据行后
    await sleep();
    const after = view.state.doc.toString();
    expect(after.split('\n').length).toBe(4);
    expect(after.startsWith(before)).toBe(true); // 原内容保留
  });

  test('deleteRow：删除数据行', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    deleteRow(view, model, 2);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(2);
    expect(view.state.doc.toString()).toContain('| a | b |');
  });
});

describe('Table — add/delete column', () => {
  test('addColumn：每行插入 cell（多行 changes）', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    addColumn(view, model, 1);
    await sleep();
    const re = parseTable(view.state.doc.toString().split('\n').slice(0, 3).join('\n'), 0);
    expect(re.columnCount).toBe(3);
  });

  test('deleteColumn：每行删除对应 cell', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    deleteColumn(view, model, 0);
    await sleep();
    const re = parseTable(view.state.doc.toString().split('\n').slice(0, 3).join('\n'), 0);
    expect(re.columnCount).toBe(1);
    expect(re.rows[0].cells[0].text).toBe('b');
  });
});

describe('Table — alignment（只 patch delimiter 行）', () => {
  test('setColumnAlignment：仅 delimiter 行变化', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    const before = view.state.doc.toString();
    setColumnAlignment(view, model, 1, 'right');
    await sleep();
    const after = view.state.doc.toString();
    expect(after.split('\n')[0]).toBe(before.split('\n')[0]);
    expect(after.split('\n')[2]).toBe(before.split('\n')[2]);
    expect(after.split('\n')[1]).toContain('--:');
    const re = parseTable(after.split('\n').slice(0, 3).join('\n'), 0);
    expect(re.alignments[1]).toBe('right');
  });

  test('唯一真源：多操作后可重新解析', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    addRow(view, model, 2); await sleep();
    const model2 = tableContext(view, 2)!.model;
    addColumn(view, model2, 0); await sleep();
    const model3 = tableContext(view, 2)!.model;
    setColumnAlignment(view, model3, 0, 'center'); await sleep();
    const text = view.state.doc.toString();
    const re = parseTable(text.split('\n').slice(0, 4).join('\n'), 0);
    expect(re.rows.length).toBe(4);
    expect(re.columnCount).toBe(3);
    expect(re.alignments[0]).toBe('center');
  });
});

describe('Table — Undo / 性能', () => {
  test('操作后一次 undo 还原', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    addRow(view, model, 2);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
    undo(view);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(3);
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('caret 保持：addRow 后 caret 不越界', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 5);
    const model = tableContext(view, 5)!.model;
    addRow(view, model, 2);
    await sleep();
    expect(caretPos(view)).toBeLessThanOrEqual(view.state.doc.length);
  });
});
