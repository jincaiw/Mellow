/**
 * P3.2 虚拟化内核单测（V4 计划 3.2 Exit Gate：10k/1000/1万 不阻塞）。
 * 覆盖：offsets 构建、二分窗口定位（含 clamp / overscan / 空集）、
 * 窗口大小上界（DOM 节点不随数据量增长）、10k 随机行高正确性（对照线性扫描）、性能冒烟。
 */
import { buildOffsets, findRange } from '../src/virtual';

/** 线性扫描参照实现（慢但直观，用于交叉验证二分结果）。 */
function findRangeLinear(offsets: Float64Array, scrollTop: number, viewportH: number, overscan: number): { start: number; end: number } {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const bottom = scrollTop + Math.max(0, viewportH);
  let first = count;
  for (let i = 0; i < count; i++) {
    if (offsets[i + 1] > scrollTop) { first = i; break; }
  }
  let last = count;
  for (let j = first; j < count; j++) {
    if (offsets[j] >= bottom) { last = j; break; }
  }
  return { start: Math.max(0, first - Math.max(0, overscan)), end: Math.min(count, last + Math.max(0, overscan)) };
}

/** 可复现的伪随机（测试不依赖 Math.random 顺序稳定性）。 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('buildOffsets', () => {
  test('空集：长度 1，唯一偏移为 0', () => {
    const offsets = buildOffsets(0, () => 28);
    expect(offsets.length).toBe(1);
    expect(offsets[0]).toBe(0);
  });

  test('统一行高：offsets[i] = i * h', () => {
    const offsets = buildOffsets(5, () => 28);
    expect(Array.from(offsets)).toEqual([0, 28, 56, 84, 112, 140]);
  });

  test('可变行高：逐行累加', () => {
    const heights = [10, 20, 30];
    const offsets = buildOffsets(3, (i) => heights[i]);
    expect(Array.from(offsets)).toEqual([0, 10, 30, 60]);
  });
});

describe('findRange', () => {
  const offsets = buildOffsets(100, () => 28); // 每行 28px，总高 2800

  test('滚动到顶部：0 起，含 overscan', () => {
    const { start, end } = findRange(offsets, 0, 280, 8);
    expect(start).toBe(0);
    expect(end).toBe(Math.ceil(280 / 28) + 8); // 10 可见 + 8 overscan
  });

  test('滚动到中部：窗口覆盖可见行 + 前后 overscan', () => {
    const scrollTop = 28 * 50; // 第 50 行顶部
    const { start, end } = findRange(offsets, scrollTop, 280, 8);
    expect(start).toBe(42); // 50 - 8
    expect(end).toBe(50 + 10 + 8);
  });

  test('滚动超出末尾：end clamp 到 count，不越界', () => {
    const { start, end } = findRange(offsets, 99999, 280, 8);
    expect(end).toBe(100);
    expect(start).toBeLessThanOrEqual(100);
  });

  test('空集返回空窗口', () => {
    const empty = buildOffsets(0, () => 28);
    expect(findRange(empty, 0, 600, 8)).toEqual({ start: 0, end: 0 });
  });

  test('viewport 为 0 时窗口仍有限（仅 overscan）', () => {
    const { start, end } = findRange(offsets, 28 * 50, 0, 8);
    expect(end - start).toBeLessThanOrEqual(17);
  });

  test('负 overscan 视为 0（防御）', () => {
    const { start, end } = findRange(offsets, 28 * 50, 280, -5);
    expect(start).toBe(50);
    expect(end).toBe(60);
  });
});

describe('P3.2 Exit Gate：10k 量级窗口上界与正确性', () => {
  const COUNT = 10000;
  const random = seededRandom(20260902);
  const heights = Array.from({ length: COUNT }, () => 20 + Math.floor(random() * 60)); // 20–79px 可变行高
  const offsets = buildOffsets(COUNT, (i) => heights[i]);
  const VIEWPORT = 600;
  const OVERSCAN = 10;
  // 上界 = 可见行（viewport/最小行高，向上取整 + 1）+ 前后 overscan
  const MAX_WINDOW = Math.ceil(VIEWPORT / 20) + 1 + OVERSCAN * 2;

  test('DOM 窗口大小有上界，不随 10k 数据量增长', () => {
    for (let scrollTop = 0; scrollTop < offsets[COUNT]; scrollTop += 137) {
      const { start, end } = findRange(offsets, scrollTop, VIEWPORT, OVERSCAN);
      expect(end - start).toBeLessThanOrEqual(MAX_WINDOW);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(COUNT);
    }
  });

  test('随机滚动位置：二分结果与线性扫描一致', () => {
    const rand = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      const scrollTop = Math.floor(rand() * (offsets[COUNT] + 2000)) - 1000;
      const expected = findRangeLinear(offsets, Math.max(0, scrollTop), VIEWPORT, OVERSCAN);
      const actual = findRange(offsets, Math.max(0, scrollTop), VIEWPORT, OVERSCAN);
      expect(actual).toEqual(expected);
    }
  });

  test('性能冒烟：10k offsets + 1000 次二分定位远低于交互预算', () => {
    const started = Date.now();
    let acc = 0;
    for (let i = 0; i < 1000; i++) {
      const { start, end } = findRange(offsets, i * 37, VIEWPORT, OVERSCAN);
      acc += end - start;
    }
    const elapsed = Date.now() - started;
    expect(acc).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500); // 宽松预算：本机实测 < 20ms
  });
});
