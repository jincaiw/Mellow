/**
 * 表格模板生成（spec §3 Create Dialog）—— 默认值与「Rows 含表头」口径均为一手证据，
 * 见 `src/tableTemplate.ts` 文件头的逐条出处。
 */
import {
  buildGfmTable,
  parseTableCount,
  TABLE_TEMPLATE_DEFAULT_COLUMNS,
  TABLE_TEMPLATE_DEFAULT_ROWS,
  TABLE_TEMPLATE_EMPTY_COLUMNS,
  TABLE_TEMPLATE_EMPTY_ROWS,
  TABLE_TEMPLATE_MAX_COLUMNS,
  TABLE_TEMPLATE_MAX_ROWS,
} from '../src/tableTemplate';

describe('buildGfmTable', () => {
  test('默认值来自一手证据：4 行（含表头）3 列', () => {
    expect(TABLE_TEMPLATE_DEFAULT_ROWS).toBe(4);
    expect(TABLE_TEMPLATE_DEFAULT_COLUMNS).toBe(3);
  });

  test('默认参数产出：1 表头 + 1 分隔 + 3 数据行（Rows 含表头）', () => {
    const out = buildGfmTable(TABLE_TEMPLATE_DEFAULT_ROWS, TABLE_TEMPLATE_DEFAULT_COLUMNS);
    expect(out).toBe([
      '|  |  |  |',
      '|---|---|---|',
      '|  |  |  |',
      '|  |  |  |',
      '|  |  |  |',
    ].join('\n'));
    expect(out.split('\n')).toHaveLength(5); // 4 行（含表头）+ 1 分隔行
  });

  test('rows = 1 → 只有表头 + 分隔行（GFM 合法最简表格）', () => {
    expect(buildGfmTable(1, 2)).toBe('|  |  |\n|---|---|');
  });

  test('列数正确反映在每一行（表头 / 分隔 / 数据行三处）', () => {
    const lines = buildGfmTable(3, 5).split('\n');
    expect(lines).toHaveLength(4); // 3 行（含表头）+ 分隔行
    for (const line of lines) {
      expect(line.split('|').filter((s) => s.length > 0)).toHaveLength(5);
    }
    expect(lines[1]).toBe('|---|---|---|---|---|');
  });

  test('越界夹取：0 / 负数 → 1；超上限 → 上限', () => {
    expect(buildGfmTable(0, 0)).toBe('|  |\n|---|');
    expect(buildGfmTable(-5, -1)).toBe('|  |\n|---|');
    expect(buildGfmTable(999, 999).split('\n')).toHaveLength(TABLE_TEMPLATE_MAX_ROWS + 1);
    expect(buildGfmTable(2, 999).split('\n')[0].split('|').filter((s) => s.length > 0))
      .toHaveLength(TABLE_TEMPLATE_MAX_COLUMNS);
  });

  test('非数字 / 小数：NaN → 1；小数截断', () => {
    expect(buildGfmTable(Number.NaN, Number.NaN)).toBe('|  |\n|---|');
    expect(buildGfmTable(3.9, 2.2)).toBe('|  |  |\n|---|---|\n|  |  |\n|  |  |');
  });

  test('输出可直接被 GFM 解析（分隔行必须是第二行）', () => {
    const lines = buildGfmTable(4, 3).split('\n');
    expect(lines[1]).toMatch(/^\|(\s*-{3,}\s*\|)+$/);
  });
});

describe('parseTableCount（对话框字段解析；一手兜底语义）', () => {
  test('空串 → 该字段的兜底值（列 2 / 行 1，均为一手证据）', () => {
    expect(TABLE_TEMPLATE_EMPTY_COLUMNS).toBe(2);
    expect(TABLE_TEMPLATE_EMPTY_ROWS).toBe(1);
    expect(parseTableCount('', TABLE_TEMPLATE_EMPTY_COLUMNS)).toBe(2);
    expect(parseTableCount('   ', TABLE_TEMPLATE_EMPTY_ROWS)).toBe(1);
    expect(parseTableCount(undefined, TABLE_TEMPLATE_EMPTY_COLUMNS)).toBe(2);
  });

  test('正常数字原样解析（含前后空白）', () => {
    expect(parseTableCount('5', TABLE_TEMPLATE_EMPTY_COLUMNS)).toBe(5);
    expect(parseTableCount(' 12 ', TABLE_TEMPLATE_EMPTY_ROWS)).toBe(12);
  });

  test('非数字 → 兜底值（不返回 NaN，交给 buildGfmTable 前已确定）', () => {
    expect(parseTableCount('abc', TABLE_TEMPLATE_EMPTY_COLUMNS)).toBe(2);
    expect(parseTableCount('-', TABLE_TEMPLATE_EMPTY_ROWS)).toBe(1);
  });
});
