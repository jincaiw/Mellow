/**
 * SidebarHeader（desktop-ui-design-spec §5 侧栏）。
 *
 * V5-A1 Typora 化：顶部收敛为单个「当前模式」标签，点击弹出切换菜单
 * （文件/大纲/搜索）；打开文件夹/刷新等低频操作走命令面板/菜单，不再占侧栏头部。
 */
import { useEffect, useRef, useState } from 'react';

export type SidebarMode = 'files' | 'outline' | 'search';

export interface SidebarHeaderProps {
  mode: SidebarMode;
  t: (key: string, params?: Record<string, string | number>) => string;
  onModeChange: (mode: SidebarMode) => void;
}

const MODES: SidebarMode[] = ['files', 'outline', 'search'];

export function SidebarHeader({ mode, t, onModeChange }: SidebarHeaderProps) {
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
          <span className="sidebar-mode-trigger-label">{label}</span>
          <span className="sidebar-mode-caret" aria-hidden="true">▾</span>
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
    </div>
  );
}
