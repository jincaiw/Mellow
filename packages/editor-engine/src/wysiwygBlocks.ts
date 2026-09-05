/**
 * V5 非聚焦块渲染（Typora WYSIWYG 对齐）+ Github 排版样式。
 *
 * 分工边界（避免与既有 reveal 框架冲突）：
 * - 源码标记隐藏（`>` / `#` / setext 底线）由 plugin.ts reveal 框架负责（v1.4.x 已有，
 *   MARKER_CLASS fontSize:0；Blockquote idle 全隐藏/caret 行显示）；
 * - 本扩展只做增量：
 *   1. 行级渲染 class：引用竖线+灰字（github.css blockquote 真值）、标题 margin/lh/border、
 *      顶层块距 0.8em（与 reveal 的 fontSize:0 兼容——marker 已无宽度，文本自然贴齐竖线）；
 *   2. FencedCode：开行/闭行隐藏（reveal 显式不处理代码块，spec §16 source-oriented），
 *      语言标签驻留块右上角；
 *   3. HorizontalRule：整行隐藏渲染为 2px 线（reveal 未注册 HR）。
 *
 * Markdown 文本始终是唯一真源（Decoration.replace 仅影响视觉）。
 * 表格渲染走 table/liveView.ts；front matter 走 yamlFrontMatter.ts。
 */

import type { EditorState, Extension } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { isSourceMode } from './mode';
import { isLargeFileMode, largeFileVersion } from './largeFile';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  StateField: typeof import('@codemirror/state').StateField;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-wysiwyg] window.require unavailable');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  return {
    EditorView: view.EditorView,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    StateField: state.StateField,
    syntaxTree: language.syntaxTree,
  };
}

/** 代码块语言标签（非聚焦时代码块右上角驻留） */
function createCodeLangLabel(cm: CmRuntime) {
  const { WidgetType } = cm;
  return class CodeLangLabel extends WidgetType {
    constructor(readonly lang: string) {
      super();
    }

    override eq(other: CodeLangLabel): boolean {
      return other.lang === this.lang;
    }

    override toDOM(): HTMLElement {
      const span = document.createElement('span');
      span.className = 'mellow-code-lang-label';
      span.textContent = this.lang;
      span.setAttribute('aria-hidden', 'true');
      return span;
    }

    override ignoreEvent(): boolean {
      return true;
    }
  };
}

interface CollectedNode {
  name: string;
  from: number;
  to: number;
  syntax: import('@lezer/common').SyntaxNode;
}

/** 顶层参与 0.8em 块距的节点类型（标题/代码块/表格有专属 margin，不参与） */
const SPACED_BLOCKS = new Set(['Paragraph', 'Blockquote', 'BlockQuote', 'BulletList', 'OrderedList', 'HorizontalRule']);

