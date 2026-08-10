/**
 * Marker 节点识别 —— 基于 Lezer Markdown 语法树。
 *
 * 结论（实测 @lezer/markdown）：语法树原生提供 marker 子节点：
 *   `# Title`        → ATXHeading1 + HeaderMark（`#`，不含后续空格）
 *   `*em*`           → Emphasis + EmphasisMark x2
 *   `**bold**`       → StrongEmphasis + EmphasisMark x2
 *   `__u__`          → StrongEmphasis + EmphasisMark x2
 *   `~~strike~~`     → Strikethrough + StrikethroughMark x2
 *   `` `code` ``     → InlineCode + CodeMark x2
 *   `` ``a`b`` ``    → InlineCode + CodeMark x2（GFM 双 backtick）
 *
 * 因此「应隐藏的 marker 范围」= marker 子节点范围，无需文本分析。
 */

/** 内容节点（决定 reveal 状态的祖先节点） */
export const CONTENT_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'Emphasis',
  'StrongEmphasis',
  'Strikethrough',
  'InlineCode',
]);

/** marker 子节点（应被视觉隐藏的范围） */
export const MARKER_NODE_NAMES: ReadonlySet<string> = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
]);

/**
 * Heading marker 范围（含 `#` 后的空格，与 Typora 一致：隐藏 `# `）。
 *
 * @param headingText 内容节点（ATXHeading*）的完整文本，如 "# Title" / "#Title" / "##   X"
 * @returns marker 结束偏移（相对节点起点）；无法识别返回 null
 */
export function headingMarkerEnd(headingText: string): number | null {
  const match = headingText.match(/^#{1,6}\s*/);
  return match === null ? null : match[0].length;
}
