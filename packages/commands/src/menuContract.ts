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
  // ⚠️ 2026-09-30 移除 `insert.mermaid` 条目：schema 里**没有**该命令，
  // 段落菜单也**有意不设** code/math/mermaid 分组（见 `menuSchema.ts` 该处注释：
  // 「Typora 段落菜单无此分组，常驻会破坏『菜单入口可预期』」）。原条目与真值源脱节。
  { id: 'insert.image', menu: 'format' },
  { id: 'format.bold', menu: 'format' },
  { id: 'format.link', menu: 'format' },
  { id: 'view.source.toggle', menu: 'view' },
  { id: 'view.sidebar.toggle', menu: 'view' },
  // 动态派生 id：schema 里只有 `{ kind: 'dynamic', dynamic: 'themes' }` 占位，
  // 具体 id 由 Theme Registry 在运行时展开。护栏会校验它归属**声明该占位的那一级**。
  { id: 'theme.apply.mellow-light', menu: 'theme' },
  // ⚠️ 2026-09-30 移除 `{ id: 'settings.open', menu: 'help' }`：
  // 它在 schema 里实际位于 **macOS 应用菜单（`app`，macOnly）**，不在本合同的 8 个顶层内
  // （本合同按定义**不含平台专有 chrome**）。原条目与真值源脱节，且此前**无人核对** ——
  // 现已由 `verify-menu-contract.mjs` §1b 真的读取本文件并逐条比对 schema。
  // Win/Linux 的设置入口是**键盘 `Ctrl+,`**（App.tsx CommandRegistry 互补键位，
  // 由 §11 平台互补键位专项断言）与命令面板，**不经菜单**。
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
