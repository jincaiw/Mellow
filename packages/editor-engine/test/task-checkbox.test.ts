/**
 * Live Task Checkbox（spec §15）—— 完整测试。
 */

import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setSourceMode, resetModeState, CHECKBOX_CLASS } from '../src/index';
import { sleep } from './harness';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

function checkboxes(view: EditorView): HTMLInputElement[] {
  return Array.from(view.dom.querySelectorAll(`.${CHECKBOX_CLASS}`)) as HTMLInputElement[];
}

/** 轮询等待 checkbox 渲染（防并行负载下的时序抖动） */
async function waitForCheckboxes(view: EditorView, count: number, timeoutMs = 3000): Promise<HTMLInputElement[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const boxes = checkboxes(view);
    if (boxes.length >= count) return boxes;
    await new Promise((res) => setTimeout(res, 20));
  }
  return checkboxes(view);
}


function click(_view: EditorView, box: HTMLInputElement): void {
  box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => resetModeState());

describe('Task Checkbox — Live 显示', () => {
  test('`[ ]` → 未选中 checkbox；`[x]` → 选中', async () => {
    const view = setUp('- [ ] todo\n- [x] done');
    await sleep();
    const boxes = await waitForCheckboxes(view, 2);
    expect(boxes.length).toBe(2);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  test('唯一真源：doc 文本含 `[ ]`/`[x]`（widget 只影响渲染）', async () => {
    const view = setUp('- [ ] todo\n- [x] done');
    await sleep();
    expect(view.state.doc.toString()).toBe('- [ ] todo\n- [x] done');
  });
});

describe('Task Checkbox — 点击 minimal patch', () => {
  test('点击 [ ] → [x]（只改 marker 3 字符）', async () => {
    const view = setUp('- [ ] todo');
    await sleep();
    click(view, checkboxes(view)[0]);
    await sleep();
    expect(view.state.doc.toString()).toBe('- [x] todo');
    // 重新渲染为选中
    expect(checkboxes(view)[0].checked).toBe(true);
  });

  test('点击 [x] → [ ]（toggle 双向）', async () => {
    const view = setUp('- [x] done');
    await sleep();
    click(view, checkboxes(view)[0]);
    await sleep();
    expect(view.state.doc.toString()).toBe('- [ ] done');
  });

  test('不重写整行（其他内容原样）', async () => {
    const view = setUp('- [ ] todo item 内容 **bold** 保持不变');
    await sleep();
    const before = view.state.doc.toString();
    click(view, checkboxes(view)[0]);
    await sleep();
    const after = view.state.doc.toString();
    // 只有 `[ ]` → `[x]`，其余逐字符一致
    expect(after.replace('[x]', '[ ]')).toBe(before);
  });

  test('不改变 indentation（嵌套 task）', async () => {
    const view = setUp('  - [ ] nested task\n    - [x] deep');
    await sleep();
    expect(checkboxes(view).length).toBe(2);
    click(view, checkboxes(view)[0]);
    await sleep();
    // 缩进保留，只 patch marker
    expect(view.state.doc.toString()).toBe('  - [x] nested task\n    - [x] deep');
    click(view, checkboxes(view)[1]);
    await sleep();
    expect(view.state.doc.toString()).toBe('  - [x] nested task\n    - [ ] deep');
  });
});

describe('Task Checkbox — 一个 Undo', () => {
  test('点击后一次 undo 还原（单 transaction）', async () => {
    const view = setUp('- [ ] todo');
    await sleep();
    click(view, checkboxes(view)[0]);
    await sleep();
    expect(view.state.doc.toString()).toBe('- [x] todo');

    undo(view); // 一次撤销
    await sleep();
    expect(view.state.doc.toString()).toBe('- [ ] todo');
    expect(checkboxes(view)[0].checked).toBe(false);

    redo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('- [x] todo');
  });
});

describe('Task Checkbox — Source Mode round-trip', () => {
  test('Source Mode：checkbox 消失，原文 `[ ]` 显示', async () => {
    const view = setUp('- [ ] todo\n- [x] done');
    await sleep();
    expect(checkboxes(view).length).toBe(2);

    setSourceMode(true);
    view.dispatch({ selection: view.state.selection }); // 触发重算
    await sleep();
    expect(checkboxes(view).length).toBe(0); // 显示原文
    expect(view.state.doc.toString()).toContain('[ ]');
    expect(view.state.doc.toString()).toContain('[x]');

    setSourceMode(false);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(checkboxes(view).length).toBe(2); // Live 恢复
  });

  test('Source Mode 下编辑不破坏（doc 文本一致）', async () => {
    const view = setUp('- [ ] todo');
    await sleep();
    setSourceMode(true);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    // source 模式显示原文，可编辑：手动把 [ ] 改为 [x]
    view.dispatch({ changes: { from: 3, to: 4, insert: 'x' } });
    await sleep();
    expect(view.state.doc.toString()).toBe('- [x] todo');

    setSourceMode(false);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    // 回 Live：`[x]` 渲染为选中 checkbox
    expect(checkboxes(view).length).toBe(1);
    expect(checkboxes(view)[0].checked).toBe(true);
  });
});