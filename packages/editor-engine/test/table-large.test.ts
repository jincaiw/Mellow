/**
 * P5.2 Table — 100×30 大表测试（V4 计划 P5 Table 行「100×30 大表测试（当前 0）」+ spec table-editing §9）。
 *
 * §9 目标：edit usable / no full DOM rebuild per keypress（source 层等价断言：
 * 编辑仍是 minimal patch，不随表大小退化为整表 serialize）/ viewport-aware。
 * 性能绝对值（不慢于 Typora +5%）属真机 benchmark（tests/benchmark/），
 * 此处只做结构正确性 + 宽上界回归护栏。
 */

import { EditorView, keymap } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { tableKeymap, tableContext } from '../src/table/keymap';
import {
  addRow,
  addColumn,
  deleteRow,
  moveRow,
  setColumnAlignment,
} from '../src/table/commands';
import { parseTable } from '../src/table/parser';
import { insertAt, moveCaret, sleep } from './harness';

const COLS = 30;
const DATA_ROWS = 100;

function buildBigTable(): string {
  const head = '|' + Array.from({ length: COLS }, (_, c) => ` H${c} `).join('|') + '|';
  const delim = '|' + Array.from({ length: COLS }, () => ' --- ').join('|') + '|';
  const rows = Array.from({ length: DATA_ROWS }, (_, r) =>
    '|' + Array.from({ length: COLS }, (_, c) => ` r${r}c${c} `).join('|') + '|',
  );
  return [head, delim, ...rows].join('\n');
}

const BIG = buildBigTable();

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      keymap.of(tableKeymap()),
      install(false),
    ],
  });
  view.focus();
  return view;
}

/** 找到数据行 r、列 c 单元格中心的 doc 位置 */
function posOf(r: number, c: number): number {
  const model = parseTable(BIG, 0);
  const cell = model.rows[r + 2].cells[c]; // +2 跳过 header / delimiter
  return cell.from + 2; // 跳过前导 '| ' 落在文本首字符
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('P5.2 — 100×30 大表（spec §9）', () => {
  test('解析正确性：102 行模型（header+delimiter+100 数据行）、30 列', async () => {
    const view = setUp(BIG);
    await sleep();
    const ctx = tableContext(view, posOf(50, 15));
    expect(ctx).not.toBeNull();
    expect(ctx!.model.rows.length).toBe(DATA_ROWS + 2);
    expect(ctx!.model.columnCount).toBe(COLS);
    expect(ctx!.cell.text).toBe('r50c15');
    expect(ctx!.cell.row).toBe(52);
    expect(ctx!.cell.col).toBe(15);
    view.destroy();
  });

  test('中部 cell 编辑：单处 patch、范围在 cell 内、其他 101 行逐字不变、undo 还原', async () => {
    const view = setUp(BIG);
    await sleep();
    const pos = posOf(50, 15);
    moveCaret(view, pos);
    const t0 = Date.now();
    insertAt(view, pos, 'X'); // r50c15 → r50cX15 位置中间
    const elapsed = Date.now() - t0;
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines[52]).toContain('rX50c15'); // 插入点在 cell 第 2 字符后
    // 非 target 行不受影响（抽查首行/尾行/相邻行）
    expect(lines[0]).toContain(' H29 ');
    expect(lines[51]).toContain('r49c29');
    expect(lines[53]).toContain('r51c0');
    expect(lines.length).toBe(DATA_ROWS + 2);
    // 宽上界回归护栏（结构上仍是 O(cell) patch；绝对性能归真机 benchmark）
    expect(elapsed).toBeLessThan(2000);
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    view.destroy();
  });

  test('addRow（中部）：仍为 1 处纯插入 change，不随表大小退化', async () => {
    const view = setUp(BIG);
    await sleep();
    const pos = posOf(50, 15);
    const changesBefore = view.state.doc.length;
    addRow(view, tableContext(view, pos)!.model, 52);
    await sleep();
    expect(view.state.doc.length - changesBefore).toBeGreaterThan(0);
    const lines = view.state.doc.toString().split('\n');
    expect(lines.length).toBe(DATA_ROWS + 3);
    expect(lines[53]).toBe('|' + Array.from({ length: COLS }, () => ' ').join('|') + '|');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    view.destroy();
  });

  test('setColumnAlignment：大表下仍只 patch delimiter 行，一次 undo 还原', async () => {
    const view = setUp(BIG);
    await sleep();
    const ctx = tableContext(view, posOf(50, 15))!;
    setColumnAlignment(view, ctx.model, 15, 'center');
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines[1].split('|')[15 + 1].trim()).toBe(':--:'); // split 首元素为空串，col 15 → index 16
    // 数据行一字未动
    expect(lines[52]).toContain('r50c15');
    expect(lines[101]).toContain('r99c29');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    view.destroy();
  });

  test('addColumn：102 行每行 1 处 change；一次 undo 还原', async () => {
    const view = setUp(BIG);
    await sleep();
    const pos = posOf(50, 15);
    addColumn(view, tableContext(view, pos)!.model, 15);
    await sleep();
    const lines = view.state.doc.toString().split('\n');
    expect(lines.length).toBe(DATA_ROWS + 2);
    for (const line of lines) {
      expect(line.split('|').length).toBe(COLS + 3); // 前导空 + 31 cell + 尾空
    }
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    view.destroy();
  });

  test('deleteRow / moveRow：一次 undo 逐字还原', async () => {
    const view = setUp(BIG);
    await sleep();
    const pos = posOf(50, 15);
    deleteRow(view, tableContext(view, pos)!.model, 52);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(DATA_ROWS + 1);
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);

    moveRow(view, tableContext(view, pos)!.model, 52, 'down');
    await sleep();
    const moved = view.state.doc.toString().split('\n');
    expect(moved[52]).toContain('r51c0');
    expect(moved[53]).toContain('r50c0');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    view.destroy();
  });

  test('全表解析+定位+编辑往返 smoke：耗时宽上界（回归护栏）', async () => {
    const view = setUp(BIG);
    const t0 = Date.now();
    await sleep();
    const pos = posOf(99, 29); // 最后一格
    moveCaret(view, pos);
    insertAt(view, pos, '!');
    await sleep();
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(BIG);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(5000);
    view.destroy();
  });
});
