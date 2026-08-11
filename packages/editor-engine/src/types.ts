/**
 * 通用框架类型 —— Live Markdown Engine 核心抽象（spec §2/§4/§5）。
 */

/** 节点视觉状态（spec §4） */
export type NodeVisualState = 'source' | 'rendered' | 'mixed' | 'invalid';

/** 应被视觉隐藏的 marker 范围（kind 供 mixed 节点区分类型） */
export interface MarkerRange {
  from: number;
  to: number;
  /** marker 类型（默认 'marker'；link 用 'url'/'text-marker'/'url-marker'） */
  kind?: string;
}

/** Reveal 判定上下文（spec §5：caret/selection/composition/source-mode/setting） */
export interface RevealContext {
  /** 主选区（caret = anchor === head） */
  caret: { anchor: number; head: number };
  /** 是否处于 IME composition（期间插件冻结不重算，状态机在恢复后应用） */
  composing?: boolean;
  /** Source Mode / 用户设置 always-show-markers（spec §5.5/5.6） */
  forceSource?: boolean;
}

/**
 * 节点规格：注册后引擎按 contentNodeNames 匹配 Lezer 节点，
 * 用 markerNodeNames 定位 marker 子节点，extractMarkers 计算隐藏范围。
 *
 * 未来节点（list/quote/link/image/table...）注册新 NodeSpec 即可，
 * 无需改动管线（spec §9-19 各节点策略差异通过 classify 定制）。
 */
export interface NodeSpec {
  /** 内容节点名（如 ATXHeading1/StrongEmphasis/InlineCode） */
  contentNodeNames: readonly string[];
  /** marker 子节点名（如 HeaderMark/EmphasisMark/CodeMark） */
  markerNodeNames: readonly string[];
  /**
   * marker 范围提取（绝对 doc 偏移）：对 marker 子节点计算隐藏范围。
   * 返回 null → 按 source 处理（不隐藏，安全 fallback / invalid）。
   * 默认实现返回子节点自身范围；heading 等需定制（含空格）。
   */
  extractMarkers?(node: { from: number; to: number; name: string; text: string }, parent: { from: number; text: string }): MarkerRange[] | null;
  /**
   * 节点视觉状态分类：默认用通用 reveal policy（caret/selection/forceSource）。
   * 需要 mixed 语义的节点（link/image/table）可定制（spec §12/13/17）。
   */
  classify?(node: { from: number; to: number; text: string }, markers: MarkerRange[], ctx: RevealContext): NodeVisualState;
  /**
   * 返回「应隐藏」的 marker 子集（mixed 部分隐藏，spec §4 mixed）。
   * 默认：state === 'rendered' → 全部；否则无。
   * link 定制：按 caret 在 text/url 区域决定隐藏哪些 marker（spec §12）。
   */
  hiddenMarkers?(node: { from: number; to: number; text: string }, markers: MarkerRange[], ctx: RevealContext, state: NodeVisualState): MarkerRange[];
}

/** 区间相交（闭区间，caret 在边界内即 intersects，spec §5.1/5.2） */
export function intersects(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}
