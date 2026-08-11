/**
 * ImageFileOpsService —— 图片文件操作编排（spec image-workflow §6/§7）。
 *
 * 流程（安全保证）：
 *   解析 asset 目录配置（PRD §53：front matter > global > 'assets'）
 *   → 扫描引用 + exists 回填
 *   → 生成计划（唯一命名，绝不覆盖）
 *   → 顺序执行 fsOps（mkdir → move/copy/download）
 *     ├─ 任一失败 → 反向回滚已执行操作，文档零改动
 *     └─ 全部成功 → 单事务 patch 引用（一次 Undo 撤销全部，spec §11）+ 记录 undo（PRD §58）
 *
 * 依赖注入：FileService（宿主 fs）+ EditorBridge（编辑器）+ FileOpHistory（撤销栈）。
 */

import type { FileService, Result } from '../../host-api/src';
import { ok, err } from '../../host-api/src';
import type { EditorBridge } from './editorBridge';
import type { FileOpHistory } from './fileOpHistory';
import { scanImageRefs } from '../../editor-engine/src/image/scan';
import {
  extractFrontMatter,
  parseFrontMatterAssetDir,
  resolveAssetDirSetting,
  assetDirAbsolute,
} from '../../editor-engine/src/image/assetConfig';
import {
  planMoveImage,
  planCopyImage,
  planRenameImage,
  planMoveAll,
  planCopyAll,
  planDownloadRemote,
} from '../../editor-engine/src/image/ops';
import type { ImageOpPlan, ImageOpReport, FsOp } from '../../editor-engine/src/image/ops';
import type { ImageRef } from '../../editor-engine/src/image/scan';
import type { AssetDirConfig } from '../../editor-engine/src/image/path';
import { dirname } from '../../editor-engine/src/image/path';

/** asset 目录全局设置提供者（desktop 从 localStorage 读；测试注入） */
export interface AssetSettingProvider {
  getGlobalSetting(): AssetDirConfig;
}

export interface ImageFileOpsDeps {
  fs: FileService;
  editor: EditorBridge;
  history: FileOpHistory;
  /** 全局 asset 目录设置（PRD §53 global） */
  assetSetting?: AssetSettingProvider;
}

export class ImageFileOpsService {
  constructor(private readonly deps: ImageFileOpsDeps) {}

  /** 当前文档上下文（配置解析 → asset 目录 → 引用扫描 + exists 回填） */
  private async context(): Promise<{
    text: string;
    docPath: string | null;
    docDir: string | null;
    setting: AssetDirConfig;
    assetDirAbs: string | null;
    refs: ImageRef[];
  }> {
    const text = this.deps.editor.getText();
    const docPath = this.deps.editor.getDocumentPath();
    const docDir = docPath === null ? null : dirname(docPath);
    const globalSetting = this.deps.assetSetting?.getGlobalSetting() ?? 'assets';
    const fm = extractFrontMatter(text);
    const frontMatterSetting = fm === null ? null : parseFrontMatterAssetDir(fm);
    const setting = resolveAssetDirSetting({ global: globalSetting, frontMatter: frontMatterSetting });
    const assetDirAbs = assetDirAbsolute(docPath, setting);
    const refs = scanImageRefs(text, docDir, assetDirAbs);
    // exists 回填（批量跳过缺失文件；并行）
    await Promise.all(refs.map(async (r) => {
      if (r.kind === 'local' && r.absolutePath !== null) {
        const e = await this.deps.fs.exists(r.absolutePath);
        r.exists = e.ok ? e.value : null;
      }
    }));
    return { text, docPath, docDir, setting, assetDirAbs, refs };
  }

  /** 目标目录现有文件名（目录不存在 → 空集；mkdir 由计划兜底） */
  private async existingNames(dirAbs: string): Promise<Set<string>> {
    const r = await this.deps.fs.readDir(dirAbs);
    if (!r.ok) {
      return new Set();
    }
    return new Set(r.value.filter((e) => !e.isDirectory).map((e) => e.name));
  }

