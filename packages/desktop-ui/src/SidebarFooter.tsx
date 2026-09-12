/**
 * SidebarFooter（V7-W3.3，裁决 D-C = ①）—— 侧栏底部的「当前文件夹」操作条。
 *
 * Typora 官方 File Management 原文：「At the bottom of the left side bar, users can
 * pop up menu items for the current folder」—— 菜单含 Refresh / Open Folder… /
 * 排序（Group by Folder + 4 种排序 × 升降序）/ Recent Locations。
 *
 * 形态：单行按钮（文件夹图标 + 当前文件夹名 + 上箭头），点击即在其上方弹出菜单。
 * 与 Typora 的差异仅在于 Typora 用无边框条 + 点击弹出，此处为可聚焦 button
 * （键盘可达性优于原生无边框条，属 B 级增强）。
 */
export interface SidebarFooterProps {
  /** 当前文件夹显示名（root 的 basename）；未加载文件夹时为 null */
  folderName: string | null;
  /** 当前文件夹完整路径（title / tooltip） */
  folderPath: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 弹出文件夹操作菜单（App 层组装 ContextMenu items） */
  onMenu: (e: React.MouseEvent) => void;
  /** V7-W3.2：当前文档不属于已加载文件夹时的提示（Typora 此时侧栏无任何高亮，用户会困惑） */
  currentOutsideFolder?: boolean;
  /** 把当前文档所在文件夹载入侧栏（B 级增强入口） */
  onLoadCurrentFolder?: () => void;
}

export function SidebarFooter({ folderName, folderPath, t, onMenu, currentOutsideFolder, onLoadCurrentFolder }: SidebarFooterProps) {
  return (
    <div className="sidebar-footer-wrap">
      {currentOutsideFolder === true && onLoadCurrentFolder !== undefined && (
        <button
          type="button"
          className="sidebar-footer-hint"
          title={t('sidebar.currentOutsideHint')}
          onClick={onLoadCurrentFolder}
        >
          {t('sidebar.currentOutsideHint')}
        </button>
      )}
      <button
        type="button"
        className="sidebar-footer"
        onClick={onMenu}
        title={folderPath ?? t('sidebar.openFolder')}
        aria-label={t('sidebar.folderMenuLabel')}
        aria-haspopup="menu"
      >
        <svg className="sidebar-footer-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 4.5h4l1.5 2h7.5v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-8a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
        </svg>
        <span className="sidebar-footer-name">{folderName ?? t('sidebar.noFolder')}</span>
        <span className="sidebar-footer-caret" aria-hidden="true">⌃</span>
      </button>
    </div>
  );
}
