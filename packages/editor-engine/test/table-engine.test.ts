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
import { addRow, addRowAbove, deleteRow, addColumn, addColumnLeft, deleteColumn, setColumnAlignment, moveRow, moveColumn, deleteTable, copyTable } from '../src/table/commands';
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

// ───────────────── D4：上方插行/左侧插列/移动行列/删表/复制表 ─────────────────

describe('Table — D4 addRowAbove / addColumnLeft', () => {
  test('addRowAbove：数据行前插空行', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 20)!.model; // '1' 行（row 2）
    addRowAbove(view, model, 2);
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines.length).toBe(4);
    expect(lines[2]).toBe('| | |'); // 新空行（minimal 宽度，与 addRow 一致）
    expect(lines[3]).toBe('| 1 | 2 |'); // 原行下移
  });

  test('addRowAbove：header 行前插（表头上方）', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model; // header（row 0）
    addRowAbove(view, model, 0);
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines.length).toBe(4);
    expect(lines[0]).toBe('| | |'); // 新表头（minimal 宽度）
    expect(lines[1]).toBe('| a | b |'); // 原 header 成为第二行
  });

  test('addColumnLeft：首列左侧插列', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    addColumnLeft(view, model, 0);
    await sleep();
    const re = parseTable(view.state.doc.toString(), 0);
    expect(re.columnCount).toBe(3);
    expect(re.rows[0].cells[1].text).toBe('a'); // 原列右移
  });

  test('addColumnLeft：非首列复用 addColumn（前一列右侧）', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 5)!.model;
    addColumnLeft(view, model, 1);
    await sleep();
    const re = parseTable(view.state.doc.toString(), 0);
    expect(re.columnCount).toBe(3);
    expect(re.rows[0].cells[0].text).toBe('a');
    expect(re.rows[0].cells[1].text).toBe(''); // 新空列插在 'a' 与 'b' 之间
    expect(re.rows[0].cells[2].text).toBe('b');
  });
});

describe('Table — D4 moveRow / moveColumn', () => {
  test('moveRow up：数据行上移（不跨 delimiter）', async () => {
    const view = setUp('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
    await sleep();
    const model = tableContext(view, 30)!.model; // '3' 行（row 3）
    moveRow(view, model, 3, 'up');
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]).toBe('| 3 | 4 |');
    expect(lines[3]).toBe('| 1 | 2 |');
  });

  test('moveRow up：首数据行不与 delimiter 交换', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 20)!.model; // '1' 行（row 2，上方是 delimiter）
    moveRow(view, model, 2, 'up');
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE); // no-op
  });

  test('moveRow down：caret 跟随被移动行', async () => {
    const view = setUp('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
    await sleep();
    moveCaret(view, 26); // '1' 字符上（row 2 cell 0）
    const model = tableContext(view, 26)!.model;
    moveRow(view, model, 2, 'down');
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines[2]).toBe('| 3 | 4 |');
    expect(lines[3]).toBe('| 1 | 2 |');
    const ctx = tableContext(view, view.state.selection.main.head);
    expect(ctx?.cell.text).toBe('1'); // caret 仍在 '1' 内
  });

  test('moveColumn left：相邻列内容交换（含对齐标记）', async () => {
    const view = setUp('| a | b |\n| :-: | --: |\n| 1 | 2 |');
    await sleep();
    const model = tableContext(view, 5)!.model; // 'b' 列（col 1）
    moveColumn(view, model, 1, 'left');
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines[0]).toBe('| b | a |');
    expect(lines[1]).toBe('| --: | :-: |'); // 对齐标记随列移动
    expect(lines[2]).toBe('| 2 | 1 |');
  });

  test('moveColumn right：末列 no-op', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 5)!.model;
    moveColumn(view, model, 1, 'right');
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });
});

describe('Table — D4 deleteTable / copyTable', () => {
  test('deleteTable：整表删除（含后随换行）', async () => {
    const view = setUp('before\n\n' + TABLE + '\n\nafter');
    await sleep();
    const model = tableContext(view, 12)!.model;
    deleteTable(view, model);
    await sleep();
    expect(view.state.doc.toString()).toBe('before\n\nafter');
  });

  test('copyTable：表格源码写入剪贴板', async () => {
    const view = setUp(TABLE);
    await sleep();
    const model = tableContext(view, 2)!.model;
    const written: string[] = [];
    // jsdom 无 navigator.clipboard：注入 stub（configurable 便于恢复）
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (t: string) => {
          written.push(t);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
    try {
      copyTable(view, model);
      await sleep();
      expect(written).toEqual([TABLE]);
    } finally {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });
});
