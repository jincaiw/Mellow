/**
 * P5.1 Table — one action one Undo + minimal diff（V4 计划 P5 Table 行 + spec table-editing §6/§8）。
 *
 * A 组 minimal diff 结构断言：updateListener 收集 changed ranges，
 *   验证命令只 patch 必要范围（绝不整表 serialize，Tidy 除外）。
 * B 组 one action one Undo：每个命令一次 dispatch = 一个 history 事件，
 *   一次 undo 后 doc 逐字还原（Source Fidelity）。
 * C 组 composition 冻结：合成期间 commands 层拒绝一切表格编辑（spec §8）。
 */

import { EditorView, keymap } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { tableKeymap, tableContext } from '../src/table/keymap';
import {
  addRow,
  addRowAbove,
  addColumn,
  deleteColumn,
  deleteRow,
  deleteTable,
  moveColumn,
  moveRow,
  setColumnAlignment,
  tidyTable,
} from '../src/table/commands';
import { endComposition, insertAt, moveCaret, sleep, startComposition } from './harness';
import { resetCompositionState, installCompositionTracking } from '../src/composition';

interface CollectedRange { fromA: number; toA: number }

function setUp(doc: string): { view: EditorView; updates: CollectedRange[][] } {
  const updates: CollectedRange[][] = [];
  const collector: Extension = EditorView.updateListener.of((u) => {
    if (u.docChanged) {
      const rs: CollectedRange[] = [];
      u.changes.iterChangedRanges((fromA, toA) => rs.push({ fromA, toA }));
      updates.push(rs);
    }
  });
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      collector,
      keymap.of(tableKeymap()),
      install(false),
    ],
  });
  view.focus();
  return { view, updates };
}

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';

beforeEach(() => {
  resetCompositionState();
  document.body.innerHTML = '';
});

afterEach(() => {
  resetCompositionState();
  document.body.innerHTML = '';
});

// ───────────────── A 组：minimal diff 结构断言（spec §6） ─────────────────

describe('P5.1 A — minimal diff 结构（updateListener 收集 changed ranges）', () => {
  test('addRow：恰好 1 处纯插入 change', async () => {
    const { view, updates } = setUp(TABLE);
    await sleep();
    addRow(view, tableContext(view, 2)!.model, 2);
    await sleep();
    expect(updates.length).toBe(1);
    expect(updates[0].length).toBe(1);
    expect(updates[0][0].fromA).toBe(updates[0][0].toA); // 纯插入，无删除
  });

  test('addColumn：每行恰好 1 处 change（3 行表 = 3 处）', async () => {
    const { view, updates } = setUp(TABLE);
    await sleep();
    addColumn(view, tableContext(view, 2)!.model, 0);
    await sleep();
    expect(updates.length).toBe(1);
    expect(updates[0].length).toBe(3); // header / delimiter / data 各 1 处
  });

  test('setColumnAlignment：所有 change 落在 delimiter 行内（其余行一字不动）', async () => {
    const { view, updates } = setUp(TABLE);
    await sleep();
    const ctx = tableContext(view, 2)!;
    const delim = ctx.model.delimiterRow;
    expect(delim).not.toBeNull();
    setColumnAlignment(view, ctx.model, 1, 'right');
    await sleep();
    expect(updates.length).toBe(1);
    expect(updates[0].length).toBeGreaterThanOrEqual(1);
    for (const r of updates[0]) {
      expect(r.fromA).toBeGreaterThanOrEqual(delim!.from);
      expect(r.toA).toBeLessThanOrEqual(delim!.to);
    }
  });

  test('cell 内容编辑：单处 change 且范围落在该 cell 内', async () => {
    const { view, updates } = setUp(TABLE);
    await sleep();
    const ctx = tableContext(view, 2)!; // pos 2 = 'a' cell 内
    const cell = ctx.cell;
    insertAt(view, 3, 'X'); // 'a' → 'aX'
    await sleep();
    expect(updates.length).toBe(1);
    expect(updates[0].length).toBe(1);
    expect(updates[0][0].fromA).toBeGreaterThanOrEqual(cell.from);
    expect(updates[0][0].toA).toBeLessThanOrEqual(cell.to);
    expect(view.state.doc.toString()).toBe('| aX | b |\n| :-: | --- |\n| 1 | 2 |');
  });
});

