/**
 * Undo/Redo 测试（live-markdown-engine-spec §7 Undo Contract）。
 *
 * P4.3「Undo 按用户动作分组（不依赖 transaction 计数）」测试矩阵：
 *
 * A. CM6 默认分组锁行为（vendored @codemirror/commands dist 已核实）：
 *    - joinableUserEvent = /^(input\.type|delete)($|\.)/：连续输入/退格在
 *      500ms（newGroupDelay）窗口且 changes 相邻时合并为一组；
 *    - HistEvent.fromTransaction（dist 387 行）新建事件 selectionsAfter 恒为
 *      none —— 事务 spec 带 selection 字段**不会**阻断 join（startSelection
 *      才来自 tr.startState.selection）；
 *    - selection-only 事务走 addSelection 追加到栈顶事件 selectionsAfter →
 *      打断后续 join（「光标移动断组」的机制）；
 *    - input.paste 不匹配 joinableUserEvent → 独立；input.type.compose
 *      无条件 join（无视 500ms 窗口）。
 *
 * B. 程序化命令独立（本包 undoGrouping.ts，transactionExtender +
 *    isolateHistory('full')）：CM6 的 `!userEvent` 分支使无 userEvent 的
 *    程序化 dispatch 同样 joinable —— checkbox toggle、table 编辑、宿主
 *    applyChanges 等引擎命令会并入相邻用户输入组。undoGrouping 对
 *    docChanged 且无 userEvent 的事务追加 isolate('full')，使其成为独立
 *    undo 单元（isolate 在 addChanges 前后各重置 prevTime → 前后双向隔离）。
 *    smartPunctuation 无专项例：其变换由 CM inputHandler 驱动，jsdom 不可
 *    模拟（同 ime-guards 结论），且真实浏览器中 inputHandler 事务归属
 *    input 事件流，不属程序化路径。
 *
 * C. 通用契约：空栈 no-op、多步往返、selection 恢复、marker reveal、
 *    综合分组计数（10 次输入 + 2 个程序化命令 → 精确 3 组 undo）。
 *
 * P4.1 遗留观察项：jsdom 无法驱动真实 paste DOM 路径（execCommand 不触发
 * CM input 处理），以无 userEvent 事务等价模拟 CM DOM-read 路径并锁定其
 * 独立分组行为（C 组末例）。
 */

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, CHECKBOX_CLASS } from '../src/index';
import { attachEngineView, registerEngineImageApi, getEngineImageApi } from '../src/image/engineApi';
import { installSelectionCommandsApi, buildSelectionCommandsExtension } from '../src/selectionCommands';
import { tableAt, addRow } from '../src/table/commands';
import { moveCaret, markerElements, sleep } from './utils/editor';

const TABLE_DOC = 'before\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter'; // length 48

function setUpWithHistory(doc: string, extra: Extension[] = []): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      install(false), // 含 undoGrouping（transactionExtender）
      ...extra,
    ],
  });
  view.focus();
  return view;
}

/** 模拟用户输入（带 selection 字段：锁定「selection 不阻断 join」的结论） */
function typeText(view: EditorView, pos: number, text: string, userEvent = 'input.type'): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    userEvent,
  });
}

/** 模拟退格删除 [from, to) */
function backspace(view: EditorView, from: number, to: number): void {
  view.dispatch({
    changes: { from, to },
    selection: { anchor: from },
    userEvent: 'delete.backspace',
  });
}

/** 模拟粘贴（input.paste 不匹配 joinableUserEvent → 独立组） */
function paste(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    userEvent: 'input.paste',
  });
}

