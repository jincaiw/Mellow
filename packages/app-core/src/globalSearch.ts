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

/** P3.3 全局搜索键盘导航（G4-SIDE-02）：↑↓/Home/End 在扁平匹配序列上移动选中，Enter 返回跳转目标。
 * 索引按流式追加语义设计：结果增长/收缩时 navigate 内 clamp，渲染侧越界即不显示选中。 */
export class SearchResultsModel {
  selectedIndex = -1;

  reset(): void {
    this.selectedIndex = -1;
  }

  navigate(matches: SearchResult[], key: 'up' | 'down' | 'home' | 'end' | 'enter'): { selectedIndex: number; jump?: SearchResult } {
    if (matches.length === 0) {
      this.selectedIndex = -1;
      return { selectedIndex: -1 };
    }
    if (key === 'home') this.selectedIndex = 0;
    else if (key === 'end') this.selectedIndex = matches.length - 1;
    else if (key === 'down') this.selectedIndex = this.selectedIndex < 0 ? 0 : Math.min(matches.length - 1, this.selectedIndex + 1);
    else if (key === 'up') this.selectedIndex = this.selectedIndex < 0 ? 0 : Math.max(0, this.selectedIndex - 1);
    if (key === 'enter') {
      // 未选中时 Enter 落到第一条（与 QuickOpen 心智一致）
      const index = this.selectedIndex < 0 ? 0 : Math.min(matches.length - 1, this.selectedIndex);
      this.selectedIndex = index;
      return { selectedIndex: index, jump: matches[index] };
    }
    return { selectedIndex: this.selectedIndex };
  }
}