// ───────────────── B 组：one action one Undo（一次 undo 逐字还原） ─────────────────

describe('P5.1 B — one action one Undo（spec §6 + V4 P5 Table 行）', () => {
  test('addRow → undo 逐字还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    addRow(view, tableContext(view, 2)!.model, 2);
    await sleep();
    expect(view.state.doc.toString()).not.toBe(TABLE);
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('addRowAbove（表头前插行）→ undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    addRowAbove(view, tableContext(view, 2)!.model, 0);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('deleteRow → undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    deleteRow(view, tableContext(view, 25)!.model, 2);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(2);
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('addColumn → undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    addColumn(view, tableContext(view, 2)!.model, 1);
    await sleep();
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('deleteColumn → undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    deleteColumn(view, tableContext(view, 2)!.model, 1);
    await sleep();
    expect(view.state.doc.toString()).toBe('| a |\n| :-: |\n| 1 |');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('setColumnAlignment → undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    setColumnAlignment(view, tableContext(view, 2)!.model, 0, 'right');
    await sleep();
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('tidyTable（唯一允许 full reformat）→ undo 还原', async () => {
    const messy = '|a   |b|\n| :-: | --- |\n| 1 | 2 |';
    const { view } = setUp(messy);
    await sleep();
    tidyTable(view, tableContext(view, 1)!.model);
    await sleep();
    const tidied = view.state.doc.toString();
    expect(tidied).not.toBe(messy); // 确实重排了
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(messy);
  });

  test('moveRow down → undo 还原（含 caret 还原）；不跨 delimiter', async () => {
    const two = '| a | b |\n| :-: | --- |\n| 1 | 2 |\n| 3 | 4 |';
    const { view } = setUp(two);
    await sleep();
    moveCaret(view, 25); // 第一个数据行内
    moveRow(view, tableContext(view, 25)!.model, 2, 'down');
    await sleep();
    const moved = view.state.doc.toString().split('\n');
    expect(moved[2]).toBe('| 3 | 4 |'); // 与下一数据行互换
    expect(moved[3]).toBe('| 1 | 2 |');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(two);
    // 单数据行表向上移动被 delimiter 挡住：no-op（实现不跨 delimiter）
    const { view: v2 } = setUp(TABLE);
    await sleep();
    moveRow(v2, tableContext(v2, 25)!.model, 2, 'up');
    await sleep();
    expect(v2.state.doc.toString()).toBe(TABLE);
  });

  test('moveColumn right → undo 还原（对齐标记随列移动）', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    moveColumn(view, tableContext(view, 2)!.model, 0, 'right');
    await sleep();
    expect(view.state.doc.toString()).toBe('| b | a |\n| --- | :-: |\n| 2 | 1 |');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  test('deleteTable → undo 还原', async () => {
    const doc = 'before\n\n' + TABLE + '\n\nafter';
    const { view } = setUp(doc);
    await sleep();
    deleteTable(view, tableContext(view, 12)!.model);
    await sleep();
    expect(view.state.doc.toString()).not.toContain('| a | b |');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(doc);
  });

  test('cell 内容编辑 → undo 还原', async () => {
    const { view } = setUp(TABLE);
    await sleep();
    insertAt(view, 3, 'X');
    await sleep();
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE);
  });
});

// ───────────────── C 组：composition 冻结（spec §8） ─────────────────

describe('P5.1 C — composition 期间 commands 冻结（spec §8）', () => {
  test('合成期间行/列/对齐命令全部 no-op，合成结束后恢复生效', async () => {
    installCompositionTracking();
    const { view } = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    startComposition();
    addRow(view, tableContext(view, 2)!.model, 2);
    deleteRow(view, tableContext(view, 2)!.model, 2);
    setColumnAlignment(view, tableContext(view, 2)!.model, 0, 'left');
    addColumn(view, tableContext(view, 2)!.model, 0);
    moveRow(view, tableContext(view, 2)!.model, 2, 'up');
    await sleep();
    expect(view.state.doc.toString()).toBe(TABLE); // 全部被冻结
    endComposition();
    addRow(view, tableContext(view, 2)!.model, 2);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4); // 合成结束恢复生效
  });
});
