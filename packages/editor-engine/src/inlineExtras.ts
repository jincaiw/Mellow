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
import { isLargeFileMode, largeFileVersion, largeFileViewportRange } from './largeFile';

export type InlineExtraKind = 'highlight' | 'sup' | 'sub';

export interface InlineExtraRange {
  from: number;
  to: number;
  kind: InlineExtraKind;
}

/** 扫描窗口（Large File Mode 视口裁剪；from/to 为文档全局位置） */
export interface ScanWindow {
  from: number;
  to: number;
}

/**
 * 归并多组升序区间，返回 O(log n) 二分 skip 检查器。
 *
 * 性能（2026-08-22 j17 排查）：此前扫描器对每个字符位置调用
 * `ranges.some(...)` 线性扫全部区间 —— 大文档（>5MB）下 O(chars×ranges)
 * 二次复杂度，10MB 文档单次 dispatch 118s。归并 + 二分后为 O(chars·log r)。
 */
export function makeSkipChecker(
  ...lists: Array<Array<{ from: number; to: number }>>
): (pos: number) => boolean {
  const all = lists.flat().sort((a, b) => a.from - b.from);
  const merged: Array<{ from: number; to: number }> = [];
  for (const r of all) {
    const last = merged[merged.length - 1];
    if (last !== undefined && r.from <= last.to) {
      if (r.to > last.to) last.to = r.to;
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }
  return (pos: number): boolean => {
    let lo = 0;
    let hi = merged.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = merged[mid];
      if (pos < r.from) hi = mid - 1;
      else if (pos >= r.to) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

/** 窗口起点对齐到行首（跨行标记不从行中间开始扫） */
export function windowLineStart(doc: string, window?: ScanWindow): number {
  if (window === undefined) return 0;
  return doc.lastIndexOf('\n', Math.max(0, window.from - 1)) + 1;
}

/** 行内代码 span（`...`；不成对则到窗口末）。窗口外的 span 不识别（LF 视口余量兜底） */
export function inlineCodeSpans(doc: string, window?: ScanWindow): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  const from = windowLineStart(doc, window);
  const end = window?.to ?? doc.length;
  let inSpan = false;
  let start = 0;
  for (let i = from; i < end; i++) {
    if (doc[i] !== '`') continue;
    if (!inSpan) {
      inSpan = true;
      start = i;
    } else {
      spans.push({ from: start, to: i + 1 });
      inSpan = false;
    }
  }
  if (inSpan) spans.push({ from: start, to: end });
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

/** Setext 下划线行（整行仅 `=`/空格）：Heading 语义，非高亮（Typora 一致）。可窗口化 */
export function setextUnderlineRanges(doc: string, window?: ScanWindow): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const from = windowLineStart(doc, window);
  const end = window?.to ?? doc.length;
  let lineStart = from;
  for (let i = from; i <= end; i++) {
    if (i === end || doc[i] === '\n') {
      const line = doc.slice(lineStart, i);
      if (/^ {0,3}={2,}\s*$/.test(line)) out.push({ from: lineStart, to: Math.min(i, end) });
      lineStart = i + 1;
    }
  }
  return out;
}

/** 扫描行内扩展标记（纯函数，可测；window 省略时全文档） */
export function scanInlineExtras(doc: string, codeRanges: Array<{ from: number; to: number }>, window?: ScanWindow): InlineExtraRange[] {
  const out: InlineExtraRange[] = [];
  const win: ScanWindow = { from: windowLineStart(doc, window), to: window?.to ?? doc.length };
  const codeSpans = inlineCodeSpans(doc, win);
  const setext = setextUnderlineRanges(doc, win);
  const skipped = makeSkipChecker(codeRanges, codeSpans, setext);

  let i = win.from;
  while (i < win.to - 1) {
    const ch = doc[i];
    // char-first 快路径：非定界符字符直接跳过（避免每字符一次 skip 查询）
    if (ch !== '=' && ch !== '^' && ch !== '~') {
      i++;
      continue;
    }
    if (skipped(i)) {
      i++;
      continue;
    }
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
    // Large File Mode：扫描裁剪到视口 ± 余量（PRD §109；与 math/mermaid 一致）
    const win = isLargeFileMode() ? largeFileViewportRange(view) : undefined;
    const extras = scanInlineExtras(doc, fencedRanges(doc), win);
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode(view);
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
      private largeVersion = largeFileVersion();
      constructor(readonly view: EditorView) {
        this.decorations = build(view);
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
