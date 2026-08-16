/** Typora 1.14 类浮动 Selection Toolbar。
 *
 * - selection 非空时在选区上方显示（空间不足则下方），不遮挡 selection；
 * - mousedown preventDefault → 不抢 focus；按钮 roving tabindex + 方向键 → keyboard accessible；
 * - IME composition 隐藏；Escape 关闭并归还焦点；可启用/关闭（localStorage 持久化）。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

export const SELECTION_TOOLBAR_CLASS = 'mellow-selection-toolbar';
const STORAGE_KEY = 'mellow.selectionToolbar.enabled';

export interface TextRange {
  from: number;
  to: number;
}

export interface ApplyResult {
  changes: Array<{ from: number; to: number; insert: string }>;
  selection: TextRange;
}

export interface ToolbarVisibility {
  enabled: boolean;
  composing: boolean;
  hasSelection: boolean;
  hidden: boolean;
}

export function shouldShowToolbar(input: ToolbarVisibility): boolean {
  return input.enabled && !input.composing && input.hasSelection && !input.hidden;
}

let enabled = true;
try {
  enabled = localStorage.getItem(STORAGE_KEY) !== '0';
} catch {
  enabled = true;
}

export function setSelectionToolbarEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* no-op */
  }
}

export function getSelectionToolbarEnabled(): boolean {
  return enabled;
}

export interface SelectionToolbarApi {
  setEnabled(on: boolean): void;
  getEnabled(): boolean;
  hide(): void;
}

function installApi(hide: () => void): void {
  (window as unknown as { __MELLOW_SELECTION_TOOLBAR__?: SelectionToolbarApi }).__MELLOW_SELECTION_TOOLBAR__ = {
    setEnabled: setSelectionToolbarEnabled,
    getEnabled: getSelectionToolbarEnabled,
    hide,
  };
}

// ── 纯格式化函数 ─────────────────────────────────────────────

export function applyInlineFormat(doc: string, range: TextRange, marker: string): ApplyResult {
  const selected = doc.slice(range.from, range.to);
  if (selected === '') return { changes: [], selection: range };
  const before = doc.slice(Math.max(0, range.from - marker.length), range.from);
  const after = doc.slice(range.to, range.to + marker.length);
  if (before === marker && after === marker) {
    return {
      changes: [{ from: range.from - marker.length, to: range.to + marker.length, insert: selected }],
      selection: { from: range.from - marker.length, to: range.to - marker.length },
    };
  }
  const full = marker + selected + marker;
  return {
    changes: [{ from: range.from, to: range.to, insert: full }],
    selection: { from: range.from + marker.length, to: range.to + marker.length },
  };
}

export function applyLink(doc: string, range: TextRange): ApplyResult {
  const selected = doc.slice(range.from, range.to) || '链接';
  const insert = `[${selected}]()`;
  const urlPos = range.from + insert.length - 1;
  return {
    changes: [{ from: range.from, to: range.to, insert }],
    selection: { from: urlPos, to: urlPos },
  };
}

function affectedLines(doc: string, range: TextRange): Array<{ start: number; end: number }> {
  if (range.from >= range.to) return [];
  const start = doc.lastIndexOf('\n', range.from - 1) + 1;
  const endPos = Math.max(range.from, range.to - 1);
  const lines: Array<{ start: number; end: number }> = [];
  let cursor = start;
  for (;;) {
    const nl = doc.indexOf('\n', cursor);
    const lineEnd = nl === -1 ? doc.length : nl;
    lines.push({ start: cursor, end: lineEnd });
    if (nl === -1 || nl >= endPos) break;
    cursor = nl + 1;
  }
  return lines;
}

/** 把原文档坐标映射到替换后坐标（含前缀插入/删除、caret 落在被删前缀内时钳制到行首） */
function mapPosition(pos: number, lines: Array<{ start: number }>, deltas: number[]): number {
  let shift = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const { start } = lines[i];
    const d = deltas[i];
    if (d < 0 && pos > start && pos < start - d) return start;
    if (start < pos) shift += d;
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].start === pos) shift += deltas[i];
  }
  return pos + shift;
}

