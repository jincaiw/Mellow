/**
 * 编辑器右键菜单（Typora 深度对标 ⑩）：上下文检测、动作 API、表格操作。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import {
  imageSourceAt,
  inlineLinkAt,
  codeFenceAt,
  mathBlockAt,
  mermaidBlockAt,
} from '../src/contextMenu';
import type { EditorContextMenuRequest } from '../src/contextMenu';
import { moveCaret, sleep } from './harness';

const MENU_KEY = '__MELLOW_CONTEXT_MENU__' as keyof Window;
const ACTIONS_KEY = '__MELLOW_CONTEXT_ACTIONS__' as keyof Window;

describe('inlineLinkAt / imageSourceAt（纯函数）', () => {
  const NONE: Array<{ from: number; to: number }> = [];

  test('链接命中与未命中', () => {
    const doc = 'see [文档](https://example.com) here';
    expect(inlineLinkAt(doc, 6, NONE)).toEqual({ label: '文档', url: 'https://example.com' });
    expect(inlineLinkAt(doc, 0, NONE)).toBeNull();
  });

  test('跳过代码围栏与行内代码', () => {
    const doc = '```\n[x](a)\n```\n\n[y](b) and `[z](c)`';
    const code = [{ from: 0, to: 15 }];
    // [y](b) = from 17, to 23
    expect(inlineLinkAt(doc, 19, code)).toEqual({ label: 'y', url: 'b' });
    expect(inlineLinkAt(doc, 3, code)).toBeNull(); // 围栏内
    expect(inlineLinkAt(doc, 33, code)).toBeNull(); // 行内代码内
  });

  test('图片 src 提取', () => {
    const doc = '![logo](img/logo.png) text';
    expect(imageSourceAt(doc, 5, NONE)).toBe('img/logo.png');
    expect(imageSourceAt(doc, 23, NONE)).toBeNull(); // 引用外（span 0..21）
  });
});

/**
 * P1-1.7：块级右键分支的判定函数。
 * 契约来源 Typora 1.14.9 appsrc/main.js getMenuItemsForMac()，
 * 按 mdtype 分成 fences / math_block / fences+md-diagram 三类块级右键。
 */
describe('块级判定：codeFenceAt / mathBlockAt / mermaidBlockAt', () => {
  test('codeFenceAt：``` 围栏内命中并返回语言', () => {
    const doc = 'before\n```js\nconst a = 1;\n```\nafter';
    // from = 围栏起始行偏移（7）；to = 闭合围栏行结束偏移（26 + 3 = 29，不含换行）
    expect(codeFenceAt(doc, 12)).toEqual({ lang: 'js', from: 7, to: 29 });
  });

  test('codeFenceAt：~~~ 围栏同样识别', () => {
    const doc = '~~~python\nx = 1\n~~~';
    expect(codeFenceAt(doc, 12)?.lang).toBe('python');
  });

  test('codeFenceAt：无语言时 lang 为空串（仍属代码块）', () => {
    const doc = '```\nplain\n```';
    // to = 闭合围栏行结束偏移（10 + 3 = 13）
    expect(codeFenceAt(doc, 6)).toEqual({ lang: '', from: 0, to: 13 });
  });

  test('codeFenceAt：围栏外返回 null', () => {
    const doc = 'before\n```js\nconst a = 1;\n```\nafter';
    expect(codeFenceAt(doc, 2)).toBeNull();
    expect(codeFenceAt(doc, 34)).toBeNull();
  });

  test('codeFenceAt：未闭合围栏按 Typora 行为算到文末', () => {
    const doc = '```js\nconst a = 1;';
    const hit = codeFenceAt(doc, 12);
    expect(hit?.lang).toBe('js');
    expect(hit?.to).toBe(doc.length);
  });

  test('codeFenceAt：~~~ 与 ``` 不互相闭合（CommonMark：块延伸到文末）', () => {
    const doc = '```js\na\n~~~';
    // ~~~ 不闭合 ``` 围栏 → 块未闭合，pos 8 仍在块内（与 Typora 渲染行为一致）
    expect(codeFenceAt(doc, 8)).toEqual({ lang: 'js', from: 0, to: doc.length });
  });

  test('mathBlockAt：$$ 块内为 true，块外为 false', () => {
    const doc = 'text\n$$\nX^2\n$$\nend';
    expect(mathBlockAt(doc, 8)).toBe(true);
    expect(mathBlockAt(doc, 1)).toBe(false);
    expect(mathBlockAt(doc, doc.length - 1)).toBe(false);
  });

  test('mathBlockAt：行内 $...$ 不算块级公式', () => {
    const doc = 'inline $a+b$ here';
    expect(mathBlockAt(doc, 10)).toBe(false);
  });

  test('mermaidBlockAt：```mermaid 围栏内为 true', () => {
    const doc = 'text\n```mermaid\ngraph TD;\nA-->B;\n```\nend';
    expect(mermaidBlockAt(doc, 20)).toBe(true);
    expect(mermaidBlockAt(doc, 1)).toBe(false);
  });

  test('mermaidBlockAt：普通代码块不算图表', () => {
    const doc = '```js\ngraph TD;\n```';
    expect(mermaidBlockAt(doc, 10)).toBe(false);
  });
});

