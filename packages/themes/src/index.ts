/**
 * themes —— 主题契约（PRD §66-67）。
 * 运行时主题实现位于 editor-core（16 个内置主题）；
 * 本包提供 Mellow 侧契约与内置主题名清单（供设置页/React 层引用）。
 */

export interface ThemeColors {
  accent: string;
  text: string;
  comment: string;
  background: string;
  caret: string;
  selection: string;
  activeLine: string;
  lineNumber: string;
}

export interface ThemeContract {
  id: string;
  name: string;
  dark: boolean;
  colors: ThemeColors;
}

/** editor-core 内置主题（与 CoreEditor/src/styling/themes 对齐） */
export const BUILTIN_THEME_IDS = [
  'github-light', 'github-dark', 'minimal-light', 'minimal-dark',
  'solarized-light', 'solarized-dark', 'night-owl', 'dracula',
  'rose-pine', 'rose-pine-dawn', 'cobalt', 'synthwave84',
  'xcode-light', 'xcode-dark', 'winter-is-coming-light', 'winter-is-coming-dark',
] as const;

export type BuiltinThemeId = typeof BUILTIN_THEME_IDS[number];
