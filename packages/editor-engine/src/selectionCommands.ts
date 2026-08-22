/**
 * Selection Commands（Typora 编辑→选择/删除范围：D1-4 + D3 扩展）。
 *
 * 宿主 → iframe `__MELLOW_SELECTION_COMMANDS__` → EditorView selection dispatch：
 * - selectLine：选中当前逻辑行；已整行选中时扩展到下一行（CM selectLine 语义）；
 * - selectParagraph：空行界定的段落范围（与 focusMode paragraphRange 同语义）；
 * - selectWord：光标处词（⌘D）；
 * - selectFormatSpan：光标处行内格式标记内容（⌘E；粗体、斜体、行内代码、删除线、
 *   高亮、上标、下标），无标记时退化为当前词（Typora 同行为）；
 * - gotoDocStart/End（⌘↑/⌘↓）、gotoSelection（⌘J scrollIntoView）、gotoLineStart/End（⌃A/⌃E）；
 * - deleteWord（⇧⌘D）/ deleteFormatSpan（⌥⇧⌘E）/ deleteParagraph（⌥⇧⌘P，Typora「删除块」）；
 * - moveLineUp/Down（⌥↑/⌥↓，交换相邻行；不依赖运行时 require @codemirror/commands）；
 * - imageSourceAtCursor：光标处图片 src（「拷贝图片」菜单命令定位输入）。
 *
 * 通道方向：
 *   host → EditorCore.* → iframe __MELLOW_SELECTION_COMMANDS__ → 本模块
 */

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface SelectionCommandsApi {
  selectLine(): boolean;
  selectParagraph(): boolean;
  selectWord(): boolean;
  selectFormatSpan(): boolean;
  gotoDocStart(): boolean;
  gotoDocEnd(): boolean;
  gotoSelection(): boolean;
  gotoLineStart(): boolean;
  gotoLineEnd(): boolean;
  deleteWord(): boolean;
  deleteFormatSpan(): boolean;
  deleteParagraph(): boolean;
  moveLineUp(): boolean;
  moveLineDown(): boolean;
  /** 光标处图片 src；null = 无图片/编辑器未就绪（供宿主「拷贝图片」） */
  imageSourceAtCursor(): string | null;
}

let activeView: EditorView | null = null;

// ───────────────────── 纯逻辑（可测） ─────────────────────

/** 行内格式标记表：open/close 序列（越靠前优先级越高；`~` 同时匹配 `~~` 需先长后短） */
const INLINE_MARKERS: ReadonlyArray<{ open: string; close: string }> = [
  { open: '**', close: '**' },
  { open: '__', close: '__' },
  { open: '~~', close: '~~' },
  { open: '==', close: '==' },
  { open: '`', close: '`' },
  { open: '*', close: '*' },
  { open: '_', close: '_' },
  { open: '^', close: '^' },
  { open: '~', close: '~' },
];

export interface SpanRange {
  from: number;
  to: number;
}

/** 光标处行内格式标记的内容范围（`**bold**` → 内容 range）；无标记 → null */
export function formatSpanAt(doc: string, pos: number): SpanRange | null {
  for (const { open, close } of INLINE_MARKERS) {
    const m = open.length;
    // 从左往右扫描每个 open 出现点，找最近的匹配 close
    for (let i = 0; i + m <= doc.length; i += 1) {
      if (doc.startsWith(open, i)) {
        const contentStart = i + m;
        // 内容至少 1 字符且不含换行（行内标记不跨行）
        const nl = doc.indexOf('\n', contentStart);
        const lineEnd = nl === -1 ? doc.length : nl;
        const closeAt = doc.indexOf(close, contentStart);
        if (closeAt !== -1 && closeAt <= lineEnd && closeAt > contentStart) {
          const contentEnd = closeAt;
          if (pos >= contentStart && pos <= contentEnd) {
            return { from: contentStart, to: contentEnd };
          }
          // 跳过本对标记继续扫描（重叠标记由外层循环覆盖）
          i = contentEnd + close.length - 1;
        }
      }
    }
  }
  return null;
}

