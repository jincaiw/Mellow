/** Typewriter Mode：caret 保持 viewport 中部附近（F9）。
 *
 * 设计约束：
 * - 稳定：目标 scrollTop 是 caret 位置的确定性函数，每次只直接赋值，无动画、无插值 → 连续输入不晃动；
 * - 不打断用户：仅 selection/caret 移动或 docChanged 时居中；纯滚动（wheel）触发 viewportChanged 不响应；
 * - IME：composition 中不滚动，避免候选窗抖动；
 * - 大文件/表格/代码块：用 lineBlockAt（块布局）而非逐字测量，O(1) 级开销。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

export const TYPEWRITER_CENTER_RATIO = 0.5;

let enabled = false;
const activeViews = new Set<EditorView>();
const pendingRaf = new Map<EditorView, number>();

export function computeTypewriterScrollTop(caretTop: number, viewportHeight: number, scrollMax: number): number {
  const target = caretTop - viewportHeight * TYPEWRITER_CENTER_RATIO;
  return Math.max(0, Math.min(scrollMax, target));
}

export interface TypewriterOptions {
  /** 测试注入：返回 caret 在内容坐标系中的 y 坐标（默认用 lineBlockAt） */
  getCaretTop?: (view: EditorView, head: number) => number | null;
}

function defaultGetCaretTop(view: EditorView, head: number): number | null {
  const line = view.lineBlockAt(head);
  return line.top + line.height / 2;
}

function centerView(view: EditorView, getCaretTop: TypewriterOptions['getCaretTop']): void {
  const fn = getCaretTop ?? defaultGetCaretTop;
  const head = view.state.selection.main.head;
  const caretTop = fn(view, head);
  if (caretTop === null) return;
  const scrollDOM = view.scrollDOM;
  const client = scrollDOM.clientHeight;
  const scrollMax = Math.max(0, scrollDOM.scrollHeight - client);
  scrollDOM.scrollTop = computeTypewriterScrollTop(caretTop, client, scrollMax);
}

function scheduleCenter(view: EditorView, getCaretTop?: TypewriterOptions['getCaretTop']): void {
  const existing = pendingRaf.get(view);
  if (existing !== undefined) cancelAnimationFrame(existing);
  const id = requestAnimationFrame(() => {
    pendingRaf.delete(view);
    centerView(view, getCaretTop);
  });
  pendingRaf.set(view, id);
}

export function setTypewriterMode(on: boolean): void {
  enabled = on;
  if (on) {
    for (const view of activeViews) scheduleCenter(view);
  } else {
    for (const [view, id] of pendingRaf) {
      cancelAnimationFrame(id);
      pendingRaf.delete(view);
    }
  }
}

export function getTypewriterMode(): boolean {
  return enabled;
}

export interface TypewriterModeApi {
  setEnabled(on: boolean): void;
  getEnabled(): boolean;
}

function installApi(): void {
  (window as unknown as { __MELLOW_TYPEWRITER_MODE__?: TypewriterModeApi }).__MELLOW_TYPEWRITER_MODE__ = {
    setEnabled: setTypewriterMode,
    getEnabled: getTypewriterMode,
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

export function buildTypewriterModeExtension(options: TypewriterOptions = {}): Extension {
  const { ViewPlugin } = resolveCm();
  return ViewPlugin.fromClass(class TypewriterModePlugin {
    constructor(readonly view: EditorView) {
      activeViews.add(view);
      installApi();
      if (enabled) scheduleCenter(view, options.getCaretTop);
    }
    update(update: ViewUpdate): void {
      if (!enabled || isComposing(update.view)) return;
      const sel = update.state.selection.main;
      // 拖选（非空选区）不居中，避免与选择交互打架；纯滚动不触发这里
      if (!sel.empty) return;
      if (!update.docChanged && !update.selectionSet) return;
      scheduleCenter(update.view, options.getCaretTop);
    }
    destroy(): void {
      activeViews.delete(this.view);
      const id = pendingRaf.get(this.view);
      if (id !== undefined) {
        cancelAnimationFrame(id);
        pendingRaf.delete(this.view);
      }
    }
  });
}
