/**
 * 行内代码的**代码属性**（spec §11「caret inside: … no autocorrect/spellcheck」）。
 *
 * 立此文件的理由（2026-10-01 审计 §4.34）：
 * 块级代码早有等价物（`CoreEditor/src/styling/nodes/code.ts` 的 `codeBlockStyle` 给
 * `FencedCode`/`CodeBlock` 设 `spellcheck=false` / `autocorrect=off` / `autocomplete=off` /
 * `autocapitalize=off`），而 `inlineCodeStyle` **只加 class、不带任何属性** ——
 * 行内代码内浏览器拼写检查仍会画红波浪线。本扩展补上这一半（放在引擎侧，见源文件头注释）。
 */

import { setUpEditor, moveCaret, sleep } from './harness';
import { INLINE_CODE_ATTR_CLASS } from '../src/index';

/** 当前渲染出的「行内代码属性」元素 */
function attrSpans(view: ReturnType<typeof setUpEditor>): Element[] {
  return Array.from(view.dom.querySelectorAll(`.${INLINE_CODE_ATTR_CLASS}`));
}

describe('行内代码属性（spec §11：no autocorrect / spellcheck）', () => {
  test('行内代码容器带四个代码属性（与 codeBlockStyle 逐字对齐）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const spans = attrSpans(view);
      expect(spans).toHaveLength(1);
      const el = spans[0];
      expect(el.getAttribute('spellcheck')).toBe('false');
      expect(el.getAttribute('autocorrect')).toBe('off');
      expect(el.getAttribute('autocomplete')).toBe('off');
      expect(el.getAttribute('autocapitalize')).toBe('off');
      // 只加属性，不改文本（spec §2 唯一真源）
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  test('非恒绿对照：无行内代码的文档 → 0 个', async () => {
    const view = setUpEditor('a b');
    try {
      await sleep();
      expect(attrSpans(view)).toHaveLength(0);
    } finally { view.destroy(); }
  });

  test('围栏代码不被本扩展标记（块级由 CoreEditor codeBlockStyle 承担，不重复）', async () => {
    const view = setUpEditor('```\nconst a = 1;\n```\n\nplain');
    try {
      await sleep();
      expect(attrSpans(view)).toHaveLength(0);
    } finally { view.destroy(); }
  });

  test('多个行内代码各自带属性', async () => {
    const view = setUpEditor('`a` 与 `b`');
    try {
      await sleep();
      expect(attrSpans(view)).toHaveLength(2);
    } finally { view.destroy(); }
  });

  test('caret 进入行内代码：属性仍在（静态属性，不随 marker reveal 变化），doc 不变', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      moveCaret(view, 5); // `code` 内
      await sleep();
      expect(attrSpans(view)).toHaveLength(1);
      expect(attrSpans(view)[0].getAttribute('spellcheck')).toBe('false');
      // spec §8：decoration 更新不得改写文档
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  test('节点失效（删掉一个反引号）→ 属性消失，且不崩', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      expect(attrSpans(view)).toHaveLength(1);
      view.dispatch({ changes: { from: 2, to: 3, insert: '' } }); // 删开反引号
      await sleep();
      expect(attrSpans(view)).toHaveLength(0);
      expect(view.state.doc.toString()).toBe('a code` b');
    } finally { view.destroy(); }
  });
});
