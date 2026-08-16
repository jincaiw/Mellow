/**
 * 表格列宽拖拽（Typora 深度对标 ⑬）：delimiter 宽度 patch + 分隔线手柄 + 拖拽写回。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { dashCount, delimiterPatch, normalizeDelimiter, targetDashCount, COLUMN_DIVIDER_CLASS } from '../src/table/columnWidth';
import { parseTable } from '../src/table/parser';
import { moveCaret, sleep } from './harness';

const TABLE = '| a | b | c |\n| - | :-: | --: |\n| 1 | 2 | 3 |';

describe('纯函数（delimiter 宽度）', () => {
  test('dashCount 忽略对齐冒号', () => {
    expect(dashCount('---')).toBe(3);
    expect(dashCount(':--:')).toBe(2);
    expect(dashCount('--:')).toBe(2);
    expect(dashCount(' :---: ')).toBe(3);
  });

  test('normalizeDelimiter 保留对齐冒号', () => {
    expect(normalizeDelimiter('---', 5)).toBe('-----');
    expect(normalizeDelimiter(':--:', 4)).toBe(':----:');
    expect(normalizeDelimiter('--:', 4)).toBe('----:');
    expect(normalizeDelimiter(':--', 4)).toBe(':----');
    expect(normalizeDelimiter('---', 0)).toBe('-'); // 最小 1
  });

  test('delimiterPatch 只替换目标单元格（minimal patch）', () => {
    const model = parseTable(TABLE, 0);
    const delimiter = model.delimiterRow;
    expect(delimiter).not.toBeNull();
    const cell = delimiter!.cells[1]; // :-:（源码 | :-: | 带空白）
    const patch = delimiterPatch(cell, normalizeDelimiter(cell.text, 5));
    expect(patch).toEqual({ from: cell.from, to: cell.to, insert: ' :-----:  ' });
    // 只影响 delimiter 行：header 行不变
    expect(patch.from).toBeLessThan(delimiter!.to);
  });

  test('targetDashCount 夹取范围', () => {
    expect(targetDashCount(3, 2)).toBe(5);
    expect(targetDashCount(3, -10)).toBe(1);
    expect(targetDashCount(50, 100)).toBe(60);
  });
});

describe('列宽拖拽插件', () => {
  function setUp(doc: string): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    return view;
  }

  test('caret 在表格内 → 渲染 columnCount-1 个分隔线手柄', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 1); // 表头 a 内
    await sleep();
    expect(view.dom.querySelectorAll(`.${COLUMN_DIVIDER_CLASS}`).length).toBe(2); // 3 列 → 2 边界
    view.destroy();
  });

  test('caret 移出表格 → 手柄移除', async () => {
    const view = setUp(`text\n\n${TABLE}`);
    await sleep();
    moveCaret(view, 0); // 表格外（text 行）
    await sleep();
    expect(view.dom.querySelectorAll(`.${COLUMN_DIVIDER_CLASS}`).length).toBe(0);
    moveCaret(view, 8); // 表格内（| a | 处）
    await sleep();
    expect(view.dom.querySelectorAll(`.${COLUMN_DIVIDER_CLASS}`).length).toBe(2);
    view.destroy();
  });

  test('拖拽分隔线 → delimiter dash 数增加（minimal 写回）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 1);
    await sleep();
    const handle = view.dom.querySelector(`.${COLUMN_DIVIDER_CLASS}`) as HTMLElement;
    expect(handle).not.toBeNull();

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 0 })); // 大幅右拖（delta 取决于 charWidth，必然 > 0）
    window.dispatchEvent(new MouseEvent('mouseup', {}));
    await sleep();

    const docAfter = view.state.doc.toString();
    // 第二列 delimiter（:--:）dash 数增加（对齐冒号保留）
    const dashBefore = dashCount(':--:');
    const delimiterLine = docAfter.split('\n')[1];
    const cellText = delimiterLine.split('|')[2]?.trim() ?? '';
    expect(dashCount(cellText)).toBeGreaterThan(dashBefore);
    expect(cellText.startsWith(':')).toBe(true);
    expect(cellText.endsWith(':')).toBe(true);
    // header/数据行不变（minimal patch 只动 delimiter 行）
    expect(docAfter).toContain('| a | b | c |');
    expect(docAfter).toContain('| 1 | 2 | 3 |');
    view.destroy();
  });

  test('拖拽最小宽度夹取（不能少于 1 dash）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 1);
    await sleep();
    const handle = view.dom.querySelector(`.${COLUMN_DIVIDER_CLASS}`) as HTMLElement;

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 })); // 大幅左拖 → 夹到最小
    window.dispatchEvent(new MouseEvent('mouseup', {}));
    await sleep();

    const docAfter = view.state.doc.toString();
    const delimiterLine = docAfter.split('\n')[1];
    const cellText = delimiterLine.split('|')[2]?.trim() ?? '';
    expect(dashCount(cellText)).toBe(1); // 最少 1 dash
    view.destroy();
  });
});
