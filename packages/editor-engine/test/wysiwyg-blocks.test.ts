/**
 * V5 非聚焦块渲染测试（Typora WYSIWYG 对齐）。
 *
 * 分工：marker（`>` / `#`）隐藏由 plugin.ts reveal 框架负责（reveal.test.ts 覆盖）；
 * 本套件锁 wysiwygBlocks 的增量：行级渲染 class、FencedCode 围栏隐藏、HR 线、块距。
 */

import { setUpEditor, sleep, moveCaret } from './harness';
import type { EditorView } from '@codemirror/view';

const QUOTE_DOC = '> 引用一行\n>\n> > 嵌套引用\n\n普通段落\n';
const HEADING_DOC = '# 大标题\n\n正文\n\nSetext 标题\n===\n\n尾段\n';
const FENCE_DOC = '```js\nconst a = 1;\n```\n\n正文\n';
const HR_DOC = '---\n\n正文\n';

function lineEl(view: EditorView, text: string): HTMLElement | null {
  const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
  return lines.find((el) => el.textContent?.includes(text)) ?? null;
}

describe('V5 非聚焦块渲染（wysiwygBlocks）', () => {
  test('引用行：常驻竖线 class（含嵌套 d2），marker 显隐由 reveal 负责', async () => {
    const view = setUpEditor(QUOTE_DOC);
    await sleep();
    const outer = lineEl(view, '引用一行');
    expect(outer?.classList.contains('mellow-quote-line')).toBe(true);
    expect(outer?.classList.contains('mellow-quote-d1')).toBe(true);

    const nested = lineEl(view, '嵌套引用');
    expect(nested?.classList.contains('mellow-quote-d2')).toBe(true);

    // 光标进入引用：class 仍常驻（Typora caret 行也有竖线）
    moveCaret(view, 2);
    await sleep();
    expect(lineEl(view, '引用一行')?.classList.contains('mellow-quote-line')).toBe(true);
  });

  test('标题排版 class：ATX h1 / Setext 常驻 heading-line', async () => {
    const view = setUpEditor(HEADING_DOC);
    await sleep();
    const h1 = lineEl(view, '大标题');
    expect(h1?.classList.contains('mellow-heading-line')).toBe(true);
    expect(h1?.classList.contains('mellow-h1')).toBe(true);

    const setext = lineEl(view, 'Setext 标题');
    expect(setext?.classList.contains('mellow-heading-line')).toBe(true);
  });

  test('代码块：光标在外 → 围栏行隐藏 + 语言标签驻留；光标进入 → 源码恢复', async () => {
    const view = setUpEditor(FENCE_DOC);
    moveCaret(view, view.state.doc.length);
    await sleep();
    const content = lineEl(view, 'const a = 1;');
    expect(content).not.toBeNull();
    const allText = Array.from(view.dom.querySelectorAll('.cm-line')).map((el) => el.textContent ?? '').join('\n');
    expect(allText).not.toContain('```');
    expect(view.dom.querySelector('.mellow-code-lang-label')?.textContent).toBe('js');

    moveCaret(view, 2);
    await sleep();
    const allTextFocused = Array.from(view.dom.querySelectorAll('.cm-line')).map((el) => el.textContent ?? '').join('\n');
    expect(allTextFocused).toContain('```');
  });

  test('分隔线：光标在外 → "---" 隐藏并渲染 hr 线 class；光标进入 → 源码恢复', async () => {
    const view = setUpEditor(HR_DOC);
    moveCaret(view, view.state.doc.length);
    await sleep();
    const hr = view.dom.querySelector('.mellow-hr-line');
    expect(hr).not.toBeNull();
    expect(hr?.textContent).not.toContain('---');

    moveCaret(view, 1);
    await sleep();
    expect(view.dom.querySelector('.mellow-hr-line')).toBeNull();
  });

  test('顶层块距 class：段落首/尾行携带 mellow-block-first/last', async () => {
    const view = setUpEditor(QUOTE_DOC);
    await sleep();
    const para = lineEl(view, '普通段落');
    expect(para?.classList.contains('mellow-block-first')).toBe(true);
    expect(para?.classList.contains('mellow-block-last')).toBe(true);
  });
});
