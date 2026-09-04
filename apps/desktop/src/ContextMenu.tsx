/**
 * 轻量 Context Menu（desktop-ui-design-spec §6：文件树右键；V4 §10：编辑器右键）。
 *
 * - 浮层 fixed 定位，viewport clamp；
 * - 点击外部 / Esc / 滚动关闭；
 * - ↑↓ 键盘导航 + Enter 执行（roving，无 autofocus 抢焦点）；
 * - C1：分隔线（`separator: true`）与一层子菜单（`children`，Typora code-tools /
 *   Alignment 语义）——子菜单 hover / Enter 展开，仅支持一层（Typora 无更深层级）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  enabled?: boolean;
  /** 叶子条目必填；带 children 的父条目可省略 */
  onClick?: () => void;
  /** C1：子菜单（仅一层） */
  children?: ContextMenuItem[];
}

/** C1：分隔线条目 */
export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

const isSeparator = (entry: ContextMenuEntry): entry is ContextMenuSeparator =>
  (entry as ContextMenuSeparator).separator === true;

export default function ContextMenu({ state, onClose }: ContextMenuProps) {
  const { x, y, items } = state;
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const [selected, setSelected] = useState(-1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [subSelected, setSubSelected] = useState(0);
  const [subPos, setSubPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const enabledIndices = items
    .map((item, index) => (isSeparator(item) || item.enabled === false ? -1 : index))
    .filter((i) => i >= 0);

  // 定位并 clamp 到视口
  const style: React.CSSProperties = (() => {
    const el = ref.current;
    const width = el?.offsetWidth ?? 180;
    const height = el?.offsetHeight ?? items.length * 28;
    return {
      left: Math.max(4, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 8)),
    };
  })();

  const openSubmenu = useCallback((index: number) => {
    const item = items[index];
    if (item === undefined || isSeparator(item) || item.children === undefined) return;
    const el = itemRefs.current.get(index);
    const rect = el?.getBoundingClientRect();
    setSubPos({
      left: (rect?.right ?? x) - 4,
      top: rect?.top ?? y,
    });
    setOpenIndex(index);
    setSubSelected(0);
  }, [items, x, y]);

  useEffect(() => {
    const first = enabledIndices[0] ?? -1;
    setSelected((prev) => (enabledIndices.includes(prev) ? prev : first));
    setOpenIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const openItem = openIndex !== null ? items[openIndex] : undefined;
  const subItems = openItem !== undefined && !isSeparator(openItem) ? openItem.children ?? [] : [];
  const subRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (openIndex !== null) {
        setOpenIndex(null); // 先收子菜单，再 Esc 才关整个菜单
        return;
      }
      onClose();
      return;
    }
    // 子菜单展开时：↑↓ 在子项间导航，Enter 执行，← 收起
    if (openIndex !== null && subItems.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        setSubSelected((prev) => (prev + dir + subItems.length) % subItems.length);
        return;
      }
      if (event.key === 'Enter') {
        const item = subItems[subSelected];
        if (item !== undefined && item.enabled !== false) {
          event.preventDefault();
          item.onClick?.();
          onClose();
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setOpenIndex(null);
        return;
      }
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const dir = event.key === 'ArrowDown' ? 1 : -1;
      const pos = enabledIndices.indexOf(selected);
      const next = enabledIndices[(pos + dir + enabledIndices.length) % enabledIndices.length];
      setSelected(next);
      if (openIndex !== null && next !== openIndex) setOpenIndex(null);
    }
    if (event.key === 'ArrowRight') {
      const item = items[selected];
      if (item !== undefined && !isSeparator(item) && item.children !== undefined && item.children.length > 0) {
        event.preventDefault();
        openSubmenu(selected);
      }
    }
    if (event.key === 'Enter') {
      const item = items[selected];
      if (item !== undefined && !isSeparator(item)) {
        if (item.children !== undefined && item.children.length > 0) {
          event.preventDefault();
          openSubmenu(selected);
          return;
        }
        if (item.enabled !== false) {
          event.preventDefault();
          item.onClick?.();
          onClose();
        }
      }
    }
  }, [enabledIndices, items, onClose, openIndex, openSubmenu, selected, subItems, subSelected]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    const onPointerDown = (event: PointerEvent): void => {
      const inMenu = ref.current !== null && ref.current.contains(event.target as Node);
      const inSub = subRef.current !== null && subRef.current.contains(event.target as Node);
      if (!inMenu && !inSub) {
        onClose();
        return;
      }
      // 点在主菜单内但不在当前子菜单上 → 收起子菜单（不关主菜单）
      if (inMenu && openIndex !== null && !inSub) {
        const el = itemRefs.current.get(openIndex);
        if (el === undefined || !el.contains(event.target as Node)) setOpenIndex(null);
      }
    };
    const onScroll = (): void => onClose();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onKeyDown, onClose, openIndex]);

  return (
    <>
      <div ref={ref} className="context-menu" role="menu" style={style}>
        {items.map((entry, index) => {
          if (isSeparator(entry)) {
            return <div key={`sep-${index}`} className="context-menu-separator" role="separator" />;
          }
          const item = entry;
          const hasChildren = item.children !== undefined && item.children.length > 0;
          return (
            <button
              key={`${item.label}-${index}`}
              ref={(el) => { if (el !== null) itemRefs.current.set(index, el); else itemRefs.current.delete(index); }}
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? openIndex === index : undefined}
              className={`context-menu-item ${index === selected ? 'selected' : ''} ${item.enabled === false ? 'disabled' : ''}`}
              disabled={item.enabled === false}
              onMouseEnter={() => {
                setSelected(index);
                if (hasChildren) openSubmenu(index);
                else if (openIndex !== null && openIndex !== index) setOpenIndex(null);
              }}
              onClick={() => {
                if (item.enabled === false) return;
                if (hasChildren) {
                  openSubmenu(index);
                  return;
                }
                item.onClick?.();
                onClose();
              }}
            >
              <span className="context-menu-item-label">{item.label}</span>
              {hasChildren ? <span className="context-menu-submenu-arrow" aria-hidden="true">›</span> : null}
            </button>
          );
        })}
      </div>
      {openIndex !== null && subItems.length > 0 ? (
        <div
          ref={subRef}
          className="context-menu context-menu-submenu"
          role="menu"
          style={{
            left: Math.max(4, Math.min(subPos.left, window.innerWidth - 200 - 8)),
            top: Math.max(4, Math.min(subPos.top, window.innerHeight - subItems.length * 28 - 8)),
          }}
        >
          {subItems.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              className={`context-menu-item ${index === subSelected ? 'selected' : ''} ${item.enabled === false ? 'disabled' : ''}`}
              disabled={item.enabled === false}
              onMouseEnter={() => setSubSelected(index)}
              onClick={() => {
                if (item.enabled === false) return;
                item.onClick?.();
                onClose();
              }}
            >
              <span className="context-menu-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
