/**
 * Image 插入计划 —— 纯逻辑（spec §3 Insert Strategy / §4 Asset Directory）。
 *
 * 输入 ImageCandidate（file/bitmap/url）→ 输出 ImagePlan：
 * - markdown 片段（多张合并）
 * - fsOps 执行清单（mkdir → copy/write）
 *
 * 策略（spec §3 默认建议）：
 * - keep-original：本地文件 → 相对路径（相对文档目录）
 * - copy-to-assets：bitmap/copied file → 复制到 asset 目录 → 相对路径
 *
 * 平台差异（Windows drive / UNC / POSIX / 中文 / 空格）全部在 path.ts 纯函数内。
 */

import type { ImageHost, ImageCandidate, ImagePlan } from './host';
import { buildImageMarkdown, computeRelativePath, dirname, joinPaths, pathKind, normalizeSlashes, assetDirName } from './path';
import type { AssetDirConfig } from './path';

export interface InsertOptions {
  /** 插入策略（默认按 kind：bitmap → copy-to-assets；file → keep-original；url → 直插） */
  strategy?: 'auto' | 'keep-original' | 'copy-to-assets';
  /** asset 目录配置（spec §4；默认 './assets/'） */
  assetDir?: AssetDirConfig;
  /** 图片文件命名（bitmap 缺省 name 时用） */
  bitmapName?: (index: number, mime: string) => string;
}

/** 插入候选的调用方选项（paste copied file 传 copy-to-assets，spec §3） */
export interface InsertCandidatesOptions {
  strategy?: 'auto' | 'keep-original' | 'copy-to-assets';
  assetDir?: AssetDirConfig;
}

const DEFAULT_BITMAP_NAME = (index: number, mime: string): string => {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'png';
  return `pasted-${Date.now()}-${index}.${ext}`;
};

