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
  // from === to（caret 位）合法：返回 caret 所在行（段落级动作作用于当前行，Typora 语义）
  if (range.from > range.to) return [];
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

type ToolbarAction = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'quote' | 'list' | 'orderedList' | 'taskList' | 'codeBlock' | 'mathBlock' | 'highlight' | 'sup' | 'sub' | 'paragraph' | 'clear' | 'headingUp' | 'headingDown' | 'horizontalRule' | 'footnote' | 'yamlFrontMatter' | 'taskToggle' | 'deleteLine' | 'referenceLink';

/** 既有块级 marker（heading/quote/ul/task/ol）：列表互转时先剥离（Typora 段落互转语义） */
const BLOCK_PREFIX_RE = /^(#{1,6}\s|>\s|[-*+]\s(?:\[[ xX]\]\s)?|\d+\.\s)/;

/** 有序列表（⌥⌘O）：逐行加序号前缀；全部已序号则移除（toggle） */
export function applyOrderedList(doc: string, range: TextRange): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const allOrdered = lines.every((line) => /^\d+\.\s/.test(doc.slice(line.start, line.end)));
  const deltas: number[] = [];
  let replacement = '';
  let pos = lines[0].start;
  let n = 0;
  for (const line of lines) {
    replacement += doc.slice(pos, line.start);
    const content = doc.slice(line.start, line.end);
    if (allOrdered) {
      const cut = /^\d+\.\s/.exec(content)?.[0].length ?? 0;
      replacement += content.slice(cut);
      deltas.push(-cut);
    } else {
      n += 1;
      const stripped = content.replace(BLOCK_PREFIX_RE, '');
      const prefix = `${n}. `;
      replacement += prefix + stripped;
      deltas.push(prefix.length - (content.length - stripped.length));
    }
    pos = line.end;
  }
  const regionEnd = lines[lines.length - 1].end;
  return {
    changes: [{ from: lines[0].start, to: regionEnd, insert: replacement }],
    selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
  };
}

/** 任务列表（⌥⌘X）："- [ ] " 前缀 toggle */
export function applyTaskList(doc: string, range: TextRange): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const allTask = lines.every((line) => /^[-*+]\s\[[ xX]\]\s/.test(doc.slice(line.start, line.end)));
  const deltas: number[] = [];
  let replacement = '';
  let pos = lines[0].start;
  for (const line of lines) {
    replacement += doc.slice(pos, line.start);
    const content = doc.slice(line.start, line.end);
    if (allTask) {
      const cut = /^[-*+]\s\[[ xX]\]\s/.exec(content)?.[0].length ?? 0;
      replacement += content.slice(cut);
      deltas.push(-cut);
    } else {
      const stripped = content.replace(BLOCK_PREFIX_RE, '');
      const prefix = '- [ ] ';
      replacement += prefix + stripped;
      deltas.push(prefix.length - (content.length - stripped.length));
    }
    pos = line.end;
  }
  const regionEnd = lines[lines.length - 1].end;
  return {
    changes: [{ from: lines[0].start, to: regionEnd, insert: replacement }],
    selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
  };
}

