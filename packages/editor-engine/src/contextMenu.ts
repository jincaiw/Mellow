/**
 * 编辑器右键菜单（Typora 深度对标 ⑩）。
 *
 * - 右键 → 检测点击上下文（文本 / 链接 / Wikilink / 图片 / 表格）→
 *   `window.__MELLOW_CONTEXT_MENU__?.(request)` 交给宿主（App 弹 ContextMenu）；
 * - 光标对齐原生行为：点击点不在当前选区时，右键把光标移到点击处；
 * - 宿主经 `window.__MELLOW_CONTEXT_ACTIONS__` 调用引擎动作
 *   （剪切/复制/粘贴/表格操作）；
 * - doc 文本不变（Source Fidelity）。
 */

import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isComposing } from './composition';
import { fencedRanges } from './safeHtml';
import { scanWikilinks } from './wikilink';
import { inlineCodeSpans } from './inlineExtras';
import { tableContext } from './table/keymap';
import { addRow, addRowAbove, deleteRow, addColumn, addColumnLeft, deleteColumn, tidyTable, moveRow, moveColumn, deleteTable, copyTable } from './table/commands';
import { copy } from './clipboardCopy';
import { parseMathSpans } from './math';
import { parseMermaidBlocks } from './mermaid';

export interface EditorContextMenuRequest {
  kind: 'text' | 'link' | 'wikilink' | 'image' | 'table' | 'code' | 'math' | 'mermaid';
  x: number;
  y: number;
  hasSelection: boolean;
  /** kind=link：markdown 链接 href */
  url?: string;
  /** kind=wikilink：[[name]] */
  name?: string;
  /** kind=image：源码 src（未解析） */
  src?: string;
  /** kind=code/math/mermaid：围栏语言（math 块为 'math'） */
  lang?: string;
}

export interface EditorContextActions {
  cut(): void;
  copy(): void;
  paste(): void;
  tableOp(op: 'addRowBelow' | 'deleteRow' | 'addColumnRight' | 'deleteColumn' | 'tidy' | 'addRowAbove' | 'addColumnLeft' | 'moveRowUp' | 'moveRowDown' | 'moveColumnLeft' | 'moveColumnRight' | 'deleteTable' | 'copyTable'): void;
  /** P1-1.7：复制光标处的数学/Mermaid 源码（右键菜单 → dispatchCommand → 此动作） */
  copySource(kind: 'math' | 'mermaid'): boolean;
}

export interface InlineLinkSpan {
  label: string;
  url: string;
}

function skippedAt(pos: number, codeRanges: Array<{ from: number; to: number }>, codeSpans: Array<{ from: number; to: number }>): boolean {
  return codeRanges.some((r) => pos >= r.from && pos < r.to) || codeSpans.some((r) => pos >= r.from && pos < r.to);
}

/** 扫描 `[label](url)` 行内链接（纯函数，可测）；pos 落在 span 内返回该链接 */
export function inlineLinkAt(doc: string, pos: number, codeRanges: Array<{ from: number; to: number }>): InlineLinkSpan | null {
  const codeSpans = inlineCodeSpans(doc);
  const re = /\[([^\]]+)\]\(([^)\n]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (skippedAt(from, codeRanges, codeSpans) || skippedAt(to - 1, codeRanges, codeSpans)) continue;
    if (pos >= from && pos <= to) {
      return { label: m[1], url: m[2].trim() };
    }
  }
  return null;
}

/** 扫描 `![alt](src)` 图片引用（纯函数，可测）；pos 落在引用内返回 src */
export function imageSourceAt(doc: string, pos: number, codeRanges: Array<{ from: number; to: number }>): string | null {
  const codeSpans = inlineCodeSpans(doc);
  const re = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (skippedAt(from, codeRanges, codeSpans) || skippedAt(to - 1, codeRanges, codeSpans)) continue;
    if (pos >= from && pos <= to) {
      return m[2].trim();
    }
  }
  return null;
}

/** 围栏语言视为数学块（Typora 数学块为 `$$`，代码块语言亦可为 math/latex/tex） */
const MATH_FENCE_LANGS = new Set(['math', 'latex', 'tex', 'katex', 'texmath']);

export interface CodeFenceHit {
  /** 围栏信息行上的语言，无语言时为空串 */
  lang: string;
  from: number;
  to: number;
}

