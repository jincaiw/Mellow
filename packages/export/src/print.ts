/**
 * Print 打印文档生成（PRD §77：Print 与 PDF 共享 print stylesheet）。
 *
 * buildPrintHtml 生成一个独立、自包含的打印 HTML：
 * - 复用 HTML 导出管线（self-contained：KaTeX CSS/字体、Mermaid bundle、图片全内联），
 *   离线（file:// / 无网络）打开即完整渲染；
 * - 内嵌打印样式表（printStyle.ts，与 PDF 排版常量一致）；
 * - 内嵌打印就绪脚本：Mermaid 渲染完成后向父窗口 postMessage('mellow-print-ready')，
 *   供宿主（iframe 打印 / 打印预览）在内容就绪后再调系统打印对话框。
 *
 * 桌面端当前直接打印主 Webview（Reader 内容 + 注入 PRINT_STYLESHEET），
 * 本模块为打印预览 / 独立打印窗口提供同一样式表的可测试实现。
 */

import { exportHtml, type HtmlExportEnv } from './html';
import { printStylesheet, type PrintPaperSize, type PrintStylesheetOptions } from './printStyle';
import type { PdfThemeName } from './typography';

export interface PrintOptions {
  theme?: PdfThemeName;
  paperSize?: PrintPaperSize;
  /** Custom 时纸张宽高（mm） */
  customWidthMm?: number;
  customHeightMm?: number;
  /** 页边距（pt），默认与 PDF 一致 60 */
  marginPt?: number;
  /** H1 前分页（对齐 PDF pageBreakAtH1，默认 true） */
  pageBreakAtH1?: boolean;
  /** 文档标题（缺省取第一个 H1） */
  title?: string;
  lang?: string;
  tocMaxLevel?: number;
  /** 无 [TOC] 标记时在开头插入目录 */
  includeOutline?: boolean;
}

/** 打印就绪脚本：Mermaid 渲染完成后通知父窗口；无 Mermaid 时 load 后即就绪；2.5s 兜底。 */
export const PRINT_READY_SCRIPT = `<script>
(function () {
  function ready() {
    try { if (window.parent && window.parent !== window) window.parent.postMessage('mellow-print-ready', '*'); } catch (e) { /* ignore */ }
  }
  var fallback = setTimeout(ready, 2500);
  window.addEventListener('mellow-mermaid-ready', function () { clearTimeout(fallback); setTimeout(ready, 50); });
  window.addEventListener('load', function () { clearTimeout(fallback); setTimeout(ready, 300); });
})();
</script>`;

export function buildPrintHtml(markdown: string, options: PrintOptions = {}, env: HtmlExportEnv = {}): Promise<string> {
  const theme = options.theme ?? 'light';
  const styleOptions: PrintStylesheetOptions = {
    theme,
    paperSize: options.paperSize,
    customWidthMm: options.customWidthMm,
    customHeightMm: options.customHeightMm,
    marginPt: options.marginPt,
    pageBreakAtH1: options.pageBreakAtH1,
  };
  return exportHtml(
    markdown,
    {
      mode: 'self-contained',
      theme,
      title: options.title,
      lang: options.lang,
      tocMaxLevel: options.tocMaxLevel,
      includeOutline: options.includeOutline,
      customCss: printStylesheet(styleOptions),
    },
    env,
  ).then((html) => {
    // 打印就绪脚本注入 </body> 前（exportHtml 输出结构固定）
    const closeBody = html.lastIndexOf('</body>');
    if (closeBody === -1) return html + PRINT_READY_SCRIPT;
    return `${html.slice(0, closeBody)}\n${PRINT_READY_SCRIPT}\n${html.slice(closeBody)}`;
  });
}
