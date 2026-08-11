import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { buildSmartPasteExtension, htmlToMarkdown, pastePlain, sanitizeHtml, tsvToGfmTable } from '../src/smartPaste';
import { selectRange, sleep } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/clipboard', name), 'utf8');

function setUp(doc = ''): EditorView {
  return new EditorView({
    doc,
    parent: document.body,
    extensions: [history(), buildSmartPasteExtension()],
    selection: { anchor: doc.length },
  });
}

function firePaste(view: EditorView, formats: Record<string, string>): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => formats[type] ?? '' } });
  view.contentDOM.dispatchEvent(event);
}

describe('Smart Paste（clipboard-smart-paste-spec §3-§10）', () => {
  test('fixture HTML 清洗后保留标题、中文、格式、链接、列表和表格', () => {
    const markdown = htmlToMarkdown(fixture('rich-clipboard.html'));
    expect(markdown).toContain('## 中文标题');
    expect(markdown).toContain('**重点**');
    expect(markdown).toContain('[链接](https://example.com/路径)');
    expect(markdown).toContain('- 第一项');
    expect(markdown).toContain('| 名称 | 数量 |');
    expect(markdown).not.toContain('must not survive');
    expect(markdown).not.toContain('javascript:');
  });

  test('sanitize HTML 移除 script、event handler、data URL 和 javascript URL，保留中文 Unicode', () => {
    const clean = sanitizeHtml(fixture('dangerous-rich-clipboard.html'));
    expect(clean).toContain('中文 &amp; Unicode 😀');
    expect(clean).toContain('<code>代码</code>');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('data:text/html');
  });

  test('TSV fixture 转 GFM table，保留中文与 Unicode 并转义 pipe', () => {
    expect(tsvToGfmTable(fixture('spreadsheet.tsv'))).toBe('| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n| 香蕉 | 3 |');
    expect(tsvToGfmTable(fixture('spreadsheet-unicode.tsv'))).toBe('| 名称 | 说明 |\n| --- | --- |\n| 苹果\\|梨 | emoji 😀 |\n| 中文 | 路径 /路径 |');
    expect(tsvToGfmTable('仅一列\n第二行')).toBeNull();
    expect(tsvToGfmTable('a\tb\n1')).toBeNull();
  });

  test('HTML paste 是单一 Undo transaction', () => {
    const view = setUp('开始');
    firePaste(view, { 'text/html': '<p>中文 <strong>内容</strong></p>', 'text/plain': '中文 内容' });
    expect(view.state.doc.toString()).toBe('开始中文 **内容**');
    undo(view);
    expect(view.state.doc.toString()).toBe('开始');
  });

  test('TSV paste 是单一 Undo transaction', () => {
    const view = setUp('表格：\n');
    firePaste(view, { 'text/plain': fixture('spreadsheet.tsv') });
    expect(view.state.doc.toString()).toContain('| 名称 | 数量 |');
    undo(view);
    expect(view.state.doc.toString()).toBe('表格：\n');
  });

  test('URL on selection 包裹选区；链接文本选区仅替换 target', () => {
    const view = setUp('中文文本');
    selectRange(view, 0, 4);
    firePaste(view, { 'text/plain': 'https://example.com/新路径' });
    expect(view.state.doc.toString()).toBe('[中文文本](https://example.com/新路径)');
    undo(view);
    expect(view.state.doc.toString()).toBe('中文文本');

    const linked = setUp('[中文](https://old.example)');
    selectRange(linked, 1, 3);
    firePaste(linked, { 'text/plain': 'https://new.example/路径' });
    expect(linked.state.doc.toString()).toBe('[中文](https://new.example/路径)');
  });

  test('fenced code block 内不进行 HTML、TSV 或 URL 转换', async () => {
    const view = setUp('```ts\nconst value = \'\';\n```');
    const pos = view.state.doc.toString().indexOf("''") + 1;
    view.dispatch({ selection: { anchor: pos } });
    firePaste(view, { 'text/html': '<strong>不应转换</strong>', 'text/plain': '不应转换' });
    await sleep();
    expect(view.state.doc.toString()).toContain('不应转换');
    expect(view.state.doc.toString()).not.toContain('**不应转换**');
  });

  test('indented code block 内不进行 TSV 自动转换', async () => {
    const view = setUp('    ');
    view.dispatch({ selection: { anchor: 4 } });
    firePaste(view, { 'text/plain': fixture('spreadsheet.tsv') });
    await sleep();
    expect(view.state.doc.toString()).toContain('名称\t数量');
    expect(view.state.doc.toString()).not.toContain('| --- |');
  });

  test('Paste Plain 只插入 plain text，并保留 Unicode', () => {
    const view = setUp('A');
    expect(pastePlain(view, '中文\nemoji: 😀')).toBe(true);
    expect(view.state.doc.toString()).toBe('A中文\nemoji: 😀');
    undo(view);
    expect(view.state.doc.toString()).toBe('A');
  });
});
