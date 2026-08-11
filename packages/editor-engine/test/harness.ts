/**
 * 测试 harness —— Live Markdown Engine 统一测试入口。
 *
 * 能力：
 * - setUpEditor：CM6 + markdown + 引擎扩展（jsdom）
 * - 光标/选区控制（moveCaret / selectRange）
 * - 渲染断言（markerElements / markerTexts）
 * - 组合控制（startComposition / endComposition）
 */

import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, MARKER_CLASS } from '../src/index';

/** 构建带引擎的编辑器（测试环境自行管理 composition 状态） */
export function setUpEditor(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      install(false),
    ],
  });
  view.focus();
  return view;
}

/** 把主选区光标移到 pos（光标 = anchor === head） */
export function moveCaret(view: EditorView, pos: number): void {
  view.dispatch({ selection: EditorSelection.cursor(pos) });
}

/** 设置选区 [from, to] */
export function selectRange(view: EditorView, from: number, to: number): void {
  view.dispatch({ selection: EditorSelection.range(from, to) });
}

/** 获取当前渲染的 hidden marker 元素列表（按文档顺序） */
export function markerElements(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll(`.${MARKER_CLASS}`)) as HTMLElement[];
}

/** marker 文本列表 */
export function markerTexts(view: EditorView): string[] {
  return markerElements(view).map((el) => el.textContent ?? '');
}

/** 等待 CM 渲染（decoration 应用 + DOM 更新） */
export async function sleep(ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** IME composition 控制（需要 install(true) 的编辑器） */
export function startComposition(): void {
  document.dispatchEvent(new Event('compositionstart'));
}

export function endComposition(): void {
  document.dispatchEvent(new Event('compositionend'));
}

export { MARKER_CLASS };
