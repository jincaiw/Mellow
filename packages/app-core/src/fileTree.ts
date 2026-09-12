/**
 * File Tree 纯逻辑与文件操作编排（PRD §14 / §59 / §60）。
 * 不创建 `.mellow` workspace 文件；状态由宿主 UI 内存/localStorage 管理。
 */

import type { DirEntry, FileService, Result } from '../../host-api/src';
import { err, ok } from '../../host-api/src';

export type FileTreeSortBy = 'name' | 'natural' | 'modified' | 'created';
export type FileTreeNodeKind = 'file' | 'folder';
export type FileTreeUndoOp =
  | { kind: 'trash'; path: string }
  | { kind: 'mkdir'; path: string }
  | { kind: 'create-file'; path: string }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'duplicate'; to: string }
  | { kind: 'move'; from: string; to: string };

export interface FileTreeOptions {
  showHidden: boolean;
  showNonMarkdown: boolean;
  includeGlobs: string[];
  excludeGlobs: string[];
  sortBy: FileTreeSortBy;
  sortAsc: boolean;
  folderFirst: boolean;
}

export interface FileTreeNode {
  path: string;
  name: string;
  kind: FileTreeNodeKind;
  depth: number;
  expanded: boolean;
  children?: FileTreeNode[];
}

export interface FlatFileTreeNode extends FileTreeNode {
  index: number;
}

export const DEFAULT_FILE_TREE_OPTIONS: FileTreeOptions = {
  showHidden: false,
  showNonMarkdown: false,
  includeGlobs: [],
  excludeGlobs: [],
  sortBy: 'natural',
  sortAsc: true,
  folderFirst: true,
};

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '') || '/';
}

function joinPath(dir: string, name: string): string {
  return `${normalize(dir)}/${name.replace(/^\/+/, '')}`.replace(/\/+/g, '/');
}

export function basename(path: string): string {
  return normalize(path).split('/').pop() ?? path;
}

export function dirname(path: string): string {
  const n = normalize(path);
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

export function relativePath(fromDir: string, target: string): string {
  const from = normalize(fromDir).split('/').filter(Boolean);
  const to = normalize(target).split('/').filter(Boolean);
  while (from.length > 0 && to.length > 0 && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => '..'), ...to].join('/') || basename(target);
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§§DOUBLE_STAR§§').replace(/\*/g, '[^/]*').replace(/§§DOUBLE_STAR§§/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAny(path: string, globs: string[]): boolean {
  if (globs.length === 0) return false;
  const p = normalize(path).replace(/^\//, '');
  return globs.some((g) => globToRegExp(g.replace(/^\//, '')).test(p) || globToRegExp(`**/${g.replace(/^\//, '')}`).test(p));
}

export function shouldShowEntry(entry: DirEntry, options: FileTreeOptions): boolean {
  if (!options.showHidden && entry.name.startsWith('.')) return false;
  if (!options.showNonMarkdown && !entry.isDirectory && !isMarkdown(entry.name)) return false;
  if (options.includeGlobs.length > 0 && !entry.isDirectory && !matchesAny(entry.path, options.includeGlobs)) return false;
  if (matchesAny(entry.path, options.excludeGlobs) || matchesAny(entry.name, options.excludeGlobs)) return false;
  return true;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortEntries(entries: DirEntry[], options: FileTreeOptions): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (options.folderFirst && a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    let cmp: number;
    if (options.sortBy === 'modified') {
      cmp = (a.modifiedMs ?? 0) - (b.modifiedMs ?? 0);
    } else if (options.sortBy === 'created') {
      cmp = (a.createdMs ?? 0) - (b.createdMs ?? 0);
    } else {
      cmp = options.sortBy === 'natural' ? naturalCompare(a.name, b.name) : a.name.localeCompare(b.name);
    }
    if (cmp === 0) cmp = naturalCompare(a.name, b.name);
    return options.sortAsc ? cmp : -cmp;
  });
}

/**
 * P3.6（G4-SIDE-06）常驻 filter：按名称过滤 File Tree（大小写不敏感 includes）。
 * - 空 query 原样返回（浅拷贝，不改动引用语义）。
 * - 匹配的文件保留；匹配的文件夹保留整棵子树（保持原 expanded）。
 * - 文件夹自身不匹配但子孙匹配 → 保留祖先链且 expanded 强制 true（过滤视图下展示匹配子树）。
 */
export function filterFileTree(nodes: readonly FileTreeNode[], query: string): FileTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...nodes];
  const walk = (list: readonly FileTreeNode[]): FileTreeNode[] => {
    const out: FileTreeNode[] = [];
    for (const node of list) {
      const selfMatch = node.name.toLowerCase().includes(q);
      if (node.kind === 'folder') {
        if (selfMatch) {
          out.push(node);
        } else if (node.children !== undefined) {
          const children = walk(node.children);
          if (children.length > 0) out.push({ ...node, expanded: true, children });
        }
      } else if (selfMatch) {
        out.push(node);
      }
    }
    return out;
  };
  return walk(nodes);
}

/**
 * V7-W3.5：收集树中全部文件夹路径（「展开全部 / 折叠全部」用）。
 * 只收集**当前已加载**的子树 —— File Tree 为惰性读取（`readTree` 仅下钻展开项），
 * 未展开文件夹的子节点不在 `nodes` 中，故「展开全部」必须靠 `readTree` 的
 * `expandAll` 递归读取，本函数用于读取后回填 `model.expanded`，使后续单个折叠可用。
 */
export function collectFolderPaths(nodes: readonly FileTreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    out.push(node.path);
    if (node.children !== undefined) collectFolderPaths(node.children, out);
  }
  return out;
}