/** fence 包裹（codeBlock/mathBlock 共用）：前后各插一行 fence；已包裹则移除（toggle） */
function applyFenceBlock(doc: string, range: TextRange, fence: string): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const start = lines[0].start;
  const end = lines[lines.length - 1].end;
  // 前一行 / 后一行（toggle off 检测）
  const hasPrev = start > 0;
  const prevStart = hasPrev ? doc.lastIndexOf('\n', start - 2) + 1 : 0;
  const prev = hasPrev ? doc.slice(prevStart, start - 1) : null;
  const endNl = doc.indexOf('\n', end);
  const hasNext = endNl !== -1;
  let next: string | null = null;
  let nextStart = 0;
  let nextEnd = 0;
  if (hasNext) {
    nextStart = endNl + 1;
    const nl2 = doc.indexOf('\n', nextStart);
    nextEnd = nl2 === -1 ? doc.length : nl2;
    next = doc.slice(nextStart, nextEnd);
  }
  const isFence = (s: string): boolean => s === fence || (fence === '```' && s.startsWith('```'));
  if (prev !== null && next !== null && isFence(prev) && isFence(next)) {
    // toggle off：删除两行 fence（后行若为末行连同其前换行）
    const removeNext = nextEnd < doc.length
      ? { from: end + 1, to: nextEnd + 1, insert: '' }
      : { from: end, to: nextEnd, insert: '' };
    const shift = start - prevStart;
    const from = Math.max(prevStart, range.from - shift);
    const to = Math.max(from, range.to - shift);
    return {
      changes: [{ from: prevStart, to: start, insert: '' }, removeNext],
      selection: { from, to },
    };
  }
  const open = `${fence}\n`;
  return {
    changes: [
      { from: start, to: start, insert: open },
      { from: end, to: end, insert: `\n${fence}` },
    ],
    selection: { from: range.from + open.length, to: range.to + open.length },
  };
}

/** 代码块（⌥⌘C）：``` fence 包裹 toggle */
export function applyCodeBlock(doc: string, range: TextRange): ApplyResult {
  return applyFenceBlock(doc, range, '```');
}

/** 数学公式块（⌥⌘B）：$$ fence 包裹 toggle */
export function applyMathBlock(doc: string, range: TextRange): ApplyResult {
  return applyFenceBlock(doc, range, '$$');
}

/** 清除样式（⌘\，Typora Format→清除样式）：移除选区内行内 marker 与链接语法 */
export function applyClearFormat(doc: string, range: TextRange): ApplyResult {
  const selected = doc.slice(range.from, range.to);
  if (selected === '') return { changes: [], selection: range };
  // 成对 marker（长 marker 优先，避免 ** 被 ~ 类规则误拆）
  const markers = ['**', '~~', '==', '`', '^', '*', '~'];
  const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleared = selected;
  let prev = '';
  // 迭代到稳定（嵌套 marker，如 **`code`**）
  while (prev !== cleared) {
    prev = cleared;
    for (const marker of markers) {
      cleared = cleared.replace(new RegExp(`${escapeRe(marker)}([^${escapeRe(marker)}]+?)${escapeRe(marker)}`, 'g'), '$1');
    }
  }
  // 链接 [text](url) → text
  cleared = cleared.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  if (cleared === selected) return { changes: [], selection: range };
  return {
    changes: [{ from: range.from, to: range.to, insert: cleared }],
    selection: { from: range.from, to: range.from + cleared.length },
  };
}

/** 标题级别提升/降低（⌘= / ⌘-，Typora 段落菜单语义）：
 *  提升＝级别-1（最小 h1；非标题行 → h1）；降低＝级别+1（最大 h6；非标题行 → h2） */
export function applyHeadingShift(doc: string, range: TextRange, direction: 1 | -1): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const deltas: number[] = [];
  let replacement = '';
  let pos = lines[0].start;
  for (const line of lines) {
    replacement += doc.slice(pos, line.start);
    const content = doc.slice(line.start, line.end);
    const match = /^(#{1,6})(\s)/.exec(content);
    if (match !== null) {
      const level = match[1].length;
      const next = direction === 1 ? Math.min(6, level + 1) : Math.max(1, level - 1);
      const prefix = '#'.repeat(next) + match[2];
      replacement += prefix + content.slice(match[0].length);
      deltas.push(prefix.length - match[0].length);
    } else {
      const next = direction === 1 ? 2 : 1;
      const prefix = '#'.repeat(next) + ' ';
      replacement += prefix + content;
      deltas.push(prefix.length);
    }
    pos = line.end;
  }
  const regionEnd = lines[lines.length - 1].end;
  return {
    changes: [{ from: lines[0].start, to: regionEnd, insert: replacement }],
    selection: { from: mapPosition(range.from, lines, deltas), to: mapPosition(range.to, lines, deltas) },
  };
}

