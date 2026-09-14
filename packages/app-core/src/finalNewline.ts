/**
 * 保存时补文末换行（V7-W6，G7-FEAT-12）。
 *
 * 对齐 Typora 1.14.9 的偏好项「Insert Final New Line On Save」
 * （配置键 `preferFinalNewline`，默认 `false`）。
 *
 * 一手证据（`Contents/Resources/TypeMark/appsrc/main.js` 的 `warpContentWithOption`）：
 *
 * ```js
 * return File.finalNewline && "\n" != e.substr(e.length - 1)
 *   ? e + (File.useCRLF ? "\r\n" : "\n")
 *   : e;
 * ```
 *
 * **语义要点（不是「规范化/裁剪」）**：
 * - 只在**缺失时追加**，从不删除已有换行 —— 关闭该选项时文件原样落盘；
 * - 追加的换行符**跟随文档当前 EOL**（CRLF 文档补 `\r\n`，否则补 `\n`）；
 * - 空文档也会被补成单个换行（Typora 的 `substr(-1)` 对空串返回 `''`，判定为「缺换行」）。
 *
 * 默认关闭 → 未开启时本函数是**恒等变换**，对既有行为零影响。
 *
 * 已知与 Typora 的差异（登记，见方案 G7-FEAT-12）：Typora 的 `File.finalNewline` 是
 * **逐文档**状态（打开时按「文档末尾是否已有换行」推断，且可由 `setFinalNewline` 单独切换并撤销），
 * 本实现只提供**全局**开关。
 */
export function applyFinalNewline(content: string, eol: string, enabled: boolean): string {
  if (!enabled) return content;
  if (content.endsWith('\n')) return content;
  return content + (eol === '\r\n' ? '\r\n' : '\n');
}
