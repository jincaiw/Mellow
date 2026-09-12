import { createMockHost } from '../../host-api/src';
import { DEFAULT_FILE_TREE_OPTIONS, FileTreeHistory, FileTreeModel, FileTreeService, relativePath, shouldShowEntry, sortEntries, collectFolderPaths } from '../src/fileTree';
import type { FileTreeNode } from '../src/fileTree';

function host() {
  return createMockHost({
    files: new Map([
      ['/ws/a.md', 'A'],
      ['/ws/b.txt', 'B'],
      ['/ws/.secret.md', 'S'],
      ['/ws/folder/c.md', 'C'],
      ['/ws/folder/z.txt', 'Z'],
      ['/ws/folder/note10.md', '10'],
      ['/ws/folder/note2.md', '2'],
    ]),
  });
}

describe('FileTree filtering/sorting/navigation（PRD §14/§59/§60）', () => {
  test('hidden files, non-Markdown and glob include/exclude', () => {
    expect(shouldShowEntry({ path: '/ws/.secret.md', name: '.secret.md', isDirectory: false }, DEFAULT_FILE_TREE_OPTIONS)).toBe(false);
    expect(shouldShowEntry({ path: '/ws/b.txt', name: 'b.txt', isDirectory: false }, DEFAULT_FILE_TREE_OPTIONS)).toBe(false);
    expect(shouldShowEntry({ path: '/ws/b.txt', name: 'b.txt', isDirectory: false }, { ...DEFAULT_FILE_TREE_OPTIONS, showNonMarkdown: true })).toBe(true);
    expect(shouldShowEntry({ path: '/ws/a.md', name: 'a.md', isDirectory: false }, { ...DEFAULT_FILE_TREE_OPTIONS, includeGlobs: ['**/*.md'], excludeGlobs: ['a.md'] })).toBe(false);
  });

  test('sorting folder first + natural', () => {
    const sorted = sortEntries([
      { path: '/ws/file10.md', name: 'file10.md', isDirectory: false },
      { path: '/ws/dir', name: 'dir', isDirectory: true },
      { path: '/ws/file2.md', name: 'file2.md', isDirectory: false },
    ], DEFAULT_FILE_TREE_OPTIONS);
    expect(sorted.map((e) => e.name)).toEqual(['dir', 'file2.md', 'file10.md']);
  });

  test('readTree respects expanded folders and filters', async () => {
    const h = host();
    const svc = new FileTreeService(h.fs);
    const tree = await svc.readTree('/ws', new Set(['/ws/folder']));
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(tree.value.map((n) => n.name)).toEqual(['folder', 'a.md']);
    expect(tree.value[0].children?.map((n) => n.name)).toEqual(['c.md', 'note2.md', 'note10.md']);
  });

  test('keyboard navigation expands, collapses, moves and opens files', () => {
    const model = new FileTreeModel('/ws');
    model.select('/ws/folder');
    const flat = [
      { path: '/ws/folder', name: 'folder', kind: 'folder' as const, depth: 0, expanded: false, index: 0 },
      { path: '/ws/a.md', name: 'a.md', kind: 'file' as const, depth: 0, expanded: false, index: 1 },
    ];
    expect(model.navigate(flat, 'right').selected).toBe('/ws/folder');
    expect(model.expanded.has('/ws/folder')).toBe(true);
    expect(model.navigate(flat, 'down').selected).toBe('/ws/a.md');
    expect(model.navigate(flat, 'enter').open).toBe('/ws/a.md');
  });

  test('copy relative path', () => {
    expect(relativePath('/ws/folder', '/ws/a.md')).toBe('../a.md');
    expect(relativePath('/ws', '/ws/folder/c.md')).toBe('folder/c.md');
  });
});

