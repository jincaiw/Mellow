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
  /** C3：单项可见性（未声明的字段按 E7 默认集：仅 stats/cursor 可见） */
  fields?: Partial<Record<StatusBarField, boolean>>;
  /** C3：点击 Zoom 项 → 重置为实际大小（Typora 行为） */
  onZoomReset?: () => void;
}

/** E7（Typora 观感收敛）：默认隐藏集——未持久化配置的字段按此渲染（stats/cursor 常显） */
export const STATUSBAR_DEFAULT_HIDDEN: ReadonlySet<StatusBarField> = new Set<StatusBarField>([
  'dirty', 'markdown', 'encoding', 'eol', 'zoom', 'status',
]);

/** E7：单项可见性判定（显式 fields 配置优先；未声明字段按默认隐藏集），供测试与右键菜单复用 */
export function fieldVisible(fields: Partial<Record<StatusBarField, boolean>> | undefined, field: StatusBarField): boolean {
  return fields?.[field] ?? !STATUSBAR_DEFAULT_HIDDEN.has(field);
}

export function StatusBar({ t, dirty, stats, cursorPos, encodingLabel, eolLabel, status, statusText, zoom, fields, onZoomReset }: StatusBarProps) {
  const f = (field: StatusBarField): boolean => fieldVisible(fields, field);
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
