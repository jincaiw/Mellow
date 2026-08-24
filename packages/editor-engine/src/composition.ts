/**
 * IME Composition 状态跟踪（live-markdown-engine-spec §6 Composition Guard）。
 *
 * compositionstart → compositionend 之间，引擎只允许映射 decoration 位置，
 * 禁止重建 decoration（防止 IME 输入破坏编辑事务 / 光标 / 候选窗）。
 *
 * 组合状态按 EditorView 所属 DOM 根隔离。引擎仍允许无 view 参数的旧调用，
 * 但 ViewPlugin 必须传入自身 view，避免一个编辑器的候选输入冻结另一个文档。
 */

let composing = false;
let installed = false;
let composingRoot: Element | null = null;

type EditorViewLike = { dom: Element };

function editorRoot(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('.cm-editor') : null;
}

export function installCompositionTracking(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;

  document.addEventListener('compositionstart', (event) => {
    composing = true;
    composingRoot = editorRoot(event.target);
  });
  document.addEventListener('compositionend', () => {
    composing = false;
    composingRoot = null;
  });
  // 某些平台组合键/取消合成可能不触发 compositionend，keydown 兜底
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Process') {
      composing = false;
      composingRoot = null;
    }
  });
}

/** 是否处于 IME composition 中 */
export function isComposing(view?: EditorViewLike): boolean {
  if (!composing) return false;
  // 合成事件由 document 触发（部分 WebView / 测试环境）时保守地守护全部视图。
  if (view === undefined || composingRoot === null) return true;
  return view.dom === composingRoot || view.dom.contains(composingRoot) || composingRoot.contains(view.dom);
}

/** 仅供测试：重置状态 */
export function resetCompositionState(): void {
  composing = false;
  composingRoot = null;
}
