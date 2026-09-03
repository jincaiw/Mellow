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
  /** 键入时检查拼写（CheckMenuItem 选中态，与 Settings Store 同一真源）。 */
  spellcheck: boolean;
  /** 智能标点（CheckMenuItem 选中态）。 */
  smartPunct: boolean;
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
    // P1-1.5：主题菜单从 Theme Registry（BUILTIN_THEMES）派生，Rust 零主题知识
    themes: BUILTIN_THEMES.map((theme) => ({ id: theme.id, name: theme.name })),
    activeThemeId: inputs.activeThemeId,
    themeMode: inputs.themeMode,
    spellcheck: inputs.spellcheck,
    smartPunct: inputs.smartPunct,
    shortcutOverrides: inputs.shortcutOverrides,
  });
}
