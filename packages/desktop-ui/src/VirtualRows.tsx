/**
 * VirtualRows（P3.2 四模式虚拟化的共享窗口化容器）—— 零依赖。
 *
 * 用法：作为滚动容器（.file-tree-list / .file-list / .outline-list / .search-results）
 * 的直接子元素，通过 parentElement 探测滚动源；渲染时只挂载可见窗口 + overscan，
 * 上下用 padding 撑出总高度（不用 transform，保留 .search-group-title 的 sticky 语义）。
 *
 * 行高策略：估算值占位 + 渲染后实测（data-vrow），差异写回缓存触发一次重排，随后收敛。
 * 安全阀：滚动容器 overflow 为 visible（不可滚动，如测试/嵌入环境）时回退全量渲染。
 *
 * 目标行跟随（2026-11-08）：`scrollToIndex` / `scrollToNonce` 变化时按累积偏移把目标行
 * 滚入视口（block: 'nearest'）。此前四个列表各自 querySelector('.selected') +
 * scrollIntoView —— 目标行未挂载时查询为空，选中态变了但视口不动。现在统一由本组件
 * 先滚动窗口、等目标 DOM 挂载后再用真实矩形校正（行高实测收敛可能移动位置），
 * 同时保留手动滚动行为：只有显式请求（索引/计数器变化）才滚动，日常滚动不回拉。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { buildOffsets, findRange } from './virtual';

export interface VirtualRowsProps {
  /** 总行数。 */
  count: number;
  /** 渲染第 index 行内容（VirtualRows 负责包裹 div 与测量）。 */
  renderItem: (index: number) => ReactNode;
  /** 未实测行的高度估算（px）。 */
  estimateRowHeight?: number;
  /** 视口外额外渲染的行数（上下各）。 */
  overscan?: number;
  /** 变化时清空实测高度缓存（数据整体刷新时传入，如列表重建）。 */
  resetKey?: string | number;
  /**
   * 目标行索引（含分组标题行在内的**虚拟行**索引）。
   * 变化时把该行滚入视口；null/undefined/<0 表示无目标。
   */
  scrollToIndex?: number | null;
  /**
   * 强制再次滚动同一索引的计数器（如 Outline `Highlight Current Header`：
   * 当前项已是键盘选中项时 state 未变，仅靠索引无法重触发）。
   */
  scrollToNonce?: number;
}

/**
 * 计算把 `index` 行滚入视口所需 scrollTop（block: 'nearest' 语义）。
 * 已完全可见时返回原 scrollTop —— 不改动用户当前滚动位置。
 * 纯函数：供单测锁定「上方顶对齐 / 下方底对齐 / 边界 clamp」。
 */
export function scrollTopForRow(offsets: Float64Array, index: number, scrollTop: number, viewportH: number): number {
  const count = offsets.length - 1;
  if (count <= 0 || index < 0 || index >= count) return scrollTop;
  const viewport = Math.max(0, viewportH);
  const maxScroll = Math.max(0, offsets[count] - viewport);
  const rowTop = offsets[index];
  const rowBottom = offsets[index + 1];
  if (rowTop < scrollTop) return Math.min(Math.max(rowTop, 0), maxScroll);
  if (rowBottom > scrollTop + viewport) return Math.min(Math.max(rowBottom - viewport, 0), maxScroll);
  return scrollTop;
}

/** 目标行渲染后最多做几次矩形校正（行高实测收敛可能需要两轮）。 */
const MAX_SCROLL_VERIFY = 4;
/** 视口容差（亚像素/边框误差不触发滚动）。 */
const VISIBLE_TOLERANCE = 1;

/** 用真实 DOM 矩形把行校正到滚动容器可视范围内；发生滚动返回 true。 */
function adjustScrollForRect(scroller: HTMLElement, row: HTMLElement): boolean {
  const scrollerRect = scroller.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const top = scrollerRect.top + scroller.clientTop;
  const bottom = top + scroller.clientHeight;
  let delta = 0;
  if (rowRect.top < top - VISIBLE_TOLERANCE) delta = rowRect.top - top;
  else if (rowRect.bottom > bottom + VISIBLE_TOLERANCE) delta = rowRect.bottom - bottom;
  if (delta === 0) return false;
  scroller.scrollTop += delta;
  return true;
}

