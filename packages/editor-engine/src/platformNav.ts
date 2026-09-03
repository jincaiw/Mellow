/**
 * Home / End 平台化（P4.4，master-plan P4-5「Enter / Backspace / Delete /
 * Home / End / Word Move 平台化」）。
 *
 * 缺口（vendored CoreEditor 已核实）：
 * - CoreEditor `customizedCommandsKeymap`（modules/commands/index.ts:157）
 *   把 Home/End 无平台区分地绑成「滚动到文档首/尾」——这是 macOS 惯例
 *   （Home/End 滚动、Cmd+方向移动 caret），但 Windows/Linux 惯例是
 *   **Home/End 移动 caret 到行首/行尾**（Ctrl+Home/End 才是文档首/尾）；
 * - CoreEditor 为只读红线（UPSTREAM.md），修复必须经引擎扩展注入。
 *
 * 其余键位 CM `defaultKeymap`（内含 standardKeymap）已平台正确，无需引擎
 * 重复实现（测试锁定，见 test/platformNav.test.ts）：
 * - 词移动：Ctrl+Left/Right（macOS 为 Option+Left/Right，经 mac 字段重绑）
 *   → cursorGroupLeft/Right；
 * - macOS：Cmd+Left/Right → 行首尾、Cmd+Up/Down → 文档首尾、
 *   Cmd+Backspace/Delete → 删到行首/行尾、Alt+Backspace → 删词；
 * - Windows/Linux：Home/End → 行首尾（cursorLineBoundary 含 Windows 两段式：
 *   先行首非空白、再列 0，见 commands dist moveByLineBoundary 824-834 行）、
 *   Ctrl+Home/End → 文档首尾、Ctrl+Backspace/Delete → 删词。
 * - Markdown 语义：Enter 续行（列表/引用，空项退出）与 Backspace 删标记
 *   由 lang-markdown markdownKeymap（Prec.high）承担，跨平台一致。
 *
 * 注意：mac 分支返回空扩展——macOS 上保持 CoreEditor 滚动语义不动。
 * jsdom 中 CM `browser.mac` 恒为 false，mac 专属绑定（Cmd 系）无法在单测
 * 驱动，归档到 P4.11 真机复核清单。
 */

import type { EditorView, KeyBinding } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

/** Mellow 支持的三平台（PRD §113） */
export type MellowPlatform = 'mac' | 'windows' | 'linux';

interface CmRuntime {
  keymap: typeof import('@codemirror/view').keymap;
  Prec: typeof import('@codemirror/state').Prec;
  cursorLineBoundaryBackward: typeof import('@codemirror/commands').cursorLineBoundaryBackward;
  cursorLineBoundaryForward: typeof import('@codemirror/commands').cursorLineBoundaryForward;
  selectLineBoundaryBackward: typeof import('@codemirror/commands').selectLineBoundaryBackward;
  selectLineBoundaryForward: typeof import('@codemirror/commands').selectLineBoundaryForward;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-platform-nav] window.require unavailable');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const commands = requireFn('@codemirror/commands') as typeof import('@codemirror/commands');
  return {
    keymap: view.keymap,
    Prec: state.Prec,
    cursorLineBoundaryBackward: commands.cursorLineBoundaryBackward,
    cursorLineBoundaryForward: commands.cursorLineBoundaryForward,
    selectLineBoundaryBackward: commands.selectLineBoundaryBackward,
    selectLineBoundaryForward: commands.selectLineBoundaryForward,
  };
}

/** 经 UA 探测平台（Tauri WebView 保持标准 UA 串；jsdom 为空串 → linux） */
export function detectPlatform(): MellowPlatform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac|iPhone|iPad|iPadOS/i.test(ua)) return 'mac';
  return 'linux';
}

/** caret 版 Home/End（Composition Guard：合成期间吞键，防 caret 跳动破坏合成，spec §6） */
function caretToLineBoundary(
  view: EditorView,
  forward: boolean,
  commands: Pick<CmRuntime, 'cursorLineBoundaryBackward' | 'cursorLineBoundaryForward'>,
): boolean {
  if (isComposing(view)) return true;
  return (forward ? commands.cursorLineBoundaryForward : commands.cursorLineBoundaryBackward)(view);
}

/** Shift+Home/End 选区版 */
function selectToLineBoundary(
  view: EditorView,
  forward: boolean,
  commands: Pick<CmRuntime, 'selectLineBoundaryBackward' | 'selectLineBoundaryForward'>,
): boolean {
  if (isComposing(view)) return true;
  return (forward ? commands.selectLineBoundaryForward : commands.selectLineBoundaryBackward)(view);
}

/**
 * 构建平台导航键位（install() 装配）。
 *
 * - macOS：返回空扩展（CoreEditor 的 Home/End 滚动 + defaultKeymap 的
 *   Cmd 系绑定已是 macOS 惯例，不覆盖）；
 * - Windows/Linux：`Prec.high` 把 Home/End 覆盖为 caret 行首尾移动
 *   （Shift 变体为选区）。优先级高于 CoreEditor 无优先级的
 *   customizedCommandsKeymap（macOS 滚动语义），低于 table Tab 的
 *   Prec.highest，不与其他引擎键位争抢。
 */
export function buildPlatformNavKeymap(platform: MellowPlatform = detectPlatform()): Extension {
  if (platform === 'mac') return [];
  const {
    keymap, Prec,
    cursorLineBoundaryBackward, cursorLineBoundaryForward,
    selectLineBoundaryBackward, selectLineBoundaryForward,
  } = resolveCm();
  const cursor = { cursorLineBoundaryBackward, cursorLineBoundaryForward };
  const select = { selectLineBoundaryBackward, selectLineBoundaryForward };
  const bindings: KeyBinding[] = [
    {
      key: 'Home',
      run: (view) => caretToLineBoundary(view, false, cursor),
      shift: (view) => selectToLineBoundary(view, false, select),
    },
    {
      key: 'End',
      run: (view) => caretToLineBoundary(view, true, cursor),
      shift: (view) => selectToLineBoundary(view, true, select),
    },
  ];
  return Prec.high(keymap.of(bindings));
}