describe('FileTreeService operations + undo', () => {
  test('new file/folder, rename, duplicate, move, trash and undo supported ops', async () => {
    const h = host();
    const history = new FileTreeHistory(h.fs);
    const svc = new FileTreeService(h.fs, history);

    expect((await svc.newFile('/ws', 'new.md')).ok).toBe(true);
    expect(await h.fs.exists('/ws/new.md')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(true);
    expect(await h.fs.exists('/ws/new.md')).toEqual({ ok: true, value: false });

    expect((await svc.newFolder('/ws', 'new-folder')).ok).toBe(true);
    expect(await h.fs.exists('/ws/new-folder')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(true);

    const renamed = await svc.rename('/ws/a.md', 'renamed.md');
    expect(renamed).toEqual({ ok: true, value: '/ws/renamed.md' });
    expect((await history.undo()).ok).toBe(true);
    expect(await h.fs.exists('/ws/a.md')).toEqual({ ok: true, value: true });

    expect((await svc.duplicate('/ws/a.md')).ok).toBe(true);
    expect(await h.fs.exists('/ws/a copy.md')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(true);

    expect((await svc.duplicate('/ws/folder')).ok).toBe(true);
    expect(await h.fs.exists('/ws/folder copy/c.md')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(true);

    expect((await svc.move('/ws/a.md', '/ws/folder')).ok).toBe(true);
    expect(await h.fs.exists('/ws/folder/a.md')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(true);

    expect((await svc.trash('/ws/a.md')).ok).toBe(true);
    expect(await h.fs.exists('/ws/a.md')).toEqual({ ok: true, value: false });
    const undoTrash = await history.undo();
    expect(undoTrash.ok).toBe(false);
  });
});

// ── V7-W3.5（G7-SIDE-04）展开全部 / 折叠全部 ─────────────────────────────
describe('V7-W3.5 expand all / collapse all', () => {
  test('collectFolderPaths 收集全部已加载文件夹（文件不收集）', () => {
    const nodes: FileTreeNode[] = [
      { path: '/ws/a', name: 'a', kind: 'folder', depth: 0, expanded: true, children: [
        { path: '/ws/a/b', name: 'b', kind: 'folder', depth: 1, expanded: true, children: [
          { path: '/ws/a/b/c.md', name: 'c.md', kind: 'file', depth: 2, expanded: false },
        ] },
      ] },
      { path: '/ws/d.md', name: 'd.md', kind: 'file', depth: 0, expanded: false },
    ];
    expect(collectFolderPaths(nodes)).toEqual(['/ws/a', '/ws/a/b']);
  });

  test('readTree(expandAll) 递归读取未知层级；collapseAllPaths 后回到全折叠', async () => {
    const h = host();
    const svc = new FileTreeService(h.fs);
    const model = new FileTreeModel('/ws');

    // 惰性读取：未展开时 folder 无 children（子层级尚未加载）
    const lazy = await svc.readTree('/ws', model.expanded);
    if (!lazy.ok) throw new Error('readTree failed');
    expect(lazy.value.find((n) => n.name === 'folder')?.children).toBeUndefined();

    // expandAll：递归读取 + 回填 expanded，使后续单个折叠可用
    const all = await svc.readTree('/ws', model.expanded, undefined, 0, true);
    if (!all.ok) throw new Error('readTree(expandAll) failed');
    model.expandAllPaths(all.value);
    expect(model.expanded.has('/ws/folder')).toBe(true);
    expect(all.value.find((n) => n.name === 'folder')?.children?.map((n) => n.name)).toEqual(['c.md', 'note2.md', 'note10.md']);

    model.collapseAllPaths();
    expect(model.expanded.size).toBe(0);
  });
});

// ── V7-W3.8（G7-SIDE-07）撤销语义对齐 Typora ────────────────────────────
describe('V7-W3.8 file operation undo semantics（Typora：仅最近一次可撤销）', () => {
  test('连续两次操作后只能撤销最近一次', async () => {
    const h = host();
    const history = new FileTreeHistory(h.fs);
    const svc = new FileTreeService(h.fs, history);

    expect((await svc.newFile('/ws', 'x.md')).ok).toBe(true);
    expect((await svc.newFile('/ws', 'y.md')).ok).toBe(true);
    expect(history.length).toBe(1);

    expect((await history.undo()).ok).toBe(true);
    expect(await h.fs.exists('/ws/y.md')).toEqual({ ok: true, value: false });
    // 第二次操作入栈时已清空第一次的历史 → x.md 保留
    expect(await h.fs.exists('/ws/x.md')).toEqual({ ok: true, value: true });
    expect((await history.undo()).ok).toBe(false);
  });

  test('trash 不可撤销（登记 D：Typora macOS 可撤销，Mellow 依赖系统回收站）', async () => {
    const h = host();
    const history = new FileTreeHistory(h.fs);
    const svc = new FileTreeService(h.fs, history);
    expect((await svc.trash('/ws/a.md')).ok).toBe(true);
    const r = await history.undo();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported');
  });
});
