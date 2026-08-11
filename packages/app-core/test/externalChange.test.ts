/**
 * ExternalChangeService unit tests —— clean auto-reload / dirty conflict / 三选项 / 事件种类。
 * 使用独立 watcher stub（测试完全可控，不依赖 host-api mock 内部 state）。
 */

import { ok } from '../../host-api/src/index';
import type { WatchService, FileChangeEvent, Result } from '../../host-api/src/index';
import { ExternalChangeService, type ExternalChangeDetail } from '../src/externalChange';

/** 可控 watcher stub */
function createWatcherStub() {
  const callbacks = new Map<string, (event: FileChangeEvent) => void>();
  const watcher: WatchService = {
    async watch(path: string, onChange: (event: FileChangeEvent) => void): Promise<Result<() => void>> {
      callbacks.set(path, onChange);
      return ok(() => { callbacks.delete(path); });
    },
  };
  return { watcher, callbacks };
}

function change(over: Partial<FileChangeEvent>): FileChangeEvent {
  return { path: '/a.md', mtimeMs: 2000, identityKey: 'dev:1', kind: 'modify', ...over };
}

function setUp(initial: { mtimeMs: number | null; identityKey: string | null; dirty: boolean }) {
  const { watcher, callbacks } = createWatcherStub();
  const calls = {
    cleanChanges: [] as FileChangeEvent[],
    conflicts: [] as ExternalChangeDetail[],
    diskUpdates: [] as Array<{ mtimeMs: number; identityKey: string }>,
  };
  const disk = { mtimeMs: initial.mtimeMs, identityKey: initial.identityKey };

  const svc = new ExternalChangeService(watcher, {
    getDiskState: () => disk,
    isDirty: () => initial.dirty,
    onCleanChange: (e) => calls.cleanChanges.push(e),
    onConflict: (d) => calls.conflicts.push(d),
    updateDiskState: (m, i) => { disk.mtimeMs = m; disk.identityKey = i; calls.diskUpdates.push({ mtimeMs: m, identityKey: i }); },
  });

  return { svc, callbacks, calls, disk };
}

describe('ExternalChangeService', () => {
  test('clean + modify → onCleanChange + 更新磁盘基准', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 2000 }));

    expect(calls.cleanChanges).toHaveLength(1);
    expect(calls.conflicts).toHaveLength(0);
    expect(calls.diskUpdates).toEqual([{ mtimeMs: 2000, identityKey: 'dev:1' }]);
    await svc.stop();
  });

  test('dirty + modify → onConflict（禁止覆盖，不更新基准）', async () => {
    const { svc, callbacks, calls, disk } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: true });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 2000, kind: 'modify' }));

    expect(calls.conflicts).toEqual([{ path: '/a.md', diskMtimeMs: 2000, identityKey: 'dev:1', kind: 'modify' }]);
    expect(calls.cleanChanges).toHaveLength(0);
    expect(disk.mtimeMs).toBe(1000); // 基准未更新（禁止覆盖）
    await svc.stop();
  });

  test('无基准（新文档）→ 仅记录磁盘状态', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: null, identityKey: null, dirty: false });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 3000 }));

    expect(calls.cleanChanges).toHaveLength(0);
    expect(calls.conflicts).toHaveLength(0);
    expect(calls.diskUpdates).toEqual([{ mtimeMs: 3000, identityKey: 'dev:1' }]);
    await svc.stop();
  });

  test('磁盘状态一致（自保存事件）→ 不触发', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 2000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 2000, identityKey: 'dev:1' }));

    expect(calls.cleanChanges).toHaveLength(0);
    expect(calls.conflicts).toHaveLength(0);
    await svc.stop();
  });

  test('identity 变化（Git checkout / 文件替换）→ 触发变更', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 1000, identityKey: 'dev:2' }));

    expect(calls.cleanChanges).toHaveLength(1); // replaced 也触发
    await svc.stop();
  });

  test('remove / rename 事件种类透传（dirty → conflict）', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: true });
    await svc.start('/a.md');
    callbacks.get('/a.md')!(change({ mtimeMs: 0, identityKey: '', kind: 'remove' }));

    expect(calls.conflicts[0].kind).toBe('remove');
    await svc.stop();
  });

  test('rapid repeated updates：多次事件各自处理（防抖在 watcher 层）', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    const cb = callbacks.get('/a.md')!;
    cb(change({ mtimeMs: 2000 }));
    cb(change({ mtimeMs: 3000 }));
    cb(change({ mtimeMs: 4000 }));

    expect(calls.cleanChanges).toHaveLength(3);
    await svc.stop();
  });

  test('start 更换路径：旧监听取消', async () => {
    const { svc, callbacks } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    await svc.start('/b.md');
    expect(callbacks.has('/a.md')).toBe(false);
    expect(callbacks.has('/b.md')).toBe(true);
    await svc.stop();
  });

  test('stop 后取消监听', async () => {
    const { svc, callbacks, calls } = setUp({ mtimeMs: 1000, identityKey: 'dev:1', dirty: false });
    await svc.start('/a.md');
    await svc.stop();
    expect(callbacks.has('/a.md')).toBe(false);
    expect(calls.cleanChanges).toHaveLength(0);
  });
});
