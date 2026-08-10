/**
 * IME Composition 状态跟踪（live-markdown-engine-spec §6 Composition Guard）。
 *
 * compositionstart → compositionend 之间，引擎只允许映射 decoration 位置，
 * 禁止重建 decoration（防止 IME 输入破坏编辑事务 / 光标 / 候选窗）。
 *
 * 模块级状态 + 幂等安装：在宿主（iframe）加载时调用 installCompositionTracking()。
 */

let composing = false;
let installed = false;

export function installCompositionTracking(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;

  document.addEventListener('compositionstart', () => {
    composing = true;
  });
  document.addEventListener('compositionend', () => {
    composing = false;
  });
  // 某些平台组合键/取消合成可能不触发 compositionend，keydown 兜底
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Process') {
      composing = false;
    }
  });
}

/** 是否处于 IME composition 中 */
export function isComposing(): boolean {
  return composing;
}

/** 仅供测试：重置状态 */
export function resetCompositionState(): void {
  composing = false;
}
