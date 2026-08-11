/**
 * Image 路径工具 —— 纯函数（neutral，零平台 API）。
 *
 * 覆盖 spec §5 Path Rules：
 * - URL / Windows drive / UNC / POSIX absolute / relative 判别
 * - `\` → `/` 归一化、join、basename、dirname（跨平台）
 * - 相对路径计算（docDir → asset）
 * - Image src 转义（空格 # % 括号 [] 等；保留中文）
 * - 图片扩展名检测
 */

/** 路径种类（spec §5） */
export type PathKind = 'url' | 'windows-drive' | 'unc' | 'posix-absolute' | 'relative';

const URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const DATA_RE = /^data:/i;
const MAILTO_RE = /^mailto:/i;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)$/i;

/** 是否为可加载 URL（http/https/data/mailto 等；排除 C:/ 之类 drive） */
export function isUrl(p: string): boolean {
  return URL_RE.test(p) || DATA_RE.test(p) || MAILTO_RE.test(p);
}

/** Windows drive 路径（`C:\...` / `C:/...`） */
export function isWindowsDrivePath(p: string): boolean {
  return WINDOWS_DRIVE_RE.test(p);
}

/** UNC 路径（`\\server\share` / `//server/share`） */
export function isUncPath(p: string): boolean {
  return p.startsWith('\\') || p.startsWith('//');
}

/** POSIX 绝对路径（`/...`，排除 UNC `//`） */
export function isPosixAbsolute(p: string): boolean {
  return p.startsWith('/') && !isUncPath(p);
}

/** 任意绝对路径（drive / UNC / POSIX） */
export function isAbsolutePath(p: string): boolean {
  return isWindowsDrivePath(p) || isUncPath(p) || isPosixAbsolute(p);
}

/** 路径种类判定（顺序：url → drive → unc → posix-absolute → relative） */
export function pathKind(p: string): PathKind {
  if (isUrl(p)) return 'url';
  if (isWindowsDrivePath(p)) return 'windows-drive';
  if (isUncPath(p)) return 'unc';
  if (isPosixAbsolute(p)) return 'posix-absolute';
  return 'relative';
}

/** `\` → `/`（UNC `\\server` 保留 `//server`） */
export function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 跨平台 basename（`C:\a\b.png` → `b.png`；`//srv/share/f.png` → `f.png`） */
export function basename(p: string): string {
  const n = normalizeSlashes(p).replace(/\/+$/, '');
  const i = n.lastIndexOf('/');
  return i === -1 ? n : n.slice(i + 1);
}

/** 跨平台 dirname（`C:\a\b.png` → `C:/a`；`/a/b` → `/a`；`b.png` → `.`） */
export function dirname(p: string): string {
  const n = normalizeSlashes(p).replace(/\/+$/, '');
  if (n === '') return '.';
  const i = n.lastIndexOf('/');
  if (i === -1) return '.';
  if (i === 0) return '/';
  return n.slice(0, i);
}

/** 跨平台 join（保留 drive/UNC 前缀；`..` 不解析，保持原样拼接） */
export function joinPaths(...parts: string[]): string {
  const cleaned = parts.filter((p) => p.length > 0);
  if (cleaned.length === 0) return '';
  const first = normalizeSlashes(cleaned[0]);
  const rest = cleaned.slice(1).map(normalizeSlashes);
  let joined = first.replace(/\/+$/, '');
  for (const part of rest) {
    const p = part.replace(/^\/+|\/+$/g, '');
    if (p === '') continue;
    joined = `${joined}/${p}`;
  }
  return joined;
}

/** 分割路径段（保留 drive/UNC 前缀段） */
function splitSegments(p: string): string[] {
  const n = normalizeSlashes(p).replace(/\/+$/, '');
  if (n === '') return [];
  if (isWindowsDrivePath(n)) {
    const drive = n.slice(0, 2); // C:
    const rest = n.slice(2).replace(/^\/+/, '');
    return [drive, ...rest.split('/').filter((s) => s.length > 0)];
  }
  if (isUncPath(n)) {
    const prefix = n.startsWith('//') ? '//' : '\\';
    const rest = n.slice(prefix.length).split('/').filter((s) => s.length > 0);
    // root 含 server：`//srv1` ≠ `//srv2` → 无法相对
    const server = rest.shift() ?? '';
    return [prefix + server, ...rest];
  }
  if (isPosixAbsolute(n)) {
    return ['/', ...n.slice(1).split('/').filter((s) => s.length > 0)];
  }
  return n.split('/').filter((s) => s.length > 0);
}

