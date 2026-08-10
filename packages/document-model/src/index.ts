/**
 * document-model —— 文档模型（ADR-0008 Document Model / ADR-0009 File Safety）。
 *
 * 字段覆盖 spec §2：id / path / revision / dirty / encoding / EOL / disk mtime /
 * file identity / recovery id，并附加编辑器状态（cursor / scroll）。
 *
 * 关键设计：
 * - **唯一真源**（ADR-0005）：文档文本永远是 Markdown 纯文本。编辑期文本物理上在
 *   Editor（CM state）中，模型通过 `attachContentSource` 绑定实时源 —— 语义一致，
 *   避免 keystroke 级全文拷贝（10MB gate 性能要求）；
 * - **React 不持有副本**：模型是权威状态，UI 只读 `snapshot`（不可变对象）；
 * - **文档切换不共享 Undo History**：每个文档一个独立 DocumentModel 实例；
 *   编辑器侧由 resetEditor（重建 EditorView）保证历史隔离（CoreEditor 已实现，
 *   对应 spec §12 Release Blocker「document history crossing tabs」）；
 * - **unsaved / rename / move**：path 可空可变更，id 稳定不随 rename 变化；
 * - **Recovery / Conflict 准备**：recoveryId + recovery snapshot + 外部变更检测。
 */

// ─────────────────────────── 类型 ───────────────────────────

/** 文本编码（BOM 由加载管线检测并剥离，模型仅记录） */
export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'latin1';

/** 行尾 */
export type LineEnding = '\n' | '\r\n' | '\r';

/** 文件身份（跨平台抽象，Adapter 提供：macOS/Win/Linux 的 inode 或等价物） */
export interface FileIdentity {
  /** 平台文件身份键（st_ino / file index） */
  key: string;
  /** 设备标识（dev；区分不同文件系统） */
  device?: string;
}

/** 光标（编辑器主选区，模型记录供恢复/切换） */
export interface CursorState {
  anchor: number;
  head: number;
}

/** 滚动位置 */
export interface ScrollState {
  top: number;
  left: number;
}

/** 磁盘元数据（保存/外部变更检测时由 Adapter 提供） */
export interface DiskMetadata {
  /** 磁盘修改时间（epoch ms） */
  mtime: number;
  identity: FileIdentity;
  size?: number;
}

/** 外部变更检测结果 */
export type ExternalChangeState = 'unchanged' | 'modified' | 'replaced';

/** 文档快照（不可变，供 UI/恢复/比较） */
export interface DocumentSnapshot {
  id: string;
  path: string | null;
  content: string;
  revision: number;
  dirty: boolean;
  encoding: Encoding;
  eol: LineEnding;
  /** 最近一次保存时的磁盘 mtime；null = 从未保存 */
  diskMtime: number | null;
  /** 最近一次保存时的文件身份；null = 从未保存 */
  fileIdentity: FileIdentity | null;
  cursor: CursorState | null;
  scroll: ScrollState | null;
  recoveryId: string | null;
}

/** 恢复快照（AppData，keyed by document id，spec §6） */
export interface RecoverySnapshot {
  documentId: string;
  content: string;
  revision: number;
  cursor: CursorState | null;
  scroll: ScrollState | null;
  savedAt: number;
}

/** 编辑器实时全文源（避免 keystroke 级拷贝） */
export type ContentSource = () => string;

// ─────────────────────────── 实现 ───────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 检测行尾（首个出现者为准；无换行默认 LF） */
export function detectEol(content: string): LineEnding {
  const crlf = content.indexOf('\r\n');
  const lf = content.indexOf('\n');
  const cr = content.indexOf('\r');
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return '\r\n';
  if (cr !== -1 && (lf === -1 || cr < lf)) return '\r';
  return '\n';
}

interface InternalState {
  id: string;
  path: string | null;
  content: string;
  revision: number;
  dirty: boolean;
  encoding: Encoding;
  eol: LineEnding;
  diskMtime: number | null;
  fileIdentity: FileIdentity | null;
  cursor: CursorState | null;
  scroll: ScrollState | null;
  recoveryId: string | null;
}

export class DocumentModel {
  private state: InternalState;
  private source: ContentSource | null = null;

  private constructor(initial: Partial<InternalState>) {
    this.state = {
      id: initial.id ?? generateId(),
      path: initial.path ?? null,
      content: initial.content ?? '',
      revision: initial.revision ?? 0,
      dirty: initial.dirty ?? false,
      encoding: initial.encoding ?? 'utf-8',
      eol: initial.eol ?? '\n',
      diskMtime: initial.diskMtime ?? null,
      fileIdentity: initial.fileIdentity ?? null,
      cursor: initial.cursor ?? null,
      scroll: initial.scroll ?? null,
      recoveryId: initial.recoveryId ?? null,
    };
    // 打开时若未显式提供 EOL，按内容检测
    if (initial.eol === undefined) {
      this.state.eol = detectEol(this.state.content);
    }
  }

  // ── 生命周期 ──

  /** 新建 unsaved 文档（path=null，dirty=false；id 已生成） */
  static createNew(encoding: Encoding = 'utf-8'): DocumentModel {
    return new DocumentModel({ encoding, eol: '\n' });
  }

