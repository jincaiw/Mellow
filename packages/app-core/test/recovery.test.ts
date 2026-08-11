/**
 * RecoveryService unit tests —— debounce / cleanup / multiple docs / 恢复流程。
 * 使用 fake timers 验证防抖语义；存储层用 host-api mock（经接口断言）。
 */

import { createMockHost, createMockHostState } from '../../host-api/src/mock-host';
import type { RecoveryPayload } from '../../host-api/src/index';
import { RecoveryService } from '../src/recovery';

function snapshot(docId: string, content: string, revision = 1): RecoveryPayload {
  return {
    documentId: docId,
    path: `/doc-${docId}.md`,
    content,
    revision,
    encoding: 'utf-8',
    eol: '\n',
    cursor: { anchor: 0, head: 0 },
    scroll: null,
    savedAt: Date.now(),
  };
}

/** 读取 mock 存储中的快照（接口断言） */
async function storedContent(host: ReturnType<typeof createMockHost>, docId: string): Promise<string | null> {
  const r = await host.recovery.get(docId);
  return r.ok && r.value !== null ? r.value.content : null;
}

describe('RecoveryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('debounce：多次编辑合并为一次快照（不早于 debounce 触发）', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    const svc = new RecoveryService(host.recovery, 800);

    svc.scheduleSnapshot(snapshot('d1', 'v1'));
    svc.scheduleSnapshot(snapshot('d1', 'v2'));
    svc.scheduleSnapshot(snapshot('d1', 'v3'));

    // 未到 debounce：尚未写入
    expect(await storedContent(host, 'd1')).toBeNull();
    jest.advanceTimersByTime(799);
    expect(await storedContent(host, 'd1')).toBeNull();
    jest.advanceTimersByTime(1); // 800ms 到
    await Promise.resolve();

    expect(await storedContent(host, 'd1')).toBe('v3'); // 最后一次快照
    svc.dispose();
  });

  test('flush 立即保存待写快照', async () => {
    const host = createMockHost();
    const svc = new RecoveryService(host.recovery, 800);
    svc.scheduleSnapshot(snapshot('d2', 'draft'));
    await svc.flush();
    expect(await storedContent(host, 'd2')).toBe('draft');
    svc.dispose();
  });

  test('cleanup after successful save：onSaved 删除快照', async () => {
    const host = createMockHost();
    const svc = new RecoveryService(host.recovery, 800);
    svc.scheduleSnapshot(snapshot('d3', 'x'));
    await svc.flush();
    expect(await storedContent(host, 'd3')).toBe('x');

    await svc.onSaved('d3'); // 保存成功 → cleanup
    expect(await storedContent(host, 'd3')).toBeNull();
    svc.dispose();
  });

  test('multiple documents：各自快照独立', async () => {
    const host = createMockHost();
    const svc = new RecoveryService(host.recovery, 800);
    svc.scheduleSnapshot(snapshot('d-a', 'AAA'));
    svc.scheduleSnapshot(snapshot('d-b', 'BBB'));
    await svc.flush();

    expect(await storedContent(host, 'd-a')).toBe('AAA');
    expect(await storedContent(host, 'd-b')).toBe('BBB');

    // 删除一个不影响另一个
    await svc.onSaved('d-a');
    expect(await storedContent(host, 'd-a')).toBeNull();
    expect(await storedContent(host, 'd-b')).toBe('BBB');
    svc.dispose();
  });

  test('启动发现 + 恢复流程（listPending → recover → 忽略）', async () => {
    const host = createMockHost();
    const svc = new RecoveryService(host.recovery, 800);
    svc.scheduleSnapshot(snapshot('d4', 'crash content', 5));
    await svc.flush();

    // 模拟"重启"（新 service 实例）
    const restarted = new RecoveryService(host.recovery, 800);
    const list = await restarted.listPending();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0].documentId).toBe('d4');
      expect(list.value[0].revision).toBe(5);
    }

    // 恢复
    const payload = await restarted.recover('d4');
    expect(payload).toEqual({ ok: true, value: expect.objectContaining({ content: 'crash content' }) });

    // 忽略 → 快照删除
    await restarted.ignore('d4');
    expect(await storedContent(host, 'd4')).toBeNull();
    restarted.dispose();
  });
});
