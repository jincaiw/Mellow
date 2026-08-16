/**
 * 文档内查找（RC UX parity：Cmd+F，golden journey 缺口）。
 *
 * 基于 @codemirror/search（编辑器内核运行时已内置）：Cmd+F 打开查找面板、F3/Cmd+G
 * 下一个、Cmd+Shift+G 上一个、高亮全部匹配。扩展经 window.require 注入（与其余引擎
 * 扩展一致）；@codemirror/search 在 editor-core 运行时可用（devDep 供测试解析）。
 */

import type { Extension } from '@codemirror/state';

interface SearchRuntime {
  search: (config?: unknown) => Extension;
  searchKeymap: unknown[];
}

interface ViewRuntime {
  keymap: { of: (bindings: unknown[]) => Extension };
}

export function buildDocumentSearchExtension(): Extension {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const searchMod = requireFn('@codemirror/search') as SearchRuntime;
  const viewMod = requireFn('@codemirror/view') as ViewRuntime;
  return [searchMod.search({ top: true }), viewMod.keymap.of(searchMod.searchKeymap)];
}
