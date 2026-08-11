/**
 * Link —— Typora 级编辑体验（spec §12）。
 * inline / reference / autolink / local file / heading anchor
 */

import { setUpEditor, moveCaret, selectRange, markerTexts, caretPos, sleep } from './harness';

describe('Inline Link — idle（URL 隐藏，text 显示）', () => {
  test('idle → URL + 括号隐藏（link text 可见）', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    moveCaret(view, 32); // 节点外
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toContain('https://example.com'); // URL 隐藏
    expect(texts).toContain('[');
    expect(texts).toContain(']');
    expect(texts).toContain('(');
    expect(texts).toContain(')');
    // 但 link text 内容完整（唯一真源）
    expect(view.state.doc.toString()).toContain('[text](https://example.com)');
  });
});

describe('Inline Link — caret inside', () => {
  test('caret in text → text-marker 显示（[ ]），URL 隐藏', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    moveCaret(view, 3); // 'text' 内
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toContain('https://example.com'); // URL 仍隐藏
    expect(texts).not.toContain('['); // text-marker 显示
    expect(texts).not.toContain(']');
    // 括号（url-marker）隐藏
    expect(texts).toContain('(');
    expect(texts).toContain(')');
  });

  test('caret in URL → URL + 括号显示，text-marker 隐藏', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    moveCaret(view, 15); // URL 内
    await sleep();
    const texts = markerTexts(view);
    expect(texts).not.toContain('https://example.com'); // URL 显示
    expect(texts).not.toContain('(');
    expect(texts).not.toContain(')');
    expect(texts).toContain('['); // text-marker 隐藏
    expect(texts).toContain(']');
  });

  test('caret leaves → 恢复 idle（URL 隐藏）', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    moveCaret(view, 15);
    await sleep();
    moveCaret(view, 32); // 离开
    await sleep();
    expect(markerTexts(view)).toContain('https://example.com');
  });
});

describe('Inline Link — selection', () => {
  test('selection 覆盖 URL → source（全显示）', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    selectRange(view, 8, 25); // 覆盖 URL
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 覆盖 text → source', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    selectRange(view, 0, 6);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Reference Link', () => {
  test('idle → URL/label 隐藏（text 显示）', async () => {
    const view = setUpEditor('[text][ref] tail');
    await sleep();
    moveCaret(view, 13); // 节点外
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toContain('[');
    expect(texts).toContain(']');
    expect(texts).toContain('[ref]'); // label 隐藏
  });

  test('caret in text → text-marker 显示', async () => {
    const view = setUpEditor('[text][ref] tail');
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(markerTexts(view)).not.toContain('[');
  });
});

describe('Autolink', () => {
  test('idle → 尖括号隐藏，URL 常显', async () => {
    const view = setUpEditor('<https://example.com> tail');
    await sleep();
    moveCaret(view, 24); // 节点外
    await sleep();
    const texts = markerTexts(view);
    expect(texts).toContain('<');
    expect(texts).toContain('>');
    expect(texts).not.toContain('https://example.com'); // URL 是文本，不隐藏
  });

  test('caret inside → 全显示（尖括号可见）', async () => {
    const view = setUpEditor('<https://example.com> tail');
    await sleep();
    moveCaret(view, 10); // URL 内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

describe('Local file / Heading anchor', () => {
  test('local file link idle → URL 隐藏', async () => {
    const view = setUpEditor('[docs](./local/file.md) tail');
    await sleep();
    moveCaret(view, 26); // 节点外
    await sleep();
    expect(markerTexts(view)).toContain('./local/file.md');
  });

  test('heading anchor idle → URL 隐藏', async () => {
    const view = setUpEditor('[章节](#heading-anchor) tail');
    await sleep();
    moveCaret(view, 25); // 节点外
    await sleep();
    expect(markerTexts(view)).toContain('#heading-anchor');
  });
});

describe('No caret jump', () => {
  test('URL 隐藏/显示切换不改变 caret 位置', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    // 在 text 内
    moveCaret(view, 2);
    await sleep();
    const beforeText = caretPos(view);
    // 移到 URL 内（URL 显示）
    moveCaret(view, 15);
    await sleep();
    expect(caretPos(view)).toBe(15); // 精确，无跳
    // 回到 text
    moveCaret(view, 2);
    await sleep();
    expect(caretPos(view)).toBe(beforeText); // 无跳
    // 移到节点外（URL 隐藏）
    moveCaret(view, 32);
    await sleep();
    expect(caretPos(view)).toBe(32);
  });

  test('marker 隐藏不影响文本选择', async () => {
    const view = setUpEditor('[text](https://example.com) tail');
    await sleep();
    moveCaret(view, 32);
    await sleep();
    selectRange(view, 1, 5); // 跨 text 选择（URL 隐藏状态下）
    await sleep();
    expect(caretPos(view)).toBe(5);
    // 文本内容不受影响
    expect(view.state.doc.toString()).toBe('[text](https://example.com) tail');
  });
});
