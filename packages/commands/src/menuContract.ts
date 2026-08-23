/**
 * 跨入口菜单合同。
 *
 * 这是产品语义层的唯一顶层菜单顺序，不包含 macOS 应用菜单等平台专有 chrome。
 * Rust / Tauri 仅负责把同一 Command ID 投射为原生菜单项；Palette、Cheatsheet
 * 和 Context Menu 也必须复用这些 ID，不能重新定义用户命令。
 */
export const TYPOGRAPHIC_MENU_ORDER = [
  'file',
  'edit',
  'paragraph',
  'format',
  'view',
  'theme',
  'window',
  'help',
] as const;

export type DesktopTopLevelMenu = (typeof TYPOGRAPHIC_MENU_ORDER)[number];

export interface MenuCommandContract {
  id: string;
  menu: DesktopTopLevelMenu;
}

/** 高频命令的归属合同；Insert 不是独立顶层菜单。 */
export const MENU_COMMAND_CONTRACT: readonly MenuCommandContract[] = [
  { id: 'file.new', menu: 'file' },
  { id: 'file.open', menu: 'file' },
  { id: 'file.save', menu: 'file' },
  { id: 'edit.undo', menu: 'edit' },
  { id: 'edit.copyMarkdown', menu: 'edit' },
  { id: 'paragraph.h1', menu: 'paragraph' },
  { id: 'insert.table', menu: 'paragraph' },
  { id: 'insert.mermaid', menu: 'paragraph' },
  { id: 'insert.image', menu: 'format' },
  { id: 'format.bold', menu: 'format' },
  { id: 'format.link', menu: 'format' },
  { id: 'view.source.toggle', menu: 'view' },
  { id: 'view.sidebar.toggle', menu: 'view' },
  { id: 'theme.apply.mellow-light', menu: 'theme' },
  { id: 'settings.open', menu: 'help' },
] as const;

export function assertMenuContract(items: readonly MenuCommandContract[] = MENU_COMMAND_CONTRACT): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.includes('.')) throw new Error(`Menu command id must be namespaced: ${item.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate menu command id: ${item.id}`);
    ids.add(item.id);
    if (!TYPOGRAPHIC_MENU_ORDER.includes(item.menu)) throw new Error(`Unknown top-level menu: ${item.menu}`);
  }
}
