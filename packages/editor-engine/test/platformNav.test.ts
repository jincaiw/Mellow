/**
 * P4.4 —— Enter / Backspace / Delete / Home / End / 词移动平台化
 * （master-plan P4-5）测试矩阵。
 *
 * 结构模拟真实装配栈（jsdom）：
 * - `defaultKeymap`：CM 基线（内含 standardKeymap 平台绑定：词移动、
 *   Ctrl+Home/End、Ctrl+Backspace/Delete、Cmd 系 mac 字段）；
 * - `coreLikeKeymap`：模拟 vendored CoreEditor `customizedCommandsKeymap`
 *   的 Home/End 文档滚动语义（default 优先级，记录是否触发）；
 * - `install(false)`：引擎装配（platformNav 按 UA 探测：jsdom 空串 → linux）。
 *
 * 平台说明：CM `browser.mac` 在 jsdom 恒为 false → Cmd 系（mac 专属）绑定
 * 无法单测驱动，归档 P4.11 真机复核；mac 分支只验证「引擎不覆盖」。
 */

import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, buildPlatformNavKeymap, detectPlatform } from '../src/index';

const REAL_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const REAL_WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const REAL_LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

let coreHomeFired = false;
let coreEndFired = false;

/** 模拟 CoreEditor customizedCommandsKeymap：Home/End 滚动语义（default 优先级） */
const coreLikeKeymap = keymap.of([
  { key: 'Home', run: () => { coreHomeFired = true; return true; } },
  { key: 'End', run: () => { coreEndFired = true; return true; } },
]);

function makeView(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      // 忠实模拟 CoreEditor extensions.ts:127——Home/End 从 defaultKeymap 过滤，
      // 由 customizedCommandsKeymap（此处以 coreLikeKeymap 代替）承担
      keymap.of(defaultKeymap.filter((b) => !['Home', 'End'].includes(b.key ?? ''))),
      coreLikeKeymap,
      install(false),
    ],
  });
  view.focus();
  return view;
}

/** 向 contentDOM 派发真实 keydown（CM keymap 消费路径） */
function pressKey(
  view: EditorView,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; meta?: boolean; alt?: boolean } = {},
): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
  }));
}

function setUA(ua: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function caret(view: EditorView): number {
  return view.state.selection.main.head;
}

beforeEach(() => {
  coreHomeFired = false;
  coreEndFired = false;
});

afterEach(() => {
  setUA(''); // 恢复 jsdom 默认（空串 → linux → 引擎键位激活）
});

describe('P4.4 — detectPlatform（UA 探测）', () => {
  test('macOS / Windows / Linux UA 分别识别', () => {
    setUA(REAL_MAC_UA);
    expect(detectPlatform()).toBe('mac');
    setUA(REAL_WIN_UA);
    expect(detectPlatform()).toBe('windows');
    setUA(REAL_LINUX_UA);
    expect(detectPlatform()).toBe('linux');
  });

  test('mac 平台返回空扩展（不覆盖 CoreEditor 滚动语义）', () => {
    expect(buildPlatformNavKeymap('mac')).toEqual([]);
  });
});

describe('P4.4 — Home/End caret 化（Windows/Linux）', () => {
  test('Home 两段式：先行首非空白，再列 0（Windows 惯例）', () => {
    setUA(REAL_WIN_UA);
    const view = makeView('  indented text\nsecond line');
    view.dispatch({ selection: { anchor: 5 } });

    pressKey(view, 'Home');
    expect(caret(view)).toBe(2); // 首个非空白
    expect(coreHomeFired).toBe(false); // 覆盖 CoreEditor 滚动语义

    pressKey(view, 'Home');
    expect(caret(view)).toBe(0); // 列 0
    view.destroy();
  });

  test('End 移动到本行行尾', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('  indented text\nsecond line');
    view.dispatch({ selection: { anchor: 5 } });

    pressKey(view, 'End');
    expect(caret(view)).toBe(15); // 行 1 末尾
    expect(coreEndFired).toBe(false);
    view.destroy();
  });

  test('多行文档：Home 只到本行行首（不跳文档首）', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('  indented text\nsecond line');
    view.dispatch({ selection: { anchor: 18 } }); // 行 2 内

    pressKey(view, 'Home');
    expect(caret(view)).toBe(16); // 行 2 行首
    view.destroy();
  });

  test('Shift+Home / Shift+End 选区（anchor 不动 head 移动）', () => {
    setUA(REAL_WIN_UA);
    const view = makeView('  indented text\nsecond line');
    view.dispatch({ selection: { anchor: 5 } });

    pressKey(view, 'Home', { shift: true });
    expect(view.state.selection.main.anchor).toBe(5);
    expect(view.state.selection.main.head).toBe(2);

    pressKey(view, 'End', { shift: true });
    // CM extend 语义：anchor 保持按下的起点（5），head 移到行尾
    expect(view.state.selection.main.anchor).toBe(5);
    expect(view.state.selection.main.head).toBe(15);
    view.destroy();
  });

  test('mac：Home/End 走 CoreEditor 滚动语义（引擎不覆盖，caret 不动）', () => {
    setUA(REAL_MAC_UA);
    const view = makeView('  indented text\nsecond line');
    view.dispatch({ selection: { anchor: 5 } });

    pressKey(view, 'Home');
    expect(coreHomeFired).toBe(true); // CoreEditor 语义未被引擎抢占
    expect(caret(view)).toBe(5); // caret 不动（滚动型）
    view.destroy();
  });
});

