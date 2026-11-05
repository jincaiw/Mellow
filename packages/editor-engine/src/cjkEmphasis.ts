/**
 * CJK 行内强调装饰层（ADR-0035 = A1，批次 A35）。
 *
 * 背景：Typora 的 marked 分支只要求「定界符内侧紧邻非空白」即成对，没有 CommonMark 的
 * 标点 flanking 规则 ⇒ `这是**「必须」**的` 在 Typora 里加粗，而 vendored `@lezer/markdown`
 * 判它不成对（无 StrongEmphasis 节点）⇒ 预览不加粗。用户裁决 = A1：预览与导出都对齐 Typora。
 *
 * 方案（ADR-0035「实现路径」指定的装饰层路线，不动 vendored 解析器）：
 * - 语法树**已产出** StrongEmphasis/Emphasis 等节点的字符不参与（marker-reveal 管线已负责）；
 * - 只对「树没配对、但 Typora 判据成对」的**孤岛区间**补装饰：加粗/斜体 class +
 *   定界符隐藏（reveal/IME/源码模式/大文件视口语义与 inlineExtras.ts 同构）；
 * - 配对机器 = markdown-it `processDelimiters` + `postProcess` 判定的逐字移植
 *   （MIT）。导出侧用**真** markdown-it（`installTyporaEmphasis`，
 *   packages/export/src/html/markdown.ts），判据逐条同构 ⇒ 两路径一致由算法同源保证，
 *   差分用例由 `test/cjk-emphasis.test.ts` 与 `packages/export/test/html.test.ts` 钉住。
 * - 只加 decoration，doc 文本不变（Source Fidelity，规则 3/13）。
 *
 * 判据细节（两路径一致，含两处有意保留的 CommonMark 守卫）：
 * 1. 开 = 内侧（后一字符）非空白；闭 = 内侧（前一字符）非空白；段界/行界视作空格；
 * 2. `%3` odd-match、`**a**b**c**` 空段守卫、`***foo***` 嵌套 = markdown-it 原样机器
 *    （Typora marked 正则无这些分支；保留 = ADR 验收「既有 CommonMark 用例不回退」）；
 * 3. ASCII 单词内 `_` 守卫：`snake_case_word` 不加粗（marked 会加粗，属 Typora 自身
 *    粗糙分支；守卫只认 [A-Za-z0-9_]，汉字/全角**不是**单词字符 ⇒ `中文_「斜体」_中文`
 *    与 `这是__「必须」__的` 仍按 Typora 渲染）。
 *
 * 扫描段 = 语法树的行内容段（Paragraph / Setext / ATX 标题 / 表格单元格）——
 * 与 markdown-it 的 inline state 分段同源：段内软换行可配对（`**「a」\n「b」**`
 * 两路径都加粗，其内侧仍非空白）；围栏/行内代码/已配对强调整段跳过。
 *
 * 与导出侧的一处已知实现差异（登记）：markdown-it 的 emphasis 定界符是**全 state 一条
 * 列表**（嵌套结构 link/image 内的强调递归处理）；本装饰层按段扫描、嵌套节点（Link/
 * Image/AutoLink 等已进 covered 集）整体跳过 ⇒ 形如 `[*x*「y」*z*](url)` 的「嵌套结构
 * 内部再含孤岛对」预览不渲染、导出渲染。该形状在 ADR-0035 验收矩阵之外，且
 * 预览保守跳过不会渲染出**错误**样式（只是不渲染），属可登记边界。
 */

import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { isComposing } from './composition';
import { isSourceMode } from './mode';
import { fencedRanges } from './safeHtml';
import { MARKER_CLASS } from './types';
import { isLargeFileMode, largeFileVersion, largeFileViewportRange } from './largeFile';
import { inlineCodeSpans, makeSkipChecker, windowLineStart } from './inlineExtras';

export const CJK_STRONG_CLASS = 'mellow-cjk-strong';
export const CJK_EM_CLASS = 'mellow-cjk-em';

interface Entry {
  marker: number; // 42(*) 或 95(_)
  length: number; // 定界连长（整 run；与 markdown-it delimiter.length 同义）
  pos: number; // 该标记字符的文档绝对位置
  open: boolean;
  close: boolean;
  end: number; // 配对到的 closer 条目索引；-1 = 未配对
}

interface CjkPair {
  from: number; // 外层开定界首字符
  to: number; // 外层闭定界末字符 + 1
  innerFrom: number; // 内容起点
  innerTo: number; // 内容终点
  strong: boolean;
}

