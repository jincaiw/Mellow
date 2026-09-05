/**
 * GFM Table Live View。
 *
 * - 光标/选区在表格外：用 block widget 展示语义表格；
 * - 点击单元格：回到该 cell 的 Markdown offset，立即恢复源码与既有 Toolbar；
 * - 光标在表格内、Source Mode、非法表格：保持源码；
 * - Decoration.replace 只影响视觉，Markdown 文本始终是唯一真源。
 */

import type { EditorView, DecorationSet } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { isSourceMode } from '../mode';
import { isLargeFileMode, largeFileVersion } from '../largeFile';
import { renderInlineMarkdown } from '../clipboardCopy';
import { parseTable } from './parser';
import { nextCell, prevCell } from './parser';
import type { TableCell, TableModel, TableRow } from './parser';

export const TABLE_LIVE_CLASS = 'mellow-table-live';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  StateField: typeof import('@codemirror/state').StateField;
  StateEffect: typeof import('@codemirror/state').StateEffect;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
  undo: typeof import('@codemirror/commands').undo;
  redo: typeof import('@codemirror/commands').redo;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-table-live] window.require unavailable');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  const commands = requireFn('@codemirror/commands') as typeof import('@codemirror/commands');
  return {
    EditorView: view.EditorView,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    RangeSetBuilder: state.RangeSetBuilder,
    StateField: state.StateField,
    StateEffect: state.StateEffect,
    syntaxTree: language.syntaxTree,
    undo: commands.undo,
    redo: commands.redo,
  };
}

function delimiterRowIndex(model: TableModel): number {
  return model.delimiterRow?.cells[0]?.row ?? -1;
}

function rowsBeforeDelimiter(model: TableModel): TableRow[] {
  const index = delimiterRowIndex(model);
  return index < 0
    ? []
    : model.rows.filter((row) => (row.cells[0]?.row ?? -1) < index && !row.isDelimiter);
}

function rowsAfterDelimiter(model: TableModel): TableRow[] {
  const index = delimiterRowIndex(model);
  return index < 0
    ? []
    : model.rows.filter((row) => (row.cells[0]?.row ?? -1) > index && !row.isDelimiter);
}

function cellFor(row: TableRow, col: number): TableCell | undefined {
  return row.cells.find((cell) => cell.col === col);
}

function cellContentTo(cell: TableCell): number {
  return Math.min(cell.to, cell.contentFrom + cell.text.length);
}

function escapeCellPipes(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ');
  let result = '';
  let slashes = 0;
  for (const char of normalized) {
    if (char === '\\') {
      slashes += 1;
      result += char;
      continue;
    }
    if (char === '|' && slashes % 2 === 0) result += '\\';
    result += char;
    slashes = 0;
  }
  return result;
}

