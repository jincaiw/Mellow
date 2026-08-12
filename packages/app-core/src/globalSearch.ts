/** Global Search 纯逻辑：查询选项、匹配与分组（PRD §17）。 */

import type { SearchRequest, SearchResult } from '../../host-api/src';
import { relativePath } from './fileTree';

export const DEFAULT_SEARCH_EXCLUDES = ['.git', 'node_modules', 'dist', 'build', 'target', 'vendor'];

export interface SearchLineOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchGroup {
  path: string;
  relativePath: string;
  matches: SearchResult[];
}

export function normalizeSearchRequest(input: Partial<SearchRequest> & { root: string; query: string }): SearchRequest {
  return {
    root: input.root,
    query: input.query,
    caseSensitive: input.caseSensitive ?? false,
    wholeWord: input.wholeWord ?? false,
    regex: input.regex ?? false,
    include: input.include ?? [],
    exclude: [...DEFAULT_SEARCH_EXCLUDES, ...(input.exclude ?? [])],
    context: input.context ?? 1,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchRegex(options: SearchLineOptions): RegExp | null {
  if (!options.query) return null;
  try {
    const source = options.regex ? options.query : escapeRegex(options.query);
    const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source;
    return new RegExp(wrapped, options.caseSensitive ? 'u' : 'iu');
  } catch {
    return null;
  }
}

export function matchSearchLine(line: string, options: SearchLineOptions): { column: number; match: string } | null {
  const re = buildSearchRegex(options);
  if (!re) return null;
  const m = re.exec(line);
  if (!m) return null;
  return { column: Array.from(line.slice(0, m.index)).length + 1, match: m[0] };
}

export function groupSearchResults(results: SearchResult[], root: string): SearchGroup[] {
  const groups = new Map<string, SearchGroup>();
  for (const result of results) {
    const group = groups.get(result.path) ?? { path: result.path, relativePath: relativePath(root, result.path), matches: [] };
    group.matches.push(result);
    groups.set(result.path, group);
  }
  return [...groups.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
}

export function globalSearchShortcutAction(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): 'global-search' | null {
  return event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' ? 'global-search' : null;
}
