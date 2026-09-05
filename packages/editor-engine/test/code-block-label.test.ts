/**
 * E3（Typora parity 第三轮）测试：
 * - parseFenceBlocks 纯解析
 * - 代码块语言标签 widget（显示 / 点击换语言 / 起始行隐藏）
 * - math $$…$$ 与围栏块编辑态描边（mellow-md-editing-outline）
 */

import { parseFenceBlocks, buildCodeBlockLabelExtension, CODEBLOCK_LANG_CLASS, EDITING_OUTLINE_CLASS } from '../src/codeBlockLabel';
import { setUpEditor, moveCaret, sleep } from './harness';
import type { EditorView } from '@codemirror/view';

function setUpLabel(doc: string): EditorView {
  // 独立最小视图：只挂标签扩展，隔离 math/mermaid 等 widget 干扰
  const { EditorView: EV } = require('@codemirror/view') as typeof import('@codemirror/view');
  return new EV({
    doc,
    parent: document.body,
    extensions: [buildCodeBlockLabelExtension()],
  });
}

describe('parseFenceBlocks', () => {
  test('多围栏 / 波浪号 / 无语言 / info string 首词', () => {
    const doc = '```py\nprint(1)\n```\ntext\n~~~js\nvar a\n~~~';
    const blocks = parseFenceBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ from: 0, lang: 'py', closed: true });
    expect(blocks[0].langFrom).toBe(3);
    expect(blocks[0].langTo).toBe(5);
    expect(blocks[1]).toMatchObject({ lang: 'js', closed: true });
    expect(blocks[1].from).toBe(doc.indexOf('~~~'));
  });

  test('未指定语言 → 空串 + 零宽 token 区间；未闭合 → closed=false', () => {
    const open = parseFenceBlocks('```\ncode\n```');
    expect(open[0].lang).toBe('');
    expect(open[0].langFrom).toBe(open[0].langTo);
    expect(open[0].langFrom).toBe(3);

    const unterminated = parseFenceBlocks('```ts\nlet a = 1');
    expect(unterminated[0]).toMatchObject({ lang: 'ts', closed: false });
    expect(unterminated[0].to).toBe('```ts\nlet a = 1'.length);
  });

  test('info string 多词只取首词；闭合标记须同字符', () => {
    const doc = '```python title="x"\ncode\n```\n~~~\nnot a close for backtick fence';
    const blocks = parseFenceBlocks(doc);
    expect(blocks[0].lang).toBe('python');
    expect(blocks[0].closed).toBe(true);
  });
});

describe('代码块语言标签（E3）', () => {
  test('起始行行尾渲染语言标签（大写）；光标在起始行时隐藏', async () => {
    const doc = '```python\nprint(1)\n```\n';
    const view = setUpLabel(doc);
    moveCaret(view, doc.length);
    await sleep();
    const label = view.dom.querySelector(`.${CODEBLOCK_LANG_CLASS}`);
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('PYTHON');

    moveCaret(view, 0);
    await sleep();
    expect(view.dom.querySelector(`.${CODEBLOCK_LANG_CLASS}`)).toBeNull();
  });

  test('未指定语言显示占位「语言」；点击弹出下拉，选择后改写 info string', async () => {
    const doc = '```\ncode\n```\n';
    const view = setUpLabel(doc);
    moveCaret(view, doc.length);
    await sleep();
    const label = view.dom.querySelector(`.${CODEBLOCK_LANG_CLASS}`) as HTMLElement;
    expect(label.textContent).toBe('语言');

    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const select = label.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(Array.from(select.options).some((o) => o.value === 'python')).toBe(true);

    select.value = 'python';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep();
    expect(view.state.doc.toString()).toBe('```python\ncode\n```\n');
    expect(view.dom.querySelector(`.${CODEBLOCK_LANG_CLASS}`)?.textContent).toBe('PYTHON');
  });

  test('已有语言可直接换成另一语言', async () => {
    const doc = '```ts\nlet a = 1\n```\n';
    const view = setUpLabel(doc);
    moveCaret(view, doc.length);
    await sleep();
    const label = view.dom.querySelector(`.${CODEBLOCK_LANG_CLASS}`) as HTMLElement;
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const select = label.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('ts');
    select.value = 'go';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep();
    expect(view.state.doc.toString()).toBe('```go\nlet a = 1\n```\n');
  });
});

describe('编辑态描边（E3）', () => {
  test('光标进入围栏块 → 代码行获得 mellow-md-editing-outline；移出后消失', async () => {
    const doc = '```ts\nlet a = 1\n```\nafter';
    const view = setUpEditor(doc);
    moveCaret(view, doc.indexOf('let'));
    await sleep();
    expect(view.dom.querySelectorAll(`.cm-line.${EDITING_OUTLINE_CLASS}`).length).toBe(1);

    moveCaret(view, doc.length);
    await sleep();
    expect(view.dom.querySelectorAll(`.cm-line.${EDITING_OUTLINE_CLASS}`).length).toBe(0);
  });

  test('光标进入 $$…$$ 数学块 → 块内各行描边', async () => {
    const doc = '$$\nE = mc^2\n$$\nafter';
    const view = setUpEditor(doc);
    moveCaret(view, doc.indexOf('E ='));
    await sleep();
    expect(view.dom.querySelectorAll(`.cm-line.${EDITING_OUTLINE_CLASS}`).length).toBe(3);

    moveCaret(view, doc.length);
    await sleep();
    expect(view.dom.querySelectorAll(`.cm-line.${EDITING_OUTLINE_CLASS}`).length).toBe(0);
  });

  test('光标在外部时无描边（含 mermaid 块未编辑态）', async () => {
    const doc = '```mermaid\nflowchart TD\n A-->B\n```\n';
    const view = setUpEditor(doc);
    moveCaret(view, doc.length);
    await sleep();
    expect(view.dom.querySelectorAll(`.cm-line.${EDITING_OUTLINE_CLASS}`).length).toBe(0);
  });
});