export function applyBlockPrefix(doc: string, range: TextRange, prefix: string): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const allPrefixed = lines.every((line) => doc.startsWith(prefix, line.start));
  const d = allPrefixed ? -prefix.length : prefix.length;
  const deltas = lines.map(() => d);
  let replacement = '';
  let pos = lines[0].start;
  for (const line of lines) {
    replacement += doc.slice(pos, line.start);
    const content = doc.slice(line.start, line.end);
    replacement += allPrefixed ? content.slice(prefix.length) : prefix + content;
    pos = line.end;
  }
  const regionEnd = lines[lines.length - 1].end;
  return {
    changes: [{ from: lines[0].start, to: regionEnd, insert: replacement }],
    selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
  };
}

export function applyHeading(doc: string, range: TextRange, level: number): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const prefix = '#'.repeat(level) + ' ';
  const allSame = lines.every((line) => doc.startsWith(prefix, line.start));
  const deltas: number[] = [];
  let replacement = '';
  let pos = lines[0].start;
  for (const line of lines) {
    replacement += doc.slice(pos, line.start);
    const content = doc.slice(line.start, line.end);
    if (allSame) {
      replacement += content.slice(prefix.length);
      deltas.push(-prefix.length);
    } else {
      const match = /^(#{1,6})\s/.exec(content);
      if (match !== null) {
        replacement += prefix + content.slice(match[0].length);
        deltas.push(prefix.length - match[0].length);
      } else {
        replacement += prefix + content;
        deltas.push(prefix.length);
      }
    }
    pos = line.end;
  }
  const regionEnd = lines[lines.length - 1].end;
  return {
    changes: [{ from: lines[0].start, to: regionEnd, insert: replacement }],
    selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
  };
}

type ToolbarAction = 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'quote' | 'list' | 'highlight' | 'sup' | 'sub' | 'paragraph';

/** 成对 marker（空选区插入 caret 居中，Typora 行为） */
const PAIR_MARKERS: Partial<Record<ToolbarAction, string>> = {
  bold: '**', italic: '*', strike: '~~', code: '`', highlight: '==', sup: '^', sub: '~',
};
const ACTION_IDS = new Set<ToolbarAction>(['h1', 'h2', 'h3', 'bold', 'italic', 'strike', 'code', 'link', 'quote', 'list', 'highlight', 'sup', 'sub', 'paragraph']);

const ACTION_DEFS: Array<{ id: ToolbarAction; label: string; title: string }> = [
  { id: 'h1', label: 'H1', title: '一级标题' },
  { id: 'h2', label: 'H2', title: '二级标题' },
  { id: 'h3', label: 'H3', title: '三级标题' },
  { id: 'bold', label: 'B', title: '粗体' },
  { id: 'italic', label: 'I', title: '斜体' },
  { id: 'strike', label: 'S', title: '删除线' },
  { id: 'code', label: '</>', title: '行内代码' },
  { id: 'link', label: '🔗', title: '链接' },
  { id: 'quote', label: '❝', title: '引用' },
  { id: 'list', label: '•', title: '列表' },
];

function applyAction(action: ToolbarAction, doc: string, range: TextRange): ApplyResult {
  switch (action) {
    case 'h1': return applyHeading(doc, range, 1);
    case 'h2': return applyHeading(doc, range, 2);
    case 'h3': return applyHeading(doc, range, 3);
    case 'bold': return applyInlineFormat(doc, range, '**');
    case 'italic': return applyInlineFormat(doc, range, '*');
    case 'strike': return applyInlineFormat(doc, range, '~~');
    case 'code': return applyInlineFormat(doc, range, '`');
    case 'link': return applyLink(doc, range);
    case 'quote': return applyBlockPrefix(doc, range, '> ');
    case 'list': return applyBlockPrefix(doc, range, '- ');
    case 'highlight': return applyInlineFormat(doc, range, '==');
    case 'sup': return applyInlineFormat(doc, range, '^');
    case 'sub': return applyInlineFormat(doc, range, '~');
    case 'paragraph': {
      // 段落：去除标题前缀（Typora「段落」语义）
      const lines = affectedLines(doc, range);
      if (lines.length === 0) return { changes: [], selection: range };
      const deltas: number[] = [];
      let replacement = '';
      let pos = lines[0].start;
      for (const line of lines) {
        replacement += doc.slice(pos, line.start);
        const content = doc.slice(line.start, line.end);
        const m = /^#{1,6}\s/.exec(content);
        replacement += m !== null ? content.slice(m[0].length) : content;
        deltas.push(m !== null ? -m[0].length : 0);
        pos = line.end;
      }
      return {
        changes: [{ from: lines[0].start, to: lines[lines.length - 1].end, insert: replacement }],
        selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
      };
    }
  }
}