  // ─────────────────────────── 单图操作（spec §6） ───────────────────────────

  /** Move 单图：src → targetDirAbs（目标由目录选择对话框提供）；取消 → canceled */
  async moveImage(src: string, targetDirAbs: string): Promise<Result<ImageOpReport>> {
    return this.singleOp(src, targetDirAbs, (ref, ctx2) => planMoveImage(ref, ctx2));
  }

  /** Copy 单图（保留原文件） */
  async copyImage(src: string, targetDirAbs: string): Promise<Result<ImageOpReport>> {
    return this.singleOp(src, targetDirAbs, (ref, ctx2) => planCopyImage(ref, ctx2));
  }

  /** Rename 单图（同目录） */
  async renameImage(src: string, newName: string): Promise<Result<ImageOpReport>> {
    const { docDir, refs } = await this.context();
    const ref = refs.find((r) => r.src === src);
    if (ref === undefined) {
      return err({ code: 'not-found', message: `未找到图片引用: ${src}` });
    }
    if (ref.absolutePath === null) {
      return err({ code: 'invalid-argument', message: '引用无法解析为本地路径' });
    }
    const dir = dirname(ref.absolutePath);
    const existing = await this.existingNames(dir);
    const plan = planRenameImage(ref, newName, { targetDirAbs: dir, docDir, existingNames: existing });
    return this.execute(plan);
  }

  private async singleOp(
    src: string,
    targetDirAbs: string,
    build: (ref: ImageRef, ctx2: { targetDirAbs: string; docDir: string | null; existingNames: Set<string> }) => ImageOpPlan,
  ): Promise<Result<ImageOpReport>> {
    const { docDir, refs } = await this.context();
    const ref = refs.find((r) => r.src === src);
    if (ref === undefined) {
      return err({ code: 'not-found', message: `未找到图片引用: ${src}` });
    }
    const existing = await this.existingNames(targetDirAbs);
    const plan = build(ref, { targetDirAbs, docDir, existingNames: existing });
    return this.execute(plan);
  }

  // ─────────────────────────── 批量操作（spec §7） ───────────────────────────

  /** Move All：全部本地图片移入 asset 目录 */
  async moveAll(): Promise<Result<ImageOpReport>> {
    return this.batch((refs, ctx2) => planMoveAll(refs, ctx2));
  }

  /** Copy All：全部本地图片复制到 asset 目录（保留原文件） */
  async copyAll(): Promise<Result<ImageOpReport>> {
    return this.batch((refs, ctx2) => planCopyAll(refs, ctx2));
  }

  /** Download Remote：全部远程图片本地化（spec §9 仅显式命令） */
  async downloadRemote(): Promise<Result<ImageOpReport>> {
    return this.batch((refs, ctx2) => planDownloadRemote(refs, ctx2));
  }

  /** Download Remote（单图，widget 操作条）：src → asset 目录 */
  async downloadRemoteImage(src: string): Promise<Result<ImageOpReport>> {
    const { docDir, assetDirAbs, refs } = await this.context();
    if (assetDirAbs === null) {
      return err({ code: 'invalid-argument', message: '未保存文档：无法解析 asset 目录（请先保存文档）' });
    }
    const ref = refs.find((r) => r.src === src);
    if (ref === undefined) {
      return err({ code: 'not-found', message: `未找到图片引用: ${src}` });
    }
    if (ref.kind !== 'remote' || !ref.downloadable) {
      return err({ code: 'invalid-argument', message: '该引用不是可下载的远程图片' });
    }
    const existing = await this.existingNames(assetDirAbs);
    const plan = planDownloadRemote([ref], { targetDirAbs: assetDirAbs, docDir, existingNames: existing });
    return this.execute(plan);
  }

