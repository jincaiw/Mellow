/**
 * Large File Mode（PRD §109）。
 *
 * 触发：>5MB 或 >50,000 行（classifyLargeFile 纯函数）。
 * 自动降级（各扩展在 build/update 时读 isLargeFileMode()）：
 * - offscreen Mermaid / Math：解析与 widget 生成裁剪到视口 ± 余量（largeFileViewportRange）；
 * - image lazy：图片 widget 加 loading="lazy"（image/widget.ts）；
 * - spellcheck off：contentAttributes 动态切换（Compartment reconfigure）；
 * - heavy decorations：marker reveal 数量上限（largeFileDecorationLimit，plugin.ts）；
 * - animation off：editor 根元素加 .mellow-large-file class（CSS 关 transition/animation）。
 * 保持：edit / find / save / source / outline（增量，见各扩展）。
 *
 * 动态切换模式与 focusMode 一致：全局状态 + activeViews + 空 dispatch 强制重算；
 * 各 ViewPlugin 通过 largeFileVersion() 感知切换（version 变化 → rebuild）。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** 字节阈值（5 MB） */
export const LARGE_FILE_BYTES_THRESHOLD = 5 * 1024 * 1024;
/** 行数阈值（50,000） */
export const LARGE_FILE_LINES_THRESHOLD = 50_000;
/** 视口裁剪余量（行）：保证跨视口边界的块（fence/$$ 等）仍被解析 */
export const LARGE_FILE_VIEWPORT_MARGIN_LINES = 100;
/** heavy decorations 数量上限（marker reveal 每轮最多生成的 decoration） */
export const LARGE_FILE_DECORATION_LIMIT = 4000;

/** 触发判定（纯函数，可单测）：超过任一阈值即进入大文件模式 */
export function classifyLargeFile(byteLength: number, lineCount: number): boolean {
  return byteLength > LARGE_FILE_BYTES_THRESHOLD || lineCount > LARGE_FILE_LINES_THRESHOLD;
}

let active = false;
let version = 0;
const activeViews = new Set<EditorView>();

// ── 拼写检查用户偏好（D1-1：与 largeFile 模式共用同一 spellcheck Compartment）──
// effective = userSpellcheck && !largeFileMode（大文件模式始终强制关闭）
let userSpellcheck = true;

export function setUserSpellcheck(next: boolean): void {
  if (next === userSpellcheck) return;
  userSpellcheck = next;
  for (const view of activeViews) {
    for (const fn of reconfigureFns) fn(view, active);
    view.dispatch({ effects: [] });
  }
}

export function isUserSpellcheck(): boolean {
  return userSpellcheck;
}

/** 宿主 → iframe 拼写开关通道（D1-1） */
export interface SpellcheckApi {
  set(v: boolean): void;
  get(): boolean;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installSpellcheckApi(): void {
  (window as unknown as { __MELLOW_SPELLCHECK__?: SpellcheckApi }).__MELLOW_SPELLCHECK__ = {
    set: setUserSpellcheck,
    get: isUserSpellcheck,
  };
}

export function isLargeFileMode(): boolean {
  return active;
}

/** 状态版本号：切换时 +1，ViewPlugin 据此触发 rebuild */
export function largeFileVersion(): number {
  return version;
}

export function setLargeFileMode(next: boolean): void {
  if (next === active) return;
  active = next;
  version += 1;
  for (const view of activeViews) {
    for (const fn of reconfigureFns) fn(view, next);
    view.dispatch({ effects: [] });
  }
}

export function trackLargeFileView(view: EditorView): void {
  activeViews.add(view);
}

export function untrackLargeFileView(view: EditorView): void {
  activeViews.delete(view);
}

/**
 * 大文件模式下返回视口 ± 余量的字符区间（只解析/渲染该区间）；
 * 非大文件模式返回全文档（行为与原有实现一致）。
 */
export function largeFileViewportRange(view: EditorView): { from: number; to: number } {
  const doc = view.state.doc;
  if (!active) return { from: 0, to: doc.length };
  const ranges = view.visibleRanges.length > 0
    ? view.visibleRanges
    : [{ from: 0, to: doc.length }]; // jsdom/无布局环境 fallback
  const firstLine = Math.max(1, doc.lineAt(ranges[0].from).number - LARGE_FILE_VIEWPORT_MARGIN_LINES);
  const lastLine = Math.min(doc.lines, doc.lineAt(ranges[ranges.length - 1].to).number + LARGE_FILE_VIEWPORT_MARGIN_LINES);
  return { from: doc.line(firstLine).from, to: doc.line(lastLine).to };
}

/** heavy decorations 数量上限（大文件模式有限值，否则不限） */
export function largeFileDecorationLimit(): number {
  return active ? LARGE_FILE_DECORATION_LIMIT : Infinity;
}

type LargeFileReconfigure = (view: EditorView, active: boolean) => void;
const reconfigureFns = new Set<LargeFileReconfigure>();

/** 注册动态 reconfigure（如 spellcheck Compartment）；setLargeFileMode 时对每个 view 调用 */
export function registerLargeFileReconfigure(fn: LargeFileReconfigure): void {
  reconfigureFns.add(fn);
}

export interface LargeFileApi {
  isActive(): boolean;
  set(active: boolean): void;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installLargeFileApi(): void {
  (window as unknown as { __MELLOW_LARGE_FILE__?: LargeFileApi }).__MELLOW_LARGE_FILE__ = {
    isActive: isLargeFileMode,
    set: setLargeFileMode,
  };
}

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Compartment: typeof import('@codemirror/state').Compartment;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Compartment: state.Compartment };
}

/** 实际生效的拼写状态：用户偏好 && 非大文件模式 */
function effectiveSpellcheck(): boolean {
  return userSpellcheck && !active;
}

/**
 * 构建 Large File Mode 扩展：
 * - 跟踪 view（setLargeFileMode / setUserSpellcheck 时强制重算）；
 * - spellcheck Compartment（effective = 用户偏好 && !大文件模式）；
 * - .mellow-large-file class + 动画关闭主题。
 */
export function buildLargeFileExtension(): Extension {
  const cm = resolveCm();
  const { EditorView, ViewPlugin, Compartment } = cm;
  const spellcheck = new Compartment();

  registerLargeFileReconfigure((view) => {
    view.dispatch({
      effects: spellcheck.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: effectiveSpellcheck() ? 'true' : 'false' }),
      ),
    });
  });

  const plugin = ViewPlugin.fromClass(
    class LargeFilePlugin {
      constructor(readonly view: EditorView) {
        trackLargeFileView(view);
        view.dom.classList.toggle('mellow-large-file', isLargeFileMode());
      }
      update(update: ViewUpdate): void {
        update.view.dom.classList.toggle('mellow-large-file', isLargeFileMode());
      }
      destroy(): void {
        untrackLargeFileView(this.view);
      }
    },
  );

  const noTransition = {
    transition: 'none !important',
    animation: 'none !important',
  };
  const theme = EditorView.theme({
    '&.mellow-large-file .cm-line': noTransition,
    '&.mellow-large-file .cm-gutterElement': noTransition,
    '&.mellow-large-file .cm-cursor': noTransition,
    '&.mellow-large-file .cm-selectionBackground': noTransition,
    '&.mellow-large-file .cm-widgetBuffer': noTransition,
    '&.mellow-large-file .mellow-md-image-img': noTransition,
    '&.mellow-large-file .mellow-mermaid-widget': noTransition,
    '&.mellow-large-file .mellow-math-widget': noTransition,
  });

  return [spellcheck.of(EditorView.contentAttributes.of({ spellcheck: 'true' })), plugin, theme];
}
