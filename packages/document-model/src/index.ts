/**
 * document-model —— 文档模型（ADR-0008）。
 *
 * Document identity + revision + dirty + encoding + EOL + recovery state。
 * 最小实现（契约骨架）；recovery/conflict 属 Phase 5。
 */

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'latin1';
export type LineEnding = '\n' | '\r\n' | '\r';

export interface DocumentState {
  /** 文档标识（文件路径；未保存为 null） */
  path: string | null;
  /** 源文本（唯一真源，ADR-0005） */
  content: string;
  /** 是否未保存修改 */
  dirty: boolean;
  /** 文本编码（ADR-0008） */
  encoding: Encoding;
  /** 行尾（ADR-0008） */
  eol: LineEnding;
  /** 修订号（每次内容变更 +1；recovery 比对用） */
  revision: number;
}

export class DocumentModel {
  private state: DocumentState;

  constructor(initial: Partial<DocumentState> = {}) {
    this.state = {
      path: initial.path ?? null,
      content: initial.content ?? '',
      dirty: initial.dirty ?? false,
      encoding: initial.encoding ?? 'utf-8',
      eol: initial.eol ?? '\n',
      revision: 0,
    };
  }

  get path(): string | null { return this.state.path; }
  get content(): string { return this.state.content; }
  get dirty(): boolean { return this.state.dirty; }
  get encoding(): Encoding { return this.state.encoding; }
  get eol(): LineEnding { return this.state.eol; }
  get revision(): number { return this.state.revision; }
  /** 只读快照 */
  get snapshot(): Readonly<DocumentState> { return this.state; }

  /** 打开文档（重置状态，标记干净） */
  open(path: string, content: string): void {
    this.state = {
      path,
      content,
      dirty: false,
      encoding: 'utf-8',
      eol: this.detectEol(content),
      revision: 0,
    };
  }

  /** 编辑器内容变更（标记 dirty，修订 +1） */
  updateContent(content: string): void {
    this.state.content = content;
    this.state.dirty = true;
    this.state.revision += 1;
  }

  /** 保存成功（标记干净） */
  markSaved(path?: string): void {
    if (path !== undefined) {
      this.state.path = path;
    }
    this.state.dirty = false;
  }

  /** 新建文档 */
  newDocument(): void {
    this.state = {
      path: null,
      content: '',
      dirty: false,
      encoding: 'utf-8',
      eol: '\n',
      revision: 0,
    };
  }

  private detectEol(content: string): LineEnding {
    const crlf = content.indexOf('\r\n');
    const lf = content.indexOf('\n');
    const cr = content.indexOf('\r');
    if (crlf !== -1 && (lf === -1 || crlf < lf)) return '\r\n';
    if (cr !== -1 && cr !== crlf && (lf === -1 || cr < lf)) return '\r';
    return '\n';
  }
}
