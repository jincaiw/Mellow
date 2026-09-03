import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { buildSmartPasteExtension, htmlToMarkdown, pastePlain, sanitizeHtml, tsvToGfmTable } from '../src/smartPaste';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { endComposition, selectRange, sleep, startComposition } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/clipboard', name), 'utf8');

function setUp(doc = ''): EditorView {
  return new EditorView({
    doc,
    parent: document.body,
    extensions: [history(), buildSmartPasteExtension()],
    selection: { anchor: doc.length },
  });
}

function firePaste(view: EditorView, formats: Record<string, string>): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => formats[type] ?? '' } });
  view.contentDOM.dispatchEvent(event);
  return event;
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

// ───────────────── P5.3 Clipboard — paste priority / IME / 边界（V4 计划 P5 Clipboard 行自动化部分） ─────────────────

describe('P5.3 Clipboard — paste priority 链 / IME guard / 边界', () => {
  beforeEach(() => {
    resetCompositionState();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetCompositionState();
    document.body.innerHTML = '';
  });

  test('spec §9：composition 期间 TSV paste 不转换、事件不拦截（editor owns transaction）', () => {
    installCompositionTracking();
    const view = setUp('表格：\n');
    startComposition();
    firePaste(view, { 'text/plain': '名称\t数量\n苹果\t2' });
    expect(view.state.doc.toString()).not.toContain('| --- |');
    endComposition();
    view.destroy();
  });

  test('spec §9：composition 期间 HTML paste 不转换；compositionend 后同一格式生效', () => {
    installCompositionTracking();
    const view = setUp('开始');
    startComposition();
    firePaste(view, { 'text/html': '<p>中文 <strong>内容</strong></p>' });
    expect(view.state.doc.toString()).toBe('开始'); // 默认管道无数据 → 不变
    endComposition();
    firePaste(view, { 'text/html': '<p>中文 <strong>内容</strong></p>' });
    expect(view.state.doc.toString()).toBe('开始中文 **内容**');
    view.destroy();
  });

  test('priority：TSV 优先于 HTML（spec §3 顺序 3 > 4）', () => {
    const view = setUp('');
    firePaste(view, {
      'text/plain': '名称\t数量\n苹果\t2',
      'text/html': '<p><strong>被忽略的富文本</strong></p>',
    });
    const doc = view.state.doc.toString();
    expect(doc).toContain('| 名称 | 数量 |');
    expect(doc).not.toContain('**被忽略的富文本**');
    view.destroy();
  });

  test('priority：HTML 优先于 URL-on-selection（spec §3 顺序 4 > 5）', () => {
    const view = setUp('中文文本');
    selectRange(view, 0, 4);
    firePaste(view, {
      'text/plain': 'https://example.com/x',
      'text/html': '<p><strong>富</strong></p>',
    });
    const doc = view.state.doc.toString();
    expect(doc).toBe('**富**'); // HTML 转换替换选区，而非 [中文文本](url)
    view.destroy();
  });

  test('priority：无选区 + plain URL → 交回 CM 默认按纯文本插入（不误建链接）', () => {
    const view = setUp('正文');
    view.dispatch({ selection: { anchor: 2 } });
    firePaste(view, { 'text/plain': 'https://example.com/x' });
    expect(view.state.doc.toString()).toBe('正文https://example.com/x'); // 纯文本，无 [链接](url) 包裹
    view.destroy();
  });

  test('priority：选区 + plain 非 URL 非 TSV → 交回 CM 默认按纯文本替换（无转换）', () => {
    const view = setUp('中文文本');
    selectRange(view, 0, 2);
    firePaste(view, { 'text/plain': '普通词' });
    expect(view.state.doc.toString()).toBe('普通词文本'); // plain 直接替换，无任何 smart 转换
    view.destroy();
  });

  test('pastePlain 空文本 → false 且 doc 不变（Paste Plain 边界）', () => {
    const view = setUp('A');
    expect(pastePlain(view, '')).toBe(false);
    expect(view.state.doc.toString()).toBe('A');
    view.destroy();
  });

  test('URL on selection：单 Undo 还原（与 HTML/TSV 同一 Undo 语义）', () => {
    const view = setUp('文本');
    selectRange(view, 0, 2);
    firePaste(view, { 'text/plain': 'https://example.com' });
    expect(view.state.doc.toString()).toBe('[文本](https://example.com)');
    undo(view);
    expect(view.state.doc.toString()).toBe('文本');
    view.destroy();
  });
});
