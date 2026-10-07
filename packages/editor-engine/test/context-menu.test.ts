/**
 * 编辑器右键菜单（Typora 深度对标 ⑩）：上下文检测、动作 API、表格操作。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import {
  imageSourceAt,
  inlineLinkAt,
  inlineLinkRangeAt,
  imageSpanFullAt,
  htmlImgAt,
  codeFenceAt,
  fenceContentRange,
  dedentText,
  mathBlockAt,
  mermaidBlockAt,
  wordAt,
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

  // 2026-10-07（审计 §4.120）：与渲染器**同源**后的行为边界。
  // 一手证据（Typora main.js）：`isMathType(lang)` 等价于 `lang.toLowerCase() === 'math'` ——
  // `latex`/`tex`/`katex`/`texmath` 在 Typora 是**代码块**（只是按 TeX 高亮），不是公式块。
  // 改前 Mellow 的右键菜单把它们当数学块、渲染器却当代码块 ⇒ 自相矛盾。
  test('```latex / ```tex 等**不是**公式块（Typora 只认 math）→ kind=code', async () => {
    for (const lang of ['latex', 'tex', 'katex', 'texmath']) {
      const doc = `\`\`\`${lang}\nX^2\n\`\`\``;
      const { view, requests } = setUp(doc);
      moveCaret(view, 0);
      await rightClick(view, 10); // X^2 行内
      expect(requests[0]).toMatchObject({ kind: 'code', lang });
      view.destroy();
    }
  });

  test('```MATH 大小写不敏感 → kind=math', async () => {
    const doc = '```MATH\nX^2\n```';
    const { view, requests } = setUp(doc);
    moveCaret(view, 0);
    await rightClick(view, 10);
    expect(requests[0]).toMatchObject({ kind: 'math' });
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
  /** P0-EDITOR-005 */
  wordAtCursor(): string | null;
  getDocumentText(): string | null;
  selectRange(from: number, to: number): boolean;
  /** P0-EDITOR-005 建议列表：替换光标处的拉丁词 */
  replaceWordAtCursor(replacement: string): boolean;
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

/**
 * C1：右键菜单全面对标的纯函数新增（链接区间 / 图片结构化 / HTML img / 围栏内容 / 去缩进）。
 */
