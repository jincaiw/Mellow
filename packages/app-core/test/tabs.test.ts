import { TabManager, tabShortcutAction } from '../src/tabs';

describe('TabManager（PRD §11 Tabs）', () => {
  test('open documents, active and duplicate prevention by path', () => {
    const tabs = new TabManager();
    const a = tabs.open({ path: '/docs/a.md', content: 'A' });
    const b = tabs.open({ path: '/docs/b.md', content: 'B' });
    const again = tabs.open({ path: '/docs/a.md', content: 'NEW A' });
    expect(tabs.all.map((t) => t.path)).toEqual(['/docs/a.md', '/docs/b.md']);
    expect(tabs.active?.id).toBe(a.id);
    expect(again.content).toBe('A');
    expect(b.title).toBe('b.md');
  });

  test('dirty update and active switch', () => {
    const tabs = new TabManager();
    const a = tabs.newUntitled();
    tabs.updateActive({ content: 'draft', dirty: true, revision: 1 });
    const b = tabs.open({ path: '/docs/b.md', content: 'B' });
    tabs.setActive(a.id);
    expect(tabs.active?.dirty).toBe(true);
    expect(tabs.active?.content).toBe('draft');
    expect(tabs.active?.revision).toBe(1);
    tabs.setActive(b.id);
    expect(tabs.active?.path).toBe('/docs/b.md');
  });

  test('drag reorder keeps active tab', () => {
    const tabs = new TabManager();
    const a = tabs.open({ path: '/a.md', content: '' });
    const b = tabs.open({ path: '/b.md', content: '' });
    const c = tabs.open({ path: '/c.md', content: '' });
    tabs.setActive(b.id);
    tabs.reorder(c.id, 0);
    expect(tabs.all.map((t) => t.path)).toEqual(['/c.md', '/a.md', '/b.md']);
    expect(tabs.active?.id).toBe(b.id);
    expect(a.path).toBe('/a.md');
  });

  test('close active selects neighbor and records closed stack', () => {
    const tabs = new TabManager();
    tabs.open({ path: '/a.md', content: 'A' });
    const b = tabs.open({ path: '/b.md', content: 'B' });
    const c = tabs.open({ path: '/c.md', content: 'C' });
    tabs.setActive(b.id);
    const r = tabs.close(b.id);
    expect(r.closed?.path).toBe('/b.md');
    expect(r.active?.id).toBe(c.id);
    expect(tabs.all.map((t) => t.path)).toEqual(['/a.md', '/c.md']);
  });

  test('close others and close right', () => {
    const tabs = new TabManager();
    const a = tabs.open({ path: '/a.md', content: '' });
    const b = tabs.open({ path: '/b.md', content: '' });
    tabs.open({ path: '/c.md', content: '' });
    tabs.closeRight(a.id);
    expect(tabs.all.map((t) => t.path)).toEqual(['/a.md']);
    const d = tabs.open({ path: '/d.md', content: '' });
    tabs.open({ path: '/e.md', content: '' });
    tabs.closeOthers(d.id);
    expect(tabs.all.map((t) => t.path)).toEqual(['/d.md']);
    expect(tabs.active?.id).toBe(d.id);
    expect(b.path).toBe('/b.md');
  });

  test('reopen closed restores last closed as active with new tab id', () => {
    const tabs = new TabManager();
    const a = tabs.open({ path: '/a.md', content: 'A' });
    tabs.close(a.id);
    const restored = tabs.reopenClosed();
    expect(restored?.path).toBe('/a.md');
    expect(restored?.content).toBe('A');
    expect(restored?.id).not.toBe(a.id);
    expect(tabs.active?.id).toBe(restored?.id);
  });

  test('shortcut contract preserves Windows/Linux Ctrl+T for Table', () => {
    expect(tabShortcutAction({ platform: 'win-linux', key: 't', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBeNull();
    expect(tabShortcutAction({ platform: 'win-linux', key: 't', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBe('new-tab');
    expect(tabShortcutAction({ platform: 'mac', key: 't', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe('new-tab');
    expect(tabShortcutAction({ platform: 'mac', key: 't', ctrlKey: false, metaKey: true, altKey: true, shiftKey: false })).toBeNull();
    expect(tabShortcutAction({ platform: 'mac', key: 'w', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe('close-tab');
    expect(tabShortcutAction({ platform: 'win-linux', key: 't', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe('reopen-closed');
  });

  test('session snapshot/restore preserves tabs and active', () => {
    const tabs = new TabManager();
    tabs.open({ path: '/a.md', content: 'A' });
    const b = tabs.open({ path: '/b.md', content: 'B', dirty: true, diskState: { mtimeMs: 1, identityKey: 'dev:ino' } });
    const snapshot = tabs.snapshot();
    const restored = new TabManager(snapshot);
    expect(restored.all.map((t) => [t.path, t.content, t.dirty])).toEqual([
      ['/a.md', 'A', false],
      ['/b.md', 'B', true],
    ]);
    expect(restored.active?.id).toBe(b.id);
    expect(restored.active?.diskState).toEqual({ mtimeMs: 1, identityKey: 'dev:ino' });
  });
});
