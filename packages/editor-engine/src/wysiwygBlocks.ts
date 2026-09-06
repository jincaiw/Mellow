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

/** 代码块语言标签 + 复制按钮（非聚焦时代码块右上角驻留；v1.5.4 增加复制按钮） */
function createCodeLangLabel(cm: CmRuntime) {
  const { WidgetType } = cm;
  return class CodeLangLabel extends WidgetType {
    constructor(readonly lang: string, readonly code: string) {
      super();
    }

    override eq(other: CodeLangLabel): boolean {
      return other.lang === this.lang && other.code === this.code;
    }

    override toDOM(): HTMLElement {
      const zh = /^zh/i.test(typeof navigator !== 'undefined' ? navigator.language : 'en');
      const wrap = document.createElement('span');
      wrap.className = 'mellow-code-lang-label';
      wrap.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'mellow-code-lang-text';
      text.textContent = this.lang;
      wrap.appendChild(text);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mellow-code-copy-btn';
      btn.textContent = zh ? '复制' : 'Copy';
      btn.title = zh ? '复制代码' : 'Copy code';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyCodeText(this.code, btn, zh);
      });
      wrap.appendChild(btn);
      return wrap;
    }

    override ignoreEvent(): boolean {
      return true;
    }
  };
}

/** 复制反馈 + 剪贴板写入（navigator.clipboard 优先，execCommand 兜底） */
function copyCodeText(text: string, btn: HTMLButtonElement, zh: boolean): void {
  const original = btn.textContent;
  const done = (): void => {
    btn.textContent = zh ? '已复制' : 'Copied';
    window.setTimeout(() => { btn.textContent = original; }, 1200);
  };
  const fallback = (): boolean => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  };
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === 'function') {
    void clip.writeText(text).then(done).catch(() => { if (fallback()) done(); });
  } else if (fallback()) {
    done();
  }
}

