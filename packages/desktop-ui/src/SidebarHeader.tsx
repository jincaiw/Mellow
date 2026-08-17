/**
 * SidebarHeader（desktop-ui-design-spec §5 侧栏）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 模式切换（文件/大纲/搜索）+ 打开文件夹/刷新/过滤折叠按钮。
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
      <strong>{mode === 'outline' ? t('sidebar.outline') : mode === 'search' ? t('sidebar.search') : t('sidebar.files')}</strong>
      <div className="file-sidebar-switch" role="tablist" aria-label={t('sidebar.filesSwitchLabel')}>
        <button className={mode === 'files' ? 'active' : ''} onClick={() => onModeChange('files')}>{t('sidebar.files')}</button>
        <button className={mode === 'outline' ? 'active' : ''} onClick={() => onModeChange('outline')}>{t('sidebar.outline')}</button>
        <button className={mode === 'search' ? 'active' : ''} onClick={() => onModeChange('search')}>{t('sidebar.search')}</button>
      </div>
      {mode === 'files' && (
        <>
          <button onClick={onOpenFolder} title={t('sidebar.openFolderTitle')}>{t('sidebar.openFolder')}</button>
          <button onClick={onRefresh} disabled={!canRefresh}>{t('sidebar.refresh')}</button>
          <button className="file-tree-filters-toggle" onClick={onToggleFilters} title={t('sidebar.filtersTitle')} aria-expanded={filtersOpen}>⋯</button>
        </>
      )}
    </div>
  );
}
