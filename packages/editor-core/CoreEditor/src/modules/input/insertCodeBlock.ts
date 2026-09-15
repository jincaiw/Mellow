import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { SyntaxNode } from '@lezer/common';
import insertSnippet from '../snippets/insertSnippet';

const mark = '`';
const pair = mark.repeat(2);
const fence = mark.repeat(3);

/**
 * Handle the backtick key: expand two preceding backticks into a code block,
 * otherwise wrap the selection or insert a single backtick.
 */
export default function insertCodeBlock(editor: EditorView) {
  const state = editor.state;
  const doc = state.doc;
  const { from } = state.selection.main;

  // Insert a code block, always placing it on its own lines
  if (shouldInsertCodeBlock(state, from)) {
    const line = doc.lineAt(from);
    const lineBreak = state.lineBreak;

    // Break out surrounding text so the fences never share a line with other content
    const leading = doc.sliceString(line.from, from - 2).trim() === '' ? '' : lineBreak;
    const trailing = doc.sliceString(from, line.to).trim() === '' ? '' : lineBreak;

    // V7-W6（G7-EDIT-16）：默认代码块语言只加在**开围栏**上（闭围栏不带语言，与 Typora 一致）。
    // 语言在**输入时**读取 config（无需 Compartment，同 autoMarkdownSyntaxPairs 的处理）。
    const { open: openFence, close: closeFence } = codeBlockFences(window.config.defaultCodeLang);

    // Replace the two existing backticks so the opening fence can start on its own line
    insertSnippet(
      `${leading}${openFence}#{}${lineBreak}#{}${lineBreak}${closeFence}${trailing}`,
      '',
      { from: from - 2, to: from },
    );

    return true;
  }

  // Wrap the selection, or insert a single backtick for an empty cursor
  editor.dispatch(state.changeByRange(({ from, to }) => {
    const anchor = from + mark.length;
    if (from === to) {
      return {
        range: EditorSelection.cursor(anchor),
        changes: { from, to, insert: mark },
      };
    }

    const selected = state.sliceDoc(from, to);
    return {
      range: EditorSelection.range(anchor, anchor + selected.length),
      changes: { from, to, insert: `${mark}${selected}${mark}` },
    };
  }));

  // Intercepted, default behavior is ignored
  return true;
}

/**
 * 清洗默认代码块语言：只保留围栏 info string 的合法内容。
 *
 * 必须清洗 —— 该值来自用户设置，若含反引号/换行/空白会**破坏围栏语法**（把一行拆成多行、
 * 或提前闭合围栏），属「输入即写坏文档」。空串 → 返回空串（= 不加语言，与默认行为一致）。
 */
export function sanitizeCodeLang(value: string | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[`\r\n\t\s]+/g, '').slice(0, 32);
}

/**
 * 代码块的开/闭围栏文本（V7-W6，G7-EDIT-16）。
 *
 * **语言只加在开围栏上**：闭围栏必须是裸 ```（`` ```js … ```js `` 是错的，会污染文档）。
 * 导出为纯函数以便单测 —— 该行为在浏览器 harness 中无法用合成按键走通
 * （`insertCodeBlock` 的展开分支经 CM6 `snippet()` 提交，headless 下不产生变更），
 * 故用纯函数单测 + 静态契约护栏共同锁定。
 */
export function codeBlockFences(defaultLang: string | undefined): { open: string; close: string } {
  return { open: `${fence}${sanitizeCodeLang(defaultLang)}`, close: fence };
}

/**
 * A code block is inserted when two backticks precede an empty cursor and we are not already inside code.
 */
function shouldInsertCodeBlock(state: EditorState, pos: number) {
  // Only expand for a single empty selection with room for two preceding backticks.
  // Multiple ranges fall through to the per-range fallback so the backtick isn't dropped.
  if (pos < 2 || state.selection.ranges.length > 1 || !state.selection.main.empty) {
    return false;
  }

  // Requires exactly two backticks right before the cursor
  const doc = state.doc;
  if (doc.sliceString(pos - 2, pos) !== pair) {
    return false;
  }

  // Don't start a new block when the cursor is already inside code
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node !== null; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      return false;
    }

    // Ignore an inline span that our just-typed backticks would open, only bail when truly inside one
    if (node.name === 'InlineCode' && node.from < pos - 2) {
      return false;
    }
  }

  return true;
}
