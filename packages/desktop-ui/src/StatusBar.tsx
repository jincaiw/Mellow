/**
 * StatusBar（PRD §20 / desktop-ui-design-spec §10）—— 从 App.tsx 增量抽取（阶段 2d）。
 */
export interface StatusBarProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  dirty: boolean;
  stats: string;
  cursorPos: string;
  encodingLabel: string;
  eolLabel: string;
  status: 'idle' | 'ready' | 'error';
  statusText: string;
}

export function StatusBar({ t, dirty, stats, cursorPos, encodingLabel, eolLabel, status, statusText }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="statusbar-item">{dirty ? t('status.unsaved') : t('status.saved')}</span>
      <span className="statusbar-item">{stats}</span>
      <span className="statusbar-item">{cursorPos}</span>
      <span className="statusbar-sep" />
      <span className="statusbar-item">{t('status.markdown')}</span>
      <span className="statusbar-item">{encodingLabel}</span>
      <span className="statusbar-item">{eolLabel}</span>
      <span className="spacer" />
      <span className={`status ${status}`}>{statusText}</span>
    </footer>
  );
}
