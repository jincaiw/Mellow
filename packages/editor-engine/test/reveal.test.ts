/**
 * Marker Reveal 行为测试 —— idle / caret-before / caret-inside / caret-after / selection。
 *
 * 断言基于渲染 DOM：hidden marker 表现为带 .mellow-md-marker class 的 span。
 */

import { setUp, moveCaret, selectRange, markerElements, sleep, waitForMarkerCount } from './utils/editor';

const DOC = '# Title\n\nplain text\n\n**bold** *italic* ~~strike~~ `code`';

/** 各节点 marker 数量：H1(1) + bold(2) + italic(2) + strike(2) + code(2) */
const ALL_MARKERS = 9;

function markerTexts(view: ReturnType<typeof setUp>): string[] {
  return markerElements(view).map((el) => el.textContent ?? '');
}

describe('Marker Reveal — idle（caret 在节点外）', () => {
  test('全部节点 marker 隐藏', async () => {
    const view = setUp(DOC);
    await sleep();
    // caret 初始在 0（heading marker 上）→ 先移出
    moveCaret(view, 0); // heading 内 → source
    await sleep();
    moveCaret(view, DOC.indexOf('plain') + 1);
    await sleep();
    await waitForMarkerCount(view, ALL_MARKERS);

    const texts = markerTexts(view);
    expect(texts).toContain('# ');
    expect(texts).toContain('**');
    expect(texts).toContain('*');
    expect(texts).toContain('~~');
    expect(texts).toContain('`');
    expect(texts.length).toBe(ALL_MARKERS);
  });

  test('caret-before（紧邻节点外）→ 仍隐藏', async () => {
    const view = setUp('**bold**x');
    await sleep();
    moveCaret(view, 0); // source
    await sleep();
    // caret 在节点后紧邻之外（x 之后，to+2）→ idle
    moveCaret(view, 9);
    await sleep();
    expect(markerTexts(view).length).toBe(2);
  });
});

describe('Marker Reveal — Heading', () => {
  test('caret-inside → marker 显示', async () => {
    const view = setUp('# Title');
    await sleep();
    moveCaret(view, 3); // 'Title' 中间
    await sleep();
    expect(markerTexts(view)).not.toContain('# ');
  });

  test('caret-on-marker → marker 显示', async () => {
    const view = setUp('# Title');
    await sleep();
    moveCaret(view, 0); // '#' 上
    await sleep();
    expect(markerTexts(view).length).toBe(0);
    moveCaret(view, 1); // '#' 与 ' ' 之间
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret-after（节点末尾）→ marker 显示', async () => {
    const view = setUp('# Title');
    await sleep();
    moveCaret(view, 7); // 节点末尾
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Marker Reveal — Bold / Italic / Strike / InlineCode', () => {
  test('caret-inside → 全部显示（整节点 source）', async () => {
    const view = setUp('**bold**');
    await sleep();
    moveCaret(view, 3); // 'bold' 中间
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret-on-marker → 显示', async () => {
    const view = setUp('**bold**');
    await sleep();
    moveCaret(view, 1); // 第一个 marker 内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret-before（to+1）→ 隐藏', async () => {
    const view = setUp('**bold**x');
    await sleep();
    moveCaret(view, 9); // 'x' 之后（节点外）
    await sleep();
    expect(markerTexts(view).length).toBe(2);
  });

  test.each([
    ['*italic*', '*'],
    ['~~strike~~', '~~'],
    ['`code`', '`'],
  ])('%s idle → marker %s 隐藏', async (doc, marker) => {
    const view = setUp(`${doc}x`);
    await sleep();
    moveCaret(view, doc.length + 1); // x 之后（节点外）
    await sleep();
    const texts = markerTexts(view);
    expect(texts.length).toBe(2);
    expect(texts[0]).toBe(marker);
    expect(texts[1]).toBe(marker);
  });
});

describe('Marker Reveal — Selection', () => {
  test('selection 部分覆盖内容 → 整节点 source（显示）', async () => {
    const view = setUp('**bold**');
    await sleep();
    selectRange(view, 3, 5); // 选中 'bo'
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 只碰 marker → source', async () => {
    const view = setUp('**bold**');
    await sleep();
    selectRange(view, 0, 2); // 选中 '**'
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 完全在节点外 → 隐藏', async () => {
    const view = setUp('x **bold** y');
    await sleep();
    selectRange(view, 0, 1); // 选中 'x'
    await sleep();
    expect(markerTexts(view).length).toBe(2);
  });
});
