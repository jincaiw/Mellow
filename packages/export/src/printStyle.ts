/**
 * Print 打印样式表（PRD §77：Print 与 PDF 共享 print stylesheet）。
 *
 * - 零依赖模块：desktop 前端直接 import 本模块注入主文档 <style>，
 *   不引入 export 包其余依赖（katex/markdown-it 等）；
 * - 数值与 PDF 导出（typography.ts / pdfmake）一致：字号、行高、页边距、配色；
 * - @page 规则控制纸张与边距（系统打印对话框读取）；
 * - @media print 内的规则只在打印时生效（屏幕显示不受影响）；
 * - print-color-adjust: exact 保留代码块等背景色（对应 PDF printBackground）。
 */

import { PDF_THEME_COLORS, PDF_TYPOGRAPHY, headingFontSize, type PdfThemeName } from './typography';

export type PrintPaperSize = 'A4' | 'A5' | 'Letter' | 'Custom';

export interface PrintStylesheetOptions {
  theme?: PdfThemeName;
  paperSize?: PrintPaperSize;
  /** Custom 时纸张宽高（mm） */
  customWidthMm?: number;
  customHeightMm?: number;
  /** 页边距（pt），默认与 PDF 一致 60 */
  marginPt?: number;
  /** H1 前分页（对齐 PDF pageBreakAtH1，默认 true） */
  pageBreakAtH1?: boolean;
}

const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function pageSizeCss(options: Required<Pick<PrintStylesheetOptions, 'paperSize' | 'customWidthMm' | 'customHeightMm'>>): string {
  switch (options.paperSize) {
    case 'A5':
      return 'A5';
    case 'Letter':
      return 'letter';
    case 'Custom':
      return `${options.customWidthMm ?? 210}mm ${options.customHeightMm ?? 297}mm`;
    case 'A4':
    default:
      return 'A4';
  }
}

