/**
 * Table Resize（spec table-editing §3b「Resize Table」）。
 *
 * 一手口径（Typora 1.14.9）：
 * - `#md-resize-grid` 的 height/width 即**最终**行/列数；
 * - Typora 的 AST 里 delimiter **不是行**（它是 `align` 元数据）→ 故 `rows` = **含表头的正文行数，
 *   不含 delimiter 行**（与创建对话框的 `Rows` 同口径）。
 *
 * 断言重点：**最小 patch**（保留的行/单元格逐字不变）+ **一次 undo** + **delimiter 永不删** +
 * 「行列同时收缩」不产生重叠 change（CM 会拒绝）。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { parseTable } from '../src/table/parser';
import type { TableModel } from '../src/table/parser';
import {
  planResizeTable,
  resizeTable,
  TABLE_RESIZE_MAX_COLS,
  TABLE_RESIZE_MAX_ROWS,
} from '../src/table/commands';
import { sleep } from './harness';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

function modelOf(view: EditorView): TableModel {
  return parseTable(view.state.doc.toString(), 0);
}

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';
const LINES = TABLE.split('\n');

describe('planResizeTable（纯函数）', () => {
  test('尺寸未变 → null（不产生事务）', () => {
    const model = parseTable(TABLE, 0);
    expect(planResizeTable(model, 2, 2)).toBeNull();
  });

  test('越界请求会产出计划（夹取在命令层生效，见集成用例）', () => {
    const model = parseTable(TABLE, 0);
    expect(planResizeTable(model, 9999, 9999)).not.toBeNull();
    expect(planResizeTable(model, 0, 0)).not.toBeNull(); // 夹到 1 行 1 列
  });
});

describe('resizeTable —— 上限夹取（与 app-core 的表格创建共用同一组上限）', () => {
  test('请求 9999 × 9999 → 夹到 MAX_ROWS 正文行 / MAX_COLS 列', async () => {
    expect(TABLE_RESIZE_MAX_ROWS).toBe(100);
    expect(TABLE_RESIZE_MAX_COLS).toBe(30);
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 9999, 9999);
      await sleep();
      const lines = view.state.doc.toString().split('\n');
      expect(lines).toHaveLength(TABLE_RESIZE_MAX_ROWS + 1); // 正文行 + delimiter
      for (const line of lines) {
        expect(line.split('|').filter((s) => s.length > 0)).toHaveLength(TABLE_RESIZE_MAX_COLS);
      }
    } finally { view.destroy(); }
  });
});

describe('resizeTable —— 行', () => {
  test('增加正文行：只追加新行，原三行逐字不变', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 4, 2);
      await sleep();
      const lines = view.state.doc.toString().split('\n');
      // 2 正文行（表头 + 1 数据）→ 4 正文行 = 4 + delimiter = 5 行
      expect(lines).toHaveLength(5);
      expect(lines.slice(0, 3)).toEqual(LINES); // 原行逐字不变
      expect(lines[3]).toMatch(/^\|.*\|.*\|$/);
      expect(lines[4]).toMatch(/^\|.*\|.*\|$/);
    } finally { view.destroy(); }
  });

  test('减少正文行：删尾部数据行，表头与 delimiter 原样', async () => {
    const view = setUp(`${TABLE}\n| 3 | 4 |\n| 5 | 6 |`);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 2, 2);
      await sleep();
      expect(view.state.doc.toString()).toBe(TABLE);
    } finally { view.destroy(); }
  });

  test('rows 最小 1：只剩表头，**delimiter 行必须保留**（否则表格失效）', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 1, 2);
      await sleep();
      expect(view.state.doc.toString()).toBe('| a | b |\n| :-: | --- |');
      // 仍可被解析为表格（delimiter 在）
      expect(modelOf(view).delimiterRow).not.toBeNull();
    } finally { view.destroy(); }
  });
});

describe('resizeTable —— 列', () => {
  test('增加列：每行（含 delimiter）都补齐', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 2, 4);
      await sleep();
      const lines = view.state.doc.toString().split('\n');
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line.split('|').filter((s) => s.length > 0)).toHaveLength(4);
      }
      // 原有前两列逐字不变（最小 patch）
      expect(lines[0].startsWith('| a | b |')).toBe(true);
      expect(lines[1].startsWith('| :-: | --- |')).toBe(true);
      expect(lines[2].startsWith('| 1 | 2 |')).toBe(true);
    } finally { view.destroy(); }
  });

  test('减少列：删尾部列，保留的单元格逐字不变（含对齐标记）', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 2, 1);
      await sleep();
      expect(view.state.doc.toString()).toBe('| a |\n| :-: |\n| 1 |');
      expect(modelOf(view).alignments[0]).toBe('center'); // 保留列的对齐不变
    } finally { view.destroy(); }
  });

  test('保留单元格逐字不变：转义 pipe 与 inline code 不受影响', async () => {
    const source = '| a \\| b | `x|y` | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |';
    const view = setUp(source);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 2, 2);
      await sleep();
      expect(view.state.doc.toString())
        .toBe('| a \\| b | `x|y` |\n| --- | --- |\n| 1 | 2 |');
    } finally { view.destroy(); }
  });
});

describe('resizeTable —— 行列同时变化 / undo', () => {
  test('同时增行增列（单次 dispatch）', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 4, 3);
      await sleep();
      const lines = view.state.doc.toString().split('\n');
      expect(lines).toHaveLength(5); // 4 正文行 + delimiter
      for (const line of lines) {
        expect(line.split('|').filter((s) => s.length > 0)).toHaveLength(3);
      }
      expect(lines[0].startsWith('| a | b |')).toBe(true);
    } finally { view.destroy(); }
  });

  test('同时减行减列：不产生重叠 change（CM 会拒绝重叠），结果正确', async () => {
    const view = setUp(`${TABLE}\n| 3 | 4 |`);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 1, 1);
      await sleep();
      expect(view.state.doc.toString()).toBe('| a |\n| :-: |');
    } finally { view.destroy(); }
  });

  test('一次 undo 精确还原（单次 dispatch = 单次 undo）', async () => {
    const view = setUp(`${TABLE}\n| 3 | 4 |`);
    try {
      await sleep();
      resizeTable(view, modelOf(view), 6, 5);
      await sleep();
      expect(view.state.doc.toString()).not.toBe(`${TABLE}\n| 3 | 4 |`);
      expect(undo(view)).toBe(true);
      await sleep();
      expect(view.state.doc.toString()).toBe(`${TABLE}\n| 3 | 4 |`);
    } finally { view.destroy(); }
  });

  test('no-op 不产生事务（undo 深度不增长）', async () => {
    const view = setUp(TABLE);
    try {
      await sleep();
      const before = view.state.doc.toString();
      resizeTable(view, modelOf(view), 2, 2); // 与当前一致
      await sleep();
      expect(view.state.doc.toString()).toBe(before);
      expect(undo(view)).toBe(false); // 没有可撤销的事务
    } finally { view.destroy(); }
  });
});