function selectionOffsets(element: HTMLElement): { from: number; to: number } {
  const selection = document.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    const end = element.textContent?.length ?? 0;
    return { from: end, to: end };
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    const end = element.textContent?.length ?? 0;
    return { from: end, to: end };
  }
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(element);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(element);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  const from = beforeStart.toString().length;
  const to = beforeEnd.toString().length;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function setTextCaret(element: HTMLElement, offset: number): void {
  const value = element.textContent ?? '';
  if (element.firstChild === null || element.firstChild.nodeType !== Node.TEXT_NODE) {
    element.textContent = value;
  }
  const textNode = element.firstChild ?? element.appendChild(document.createTextNode(''));
  const clamped = Math.max(0, Math.min(textNode.textContent?.length ?? 0, offset));
  const range = document.createRange();
  range.setStart(textNode, clamped);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setRenderedCell(element: HTMLElement, cell: TableCell): void {
  element.dataset.editing = 'false';
  element.removeAttribute('data-restore-caret');
  element.innerHTML = renderInlineMarkdown(cell.text);
  element.setAttribute('aria-label', cell.text || 'Empty table cell');
}

function setEditingCell(element: HTMLElement, cell: TableCell, caret?: number): void {
  const wasEditing = element.dataset.editing === 'true';
  element.dataset.editing = 'true';
  element.textContent = cell.text;
  element.setAttribute('aria-label', `Edit table cell: ${cell.text || 'empty'}`);
  if (!wasEditing || caret !== undefined) {
    setTextCaret(element, caret ?? cell.text.length);
  }
}

export function buildTableLiveViewExtension(): Extension {
  const cm = resolveCm();
  const {
    EditorView: CmEditorView,
    Decoration,
    WidgetType,
    RangeSetBuilder,
    StateField,
    StateEffect,
    syntaxTree,
    undo,
    redo,
  } = cm;
  const refreshTableLive = StateEffect.define<void>();

  class TableWidget extends WidgetType {
    constructor(
      readonly source: string,
      readonly model: TableModel,
    ) {
      super();
    }

    override eq(other: TableWidget): boolean {
      return other.source === this.source && other.model.from === this.model.from;
    }

    override get estimatedHeight(): number {
      const renderedRows = rowsBeforeDelimiter(this.model).length + rowsAfterDelimiter(this.model).length;
      return Math.max(54, renderedRows * 39 + 28);
    }

    private modelFromDOM(view: EditorView, wrapper: HTMLElement): TableModel | null {
      const from = Number(wrapper.dataset.tableFrom);
      const to = Number(wrapper.dataset.tableTo);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > view.state.doc.length || from >= to) {
        return null;
      }
      return parseTable(view.state.sliceDoc(from, to), from);
    }

    private cellFromDOM(view: EditorView, element: HTMLElement): { model: TableModel; cell: TableCell } | null {
      const wrapper = element.closest<HTMLElement>(`.${TABLE_LIVE_CLASS}`);
      if (wrapper === null) return null;
      const model = this.modelFromDOM(view, wrapper);
      if (model === null) return null;
      const row = Number(element.dataset.row);
      const col = Number(element.dataset.col);
      const cell = model.rows.flatMap((item) => item.cells).find((item) => item.row === row && item.col === col);
      return cell === undefined ? null : { model, cell };
    }

    private focusCell(view: EditorView, tableFrom: number, row: number, col: number, caret?: number): void {
      queueMicrotask(() => {
        const wrapper = view.dom.querySelector<HTMLElement>(`.${TABLE_LIVE_CLASS}[data-table-from="${tableFrom}"]`);
        if (wrapper === null) return;
        const element = wrapper.querySelector<HTMLElement>(`[data-table-cell][data-row="${row}"][data-col="${col}"]`);
        if (element === null) return;
        const model = this.modelFromDOM(view, wrapper);
        const cell = model?.rows.flatMap((item) => item.cells).find((item) => item.row === row && item.col === col);
        if (cell === undefined) return;
        element.focus();
        setEditingCell(element, cell, caret);
      });
    }

    override toDOM(view: EditorView): HTMLElement {
      const wrapper = document.createElement('div');
      wrapper.className = TABLE_LIVE_CLASS;
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', 'Markdown table');
      wrapper.dataset.tableFrom = String(this.model.from);
      wrapper.dataset.tableTo = String(this.model.to);

      // Event listeners attached below need the live EditorView without capturing
      // a stale widget model across updateDOM calls.
      (wrapper as HTMLElement & { __mellowTableView?: EditorView }).__mellowTableView = view;

      const table = document.createElement('table');
      const headerRows = rowsBeforeDelimiter(this.model);
      const bodyRows = rowsAfterDelimiter(this.model);
      const appendRows = (parent: HTMLElement, rows: TableRow[], header: boolean): void => {
        for (const row of rows) {
          const tr = document.createElement('tr');
          for (let col = 0; col < this.model.columnCount; col += 1) {
            const cell = cellFor(row, col);
            const element = document.createElement(header ? 'th' : 'td');
            element.dataset.tableCell = '';
            element.dataset.row = String(row.cells[0]?.row ?? 0);
            element.dataset.col = String(col);
            // setAttribute is intentional: jsdom and older WebKit builds do not
            // consistently reflect the `contentEditable = "plaintext-only"` property.
            element.setAttribute('contenteditable', 'plaintext-only');
            element.spellcheck = true;
            const alignment = this.model.alignments[col];
            if (alignment !== null && alignment !== undefined) {
              element.style.textAlign = alignment;
            }
            if (cell !== undefined) {
              element.tabIndex = 0;
              setRenderedCell(element, cell);

              const revealSource = (event?: Event): void => {
                event?.preventDefault();
                event?.stopPropagation();
                const current = this.cellFromDOM(view, element);
                if (current === null) return;
                const pos = current.cell.contentFrom;
                view.dispatch({
                  selection: { anchor: pos },
                  effects: CmEditorView.scrollIntoView(pos, { y: 'center' }),
                });
                view.focus();
              };

              const activate = (event: MouseEvent): void => {
                event.preventDefault();
                event.stopPropagation();
                const current = this.cellFromDOM(view, element);
                if (current === null) return;
                element.focus();
                setEditingCell(element, current.cell);
                queueMicrotask(() => {
                  const doc = document as Document & {
                    caretRangeFromPoint?: (x: number, y: number) => Range | null;
                  };
                  const clicked = doc.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
                  if (clicked !== null && element.contains(clicked.startContainer)) {
                    const selection = document.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(clicked);
                  } else {
                    setTextCaret(element, current.cell.text.length);
                  }
                });
              };

              const applyReplacement = (from: number, to: number, inserted: string, wholeCell = false): void => {
                const current = this.cellFromDOM(view, element);
                if (current === null) return;
                const source = current.cell.text;
                const start = wholeCell ? 0 : Math.max(0, Math.min(source.length, from));
                const end = wholeCell ? source.length : Math.max(start, Math.min(source.length, to));
                const replacement = escapeCellPipes(inserted);
                const changeFrom = current.cell.contentFrom + start;
                const changeTo = wholeCell ? cellContentTo(current.cell) : current.cell.contentFrom + end;
                const wrapperNow = element.closest<HTMLElement>(`.${TABLE_LIVE_CLASS}`);
                if (wrapperNow !== null) {
                  wrapperNow.dataset.tableTo = String(
                    current.model.to + replacement.length - (changeTo - changeFrom),
                  );
                }
                element.dataset.restoreCaret = String(start + replacement.length);
                view.dispatch({
                  changes: { from: changeFrom, to: changeTo, insert: replacement },
                  userEvent: 'input.table-live',
                });
                queueMicrotask(() => {
                  const liveWrapper = view.dom.querySelector<HTMLElement>(`.${TABLE_LIVE_CLASS}[data-table-from="${current.model.from}"]`);
                  const live = liveWrapper?.querySelector<HTMLElement>(`[data-table-cell][data-row="${current.cell.row}"][data-col="${current.cell.col}"]`);
                  if (live === null || live === undefined) return;
                  live.focus();
                  const caret = Number(live.dataset.restoreCaret);
                  setTextCaret(live, Number.isFinite(caret) ? caret : start + replacement.length);
                });
              };

              element.addEventListener('mousedown', activate);
              element.addEventListener('focus', () => {
                if (element.dataset.editing === 'true') return;
                const current = this.cellFromDOM(view, element);
                if (current !== null) setEditingCell(element, current.cell);
              });
              element.addEventListener('blur', () => {
                setTimeout(() => {
                  const active = document.activeElement;
                  if (active instanceof HTMLElement && active.closest(`.${TABLE_LIVE_CLASS}`) === wrapper) return;
                  try {
                    view.dispatch({ effects: refreshTableLive.of(undefined) });
                  } catch {
                    // view 已销毁
                  }
                }, 0);
              });
              element.addEventListener('beforeinput', (event) => {
                const input = event as InputEvent;
                if (element.dataset.composing === 'true' || input.isComposing) return;
                const offsets = selectionOffsets(element);
                if (input.inputType.startsWith('delete')) {
                  input.preventDefault();
                  if (offsets.from !== offsets.to) {
                    applyReplacement(offsets.from, offsets.to, '');
                  } else if (input.inputType.includes('Backward') && offsets.from > 0) {
                    applyReplacement(offsets.from - 1, offsets.from, '');
                  } else if (input.inputType.includes('Forward')) {
                    applyReplacement(offsets.from, offsets.from + 1, '');
                  }
                  return;
                }
                if (
                  input.inputType.startsWith('insert')
                  && input.inputType !== 'insertCompositionText'
                  && input.inputType !== 'insertFromPaste'
                ) {
                  input.preventDefault();
                  applyReplacement(offsets.from, offsets.to, input.data ?? '');
                }
              });
              element.addEventListener('paste', (event) => {
                event.preventDefault();
                const offsets = selectionOffsets(element);
                applyReplacement(offsets.from, offsets.to, event.clipboardData?.getData('text/plain') ?? '');
              });
              element.addEventListener('compositionstart', () => {
                element.dataset.composing = 'true';
              });
              element.addEventListener('compositionend', () => {
                element.dataset.composing = 'false';
                applyReplacement(0, 0, element.textContent ?? '', true);
              });
              element.addEventListener('input', () => {
                // Accessibility setValue / 部分 WebKit 输入路径不派发 beforeinput。
                // Composition 由 compositionend 统一提交，避免候选阶段写入源码。
                if (element.dataset.composing === 'true') return;
                const current = this.cellFromDOM(view, element);
                if (current === null || element.textContent === current.cell.text) return;
                applyReplacement(0, 0, element.textContent ?? '', true);
              });
              element.addEventListener('keydown', (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                  event.preventDefault();
                  event.stopPropagation();
                  (event.shiftKey ? redo : undo)(view);
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  const current = this.cellFromDOM(view, element);
                  if (current !== null) setRenderedCell(element, current.cell);
                  view.dispatch({ effects: refreshTableLive.of(undefined) });
                  view.focus();
                  return;
                }
                if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                  revealSource(event);
                  return;
                }
                if (event.key === 'Tab') {
                  event.preventDefault();
                  event.stopPropagation();
                  const current = this.cellFromDOM(view, element);
                  const wrapperNow = element.closest<HTMLElement>(`.${TABLE_LIVE_CLASS}`);
                  if (current === null || wrapperNow === null) return;
                  const adjacent = event.shiftKey
                    ? prevCell(current.model, current.cell)
                    : nextCell(current.model, current.cell);
                  if (adjacent !== null) {
                    this.focusCell(view, current.model.from, adjacent.row, adjacent.col);
                    return;
                  }
                  if (!event.shiftKey) {
                    const emptyRow = `\n| ${Array.from({ length: current.model.columnCount }, () => '').join(' | ')} |`;
                    view.dispatch({ changes: { from: current.model.to, insert: emptyRow }, userEvent: 'input.type' });
                    const nextRow = Math.max(...current.model.rows.map((item) => item.cells[0]?.row ?? 0)) + 1;
                    this.focusCell(view, current.model.from, nextRow, 0, 0);
                  }
                }
              });
            }
            tr.appendChild(element);
          }
          parent.appendChild(tr);
        }
      };

      if (headerRows.length > 0) {
        const thead = document.createElement('thead');
        appendRows(thead, headerRows, true);
        table.appendChild(thead);
      }
      const tbody = document.createElement('tbody');
      appendRows(tbody, bodyRows, false);
      table.appendChild(tbody);
      wrapper.appendChild(table);
      return wrapper;
    }

    override updateDOM(dom: HTMLElement, view: EditorView): boolean {
      const oldCells = Array.from(dom.querySelectorAll<HTMLElement>('[data-table-cell]'));
      const nextRows = [...rowsBeforeDelimiter(this.model), ...rowsAfterDelimiter(this.model)];
      const nextCells = nextRows.flatMap((row) => Array.from(
        { length: this.model.columnCount },
        (_, col) => cellFor(row, col),
      ));
      if (oldCells.length !== nextCells.length || nextCells.some((cell) => cell === undefined)) return false;

      dom.dataset.tableFrom = String(this.model.from);
      dom.dataset.tableTo = String(this.model.to);
      (dom as HTMLElement & { __mellowTableView?: EditorView }).__mellowTableView = view;

      for (let index = 0; index < oldCells.length; index += 1) {
        const element = oldCells[index];
        const cell = nextCells[index];
        if (cell === undefined) return false;
        element.dataset.row = String(cell.row);
        element.dataset.col = String(cell.col);
        const alignment = this.model.alignments[cell.col];
        element.style.textAlign = alignment ?? '';
        const editing = element.dataset.editing === 'true' || document.activeElement === element;
        const composing = element.dataset.composing === 'true';
        if (editing) {
          if (!composing) {
            const caret = Number(element.dataset.restoreCaret);
            setEditingCell(element, cell, Number.isFinite(caret) ? caret : undefined);
          }
        } else {
          setRenderedCell(element, cell);
        }
      }
      return true;
    }
  }

  const buildDecorations = (state: EditorState): DecorationSet => {
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    if (isSourceMode() || isLargeFileMode()) {
      return builder.finish();
    }
    const selection = state.selection.main;
    syntaxTree(state).iterate({
      from: 0,
      to: state.doc.length,
      enter: (node) => {
        if (node.name !== 'Table' || node.from >= node.to) {
          return;
        }
        if (selection.from <= node.to && selection.to >= node.from) {
          return;
        }
        const source = state.sliceDoc(node.from, node.to);
        const model = parseTable(source, node.from);
        if (model.delimiterRow === null || rowsBeforeDelimiter(model).length === 0) {
          return;
        }
        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            block: true,
            widget: new TableWidget(source, model),
          }),
        );
      },
    });
    return builder.finish();
  };

  interface TableLiveState {
    decorations: DecorationSet;
    sourceMode: boolean;
    largeVersion: number;
  }

  const field = StateField.define<TableLiveState>({
    create: (state) => ({
      decorations: buildDecorations(state),
      sourceMode: isSourceMode(),
      largeVersion: largeFileVersion(),
    }),
    update: (value, transaction) => {
      const sourceMode = isSourceMode();
      const nextLargeVersion = largeFileVersion();
      const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
      const refreshRequested = transaction.effects.some((effect) => effect.is(refreshTableLive));
      if (transaction.docChanged && transaction.isUserEvent('input.table-live')) {
        return {
          decorations: value.decorations.map(transaction.changes),
          sourceMode,
          largeVersion: nextLargeVersion,
        };
      }
      if (
        transaction.docChanged
        || selectionChanged
        || refreshRequested
        || value.sourceMode !== sourceMode
        || value.largeVersion !== nextLargeVersion
      ) {
        return {
          decorations: buildDecorations(transaction.state),
          sourceMode,
          largeVersion: nextLargeVersion,
        };
      }
      return value;
    },
  });

  const theme = CmEditorView.theme({
    [`.${TABLE_LIVE_CLASS}`]: {
      boxSizing: 'border-box',
      width: '100%',
      overflowX: 'auto',
      margin: '0.8em 0',
    },
    [`.${TABLE_LIVE_CLASS} table`]: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      fontFamily: 'inherit',
      lineHeight: '1.45',
    },
    [`.${TABLE_LIVE_CLASS} th, .${TABLE_LIVE_CLASS} td`]: {
      padding: '6px 13px',
      border: '1px solid var(--mellow-md-table-border, #dfe2e5)',
      overflowWrap: 'anywhere',
      verticalAlign: 'top',
      cursor: 'text',
    },
    [`.${TABLE_LIVE_CLASS} th`]: {
      fontWeight: 'bold',
      background: 'var(--mellow-md-table-head-bg, #f8f8f8)',
    },
    [`.${TABLE_LIVE_CLASS} tr:nth-child(even) td`]: {
      background: 'var(--mellow-md-table-head-bg, #f8f8f8)',
    },
    [`.${TABLE_LIVE_CLASS} th:focus-visible, .${TABLE_LIVE_CLASS} td:focus-visible`]: {
      outline: '2px solid var(--mellow-accent, #0a69da)',
      outlineOffset: '-2px',
    },
  });

  return [
    field,
    CmEditorView.decorations.from(field, (value) => value.decorations),
    theme,
  ];
}