// ── 插件 ─────────────────────────────────────────────────────

export interface SelectionToolbarOptions {
  /** 测试注入：返回选区起始的视口坐标（默认 coordsAtPos - scroll） */
  getAnchor?: (view: EditorView, from: number) => { top: number; left: number } | null;
}

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

/** 当前编辑器视图（格式桥 / 菜单命令用） */
let activeFormatView: import('@codemirror/view').EditorView | null = null;

/** 统一格式应用（空选区 → 成对插入 caret 居中，对齐 Typora Cmd+B） */
function applyToView(action: ToolbarAction): void {
  const view = activeFormatView;
  if (view === null) return;
  const sel = view.state.selection.main;
  const doc = view.state.doc.toString();
  let result: ApplyResult;
  if (sel.empty) {
    if (PAIR_MARKERS[action] !== undefined) {
      // 成对 marker：空选区插入 caret 居中（Typora Cmd+B）
      const marker = PAIR_MARKERS[action] as string;
      result = {
        changes: [{ from: sel.head, to: sel.head, insert: marker + marker }],
        selection: { from: sel.head + marker.length, to: sel.head + marker.length },
      };
    } else {
      // 块级（heading/quote/list/paragraph）：作用于当前行（Typora Cmd+1 语义）
      const line = view.state.doc.lineAt(sel.head);
      result = applyAction(action, doc, { from: line.from, to: line.to });
    }
  } else {
    result = applyAction(action, doc, { from: sel.from, to: sel.to });
  }
  if (result.changes.length === 0) return;
  view.dispatch({
    changes: result.changes,
    selection: { anchor: result.selection.from, head: result.selection.to },
  });
  view.focus();
}

/** 宿主 → 引擎格式桥（菜单「格式/段落」调用） */
export function installFormatApi(): void {
  (window as unknown as { __MELLOW_FORMAT_API__?: { format: (action: string) => void } }).__MELLOW_FORMAT_API__ = {
    format: (action: string) => {
      if (ACTION_IDS.has(action as ToolbarAction)) applyToView(action as ToolbarAction);
    },
  };
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin };
}

