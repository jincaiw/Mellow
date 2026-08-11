/**
 * RecoveryService —— 崩溃恢复协调（spec §6）。
 *
 * - 与 Auto Save 分离：快照只写 AppData recovery 目录（RecoveryStorage），绝不触碰原文件；
 * - debounce snapshot：编辑变更后防抖写入（默认 800ms），多次编辑合并为一次；
 * - document-id mapping：快照 keyed by documentId；
 * - cleanup after successful save：保存成功后 delete 快照；
 * - 启动发现：listPending → 恢复/比较/忽略。
 */

import type {
  RecoveryStorage,
  RecoveryPayload,
  RecoveryEntry,
  Result,
} from '../../host-api/src/index';

export class RecoveryService {
  private pending: RecoveryPayload | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: RecoveryStorage,
    private readonly debounceMs = 800,
  ) {}

  /** 编辑变更 → 防抖快照（多次编辑合并为一次写入） */
  scheduleSnapshot(snapshot: RecoveryPayload): void {
    this.pending = snapshot;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** 立即保存待写快照（主动 flush / 窗口关闭前） */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot = this.pending;
    this.pending = null;
    if (snapshot === null) {
      return;
    }
    await this.storage.save(snapshot);
  }

  /** 启动发现：列出未恢复快照 */
  async listPending(): Promise<Result<RecoveryEntry[]>> {
    return this.storage.list();
  }

  /** 恢复：读取快照 */
  async recover(documentId: string): Promise<Result<RecoveryPayload | null>> {
    return this.storage.get(documentId);
  }

  /** 忽略：删除快照 */
  async ignore(documentId: string): Promise<Result<void>> {
    return this.storage.delete(documentId);
  }

  /** 保存成功后 cleanup（spec §4：clear recovery snapshot） */
  async onSaved(documentId: string): Promise<Result<void>> {
    return this.storage.delete(documentId);
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }
}