describe('Undo — CM 默认分组（joinable userEvent 聚合）', () => {
  test('连续 input.type（事务带 selection）聚合为一组：一次 undo 全撤', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a'); // xa
    typeText(view, 2, 'b'); // xab
    typeText(view, 3, 'c'); // xabc
    expect(view.state.doc.toString()).toBe('xabc');

    undo(view);
    expect(view.state.doc.toString()).toBe('x'); // 一次撤 3 个字符
    redo(view);
    expect(view.state.doc.toString()).toBe('xabc');
    view.destroy();
  });

  test('500ms 停顿断组：undo 逐组撤销', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a');
    await sleep(560); // 超过 newGroupDelay(500)
    typeText(view, 2, 'b');
    expect(view.state.doc.toString()).toBe('xab');

    undo(view);
    expect(view.state.doc.toString()).toBe('xa'); // 只撤停顿后的 'b'
    undo(view);
    expect(view.state.doc.toString()).toBe('x');
    view.destroy();
  });

  test('caret 移动（selection-only 事务）断组：selectionsAfter 非空阻断 join', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a'); // xa
    moveCaret(view, 0); // selection-only → addSelection 追加到栈顶事件
    typeText(view, 0, 'b'); // bxa（不与 'a' 事件 join）
    expect(view.state.doc.toString()).toBe('bxa');

    undo(view);
    expect(view.state.doc.toString()).toBe('xa'); // 只撤 'b'
    undo(view);
    expect(view.state.doc.toString()).toBe('x');
    view.destroy();
  });

  test('input.paste 独立：不并入相邻输入组', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a'); // xa
    paste(view, 2, 'PASTED'); // xaPASTED（紧邻，仍不 join）
    expect(view.state.doc.toString()).toBe('xaPASTED');

    undo(view);
    expect(view.state.doc.toString()).toBe('xa'); // paste 单独撤
    undo(view);
    expect(view.state.doc.toString()).toBe('x');
    view.destroy();
  });

  test('连续 delete.backspace 聚合：一次 undo 撤多次退格', async () => {
    const view = setUpWithHistory('abc');
    await sleep();
    moveCaret(view, 3);
    backspace(view, 2, 3); // ab
    backspace(view, 1, 2); // a
    expect(view.state.doc.toString()).toBe('a');

    undo(view);
    expect(view.state.doc.toString()).toBe('abc'); // 两次退格同组
    redo(view);
    expect(view.state.doc.toString()).toBe('a');
    view.destroy();
  });

  test('type 后紧跟 backspace 同组（insert+delete 净效果恒等，一次撤净）', async () => {
    const view = setUpWithHistory('a');
    await sleep();
    typeText(view, 1, 'b'); // ab
    backspace(view, 1, 2); // a（joinableUserEvent 匹配 + isAdjacent 相邻 → join）
    expect(view.state.doc.toString()).toBe('a');

    // 实测：join 后组合事件净效果为恒等（插入又被删除），一次 undo 撤净，
    // 且栈中只有 1 组（第二次 undo 为空栈 no-op）——打字+退格不产生历史残留
    undo(view);
    expect(view.state.doc.toString()).toBe('a');
    undo(view);
    expect(view.state.doc.toString()).toBe('a'); // 无第二组
    view.destroy();
  });

  test('input.type.compose 无条件 join：跨 500ms 仍与栈顶合并', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a');
    await sleep(560); // 超过 newGroupDelay
    // IME 合成提交（CM inputHandler 真实路径带此 userEvent）
    typeText(view, 2, 'b', 'input.type.compose'); // xab
    expect(view.state.doc.toString()).toBe('xab');

    undo(view);
    expect(view.state.doc.toString()).toBe('x'); // compose 无视时间窗 join → 一次全撤
    view.destroy();
  });
});