/** 光标处词范围（CM wordAt 同语义：字母数字连续段；空白/CJK 单字）；无词 → null */
export function wordAt(doc: string, pos: number): SpanRange | null {
  if (doc.length === 0) return null;
  const isWordChar = (ch: string): boolean => /[A-Za-z0-9_]/.test(ch);
  const before = pos > 0 ? doc[pos - 1] : '';
  let from = pos;
  let to = pos;
  if (before !== '' && isWordChar(before)) {
    from = pos - 1;
    while (from > 0 && isWordChar(doc[from - 1])) from -= 1;
  }
  const after = pos < doc.length ? doc[pos] : '';
  if (after !== '' && isWordChar(after)) {
    to = pos + 1;
    while (to < doc.length && isWordChar(doc[to])) to += 1;
  }
  if (from === to) {
    // CJK：取光标单侧单字（Typora 中文按字/词处理，取单字即够用）
    if (before !== '' && !/\s/.test(before)) return { from: pos - 1, to: pos };
    if (after !== '' && !/\s/.test(after)) return { from: pos, to: pos + 1 };
    return null;
  }
  return { from, to };
}

/** 空行界定的段落范围（与 selectParagraph 同语义；供「删除块」） */
export function paragraphRangeAt(doc: string, pos: number): SpanRange | null {
  const lines = doc.split('\n');
  // 定位 pos 所在行
  let offset = 0;
  let target = lines.length - 1;
  for (let i = 0; i < lines.length; i += 1) {
    if (pos <= offset + lines[i].length) {
      target = i;
      break;
    }
    offset += lines[i].length + 1;
  }
  let fromLine = target;
  let toLine = target;
  while (fromLine > 0 && lines[fromLine - 1].trim() !== '') fromLine -= 1;
  while (toLine < lines.length - 1 && lines[toLine + 1].trim() !== '') toLine += 1;
  // 计算 from/to 偏移
  let from = 0;
  for (let i = 0; i < fromLine; i += 1) from += lines[i].length + 1;
  let to = from;
  for (let i = fromLine; i <= toLine; i += 1) to += lines[i].length + 1;
  return { from, to: to - 1 }; // to - 1：去掉最后一个 +1 的换行
}

/** 光标处图片 src（与 contextMenu.imageSourceAt 同规则）；null = 无 */
export function imageSourceAt(doc: string, pos: number): string | null {
  const re = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (pos >= from && pos <= to) return m[2].trim();
  }
  return null;
}

// ───────────────────── dispatch 封装 ─────────────────────

function selectLine(): boolean {
  const view = activeView;
  if (view === null) return false;
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  const line = doc.lineAt(sel.head);
  const fullLineSelected = !sel.empty && sel.from === line.from && sel.to === line.to;
  if (fullLineSelected && line.number < doc.lines) {
    // 重复按 ⌘L：扩展到下一行（CM selectLine 语义）
    const next = doc.line(line.number + 1);
    view.dispatch({ selection: { anchor: line.from, head: next.to }, scrollIntoView: true });
  } else {
    view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
  }
  return true;
}

function selectParagraph(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc;
  const head = view.state.selection.main.head;
  const line = doc.lineAt(head);
  let fromLine = line.number;
  let toLine = line.number;
  while (fromLine > 1 && doc.line(fromLine - 1).text.trim() !== '') fromLine -= 1;
  while (toLine < doc.lines && doc.line(toLine + 1).text.trim() !== '') toLine += 1;
  view.dispatch({
    selection: { anchor: doc.line(fromLine).from, head: doc.line(toLine).to },
    scrollIntoView: true,
  });
  return true;
}

function selectWord(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const word = wordAt(doc, head);
  if (word === null) return false;
  view.dispatch({ selection: { anchor: word.from, head: word.to }, scrollIntoView: true });
  return true;
}

function selectFormatSpan(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const span = formatSpanAt(doc, head) ?? wordAt(doc, head);
  if (span === null) return false;
  view.dispatch({ selection: { anchor: span.from, head: span.to }, scrollIntoView: true });
  return true;
}

function gotoDocStart(): boolean {
  const view = activeView;
  if (view === null) return false;
  view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
  return true;
}

function gotoDocEnd(): boolean {
  const view = activeView;
  if (view === null) return false;
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
  return true;
}

