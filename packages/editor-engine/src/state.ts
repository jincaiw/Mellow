/**
 * reveal policy —— NodeVisualState 状态机（spec §4/§5 纯函数，可独立测试）。
 *
 * 规则（spec §5）：
 *   1. caret intersects node edit range → source
 *   2. selection intersects syntax marker → source
 *   3. IME composition intersects node → source（插件层冻结不重算，此处供恢复后判定）
 *   4. node invalid/partial → source（无法提取 marker 时由管线按 source 处理）
 *   5. Source Mode → source
 *   6. user setting: always show markers → source
 *   默认（无任何命中）→ rendered
 */

import type { NodeVisualState, RevealContext, MarkerRange } from './types';
import { intersects } from './types';

/** 通用 reveal policy：返回节点视觉状态 */
export function classifyNodeState(
  node: { from: number; to: number },
  markers: MarkerRange[],
  ctx: RevealContext,
): NodeVisualState {
  // rule 5/6：Source Mode / always-show-markers
  if (ctx.forceSource) {
    return 'source';
  }

  // rule 3：IME composition 与节点相交 → source（composition 期间保持显示）
  if (ctx.composing && intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to)) {
    return 'source';
  }

  // rule 1：caret intersects node edit range → source
  if (intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to)) {
    return 'source';
  }

  // rule 2：selection intersects syntax marker → source
  if (markers.some((m) => intersects(ctx.caret.anchor, ctx.caret.head, m.from, m.to))) {
    return 'source';
  }

  // 默认：rendered（隐藏 marker，呈现最终排版）
  return 'rendered';
}

/** 当前节点是否应隐藏全部 marker（rendered 状态的渲染决策） */
export function shouldHideMarkers(state: NodeVisualState): boolean {
  return state === 'rendered';
}

/** 当前节点是否应显示全部 marker（source / invalid 的渲染决策） */
export function shouldShowMarkers(state: NodeVisualState): boolean {
  return state === 'source' || state === 'invalid';
}
