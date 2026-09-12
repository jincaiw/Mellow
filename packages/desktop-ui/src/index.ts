/**
 * @mellow/desktop-ui —— Mellow 桌面 UI 组件（PRD §117；阶段 2 从 App.tsx 增量抽取）。
 * 纯展示组件：StatusBar / Sidebar 列表。
 * （B2，第四轮：Welcome 欢迎页停用并移除 —— 启动即文档，对齐 Typora。
 *   B1（SDI）：Tabbar 随多标签能力一并移除 —— 单文档单窗口。
 *   V7-W2.4（D-B = ①）：EditorToolbar 常驻横条移除 —— Typora 1.14 只有浮动的
 *   「编辑器工具栏」（Selection 锚定），已由 editor-engine 的 selectionToolbar 提供；
 *   常驻横条与 Typora 布局不符且功能重叠。）
 */
export { StatusBar, STATUSBAR_DEFAULT_HIDDEN, fieldVisible } from './StatusBar';
export type { StatusBarProps, StatusBarField } from './StatusBar';
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
export { SidebarFooter } from './SidebarFooter';
export type { SidebarFooterProps } from './SidebarFooter';
export { VirtualRows } from './VirtualRows';
export type { VirtualRowsProps } from './VirtualRows';
export { buildOffsets, findRange } from './virtual';
export type { VirtualRange } from './virtual';