/**
 * markdown-it `processDelimiters`（lib/rules_inline/balance_pairs.ts）的逐字移植。
 *
 * 上游用 `token`（文本 token 序号）做「同 run 相邻」判定；本移植条目按 run 内字符逐个
 * 入列（pos 连续 ⇔ 同 run ⇔ 上游 token 连续），故 `lastTokenIdx !== closer.token - 1`
 * 改写为 `lastTokenPos !== closer.pos - 1`（跨 run 的字符间至少隔 1 个文本字符 ⇒
 * pos 不相邻；同 run 的相邻字符必同 marker —— run 是极大同字符段）。
 */
function processDelimiterEntries(delimiters: Entry[]): void {
  const openersBottom: Record<number, number[]> = {};
  const max = delimiters.length;
  if (max === 0) return;
  let headerIdx = 0;
  let lastTokenPos = -2;
  const jumps: number[] = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];
    jumps.push(0);
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenPos !== closer.pos - 1) {
      headerIdx = closerIdx;
    }
    lastTokenPos = closer.pos;
    if (!closer.close) continue;
    if (openersBottom[closer.marker] === undefined) {
      openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
    }
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length % 3)];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenPos = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) {
      openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3] = newMinOpenerIdx;
    }
  }
}

/**
 * 扫描一个行内容段，产出孤岛强调区间（纯函数，可测；单测直接调用本函数）。
 *
 * @param doc 全文（绝对位置）
 * @param from 段起点（含；markdown-it inline state 的 pos=0）
 * @param to 段终点（不含；= posMax）
 * @param skipped 位置判定：树已覆盖 / 代码 / 围栏内的字符不参与收集
 */
export function scanCjkEmphasisSegment(
  doc: string,
  from: number,
  to: number,
  skipped: (pos: number) => boolean,
): CjkPair[] {
  const out: CjkPair[] = [];
  // 1) 收集定界符 run（与导出侧 installTyporaEmphasis 的 tokenize 同判据）
  const entries: Entry[] = [];
  let pos = from;
  while (pos < to) {
    const ch = doc[pos];
    if ((ch !== '*' && ch !== '_') || skipped(pos)) {
      pos++;
      continue;
    }
    const marker = ch.charCodeAt(0);
    let end = pos + 1;
    while (end < to && doc[end] === ch && !skipped(end)) end++;
    const length = end - pos;
    // 段界视作空格（= markdown-it：inline state 首字符 lastChar=32、越界 nextChar=32）
    const prev = pos === from ? ' ' : doc[pos - 1];
    const next = end >= to ? ' ' : doc[end];
    let canOpen = !/\s/.test(next);
    let canClose = !/\s/.test(prev);
    if (marker === 95) {
      const word = (c: string): boolean => /[A-Za-z0-9_]/.test(c);
      if (word(prev)) canOpen = false;
      if (word(next)) canClose = false;
    }
    for (let k = 0; k < length; k++) {
      entries.push({ marker, length, pos: pos + k, open: canOpen, close: canClose, end: -1 });
    }
    pos = end;
  }
  if (entries.length === 0) return out;

  // 2) 配对（机器 = 上游）
  processDelimiterEntries(entries);

  // 3) strong/em 判定 + 产出区间（postProcess 的逐字移植；token 邻接 = pos 邻接）
  for (let i = entries.length - 1; i >= 0; i--) {
    const startDelim = entries[i];
    if (startDelim.end === -1) continue;
    const endDelim = entries[startDelim.end];
    const nextAfter = entries[startDelim.end + 1];
    const isStrong =
      i > 0 &&
      entries[i - 1].end === startDelim.end + 1 &&
      entries[i - 1].marker === startDelim.marker &&
      entries[i - 1].pos === startDelim.pos - 1 &&
      nextAfter !== undefined &&
      nextAfter.pos === endDelim.pos + 1;
    const openFirst = isStrong ? startDelim.pos - 1 : startDelim.pos;
    const closeLast = isStrong ? endDelim.pos + 1 : endDelim.pos;
    const p: CjkPair = {
      from: openFirst,
      to: closeLast + 1,
      innerFrom: startDelim.pos + 1,
      innerTo: endDelim.pos,
      strong: isStrong,
    };
    if (p.innerTo > p.innerFrom) out.push(p);
    if (isStrong) i--; // 消耗两个开定界条目（与上游一致）
  }
  return out;
}