function gotoSelection(): boolean {
  const view = activeView;
  if (view === null) return false;
  view.dispatch({ effects: [], scrollIntoView: true });
  return true;
}

function gotoLineStart(): boolean {
  const view = activeView;
  if (view === null) return false;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
  return true;
}

function gotoLineEnd(): boolean {
  const view = activeView;
  if (view === null) return false;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
  return true;
}

function deleteRange(view: EditorView, from: number, to: number): boolean {
  // 块删除语义：吞掉被删内容后的换行，并折叠因此产生的连续空行（至多留一个）
  const doc = view.state.doc;
  let end = to;
  if (end < doc.length && doc.sliceString(end, end + 1) === '\n') {
    end += 1;
    if (end < doc.length && doc.sliceString(end, end + 1) === '\n') end += 1;
  } else if (from > 0 && doc.sliceString(from - 1, from) === '\n') {
    // 块尾无后置换行（文档末块）：吞前置换行，同样折叠连续空行
    from -= 1;
    if (from > 0 && doc.sliceString(from - 1, from) === '\n') from -= 1;
  }
  view.dispatch({
    changes: { from, to: end, insert: '' },
    selection: { anchor: from },
    scrollIntoView: true,
  });
  return true;
}

function deleteWord(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const word = wordAt(doc, head);
  if (word === null) return false;
  return deleteRange(view, word.from, word.to);
}

function deleteFormatSpan(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const span = formatSpanAt(doc, head);
  if (span === null) return false;
  return deleteRange(view, span.from, span.to);
}

function deleteParagraph(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const para = paragraphRangeAt(doc, head);
  if (para === null) return false;
  return deleteRange(view, para.from, para.to);
}

/** 交换当前行与上一行（⌥↑）；首行时 no-op 返回 false（Typora 同行为不移动） */
function moveLineUp(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc;
  const line = doc.lineAt(view.state.selection.main.head);
  if (line.number === 1) return false;
  const prev = doc.line(line.number - 1);
  const col = view.state.selection.main.head - line.from;
  view.dispatch({
    changes: {
      from: prev.from,
      to: line.to,
      insert: `${line.text}\n${prev.text}`,
    },
    selection: { anchor: prev.from + Math.min(col, line.text.length) },
    scrollIntoView: true,
  });
  return true;
}

/** 交换当前行与下一行（⌥↓）；末行时 no-op */
function moveLineDown(): boolean {
  const view = activeView;
  if (view === null) return false;
  const doc = view.state.doc;
  const line = doc.lineAt(view.state.selection.main.head);
  if (line.number === doc.lines) return false;
  const next = doc.line(line.number + 1);
  const col = view.state.selection.main.head - line.from;
  view.dispatch({
    changes: {
      from: line.from,
      to: next.to,
      insert: `${next.text}\n${line.text}`,
    },
    selection: { anchor: next.from + Math.min(col, line.text.length) },
    scrollIntoView: true,
  });
  return true;
}

function imageSourceAtCursor(): string | null {
  const view = activeView;
  if (view === null) return null;
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return imageSourceAt(doc, head);
}

/** 注册全局 API（installSelectionCommandsApi 在 iframe 内调用一次） */
export function installSelectionCommandsApi(): void {
  (window as unknown as { __MELLOW_SELECTION_COMMANDS__?: SelectionCommandsApi }).__MELLOW_SELECTION_COMMANDS__ = {
    selectLine,
    selectParagraph,
    selectWord,
    selectFormatSpan,
    gotoDocStart,
    gotoDocEnd,
    gotoSelection,
    gotoLineStart,
    gotoLineEnd,
    deleteWord,
    deleteFormatSpan,
    deleteParagraph,
    moveLineUp,
    moveLineDown,
    imageSourceAtCursor,
  };
}

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

/** 构建扩展：ViewPlugin 跟踪 activeView（API dispatch 的目标） */
export function buildSelectionCommandsExtension(): Extension {
  const { ViewPlugin } = resolveCm();
  const plugin = ViewPlugin.fromClass(
    class SelectionCommandsPlugin {
      constructor(readonly view: EditorView) {
        activeView = view;
      }
      destroy(): void {
        if (activeView === this.view) activeView = null;
      }
    },
  );
  return plugin;
}
