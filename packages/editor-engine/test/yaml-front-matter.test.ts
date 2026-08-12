import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildYamlFrontMatterExtension, parseYamlFrontMatter, renderYamlFrontMatterHtml, validateFrontMatterYaml } from '../src/yamlFrontMatter';
import { setUpEditor, sleep } from './harness';
import { EditorView } from '@codemirror/view';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/yaml', name), 'utf8');

describe('YAML Front Matter（PRD §47）', () => {
  test('parses only top-of-document front matter and preserves Unicode', () => {
    const fm = parseYamlFrontMatter(fixture('front-matter-corpus.md'));
    expect(fm?.yaml).toContain('title: 中文标题 😀');
    expect(fm?.from).toBe(0);
    expect(fm?.to).toBe(fixture('front-matter-corpus.md').indexOf('\n\n# 正文'));
  });

  test('validates minimal YAML syntax', () => {
    expect(validateFrontMatterYaml('title: 中文\ntags:\n  - a').ok).toBe(true);
    expect(validateFrontMatterYaml('title 中文')).toEqual({ ok: false, message: 'Line 1: expected key: value' });
    expect(validateFrontMatterYaml('title: ok\ntitle: duplicate')).toEqual({ ok: false, message: 'Line 2: duplicate key "title"' });
  });

  test('renders folded block style with validation state', () => {
    const fm = parseYamlFrontMatter(fixture('front-matter-corpus.md'))!;
    const html = renderYamlFrontMatterHtml(fm);
    expect(html).toContain('mellow-yaml-front-matter');
    expect(html).toContain('title: 中文标题 😀');
    expect(html).toContain('data-valid="true"');
  });

  test('invalid YAML renders error state', () => {
    const fm = parseYamlFrontMatter('---\ntitle invalid\n---\nBody')!;
    const html = renderYamlFrontMatterHtml(fm);
    expect(html).toContain('mellow-yaml-error');
    expect(html).toContain('Line 1: expected key: value');
  });

  test('idle folds front matter into block widget', async () => {
    const view = setUpEditor(fixture('front-matter-corpus.md'));
    await sleep();
    expect(view.dom.querySelector('.mellow-yaml-front-matter')?.textContent).toContain('title: 中文标题 😀');
  });

  test('source reveal: caret inside front matter keeps source', async () => {
    const view = setUpEditor(fixture('front-matter-corpus.md'));
    view.dispatch({ selection: { anchor: 4 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-yaml-front-matter')).toBeNull();
  });

  test('can disable folding while keeping parser utilities', async () => {
    const view = new EditorView({
      doc: fixture('front-matter-corpus.md'),
      parent: document.body,
      extensions: [buildYamlFrontMatterExtension(false, { fold: false })],
    });
    await sleep();
    expect(view.dom.querySelector('.mellow-yaml-front-matter')).toBeNull();
    expect(parseYamlFrontMatter(view.state.doc.toString())?.yaml).toContain('draft: false');
  });
});
