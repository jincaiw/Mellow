/**
 * Table Engine（Phase 1）—— 导出。
 */

export { parseTable, cellAt, nextCell, prevCell, isDelimiterLine, parseAlignment, splitCellPositions } from './parser';
export type { TableModel, TableRow, TableCell, CellAlignment } from './parser';
export { addRow, deleteRow, addColumn, deleteColumn, setColumnAlignment, tidyTable, tableAt, resizeTable, planResizeTable, TABLE_RESIZE_MAX_ROWS, TABLE_RESIZE_MAX_COLS } from './commands';
export type { ResizeChange } from './commands';
export { tableKeymap, tableContext } from './keymap';
export {
  buildTableToolbarExtension,
  hideTableToolbar,
  resetTableToolbarVisibility,
  TOOLBAR_CLASS,
  BTN_CLASS,
  RESIZE_POPOVER_CLASS,
  RESIZE_CELL_CLASS,
  RESIZE_CELL_ACTIVE_CLASS,
  RESIZE_GRID_COLS,
  RESIZE_GRID_ROWS,
} from './toolbar';
export { buildColumnWidthExtension, dashCount, normalizeDelimiter, delimiterPatch, targetDashCount, COLUMN_DIVIDER_CLASS, COLUMN_WIDTH_CLASS } from './columnWidth';
export { buildTableLiveViewExtension, TABLE_LIVE_CLASS } from './liveView';