  /** 把 src 解析为绝对路径（widget 操作条 reveal/open 用）；null → 无法解析 */
  resolveSrcPath(src: string): string | null {
    const text = this.deps.editor.getText();
    const docPath = this.deps.editor.getDocumentPath();
    const docDir = docPath === null ? null : dirname(docPath);
    const refs = scanImageRefs(text, docDir, null);
    return refs.find((r) => r.src === src)?.absolutePath ?? null;
  }

  private async batch(
    build: (refs: ImageRef[], ctx2: { targetDirAbs: string; docDir: string | null; existingNames: Set<string> }) => ImageOpPlan,
  ): Promise<Result<ImageOpReport>> {
    const { docDir, assetDirAbs, refs } = await this.context();
    if (assetDirAbs === null) {
      return err({ code: 'invalid-argument', message: '未保存文档：无法解析 asset 目录（请先保存文档）' });
    }
    const existing = await this.existingNames(assetDirAbs);
    const plan = build(refs, { targetDirAbs: assetDirAbs, docDir, existingNames: existing });
    return this.execute(plan);
  }

  // ─────────────────────────── 执行（安全核心） ───────────────────────────

  /** 顺序执行 fsOps → 成功 patch + undo 记录；失败回滚 */
  private async execute(plan: ImageOpPlan): Promise<Result<ImageOpReport>> {
    const done: FsOp[] = [];
    for (const op of plan.fsOps) {
      const r = await this.runFsOp(op);
      if (!r.ok) {
        // 回滚已执行操作（逆序），文档零改动
        await this.rollback(done);
        plan.report.failed.push({ src: op.url ?? op.from ?? op.to, error: r.error.message });
        return ok(plan.report);
      }
      done.push(op);
    }
    // 全部成功 → 单事务 patch（一次 Undo 撤销全部，spec §11）
    if (plan.patches.length > 0) {
      this.deps.editor.patchChanges(plan.patches);
    }
    // 记录 undo（PRD §58 toast）
    this.recordUndo(done);
    this.deps.editor.refreshImages();
    return ok(plan.report);
  }

  private async runFsOp(op: FsOp): Promise<Result<void>> {
    switch (op.kind) {
      case 'mkdir':
        return this.deps.fs.mkdir(op.to);
      case 'move':
        return this.deps.fs.move(op.from!, op.to);
      case 'copy':
        return this.deps.fs.copyFile(op.from!, op.to);
      case 'download': {
        const r = await this.deps.fs.download(op.url!, op.to);
        return r.ok ? ok(undefined) : err(r.error);
      }
    }
  }

  /** 失败回滚（逆序；best effort——回滚失败不阻断报告） */
  private async rollback(done: FsOp[]): Promise<void> {
    for (const op of [...done].reverse()) {
      try {
        if (op.kind === 'move') {
          await this.deps.fs.move(op.to, op.from!);
        } else if (op.kind === 'copy' || op.kind === 'download') {
          await this.deps.fs.remove(op.to);
        } else if (op.kind === 'mkdir') {
          // 仅当目录为空时移除（内部产物）
          const entries = await this.deps.fs.readDir(op.to);
          if (entries.ok && entries.value.length === 0) {
            await this.deps.fs.remove(op.to);
          }
        }
      } catch {
        // best effort：回滚失败不抛（原始错误优先）
      }
    }
  }

  /** 记录可撤销操作（PRD §58） */
  private recordUndo(done: FsOp[]): void {
    for (const op of done) {
      if (op.kind === 'move') {
        this.deps.history.push({ kind: 'move', from: op.from!, to: op.to });
      } else if (op.kind === 'copy' || op.kind === 'download') {
        this.deps.history.push({ kind: 'copy', from: op.from ?? op.url ?? '', to: op.to });
      } else if (op.kind === 'mkdir') {
        this.deps.history.push({ kind: 'mkdir', path: op.to });
      }
    }
  }
}