/** 单张候选 → 计划（fsOps + markdown） */
export async function planImageCandidate(
  host: ImageHost,
  candidate: ImageCandidate,
  opts: InsertOptions = {},
): Promise<ImagePlan> {
  const strategy = opts.strategy ?? 'auto';

  // url：直插，无 fs 操作
  if (candidate.kind === 'url') {
    const src = candidate.url ?? '';
    return { markdown: buildImageMarkdown(src, candidate.alt), fsOps: [] };
  }

  const docPath = host.getDocumentPath();
  const docDir = docPath === null ? null : dirname(docPath);

  // bitmap：必须 copy-to-assets（spec §3：pasted bitmap → copy to asset dir）
  if (candidate.kind === 'bitmap') {
    if (docDir === null) {
      // 未保存文档：无法相对化 —— 仍写入 asset（相对文档目录语义无法成立），
      // 走 keep-original 语义失败 → 返回 null 计划（调用方提示）
      return { markdown: '', fsOps: [] };
    }
    const name = candidate.name ?? opts.bitmapName?.(0, 'image/png') ?? DEFAULT_BITMAP_NAME(0, 'image/png');
    const assetRelative = assetDirName(docPath === null ? null : docStem(docPath), opts.assetDir ?? 'assets');
    const assetAbs = joinPaths(docDir, assetRelative.replace(/^\.\//, ''));
    const target = joinPaths(assetAbs, name);
    const src = computeRelativePath(docDir, target) || name;
    const escaped = buildImageMarkdown(src, candidate.alt);
    return {
      markdown: escaped,
      fsOps: [
        { kind: 'mkdir', to: assetAbs },
        { kind: 'write', to: target, data: candidate.data },
      ],
    };
  }

  // file：keep-original（本地文档）或 copy-to-assets
  const abs = normalizeSlashes(candidate.path ?? '');
  if (abs === '') {
    return { markdown: '', fsOps: [] };
  }
  const name = candidate.name ?? basenameLocal(abs);

  if (strategy === 'keep-original' || strategy === 'auto') {
    // keep-original：相对路径（绝对路径无法相对化时退回绝对）
    if (docDir !== null) {
      const rel = computeRelativePath(docDir, abs);
      if (!pathIsUnrelativizable(rel, abs)) {
        return { markdown: buildImageMarkdown(rel, candidate.alt), fsOps: [] };
      }
      // 不同盘符/UNC 前缀：无法相对 → 用绝对路径
      return { markdown: buildImageMarkdown(abs, candidate.alt), fsOps: [] };
    }
    // 未保存文档：绝对路径直插
    return { markdown: buildImageMarkdown(abs, candidate.alt), fsOps: [] };
  }

  // copy-to-assets
  if (docDir === null) {
    return { markdown: '', fsOps: [] }; // 未保存文档无法复制（无目标目录语义）→ 空计划
  }
  const assetRelative = assetDirName(docPath === null ? null : docStem(docPath), opts.assetDir ?? 'assets');
  const assetAbs = joinPaths(docDir, assetRelative.replace(/^\.\//, ''));
  const target = joinPaths(assetAbs, name);
  const src = computeRelativePath(docDir, target) || name;
  return {
    markdown: buildImageMarkdown(src, candidate.alt),
    fsOps: [
      { kind: 'mkdir', to: assetAbs },
      { kind: 'copy', from: abs, to: target },
    ],
  };
}

/** 多张候选 → 合并计划（fsOps 去重：共享 mkdir） */
export async function planImageCandidates(
  host: ImageHost,
  candidates: ImageCandidate[],
  opts: InsertOptions = {},
): Promise<ImagePlan> {
  const plans = await Promise.all(candidates.map((c) => planImageCandidate(host, c, opts)));
  const markdown = plans.map((p) => p.markdown).filter((m) => m.length > 0).join('\n\n');
  // 合并 fsOps：mkdir 去重（保持顺序：mkdir → copy/write）
  const mkdirs = new Map<string, ImagePlan['fsOps'][number]>();
  const others: ImagePlan['fsOps'] = [];
  for (const plan of plans) {
    for (const op of plan.fsOps) {
      if (op.kind === 'mkdir') {
        mkdirs.set(op.to, op);
      } else {
        others.push(op);
      }
    }
  }
  return { markdown, fsOps: [...mkdirs.values(), ...others] };
}

/** 执行 fsOps（任一失败 → 返回失败位置；成功 → null） */
export async function executeFsOps(host: ImageHost, ops: ImagePlan['fsOps']): Promise<string | null> {
  for (const op of ops) {
    if (op.kind === 'mkdir') {
      const r = await host.mkdir(op.to);
      if (!r.ok) return `mkdir ${op.to}: ${r.error.message}`;
    } else if (op.kind === 'copy') {
      const r = await host.copyFile(op.from!, op.to);
      if (!r.ok) return `copy ${op.from} → ${op.to}: ${r.error.message}`;
    } else {
      const r = await host.writeBinary(op.to, op.data!);
      if (!r.ok) return `write ${op.to}: ${r.error.message}`;
    }
  }
  return null;
}

/** basename（跨平台，含 Windows/UNC） */
function basenameLocal(p: string): string {
  const n = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const i = n.lastIndexOf('/');
  return i === -1 ? n : n.slice(i + 1);
}

/** 文档主名（去扩展名）：`note.md` → `note`（spec §4 `${filename}.assets`） */
function docStem(docPath: string): string {
  return basenameLocal(docPath).replace(/\.[^.]+$/, '');
}

/** computeRelativePath 无法相对化时返回原绝对路径 */
function pathIsUnrelativizable(rel: string, abs: string): boolean {
  return rel === normalizeAbs(abs);
}

function normalizeAbs(p: string): string {
  return p.replace(/\\/g, '/');
}

/** src 种类（供 insert 决策 / 测试断言） */
export function imageSrcKind(src: string): string {
  return pathKind(src);
}