/**
 * 扫描 ``` / ~~~ 围栏代码块；pos 落在围栏区间内（含信息行与结束行）返回语言。
 * 纯函数，可单测（P1-1.7：右键菜单 code/math/mermaid 分支）。
 */
export function codeFenceAt(doc: string, pos: number): CodeFenceHit | null {
  const lines = doc.split('\n');
  let offset = 0;
  let start: number | null = null;
  let marker: string | null = null;
  let lang = '';
  for (const line of lines) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (m !== null) {
      if (start === null) {
        start = offset;
        marker = m[1][0];
        lang = m[2].trim().toLowerCase();
      } else if (marker === m[1][0]) {
        const to = offset + line.length;
        if (pos >= start && pos <= to) return { lang, from: start, to };
        start = null;
        marker = null;
        lang = '';
      }
    }
    offset += line.length + 1;
  }
  // 未闭合围栏（Typora 允许文末不闭合）
  if (start !== null && pos >= start) return { lang, from: start, to: doc.length };
  return null;
}

/** pos 是否落在 `$$ … $$` 数学块内（走 math.ts 的统一扫描，避免第二套解析） */
export function mathBlockAt(doc: string, pos: number): boolean {
  return parseMathSpans(doc).some((span) => span.open === '$$' && pos >= span.from && pos <= span.to);
}

/** pos 是否落在 mermaid 围栏块内 */
export function mermaidBlockAt(doc: string, pos: number): boolean {
  return parseMermaidBlocks(doc).some((block) => pos >= block.from && pos <= block.to);
}

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  EditorSelection: typeof import('@codemirror/state').EditorSelection;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { ViewPlugin: view.ViewPlugin, EditorSelection: state.EditorSelection };
}

type MenuHandler = (request: EditorContextMenuRequest) => void;

function getMenuHandler(): MenuHandler | undefined {
  return (window as unknown as { __MELLOW_CONTEXT_MENU__?: MenuHandler }).__MELLOW_CONTEXT_MENU__;
}

/** 检测右键上下文（事件处理器内调用） */
function buildRequest(view: EditorView, pos: number | null, x: number, y: number, target: EventTarget | null): EditorContextMenuRequest {
  const doc = view.state.doc.toString();
  const hasSelection = !view.state.selection.main.empty;
  const base = { x, y, hasSelection };

  if (pos !== null) {
    const code = fencedRanges(doc);
    // 图片：DOM widget 命中优先（替换 decoration 时目标即图片元素）
    const el = target instanceof Element ? target.closest('.mellow-md-image') : null;
    if (el !== null) {
      const src = imageSourceAt(doc, pos, code);
      if (src !== null) return { ...base, kind: 'image', src };
    }
    const wl = scanWikilinks(doc, code).find((l) => pos >= l.from && pos <= l.to);
    if (wl !== undefined) return { ...base, kind: 'wikilink', name: wl.name };
    const link = inlineLinkAt(doc, pos, code);
    if (link !== null) return { ...base, kind: 'link', url: link.url };
    if (tableContext(view, pos) !== null) return { ...base, kind: 'table' };
    // P1-1.7：代码块 / 数学块 / Mermaid 分支（Typora 右键在这些块内给出块级操作）
    const fence = codeFenceAt(doc, pos);
    if (fence !== null) {
      if (fence.lang === 'mermaid') return { ...base, kind: 'mermaid', lang: fence.lang };
      if (MATH_FENCE_LANGS.has(fence.lang)) return { ...base, kind: 'math', lang: fence.lang };
      return { ...base, kind: 'code', lang: fence.lang };
    }
    if (mathBlockAt(doc, pos)) return { ...base, kind: 'math', lang: 'math' };
    if (mermaidBlockAt(doc, pos)) return { ...base, kind: 'mermaid', lang: 'mermaid' };
  }
  return { ...base, kind: 'text' };
}

/** 剪切/复制/粘贴：优先 execCommand（CM6 默认输入管线），失败降级 navigator.clipboard */
function tryExecCommand(cmd: 'cut' | 'copy' | 'paste'): boolean {
  try {
    return document.execCommand(cmd);
  } catch {
    return false;
  }
}

