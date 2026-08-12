import { flattenOutline } from '../src/outline';
import { renderReaderHtml } from '../src/reader';

describe('Reader renderer — block level, no markers, no caret', () => {
  test('headings render without # markers and carry slug ids', () => {
    const { html } = renderReaderHtml('# Title\n\n## Sub *title*');
    expect(html).toContain('<h1 id="title" data-offset="0">Title</h1>');
    expect(html).toContain('<h2 id="sub-title" data-offset="9">Sub <em>title</em></h2>');
    expect(html).not.toContain('# ');
  });

  test('block elements carry data-offset anchors for preview-to-source navigation', () => {
    const { html } = renderReaderHtml('# A\n\npara one\n\n- item\n\n> quote\n\n```js\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('data-offset="0"'); // heading
    expect(html).toContain('<p data-offset="5">para one</p>');
    expect(html).toContain('<ul data-offset="15">');
    expect(html).toContain('<blockquote data-offset="23">');
    expect(html).toContain('class="mellow-reader-code" data-offset="32"');
    expect(html).toContain('<table data-offset="56">');
  });

  test('paragraphs with inline formatting produce semantic tags, not markers', () => {
    const { html } = renderReaderHtml('**bold** *it* ~~strike~~ `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>it</em>');
    expect(html).toContain('<del>strike</del>');
    expect(html).toContain('<code>code</code>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('~~');
  });

  test('links and images render; javascript: URLs are dropped', () => {
    const { html } = renderReaderHtml('[text](https://example.com) ![alt](img.png) [bad](javascript:alert(1))');
    expect(html).toContain('<a href="https://example.com">text</a>');
    expect(html).toContain('<img src="img.png" alt="alt"');
    expect(html).not.toContain('javascript:');
  });

  test('unordered/ordered/task lists', () => {
    const { html } = renderReaderHtml('- a\n- b\n\n1. one\n2. two\n\n- [x] done\n- [ ] todo');
    expect(html).toContain('<ul data-offset=');
    expect(html).toContain('<ol data-offset=');
    expect(html).toContain('<li class="mellow-reader-task"><input type="checkbox" checked disabled');
    expect(html).toContain('<input type="checkbox" disabled');
  });

  test('blockquote and hr', () => {
    const { html } = renderReaderHtml('> quote\n\n---');
    expect(html).toContain('<blockquote data-offset=');
    expect(html).toContain('<hr data-offset=');
  });

  test('fenced code block keeps language class and copy affordance', () => {
    const { html } = renderReaderHtml('```js\nconst x = 1;\n```');
    expect(html).toContain('class="mellow-reader-code"');
    expect(html).toContain('language-js');
    expect(html).toContain('mellow-reader-copy');
    expect(html).toContain('const x = 1;');
  });

  test('table renders thead/tbody', () => {
    const { html } = renderReaderHtml('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table data-offset=');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  test('raw HTML is sanitized (script removed)', () => {
    const { html } = renderReaderHtml('<script>alert(1)</script>\n\n<p>safe <b>bold</b></p>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('<b>bold</b>');
  });
});

describe('Reader renderer — math / mermaid / alerts / toc', () => {
  test('math block and inline produce typed containers with escaped tex source', () => {
    const { html } = renderReaderHtml('$$\nx^2\n$$\n\ninline $a<b$');
    expect(html).toContain('mellow-reader-math-block');
    expect(html).toContain('data-tex="x^2"');
    expect(html).toContain('mellow-reader-math');
    expect(html).toContain('data-tex="a&lt;b"');
  });

  test('mermaid fence produces a typed container with source', () => {
    const { html } = renderReaderHtml('```mermaid\ngraph TD\n  A --> B\n```');
    expect(html).toContain('mellow-reader-mermaid');
    expect(html).toContain('data-source="graph TD');
  });

  test('github alert produces typed container', () => {
    const { html } = renderReaderHtml('> [!NOTE]\n> hello');
    expect(html).toContain('mellow-reader-alert');
    expect(html).toContain('NOTE');
  });

  test('toc marker renders an in-document table of contents with anchors', () => {
    const { html } = renderReaderHtml('# Alpha\n\n[toc]\n\n## Beta');
    expect(html).toContain('mellow-reader-toc');
    expect(html).toContain('href="#alpha"');
    expect(html).toContain('href="#beta"');
  });
});

describe('Reader renderer — outline', () => {
  test('returns heading outline with levels and slug ids', () => {
    const { html, outline } = renderReaderHtml('# A\n\n## B\n\n### C');
    const flat = flattenOutline(outline);
    expect(flat.map((h) => h.title)).toEqual(['A', 'B', 'C']);
    expect(flat.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(outline[0].children[0].title).toBe('B');
    expect(html).toContain('id="a"');
  });
});
