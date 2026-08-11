/**
 * Live Task Checkbox（spec §15）。
 *
 * - Live Mode：TaskMarker（`[ ]`/`[x]`）渲染为 checkbox widget；
 * - 点击：minimal patch —— 只替换 marker 字符范围（3 字符），单 transaction → 单 Undo；
 * - 不重写整行、不改变 indentation（只碰 TaskMarker [from,to]）；
 * - nested task：TaskMarker 位于任意嵌套 ListItem 内均生效；
 * - Source Mode：不渲染 widget，显示原文 `[ ]`（round-trip 无损 —— replace 只影响渲染，doc 文本从未变）。
 */

import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isSourceMode } from './mode';

const CHECKBOX_CLASS = 'mellow-md-task-checkbox';

/** 运行时 CM6 模块（iframe 内与 CoreEditor 同一实例） */
interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
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
    WidgetType: view.WidgetType,
    RangeSetBuilder: state.RangeSetBuilder,
    syntaxTree: language.syntaxTree,
  };
}

/** 构建 Task Checkbox 扩展（与 marker reveal 独立，可单独注入） */
export function buildTaskCheckboxExtension(): Extension {
  const cm = resolveCm();
  const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, syntaxTree } = cm;

  class CheckboxWidget extends WidgetType {
    constructor(
      readonly checked: boolean,
      readonly markerFrom: number,
      readonly markerTo: number,
      private readonly view: EditorView,
    ) {
      super();
    }

    override eq(other: CheckboxWidget): boolean {
      return other.checked === this.checked
        && other.markerFrom === this.markerFrom
        && other.markerTo === this.markerTo;
    }

    override toDOM(): HTMLElement {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = this.checked;
      box.className = CHECKBOX_CLASS;
      // widget 内部监听（CM 的 replace widget 事件不冒泡到 plugin eventHandlers）
      box.addEventListener('click', (event) => {
        event.preventDefault();
        const current = this.view.state.sliceDoc(this.markerFrom, this.markerTo);
        // minimal patch：`[ ]` ↔ `[x]`（3 字符，单 transaction）
        const next = current === '[x]' ? '[ ]' : '[x]';
        this.view.dispatch({
          changes: { from: this.markerFrom, to: this.markerTo, insert: next },
        });
      });
      return box;
    }
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    // Source Mode：显示原文 `[ ]`（round-trip）
    if (isSourceMode()) {
      return Decoration.none;
    }

    const { state } = view;
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    syntaxTree(state).iterate({
      from: 0,
      to: state.doc.length,
      enter: (node) => {
        if (node.name !== 'TaskMarker' || node.from >= node.to) {
          return;
        }
        const text = state.sliceDoc(node.from, node.to);
        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new CheckboxWidget(text === '[x]', node.from, node.to, view),
          }),
        );
      },
    });
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class TaskCheckboxPlugin {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // doc/viewport/source-mode（经 selectionSet 触发）变化时重算
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value: { decorations: DecorationSet }) => value.decorations,
    },
  );

  const style = cm.EditorView.theme({
    [`.${CHECKBOX_CLASS}`]: {
      margin: '0 4px 0 0',
      verticalAlign: 'middle',
      cursor: 'pointer',
      accentColor: 'var(--mellow-accent, #0a69da)',
    },
  });

  return [plugin, style];
}

export { CHECKBOX_CLASS };
