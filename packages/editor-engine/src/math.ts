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
import type { Extension, EditorState, StateField as StateFieldT } from '@codemirror/state';
import { isComposing } from './composition';
import { largeFileVersion, largeFileViewportRange } from './largeFile';

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  keymap: typeof import('@codemirror/view').keymap;
  EditorView: typeof import('@codemirror/view').EditorView;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  StateField: typeof import('@codemirror/state').StateField;
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
    EditorView: view.EditorView,
    RangeSetBuilder: state.RangeSetBuilder,
    StateField: state.StateField,
  };
}

export type MathSpanKind = 'inline' | 'block';
export type MathDelimiter = '$' | '$$' | '\\(' | '\\)' | '\\[' | '\\]' | '```' | '~~~';
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
  open: '$' | '$$' | '\\(' | '\\[' | '```' | '~~~';
  close: '$' | '$$' | '\\)' | '\\]' | '```' | '~~~';
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

/** 行首 fence 标记（≤3 空格缩进 + ```/~~~，与 CommonMark fence 规则一致） */
const FENCE_MARKER_RE = /^ {0,3}(`{3,}|~{3,})/;
/** 缩进代码行（4 空格 / Tab） */
const INDENTED_CODE_RE = /^( {4}|\t)/;

/**
 * Typora `gitlabMath`（**默认开启**）认可的「数学围栏语言」—— 唯一真源。
 *
 * **一手证据（本机 Typora 1.14.9 build 7785，`TypeMark/appsrc/main.js`）**：
 * ```
 * D.isMathType = function (e) {
 *   return File.option.gitlabMath && 'string' == typeof e && a.isType((e || '').toLowerCase(), 'math')
 * }
 * ```
 * 其中 `a` 是模块 `1b` 里的 `o.Node`（`o = e('11')`），而 `Node.isType` 是**通用相等比较**
 * （`var t = e.attributes ? e.attributes.type : e; … if (t == arguments[n]) return true`），
 * 且第二个实参是**字符串字面量 `"math"`** ⇒ 该判定**等价于** `lang.toLowerCase() === 'math'`。
 *
 * ⚠️ **不是**「一组 TeX 方言」。`main.js` 里另有 `case"stex":case"tex":case"latex":case"math":
 * return "text/x-stex"` —— 那是 **CodeMirror 语法高亮模式**的别名表（`latex`/`tex` 围栏在 Typora
 * 里是**按 TeX 高亮的代码块**，**不是**公式块）。
 *
 * 历史上 `contextMenu.ts` 自己维护过一份更宽的集合（`math|latex|tex|katex|texmath`），
 * 于是出现「右键菜单说它是数学块、渲染器说它是代码块」的自相矛盾 —— 现已收敛到本常量。
 */
export const MATH_FENCE_LANGS: ReadonlySet<string> = new Set(['math']);

/** `info`（围栏信息串）是否为数学围栏。大小写不敏感，与 Typora 的 `.toLowerCase()` 一致。 */
export function isMathFenceLang(info: string): boolean {
  return MATH_FENCE_LANGS.has(info.trim().toLowerCase());
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

/**
 * 从数学围栏的**开栏行**起找闭合行（同 marker、≥3 个、行首 ≤3 空格、只允许尾随空白）。
 * 未闭合时按本文件既有规则**延伸到文末**（与 `$$` 未闭合的处置一致）。
 */
function readFenceMathBlock(doc: string, openFrom: number, openTo: number, marker: '`' | '~') {
  const closeRe = new RegExp(`^ {0,3}${marker === '`' ? '`{3,}' : '~{3,}'}[ \\t]*$`);
  let cursor = openTo + 1;
  while (cursor <= doc.length) {
    const nl = doc.indexOf('\n', cursor);
    const lineTo = nl === -1 ? doc.length : nl;
    if (closeRe.test(doc.slice(cursor, lineTo))) {
      // texTo 取闭合行起点 ⇒ 尾部那个换行由 span() 的 trim 去掉
      return { from: openFrom, to: lineTo, texFrom: openTo + 1, texTo: cursor, after: lineTo + 1, unclosed: false };
    }
    if (nl === -1) break;
    cursor = nl + 1;
  }
  return { from: openFrom, to: doc.length, texFrom: openTo + 1, texTo: doc.length, after: doc.length + 1, unclosed: true };
}

