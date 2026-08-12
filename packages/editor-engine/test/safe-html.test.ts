import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractHtmlBlocks, renderSafeHtml, sanitizeHtml } from '../src/safeHtml';
import { setUpEditor, sleep } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/html', name), 'utf8');

describe('Safe HTML（PRD §48）', () => {
  test('sanitize removes script, event handlers, javascript URLs and srcdoc', () => {
    const clean = sanitizeHtml(fixture('safe-html-corpus.html'));
    expect(clean).toContain('中文 HTML 😀');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('srcdoc');
  });

  test('iframe is preserved only with sandbox', () => {
    const clean = sanitizeHtml('<iframe src="https://example.com/embed"></iframe>');
    expect(clean).toContain('<iframe');
    expect(clean).toContain('sandbox=""');
  });

  test('unsafe tag is dropped but text content of safe siblings remains', () => {
    const clean = sanitizeHtml('<p>ok</p><object data="x"></object><form><input></form>');
    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('<object');
    expect(clean).not.toContain('<form');
  });

  test('extracts HTML blocks and skips fenced code', () => {
    const doc = '<div>ok</div>\n\n```html\n<script>no</script>\n```\n\n<span>inline</span>';
    const blocks = extractHtmlBlocks(doc);
    expect(blocks.map((b) => b.source)).toEqual(['<div>ok</div>', '<span>inline</span>']);
  });

  test('renderSafeHtml returns sanitized HTML with wrapper', () => {
    const html = renderSafeHtml('<p onclick="x()">中文</p>');
    expect(html).toContain('mellow-safe-html');
    expect(html).toContain('<p>中文</p>');
    expect(html).not.toContain('onclick');
  });

  test('idle renders sanitized HTML widget', async () => {
    const view = setUpEditor('<p onclick="x()">中文</p>');
    await sleep();
    expect(view.dom.querySelector('.mellow-safe-html')?.innerHTML).toContain('<p>中文</p>');
    expect(view.dom.innerHTML).not.toContain('onclick');
  });

  test('source reveal: caret inside HTML keeps source', async () => {
    const view = setUpEditor('<p>中文</p>');
    view.dispatch({ selection: { anchor: 2 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-safe-html')).toBeNull();
  });
});
