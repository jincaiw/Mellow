/**
 * OutlineList（PRD §16 / desktop-ui-design-spec §7）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：heading 层级、当前高亮、折叠、点击跳转。
 * P3.2 虚拟化：1000 headings 经 VirtualRows 窗口化渲染（Exit Gate：不阻塞）。
 * P3.3 键盘导航：selectedId 高亮键盘选中行（与 caret 驱动的 currentId 分离），变化时滚动跟随。
 */
import { useEffect } from 'react';
import type { OutlineHeading } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

export interface OutlineListProps {
  items: OutlineHeading[];
  currentId: string | null;
  selectedId?: string | null;
  flat: boolean;
  collapsed: ReadonlySet<string>;
  onJump: (item: OutlineHeading) => void;
  onToggle: (id: string) => void;
  /** P3.5 右键菜单（App 层组装菜单项） */
  onContextMenu?: (e: React.MouseEvent, item: OutlineHeading) => void;
}

export function OutlineList({ items, currentId, selectedId = null, flat, collapsed, onJump, onToggle, onContextMenu }: OutlineListProps) {
  // 键盘选中滚动跟随（block: 'nearest' 不干扰用户当前视口）
  useEffect(() => {
    if (selectedId === null) return;
    document.querySelector('.outline-list .outline-row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, items.length]);
  const renderRow = (index: number) => {
    const item = items[index];
    return (
      <button
        type="button"
        className={`outline-row ${currentId === item.id ? 'current' : ''} ${selectedId === item.id ? 'selected' : ''}`}
        style={{ paddingLeft: flat ? 10 : 8 + (item.level - 1) * 14 }}
        title={item.title}
        onClick={() => onJump(item)}
        onContextMenu={(e) => onContextMenu?.(e, item)}
      >
        {!flat && item.children.length > 0 && (
          <span className="outline-disclosure" onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}>
            {collapsed.has(item.id) ? '▸' : '▾'}
          </span>
        )}
        {!flat && item.children.length === 0 && <span className="outline-disclosure" />}
        <span className="outline-title">{item.number ? `${item.number} ` : ''}{item.title}</span>
      </button>
    );
  };
  return <VirtualRows count={items.length} estimateRowHeight={28} overscan={10} resetKey={items.length} renderItem={renderRow} />;
}
