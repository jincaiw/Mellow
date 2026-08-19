/**
 * Table 键盘导航（spec table-editing §5）。
 *
 * - Tab：下一个单元格；last cell + Tab → add row + 进入新行首格
 * - Shift+Tab：上一个单元格
 * - Ctrl/Cmd+Enter：当前行后 add row + 进入新行首格
 */

import type { EditorView } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';
import type { TableModel, TableCell } from './parser';
import { parseTable, nextCell, prevCell } from './parser';
import { addRow } from './commands';
import { isComposing } from '../composition';

/** 运行时获取 CM 模块（iframe 内与 CoreEditor 同一实例） */
function requireCm<T>(id: string): T {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn === 'function') {
    return requireFn(id) as T;
  }
  throw new Error('[mellow-table] window.require unavailable');
}

/** 查找 caret 所在表格（syntaxTree Table 节点） */
export function tableContext(view: EditorView, pos: number): { model: TableModel; cell: TableCell } | null {
  const { syntaxTree } = requireCm<typeof import('@codemirror/language')>('@codemirror/language');
  let found = false;
  let nodeFrom = 0;
  let nodeTo = 0;
  syntaxTree(view.state).iterate({ from: 0, to: view.state.doc.length, enter: (n) => {
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
  const cell = model.rows.flatMap((r) => r.cells).find((c) => pos >= c.from && pos <= c.to) ?? null;
  if (cell === null) {
    return null;
  }
  return { model, cell };
}

/** 移到单元格内容起点 */
function moveToCell(view: EditorView, cell: TableCell): void {
  // 引擎经 window.require 取 CM 模块（与 iframe 内 CoreEditor 同一实例），
  // 不允许裸 import '@codemirror/state'（iframe ESM 无 bare specifier 解析）。
  const { EditorSelection } = requireCm<typeof import('@codemirror/state')>('@codemirror/state');
  view.dispatch({
    selection: EditorSelection.cursor(cell.contentFrom),
    scrollIntoView: true,
  });
}

function handleTab(view: EditorView, shift: boolean): boolean {
  if (isComposing()) {
    return true; // IME 合成期间不导航（不干扰 composition，spec §8）
  }
  const sel = view.state.selection.main;
  const ctx = tableContext(view, sel.head);
  if (ctx === null) {
    return false; // 不在表格内：交回默认 Tab 行为
  }

  const { model, cell } = ctx;
  if (shift) {
    const prev = prevCell(model, cell);
    if (prev === null) {
      return false;
    }
    moveToCell(view, prev);
    return true;
  }

  const next = nextCell(model, cell);
  if (next === null) {
    // last cell + Tab → add row + 进入新行首格
    addRow(view, model, model.rows.length - 1);
    // 重新解析（新行已插入）
    const afterModel = refreshModel(view, model);
    if (afterModel === null) {
      return true;
    }
    const newRow = afterModel.rows[afterModel.rows.length - 1];
    const firstCell = newRow.cells[0];
    if (firstCell !== undefined) {
      moveToCell(view, firstCell);
    }
    return true;
  }

  moveToCell(view, next);
  return true;
}

/** addRow 后重新获取模型（doc 已变） */
function refreshModel(view: EditorView, old: TableModel): TableModel | null {
  const ctx = tableContext(view, old.from + 1);
  return ctx?.model ?? null;
}

function handleCtrlEnter(view: EditorView): boolean {
  if (isComposing()) {
    return true;
  }
  const sel = view.state.selection.main;
  const ctx = tableContext(view, sel.head);
  if (ctx === null) {
    return false;
  }
  const { model, cell } = ctx;
  // header 行后插入会破坏表格（delimiter 必须第二行）→ 插到 delimiter 之后
  const insertAfter = cell.row === 0 ? 1 : cell.row;
  addRow(view, model, insertAfter);
  const afterModel = refreshModel(view, model);
  if (afterModel === null) {
    return true;
  }
  const newRow = afterModel.rows[insertAfter + 1];
  if (newRow !== undefined && newRow.cells[0] !== undefined) {
    moveToCell(view, newRow.cells[0]);
  }
  return true;
}

/** Table 键盘扩展（Tab/Shift+Tab/Ctrl+Enter） */
export function tableKeymap(): KeyBinding[] {
  return [
    { key: 'Tab', run: (view) => handleTab(view, false) },
    { key: 'Shift-Tab', run: (view) => handleTab(view, true) },
    { key: 'Mod-Enter', run: (view) => handleCtrlEnter(view) },
  ];
}