export function buildWysiwygBlocksExtension(): Extension {
  const cm = resolveCm();
  const { Decoration, StateField, syntaxTree, EditorView } = cm;
  const CodeLangLabel = createCodeLangLabel(cm);
  const hiddenReplace = Decoration.replace({});

  const buildDecorations = (state: EditorState): DecorationSet => {
    if (isSourceMode() || isLargeFileMode()) {
      return Decoration.none;
    }

    const selection = state.selection.main;
    const intersects = (from: number, to: number): boolean =>
      selection.from <= to && selection.to >= from;

    // ── 第一遍：收集可见范围内块节点 ──
    const nodes: CollectedNode[] = [];
    syntaxTree(state).iterate({
      from: 0,
      to: state.doc.length,
      enter: (node) => {
        const { name } = node;
        if (
          name === 'FencedCode' || name === 'Table' || name === 'Blockquote' || name === 'BlockQuote'
          || name === 'HorizontalRule' || name.startsWith('ATXHeading')
          || name === 'SetextHeading1' || name === 'SetextHeading2'
          || name === 'ListItem'
          || SPACED_BLOCKS.has(name)
        ) {
          if (node.from < node.to) {
            nodes.push({ name, from: node.from, to: node.to, syntax: node.node });
          }
        }
      },
    });

    const opaque = nodes.filter((n) => n.name === 'FencedCode' || n.name === 'Table');
    const inOpaque = (pos: number): boolean =>
      opaque.some((range) => pos >= range.from && pos <= range.to);

    const decos: import('@codemirror/state').Range<import('@codemirror/view').Decoration>[] = [];
    const seenReplace = new Set<number>(); // 行级 replace 去重（防同区间重叠断言）

    // ── 第二遍 A：引用行渲染 class（竖线/缩进/灰字；marker 隐藏由 reveal 框架负责）──
    for (const node of nodes) {
      if (node.name !== 'Blockquote' && node.name !== 'BlockQuote') continue;
      let line = state.doc.lineAt(node.from);
      while (line.from <= node.to) {
        if (!inOpaque(line.from)) {
          const text = state.doc.sliceString(line.from, Math.min(line.to, line.from + 128));
          const prefix = /^(?:[ \t]*>[ \t]?)+/.exec(text);
          const depth = prefix === null ? 1 : Math.min(Math.max(prefix[0].match(/>/g)?.length ?? 1, 1), 3);
          decos.push(Decoration.line({ class: `mellow-quote-line mellow-quote-d${depth}` }).range(line.from));
        }
        if (line.to >= node.to) break;
        const next = state.doc.lineAt(line.to + 1);
        if (next.from <= line.from) break;
        line = next;
      }
    }

    // ── 第二遍 B：块级 replace 与排版 class ──
    for (const node of nodes) {
      const { name, from, to, syntax } = node;

      if (name === 'FencedCode') {
        if (intersects(from, to)) continue;
        const firstLine = state.doc.lineAt(from);
        const lastLine = state.doc.lineAt(to);
        const info = syntax.getChild('CodeInfo');
        const lang = info === null ? '' : state.doc.sliceString(info.from, info.to);
        if (!seenReplace.has(firstLine.number)) {
          seenReplace.add(firstLine.number);
          decos.push(Decoration.replace({
            widget: new CodeLangLabel(lang),
          }).range(firstLine.from, firstLine.to));
        }
        if (lastLine.number !== firstLine.number && !seenReplace.has(lastLine.number)) {
          seenReplace.add(lastLine.number);
          decos.push(hiddenReplace.range(lastLine.from, lastLine.to));
        }
        continue;
      }

      if (name === 'HorizontalRule') {
        if (intersects(from, to)) continue;
        const line = state.doc.lineAt(from);
        if (!seenReplace.has(line.number)) {
          seenReplace.add(line.number);
          decos.push(hiddenReplace.range(line.from, line.to));
        }
        decos.push(Decoration.line({ class: 'mellow-hr-line' }).range(line.from));
        continue;
      }

      if (name.startsWith('ATXHeading')) {
        // marker 隐藏走 reveal 框架；此处仅排版 class
        const level = name.slice('ATXHeading'.length);
        decos.push(Decoration.line({ class: `mellow-heading-line mellow-h${level}` }).range(state.doc.lineAt(from).from));
        continue;
      }

      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const level = name.slice('SetextHeading'.length);
        decos.push(Decoration.line({ class: `mellow-heading-line mellow-h${level}` }).range(state.doc.lineAt(from).from));
        continue;
      }

      // ── 列表项间距（V6-P1 1.2.4，Typora github.css li 间距观感）──
      // 仅首个 item 不加（与列表上方块距 0.8em 相接），后续 item 首行加 0.25em 上边距
      if (name === 'ListItem') {
        if (syntax.prevSibling !== null) {
          decos.push(Decoration.line({ class: 'mellow-li-gap' }).range(state.doc.lineAt(from).from));
        }
        continue;
      }

      // ── 顶层块距（0.8em）──
      if (SPACED_BLOCKS.has(name) && syntax.parent?.name === 'Document') {
        const firstLine = state.doc.lineAt(from);
        const lastLine = state.doc.lineAt(to);
        decos.push(Decoration.line({ class: 'mellow-block-first' }).range(firstLine.from));
        if (lastLine.number !== firstLine.number) {
          decos.push(Decoration.line({ class: 'mellow-block-last' }).range(lastLine.from));
        } else {
          decos.push(Decoration.line({ class: 'mellow-block-last' }).range(firstLine.from));
        }
      }
    }

    return Decoration.set(decos, true);
  };

  interface WysiwygState {
    decorations: DecorationSet;
    sourceMode: boolean;
    largeVersion: number;
  }

  const field = StateField.define<WysiwygState>({
    create: (state) => ({
      decorations: buildDecorations(state),
      sourceMode: isSourceMode(),
      largeVersion: largeFileVersion(),
    }),
    update: (value, transaction) => {
      const sourceMode = isSourceMode();
      const nextLargeVersion = largeFileVersion();
      const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
      if (
        transaction.docChanged
        || selectionChanged
        || value.sourceMode !== sourceMode
        || value.largeVersion !== nextLargeVersion
      ) {
        return {
          decorations: buildDecorations(transaction.state),
          sourceMode,
          largeVersion: nextLargeVersion,
        };
      }
      return value;
    },
  });

  const theme = EditorView.theme({
    // ── 引用块（github.css: border-left 4px #dfe2e5; padding 0 15px; color #777）──
    '.cm-line.mellow-quote-line': {
      position: 'relative',
      borderLeft: '4px solid var(--mellow-md-quote-border, #dfe2e5)',
      paddingLeft: '15px',
      color: 'var(--mellow-md-quote-fg, #777777)',
    },
    // 嵌套引用：第二/三条竖线（border 只有一条，::before 补画）
    '.cm-line.mellow-quote-d2': {
      paddingLeft: '34px',
    },
    '.cm-line.mellow-quote-d2::before': {
      content: "''",
      display: 'block',
      width: '4px',
      position: 'absolute',
      left: '15px',
      top: '0',
      bottom: '0',
      background: 'var(--mellow-md-quote-border, #dfe2e5)',
    },
    '.cm-line.mellow-quote-d3': {
      paddingLeft: '53px',
    },
    '.cm-line.mellow-quote-d3::before': {
      content: "''",
      display: 'block',
      width: '4px',
      position: 'absolute',
      left: '34px',
      top: '0',
      bottom: '0',
      background: 'var(--mellow-md-quote-border, #dfe2e5)',
    },

    // ── 代码块容器（github.css .md-fences: bg #f8f8f8; border #e7eaed; radius 3px; margin 15px 0）──
    '.cm-md-codeBlockWrapper': {
      position: 'relative',
      backgroundColor: 'var(--mellow-md-code-bg, #f8f8f8)',
      border: '1px solid var(--mellow-md-code-border, #e7eaed)',
      borderRadius: '3px',
      margin: '15px 0',
    },
    '.mellow-code-lang-label': {
      position: 'absolute',
      right: '10px',
      top: '6px',
      fontSize: '11px',
      lineHeight: '1.4',
      color: 'var(--mellow-md-quote-fg, #777777)',
      opacity: '0.7',
      pointerEvents: 'none',
    },

    // ── 分隔线（github.css hr: 2px #e7e7e7）──
    '.cm-line.mellow-hr-line': {
      fontSize: '0',
      lineHeight: '0',
    },
    '.cm-line.mellow-hr-line::after': {
      content: "''",
      display: 'block',
      height: '2px',
      background: 'var(--mellow-md-hr, #e7e7e7)',
      margin: '16px 0',
    },

    // ── 标题排版（github.css: bold; margin 1rem 0; lh 按级; h1/h2 底线 1px #eee）──
    '.cm-line.mellow-heading-line': {
      fontWeight: 'bold',
      marginTop: '1rem',
      marginBottom: '1rem',
    },
    '.cm-line.mellow-h1': {
      lineHeight: '1.2',
      borderBottom: '1px solid var(--mellow-md-heading-border, #eeeeee)',
      paddingBottom: '0.2em',
    },
    '.cm-line.mellow-h2': {
      lineHeight: '1.225',
      borderBottom: '1px solid var(--mellow-md-heading-border, #eeeeee)',
      paddingBottom: '0.2em',
    },
    '.cm-line.mellow-h3': {
      lineHeight: '1.43',
    },
    '.cm-line.mellow-h4, .cm-line.mellow-h5': {
      lineHeight: '1.4',
    },
    '.cm-line.mellow-h6': {
      lineHeight: '1.4',
      color: 'var(--mellow-md-quote-fg, #777777)',
    },

    // ── 顶层块距（github.css: p/blockquote/ul/ol margin 0.8em 0）──
    '.cm-line.mellow-block-first': {
      marginTop: '0.8em',
    },
    '.cm-line.mellow-block-last': {
      marginBottom: '0.8em',
    },

    // ── 列表项间距（V6-P1 1.2.4：非首 item 首行 0.25em 上边距）──
    '.cm-line.mellow-li-gap': {
      marginTop: '0.25em',
    },

    // ── 链接色（V6-P1：Typora 蓝 #0969da，github.css 新版真值）──
    '.cm-md-url': {
      color: 'var(--mellow-md-link, #0969da)',
    },
  });

  return [
    field,
    EditorView.decorations.from(field, (value) => value.decorations),
    theme,
  ];
}
