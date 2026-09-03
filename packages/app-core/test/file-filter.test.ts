/**
 * P3.6 常驻 filter 纯函数单测（G4-SIDE-06：filterFileTree / filterFileList）。
 * 大小写不敏感 includes；空 query 原样；祖先链保留且 expanded 强制 true。
 */
import { filterFileTree, type FileTreeNode } from '../src/fileTree';
import { filterFileList, type FileListItem } from '../src/fileList';

function folder(path: string, name: string, expanded: boolean, children?: FileTreeNode[]): FileTreeNode {
  return { path, name, kind: 'folder', depth: 0, expanded, children };
}
function file(path: string, name: string): FileTreeNode {
  return { path, name, kind: 'file', depth: 0, expanded: false };
}

describe('filterFileTree（P3.6）', () => {
  const tree: FileTreeNode[] = [
    folder('/r/docs', 'docs', false, [
      file('/r/docs/notes.md', 'notes.md'),
      file('/r/docs/todo.md', 'todo.md'),
    ]),
    file('/r/readme.md', 'readme.md'),
    folder('/r/assets', 'assets', true, [
      file('/r/assets/logo.png', 'logo.png'),
    ]),
  ];

  test('空 query 原样返回（内容与数量一致）', () => {
    const out = filterFileTree(tree, '');
    expect(out).toHaveLength(tree.length);
    expect(out.map((n) => n.path)).toEqual(tree.map((n) => n.path));
    expect(filterFileTree(tree, '   ')).toHaveLength(tree.length);
  });

  test('文件名大小写不敏感匹配', () => {
    const out = filterFileTree(tree, 'README');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('readme.md');
  });

  test('匹配的文件夹保留整棵子树（保持原 expanded）', () => {
    const out = filterFileTree(tree, 'assets');
    expect(out).toHaveLength(1);
    expect(out[0].expanded).toBe(true); // 原 expanded=true 保留
    expect(out[0].children).toHaveLength(1);
  });

  test('文件夹不匹配但子孙匹配：保留祖先链且 expanded 强制 true', () => {
    const out = filterFileTree(tree, 'todo');
    expect(out).toHaveLength(1);
    const docs = out[0];
    expect(docs.name).toBe('docs');
    expect(docs.expanded).toBe(true);
    expect(docs.children?.map((c) => c.name)).toEqual(['todo.md']);
  });

  test('无匹配返回空数组', () => {
    expect(filterFileTree(tree, 'zzz-nonexistent')).toEqual([]);
  });

  test('原始节点不被修改（强制展开只作用于副本）', () => {
    filterFileTree(tree, 'todo');
    expect(tree[0].expanded).toBe(false);
  });
});

describe('filterFileList（P3.6）', () => {
  const items: FileListItem[] = [
    { path: '/r/notes.md', title: '会议记录', filename: 'notes.md' },
    { path: '/r/TODO.md', title: '待办', filename: 'TODO.md' },
    { path: '/r/plan.md', title: 'Project Plan', filename: 'plan.md' },
  ];

  test('空 query 原样返回', () => {
    expect(filterFileList(items, '')).toHaveLength(3);
  });

  test('title 匹配（大小写不敏感）', () => {
    expect(filterFileList(items, '会议').map((i) => i.path)).toEqual(['/r/notes.md']);
    expect(filterFileList(items, 'project plan').map((i) => i.path)).toEqual(['/r/plan.md']);
  });

  test('filename 匹配', () => {
    expect(filterFileList(items, 'todo.md').map((i) => i.path)).toEqual(['/r/TODO.md']);
  });

  test('无匹配返回空数组', () => {
    expect(filterFileList(items, 'zzz')).toEqual([]);
  });
});
