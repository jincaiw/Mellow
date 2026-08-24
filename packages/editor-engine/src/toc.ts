/** TOC live rendering（PRD §45）。 */

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

export interface TocItem {
  level: number;
  title: string;
  slug: string;
  from: number;
  to: number;
}

export interface TocMarker {
  from: number;
  to: number;
  source: '[TOC]';
}

export interface TocExportOptions {
  maxLevel?: number;
  className?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

export function slugifyHeading(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'heading';
}

export function parseTocMarkers(doc: string): TocMarker[] {
  const markers: TocMarker[] = [];
  const re = /^\[TOC\]$/gm;
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    markers.push({ from: m.index, to: m.index + m[0].length, source: '[TOC]' });
  }
  return markers;
}

export function tocItemsFromMarkdown(doc: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = doc.split('\n');
  let offset = 0;
  let fence: string | null = null;
  let yaml = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      offset = lineEnd + 1;
      continue;
    }
    if (fence !== null) {
      offset = lineEnd + 1;
      continue;
    }
    if (/^---\s*$/.test(line)) {
      yaml = !yaml;
      offset = lineEnd + 1;
      continue;
    }
    if (yaml) {
      offset = lineEnd + 1;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h !== null) {
      const title = stripInlineMarkdown(h[2]);
      items.push({ level: h[1].length, title, slug: slugifyHeading(title), from: lineStart, to: lineEnd });
    }
    offset = lineEnd + 1;
  }
  return items;
}

export function exportTocHtml(items: TocItem[], options: TocExportOptions = {}): string {
  const maxLevel = options.maxLevel ?? 6;
  const className = options.className ?? 'mellow-toc';
  const filtered = items.filter((item) => item.level <= maxLevel);
  const lines = filtered.map((item) => `<li class="mellow-toc-level-${item.level}"><a href="#${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a></li>`).join('');
  return `<nav class="${escapeHtml(className)}"><ul>${lines}</ul></nav>`;
}

function inside(from: number, to: number, pos: number): boolean {
  return pos > from && pos < to;
}

export function buildTocExtension(autoInstallComposition = true): Extension {
  void autoInstallComposition;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

  class TocWidget extends WidgetType {
    constructor(readonly items: TocItem[]) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof TocWidget && JSON.stringify(other.items) === JSON.stringify(this.items); }
    toDOM(view: EditorView): HTMLElement {
      const wrap = document.createElement('nav');
      wrap.className = 'mellow-toc';
      const ul = document.createElement('ul');
      for (const item of this.items) {
        const li = document.createElement('li');
        li.className = `mellow-toc-level-${item.level}`;
        const a = document.createElement('a');
        a.href = `#${item.slug}`;
        a.textContent = item.title;
        a.onclick = (event) => {
          event.preventDefault();
          view.dispatch({ selection: { anchor: item.from }, scrollIntoView: true });
        };
        li.appendChild(a);
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
      return wrap;
    }
    ignoreEvent(): boolean { return false; }
  }

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const items = tocItemsFromMarkdown(doc);
    for (const marker of parseTocMarkers(doc)) {
      if (inside(marker.from, marker.to, pos)) continue;
      builder.add(marker.from, marker.to, Decoration.replace({ widget: new TocWidget(items) }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class TocPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = this.decorations.map(update.changes);
      if (isComposing(update.view)) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.mellow-toc': { display: 'block', padding: '0.5em 0' },
    '.mellow-toc ul': { listStyle: 'none', margin: '0', padding: '0' },
    '.mellow-toc li': { margin: '0.15em 0' },
    '.mellow-toc-level-2': { paddingLeft: '1em' },
    '.mellow-toc-level-3': { paddingLeft: '2em' },
    '.mellow-toc-level-4': { paddingLeft: '3em' },
    '.mellow-toc-level-5': { paddingLeft: '4em' },
    '.mellow-toc-level-6': { paddingLeft: '5em' },
  });
  return [plugin, theme];
}
