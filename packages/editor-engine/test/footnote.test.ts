import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFootnotes, footnotePreviewText, buildFootnoteExtension } from '../src/footnote';
import { setUpEditor, sleep } from './harness';
import { EditorView } from '@codemirror/view';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/footnote', name), 'utf8');

describe('Footnote（PRD §44）', () => {
  test('parser finds refs/definitions, supports duplicate refs and skips code fences', () => {
    const parsed = parseFootnotes(fixture('typora-footnote-corpus.md'));
    expect(parsed.refs.map((r) => r.id)).toEqual(['note', 'long-id', 'note']);
    expect([...parsed.definitions.keys()]).toEqual(['note', 'long-id']);
    expect(parsed.definitions.get('long-id')?.content).toContain('续行内容');
    expect(parsed.refs.some((r) => r.id === 'code')).toBe(false);
  });

  test('hover preview text returns definition content as plain text', () => {
    const parsed = parseFootnotes(fixture('typora-footnote-corpus.md'));
    expect(footnotePreviewText(parsed, 'note')).toBe('这是中文脚注内容，含 强调。');
    expect(footnotePreviewText(parsed, 'missing')).toBe('Missing footnote: missing');
  });

  test('idle renders superscript widgets and definition return widgets', async () => {
    const view = setUpEditor('正文[^a]\n\n[^a]: 脚注内容');
    await sleep();
    const ref = view.dom.querySelector('.mellow-footnote-ref') as HTMLElement | null;
    // 显示序号而非 `[^id]`（Typora：footnoteList.indexOf(name)+1）
    expect(ref?.textContent).toBe('1');
    expect(ref?.getAttribute('title')).toBe('脚注内容');
    expect(view.dom.querySelector('.mellow-footnote-return')?.textContent).toBe('↩');
  });

  test('脚注序号按首次出现顺序，重复引用同号（Typora footnoteList 语义）', async () => {
    const view = setUpEditor('正文[^x] 与 [^y]，再来 [^x]\n\n[^x]: X 内容\n\n[^y]: Y 内容');
    await sleep();
    const refs = Array.from(view.dom.querySelectorAll('.mellow-footnote-ref')).map((el) => el.textContent);
    expect(refs).toEqual(['1', '2', '1']);
  });

  test('source reveal: caret inside ref does not render ref widget', async () => {
    const view = setUpEditor('正文[^a]\n\n[^a]: 脚注内容');
    view.dispatch({ selection: { anchor: 3 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-footnote-ref')).toBeNull();
  });

  test('click ref jumps to definition; click return jumps back to first ref', async () => {
    const view = new EditorView({
      doc: '正文[^a]\n\n[^a]: 脚注内容',
      parent: document.body,
      extensions: [buildFootnoteExtension(false)],
    });
    await sleep();
    (view.dom.querySelector('.mellow-footnote-ref') as HTMLElement).click();
    expect(view.state.selection.main.head).toBe(view.state.doc.toString().indexOf('[^a]:'));
    (view.dom.querySelector('.mellow-footnote-return') as HTMLElement).click();
    expect(view.state.selection.main.head).toBe(view.state.doc.toString().indexOf('[^a]'));
  });
});
