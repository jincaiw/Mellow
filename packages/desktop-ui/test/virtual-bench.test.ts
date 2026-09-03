/**
 * P3.10 Sidebar 计时微任务（V4 计划 3.10）——desktop-ui 侧 T12。
 *
 * 虚拟化内核（virtual.ts）微任务计时：buildOffsets 10k 随机行高 +
 * findRange ×1000 二分定位。与 `tests/benchmark/` 的 CGEvent 真机外部测量
 * 分层互补；与既有 `virtual.test.ts` 的性能冒烟互不影响（该文件不改）。
 *
 * 预算为实测的 ≥10×，超预算即失败；数据确定性伪随机，跨机器可复现。
 */
import { buildOffsets, findRange } from '../src/virtual';

jest.setTimeout(30000);

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const now = (): number => globalThis.performance.now();

describe('P3.10 Sidebar 计时微任务（T12：虚拟化内核）', () => {
  test('T12 buildOffsets 10k 随机行高 + findRange ×1000 二分定位', () => {
    const COUNT = 10000;
    const random = seededRandom(20260912);
    const heights = Array.from({ length: COUNT }, () => 20 + Math.floor(random() * 60));
    const VIEWPORT = 600;
    const OVERSCAN = 10;

    // T12a：buildOffsets 10k
    const t1 = now();
    const offsets = buildOffsets(COUNT, (i) => heights[i]);
    const buildMs = now() - t1;
    // eslint-disable-next-line no-console
    console.log(`[P3.10 bench] T12a buildOffsets(${COUNT} 随机行高): ${buildMs.toFixed(1)}ms（预算 200ms）`);
    expect(offsets.length).toBe(COUNT + 1);
    expect(buildMs).toBeLessThan(200);

    // T12b：findRange ×1000
    const t2 = now();
    let acc = 0;
    for (let i = 0; i < 1000; i++) {
      const { start, end } = findRange(offsets, i * 37, VIEWPORT, OVERSCAN);
      acc += end - start;
    }
    const findMs = now() - t2;
    // eslint-disable-next-line no-console
    console.log(`[P3.10 bench] T12b findRange ×1000（${COUNT} 行）: ${findMs.toFixed(1)}ms（预算 500ms）`);
    expect(acc).toBeGreaterThan(0);
    expect(findMs).toBeLessThan(500);
  });
});
