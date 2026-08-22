import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { copyAsMarkdown, copyAsPlain, copyAsHtmlSource, copySelectionToClipboard, installClipboardApi, markdownToClipboardHtml, markdownToPlainText, markdownToRtf } from '../src/clipboardCopy';
import { selectRange, setUpEditor } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/clipboard', name), 'utf8');

class FakeClipboardData {
  readonly values = new Map<string, string>();
  setData(type: string, value: string): void {
    this.values.set(type, value);
  }
  getData(type: string): string {
    return this.values.get(type) ?? '';
  }
}

function fireCopy(view: EditorView): FakeClipboardData {
  const data = new FakeClipboardData();
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  return data;
}

describe('Clipboard Copy（clipboard-smart-paste-spec §2）', () => {
  test('Markdown selection renders semantic HTML, preserves Chinese and Unicode', () => {
    const html = markdownToClipboardHtml(fixture('copy-source.md'), { includeTheme: false });
    expect(html).toContain('<h1>中文标题 😀</h1>');
    expect(html).toContain('这是 <strong>重点</strong> 和 <a href="https://example.com/路径">链接</a>。');
    expect(html).toContain('<li>第一项</li>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>名称</th>');
    expect(html).toContain('<td>苹果</td>');
  });

  test('code fence content is escaped, not converted into active HTML', () => {
    const html = markdownToClipboardHtml(fixture('copy-source.md'), { includeTheme: false });
    expect(html).toContain('&lt;b&gt;不要转换&lt;/b&gt;');
    expect(html).not.toContain('<b>不要转换</b>');
  });

  test('normal Copy writes text/plain, text/html, text/rtf and Markdown flavors', () => {
    const view = setUpEditor(fixture('copy-source.md'));
    selectRange(view, 0, view.state.doc.length);
    const data = fireCopy(view);
    expect(data.getData('text/plain')).toContain('中文标题 😀');
    expect(data.getData('text/plain')).not.toContain('**重点**');
    expect(data.getData('text/html')).toContain('<strong>重点</strong>');
    expect(data.getData('text/rtf')).toContain('{\\rtf1');
    expect(data.getData('text/markdown')).toContain('**重点**');
    expect(data.getData('text/x-mellow-markdown')).toContain('```ts');
  });

  test('Copy as Markdown writes Markdown source to text/plain only', () => {
    const view = setUpEditor('中文 **重点**');
    selectRange(view, 0, view.state.doc.length);
    const data = new FakeClipboardData();
    expect(copyAsMarkdown(view, data)).toBe(true);
    expect([...data.values.keys()]).toEqual(['text/plain']);
    expect(data.getData('text/plain')).toBe('中文 **重点**');
  });

  test('Copy as Plain writes rendered plain text and removes Markdown markers', () => {
    const view = setUpEditor('中文 **重点** 和 [链接](https://example.com/路径)');
    selectRange(view, 0, view.state.doc.length);
    const data = new FakeClipboardData();
    expect(copyAsPlain(view, data)).toBe(true);
    expect(data.getData('text/plain')).toBe('中文 重点 和 链接');
  });

  test('Copy as HTML Code writes rendered HTML source as plain text（D3 Typora parity）', () => {
    const view = setUpEditor('中文 **重点**');
    selectRange(view, 0, view.state.doc.length);
    const data = new FakeClipboardData();
    expect(copyAsHtmlSource(view, data)).toBe(true);
    // 仅 text/plain 一种 flavor，内容是 HTML 源码本身
    expect([...data.values.keys()]).toEqual(['text/plain']);
    expect(data.getData('text/plain')).toContain('<strong>重点</strong>');
    expect(data.getData('text/plain')).not.toContain('style=');
  });

  test('Copy without Theme writes semantic HTML without style/class attributes', () => {
    const view = setUpEditor('中文 **重点**');
    selectRange(view, 0, view.state.doc.length);
    const data = new FakeClipboardData();
    expect(copySelectionToClipboard(view, data, { includeHtml: true, includeRtf: true, includeMarkdownFlavor: true, includeTheme: false })).toBe(true);
    expect(data.getData('text/html')).toContain('<strong>重点</strong>');
    expect(data.getData('text/html')).not.toContain('style=');
    expect(data.getData('text/html')).not.toContain('class=');
  });

  test('empty selection falls back to browser default copy', () => {
    const view = setUpEditor('中文');
    const data = new FakeClipboardData();
    expect(copySelectionToClipboard(view, data, { includeHtml: true, includeRtf: true, includeMarkdownFlavor: true, includeTheme: true })).toBe(false);
  });

  test('RTF preserves Unicode with RTF unicode escapes', () => {
    const rtf = markdownToRtf('中文 😀');
    expect(rtf).toContain('\\u20013?');
    expect(rtf).toContain('\\u25991?');
    expect(rtf).toContain('\\u-10179?');
    expect(rtf).toContain('\\u-8704?');
  });

  test('plain text conversion handles table and link text', () => {
    const plain = markdownToPlainText('| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n\n[链接](https://example.com/路径)');
    expect(plain).toBe('名称\t数量\n苹果\t2\n\n链接');
  });
});

describe('Clipboard host API（B2 菜单接线：__MELLOW_CLIPBOARD_API__）', () => {
  test('installClipboardApi 注册 copyAsMarkdown（经 activeView 代理）', () => {
    const view = setUpEditor('中文 **重点**');
    selectRange(view, 0, view.state.doc.length);
    const written: string[] = [];
    const nav = navigator as Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } };
    const original = nav.clipboard;
    Object.defineProperty(nav, 'clipboard', {
      value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
      configurable: true,
    });

    installClipboardApi();
    const api = (window as unknown as { __MELLOW_CLIPBOARD_API__?: { copyAsMarkdown(): boolean } }).__MELLOW_CLIPBOARD_API__;
    expect(api).toBeDefined();
    expect(api?.copyAsMarkdown()).toBe(true);
    expect(written).toContain('中文 **重点**');

    Object.defineProperty(nav, 'clipboard', { value: original, configurable: true });
  });
});