/** Parse Typora-compatible math delimiters from Markdown source.
 *  from/to 可选：只扫描 [from, to) 区间（Large File Mode 视口裁剪，PRD §109）。
 *  code-context 判定始终基于全文档（fence 状态不受裁剪影响）。
 *
 *  实现为单遍行级扫描（fence 状态增量维护），整体 O(n)。
 *  2026-08-19 修复：原实现逐字符调用 isInsideFencedCode（每次从头重扫全部前缀行）
 *  为 O(n²)——128KB 文档即同步阻塞主线程 ~13s，10MB 打开白屏（Golden Journey j17）。 */
export function parseMathSpans(doc: string, from = 0, to = doc.length): MathSpan[] {
  const spans: MathSpan[] = [];
  const scanEnd = Math.min(to, doc.length);
  const scanFrom = Math.max(0, from);
  let fence: '`' | '~' | null = null;
  let lineFrom = 0;
  while (lineFrom < scanEnd) {
    const nl = doc.indexOf('\n', lineFrom);
    const lineTo = nl === -1 ? doc.length : nl;
    const lineText = doc.slice(lineFrom, lineTo);

    // fence 开/闭行：整行跳过并维护状态（与原 prefix 扫描同规则）
    const fenceMatch = lineText.match(FENCE_MARKER_RE);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (fence === null) {
        // Typora `gitlabMath`（默认开）：信息串恰为 `math` 的围栏是**块级数学** ——
        // 整段（含开/闭栏行）作为一个 block span，由 blockField 渲染成公式；
        // 光标进入时 caretInside 会跳过 ⇒ 显示源码（与 `$$` 块同一套语义）。
        const info = lineText.slice(fenceMatch[0].length).trim();
        if (isMathFenceLang(info)) {
          const block = readFenceMathBlock(doc, lineFrom, lineTo, marker);
          const fenceDelim = marker === '`' ? '```' : '~~~';
          spans.push(span(doc, block.from, block.to, block.texFrom, block.texTo, fenceDelim, fenceDelim, 'block'));
          if (block.unclosed) return spans;
          lineFrom = block.after;
          continue;
        }
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      lineFrom = lineTo + 1;
      continue;
    }
    // fence 内 / 缩进代码行：不解析 math
    if (fence !== null || INDENTED_CODE_RE.test(lineText)) {
      lineFrom = lineTo + 1;
      continue;
    }

    // 普通行：扫描 [max(lineFrom, scanFrom), min(lineTo, scanEnd))
    let p = lineFrom < scanFrom ? scanFrom : lineFrom;
    const lineScanEnd = Math.min(lineTo, scanEnd);
    while (p < lineScanEnd) {
      if (doc.startsWith('$$', p) && !isEscaped(doc, p) && doc.slice(lineFrom, p).trim() === '') {
        const start = p + 2;
        const close = doc.indexOf('$$', start);
        if (close === -1) {
          spans.push(span(doc, p, doc.length, start, doc.length, '$$', '$$', 'block', closeError('$$')));
          return spans;
        }
        spans.push(span(doc, p, close + 2, start, close, '$$', '$$', 'block'));
        p = close + 2;
        continue;
      }

      if (doc.startsWith('\\[', p) && !isEscaped(doc, p)) {
        const start = p + 2;
        const close = doc.indexOf('\\]', start);
        if (close === -1) {
          spans.push(span(doc, p, doc.length, start, doc.length, '\\[', '\\]', 'block', closeError('\\[')));
          return spans;
        }
        spans.push(span(doc, p, close + 2, start, close, '\\[', '\\]', 'block'));
        p = close + 2;
        continue;
      }

      if (doc.startsWith('\\(', p) && !isEscaped(doc, p)) {
        const start = p + 2;
        const close = doc.indexOf('\\)', start);
        if (close !== -1) {
          spans.push(span(doc, p, close + 2, start, close, '\\(', '\\)', 'inline'));
          p = close + 2;
          continue;
        }
      }

      if (doc[p] === '$' && doc[p + 1] !== '$' && !isEscaped(doc, p)) {
        const start = p + 1;
        let close = start;
        while (close < doc.length) {
          if (doc[close] === '\n') break;
          if (doc[close] === '$' && doc[close + 1] !== '$' && !isEscaped(doc, close)) break;
          close += 1;
        }
        if (close < doc.length && doc[close] === '$' && close > start) {
          spans.push(span(doc, p, close + 1, start, close, '$', '$', 'inline'));
          p = close + 1;
          continue;
        }
      }

      p += 1;
    }

    // p 可能越过本行（$$ / \[ / \( 跨行闭合）→ 从 p 恢复行级扫描；否则下一行
    lineFrom = p > lineTo ? p : lineTo + 1;
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
  // 快速路径：无宏定义关键字则跳过全文档解析（大文件下每次 build 的全文扫描）
  if (!doc.includes('\\newcommand') && !doc.includes('\\renewcommand')) return {};
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
      // R3-2 宿主 KaTeX 通道（含 mhchem \ce/\pu）：宿主向 iframe window 注入
      // __MELLOW_KATEX_RENDER__（异步 renderToString 封装，首次调用触发按需加载）；
      // 返回 null / reject = 渲染失败，回退源码显示。
      const katexRender = (window as unknown as {
        __MELLOW_KATEX_RENDER__?: (tex: string, display: boolean) => Promise<string | null>;
      }).__MELLOW_KATEX_RENDER__;
      if (katexRender !== undefined) {
        const html = await katexRender(tex, request.displayMode);
        if (html !== null) return { html, renderer: 'mathjax-compatible' };
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

  // P1 修复（CM6 合规）：block decoration 禁止由 ViewPlugin 提供（RangeError: Block
  // decorations may not be specified via plugins），必须来自 StateField。此处把 block
  // span（$$…$$ / \[…\]）拆到独立 StateField，inline span 留在 ViewPlugin（point
  // decoration 不受限）。field 无法读取 viewport，故按全文档解析 block span——block
  // 数学块在文档中极稀疏，O(n) 单遍扫描可接受（e0f4df2 已将解析优化为线性）。
  const buildBlockDecorations = (state: EditorState): DecorationSet => {
    generation += 1;
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = state.doc.toString();
    const head = state.selection.main.head;
    const macros = collectDocumentMathMacros(doc);
    for (const s of parseMathSpans(doc)) {
      if (s.kind !== 'block') continue;
      if (caretInside(s, head)) continue;
      builder.add(s.from, s.to, Decoration.replace({ widget: new MathWidget(s, macros, generation), block: true }));
    }
    return builder.finish();
  };

  const blockField: StateFieldT<DecorationSet> = cm.StateField.define<DecorationSet>({
    create: (state) => buildBlockDecorations(state),
    update: (value, tr) => {
      // caretInside 依赖选区（光标进入块内 → 显示源码），doc / selection 变化都重建
      if (tr.docChanged || tr.selection) return buildBlockDecorations(tr.state);
      return value;
    },
    provide: (field) => cm.EditorView.decorations.compute([field], (state) => state.field(field)),
  });

  const buildDecorations = (view: EditorView): DecorationSet => {
    generation += 1;
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    const macros = collectDocumentMathMacros(doc);
    // Large File Mode：只解析视口 ± 余量（PRD §109 pause offscreen Math）
    const { from, to } = largeFileViewportRange(view);
    for (const s of parseMathSpans(doc, from, to)) {
      if (s.kind === 'block') continue; // block span 由 blockField 提供
      if (caretInside(s, head)) continue;
      builder.add(s.from, s.to, Decoration.replace({ widget: new MathWidget(s, macros, generation) }));
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
      if (isComposing(update.view)) return;
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
  return [plugin, blockField, shortcuts];
}
