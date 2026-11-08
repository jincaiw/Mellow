/**
 * Enter / Shift+Enter 语义对齐 Typora（PRD §34「Paragraph / Enter」+ G7-EDIT-07）。
 *
 * Typora 1.14.9：
 * - 普通段落 **Enter = 新段落** —— Markdown 真源里是**空行**（`\n\n`）；
 * - **Shift+Enter = 段内软换行** —— 单个 `\n`（由 CM 默认键位承担）。
 *
 * 缺口（2026-09-13 实测登记，G7-EDIT-07）：MarkEdit 的 `lang-markdown`
 * `markdownKeymap` 把 Enter 绑给 `insertNewlineContinueMarkup`，在普通段落里
 * 只插单个 `\n`（= 软换行语义）——与 Typora 相反。当时为规避"改 Enter 连带
 * 列表续写"的风险，曾用 Edit 菜单的「新段落 / 新行」两项**补偿**（G7-MENU-06）。
 * 2026-11-08 复核显示 Typora 1.14.9 的 Edit 菜单**并无**这两项（显示层基线
 * `tests/benchmark/fixtures/typora-live-menu-1149-display.txt`；nib 字符串
 * `MainMenu.nib` 亦无 `New Paragraph` / `New Line`）⇒ 补偿项本身成了显示层差异。
 * 故本模块从**根因**收口：Enter 只在「普通段落」上下文接管并插入 `\n\n`；
 * 其余所有上下文（列表 / 引用 / 代码 / 表格 / frontmatter / 数学）**原样交还**
 * CodeMirror 与 `lang-markdown`，列表续写与空项退出等行为零改动。
 *
 * 判定方式与 `smartPunctuation.isInsideCodeContext` 同型：走语法树父链
 * （O(树深)），不做全文扫描；唯一额外的全文判断是数学 span（`$$…$$` /
 * `\[…\]` 由引擎的行级扫描器识别，语法树里没有对应节点）——其代价与数学
 * 装饰层的既有全文档解析同阶。
 */

import type { EditorView, KeyBinding } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { isComposing } from './composition';
import { parseMathSpans } from './math';

interface EnterCmRuntime {
  keymap: typeof import('@codemirror/view').keymap;
  Prec: typeof import('@codemirror/state').Prec;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
  /** 补全面板是否打开（`@codemirror/autocomplete` 由 CoreEditor 提供，引擎侧无类型依赖） */
  completionStatus: ((state: EditorState) => unknown) | null;
}

function resolveCm(): EnterCmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-enter] window.require unavailable');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  let completionStatus: EnterCmRuntime['completionStatus'] = null;
  try {
    const autocomplete = requireFn('@codemirror/autocomplete') as {
      completionStatus: (state: EditorState) => unknown;
    };
    completionStatus = autocomplete.completionStatus;
  } catch {
    // 无 autocomplete 模块时只需跳过「补全打开」判定
  }
  return { keymap: view.keymap, Prec: state.Prec, syntaxTree: language.syntaxTree, completionStatus };
}

/**
 * 不接管的语法节点（其内 Enter 由既有实现处理）：
 * - 代码（行内 / 围栏 / 缩进）—— 新行必须是源码换行；
 * - 列表 / 引用 —— `insertNewlineContinueMarkup` 续写标记、空项退出；
 * - 表格 —— 表格的 Enter 归表格扩展与 CM 默认；
 * - frontmatter / HTML 块 / 注释 —— 内容不是 Markdown 段落。
 */
const PASS_THROUGH_NODES: ReadonlySet<string> = new Set([
  'InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'CodeInfo', 'CodeMark',
  'ListItem', 'BlockQuote', 'Blockquote',
  'Table', 'Frontmatter', 'HTMLBlock', 'CommentBlock', 'ProcessingInstruction',
]);

/** `pos` 是否落在数学 span 内部（`$$…$$`、`\[…\]`、`$…$`；闭区间端点算外侧）。 */
function isInsideMath(doc: EditorState['doc'], pos: number): boolean {
  const text = doc.toString();
  if (!text.includes('$') && !text.includes('\\[')) return false;
  return parseMathSpans(text).some((s) => pos > s.from && pos < s.to);
}

/**
 * 当前 caret 是否处于「普通段落」上下文（可安全插入段落分隔）。
 * 非空选区同理按起点判定。
 */
export function isParagraphBreakContext(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  // 空行：交给默认实现（再按一次 Enter 只是增加一个空行，不制造段落哨兵）
  if (!/\S/.test(text)) return false;
  // 行首标记兜底：末尾的空列表项 / 空引用行不一定有语法节点（解析器把它们
  // 当作未完成的标记），只靠父链会把「- |」误判成普通段落 ⇒ 按行首原文再判一次。
  if (/^\s{0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/.test(text)) return false; // 列表项
  if (/^\s{0,3}>/.test(text)) return false; // 引用
  const { syntaxTree } = resolveCm();
  let node: import('@lezer/common').SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node !== null) {
    if (PASS_THROUGH_NODES.has(node.name)) return false;
    node = node.parent;
  }
  return !isInsideMath(state.doc, pos);
}

/** 插入段落分隔：先吃掉 caret 前的行尾空白（Typora 同样不把硬换行空格带进新段落）。 */
function insertParagraphBreak(view: EditorView): boolean {
  if (isComposing(view)) return false;
  const state = view.state;
  // 多光标 / 非空选区：不接管（默认键位保持既有行为，避免多区间语义分歧）
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty) return false;
  if (!isParagraphBreakContext(state, range.from)) return false;
  const line = state.doc.lineAt(range.from);
  let from = range.from;
  while (from > line.from && /[ \t]/.test(state.doc.sliceString(from - 1, from))) from -= 1;
  view.dispatch(state.update({
    changes: { from, to: range.from, insert: '\n\n' },
    selection: { anchor: from + 2 },
    scrollIntoView: true,
    userEvent: 'input',
  }));
  return true;
}

/**
 * Enter / 新段落键位（`Prec.highest`，只在不被补全面板占用时生效）。
 *
 * 注意：**不**声明 Shift+Enter —— CM `defaultKeymap` + `lang-markdown` 已给
 * 单个 `\n`（软换行），与本模块形成 Typora 的 Enter / Shift+Enter 配对。
 */
export function buildParagraphEnterKeymap(): Extension {
  const { keymap, Prec, completionStatus } = resolveCm();
  const binding: KeyBinding = {
    key: 'Enter',
    run: (view) => {
      if (completionStatus !== null && completionStatus(view.state) !== null) return false;
      return insertParagraphBreak(view);
    },
  };
  return Prec.highest(keymap.of([binding]));
}