/** 围栏代码文本（复制按钮载荷）：闭合/未闭合/单行围栏统一收口 */
function fenceCodeText(
  state: EditorState,
  firstLine: { to: number; number: number; text: string },
  lastLine: { from: number; to: number; number: number; text: string },
): string {
  if (lastLine.number > firstLine.number) {
    const closed = /^\s*(?:`{3,}|~{3,})\s*$/.test(lastLine.text.trimEnd());
    const from = firstLine.to + 1;
    const to = closed ? lastLine.from : lastLine.to;
    return to > from ? state.doc.sliceString(from, to) : '';
  }
  // 单行围栏 ```code```：剥标记取内容
  const m = /^\s*(?:`{3,}|~{3,})\s*[^`]*?(.*?)\s*(?:`{3,}|~{3,})\s*$/.exec(firstLine.text);
  return m === null ? '' : m[1];
}

// ── 引擎级标题字号阶梯（v1.5.4 真机兜底）──
// CoreEditor 的 span-class 字号路径在真机 WKWebView 上失效（v1.5.1–v1.5.3 均未复现修复），
// 而引擎行装饰在真机已验证有效（粗体/底线/引用竖线均在）。此处在行装饰 attributes.style
// 直接写 font-size（真源 window.config.fontSize + headerFontSizeDiffs），绕过 span-class 路径。
interface HeadingFontConfig {
  fontSize?: number;
  headerFontSizeDiffs?: number[];
}

function readHeadingFontConfig(): { base: number; diffs: number[] } | null {
  const cfg = (window as unknown as { config?: HeadingFontConfig }).config;
  const base = cfg?.fontSize;
  if (typeof base !== 'number' || !Number.isFinite(base) || base <= 0) return null;
  const raw = Array.isArray(cfg?.headerFontSizeDiffs) ? cfg.headerFontSizeDiffs : [];
  const diffs = [0, 1, 2, 3, 4, 5].map((i) =>
    (typeof raw[i] === 'number' && Number.isFinite(raw[i]) ? raw[i] : 0));
  return { base, diffs };
}

/** 字号签名：StateField 据此感知设置变更（任意事务触发 update 时比对） */
function headingFontSignature(): string {
  const c = readHeadingFontConfig();
  return c === null ? '' : `${c.base}|${c.diffs.join(',')}`;
}

function headingFontSizePx(level: number): string | null {
  const c = readHeadingFontConfig();
  if (c === null || !(level >= 1 && level <= 6)) return null;
  return `${c.base + (c.diffs[level - 1] ?? 0)}px`;
}

/** 设置变更（setFontSize / ⌘+ 滚轮）后调用：对当前视图派发空事务触发重建 */
export function bumpHeadingFont(): void {
  const view = (window as unknown as { editor?: { dispatch: (tr: { effects: readonly unknown[] }) => void } }).editor;
  try {
    view?.dispatch({ effects: [] });
  } catch {
    // 视图未就绪时忽略；下次任意事务经 fontKey 比对自然重建
  }
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
        const codeText = fenceCodeText(state, firstLine, lastLine);
        if (!seenReplace.has(firstLine.number)) {
          seenReplace.add(firstLine.number);
          decos.push(Decoration.replace({
            widget: new CodeLangLabel(lang, codeText),
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
        // marker 隐藏走 reveal 框架；此处排版 class + 引擎级字号（真机兜底，见文件头说明）
        const level = Number(name.slice('ATXHeading'.length));
        const style = headingFontSizePx(level);
        decos.push(Decoration.line({
          class: `mellow-heading-line mellow-h${name.slice('ATXHeading'.length)}`,
          ...(style === null ? {} : { attributes: { style: `font-size: ${style}` } }),
        }).range(state.doc.lineAt(from).from));
        continue;
      }

      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const levelText = name.slice('SetextHeading'.length);
        const style = headingFontSizePx(Number(levelText));
        decos.push(Decoration.line({
          class: `mellow-heading-line mellow-h${levelText}`,
          ...(style === null ? {} : { attributes: { style: `font-size: ${style}` } }),
        }).range(state.doc.lineAt(from).from));
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
    fontKey: string;
  }

  const field = StateField.define<WysiwygState>({
    create: (state) => ({
      decorations: buildDecorations(state),
      sourceMode: isSourceMode(),
      largeVersion: largeFileVersion(),
      fontKey: headingFontSignature(),
    }),
    update: (value, transaction) => {
      const sourceMode = isSourceMode();
      const nextLargeVersion = largeFileVersion();
      const nextFontKey = headingFontSignature();
      const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
      if (
        transaction.docChanged
        || selectionChanged
        || value.sourceMode !== sourceMode
        || value.largeVersion !== nextLargeVersion
        || value.fontKey !== nextFontKey
      ) {
        return {
          decorations: buildDecorations(transaction.state),
          sourceMode,
          largeVersion: nextLargeVersion,
          fontKey: nextFontKey,
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
    // 嵌套引用：第二/三条竖线。v1.5.4 由绝对定位 ::before 改为多段 linear-gradient
    // 背景（padding-box 坐标：d2 条 @15–19px、d3 条 @15–19/34–38px）——消除对
    // position/abs 定位的依赖（真机 WKWebView 分段竖条异常的加固）。
    '.cm-line.mellow-quote-d2': {
      paddingLeft: '34px',
      background: 'linear-gradient(to right, transparent 0 15px, var(--mellow-md-quote-border, #dfe2e5) 15px 19px, transparent 19px)',
    },
    '.cm-line.mellow-quote-d3': {
      paddingLeft: '53px',
      background: 'linear-gradient(to right, transparent 0 15px, var(--mellow-md-quote-border, #dfe2e5) 15px 19px, transparent 19px 34px, var(--mellow-md-quote-border, #dfe2e5) 34px 38px, transparent 38px)',
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
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    // v1.5.4：代码块复制按钮（容器 pointer-events:none，按钮单独恢复可点）
    '.mellow-code-copy-btn': {
      pointerEvents: 'auto',
      fontSize: '11px',
      lineHeight: '1.4',
      padding: '0 6px',
      border: 'none',
      borderRadius: '3px',
      background: 'transparent',
      color: 'var(--mellow-md-quote-fg, #777777)',
      cursor: 'pointer',
      opacity: '0.85',
      fontFamily: 'inherit',
    },
    '.mellow-code-copy-btn:hover': {
      opacity: '1',
      background: 'var(--mellow-bg-hover, rgba(0, 0, 0, 0.06))',
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
    // V7-I4：块间距用 padding 而非 margin——margin 产生的行间「死区」会让
    // posAtCoords 把落在空隙里的点击映射到错误行（光标与鼠标位置分离）。
    // h1/h2 底线经 ::after 贴住文本，1rem 下间距留在 padding 内。
    '.cm-line.mellow-heading-line': {
      fontWeight: 'bold',
      paddingTop: '1rem',
      paddingBottom: '1rem',
    },
    '.cm-line.mellow-h1': {
      lineHeight: '1.2',
    },
    '.cm-line.mellow-h1::after': {
      content: "''",
      display: 'block',
      borderBottom: '1px solid var(--mellow-md-heading-border, #eeeeee)',
      marginTop: '0.2em',
    },
    '.cm-line.mellow-h2': {
      lineHeight: '1.225',
    },
    '.cm-line.mellow-h2::after': {
      content: "''",
      display: 'block',
      borderBottom: '1px solid var(--mellow-md-heading-border, #eeeeee)',
      marginTop: '0.2em',
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

    // ── 顶层块距（github.css: p/blockquote/ul/ol margin 0.8em 0；V7-I4 改 padding）──
    '.cm-line.mellow-block-first': {
      paddingTop: '0.8em',
    },
    '.cm-line.mellow-block-last': {
      paddingBottom: '0.8em',
    },

    // ── 列表项间距（V6-P1 1.2.4：非首 item 首行 0.25em 上边距；V7-I4 改 padding）──
    '.cm-line.mellow-li-gap': {
      paddingTop: '0.25em',
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
