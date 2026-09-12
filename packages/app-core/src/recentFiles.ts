/**
 * Recent Files（Typora 深度对标 ⑫）—— 最近打开文档列表模型。
 *
 * - pushRecentFile：去重置顶 + 数量上限（纯函数，App 持久化到 localStorage）；
 * - markRecentMissing：用 exists 结果标记缺失文件（欢迎屏置灰 + 「已删除」标记）。
 */

export interface RecentFileEntry {
  path: string;
  lastOpenedAt: number;
  /** 文件已不存在（欢迎屏置灰标记） */
  missing?: boolean;
}

export const RECENT_FILES_LIMIT = 10;

/** 记录最近打开：同一路径去重置顶，超限截断（纯函数） */
export function pushRecentFile(list: RecentFileEntry[], path: string, now: number, limit = RECENT_FILES_LIMIT): RecentFileEntry[] {
  const rest = list.filter((entry) => entry.path !== path);
  return [{ path, lastOpenedAt: now }, ...rest].slice(0, limit);
}

/** 用 exists 结果标记缺失（纯函数） */
export function markRecentMissing(list: RecentFileEntry[], exists: (path: string) => boolean): RecentFileEntry[] {
  return list.map((entry) => ({ ...entry, missing: !exists(entry.path) }));
}

/** 解析持久化载荷（损坏/异常输入回退空列表） */
export function parseRecentFiles(raw: string | null): RecentFileEntry[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentFileEntry =>
        typeof entry === 'object' && entry !== null &&
        typeof (entry as RecentFileEntry).path === 'string' &&
        typeof (entry as RecentFileEntry).lastOpenedAt === 'number')
      .slice(0, RECENT_FILES_LIMIT);
  } catch {
    return [];
  }
}

/** 序列化持久化载荷（损坏输入返回 null 表示不写入） */
export function serializeRecentFiles(list: RecentFileEntry[]): string | null {
  try {
    return JSON.stringify(list);
  } catch {
    return null;
  }
}

/**
 * Recent Folders（PRD §56/§62 最近文件夹）—— 最近打开文件夹列表模型。
 * 纯函数：去重置顶 + 数量上限；App 持久化到 localStorage。
 */
export const RECENT_FOLDERS_LIMIT = 10;

export function pushRecentFolder(list: string[], folder: string, limit = RECENT_FOLDERS_LIMIT): string[] {
  const rest = list.filter((f) => f !== folder);
  return [folder, ...rest].slice(0, limit);
}

export function parseRecentFolders(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is string => typeof f === 'string').slice(0, RECENT_FOLDERS_LIMIT);
  } catch {
    return [];
  }
}

export function serializeRecentFolders(list: string[]): string | null {
  try {
    return JSON.stringify(list);
  } catch {
    return null;
  }
}

/**
 * V7-W3.9 —— Recent Locations 的 **trash（移除）** 与 **pin（固定）** 语义。
 *
 * Typora 官方 File Management 原文：「hover on folders under "Recent Locations" …
 * click the "trash" icon to remove it from the list … click the "Pin" icon to pin
 * the folder … pinned folders will also show in `File → Open Recent` and Open Quickly」。
 *
 * 实现选择：pin 集合持久化于**独立键**（`mellow.recent.folders.pinned`），与既有的
 * `string[]` 最近文件夹载荷解耦 —— 避免改动 `pushRecentFolder` / `parseRecentFolders`
 * 的类型与既有单测，同时保留旧存档兼容。解析/序列化直接复用同形状的 string[] 工具。
 */
export function removeRecentFolder(list: string[], folder: string): string[] {
  return list.filter((f) => f !== folder);
}

export function togglePinRecentFolder(pinned: string[], folder: string): string[] {
  return pinned.includes(folder) ? pinned.filter((f) => f !== folder) : [folder, ...pinned];
}

/** 固定项置顶（Typora：pinned 优先），其余保持最近打开顺序（稳定排序） */
export function sortRecentFolders(list: string[], pinned: string[]): string[] {
  const pinnedSet = new Set(pinned.filter((p) => list.includes(p)));
  return [...list].sort((a, b) => Number(pinnedSet.has(b)) - Number(pinnedSet.has(a)));
}
