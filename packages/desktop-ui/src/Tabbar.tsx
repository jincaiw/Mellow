/**
 * Tabbar（PRD §11 / desktop-ui-design-spec §4）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示组件：拖拽排序（本地 draggedTabIdRef）+ 选择/关闭回调。
 */
import { useRef } from 'react';
import type { DocumentTab } from '../../app-core/src';

export interface TabbarProps {
  tabs: DocumentTab[];
  activeTabId: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onDropTab: (targetId: string, draggedId: string | null) => void;
}

export function Tabbar({ tabs, activeTabId, t, onSelect, onClose, onDropTab }: TabbarProps) {
  const draggedTabIdRef = useRef<string | null>(null);
  return (
    <nav className="tabbar" aria-label={t('tabbar.label')}>
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
    </nav>
  );
}