export function VirtualRows({ count, renderItem, estimateRowHeight = 30, overscan = 8, resetKey, scrollToIndex = null, scrollToNonce = 0 }: VirtualRowsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<number, number>>(new Map());
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [renderAll, setRenderAll] = useState(false);
  // 测量写回缓存的版本号：变更触发重算 offsets（行高收敛后不再变化，循环自然停止）
  const [heightsVersion, setHeightsVersion] = useState(0);
  const resetKeyRef = useRef<string | number | undefined>(resetKey);

  if (resetKeyRef.current !== resetKey) {
    // 数据标识变化即作废实测缓存（渲染期比对，不进 effect 链）
    resetKeyRef.current = resetKey;
    heightsRef.current.clear();
  }

  // 滚动容器探测 + 监听（root div 恒渲染，effect 生命周期稳定）
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroller = root?.parentElement;
    if (root === null || root === undefined || scroller === null || scroller === undefined) return;
    const overflowY = getComputedStyle(scroller).overflowY;
    if (overflowY === 'visible' || overflowY === 'clip') {
      // 不可滚动环境：回退全量渲染（正确性优先，量小无所谓）
      setRenderAll(true);
      return;
    }
    setViewportH(scroller.clientHeight);
    setScrollTop(scroller.scrollTop);
    const onScroll = () => {
      if (rafRef.current !== 0) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setScrollTop(scroller.scrollTop);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => setViewportH(scroller.clientHeight));
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  // 渲染后实测可见行高，收敛估算误差
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || renderAll) return;
    let changed = false;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-vrow]'));
    for (const row of rows) {
      const index = Number(row.dataset.vrow);
      const measured = row.offsetHeight;
      if (measured > 0 && heightsRef.current.get(index) !== measured) {
        heightsRef.current.set(index, measured);
        changed = true;
      }
    }
    if (changed) setHeightsVersion((v) => v + 1);
  });

  const estimate = Math.max(1, estimateRowHeight);
  const overscanRows = Math.max(0, overscan);
  const offsets = buildOffsets(count, (i) => heightsRef.current.get(i) ?? estimate);
  void heightsVersion; // 版本变化强制重算 offsets（heightsRef 不进依赖，防止 lint 抱怨）
  const range = renderAll || viewportH === 0
    ? { start: 0, end: renderAll ? count : 0 }
    : findRange(offsets, scrollTop, viewportH, overscanRows);
  // viewportH 尚未就绪（首帧）：挂载空窗口，effect 立即写入真实视口后重渲染
  const padTop = offsets[range.start];
  const padBottom = offsets[count] - offsets[range.end];

  // 目标行跟随：仅显式请求（索引 / 非计数器变化）触发；渲染后最多校正 MAX_SCROLL_VERIFY 轮。
  const appliedScrollKeyRef = useRef<string | null>(null);
  const scrollVerifyRef = useRef(0);
  const scrollTargetKey = scrollToIndex === null || scrollToIndex === undefined || scrollToIndex < 0
    ? null
    : `${scrollToIndex}:${scrollToNonce}`;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (scrollTargetKey === null || scrollToIndex === null || scrollToIndex === undefined || root === null) {
      // 目标被清空：允许同一索引下次重新触发
      appliedScrollKeyRef.current = null;
      scrollVerifyRef.current = 0;
      return;
    }
    const scroller = root.parentElement;
    if (scroller === null || scroller === undefined || viewportH === 0) return;
    if (appliedScrollKeyRef.current !== scrollTargetKey) {
      appliedScrollKeyRef.current = scrollTargetKey;
      scrollVerifyRef.current = MAX_SCROLL_VERIFY;
    }
    if (scrollVerifyRef.current <= 0) return;

    const targetRow = root.querySelector<HTMLElement>(`[data-vrow="${scrollToIndex}"]`);
    if (targetRow !== null) {
      // 目标已挂载：按真实矩形校正（估算行高与实测值的差异可能让目标偏出视口）
      if (adjustScrollForRect(scroller, targetRow)) setScrollTop(scroller.scrollTop);
      else scrollVerifyRef.current = 0;
      if (scrollVerifyRef.current > 0) scrollVerifyRef.current -= 1;
      return;
    }
    if (renderAll) {
      // 全量渲染下目标必然存在；到达此处说明索引越界，结束跟随
      scrollVerifyRef.current = 0;
      return;
    }
    // 目标未挂载：按累积偏移滚动到「最近可见位置」，触发窗口重算；下一轮渲染再校正
    const next = scrollTopForRow(offsets, scrollToIndex, scroller.scrollTop, scroller.clientHeight || viewportH);
    if (Math.abs(next - scroller.scrollTop) >= 0.5) {
      scroller.scrollTop = next;
      setScrollTop(scroller.scrollTop);
    }
    scrollVerifyRef.current -= 1;
  }, [scrollTargetKey, scrollToIndex, viewportH, renderAll, count, heightsVersion, scrollTop]);

  const rows: ReactNode[] = [];
  for (let i = range.start; i < range.end; i++) {
    rows.push(
      <div key={i} data-vrow={i}>{renderItem(i)}</div>,
    );
  }
  return (
    <div ref={rootRef} className="virtual-rows" data-virtual-count={count} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
      {rows}
    </div>
  );
}
