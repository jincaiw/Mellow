/**
 * 行内 HTML `<kbd>` 键帽（V6-P1 1.2.3，Typora 图16 对标）。
 *
 * inline HTML 不在 lezer 高亮类体系内 → 正则扫描器（与 inlineExtras 同模式）：
 * - 跳过代码围栏（fencedRanges）与行内代码（`...`）；
 * - caret 在区间内 → 标签保持可见（源码编辑态）；区间外 → `<kbd>`/`</kbd>` 隐藏，内文呈现键帽；
 * - 只加 decoration，doc 文本不变（Source Fidelity 保真）。
 */

import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';
import { isSourceMode } from './mode';
import { fencedRanges } from './safeHtml';
import { inlineCodeSpans, makeSkipChecker, windowLineStart } from './inlineExtras';
import type { ScanWindow } from './inlineExtras';
import { isLargeFileMode, largeFileVersion, largeFileViewportRange } from './largeFile';

export interface KbdRange {
  from: number;
  to: number;
  /** 开标签结束位置（`<kbd>` 或 `<kbd attr>` 之后） */
  openEnd: number;
  /** 闭标签开始位置（`</kbd>` 起点前，允许 `</kbd >`） */
  closeStart: number;
}

/** 扫描行内 `<kbd>...</kbd>`（纯函数，可测；window 省略时全文档） */
export function scanKbdCaps(doc: string, codeRanges: Array<{ from: number; to: number }>, window?: ScanWindow): KbdRange[] {
  const out: KbdRange[] = [];
  const win: ScanWindow = { from: windowLineStart(doc, window), to: window?.to ?? doc.length };
  const codeSpans = inlineCodeSpans(doc, win);
  const skipped = makeSkipChecker(codeRanges, codeSpans);
  const re = /<kbd(?:\s[^>]*)?>([\s\S]*?)<\/kbd\s*>/gi;
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    const from = m.index;
    const to = m.index + m[0].length;
    if (to < win.from || from > win.to) continue;
    if (skipped(from) || skipped(to - 1)) continue;
    const openEnd = from + m[0].indexOf('>') + 1;
    const closeStart = to - (m[0].length - openEnd - m[1].length);
    out.push({ from, to, openEnd, closeStart });
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

const TAG_HIDE_CLASS = 'mellow-md-extras-delim';

/** 构建行内 kbd 键帽扩展（`<kbd>Ctrl</kbd>` → 键帽渲染） */
export function buildKbdCapsExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;

  const build = (view: EditorView): DecorationSet => {
    const doc = view.state.doc.toString();
    // Large File Mode：扫描裁剪到视口 ± 余量（与 inlineExtras 一致）
    const win = isLargeFileMode() ? largeFileViewportRange(view) : undefined;
    const caps = scanKbdCaps(doc, fencedRanges(doc), win);
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode(view);
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    for (const cap of caps) {
      if (cap.closeStart <= cap.openEnd) continue;
      // RangeSetBuilder 要求 from 升序：开标签 → 内文 → 闭标签
      const hideTags = !sourceMode && !(head >= cap.from && head <= cap.to);
      if (hideTags) {
        builder.add(cap.from, cap.openEnd, Decoration.mark({ class: TAG_HIDE_CLASS }));
      }
      builder.add(cap.openEnd, cap.closeStart, Decoration.mark({ class: 'mellow-kbd' }));
      if (hideTags) {
        builder.add(cap.closeStart, cap.to, Decoration.mark({ class: TAG_HIDE_CLASS }));
      }
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class KbdCapsPlugin {
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
        const largeChanged = largeFileVersion() !== this.largeVersion;
        if (largeChanged) this.largeVersion = largeFileVersion();
        if (update.docChanged || update.selectionSet || update.viewportChanged || largeChanged) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (value: { decorations: DecorationSet }) => value.decorations },
  );

  // 键帽观感 = GitHub/Typora github.css kbd（灰底、圆角、下沿厚边）
  const theme = CmEditorView.theme({
    '.mellow-kbd': {
      fontSize: '0.85em',
      padding: '1px 5px',
      borderRadius: '3px',
      border: '1px solid var(--mellow-border, #d0d7de)',
      borderBottomWidth: '2px',
      backgroundColor: 'var(--mellow-md-inline-code-bg, #f3f4f4)',
      fontFamily: 'inherit',
    },
  });

  return [plugin, theme];
}
