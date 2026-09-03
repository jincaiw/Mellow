/**
 * P3.2 虚拟化纯数学内核（零依赖，独立于 React 可单测）。
 *
 * 设计约束（V4 计划 3.2 Exit Gate：10k 文件 / 1000 headings / 1 万结果不阻塞）：
 * - 窗口大小有上界：viewport 内行数 + 前后 overscan，DOM 节点数不随数据量增长；
 * - 定位用二分查找：O(log n)，10k 量级滚动无感知；
 * - 行高未知时用估算值占位，实测后（VirtualRows 测量）逐步收敛。
 */

/** 累积偏移：offsets[0] = 0，offsets[i+1] = offsets[i] + heightAt(i)，长度 count + 1。 */
export function buildOffsets(count: number, heightAt: (index: number) => number): Float64Array {
  const offsets = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + heightAt(i);
  return offsets;
}

export interface VirtualRange {
  /** 首个渲染行（含 overscan，clamp 到 [0, count]）。 */
  start: number;
  /** 结束行（不含，含 overscan，clamp 到 [0, count]）。 */
  end: number;
}

/**
 * 在累积偏移上二分查找可见窗口。
 * - start：最后一个 offset 底边 > scrollTop 的行，再向前扩 overscan；
 * - end：首个 offset 顶边 >= scrollTop + viewportH 的行，再向后扩 overscan。
 */
export function findRange(offsets: Float64Array, scrollTop: number, viewportH: number, overscan: number): VirtualRange {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  // 第一个满足 offsets[i + 1] > scrollTop 的行 i（即底边越过视口顶部的第一行）
  let lo = 0;
  let hi = count - 1;
  let first = count;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid + 1] > scrollTop) {
      first = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  // 第一个满足 offsets[j] >= scrollTop + viewportH 的行 j（顶边达到视口底部的第一行）
  lo = first;
  hi = count - 1;
  let last = count;
  const bottom = scrollTop + Math.max(0, viewportH);
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] >= bottom) {
      last = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  const start = Math.max(0, first - Math.max(0, overscan));
  const end = Math.min(count, last + Math.max(0, overscan));
  return { start, end };
}
