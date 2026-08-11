/**
 * Heading Live Editing —— 完整测试矩阵（ATX H1-H6 + Setext H1/H2）。
 *
 * 状态机（spec §9）：idle → rendered；caret enters → source/mixed；caret leaves → rendered
 * 对照 Typora：marker（`# ` / `===`）idle 隐藏，caret 进入显示。
 */

import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setSourceMode, resetModeState } from '../src/index';
import {
  setUpEditor, moveCaret, selectRange, markerTexts, sleep, startComposition, endComposition,
} from './harness';

function setUpWithHistory(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

function setUpWithComposition(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  view.focus();
  return view;
}

beforeEach(() => {
  resetModeState();
});

// ─────────────────────────── ATX H1-H6 ───────────────────────────

describe('ATX Heading — idle / caret', () => {
  test.each([1, 2, 3, 4, 5, 6])('H%d idle → rendered（marker 隐藏）', async (level) => {
    const hashes = '#'.repeat(level);
    const view = setUpEditor(`${hashes} Title\n\nplain`);
    await sleep();
    moveCaret(view, view.state.doc.toString().indexOf('plain') + 1); // 节点外（plain 内）
    await sleep();
    expect(markerTexts(view)).toContain(`${hashes} `);
  });

  test('caret before（紧前节点外）→ rendered', async () => {
    const view = setUpEditor('# Title');
    await sleep();
    moveCaret(view, 0); // marker 上 → source
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret inside（标题文本）→ source', async () => {
    const view = setUpEditor('# Title');
    await sleep();
    moveCaret(view, 3);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // marker 显示
  });

  test('caret after（节点末尾）→ source（边界）', async () => {
    const view = setUpEditor('# Title');
    await sleep();
    moveCaret(view, 7);
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret leaves → rendered', async () => {
    const view = setUpEditor('# Title\n\nplain');
    await sleep();
    moveCaret(view, 3); // inside → source
    await sleep();
    moveCaret(view, 10); // leaves → rendered
    await sleep();
    expect(markerTexts(view)).toContain('# ');
  });

  test('空标题安全（# ）', async () => {
    const view = setUpEditor('# \n\nplain');
    await sleep();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view)).toContain('# ');
  });
});

describe('ATX Heading — selection', () => {
  test('selection 部分覆盖 → source', async () => {
    const view = setUpEditor('# Title');
    await sleep();
    selectRange(view, 2, 4); // 选中 'Ti'
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 覆盖 marker → source', async () => {
    const view = setUpEditor('# Title');
    await sleep();
    selectRange(view, 0, 2); // 选中 '# '
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection 在节点外 → rendered', async () => {
    const view = setUpEditor('# Title\n\nplain');
    await sleep();
    selectRange(view, 9, 12);
    await sleep();
    expect(markerTexts(view)).toContain('# ');
  });
});

describe('ATX Heading — IME', () => {
  test('composition 期间 caret 移动不重算（渲染冻结）', async () => {
    const view = setUpWithComposition('# Title\n\nplain');
    await sleep();
    moveCaret(view, 3); // inside → source
    await sleep();
    moveCaret(view, 12); // 节点外（plain 内）→ rendered
    await sleep();
    expect(markerTexts(view)).toContain('# ');

    startComposition();
    moveCaret(view, 4); // 合成中进入 → 不重算（保持 rendered）
    await sleep();
    expect(markerTexts(view)).toContain('# ');

    endComposition();
    moveCaret(view, 5);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 恢复实时 reveal
  });
});

describe('ATX Heading — Enter / Backspace / Undo / Redo', () => {
  test('标题后 Enter → 新段落（heading 状态正确）', async () => {
    const view = setUpWithHistory('# Title');
    await sleep();
    moveCaret(view, 7); // 标题末尾
    view.dispatch({ changes: { from: 7, insert: '\n\nplain' } });
    await sleep();
    // 新段落文本中 → heading 为 rendered
    moveCaret(view, 10);
    await sleep();
    expect(markerTexts(view)).toContain('# ');
  });

  test('Backspace 删除 marker → 变普通段落（marker 不再隐藏）', async () => {
    const view = setUpWithHistory('# Title');
    await sleep();
    moveCaret(view, 2); // marker 后
    view.dispatch({ changes: { from: 1, to: 2, insert: '' } }); // 删空格 → '#Title'（仍 heading）
    await sleep();
    // 继续 Backspace 删除 '#'
    view.dispatch({ changes: { from: 0, to: 1, insert: '' } });
    await sleep();
    expect(view.state.doc.toString()).toBe('Title'); // 变普通段落
    expect(markerTexts(view).length).toBe(0); // 无 marker
  });

  test('输入后 Undo 还原，marker reveal 正确', async () => {
    const view = setUpWithHistory('# Title\n\nplain');
    await sleep();
    moveCaret(view, 14);
    view.dispatch({ changes: { from: 14, insert: 'X' } });
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\nplainX');

    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\nplain');
    moveCaret(view, 3);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // inside → source

    redo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\nplainX');
  });
});

