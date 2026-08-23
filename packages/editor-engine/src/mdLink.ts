/**
 * Markdown 文件链接（Typora 深度对标）：`[label](path.md)` / `[label](path.md#锚点)`
 * 渲染 + 点击打开（Typora「文件链接：`[标签](相对路径.md)` 创建文件间链接；支持
 * `文件.md#标题` 锚点跳转」）。
 *
 * - 扫描器跳过代码围栏（fencedRanges）与行内代码（inlineCodeSpans）；
 * - 仅匹配本地 Markdown 目标（相对/绝对 .md 路径，可带 `#锚点`）；URL/图片不走此扩展
 *   （图片由 image 扩展处理；http 链接由右键菜单 openLink 打开）；
 * - 定界符 caret-aware：区间外隐藏 `[` / `](dest)`、区间内显示源码（与 wikilink 一致）；
 * - 点击 → `window.__MELLOW_MD_LINK_OPEN__?.(dest)`（宿主解析路径并打开；锚点跳转宿主侧处理）；
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

export interface MdLinkRange {
  /** `[` 起始 */
  from: number;
  /** `)` 之后（exclusive） */
  to: number;
  /** label 区间（`[` 之后 → `]` 之前） */
  labelFrom: number;
  labelTo: number;
  /** 目标（原样，未解码；可含 `#锚点`） */
  dest: string;
}

/** 本地 Markdown 目标判定：`xxx.md` / `xxx.md#anchor`（大小写不敏感；.markdown/.mdown/.mkd 同） */
const MD_DEST_RE = /\.(md|markdown|mdown|mkd)(#[^\s]*)?$/i;

/** URL 前缀判定（与 image/path isUrl 同口径，避免重复 import 依赖） */
const URL_PREFIX_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|data:|mailto:)/i;

function isUrlDest(dest: string): boolean {
  return URL_PREFIX_RE.test(dest);
}

/** dest 是否为可打开的本地 Markdown 目标 */
export function isMdLinkDest(dest: string): boolean {
  return dest.length > 0 && !isUrlDest(dest) && MD_DEST_RE.test(dest);
}

/** 扫描文件链接（纯函数，可测；window 省略时全文档） */
export function scanMdLinks(doc: string, codeRanges: Array<{ from: number; to: number }>, window?: ScanWindow): MdLinkRange[] {
  const out: MdLinkRange[] = [];
  const from = windowLineStart(doc, window);
  const to = window?.to ?? doc.length;
  const codeSpans = inlineCodeSpans(doc, window);
  const skipped = makeSkipChecker(codeRanges, codeSpans);

  let i = from;
  while (i < to) {
    // char-first 快路径：非 `[` 起始直接跳过
    if (doc[i] !== '[') {
      i++;
      continue;
    }
    // 排除图片 `![`（image 扩展处理）与 wikilink `[[`（wikilink 扩展处理）
    if (i > 0 && (doc[i - 1] === '!' || doc[i - 1] === '[')) {
      i++;
      continue;
    }
    if (skipped(i)) {
      i++;
      continue;
    }
    // 找 label 结束 `]`（单行；不允许嵌套 `[`；`\` 转义跳两字符）
    let j = i + 1;
    let close = -1;
    while (j < to) {
      const c = doc[j];
      if (c === '\n') break;
      if (c === '\\') { j += 2; continue; }
      if (c === '[') break;
      if (c === ']') { close = j; break; }
      j++;
    }
    if (close === -1 || close === i + 1) { // 无闭合或空 label
      i++;
      continue;
    }
    // `](` 才是链接（setext 引用 `[x]: y` 不匹配）
    if (doc[close + 1] !== '(') {
      i = close + 1;
      continue;
    }
    // dest：`(` 之后找 `)`（单行；不允许空白 —— 含 title 的 `[l](d "t")` 不支持点击）
    let k = close + 2;
    let closeParen = -1;
    while (k < to) {
      const c = doc[k];
      if (c === '\n' || c === ' ' || c === '\t') break;
      if (c === '\\') { k += 2; continue; }
      if (c === '(') break;
      if (c === ')') { closeParen = k; break; }
      k++;
    }
    if (closeParen === -1) {
      i = close + 1;
      continue;
    }
    const dest = doc.slice(close + 2, closeParen);
    if (isMdLinkDest(dest)) {
      out.push({ from: i, to: closeParen + 1, labelFrom: i + 1, labelTo: close, dest });
      i = closeParen + 1;
      continue;
    }
    i = close + 1;
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

/** 宿主注入的文件链接打开回调（App 解析相对路径并打开；dest 未解码原样传递） */
type MdLinkOpener = (dest: string) => void;
function opener(): MdLinkOpener | undefined {
  return (window as unknown as { __MELLOW_MD_LINK_OPEN__?: MdLinkOpener }).__MELLOW_MD_LINK_OPEN__;
}

const LINK_CLASS = 'mellow-mdlink';
const DELIM_CLASS = 'mellow-mdlink-delim';

export function buildMdLinkExtension(): Extension {
  const cm = resolveCm();
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder } = cm;

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    const doc = view.state.doc.toString();
    // Large File Mode：扫描裁剪到视口 ± 余量（与 wikilink/math/mermaid 一致）
    const win = isLargeFileMode() ? largeFileViewportRange(view) : undefined;
    const links = scanMdLinks(doc, fencedRanges(doc), win);
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode();
    for (const l of links) {
      if (l.labelTo <= l.labelFrom) continue;
      // RangeSetBuilder 必须按 from 升序添加：前定界符 → label → 后定界符
      if (!sourceMode && !(head >= l.from && head <= l.to)) {
        builder.add(l.from, l.from + 1, Decoration.mark({ class: DELIM_CLASS }));
      }
      builder.add(l.labelFrom, l.labelTo, Decoration.mark({ class: LINK_CLASS }));
      if (!sourceMode && !(head >= l.from && head <= l.to)) {
        builder.add(l.labelTo, l.to, Decoration.mark({ class: DELIM_CLASS }));
      }
    }
    return builder.finish();
  };

  const clickHandler = (event: MouseEvent, view: EditorView): boolean => {
    const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (coords === null) return false;
    const doc = view.state.doc.toString();
    const links = scanMdLinks(doc, fencedRanges(doc));
    const link = links.find((l) => coords >= l.from && coords <= l.to);
    if (link === undefined) return false;
    opener()?.(link.dest);
    return true;
  };

  const plugin = ViewPlugin.fromClass(
    class MdLinkPlugin {
      decorations: DecorationSet;
      private largeVersion = largeFileVersion();
      constructor(readonly view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        if (isComposing()) return;
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