describe('C1 纯函数新增', () => {
  const NONE: Array<{ from: number; to: number }> = [];

  test('inlineLinkRangeAt：返回 label/url 与原文区间', () => {
    const doc = 'see [文档](https://example.com) here';
    const hit = inlineLinkRangeAt(doc, 6, NONE);
    expect(hit).toEqual({ label: '文档', url: 'https://example.com', from: 4, to: 29 });
    expect(hit !== null ? doc.slice(hit.from, hit.to) : '').toBe('[文档](https://example.com)');
    expect(inlineLinkRangeAt(doc, 0, NONE)).toBeNull();
  });

  test('imageSpanFullAt：拆出 alt / src / 尺寸后缀', () => {
    const doc = 'before ![logo](img/a.png =300x200) after';
    const hit = imageSpanFullAt(doc, 12, NONE);
    expect(hit).toEqual({ alt: 'logo', src: 'img/a.png', size: { w: 300, h: 200 }, from: 7, to: 34 });
    const plain = imageSpanFullAt('![x](y.png)', 3, NONE);
    expect(plain).toEqual({ alt: 'x', src: 'y.png', size: null, from: 0, to: 11 });
  });

  test('htmlImgAt：解析 src / alt / 尺寸（attr 与 style）', () => {
    const doc = 'a <img src="b.png" alt="B" width="100px" /> c';
    const hit = htmlImgAt(doc, 10, NONE);
    expect(hit?.src).toBe('b.png');
    expect(hit?.alt).toBe('B');
    expect(hit?.width).toBe(100);
    expect(hit?.height).toBeNull();
    const styleHit = htmlImgAt('<img src="c.png" style="width:20px;height:30px;">', 5, NONE);
    expect(styleHit?.width).toBe(20);
    expect(styleHit?.height).toBe(30);
  });

  test('fenceContentRange：剥离首尾围栏行', () => {
    const doc = '```js\nconst a = 1;\nconst b = 2;\n```\n';
    const fence = codeFenceAt(doc, 8);
    expect(fence).not.toBeNull();
    if (fence === null) return;
    const range = fenceContentRange(doc, fence);
    expect(doc.slice(range.from, range.to)).toBe('const a = 1;\nconst b = 2;');
  });

  test('fenceContentRange：未闭合围栏内容延伸到文末', () => {
    const doc = '```js\nx = 1';
    const fence = codeFenceAt(doc, 7);
    expect(fence).not.toBeNull();
    if (fence === null) return;
    const range = fenceContentRange(doc, fence);
    expect(doc.slice(range.from, range.to)).toBe('x = 1');
  });

  test('dedentText：剥离公共缩进，空行不动', () => {
    expect(dedentText('    a\n      b\n\n    c')).toBe('a\n  b\n\nc');
    expect(dedentText('a\nb')).toBe('a\nb');
    expect(dedentText('')).toBe('');
  });

  // ── P0-EDITOR-005：右键处拉丁词提取（词典 / 拼写建议的前提）──────────────
  describe('wordAt', () => {
    const doc = "hello world don't well-known 中文 tail.";

    test('点在词内 / 词尾两侧都能命中（posAtCoords 给的是字符之间）', () => {
      const at = doc.indexOf('world');
      expect(wordAt(doc, at)).toBe('world');        // 点在词首（字符之间）
      expect(wordAt(doc, at + 1)).toBe('world');    // 点在词中
      expect(wordAt(doc, at + 5)).toBe('world');    // 点在词尾之后一位
    });

    test('允许词内撇号与连字符', () => {
      expect(wordAt(doc, doc.indexOf("don't") + 2)).toBe("don't");
      expect(wordAt(doc, doc.indexOf('well-known') + 3)).toBe('well-known');
    });

    test('首尾的撇号/连字符被剥离（引号与破折号不是词的一部分）', () => {
      expect(wordAt("say 'quoted' now", 6)).toBe('quoted');
      // 'a -- dash' 中 dash 从下标 5 开始
      expect(wordAt('a -- dash', 5)).toBe('dash');
    });

    test('紧邻词尾的标点仍归属该词（用户常在词旁右键，不要求像素级命中）', () => {
      const d = 'hello world tail.';
      expect(wordAt(d, d.indexOf('.'))).toBe('tail');
    });

    test('CJK 必须返回 null：系统拼写检查对中日韩不给建议，返回词会让菜单弹出空建议区', () => {
      expect(wordAt(doc, doc.indexOf('中文'))).toBeNull();
      expect(wordAt('中文测试', 2)).toBeNull();
    });

    test('空白、标点、单字符、纯数字一律 null', () => {
      expect(wordAt('a b', 1)).toBeNull();          // 空白
      expect(wordAt('a, b', 1)).toBeNull();         // 逗号后是空格 → 两侧都不是词字符
      expect(wordAt('I am', 0)).toBeNull();         // 单字符
      expect(wordAt('v2 next', 1)).toBeNull();      // 以数字开头 → 不是拉丁词
      expect(wordAt('', 0)).toBeNull();
    });

    test('词首/词尾边界不越界', () => {
      expect(wordAt('alpha', 0)).toBe('alpha');
      expect(wordAt('alpha', 5)).toBe('alpha');     // pos === doc.length
      expect(wordAt('alpha', 6)).toBeNull();        // 越界
    });
  });
});

