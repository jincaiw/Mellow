import type { FileService } from '../../host-api/src';
import { err, ok } from '../../host-api/src';
import { fuzzyScore, QuickOpenModel, quickOpenShortcutAction, rankQuickOpen, scanQuickOpen } from '../src/quickOpen';

function fs(paths: string[]): FileService {
  return {
    open: async () => err({ code: 'canceled', message: 'unused' }),
    openPath: async () => err({ code: 'not-implemented', message: 'unused' }),
    save: async () => err({ code: 'not-implemented', message: 'unused' }),
    readText: async () => err({ code: 'not-implemented', message: 'unused' }),
    writeText: async () => err({ code: 'not-implemented', message: 'unused' }),
    readDir: async (dir) => {
      const entries = new Map<string, { path: string; name: string; isDirectory: boolean }>();
      const prefix = dir.replace(/\/$/, '');
      for (const p of paths) {
        if (!p.startsWith(`${prefix}/`)) continue;
        const rest = p.slice(prefix.length + 1);
        if (rest.includes('/')) {
          const name = rest.split('/')[0];
          entries.set(`${prefix}/${name}`, { path: `${prefix}/${name}`, name, isDirectory: true });
        } else {
          entries.set(p, { path: p, name: rest, isDirectory: false });
        }
      }
      return ok([...entries.values()]);
    },
    exists: async () => ok(false),
    rename: async () => ok(undefined),
    move: async () => ok(undefined),
    trash: async () => ok(undefined),
    delete: async () => ok(undefined),
    remove: async () => ok(undefined),
    copyFile: async () => ok(undefined),
    mkdir: async () => ok(undefined),
    writeBinary: async () => ok(undefined),
    readBinary: async () => ok(new ArrayBuffer(0)),
    download: async (_url, targetPath) => ok({ path: targetPath, bytes: 0 }),
  };
}

describe('Quick Open fuzzy/ranking/keyboard', () => {
  test('fuzzy matches filename, relative path, Chinese and Unicode', () => {
    expect(fuzzyScore('readme', 'rdm')).toBeGreaterThan(0);
    expect(fuzzyScore('docs/快速开始.md', '快开')).toBeGreaterThan(0);
    expect(fuzzyScore('emoji/📘指南.md', '📘指')).toBeGreaterThan(0);
    expect(fuzzyScore('abc', 'zx')).toBeNull();
  });

  test('rank uses filename/path and recent boost', () => {
    const ranked = rankQuickOpen([
      { path: '/ws/docs/install.md', filename: 'install.md', relativePath: 'docs/install.md' },
      { path: '/ws/README.md', filename: 'README.md', relativePath: 'README.md' },
      { path: '/ws/docs/readme-old.md', filename: 'readme-old.md', relativePath: 'docs/readme-old.md' },
    ], 'read', ['/ws/docs/readme-old.md']);
    expect(ranked.map((r) => r.path)[0]).toBe('/ws/docs/readme-old.md');
  });

  test('shortcuts do not conflict with tabs/table contract', () => {
    expect(quickOpenShortcutAction({ platform: 'win-linux', key: 'p', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('quick-open');
    expect(quickOpenShortcutAction({ platform: 'mac', key: 'O', ctrlKey: false, metaKey: true, shiftKey: true })).toBe('quick-open');
    expect(quickOpenShortcutAction({ platform: 'mac', key: 'p', ctrlKey: false, metaKey: true, shiftKey: false })).toBeNull();
  });

  test('keyboard only selection moves and opens', () => {
    const model = new QuickOpenModel();
    const items = [
      { path: '/a.md', filename: 'a.md', relativePath: 'a.md' },
      { path: '/b.md', filename: 'b.md', relativePath: 'b.md' },
    ];
    expect(model.navigate(items, 'down').selectedIndex).toBe(1);
    expect(model.navigate(items, 'up').selectedIndex).toBe(0);
    expect(model.navigate(items, 'enter').open).toBe('/a.md');
  });
});

describe('Quick Open progressive scan', () => {
  test('emits batches before scanning all directories', async () => {
    const batches: string[][] = [];
    const result = await scanQuickOpen('/ws', fs(['/ws/a.md', '/ws/dir/b.md', '/ws/dir/deep/c.md']), {
      batchSize: 1,
      onBatch: (items) => batches.push(items.map((i) => i.relativePath)),
    });
    expect(result.ok).toBe(true);
    expect(batches[0]).toEqual(['a.md']);
    expect(batches.flat()).toEqual(['a.md', 'dir/b.md', 'dir/deep/c.md']);
  });
});