export class FileTreeModel {
  expanded = new Set<string>();
  selectedPath: string | null = null;

  /**
   * V7-W3.5：展开全部 / 折叠全部（G7-SIDE-04）。
   * 惰性读取使得「展开全部」无法仅靠 expanded 集合一次完成 —— 未知层级的子孙尚未加载。
   * 故由宿主置 `expandAll` 标记 → `FileTreeService.readTree` 递归读取 →
   * 用 `collectFolderPaths` 回填本集合，之后用户可逐个折叠。
   */
  expandAllPaths(nodes: readonly FileTreeNode[]): void {
    for (const path of collectFolderPaths(nodes)) this.expanded.add(path);
  }

  collapseAllPaths(): void {
    this.expanded.clear();
  }

  constructor(readonly root: string, readonly options: FileTreeOptions = DEFAULT_FILE_TREE_OPTIONS) {}

  toggle(path: string): void {
    const p = normalize(path);
    if (this.expanded.has(p)) this.expanded.delete(p);
    else this.expanded.add(p);
  }

  expand(path: string): void { this.expanded.add(normalize(path)); }
  collapse(path: string): void { this.expanded.delete(normalize(path)); }
  select(path: string): void { this.selectedPath = normalize(path); }

  flatten(nodes: FileTreeNode[]): FlatFileTreeNode[] {
    const out: FlatFileTreeNode[] = [];
    const walk = (nodeList: FileTreeNode[]): void => {
      for (const node of nodeList) {
        out.push({ ...node, index: out.length });
        if (node.kind === 'folder' && node.expanded && node.children) walk(node.children);
      }
    };
    walk(nodes);
    return out;
  }

  navigate(flat: FlatFileTreeNode[], key: 'up' | 'down' | 'left' | 'right' | 'enter'): { open?: string; selected: string | null } {
    if (flat.length === 0) return { selected: null };
    const index = Math.max(0, flat.findIndex((n) => n.path === this.selectedPath));
    const current = flat[index] ?? flat[0];
    if (key === 'up') this.selectedPath = flat[Math.max(0, index - 1)].path;
    if (key === 'down') this.selectedPath = flat[Math.min(flat.length - 1, index + 1)].path;
    if (key === 'left') {
      if (current.kind === 'folder' && current.expanded) this.collapse(current.path);
      else this.selectedPath = dirname(current.path);
    }
    if (key === 'right' && current.kind === 'folder') this.expand(current.path);
    if (key === 'enter' && current.kind === 'file') return { open: current.path, selected: current.path };
    return { selected: this.selectedPath };
  }
}

/**
 * V7-W3.8：撤销栈**只保留最近一次**操作。
 *
 * Typora 官方 File Management 原文：「only the last **one** file operation in
 * Typora is undoable」—— 即新建后立即重命名，只能撤销重命名，不能继续撤销新建。
 * 此前本类为无界栈（`push` 追加），语义比 Typora 更宽松，属「不一致」而非「缺失」，
 * 按 §7.3 合同「文件操作撤销 | 语义与 Typora 对齐并显式记录差异」改为深度 1。
 *
 * 显式登记的差异（D）：
 * - **trash 撤销**：Typora 在 **macOS** 可撤销删除（Windows/Linux 不可 —— 官方原文
 *   「on Windows/Linux, delete file is not undoable」）；Mellow 当前**全平台不可撤销**，
 *   因系统回收站恢复需平台原生 API（macOS `NSWorkspace` recycle / Windows
 *   `SHFileOperation`），`FileService` 契约未暴露。差异保留至 W6 三平台 Adapter 评估。
 */
