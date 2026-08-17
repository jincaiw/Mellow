/**
 * Image 引用扫描 —— 纯函数（spec image-workflow §6/§7）。
 *
 * 从文档全文提取所有 Image 引用（`![alt](src)`），含：
 * - 文档位置（from/to，供单事务 patch）
 * - 分类（remote / local）
 * - 解析出的绝对路径（local）
 * - 是否已位于 asset 目录（批量操作跳过）
 *
 * 与 path.ts 配合：URL/Windows drive/UNC/POSIX 判别、相对路径解析全部复用。
 */

import { resolveImageSrc, dirname, normalizeSlashes, joinPaths, isUrl, basename, unescapeImageSrc, stripImageSize } from './path';

export type ImageRefKind = 'remote' | 'local';

export interface ImageRef {
  /** markdown 片段位置（`![alt](src)` 全范围） */
  from: number;
  to: number;
  alt: string;
  /** 原始 src（已反转义） */
  src: string;
  kind: ImageRefKind;
  /** local：解析出的绝对路径；无法解析 → null */
  absolutePath: string | null;
  /** 是否已位于 asset 目录（批量 Move/Copy 跳过） */
  inAssetDir: boolean;
  /** 远程 URL（http/https 可下载；data/mailto 不可下载） */
  downloadable: boolean;
  /** 文件系统中是否存在（local；host 侧检查后回填，scan 时未知 → null） */
  exists: boolean | null;
}

/** 远程 URL（可下载：http/https） */
export function isDownloadableUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/** src 是否为远程（http/https/data/mailto 等协议） */
export function isRemoteSrc(src: string): boolean {
  return isUrl(src);
}

/**
 * 扫描文档全部 Image 引用（spec §6/§7 输入）。
 *
 * @param text     文档全文
 * @param docDir   文档所在目录（相对路径解析基准）；未保存文档 → null
 * @param assetDirAbs asset 目录绝对路径（inAssetDir 判定）；null → 不做判定
 */
export function scanImageRefs(text: string, docDir: string | null, assetDirAbs: string | null): ImageRef[] {
  const refs: ImageRef[] = [];
  // 与 path.ts parseImageSrcFromMarkdown 同构：`![alt](src)`；src 不含 `)`（Typora 同语义）
  const RE = /!\[([^\]]*)\]\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    const alt = m[1];
    const stripped = stripImageSize(unescapeImageSrc(m[2].trim()));
    const src = stripped.src;
    const kind: ImageRefKind = isRemoteSrc(src) ? 'remote' : 'local';
    let absolutePath: string | null = null;
    if (kind === 'local') {
      absolutePath = resolveImageSrc(src, docDir);
    }
    let inAssetDir = false;
    if (absolutePath !== null && assetDirAbs !== null) {
      inAssetDir = isWithinDir(absolutePath, assetDirAbs);
    }
    refs.push({
      from,
      to,
      alt,
      src,
      kind,
      absolutePath,
      inAssetDir,
      downloadable: isDownloadableUrl(src),
      exists: null,
    });
  }
  return refs;
}

/** path 是否位于 dir 之下（跨平台；目录边界用分隔符） */
export function isWithinDir(path: string, dir: string): boolean {
  const p = normalizeSlashes(path).replace(/\/+$/, '');
  const d = normalizeSlashes(dir).replace(/\/+$/, '');
  if (d === '') {
    return true;
  }
  return p === d || p.startsWith(`${d}/`);
}

/** 本地引用文件名（供计划命名） */
export function refFileName(ref: ImageRef): string {
  if (ref.kind === 'remote') {
    return remoteFileName(ref.src);
  }
  return basename(ref.absolutePath ?? ref.src);
}

/** 远程 URL → 目标文件名（去 query/hash；空 → image；保留中文与空格） */
export function remoteFileName(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0] ?? '';
  }
  // URL.pathname 是百分号编码；解码回可读文件名（非法 % 序列 → 原样）
  try {
    path = decodeURIComponent(path);
  } catch {
    // 保留原样
  }
  const name = basename(path);
  return name === '' || name === '.' ? 'image' : name;
}

/** 远程 URL 去 query/hash（用于展示/下载名） */
export function stripUrlQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

/** 引用所属目录（spec §6 patch 目标判定） */
export function refDir(ref: ImageRef): string | null {
  return ref.absolutePath === null ? null : dirname(ref.absolutePath);
}

export type { AssetDirConfig } from './path';
export { joinPaths };