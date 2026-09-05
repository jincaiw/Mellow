/**
 * Tabbar（PRD §11 / desktop-ui-design-spec §4）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示组件：拖拽排序（本地 draggedTabIdRef）+ 选择/关闭/右键回调。
 *
 * P2-2.3：overflow 行为 —— tab 数量 ≥8 进入 compact（缩小 min/max 宽度），
 * 溢出由 .tabbar overflow-x 滚动兜底，active 变化时自动滚动到可视区。
 * P2-2.4：tab 右键菜单（关闭/关闭其他/关闭右侧/重新打开），items 由宿主
 * 经 ContextMenuItem 构造并走既有 handle* / 命令通道。
 */
import { useEffect, useRef } from 'react';
import type { DocumentTab } from '../../app-core/src';

export interface TabbarProps {
  tabs: DocumentTab[];
  activeTabId: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onDropTab: (targetId: string, draggedId: string | null) => void;
  /** P2-2.4：tab 右键（viewport 坐标） */
  onTabContextMenu?: (tabId: string, x: number, y: number) => void;
  /** F3（第四轮）：新建文档（+ 按钮 / 双击空白 / ⌘T 语义由宿主菜单承载） */
  onNewTab: () => void;
}

/** compact 阈值：≥ 此数量时缩小 tab 宽度（Typora 低干扰；滚动兜底不破版） */
const COMPACT_THRESHOLD = 8;

export function Tabbar({ tabs, activeTabId, t, onSelect, onClose, onDropTab, onTabContextMenu, onNewTab }: TabbarProps) {
  const draggedTabIdRef = useRef<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  // P2-2.3：active tab 必须在溢出滚动区可见（切换/新建/重开 后自动滚动）
  useEffect(() => {
    const nav = navRef.current;
    if (nav === null) return;
    const active = nav.querySelector('.tab.active');
    if (active === null) return;
    // block:'nearest' 不带动页面纵向滚动；inline:'nearest' 仅在不可见时最小滚动
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  const compact = tabs.length >= COMPACT_THRESHOLD;

  return (
    <nav
      ref={navRef}
      className={`tabbar${compact ? ' compact' : ''}`}
      aria-label={t('tabbar.label')}
      onDoubleClick={(e) => {
        // F3：双击 tabbar 空白处新建文档（双击 tab 本体不触发）
        if ((e.target as HTMLElement).closest('.tab') !== null) return;
        onNewTab();
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
          title={tab.path ?? t('msg.unsavedDoc')}
          draggable
          onDragStart={() => { draggedTabIdRef.current = tab.id; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDropTab(tab.id, draggedTabIdRef.current)}
          onClick={() => onSelect(tab.id)}
          onAuxClick={(e) => { if (e.button === 1) onClose(tab.id); }}
          onContextMenu={onTabContextMenu === undefined
            ? undefined
            : (e) => { e.preventDefault(); onTabContextMenu(tab.id, e.clientX, e.clientY); }}
        >
          <span className="tab-dirty">{tab.dirty ? '●' : ''}</span>
          <span className="tab-title">{tab.title}</span>
          <span
            className="tab-close"
            role="button"
            aria-label={t('tab.close.label', { title: tab.title })}
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          >×</span>
        </button>
      ))}
      <button
        type="button"
        className="tab-new"
        aria-label={t('tabbar.newTab')}
        title={t('tabbar.newTab')}
        onClick={(e) => { e.stopPropagation(); onNewTab(); }}
      >＋</button>
    </nav>
  );
}
