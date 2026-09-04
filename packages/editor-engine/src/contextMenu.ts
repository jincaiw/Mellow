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
import { addRow, addRowAbove, deleteRow, addColumn, addColumnLeft, deleteColumn, tidyTable, moveRow, moveColumn, deleteTable, copyTable, setColumnAlignment } from './table/commands';
import type { CellAlignment } from './table/parser';
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

/** 表格右键操作（C1：Typora table 子菜单 + 对齐子菜单） */
export type TableContextOp =
  | 'addRowBelow' | 'deleteRow' | 'addColumnRight' | 'deleteColumn' | 'tidy'
  | 'addRowAbove' | 'addColumnLeft' | 'moveRowUp' | 'moveRowDown'
  | 'moveColumnLeft' | 'moveColumnRight' | 'deleteTable' | 'copyTable'
  | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignDefault';

export interface EditorContextActions {
  cut(): void;
  copy(): void;
  paste(): void;
  tableOp(op: TableContextOp): void;
  /** P1-1.7：复制光标处的数学/Mermaid 源码（右键菜单 → dispatchCommand → 此动作） */
  copySource(kind: 'math' | 'mermaid'): boolean;
  /** C1：Typora code-tools 子菜单（复制内容 / 整体自动缩进 / 所选自动缩进 / 删除围栏 / 前后插入段落） */
  codeTool(op: 'copyContent' | 'autoIndentAll' | 'autoIndentSelected' | 'deleteFences' | 'insertParagraphBefore' | 'insertParagraphAfter'): boolean;
  /** C1：复制渲染结果为 PNG（math → MathML 转 PNG；mermaid → 渲染 SVG 转 PNG），写入剪贴板 */
  copyRendered(kind: 'math' | 'mermaid'): Promise<boolean>;
  /** C1：渲染导出（宿主「下载」用）：返回 PNG dataURL，无渲染结果时为 null */
  renderPng(kind: 'math' | 'mermaid'): Promise<string | null>;
  /** C1：复制光标处数学块渲染的 MathML 标记（Typora copyAsMathML） */
  copyMathMl(): boolean;
  /** C1：读取光标处链接 URL（编辑链接的默认值；无链接为 null） */
  getLinkUrl(): string | null;
  /** C2：文档级转换（保护代码围栏与行内代码）：尾随空格清理 */
  docTransform(op: 'trimTrailing'): boolean;
  /** C1：删除光标所在块（code/math/mermaid —— Typora 右键 delete 条目） */
  deleteBlock(kind: 'math' | 'mermaid' | 'code'): boolean;
  /** C1：图片引用的文档编辑类操作（Markdown↔HTML / 设置尺寸 / 改路径 / 删除引用） */
  imageSpanOp(op: 'mdToHtml' | 'htmlToMd' | 'setSize' | 'replaceSrc' | 'delete', arg?: string): boolean;
  /** C1：链接操作（编辑链接 URL / 移除链接保留文本） */
  setLinkUrl(url: string): boolean;
  unlink(): boolean;
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

/** 行内链接命中（C1：链接编辑/移除需要原文区间） */
export interface InlineLinkRangeHit extends InlineLinkSpan {
  from: number;
  to: number;
}

/** 扫描 `[label](url)` 行内链接；pos 落在引用内返回 label/url 与原文区间（纯函数，可测） */
export function inlineLinkRangeAt(doc: string, pos: number, codeRanges: Array<{ from: number; to: number }>): InlineLinkRangeHit | null {
  const codeSpans = inlineCodeSpans(doc);
  const re = /\[([^\]]+)\]\(([^)\n]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (skippedAt(from, codeRanges, codeSpans) || skippedAt(to - 1, codeRanges, codeSpans)) continue;
    if (pos >= from && pos <= to) {
      return { label: m[1], url: m[2].trim(), from, to };
    }
  }
  return null;
}

