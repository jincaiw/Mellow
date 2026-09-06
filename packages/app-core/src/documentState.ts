/** Platform-neutral open-document state. File IO and dirty confirmation remain outside this model. */
import type { Encoding, LineEnding } from '../../host-api/src';

export interface TabDiskState { mtimeMs: number; identityKey: string; }
export interface DocumentTab { id: string; path: string | null; title: string; content: string; dirty: boolean; documentId: string; revision: number; encoding: Encoding; eol: LineEnding; diskState: TabDiskState | null; }
export interface DocumentSessionSnapshot { tabs: DocumentTab[]; activeId: string | null; closed: DocumentTab[]; }
/** Supports B1's {tab}, old {tabs,activeId}, and the current multi-document snapshot. */
export type DocumentStateInput = DocumentSessionSnapshot | { tab: DocumentTab | null } | { tabs: DocumentTab[]; activeId: string | null; closed?: DocumentTab[] };
export interface OpenDocumentInput { path: string | null; content: string; title?: string; dirty?: boolean; documentId?: string; revision?: number; encoding?: Encoding; eol?: LineEnding; diskState?: TabDiskState | null; }
export interface CloseResult { closed: DocumentTab | null; active: DocumentTab | null; }

const MAX_CLOSED = 20;
const titleFromPath = (path: string | null, fallback = '未命名') => path === null ? fallback : path.split(/[\\/]/).pop() || path;
const clone = (tab: DocumentTab): DocumentTab => ({ ...tab, diskState: tab.diskState === null ? null : { ...tab.diskState } });
const uuid = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export class DocumentState {
  private openTabs: DocumentTab[];
  private activeTabId: string | null;
  private closedTabs: DocumentTab[];

  constructor(input?: DocumentStateInput | null) {
    const state = pickFromInput(input);
    this.openTabs = state.tabs;
    this.activeTabId = state.activeId;
    this.closedTabs = state.closed;
  }

  get doc(): DocumentTab | null { const tab = this.openTabs.find((item) => item.id === this.activeTabId); return tab === undefined ? null : clone(tab); }
  get tabs(): DocumentTab[] { return this.openTabs.map(clone); }
  get activeId(): string | null { return this.activeTabId; }
  get closed(): DocumentTab[] { return this.closedTabs.map(clone); }
  findByPath(path: string): DocumentTab | null { const tab = this.openTabs.find((item) => item.path === path); return tab === undefined ? null : clone(tab); }

  /** Replaces the active document for legacy SDI callers. */
  open(input: OpenDocumentInput): DocumentTab {
    const tab = this.create(input); const index = this.openTabs.findIndex((item) => item.id === this.activeTabId);
    if (index === -1) this.openTabs.push(tab); else this.openTabs.splice(index, 1, tab);
    this.activeTabId = tab.id; return clone(tab);
  }
  openInNewTab(input: OpenDocumentInput): DocumentTab {
    const tab = this.create(input); const index = this.openTabs.findIndex((item) => item.id === this.activeTabId);
    this.openTabs.splice(index === -1 ? this.openTabs.length : index + 1, 0, tab); this.activeTabId = tab.id; return clone(tab);
  }
  newUntitled(content = ''): DocumentTab { return this.open({ path: null, content, title: '未命名', dirty: content.length > 0 }); }
  newUntitledInNewTab(content = ''): DocumentTab { return this.openInNewTab({ path: null, content, title: '未命名', dirty: content.length > 0 }); }
  setActive(id: string): DocumentTab | null { if (!this.openTabs.some((tab) => tab.id === id)) return null; this.activeTabId = id; return this.doc; }
  move(id: string, toIndex: number): DocumentTab[] {
    const fromIndex = this.openTabs.findIndex((tab) => tab.id === id);
    if (fromIndex === -1) return this.tabs;
    const [tab] = this.openTabs.splice(fromIndex, 1);
    this.openTabs.splice(Math.max(0, Math.min(toIndex, this.openTabs.length)), 0, tab);
    return this.tabs;
  }
  updateCurrent(patch: Partial<Omit<DocumentTab, 'id'>>): DocumentTab | null {
    const index = this.openTabs.findIndex((item) => item.id === this.activeTabId); if (index === -1) return null;
    Object.assign(this.openTabs[index], patch);
    if (patch.path !== undefined || patch.title !== undefined) this.openTabs[index].title = patch.title ?? titleFromPath(this.openTabs[index].path);
    return clone(this.openTabs[index]);
  }
  close(id = this.activeTabId): CloseResult {
    const index = this.openTabs.findIndex((item) => item.id === id); if (index === -1) return { closed: null, active: this.doc };
    const [closed] = this.openTabs.splice(index, 1); this.closedTabs.unshift(clone(closed)); this.closedTabs.splice(MAX_CLOSED);
    const next = id === this.activeTabId ? (this.openTabs[index] ?? this.openTabs[index - 1] ?? null) : this.doc; this.activeTabId = next?.id ?? null;
    return { closed: clone(closed), active: next === null ? null : clone(next) };
  }
  closeOthers(): DocumentTab[] { const active = this.doc; if (active === null) return []; const closed = this.openTabs.filter((tab) => tab.id !== active.id).map(clone); this.openTabs = [active]; this.closedTabs.unshift(...closed); this.closedTabs.splice(MAX_CLOSED); return closed; }
  closeRight(): DocumentTab[] { const index = this.openTabs.findIndex((tab) => tab.id === this.activeTabId); if (index === -1) return []; const closed = this.openTabs.splice(index + 1).map(clone); this.closedTabs.unshift(...closed); this.closedTabs.splice(MAX_CLOSED); return closed; }
  reopenClosed(): DocumentTab | null { const tab = this.closedTabs.shift(); if (tab === undefined) return null; const index = this.openTabs.findIndex((item) => item.id === this.activeTabId); this.openTabs.splice(index === -1 ? this.openTabs.length : index + 1, 0, tab); this.activeTabId = tab.id; return clone(tab); }
  clear(): void { this.openTabs = []; this.activeTabId = null; }
  snapshot(): DocumentSessionSnapshot { return { tabs: this.tabs, activeId: this.activeTabId, closed: this.closed }; }
  private create(input: OpenDocumentInput): DocumentTab { return { id: uuid(), path: input.path, title: input.title ?? titleFromPath(input.path), content: input.content, dirty: input.dirty ?? false, documentId: input.documentId ?? uuid(), revision: input.revision ?? 0, encoding: input.encoding ?? 'utf-8', eol: input.eol ?? '\n', diskState: input.diskState ?? null }; }
}

function pickFromInput(input: DocumentStateInput | null | undefined): DocumentSessionSnapshot {
  if (input === null || input === undefined) return { tabs: [], activeId: null, closed: [] };
  if ('tab' in input) return { tabs: input.tab === null ? [] : [clone(input.tab)], activeId: input.tab?.id ?? null, closed: [] };
  const tabs = input.tabs.map(clone); const activeId = input.activeId !== null && tabs.some((tab) => tab.id === input.activeId) ? input.activeId : tabs.at(-1)?.id ?? null;
  return { tabs, activeId, closed: ('closed' in input ? input.closed ?? [] : []).map(clone).slice(0, MAX_CLOSED) };
}
