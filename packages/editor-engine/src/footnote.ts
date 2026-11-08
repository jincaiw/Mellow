/** Footnote live rendering（PRD §44）。 */

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

export interface FootnoteRef {
  id: string;
  from: number;
  to: number;
  source: string;
}

export interface FootnoteDefinition {
  id: string;
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  source: string;
  content: string;
}

export interface ParsedFootnotes {
  refs: FootnoteRef[];
  definitions: Map<string, FootnoteDefinition>;
}

function isEscaped(text: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) count += 1;
  return count % 2 === 1;
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
      if (start === null) {
        start = offset;
        marker = m[1][0];
      } else if (marker === m[1][0]) {
        ranges.push({ from: start, to: offset + line.length });
        start = null;
        marker = null;
      }
    }
    offset += line.length + 1;
  }
  if (start !== null) ranges.push({ from: start, to: doc.length });
  return ranges;
}

function inRanges(pos: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to);
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

export function parseFootnotes(doc: string): ParsedFootnotes {
  const code = fencedRanges(doc);
  const definitions = new Map<string, FootnoteDefinition>();
  const lines = doc.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^\[\^([^\]\n]+)\]:\s?(.*)$/);
    if (m !== null && !inRanges(offset, code)) {
      const id = m[1];
      const markerTo = offset + m[0].indexOf(':') + 1;
      const content: string[] = [m[2]];
      let end = offset + line.length;
      let j = i + 1;
      let nextOffset = end + 1;
      while (j < lines.length && /^( {4}|\t)/.test(lines[j])) {
        content.push(lines[j].replace(/^( {4}|\t)/, ''));
        end = nextOffset + lines[j].length;
        nextOffset = end + 1;
        j += 1;
      }
      definitions.set(id, { id, from: offset, to: end, markerFrom: offset, markerTo, source: doc.slice(offset, end), content: content.join('\n').trim() });
    }
    offset += line.length + 1;
  }

  const refs: FootnoteRef[] = [];
  const re = /\[\^([^\]\n]+)\]/g;
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    if (inRanges(m.index, code)) continue;
    const def = definitions.get(m[1]);
    if (def !== undefined && m.index === def.markerFrom) continue;
    if (isEscaped(doc, m.index)) continue;
    refs.push({ id: m[1], from: m.index, to: m.index + m[0].length, source: m[0] });
  }
  return { refs, definitions };
}

export function footnotePreviewText(parsed: ParsedFootnotes, id: string): string {
  const def = parsed.definitions.get(id);
  if (def === undefined) return `Missing footnote: ${id}`;
  return stripMarkdownInline(def.content).replace(/\s+/g, ' ').trim();
}

function inside(from: number, to: number, pos: number): boolean {
  return pos > from && pos < to;
}

export function buildFootnoteExtension(autoInstallComposition = true): Extension {
  void autoInstallComposition;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

  /**
   * 脚注引用胶囊的观感，逐字取自 Typora `base.css` 的 `sup.md-footnote`
   * （`padding:2px;padding-left:4px;padding-right:4px;background-color:rgba(238,238,238,.7);
   * color:#555;border-radius:4px`）。Typora 在暗色主题下同样用这组固定值（不随主题反转），
   * 这里如实复刻，保证编辑器与导出件观感一致。导出侧同值见
   * `packages/export/src/html/styles.ts` 的 `sup.footnote-ref`。
   */
  const refStyle = {
    padding: '2px 4px',
    borderRadius: '4px',
    backgroundColor: 'rgba(238, 238, 238, 0.7)',
    color: '#555',
  } as const;

  /**
   * 引用显示的是**序号**而非 `[^id]`：Typora 的引用 DOM 为
   * `<sup class='md-footnote'><a …>{C}</a></sup>`，`C = footnoteList.indexOf(name) + 1`
   * （首次出现顺序；重复引用同号）。此前 Mellow 显示 `[id]`，与 Typora 基线不一致。
   */
  class FootnoteRefWidget extends WidgetType {
    constructor(readonly ordinal: number, readonly title: string, readonly target: number) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof FootnoteRefWidget && other.ordinal === this.ordinal && other.title === this.title && other.target === this.target; }
    toDOM(view: EditorView): HTMLElement {
      const sup = document.createElement('sup');
      sup.className = 'mellow-footnote-ref';
      sup.textContent = String(this.ordinal);
      sup.title = this.title;
      sup.tabIndex = 0;
      sup.onclick = () => view.dispatch({ selection: { anchor: this.target }, scrollIntoView: true });
      return sup;
    }
    ignoreEvent(): boolean { return false; }
  }

  class FootnoteReturnWidget extends WidgetType {
    constructor(readonly target: number) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof FootnoteReturnWidget && other.target === this.target; }
    toDOM(view: EditorView): HTMLElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mellow-footnote-return';
      button.textContent = '↩';
      button.title = 'Return to footnote reference';
      button.onclick = () => view.dispatch({ selection: { anchor: this.target }, scrollIntoView: true });
      return button;
    }
    ignoreEvent(): boolean { return false; }
  }

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const parsed = parseFootnotes(doc);
    // 首次出现顺序 → 序号（Typora 的 footnoteList：重复引用同号）。
    const ordinals = new Map<string, number>();
    for (const ref of parsed.refs) if (!ordinals.has(ref.id)) ordinals.set(ref.id, ordinals.size + 1);
    const firstRefById = new Map<string, FootnoteRef>();
    for (const ref of parsed.refs) {
      if (!firstRefById.has(ref.id)) firstRefById.set(ref.id, ref);
      if (inside(ref.from, ref.to, pos)) continue;
      const def = parsed.definitions.get(ref.id);
      builder.add(ref.from, ref.to, Decoration.replace({ widget: new FootnoteRefWidget(ordinals.get(ref.id) as number, footnotePreviewText(parsed, ref.id), def?.from ?? ref.to) }));
    }
    for (const def of parsed.definitions.values()) {
      if (inside(def.from, def.to, pos)) continue;
      const ref = firstRefById.get(def.id);
      if (ref !== undefined) builder.add(def.from, def.from, Decoration.widget({ widget: new FootnoteReturnWidget(ref.from), side: -1 }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class FootnotePlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = this.decorations.map(update.changes);
      if (isComposing(update.view)) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.mellow-footnote-ref': { cursor: 'pointer', userSelect: 'none', ...refStyle },
    '.mellow-footnote-return': { marginRight: '0.35em', fontSize: '0.85em', cursor: 'pointer' },
  });
  return [plugin, theme];
}