/** 水平分割线（⌥-，Typora 段落→水平分割线）：当前行下方插入 --- 空行分隔 */
export function applyHorizontalRule(doc: string, range: TextRange): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const line = lines[lines.length - 1];
  const end = line.end;
  const hasTail = end < doc.length;
  const insert = hasTail ? '\n\n---\n' : '\n\n---';
  return {
    changes: [{ from: end, to: end, insert }],
    selection: { from: end + insert.length, to: end + insert.length },
  };
}

/** 脚注（⌥R，Typora 段落→脚注）：光标处插入引用 [^n]，文档末尾附定义 */
export function applyFootnote(doc: string, range: TextRange): ApplyResult {
  const used = new Set<number>();
  for (const m of doc.matchAll(/\[\^(\d+)\]/g)) used.add(Number(m[1]));
  let n = 1;
  while (used.has(n)) n += 1;
  const ref = `[^${n}]`;
  const hasTail = doc.length > 0 && !doc.endsWith('\n');
  const defPrefix = doc.length === 0 ? '' : hasTail ? '\n\n' : '\n';
  const changes: Array<{ from: number; to: number; insert: string }> = [
    { from: range.from, to: range.to, insert: ref },
    { from: doc.length, to: doc.length, insert: `${defPrefix}${ref}: ` },
  ];
  return {
    changes,
    selection: { from: range.from + ref.length, to: range.from + ref.length },
  };
}

/** 删除行（⇧⌘⌫，Typora 编辑→删除→删除行）：删除受影响整行（含行尾换行；文档尾无换行时连同前置换行，不留空行） */
export function applyDeleteLine(doc: string, range: TextRange): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const first = lines[0];
  const last = lines[lines.length - 1];
  // 文档尾行（无尾随换行）：回退一个字符连前置换行一起删，避免残留空行；caret 落前一行行尾
  const atDocEnd = last.end >= doc.length && first.start > 0;
  const from = atDocEnd ? first.start - 1 : first.start;
  const to = last.end < doc.length ? last.end + 1 : last.end;
  if (from >= to) return { changes: [], selection: range };
  const caret = atDocEnd ? first.start - 1 : first.start;
  return {
    changes: [{ from, to, insert: '' }],
    selection: { from: caret, to: caret },
  };
}

/** 链接引用（⌥⌘L，Typora 段落→链接引用）：选区文本 → [text][n]；当前段落块下方插入 [n]: 定义。
 * 空选区 → [][n]（caret 落 label 括号内）；有选区 → caret 落定义行 URL 位。n 为最小未占用引用号。 */
export function applyReferenceLink(doc: string, range: TextRange): ApplyResult {
  const used = new Set<number>();
  for (const m of doc.matchAll(/^\[(\d+)\]:/gm)) used.add(Number(m[1]));
  let n = 1;
  while (used.has(n)) n += 1;
  const label = doc.slice(range.from, range.to);
  const ref = `[${label}][${n}]`;
  // 定义插入点：受影响行所在段落块（连续非空行）末尾
  const lines = affectedLines(doc, range);
  let blockEnd = lines[lines.length - 1].end;
  while (blockEnd < doc.length) {
    const nl = doc.indexOf('\n', blockEnd);
    if (nl === -1) {
      blockEnd = doc.length;
      break;
    }
    const nextStart = nl + 1;
    const nl2 = doc.indexOf('\n', nextStart);
    const nextEnd = nl2 === -1 ? doc.length : nl2;
    if (doc.slice(nextStart, nextEnd).trim() === '') break;
    blockEnd = nextEnd;
  }
  const defLine = `\n[${n}]: `;
  const changes: Array<{ from: number; to: number; insert: string }> = [
    { from: range.from, to: range.to, insert: ref },
    { from: blockEnd, to: blockEnd, insert: defLine },
  ];
  const delta = ref.length - (range.to - range.from);
  const caret = label === ''
    ? range.from + 1
    : blockEnd + delta + defLine.length;
  return { changes, selection: { from: caret, to: caret } };
}

