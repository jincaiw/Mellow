/** Safe HTML live rendering（PRD §48）。 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT, WidgetType as WidgetTypeT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Decoration: view.Decoration, WidgetType: view.WidgetType, RangeSetBuilder: state.RangeSetBuilder };
}

export interface HtmlBlock {
  from: number;
  to: number;
  source: string;
}

const ALLOWED_TAGS = new Set(['A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DETAILS', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'SUB', 'SUMMARY', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL', 'VIDEO', 'AUDIO', 'SOURCE', 'IFRAME']);
const URL_ATTRS = new Set(['href', 'src', 'poster']);
const GLOBAL_ATTRS = new Set(['title', 'alt', 'width', 'height', 'controls', 'colspan', 'rowspan']);

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function sanitizeElement(element: Element): void {
  for (const child of Array.from(element.children)) sanitizeElement(child);
  if (!ALLOWED_TAGS.has(element.tagName)) {
    element.remove();
    return;
  }
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
      element.removeAttribute(attr.name);
      continue;
    }
    if (URL_ATTRS.has(name)) {
      if (!isSafeUrl(value)) element.removeAttribute(attr.name);
      continue;
    }
    if (element.tagName === 'IFRAME' && (name === 'allow' || name === 'sandbox' || name === 'referrerpolicy')) continue;
    if (!GLOBAL_ATTRS.has(name) && !name.startsWith('data-') && !name.startsWith('aria-')) element.removeAttribute(attr.name);
  }
  if (element.tagName === 'IFRAME') element.setAttribute('sandbox', '');
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(doc.body.children)) sanitizeElement(el);
  return doc.body.innerHTML;
}

export function renderSafeHtml(source: string): string {
  return `<div class="mellow-safe-html">${sanitizeHtml(source)}</div>`;
}

function fencedRanges(doc: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  const lines = doc.split('\n');
  let offset = 0;
  let start: number | null = null;
  let marker: string | null = null;
  for (const line of lines) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (m !== null) {
      if (start === null) { start = offset; marker = m[1][0]; }
      else if (marker === m[1][0]) { ranges.push({ from: start, to: offset + line.length }); start = null; marker = null; }
    }
    offset += line.length + 1;
  }
  if (start !== null) ranges.push({ from: start, to: doc.length });
  return ranges;
}

function inRanges(pos: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to);
}

export function extractHtmlBlocks(doc: string): HtmlBlock[] {
  const code = fencedRanges(doc);
  const blocks: HtmlBlock[] = [];
  const re = /^[ \t]*<([A-Za-z][A-Za-z0-9-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>|^[ \t]*<(hr|br|img)(?:\s[^>]*)?>/gim;
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    if (inRanges(m.index, code)) continue;
    blocks.push({ from: m.index, to: m.index + m[0].length, source: m[0] });
  }
  return blocks;
}

function inside(from: number, to: number, pos: number): boolean { return pos > from && pos < to; }

export function buildSafeHtmlExtension(autoInstallComposition = true): Extension {
  void autoInstallComposition;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

  class HtmlWidget extends WidgetType {
    constructor(readonly block: HtmlBlock) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof HtmlWidget && other.block.source === this.block.source; }
    toDOM(): HTMLElement {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderSafeHtml(this.block.source);
      return wrap.firstElementChild as HTMLElement;
    }
  }

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    for (const block of extractHtmlBlocks(doc)) {
      if (inside(block.from, block.to, head)) continue;
      builder.add(block.from, block.to, Decoration.replace({ widget: new HtmlWidget(block) }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class SafeHtmlPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = this.decorations.map(update.changes);
      if (isComposing()) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.mellow-safe-html': { display: 'inline-block' },
    '.mellow-safe-html iframe': { border: '0' },
  });
  return [plugin, theme];
}
