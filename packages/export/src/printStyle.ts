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

  const headingRules = [1, 2, 3, 4, 5, 6]
    .map((level) => `h${level} { font-size: ${headingFontSize(level)}pt; font-weight: bold; color: ${c.fg}; page-break-after: avoid; }`)
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
  body {
    font-size: ${t.body}pt;
    line-height: ${t.lineHeight};
    color: ${c.fg};
    background: ${c.bg};
  }
  ${headingRules}
  ${h1Break}
  p { margin: 0.5em 0; }
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
    page-break-inside: avoid;
  }
  th, td { border: 1px solid ${c.border}; padding: 4pt 8pt; }
  th { background: ${c.codeBg}; font-weight: bold; }
  img { max-width: 100%; page-break-inside: avoid; }
  hr { border: 0; border-top: 1px solid ${c.border}; }
  section.footnotes {
    border-top: 1px solid ${c.border};
    margin-top: 1.5em;
    padding-top: 0.5em;
    font-size: ${t.footnote}pt;
    color: ${c.fg};
  }
  .mermaid svg { max-width: 100%; }
  mjx-container { font-size: 1.05em; }
  .katex-display { overflow: visible; }
}
`;
}

/** 桌面默认打印样式表（A4 / 60pt / light，与 PDF 默认一致） */
export const PRINT_STYLESHEET: string = printStylesheet({ theme: 'light', paperSize: 'A4' });
