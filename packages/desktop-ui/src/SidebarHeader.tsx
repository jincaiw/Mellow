/**
 * SidebarHeader（desktop-ui-design-spec §5 侧栏；V7-I2/V7-I5 Typora 对齐）。
 *
 * 头部三段式：☰（左）+ 居中模式标题 + 🔍（右）。
 * V7-I5（用户裁决）：☰ 不是菜单 —— 单击直接在 文件/大纲 之间切换
 * （与 Typora 一致，tooltip 随目标模式变化，如「切换到大纲视图」）；
 * 搜索经 🔍 进入，☰ 从任意模式返回文件。
 */
import { useRef } from 'react';

export type SidebarMode = 'files' | 'outline' | 'search';

export interface SidebarHeaderProps {
  mode: SidebarMode;
  t: (key: string, params?: Record<string, string | number>) => string;
  onModeChange: (mode: SidebarMode) => void;
  onSearchClick: () => void;
}

export function SidebarHeader({ mode, t, onModeChange, onSearchClick }: SidebarHeaderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const label = mode === 'files' ? t('sidebar.files') : mode === 'outline' ? t('sidebar.outline') : t('sidebar.search');
  // ☰ 目标：files ↔ outline 直接互切；search 下单击返回文件（Typora 行为）
  const toggleTarget: SidebarMode = mode === 'files' ? 'outline' : 'files';
  const toggleLabel = toggleTarget === 'outline' ? t('sidebar.switchToOutline') : t('sidebar.switchToFiles');

  return (
    <div className="file-tree-header" ref={rootRef}>
      <div className="sidebar-mode-nav">
        <button
          type="button"
          className="sidebar-mode-trigger"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => onModeChange(toggleTarget)}
        >
          <svg className="sidebar-mode-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>
      <span className="sidebar-mode-trigger-label sidebar-title">{label}</span>
      <button
        type="button"
        className="sidebar-search-btn"
        aria-label={t('sidebar.search')}
        title={t('sidebar.search')}
        onClick={onSearchClick}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
