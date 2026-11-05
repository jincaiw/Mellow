/**
 * CJK 行内强调（ADR-0035 = A1，批次 A35）。
 *
 * 两层：
 * 1. 纯函数 `scanCjkEmphasisSegment`：Typora 判据 + markdown-it 配对机器的移植正确性
 *    （验收矩阵 + CommonMark 不回退用例，与导出侧 `packages/export/test/html.test.ts` 同集）；
 * 2. 集成（harness）：孤岛区间渲染加粗 + 定界符隐藏 + reveal/源码模式/IME 语义。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, CJK_STRONG_CLASS } from '../src/index';
import { scanCjkEmphasisSegment } from '../src/cjkEmphasis';
import { moveCaret, markerTexts, sleep } from './harness';

const NONE = (): boolean => false;
const scan = (doc: string) => scanCjkEmphasisSegment(doc, 0, doc.length, NONE);

describe('scanCjkEmphasisSegment（纯函数：Typora 判据）', () => {
  test('验收矩阵 ①：中文**粗体**中文（三条路径原本一致 ⇒ 本层仍应判成对）', () => {
    const p = scan('中文**粗体**中文');
    expect(p).toEqual([{ from: 2, to: 8, innerFrom: 4, innerTo: 6, strong: true }]);
  });

  test('验收矩阵 ②：这是**「必须」**的 —— CommonMark 判不成对，Typora 判加粗（本层核心用例）', () => {
    const p = scan('这是**「必须」**的');
    expect(p.length).toBe(1);
    expect(p[0]!.strong).toBe(true);
    expect(p[0]!.from).toBe(2);
    expect(p[0]!.to).toBe(10);
    expect(p[0]!.innerFrom).toBe(4); // 「
    expect(p[0]!.innerTo).toBe(8); // 」
  });

  test('验收矩阵 ② 扩展：`*` 单星同理（中文*「斜体」*中文 → 斜体）', () => {
    const p = scan('中文*「斜体」*中文');
    expect(p).toEqual([{ from: 2, to: 8, innerFrom: 3, innerTo: 7, strong: false }]);
  });

  test('验收矩阵 ② 扩展：`__` 同形（这是__「必须」__的 → 加粗）', () => {
    const p = scan('这是__「必须」__的');
    expect(p.length).toBe(1);
    expect(p[0]!.strong).toBe(true);
  });

  test('验收矩阵 ③：行首/行尾 **「引文」**', () => {
    const p = scan('**「引文」**');
    expect(p).toEqual([{ from: 0, to: 8, innerFrom: 2, innerTo: 6, strong: true }]);
  });

  test('验收矩阵 ④：两侧留空格 这是 **「必须」** 的', () => {
    const p = scan('这是 **「必须」** 的');
    expect(p.length).toBe(1);
    expect(p[0]!.strong).toBe(true);
  });

  test('外侧标点：（**「x」**）与 a**（b）**c 都加粗', () => {
    expect(scan('（**「x」**）').length).toBe(1);
    expect(scan('a**（b）**c').length).toBe(1);
  });
});

describe('scanCjkEmphasisSegment（纯函数：CommonMark 机器不回退）', () => {
  test('`**a**b**c**` → 两对 strong（空段守卫语义维持）', () => {
    const p = scan('**a**b**c**');
    expect(p.length).toBe(2);
    expect(p.every((x) => x.strong)).toBe(true);
  });

  test('`a**b**c**d**e` → 两对 strong', () => {
    const p = scan('a**b**c**d**e');
    expect(p.length).toBe(2);
  });

  test('`***foo***` → 外层 em + 内层 strong（忠实移植 markdown-it 双对；集成时 lezer 已覆盖该串 ⇒ 本层不重复装饰）', () => {
    const p = scan('***foo***');
    expect(p.length).toBe(2);
    const outer = p.find((x) => x.from === 0 && x.to === 9)!;
    const inner = p.find((x) => x.from === 1)!;
    expect(outer.strong).toBe(false); // 外层 em
    expect(inner.strong).toBe(true); // 内层 strong
  });

  test('`**未闭合` 不成对', () => {
    expect(scan('**未闭合').length).toBe(0);
  });

  test('`snake_case_word` 不加粗（ASCII 单词内 `_` 守卫）', () => {
    expect(scan('snake_case_word').length).toBe(0);
    expect(scan('a_b_c').length).toBe(0);
  });

  test('但汉字邻接的 `_` 不受守卫影响：中文_「斜体」_中文 成对', () => {
    const p = scan('中文_「斜体」_中文');
    expect(p.length).toBe(1);
    expect(p[0]!.strong).toBe(false);
  });

  test('`_foo_ bar` / `**foo**bar**` 维持原语义', () => {
    expect(scan('_foo_ bar').length).toBe(1);
    const p = scan('**foo**bar**');
    expect(p.length).toBe(1);
    expect(p[0]!.to).toBeLessThan('**foo**bar**'.length); // 尾 `**` 落单
  });
});

describe('CJK 行内强调（集成：harness 编辑器）', () => {
  function setUp(doc: string): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(false)],
    });
    view.focus();
    return view;
  }

  test('孤岛区间 idle：文字加粗 + 定界符隐藏', async () => {
    const view = setUp('这是**「必须」**的');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    const strong = Array.from(view.dom.querySelectorAll(`.${CJK_STRONG_CLASS}`));
    expect(strong.length).toBe(1);
    expect(strong[0]!.textContent).toBe('「必须」');
    // 定界符走 MARKER_CLASS（与 reveal 管线同一隐藏通道）
    expect(markerTexts(view)).toEqual(['**', '**']);
    view.destroy();
  });

  test('光标进入孤岛区间 → 定界符显示（reveal 语义）', async () => {
    const view = setUp('这是**「必须」**的');
    await sleep();
    moveCaret(view, 5); // 内容内
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    const strong = Array.from(view.dom.querySelectorAll(`.${CJK_STRONG_CLASS}`));
    expect(strong.length).toBe(1);
    view.destroy();
  });

  test('已配对 `中文**粗体**中文` 不受本层影响（tree 管线照常，无重复装饰）', async () => {
    const view = setUp('中文**粗体**中文');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    // tree 路径：marker 隐藏存在，但 CJK_STRONG_CLASS 不应出现（那是孤岛层专属）
    expect(view.dom.querySelectorAll(`.${CJK_STRONG_CLASS}`).length).toBe(0);
    expect(markerTexts(view)).toEqual(['**', '**']);
    view.destroy();
  });

  test('IME 组合期间不重算装饰', async () => {
    const view = setUp('这是**「必须」**的');
    await sleep();
    document.dispatchEvent(new Event('compositionstart'));
    view.dispatch({ changes: { from: 0, to: 0, insert: '打字中' } });
    await sleep(50);
    // 组合期间不重建（与 plugin/inlineExtras 同语义）；组合结束后恢复
    document.dispatchEvent(new Event('compositionend'));
    await sleep();
    const strong = Array.from(view.dom.querySelectorAll(`.${CJK_STRONG_CLASS}`));
    expect(strong.length).toBe(1);
    view.destroy();
  });

  test('源码模式（切换后）定界符显示', async () => {
    const view = setUp('这是**「必须」**的');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    // 进入任一 marker 区间 = source 态（classifyNodeState 同源）：光标进孤岛
    moveCaret(view, 3);
    await sleep();
    // 光标在区间内 ⇒ 孤岛层让位（不隐藏）；tree 层对孤岛无节点 ⇒ 全部显示
    expect(markerTexts(view)).toEqual([]);
    view.destroy();
  });
});