export function buildSelectionToolbarExtension(options: SelectionToolbarOptions = {}): Extension {
  const { EditorView: CmEditorView, ViewPlugin } = resolveCm();
  const getAnchor = options.getAnchor ?? ((view: EditorView, from: number) => {
    let coords;
    try {
      coords = view.coordsAtPos(from);
    } catch {
      // CM 禁止在 update 中读布局（'Reading the editor layout isn't allowed during an update'）：
      // 本轮不定位（工具条隐藏），下次 update 重试。避免插件崩溃级联（布局未测量时 coordsAtPos 抛错）。
      coords = null;
    }
    if (coords === null) return null;
    const sc = view.scrollDOM;
    return { top: coords.top - sc.scrollTop, left: coords.left - sc.scrollLeft };
  });

  const plugin = ViewPlugin.fromClass(class SelectionToolbarPlugin {
    el: HTMLDivElement;
    buttons: HTMLButtonElement[] = [];
    visible = false;
    hiddenByEscape = false;
    focusIndex = 0;
    private onResize = (): void => { if (this.visible) this.position(); };

    constructor(readonly view: EditorView) {
      activeFormatView = view;
      this.el = document.createElement('div');
      this.el.className = SELECTION_TOOLBAR_CLASS;
      this.el.setAttribute('role', 'toolbar');
      this.el.setAttribute('aria-label', '格式工具栏');
      this.el.style.position = 'fixed';
      this.el.style.display = 'none';
      this.el.style.zIndex = '1000';
      this.el.style.userSelect = 'none';
      this.el.addEventListener('mousedown', (e) => e.preventDefault());
      this.el.addEventListener('keydown', (e) => this.onKeydown(e));
      this.el.addEventListener('focusin', () => this.syncRoving());

      for (const def of ACTION_DEFS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = def.id;
        button.textContent = def.label;
        button.title = def.title;
        button.tabIndex = -1;
        button.addEventListener('click', () => this.apply(def.id));
        this.buttons.push(button);
        this.el.appendChild(button);
      }

      view.dom.appendChild(this.el);
      window.addEventListener('resize', this.onResize);
      installApi(() => { this.hiddenByEscape = true; this.hideEl(); });
    }

    private syncRoving(): void {
      const focused = this.buttons.findIndex((b) => b === document.activeElement);
      this.focusIndex = focused >= 0 ? focused : this.focusIndex;
      this.buttons.forEach((b, i) => { b.tabIndex = i === this.focusIndex ? 0 : -1; });
    }

    private onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        this.hiddenByEscape = true;
        this.hideEl();
        this.view.focus();
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const dir = event.key === 'ArrowLeft' ? -1 : 1;
        this.focusIndex = (this.focusIndex + dir + this.buttons.length) % this.buttons.length;
        this.buttons[this.focusIndex].tabIndex = 0;
        this.buttons.forEach((b, i) => { if (i !== this.focusIndex) b.tabIndex = -1; });
        this.buttons[this.focusIndex].focus();
      }
    }

    private apply(action: ToolbarAction): void {
      applyToView(action);
    }

    private showEl(): void {
      this.visible = true;
      this.focusIndex = 0;
      this.buttons.forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });
      this.el.style.display = '';
      this.position();
    }

    hideEl(): void {
      this.visible = false;
      this.el.style.display = 'none';
    }

    private position(): void {
      const sel = this.view.state.selection.main;
      const anchor = getAnchor(this.view, sel.from);
      if (anchor === null) {
        this.hideEl();
        return;
      }
      const height = this.el.offsetHeight || 32;
      const top = anchor.top - height - 10;
      this.el.style.top = `${top < 4 ? anchor.top + 12 : top}px`;
      const width = this.el.offsetWidth || 200;
      const left = Math.min(anchor.left, Math.max(4, window.innerWidth - width - 8));
      this.el.style.left = `${left}px`;
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet) this.hiddenByEscape = false;
      const sel = update.state.selection.main;
      const show = shouldShowToolbar({ enabled, composing: isComposing(), hasSelection: !sel.empty, hidden: this.hiddenByEscape });
      if (show !== this.visible) {
        if (show) this.showEl();
        else this.hideEl();
      }
      if (this.visible && (update.docChanged || update.selectionSet || update.viewportChanged)) {
        this.position();
      }
    }

    destroy(): void {
      window.removeEventListener('resize', this.onResize);
      this.el.remove();
    }
  }, {
    eventHandlers: {
      keydown(event: KeyboardEvent, view: EditorView) {
        if (event.key === 'Escape' && this.visible) {
          this.hiddenByEscape = true;
          this.hideEl();
          view.focus();
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  const theme = CmEditorView.theme({
    [`.${SELECTION_TOOLBAR_CLASS}`]: {
      position: 'fixed',
      display: 'flex',
      gap: '2px',
      padding: '4px',
      borderRadius: '8px',
      background: 'var(--mellow-toolbar-bg, rgba(30, 30, 30, 0.92))',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
      zIndex: '1000',
      '& button': {
        border: 'none',
        background: 'transparent',
        color: 'var(--mellow-toolbar-fg, #f5f5f5)',
        minWidth: '26px',
        height: '26px',
        padding: '0 6px',
        borderRadius: '5px',
        fontSize: '13px',
        cursor: 'pointer',
        '&:hover': { background: 'rgba(255, 255, 255, 0.14)' },
        '&:focus-visible': { outline: '2px solid #4c8dff', outlineOffset: '-1px' },
      },
    },
  });

  return [plugin, theme];
}
