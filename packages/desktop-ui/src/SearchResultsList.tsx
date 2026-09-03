/**
 * SearchResultsList（PRD §17 全局搜索结果）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：文件分组 + 匹配行 + 上下文行。
 * P3.2 虚拟化：1 万结果扁平化为「组标题 + 匹配行」一维序列后窗口化渲染
 * （组标题保留 .search-group-title 的 sticky 语义——VirtualRows 用 padding spacer，不用 transform）。
 * P3.3 键盘导航：selectedIndex 高亮扁平匹配序列中的当前项，变化时滚动跟随。
 */
import { useEffect } from 'react';
import type { SearchGroup } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

type SearchRow = { kind: 'group'; group: SearchGroup } | { kind: 'match'; match: SearchGroup['matches'][number] };

export interface SearchResultsListProps {
  groups: SearchGroup[];
  onJump: (match: SearchGroup['matches'][number]) => void;
  /** 扁平匹配序列（组序 + 组内序）上的键盘选中索引；越界/为空不显示高亮。 */
  selectedIndex?: number;
  /** P3.5 右键菜单（App 层组装菜单项） */
  onContextMenu?: (e: React.MouseEvent, match: SearchGroup['matches'][number]) => void;
}

export function SearchResultsList({ groups, onJump, selectedIndex = -1, onContextMenu }: SearchResultsListProps) {
  const rows: SearchRow[] = [];
  for (const group of groups) {
    rows.push({ kind: 'group', group });
    for (const match of group.matches) rows.push({ kind: 'match', match });
  }
  // 键盘选中滚动跟随（selectedIndex 是扁平匹配索引，与 rows 的 match 子序列对齐）
  const selectedRow = selectedIndex >= 0 ? rows.filter((row) => row.kind === 'match')[selectedIndex] : undefined;
  useEffect(() => {
    if (selectedIndex < 0) return;
    document.querySelector('.search-results .search-match.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, groups]);
  const renderRow = (index: number) => {
    const row = rows[index];
    if (row.kind === 'group') {
      const group = row.group;
      return (
        <div className="search-group-title" title={group.path}>{group.relativePath} <span>{group.matches.length}</span></div>
      );
    }
    const match = row.match;
    return (
      <button type="button" className={`search-match${row === selectedRow ? ' selected' : ''}`} onClick={() => onJump(match)} onContextMenu={(e) => onContextMenu?.(e, match)}>
        <span className="search-location">{match.line}:{match.column ?? 1}</span>
        {match.before?.map((line, i) => <span key={`b-${i}`} className="search-context">{line}</span>)}
        <span className="search-snippet">{match.snippet}</span>
        {match.after?.map((line, i) => <span key={`a-${i}`} className="search-context">{line}</span>)}
      </button>
    );
  };
  return <VirtualRows count={rows.length} estimateRowHeight={48} overscan={10} resetKey={rows.length} renderItem={renderRow} />;
}
