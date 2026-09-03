/**
 * VirtualRows（P3.2 四模式虚拟化的共享窗口化容器）—— 零依赖。
 *
 * 用法：作为滚动容器（.file-tree-list / .file-list / .outline-list / .search-results）
 * 的直接子元素，通过 parentElement 探测滚动源；渲染时只挂载可见窗口 + overscan，
 * 上下用 padding 撑出总高度（不用 transform，保留 .search-group-title 的 sticky 语义）。
 *
 * 行高策略：估算值占位 + 渲染后实测（data-vrow），差异写回缓存触发一次重排，随后收敛。
 * 安全阀：滚动容器 overflow 为 visible（不可滚动，如测试/嵌入环境）时回退全量渲染。
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
}

export function VirtualRows({ count, renderItem, estimateRowHeight = 30, overscan = 8, resetKey }: VirtualRowsProps) {
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
