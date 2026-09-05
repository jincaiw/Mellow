/**
 * Table 解析器纯函数测试（spec table-editing §10）。
 */

import {
  parseTable, splitCellPositions, isDelimiterLine, parseAlignment, nextCell, prevCell,
} from '../src/table/parser';

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';

describe('parseTable', () => {
  test('基本表格：3 行 2 列 + 分隔行 + 对齐', () => {
    const model = parseTable(TABLE, 0);
    expect(model.rows.length).toBe(3);
    expect(model.columnCount).toBe(2);
    expect(model.delimiterRow).not.toBeNull();
    expect(model.alignments).toEqual(['center', null]); // :--: → center；--- → null
    // 单元格范围
    expect(model.rows[0].cells[0].text).toBe('a');
    expect(model.rows[2].cells[1].text).toBe('2');
    // 绝对偏移（'| 1 | 2 |' 从 24 起，cell[1] 从 29 起）
    expect(model.rows[0].cells[0].from).toBe(1);
    expect(model.rows[2].cells[1].from).toBe(29);
    expect(model.rows[2].cells[1].text).toBe('2');
  });

  test('中文 / emoji 单元格', () => {
    const model = parseTable('| 苹果 | 🎉 |\n| --- | --- |', 0);
    expect(model.rows[0].cells[0].text).toBe('苹果');
    expect(model.rows[0].cells[1].text).toBe('🎉');
  });

  test('单元格内链接与 inline code', () => {
    const model = parseTable('| [link](https://x.com) | `code` |\n| --- | --- |', 0);
    expect(model.rows[0].cells[0].text).toBe('[link](https://x.com)');
    expect(model.rows[0].cells[1].text).toBe('`code`');
  });

  test('escaped pipe（\\|）不算分隔', () => {
    const model = parseTable('| a\\|b | c |\n| --- | --- |', 0);
    expect(model.rows[0].cells.length).toBe(2);
    expect(model.rows[0].cells[0].text).toBe('a\\|b');
  });

  test('inline code 内 pipe 不算分隔', () => {
    const model = parseTable('| `a|b` | c |\n| --- | --- |', 0);
    expect(model.rows[0].cells.length).toBe(2);
    expect(model.rows[0].cells[0].text).toBe('`a|b`');
  });

  test('空单元格', () => {
    const model = parseTable('| a |  |\n| --- | --- |', 0);
    expect(model.rows[0].cells[1].text).toBe('');
  });

  test('对齐解析', () => {
    expect(parseAlignment(':--:')).toBe('center');
    expect(parseAlignment('--:')).toBe('right');
    expect(parseAlignment(':--')).toBe('left');
    expect(parseAlignment('---')).toBeNull();
  });

  test('isDelimiterLine', () => {
    expect(isDelimiterLine('| --- | --- |')).toBe(true);
    expect(isDelimiterLine('| a | b |')).toBe(false);
  });

  test('V5-C2 引用内表格（行首 "> " 前缀）', () => {
    const model = parseTable('| a | b |\n> | :---: | ---: |\n> | 1 | 2 |', 0);
    expect(model.delimiterRow).not.toBeNull();
    expect(model.alignments).toEqual(['center', 'right']);
    expect(model.rows[2].cells[0].text).toBe('1');
    // contentFrom 必须指向剥掉前缀后的真实编辑位置
    expect(model.rows[2].cells[0].contentFrom).toBeGreaterThan(model.rows[2].from);
    const cell = model.rows[2].cells[0];
    expect(cell.text).toBe('1');
  });
});

describe('cell 导航', () => {
  test('nextCell / prevCell 跨行', () => {
    const model = parseTable(TABLE, 0);
    const first = model.rows[0].cells[0];
    const next = nextCell(model, first);
    expect(next?.text).toBe('b');
    const next2 = nextCell(model, next!);
    expect(next2?.text).toBe('1'); // 下一行
    const last = model.rows[2].cells[1];
    expect(nextCell(model, last)).toBeNull(); // last cell
    expect(prevCell(model, model.rows[2].cells[1])?.text).toBe('1'); // 同行前驱
  });
});

describe('splitCellPositions', () => {
  test('跳过转义与 code', () => {
    const positions = splitCellPositions('| a\\|b | `c|d` | e |', 0);
    expect(positions.length).toBe(3); // a\|b / `c|d` / e（转义与 code 内 | 不算分隔）
    expect(positions[0].offsetFrom).toBe(1); // 第一个 cell 从行首 | 后开始
  });
});
