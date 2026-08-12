/**
 * 三平台统一 Tabs 纯逻辑（PRD §11 / T-0301）。
 *
 * 仅管理平台无关 tab 状态；文件 IO、确认对话框、快捷键映射在 desktop Adapter/UI 层。
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

export interface TabSessionSnapshot {
  tabs: DocumentTab[];
  activeId: string | null;
  closed: DocumentTab[];
}

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
  active: DocumentTab | null;
}

const MAX_CLOSED = 20;

export type TabPlatform = 'mac' | 'win-linux';
export type TabShortcutAction = 'new-tab' | 'close-tab' | 'reopen-closed' | null;

export interface TabShortcutInput {
  platform: TabPlatform;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * PRD Shortcut Contract：
 * - macOS：Cmd+T = New Tab；Cmd+Option+T 由 Table 使用
 * - Windows/Linux：Ctrl+T 保留给 Typora Table；New Tab = Ctrl+Alt+T
 */
export function tabShortcutAction(input: TabShortcutInput): TabShortcutAction {
  const key = input.key.toLowerCase();
  const mod = input.platform === 'mac' ? input.metaKey : input.ctrlKey;
  if (!mod) return null;
  if (input.platform === 'mac' && key === 't' && !input.altKey && !input.shiftKey) return 'new-tab';
  if (input.platform === 'win-linux' && key === 't' && input.altKey && !input.shiftKey) return 'new-tab';
  if (key === 'w' && !input.altKey) return 'close-tab';
  if (key === 't' && input.shiftKey && !input.altKey) return 'reopen-closed';
  return null;
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
    : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class TabManager {
  private tabs: DocumentTab[];
  private activeId: string | null;
  private closed: DocumentTab[];

  constructor(snapshot?: Partial<TabSessionSnapshot>) {
    this.tabs = snapshot?.tabs?.map(clone) ?? [];
    this.activeId = snapshot?.activeId !== undefined && this.tabs.some((t) => t.id === snapshot.activeId)
      ? snapshot.activeId
      : this.tabs[0]?.id ?? null;
    this.closed = snapshot?.closed?.map(clone) ?? [];
  }

  get all(): DocumentTab[] { return this.tabs.map(clone); }
  get active(): DocumentTab | null {
    if (this.activeId === null) return null;
    const tab = this.tabs.find((t) => t.id === this.activeId) ?? this.tabs[0];
    return tab === undefined ? null : clone(tab);
  }
  get activeIndex(): number { return this.activeId === null ? -1 : this.tabs.findIndex((t) => t.id === this.activeId); }
  get canReopenClosed(): boolean { return this.closed.length > 0; }

  snapshot(): TabSessionSnapshot {
    return { tabs: this.all, activeId: this.activeId, closed: this.closed.map(clone) };
  }

  open(input: OpenDocumentInput): DocumentTab {
    if (input.path !== null) {
      const existing = this.tabs.find((t) => t.path === input.path);
      if (existing !== undefined) {
        this.activeId = existing.id;
        return clone(existing);
      }
    }
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
    this.tabs.push(tab);
    this.activeId = tab.id;
    return clone(tab);
  }

  newUntitled(content = ''): DocumentTab {
    return this.open({ path: null, content, title: '未命名', dirty: content.length > 0 });
  }

  setActive(id: string): DocumentTab | null {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab === undefined) return null;
    this.activeId = id;
    return clone(tab);
  }

  update(id: string, patch: Partial<Omit<DocumentTab, 'id'>>): DocumentTab | null {
    const tab = this.tabs.find((t) => t.id === id);
    if (tab === undefined) return null;
    Object.assign(tab, patch);
    if (patch.path !== undefined || patch.title !== undefined) {
      tab.title = patch.title ?? titleFromPath(tab.path);
    }
    return clone(tab);
  }

  updateActive(patch: Partial<Omit<DocumentTab, 'id'>>): DocumentTab | null {
    return this.activeId === null ? null : this.update(this.activeId, patch);
  }

  reorder(id: string, toIndex: number): DocumentTab[] {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from === -1) return this.all;
    const [tab] = this.tabs.splice(from, 1);
    const safe = Math.max(0, Math.min(toIndex, this.tabs.length));
    this.tabs.splice(safe, 0, tab);
    return this.all;
  }

  close(id: string): CloseResult {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return { closed: null, active: this.active };
    const [closed] = this.tabs.splice(index, 1);
    this.pushClosed(closed);
    if (this.activeId === id) {
      this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null;
    }
    return { closed: clone(closed), active: this.active };
  }

  closeOthers(id: string): DocumentTab[] {
    const keep = this.tabs.find((t) => t.id === id);
    if (keep === undefined) return this.all;
    for (const tab of this.tabs) if (tab.id !== id) this.pushClosed(tab);
    this.tabs = [keep];
    this.activeId = id;
    return this.all;
  }

  closeRight(id: string): DocumentTab[] {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return this.all;
    const removed = this.tabs.splice(index + 1);
    for (const tab of removed) this.pushClosed(tab);
    if (this.activeId !== null && !this.tabs.some((t) => t.id === this.activeId)) this.activeId = id;
    return this.all;
  }

  reopenClosed(): DocumentTab | null {
    const tab = this.closed.shift();
    if (tab === undefined) return null;
    const restored = clone(tab);
    restored.id = uuid();
    this.tabs.push(restored);
    this.activeId = restored.id;
    return clone(restored);
  }

  private pushClosed(tab: DocumentTab): void {
    this.closed.unshift(clone(tab));
    if (this.closed.length > MAX_CLOSED) this.closed.length = MAX_CLOSED;
  }
}
