/**
 * Typora Articles/File List 风格文件列表（PRD §15 / §60）。
 * 纯 app-core 逻辑：不创建 `.mellow` workspace 文件。
 */

import type { DirEntry, FileService, Result } from '../../host-api/src';
import { ok } from '../../host-api/src';
import type { FileTreeOptions } from './fileTree';
import { basename, shouldShowEntry, sortEntries } from './fileTree';

export interface FileListOptions {
  recursive: boolean;
  includeSummary: boolean;
  summaryMaxChars: number;
}

export interface FileListItem {
  path: string;
  title: string;
  filename: string;
  modifiedMs?: number;
  createdMs?: number;
  summary?: string;
}

export const DEFAULT_FILE_LIST_OPTIONS: FileListOptions = {
  recursive: false,
  includeSummary: false,
  summaryMaxChars: 140,
};

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/[*_`~\[\]()]/g, '')
    .trim();
}

export function titleFromMarkdown(content: string, filename: string): string {
  const heading = content.split(/\r?\n/).map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim()).find(Boolean);
  if (heading) return stripMarkdown(heading);
  return filename.replace(/\.(md|markdown|mdown|mkd)$/i, '');
}

export function summaryFromMarkdown(content: string, maxChars: number): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .map(stripMarkdown)
    .filter((line) => line.length > 0 && !/^---+$/.test(line));
  const body = lines.join(' ');
  if (!body) return undefined;
  return body.length > maxChars ? `${body.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…` : body;
}

export class FileListModel {
  selectedPath: string | null = null;
  navigate(items: Array<{ path: string }>, key: 'up' | 'down' | 'enter'): { selected: string | null; open?: string } {
    if (items.length === 0) return { selected: null };
    const currentIndex = this.selectedPath === null ? -1 : items.findIndex((item) => item.path === this.selectedPath);
    if (key === 'down') this.selectedPath = items[Math.min(items.length - 1, currentIndex + 1)].path;
    if (key === 'up') this.selectedPath = items[Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)].path;
    if (key === 'enter' && this.selectedPath !== null) return { selected: this.selectedPath, open: this.selectedPath };
    return { selected: this.selectedPath };
  }
}

export class FileListService {
  constructor(private readonly fs: FileService) {}

  async readList(root: string, listOptions: FileListOptions, treeOptions: FileTreeOptions): Promise<Result<FileListItem[]>> {
    const entries = await this.collectFiles(root, listOptions.recursive, treeOptions);
    if (!entries.ok) return entries;
    const sorted = sortEntries(entries.value, { ...treeOptions, folderFirst: false }).filter((entry) => !entry.isDirectory);
    const items: FileListItem[] = [];
    for (const entry of sorted) {
      const text = await this.fs.readText(entry.path);
      if (!text.ok) continue;
      items.push({
        path: entry.path,
        filename: entry.name,
        title: titleFromMarkdown(text.value, entry.name),
        modifiedMs: entry.modifiedMs,
        createdMs: entry.createdMs,
        summary: listOptions.includeSummary ? summaryFromMarkdown(text.value, listOptions.summaryMaxChars) : undefined,
      });
    }
    return ok(items);
  }

  private async collectFiles(root: string, recursive: boolean, options: FileTreeOptions): Promise<Result<DirEntry[]>> {
    const r = await this.fs.readDir(root);
    if (!r.ok) return r;
    const out: DirEntry[] = [];
    for (const entry of r.value) {
      if (!shouldShowEntry(entry, options)) continue;
      if (entry.isDirectory) {
        if (recursive) {
          const child = await this.collectFiles(entry.path, true, options);
          if (!child.ok) return child;
          out.push(...child.value);
        }
      } else {
        out.push({ ...entry, name: entry.name || basename(entry.path) });
      }
    }
    return ok(out);
  }
}
