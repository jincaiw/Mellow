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
