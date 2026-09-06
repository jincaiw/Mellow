/**
 * SidebarHeader（desktop-ui-design-spec §5 侧栏；V7-I2 Typora 截图对齐）。
 *
 * 头部三段式布局：☰ 汉堡（左，弹出模式切换菜单：文件/大纲/搜索）
 * + 居中模式标题（「文件」）+ 🔍 搜索（右，切到搜索面板）——与 Typora 文件面板头部一致。
 */
import { useEffect, useRef, useState } from 'react';

export type SidebarMode = 'files' | 'outline' | 'search';

export interface SidebarHeaderProps {
  mode: SidebarMode;
  t: (key: string, params?: Record<string, string | number>) => string;
  onModeChange: (mode: SidebarMode) => void;
  onSearchClick: () => void;
}

const MODES: SidebarMode[] = ['files', 'outline', 'search'];

export function SidebarHeader({ mode, t, onModeChange, onSearchClick }: SidebarHeaderProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = mode === 'files' ? t('sidebar.files') : mode === 'outline' ? t('sidebar.outline') : t('sidebar.search');

  return (
    <div className="file-tree-header" ref={rootRef}>
      <div className="sidebar-mode-nav">
        <button
          type="button"
          className="sidebar-mode-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('sidebar.filesSwitchLabel')}
          onClick={() => setOpen((v) => !v)}
        >
          <svg className="sidebar-mode-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        {open && (
          <div className="sidebar-mode-menu" role="menu">
            {MODES.map((m) => {
              const text = m === 'files' ? t('sidebar.files') : m === 'outline' ? t('sidebar.outline') : t('sidebar.search');
              return (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  className={`sidebar-mode-item${m === mode ? ' active' : ''}`}
                  aria-checked={m === mode}
                  onClick={() => { setOpen(false); onModeChange(m); }}
                >
                  {text}
                </button>
              );
            })}
          </div>
        )}
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
