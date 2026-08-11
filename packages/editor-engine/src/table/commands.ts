/**
 * Table 命令 —— minimal patch（spec table-editing §6）。
 *
 * 原则：
 * - add row：插入一行源码（1 处 changes）
 * - delete row：删除一行源码
 * - add column：每行插入 1 个分隔（多行 changes，只碰各行的列边界）
 * - delete column：每行删除对应 cell（多行 changes，只碰 cell 范围）
 * - alignment：**只 patch delimiter 行**（spec §6：only command allowed to reformat）
 * - 绝不整表 serialize（唯一例外：显式 Tidy）
 */

import type { EditorView } from '@codemirror/view';
import type { ChangeSpec } from '@codemirror/state';
import type { TableModel, CellAlignment } from './parser';
import { parseTable, parseAlignment } from './parser';

/** 运行时获取 CM 模块（iframe 内与 CoreEditor 同一实例） */
function requireCm<T>(id: string): T {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn === 'function') {
    return requireFn(id) as T;
  }
  throw new Error('[mellow-table] window.require unavailable');
}

/** 生成空单元格文本（对齐宽度占位，最小 1 空格） */
function emptyCellText(align?: CellAlignment | null): string {
  const mark = align === 'center' ? ':--:' : align === 'right' ? '--:' : align === 'left' ? ':--' : '---';
  return ` ${mark} `;
}

/** 生成数据单元格（` value `，minimal 宽度） */
function dataCellText(value = ''): string {
  return ` ${value} `.replace(/\s+$/g, value === '' ? ' ' : ' ');
}

/** 当前 caret 所在表格（syntaxTree 查找 Table 节点） */
export function tableAt(view: EditorView, pos: number): { model: TableModel } | null {
  const { syntaxTree: getTree } = requireCm<typeof import('@codemirror/language')>('@codemirror/language');
  const tree = getTree(view.state);
  let found = false;
  let nodeFrom = 0;
  let nodeTo = 0;
  tree.iterate({ from: 0, to: view.state.doc.length, enter: (n) => {
    if (n.name === 'Table' && pos >= n.from && pos <= n.to) {
      found = true;
      nodeFrom = n.from;
      nodeTo = n.to;
    }
  }});
  if (!found) {
    return null;
  }
  const text = view.state.sliceDoc(nodeFrom, nodeTo);
  const model = parseTable(text, nodeFrom);
  return { model };
}

// ─────────────────────────── Row 操作 ───────────────────────────

/** 在当前行后添加一行（minimal：1 处 insert） */
export function addRow(view: EditorView, model: TableModel, afterRow: number): void {
  const anchor = model.rows[afterRow];
  if (anchor === undefined) {
    return;
  }
  const cells = Array.from({ length: model.columnCount }, () => dataCellText()).join('|');
  const insert = `\n|${cells}|`;
  view.dispatch({ changes: { from: anchor.to, insert } });
}

/** 删除行（minimal：删除该行及前导换行） */
export function deleteRow(view: EditorView, model: TableModel, row: number): void {
  const target = model.rows[row];
  if (target === undefined || target.isDelimiter) {
    return; // 不删 delimiter（否则表格失效）
  }
  const prev = row > 0 ? model.rows[row - 1] : null;
  if (prev !== null) {
    // 删除 [prev.to, target.to]（含中间换行 + 目标行）
    view.dispatch({ changes: { from: prev.to, to: target.to, insert: '' } });
  } else {
    // 第一行：删除目标行 + 后随换行（若存在）
    const to = Math.min(target.to + 1, view.state.doc.length);
    view.dispatch({ changes: { from: target.from, to, insert: '' } });
  }
}

// ─────────────────────────── Column 操作 ───────────────────────────