/**
 * 相对路径计算：把 toAbs 表示为相对 fromDir 的路径（正斜杠）。
 * - 不同盘符/UNC 前缀 → 返回 toAbs（无法相对化）
 * - 同前缀 → `../` 上溯 + 下行
 */
export function computeRelativePath(fromDir: string, toAbs: string): string {
  const from = splitSegments(fromDir);
  const to = splitSegments(toAbs);

  if (from.length === 0 || to.length === 0) {
    return normalizeSlashes(toAbs);
  }
  // 前缀（盘符/UNC/根）不一致 → 无法相对；UNC 一律绝对（相对 UNC 在 WebView 解析不稳）
  const fromRoot = from[0];
  const toRoot = to[0];
  if (fromRoot.startsWith('//') || toRoot.startsWith('//')) {
    return normalizeSlashes(toAbs);
  }
  const rootsCompatible = fromRoot === toRoot
    || (fromRoot === '/' && toRoot === '/')
    || (/^[a-zA-Z]:$/.test(fromRoot) && /^[a-zA-Z]:$/.test(toRoot) && fromRoot.toUpperCase() === toRoot.toUpperCase());
  if (!rootsCompatible) {
    return normalizeSlashes(toAbs);
  }

  const fromBody = from.slice(1);
  const toBody = to.slice(1);
  let common = 0;
  while (common < fromBody.length && common < toBody.length && fromBody[common] === toBody[common]) {
    common += 1;
  }
  const up = fromBody.length - common;
  const upPart = up > 0 ? '../'.repeat(up) : '';
  const down = toBody.slice(common).join('/');
  return upPart + down;
}

/** 转义 image src（spec §5 URL escape；保留中文与已有 %XX） */
const KEEP_MARK = '\uE000';
export function escapeImageSrc(src: string): string {
  return src
    .replace(/%([0-9A-Fa-f]{2})/g, `${KEEP_MARK}$1`) // 保护已有 %XX
    .replace(/%/g, '%25')
    .replace(/ /g, '%20')
    .replace(/#/g, '%23')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\uE000/g, '%');
}

/** 反转义 image src（%XX → 字符；仅解码保留字符） */
export function unescapeImageSrc(src: string): string {
  return src
    .replace(/%20/g, ' ')
    .replace(/%23/g, '#')
    .replace(/%25/g, '%')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')');
}

/**
 * 把 image src 解析为绝对路径（spec §5 resolve）。
 * - url → 原样
 * - 绝对（drive/UNC/POSIX）→ 归一化后原样
 * - 相对 → join(docDir, src)
 * 返回 null：src 为空或无法解析。
 */
export function resolveImageSrc(src: string, docDir: string | null): string | null {
  const kind = pathKind(src);
  if (kind === 'url') {
    return src;
  }
  if (kind === 'windows-drive' || kind === 'unc' || kind === 'posix-absolute') {
    return normalizeSlashes(src);
  }
  if (docDir === null) {
    return null; // 未保存文档 + 相对路径 → 无法解析
  }
  return joinPaths(docDir, src);
}

/** 图片扩展名检测（spec §3 insert 判定） */
export function isImageFile(name: string): boolean {
  return IMAGE_EXT_RE.test(name);
}

/** asset 目录名（spec §4：`./assets/` `./images/` `./${doc}.assets/` custom） */
export type AssetDirConfig = 'assets' | 'images' | 'docname' | string;

export function assetDirName(docName: string | null, config: AssetDirConfig): string {
  const resolved = config === 'docname'
    ? `${docName ?? 'untitled'}.assets`
    : config;
  return `./${resolved}/`;
}

/** markdown image 语法生成：`![alt](src)` */
export function buildImageMarkdown(src: string, alt = ''): string {
  const safeAlt = alt.replace(/[\[\]]/g, '');
  return `![${safeAlt}](${escapeImageSrc(src)})`;
}

/** 提取 markdown image 的 src（`![alt](src)` 或 `![](src)`；失败 → null） */
export function parseImageSrcFromMarkdown(text: string): string | null {
  const m = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(text.trim());
  if (m === null) {
    return null;
  }
  return unescapeImageSrc(m[2].trim());
}
