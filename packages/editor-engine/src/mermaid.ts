/**
 * Mermaid Live Rendering（PRD §43 / live-markdown-engine-spec §19）。
 *
 * - Mermaid 11.x compatible renderer contract
 * - lazy loading（只在可见 widget toDOM 后调用 loader）
 * - debounce + cancellation token（AbortController + generation token）
 * - viewport aware（仅可见范围生成 widget；jsdom 无 viewport 时 fallback 全文）
 * - error state / source reveal / copy source / export SVG
 *
 * 禁止 Mermaid render 阻塞 Editor Transaction：所有 render 都在 widget DOM 创建后的 timer/promise 中异步执行。
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT, WidgetType as WidgetTypeT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
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
    EditorView: view.EditorView,
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    keymap: view.keymap,
    RangeSetBuilder: state.RangeSetBuilder,
  };
}

export interface MermaidBlock {
  from: number;
  to: number;
  codeFrom: number;
  codeTo: number;
  source: string;
  code: string;
  diagramType: string;
}

export interface ViewportRange {
  from: number;
  to: number;
}

export interface MermaidRenderRequest {
  id: string;
  source: string;
  signal?: AbortSignal;
}

export interface MermaidRenderResult {
  svg: string;
}

export interface MermaidRenderer {
  render(request: MermaidRenderRequest): Promise<MermaidRenderResult>;
}

export interface Mermaid11Api {
  initialize?: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }> | { svg: string; bindFunctions?: (element: Element) => void };
}

export type MermaidLoader = () => Promise<Mermaid11Api> | Mermaid11Api;

export interface MermaidExtensionOptions {
  renderer?: MermaidRenderer;
  debounceMs?: number;
}

export type MermaidClipboardWriter = (type: string, value: string) => void;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

function diagramTypeOf(code: string): string {
  const first = code.split('\n').map((line) => line.trim()).find((line) => line !== '' && !line.startsWith('%%')) ?? '';
  const word = first.split(/\s+/)[0] ?? '';
  return word.replace(/:$/, '');
}

/** Parse fenced ```mermaid blocks. Keeps exact fenced source for copy source. */
export function parseMermaidBlocks(doc: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const lines = doc.split(/\n/);
  let offset = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(/^ {0,3}`{3,}\s*mermaid\s*$/i);
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (open === null) {
      offset = lineEnd + 1;
      i += 1;
      continue;
    }

    const codeFrom = lineEnd + 1;
    let j = i + 1;
    let closeEnd = doc.length;
    let codeTo = doc.length;
    let innerOffset = codeFrom;
    const codeLines: string[] = [];
    while (j < lines.length) {
      const closeLine = lines[j];
      const currentStart = innerOffset;
      const currentEnd = currentStart + closeLine.length;
      if (/^ {0,3}`{3,}\s*$/.test(closeLine)) {
        closeEnd = currentEnd;
        codeTo = currentStart > codeFrom ? currentStart - 1 : currentStart;
        break;
      }
      codeLines.push(closeLine);
      innerOffset = currentEnd + 1;
      j += 1;
    }

    const to = closeEnd;
    const code = doc.slice(codeFrom, codeTo);
    blocks.push({
      from: lineStart,
      to,
      codeFrom,
      codeTo,
      source: doc.slice(lineStart, to),
      code,
      diagramType: diagramTypeOf(code),
    });
    i = j + 1;
    offset = closeEnd + 1;
  }
  return blocks;
}

export function mermaidBlockIntersectsViewport(block: Pick<MermaidBlock, 'from' | 'to'>, ranges: ViewportRange[]): boolean {
  if (ranges.length === 0) return true;
  return ranges.some((range) => block.from < range.to && block.to > range.from);
}

function activeRanges(view: EditorView): ViewportRange[] {
  const ranges = view.visibleRanges.map((r) => ({ from: r.from, to: r.to }));
  return ranges.length === 0 ? [{ from: 0, to: view.state.doc.length }] : ranges;
}

function caretInside(block: MermaidBlock, head: number): boolean {
  return head > block.from && head < block.to;
}

function defaultMermaidLoader(): Promise<Mermaid11Api> | Mermaid11Api {
  const win = window as unknown as {
    mermaid?: Mermaid11Api;
    __MELLOW_MERMAID_LOADER__?: MermaidLoader;
  };
  if (win.mermaid !== undefined) return win.mermaid;
  if (win.__MELLOW_MERMAID_LOADER__ !== undefined) return win.__MELLOW_MERMAID_LOADER__();
  throw new Error('Mermaid 11 renderer is not available. Inject window.mermaid or __MELLOW_MERMAID_LOADER__.');
}

/** Mermaid 11 compatible renderer. Loader is lazy and cached. */
export function createMermaid11Renderer(loader: MermaidLoader = defaultMermaidLoader): MermaidRenderer {
  let apiPromise: Promise<Mermaid11Api> | null = null;
  const api = async (): Promise<Mermaid11Api> => {
    if (apiPromise === null) {
      apiPromise = Promise.resolve(loader()).then((m) => {
        m.initialize?.({ startOnLoad: false, securityLevel: 'strict' });
        return m;
      });
    }
    return apiPromise;
  };

  return {
    render: async ({ id, source, signal }) => {
      if (isAborted(signal)) throw new DOMException('aborted', 'AbortError');
      const mermaid = await api();
      if (isAborted(signal)) throw new DOMException('aborted', 'AbortError');
      const result = await mermaid.render(id, source);
      if (isAborted(signal)) throw new DOMException('aborted', 'AbortError');
      return { svg: result.svg };
    },
  };
}

