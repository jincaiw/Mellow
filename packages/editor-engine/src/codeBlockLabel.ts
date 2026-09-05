/**
 * Code Block Language Label + Editing Outline（E3，Typora parity 第三轮）。
 *
 * 对齐 Typora 代码块编辑体验：
 * - 围栏代码块起始行行尾显示语言标签（Typora 代码块右上角语言标识）；
 *   点击标签弹出语言下拉（select），选择后 dispatch 事务改写 info string
 *   中的语言 token（未指定语言时同样可选）。
 * - 光标进入围栏块（含 mermaid）或 $$…$$ 数学块内部（编辑态，widget 隐藏、
 *   显示源码）时，为块内行添加 mellow-md-editing-outline 行装饰，形成
 *   Typora 风格的编辑态视觉描边。
 *
 * 实现约束（与 math/mermaid 一致）：
 * - 仅使用 point/line decoration（ViewPlugin 可提供）；不产生 block decoration。
 * - 构造期 / update 期间不 dispatch；语言改写在用户事件回调中 dispatch。
 * - Composition 期间不重建装饰（isComposing guard）。
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';
import { parseMathSpans } from './math';
import { FENCE_LANGUAGES } from './codeFence';

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  EditorView: typeof import('@codemirror/view').EditorView;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return {
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    EditorView: view.EditorView,
    RangeSetBuilder: state.RangeSetBuilder,
  };
}

/** 编辑态描边行装饰 class */
export const EDITING_OUTLINE_CLASS = 'mellow-md-editing-outline';
/** 语言标签 class */
export const CODEBLOCK_LANG_CLASS = 'mellow-codeblock-lang';

export interface FenceBlock {
  /** 起始行行首 */
  from: number;
  /** 闭合围栏行行尾（未闭合 → doc.length） */
  to: number;
  /** 闭合围栏行行首（未闭合 → to） */
  closeFrom: number;
  /** 起始行行尾（不含换行符） */
  openEnd: number;
  /** info string 首词（空串 = 未指定语言） */
  lang: string;
  /** 语言 token 起点（未指定 → 标记与空白之后的空区间） */
  langFrom: number;
  langTo: number;
  closed: boolean;
}

const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})([^\S\n]*)(.*)$/;

/** 语言 token 字符集（info string 首词） */
const LANG_TOKEN_RE = /^[A-Za-z0-9_+#.-]+/;

/**
 * 解析文档中的围栏代码块（纯函数，可测）。
 * 规则与 CommonMark 一致：≤3 空格缩进；闭合围栏须同字符、长度不小于起始标记、
 * 行尾仅允许空白；info string 首词为语言。
 */
export function parseFenceBlocks(doc: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  const lines = doc.split(/\n/);
  let offset = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(OPEN_FENCE_RE);
    if (open === null) {
      offset += line.length + 1;
      i += 1;
      continue;
    }
    const marker = open[1];
    const markerChar = marker[0];
    const markerLen = marker.length;
    const info = open[3] ?? '';
    const indentLen = line.length - line.replace(/^ +/, '').length;
    const markerStart = offset + indentLen;
    const langFrom = markerStart + markerLen + (open[2]?.length ?? 0);
    const langMatch = info.match(LANG_TOKEN_RE);
    const lang = langMatch?.[0] ?? '';
    const langTo = langFrom + lang.length;

    const closeRe = new RegExp(`^ {0,3}${markerChar}{${markerLen},}\\s*$`);
    let closeEnd = doc.length;
    let closeFrom = doc.length;
    let closed = false;
    let j = i + 1;
    let innerOffset = offset + line.length + 1;
    while (j < lines.length) {
      const closeLine = lines[j];
      if (closeRe.test(closeLine)) {
        closeFrom = innerOffset;
        closeEnd = innerOffset + closeLine.length;
        closed = true;
        break;
      }
      innerOffset += closeLine.length + 1;
      j += 1;
    }

    blocks.push({
      from: offset,
      to: closeEnd,
      closeFrom,
      openEnd: offset + line.length,
      lang,
      langFrom,
      langTo,
      closed,
    });
    if (!closed) break;
    i = j + 1;
    offset = closeEnd + 1;
  }
  return blocks;
}

/** 语言标签可选项（围栏补全同款常用集） */
export const CODEBLOCK_LANG_OPTIONS: string[] = Array.from(new Set(FENCE_LANGUAGES.map((l) => l.label))).sort();

interface LangApplyTarget {
  view: EditorView;
  langFrom: number;
  langTo: number;
}

function selectionTouchesOpenLine(view: EditorView, block: FenceBlock): boolean {
  const sel = view.state.selection.main;
  return sel.to >= block.from && sel.from <= block.openEnd;
}

function caretInBlock(view: EditorView, from: number, to: number): boolean {
  const head = view.state.selection.main.head;
  return head > from && head < to;
}

