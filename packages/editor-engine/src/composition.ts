/**
 * IME Composition 状态跟踪（live-markdown-engine-spec §6 Composition Guard）。
 *
 * compositionstart → compositionend 之间，引擎只允许映射 decoration 位置，
 * 禁止重建 decoration（防止 IME 输入破坏编辑事务 / 光标 / 候选窗）。
 *
 * 组合状态按 EditorView 所属 DOM 根隔离。引擎仍允许无 view 参数的旧调用，
 * 但 ViewPlugin 必须传入自身 view，避免一个编辑器的候选输入冻结另一个文档。
 */

let installed = false;
/** 有些 WebView 会把 composition 事件直接派发到 document；该计数保留全局保守保护。 */
let documentCompositionDepth = 0;
/** 正常 DOM composition 按编辑器根节点隔离，允许多个 EditorView 同时工作。 */
const composingRoots = new Map<Element, number>();

type EditorViewLike = { dom?: Element };

function editorRoot(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('.cm-editor') : null;
}

export function installCompositionTracking(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;

  document.addEventListener('compositionstart', (event) => {
    const root = editorRoot(event.target);
    if (root === null) {
      documentCompositionDepth += 1;
      return;
    }
    composingRoots.set(root, (composingRoots.get(root) ?? 0) + 1);
  });
  document.addEventListener('compositionend', (event) => {
    const root = editorRoot(event.target);
    if (root === null) {
      documentCompositionDepth = Math.max(0, documentCompositionDepth - 1);
      return;
    }
    const depth = composingRoots.get(root) ?? 0;
    if (depth <= 1) composingRoots.delete(root);
    else composingRoots.set(root, depth - 1);
  });
  // 某些平台组合键/取消合成可能不触发 compositionend，keydown 兜底
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Process') {
      documentCompositionDepth = 0;
      composingRoots.clear();
    }
  });
}

/** 是否处于 IME composition 中 */
export function isComposing(view?: EditorViewLike): boolean {
  if (documentCompositionDepth > 0) return true;
  if (composingRoots.size === 0) return false;
  // dom 未知的旧调用方保持保守保护；ViewPlugin 则只守护自己的根。
  if (view === undefined || view.dom === undefined) return true;
  for (const root of composingRoots.keys()) {
    if (view.dom === root || view.dom.contains(root) || root.contains(view.dom)) return true;
  }
  return false;
}

/** 仅供测试：重置状态 */
export function resetCompositionState(): void {
  documentCompositionDepth = 0;
  composingRoots.clear();
}
