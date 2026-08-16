/**
 * Wikilink（Typora 深度对标）：[[name]] 扫描、渲染与点击跳转桥。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { scanWikilinks } from '../src/wikilink';
import { moveCaret, sleep } from './harness';

const OPEN_KEY = '__MELLOW_WIKILINK_OPEN__' as keyof Window;

function setUp(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true)],
  });
  view.focus();
  return view;
}

describe('scanWikilinks（纯函数）', () => {
  test('基础扫描 [[name]]', () => {
    expect(scanWikilinks('see [[alpha]] and [[beta]]', [])).toEqual([
      { from: 4, to: 13, name: 'alpha' },
      { from: 18, to: 26, name: 'beta' },
    ]);
  });

  test('保留扩展名与子路径名', () => {
    expect(scanWikilinks('[[doc.md]] [[sub/page]]', [])).toEqual([
      { from: 0, to: 10, name: 'doc.md' },
      { from: 11, to: 23, name: 'sub/page' },
    ]);
  });

  test('跳过代码围栏与行内代码', () => {
    const doc = '```md\n[[no]]\n```\n\n[[yes]] and `[[no2]]`';
    // 围栏 [0,16)；正文 [[yes]] = from 18, to 25（7 字符）；行内代码内不匹配
    expect(scanWikilinks(doc, [{ from: 0, to: 16 }])).toEqual([
      { from: 18, to: 25, name: 'yes' },
    ]);
  });

  test('跨行不匹配；单个 [ 不算', () => {
    expect(scanWikilinks('[[a\nb]] [x]', [])).toEqual([]);
  });

  test('空名与含 [ 名不匹配', () => {
    // [[]]：空名；[[a[b]]：名内含 [ 拒绝
    expect(scanWikilinks('[[]] [[a[b]]', [])).toEqual([]);
  });

  test('未闭合忽略', () => {
    expect(scanWikilinks('[[open', [])).toEqual([]);
  });
});

describe('Wikilink 渲染', () => {
  test('链接内容有样式类、定界符隐藏（caret 在区间外）', async () => {
    const view = setUp('[[alpha]] x');
    await sleep();
    moveCaret(view, 10); // 区间外（doc 长 11）
    await sleep();
    expect(view.dom.querySelector('.mellow-wikilink')).not.toBeNull();
    expect(view.dom.querySelectorAll('.mellow-wikilink-delim').length).toBe(2);
    view.destroy();
  });

  test('caret 进入区间 → 定界符显示（源码编辑）', async () => {
    const view = setUp('[[alpha]] x');
    await sleep();
    moveCaret(view, 3); // 区间内
    await sleep();
    expect(view.dom.querySelectorAll('.mellow-wikilink-delim').length).toBe(0);
    view.destroy();
  });

  test('doc 文本不变（Source Fidelity）', async () => {
    const view = setUp('[[alpha]] [[beta]]');
    await sleep();
    expect(view.state.doc.toString()).toBe('[[alpha]] [[beta]]');
    view.destroy();
  });
});

describe('Wikilink 点击桥', () => {
  test('点击链接 → 回调携带 name；点击空白不触发', async () => {
    const view = setUp('[[alpha]] x');
    await sleep();
    moveCaret(view, 10); // 区间外（doc 长 11）
    await sleep();

    const calls: string[] = [];
    (window as unknown as Record<string, unknown>)[OPEN_KEY] = (name: string) => { calls.push(name); };

    // jsdom 无布局：stub posAtCoords 模拟点击落点
    const spy = jest.spyOn(view, 'posAtCoords').mockReturnValue(5); // 链接内
    view.contentDOM.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    await sleep();
    expect(calls).toEqual(['alpha']);

    spy.mockReturnValue(10); // 区间外（doc 长 11）
    view.contentDOM.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    await sleep();
    expect(calls).toEqual(['alpha']);

    spy.mockRestore();
    delete (window as unknown as Record<string, unknown>)[OPEN_KEY];
    view.destroy();
  });
});
