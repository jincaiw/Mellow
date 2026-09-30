/**
 * 行内代码的**代码属性**（spec §11「caret inside: … no autocorrect/spellcheck」）。
 *
 * **为什么必须显式做**：块级代码已有等价物 —— `CoreEditor/src/styling/nodes/code.ts` 的
 * `codeBlockStyle` 给 `FencedCode` / `CodeBlock` 设 `spellcheck=false` / `autocorrect=off` /
 * `autocomplete=off` / `autocapitalize=off`；而 `inlineCodeStyle` **只加 class、不带任何属性**。
 * 于是行内代码 `` `code` `` 内，**浏览器拼写检查仍会画红波浪线**、输入法仍可能自动更正 ——
 * 与 spec §11 不符（2026-10-01 审计 §4.34 的第二个缺口）。
 *
 * **为什么放在引擎侧而不是 `CoreEditor/`**：`packages/editor-core/UPSTREAM.md` 的取向是
 * 「改动优先落在 Mellow 自己的包」——`CoreEditor/` 的改动在 re-vendor 时会被 `cp -R` 覆盖，
 * 只能靠 UPSTREAM.md 的清单重放。放在引擎侧可随 Mellow 一起演进。
 *
 * **只做属性，不碰文本**：仍是 mark decoration（spec §2「Markdown Text 唯一真源」），
 * 不 replace、不改写任何字符；因此不影响 Source Fidelity 与 §8 Caret Stability。
 *
 * **视口裁剪**：与其他引擎扩展一致，只遍历 `visibleRanges`（spec §20；jsdom 无布局时回落全文档）。
 * 行内代码是**内联**节点，不存在「大表/大块」那种重渲染风险。
 */

import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import { isComposing } from './composition';

/** 行内代码容器 class（无 CSS 规则；仅用于测试与调试定位） */
export const INLINE_CODE_ATTR_CLASS = 'mellow-md-inlinecode-attr';

/**
 * 与 `codeBlockStyle` **逐字对齐**的四个属性。
 *
 * 保持与块级代码一致而不是另创一套，理由：两者要表达的是同一件事
 *（「这段不是自然语言，别做拼写/自动更正」），分叉会让未来的维护者不知道该改哪一处。
 * ⚠️ 若上游 `code.ts` 的这组属性变了，这里要同步（`verify-parity-ledger.mjs` 未覆盖 —— 如实记录）。
 */
const INLINE_CODE_ATTRIBUTES: Readonly<Record<string, string>> = {
  'spellcheck': 'false',
  'autocorrect': 'off',
  'autocomplete': 'off',
  'autocapitalize': 'off',
};

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
}

/** 运行时解析 CM6 模块（引擎约定：iframe 内不能有裸 ESM 导入，见 plugin.ts 文件头） */
function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
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

/** 构建行内代码属性扩展 */
export function buildInlineCodeAttrsExtension(): Extension {
  const cm = resolveCm();
  const { ViewPlugin, Decoration, RangeSetBuilder, syntaxTree } = cm;

  const build = (view: EditorView): DecorationSet => {
    const { state } = view;
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    // 视口裁剪（spec §20）；jsdom/无布局环境 visibleRanges 为空 → 回落全文档
    const ranges = view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: state.doc.length }];

    for (const { from, to } of ranges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter: (node) => {
          if (node.name !== 'InlineCode') return;
          if (node.from >= node.to) return; // partial parse：跳过退化区间
          builder.add(
            node.from,
            node.to,
            Decoration.mark({ class: INLINE_CODE_ATTR_CLASS, attributes: { ...INLINE_CODE_ATTRIBUTES } }),
          );
          return false; // 行内代码不嵌套，无需下钻
        },
      });
    }
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class InlineCodeAttrsPlugin {
      decorations: DecorationSet;
      constructor(readonly view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate): void {
        // 文本变化：先映射位置，保持渲染正确（与 plugin.ts / mdLink.ts 同序）
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        // Composition Guard：合成期间只映射、不重算（spec §6）
        if (isComposing(update.view)) return;
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (value: { decorations: DecorationSet }) => value.decorations },
  );

  // 本扩展只加属性、不改视觉，故**不**返回 theme（无需空主题充数）。
  return plugin;
}
