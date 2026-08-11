import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import {
  buildMermaidExtension,
  copyMermaidSourceAt,
  createMermaid11Renderer,
  exportMermaidSvg,
  mermaidBlockIntersectsViewport,
  parseMermaidBlocks,
  renderMermaidError,
} from '../src/mermaid';
import { setUpEditor, sleep } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/mermaid', name), 'utf8');

describe('Mermaid Live Rendering（PRD §43 / live-markdown-engine-spec §19）', () => {
  test('Typora Mermaid Corpus parser finds diagrams and preserves source', () => {
    const blocks = parseMermaidBlocks(fixture('typora-mermaid-corpus.md'));
    expect(blocks.length).toBe(10);
    expect(blocks[0].diagramType).toBe('flowchart');
    expect(blocks[0].source).toContain('```mermaid');
    expect(blocks[0].code).toContain('中文开始 😀');
    expect(blocks.some((b) => b.diagramType === 'sequenceDiagram')).toBe(true);
    expect(blocks.some((b) => b.diagramType === 'classDiagram')).toBe(true);
    expect(blocks.some((b) => b.diagramType === 'stateDiagram-v2')).toBe(true);
    expect(blocks.some((b) => b.diagramType === 'erDiagram')).toBe(true);
    expect(blocks.some((b) => b.diagramType === 'mindmap')).toBe(true);
  });

  test('lazy renderer loads Mermaid 11 API only when render is requested', async () => {
    let loaded = 0;
    const renderer = createMermaid11Renderer(async () => {
      loaded += 1;
      return {
        initialize: jest.fn(),
        render: async (id: string, source: string) => ({ svg: `<svg id="${id}"><text>${source}</text></svg>` }),
      };
    });
    expect(loaded).toBe(0);
    const result = await renderer.render({ id: 'm1', source: 'flowchart TD\nA-->B' });
    expect(loaded).toBe(1);
    expect(result.svg).toContain('<svg');
    await renderer.render({ id: 'm2', source: 'sequenceDiagram\nA->>B: hi' });
    expect(loaded).toBe(1);
  });

  test('Mermaid 11 render error becomes compact error state with source kept', async () => {
    const renderer = createMermaid11Renderer(async () => ({
      initialize: jest.fn(),
      render: async () => { throw new Error('Parse error on line 1'); },
    }));
    await expect(renderer.render({ id: 'bad', source: 'this is not valid mermaid !!!' })).rejects.toThrow('Parse error');
    const html = renderMermaidError('this is not valid mermaid !!!', new Error('Parse error on line 1'));
    expect(html).toContain('mellow-mermaid-error');
    expect(html).toContain('Parse error on line 1');
    expect(html).toContain('this is not valid mermaid !!!');
  });

  test('copy source returns exact fenced block and writes Markdown flavors', () => {
    const doc = 'Before\n```mermaid\nflowchart TD\n  A-->B\n```\nAfter';
    const pos = doc.indexOf('A-->B');
    const data = new Map<string, string>();
    const source = copyMermaidSourceAt(doc, pos, (type, value) => data.set(type, value));
    expect(source).toBe('```mermaid\nflowchart TD\n  A-->B\n```');
    expect(data.get('text/plain')).toBe(source);
    expect(data.get('text/markdown')).toBe(source);
    expect(data.get('text/x-mellow-mermaid-source')).toBe(source);
  });

  test('export SVG returns Mermaid-rendered SVG', async () => {
    const svg = await exportMermaidSvg('flowchart TD\nA-->B', {
      render: async ({ id, source }) => ({ svg: `<svg id="${id}"><text>${source}</text></svg>` }),
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('flowchart TD');
  });

  test('viewport helper renders only intersecting Mermaid blocks', () => {
    expect(mermaidBlockIntersectsViewport({ from: 10, to: 20 }, [{ from: 0, to: 9 }])).toBe(false);
    expect(mermaidBlockIntersectsViewport({ from: 10, to: 20 }, [{ from: 20, to: 30 }])).toBe(false);
    expect(mermaidBlockIntersectsViewport({ from: 10, to: 20 }, [{ from: 19, to: 30 }])).toBe(true);
  });

  test('caret inside Mermaid source reveals source instead of widget', async () => {
    const view = setUpEditor('```mermaid\nflowchart TD\nA-->B\n```');
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('A-->B') } });
    await sleep();
    expect(view.dom.querySelector('.mellow-mermaid-widget')).toBeNull();
    view.dispatch({ selection: { anchor: 0 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-mermaid-widget')?.textContent).toContain('flowchart TD');
  });

  test('debounce + cancellation: stale heavy render is ignored and latest source wins', async () => {
    const calls: string[] = [];
    const view = new EditorView({
      doc: '```mermaid\nflowchart TD\nA-->B\n```',
      parent: document.body,
      extensions: [buildMermaidExtension(false, {
        debounceMs: 20,
        renderer: {
          render: async ({ source, signal }) => {
            calls.push(source);
            await sleep(10);
            if (signal?.aborted === true) throw new DOMException('aborted', 'AbortError');
            return { svg: `<svg><text>${source}</text></svg>` };
          },
        },
      })],
    });
    expect(calls).toEqual([]);
    const insertPos = view.state.doc.toString().indexOf('A-->B') + 'A-->B'.length;
    view.dispatch({ changes: { from: insertPos, insert: '\nB-->C' } });
    await sleep(80);
    expect(calls).toEqual(['flowchart TD\nA-->B\nB-->C']);
    expect(view.dom.querySelector('.mellow-mermaid-widget')?.innerHTML).toContain('B--&gt;C');
  });
});
