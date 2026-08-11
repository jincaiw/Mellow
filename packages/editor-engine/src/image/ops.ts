/**
 * Image 文件操作计划 —— 纯函数（spec image-workflow §6/§7）。
 *
 * 输入：扫描出的引用 + 目标目录 + 现有文件名集合
 * 输出：fsOps（顺序执行：mkdir → move/copy/download）+ patches（单事务应用）+ report
 *
 * 安全规则：
 * - 唯一命名（`img.png` 冲突 → `img-1.png`），绝不静默覆盖（PRD §57）
 * - 跳过：已在 asset 目录 / 文件不存在 / 无法解析 / 远程不可下载
 * - 不产生 delete 类操作（用户删除一律走回收站，PRD §57）
 */

import type { ImageRef } from './scan';
import { buildImageMarkdown, computeRelativePath, joinPaths, basename, dirname, normalizeSlashes } from './path';

export type FsOpKind = 'mkdir' | 'move' | 'copy' | 'download';

export interface FsOp {
  kind: FsOpKind;
  /** move/copy 源（绝对路径） */
  from?: string;
  /** 目标（绝对路径） */
  to: string;
  /** download 源 URL */
  url?: string;
}

/** 引用 patch：替换 `![alt](src)` 全范围（单事务应用，spec §11 undoable） */
export interface RefPatch {
  from: number;
  to: number;
  text: string;
}

export interface ImageOpReport {
  moved: number;
  copied: number;
  downloaded: number;
  skipped: Array<{ src: string; reason: string }>;
  failed: Array<{ src: string; error: string }>;
}

export interface ImageOpPlan {
  fsOps: FsOp[];
  patches: RefPatch[];
  report: ImageOpReport;
}

export interface PlanContext {
  /** 目标目录（绝对路径） */
  targetDirAbs: string;
  /** 文档目录（相对路径计算基准；null → patch 用绝对路径） */
  docDir: string | null;
  /** 目标目录现有文件名（不区分大小写按平台；此处精确匹配 + 同批去重） */
  existingNames: Set<string>;
}

function emptyReport(): ImageOpReport {
  return { moved: 0, copied: 0, downloaded: 0, skipped: [], failed: [] };
}

function emptyPlan(): ImageOpPlan {
  return { fsOps: [], patches: [], report: emptyReport() };
}

