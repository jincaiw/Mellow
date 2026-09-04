/**
 * StatusBar（PRD §20 / desktop-ui-design-spec §10）—— 从 App.tsx 增量抽取（阶段 2d）。
 * C3（V4 §9.3）：Zoom 项 + 单项可见性配置（fields 由宿主 localStorage 驱动，右键切换）。
 */
export type StatusBarField =
  | 'dirty'
  | 'stats'
  | 'cursor'
  | 'markdown'
  | 'encoding'
  | 'eol'
  | 'zoom'
  | 'status';

export interface StatusBarProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  dirty: boolean;
  stats: string;
  cursorPos: string;
  encodingLabel: string;
  eolLabel: string;
  status: 'idle' | 'ready' | 'error';
  statusText: string;
  /** C3：缩放百分比（如 '100%'；缺省不显示） */
  zoom?: string;
  /** C3：单项可见性（缺省 = 显示；显式 false 隐藏） */
  fields?: Partial<Record<StatusBarField, boolean>>;
  /** C3：点击 Zoom 项 → 重置为实际大小（Typora 行为） */
  onZoomReset?: () => void;
}

export function StatusBar({ t, dirty, stats, cursorPos, encodingLabel, eolLabel, status, statusText, zoom, fields, onZoomReset }: StatusBarProps) {
  const f = (field: StatusBarField): boolean => fields?.[field] !== false;
  return (
    <footer className="statusbar">
      {f('dirty') && <span className="statusbar-item">{dirty ? t('status.unsaved') : t('status.saved')}</span>}
      {f('stats') && <span className="statusbar-item">{stats}</span>}
      {f('cursor') && <span className="statusbar-item">{cursorPos}</span>}
      <span className="statusbar-sep" />
      {f('markdown') && <span className="statusbar-item">{t('status.markdown')}</span>}
      {f('encoding') && <span className="statusbar-item">{encodingLabel}</span>}
      {f('eol') && <span className="statusbar-item">{eolLabel}</span>}
      {f('zoom') && zoom !== undefined && (
        <button type="button" className="statusbar-item statusbar-zoom" onClick={onZoomReset} title={t('status.zoomReset')}>
          {zoom}
        </button>
      )}
      <span className="spacer" />
      {f('status') && <span className={`status ${status}`}>{statusText}</span>}
    </footer>
  );
}
