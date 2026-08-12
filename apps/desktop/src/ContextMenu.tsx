/**
 * 轻量 Context Menu（desktop-ui-design-spec §6：文件树右键）。
 *
 * - 浮层 fixed 定位，viewport clamp；
 * - 点击外部 / Esc / 滚动关闭；
 * - ↑↓ 键盘导航 + Enter 执行（roving，无 autofocus 抢焦点）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  enabled?: boolean;
  onClick: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export default function ContextMenu({ state, onClose }: ContextMenuProps) {
  const { x, y, items } = state;
  const ref = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState(0);

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

  useEffect(() => {
    const enabledCount = items.filter((i) => i.enabled !== false).length;
    setSelected(Math.min(selected, Math.max(0, enabledCount - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    const enabled = items.map((item, index) => (item.enabled === false ? -1 : index)).filter((i) => i >= 0);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const dir = event.key === 'ArrowDown' ? 1 : -1;
      const pos = enabled.indexOf(selected);
      const next = enabled[(pos + dir + enabled.length) % enabled.length];
      setSelected(next);
    }
    if (event.key === 'Enter') {
      const item = items[selected];
      if (item !== undefined && item.enabled !== false) {
        event.preventDefault();
        item.onClick();
        onClose();
      }
    }
  }, [items, onClose, selected]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    };
    const onScroll = (): void => onClose();
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onKeyDown, onClose]);

  return (
    <div ref={ref} className="context-menu" role="menu" style={style}>
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`context-menu-item ${index === selected ? 'selected' : ''} ${item.enabled === false ? 'disabled' : ''}`}
          disabled={item.enabled === false}
          onMouseEnter={() => setSelected(index)}
          onClick={() => {
            if (item.enabled !== false) {
              item.onClick();
              onClose();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
