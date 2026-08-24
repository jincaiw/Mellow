/**
 * SidebarHeader（desktop-ui-design-spec §5 侧栏）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 模式切换（文件/大纲/搜索）+ 低频操作菜单。
 */
export type SidebarMode = 'files' | 'outline' | 'search';

export interface SidebarHeaderProps {
  mode: SidebarMode;
  t: (key: string, params?: Record<string, string | number>) => string;
  onModeChange: (mode: SidebarMode) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  canRefresh: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

export function SidebarHeader({ mode, t, onModeChange, onOpenFolder, onRefresh, canRefresh, filtersOpen, onToggleFilters }: SidebarHeaderProps) {
  return (
    <div className="file-tree-header">
      <div className="sidebar-mode-nav" role="tablist" aria-label={t('sidebar.filesSwitchLabel')}>
        <button type="button" role="tab" aria-selected={mode === 'files'} className={mode === 'files' ? 'active' : ''} onClick={() => onModeChange('files')}>{t('sidebar.files')}</button>
        <button type="button" role="tab" aria-selected={mode === 'outline'} className={mode === 'outline' ? 'active' : ''} onClick={() => onModeChange('outline')}>{t('sidebar.outline')}</button>
        <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'active' : ''} onClick={() => onModeChange('search')}>{t('sidebar.search')}</button>
      </div>
      {mode === 'files' && (
        <div className="sidebar-header-actions" aria-label={t('sidebar.filtersTitle')}>
          <button type="button" className="file-sidebar-icon-action" onClick={onOpenFolder} title={t('sidebar.openFolderTitle')} aria-label={t('sidebar.openFolderTitle')}>⌑</button>
          <button type="button" className="file-sidebar-icon-action" onClick={onRefresh} disabled={!canRefresh} title={t('sidebar.refresh')} aria-label={t('sidebar.refresh')}>↻</button>
          <button type="button" className="file-tree-filters-toggle" onClick={onToggleFilters} title={t('sidebar.filtersTitle')} aria-expanded={filtersOpen}>⋯</button>
        </div>
      )}
    </div>
  );
}
