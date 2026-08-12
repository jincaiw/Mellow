import type { FileService } from '../../host-api/src';
import { err, ok } from '../../host-api/src';
import { DEFAULT_FILE_TREE_OPTIONS } from '../src/fileTree';
import { FileListModel, FileListService, DEFAULT_FILE_LIST_OPTIONS } from '../src/fileList';

function fs(files: Record<string, { content: string; modifiedMs?: number; createdMs?: number }>): FileService {
  return {
    open: async () => err({ code: 'canceled', message: 'canceled' }),
    openPath: async () => err({ code: 'not-implemented', message: 'unused' }),
    save: async () => err({ code: 'not-implemented', message: 'unused' }),
    readText: async (path) => files[path] ? ok(files[path].content) : err({ code: 'not-found', message: 'missing', path }),
    writeText: async () => err({ code: 'not-implemented', message: 'unused' }),
    readDir: async (path) => {
      const entries = new Map<string, { path: string; name: string; isDirectory: boolean; modifiedMs?: number; createdMs?: number }>();
      const prefix = path.replace(/\/$/, '');
      for (const [filePath, meta] of Object.entries(files)) {
        if (!filePath.startsWith(`${prefix}/`)) continue;
        const rest = filePath.slice(prefix.length + 1);
        if (rest.includes('/')) {
          const name = rest.split('/')[0];
          entries.set(`${prefix}/${name}`, { path: `${prefix}/${name}`, name, isDirectory: true });
        } else {
          entries.set(filePath, { path: filePath, name: rest, isDirectory: false, modifiedMs: meta.modifiedMs, createdMs: meta.createdMs });
        }
      }
      return ok([...entries.values()]);
    },
    exists: async () => ok(false),
    rename: async () => ok(undefined),
    move: async () => ok(undefined),
    trash: async () => ok(undefined),
    delete: async () => ok(undefined),
    remove: async () => ok(undefined),
    copyFile: async () => ok(undefined),
    mkdir: async () => ok(undefined),
    writeBinary: async () => ok(undefined),
    readBinary: async () => ok(new ArrayBuffer(0)),
    download: async (_url, targetPath) => ok({ path: targetPath, bytes: 0 }),
  };
}

describe('FileListService（Typora Articles/File List）', () => {
  test('current folder lists title, filename, modified and optional summary', async () => {
    const svc = new FileListService(fs({
      '/ws/a.md': { content: '# Alpha\n\nFirst summary line.\nSecond.', modifiedMs: 200 },
      '/ws/nested/b.md': { content: '# Beta\n\nNested summary.', modifiedMs: 100 },
      '/ws/raw.txt': { content: 'Plain text', modifiedMs: 50 },
    }));

    const r = await svc.readList('/ws', { ...DEFAULT_FILE_LIST_OPTIONS, recursive: false, includeSummary: true }, DEFAULT_FILE_TREE_OPTIONS);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((item) => ({ title: item.title, filename: item.filename, modifiedMs: item.modifiedMs, summary: item.summary }))).toEqual([
      { title: 'Alpha', filename: 'a.md', modifiedMs: 200, summary: 'First summary line. Second.' },
    ]);
  });

  test('recursive mode includes nested Markdown and sorting by modified desc', async () => {
    const svc = new FileListService(fs({
      '/ws/a.md': { content: '# Alpha', modifiedMs: 200 },
      '/ws/nested/b.md': { content: '# Beta', modifiedMs: 500 },
      '/ws/nested/c.md': { content: 'No heading', modifiedMs: 100 },
    }));

    const r = await svc.readList('/ws', { ...DEFAULT_FILE_LIST_OPTIONS, recursive: true }, { ...DEFAULT_FILE_TREE_OPTIONS, sortBy: 'modified', sortAsc: false });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((item) => item.path)).toEqual(['/ws/nested/b.md', '/ws/a.md', '/ws/nested/c.md']);
    expect(r.value[2].title).toBe('c');
  });
});

describe('FileListModel keyboard navigation', () => {
  test('ArrowUp/ArrowDown moves and Enter opens selected item', () => {
    const model = new FileListModel();
    const items = [
      { path: '/ws/a.md', title: 'A', filename: 'a.md' },
      { path: '/ws/b.md', title: 'B', filename: 'b.md' },
    ];

    expect(model.navigate(items, 'down').selected).toBe('/ws/a.md');
    expect(model.navigate(items, 'down').selected).toBe('/ws/b.md');
    expect(model.navigate(items, 'up').selected).toBe('/ws/a.md');
    expect(model.navigate(items, 'enter')).toEqual({ selected: '/ws/a.md', open: '/ws/a.md' });
  });
});