export class FileTreeHistory {
  private stack: FileTreeUndoOp[] = [];
  constructor(private readonly fs: FileService) {}
  get length(): number { return this.stack.length; }
  /** 深度 1：新操作入栈即清空历史（Typora「仅最近一次可撤销」） */
  push(op: FileTreeUndoOp): void { this.stack = [op]; }
  async undo(): Promise<Result<string>> {
    const op = this.stack.pop();
    if (!op) return err({ code: 'invalid-argument', message: '没有可撤销的文件树操作' });
    switch (op.kind) {
      case 'mkdir':
      case 'create-file': {
        const r = await this.fs.remove(op.path);
        return r.ok ? ok('已撤销创建') : r;
      }
      case 'duplicate': {
        const r = await this.fs.remove(op.to);
        return r.ok ? ok('已撤销复制') : r;
      }
      case 'rename':
      case 'move': {
        const r = await this.fs.move(op.to, op.from);
        return r.ok ? ok('已撤销移动/重命名') : r;
      }
      case 'trash':
        // V7-W3.8（登记 D）：Typora 在 macOS 可撤销删除，Mellow 全平台依赖系统回收站手动恢复。
        return err({ code: 'unsupported', message: '删除撤销依赖平台回收站 API，请从系统回收站手动恢复（Typora 在 Windows/Linux 同样不可撤销）' });
    }
  }
}

export class FileTreeService {
  constructor(private readonly fs: FileService, private readonly history = new FileTreeHistory(fs)) {}
  get undoHistory(): FileTreeHistory { return this.history; }

  /**
   * @param expandAll V7-W3.5：true 时递归读取全部层级（「展开全部」）——
   *   平时的惰性读取只下钻 `expanded` 中的项，未知层级读不到，无法一次展开到底。
   */
  async readTree(root: string, expanded: Set<string>, options: FileTreeOptions = DEFAULT_FILE_TREE_OPTIONS, depth = 0, expandAll = false): Promise<Result<FileTreeNode[]>> {
    const r = await this.fs.readDir(root);
    if (!r.ok) return r;
    const entries = sortEntries(r.value.filter((e) => shouldShowEntry(e, options)), options);
    const nodes: FileTreeNode[] = [];
    for (const entry of entries) {
      const path = normalize(entry.path);
      const isExpanded = expandAll || expanded.has(path);
      const node: FileTreeNode = { path, name: entry.name, kind: entry.isDirectory ? 'folder' : 'file', depth, expanded: isExpanded };
      if (entry.isDirectory && isExpanded) {
        const child = await this.readTree(path, expanded, options, depth + 1, expandAll);
        if (!child.ok) return child;
        node.children = child.value;
      }
      nodes.push(node);
    }
    return ok(nodes);
  }

  async newFile(dir: string, name: string): Promise<Result<string>> {
    const path = joinPath(dir, name);
    const exists = await this.fs.exists(path);
    if (exists.ok && exists.value) return err({ code: 'conflict', message: '文件已存在', path });
    const r = await this.fs.writeText(path, '');
    if (!r.ok) return r;
    this.history.push({ kind: 'create-file', path });
    return ok(path);
  }

  async newFolder(dir: string, name: string): Promise<Result<string>> {
    const path = joinPath(dir, name);
    const exists = await this.fs.exists(path);
    if (exists.ok && exists.value) return err({ code: 'conflict', message: '文件夹已存在', path });
    const r = await this.fs.mkdir(path);
    if (!r.ok) return r;
    this.history.push({ kind: 'mkdir', path });
    return ok(path);
  }

  async rename(path: string, newName: string): Promise<Result<string>> {
    const to = joinPath(dirname(path), newName);
    const r = await this.fs.move(path, to);
    if (!r.ok) return r;
    this.history.push({ kind: 'rename', from: path, to });
    return ok(to);
  }

  async duplicate(path: string, newName?: string): Promise<Result<string>> {
    const to = joinPath(dirname(path), newName ?? duplicateName(basename(path)));
    const r = await this.copyRecursive(path, to);
    if (!r.ok) return r;
    this.history.push({ kind: 'duplicate', to });
    return ok(to);
  }

  private async copyRecursive(from: string, to: string): Promise<Result<void>> {
    const dir = await this.fs.readDir(from);
    if (!dir.ok) {
      return this.fs.copyFile(from, to);
    }
    const mk = await this.fs.mkdir(to);
    if (!mk.ok) return mk;
    for (const entry of dir.value) {
      const child = await this.copyRecursive(entry.path, joinPath(to, entry.name));
      if (!child.ok) return child;
    }
    return ok(undefined);
  }

  async move(path: string, targetDir: string): Promise<Result<string>> {
    const to = joinPath(targetDir, basename(path));
    const r = await this.fs.move(path, to);
    if (!r.ok) return r;
    this.history.push({ kind: 'move', from: path, to });
    return ok(to);
  }

  async trash(path: string): Promise<Result<void>> {
    const r = await this.fs.trash(path);
    if (!r.ok) return r;
    this.history.push({ kind: 'trash', path });
    return ok(undefined);
  }
}

function duplicateName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name} copy`;
  return `${name.slice(0, dot)} copy${name.slice(dot)}`;
}
