/**
 * FileList（PRD §15 / desktop-ui-design-spec §6 文件列表）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：标题 + 文件名/修改时间 + 摘要（可选）。
 * P3.2 虚拟化：10k 文件经 VirtualRows 窗口化渲染（Exit Gate：不阻塞）。
 *
 * V7-W3.2（G7-SIDE 域 C 合同「File List」）补齐：
 * - `compact` 默认 true —— Typora Articles 默认紧凑行（标题 + 单行元信息）；
 * - `groupByFolder` —— 递归收集时按文件夹分组（sticky 组标题，复用 VirtualRows 的
 *   padding spacer 方案，不用 transform，保住 sticky）；
 * - 四态：current（当前文档）/ selected（键盘或点击选中）/ hover / missing（文档不在本
 *   文件夹 → 整列无 current 高亮，改由 `SidebarFooter` 的提示条表达）。
 */
import { useEffect, useMemo } from 'react';
import type { FileListItem } from '../../app-core/src';
import { dirname } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

export interface FileListProps {
  items: FileListItem[];
  selectedPath: string | null;
  currentPath: string | null;
  includeSummary: boolean;
  /** V7-W3.2：紧凑行（Typora Articles 默认 true） */
  compact?: boolean;
  /** V7-W3.2：按文件夹分组（仅递归收集时有多个分组，单文件夹时自动退化为不分组） */
  groupByFolder?: boolean;
  /** 分组标题文案（默认取父目录路径） */
  folderLabel?: (path: string) => string;
  formatFileTime: (ms?: number) => string;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  /** P3.5 右键菜单（App 层组装菜单项） */
  onContextMenu?: (e: React.MouseEvent, path: string) => void;
}

type Row =
  | { kind: 'group'; key: string; label: string }
  | { kind: 'item'; key: string; item: FileListItem };

export function FileList({
  items,
  selectedPath,
  currentPath,
  includeSummary,
  compact = true,
  groupByFolder = false,
  folderLabel = dirname,
  formatFileTime,
  onSelect,
  onOpen,
  onContextMenu,
}: FileListProps) {
  // P3.4 键盘选中滚动跟随（PageUp/PageDown/←→ 移动后保持可见）
  useEffect(() => {
    if (selectedPath === null || selectedPath === undefined) return;
    document.querySelector('.file-list .file-list-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedPath, items.length]);

  const rows = useMemo<Row[]>(() => {
    if (!groupByFolder) return items.map((item) => ({ kind: 'item', key: item.path, item }));
    const out: Row[] = [];
    let last = '\u0000';
    for (const item of items) {
      const label = folderLabel(item.path);
      if (label !== last) {
        out.push({ kind: 'group', key: `group:${label}`, label });
        last = label;
      }
      out.push({ kind: 'item', key: item.path, item });
    }
    // 只有一个分组时不渲染标题（Typora：单文件夹 Articles 无分组标题）
    const groupCount = out.filter((r) => r.kind === 'group').length;
    return groupCount <= 1 ? out.filter((r) => r.kind === 'item') : out;
  }, [items, groupByFolder, folderLabel]);

  const renderRow = (index: number) => {
    const row = rows[index];
    if (row === undefined) return null;
    if (row.kind === 'group') {
      return <div className="file-list-group" title={row.label}>{row.label}</div>;
    }
    const item = row.item;
    return (
      <button
        type="button"
        className={`file-list-item ${compact ? 'compact' : ''} ${selectedPath === item.path ? 'selected' : ''} ${currentPath === item.path ? 'current' : ''}`}
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
  return (
    <VirtualRows
      count={rows.length}
      estimateRowHeight={compact ? 40 : 44}
      overscan={10}
      resetKey={`${rows.length}:${compact ? 1 : 0}:${groupByFolder ? 1 : 0}`}
      renderItem={renderRow}
    />
  );
}
