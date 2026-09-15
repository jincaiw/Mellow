import { KeyBinding } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { SyntaxNode } from '@lezer/common';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { acceptCompletion as acceptTooltipCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { TabKeyBehavior } from './types';
import { hasTooltipCompletion } from '../completion';
import replaceSelections from '../commands/replaceSelections';

/** 光标是否位于 fenced / indented code block 内（沿父链判定，不能只看 innermost 节点）。 */
export function insideCodeBlock(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node !== null; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      return true;
    }
  }
  return false;
}

/**
 * 代码块缩进宽度（Typora `codeIndentSize`，默认 **4**）。
 *
 * Typora 里正文缩进（`indentSize`，默认 2）与代码块缩进（`codeIndentSize`，默认 4）是**两个独立偏好**；
 * Mellow 此前只有一个 `tabKeyBehavior` 兼管，导致代码块内按 Tab 得到正文宽度（实测 2 而非 4）。
 *
 * 该值来自用户设置 → 必须夹取：异常值会一次插入超长空白（属「输入即写坏文档」）。
 */
export function codeIndentWidth(): number {
  const raw = window.config.codeIndentSize;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 4;
  }
  return Math.min(16, Math.max(1, Math.round(raw)));
}

/**
 * Customized tab key behavior.
 */
export const indentationKeymap: KeyBinding[] = [
  {
    key: 'Tab',
    preventDefault: true,
    run: editor => {
      if (hasTooltipCompletion()) {
        acceptTooltipCompletion(editor);
        return true;
      }

      const cursor = editor.state.selection.main.from;
      const tree = syntaxTree(editor.state);

      // Always indent more around list marks
      for (const side of [-1, 0, 1]) {
        const node = tree.resolve(cursor, side as Parameters<typeof tree.resolve>[1]);
        if (node.name === 'ListItem' || node.name === 'ListMark') {
          return indentMore(editor);
        }
      }

      const behavior = window.config.tabKeyBehavior;

      // 代码块内用**独立宽度**（Typora `codeIndentSize`，默认 4）。
      // 只在「空格」两档生效：`insertTab` 插制表符（宽度与字符无关）、`indentMore` 由 CM 自行处理缩进。
      if (
        (behavior === TabKeyBehavior.insertTwoSpaces || behavior === TabKeyBehavior.insertFourSpaces)
        && insideCodeBlock(editor.state, cursor)
      ) {
        replaceSelections(' '.repeat(codeIndentWidth()));
        return true;
      }

      switch (behavior) {
        case TabKeyBehavior.insertTwoSpaces:
          replaceSelections('  ');
          return true;
        case TabKeyBehavior.insertFourSpaces:
          replaceSelections('    ');
          return true;
        case TabKeyBehavior.indentMore:
          return indentMore(editor);
        case TabKeyBehavior.insertTab:
        case undefined:
        default:
          return insertTab(editor);
      }
    },
  },
  {
    key: 'Shift-Tab',
    preventDefault: true,
    run: indentLess,
  },
];

export type { TabKeyBehavior };
