/**
 * 测试工具：**等状态**，不要等时间。
 *
 * ⚠️ 为什么补 `waitFor`（2026-10-09 实测一次偶发假红）：
 *   本仓多个测试用 `await sleep(N)` 等**异步 decoration** —— 那是**等时间**，
 *   在 CPU 竞争（jest 并行 worker / CI runner 负载）下 N 毫秒可能不够，
 *   于是 `document.querySelector(...)` 得到 `null`、断言偶发失败。
 *   实测：`test/task.test.ts` 的 `decorates unchecked tasks ...` 在
 *   `npm run parity` 的 vendored jest 步骤偶发报 `Received: null`（同一提交两次直跑均通过）。
 *   同 `test/lezer.test.ts` 的时序修复（见 `UPSTREAM.md`「修改的文件」表）思路一致：
 *   **等状态**而不是等时间。
 *
 * 用法：
 *   await waitFor(() => document.querySelector('.cm-md-taskMarker') !== null);
 */
// ⚠️ 必须 **先 import 再 export** —— 只写 `export { sleep } from '…'` 是**转发**，
//    **不会**把 `sleep` 引入本模块作用域 ⇒ 下面 `waitFor` 里用它会 TS2304（实测踩到一次）。
import { sleep } from '../../src/common/utils';

export { sleep };

/** 轮询 `predicate` 直到为真；超时则抛错（**带超时**，避免把「永远不满足」变成挂死） */
export async function waitFor(
  predicate: () => boolean,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor 超时（${timeout}ms）：状态始终未满足`);
    }
    await sleep(interval);
  }
}
