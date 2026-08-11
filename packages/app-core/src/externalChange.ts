/**
 * ExternalChangeService —— 外部文件变化协调（spec §5）。
 *
 * - Clean document：磁盘变化 → 自动重新加载（保持 caret/scroll，由调用方以
 *   documentChanged=false 调用 resetEditor 实现）；
 * - Dirty document：磁盘变化 → 禁止覆盖 → onConflict（Compare / Reload Disk / Keep Local 三选项）；
 * - 无磁盘基准（新文档/恢复后）→ 仅记录磁盘状态；
 * - rapid repeated updates 由 watcher 层防抖合并（Rust DebounceState）。
 */

import type {
  WatchService,
  FileChangeEvent,
  Result,
} from '../../host-api/src/index';

export interface ExternalChangeDetail {
  path: string;
  diskMtimeMs: number;
  identityKey: string;
  kind: FileChangeEvent['kind'];
}

export interface ExternalChangeServiceOptions {
  /** 当前文档记录的磁盘状态（无基准 → mtimeMs/identityKey 为 null） */
  getDiskState(): { mtimeMs: number | null; identityKey: string | null };
  /** 当前文档是否 dirty */
  isDirty(): boolean;
  /** clean + 磁盘变化 → 自动重载（调用方读盘 + editor.open(content, undefined, false) 保持 caret/scroll） */
  onCleanChange(event: FileChangeEvent): void;
  /** dirty + 磁盘变化 → 冲突三选项（Compare / Reload Disk / Keep Local） */
  onConflict(detail: ExternalChangeDetail): void;
  /** 更新磁盘状态基准（auto reload 后 / 无基准首次记录） */
  updateDiskState(mtimeMs: number, identityKey: string): void;
}

export class ExternalChangeService {
  private unwatch: (() => void) | null = null;

  constructor(
    private readonly watcher: WatchService,
    private readonly options: ExternalChangeServiceOptions,
  ) {}

  /** 开始监听文档路径（先停旧监听） */
  async start(path: string): Promise<void> {
    await this.stop();
    const result: Result<() => void> = await this.watcher.watch(path, (event) => this.handle(event));
    if (result.ok) {
      this.unwatch = result.value;
    }
  }

  /** 停止监听 */
  async stop(): Promise<void> {
    if (this.unwatch !== null) {
      this.unwatch();
      this.unwatch = null;
    }
  }

  dispose(): void {
    void this.stop();
  }

  private handle(event: FileChangeEvent): void {
    const disk = this.options.getDiskState();

    // 无磁盘基准（新文档/恢复后）：记录当前磁盘状态，不触发
    if (disk.mtimeMs === null || disk.identityKey === null) {
      this.options.updateDiskState(event.mtimeMs, event.identityKey);
      return;
    }

    // 外部变更判定：mtime 或 file identity 变化（remove/rename 时 mtimeMs=0 / identity 为空）
    const changed = disk.mtimeMs !== event.mtimeMs || disk.identityKey !== event.identityKey;
    if (!changed) {
      return; // 自保存或无关事件
    }

    if (this.options.isDirty()) {
      // Dirty：禁止覆盖，交给用户三选项（spec §5）
      this.options.onConflict({
        path: event.path,
        diskMtimeMs: event.mtimeMs,
        identityKey: event.identityKey,
        kind: event.kind,
      });
    } else {
      // Clean：自动重新加载（先更新基准，避免事件重入）
      this.options.updateDiskState(event.mtimeMs, event.identityKey);
      this.options.onCleanChange(event);
    }
  }
}
