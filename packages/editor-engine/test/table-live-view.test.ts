import { history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { install, setSourceMode } from '../src/index';
import { TABLE_LIVE_CLASS } from '../src/table/liveView';
import { moveCaret, setUpEditor, sleep } from './harness';

const TABLE = '| 姓名 | 年龄 |\n| --- | ---: |\n| 张三 | 28 |';

function setUpEditorWithHistory(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
  });
  view.focus();
  return view;
}

describe('GFM Table Live View', () => {
  afterEach(() => {
    setSourceMode(false);
    document.body.innerHTML = '';
  });

  test('光标在表格外渲染语义表格，在表格内恢复 Markdown 源码', async () => {
    const source = `${TABLE}\n\n正文`;
    const view = setUpEditor(source);

    moveCaret(view, view.state.doc.length);
    await sleep();

    const table = view.dom.querySelector(`.${TABLE_LIVE_CLASS}`);
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('th')).toHaveLength(2);
    expect(table?.querySelectorAll('td')).toHaveLength(2);
    expect(table?.textContent).toContain('张三');

    moveCaret(view, 2);
    await sleep();

    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  test('点击单元格进入原位编辑，输入只 patch 当前 cell，Source Mode 始终显示源码', async () => {
    const source = `${TABLE}\n\n正文`;
    const view = setUpEditor(source);
    moveCaret(view, view.state.doc.length);
    await sleep();

    const cells = Array.from(view.dom.querySelectorAll(`.${TABLE_LIVE_CLASS} td`));
    const nameCell = cells.find((cell) => cell.textContent === '张三');
    expect(nameCell).toBeDefined();
    nameCell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep();

    expect(nameCell?.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(nameCell?.getAttribute('data-editing')).toBe('true');
    nameCell?.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '丰',
    }));
    await sleep();

    expect(view.state.doc.toString()).toContain('| 张三丰 | 28 |');
    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).not.toBeNull();

    moveCaret(view, view.state.doc.length);
    setSourceMode(true);
    view.dispatch({ selection: view.state.selection });
    await sleep();

    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).toBeNull();
    expect(view.state.doc.toString()).toContain('| 张三丰 | 28 |');
    view.destroy();
  });

  test('表格行内 Markdown 安全渲染，escaped pipe 显示为字面量', async () => {
    const source = '| 名称 | 效果 |\n| --- | --- |\n| **粗体** | `a\\|b` |\n\n正文';
    const view = setUpEditor(source);
    moveCaret(view, view.state.doc.length);
    await sleep();

    const table = view.dom.querySelector(`.${TABLE_LIVE_CLASS}`);
    expect(table?.querySelector('strong')?.textContent).toBe('粗体');
    expect(table?.querySelector('code')?.textContent).toBe('a|b');
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  test('compositionend 后一次性提交中文且不重建整张表', async () => {
    const source = `${TABLE}\n\n正文`;
    const view = setUpEditor(source);
    moveCaret(view, view.state.doc.length);
    await sleep();

    const cell = Array.from(view.dom.querySelectorAll<HTMLElement>(`.${TABLE_LIVE_CLASS} td`))
      .find((item) => item.textContent === '张三');
    expect(cell).toBeDefined();
    cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const tableBefore = view.dom.querySelector(`.${TABLE_LIVE_CLASS}`);
    cell?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    if (cell !== undefined) cell.textContent = '张三中文';
    cell?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }));
    await sleep();

    expect(view.state.doc.toString()).toContain('| 张三中文 | 28 |');
    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).toBe(tableBefore);
    view.destroy();
  });

  test('单元格编辑进入 CodeMirror 历史并可由 Cmd+Z 撤销', async () => {
    const source = `${TABLE}\n\n正文`;
    const view = setUpEditorWithHistory(source);
    moveCaret(view, view.state.doc.length);
    await sleep();

    const cell = Array.from(view.dom.querySelectorAll<HTMLElement>(`.${TABLE_LIVE_CLASS} td`))
      .find((item) => item.textContent === '张三');
    expect(cell).toBeDefined();
    cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep();
    cell?.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '丰',
    }));
    await sleep();
    expect(view.state.doc.toString()).toContain('| 张三丰 | 28 |');

    const editedCell = view.dom.querySelector<HTMLElement>(`.${TABLE_LIVE_CLASS} [data-editing="true"]`);
    expect(editedCell).not.toBeNull();
    const undoEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'z',
      metaKey: true,
    });
    editedCell?.dispatchEvent(undoEvent);
    expect(undoEvent.defaultPrevented).toBe(true);
    await sleep();

    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });
});

describe('表格 live-view · 外部更新（spec §10 的「external update」场景，2026-09-30 补）', () => {
  /**
   * 为什么补这一组：审计 §4.16 发现 spec §10 把 `external update` 列为必覆盖类别，
   * 而**表格测试零覆盖**（放宽到全仓查「external/外部/reload/重载」×「table/表格」
   * 共现 → 6 处命中全部无关：菜单 id、导出自包含、IME 注释）。
   *
   * 外部重载的**实质**是「整文档被替换」—— 故这里模拟一次整文档替换，
   * 断言 live-view **反映新内容、不残留旧状态**。
   *
   * ⚠️ **覆盖边界（如实声明）**：这是**单元级**模拟（整文档 dispatch），
   * 不是端到端「文件被外部修改 → 自动重载」流程（那需要真实文件系统与 watcher）。
   * 它覆盖的是外部重载**依赖的编辑器侧语义**。
   */
  afterEach(() => {
    setSourceMode(false);
    document.body.innerHTML = '';
  });

  const NEW_TABLE = '| 姓名 | 年龄 |\n| --- | ---: |\n| 李四 | 31 |';

  test('整文档替换（模拟外部重载）后 live-view 反映新内容且不残留旧状态', async () => {
    const view = setUpEditor(`${TABLE}\n\n正文`);
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)?.textContent).toContain('张三');

    // 外部重载 = 整文档替换
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: `${NEW_TABLE}\n\n正文` } });
    // 重载后光标位置由实现决定；显式移到表外以保证 live-view 处于渲染态
    moveCaret(view, view.state.doc.length);
    await sleep();

    const after = view.dom.querySelector(`.${TABLE_LIVE_CLASS}`);
    expect(after).not.toBeNull();
    expect(after?.textContent).toContain('李四');
    expect(after?.textContent).not.toContain('张三'); // 不残留旧状态
    expect(view.state.doc.toString()).toContain('李四');
    view.destroy();
  });

  test('外部重载把表格整体删掉后，live-view 不再存在（不残留旧 widget）', async () => {
    const view = setUpEditor(`${TABLE}\n\n正文`);
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).not.toBeNull();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '只有正文，没有表格' } });
    await sleep();
    expect(view.dom.querySelector(`.${TABLE_LIVE_CLASS}`)).toBeNull();
    view.destroy();
  });
});
