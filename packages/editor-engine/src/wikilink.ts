/**
 * Wikilink（Typora 深度对标）：`[[name]]` 渲染 + 点击跳转（同目录文件）。
 *
 * - 扫描器跳过代码围栏（fencedRanges）与行内代码（inlineCodeSpans）；
 * - 定界符 caret-aware：区间外隐藏 `[[ ]]`、区间内显示源码（与 marker 一致）；
 * - 点击 → `window.__MELLOW_WIKILINK_OPEN__?.(name)`（宿主解析「同目录 name.md」并打开）；
 * - doc 文本不变（Source Fidelity）。
 */

import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import { isComposing } from './composition';
import { isSourceMode } from './mode';
import { fencedRanges } from './safeHtml';
import { inlineCodeSpans, makeSkipChecker, windowLineStart } from './inlineExtras';
import type { ScanWindow } from './inlineExtras';
import { isLargeFileMode, largeFileVersion, largeFileViewportRange } from './largeFile';

export interface WikilinkRange {
  from: number; // [[
  to: number; // ]]
  name: string;
}

/** 扫描 wikilink（纯函数，可测；window 省略时全文档） */
export function scanWikilinks(doc: string, codeRanges: Array<{ from: number; to: number }>, window?: ScanWindow): WikilinkRange[] {
  const out: WikilinkRange[] = [];
  const from = windowLineStart(doc, window);
  const to = window?.to ?? doc.length;
  const codeSpans = inlineCodeSpans(doc, window);
  // 二分 skip 检查器：替代逐字符 some() 线性扫（大文档 O(n×r) → O(n log r)，2026-08-22 j17 排查）
  const skipped = makeSkipChecker(codeRanges, codeSpans);

  let i = from;
  while (i < to - 1) {
    // char-first 快路径：非 `[[` 起始位置直接跳过
    if (doc[i] !== '[' || doc[i + 1] !== '[') {
      i++;
      continue;
    }
    if (skipped(i)) {
      i++;
      continue;
    }
    // 找 ]]（不含换行、不在代码内；行内有界）
    let j = i + 2;
    let close = -1;
    while (j < to - 1) {
      if (doc[j] === '\n') break;
      if (skipped(j)) { j++; continue; }
      if (doc[j] === ']' && doc[j + 1] === ']') { close = j; break; }
      j++;
    }
    if (close !== -1) {
      const name = doc.slice(i + 2, close).trim();
      if (name !== '' && !name.includes('[')) {
        out.push({ from: i, to: close + 2, name });
      }
      i = close + 2;
      continue;
    }
    i++;
  }
  return out;
}

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

/** 宿主注入的 wikilink 打开回调（App 解析同目录文件） */
type WikilinkOpener = (name: string) => void;
function opener(): WikilinkOpener | undefined {
  return (window as unknown as { __MELLOW_WIKILINK_OPEN__?: WikilinkOpener }).__MELLOW_WIKILINK_OPEN__;
}

const LINK_CLASS = 'mellow-wikilink';
const DELIM_CLASS = 'mellow-wikilink-delim';

export function buildWikilinkExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    const doc = view.state.doc.toString();
    // Large File Mode：扫描裁剪到视口 ± 余量（PRD §109；与 math/mermaid 一致）
    const win = isLargeFileMode() ? largeFileViewportRange(view) : undefined;
    const links = scanWikilinks(doc, fencedRanges(doc), win);
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode();
    for (const l of links) {
      const innerFrom = l.from + 2;
      const innerTo = l.to - 2;
      if (innerTo <= innerFrom) continue;
      // RangeSetBuilder 必须按 from 升序添加：前定界符 → 内文 → 后定界符
      if (!sourceMode && !(head >= l.from && head <= l.to)) {
        builder.add(l.from, innerFrom, Decoration.mark({ class: DELIM_CLASS }));
      }
      builder.add(innerFrom, innerTo, Decoration.mark({ class: LINK_CLASS }));
      if (!sourceMode && !(head >= l.from && head <= l.to)) {
        builder.add(innerTo, l.to, Decoration.mark({ class: DELIM_CLASS }));
      }
    }
    return builder.finish();
  };

  const clickHandler = (event: MouseEvent, view: EditorView): boolean => {
    const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (coords === null) return false;
    const doc = view.state.doc.toString();
    const links = scanWikilinks(doc, fencedRanges(doc));
    const link = links.find((l) => coords >= l.from && coords <= l.to);
    if (link === undefined) return false;
    opener()?.(link.name);
    return true;
  };

  const plugin = ViewPlugin.fromClass(
    class WikilinkPlugin {
      decorations: DecorationSet;
      private largeVersion = largeFileVersion();
      constructor(readonly view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        if (isComposing()) return;
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
    [`.${LINK_CLASS}`]: {
      color: 'var(--mellow-accent, #3563d6)',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    [`.${DELIM_CLASS}`]: { fontSize: '0', userSelect: 'text' },
  });

  return [plugin, CmEditorView.domEventHandlers({ click: clickHandler }), theme];
}
