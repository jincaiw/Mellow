/**
 * Table 解析器 —— 纯函数（spec table-editing §2/§6）。
 *
 * Markdown source 唯一真源：只解析 cell range（绝对 doc 偏移），
 * 不做富文本文档模型。所有编辑 = minimal text patch。
 */

/** 单元格对齐 */
export type CellAlignment = 'left' | 'center' | 'right';

/** 单元格（绝对 doc 偏移） */
export interface TableCell {
  from: number;
  to: number;
  /** 单元格文本（不含前后空白） */
  text: string;
  /** 内容起始（去掉前导空白后的实际编辑位置） */
  contentFrom: number;
  row: number;
  col: number;
}

/** 表格行 */
export interface TableRow {
  from: number;
  to: number;
  cells: TableCell[];
  /** 是否为分隔行（---） */
  isDelimiter: boolean;
}

/** 表格模型 */
export interface TableModel {
  from: number;
  to: number;
  rows: TableRow[];
  /** 分隔行（对齐信息所在） */
  delimiterRow: TableRow | null;
  /** 列对齐（按 delimiter 行解析） */
  alignments: Array<CellAlignment | null>;
  columnCount: number;
}

/**
 * 解析表格源码（doc 从 tableFrom 到 tableTo 之间的内容）。
 * 单元格分割：跳过转义 pipe（\|）与 inline code 内的 pipe（`a|b`）。
 *
 * V5-C2：lezer 给出的 BlockQuote 内 Table 节点范围包含行首 `> ` 前缀，
 * 每行先剥离 blockquote/缩进前缀再切分单元格，偏移按前缀长度回补。
 */
export function parseTable(text: string, baseFrom: number): TableModel {
  const lines = text.split('\n');
  const rows: TableRow[] = [];
  let delimiterIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineFrom = baseFrom + lines.slice(0, i).reduce((sum, l) => sum + l.length + 1, 0);
    const lineTo = lineFrom + line.length;

    // 行首 blockquote 前缀（如 "> " / "> > "），顶层表格为 0
    const prefixMatch = /^(?:[ \t]*>[ \t]?)+/.exec(line);
    const prefixLength = prefixMatch === null ? 0 : prefixMatch[0].length;
    const effectiveLine = line.slice(prefixLength);

    // 行必须是表格行（以 | 开头或包含 |）
    const cellPositions = splitCellPositions(effectiveLine, lineFrom + prefixLength);
    if (cellPositions.length < 2 && !effectiveLine.trim().startsWith('|')) {
      // 非表格行（表格结束）
      break;
    }

    const isDelimiter = isDelimiterLine(effectiveLine);
    const cells: TableCell[] = cellPositions.map((pos, col) => {
      const from = pos.from;
      const to = pos.to;
      const raw = effectiveLine.slice(pos.offsetFrom, pos.offsetTo);
      // 内容范围（去掉前导空白）
      const leading = raw.length - raw.trimStart().length;
      return {
        from,
        to,
        text: raw.trim(),
        contentFrom: from + leading,
        row: i,
        col,
      };
    });

    if (isDelimiter && delimiterIndex === -1) {
      delimiterIndex = rows.length;
    }
    rows.push({ from: lineFrom, to: lineTo, cells, isDelimiter });
  }

  const delimiterRow = delimiterIndex >= 0 ? rows[delimiterIndex] : null;
  const columnCount = Math.max(...rows.map((r) => r.cells.length), delimiterRow?.cells.length ?? 0, 1);
  const alignments: Array<CellAlignment | null> = [];
  if (delimiterRow !== null) {
    for (let c = 0; c < columnCount; c++) {
      alignments.push(parseAlignment(delimiterRow.cells[c]?.text ?? ''));
    }
  } else {
    for (let c = 0; c < columnCount; c++) {
      alignments.push(null);
    }
  }

  return {
    from: baseFrom,
    to: baseFrom + text.length,
    rows,
    delimiterRow,
    alignments,
    columnCount,
  };
}

/** 单元格边界位置（行内 offset → 绝对 doc） */
interface CellPosition {
  from: number;
  to: number;
  offsetFrom: number;
  offsetTo: number;
}

/** 分割行内单元格（跳过 \| 和 `code` 内的 |；首尾 | 是边界不算 cell） */
export function splitCellPositions(line: string, baseFrom: number): CellPosition[] {
  const positions: CellPosition[] = [];
  // 跳过前导 |（行首边界）
  let start = line.startsWith('|') ? 1 : 0;
  let inCode = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      continue;
    }
    if (ch === '|' && !inCode && i > start) {
      positions.push({
        from: baseFrom + start,
        to: baseFrom + i,
        offsetFrom: start,
        offsetTo: i,
      });
      start = i + 1;
    }
  }
  // 最后一段：行尾 | 后无内容则跳过（尾随边界）
  if (start < line.length || !line.endsWith('|')) {
    positions.push({
      from: baseFrom + start,
      to: baseFrom + line.length,
      offsetFrom: start,
      offsetTo: line.length,
    });
  }
  return positions;
}

/** 判断是否为分隔行（--- 样式，含可选 :） */
export function isDelimiterLine(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '').trim();
  if (trimmed === '') {
    return false;
  }
  const parts = trimmed.split('|');
  return parts.length >= 1 && parts.every((p) => /^:?-{1,}:?$/.test(p.trim()));
}

/** 解析单个对齐标记（:--- / :--: / ---: / ---） */
export function parseAlignment(mark: string): CellAlignment | null {
  const t = mark.trim();
  if (!/^:?-{1,}:?$/.test(t)) {
    return null;
  }
  if (t.startsWith(':') && t.endsWith(':')) {
    return 'center';
  }
  if (t.endsWith(':')) {
    return 'right';
  }
  if (t.startsWith(':')) {
    return 'left';
  }
  return null;
}

/** 查找 caret 所在单元格 */
export function cellAt(table: TableModel, pos: number): TableCell | null {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (pos >= cell.from && pos <= cell.to) {
        return cell;
      }
    }
  }
  return null;
}

/** 下一个单元格（跨行；跳过分隔行）；last cell 返回 null（调用方处理 add row） */
export function nextCell(table: TableModel, cell: TableCell): TableCell | null {
  for (let r = cell.row; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (row.isDelimiter) {
      continue; // 跳过分隔行
    }
    for (const c of row.cells) {
      if (r === cell.row && c.col <= cell.col) {
        continue;
      }
      return c;
    }
  }
  return null;
}

/** 上一个单元格（跳过分隔行） */
export function prevCell(table: TableModel, cell: TableCell): TableCell | null {
  let last: TableCell | null = null;
  for (const row of table.rows) {
    if (row.isDelimiter) {
      continue;
    }
    for (const c of row.cells) {
      if (c.row === cell.row && c.col >= cell.col) {
        return last;
      }
      last = c;
    }
  }
  return null;
}
