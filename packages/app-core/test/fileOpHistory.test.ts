/**
 * P5.4 FileOpHistory 直接单测（V4 计划 P5 File 行「rename/move/trash/undo」+ spec document-file-safety §8）。
 *
 * imageFileOps.test.ts 已通过真实路径间接覆盖 undo 主语义；
 * 本文件补齐栈语义边界：MAX_HISTORY 环绕、批量 undo 逆序、失败静默（copy/mkdir）、
 * describeOp 文案、clear。
 */

import { createMockHost } from '../../host-api/src/index';
import type { FileService } from '../../host-api/src/index';
import { FileOpHistory, describeOp } from '../src/fileOpHistory';

function setUp(files: Array<[string, string]> = []): { fs: FileService; history: FileOpHistory } {
  const mock = createMockHost({ files: new Map(files) });
  return { fs: mock.fs, history: new FileOpHistory(mock.fs) };
}

describe('P5.4 FileOpHistory — 栈语义（spec document-file-safety §8）', () => {
  test('push/peek/length：栈顶记录与默认 label（describeOp）', () => {
    const { history } = setUp();
    history.push({ kind: 'move', from: '/docs/a.md', to: '/docs/b.md' });
    expect(history.length).toBe(1);
    const top = history.peek();
    expect(top?.label).toBe('已移动 a.md');
    expect(top?.op.kind).toBe('move');
  });

  test('自定义 label 优先于 describeOp', () => {
    const { history } = setUp();
    history.push({ kind: 'rename', from: '/x/a.md', to: '/x/b.md' }, '已重命名 笔记');
    expect(history.peek()?.label).toBe('已重命名 笔记');
  });

  test('describeOp 四类默认文案（PRD §58 toast 风格）', () => {
    expect(describeOp({ kind: 'rename', from: '/d/old.md', to: '/d/new.md' })).toBe('已重命名 old.md');
    expect(describeOp({ kind: 'move', from: '/d/sub/n.md', to: '/d/n.md' })).toBe('已移动 n.md');
    expect(describeOp({ kind: 'copy', from: '/d/n.md', to: '/a/n.md' })).toBe('已复制 n.md');
    expect(describeOp({ kind: 'mkdir', path: '/d/assets' })).toBe('已创建目录 assets');
  });

  test('undo(1) rename：反向 rename(to→from) 实际生效', async () => {
    const { fs, history } = setUp([['/docs/renamed.md', 'NEW']]);
    history.push({ kind: 'rename', from: '/docs/original.md', to: '/docs/renamed.md' });
    const r = await history.undo();
    expect(r.ok).toBe(true);
    // 反向后：original.md 存在、renamed.md 消失
    expect(await fs.exists('/docs/original.md')).toEqual({ ok: true, value: true });
    expect(await fs.exists('/docs/renamed.md')).toEqual({ ok: true, value: false });
  });

  test('undo(n) 批量：逆序执行（栈顶先撤销），返回栈顶 label', async () => {
    const { fs, history } = setUp([
      ['/docs/moved.md', 'M'],
      ['/docs/copy-target.md', 'C'],
    ]);
    history.push({ kind: 'move', from: '/docs/src.md', to: '/docs/moved.md' });
    history.push({ kind: 'copy', from: '/docs/src.md', to: '/docs/copy-target.md' });
    const r = await history.undo(2);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe('已复制 src.md'); // 栈顶 label（copy 描述用源文件名）
    // 逆序：copy 先撤销（副本删除），move 再撤销
    expect(await fs.exists('/docs/copy-target.md')).toEqual({ ok: true, value: false });
    expect(await fs.exists('/docs/src.md')).toEqual({ ok: true, value: true });
    expect(await fs.exists('/docs/moved.md')).toEqual({ ok: true, value: false });
    expect(history.length).toBe(0);
  });

  test('undo 空栈 → invalid-argument，不抛错', async () => {
    const { history } = setUp();
    const r = await history.undo();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-argument');
  });

  test('undo(count) 超过栈深：只撤销现有记录，仍成功', async () => {
    const { history } = setUp();
    history.push({ kind: 'copy', from: '/a.md', to: '/b.md' });
    const r = await history.undo(5);
    expect(r.ok).toBe(true);
    expect(history.length).toBe(0);
  });

  test('MAX_HISTORY 环绕：push 101 条后栈保持 100、最旧被移出', async () => {
    const { history } = setUp();
    for (let i = 0; i < 101; i += 1) {
      history.push({ kind: 'copy', from: `/f${i}.md`, to: `/g${i}.md` });
    }
    expect(history.length).toBe(100);
    // 栈顶是第 101 条；撤销全部后最早（f0）不在栈中（已环绕丢弃）
    const r = await history.undo(100);
    expect(r.ok).toBe(true);
    expect(history.length).toBe(0);
  });

  test('copy undo：fs.remove 失败静默（bestEffort 语义，不抛错）', async () => {
    const { fs, history } = setUp();
    history.push({ kind: 'copy', from: '/a.md', to: '/missing-dir/b.md' });
    // 副本不存在 → remove 失败，但 undo 不应抛出未捕获错误
    const r = await history.undo();
    expect(r.ok).toBe(true);
    expect(fs).toBeDefined();
  });

  test('mkdir undo：目录非空 → 静默保留；目录空 → 删除', async () => {
    const { fs, history } = setUp([['/docs/assets/keep.png', 'K']]);
    history.push({ kind: 'mkdir', path: '/docs/assets' });
    const kept = await history.undo();
    expect(kept.ok).toBe(true); // 非空目录静默保留
    expect(await fs.exists('/docs/assets/keep.png')).toEqual({ ok: true, value: true });

    history.push({ kind: 'mkdir', path: '/docs/empty-dir' });
    const removed = await history.undo();
    expect(removed.ok).toBe(true);
    expect(await fs.exists('/docs/empty-dir')).toEqual({ ok: true, value: false });
  });

  test('rename undo 反向失败（目标缺失）→ ok:false + io 错误', async () => {
    const { history } = setUp();
    history.push({ kind: 'rename', from: '/x/a.md', to: '/x/b.md' }); // b.md 从未存在
    const r = await history.undo();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('io');
  });

  test('clear：清空后 undo → invalid-argument', async () => {
    const { history } = setUp();
    history.push({ kind: 'copy', from: '/a.md', to: '/b.md' });
    history.clear();
    expect(history.length).toBe(0);
    const r = await history.undo();
    expect(r.ok).toBe(false);
  });
});
