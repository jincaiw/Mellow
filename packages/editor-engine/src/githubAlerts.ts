/** GitHub Style Alerts（PRD §46）。 */

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

export type GitHubAlertKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
const KINDS = new Set<GitHubAlertKind>(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);

export interface GitHubAlertBlock {
  kind: GitHubAlertKind;
  content: string;
  from: number;
  to: number;
  source: string;
}

export interface GitHubAlertsOptions {
  enabled?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

export function parseGitHubAlerts(doc: string): GitHubAlertBlock[] {
  const code = fencedRanges(doc);
  const lines = doc.split('\n');
  const alerts: GitHubAlertBlock[] = [];
  let offset = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const start = offset;
    const m = line.match(/^>\s*\[!([A-Z]+)\]\s*$/);
    if (m === null || inRanges(start, code) || !KINDS.has(m[1] as GitHubAlertKind)) {
      offset += line.length + 1;
      i += 1;
      continue;
    }
    const kind = m[1] as GitHubAlertKind;
    const content: string[] = [];
    let end = offset + line.length;
    i += 1;
    offset = end + 1;
    while (i < lines.length && /^>/.test(lines[i])) {
      const text = lines[i].replace(/^>\s?/, '');
      content.push(text);
      end = offset + lines[i].length;
      offset = end + 1;
      i += 1;
    }
    alerts.push({ kind, content: content.join('\n').trim(), from: start, to: end, source: doc.slice(start, end) });
  }
  return alerts;
}

export function renderGitHubAlertHtml(alert: GitHubAlertBlock): string {
  return `<div class="mellow-alert mellow-alert-${alert.kind.toLowerCase()}"><div class="mellow-alert-title">${alert.kind}</div><div class="mellow-alert-content">${escapeHtml(alert.content).replace(/\n/g, '<br>')}</div></div>`;
}

function inside(from: number, to: number, pos: number): boolean {
  return pos > from && pos < to;
}

export function buildGitHubAlertsExtension(autoInstallComposition = true, options: GitHubAlertsOptions = {}): Extension {
  void autoInstallComposition;
  const enabled = options.enabled ?? true;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

  class AlertWidget extends WidgetType {
    constructor(readonly alert: GitHubAlertBlock) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof AlertWidget && other.alert.source === this.alert.source; }
    toDOM(): HTMLElement {
      const div = document.createElement('div');
      div.innerHTML = renderGitHubAlertHtml(this.alert);
      return div.firstElementChild as HTMLElement;
    }
  }

  const addHiddenMarks = (builder: import('@codemirror/state').RangeSetBuilder<DecorationT>, doc: string, from: number, to: number): void => {
    let pos = from;
    while (pos < to) {
      const nl = doc.indexOf('\n', pos);
      const end = nl === -1 || nl > to ? to : nl;
      if (end > pos) builder.add(pos, end, Decoration.mark({ class: 'mellow-alert-source-hidden' }));
      pos = end + 1;
    }
  };

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    if (!enabled) return builder.finish();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    for (const alert of parseGitHubAlerts(doc)) {
      if (inside(alert.from, alert.to, head)) continue;
      addHiddenMarks(builder, doc, alert.from, alert.to);
      builder.add(alert.to, alert.to, Decoration.widget({ widget: new AlertWidget(alert), side: 1 }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class AlertsPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = this.decorations.map(update.changes);
      if (isComposing(update.view)) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.mellow-alert-source-hidden': { fontSize: '0', lineHeight: '0', color: 'transparent' },
    '.mellow-alert': { display: 'block', borderLeft: '4px solid #888', padding: '0.5em 0.75em', margin: '0.75em 0', background: 'rgba(127,127,127,0.08)' },
    '.mellow-alert-title': { fontWeight: '700', marginBottom: '0.25em' },
    '.mellow-alert-note': { borderLeftColor: '#0969da' },
    '.mellow-alert-tip': { borderLeftColor: '#1a7f37' },
    '.mellow-alert-important': { borderLeftColor: '#8250df' },
    '.mellow-alert-warning': { borderLeftColor: '#9a6700' },
    '.mellow-alert-caution': { borderLeftColor: '#d1242f' },
  });
  return [plugin, theme];
}
