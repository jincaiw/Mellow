/**
 * 行内扩展标记（Typora 深度对标）：`==高亮==` / `^上标^` / `~下标~`。
 *
 * lezer markdown 语法不含这些 → 正则扫描器（纯函数，可测）：
 * - 跳过代码围栏（fencedRanges）与行内代码（`...`）；
 * - `~` 单波浪 = 下标，`~~` 保持删除线（lezer Strikethrough，不冲突）；
 * - caret 在区间内 → 定界符可见（源码编辑）；区间外 → 定界符隐藏（渲染）；
 * - 只加 decoration，doc 文本不变（Source Fidelity 保真）。
 */

import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';
import { isSourceMode } from './mode';
import { fencedRanges } from './safeHtml';

export type InlineExtraKind = 'highlight' | 'sup' | 'sub';

export interface InlineExtraRange {
  from: number;
  to: number;
  kind: InlineExtraKind;
}

/** 行内代码 span（`...`；不成对则到文末） */
export function inlineCodeSpans(doc: string): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  let inSpan = false;
  let start = 0;
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] !== '`') continue;
    if (!inSpan) {
      inSpan = true;
      start = i;
    } else {
      spans.push({ from: start, to: i + 1 });
      inSpan = false;
    }
  }
  if (inSpan) spans.push({ from: start, to: doc.length });
  return spans;
}

function findCloser(
  doc: string,
  delim: string,
  from: number,
  skipped: (pos: number) => boolean,
  char: string,
): number {
  const dlen = delim.length;
  for (let j = from; j <= doc.length - dlen; j++) {
    if (doc[j] === '\n') return -1; // 单行
    if (skipped(j)) continue;
    if (!doc.startsWith(delim, j)) continue;
    if (doc[j + dlen] === char) continue; // 撞到更长定界（=== / ^^ / ~~）
    if (dlen === 1 && j > from && doc[j - 1] === char) continue; // 前邻同字符
    return j;
  }
  return -1;
}

/** Setext 下划线行（整行仅 `=`/空格）：Heading 语义，非高亮（Typora 一致） */
export function setextUnderlineRanges(doc: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  let lineStart = 0;
  for (let i = 0; i <= doc.length; i++) {
    if (i === doc.length || doc[i] === '\n') {
      const line = doc.slice(lineStart, i);
      if (/^ {0,3}={2,}\s*$/.test(line)) out.push({ from: lineStart, to: i });
      lineStart = i + 1;
    }
  }
  return out;
}

/** 扫描行内扩展标记（纯函数） */
export function scanInlineExtras(doc: string, codeRanges: Array<{ from: number; to: number }>): InlineExtraRange[] {
  const out: InlineExtraRange[] = [];
  const codeSpans = inlineCodeSpans(doc);
  const setext = setextUnderlineRanges(doc);
  const skipped = (pos: number): boolean =>
    codeRanges.some((r) => pos >= r.from && pos < r.to)
    || codeSpans.some((r) => pos >= r.from && pos < r.to)
    || setext.some((r) => pos >= r.from && pos < r.to);

  let i = 0;
  while (i < doc.length - 1) {
    if (skipped(i)) {
      i++;
      continue;
    }
    const ch = doc[i];
    // == 高亮
    if (ch === '=' && doc[i + 1] === '=') {
      const end = findCloser(doc, '==', i + 2, skipped, '=');
      if (end !== -1) {
        out.push({ from: i, to: end + 2, kind: 'highlight' });
        i = end + 2;
        continue;
      }
    }
    // ^ 上标
    if (ch === '^') {
      const end = findCloser(doc, '^', i + 1, skipped, '^');
      if (end !== -1) {
        out.push({ from: i, to: end + 1, kind: 'sup' });
        i = end + 1;
        continue;
      }
    }
    // ~ 下标（单波浪；前后都非 ~，~~ 为删除线不处理）
    if (ch === '~' && doc[i + 1] !== '~' && (i === 0 || doc[i - 1] !== '~')) {
      const end = findCloser(doc, '~', i + 1, skipped, '~');
      if (end !== -1 && doc[end + 1] !== '~') {
        out.push({ from: i, to: end + 1, kind: 'sub' });
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

// ─────────────────────────── 扩展 ───────────────────────────

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Decoration: view.Decoration, RangeSetBuilder: state.RangeSetBuilder };
}

const DELIM_CLASS = 'mellow-md-extras-delim';

function kindClass(kind: InlineExtraKind): string {
  if (kind === 'highlight') return 'mellow-md-highlight';
  if (kind === 'sup') return 'mellow-md-sup';
  return 'mellow-md-sub';
}

/** 构建行内扩展标记扩展（==高亮== / ^上标^ / ~下标~） */
export function buildInlineExtrasExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;

  const build = (view: EditorView): DecorationSet => {
    const doc = view.state.doc.toString();
    const extras = scanInlineExtras(doc, fencedRanges(doc));
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode();
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    for (const e of extras) {
      const dlen = e.kind === 'highlight' ? 2 : 1;
      const innerFrom = e.from + dlen;
      const innerTo = e.to - dlen;
      if (innerTo <= innerFrom) continue;
      // RangeSetBuilder 要求 from 升序：定界符(前) → 内文 → 定界符(后)
      const hideDelims = !sourceMode && !(head >= e.from && head <= e.to);
      if (hideDelims) {
        builder.add(e.from, innerFrom, Decoration.mark({ class: DELIM_CLASS }));
      }
      builder.add(innerFrom, innerTo, Decoration.mark({ class: kindClass(e.kind) }));
      if (hideDelims) {
        builder.add(innerTo, e.to, Decoration.mark({ class: DELIM_CLASS }));
      }
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class InlineExtrasPlugin {
      decorations: DecorationSet;
      constructor(readonly view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        if (isComposing()) return;
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (value: { decorations: DecorationSet }) => value.decorations },
  );

  const theme = CmEditorView.theme({
    '.mellow-md-highlight': {
      background: 'rgba(255, 230, 30, 0.38)',
      borderRadius: '2px',
      padding: '0 1px',
    },
    '.mellow-md-sup': { verticalAlign: 'super', fontSize: '0.75em' },
    '.mellow-md-sub': { verticalAlign: 'sub', fontSize: '0.75em' },
    [`.${DELIM_CLASS}`]: {
      fontSize: '0',
      userSelect: 'text',
    },
  });

  return [plugin, theme];
}