/** 图片引用命中（C1：Markdown↔HTML / 尺寸 / 改路径 / 删除需要结构化信息） */
export interface ImageSpanHit {
  alt: string;
  /** 尺寸后缀剥离后的 src（Typora 语义：`=WxH` 是显示属性，不是路径） */
  src: string;
  /** ` =WxH` 尺寸后缀（无则 null） */
  size: { w: number; h: number } | null;
  /** 整个 `![alt](…)` 的原文区间 */
  from: number;
  to: number;
}

/** 扫描 `![alt](src[ =WxH])` 图片引用；pos 落在引用内返回结构化信息（纯函数，可测） */
export function imageSpanFullAt(doc: string, pos: number, codeRanges: Array<{ from: number; to: number }>): ImageSpanHit | null {
  const codeSpans = inlineCodeSpans(doc);
  const re = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (skippedAt(from, codeRanges, codeSpans) || skippedAt(to - 1, codeRanges, codeSpans)) continue;
    if (pos >= from && pos <= to) {
      const inner = m[2].trim();
      const sizeMatch = inner.match(/\s+=(\d+)[xX](\d+)\s*$/);
      const size = sizeMatch !== null ? { w: Number(sizeMatch[1]), h: Number(sizeMatch[2]) } : null;
      const src = sizeMatch !== null ? inner.slice(0, sizeMatch.index).trim() : inner;
      return { alt: m[1], src, size, from, to };
    }
  }
  return null;
}

/** HTML 图片命中（C1：HTML → Markdown 转换）；仅匹配自闭合/双标签的单行 `<img …>` */
export interface HtmlImgHit {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  from: number;
  to: number;
}

export function htmlImgAt(doc: string, pos: number, codeRanges: Array<{ from: number; to: number }>): HtmlImgHit | null {
  const codeSpans = inlineCodeSpans(doc);
  const re = /<img\s+[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (skippedAt(from, codeRanges, codeSpans) || skippedAt(to - 1, codeRanges, codeSpans)) continue;
    if (pos >= from && pos <= to) {
      const tag = m[0];
      const attr = (name: string): string | null => {
        const am = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
        if (am === null) return null;
        return am[2] ?? am[3] ?? am[4] ?? null;
      };
      const num = (v: string | null): number | null => {
        if (v === null) return null;
        const nm = v.match(/^(\d+(?:\.\d+)?)px$/);
        return nm !== null ? Number(nm[1]) : null;
      };
      const style = attr('style') ?? '';
      const width = num(attr('width')) ?? num(style.match(/width\s*:\s*([^;]+)/i)?.[1]?.trim() ?? null);
      const height = num(attr('height')) ?? num(style.match(/height\s*:\s*([^;]+)/i)?.[1]?.trim() ?? null);
      return { src: attr('src') ?? '', alt: attr('alt') ?? '', width, height, from, to };
    }
  }
  return null;
}

/** 去除文本块的公共缩进（Typora code-tools「Auto Indent」语义，纯函数，可测） */
export function dedentText(text: string): string {
  const lines = text.split('\n');
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const m = line.match(/^[ \t]*/);
    min = Math.min(min, m?.[0].length ?? 0);
  }
  if (!Number.isFinite(min) || min === 0) return text;
  return lines.map((line) => (line.trim() === '' ? line : line.slice(min))).join('\n');
}

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

/** `$$` 数学块命中区间（C1：deleteBlock / 渲染导出需要原文区间） */
export function mathBlockRangeAt(doc: string, pos: number): { from: number; to: number } | null {
  const span = parseMathSpans(doc).find((s) => s.open === '$$' && pos >= s.from && pos <= s.to);
  return span !== undefined ? { from: span.from, to: span.to } : null;
}

/** mermaid 围栏块命中区间（C1） */
export function mermaidBlockRangeAt(doc: string, pos: number): { from: number; to: number } | null {
  const block = parseMermaidBlocks(doc).find((b) => pos >= b.from && pos <= b.to);
  return block !== undefined ? { from: block.from, to: block.to } : null;
}

/**
 * 围栏内容区间（剥离首尾围栏行；纯函数，可测）。
 * 未闭合围栏（文末）时内容延伸到 doc 末尾。
 */