/** 添加列（每行插入 cell；delimiter 行加对齐 mark） */
export function addColumn(view: EditorView, model: TableModel, afterCol: number): void {
  const changes: ChangeSpec[] = [];
  for (const row of model.rows) {
    // 在 afterCol 单元格后插入 `| cell`
    const anchorCell = row.cells[afterCol];
    if (anchorCell === undefined) {
      // 行比列少：行尾补 cell
      changes.push({ from: row.to, insert: row.cells.length > 0 ? '|' + dataCellText() : dataCellText() });
      continue;
    }
    const insert = row.isDelimiter
      ? '|' + emptyCellText()
      : '|' + dataCellText();
    changes.push({ from: anchorCell.to, insert });
  }
  view.dispatch({ changes });
}

/** 删除列（每行删除对应 cell；跳过列数不足的行） */
export function deleteColumn(view: EditorView, model: TableModel, col: number): void {
  const changes: ChangeSpec[] = [];
  for (const row of model.rows) {
    const cell = row.cells[col];
    if (cell === undefined) {
      continue;
    }
    const isFirst = col === 0;
    // 非首列：删除前导 | + cell；首列：删除 cell + 后随 |
    const delFrom = isFirst ? cell.from : cell.from - 1;
    const delTo = isFirst ? Math.min(cell.to + 1, row.to) : cell.to;
    changes.push({ from: delFrom, to: delTo, insert: '' });
  }
  view.dispatch({ changes });
}

// ─────────────────────────── Alignment ───────────────────────────

/** 设置列对齐：**只 patch delimiter 行**（spec §6） */
export function setColumnAlignment(view: EditorView, model: TableModel, col: number, align: CellAlignment): void {
  const delimiter = model.delimiterRow;
  if (delimiter === null) {
    return;
  }
  const cell = delimiter.cells[col];
  if (cell === undefined) {
    return;
  }
  const mark = align === 'center' ? ':--:' : align === 'right' ? '--:' : ':--';
  // 保留 cell 前导/后随空白结构（minimal：只替换 -- 部分）
  const text = cell.text;
  const newText = text.startsWith(':') && text.endsWith(':')
    ? `:${mark.slice(1, -1)}:`
    : text.endsWith(':')
      ? `${mark.slice(0, -1)}:`
      : text.startsWith(':')
        ? `:${mark.slice(1)}`
        : mark;
  view.dispatch({ changes: { from: cell.from, to: cell.to, insert: ` ${newText} ` } });
}

/** Tidy：完整重新对齐（spec §6：唯一允许 full reformat 的命令）——Phase 1 标记实现点 */
export function tidyTable(view: EditorView, model: TableModel): void {
  // 计算每列最大宽度（跳过 delimiter 行——对齐标记不参与宽度）
  const widths = Array.from({ length: model.columnCount }, (_, c) => {
    let max = 0;
    for (const row of model.rows) {
      if (row.isDelimiter) {
        continue;
      }
      const cell = row.cells[c];
      if (cell !== undefined) {
        max = Math.max(max, cell.text.length);
      }
    }
    return Math.max(max, 1);
  });

  const align = (mark: string): string => {
    const a = parseAlignment(mark) ?? null;
    return a === 'center' ? ':--:' : a === 'right' ? '--:' : a === 'left' ? ':--' : '---';
  };

  const renderedRows = model.rows.map((row) => {
    const cells = Array.from({ length: model.columnCount }, (_, c) => {
      const cell = row.cells[c];
      const text = cell?.text ?? '';
      const width = widths[c];
      if (row.isDelimiter) {
        const mark = align(text);
        // 对齐填充
        const raw = mark.replace(/^-+$/, '-'.repeat(Math.max(width, 3)));
        return ` ${raw} `;
      }
      return ` ${text.padEnd(width, ' ')} `;
    });
    return `|${cells.join('|')}|`;
  });

  const from = model.rows[0]?.from ?? model.from;
  const to = model.rows[model.rows.length - 1]?.to ?? model.to;
  view.dispatch({ changes: { from, to, insert: renderedRows.join('\n') } });
}