describe('Undo — 程序化命令独立（undoGrouping isolate）', () => {
  test('engineApi.applyChanges 不并入相邻输入组（前面 type 保持独立）', async () => {
    const view = setUpWithHistory('start');
    await sleep();
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();
    expect(api).not.toBeNull();

    typeText(view, 5, 'a'); // starta
    api!.applyChanges([{ from: 0, to: 0, text: 'H' }]); // Hstarta（程序化，500ms 内仍不 join）
    expect(view.state.doc.toString()).toBe('Hstarta');

    undo(view);
    expect(view.state.doc.toString()).toBe('starta'); // 只撤命令
    undo(view);
    expect(view.state.doc.toString()).toBe('start');
    view.destroy();
  });

  test('isolate 双向：命令后的 type 也不并入命令组', async () => {
    const view = setUpWithHistory('start');
    await sleep();
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();

    api!.applyChanges([{ from: 0, to: 0, text: 'H' }]); // Hstart
    typeText(view, 6, 'z'); // Hstartz（紧邻，isolate('after') 阻断 join）
    expect(view.state.doc.toString()).toBe('Hstartz');

    undo(view);
    expect(view.state.doc.toString()).toBe('Hstart'); // 只撤 'z'
    undo(view);
    expect(view.state.doc.toString()).toBe('start');
    view.destroy();
  });

  test('两次程序化 dispatch 连发各自独立（无 userEvent 事务不互相 join）', async () => {
    const view = setUpWithHistory('start');
    await sleep();
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();

    api!.applyChanges([{ from: 0, to: 0, text: 'H' }]); // Hstart
    api!.applyChanges([{ from: 0, to: 1, text: 'X' }]); // Xstart（紧邻连发）
    expect(view.state.doc.toString()).toBe('Xstart');

    undo(view);
    expect(view.state.doc.toString()).toBe('Hstart'); // 第二个命令单独撤
    undo(view);
    expect(view.state.doc.toString()).toBe('start');
    view.destroy();
  });

  test('table addRow 独立于相邻输入组', async () => {
    const view = setUpWithHistory(TABLE_DOC);
    await sleep();
    typeText(view, 48, 'X'); // 文档末尾（48 是 TABLE_DOC 长度）
    const ctx = tableAt(view, 20);
    expect(ctx).not.toBeNull();
    addRow(view, ctx!.model, 2);
    expect(view.state.doc.toString()).toContain('| 1 | 2 |\n| | |');

    undo(view);
    expect(view.state.doc.toString()).not.toContain('| | |'); // 只撤 addRow
    expect(view.state.doc.toString()).toContain('| 1 | 2 |');
    undo(view);
    expect(view.state.doc.toString()).toBe(TABLE_DOC); // 再撤输入 'X'
    view.destroy();
  });

  test('selectionCommands deleteWord 独立于相邻输入组', () => {
    installSelectionCommandsApi();
    const view = setUpWithHistory('foo bar baz', [buildSelectionCommandsExtension()]);
    const api = (window as unknown as { __MELLOW_SELECTION_COMMANDS__: { deleteWord(): boolean } })
      .__MELLOW_SELECTION_COMMANDS__;

    typeText(view, 11, 'x'); // foo bar bazx（caret 12）
    expect(api.deleteWord()).toBe(true); // 删除词 'bazx' → foo bar␣
    expect(view.state.doc.toString()).toBe('foo bar ');

    undo(view);
    expect(view.state.doc.toString()).toBe('foo bar bazx'); // 只撤 deleteWord
    undo(view);
    expect(view.state.doc.toString()).toBe('foo bar baz');
    view.destroy();
  });

  test('checkbox 点击（真实 DOM click → 程序化 dispatch）独立成组', async () => {
    const view = setUpWithHistory('- [ ] item');
    await sleep();
    typeText(view, 10, 'X'); // - [ ] itemX（caret 11，在 marker 外）
    const box = view.dom.querySelector(`.${CHECKBOX_CLASS}`) as HTMLElement | null;
    expect(box).not.toBeNull();
    box!.click(); // taskCheckbox.ts 78-80 行：无 userEvent 的 dispatch → isolate
    expect(view.state.doc.toString()).toBe('- [x] itemX');

    undo(view);
    expect(view.state.doc.toString()).toBe('- [ ] itemX'); // 只撤 toggle
    undo(view);
    expect(view.state.doc.toString()).toBe('- [ ] item');
    view.destroy();
  });
});

