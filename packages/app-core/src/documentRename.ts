/**
 * DocumentRenameService —— 文档重命名（spec image-workflow §6 + document-file-safety §8）。
 *
 * 联动语义：
 * - 检测 `${stem}.assets` 目录是否存在
 * - 存在 → 对话框询问是否同步重命名资源目录并更新引用
 *   - 确认：rename 文档 + rename asset 目录 + patch 指向旧 asset 目录的全部引用（单事务）
 *   - 拒绝：仅 rename 文档（asset 目录与引用不动 → 引用仍然有效，安全默认）
 * - 失败回滚：文档 rename 成功但 asset rename 失败 → 回滚文档 rename，文档零改动
 *
 * 安全规则：目标已存在 → 中止；文件名校验（空/路径分隔符）；watcher 重监听由宿主 onRenamed 负责。
 */

import type { FileService, DialogService, Result } from '../../host-api/src';
import { ok, err } from '../../host-api/src';
import type { EditorBridge } from './editorBridge';
import type { FileOpHistory } from './fileOpHistory';
import { scanImageRefs, isWithinDir } from '../../editor-engine/src/image/scan';
import { buildImageMarkdown, computeRelativePath, dirname, basename, joinPaths } from '../../editor-engine/src/image/path';

export interface DocumentRenameDeps {
  fs: FileService;
  editor: EditorBridge;
  history: FileOpHistory;
  dialog: DialogService;
  /** 重命名成功后的宿主回调（更新文档路径状态/watcher 重监听） */
  onRenamed?: (newPath: string) => Promise<void> | void;
  /** 文件名校验（宿主可注入默认规则外策略）；返回错误信息，null = 合法 */
  validateName?: (name: string) => string | null;
}

export interface RenameOutcome {
  newPath: string;
  /** 是否同步重命名了资源目录 */
  assetDirRenamed: boolean;
  /** 引用 patch 数量 */
  patchedCount: number;
}

export class DocumentRenameService {
  constructor(private readonly deps: DocumentRenameDeps) {}

  /** 重命名当前文档（newBaseName 可不含扩展名；自动补原扩展名） */
  async renameDocument(newBaseName: string): Promise<Result<RenameOutcome>> {
    const oldPath = this.deps.editor.getDocumentPath();
    if (oldPath === null) {
      return err({ code: 'invalid-argument', message: '未保存文档无法重命名（请先保存）' });
    }
    const dir = dirname(oldPath);
    const oldStem = basename(oldPath).replace(/\.[^.]+$/, '');

    let name = newBaseName.trim();
    if (name === '') {
      return err({ code: 'invalid-argument', message: '文件名为空' });
    }
    if (/[\\/]/.test(name)) {
      return err({ code: 'invalid-argument', message: '文件名不能包含路径分隔符' });
    }
    const validate = this.deps.validateName;
    if (validate !== undefined) {
      const problem = validate(name);
      if (problem !== null) {
        return err({ code: 'invalid-argument', message: problem });
      }
    }
    // 补扩展名（新名无扩展名时沿用原扩展名）
    const oldExt = oldPath.match(/\.[^.]+$/)?.[0] ?? '';
    if (oldExt !== '' && !name.includes('.')) {
      name += oldExt;
    }
    if (name === basename(oldPath)) {
      return err({ code: 'invalid-argument', message: '文件名未变化' });
    }

    const newPath = joinPaths(dir, name);
    const exists = await this.deps.fs.exists(newPath);
    if (exists.ok && exists.value) {
      return err({ code: 'conflict', message: `目标已存在，拒绝覆盖: ${newPath}` });
    }

    // 检测 `${stem}.assets`
    const oldAssetDir = joinPaths(dir, `${oldStem}.assets`);
    const assetDirExists = await this.deps.fs.exists(oldAssetDir);
    const assetDirPresent = assetDirExists.ok && assetDirExists.value;

    let syncAssets = false;
    if (assetDirPresent) {
      const confirm = await this.deps.dialog.showConfirm(
        '同步资源目录',
        `检测到关联资源目录 "${oldStem}.assets"。是否同步重命名并更新文档内引用？\n\n选择"否"则仅重命名文档（引用保持有效）。`,
      );
      if (confirm.ok && confirm.value) {
        syncAssets = true;
      }
    }

    // ── 执行（含回滚）──
    const docRenamed = await this.deps.fs.rename(oldPath, newPath);
    if (!docRenamed.ok) {
      return err({ code: 'io', message: `重命名文档失败: ${docRenamed.error.message}` });
    }
    let assetDirRenamed = false;
    const newAssetDir = joinPaths(dir, `${name.replace(/\.[^.]+$/, '')}.assets`);
    if (syncAssets) {
      const r = await this.deps.fs.rename(oldAssetDir, newAssetDir);
      if (!r.ok) {
        // 回滚文档 rename（文档零改动）
        await this.deps.fs.rename(newPath, oldPath);
        return err({ code: 'io', message: `同步资源目录失败（已回滚文档重命名）: ${r.error.message}` });
      }
      assetDirRenamed = true;
    }

    // ── patch 引用（单事务；仅同步模式）──
    let patchedCount = 0;
    if (syncAssets) {
      patchedCount = await this.patchAssetRefs(newPath, oldAssetDir, newAssetDir);
    }

    // ── 状态更新 ──
    this.deps.editor.setDocumentPath(newPath);
    this.deps.editor.refreshImages();
    // undo 记录（PRD §58：rename 可撤销；宿主 undo 后需自行同步编辑器路径）
    this.deps.history.push({ kind: 'rename', from: oldPath, to: newPath }, `已重命名 ${basename(oldPath)}`);
    if (assetDirRenamed) {
      this.deps.history.push({ kind: 'rename', from: oldAssetDir, to: newAssetDir }, `已重命名 ${basename(oldAssetDir)}`);
    }
    await this.deps.onRenamed?.(newPath);

    return ok({ newPath, assetDirRenamed, patchedCount });
  }

  /** patch 指向旧 asset 目录的全部引用（单事务，spec §11 undoable） */
  private async patchAssetRefs(
    newDocPath: string,
    oldAssetDir: string,
    newAssetDir: string,
  ): Promise<number> {
    const docDir = dirname(newDocPath);
    const text = this.deps.editor.getText();
    const refs = scanImageRefs(text, docDir, oldAssetDir);
    const patches: Array<{ from: number; to: number; text: string }> = [];
    for (const ref of refs) {
      if (ref.kind !== 'local' || ref.absolutePath === null) {
        continue;
      }
      if (!isWithinDir(ref.absolutePath, oldAssetDir)) {
        continue;
      }
      const rel = ref.absolutePath.slice(oldAssetDir.length).replace(/^\/+/, '');
      const newAbs = joinPaths(newAssetDir, rel);
      const newSrc = computeRelativePath(docDir, newAbs) || basename(newAbs);
      patches.push({ from: ref.from, to: ref.to, text: buildImageMarkdown(newSrc, ref.alt) });
    }
    if (patches.length > 0) {
      this.deps.editor.patchChanges(patches);
    }
    return patches.length;
  }
}
