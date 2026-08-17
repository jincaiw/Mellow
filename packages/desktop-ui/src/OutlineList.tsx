/**
 * OutlineList（PRD §16 / desktop-ui-design-spec §7）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示：heading 层级、当前高亮、折叠、点击跳转。
 */
import type { OutlineHeading } from '../../app-core/src';

export interface OutlineListProps {
  items: OutlineHeading[];
  currentId: string | null;
  flat: boolean;
  collapsed: ReadonlySet<string>;
  onJump: (item: OutlineHeading) => void;
  onToggle: (id: string) => void;
}

export function OutlineList({ items, currentId, flat, collapsed, onJump, onToggle }: OutlineListProps) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`outline-row ${currentId === item.id ? 'current' : ''}`}
          style={{ paddingLeft: flat ? 10 : 8 + (item.level - 1) * 14 }}
          title={item.title}
          onClick={() => onJump(item)}
        >
          {!flat && item.children.length > 0 && (
            <span className="outline-disclosure" onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}>
              {collapsed.has(item.id) ? '▸' : '▾'}
            </span>
          )}
          {!flat && item.children.length === 0 && <span className="outline-disclosure" />}
          <span className="outline-level">H{item.level}</span>
          <span className="outline-title">{item.number ? `${item.number} ` : ''}{item.title}</span>
        </button>
      ))}
    </>
  );
}