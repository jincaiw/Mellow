/**
 * Table Toolbar（spec table-editing §4）—— 轻量 GUI。
 *
 * - caret 在 Table 内 → 显示浮动 toolbar（定位在表格上方，不遮挡 caret）；
 * - 按钮：Row Above/Below、Delete Row、Col Left/Right、Delete Col、Align L/C/R、Tidy、Delete Table；
 * - Escape 关闭；caret 移出表格后重置可见性；
 * - IME composition 期间不更新/不干扰；
 * - 按钮为真实 <button>（Tab 可聚焦、Enter 可激活，keyboard accessible）。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from '../composition';
import { isSourceMode } from '../mode';
import { tableContext } from './keymap';
import type { TableModel, TableCell } from './parser';
import { addRow, deleteRow, addColumn, deleteColumn, setColumnAlignment, tidyTable } from './commands';

const TOOLBAR_CLASS = 'mellow-table-toolbar';
const BTN_CLASS = 'mellow-table-toolbar-btn';

/** 运行时 CM 模块（iframe 内与 CoreEditor 同一实例） */
function requireCm<T>(id: string): T {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn === 'function') {
    return requireFn(id) as T;
  }
  throw new Error('[mellow-table] window.require unavailable');
}

/** 关闭工具栏（Escape） */
let toolbarHidden = false;
export function hideTableToolbar(): void {
  toolbarHidden = true;
}

export function resetTableToolbarVisibility(): void {
  toolbarHidden = false;
}

/** 构建 Table Toolbar 扩展 */
export function buildTableToolbarExtension(): Extension {
  const cmView = requireCm<typeof import('@codemirror/view')>('@codemirror/view');
  const { ViewPlugin } = cmView;

  const plugin = ViewPlugin.fromClass(
    class TableToolbarPlugin {
      readonly dom: HTMLDivElement;
      private readonly view: EditorView;
      private model: TableModel | null = null;
      private cell: TableCell | null = null;
      private tableFrom = 0;
      private visible = false;

      constructor(view: EditorView) {
        this.view = view;
        this.dom = document.createElement('div');
        this.dom.className = TOOLBAR_CLASS;
        this.dom.style.display = 'none';
        view.dom.appendChild(this.dom);
        this.renderButtons();
        this.updateToolbar(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          // IME 期间不更新（不干扰 composition）
          if (isComposing()) {
            return;
          }
          this.updateToolbar(update.view);
        }
      }

      destroy(): void {
        this.dom.remove();
      }

      /** 暴露给测试/宿主：当前是否可见 */
      isVisible(): boolean {
        return this.visible;
      }

      private updateToolbar(view: EditorView): void {
        const pos = view.state.selection.main.head;
        const ctx = tableContext(view, pos);

        // Source Mode：不显示 toolbar（源码编辑，spec §10 source-live）
        if (ctx === null || toolbarHidden || isSourceMode()) {
          this.hide();
          return;
        }
        this.model = ctx.model;
        this.cell = ctx.cell;
        this.tableFrom = ctx.model.from;
        this.show();
        this.position(view);
      }

      private show(): void {
        this.visible = true;
        this.dom.style.display = 'flex';
      }

      private hide(): void {
        this.visible = false;
        this.dom.style.display = 'none';
      }

      /** 定位在表格上方（不遮挡 caret）；rAF 延迟（update 期间禁止读布局） */
      private position(view: EditorView): void {
        requestAnimationFrame(() => {
          const coords = view.coordsAtPos(this.tableFrom);
          if (coords === null) {
            return; // 无布局环境（jsdom）跳过
          }
          // 表格上方：top 定位在表格起点上方（含 toolbar 高度偏移由 CSS 处理）
          this.dom.style.top = `${Math.max(coords.top - 30, 4)}px`;
          this.dom.style.left = `${Math.max(coords.left, 4)}px`;
        });
      }

      private renderButtons(): void {
        const actions: Array<{ label: string; title: string; run: () => void }> = [
          { label: '↑行', title: 'Row Above', run: () => this.withModel((m, c) => addRow(this.view, m, Math.max(0, c.row - 1))) },
          { label: '↓行', title: 'Row Below', run: () => this.withModel((m, c) => addRow(this.view, m, c.row)) },
          { label: '删行', title: 'Delete Row', run: () => this.withModel((m, c) => deleteRow(this.view, m, c.row)) },
          { label: '←列', title: 'Column Left', run: () => this.withModel((m, c) => addColumn(this.view, m, Math.max(0, c.col - 1))) },
          { label: '→列', title: 'Column Right', run: () => this.withModel((m, c) => addColumn(this.view, m, c.col)) },
          { label: '删列', title: 'Delete Column', run: () => this.withModel((m, c) => deleteColumn(this.view, m, c.col)) },
          { label: '左', title: 'Align Left', run: () => this.withModel((m, c) => setColumnAlignment(this.view, m, c.col, 'left')) },
          { label: '中', title: 'Align Center', run: () => this.withModel((m, c) => setColumnAlignment(this.view, m, c.col, 'center')) },
          { label: '右', title: 'Align Right', run: () => this.withModel((m, c) => setColumnAlignment(this.view, m, c.col, 'right')) },
          { label: '整理', title: 'Tidy Table', run: () => this.withModel((m) => tidyTable(this.view, m)) },
          { label: '删除表', title: 'Delete Table', run: () => this.deleteTable() },
        ];

        for (const action of actions) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = BTN_CLASS;
          btn.textContent = action.label;
          btn.title = action.title;
          btn.addEventListener('click', () => action.run());
          this.dom.appendChild(btn);
        }
      }

      /** 当前 view（保留：测试/宿主访问） */
      getView(): EditorView {
        return this.view;
      }

      private withModel(fn: (m: TableModel, c: TableCell) => void): void {
        if (this.model === null || this.cell === null) {
          return;
        }
        fn(this.model, this.cell);
      }

      private deleteTable(): void {
        if (this.model === null) {
          return;
        }
        const from = this.model.from;
        const to = this.model.to;
        this.view.dispatch({ changes: { from, to, insert: '' } });
      }
    },
    {},
  );

  // Escape 关闭 toolbar；Source/Live 模式切换也需重算（selectionSet 覆盖）
  const { keymap: cmKeymap } = cmView;
  const escapeKeymap = cmKeymap.of([
    { key: 'Escape', run: (view) => { hideTableToolbar(); view.dispatch({ selection: view.state.selection }); return true; } },
  ]);
  return [plugin, toolbarStyle(cmView.EditorView), escapeKeymap];
}

function toolbarStyle(EditorView: typeof import('@codemirror/view').EditorView): Extension {
  return EditorView.theme({
    [`.${TOOLBAR_CLASS}`]: {
      position: 'absolute',
      zIndex: '10',
      display: 'flex',
      gap: '4px',
      padding: '4px 6px',
      background: 'rgba(255,255,255,0.92)',
      border: '1px solid #ddd',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      fontSize: '12px',
      userSelect: 'none',
    },
    [`.${BTN_CLASS}`]: {
      padding: '2px 6px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '12px',
      '&:hover': { background: '#f0f0f0' },
      '&:focus-visible': { outline: '2px solid #0a69da', outlineOffset: '1px' },
    },
  });
}

export { TOOLBAR_CLASS, BTN_CLASS };