/** 构建扩展：代码块语言标签 + math/围栏块编辑态描边（E3） */
export function buildCodeBlockLabelExtension(): Extension {
  const cm = resolveCm();
  const { ViewPlugin, Decoration, EditorView, RangeSetBuilder } = cm;

  class CodeBlockLangWidget extends cm.WidgetType {
    constructor(
      readonly lang: string,
      readonly target: LangApplyTarget,
    ) { super(); }

    eq(other: WidgetType): boolean {
      return other instanceof CodeBlockLangWidget
        && other.lang === this.lang
        && other.target.langFrom === this.target.langFrom
        && other.target.langTo === this.target.langTo;
    }

    toDOM(): HTMLElement {
      const label = document.createElement('span');
      label.className = CODEBLOCK_LANG_CLASS;
      label.textContent = this.lang === '' ? '语言' : this.lang.toUpperCase();
      label.setAttribute('role', 'button');
      label.title = '点击修改代码块语言';
      label.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (label.querySelector('select') !== null) return;
        const select = document.createElement('select');
        select.className = 'mellow-codeblock-lang-select';
        select.appendChild(new Option('(无语言)', ''));
        for (const l of CODEBLOCK_LANG_OPTIONS) select.appendChild(new Option(l, l));
        select.value = this.lang;
        label.textContent = '';
        label.appendChild(select);
        select.addEventListener('click', (se) => se.stopPropagation());
        select.addEventListener('change', () => {
          this.target.view.dispatch({
            changes: { from: this.target.langFrom, to: this.target.langTo, insert: select.value },
          });
        });
      });
      return label;
    }

    ignoreEvent(): boolean {
      return true;
    }
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<DecorationT>();
    const doc = view.state.doc.toString();
    const docLen = doc.length;
    interface Entry { from: number; to: number; deco: DecorationT; rank: number }
    const entries: Entry[] = [];

    for (const block of parseFenceBlocks(doc)) {
      if (!block.closed) continue;
      if (!selectionTouchesOpenLine(view, block)) {
        entries.push({
          from: block.openEnd,
          to: block.openEnd,
          deco: Decoration.widget({ widget: new CodeBlockLangWidget(block.lang, {
            view,
            langFrom: block.langFrom,
            langTo: block.langTo,
          }), side: 1 }),
          rank: 1,
        });
      }
      if (caretInBlock(view, block.from, block.to)) {
        // 编辑态描边：起始行与闭合行之间的代码行（不含闭合行）
        let pos = block.from;
        while (pos <= docLen) {
          const lineEnd = doc.indexOf('\n', pos);
          const end = lineEnd === -1 ? docLen : lineEnd;
          if (pos > block.from && pos < block.closeFrom) {
            entries.push({ from: pos, to: pos, deco: Decoration.line({ class: EDITING_OUTLINE_CLASS }), rank: 0 });
          }
          if (lineEnd === -1 || pos >= block.closeFrom) break;
          pos = end + 1;
        }
      }
    }

    // math $$…$$ 块编辑态描边（块 span 内各行）
    for (const s of parseMathSpans(doc)) {
      if (s.kind !== 'block') continue;
      if (!caretInBlock(view, s.from, s.to)) continue;
      let pos = s.from;
      while (pos <= docLen) {
        const lineEnd = doc.indexOf('\n', pos);
        const end = lineEnd === -1 ? docLen : lineEnd;
        entries.push({ from: pos, to: pos, deco: Decoration.line({ class: EDITING_OUTLINE_CLASS }), rank: 0 });
        if (lineEnd === -1 || end >= s.to) break;
        pos = end + 1;
      }
    }

    entries.sort((a, b) => (a.from - b.from) || (a.rank - b.rank));
    for (const e of entries) builder.add(e.from, e.to, e.deco);
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(class CodeBlockLabelPlugin {
    decorations: DecorationSet;
    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
      if (isComposing(update.view)) return;
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  }, { decorations: (value: { decorations: DecorationSet }) => value.decorations });

  const theme = EditorView.theme({
    [`.${CODEBLOCK_LANG_CLASS}`]: {
      marginLeft: '8px',
      padding: '0 6px',
      fontSize: '12px',
      lineHeight: '18px',
      borderRadius: '3px',
      opacity: '0.55',
      cursor: 'pointer',
      userSelect: 'none',
      verticalAlign: 'middle',
    },
    [`.${CODEBLOCK_LANG_CLASS}:hover`]: {
      opacity: '1',
    },
    '.mellow-codeblock-lang-select': {
      fontSize: '12px',
    },
    [`.cm-line.${EDITING_OUTLINE_CLASS}`]: {
      borderLeft: '2px solid rgba(59, 130, 246, 0.45)',
      background: 'rgba(59, 130, 246, 0.06)',
    },
  });

  return [plugin, theme];
}