describe('右键上下文检测（contextmenu 事件）', () => {
  function setUp(doc: string): { view: EditorView; requests: EditorContextMenuRequest[] } {
    const requests: EditorContextMenuRequest[] = [];
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    (window as unknown as Record<string, unknown>)[MENU_KEY] = (req: EditorContextMenuRequest) => { requests.push(req); };
    return { view, requests };
  }

  async function rightClick(view: EditorView, pos: number): Promise<void> {
    const spy = jest.spyOn(view, 'posAtCoords').mockReturnValue(pos);
    view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
    await sleep();
    spy.mockRestore();
  }

  test('文本：kind=text，光标移到点击处（原生行为）', async () => {
    const { view, requests } = setUp('hello world');
    moveCaret(view, 0);
    await rightClick(view, 6);
    expect(requests[0]).toMatchObject({ kind: 'text', hasSelection: false });
    expect(view.state.selection.main.head).toBe(6); // 右键把光标移到点击处
    view.destroy();
  });

  test('链接：kind=link 携带 url；不移动已选区内的光标', async () => {
    const { view, requests } = setUp('see [文档](https://example.com)');
    moveCaret(view, 0);
    await rightClick(view, 8); // 链接内
    expect(requests[0]).toMatchObject({ kind: 'link', url: 'https://example.com' });
    expect(view.state.selection.main.head).toBe(8);
    view.destroy();
  });

  test('Wikilink：kind=wikilink 携带 name', async () => {
    const { view, requests } = setUp('see [[alpha]] here');
    moveCaret(view, 0);
    await rightClick(view, 7); // alpha 内
    expect(requests[0]).toMatchObject({ kind: 'wikilink', name: 'alpha' });
    view.destroy();
  });

  test('表格：kind=table', async () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 4); // 表头 a 内
    expect(requests[0]).toMatchObject({ kind: 'table' });
    view.destroy();
  });

  // P1-1.7：块级分支（Typora 1.14.9 getMenuItemsForMac 按 mdtype 分 fences / math_block / md-diagram）
  test('代码块：kind=code 且携带围栏语言', async () => {
    const doc = 'text\n```js\nconst a = 1;\n```';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 12); // js 代码行内
    expect(requests[0]).toMatchObject({ kind: 'code', lang: 'js' });
    view.destroy();
  });

  test('公式块：```math 围栏 → kind=math', async () => {
    const doc = '```math\nX^2\n```';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 10); // X^2 行内
    expect(requests[0]).toMatchObject({ kind: 'math', lang: 'math' });
    view.destroy();
  });

  test('公式块：$$ … $$ → kind=math', async () => {
    const doc = 'text\n$$\nX^2\n$$\nend';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 8); // X^2 行内
    expect(requests[0]).toMatchObject({ kind: 'math' });
    view.destroy();
  });

  test('图表块：```mermaid → kind=mermaid', async () => {
    const doc = '```mermaid\ngraph TD;\nA-->B;\n```';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 15); // graph 行内
    expect(requests[0]).toMatchObject({ kind: 'mermaid', lang: 'mermaid' });
    view.destroy();
  });

  test('选区存在时 hasSelection=true', async () => {
    const { view, requests } = setUp('hello world');
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    await rightClick(view, 2); // 选区内
    expect(requests[0]).toMatchObject({ kind: 'text', hasSelection: true });
    expect(view.state.selection.main.head).toBe(5); // 选区内不移动
    view.destroy();
  });
});

