import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { buildMathExtension, copyMathSourceAt, createMathJaxCompatibleRenderer, extractMathMacros, parseMathSpans, renderMathSource, rendererPathFor } from '../src/math';
import { selectRange, setUpEditor, sleep, waitFor } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/math', name), 'utf8');

describe('Math Typora Corpus（PRD §42 / ADR-0010）', () => {
  test('corpus parser finds inline, block, macro, mhchem and error formulas with source intact', () => {
    const spans = parseMathSpans(fixture('typora-math-corpus.md'));
    expect(spans.some((s) => s.kind === 'inline' && s.tex === 'a^2 + b^2 = c^2')).toBe(true);
    expect(spans.some((s) => s.kind === 'inline' && s.tex === '\\alpha + \\beta')).toBe(true);
    expect(spans.some((s) => s.kind === 'block' && s.tex.includes('\\int_0^1'))).toBe(true);
    expect(spans.some((s) => s.kind === 'block' && s.tex.includes('E = mc^2'))).toBe(true);
    expect(spans.some((s) => s.tex.includes('\\newcommand{\\RR}'))).toBe(true);
    expect(spans.some((s) => s.tex.includes('\\ce{CO2'))).toBe(true);
    expect(spans.some((s) => s.error?.code === 'unbalanced-braces')).toBe(true);
    const copy = spans.find((s) => s.tex === '\\sqrt{x}');
    expect(copy?.source).toBe('$\\sqrt{x}$');
  });

  test('macros are extracted and applied in later formulas', () => {
    const macros = extractMathMacros('\\newcommand{\\RR}{\\mathbb{R}}\nf: \\RR \\to \\RR');
    expect(macros).toEqual({ RR: '\\mathbb{R}' });
    const rendered = renderMathSource('f: \\RR \\to \\RR', { displayMode: true, macros });
    expect(rendered.html).toContain('\\mathbb{R}');
    expect(rendered.error).toBeUndefined();
  });

  test('unsupported KaTeX fast path syntax falls back to MathJax-compatible renderer', () => {
    expect(rendererPathFor('a^2 + b^2', { fastPath: true })).toBe('katex-fast');
    expect(rendererPathFor('\\ce{CO2 + C -> 2 CO}', { fastPath: true })).toBe('mathjax-compatible');
    expect(rendererPathFor('\\newcommand{\\RR}{\\mathbb{R}} \\RR', { fastPath: true })).toBe('mathjax-compatible');
  });

  test('render errors keep source and compact error message', () => {
    const rendered = renderMathSource('\\frac{1}{', { displayMode: true });
    expect(rendered.error?.code).toBe('unbalanced-braces');
    expect(rendered.html).toContain('mellow-math-error');
    expect(rendered.html).toContain('\\frac{1}{');
  });

  test('copy source returns exact inline or block delimiter source', () => {
    const doc = 'Inline $\\sqrt{x}$ and block\n$$\nE = mc^2\n$$';
    const inlinePos = doc.indexOf('sqrt');
    const blockPos = doc.indexOf('mc^2');
    expect(copyMathSourceAt(doc, inlinePos)).toBe('$\\sqrt{x}$');
    expect(copyMathSourceAt(doc, blockPos)).toBe('$$\nE = mc^2\n$$');
    expect(copyMathSourceAt(doc, 0)).toBeNull();
  });

  test('caret inside math reveals source instead of widget render', async () => {
    const view = setUpEditor('A $x+1$ B');
    view.dispatch({ selection: { anchor: 4 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-math-widget')).toBeNull();
    view.dispatch({ selection: { anchor: 0 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-math-widget')?.textContent).toContain('x+1');
  });

  test('heavy render is scheduled async and stale render is ignored while typing', async () => {
    const calls: string[] = [];
    const view = new EditorView({
      doc: 'A $x$ B',
      parent: document.body,
      extensions: [buildMathExtension(false, {
        renderer: {
          render: async ({ tex }) => {
            calls.push(tex);
            await sleep(10);
            return { html: `<span class="custom-math">${tex}</span>` };
          },
        },
        debounceMs: 20,
      })],
    });
    expect(calls).toEqual([]);
    view.dispatch({ changes: { from: 4, insert: '+1' } });
    // ⚠️ 用 `waitFor` 而**不是**固定 `sleep(60)`：本用例的完成时刻 = debounce(20ms) + async render(10ms)
    // + 调度，取决于机器负载 —— 固定时长在**全量套件**（77 suites）下会偶发「还没渲染完就断言」的
    // 抖动（2026-10-01 实测：单跑 9/9 绿、整包偶发 1 红，失败点正是下一行）。`waitFor` 是 harness
    // 里为此提供的等待原语（超时仍返回 false → 断言照旧会红，不会变成恒绿）。
    expect(await waitFor(() => view.dom.querySelector('.custom-math') !== null)).toBe(true);
    expect(calls).toEqual(['x+1']);
    expect(view.dom.querySelector('.custom-math')?.textContent).toBe('x+1');
  });

  test('selection copy math source writes source only', () => {
    const view = setUpEditor('A $\\sqrt{x}$ B');
    const from = view.state.doc.toString().indexOf('$');
    selectRange(view, from, from + '$\\sqrt{x}$'.length);
    const data = new Map<string, string>();
    const ok = copyMathSourceAt(view.state.doc.toString(), view.state.selection.main.from, (type, value) => data.set(type, value));
    expect(ok).toBe('$\\sqrt{x}$');
    expect(data.get('text/plain')).toBe('$\\sqrt{x}$');
    expect(data.get('text/markdown')).toBe('$\\sqrt{x}$');
  });

  // R3-2 宿主 KaTeX 通道：__MELLOW_KATEX_RENDER__ 存在时走通道；null 回退源码显示
  test('host katex channel renders math and null falls back to source', async () => {
    const hostWindow = window as unknown as { __MELLOW_KATEX_RENDER__?: (tex: string, display: boolean) => Promise<string | null>; MathJax?: unknown };
    const savedMathJax = hostWindow.MathJax;
    hostWindow.MathJax = undefined;
    const renderer = createMathJaxCompatibleRenderer();
    try {
      hostWindow.__MELLOW_KATEX_RENDER__ = async (tex, display) => `<span data-katex data-display="${display}">${tex}</span>`;
      const ok = await renderer.render({ tex: '\\ce{2H2O}', displayMode: true });
      expect(ok.html).toContain('data-katex');
      expect(ok.html).toContain('\\ce{2H2O}');
      expect(ok.html).toContain('data-display="true"');

      hostWindow.__MELLOW_KATEX_RENDER__ = async () => null;
      const fallback = await renderer.render({ tex: 'x+1', displayMode: false });
      expect(fallback.html).toContain('mellow-math-rendered');
      expect(fallback.html).toContain('x+1');
    } finally {
      delete hostWindow.__MELLOW_KATEX_RENDER__;
      hostWindow.MathJax = savedMathJax;
    }
  });
});

// ── 围栏数学：Typora `gitlabMath`（**默认开**）────────────────────────────────
// 立此组的依据（一手证据，本机 Typora 1.14.9 build 7785 的 `TypeMark/appsrc/main.js`）：
//   `D.isMathType = function (e) { return File.option.gitlabMath && 'string' == typeof e
//      && a.isType((e || '').toLowerCase(), 'math') }`
// 其中 `a` 是模块 `1b` 的 `o.Node`，`Node.isType` 是**通用相等比较**（`t == arguments[n]`），
// 第二个实参是**字符串字面量 `"math"`** ⇒ 等价于 `lang.toLowerCase() === 'math'`。
// ⚠️ 因此**只有 `math`**：`latex`/`tex`/`katex`/`texmath` 在 Typora 是**按 TeX 高亮的代码块**
// （`main.js` 的 `case"stex":case"tex":case"latex":case"math":return "text/x-stex"` 是 **CodeMirror 模式**别名表）。
describe('围栏数学（Typora `gitlabMath`，默认开；审计 §4.120）', () => {
  const FENCE = '```math\nE = mc^2\n```';

  test('信息串为 math 的围栏 → 一个 block span，覆盖整段（含围栏行）', () => {
    const doc = `前\n${FENCE}\n后`;
    const spans = parseMathSpans(doc);
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.kind).toBe('block');
    expect(s.tex).toBe('E = mc^2');
    expect(s.source).toBe(FENCE);
    expect(s.from).toBe(doc.indexOf('```'));
    expect(s.to).toBe(doc.indexOf('```') + FENCE.length);
    expect(s.open).toBe('```');
    expect(s.close).toBe('```');
  });

  test('~~~ 围栏同样；大小写不敏感（与 Typora 的 toLowerCase 一致）', () => {
    expect(parseMathSpans('~~~Math\nx\n~~~')[0]).toMatchObject({ kind: 'block', tex: 'x', open: '~~~' });
    expect(parseMathSpans('```MATH\nx\n```')[0]).toMatchObject({ kind: 'block', tex: 'x' });
  });

  test('⚠️ 只有 math：latex / tex / katex / texmath 不是公式块（Typora 里是代码块）', () => {
    for (const lang of ['latex', 'tex', 'katex', 'texmath', 'mermaid', 'js', '']) {
      expect(parseMathSpans(`\`\`\`${lang}\nE = mc^2\n\`\`\``)).toHaveLength(0);
    }
  });

  test('未闭合的 math 围栏延伸到文末（与未闭合 $$ 同处置）', () => {
    const spans = parseMathSpans('```math\nx^2');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ kind: 'block', tex: 'x^2' });
    expect(spans[0].to).toBe('```math\nx^2'.length);
  });

  test('围栏内的 $$ 与 $x$ 不再被当作公式（fence 状态优先）', () => {
    const spans = parseMathSpans('```math\n$$ not a span $$\n$x$\n```');
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe('block');
    expect(spans[0].tex).toContain('$$ not a span $$');
  });

  test('4 空格缩进的 ```math 是缩进代码、不是围栏（CommonMark）', () => {
    expect(parseMathSpans('    ```math\nx\n    ```')).toHaveLength(0);
  });

  test('两个 math 围栏各自成块，且互不吞并', () => {
    const spans = parseMathSpans('```math\na\n```\n\n```math\nb\n```');
    expect(spans.map((s) => s.tex)).toEqual(['a', 'b']);
  });

  test('真实编辑器：光标在围栏外 → 整段替换为块级数学 widget；光标进入 → 显示源码', async () => {
    const doc = 'A\n\n```math\nE = mc^2\n```\n\nB';
    const view = setUpEditor(doc);
    await sleep();
    const widget = view.dom.querySelector('.mellow-math-widget.mellow-math-block');
    expect(widget).not.toBeNull();
    // 用 dataset.mellowMathSource（同步写入、渲染后不被覆盖）而非 textContent
    expect(widget?.getAttribute('data-mellow-math-source')).toBe('```math\nE = mc^2\n```');
    // 整段（含 ``` 行）被替换 ⇒ DOM 里不应再出现围栏行
    expect(view.dom.textContent).not.toContain('```math');

    view.dispatch({ selection: { anchor: doc.indexOf('E = mc^2') } });
    await sleep();
    expect(view.dom.querySelector('.mellow-math-widget.mellow-math-block')).toBeNull();
    expect(view.dom.textContent).toContain('```math');
  });
});
