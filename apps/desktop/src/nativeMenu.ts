/**
 * 原生菜单 spec 构建器（V4.0 P1-1.3 前端侧）。
 * MENU_SCHEMA + 运行时状态（locale / 最近文件 / 主题 / checkState）→ NativeMenuSpec，
 * 经 `set_menu_spec` 下发 Rust materialization（§7.4 硬规则 6：Rust 只做物化）。
 *
 * 本文件是桌面 Adapter 装配层：平台判定（navigator.platform）与 debug 判定
 * （vite import.meta.env.DEV）在此完成，menuSchema 保持纯函数。
 */

import { toNativeMenuSpec } from '../../../packages/commands/src/menuSchema';
import type { NativeMenuSpec } from '../../../packages/commands/src/menuSchema';
import { BUILTIN_THEMES } from '../../../packages/themes/src';

export interface NativeMenuInputs {
  locale: string;
  /** i18n 翻译函数（App 的 createI18n 实例 t）。 */
  translate: (key: string) => string;
  /** 最近文件路径列表。 */
  recentFiles: string[];
  /** 当前生效主题 id。 */
  activeThemeId: string;
  /** 主题模式 light | dark | system。 */
  themeMode: string;
  /** 用户主题（appData/themes/*.css 加载结果；与内置主题一并派生主题菜单）。 */
  userThemes?: ReadonlyArray<{ id: string; name: string }>;
  /** 键入时检查拼写（CheckMenuItem 选中态，与 Settings Store 同一真源）。 */
  spellcheck: boolean;
  /** 替换菜单：独立功能开关与转换时机，共用 Settings Store。 */
  smartQuotes: boolean;
  smartDashes: boolean;
  smartPunctOnRender: boolean;
  /** G7-MENU-05：文本替换（Typora 替换子菜单；仅 macOS 显示，真值 = 设置 `editor.textReplacement`）。 */
  textReplacement: boolean;
  /** V7-W1.6：状态栏可见性（Typora Win/Linux 显示菜单「状态栏」CheckMenuItem 选中态）。 */
  statusbar: boolean;
  /** V7-W2.4：浮动编辑器工具栏启用态（Typora 1.14 View → Toolbar CheckMenuItem 选中态）。 */
  toolbar: boolean;
  /** V7-W6（G7-EDIT-15）：首行缩进（Typora Edit → 空格与换行 → 首行缩进 CheckMenuItem 选中态）。 */
  firstLineIndent: boolean;
  /** §4.360「六」5：双指缩放（Typora 显示菜单 Allow Magnification CheckMenuItem 选中态，
   *  单一真源 = 设置 `editor.allowMagnification`）。 */
  magnification: boolean;
  /** §4.360「六」6：当前文档换行符（'\n' | '\r\n'），驱动 编辑→换行符 子菜单
   *  CRLF/LF radio 勾选态（SDI 逐文档真值，重建时从 docMetaRef 求值）。 */
  docEol: string;
  /** §4.360「六」6：保存时在文末添加空行（CheckMenuItem 选中态，
   *  单一真源 = 设置 `files.finalNewline`）。 */
  finalNewline: boolean;
  /** P2-2.6 用户自定义键位 override（Settings 录制 → localStorage → 装配边界生效）。 */
  shortcutOverrides?: Readonly<Record<string, { mac?: string; winLinux?: string }>>;
}

export function buildNativeMenuSpec(inputs: NativeMenuInputs): NativeMenuSpec {
  const platform = navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win-linux';
  const meta = import.meta as { env?: { DEV?: boolean } };
  const debug = meta.env?.DEV ?? false;
  return toNativeMenuSpec({
    platform,
    debug,
    translate: inputs.translate,
    recentFiles: inputs.recentFiles,
    // P1-1.5：主题菜单从 Theme Registry（BUILTIN_THEMES + 用户主题）派生，Rust 零主题知识
    themes: [
      ...BUILTIN_THEMES.map((theme) => ({ id: theme.id, name: theme.name })),
      ...(inputs.userThemes ?? []),
    ],
    activeThemeId: inputs.activeThemeId,
    themeMode: inputs.themeMode,
    spellcheck: inputs.spellcheck,
    smartQuotes: inputs.smartQuotes,
    smartDashes: inputs.smartDashes,
    smartPunctOnRender: inputs.smartPunctOnRender,
    textReplacement: inputs.textReplacement,
    statusbar: inputs.statusbar,
    toolbar: inputs.toolbar,
    firstLineIndent: inputs.firstLineIndent,
    magnification: inputs.magnification,
    docEol: inputs.docEol,
    finalNewline: inputs.finalNewline,
    shortcutOverrides: inputs.shortcutOverrides,
  });
}