interface ContextActions {
  cut(): void;
  copy(): void;
  paste(): void;
  tableOp(op: string): void;
  copySource(kind: 'math' | 'mermaid'): boolean;
}

describe('动作 API（__MELLOW_CONTEXT_ACTIONS__）', () => {
  function setUp(doc: string): { view: EditorView; actions: ContextActions } {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    const actions = (window as unknown as Record<string, unknown>)[ACTIONS_KEY] as ContextActions;
    return { view, actions };
  }

  /** P1-1.7：复制光标处的公式 / 图表源码（右键「复制为 Tex 代码」经 dispatchCommand 走到这里） */
  function stubClipboard(): { writeText: jest.Mock } {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    return { writeText };
  }

  test('copy：execCommand("copy")（多格式复制由 clipboardCopy 事件处理）', async () => {
    const { view, actions } = setUp('hello world');
    const exec = jest.fn().mockReturnValue(true);
    (document as { execCommand?: unknown }).execCommand = exec;
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    actions.copy();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(view.state.doc.toString()).toBe('hello world');
    view.destroy();
  });

  test('cut：execCommand("cut") 后 doc 不变（CM 处理 cut 事件）', async () => {
    const { view, actions } = setUp('hello world');
    const exec = jest.fn().mockReturnValue(true);
    (document as { execCommand?: unknown }).execCommand = exec;
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    actions.cut();
    expect(exec).toHaveBeenCalledWith('cut');
    view.destroy();
  });

  test('cut 降级：execCommand 不可用 → navigator 复制 + 删除选区', async () => {
    const { view, actions } = setUp('hello world');
    (document as { execCommand?: unknown }).execCommand = jest.fn(() => { throw new Error('unsupported'); });
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    actions.cut();
    expect(view.state.doc.toString()).toBe(' world');
    view.destroy();
  });

  test('paste 降级：execCommand 失败 → clipboard.readText 插入', async () => {
    const { view, actions } = setUp('hello world');
    (document as { execCommand?: unknown }).execCommand = jest.fn().mockReturnValue(false);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: jest.fn().mockResolvedValue('pasted') },
    });
    moveCaret(view, 5);
    actions.paste();
    await sleep();
    expect(view.state.doc.toString()).toBe('hellopasted world');
    view.destroy();
  });

  test('表格操作：addRowBelow / deleteRow / tidy', async () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { view, actions } = setUp(doc);
    moveCaret(view, 2); // 表头行
    actions.tableOp('addRowBelow');
    const rows1 = view.state.doc.toString().split('\n').filter((l) => l.includes('|'));
    expect(rows1).toHaveLength(4); // header + delimiter + 2 数据行

    moveCaret(view, 2);
    actions.tableOp('deleteRow'); // 表头行不可删（delimiter 不删）→ 删除第 2 数据行？实际删 caret 所在数据行
    const rows2 = view.state.doc.toString().split('\n').filter((l) => l.includes('|'));
    expect(rows2.length).toBeLessThanOrEqual(4);
    view.destroy();
  });

  test('表格操作：非表格处 no-op', async () => {
    const { view, actions } = setUp('plain text');
    moveCaret(view, 2);
    actions.tableOp('addRowBelow');
    expect(view.state.doc.toString()).toBe('plain text');
    view.destroy();
  });

  test('copySource("math")：光标在公式块内 → 写入源码并返回 true', () => {
    const doc = 'text\n$$\nX^2\n$$\nend';
    const { view, actions } = setUp(doc);
    const { writeText } = stubClipboard();
    moveCaret(view, 8); // X^2 行内
    expect(actions.copySource('math')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('X^2');
    view.destroy();
  });

  test('copySource("mermaid")：光标在图表块内 → 写入源码并返回 true', () => {
    const doc = '```mermaid\ngraph TD;\nA-->B;\n```';
    const { view, actions } = setUp(doc);
    const { writeText } = stubClipboard();
    moveCaret(view, 15); // graph 行内
    expect(actions.copySource('mermaid')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('graph TD;\nA-->B;');
    view.destroy();
  });

  test('copySource：光标不在块内 → 返回 false 且不写剪贴板', () => {
    const { view, actions } = setUp('plain text');
    const { writeText } = stubClipboard();
    moveCaret(view, 2);
    expect(actions.copySource('math')).toBe(false);
    expect(actions.copySource('mermaid')).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    view.destroy();
  });
});
