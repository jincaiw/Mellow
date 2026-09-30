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
import { addRow, deleteRow, addColumn, deleteColumn, setColumnAlignment, tidyTable, resizeTable } from './commands';

const TOOLBAR_CLASS = 'mellow-table-toolbar';
const BTN_CLASS = 'mellow-table-toolbar-btn';
const RESIZE_POPOVER_CLASS = 'mellow-table-resize-popover';
const RESIZE_CELL_CLASS = 'mellow-table-resize-cell';
const RESIZE_CELL_ACTIVE_CLASS = 'mellow-table-resize-cell-active';

/**
 * 网格尺寸（一手证据：Typora `Docs/Table Editing.md` 的 `## Resize Table` 一节 ——
 * 「make the table larger than **6 columns or 10 rows** … click the row/column number input」；
 * 且 `html/content.html` 里 `md-grid-board` 的单元格是 `col="1".."col="6"`）。
 */
const RESIZE_GRID_COLS = 6;
const RESIZE_GRID_ROWS = 10;

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
      /** Resize 弹层（spec §3b）；懒建，随工具栏一起隐藏 */
      private resizePopover: HTMLDivElement | null = null;
      private resizeColsInput: HTMLInputElement | null = null;
      private resizeRowsInput: HTMLInputElement | null = null;
      private resizeCells: HTMLElement[] = [];

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
          if (isComposing(update.view)) {
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
        if (ctx === null || toolbarHidden || isSourceMode(view)) {
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
        this.hideResizePopover();
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
        // 一手：Typora 的 Resize Table 入口是表格 tooltip 的**最左**图标
        //（`Docs/Table Editing.md` 的 `## Resize Table`：Click the most left icon）。
        const resizeBtn = document.createElement('button');
        resizeBtn.type = 'button';
        resizeBtn.className = BTN_CLASS;
        resizeBtn.textContent = '调整';
        resizeBtn.title = 'Resize Table';
        resizeBtn.addEventListener('click', () => this.toggleResizePopover());
        this.dom.appendChild(resizeBtn);

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

      // ─────────────────── Resize 弹层（spec table-editing §3b）───────────────────

      /**
       * 打开/关闭「调整表格」弹层。
       *
       * 一手证据（Typora 1.14.9）：网格是 **6 列**（`html/content.html` 的 `md-grid-board`
       * 单元格为 `col="1".."col="6"`），且官方文档写明「要超过 **6 列或 10 行**，
       * 点行列数字输入框直接填数」→ 故网格 6×10 + 两个数字输入。
       *
       * 网格行/列的计数口径与创建对话框一致：**行含表头行**（Typora 的 AST 里 delimiter
       * 不是行，它是 `align` 元数据）。
       */
      private toggleResizePopover(): void {
        if (this.resizePopover !== null && this.resizePopover.style.display !== 'none') {
          this.hideResizePopover();
          return;
        }
        if (this.resizePopover === null) {
          this.buildResizePopover();
        }
        if (this.resizePopover === null || this.model === null) {
          return;
        }
        const contentRows = this.model.rows.filter((r) => !r.isDelimiter).length;
        this.setResizeInputs(this.model.columnCount, contentRows);
        this.resizePopover.style.display = 'block';
      }

      private hideResizePopover(): void {
        if (this.resizePopover !== null) {
          this.resizePopover.style.display = 'none';
        }
      }

      /** 网格 + 数字输入（与 Typora 的弹层同构） */
      private buildResizePopover(): void {
        const popover = document.createElement('div');
        popover.className = RESIZE_POPOVER_CLASS;
        popover.style.display = 'none';

        const grid = document.createElement('div');
        grid.className = `${RESIZE_POPOVER_CLASS}-grid`;
        this.resizeCells = [];
        for (let r = 1; r <= RESIZE_GRID_ROWS; r += 1) {
          const row = document.createElement('div');
          row.className = `${RESIZE_POPOVER_CLASS}-row`;
          for (let c = 1; c <= RESIZE_GRID_COLS; c += 1) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = RESIZE_CELL_CLASS;
            cell.dataset.row = String(r);
            cell.dataset.col = String(c);
            // hover 预选：把行列数字填进输入框并高亮左上角 r×c 区域（与 Typora 的网格一致）
            cell.addEventListener('mouseenter', () => this.highlightResizeGrid(r, c));
            cell.addEventListener('click', () => this.applyResize(c, r));
            this.resizeCells.push(cell);
            row.appendChild(cell);
          }
          grid.appendChild(row);
        }
        popover.appendChild(grid);

        const form = document.createElement('div');
        form.className = `${RESIZE_POPOVER_CLASS}-form`;
        form.appendChild(this.buildResizeField('列', (input) => { this.resizeColsInput = input; }));
        form.appendChild(this.buildResizeField('行', (input) => { this.resizeRowsInput = input; }));
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = BTN_CLASS;
        apply.textContent = '应用';
        apply.title = 'Apply';
        apply.addEventListener('click', () => {
          const cols = Number.parseInt(this.resizeColsInput?.value ?? '', 10);
          const rows = Number.parseInt(this.resizeRowsInput?.value ?? '', 10);
          this.applyResize(Number.isNaN(cols) ? 1 : cols, Number.isNaN(rows) ? 1 : rows);
        });
        form.appendChild(apply);
        popover.appendChild(form);

        this.dom.appendChild(popover);
        this.resizePopover = popover;
      }

      private buildResizeField(label: string, keep: (input: HTMLInputElement) => void): HTMLLabelElement {
        const wrap = document.createElement('label');
        wrap.className = `${RESIZE_POPOVER_CLASS}-field`;
        const text = document.createElement('span');
        text.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.className = `${RESIZE_POPOVER_CLASS}-input`;
        keep(input);
        wrap.appendChild(text);
        wrap.appendChild(input);
        return wrap;
      }

      private setResizeInputs(cols: number, rows: number): void {
        if (this.resizeColsInput !== null) this.resizeColsInput.value = String(cols);
        if (this.resizeRowsInput !== null) this.resizeRowsInput.value = String(rows);
        this.highlightResizeGrid(rows, cols);
      }

      private highlightResizeGrid(rows: number, cols: number): void {
        for (const cell of this.resizeCells) {
          const r = Number(cell.dataset.row);
          const c = Number(cell.dataset.col);
          const active = r <= rows && c <= cols;
          cell.classList.toggle(RESIZE_CELL_ACTIVE_CLASS, active);
        }
        if (this.resizeColsInput !== null) this.resizeColsInput.value = String(cols);
        if (this.resizeRowsInput !== null) this.resizeRowsInput.value = String(rows);
      }

      private applyResize(cols: number, rows: number): void {
        if (this.model === null) {
          return;
        }
        resizeTable(this.view, this.model, rows, cols);
        this.hideResizePopover();
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
    // Resize 弹层（spec §3b）：网格 + 数字输入。定位在工具栏下方，不遮挡表格。
    [`.${RESIZE_POPOVER_CLASS}`]: {
      position: 'absolute',
      top: '100%',
      left: '0',
      marginTop: '4px',
      padding: '6px',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      zIndex: '11',
    },
    [`.${RESIZE_POPOVER_CLASS}-row`]: { display: 'flex' },
    [`.${RESIZE_CELL_CLASS}`]: {
      width: '12px',
      height: '12px',
      padding: '0',
      margin: '1px',
      border: '1px solid #ddd',
      borderRadius: '2px',
      background: '#fff',
      cursor: 'pointer',
    },
    [`.${RESIZE_CELL_ACTIVE_CLASS}`]: { background: '#cfe3ff', borderColor: '#0a69da' },
    [`.${RESIZE_POPOVER_CLASS}-form`]: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginTop: '6px',
      fontSize: '12px',
    },
    [`.${RESIZE_POPOVER_CLASS}-field`]: { display: 'flex', alignItems: 'center', gap: '2px' },
    [`.${RESIZE_POPOVER_CLASS}-input`]: {
      width: '3.5em',
      padding: '1px 4px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '12px',
    },
  });
}

export {
  TOOLBAR_CLASS,
  BTN_CLASS,
  RESIZE_POPOVER_CLASS,
  RESIZE_CELL_CLASS,
  RESIZE_CELL_ACTIVE_CLASS,
  RESIZE_GRID_COLS,
  RESIZE_GRID_ROWS,
};
