/**
 * 表格列宽拖拽（Typora 深度对标 ⑬，B2）。
 *
 * Markdown 无列宽存储 —— Typora 同款：拖动对齐列（delimiter）分隔线调列宽。
 * - 对齐列宽度 = delimiter 单元格的 dash 数量（对齐冒号保留）；
 * - minimal patch 写回：只替换被拖拽的 delimiter 单元格（1 处 change，一次 Undo）；
 * - 分隔线手柄：caret 在表格内时显示在 delimiter 行各列边界。
 */

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from '../composition';
import { isSourceMode } from '../mode';
import { tableContext } from './keymap';
import type { TableCell, TableModel } from './parser';

export const COLUMN_DIVIDER_CLASS = 'mellow-table-col-divider';
export const COLUMN_WIDTH_CLASS = 'mellow-table-column-width';

/** 对齐标记字符（: 前缀/后缀）从文本提取（纯函数） */
export function dashCount(text: string): number {
  return text.trim().replace(/:/g, '').length;
}

/** 按 dash 数量重建 delimiter 单元格文本，保留对齐冒号（纯函数） */
export function normalizeDelimiter(text: string, dashCountValue: number): string {
  const t = text.trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  const dashes = '-'.repeat(Math.max(1, dashCountValue));
  return `${left ? ':' : ''}${dashes}${right ? ':' : ''}`;
}

/** 最小 patch：替换单个 delimiter 单元格（保留原前后空白）（纯函数） */
export function delimiterPatch(cell: TableCell, newText: string): { from: number; to: number; insert: string } {
  const leading = cell.contentFrom - cell.from;
  const trailing = cell.to - (cell.from + cell.text.length);
  return {
    from: cell.from,
    to: cell.to,
    insert: ' '.repeat(Math.max(0, leading)) + newText + ' '.repeat(Math.max(0, trailing)),
  };
}

/** 拖拽 delta（字符数）→ 目标 dash 数（纯函数） */
export function targetDashCount(startDash: number, deltaChars: number, min = 1, max = 60): number {
  return Math.max(min, Math.min(max, startDash + deltaChars));
}

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin };
}

export function buildColumnWidthExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin } = cm;

  const plugin = ViewPlugin.fromClass(
    class ColumnWidthPlugin {
      dom: HTMLDivElement;
      handles: HTMLElement[] = [];
      model: TableModel | null = null;
      dragging = false;

      constructor(readonly view: EditorView) {
        this.dom = document.createElement('div');
        this.dom.className = COLUMN_WIDTH_CLASS;
        this.dom.style.display = 'none';
        view.dom.appendChild(this.dom);
        this.updateTable(view);
      }

      update(update: { docChanged: boolean; selectionSet: boolean; viewportChanged: boolean; view: EditorView }): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          if (isComposing()) return;
          this.updateTable(update.view);
        }
      }

      destroy(): void {
        this.dom.remove();
        this.handles = [];
      }

      private updateTable(view: EditorView): void {
        const pos = view.state.selection.main.head;
        const ctx = tableContext(view, pos);
        this.handles.forEach((h) => h.remove());
        this.handles = [];
        if (ctx === null || isSourceMode() || ctx.model.delimiterRow === null) {
          this.model = null;
          this.dom.style.display = 'none';
          return;
        }
        this.model = ctx.model;
        this.render(view, ctx.model);
      }

      private render(view: EditorView, model: TableModel): void {
        const delimiterRow = model.delimiterRow;
        if (delimiterRow === null) return;
        // 每个列边界（第 1..n-1 列）一个手柄
        for (let col = 1; col < model.columnCount; col++) {
          const cell = delimiterRow.cells[col];
          if (cell === undefined) continue;
          const handle = document.createElement('div');
          handle.className = COLUMN_DIVIDER_CLASS;
          handle.dataset.col = String(col);
          this.dom.appendChild(handle);
          this.handles.push(handle);
          this.attachDrag(handle, col);
        }
        this.position(view, model);
        this.dom.style.display = 'flex';
      }

      private position(view: EditorView, model: TableModel): void {
        const delimiterRow = model.delimiterRow;
        if (delimiterRow === null) return;
        requestAnimationFrame(() => {
          // doc 可能已变化（表格被删除等）：越界直接跳过，避免 coordsAtPos 抛错
          const len = view.state.doc.length;
          if (delimiterRow.from > len || delimiterRow.to > len) return;
          let rowCoords;
          try {
            rowCoords = view.coordsAtPos(delimiterRow.from);
          } catch {
            return;
          }
          if (rowCoords === null) return; // 无布局环境（jsdom）跳过
          const height = rowCoords.bottom - rowCoords.top;
          for (let i = 0; i < this.handles.length; i++) {
            const col = Number(this.handles[i].dataset.col ?? 1);
            const cell = delimiterRow.cells[col];
            if (cell === undefined || cell.from > len || cell.to > len) continue;
            let boundary;
            try {
              boundary = view.coordsAtPos(cell.from);
            } catch {
              continue;
            }
            if (boundary === null) continue;
            this.handles[i].style.left = `${boundary.left - 3}px`;
            this.handles[i].style.top = `${rowCoords.top}px`;
            this.handles[i].style.height = `${Math.max(10, height)}px`;
          }
        });
      }

      private attachDrag(handle: HTMLElement, col: number): void {
        handle.addEventListener('mousedown', (downEvent: MouseEvent) => {
          downEvent.preventDefault();
          downEvent.stopPropagation();
          const view = this.view;
          const startX = downEvent.clientX;
          const startDash = this.model !== null ? dashCount(this.model.delimiterRow?.cells[col]?.text ?? '---') : 3;
          const charWidth = view.defaultCharacterWidth > 0 ? view.defaultCharacterWidth : 12;
          this.dragging = true;
          let lastDelta = 0;

          const onMove = (moveEvent: MouseEvent): void => {
            if (!this.dragging) return;
            const deltaChars = Math.round((moveEvent.clientX - startX) / charWidth);
            if (deltaChars === lastDelta) return;
            lastDelta = deltaChars;
            this.applyWidth(view, col, targetDashCount(startDash, deltaChars));
          };
          const onUp = (): void => {
            this.dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
      }

      private applyWidth(view: EditorView, col: number, dashCountValue: number): void {
        const pos = view.state.selection.main.head;
        const ctx = tableContext(view, pos);
        if (ctx === null || ctx.model.delimiterRow === null) return;
        const cell = ctx.model.delimiterRow.cells[col];
        if (cell === undefined) return;
        const newText = normalizeDelimiter(cell.text, dashCountValue);
        if (newText === cell.text) return;
        view.dispatch({ changes: delimiterPatch(cell, newText) });
      }
    },
    {},
  );

  const theme = CmEditorView.theme({
    [`.${COLUMN_WIDTH_CLASS}`]: {
      position: 'absolute',
      zIndex: '9',
      pointerEvents: 'none',
    },
    [`.${COLUMN_DIVIDER_CLASS}`]: {
      position: 'absolute',
      width: '6px',
      marginLeft: '-3px',
      cursor: 'col-resize',
      pointerEvents: 'auto',
      background: 'transparent',
    },
    [`.${COLUMN_DIVIDER_CLASS}:hover`]: {
      background: 'var(--mellow-accent, #3563d6)',
      opacity: '0.5',
    },
  });

  return [plugin, theme];
}
