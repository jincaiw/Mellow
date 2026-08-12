/** Quick Open（PRD T-0305）：fuzzy、recent、progressive scan、keyboard only。 */

import type { DirEntry, FileService, Result } from '../../host-api/src';
import { ok } from '../../host-api/src';
import { basename, relativePath } from './fileTree';

export type QuickOpenPlatform = 'mac' | 'win-linux';
export type QuickOpenAction = 'quick-open';

export interface QuickOpenKeyEvent {
  platform: QuickOpenPlatform;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface QuickOpenEntry {
  path: string;
  filename: string;
  relativePath: string;
  modifiedMs?: number;
  createdMs?: number;
}

export interface QuickOpenRankedEntry extends QuickOpenEntry {
  score: number;
  recentRank?: number;
}

export interface QuickOpenScanOptions {
  batchSize?: number;
  signal?: AbortSignal;
  onBatch?: (items: QuickOpenEntry[]) => void;
  includeHidden?: boolean;
}

function chars(value: string): string[] {
  return Array.from(value.normalize('NFC').toLocaleLowerCase());
}

export function fuzzyScore(candidate: string, query: string): number | null {
  const q = chars(query.trim());
  if (q.length === 0) return 1;
  const c = chars(candidate);
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < c.length && qi < q.length; i += 1) {
    if (c[i] === q[qi]) {
      streak += 1;
      score += 10 + streak * 3;
      if (i === 0 || ['/', '-', '_', ' ', '.'].includes(c[i - 1])) score += 6;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  if (qi !== q.length) return null;
  return score - Math.max(0, c.length - q.length) * 0.08;
}

export function rankQuickOpen(entries: QuickOpenEntry[], query: string, recentPaths: string[] = []): QuickOpenRankedEntry[] {
  const recent = new Map(recentPaths.map((path, index) => [path, index]));
  return entries
    .flatMap((entry): QuickOpenRankedEntry[] => {
      const filenameScore = fuzzyScore(entry.filename, query);
      const pathScore = fuzzyScore(entry.relativePath, query);
      const base = Math.max(filenameScore ?? -Infinity, pathScore ?? -Infinity);
      if (!Number.isFinite(base)) return [];
      const recentRank = recent.get(entry.path);
      const score = base + (recentRank === undefined ? 0 : 100 - recentRank * 4);
      return [{ ...entry, score, recentRank }];
    })
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function scanQuickOpen(root: string, fs: FileService, options: QuickOpenScanOptions = {}): Promise<Result<QuickOpenEntry[]>> {
  const batchSize = options.batchSize ?? 40;
  const queue = [root];
  const all: QuickOpenEntry[] = [];
  let batch: QuickOpenEntry[] = [];
  const flush = (): void => {
    if (batch.length === 0) return;
    options.onBatch?.(batch);
    batch = [];
  };
  while (queue.length > 0) {
    if (options.signal?.aborted) break;
    const dir = queue.shift()!;
    const r = await fs.readDir(dir);
    if (!r.ok) return r;
    const dirs: DirEntry[] = [];
    const files: DirEntry[] = [];
    for (const entry of r.value) {
      if (!options.includeHidden && entry.name.startsWith('.')) continue;
      if (entry.isDirectory) dirs.push(entry);
      else files.push(entry);
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const file of files) {
      const item = { path: file.path, filename: file.name || basename(file.path), relativePath: relativePath(root, file.path), modifiedMs: file.modifiedMs, createdMs: file.createdMs };
      all.push(item);
      batch.push(item);
      if (batch.length >= batchSize) flush();
    }
    for (const dirEntry of dirs) queue.push(dirEntry.path);
    flush();
    await Promise.resolve();
  }
  flush();
  return ok(all);
}

export class QuickOpenModel {
  selectedIndex = 0;
  navigate(items: QuickOpenEntry[], key: 'up' | 'down' | 'enter'): { selectedIndex: number; open?: string } {
    if (items.length === 0) {
      this.selectedIndex = 0;
      return { selectedIndex: 0 };
    }
    if (key === 'down') this.selectedIndex = Math.min(items.length - 1, this.selectedIndex + 1);
    if (key === 'up') this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    if (key === 'enter') return { selectedIndex: this.selectedIndex, open: items[this.selectedIndex]?.path };
    return { selectedIndex: this.selectedIndex };
  }
}

export function quickOpenShortcutAction(event: QuickOpenKeyEvent): QuickOpenAction | null {
  const key = event.key.toLowerCase();
  if (event.platform === 'mac') return event.metaKey && event.shiftKey && !event.ctrlKey && key === 'o' ? 'quick-open' : null;
  return event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'p' ? 'quick-open' : null;
}
