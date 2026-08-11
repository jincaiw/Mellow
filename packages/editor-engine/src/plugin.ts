/**
 * Marker Reveal 引擎管线 —— CodeMirror ViewPlugin 实现（通用框架）。
 *
 * 管线（spec §3）：
 *   Editor Transaction
 *     → syntaxTree 增量解析（CM 内部完成）
 *     → Render eligibility（节点注册表 + NodeVisualState 状态机，spec §4/§5）
 *     → Decoration patch（仅对 marker 范围加 class）
 *     → Viewport-only（只遍历 visibleRanges，spec §20）
 *
 * 约束：
 * - 不重建 EditorView（spec §6 / 用户要求）；
 * - Markdown Text 唯一真源：只用 mark decoration + CSS，从不 replace 文本（spec §2）；
 * - Composition Guard：composition 期间只 map decoration 位置，不重算（spec §6）；
 * - invalid/未注册/无法提取 marker 的节点按 source 处理（不隐藏，安全 fallback）；
 * - 增量更新：只在 doc/selection/viewport 变化时重算（spec §3 不每次输入重建全文）。
 */

import type { EditorView, ViewUpdate, DecorationSet, Decoration as DecorationT } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { SyntaxNodeRef, SyntaxNode } from '@lezer/common';

import { registerBuiltinNodes, contentNodeNames, markerNodeNames, extractMarkers, getNodeSpec } from './nodes';
import { classifyNodeState, shouldHideMarkers } from './state';
import type { RevealContext } from './types';
import { isComposing } from './composition';
import { isSourceMode } from './mode';

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

/** 找 marker 所属的顶层内容节点（沿父链向上，如 EmphasisMark → Emphasis/StrongEmphasis） */
function topContentAncestor(node: SyntaxNodeRef, names: ReadonlySet<string>): SyntaxNode | null {
  let current: SyntaxNode | null = node.node.parent;
  let top: SyntaxNode | null = null;
  while (current !== null) {
    if (names.has(current.name)) {
      top = current;
    }
    current = current.parent;
  }
  return top;
}

/**
 * 构建引擎扩展。
 *
 * 使用方式（宿主注入）：
 *   MarkEdit.addExtension(engine.buildMarkerRevealExtension())
 */
export function buildMarkerRevealExtension(): Extension {
  registerBuiltinNodes(); // 幂等：注册内置节点
  const cm = resolveCm();
  const { EditorView, ViewPlugin, Decoration, RangeSetBuilder, syntaxTree } = cm;
  const contentNames = contentNodeNames();
  const markerNames = markerNodeNames();

  const buildDecorations = (view: EditorView): DecorationSet => {
    const { state } = view;
    const main = state.selection.main;
    const builder = new RangeSetBuilder<DecorationT>();

    // Viewport-only（spec §20）；jsdom/无布局环境 visibleRanges 为空 → fallback 全文档
    const ranges = view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: state.doc.length }];

    for (const { from, to } of ranges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter: (node) => {
          if (!markerNames.has(node.name)) {
            return;
          }

          // invalid / partial parse 防护
          if (node.from < 0 || node.to > state.doc.length || node.from >= node.to) {
            return;
          }

          // 内容祖先 + 节点规格（未注册 → source，安全）
          const ancestor = topContentAncestor(node, contentNames);
          if (ancestor === null) {
            return;
          }
          const spec = getNodeSpec(ancestor.name);
          if (spec === null) {
            return;
          }

          const parent = { from: ancestor.from, text: state.sliceDoc(ancestor.from, ancestor.to) };
          const markers = extractMarkers(spec, { from: node.from, to: node.to, name: node.name }, parent);
          if (markers === null || markers.length === 0) {
            return; // invalid → source（不隐藏）
          }

          // Reveal policy（spec §5）：状态机判定（可被 NodeSpec.classify 定制）
          const ctx: RevealContext = {
            caret: main,
            composing: isComposing(),
            forceSource: isSourceMode(), // Source Mode（spec §5.5）
          };
          const visual = spec.classify
            ? spec.classify(ancestor, markers, ctx)
            : classifyNodeState(ancestor, markers, ctx);

          // rendered → 隐藏全部 marker
          if (!shouldHideMarkers(visual)) {
            return;
          }
          for (const m of markers) {
            builder.add(m.from, m.to, Decoration.mark({ class: MARKER_CLASS }));
          }
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

        // 增量更新：只在 doc/selection/viewport 变化时重算（spec §3）
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