describe('Undo — 通用契约', () => {
  test('输入后 undo 还原文本，marker reveal 正确', async () => {
    const view = setUpWithHistory('# Title\n\n**bold**\n\nplain');
    await sleep();
    moveCaret(view, 24); // 文档末尾（plain 后）→ 全部 idle
    await sleep();
    expect(markerElements(view).length).toBe(3); // '# ' + '**' x2

    typeText(view, 24, 'X');
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplainX');

    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplain');
    // marker 状态保持正确（caret 回到 24，idle → 隐藏）
    expect(markerElements(view).length).toBe(3);

    redo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('# Title\n\n**bold**\n\nplainX');
    view.destroy();
  });

  test('marker 隐藏不进入 undo 历史（纯视觉）+ undo 空栈 no-op', async () => {
    const view = setUpWithHistory('**bold**x');
    await sleep();
    moveCaret(view, 9); // 'x' 之后 → idle → 隐藏 marker
    await sleep();
    expect(markerElements(view).length).toBe(2);

    // undo 空栈：不改变文档
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold**x');
    expect(markerElements(view).length).toBe(2);
    view.destroy();
  });

  test('caret 移动（selection）不进入 undo 历史', async () => {
    const view = setUpWithHistory('# Title\n\nplain');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    moveCaret(view, 3);
    await sleep();
    undo(view);
    await sleep();
    // 文档未被 selection 变化影响
    expect(view.state.doc.toString()).toBe('# Title\n\nplain');
    view.destroy();
  });

  test('多步往返：undo/redo 逐组对称', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a');
    typeText(view, 2, 'b');
    typeText(view, 3, 'c'); // xabc（同 1 组）
    undo(view);
    expect(view.state.doc.toString()).toBe('x'); // 一次撤整组
    redo(view);
    expect(view.state.doc.toString()).toBe('xabc');
    redo(view);
    expect(view.state.doc.toString()).toBe('xabc'); // redo 空栈 no-op
    view.destroy();
  });

  test('undo 恢复输入前 selection（startSelection）', async () => {
    const view = setUpWithHistory('start');
    await sleep();
    moveCaret(view, 5);
    typeText(view, 5, 'ab'); // startab
    undo(view);
    expect(view.state.doc.toString()).toBe('start');
    expect(view.state.selection.main.head).toBe(5); // caret 回到输入前位置
    view.destroy();
  });

  test('综合分组计数：3 次输入 + 2 个程序化命令 → 精确 3 组 undo（不依赖 transaction 计数）', async () => {
    const view = setUpWithHistory(TABLE_DOC);
    await sleep();
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();

    // 11 个 transaction，但按用户动作只有 3 组
    typeText(view, 48, 'X');
    typeText(view, 49, 'Y');
    typeText(view, 50, 'Z'); // ...afterXYZ（1 组）
    api!.applyChanges([{ from: 0, to: 0, text: 'H' }]); // H...afterXYZ（2 组）
    const ctx = tableAt(view, 21);
    expect(ctx).not.toBeNull();
    addRow(view, ctx!.model, 2); // 3 组
    expect(view.state.doc.toString()).toContain('| | |');

    undo(view);
    expect(view.state.doc.toString()).not.toContain('| | |'); // 撤 addRow
    undo(view);
    expect(view.state.doc.toString()).toBe(TABLE_DOC + 'XYZ'); // 撤 applyChanges（'H' 消失）
    undo(view);
    expect(view.state.doc.toString()).toBe(TABLE_DOC); // 撤输入组（3 字符同组）
    undo(view);
    expect(view.state.doc.toString()).toBe(TABLE_DOC); // 空栈 no-op

    redo(view);
    redo(view);
    redo(view);
    expect(view.state.doc.toString()).toBe(
      ('H' + TABLE_DOC + 'XYZ').replace('| 1 | 2 |', '| 1 | 2 |\n| | |'),
    ); // redo 恢复输入组 + applyChanges + addRow（含空行）
    view.destroy();
  });

  test('paste 与程序化命令交替：三组全独立', async () => {
    const view = setUpWithHistory('x');
    await sleep();
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();

    typeText(view, 1, 'a'); // xa
    paste(view, 2, 'P'); // xaP
    api!.applyChanges([{ from: 0, to: 0, text: 'H' }]); // HxaP
    expect(view.state.doc.toString()).toBe('HxaP');

    undo(view);
    expect(view.state.doc.toString()).toBe('xaP'); // 撤命令
    undo(view);
    expect(view.state.doc.toString()).toBe('xa'); // 撤 paste
    undo(view);
    expect(view.state.doc.toString()).toBe('x'); // 撤输入
    view.destroy();
  });

  test('P4.1 观察项：无 userEvent 事务（jsdom 模拟 CM DOM-read 路径）独立成组', async () => {
    // 真实浏览器中 CM 经 input 事件给输入事务标注 input.type；jsdom 无法驱动
    // 该路径（execCommand 不触发 CM input 处理）。此处以无 userEvent 的
    // dispatch 等价模拟 DOM-read 事务，锁定 undoGrouping 对其的隔离行为。
    const view = setUpWithHistory('x');
    await sleep();
    typeText(view, 1, 'a'); // xa（userEvent 路径）
    view.dispatch({ changes: { from: 2, insert: 'b' } }); // xab（无 userEvent）
    typeText(view, 3, 'c'); // xabc（userEvent 路径）
    expect(view.state.doc.toString()).toBe('xabc');

    undo(view);
    expect(view.state.doc.toString()).toBe('xab'); // 'c' 单独一组
    undo(view);
    expect(view.state.doc.toString()).toBe('xa'); // 无 userEvent 事务单独一组
    undo(view);
    expect(view.state.doc.toString()).toBe('x');
    view.destroy();
  });
});