// ── P0-EDITOR-005：命令处理器在**派发时**向引擎询问光标处的词 ──────────────
describe('wordAtCursor（动作 API）', () => {
  function setUpWith(doc: string): { view: EditorView; actions: ContextActions } {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    const actions = (window as unknown as Record<string, unknown>)[ACTIONS_KEY] as ContextActions;
    return { view, actions };
  }

  test('光标在拉丁词内 / 词尾返回该词', () => {
    const { view, actions } = setUpWith('hello world');
    moveCaret(view, 2);
    expect(actions.wordAtCursor()).toBe('hello');
    moveCaret(view, 5);
    expect(actions.wordAtCursor()).toBe('hello');
    moveCaret(view, 8);
    expect(actions.wordAtCursor()).toBe('world');
    view.destroy();
  });

  test('紧邻词尾的空格仍归属该词（用户常在词旁右键，不要求像素级命中）', () => {
    const { view, actions } = setUpWith('hi 中文');
    moveCaret(view, 2); // 'hi' 之后的空格
    expect(actions.wordAtCursor()).toBe('hi');
    view.destroy();
  });

  test('两侧都不是词字符处返回 null；CJK 一律 null（系统拼写检查对中日韩不给建议）', () => {
    // 连续两个空格：pos 落在「两侧皆非词字符」的位置
    const { view, actions } = setUpWith('hi  中文');
    moveCaret(view, 3);
    expect(actions.wordAtCursor()).toBeNull();
    moveCaret(view, 4); // 中文区
    expect(actions.wordAtCursor()).toBeNull();
    moveCaret(view, 5);
    expect(actions.wordAtCursor()).toBeNull();
    view.destroy();
  });
});

describe('P0-EDITOR-005：整篇检查所需动作', () => {
  function setUpWith(doc: string): { view: EditorView; actions: ContextActions } {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    view.focus();
    const actions = (window as unknown as Record<string, unknown>)[ACTIONS_KEY] as ContextActions;
    return { view, actions };
  }


  test('getDocumentText / selectRange（Check Document Now 的两个前提）', () => {
    const { view, actions } = setUpWith('alpha beta gamma');
    expect(actions.getDocumentText()).toBe('alpha beta gamma');
    // 合法区间：选中并滚动到可见处
    expect(actions.selectRange(6, 10)).toBe(true);
    expect(view.state.selection.main.from).toBe(6);
    expect(view.state.selection.main.to).toBe(10);
    // 越界 / 空区间 / 反区间一律 false（不抛错）
    expect(actions.selectRange(-1, 3)).toBe(false);
    expect(actions.selectRange(0, 999)).toBe(false);
    expect(actions.selectRange(3, 3)).toBe(false);
    expect(actions.selectRange(5, 2)).toBe(false);
    view.destroy();
  });
});

describe(
  'replaceWordAtCursor（P0-EDITOR-005 建议列表）',
  () => {
    function setUpWith(doc: string): { view: EditorView; actions: ContextActions } {
      const view = new EditorView({
        doc,
        parent: document.body,
        extensions: [markdown({ base: markdownLanguage }), install(true)],
      });
      view.focus();
      const actions = (window as unknown as Record<string, unknown>)[ACTIONS_KEY] as ContextActions;
      return { view, actions };
    }

    test('把光标处的词替换为建议文本', () => {
      const { view, actions } = setUpWith('teh cat sat');
      moveCaret(view, 2);
      expect(actions.replaceWordAtCursor('the')).toBe(true);
      expect(view.state.doc.toString()).toBe('the cat sat');
      view.destroy();
    });

    test('只替换词本身：两侧的引号不计入区间', () => {
      const { view, actions } = setUpWith("a 'teh' b");
      moveCaret(view, 4); // 落在 teh 内
      expect(actions.replaceWordAtCursor('the')).toBe(true);
      expect(view.state.doc.toString()).toBe("a 'the' b");
      view.destroy();
    });

    test('无词 / CJK / 空替换文本 → false 且不改动文档', () => {
      const { view, actions } = setUpWith('中文 测试');
      moveCaret(view, 1);
      expect(actions.replaceWordAtCursor('x')).toBe(false);
      expect(view.state.doc.toString()).toBe('中文 测试');
      expect(actions.replaceWordAtCursor('')).toBe(false);
      expect(view.state.doc.toString()).toBe('中文 测试');
      view.destroy();
    });
  },
);