export function buildContextMenuExtension(): Extension {
  const cm = resolveCm();
  const { ViewPlugin, EditorSelection } = cm;

  const plugin = ViewPlugin.fromClass(
    class ContextMenuPlugin {
      constructor(readonly view: EditorView) {}
    },
    {
      eventHandlers: {
        contextmenu: (event: MouseEvent, view: EditorView): boolean => {
          if (isComposing(view)) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            // 原生文本视图行为：右键把光标移到点击处（若不在现有选区）
            const sel = view.state.selection.main;
            if (sel.empty || pos < sel.from || pos > sel.to) {
              view.dispatch({ selection: EditorSelection.cursor(pos) });
            }
          }
          const req = buildRequest(view, pos, event.clientX, event.clientY, event.target);
          getMenuHandler()?.(req);
          return true; // preventDefault：禁止系统菜单
        },
      },
    },
  );
  return plugin;
}

// 单编辑器 iframe：模块级视图引用（ViewPlugin 维护）
let activeView: EditorView | null = null;

export function installContextMenuApi(): void {
  const cm = resolveCm();
  const { EditorSelection } = cm;
  const api: EditorContextActions = {
    cut() {
      const view = activeView;
      if (view === null || view.state.selection.main.empty) return;
      view.focus();
      if (!tryExecCommand('cut')) {
        copy(view);
        const sel = view.state.selection.main;
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' }, selection: EditorSelection.cursor(sel.from) });
      }
    },
    copy() {
      const view = activeView;
      if (view === null || view.state.selection.main.empty) return;
      view.focus();
      if (!tryExecCommand('copy')) {
        copy(view);
      }
    },
    paste() {
      const view = activeView;
      if (view === null) return;
      view.focus();
      if (tryExecCommand('paste')) return;
      void navigator.clipboard?.readText?.().then((text) => {
        if (text !== '') {
          view.dispatch({ changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: text } });
        }
      }).catch(() => { /* 无剪贴板权限：静默 */ });
    },
    copySource(kind) {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      // 复制块内容而非围栏原文（Typora mathBlock.copyAsTex 语义）：
      // math → MathSpan.tex（$$ 定界内的 TeX）；mermaid → MermaidBlock.code（剥离 ``` 围栏）。
      // 完整围栏源仍由 copyMathSourceAt / copyMermaidSourceAt（命令面板/快捷键）提供。
      const source = kind === 'math'
        ? parseMathSpans(doc).find((s) => pos >= s.from && pos <= s.to)?.tex ?? null
        : parseMermaidBlocks(doc).find((b) => pos >= b.from && pos <= b.to)?.code ?? null;
      if (source === null) return false;
      void navigator.clipboard?.writeText?.(source).catch(() => { /* 无剪贴板权限：静默 */ });
      return true;
    },
    tableOp(op) {
      const view = activeView;
      if (view === null) return;
      const pos = view.state.selection.main.head;
      const ctx = tableContext(view, pos);
      if (ctx === null) return;
      const { model, cell } = ctx;
      switch (op) {
        case 'addRowBelow': addRow(view, model, cell.row); break;
        case 'addRowAbove': addRowAbove(view, model, cell.row); break;
        case 'deleteRow': deleteRow(view, model, cell.row); break;
        case 'addColumnRight': addColumn(view, model, cell.col); break;
        case 'addColumnLeft': addColumnLeft(view, model, cell.col); break;
        case 'deleteColumn': deleteColumn(view, model, cell.col); break;
        case 'tidy': tidyTable(view, model); break;
        case 'moveRowUp': moveRow(view, model, cell.row, 'up'); break;
        case 'moveRowDown': moveRow(view, model, cell.row, 'down'); break;
        case 'moveColumnLeft': moveColumn(view, model, cell.col, 'left'); break;
        case 'moveColumnRight': moveColumn(view, model, cell.col, 'right'); break;
        case 'deleteTable': deleteTable(view, model); break;
        case 'copyTable': copyTable(view, model); break;
      }
    },
  };
  (window as unknown as { __MELLOW_CONTEXT_ACTIONS__?: EditorContextActions }).__MELLOW_CONTEXT_ACTIONS__ = api;
}

/** 绑定当前 EditorView（ContextMenuViewTracker 构造/销毁时调用） */
function attachView(view: EditorView | null): void {
  activeView = view;
}

export function buildContextMenuViewTrackerExtension(): Extension {
  const cm = resolveCm();
  const tracker = cm.ViewPlugin.fromClass(
    class ContextMenuViewTracker {
      constructor(view: EditorView) {
        attachView(view);
      }
      destroy(): void {
        attachView(null);
      }
    },
    {},
  );
  return tracker as Extension;
}
