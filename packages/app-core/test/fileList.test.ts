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

  test('读不到内容的文件仍然列出（文件名标题、无摘要），不得从列表里无声消失', async () => {
    // 场景：V1 不支持的编码（GB18030 等，PRD §105 P1）在严格解码后读失败。
    // 树视图仍能看到该文件；若列表视图直接跳过，用户只会看到「少了一个文件」。
    const base = fs({
      '/ws/ok.md': { content: '# Ok\n\nBody.', modifiedMs: 2 },
      '/ws/bad.md': { content: '', modifiedMs: 1 },
    });
    const failing: FileService = {
      ...base,
      readText: async (path) => path === '/ws/bad.md'
        ? err({ code: 'io', message: '文件不是有效的 UTF-8 编码' })
        : base.readText(path),
    };

    const r = await new FileListService(failing).readList(
      '/ws',
      { ...DEFAULT_FILE_LIST_OPTIONS, recursive: false, includeSummary: true },
      DEFAULT_FILE_TREE_OPTIONS,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bad = r.value.find((item) => item.filename === 'bad.md');
    expect(bad).toBeDefined();
    expect(bad?.title).toBe('bad'); // 文件名去掉 .md，与无标题文件的既有回退一致
    expect(bad?.summary).toBeUndefined();
    expect(r.value.find((item) => item.filename === 'ok.md')?.title).toBe('Ok');
  });
});

describe('FileListModel keyboard navigation', () => {
  test('连续导航全列表的路径读取次数随条目数线性增长', () => {
    const model = new FileListModel();
    let pathReads = 0;
    const items = Array.from({ length: 1000 }, (_, i) => ({
      get path() { pathReads += 1; return `/ws/${i}.md`; },
    }));
    for (let i = 0; i < items.length; i++) model.navigate(items, 'down');
    expect(model.selectedPath).toBe('/ws/999.md');
    // 用访问次数锁复杂度，不依赖机器负载或计时精度。
    expect(pathReads).toBeLessThanOrEqual(items.length * 4);
  });

  test('同一列表原地重排或删除后，按当前路径重新定位', () => {
    const model = new FileListModel();
    const items = ['a', 'b', 'c', 'd'].map((name) => ({ path: `/ws/${name}.md` }));
    model.navigate(items, 'down');
    model.navigate(items, 'down'); // b，原下标 1
    items.reverse(); // d c b a
    expect(model.navigate(items, 'down').selected).toBe('/ws/a.md');
    items.pop(); // 删除当前选择；既有语义回到第一项
    expect(model.navigate(items, 'down').selected).toBe('/ws/d.md');
  });

  test('过滤列表、外部选择与 Home/End 后继续移动不使用过期位置', () => {
    const model = new FileListModel();
    const items = ['a', 'b', 'c', 'd'].map((name) => ({ path: `/ws/${name}.md` }));
    model.navigate(items, 'end');
    const filtered = items.slice(2);
    expect(model.navigate(filtered, 'up').selected).toBe('/ws/c.md');
    model.selectedPath = '/ws/a.md';
    expect(model.navigate(items, 'down').selected).toBe('/ws/b.md');
    model.navigate(items, 'home');
    expect(model.navigate(items, 'down').selected).toBe('/ws/b.md');
    model.selectedPath = null;
    expect(model.navigate(items, 'up').selected).toBe('/ws/a.md');
  });

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

  test('Home/End 跳到首/尾项（Typora bindFileViewKeyboard 树/列表共用一手证据）', () => {
    const model = new FileListModel();
    const items = [
      { path: '/ws/a.md', title: 'A', filename: 'a.md' },
      { path: '/ws/b.md', title: 'B', filename: 'b.md' },
      { path: '/ws/c.md', title: 'C', filename: 'c.md' },
    ];
    model.selectedPath = '/ws/b.md';
    expect(model.navigate(items, 'home').selected).toBe('/ws/a.md');
    expect(model.navigate(items, 'end').selected).toBe('/ws/c.md');
    expect(model.navigate([], 'end')).toEqual({ selected: null });
  });
});
