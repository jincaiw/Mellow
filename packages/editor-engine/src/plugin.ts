/**
 * Marker Reveal 引擎 —— CodeMirror ViewPlugin 实现。
 *
 * 管线（live-markdown-engine-spec §3）：
 *   Editor Transaction
 *     → syntaxTree 增量解析（CM 内部完成）
 *     → Render eligibility（caret/selection intersects → source）
 *     → Decoration patch（仅对 marker 范围加 class）
 *
 * 约束：
 * - 不重建 EditorView（spec §6 / 用户要求）；
 * - Markdown Text 唯一真源：只用 mark decoration + CSS，从不 replace 文本（spec §2）；
 * - Composition Guard：composition 期间只 map decoration 位置，不重算（spec §6）；
 * - 无法识别的节点按 source 处理（不隐藏，安全 fallback）。
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT } from '@codemirror/view';
import type { Extension, EditorState } from '@codemirror/state';
import type { SyntaxNodeRef, SyntaxNode } from '@lezer/common';

import { CONTENT_NODE_NAMES, MARKER_NODE_NAMES, headingMarkerEnd } from './markers';
import { isComposing } from './composition';

/** 隐藏 marker 的 class（CSS: font-size: 0） */
export const MARKER_CLASS = 'mellow-md-marker';

/** 运行时 CM6 模块（iframe 内与 CoreEditor 同一实例，保证扩展兼容） */
interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  return {
    EditorView: view.EditorView,
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    RangeSetBuilder: state.RangeSetBuilder,
    syntaxTree: language.syntaxTree,
  };
}

/**
 * 构建引擎扩展。
 *
 * 使用方式（宿主注入）：
 *   MarkEdit.addExtension(engine.buildMarkerRevealExtension())
 */
export function buildMarkerRevealExtension(): Extension {
  const cm = resolveCm();
  const { EditorView, ViewPlugin, Decoration, RangeSetBuilder, syntaxTree } = cm;

  /**
   * 计算单个 marker 节点的隐藏范围（相对 doc 偏移）。
   * - HeaderMark：扩展 `#` 至其后的空白（隐藏 `# `）
   * - 其余 marker：节点本身范围
   */
  const markerRange = (
    node: SyntaxNodeRef,
    parent: SyntaxNode | null,
    state: EditorState,
  ): { from: number; to: number } | null => {
    if (node.name === 'HeaderMark') {
      if (parent === null) {
        return null;
      }
      const parentText = state.sliceDoc(parent.from, parent.to);
      const end = headingMarkerEnd(parentText);
      return end === null ? null : { from: parent.from, to: parent.from + end };
    }
    return { from: node.from, to: node.to };
  };

  /** 找 marker 所属的顶层内容节点（沿父链向上，如 EmphasisMark → Emphasis/StrongEmphasis） */
  const topContentAncestor = (node: SyntaxNodeRef): SyntaxNode | null => {
    let current: SyntaxNode | null = node.node.parent;
    let top: SyntaxNode | null = null;
    while (current !== null) {
      if (CONTENT_NODE_NAMES.has(current.name)) {
        top = current;
      }
      current = current.parent;
    }
    return top;
  };

  const buildDecorations = (view: EditorView): DecorationSet => {
    const { state } = view;
    const main = state.selection.main;
    const builder = new RangeSetBuilder<DecorationT>();

    // 只遍历视口内的语法树（spec §20：viewport-only）
    // jsdom/无布局环境 visibleRanges 可能为空，fallback 到整个文档
    const ranges = view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: state.doc.length }];

    for (const { from, to } of ranges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter: (node) => {
          if (!MARKER_NODE_NAMES.has(node.name)) {
            return;
          }

          // invalid / partial parse 防护
          if (node.from < 0 || node.to > state.doc.length || node.from >= node.to) {
            return;
          }

          // Reveal Policy（spec §5.1/5.2）：caret/selection 与内容节点相交 → source（显示）
          const contentNode = topContentAncestor(node);
          if (contentNode === null) {
            return; // 无内容祖先 → source（不隐藏）
          }
          if (intersects(main.from, main.to, contentNode.from, contentNode.to)) {
            return;
          }

          const range = markerRange(node, node.node.parent, state);
          if (range === null) {
            return;
          }

          // rendered：隐藏 marker
          builder.add(range.from, range.to, Decoration.mark({ class: MARKER_CLASS }));
        },
      });
    }

    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class MarkerRevealPlugin {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // 文本变化：先映射 decoration 位置，保持渲染正确
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }

        // Composition Guard：合成期间只映射位置，不重算（spec §6）
        if (isComposing()) {
          return;
        }

        // 只在这三类变化时重算（spec §3：不每次输入重建全文 decoration）
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (value: { decorations: DecorationSet }) => value.decorations },
  );

  const style = EditorView.theme({
    [`.${MARKER_CLASS}`]: {
      fontSize: '0',
      // 视觉隐藏但保留可选中文本语义（copy 时仍包含 marker —— 唯一真源）
      userSelect: 'text',
    },
  });

  return [plugin, style];
}

/** 区间相交判定：caret(pos,pos) 或 selection[a,b] 与 [from,to] 闭区间相交（含边界） */
export function intersects(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}