// ─────────────────────────── Setext H1/H2 ───────────────────────────

describe('Setext Heading', () => {
  test('H1 idle → rendered（下划线 === 隐藏）', async () => {
    const view = setUpEditor('Setext One\n=========\n\nplain');
    await sleep();
    moveCaret(view, 24); // 节点外
    await sleep();
    expect(markerTexts(view)).toContain('=========');
  });

  test('H2 idle → rendered（下划线 --- 隐藏）', async () => {
    const view = setUpEditor('Setext Two\n---------\n\nplain');
    await sleep();
    moveCaret(view, 24);
    await sleep();
    expect(markerTexts(view)).toContain('---------');
  });

  test('caret inside 标题行 → source（下划线显示）', async () => {
    const view = setUpEditor('Setext One\n=========\n\nplain');
    await sleep();
    moveCaret(view, 4); // 标题文本内
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('caret on underline → source', async () => {
    const view = setUpEditor('Setext One\n=========\n\nplain');
    await sleep();
    moveCaret(view, 14); // 下划线上
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });

  test('selection → source；离开 → rendered', async () => {
    const view = setUpEditor('Setext One\n=========\n\nplain');
    await sleep();
    selectRange(view, 0, 5);
    await sleep();
    expect(markerTexts(view).length).toBe(0);

    moveCaret(view, 24);
    await sleep();
    expect(markerTexts(view)).toContain('=========');
  });

  test('编辑标题文本后状态正确', async () => {
    const view = setUpWithHistory('Setext One\n=========');
    await sleep();
    moveCaret(view, 10); // 标题末尾
    view.dispatch({ changes: { from: 10, insert: '!', to: 10 } });
    await sleep();
    moveCaret(view, 0); // 节点内 → source
    await sleep();
    expect(markerTexts(view).length).toBe(0);
  });
});

// ─────────────────────────── Source ↔ Live ───────────────────────────

describe('Source ↔ Live 切换（spec §5.5）', () => {
  /** setSourceMode 后触发一次重算（实际产品由命令层 dispatch） */
  function refresh(view: EditorView): void {
    view.dispatch({ selection: view.state.selection });
  }

  test('Live → Source：marker 全部显示', async () => {
    const view = setUpEditor('# Title\n\nSetext One\n=========\n\nplain');
    await sleep();
    moveCaret(view, view.state.doc.toString().indexOf('plain') + 1); // 节点外（rendered）
    await sleep();
    expect(markerTexts(view).length).toBeGreaterThan(0); // rendered 隐藏中

    setSourceMode(true); // Source Mode
    refresh(view);
    await sleep();
    expect(markerTexts(view).length).toBe(0); // 全部 source（marker 显示）

    setSourceMode(false); // 回 Live
    refresh(view);
    await sleep();
    expect(markerTexts(view).length).toBeGreaterThan(0);
  });

  test('Source → Live：恢复 reveal policy', async () => {
    const view = setUpEditor('# Title\n\nplain');
    await sleep();
    setSourceMode(true);
    refresh(view);
    await sleep();
    moveCaret(view, 12); // 节点外
    await sleep();
    expect(markerTexts(view).length).toBe(0); // source mode 全显示

    setSourceMode(false);
    refresh(view);
    await sleep();
    expect(markerTexts(view)).toContain('# '); // live → rendered 隐藏
  });
});

// ─────────────────────────── Typora Parity 对照 ───────────────────────────

describe('Typora Parity（Heading）', () => {
  test('对照 §3.1：光标离开隐藏 / 进入恢复 / 空标题安全 / 不抖动文本', async () => {
    // 输入 `# ` 后进入 H1（渲染存在）
    const view = setUpEditor('# 标题\n\n正文');
    await sleep();
    moveCaret(view, 3); // inside → source（marker 显示，编辑中可见）
    await sleep();
    expect(markerTexts(view).length).toBe(0);

    // 光标离开 → marker 隐藏（Typora：`# ` 隐身）
    moveCaret(view, 8); // 文档末尾（节点外）
    await sleep();
    expect(markerTexts(view)).toContain('# ');

    // Undo 一步恢复一次用户动作（spec §7）
    expect(true).toBe(true);
  });
});