  /** 打开文档（dirty=false；disk 元数据记录供外部变更检测） */
  static open(
    path: string,
    content: string,
    disk?: DiskMetadata,
    options: { encoding?: Encoding } = {},
  ): DocumentModel {
    return new DocumentModel({
      path,
      content,
      encoding: options.encoding ?? 'utf-8',
      diskMtime: disk?.mtime ?? null,
      fileIdentity: disk?.identity ?? null,
      recoveryId: null,
    });
  }

  /** 从恢复快照恢复文档（spec §6 Recovery） */
  static fromRecovery(snapshot: RecoverySnapshot, path: string | null = null): DocumentModel {
    return new DocumentModel({
      id: snapshot.documentId,
      path,
      content: snapshot.content,
      revision: snapshot.revision,
      dirty: true,
      cursor: snapshot.cursor,
      scroll: snapshot.scroll,
      recoveryId: snapshot.documentId,
    });
  }

  // ── 编辑期（keystroke 级轻量操作，O(1)，无全文拷贝）──

  /** 绑定编辑器实时全文源（保存/恢复/比较时按需读取，避免 keystroke 级拷贝） */
  attachContentSource(source: ContentSource | null): void {
    this.source = source;
  }

  /** 内容已编辑（dirty=true, revision+1）—— 由编辑器 viewUpdate 驱动 */
  markContentEdited(): void {
    this.state.dirty = true;
    this.state.revision += 1;
  }

  updateCursor(cursor: CursorState | null): void {
    this.state.cursor = cursor;
  }

  updateScroll(scroll: ScrollState | null): void {
    this.state.scroll = scroll;
  }

  /** 设置恢复 id（保存/恢复会话关联） */
  setRecoveryId(recoveryId: string | null): void {
    this.state.recoveryId = recoveryId;
  }

  // ── 保存 / 文件操作 ──

  /**
   * 保存完成（spec §4 Save Pipeline 末尾）：
   * dirty=false，更新 path / disk mtime / file identity；revision 不变。
   */
  markSaved(path: string, disk: DiskMetadata): void {
    this.state.path = path;
    this.state.diskMtime = disk.mtime;
    this.state.fileIdentity = disk.identity;
    this.state.dirty = false;
    // 保存后刷新内容快照（与编辑器对齐，供后续未绑定源时使用）
    this.state.content = this.snapshotContent();
  }

  /** 重命名/移动（spec §8）：仅 path 更新；id / revision / dirty 不变 */
  rename(newPath: string): void {
    this.state.path = newPath;
  }

  /** 获取当前全文（唯一真源语义：优先编辑器实时源，否则内部快照） */
  snapshotContent(): string {
    if (this.source !== null) {
      return this.source();
    }
    return this.state.content;
  }

  // ── 外部变更 / Conflict 准备（spec §5）──

  /**
   * 检测磁盘外部变更：
   * - identity key/device 变化 → 'replaced'（文件被替换/删除重建）
   * - 仅 mtime 变化 → 'modified'
   * - 一致 → 'unchanged'
   * 调用方据此决定：local clean → auto reload；local dirty → Compare/Reload/Keep。
   */
  detectExternalChange(disk: DiskMetadata): ExternalChangeState {
    const saved = this.state.fileIdentity;
    if (saved === null) {
      return 'unchanged'; // 从未保存，无基准
    }
    if (saved.key !== disk.identity.key || saved.device !== disk.identity.device) {
      return 'replaced';
    }
    if (this.state.diskMtime !== null && disk.mtime !== this.state.diskMtime) {
      return 'modified';
    }
    return 'unchanged';
  }

  // ── Recovery 准备（spec §6）──

  /** 创建恢复快照（调用方负责落盘 AppData，keyed by document id） */
  createRecoverySnapshot(): RecoverySnapshot {
    return {
      documentId: this.state.id,
      content: this.snapshotContent(),
      revision: this.state.revision,
      cursor: this.state.cursor,
      scroll: this.state.scroll,
      savedAt: Date.now(),
    };
  }

  /** 清除恢复快照（保存管线完成时调用，spec §4） */
  clearRecovery(): void {
    this.state.recoveryId = null;
  }

  // ── 只读访问（React 不持有副本 —— 只读 snapshot）──

  get id(): string { return this.state.id; }
  get path(): string | null { return this.state.path; }
  get revision(): number { return this.state.revision; }
  get dirty(): boolean { return this.state.dirty; }
  get encoding(): Encoding { return this.state.encoding; }
  get eol(): LineEnding { return this.state.eol; }
  get diskMtime(): number | null { return this.state.diskMtime; }
  get fileIdentity(): FileIdentity | null { return this.state.fileIdentity; }
  get cursor(): CursorState | null { return this.state.cursor; }
  get scroll(): ScrollState | null { return this.state.scroll; }
  get recoveryId(): string | null { return this.state.recoveryId; }

  /** 不可变快照（每次返回新对象，调用方修改不影响内部状态） */
  get snapshot(): Readonly<DocumentSnapshot> {
    return {
      id: this.state.id,
      path: this.state.path,
      content: this.snapshotContent(),
      revision: this.state.revision,
      dirty: this.state.dirty,
      encoding: this.state.encoding,
      eol: this.state.eol,
      diskMtime: this.state.diskMtime,
      fileIdentity: this.state.fileIdentity
        ? { ...this.state.fileIdentity }
        : null,
      cursor: this.state.cursor ? { ...this.state.cursor } : null,
      scroll: this.state.scroll ? { ...this.state.scroll } : null,
      recoveryId: this.state.recoveryId,
    };
  }
}
