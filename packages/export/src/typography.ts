/**
 * PDF / Print 共享排版常量（PRD §72 / §77：Print 与 PDF 共享 print stylesheet）。
 *
 * 单一真源：PDF 导出（pdfmake）与 Print 打印样式表（CSS）从这里取字号、行高、
 * 边距与配色，保证打印输出与 PDF 排版数字一致。单位统一为 pt（pdfmake 与 CSS 均原生支持）。
 */

export type PdfThemeName = 'light' | 'dark';

export interface PdfThemeColors {
  fg: string;
  bg: string;
  codeBg: string;
  border: string;
  accent: string;
}

export const PDF_THEME_COLORS: Record<PdfThemeName, PdfThemeColors> = {
  light: { fg: '#1a1a1a', bg: '#ffffff', codeBg: '#f6f8fa', border: '#dfe2e5', accent: '#0366d6' },
  dark: { fg: '#e6e6e6', bg: '#1e1e1e', codeBg: '#262626', border: '#3a3a3a', accent: '#79b8ff' },
};

export interface PdfTypography {
  /** 正文/行内字号（pt） */
  body: number;
  lineHeight: number;
  /** 标题字号（pt），key = 标题级别 1-6 */
  headings: Record<number, number>;
  /** 代码字号（pt） */
  code: number;
  /** 脚注字号（pt） */
  footnote: number;
  /** 页边距（pt） */
  margin: number;
}

export const PDF_TYPOGRAPHY: PdfTypography = {
  body: 11,
  lineHeight: 1.6,
  headings: { 1: 22, 2: 18, 3: 15, 4: 13, 5: 12, 6: 11 },
  code: 9,
  footnote: 9,
  margin: 60,
};

export function headingFontSize(level: number): number {
  return PDF_TYPOGRAPHY.headings[Math.min(Math.max(level, 1), 6)] ?? PDF_TYPOGRAPHY.body;
}
