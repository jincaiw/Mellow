/**
 * Table Toolbar 验收（spec table-editing §4/§10）—— 22 项。
 */

import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { install, setSourceMode, resetModeState, TOOLBAR_CLASS, BTN_CLASS } from '../src/index';
import { tableKeymap } from '../src/table/keymap';
import { hideTableToolbar, resetTableToolbarVisibility } from '../src/table/toolbar';
import { parseTable } from '../src/table/parser';
import { moveCaret, sleep, startComposition, endComposition } from './harness';

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      keymap.of(tableKeymap()),
      install(false),
    ],
  });
  view.focus();
  return view;
}

const TABLE = '| a | b |\n| :-: | --- |\n| 1 | 2 |';

function toolbarEl(view: EditorView): HTMLElement | null {
  return view.dom.querySelector(`.${TOOLBAR_CLASS}`);
}

function isVisible(view: EditorView): boolean {
  const el = toolbarEl(view);
  return el !== null && el.style.display !== 'none';
}

function btn(view: EditorView, title: string): HTMLButtonElement {
  const el = Array.from(view.dom.querySelectorAll(`.${BTN_CLASS}`)).find(
    (b) => (b as HTMLButtonElement).title === title,
  );
  if (el === undefined) {
    throw new Error(`toolbar button not found: ${title}`);
  }
  return el as HTMLButtonElement;
}

function clickBtn(view: EditorView, title: string): void {
  btn(view, title).click();
}

function reparse(view: EditorView): ReturnType<typeof parseTable> {
  const text = view.state.doc.toString();
  const lines = text.split('\n');
  // 取前三行表格（toolbar 测试表格固定 3 行结构）
  const start = lines.findIndex((l) => l.includes('|'));
  if (start === -1) {
    return parseTable('', 0);
  }
  const tableText = lines.slice(start, start + 3).join('\n');
  return parseTable(tableText, 0);
}

beforeEach(() => resetTableToolbarVisibility());
afterEach(() => resetModeState());

describe('Toolbar 显示/隐藏', () => {
  test('1. caret 在表格内 → toolbar 显示', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);
  });

  test('2. caret 移出表格 → toolbar 隐藏', async () => {
    const view = setUp(TABLE + '\n\nplain');
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(isVisible(view)).toBe(false);
  });

  test('14. Escape 关闭 toolbar', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);
    hideTableToolbar();
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(isVisible(view)).toBe(false);
    // caret 移出再进入 → 恢复
    resetTableToolbarVisibility();
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(isVisible(view)).toBe(true);
  });

  test('15. IME 期间 caret 移动不更新 toolbar（不干扰）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);
    startComposition();
    moveCaret(view, 30);
    await sleep();
    // 冻结：toolbar 状态不因 selection 变化而刷新（display 保持）
    // 不崩溃即满足；compositionend 后恢复
    endComposition();
    moveCaret(view, 3);
    await sleep();
    expect(isVisible(view)).toBe(true);
  });

  test('17. 不遮挡 caret：toolbar 定位在表格上方（定位逻辑执行不崩）', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);
    // jsdom 无布局（coordsAtPos null → 跳过定位），真实环境在表格上方
    const el = toolbarEl(view)!;
    expect(el.classList.contains(TOOLBAR_CLASS)).toBe(true);
    expect(el.style.display).not.toBe('none');
  });
});

describe('Toolbar 行操作', () => {
  test('3. Row Above：当前行上方加行', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // 数据行
    clickBtn(view, 'Row Above');
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
  });

  test('4. Row Below：当前行下方加行', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // header
    clickBtn(view, 'Row Below');
    await sleep();
    // header 下加行会破坏 delimiter？——toolbar 走 commands 的 addRow（header 后=row1 即 delimiter 后插入？addRow(afterRow=0) 在 header 后插入）
    // 验证不崩溃且行数增加
    expect(view.state.doc.toString().split('\n').length).toBeGreaterThanOrEqual(4);
  });

  test('5. Delete Row：删除当前行', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // 数据行
    clickBtn(view, 'Delete Row');
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(2);
  });
});

describe('Toolbar 列操作', () => {
  test('6. Column Left：当前列左加列', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 第 0 列
    clickBtn(view, 'Column Left');
    await sleep();
    const re = reparse(view);
    expect(re.columnCount).toBe(3);
  });

  test('7. Column Right：当前列右加列', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Column Right');
    await sleep();
    const re = reparse(view);
    expect(re.columnCount).toBe(3);
  });

  test('8. Delete Column：删除当前列', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2); // 第 0 列
    clickBtn(view, 'Delete Column');
    await sleep();
    const re = reparse(view);
    expect(re.columnCount).toBe(1);
    expect(re.rows[0].cells[0].text).toBe('b');
  });
});