describe('P4.4 — 词移动与删除键位锁定（CM defaultKeymap 平台绑定）', () => {
  test('Ctrl+Left/Right 词移动（cursorGroup）', () => {
    setUA(REAL_WIN_UA);
    const view = makeView('foo bar baz');
    view.dispatch({ selection: { anchor: 11 } });

    pressKey(view, 'ArrowLeft', { ctrl: true });
    expect(caret(view)).toBe(8); // 'baz' 首
    pressKey(view, 'ArrowLeft', { ctrl: true });
    expect(caret(view)).toBe(4); // 'bar' 首

    pressKey(view, 'ArrowRight', { ctrl: true });
    expect(caret(view)).toBe(7); // 'bar' 尾
    view.destroy();
  });

  test('Ctrl+Backspace 删词（deleteGroupBackward）', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('foo bar');
    view.dispatch({ selection: { anchor: 7 } });

    pressKey(view, 'Backspace', { ctrl: true });
    expect(view.state.doc.toString()).toBe('foo ');
    view.destroy();
  });

  test('Ctrl+Delete 删词向后（deleteGroupForward，组边界不吞尾随空格）', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('foo bar');
    view.dispatch({ selection: { anchor: 0 } });

    pressKey(view, 'Delete', { ctrl: true });
    // 实测（commands dist）：deleteGroupForward 删到下一组边界（'foo'），
    // 不吞尾随空格；与 deleteGroupBackward 对称（前例同样不吞前导空格）
    expect(view.state.doc.toString()).toBe(' bar');
    view.destroy();
  });

  test('Ctrl+Home / Ctrl+End 文档首尾', () => {
    setUA(REAL_WIN_UA);
    const view = makeView('alpha\nbeta\ngamma');
    view.dispatch({ selection: { anchor: 8 } });

    pressKey(view, 'Home', { ctrl: true });
    expect(caret(view)).toBe(0);
    pressKey(view, 'End', { ctrl: true });
    expect(caret(view)).toBe(16); // 文档末尾
    view.destroy();
  });

  test('Delete 删除光标前字符（deleteCharForward）', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('abc');
    view.dispatch({ selection: { anchor: 1 } });

    pressKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe('ac');
    expect(caret(view)).toBe(1);
    view.destroy();
  });
});

describe('P4.4 — Enter/Backspace Markdown 语义（markdownKeymap，跨平台一致）', () => {
  test('Enter 空列表项：MarkEdit 语义（插空行保留标记，再按清除）——Typora「直接退出」分歧记录', () => {
    // 实测（vendored lang-markdown/commands.ts:187 nonTightLists:false 为 MarkEdit
    // 刻意选择）：空列表项上 Enter 不删除标记，而是插入空行 + 续 '- '；
    // 第三次 Enter 才清掉标记行。Typora 语义 = 空项 Enter 直接退出列表，
    // 与 vendored 行为分歧 —— 按统一规则「先报告不擅自裁决」记录为观察项，
    // 不在引擎层覆盖 CoreEditor 语义。
    setUA(REAL_WIN_UA);
    const view = makeView('- item');
    view.dispatch({ selection: { anchor: 6 } });

    pressKey(view, 'Enter');
    expect(view.state.doc.toString()).toBe('- item\n- '); // 续行带标记

    pressKey(view, 'Enter'); // 空列表项：插入空行，标记保留
    expect(view.state.doc.toString()).toBe('- item\n\n- ');

    pressKey(view, 'Enter'); // 空行上：清掉标记
    expect(view.state.doc.toString()).toBe('- item\n\n');
    view.destroy();
  });

  test('Enter 引用续行', () => {
    setUA(REAL_LINUX_UA);
    const view = makeView('> quote');
    view.dispatch({ selection: { anchor: 7 } });

    pressKey(view, 'Enter');
    expect(view.state.doc.toString()).toBe('> quote\n> ');
    view.destroy();
  });

  test('Backspace 在 emphasis 标记处逐字符删除（deleteMarkupBackward 实测语义）', () => {
    // 实测：CM deleteMarkupBackward 在 caret 紧邻标记时与逐字符删除一致
    //（每次 1 字符）；Typora「Backspace 成对剥掉 '**'」为 parity 分歧，
    // 记录为观察项（同空列表项 Enter），不在引擎层擅自覆盖。
    setUA(REAL_WIN_UA);
    const view = makeView('**bold**');
    view.dispatch({ selection: { anchor: 8 } });

    pressKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe('**bold*');
    pressKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe('**bold');
    view.destroy();
  });
});
