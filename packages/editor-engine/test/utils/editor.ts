/**
 * 测试辅助：构建带引擎的 CM6 EditorView（jsdom）。
 */

import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, MARKER_CLASS } from '../../src/index';

export function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      install(false), // 测试环境自行管理 composition 状态
    ],
  });
  view.focus();
  return view;
}

/** 把主选区光标移到 pos（光标 = anchor === head） */
export function moveCaret(view: EditorView, pos: number): void {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
  });
}

/** 设置选区 [from, to] */
export function selectRange(view: EditorView, from: number, to: number): void {
  view.dispatch({
    selection: EditorSelection.range(from, to),
  });
}

/** 获取当前渲染的 hidden marker 元素列表（按文档顺序） */
export function markerElements(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll(`.${MARKER_CLASS}`)) as HTMLElement[];
}

/** 等待 CM 渲染（decoration 应用 + DOM 更新） */
export async function sleep(ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export { MARKER_CLASS };
