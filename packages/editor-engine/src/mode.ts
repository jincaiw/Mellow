/**
 * mode —— 编辑模式状态（Source / Live，spec §5.5）。
 *
 * Source Mode：显示全部 marker（forceSource → NodeVisualState.source）。
 * Live Mode（默认）：marker 按 reveal policy 隐藏/显示。
 *
 * 模式状态可按 EditorView 隔离；无 view 参数保持单文档宿主和既有测试兼容。
 */

let sourceMode = false;
const viewSourceModes = new WeakMap<object, boolean>();

type EditorViewLike = object;

/** 进入 Source Mode（显示全部 marker） */
export function setSourceMode(enabled: boolean, view?: EditorViewLike): void {
  if (view === undefined) {
    sourceMode = enabled;
    return;
  }
  viewSourceModes.set(view, enabled);
}

/** 当前是否 Source Mode */
export function isSourceMode(view?: EditorViewLike): boolean {
  return view === undefined ? sourceMode : (viewSourceModes.get(view) ?? sourceMode);
}

/** 仅供测试：重置 */
export function resetModeState(): void {
  sourceMode = false;
}
