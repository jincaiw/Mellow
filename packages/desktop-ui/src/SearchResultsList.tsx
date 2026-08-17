/**
 * SearchResultsList（PRD §17 全局搜索结果）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：文件分组 + 匹配行 + 上下文行。
 */
import type { SearchGroup } from '../../app-core/src';

export interface SearchResultsListProps {
  groups: SearchGroup[];
  onJump: (match: SearchGroup['matches'][number]) => void;
}

export function SearchResultsList({ groups, onJump }: SearchResultsListProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.path} className="search-group">
          <div className="search-group-title" title={group.path}>{group.relativePath} <span>{group.matches.length}</span></div>
          {group.matches.map((match) => (
            <button key={`${match.path}:${match.line}:${match.column}:${match.snippet}`} type="button" className="search-match" onClick={() => onJump(match)}>
              <span className="search-location">{match.line}:{match.column ?? 1}</span>
              {match.before?.map((line, index) => <span key={`b-${index}`} className="search-context">{line}</span>)}
              <span className="search-snippet">{match.snippet}</span>
              {match.after?.map((line, index) => <span key={`a-${index}`} className="search-context">{line}</span>)}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}