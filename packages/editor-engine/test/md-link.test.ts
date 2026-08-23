/**
 * Markdown 文件链接（Typora 深度对标）：`[label](path.md)` / `#锚点` 扫描与点击打开。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { scanMdLinks, isMdLinkDest } from '../src/mdLink';
import { sleep } from './harness';

const OPEN_KEY = '__MELLOW_MD_LINK_OPEN__' as keyof Window;

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  view.focus();
  return view;
}

function fireClick(view: EditorView, offset: number): void {
  // jsdom 无布局：stub posAtCoords 模拟点击落点
  const spy = jest.spyOn(view, 'posAtCoords').mockReturnValue(offset);
  view.contentDOM.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }));
  spy.mockRestore();
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[OPEN_KEY];
  document.querySelectorAll('.cm-editor').forEach((el) => el.remove());
});

describe('isMdLinkDest（目标判定）', () => {
  test('.md / .markdown / #锚点 均可', () => {
    expect(isMdLinkDest('note.md')).toBe(true);
    expect(isMdLinkDest('sub/笔记.markdown')).toBe(true);
    expect(isMdLinkDest('../up/note.md#章节')).toBe(true);
    expect(isMdLinkDest('a.md#')).toBe(true);
  });

  test('URL / 图片 / 非 md / 空不匹配', () => {
    expect(isMdLinkDest('https://a.com/x.md')).toBe(false);
    expect(isMdLinkDest('mailto:a@b.c')).toBe(false);
    expect(isMdLinkDest('img.png')).toBe(false);
    expect(isMdLinkDest('')).toBe(false);
    expect(isMdLinkDest('note.md.exe')).toBe(false);
  });
});

describe('scanMdLinks（纯函数）', () => {
  test('基础扫描 [label](dest)', () => {
    const links = scanMdLinks('see [笔记](note.md) here', []);
    expect(links).toHaveLength(1);
    expect(links[0].dest).toBe('note.md');
    expect(links[0].from).toBe(4);
    expect(links[0].labelFrom).toBe(5);
    expect(links[0].labelTo).toBe(7);
    expect(links[0].to).toBe(17);
  });

  test('锚点保留在 dest（不解码）', () => {
    const links = scanMdLinks('[a](../sub/b.md#%E7%AB%A0%E8%8A%82)', []);
    expect(links).toHaveLength(1);
    expect(links[0].dest).toBe('../sub/b.md#%E7%AB%A0%E8%8A%82');
  });

  test('多个链接 / 相对路径 / 绝对路径', () => {
    const links = scanMdLinks('[a](a.md) [b](../p/b.md) [c](/abs/c.md)', []);
    expect(links.map((l) => l.dest)).toEqual(['a.md', '../p/b.md', '/abs/c.md']);
  });

  test('跳过代码围栏与行内代码', () => {
    const doc = '```md\n[l](no.md)\n```\n\n[yes](y.md) and `[no2](n.md)`';
    const links = scanMdLinks(doc, [{ from: 0, to: 16 }]);
    expect(links).toHaveLength(1);
    expect(links[0].dest).toBe('y.md');
  });

  test('排除图片 ![](...)、wikilink [[]]、URL、非 md、含空格 title、空 label', () => {
    expect(scanMdLinks('![alt](img.md)', [])).toHaveLength(0);
    expect(scanMdLinks('[[note.md]]', [])).toHaveLength(0);
    expect(scanMdLinks('[a](https://x.com/a.md)', [])).toHaveLength(0);
    expect(scanMdLinks('[a](b.md "title")', [])).toHaveLength(0);
    expect(scanMdLinks('[](b.md)', [])).toHaveLength(0);
    expect(scanMdLinks('[a](b.txt)', [])).toHaveLength(0);
  });

  test('转义 label 内 \\[；跨行不匹配', () => {
    expect(scanMdLinks('[a\\[b](c.md)', [])).toHaveLength(1);
    expect(scanMdLinks('[a\nb](c.md)', [])).toHaveLength(0);
  });

  test('引用式链接定义 [x]: y.md 不匹配（] 后非 (）', () => {
    expect(scanMdLinks('[ref]: target.md', [])).toHaveLength(0);
  });
});

describe('点击打开（__MELLOW_MD_LINK_OPEN__）', () => {
  test('点击 label → 回调收到 dest', async () => {
    const opened: string[] = [];
    (window as unknown as Record<string, unknown>)[OPEN_KEY] = (dest: string) => { opened.push(dest); };
    const view = setUp('see [笔记](note.md) here');
    fireClick(view, 5); // label 区间内
    await sleep();
    expect(opened).toEqual(['note.md']);
  });

  test('点击非链接区域 → 不触发', async () => {
    const opened: string[] = [];
    (window as unknown as Record<string, unknown>)[OPEN_KEY] = (dest: string) => { opened.push(dest); };
    const view = setUp('plain text only');
    fireClick(view, 3);
    await sleep();
    expect(opened).toEqual([]);
  });

  test('doc 文本不变（Source Fidelity）', async () => {
    const before = '[a](b.md#c)';
    const view = setUp(before);
    fireClick(view, 1);
    await sleep();
    expect(view.state.doc.toString()).toBe(before);
  });
});
