/**
 * 行内扩展标记（Typora 深度对标）：==高亮== / ^上标^ / ~下标~ 扫描与渲染。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { inlineCodeSpans, scanInlineExtras } from '../src/inlineExtras';
import { moveCaret, sleep } from './harness';

describe('scanInlineExtras（纯函数）', () => {
  test('==高亮== / ^上标^ / ~下标~ 基础扫描', () => {
    const r = scanInlineExtras('==hi== and ^x^ and ~y~', []);
    expect(r).toEqual([
      { from: 0, to: 6, kind: 'highlight' },
      { from: 11, to: 14, kind: 'sup' },
      { from: 19, to: 22, kind: 'sub' },
    ]);
  });

  test('~~删除线~~ 不误判为下标；单 ~ 是下标', () => {
    const r = scanInlineExtras('~~del~~ ~sub~', []);
    // '~~del~~ ~sub~'：~~del~~ 是删除线跳过；~sub~ = from 8, to 13
    expect(r).toEqual([{ from: 8, to: 13, kind: 'sub' }]);
  });

  test('跳过代码围栏与行内代码', () => {
    const doc = '```js\n==code==\n```\n\n==ok== and `==inline==`';
    const code = [{ from: 0, to: 18 }];
    const r = scanInlineExtras(doc, code);
    expect(r).toEqual([{ from: 20, to: 26, kind: 'highlight' }]);
  });

  test('Setext 下划线（整行 =）不算高亮', () => {
    // 'Title\n====='：第二行是 Setext underline
    expect(scanInlineExtras('Title\n=====', [])).toEqual([]);
  });

  test('跨行不匹配', () => {
    expect(scanInlineExtras('==a\nb==', [])).toEqual([]);
  });

  test('inlineCodeSpans 识别成对与不成对反引号', () => {
    expect(inlineCodeSpans('a `x` b `y` c')).toEqual([
      { from: 2, to: 5 },
      { from: 8, to: 11 },
    ]);
  });

  test('窗口裁剪：只扫窗口内标记（LF 视口模式语义）', () => {
    const doc = '==a==\n\n==b==\n\n==c==';
    // 窗口只盖第二段（==b== 位于 7..12）
    const r = scanInlineExtras(doc, [], { from: 7, to: 15 });
    expect(r).toEqual([{ from: 7, to: 12, kind: 'highlight' }]);
  });

  test('性能护栏：大文档 + 大量 skip 区间不退化（O(n log r)，非 O(n×r)）', () => {
    // 回归背景（2026-08-22 j17）：逐字符 some() 线性扫 skip 区间，
    // 7MB 文档单次扫描 60s+。构造 ~600k 字符 + 10k 围栏，限时 2s。
    // fence 内容不含反引号（避免干扰 inlineCodeSpans 全文配对产生伪 span）。
    const chunk = 'plain text line ==h== and `c` tail\n';
    const fenceBlock = '~~~\nfenced ==no== block\n~~~\n';
    const parts: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      parts.push(chunk, fenceBlock);
    }
    const doc = parts.join('');
    const fences: Array<{ from: number; to: number }> = [];
    let offset = 0;
    for (let i = 0; i < 10_000; i++) {
      const blockStart = offset + chunk.length; // chunk.length 已含尾部 \n
      const blockEnd = blockStart + fenceBlock.length;
      fences.push({ from: blockStart, to: blockEnd });
      offset = blockEnd;
    }
    const t0 = Date.now();
    const r = scanInlineExtras(doc, fences);
    const elapsed = Date.now() - t0;
    // 每 chunk 恰一个 ==h==（fenced 内的 ==no== 被 skip）
    expect(r.length).toBe(10_000);
    expect(r.every((e) => e.kind === 'highlight')).toBe(true);
    // 旧实现（逐字符 some）在此规模下 >30s；新实现 <2s（实际 ~100ms）
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('Inline Extras 渲染', () => {
  function setUp(doc: string): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    return view;
  }

  test('高亮内容有标记、定界符隐藏（caret 在区间外）', async () => {
    const view = setUp('==hi== x');
    await sleep();
    moveCaret(view, 8); // 区间外（doc 长 8）
    await sleep();
    expect(view.dom.querySelector('.mellow-md-highlight')).not.toBeNull();
    expect(view.dom.querySelectorAll('.mellow-md-extras-delim').length).toBe(2);
    view.destroy();
  });

  test('caret 进入区间 → 定界符显示（源码编辑）', async () => {
    const view = setUp('==hi== x');
    await sleep();
    moveCaret(view, 2); // 区间内
    await sleep();
    expect(view.dom.querySelectorAll('.mellow-md-extras-delim').length).toBe(0);
    view.destroy();
  });

  test('上标/下标渲染类', async () => {
    const view = setUp('x^2^ y~1~');
    await sleep();
    moveCaret(view, 8);
    await sleep();
    expect(view.dom.querySelector('.mellow-md-sup')).not.toBeNull();
    expect(view.dom.querySelector('.mellow-md-sub')).not.toBeNull();
    view.destroy();
  });

  test('doc 文本不变（Source Fidelity）', async () => {
    const view = setUp('==hi== ^x^ ~y~');
    await sleep();
    expect(view.state.doc.toString()).toBe('==hi== ^x^ ~y~');
    view.destroy();
  });
});
