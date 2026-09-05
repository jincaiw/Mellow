/**
 * Calculate the font size, take headers into account.
 *
 * For example, if the regular font size is 15, "# Heading 1" goes with 20 (15 + 5) by default.
 *
 * @param level Heading level
 * @returns Font size for a *possible* header
 */
export function calculateFontSize(fontSize: number, level: number) {
  // V5：Typora Github 主题真值（2.25/1.75/1.5/1.25/1/1 em @16px → +20/+12/+8/+4/+0/+0）
  const diffs = window.config.headerFontSizeDiffs ?? [20, 12, 8, 4, 0, 0];
  return fontSize + ([0, ...diffs][level] || 0);
}
