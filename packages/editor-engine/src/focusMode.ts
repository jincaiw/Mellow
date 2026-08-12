/** Focus Mode：仅用 line decoration 降低非焦点内容视觉权重，不改变文档/selection/DOM position。 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

export type FocusMode = 'off' | 'line' | 'paragraph';
export const FOCUS_DIM_CLASS = 'mellow-focus-dim';

let mode: FocusMode = 'off';
const activeViews = new Set<EditorView>();

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Decoration: view.Decoration, RangeSetBuilder: state.RangeSetBuilder };
}

export function getFocusMode(): FocusMode {
  return mode;
}

export function setFocusMode(next: FocusMode): void {
  mode = next;
  for (const view of activeViews) view.dispatch({ effects: [] });
}

function paragraphRange(view: EditorView): { fromLine: number; toLine: number } {
  const doc = view.state.doc;
  const head = view.state.selection.main.head;
  const line = doc.lineAt(head);
  let fromLine = line.number;
  let toLine = line.number;
  while (fromLine > 1 && doc.line(fromLine - 1).text.trim() !== '') fromLine -= 1;
  while (toLine < doc.lines && doc.line(toLine + 1).text.trim() !== '') toLine += 1;
  return { fromLine, toLine };
}

function build(view: EditorView, Decoration: CmRuntime['Decoration'], RangeSetBuilder: CmRuntime['RangeSetBuilder']): DecorationSet {
  const builder = new RangeSetBuilder<DecorationT>();
  if (mode === 'off') return builder.finish();
  const doc = view.state.doc;
  const activeLine = doc.lineAt(view.state.selection.main.head).number;
  const para = mode === 'paragraph' ? paragraphRange(view) : { fromLine: activeLine, toLine: activeLine };
  for (let n = 1; n <= doc.lines; n += 1) {
    if (n >= para.fromLine && n <= para.toLine) continue;
    const line = doc.line(n);
    builder.add(line.from, line.from, Decoration.line({ class: FOCUS_DIM_CLASS }));
  }
  return builder.finish();
}

export interface FocusModeApi {
  setMode(mode: FocusMode): void;
  getMode(): FocusMode;
}

function installApi(): void {
  (window as unknown as { __MELLOW_FOCUS_MODE__?: FocusModeApi }).__MELLOW_FOCUS_MODE__ = { setMode: setFocusMode, getMode: getFocusMode };
}

export function buildFocusModeExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;
  const plugin = ViewPlugin.fromClass(class FocusModePlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) {
      activeViews.add(view);
      installApi();
      this.decorations = build(view, Decoration, RangeSetBuilder);
    }
    update(update: ViewUpdate): void {
      if (isComposing()) {
        this.decorations = this.decorations.map(update.changes);
        return;
      }
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.transactions.length > 0) {
        this.decorations = build(update.view, Decoration, RangeSetBuilder);
      }
    }
    destroy(): void {
      activeViews.delete(this.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });
  const theme = CmEditorView.theme({
    [`.${FOCUS_DIM_CLASS}`]: {
      opacity: '0.38',
      filter: 'saturate(0.72)',
      transition: 'opacity 120ms ease',
    },
  });
  return [plugin, theme];
}
