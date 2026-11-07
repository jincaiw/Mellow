/**
 * SearchResultsList（PRD §17 全局搜索结果）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：文件分组 + 匹配行 + 上下文行。
 * P3.2 虚拟化：1 万结果扁平化为「组标题 + 匹配行」一维序列后窗口化渲染
 * （组标题保留 .search-group-title 的 sticky 语义——VirtualRows 用 padding spacer，不用 transform）。
 * P3.3 键盘导航：selectedIndex 高亮扁平匹配序列中的当前项，变化时滚动跟随。
 * G7-SIDE-11（2026-11-08）：按文件分组的折叠/展开 —— Typora 一手证据
 * `window/frame.js` `.ty-search-item-collapse-icon` click 切换 `.ty-search-item-collapse` /
 * `.ty-search-item-expand`（每个结果文件组独立）。折叠只隐藏匹配行，**组标题保持可见**
 * （sticky 语义不受影响，虚拟化计数随之收缩）。
 */
import { useEffect } from 'react';
import type { SearchGroup } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

type SearchRow = { kind: 'group'; group: SearchGroup; collapsed: boolean } | { kind: 'match'; match: SearchGroup['matches'][number] };

export interface SearchResultsListProps {
  groups: SearchGroup[];
  onJump: (match: SearchGroup['matches'][number]) => void;
  /** 扁平匹配序列（组序 + 组内序）上的键盘选中索引；越界/为空不显示高亮。 */
  selectedIndex?: number;
  /** P3.5 右键菜单（App 层组装菜单项） */
  onContextMenu?: (e: React.MouseEvent, match: SearchGroup['matches'][number]) => void;
  /** G7-SIDE-11：折叠的组路径集（真源在 App 层，键盘可见序列与渲染同源）。 */
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (path: string) => void;
  /** i18n（与 SidebarFooter 同款：注入 t 函数，desktop-ui 不直接依赖 i18n 包）。 */
  t?: (key: string) => string;
}

export function SearchResultsList({ groups, onJump, selectedIndex = -1, onContextMenu, collapsedGroups, onToggleGroup, t }: SearchResultsListProps) {
  const rows: SearchRow[] = [];
  for (const group of groups) {
    const collapsed = collapsedGroups?.has(group.path) === true;
    rows.push({ kind: 'group', group, collapsed });
    // 折叠 = 只隐藏匹配行（组标题仍在，Typora collapse 同样保留文件行）
    if (!collapsed) for (const match of group.matches) rows.push({ kind: 'match', match });
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
        <div className={`search-group-title${row.collapsed ? ' collapsed' : ''}`} title={group.path}>
          {onToggleGroup && (
            <span
              className="search-group-collapse"
              role="button"
              tabIndex={0}
              aria-expanded={!row.collapsed}
              aria-label={t ? t(row.collapsed ? 'search.expandGroup' : 'search.collapseGroup') : undefined}
              onClick={(e) => { e.stopPropagation(); onToggleGroup(group.path); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleGroup(group.path); } }}
            >{row.collapsed ? '▸' : '▾'}</span>
          )}
          {group.relativePath} <span>{group.matches.length}</span>
        </div>
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
