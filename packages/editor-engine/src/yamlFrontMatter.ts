/** YAML Front Matter live block（PRD §47）。
 *
 * V5-R5：对齐 Typora `pre.md-meta-block` —— 常驻灰底卡片（源码可编辑，无折叠按钮、无 dim）。
 * 真值（github.css）：padding 1rem；font-size 85%；line-height 1.45；
 * bg #f7f7f7；radius 3px；color #777777。
 * 键值卡片 HTML（renderYamlFrontMatterHtml）保留为导出工具函数。
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Decoration: view.Decoration, RangeSetBuilder: state.RangeSetBuilder };
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

/** 兼容旧签名（V5 起卡片常驻，fold 开关不再影响行为） */
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

export function buildYamlFrontMatterExtension(autoInstallComposition = true, options: YamlFrontMatterOptions = {}): Extension {
  void autoInstallComposition;
  void options;
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    const fm = parseYamlFrontMatter(view.state.doc.toString());
    if (fm === null) return builder.finish();

    // 常驻灰底卡片：front matter 覆盖到的每一行加 line class（源码保持可编辑）
    let pos = fm.from;
    let first = true;
    while (pos <= fm.to) {
      const line = view.state.doc.lineAt(pos);
      const classes = ['mellow-yaml-card-line'];
      if (first) {
        classes.push('mellow-yaml-card-first');
        first = false;
      }
      if (line.to >= fm.to) classes.push('mellow-yaml-card-last');
      builder.add(line.from, line.from, Decoration.line({ class: classes.join(' ') }));
      if (line.to >= fm.to) break;
      pos = line.to + 1;
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class YamlFrontMatterPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = build(update.view);
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = CmEditorView.theme({
    '.cm-line.mellow-yaml-card-line': {
      backgroundColor: 'var(--mellow-md-metablock-bg, #f7f7f7)',
      color: 'var(--mellow-md-metablock-fg, #777777)',
      fontSize: '85%',
      lineHeight: '1.45',
      paddingLeft: '1rem',
      paddingRight: '1rem',
    },
    '.cm-line.mellow-yaml-card-first': {
      paddingTop: '1rem',
      borderTopLeftRadius: '3px',
      borderTopRightRadius: '3px',
      marginTop: '0',
    },
    '.cm-line.mellow-yaml-card-last': {
      paddingBottom: '1rem',
      borderBottomLeftRadius: '3px',
      borderBottomRightRadius: '3px',
      marginBottom: '0.8em',
    },
  });

  return [plugin, theme];
}
