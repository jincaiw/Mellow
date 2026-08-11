/**
 * Asset 目录配置 —— 纯函数（PRD §53：global + per-document YAML）。
 *
 * 优先级：per-doc front matter > global > 默认 `'assets'`。
 * - front matter：文档顶部 `---\nasset_dir: images\n---`（minimal 解析；完整 YAML 模块 T-0211 落地后替换）
 * - global：桌面设置（localStorage，Phase 6 Settings 落地前的最小持久化）
 *
 * 产出 AssetDirConfig（path.ts assetDirName 消费）：'assets' | 'images' | 'docname' | custom path。
 */

import { assetDirName, joinPaths, dirname, basename } from './path';
import type { AssetDirConfig } from './path';

/** 全局设置键（localStorage；desktop Adapter 持久化，editor-engine 不触碰存储） */
export const GLOBAL_ASSET_DIR_KEY = 'mellow.assetDir';

/** 提取文档顶部 YAML front matter（`---` 包裹的块）；无 → null */
export function extractFrontMatter(text: string): string | null {
  if (!text.startsWith('---')) {
    return null;
  }
  const firstLf = text.indexOf('\n');
  const firstLine = firstLf === -1 ? text : text.slice(0, firstLf).replace(/\r$/, '');
  if (firstLine !== '---') {
    return null;
  }
  const rest = text.slice(firstLf + 1);
  const end = rest.search(/\n---(\r?\n|$)/);
  if (end === -1) {
    return null;
  }
  return rest.slice(0, end).replace(/\r$/, '');
}

/**
 * 从 front matter 提取 `asset_dir` 值（PRD §53 per-document YAML）。
 * 支持：`asset_dir: images` / `asset_dir: "my dir"` / 行内注释；无 → null。
 */
export function parseFrontMatterAssetDir(frontMatter: string): AssetDirConfig | null {
  const m = /^\s*asset_dir\s*:\s*(.*)$/m.exec(frontMatter);
  if (m === null) {
    return null;
  }
  let raw = m[1].trim();
  // 引号包裹
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  } else {
    // 行内注释（` # ...`，不含引号内）
    const comment = raw.search(/\s+#/);
    if (comment !== -1) {
      raw = raw.slice(0, comment).trim();
    }
  }
  if (raw === '') {
    return null;
  }
  return normalizeSetting(raw);
}

/** 归一化配置值：'assets'/'images'/'docname' 关键字原样；其余视为 custom 目录 */
export function normalizeSetting(value: string): AssetDirConfig {
  const v = value.trim();
  if (v === 'assets' || v === 'images' || v === 'docname') {
    return v;
  }
  return v; // custom：相对文档目录（`./sub/` 或裸目录名）或绝对路径
}

/** 解析最终配置（优先级：frontMatter > global > 'assets'） */
export function resolveAssetDirSetting(opts: {
  global?: AssetDirConfig | null;
  frontMatter?: AssetDirConfig | null;
}): AssetDirConfig {
  if (opts.frontMatter !== null && opts.frontMatter !== undefined) {
    return opts.frontMatter;
  }
  if (opts.global !== null && opts.global !== undefined) {
    return opts.global;
  }
  return 'assets';
}

/** asset 目录相对路径（`./assets/` / `./images/` / `./${stem}.assets/` / custom，spec §4） */
export function assetDirRelative(docPath: string | null, setting: AssetDirConfig): string {
  const stem = docPath === null ? null : basename(docPath).replace(/\.[^.]+$/, '');
  return assetDirName(stem, setting);
}

/**
 * asset 目录绝对路径。
 * - custom 为绝对路径 → 原样（归一化）
 * - 其余（assets/images/docname/custom 相对）→ 相对文档目录
 * - 未保存文档 + 相对 → null（无法解析）
 */
export function assetDirAbsolute(docPath: string | null, setting: AssetDirConfig): string | null {
  if (setting !== 'assets' && setting !== 'images' && setting !== 'docname' && isAbsoluteSetting(setting)) {
    return normalizeAbs(setting);
  }
  if (docPath === null) {
    return null; // 未保存文档：相对 asset 目录无基准
  }
  const rel = assetDirRelative(docPath, setting).replace(/^(\.\/)+/, '');
  return joinPaths(dirname(docPath), rel);
}

/** custom 配置是否为绝对路径（drive/UNC/POSIX） */
function isAbsoluteSetting(v: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(v) || v.startsWith('\\') || v.startsWith('//') || v.startsWith('/');
}

function normalizeAbs(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

export type { AssetDirConfig };
