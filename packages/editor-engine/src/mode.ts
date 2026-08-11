/**
 * mode —— 编辑模式状态（Source / Live，spec §5.5）。
 *
 * Source Mode：显示全部 marker（forceSource → NodeVisualState.source）。
 * Live Mode（默认）：marker 按 reveal policy 隐藏/显示。
 *
 * 模块级状态（与 composition 一致），供测试/宿主切换。
 */

let sourceMode = false;

/** 进入 Source Mode（显示全部 marker） */
export function setSourceMode(enabled: boolean): void {
  sourceMode = enabled;
}

/** 当前是否 Source Mode */
export function isSourceMode(): boolean {
  return sourceMode;
}

/** 仅供测试：重置 */
export function resetModeState(): void {
  sourceMode = false;
}
