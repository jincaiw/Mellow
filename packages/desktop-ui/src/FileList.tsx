/**
 * FileList（PRD §15 / desktop-ui-design-spec §6 文件列表）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：标题 + 文件名/修改时间 + 摘要（可选）。
 */
import type { FileListItem } from '../../app-core/src';

export interface FileListProps {
  items: FileListItem[];
  selectedPath: string | null;
  currentPath: string | null;
  includeSummary: boolean;
  formatFileTime: (ms?: number) => string;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
}

export function FileList({ items, selectedPath, currentPath, includeSummary, formatFileTime, onSelect, onOpen }: FileListProps) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          className={`file-list-item ${selectedPath === item.path ? 'selected' : ''} ${currentPath === item.path ? 'current' : ''}`}
          title={item.path}
          onClick={() => {
            onSelect(item.path);
            onOpen(item.path);
          }}
          onDoubleClick={() => onOpen(item.path)}
        >
          <span className="file-list-title">{item.title}</span>
          <span className="file-list-meta">{item.filename}{formatFileTime(item.modifiedMs) ? ` · ${formatFileTime(item.modifiedMs)}` : ''}</span>
          {includeSummary && item.summary && <span className="file-list-summary">{item.summary}</span>}
        </button>
      ))}
    </>
  );
}