export function renderMermaidError(source: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<div class="mellow-mermaid-error"><pre><code>${escapeHtml(source)}</code></pre><div class="mellow-mermaid-error-message">${escapeHtml(message)}</div></div>`;
}

export async function exportMermaidSvg(source: string, renderer: MermaidRenderer = createMermaid11Renderer()): Promise<string> {
  const controller = new AbortController();
  const result = await renderer.render({ id: `mellow-mermaid-export-${Date.now()}`, source, signal: controller.signal });
  return result.svg;
}

export function copyMermaidSourceAt(doc: string, position: number, writer?: MermaidClipboardWriter): string | null {
  const block = parseMermaidBlocks(doc).find((b) => position >= b.from && position <= b.to);
  if (block === undefined) return null;
  if (writer !== undefined) {
    writer('text/plain', block.source);
    writer('text/markdown', block.source);
    writer('text/x-mellow-mermaid-source', block.source);
  }
  return block.source;
}

function copyMermaidSourceCommand(view: EditorView): boolean {
  const source = copyMermaidSourceAt(view.state.doc.toString(), view.state.selection.main.head);
  if (source === null) return false;
  void navigator.clipboard?.writeText?.(source);
  return true;
}

interface RuntimeMermaidOptions {
  renderer: MermaidRenderer;
  debounceMs: number;
}

function runtimeOptions(options: MermaidExtensionOptions = {}): RuntimeMermaidOptions {
  return {
    renderer: options.renderer ?? createMermaid11Renderer(),
    debounceMs: options.debounceMs ?? 120,
  };
}

/** Build Mermaid live-render widgets. Rendering is always async, never inside editor transactions. */
export function buildMermaidExtension(autoInstallComposition = true, options: MermaidExtensionOptions = {}): Extension {
  void autoInstallComposition;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder, keymap } = cm;
  const runtime = runtimeOptions(options);
  let generation = 0;
  const controllers = new Map<string, AbortController>();

  const abortPending = (): void => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  };
  const currentGeneration = (): number => generation;

  class MermaidWidget extends WidgetType {
    constructor(readonly block: MermaidBlock, readonly widgetGeneration: number) { super(); }

    eq(other: WidgetTypeT): boolean {
      return other instanceof MermaidWidget
        && other.block.source === this.block.source
        && other.widgetGeneration === this.widgetGeneration;
    }

    toDOM(): HTMLElement {
      const outer = document.createElement('div');
      outer.className = 'mellow-mermaid-widget';
      outer.dataset.mellowMermaidSource = this.block.source;
      outer.textContent = this.block.code;
      const token = `${this.widgetGeneration}:${this.block.from}:${this.block.to}:${this.block.source}`;
      outer.dataset.mermaidToken = token;
      window.setTimeout(() => {
        if (this.widgetGeneration !== currentGeneration() || outer.dataset.mermaidToken !== token) return;
        const controller = new AbortController();
        controllers.set(token, controller);
        void runtime.renderer.render({
          id: `mellow-mermaid-${this.widgetGeneration}-${this.block.from}`,
          source: this.block.code,
          signal: controller.signal,
        }).then((result) => {
          controllers.delete(token);
          if (controller.signal.aborted || this.widgetGeneration !== currentGeneration() || outer.dataset.mermaidToken !== token) return;
          outer.innerHTML = result.svg;
          outer.dataset.mellowMermaidSvg = result.svg;
        }).catch((e) => {
          controllers.delete(token);
          if (controller.signal.aborted || this.widgetGeneration !== currentGeneration() || outer.dataset.mermaidToken !== token) return;
          outer.innerHTML = renderMermaidError(this.block.code, e);
          outer.setAttribute('data-render-error', e instanceof Error ? e.message : String(e));
        });
      }, runtime.debounceMs);
      return outer;
    }

    ignoreEvent(event: Event): boolean {
      if (event.type === 'copy') return false;
      return true;
    }
  }

  const addHiddenSourceMarks = (builder: import('@codemirror/state').RangeSetBuilder<DecorationT>, doc: string, block: MermaidBlock): void => {
    let pos = block.from;
    while (pos < block.to) {
      const lineEnd = doc.indexOf('\n', pos);
      const end = lineEnd === -1 || lineEnd > block.to ? block.to : lineEnd;
      if (end > pos) {
        builder.add(pos, end, Decoration.mark({ class: 'mellow-mermaid-source-hidden' }));
      }
      pos = end + 1;
    }
  };

  const buildDecorations = (view: EditorView): DecorationSet => {
    abortPending();
    generation += 1;
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    const ranges = activeRanges(view);
    for (const block of parseMermaidBlocks(doc)) {
      if (caretInside(block, head)) continue;
      if (!mermaidBlockIntersectsViewport(block, ranges)) continue;
      addHiddenSourceMarks(builder, doc, block);
      builder.add(block.to, block.to, Decoration.widget({ widget: new MermaidWidget(block, generation), side: 1 }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class MermaidPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
      if (isComposing()) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
    destroy(): void {
      abortPending();
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const shortcuts = keymap.of([
    { key: 'Mod-Shift-e', run: copyMermaidSourceCommand },
  ]);
  const theme = CmEditorView.theme({
    '.mellow-mermaid-source-hidden': {
      fontSize: '0',
      lineHeight: '0',
      color: 'transparent',
    },
    '.mellow-mermaid-widget': {
      display: 'block',
      margin: '0.75em 0',
    },
    '.mellow-mermaid-error': {
      color: '#b00020',
      border: '1px solid rgba(176, 0, 32, 0.25)',
      borderRadius: '4px',
      padding: '8px',
      whiteSpace: 'pre-wrap',
    },
  });
  return [plugin, shortcuts, theme];
}
