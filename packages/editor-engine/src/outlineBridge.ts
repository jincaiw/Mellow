/** Outline host bridge：暴露当前 selection 与按 offset 跳转给 Desktop Outline。 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isLargeFileMode } from './largeFile';

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
  return {
    ViewPlugin: view.ViewPlugin,
  };
}

function installApi(view: EditorView): OutlineBridgeApi {
  let jumpVersion = 0;
  const api: OutlineBridgeApi = {
    getSelectionHead: () => view.state.selection.main.head,
    jumpToOffset: (offset: number) => {
      const pos = Math.max(0, Math.min(view.state.doc.length, offset));
      const version = ++jumpVersion;

      // Large File Mode 禁用复杂 live widgets，直接让 CodeMirror 定位可避免普通
      // 文档逐页导航在 50k+ 行场景耗时过长。
      if (isLargeFileMode()) {
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        setTimeout(() => view.focus(), 0);
        return true;
      }

      // 让 outline button 的默认聚焦先完成，再夺回 EditorView 焦点。随后
      // 用 CodeMirror 已测量的 line block 定位滚动层，并同步刷新虚拟视口。
      // WKWebView 中仅调度异步 scroll effect 可能出现 DOM/AX 已更新而合成层
      // 仍为空白；同步 measure 可保证绘制树与 scrollTop 在返回前一致。
      setTimeout(() => {
        if (version !== jumpVersion) return;
        try {
          view.focus();
          view.dispatch({ selection: { anchor: pos } });
          const block = view.lineBlockAt(pos);
          const topMargin = Math.max(24, view.scrollDOM.clientHeight * 0.12);
          view.scrollDOM.scrollTop = Math.max(0, block.top - topMargin);
          view.scrollDOM.dispatchEvent(new Event('scroll'));

          const measuredView = view as EditorView & { measure?: (flush?: boolean) => void };
          measuredView.measure?.(true);

          // 首次 height map 可能仍含未测量 block widget 的估值；目标 DOM 建立
          // 后按真实坐标做一次小幅校正，再同步测量一次。
          const coords = view.coordsAtPos(pos);
          if (coords !== null) {
            const scroller = view.scrollDOM.getBoundingClientRect();
            view.scrollDOM.scrollTop += coords.top - scroller.top - topMargin;
            view.scrollDOM.dispatchEvent(new Event('scroll'));
            measuredView.measure?.(true);
          }
          view.requestMeasure();
          view.focus();
        } catch {
          // view 已销毁
        }
      }, 0);
      return true;
    },
  };
  (window as unknown as { __MELLOW_OUTLINE_API__?: OutlineBridgeApi }).__MELLOW_OUTLINE_API__ = api;
  return api;
}

export function buildOutlineBridgeExtension(): Extension {
  const { ViewPlugin } = resolveCm();
  return ViewPlugin.fromClass(class {
    private readonly api: OutlineBridgeApi;

    constructor(readonly view: EditorView) {
      // API 闭包读取同一 EditorView 的实时 state，无需在每次 selection/doc 更新时
      // 重装。保留实例引用，避免旧视图销毁时误删新视图刚安装的全局 bridge。
      this.api = installApi(view);
    }

    update(_update: ViewUpdate): void { /* state 由闭包实时读取 */ }

    destroy(): void {
      const w = window as unknown as { __MELLOW_OUTLINE_API__?: OutlineBridgeApi };
      if (w.__MELLOW_OUTLINE_API__ === this.api) delete w.__MELLOW_OUTLINE_API__;
    }
  });
}
