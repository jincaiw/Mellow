/**
 * Print 测试（PRD §77：Print 与 PDF 共享 print stylesheet）。
 *
 * 覆盖：
 * - printStylesheet 与 PDF 排版常量（typography.ts）数字一致；
 * - PRINT_STYLESHEET 默认值（A4 / 60pt / light）；
 * - buildPrintHtml：自包含打印文档（@page、math、mermaid、table、image、ready 脚本）。
 */

import { buildPrintHtml, PRINT_READY_SCRIPT } from '../src/print';
import { printStylesheet, PRINT_STYLESHEET } from '../src/printStyle';
import { PDF_THEME_COLORS, PDF_TYPOGRAPHY } from '../src/typography';
import { DEFAULT_PDF_OPTIONS, buildPdfDocument } from '../src/index';

const SAMPLE = [
  '# 打印测试 Print Test',
  '',
  '段落 **bold** 与公式 $x^2$',
  '',
  '$$',
  '\\int_0^1 f(x)\\,dx',
  '$$',
  '',
  '```mermaid',
  'graph TD',
  '  A --> B',
  '```',
  '',
  '| 列A | 列B |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '![图](img.png)',
].join('\n');

const resolveImage = async (): Promise<string | null> =>
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('printStylesheet — 与 PDF 排版常量对齐', () => {
  it('@page 默认 A4 / 60pt（PDF pageMargins 一致）', () => {
    expect(PRINT_STYLESHEET).toContain('@page {');
    expect(PRINT_STYLESHEET).toContain('size: A4');
    expect(PRINT_STYLESHEET).toContain(`margin: ${PDF_TYPOGRAPHY.margin}pt`);
  });

  it('正文/标题字号与 PDF_TYPOGRAPHY 一致', () => {
    const css = printStylesheet();
    for (let level = 1; level <= 6; level += 1) {
      expect(css).toContain(`h${level} { font-size: ${PDF_TYPOGRAPHY.headings[level]}pt`);
    }
    expect(css).toContain(`font-size: ${PDF_TYPOGRAPHY.body}pt;`);
    expect(css).toContain(`line-height: ${PDF_TYPOGRAPHY.lineHeight}`);
    expect(css).toContain(`font-size: ${PDF_TYPOGRAPHY.code}pt;`);
  });

  it('配色与 PDF_THEME_COLORS[light] 一致', () => {
    const css = printStylesheet();
    const light = PDF_THEME_COLORS.light;
    expect(css).toContain(`color: ${light.fg};`);
    expect(css).toContain(`background: ${light.bg};`);
    expect(css).toContain(`background: ${light.codeBg};`);
    expect(css).toContain(`border: 1px solid ${light.border}`);
    expect(css).toContain(`color: ${light.accent}`);
  });

  it('dark 主题使用 PDF 暗色板', () => {
    const css = printStylesheet({ theme: 'dark' });
    expect(css).toContain(`color: ${PDF_THEME_COLORS.dark.fg}`);
    expect(css).toContain(`background: ${PDF_THEME_COLORS.dark.bg}`);
  });

  it('H1 分页对齐 PDF pageBreakAtH1（默认 true，首个 H1 不分页）', () => {
    expect(PRINT_STYLESHEET).toContain('h1 { page-break-before: always; }');
    expect(PRINT_STYLESHEET).toContain('h1:first-of-type { page-break-before: auto; }');
    const css = printStylesheet({ pageBreakAtH1: false });
    expect(css).toContain('h1 { page-break-before: auto; }');
    expect(css).not.toContain('h1 { page-break-before: always; }');
  });

  it('纸张选项：Letter / Custom(mm)', () => {
    expect(printStylesheet({ paperSize: 'Letter' })).toContain('size: letter');
    expect(printStylesheet({ paperSize: 'Custom', customWidthMm: 100, customHeightMm: 150 })).toContain('size: 100mm 150mm');
  });

  it('print-color-adjust 保留背景色（对齐 PDF printBackground）', () => {
    expect(PRINT_STYLESHEET).toContain('-webkit-print-color-adjust: exact');
    expect(PRINT_STYLESHEET).toContain('print-color-adjust: exact');
  });

  it('与 buildPdfDocument 的 pdfmake styles 数值一致', async () => {
    const doc = await buildPdfDocument('# H', DEFAULT_PDF_OPTIONS, {
      fonts: { normal: new Uint8Array(0), bold: new Uint8Array(0) },
    });
    const styles = doc.styles as Record<string, { fontSize?: number }>;
    const css = printStylesheet();
    expect(css).toContain(`h1 { font-size: ${styles.h1?.fontSize}pt`);
    expect(css).toContain(`h2 { font-size: ${styles.h2?.fontSize}pt`);
    expect(css).toContain(`font-size: ${styles.body?.fontSize}pt;`);
  });
});

describe('buildPrintHtml — 自包含打印文档', () => {
  it('生成完整打印 HTML：@page、math、mermaid、table、image、ready 脚本', async () => {
    const html = await buildPrintHtml(SAMPLE, { theme: 'light' }, { resolveImage });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('@page');
    expect(html).toContain('size: A4');
    // math（KaTeX 内联渲染 + 字体 data URI）
    expect(html).toContain('class="katex');
    expect(html).toContain('data:font/woff2;base64');
    // mermaid（bundle 内联 + 渲染脚本 + ready 事件）
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('globalThis["mermaid"]');
    expect(html).toContain('mellow-mermaid-ready');
    // table / image
    expect(html).toContain('<table>');
    expect(html).toContain('data:image/png;base64');
    // 打印就绪脚本
    expect(html).toContain('mellow-print-ready');
    // 无外部 CDN
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link ');
  });

  it('PrintOptions 传递纸张/主题/分页', async () => {
    const html = await buildPrintHtml('# T', { paperSize: 'Letter', theme: 'dark', pageBreakAtH1: false });
    expect(html).toContain('size: letter');
    expect(html).toContain(PDF_THEME_COLORS.dark.fg);
    expect(html).not.toContain('h1 { page-break-before: always; }');
  });

  // R3-2 mhchem 化学式：\ce / \pu 经 katex contrib 渲染（下标 + 反应箭头）。
  // 注：不反向断言 'katex-error' —— self-contained 模式内嵌的 katex JS 源码本身含该类名字符串。
  it('mhchem 化学式渲染（\\ce 与 \\pu）', async () => {
    const md = '$\\ce{2H2 + O2 -> 2H2O}$\n\n$\\pu{123 kJ/mol}$';
    const html = await buildPrintHtml(md, {}, { resolveImage });
    expect(html).toContain('class="katex');
    expect(html).toContain('msub'); // 化学式下标
    expect(html).toContain('→'); // 反应箭头（mhchem 转换 ->）
  });

  it('PRINT_READY_SCRIPT 结构（parent postMessage + 兜底）', () => {
    expect(PRINT_READY_SCRIPT).toContain("postMessage('mellow-print-ready'");
    expect(PRINT_READY_SCRIPT).toContain('mellow-mermaid-ready');
    expect(PRINT_READY_SCRIPT).toContain('setTimeout(ready, 2500)');
  });
});
