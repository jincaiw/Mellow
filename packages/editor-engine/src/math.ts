/**
 * Math（PRD §42 / ADR-0010）。
 *
 * 目标不是「某个 renderer 能显示」，而是 Typora 文档兼容优先：
 * - 支持 `$...$` / `\(...\)` / `$$...$$` / `\[...\]`
 * - macro / mhchem / error / copy source
 * - MathJax-compatible path 为默认路径；KaTeX fast path 只能用于明确支持的简单语法，unsupported syntax 必须 fallback
 * - widget heavy render 通过 debounce + generation token 异步调度，不阻塞 typing
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT, WidgetType as WidgetTypeT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';
import { largeFileVersion, largeFileViewportRange } from './largeFile';

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  keymap: typeof import('@codemirror/view').keymap;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return {
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    keymap: view.keymap,
    RangeSetBuilder: state.RangeSetBuilder,
  };
}

export type MathSpanKind = 'inline' | 'block';
export type MathDelimiter = '$' | '$$' | '\\(' | '\\)' | '\\[' | '\\]';
export type RendererPath = 'mathjax-compatible' | 'katex-fast';
export type MathErrorCode = 'unclosed-delimiter' | 'unbalanced-braces';

export interface MathError {
  code: MathErrorCode;
  message: string;
}

export interface MathSpan {
  kind: MathSpanKind;
  from: number;
  to: number;
  texFrom: number;
  texTo: number;
  source: string;
  tex: string;
  open: '$' | '$$' | '\\(' | '\\[';
  close: '$' | '$$' | '\\)' | '\\]';
  error?: MathError;
}

export interface MathRenderRequest {
  tex: string;
  displayMode: boolean;
  macros?: Record<string, string>;
  fastPath?: boolean;
}

export interface MathRenderResult {
  html: string;
  error?: MathError;
  renderer?: RendererPath;
}

export interface MathRenderer {
  render(request: MathRenderRequest): Promise<MathRenderResult>;
}

export interface MathExtensionOptions {
  renderer?: MathRenderer;
  debounceMs?: number;
  fastPath?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isEscaped(text: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function lineBounds(doc: string, pos: number): { from: number; to: number; text: string } {
  const from = doc.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const next = doc.indexOf('\n', pos);
  const to = next === -1 ? doc.length : next;
  return { from, to, text: doc.slice(from, to) };
}

function isInsideFencedCode(doc: string, position: number): boolean {
  let fence: '`' | '~' | null = null;
  const prefix = doc.slice(0, position).split('\n');
  for (const line of prefix) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (match === null) continue;
    const marker = match[1][0] as '`' | '~';
    if (fence === null) fence = marker;
    else if (fence === marker) fence = null;
  }
  return fence !== null;
}

function isIndentedCodeLine(doc: string, position: number): boolean {
  return /^( {4}|\t)/.test(lineBounds(doc, position).text);
}

function isCodeContext(doc: string, position: number): boolean {
  return isInsideFencedCode(doc, position) || isIndentedCodeLine(doc, position);
}

function braceError(tex: string): MathError | undefined {
  let depth = 0;
  for (let i = 0; i < tex.length; i += 1) {
    const ch = tex[i];
    if (isEscaped(tex, i)) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0) {
      return { code: 'unbalanced-braces', message: 'Math braces are unbalanced' };
    }
  }
  return depth === 0 ? undefined : { code: 'unbalanced-braces', message: 'Math braces are unbalanced' };
}

function closeError(open: string): MathError {
  return { code: 'unclosed-delimiter', message: `Missing closing delimiter for ${open}` };
}

function span(doc: string, from: number, to: number, texFrom: number, texTo: number, open: MathSpan['open'], close: MathSpan['close'], kind: MathSpanKind, error?: MathError): MathSpan {
  const tex = doc.slice(texFrom, texTo).trim();
  return {
    kind,
    from,
    to,
    texFrom,
    texTo,
    source: doc.slice(from, to),
    tex,
    open,
    close,
    error: error ?? braceError(tex),
  };
}

/** Parse Typora-compatible math delimiters from Markdown source.
 *  from/to 可选：只扫描 [from, to) 区间（Large File Mode 视口裁剪，PRD §109）。
 *  code-context 判定始终基于全文档（fence 状态不受裁剪影响）。 */
