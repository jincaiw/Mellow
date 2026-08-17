/**
 * Welcome（PRD §24 / desktop-ui-design-spec §11）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 极简：标题 + 新建/打开/打开文件夹 + 最近（缺失标记）。
 */
import { basename, dirname as fileTreeDirname } from '../../app-core/src';
import type { RecentFileEntry } from '../../app-core/src';

export interface WelcomeProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  recentFiles: RecentFileEntry[];
  recentMissing: Record<string, boolean>;
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onOpenRecent: (path: string) => void;
}

export function Welcome({ t, recentFiles, recentMissing, onNew, onOpen, onOpenFolder, onOpenRecent }: WelcomeProps) {
  return (
    <div className="welcome">
      <h1 className="welcome-title">Mellow</h1>
      <div className="welcome-actions">
        <button onClick={onNew}>{t('welcome.new')}</button>
        <button onClick={onOpen}>{t('welcome.open')}</button>
        <button onClick={onOpenFolder}>{t('welcome.openFolder')}</button>
      </div>
      {recentFiles.length > 0 && (
        <div className="welcome-recent">
          <div className="welcome-recent-title">{t('welcome.recent')}</div>
          <div className="welcome-recent-list">
            {recentFiles.map((entry) => {
              const missing = recentMissing[entry.path] === true;
              return (
                <button
                  key={entry.path}
                  type="button"
                  className={`welcome-recent-item${missing ? ' missing' : ''}`}
                  disabled={missing}
                  onClick={() => onOpenRecent(entry.path)}
                >
                  <span className="welcome-recent-name">{basename(entry.path)}{missing ? ` · ${t('welcome.recentMissing')}` : ''}</span>
                  <span className="welcome-recent-dir">{fileTreeDirname(entry.path)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}