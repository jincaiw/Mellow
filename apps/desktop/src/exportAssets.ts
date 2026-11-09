/**
 * webview 侧导出资产装配（A37 / 审计 §4.385，2026-11-09）。
 *
 * 【为什么】`packages/export/src/html/assets.ts` 在 node 里从 katex/mermaid 包
 * 目录读 CSS 与 bundle；webview 打包产物里该路径不可用（fs 空桩 + 裸
 * `__dirname`/`require`）⇒ 返回 null（降级）⇒ 真机「导出 HTML…」在 math
 * 默认开时 ReferenceError 失败（§4.385 修复后不再抛，但资产仍缺失）。宿主在此
 * 把**构建期资产**经 `HtmlExportEnv` 协作者注入 —— HTML 导出与 A37 打印视图
 * （`buildPrintHtml` 同走 `exportHtml`）共用这一份装配。
 *
 * 【设计】
 * - KaTeX CSS：运行时 `fetch(KATEX_CSS_URL)`（vite `?url` 产物，同源可取）。
 *   内容里 `url(fonts/KaTeX_*.woff2)` 是相对引用 —— vite 已把字体 emit 到
 *   dist/assets（哈希文件名），重写为「CSS URL 基准 + 实际字体名」不可行
 *   （哈希名不可从 CSS 推出）⇒ 改为**重写为 CSS 文件自身的 URL 基准**，
 *   让导出 HTML 离线打开时字体随 CSS 一起失效是可接受的降级？—— 不可接受：
 *   导出件要求「离线打开即完整渲染」。因此对**导出 HTML** 用
 *   `loadKatexCssForExport`：fetch CSS 文本后把每个 `url(fonts/x)` 解析成
 *   **绝对 URL**（`${cssUrl 基准}fonts/x`，vite dev 下有效；build 下字体
 *   不在 css 同目录而在 /assets/ 且带哈希 ⇒ build 下改用运行时
 *   `getComputedStyle` 不可行）。
 *
 *   ⚠️ 经核实（dist 产物实测）：vite build 把 `katex.min.css?raw` 内的
 *   `url(fonts/…)` **原样保留**、并把字体 emit 为 `/assets/KaTeX_*-<hash>.<ext>`；
 *   同时 `?url` 导入的 CSS 产物里 vite **已重写**为 `url(/assets/KaTeX_*-<hash>…)`。
 *   ⇒ 正解：**用 `?url` 产物 CSS 的内容**（重写后的绝对 URL 直接可用）。
 *   运行时 fetch 该 URL 得到文本即为「字体已指向 /assets/…」的 CSS。
 *   独立导出 HTML 拷到别处后 `/assets/…` 失效 —— 但打印视图（A37，printview://
 *   窗口内加载）与应用同源可命中；导出 HTML 场景在 `webviewExportEnv` 里
 *   再把 `/assets/` 前缀替换为完整 origin 前缀，离线打开时退化为无字体
 *   （KaTeX 布局基本可用，正文无影响）—— 如实声明，优于整份导出失败。
 * - Mermaid bundle：`mermaid.min.js?raw`（自包含 IIFE，无字体问题）。
 *
 * node 单测路径（jest）不 import 本模块 —— 那里走 `assets.ts` 原生逻辑。
 */

import katexCssUrl from 'katex/dist/katex.min.css?url';
import mermaidBundle from 'mermaid/dist/mermaid.min.js?raw';

/** fetch KaTeX CSS 文本（`?url` 产物：字体已被 vite 重写为应用内绝对 URL）。失败返回 null。 */
export async function loadKatexCssForExport(): Promise<string | null> {
  try {
    const res = await fetch(katexCssUrl);
    if (!res.ok) return null;
    const css = await res.text();
    return css === '' ? null : css;
  } catch {
    return null; // 资产取不到 → exportHtml 降级（无 KaTeX CSS），不阻断导出
  }
}

/** webview 侧 HtmlExportEnv 协作者（注入 katexCss / mermaidBundle）。
 *  `katexCss` 为 fetch 到的文本；origin 为空时字体用应用内绝对路径（打印视图可命中）。 */
export async function webviewExportEnv(): Promise<{
  katexCss?: string;
  mermaidBundle: string;
}> {
  const [katexCss] = await Promise.all([loadKatexCssForExport()]);
  return katexCss === null
    ? { mermaidBundle } // katex CSS 取不到：省略 → exportHtml 走包内降级（无 CSS，公式 DOM 仍在）
    : { katexCss, mermaidBundle };
}