export function parseMathSpans(doc: string, from = 0, to = doc.length): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = from;
  const scanEnd = Math.min(to, doc.length);
  while (i < scanEnd) {
    if (isCodeContext(doc, i)) {
      const next = doc.indexOf('\n', i);
      i = next === -1 ? doc.length : next + 1;
      continue;
    }

    if (doc.startsWith('$$', i) && !isEscaped(doc, i)) {
      const line = lineBounds(doc, i);
      if (line.text.slice(0, i - line.from).trim() === '') {
        const start = i + 2;
        const close = doc.indexOf('$$', start);
        if (close === -1) {
          spans.push(span(doc, i, doc.length, start, doc.length, '$$', '$$', 'block', closeError('$$')));
          break;
        }
        spans.push(span(doc, i, close + 2, start, close, '$$', '$$', 'block'));
        i = close + 2;
        continue;
      }
    }

    if (doc.startsWith('\\[', i) && !isEscaped(doc, i)) {
      const start = i + 2;
      const close = doc.indexOf('\\]', start);
      if (close === -1) {
        spans.push(span(doc, i, doc.length, start, doc.length, '\\[', '\\]', 'block', closeError('\\[')));
        break;
      }
      spans.push(span(doc, i, close + 2, start, close, '\\[', '\\]', 'block'));
      i = close + 2;
      continue;
    }

    if (doc.startsWith('\\(', i) && !isEscaped(doc, i)) {
      const start = i + 2;
      const close = doc.indexOf('\\)', start);
      if (close !== -1) {
        spans.push(span(doc, i, close + 2, start, close, '\\(', '\\)', 'inline'));
        i = close + 2;
        continue;
      }
    }

    if (doc[i] === '$' && doc[i + 1] !== '$' && !isEscaped(doc, i)) {
      const start = i + 1;
      let close = start;
      while (close < doc.length) {
        if (doc[close] === '\n') break;
        if (doc[close] === '$' && doc[close + 1] !== '$' && !isEscaped(doc, close)) break;
        close += 1;
      }
      if (close < doc.length && doc[close] === '$' && close > start) {
        spans.push(span(doc, i, close + 1, start, close, '$', '$', 'inline'));
        i = close + 1;
        continue;
      }
    }

    i += 1;
  }
  return spans;
}