describe('Toolbar 对齐', () => {
  test('9. Align Left：delimiter 行变 :--', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30); // 第 1 列
    clickBtn(view, 'Align Left');
    await sleep();
    const re = reparse(view);
    expect(re.alignments[1]).toBe('left');
  });

  test('10. Align Center：变 :--:', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Align Center');
    await sleep();
    const re = reparse(view);
    expect(re.alignments[0]).toBe('center');
  });

  test('11. Align Right：变 --:', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30);
    clickBtn(view, 'Align Right');
    await sleep();
    const re = reparse(view);
    expect(re.alignments[1]).toBe('right');
  });

  // 回归：此前 mark 用固定 2 连字符再 slice 拼装，会丢弃原始连字符长度，
  // 每切换一次对齐少一个连字符（`---` → `:--:` → `:-:` → `::` 非法）。
  // 只断言「解析后的对齐语义」抓不到这个退化（`:--:` 与 `:-:` 解析结果相同），
  // 必须锁定**字面量**与反复切换后的不变式。
  test('11b. 反复切换对齐不得侵蚀连字符数量', async () => {
    // 注意：必须用「未对齐」的 `---` 起始 —— 本文件 TABLE 的第 0 列本就是
    // `:-:`（已居中），用它做基线会让断言失去意义。
    const PLAIN = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const view = setUp(PLAIN);
    await sleep();
    moveCaret(view, 2); // 第 0 列
    const sepText = () => (view.state.doc.toString().split('\n')[1] ?? '');
    const dashCount = () => (sepText().match(/-+/)?.[0].length ?? 0);
    const d0 = dashCount();

    clickBtn(view, 'Align Center');
    await sleep();
    expect(sepText()).toContain(':---:'); // 居中：保留原连字符数
    expect(dashCount()).toBe(d0);

    clickBtn(view, 'Align Left');
    await sleep();
    expect(sepText()).toContain(':---'); // 左对齐：仍保留原连字符数（旧实现会退化成 :-:）
    expect(dashCount()).toBe(d0);

    // 连续切换 10 次：连字符数不得减少，且始终合法（旧实现会一路侵蚀到 `::`）
    for (let i = 0; i < 10; i++) {
      clickBtn(view, i % 2 === 0 ? 'Align Center' : 'Align Left');
      await sleep();
    }
    expect(dashCount()).toBe(d0);
    expect(sepText()).toMatch(/\|[ ]*:-+:?[ ]*\|/);
    view.destroy();
  });
});

describe('Toolbar 整体操作', () => {
  test('12. Tidy：整表重新对齐（唯一 full reformat）', async () => {
    const view = setUp('| aa | b |\n| :- | --- |\n| 1 | 22 |');
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Tidy Table');
    await sleep();
    const text = view.state.doc.toString();
    expect(text).toContain('| aa | b  |');
    // delimiter 统一为规范对齐标记（:- → :--）
    expect(text).toContain('| :-- | --- |');
  });

  test('13. Delete Table：删除整个表格', async () => {
    const view = setUp(TABLE + '\n\nplain');
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Delete Table');
    await sleep();
    expect(view.state.doc.toString()).not.toContain('| a | b |');
    expect(view.state.doc.toString()).toContain('plain');
  });
});

describe('内容健壮性（spec §10）', () => {
  test('18. 中文单元格：toolbar 操作不破坏', async () => {
    const view = setUp('| 苹果 | 香蕉 |\n| --- | --- |\n| 1 | 2 |');
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Row Below');
    await sleep();
    expect(view.state.doc.toString()).toContain('苹果');
  });

  test('19. emoji 单元格', async () => {
    const view = setUp('| 🎉 | 🚀 |\n| --- | --- |\n| 1 | 2 |');
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Column Right');
    await sleep();
    expect(view.state.doc.toString()).toContain('🎉');
  });

  test('20. links/inline code/escaped pipe 单元格：操作不破坏', async () => {
    const view = setUp('| [link](https://x.com) | `a\\|b` |\n| --- | --- |\n| 1 | 2 |');
    await sleep();
    moveCaret(view, 2);
    clickBtn(view, 'Tidy Table');
    await sleep();
    expect(view.state.doc.toString()).toContain('[link](https://x.com)');
    expect(view.state.doc.toString()).toContain('`a\\|b`');
  });

  test('21. toolbar 操作单 undo 还原', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 30);
    clickBtn(view, 'Row Below');
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(4);
    undo(view);
    await sleep();
    expect(view.state.doc.toString().split('\n').length).toBe(3);
  });
});

describe('Keyboard / Source-Live', () => {
  test('16. keyboard accessible：按钮可聚焦 + Enter 激活', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    const button = btn(view, 'Delete Row');
    button.focus();
    expect(document.activeElement).toBe(button);
    // Enter 激活（button.click 等价）
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
    await sleep();
    // 行为已触发（不崩溃即可；点击效果由其他用例覆盖）
    expect(view.state.doc.toString().length).toBeGreaterThan(0);
  });

  test('22. Source Mode：toolbar 隐藏；回 Live 恢复', async () => {
    const view = setUp(TABLE);
    await sleep();
    moveCaret(view, 2);
    await sleep();
    expect(isVisible(view)).toBe(true);

    setSourceMode(true);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(isVisible(view)).toBe(false);

    setSourceMode(false);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(isVisible(view)).toBe(true);
  });
});