export function fenceContentRange(doc: string, hit: { from: number; to: number }): { from: number; to: number } {
  const segment = doc.slice(hit.from, hit.to);
  const lines = segment.split('\n');
  const firstLen = lines[0]?.length ?? 0;
  let from = hit.from + firstLen + 1;
  let to = hit.to;
  const last = lines[lines.length - 1] ?? '';
  if (lines.length > 1 && /^ {0,3}(`{3,}|~{3,})\s*$/.test(last)) {
    to = hit.to - last.length - 1;
  }
  if (to < from) to = from;
  return { from, to };
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

// ─────────────────────────── C1：渲染导出（copy-as-image / download） ───────────────────────────

/** pos 处向上查找最近的匹配 widget 元素（右键目标块的渲染 DOM） */
function widgetElementAt(view: EditorView, pos: number, selector: string): Element | null {
  try {
    const dom = view.domAtPos(pos);
    const node = dom.node instanceof Element ? dom.node : dom.node.parentElement;
    return node?.closest(selector) ?? null;
  } catch {
    return null;
  }
}

/** SVG 字符串 → 白底 PNG dataURL（2x 缩放，保证清晰度）；失败返回 null */
function svgToPngDataUrl(svg: string): Promise<string | null> {
  return new Promise((resolve) => {
    let url: string | null = null;
    const img = new Image();
    const finish = (value: string | null): void => {
      if (url !== null) URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil((img.naturalWidth || 640) * scale));
      canvas.height = Math.max(1, Math.ceil((img.naturalHeight || 480) * scale));
      const ctx = canvas.getContext('2d');
      if (ctx === null) { finish(null); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      finish(canvas.toDataURL('image/png'));
    };
    img.onerror = () => finish(null);
    try {
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.src = url;
    } catch {
      finish(null);
    }
  });
}

/** MathML 标记 → 白底 PNG dataURL（`<math>` 为原生 MathML，无需外部样式表）；失败返回 null */
function mathmlToPngDataUrl(mathml: string): Promise<string | null> {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-10000px';
  holder.innerHTML = mathml;
  document.body.appendChild(holder);
  const math = holder.querySelector('math');
  if (math === null) {
    holder.remove();
    return Promise.resolve(null);
  }
  math.setAttribute('display', 'block');
  const rect = math.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width) + 48);
  const height = Math.max(1, Math.ceil(rect.height) + 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="background:#ffffff;padding:24px;font-size:21px;">${math.outerHTML}</div>` +
    `</foreignObject></svg>`;
  holder.remove();
  return svgToPngDataUrl(svg);
}

/** PNG dataURL → 写入剪贴板（image/png ClipboardItem） */
async function writePngToClipboard(dataUrl: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

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
    codeTool(op) {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      const fence = codeFenceAt(doc, pos);
      if (fence === null) return false;
      switch (op) {
        case 'copyContent': {
          const content = doc.slice(fenceContentRange(doc, fence).from, fenceContentRange(doc, fence).to);
          void navigator.clipboard?.writeText?.(content).catch(() => { /* 静默 */ });
          return true;
        }
        case 'autoIndentAll': {
          const range = fenceContentRange(doc, fence);
          const dedented = dedentText(doc.slice(range.from, range.to));
          if (dedented === doc.slice(range.from, range.to)) return false;
          view.dispatch({ changes: { from: range.from, to: range.to, insert: dedented } });
          return true;
        }
        case 'autoIndentSelected': {
          const sel = view.state.selection.main;
          const range = fenceContentRange(doc, fence);
          if (sel.empty || sel.from < range.from || sel.to > range.to) return false;
          const dedented = dedentText(doc.slice(sel.from, sel.to));
          if (dedented === doc.slice(sel.from, sel.to)) return false;
          view.dispatch({ changes: { from: sel.from, to: sel.to, insert: dedented } });
          return true;
        }
        case 'deleteFences': {
          const range = fenceContentRange(doc, fence);
          // 删除首行（含换行）与尾行；内容保留
          view.dispatch({
            changes: [
              { from: fence.from, to: range.from, insert: '' },
              { from: range.to, to: fence.to, insert: '' },
            ],
          });
          return true;
        }
        case 'insertParagraphBefore': {
          view.dispatch({ changes: { from: fence.from, to: fence.from, insert: '\n' }, selection: cm.EditorSelection.cursor(fence.from) });
          return true;
        }
        case 'insertParagraphAfter': {
          view.dispatch({ changes: { from: fence.to, to: fence.to, insert: '\n' }, selection: cm.EditorSelection.cursor(fence.to) });
          return true;
        }
      }
    },
    async copyRendered(kind) {
      const view = activeView;
      if (view === null) return false;
      const pos = view.state.selection.main.head;
      const dataUrl = kind === 'mermaid'
        ? await (async () => {
            const el = widgetElementAt(view, pos, '[data-mellow-mermaid-svg]');
            const svg = el?.getAttribute('data-mellow-mermaid-svg') ?? null;
            return svg !== null ? await svgToPngDataUrl(svg) : null;
          })()
        : await (async () => {
            const doc = view.state.doc.toString();
            const span = parseMathSpans(doc).find((s) => s.open === '$$' && pos >= s.from && pos <= s.to);
            const tex = span?.tex ?? null;
            if (tex === null) return null;
            const katex = (window as unknown as { katex?: { renderToString: (tex: string, opts: Record<string, unknown>) => string } }).katex;
            if (katex === undefined) return null;
            const mathml = katex.renderToString(tex, { output: 'mathml', displayMode: true, throwOnError: false });
            return await mathmlToPngDataUrl(mathml);
          })();
      if (dataUrl === null) return false;
      return await writePngToClipboard(dataUrl);
    },
    async renderPng(kind) {
      const view = activeView;
      if (view === null) return null;
      const pos = view.state.selection.main.head;
      if (kind === 'mermaid') {
        const el = widgetElementAt(view, pos, '[data-mellow-mermaid-svg]');
        const svg = el?.getAttribute('data-mellow-mermaid-svg') ?? null;
        if (svg === null) return null;
        return await svgToPngDataUrl(svg);
      }
      const doc = view.state.doc.toString();
      const span = parseMathSpans(doc).find((s) => s.open === '$$' && pos >= s.from && pos <= s.to);
      const tex = span?.tex ?? null;
      if (tex === null) return null;
      const katex = (window as unknown as { katex?: { renderToString: (tex: string, opts: Record<string, unknown>) => string } }).katex;
      if (katex === undefined) return null;
      const mathml = katex.renderToString(tex, { output: 'mathml', displayMode: true, throwOnError: false });
      return await mathmlToPngDataUrl(mathml);
    },
    deleteBlock(kind) {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      let range: { from: number; to: number } | null = null;
      if (kind === 'code') {
        const fence = codeFenceAt(doc, pos);
        if (fence !== null && fence.lang !== 'mermaid') range = { from: fence.from, to: fence.to };
      } else if (kind === 'mermaid') {
        range = codeFenceAt(doc, pos)?.lang === 'mermaid'
          ? { from: codeFenceAt(doc, pos)!.from, to: codeFenceAt(doc, pos)!.to }
          : mermaidBlockRangeAt(doc, pos);
      } else {
        range = mathBlockRangeAt(doc, pos);
      }
      if (range === null) return false;
      let { from, to } = range;
      // 吞掉块后随的一个换行（避免留空行）；否则吞前导换行
      if (doc.slice(to, to + 1) === '\n') to += 1;
      else if (doc.slice(from - 1, from) === '\n') from -= 1;
      view.dispatch({ changes: { from, to, insert: '' }, selection: cm.EditorSelection.cursor(from) });
      return true;
    },
    imageSpanOp(op, arg) {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      const code = fencedRanges(doc);
      // HTML <img> 只服务 htmlToMd；其余操作走 Markdown 引用
      if (op === 'htmlToMd') {
        const hit = htmlImgAt(doc, pos, code);
        if (hit === null) return false;
        const size = hit.width !== null && hit.height !== null ? ` =${hit.width}x${hit.height}` : '';
        view.dispatch({ changes: { from: hit.from, to: hit.to, insert: `![${hit.alt}](${hit.src}${size})` } });
        return true;
      }
      const hit = imageSpanFullAt(doc, pos, code);
      if (hit === null) return false;
      switch (op) {
        case 'mdToHtml': {
          const style = hit.size !== null ? ` style="width:${hit.size.w}px;height:${hit.size.h}px;"` : '';
          view.dispatch({ changes: { from: hit.from, to: hit.to, insert: `<img src="${hit.src}" alt="${hit.alt}"${style} />` } });
          return true;
        }
        case 'setSize': {
          // arg = 'WxH' 或 ''（清除尺寸）；保留路径与 alt
          const sizeText = arg !== undefined && /^\d+[xX]\d+$/.test(arg) ? ` =${arg.toLowerCase()}` : '';
          view.dispatch({ changes: { from: hit.from, to: hit.to, insert: `![${hit.alt}](${hit.src}${sizeText})` } });
          return true;
        }
        case 'replaceSrc': {
          if (arg === undefined || arg === '') return false;
          view.dispatch({ changes: { from: hit.from, to: hit.to, insert: `![${hit.alt}](${arg}${hit.size !== null ? ` =${hit.size.w}x${hit.size.h}` : ''})` } });
          return true;
        }
        case 'delete': {
          view.dispatch({ changes: { from: hit.from, to: hit.to, insert: '' } });
          return true;
        }
      }
    },
    setLinkUrl(url) {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      const hit = inlineLinkRangeAt(doc, pos, fencedRanges(doc));
      if (hit === null) return false;
      view.dispatch({ changes: { from: hit.from, to: hit.to, insert: `[${hit.label}](${url})` } });
      return true;
    },
    getLinkUrl() {
      const view = activeView;
      if (view === null) return null;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      return inlineLinkRangeAt(doc, pos, fencedRanges(doc))?.url ?? null;
    },
    docTransform(op) {
      const view = activeView;
      if (view === null || op !== 'trimTrailing') return false;
      const doc = view.state.doc.toString();
      // 保护范围：围栏代码块 + 行内代码 span（Typora 空白清理不动代码）
      const protectedRanges = [...fencedRanges(doc), ...inlineCodeSpans(doc)];
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      const re = /[ \t]+(?=\r?$)/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(doc)) !== null) {
        const from = m.index;
        const to = from + m[0].length;
        if (protectedRanges.some((r) => from < r.to && to > r.from)) continue;
        changes.push({ from, to, insert: '' });
      }
      if (changes.length === 0) return false;
      view.dispatch({ changes });
      return true;
    },
    copyMathMl() {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      const span = parseMathSpans(doc).find((s) => s.open === '$$' && pos >= s.from && pos <= s.to);
      const tex = span?.tex ?? null;
      if (tex === null) return false;
      const katex = (window as unknown as { katex?: { renderToString: (tex: string, opts: Record<string, unknown>) => string } }).katex;
      if (katex === undefined) return false;
      const mathml = katex.renderToString(tex, { output: 'mathml', displayMode: true, throwOnError: false });
      void navigator.clipboard?.writeText?.(mathml).catch(() => { /* 静默 */ });
      return true;
    },
    unlink() {
      const view = activeView;
      if (view === null) return false;
      const doc = view.state.doc.toString();
      const pos = view.state.selection.main.head;
      const hit = inlineLinkRangeAt(doc, pos, fencedRanges(doc));
      if (hit === null) return false;
      view.dispatch({ changes: { from: hit.from, to: hit.to, insert: hit.label } });
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
        // C1：对齐子菜单（Typora table 右键 Alignment；只 patch delimiter 行）
        case 'alignLeft': setColumnAlignment(view, model, cell.col, 'left' satisfies CellAlignment); break;
        case 'alignCenter': setColumnAlignment(view, model, cell.col, 'center' satisfies CellAlignment); break;
        case 'alignRight': setColumnAlignment(view, model, cell.col, 'right' satisfies CellAlignment); break;
        case 'alignDefault': {
          const dc = model.delimiterRow?.cells[cell.col];
          if (dc !== undefined) {
            view.dispatch({ changes: { from: dc.from, to: dc.to, insert: ' --- ' } });
          }
          break;
        }
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
