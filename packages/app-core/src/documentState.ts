/**
 * app-core —— 单文档状态模型（B1 SDI：一窗口 ⇔ 一文档，多文档 = 多窗口）。
 *
 * 由第四轮 B1 决策 D2=1b 收敛自 tabs.ts（PRD §11 Tabs）：
 * - 删除多标签语义：tabs[] / activeId / closed 栈 / reorder / closeOthers /
 *   closeRight / setActive / reopenClosed / 按路径去重的 open；
 * - 保留并归一单文档字段：path / content / title / dirty / documentId /
 *   revision / encoding / eol / diskState，及 update 类方法（updateCurrent 等）等价物；
 * - 会话快照从 { tabs[], activeId, closed[] } 收敛为 { tab | null }；
 *   读取时兼容 v1.4.6 及更早的 localStorage 旧结构（取 activeId 命中的文档，
 *   无则取最后一个）——旧数据不迁移、仅一次性读取兼容；
 * - closed 栈随「重新打开关闭的文件」(⌘⇧T) 一并移除（B1 D5：无标签即无 closed 概念）。
 *
 * 平台无关纯逻辑：文件 IO / 确认对话框 / 快捷键映射在 desktop Adapter/UI 层。
 */

import type { Encoding, LineEnding } from '../../host-api/src';

export interface TabDiskState {
  mtimeMs: number;
  identityKey: string;
}

export interface DocumentTab {
  id: string;
  path: string | null;
  title: string;
  content: string;
  dirty: boolean;
  documentId: string;
  revision: number;
  encoding: Encoding;
  eol: LineEnding;
  diskState: TabDiskState | null;
}

/** 会话快照（SDI 单文档）：当前窗口的文档，或 null（窗口内无文档） */
export interface DocumentSessionSnapshot {
  tab: DocumentTab | null;
}

/** DocumentState 构造输入：新结构 { tab } 或 v≤1.4.6 旧结构 { tabs, activeId } */
export type DocumentStateInput =
  | DocumentSessionSnapshot
  | { tabs: DocumentTab[]; activeId: string | null };

export interface OpenDocumentInput {
  path: string | null;
  content: string;
  title?: string;
  dirty?: boolean;
  documentId?: string;
  revision?: number;
  encoding?: Encoding;
  eol?: LineEnding;
  diskState?: TabDiskState | null;
}

export interface CloseResult {
  closed: DocumentTab | null;
}

function titleFromPath(path: string | null, fallback = '未命名'): string {
  if (path === null) return fallback;
  return path.split(/[\\/]/).pop() || path;
}

function clone(tab: DocumentTab): DocumentTab {
  return { ...tab, diskState: tab.diskState === null ? null : { ...tab.diskState } };
}

function uuid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 单文档状态（SDI）。窗口生命周期内至多承载一个文档：
 * - 打开新文档 = 替换当前文档（替换前的 dirty 确认由 UI 层 guard 负责）；
 * - 关闭 = 清空为 null（SDI 下 UI 随即关窗或回落空白「未命名」）。
 */
export class DocumentState {
  private tab: DocumentTab | null;

  constructor(input?: DocumentStateInput | null) {
    this.tab = pickFromInput(input);
  }

  /** 当前文档（无 → null）。语义同旧 TabManager.active。 */
  get doc(): DocumentTab | null {
    return this.tab === null ? null : clone(this.tab);
  }

  /** 打开/替换为单个文档。调用方须先完成 dirty 确认（guardSingleDocument）。 */
  open(input: OpenDocumentInput): DocumentTab {
    const tab: DocumentTab = {
      id: uuid(),
      path: input.path,
      title: input.title ?? titleFromPath(input.path),
      content: input.content,
      dirty: input.dirty ?? false,
      documentId: input.documentId ?? uuid(),
      revision: input.revision ?? 0,
      encoding: input.encoding ?? 'utf-8',
      eol: input.eol ?? '\n',
      diskState: input.diskState ?? null,
    };
    this.tab = tab;
    return clone(tab);
  }

  /** 新建空白「未命名」文档（替换当前文档；内容非空则视为 dirty）。 */
  newUntitled(content = ''): DocumentTab {
    return this.open({ path: null, content, title: '未命名', dirty: content.length > 0 });
  }

  /** 就地更新当前文档字段（title 跟随 path 自动归一）。 */
  updateCurrent(patch: Partial<Omit<DocumentTab, 'id'>>): DocumentTab | null {
    if (this.tab === null) return null;
    Object.assign(this.tab, patch);
    if (patch.path !== undefined || patch.title !== undefined) {
      this.tab.title = patch.title ?? titleFromPath(this.tab.path);
    }
    return clone(this.tab);
  }

  /** 关闭当前文档（清空）。SDI 语义：调用方随后关窗或回落空白文档。 */
  close(): CloseResult {
    const closed = this.tab === null ? null : clone(this.tab);
    this.tab = null;
    return { closed };
  }

  /** 清空当前文档（不返回关闭对象；guard 丢弃确认通过后调用）。 */
  clear(): void {
    this.tab = null;
  }

  /** 会话快照（持久化用；SDI 下仅记录单文档）。 */
  snapshot(): DocumentSessionSnapshot {
    return { tab: this.tab === null ? null : clone(this.tab) };
  }
}

function pickFromInput(input: DocumentStateInput | null | undefined): DocumentTab | null {
  if (input === null || input === undefined) return null;
  if ('tab' in input) {
    return input.tab === null ? null : clone(input.tab);
  }
  // 旧结构（v≤1.4.6 mellow.tabs.session）：activeId 命中优先，无则取最后一个
  const { tabs, activeId } = input;
  if (tabs === undefined || tabs.length === 0) return null;
  const active = activeId !== null ? tabs.find((t) => t.id === activeId) : undefined;
  return clone(active ?? tabs[tabs.length - 1]);
}
