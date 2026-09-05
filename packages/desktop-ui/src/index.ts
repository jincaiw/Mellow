/**
 * @mellow/desktop-ui —— Mellow 桌面 UI 组件（PRD §117；阶段 2 从 App.tsx 增量抽取）。
 * 纯展示组件：StatusBar / Sidebar 列表 / EditorToolbar。
 * （B2，第四轮：Welcome 欢迎页停用并移除 —— 启动即文档，对齐 Typora。
 *   B1（SDI）：Tabbar 随多标签能力一并移除 —— 单文档单窗口。）
 */
export { StatusBar, STATUSBAR_DEFAULT_HIDDEN, fieldVisible } from './StatusBar';
export type { StatusBarProps, StatusBarField } from './StatusBar';
export { EditorToolbar, EDITOR_TOOLBAR_BUTTONS } from './EditorToolbar';
export type { EditorToolbarProps, EditorToolbarButton } from './EditorToolbar';
export { OutlineList } from './OutlineList';
export type { OutlineListProps } from './OutlineList';
export { SearchResultsList } from './SearchResultsList';
export type { SearchResultsListProps } from './SearchResultsList';
export { FileList } from './FileList';
export type { FileListProps } from './FileList';
export { FileTree } from './FileTree';
export type { FileTreeProps } from './FileTree';
export { SidebarHeader } from './SidebarHeader';
export type { SidebarHeaderProps, SidebarMode } from './SidebarHeader';
export { VirtualRows } from './VirtualRows';
export type { VirtualRowsProps } from './VirtualRows';
export { buildOffsets, findRange } from './virtual';
export type { VirtualRange } from './virtual';
