/**
 * 文档内查找 / 替换（RC parity：Cmd+F 查找、Ctrl+H 替换 —— Typora 深度对标）。
 *
 * 基于 @codemirror/search（编辑器内核运行时已内置）：
 * - Cmd+F 打开查找面板、F3/Cmd+G 下一个、Shift+Cmd+G 上一个、高亮全部匹配；
 * - **Ctrl+H 打开替换（聚焦替换输入框，Typora 对齐）**；
 * - 宿主 → 引擎桥：`window.__MELLOW_SEARCH_API__`（openFind / openReplace），
 *   供菜单「查找…/替换…」经 iframe 调用（install() 时注册）。
 */

import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';

interface SearchRuntime {
  search: (config?: unknown) => Extension;
  searchKeymap: Array<Record<string, unknown>>;
  openSearchPanel: (view: unknown) => boolean;
}

interface ViewRuntime {
  keymap: { of: (bindings: unknown[]) => Extension };
  ViewPlugin: {
    fromClass: (cls: unknown, opts?: Record<string, unknown>) => unknown;
  };
}

export interface MellowSearchApi {
  openFind(): void;
  openReplace(): void;
}

// 单编辑器 iframe：模块级视图引用（ViewPlugin 维护）
let activeView: unknown = null;

function focusReplaceField(): void {
  const v = activeView as { dom?: HTMLElement } | null;
  if (v === null || v.dom === undefined) return;
  // 面板创建是异步的：下一帧后再聚焦替换输入框
  requestAnimationFrame(() => {
    const input = v.dom?.querySelector<HTMLInputElement>('.cm-search input[name="replace"]');
    input?.focus();
  });
}

export function buildDocumentSearchExtension(): Extension {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const searchMod = requireFn('@codemirror/search') as SearchRuntime;
  const viewMod = requireFn('@codemirror/view') as ViewRuntime;

  const openReplace = (view: unknown): boolean => {
    searchMod.openSearchPanel(view);
    focusReplaceField();
    return true;
  };

  const keymap = [
    ...searchMod.searchKeymap,
    { key: 'Mod-h', run: openReplace, scope: 'editor search-panel' },
  ];

  const viewPlugin = viewMod.ViewPlugin.fromClass(
    class SearchViewTracker {
      constructor(view: unknown) {
        activeView = view;
      }
      update(_update: ViewUpdate): void {
        /* noop */
      }
      destroy(): void {
        activeView = null;
      }
    },
    {},
  );

  return [searchMod.search({ top: true }), viewMod.keymap.of(keymap), viewPlugin as Extension];
}

/** 注册宿主 → 引擎搜索桥（install() 调用） */
export function installSearchApi(): void {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  const api: MellowSearchApi = {
    openFind: () => {
      if (activeView === null) return;
      const searchMod = requireFn?.('@codemirror/search') as SearchRuntime;
      searchMod.openSearchPanel(activeView);
    },
    openReplace: () => {
      if (activeView === null) return;
      const searchMod = requireFn?.('@codemirror/search') as SearchRuntime;
      searchMod.openSearchPanel(activeView);
      focusReplaceField();
    },
  };
  (window as unknown as { __MELLOW_SEARCH_API__?: MellowSearchApi }).__MELLOW_SEARCH_API__ = api;
}