export function printStylesheet(options: PrintStylesheetOptions = {}): string {
  const theme: PdfThemeName = options.theme ?? 'light';
  const paperSize = pageSizeCss({
    paperSize: options.paperSize ?? 'A4',
    customWidthMm: options.customWidthMm ?? 210,
    customHeightMm: options.customHeightMm ?? 297,
  });
  const marginPt = options.marginPt ?? PDF_TYPOGRAPHY.margin;
  const pageBreakAtH1 = options.pageBreakAtH1 ?? true;
  const c = PDF_THEME_COLORS[theme];
  const t = PDF_TYPOGRAPHY;

  // 分页规则对齐 Typora base.css（`h1..h6 { page-break-after: avoid;
  // break-after: avoid-page; page-break-inside: avoid; orphans: 4 }`）：
  // `break-after` 是 page-break-after 的标准对应属性（WKWebView/新版 Chromium 优先读取）；
  // `page-break-inside: avoid` 防止标题自身被页脚切断；orphans 在支持它的分页引擎
  // （macOS 的 WKWebView）里保证标题下至少跟 4 行正文。
  const headingRules = [1, 2, 3, 4, 5, 6]
    .map(
      (level) =>
        `h${level} { font-size: ${headingFontSize(level)}pt; font-weight: bold; color: ${c.fg}; page-break-after: avoid; break-after: avoid-page; page-break-inside: avoid; orphans: 4; }`,
    )
    .join('\n  ');

  const h1Break = pageBreakAtH1
    ? `h1 { page-break-before: always; }
  h1:first-of-type { page-break-before: auto; }`
    : 'h1 { page-break-before: auto; }';

  return `/* Mellow Print stylesheet — 与 PDF 导出共享排版常量（typography.ts） */
@page {
  size: ${paperSize};
  margin: ${marginPt}pt;
}
@media print {
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /*
   * 屏幕专用留白不得进入打印（Typora 亦在 @media print 内把 #write 的
   * padding-top / padding-bottom 归零）。两条来源：
   *   · Reader 的 .mellow-reader { padding: 56px 32px 30vh }
   *     —— 30vh 底部留白会额外产生**尾部空白页**；
   *   · 编辑器的 .cm-content { paddingBottom: 50vh }（CoreEditor 的滚动手感留白）
   *     —— 从编辑器直接打印时同样会产生空白页（file.print 的 enabled 为 always）。
   * 二者都必须在打印时归零，否则打印件首尾各带一段无意义空白。
   * 第三条：buildPrintHtml 的内文根节点 .mellow-content（exportHtml 的包装 div）
   * 有 32px 顶距 / 96px 底距 —— 打印件里分别是「首页整体下移」与「尾部空白页」。
   */
  .mellow-reader,
  .cm-content,
  .cm-scroller,
  .mellow-content {
    padding: 0 !important;
  }
  /* base.css @media print：html / body 首尾禁止分页（否则 Chrome 常在正文后多印一页空白）。 */
  html, body {
    page-break-before: avoid;
    page-break-after: avoid;
  }
  /* 首元素的上边距归零：@page 已提供页边距，再叠加段前距会让首页内容整体下移 */
  .mellow-reader > :first-child,
  .mellow-content > p:first-child,
  #write > :first-child {
    margin-top: 0 !important;
  }
  body {
    font-size: ${t.body}pt;
    line-height: ${t.lineHeight};
    color: ${c.fg};
    background: ${c.bg};
    /* Typora 的打印基线（base.css @media print）关掉连字，避免代码/正文里的
       ligature 在分页边界附近造成字形跳变。 */
    font-variant-ligatures: no-common-ligatures;
  }
  ${headingRules}
  ${h1Break}
  /* orphans：Typora base.css 的 p 为 orphans:4、li p 为 orphans:1。 */
  p { margin: 0.5em 0; orphans: 4; }
  li p { orphans: 1; }
  a { color: ${c.accent}; text-decoration: none; }
  strong { font-weight: bold; }
  code {
    font-size: ${t.code}pt;
    font-family: ${MONO_FONT_STACK};
    background: ${c.codeBg};
    border-radius: 3px;
    padding: 0.1em 0.3em;
  }
  pre {
    background: ${c.codeBg};
    border: 1px solid ${c.border};
    border-radius: 3px;
    padding: 8pt;
    font-size: ${t.code}pt;
    overflow: visible;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-word;
  }
  pre code { background: transparent; border: 0; padding: 0; }
  blockquote {
    border-left: 3px solid ${c.border};
    background: ${c.codeBg};
    color: ${c.fg};
    font-style: italic;
    margin: 0.5em 0;
    padding: 0.2em 1em;
    page-break-inside: avoid;
  }
  ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
  table {
    border-collapse: collapse;
    font-size: ${t.body}pt;
    margin: 0.6em 0;
    width: 100%;
    text-align: left;
    page-break-inside: avoid;
  }
  /* 跨页表格的表头重复（Typora base.css 同源规则：thead{display:table-header-group}），
     行本身禁止拆页（同 base.css 的 thead,tr{page-break-inside:avoid}）。 */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid ${c.border}; padding: 4pt 8pt; }
  th { background: ${c.codeBg}; font-weight: bold; }
  /* 列对齐（sanitize 的 mellow-align-* class，见 export/src/html/sanitize.ts） */
  th.mellow-align-left, td.mellow-align-left { text-align: left; }
  th.mellow-align-center, td.mellow-align-center { text-align: center; }
  th.mellow-align-right, td.mellow-align-right { text-align: right; }
  /* 图片规则对齐 Typora 导出基线（见 html/styles.ts 的同类注释） */
  img { max-width: 100%; vertical-align: middle; image-orientation: from-image; page-break-inside: avoid; }
  img:not([height]) { height: auto; }
  p > img:only-child { display: block; margin: auto; }
  /* raw HTML 媒体/嵌入（同 base.css 的 video / iframe 规则） */
  video, iframe { max-width: 100%; border: 0; }
  /* 行内 <kbd> 键帽（与 HTML 导出同观感，见 html/styles.ts） */
  kbd {
    font-size: 0.85em;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid ${c.border};
    border-bottom-width: 2px;
    background: ${c.codeBg};
    font-family: inherit;
  }
  hr { border: 0; border-top: 1px solid ${c.border}; }
  section.footnotes {
    border-top: 1px solid ${c.border};
    margin-top: 1.5em;
    padding-top: 0.5em;
    font-size: ${t.footnote}pt;
    color: ${c.fg};
  }
  /* 图形与公式不可被页边界切断（Typora base.css：svg 与 mjx-container
     均声明 page-break-inside:avoid）。 */
  .mermaid svg { max-width: 100%; page-break-inside: avoid; }
  mjx-container { font-size: 1.05em; page-break-inside: avoid; }
  .katex-display { overflow: visible; page-break-inside: avoid; }
}
`;
}

/** 桌面默认打印样式表（A4 / 60pt / light，与 PDF 默认一致） */
export const PRINT_STYLESHEET: string = printStylesheet({ theme: 'light', paperSize: 'A4' });
