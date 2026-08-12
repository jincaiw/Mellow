/** Split Mode 双向滚动同步桥（PRD §32 / Paperling）。
 *
 * iframe 内注册 `window.__MELLOW_SCROLL_BRIDGE__`，宿主（EditorCore）经其：
 * - setScrollRatio：把编辑器滚动到文档比例位置（直接赋值，无动画）；
 * - getScrollRatio：读取当前滚动比例；
 * - onScroll：订阅编辑器滚动（宿主用它同步 Preview）。
 *
 * 防回环：setScrollRatio 只在实际目标差值 > 1px 时赋值；同值赋值不产生 scroll 事件。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface ScrollBridgeApi {
  getScrollRatio(): number | null;
  setScrollRatio(ratio: number): void;
  onScroll(listener: (ratio: number) => void): () => void;
}

const GLOBAL_KEY = '__MELLOW_SCROLL_BRIDGE__' as const;

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

function installApi(view: EditorView, listeners: Set<(ratio: number) => void>): void {
  const api: ScrollBridgeApi = {
    getScrollRatio: () => {
      const dom = view.scrollDOM;
      const max = dom.scrollHeight - dom.clientHeight;
      return max > 0 ? dom.scrollTop / max : 0;
    },
    setScrollRatio: (ratio) => {
      const dom = view.scrollDOM;
      const max = dom.scrollHeight - dom.clientHeight;
      if (max <= 0) return;
      const target = Math.max(0, Math.min(1, ratio)) * max;
      if (Math.abs(dom.scrollTop - target) > 1) dom.scrollTop = target;
    },
    onScroll: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  (window as unknown as Record<string, unknown>)[GLOBAL_KEY] = api;
}

export function buildScrollBridgeExtension(): Extension {
  const { ViewPlugin } = resolveCm();
  return ViewPlugin.fromClass(class ScrollBridgePlugin {
    private readonly listeners = new Set<(ratio: number) => void>();

    private onScrollEvent = (): void => {
      const dom = this.view.scrollDOM;
      const max = dom.scrollHeight - dom.clientHeight;
      const ratio = max > 0 ? dom.scrollTop / max : 0;
      for (const listener of this.listeners) listener(ratio);
    };

    constructor(readonly view: EditorView) {
      installApi(view, this.listeners);
      view.scrollDOM.addEventListener('scroll', this.onScrollEvent);
    }

    update(update: ViewUpdate): void {
      void update;
    }

    destroy(): void {
      this.view.scrollDOM.removeEventListener('scroll', this.onScrollEvent);
      const w = window as unknown as Record<string, unknown>;
      delete w[GLOBAL_KEY];
    }
  });
}