/** YAML Front Matter（Typora 段落→YAML Front Matter）：文档顶部插入 --- 包裹块（已有则忽略） */
export function applyYamlFrontMatter(doc: string, range: TextRange): ApplyResult {
  if (/^---\r?\n/.test(doc)) return { changes: [], selection: range };
  const insert = '---\ntitle: \n---\n\n';
  return {
    changes: [{ from: 0, to: 0, insert }],
    selection: { from: range.from + insert.length, to: range.to + insert.length },
  };
}

/** 切换任务状态（⌃X，Typora 段落→任务状态）：当前行 [ ] ↔ [x] */
export function applyTaskToggle(doc: string, range: TextRange): ApplyResult {
  const lines = affectedLines(doc, range);
  if (lines.length === 0) return { changes: [], selection: range };
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (const line of lines) {
    const content = doc.slice(line.start, line.end);
    const m = /^([-*+]\s)\[([ xX])\](\s)/.exec(content);
    if (m === null) continue;
    const checkboxFrom = line.start + m[1].length;
    const next = m[2] === ' ' ? 'x' : ' ';
    changes.push({ from: checkboxFrom + 1, to: checkboxFrom + 2, insert: next });
  }
  if (changes.length === 0) return { changes: [], selection: range };
  return { changes, selection: range };
}

/** 成对 marker（空选区插入 caret 居中，Typora 行为） */
const PAIR_MARKERS: Partial<Record<ToolbarAction, string>> = {
  bold: '**', italic: '*', strike: '~~', code: '`', highlight: '==', sup: '^', sub: '~',
};
const ACTION_IDS = new Set<ToolbarAction>(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'bold', 'italic', 'strike', 'code', 'link', 'quote', 'list', 'orderedList', 'taskList', 'codeBlock', 'mathBlock', 'highlight', 'sup', 'sub', 'paragraph', 'clear', 'headingUp', 'headingDown', 'horizontalRule', 'footnote', 'yamlFrontMatter', 'taskToggle', 'deleteLine', 'referenceLink']);

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
    case 'h4': return applyHeading(doc, range, 4);
    case 'h5': return applyHeading(doc, range, 5);
    case 'h6': return applyHeading(doc, range, 6);
    case 'bold': return applyInlineFormat(doc, range, '**');
    case 'italic': return applyInlineFormat(doc, range, '*');
    case 'strike': return applyInlineFormat(doc, range, '~~');
    case 'code': return applyInlineFormat(doc, range, '`');
    case 'link': return applyLink(doc, range);
    case 'quote': return applyBlockPrefix(doc, range, '> ');
    case 'list': return applyBlockPrefix(doc, range, '- ');
    case 'orderedList': return applyOrderedList(doc, range);
    case 'taskList': return applyTaskList(doc, range);
    case 'codeBlock': return applyCodeBlock(doc, range);
    case 'mathBlock': return applyMathBlock(doc, range);
    case 'clear': return applyClearFormat(doc, range);
    case 'highlight': return applyInlineFormat(doc, range, '==');
    case 'sup': return applyInlineFormat(doc, range, '^');
    case 'sub': return applyInlineFormat(doc, range, '~');
    case 'headingUp': return applyHeadingShift(doc, range, -1);
    case 'headingDown': return applyHeadingShift(doc, range, 1);
    case 'horizontalRule': return applyHorizontalRule(doc, range);
    case 'footnote': return applyFootnote(doc, range);
    case 'deleteLine': return applyDeleteLine(doc, range);
    case 'referenceLink': return applyReferenceLink(doc, range);
    case 'yamlFrontMatter': return applyYamlFrontMatter(doc, range);
    case 'taskToggle': return applyTaskToggle(doc, range);
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
    if (action === 'clear') return; // 清除样式需要目标选区（Typora ⌘\ 空选区无操作）
    if (action === 'referenceLink') {
      // 链接引用：空选区直接以 caret 位调用（内部处理 [][n] + caret 落 label 内）
      result = applyReferenceLink(doc, { from: sel.head, to: sel.head });
    } else if (PAIR_MARKERS[action] !== undefined) {
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
