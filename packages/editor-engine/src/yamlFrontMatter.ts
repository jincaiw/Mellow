/** YAML Front Matter live block（PRD §47）。GUI Properties 属 P1，本模块不做。 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT, WidgetType as WidgetTypeT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  StateField: typeof import('@codemirror/state').StateField;
  StateEffect: typeof import('@codemirror/state').StateEffect;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Decoration: view.Decoration, WidgetType: view.WidgetType, RangeSetBuilder: state.RangeSetBuilder, StateField: state.StateField, StateEffect: state.StateEffect };
}

export interface YamlFrontMatter {
  from: number;
  to: number;
  yamlFrom: number;
  yamlTo: number;
  source: string;
  yaml: string;
}

export interface YamlValidationResult {
  ok: boolean;
  message?: string;
}

export interface YamlFrontMatterOptions {
  fold?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseYamlFrontMatter(doc: string): YamlFrontMatter | null {
  if (!doc.startsWith('---\n')) return null;
  const close = doc.indexOf('\n---', 4);
  if (close === -1) return null;
  const closeLineEnd = doc.indexOf('\n', close + 1);
  const to = closeLineEnd === -1 ? doc.length : closeLineEnd;
  return { from: 0, to, yamlFrom: 4, yamlTo: close, source: doc.slice(0, to), yaml: doc.slice(4, close) };
}

export function validateFrontMatterYaml(yaml: string): YamlValidationResult {
  const keys = new Set<string>();
  const lines = yaml.split('\n');
  let parentKey: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (/^\s+-\s+/.test(line)) {
      if (parentKey === null) return { ok: false, message: `Line ${i + 1}: list item without parent key` };
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/);
    if (m === null) return { ok: false, message: `Line ${i + 1}: expected key: value` };
    if (keys.has(m[1])) return { ok: false, message: `Line ${i + 1}: duplicate key "${m[1]}"` };
    keys.add(m[1]);
    parentKey = m[2] === undefined ? m[1] : null;
  }
  return { ok: true };
}

export function renderYamlFrontMatterHtml(fm: YamlFrontMatter): string {
  const validation = validateFrontMatterYaml(fm.yaml);
  const valid = validation.ok ? 'true' : 'false';
  const error = validation.ok ? '' : `<div class="mellow-yaml-error">${escapeHtml(validation.message ?? 'Invalid YAML')}</div>`;
  return `<section class="mellow-yaml-front-matter" data-valid="${valid}"><div class="mellow-yaml-title">YAML Front Matter</div>${error}<pre><code>${escapeHtml(fm.yaml)}</code></pre></section>`;
}

function inside(from: number, to: number, pos: number): boolean {
  return pos > from && pos < to;
}

export function buildYamlFrontMatterExtension(autoInstallComposition = true, options: YamlFrontMatterOptions = {}): Extension {
  void autoInstallComposition;
  const fold = options.fold ?? true;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

  class YamlWidget extends WidgetType {
    constructor(readonly fm: YamlFrontMatter) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof YamlWidget && other.fm.source === this.fm.source; }
    toDOM(): HTMLElement {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderYamlFrontMatterHtml(this.fm);
      return wrap.firstElementChild as HTMLElement;
    }
  }

  /** 「展开卡片」折叠按钮（默认灰色源码旁） */
  class YamlFoldButtonWidget extends WidgetType {
    constructor(private readonly onOpen: () => void) { super(); }
    eq(other: WidgetTypeT): boolean { return other instanceof YamlFoldButtonWidget; }
    toDOM(): HTMLElement {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mellow-yaml-fold-button';
      btn.textContent = '▸ YAML 元数据卡片';
      btn.title = '展开为卡片视图';
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onOpen();
      });
      return btn;
    }
  }

  const addHidden = (builder: import('@codemirror/state').RangeSetBuilder<DecorationT>, doc: string, from: number, to: number): void => {
    let pos = from;
    while (pos < to) {
      const nl = doc.indexOf('\n', pos);
      const end = nl === -1 || nl > to ? to : nl;
      if (end > pos) builder.add(pos, end, Decoration.mark({ class: 'mellow-yaml-source-hidden' }));
      pos = end + 1;
    }
  };

  const addDim = (builder: import('@codemirror/state').RangeSetBuilder<DecorationT>, doc: string, from: number, to: number): void => {
    let pos = from;
    while (pos < to) {
      const nl = doc.indexOf('\n', pos);
      const end = nl === -1 || nl > to ? to : nl;
      if (end > pos) builder.add(pos, end, Decoration.mark({ class: 'mellow-yaml-source-dim' }));
      pos = end + 1;
    }
  };

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    if (!fold) return builder.finish();
    const doc = view.state.doc.toString();
    const fm = parseYamlFrontMatter(doc);
    if (fm === null) return builder.finish();
    if (inside(fm.from, fm.to, view.state.selection.main.head)) return builder.finish();
    const cardOpen = view.state.field(cardOpenField, false) ?? false;
    if (cardOpen) {
      // 展开卡片：隐藏源码 + 卡片 widget（原行为）
      addHidden(builder, doc, fm.from, fm.to);
      builder.add(fm.to, fm.to, Decoration.widget({ widget: new YamlWidget(fm), side: 1 }));
    } else {
      // 默认：灰色源码样式（可读）+ 「卡片」折叠按钮
      addDim(builder, doc, fm.from, fm.to);
      builder.add(fm.to, fm.to, Decoration.widget({ widget: new YamlFoldButtonWidget(() => view.dispatch({ effects: setCardOpen.of(true) })), side: 1 }));
    }
    return builder.finish();
  };

  const setCardOpen = cm.StateEffect.define<boolean>();
  const cardOpenField = cm.StateField.define<boolean>({
    create: () => false,
    update: (value, tr) => {
      for (const e of tr.effects) {
        if (e.is(setCardOpen)) return e.value;
      }
      return value;
    },
  });

  const plugin = ViewPlugin.fromClass(class YamlFrontMatterPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = this.decorations.map(update.changes);
      if (isComposing(update.view)) return;
      const cardToggled = update.transactions.some((tr) => tr.effects.some((e) => e.is(setCardOpen)));
      if (update.docChanged || update.selectionSet || update.viewportChanged || cardToggled) {
        this.decorations = build(update.view);
      }
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.mellow-yaml-source-hidden': { fontSize: '0', lineHeight: '0', color: 'transparent' },
    '.mellow-yaml-source-dim': { opacity: '0.55' },
    '.mellow-yaml-fold-button': { position: 'absolute', right: '4px', top: '-1.4em', fontSize: '11px', padding: '1px 8px', border: '1px solid rgba(127,127,127,0.35)', borderRadius: '4px', background: 'transparent', color: 'inherit', cursor: 'pointer', zIndex: 1 },
    '.mellow-yaml-front-matter': { display: 'block', padding: '0.5em 0.75em', margin: '0.75em 0', border: '1px solid rgba(127,127,127,0.25)', borderRadius: '6px', background: 'rgba(127,127,127,0.06)' },
    '.mellow-yaml-title': { fontWeight: '700', marginBottom: '0.35em' },
    '.mellow-yaml-error': { color: '#b00020', marginBottom: '0.35em' },
  });
  return [cardOpenField, plugin, theme];
}
