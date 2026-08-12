import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { buildTocExtension, exportTocHtml, parseTocMarkers, slugifyHeading, tocItemsFromMarkdown } from '../src/toc';
import { setUpEditor, sleep } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/toc', name), 'utf8');

describe('TOC（PRD §45）', () => {
  test('extracts heading levels, slugs and skips code/YAML blocks', () => {
    const items = tocItemsFromMarkdown(fixture('toc-corpus.md'));
    expect(items.map((i) => [i.level, i.title])).toEqual([
      [1, '文档标题'],
      [2, '第一章'],
      [3, '小节 A'],
      [4, '深层小节'],
      [2, '第二章 😀'],
    ]);
    expect(items.some((i) => i.title.includes('代码块'))).toBe(false);
    expect(items.some((i) => i.title.includes('YAML'))).toBe(false);
    expect(items[4].slug).toBe('第二章-😀');
  });

  test('slugify keeps Chinese and Unicode stable', () => {
    expect(slugifyHeading('第二章 😀')).toBe('第二章-😀');
    expect(slugifyHeading('Hello, World!')).toBe('hello-world');
  });

  test('detects [TOC] markers', () => {
    const markers = parseTocMarkers('A\n[TOC]\nB\n[[TOC]]');
    expect(markers).toEqual([{ from: 2, to: 7, source: '[TOC]' }]);
  });

  test('exportTocHtml supports max level and custom class', () => {
    const html = exportTocHtml(tocItemsFromMarkdown(fixture('toc-corpus.md')), { maxLevel: 2, className: 'custom-toc' });
    expect(html).toContain('class="custom-toc"');
    expect(html).toContain('href="#第一章"');
    expect(html).toContain('第二章 😀');
    expect(html).not.toContain('小节 A');
  });

  test('idle renders live TOC widget with jump links', async () => {
    const view = setUpEditor('[TOC]\n\n# 标题\n\n## 小节');
    await sleep();
    const toc = view.dom.querySelector('.mellow-toc') as HTMLElement | null;
    expect(toc?.textContent).toContain('标题');
    expect(toc?.textContent).toContain('小节');
    (toc?.querySelector('a') as HTMLElement).click();
    expect(view.state.selection.main.head).toBe(view.state.doc.toString().indexOf('# 标题'));
  });

  test('source reveal: caret inside [TOC] keeps marker source', async () => {
    const view = setUpEditor('[TOC]\n\n# 标题');
    view.dispatch({ selection: { anchor: 2 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-toc')).toBeNull();
  });

  test('live update after heading edit', async () => {
    const view = new EditorView({ doc: '[TOC]\n\n# Old', parent: document.body, extensions: [buildTocExtension(false)] });
    await sleep();
    expect(view.dom.querySelector('.mellow-toc')?.textContent).toContain('Old');
    const pos = view.state.doc.toString().indexOf('Old');
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: '新标题' } });
    await sleep();
    expect(view.dom.querySelector('.mellow-toc')?.textContent).toContain('新标题');
  });
});
