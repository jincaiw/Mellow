import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { buildMathExtension, copyMathSourceAt, extractMathMacros, parseMathSpans, renderMathSource, rendererPathFor } from '../src/math';
import { selectRange, setUpEditor, sleep } from './harness';

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
    await sleep(60);
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
});
