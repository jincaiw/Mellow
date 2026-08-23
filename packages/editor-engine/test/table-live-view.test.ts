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