// ─────────────────────────── 扩展 ───────────────────────────

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  return {
    EditorView: view.EditorView,
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    RangeSetBuilder: state.RangeSetBuilder,
    syntaxTree: language.syntaxTree,
  };
}

/** 行内容段（与 markdown-it inline state 分段同源）：Paragraph / Setext / ATX 标题 / 表格单元格。 */
const SEGMENT_NODES = /^(Paragraph|SetextHeading[1-6]|ATXHeading[1-6]|TableCell)$/;
/**
 * 不参与孤岛扫描的节点：已配对强调（reveal 管线负责）、行内代码/链接（markdown-it
 * 不进入的文本）、以及强调不可能生效的容器（图片、链接、自动链接、HTML、前置元数据）。
 * Setext/ATX 标题是「段」（内容照常扫描），其 `#`/下划线标记本身是父段边界外字符，
 * 天然不参与（run 收集遇非 marker 字符即跳过）。
 */
const COVERED_NODES = /^(StrongEmphasis|Emphasis|Strikethrough|InlineCode|CodeText|FrontMatter|AutoLink|HtmlTag|Image|Link)$/;

/**
 * 构建 CJK 行内强调扩展（ADR-0035 A1 / 批次 A35）。
 * 无特性开关：`**`/`*` 强调是 CommonMark 核心语法（Typora 亦无对应开关）。
 */
export function buildCjkEmphasisExtension(): Extension {
  const { EditorView: CmEditorView, ViewPlugin, Decoration, RangeSetBuilder, syntaxTree } = resolveCm();

  const build = (view: EditorView): DecorationSet => {
    const docStr = view.state.doc.toString();
    const win = isLargeFileMode() ? largeFileViewportRange(view) : undefined;
    const ranges = view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: view.state.doc.length }];

    const segments: Array<{ from: number; to: number }> = [];
    const coveredRanges: Array<{ from: number; to: number }> = [];
    for (const r of ranges) {
      syntaxTree(view.state).iterate({
        from: r.from,
        to: r.to,
        enter: (node) => {
          if (SEGMENT_NODES.test(node.name)) {
            segments.push({ from: node.from, to: node.to });
          } else if (COVERED_NODES.test(node.name)) {
            coveredRanges.push({ from: node.from, to: node.to });
          }
        },
      });
    }

    const skipped = makeSkipChecker(
      coveredRanges,
      fencedRanges(docStr),
      inlineCodeSpans(docStr, win ? { from: windowLineStart(docStr, win), to: win.to } : undefined),
    );

    const pairs: CjkPair[] = [];
    for (const s of segments) {
      if (win !== undefined && (s.to < win.from || s.from > win.to)) continue;
      pairs.push(...scanCjkEmphasisSegment(docStr, s.from, s.to, skipped));
    }

    // 装饰按 from 升序（RangeSetBuilder 合同）；重叠 mark 在 CM6 中类名合成
    interface DecoRange { from: number; to: number; cls: string }
    const decoRanges: DecoRange[] = [];
    const head = view.state.selection.main.head;
    const sourceMode = isSourceMode(view);
    for (const p of pairs) {
      if (p.innerTo <= p.innerFrom) continue;
      const hideDelims = !sourceMode && !(head >= p.from && head <= p.to);
      if (hideDelims) {
        decoRanges.push({ from: p.from, to: p.innerFrom, cls: MARKER_CLASS });
        decoRanges.push({ from: p.innerTo, to: p.to, cls: MARKER_CLASS });
      }
      decoRanges.push({ from: p.innerFrom, to: p.innerTo, cls: p.strong ? CJK_STRONG_CLASS : CJK_EM_CLASS });
    }
    decoRanges.sort((a, b) => a.from - b.from || b.to - a.to);
    const builder = new RangeSetBuilder<Decoration>();
    for (const d of decoRanges) {
      if (d.to > d.from) builder.add(d.from, d.to, Decoration.mark({ class: d.cls }));
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class CjkEmphasisPlugin {
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

  const theme = CmEditorView.theme({
    // 与 CoreEditor sharedHighlights 同值（bolder / italic），保证两条路径视觉一致
    [`.${CJK_STRONG_CLASS}`]: { fontWeight: 'bolder' },
    [`.${CJK_EM_CLASS}`]: { fontStyle: 'italic' },
  });

  return [plugin, theme];
}
