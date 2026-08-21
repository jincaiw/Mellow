/**
 * Selection Commands（Typora 编辑→选择：⌘L 选择行 / ⌥⌘P 选择段落或块）。
 *
 * 宿主 → iframe `__MELLOW_SELECTION_COMMANDS__` → EditorView selection dispatch：
 * - selectLine：选中当前逻辑行；已整行选中时扩展到下一行（CM selectLine 语义）；
 * - selectParagraph：空行界定的段落范围（与 focusMode paragraphRange 同语义）。
 *
 * 通道方向：
 *   host → EditorCore.selectLine/selectParagraph → iframe __MELLOW_SELECTION_COMMANDS__ → 本模块
 */

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface SelectionCommandsApi {
  /** 选中当前行（整行已选中则扩展下一行）；false = 编辑器未就绪 */
  selectLine(): boolean;
  /** 选中当前段落（空行界定）；false = 编辑器未就绪 */
  selectParagraph(): boolean;
}

let activeView: EditorView | null = null;

function selectLine(): boolean {
  const view = activeView;
  if (view === null) return false;
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  const line = doc.lineAt(sel.head);
  const fullLineSelected = !sel.empty && sel.from === line.from && sel.to === line.to;
  if (fullLineSelected && line.number < doc.lines) {
    // 重复按 ⌘L：扩展到下一行（CM selectLine 语义）
    const next = doc.line(line.number + 1);
    view.dispatch({ selection: { anchor: line.from, head: next.to }, scrollIntoView: true });
  } else {
    view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
  }
  return true;
}

function selectParagraph(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc;
  const head = view.state.selection.main.head;
  const line = doc.lineAt(head);
  let fromLine = line.number;
  let toLine = line.number;
  while (fromLine > 1 && doc.line(fromLine - 1).text.trim() !== '') fromLine -= 1;
  while (toLine < doc.lines && doc.line(toLine + 1).text.trim() !== '') toLine += 1;
  view.dispatch({
    selection: { anchor: doc.line(fromLine).from, head: doc.line(toLine).to },
    scrollIntoView: true,
  });
  return true;
}

/** 注册全局 API（installSelectionCommandsApi 在 iframe 内调用一次） */
export function installSelectionCommandsApi(): void {
  (window as unknown as { __MELLOW_SELECTION_COMMANDS__?: SelectionCommandsApi }).__MELLOW_SELECTION_COMMANDS__ = {
    selectLine,
    selectParagraph,
  };
}

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

/** 构建扩展：ViewPlugin 跟踪 activeView（API dispatch 的目标） */
export function buildSelectionCommandsExtension(): Extension {
  const { ViewPlugin } = resolveCm();
  const plugin = ViewPlugin.fromClass(
    class SelectionCommandsPlugin {
      constructor(readonly view: EditorView) {
        activeView = view;
      }
      destroy(): void {
        if (activeView === this.view) activeView = null;
      }
    },
  );
  return plugin;
}