export function extractMathMacros(tex: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const re = /\\(?:renewcommand|newcommand)\s*\{\\([A-Za-z]+)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  for (let match = re.exec(tex); match !== null; match = re.exec(tex)) {
    macros[match[1]] = match[2];
  }
  return macros;
}

export function collectDocumentMathMacros(doc: string): Record<string, string> {
  const macros: Record<string, string> = {};
  for (const s of parseMathSpans(doc)) {
    Object.assign(macros, extractMathMacros(s.tex));
  }
  return macros;
}

function applyMacros(tex: string, macros: Record<string, string> | undefined): string {
  if (macros === undefined) return tex;
  let out = tex;
  for (const [name, value] of Object.entries(macros)) {
    out = out.replace(new RegExp(`\\\\${name}(?![A-Za-z])`, 'g'), value);
  }
  return out;
}

const unsupportedKatexPatterns = [
  /\\(?:ce|pu)\b/,
  /\\require\b/,
  /\\(?:newcommand|renewcommand|def)\b/,
  /\\begin\{(?:CD|xymatrix|alignat|multline|split)\}/,
];

export function rendererPathFor(tex: string, options: { fastPath?: boolean } = {}): RendererPath {
  if (options.fastPath !== true) return 'mathjax-compatible';
  return unsupportedKatexPatterns.some((re) => re.test(tex)) ? 'mathjax-compatible' : 'katex-fast';
}

export function renderMathSource(tex: string, request: Partial<Omit<MathRenderRequest, 'tex'>> = {}): MathRenderResult {
  const displayMode = request.displayMode ?? false;
  const expanded = applyMacros(tex, request.macros);
  const error = braceError(expanded);
  const displayClass = displayMode ? 'mellow-math-block-rendered' : 'mellow-math-inline-rendered';
  if (error !== undefined) {
    return {
      error,
      renderer: 'mathjax-compatible',
      html: `<span class="mellow-math-error" data-error-code="${error.code}"><code>${escapeHtml(tex)}</code><span class="mellow-math-error-message">${escapeHtml(error.message)}</span></span>`,
    };
  }
  const renderer = rendererPathFor(expanded, { fastPath: request.fastPath });
  return {
    renderer,
    html: `<span class="mellow-math-rendered ${displayClass}" data-renderer="${renderer}" data-mellow-math-source="${escapeHtml(tex)}">${escapeHtml(expanded)}</span>`,
  };
}

export function createMathJaxCompatibleRenderer(): MathRenderer {
  return {
    render: async (request) => {
      const mathJax = (window as unknown as {
        MathJax?: {
          tex2chtmlPromise?: (tex: string, options?: { display?: boolean }) => Promise<HTMLElement>;
          tex2svgPromise?: (tex: string, options?: { display?: boolean }) => Promise<HTMLElement>;
        };
      }).MathJax;
      const tex = applyMacros(request.tex, request.macros);
      if (mathJax?.tex2chtmlPromise !== undefined) {
        const node = await mathJax.tex2chtmlPromise(tex, { display: request.displayMode });
        return { html: node.outerHTML, renderer: 'mathjax-compatible' };
      }
      if (mathJax?.tex2svgPromise !== undefined) {
        const node = await mathJax.tex2svgPromise(tex, { display: request.displayMode });
        return { html: node.outerHTML, renderer: 'mathjax-compatible' };
      }
      return renderMathSource(request.tex, request);
    },
  };
}

export type ClipboardWriter = (type: string, value: string) => void;

export function copyMathSourceAt(doc: string, position: number, writer?: ClipboardWriter): string | null {
  const found = parseMathSpans(doc).find((s) => position >= s.from && position <= s.to);
  if (found === undefined) return null;
  if (writer !== undefined) {
    writer('text/plain', found.source);
    writer('text/markdown', found.source);
    writer('text/x-mellow-math-source', found.source);
  }
  return found.source;
}

interface RuntimeMathOptions extends Required<Pick<MathExtensionOptions, 'debounceMs' | 'fastPath'>> {
  renderer: MathRenderer;
}

function defaultOptions(options: MathExtensionOptions = {}): RuntimeMathOptions {
  return {
    renderer: options.renderer ?? createMathJaxCompatibleRenderer(),
    debounceMs: options.debounceMs ?? 0,
    fastPath: options.fastPath ?? false,
  };
}

function caretInside(span: MathSpan, head: number): boolean {
  return head > span.from && head < span.to;
}

function copyMathSourceCommand(view: EditorView): boolean {
  const source = copyMathSourceAt(view.state.doc.toString(), view.state.selection.main.head);
  if (source === null) return false;
  void navigator.clipboard?.writeText?.(source);
  return true;
}

/** Build lazy math widgets. Tests can inject a renderer to assert debounce/cancellation behavior. */
export function buildMathExtension(autoInstallComposition = true, options: MathExtensionOptions = {}): Extension {
  // autoInstallComposition 参数保留给 install() 调用形状；composition tracking 由 index.ts 统一安装。
  void autoInstallComposition;
  const cm = resolveCm();
  const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, keymap } = cm;
  const runtime = defaultOptions(options);
  let generation = 0;
  const currentGeneration = (): number => generation;

  class MathWidget extends WidgetType {
    constructor(
      readonly spanInfo: MathSpan,
      readonly macros: Record<string, string>,
      readonly widgetGeneration: number,
    ) { super(); }

    eq(other: WidgetTypeT): boolean {
      return other instanceof MathWidget
        && other.spanInfo.source === this.spanInfo.source
        && other.widgetGeneration === this.widgetGeneration;
    }

    toDOM(): HTMLElement {
      const outer = document.createElement(this.spanInfo.kind === 'block' ? 'div' : 'span');
      outer.className = `mellow-math-widget mellow-math-${this.spanInfo.kind}`;
      outer.dataset.mellowMathSource = this.spanInfo.source;
      outer.textContent = this.spanInfo.tex;
      const token = `${this.widgetGeneration}:${this.spanInfo.from}:${this.spanInfo.to}:${this.spanInfo.source}`;
      outer.dataset.mathToken = token;
      window.setTimeout(() => {
        if (this.widgetGeneration !== currentGeneration() || outer.dataset.mathToken !== token) return;
        void runtime.renderer.render({
          tex: this.spanInfo.tex,
          displayMode: this.spanInfo.kind === 'block',
          macros: this.macros,
          fastPath: runtime.fastPath,
        }).then((result) => {
          if (this.widgetGeneration !== currentGeneration() || outer.dataset.mathToken !== token) return;
          outer.innerHTML = result.html;
        }).catch((e) => {
          if (this.widgetGeneration !== currentGeneration() || outer.dataset.mathToken !== token) return;
          outer.innerHTML = renderMathSource(this.spanInfo.tex, { displayMode: this.spanInfo.kind === 'block' }).html;
          outer.setAttribute('data-render-error', String(e));
        });
      }, runtime.debounceMs);
      return outer;
    }

    ignoreEvent(event: Event): boolean {
      if (event.type === 'copy') return false;
      return true;
    }
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    generation += 1;
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    const macros = collectDocumentMathMacros(doc);
    // Large File Mode：只解析视口 ± 余量（PRD §109 pause offscreen Math）
    const { from, to } = largeFileViewportRange(view);
    for (const s of parseMathSpans(doc, from, to)) {
      if (caretInside(s, head)) continue;
      builder.add(s.from, s.to, Decoration.replace({ widget: new MathWidget(s, macros, generation), block: s.kind === 'block' }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class MathPlugin {
    decorations: DecorationSet;
    private largeVersion = largeFileVersion();
    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
      if (isComposing()) return;
      // Large File Mode 切换（setLargeFileMode → 空 dispatch）也触发重算
      const largeChanged = largeFileVersion() !== this.largeVersion;
      if (largeChanged) this.largeVersion = largeFileVersion();
      if (update.docChanged || update.selectionSet || update.viewportChanged || largeChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const shortcuts = keymap.of([
    { key: 'Mod-Shift-m', run: copyMathSourceCommand },
  ]);

  const theme = Decoration.none;
  void theme;
  return [plugin, shortcuts];
}