/** 分配唯一目标文件名（同批去重：existing 会被修改） */
export function allocateUniqueName(existing: Set<string>, name: string): string {
  if (name === '' || name === '.') {
    return name;
  }
  if (!existing.has(name)) {
    existing.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 1;
  while (existing.has(`${stem}-${i}${ext}`)) {
    i += 1;
  }
  const out = `${stem}-${i}${ext}`;
  existing.add(out);
  return out;
}

/** 生成 mkdir（如目标目录尚不存在，由调用方 exists 判定后添加） */
function withMkdir(plan: ImageOpPlan, ctx: PlanContext): void {
  if (!plan.fsOps.some((op) => op.kind === 'mkdir' && op.to === ctx.targetDirAbs)) {
    plan.fsOps.unshift({ kind: 'mkdir', to: ctx.targetDirAbs });
  }
}

/** 新 src（相对优先；docDir null → 绝对） */
function newSrc(docDir: string | null, targetAbs: string): string {
  if (docDir === null) {
    return normalizeSlashes(targetAbs);
  }
  return computeRelativePath(docDir, targetAbs) || basename(targetAbs);
}

function patchFor(ref: ImageRef, newSrcValue: string): RefPatch {
  return { from: ref.from, to: ref.to, text: buildImageMarkdown(newSrcValue, ref.alt) };
}

// ─────────────────────────── 单图操作（spec §6） ───────────────────────────

/** Move 单图：ref.absolutePath → targetDirAbs；patch 引用 */
export function planMoveImage(ref: ImageRef, ctx: PlanContext): ImageOpPlan {
  return planSingleFileOp('move', ref, ctx);
}

/** Copy 单图：保留原文件，复制到 targetDirAbs；patch 引用 */
export function planCopyImage(ref: ImageRef, ctx: PlanContext): ImageOpPlan {
  return planSingleFileOp('copy', ref, ctx);
}

function planSingleFileOp(kind: 'move' | 'copy', ref: ImageRef, ctx: PlanContext): ImageOpPlan {
  const plan = emptyPlan();
  if (ref.kind !== 'local' || ref.absolutePath === null) {
    plan.report.skipped.push({ src: ref.src, reason: ref.kind === 'remote' ? '远程图片不适用' : '无法解析路径' });
    return plan;
  }
  if (dirname(ref.absolutePath) === ctx.targetDirAbs) {
    plan.report.skipped.push({ src: ref.src, reason: '已在目标目录' });
    return plan;
  }
  const name = allocateUniqueName(ctx.existingNames, basename(ref.absolutePath));
  const target = joinPaths(ctx.targetDirAbs, name);
  withMkdir(plan, ctx);
  plan.fsOps.push({ kind, from: ref.absolutePath, to: target });
  plan.patches.push(patchFor(ref, newSrc(ctx.docDir, target)));
  if (kind === 'move') {
    plan.report.moved = 1;
  } else {
    plan.report.copied = 1;
  }
  return plan;
}

/** Rename 单图：同目录改名；patch 引用。newName 可带扩展名（缺省补原扩展名） */
export function planRenameImage(ref: ImageRef, newName: string, ctx: PlanContext): ImageOpPlan {
  const plan = emptyPlan();
  if (ref.kind !== 'local' || ref.absolutePath === null) {
    plan.report.skipped.push({ src: ref.src, reason: '远程图片不支持重命名' });
    return plan;
  }
  const dir = dirname(ref.absolutePath);
  const current = basename(ref.absolutePath);
  let name = newName.trim();
  if (name === '') {
    plan.report.skipped.push({ src: ref.src, reason: '新文件名为空' });
    return plan;
  }
  const dot = current.lastIndexOf('.');
  const currentExt = dot === -1 ? '' : current.slice(dot);
  if (!name.includes('.') && currentExt !== '' && name !== current) {
    name += currentExt; // 补扩展名
  }
  if (name === current) {
    plan.report.skipped.push({ src: ref.src, reason: '文件名未变化' });
    return plan;
  }
  const target = joinPaths(dir, name);
  if (target === ref.absolutePath) {
    plan.report.skipped.push({ src: ref.src, reason: '目标与源相同' });
    return plan;
  }
  plan.fsOps.push({ kind: 'move', from: ref.absolutePath, to: target });
  plan.patches.push(patchFor(ref, newSrc(ctx.docDir, target)));
  plan.report.moved = 1;
  return plan;
}

// ─────────────────────────── 批量操作（spec §7） ───────────────────────────

/** Move All：全部本地图片移入 asset 目录（已在 asset / 不存在 / 无法解析跳过） */
export function planMoveAll(refs: ImageRef[], ctx: PlanContext): ImageOpPlan {
  return planBatch('move', refs, ctx);
}

/** Copy All：全部本地图片复制到 asset 目录（保留原文件） */
export function planCopyAll(refs: ImageRef[], ctx: PlanContext): ImageOpPlan {
  return planBatch('copy', refs, ctx);
}

function planBatch(kind: 'move' | 'copy', refs: ImageRef[], ctx: PlanContext): ImageOpPlan {
  const plan = emptyPlan();
  for (const ref of refs) {
    if (ref.kind !== 'local') {
      plan.report.skipped.push({ src: ref.src, reason: '远程图片跳过（Move/Copy All 仅本地）' });
      continue;
    }
    if (ref.absolutePath === null) {
      plan.report.skipped.push({ src: ref.src, reason: '无法解析路径' });
      continue;
    }
    if (ref.inAssetDir) {
      plan.report.skipped.push({ src: ref.src, reason: '已在 asset 目录' });
      continue;
    }
    if (ref.exists === false) {
      plan.report.skipped.push({ src: ref.src, reason: '文件不存在（保留引用）' });
      continue;
    }
    const name = allocateUniqueName(ctx.existingNames, basename(ref.absolutePath));
    const target = joinPaths(ctx.targetDirAbs, name);
    plan.fsOps.push({ kind, from: ref.absolutePath, to: target });
    plan.patches.push(patchFor(ref, newSrc(ctx.docDir, target)));
    if (kind === 'move') {
      plan.report.moved += 1;
    } else {
      plan.report.copied += 1;
    }
  }
  if (plan.fsOps.length > 0) {
    withMkdir(plan, ctx);
  }
  return plan;
}

/** Download Remote：全部可下载远程图片本地化（spec §7/§9；无静默下载，仅显式命令） */
export function planDownloadRemote(refs: ImageRef[], ctx: PlanContext): ImageOpPlan {
  const plan = emptyPlan();
  for (const ref of refs) {
    if (ref.kind !== 'remote') {
      plan.report.skipped.push({ src: ref.src, reason: '本地图片跳过（Download Remote 仅远程）' });
      continue;
    }
    if (!ref.downloadable) {
      plan.report.skipped.push({ src: ref.src, reason: '协议不可下载（data/mailto 等）' });
      continue;
    }
    const name = allocateUniqueName(ctx.existingNames, remoteTargetName(ref.src));
    const target = joinPaths(ctx.targetDirAbs, name);
    plan.fsOps.push({ kind: 'download', url: ref.src, to: target });
    plan.patches.push(patchFor(ref, newSrc(ctx.docDir, target)));
    plan.report.downloaded += 1;
  }
  if (plan.fsOps.length > 0) {
    withMkdir(plan, ctx);
  }
  return plan;
}

/** 远程 URL → 目标文件名（去 query/hash；含扩展名校验） */
function remoteTargetName(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split(/[?#]/)[0] ?? '';
  }
  const name = basename(pathname);
  if (name === '' || name === '.') {
    return 'image';
  }
  // 无扩展名 → 附加 .img（避免 asset 目录出现无扩展文件）
  if (!/\.\w+$/.test(name)) {
    return `${name}.img`;
  }
  return name;
}

/** 合并报告（批量 + 单图） */
export function mergeReports(target: ImageOpReport, extra: ImageOpReport): void {
  target.moved += extra.moved;
  target.copied += extra.copied;
  target.downloaded += extra.downloaded;
  target.skipped.push(...extra.skipped);
  target.failed.push(...extra.failed);
}
