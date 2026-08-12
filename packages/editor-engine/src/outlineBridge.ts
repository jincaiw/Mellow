/** Outline host bridge：暴露当前 selection 与按 offset 跳转给 Desktop Outline。 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

export interface OutlineBridgeApi {
  getSelectionHead(): number | null;
  jumpToOffset(offset: number): boolean;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

function installApi(view: EditorView): void {
  (window as unknown as { __MELLOW_OUTLINE_API__?: OutlineBridgeApi }).__MELLOW_OUTLINE_API__ = {
    getSelectionHead: () => view.state.selection.main.head,
    jumpToOffset: (offset: number) => {
      const pos = Math.max(0, Math.min(view.state.doc.length, offset));
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
      return true;
    },
  };
}

export function buildOutlineBridgeExtension(): Extension {
  const { ViewPlugin } = resolveCm();
  return ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) {
      installApi(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet) installApi(update.view);
    }
    destroy(): void {
      const w = window as unknown as { __MELLOW_OUTLINE_API__?: OutlineBridgeApi };
      if (w.__MELLOW_OUTLINE_API__?.getSelectionHead() !== undefined) delete w.__MELLOW_OUTLINE_API__;
    }
  });
}
