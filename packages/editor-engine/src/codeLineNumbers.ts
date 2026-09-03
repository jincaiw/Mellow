/**
 * 代码块行号（Typora parity：偏好设置 → Markdown → 代码块行号）。
 *
 * - 对 FencedCode 内容行（不含围栏行）行首插入行号 widget（1..N，右对齐淡化）；
 * - 开关经 iframe `__MELLOW_CODE_LINE_NUMBERS__` 注入（默认关闭，与 Typora 默认一致）；
 * - 动态切换与 focusMode/largeFile 同模式：模块级状态 + version + 空 dispatch 强制重算；
 * - Large File Mode 下禁用（性能优先）；Source Mode 保持显示（Typora 行为一致）。
 *
 * EditorView 经 window.require 延迟解析（引擎约定：iframe 内不能有裸 ESM 导入
 * @codemirror/*，见 smartPunctuation.ts 文件头注释）。
 */

import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isLargeFileMode, largeFileDecorationLimit } from './largeFile';
import { isComposing } from './composition';

const LINE_NUMBER_CLASS = 'mellow-cln';

/** 模块级开关（宿主注入；默认关闭） */
let enabled = false;
let version = 0;
const activeViews = new Set<EditorView>();

export function setCodeLineNumbers(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  version += 1;
  for (const view of activeViews) {
    view.dispatch({ effects: [] });
  }
}

export function isCodeLineNumbersEnabled(): boolean {
  return enabled;
}

/** 状态版本号：切换时 +1，ViewPlugin 据此触发 rebuild */
export function codeLineNumbersVersion(): number {
  return version;
}

/** 宿主 → iframe 代码块行号通道 */
export interface CodeLineNumbersApi {
  set(v: boolean): void;
  get(): boolean;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installCodeLineNumbersApi(): void {
  (window as unknown as { __MELLOW_CODE_LINE_NUMBERS__?: CodeLineNumbersApi }).__MELLOW_CODE_LINE_NUMBERS__ = {
    set: setCodeLineNumbers,
    get: isCodeLineNumbersEnabled,
  };
}

/**
 * 围栏内容行区间（纯函数，可单测）：
 * 给定 FencedCode 起止行号与末行文本，返回编号行区间（含端点，1-based 行号）。
 * - 末行是闭合围栏（``` / ~~~）→ 不编号；
 * - 未闭合围栏（EOF 截断）→ 编号到末行。
 */
export function fenceContentRange(startLine: number, endLine: number, endLineText: string): { first: number; last: number } {
  const first = startLine + 1;
  const last = /^ {0,3}(`{3,}|~{3,})\s*$/.test(endLineText.trimEnd()) ? endLine - 1 : endLine;
  return { first, last };
}

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

/** 构建代码块行号扩展 */
export function buildCodeLineNumbersExtension(): Extension {
  const cm = resolveCm();
  const { EditorView, ViewPlugin, Decoration, WidgetType, RangeSetBuilder, syntaxTree } = cm;

  class LineNumberWidget extends WidgetType {
    constructor(readonly n: number) {
      super();
    }

    override eq(other: LineNumberWidget): boolean {
      return other.n === this.n;
    }

    override toDOM(): HTMLElement {
      const span = document.createElement('span');
      span.className = LINE_NUMBER_CLASS;
      span.textContent = String(this.n);
      return span;
    }

    override ignoreEvent(): boolean {
      return true;
    }
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    if (!enabled || isLargeFileMode()) {
      return Decoration.none;
    }

    const { state } = view;
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    const limit = largeFileDecorationLimit();
    let count = 0;

    syntaxTree(state).iterate({
      from: 0,
      to: state.doc.length,
      enter: (node) => {
        if (node.name !== 'FencedCode' || node.from >= node.to) {
          return;
        }
        const startLine = state.doc.lineAt(node.from).number;
        const endLine = state.doc.lineAt(node.to).number;
        const endLineText = state.doc.line(endLine).text;
        const { first, last } = fenceContentRange(startLine, endLine, endLineText);
        for (let line = first; line <= last && count < limit; ++line) {
          builder.add(state.doc.line(line).from, state.doc.line(line).from, Decoration.widget({
            widget: new LineNumberWidget(line - first + 1),
            side: -1,
          }));
          ++count;
        }
      },
    });

    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class CodeLineNumbersPlugin {
      decorations: DecorationSet = Decoration.none;
      private watchedVersion = codeLineNumbersVersion();

      constructor(readonly view: EditorView) {
        activeViews.add(view);
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        const versionChanged = codeLineNumbersVersion() !== this.watchedVersion;
        if (versionChanged) this.watchedVersion = codeLineNumbersVersion();
        if (update.docChanged || update.viewportChanged || versionChanged) {
          // Composition Guard：合成期间只映射位置，不重算（spec §6）
          if (isComposing(update.view)) {
            return;
          }
          this.decorations = buildDecorations(update.view);
        }
      }

      destroy(): void {
        activeViews.delete(this.view);
      }
    },
    { decorations: (value: { decorations: DecorationSet }) => value.decorations },
  );

  const theme = EditorView.theme({
    [`.${LINE_NUMBER_CLASS}`]: {
      display: 'inline-block',
      minWidth: '1.6em',
      paddingRight: '0.9em',
      textAlign: 'right',
      opacity: '0.45',
      userSelect: 'none',
      fontVariantNumeric: 'tabular-nums',
    },
  });

  return [plugin, theme];
}
