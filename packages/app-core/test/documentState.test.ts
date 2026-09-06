import { DocumentState } from '../src/documentState';
import type { DocumentTab } from '../src/documentState';

describe('DocumentState（多文档状态与关闭历史）', () => {
  test('open 仅替换活动标签，不影响其他标签', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/docs/a.md', content: 'A' });
    expect(state.doc?.id).toBe(a.id);
    state.openInNewTab({ path: '/docs/keep.md', content: 'keep' });
    state.setActive(a.id);
    state.open({ path: '/docs/b.md', content: 'B' });
    expect(state.doc?.path).toBe('/docs/b.md');
    expect(state.doc?.id).not.toBe(a.id);
    expect(state.doc?.title).toBe('b.md');
    expect(state.tabs.map((tab) => tab.path)).toEqual(['/docs/b.md', '/docs/keep.md']);
  });

  test('newUntitled 生成空白未命名文档；内容非空即 dirty', () => {
    const state = new DocumentState();
    const blank = state.newUntitled();
    expect(blank.path).toBeNull();
    expect(blank.title).toBe('未命名');
    expect(blank.dirty).toBe(false);
    const draft = state.newUntitled('hi');
    expect(draft.dirty).toBe(true);
    expect(state.doc?.content).toBe('hi');
  });

  test('updateCurrent 就地更新 dirty/revision/path，title 跟随 path 归一', () => {
    const state = new DocumentState();
    const a = state.newUntitled();
    state.updateCurrent({ content: 'draft', dirty: true, revision: 1 });
    expect(state.doc?.dirty).toBe(true);
    expect(state.doc?.content).toBe('draft');
    expect(state.doc?.revision).toBe(1);
    state.updateCurrent({ path: '/docs/renamed.md' });
    expect(state.doc?.title).toBe('renamed.md');
    expect(state.doc?.id).toBe(a.id);
  });

  test('close 清空当前文档，返回被关闭的文档', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/a.md', content: 'A', dirty: true });
    const r = state.close();
    expect(r.closed?.id).toBe(a.id);
    expect(r.closed?.dirty).toBe(true);
    expect(state.doc).toBeNull();
    // 空状态下 close 幂等
    expect(state.close().closed).toBeNull();
  });

  test('session snapshot/restore 往返保留活动文档字段', () => {
    const state = new DocumentState();
    state.open({
      path: '/a.md',
      content: 'A',
      dirty: true,
      diskState: { mtimeMs: 1, identityKey: 'dev:ino' },
    });
    const snapshot = state.snapshot();
    const restored = new DocumentState(snapshot);
    expect(restored.doc?.path).toBe('/a.md');
    expect(restored.doc?.content).toBe('A');
    expect(restored.doc?.dirty).toBe(true);
    expect(restored.doc?.diskState).toEqual({ mtimeMs: 1, identityKey: 'dev:ino' });
    // 快照隔离：改动 restored 不影响原 state
    state.updateCurrent({ dirty: false });
    expect(restored.doc?.dirty).toBe(true);
  });

  test('无文档状态 snapshot 为空集合并可恢复为空', () => {
    const state = new DocumentState();
    expect(state.snapshot()).toEqual({ tabs: [], activeId: null, closed: [] });
    const restored = new DocumentState({ tab: null });
    expect(restored.doc).toBeNull();
  });

  test('new tab、关闭历史与恢复不改变 Markdown 文档身份', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/a.md', content: 'A', documentId: 'a' });
    const b = state.openInNewTab({ path: '/b.md', content: 'B', documentId: 'b' });
    expect(state.tabs.map((tab) => tab.path)).toEqual(['/a.md', '/b.md']);
    expect(state.doc?.id).toBe(b.id);
    expect(state.close().closed?.documentId).toBe('b');
    expect(state.doc?.id).toBe(a.id);
    const reopened = state.reopenClosed();
    expect(reopened?.id).toBe(b.id);
    expect(reopened?.documentId).toBe('b');
    expect(state.tabs.map((tab) => tab.path)).toEqual(['/a.md', '/b.md']);
  });

  test('关闭非活动标签不切走当前编辑文档', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/a.md', content: 'A' });
    const b = state.openInNewTab({ path: '/b.md', content: 'B' });
    const result = state.close(a.id);
    expect(result.closed?.id).toBe(a.id);
    expect(result.active?.id).toBe(b.id);
    expect(state.doc?.id).toBe(b.id);
    expect(state.closed[0]?.id).toBe(a.id);
  });

  test('关闭其他与右侧标签均进入关闭历史，活动标签不变', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/a.md', content: 'A' });
    const b = state.openInNewTab({ path: '/b.md', content: 'B' });
    state.openInNewTab({ path: '/c.md', content: 'C' });
    state.setActive(b.id);
    expect(state.closeRight().map((tab) => tab.path)).toEqual(['/c.md']);
    expect(state.doc?.id).toBe(b.id);
    expect(state.closeOthers().map((tab) => tab.id)).toEqual([a.id]);
    expect(state.tabs.map((tab) => tab.id)).toEqual([b.id]);
    expect(state.closed.map((tab) => tab.path)).toEqual(['/a.md', '/c.md']);
  });

  test('同一路径仅定位已有标签，不复制 Document Identity', () => {
    const state = new DocumentState();
    const original = state.open({ path: '/docs/a.md', content: 'A', documentId: 'doc-a' });
    expect(state.findByPath('/docs/a.md')).toMatchObject({ id: original.id, documentId: 'doc-a' });
    expect(state.findByPath('/docs/missing.md')).toBeNull();
  });

  test('拖拽排序只改变打开标签顺序，不改变活动文档与 Markdown 身份', () => {
    const state = new DocumentState();
    const a = state.open({ path: '/a.md', content: 'A', documentId: 'a' });
    const b = state.openInNewTab({ path: '/b.md', content: 'B', documentId: 'b' });
    const c = state.openInNewTab({ path: '/c.md', content: 'C', documentId: 'c' });
    state.setActive(b.id);
    state.move(c.id, 0);
    expect(state.tabs.map((tab) => tab.documentId)).toEqual(['c', 'a', 'b']);
    expect(state.doc?.id).toBe(b.id);
    expect(state.findByPath('/a.md')?.id).toBe(a.id);
  });

  test('兼容 v≤1.4.6 旧会话结构：activeId 命中优先，否则取最后一个', () => {
    const legacyTabs: DocumentTab[] = [
      { id: 't1', path: '/a.md', title: 'a.md', content: 'A', dirty: false, documentId: 'd1', revision: 0, encoding: 'utf-8', eol: '\n', diskState: null },
      { id: 't2', path: '/b.md', title: 'b.md', content: 'B', dirty: true, documentId: 'd2', revision: 2, encoding: 'utf-8', eol: '\n', diskState: null },
    ];
    const state = new DocumentState({ tabs: legacyTabs, activeId: 't2' });
    expect(state.doc?.id).toBe('t2');
    expect(state.doc?.path).toBe('/b.md');
    // activeId 不存在 → 取最后一个
    const fallback = new DocumentState({ tabs: legacyTabs, activeId: 'missing' });
    expect(fallback.doc?.id).toBe('t2');
    // 空 tabs → null
    expect(new DocumentState({ tabs: [], activeId: null }).doc).toBeNull();
  });
});
