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

/**
 * Markdown parser 在负载较高时会先发布局部 syntax tree，随后异步补齐其余节点。
 * 测试应等待目标装饰就绪，而不是把某一固定延迟后的半解析 DOM 当成最终结果。
 */
export async function waitForMarkerCount(view: EditorView, expected: number, timeout = 1500): Promise<void> {
  const deadline = Date.now() + timeout;
  while (markerElements(view).length < expected && Date.now() < deadline) {
    await sleep(25);
  }
}

export { MARKER_CLASS };
