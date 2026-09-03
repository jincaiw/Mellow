/**
 * FileList（PRD §15 / desktop-ui-design-spec §6 文件列表）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：标题 + 文件名/修改时间 + 摘要（可选）。
 * P3.2 虚拟化：10k 文件经 VirtualRows 窗口化渲染（Exit Gate：不阻塞）。
 */
import { useEffect } from 'react';
import type { FileListItem } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

export interface FileListProps {
  items: FileListItem[];
  selectedPath: string | null;
  currentPath: string | null;
  includeSummary: boolean;
  formatFileTime: (ms?: number) => string;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  /** P3.5 右键菜单（App 层组装菜单项） */
  onContextMenu?: (e: React.MouseEvent, path: string) => void;
}

export function FileList({ items, selectedPath, currentPath, includeSummary, formatFileTime, onSelect, onOpen, onContextMenu }: FileListProps) {
  // P3.4 键盘选中滚动跟随（PageUp/PageDown/←→ 移动后保持可见）
  useEffect(() => {
    if (selectedPath === null || selectedPath === undefined) return;
    document.querySelector('.file-list .file-list-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedPath, items.length]);
  const renderRow = (index: number) => {
    const item = items[index];
    return (
      <button
        type="button"
        className={`file-list-item ${selectedPath === item.path ? 'selected' : ''} ${currentPath === item.path ? 'current' : ''}`}
        title={item.path}
        onClick={() => {
          onSelect(item.path);
          onOpen(item.path);
        }}
        onDoubleClick={() => onOpen(item.path)}
        onContextMenu={(e) => onContextMenu?.(e, item.path)}
      >
        <span className="file-list-title">{item.title}</span>
        <span className="file-list-meta">{item.filename}{formatFileTime(item.modifiedMs) ? ` · ${formatFileTime(item.modifiedMs)}` : ''}</span>
        {includeSummary && item.summary && <span className="file-list-summary">{item.summary}</span>}
      </button>
    );
  };
  return <VirtualRows count={items.length} estimateRowHeight={44} overscan={10} resetKey={items.length} renderItem={renderRow} />;
}
