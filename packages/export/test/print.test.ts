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

  // base.css @media print：html/body 首尾禁止分页（否则正文后多印空白页）；
  // #write 的顶/底留白归零 —— buildPrintHtml 的内文根是 .mellow-content（32px/96px）。
  it('html/body 不分页 + 内容区留白归零（与 base.css 打印段同源）', () => {
    expect(PRINT_STYLESHEET).toMatch(/html, body \{[^}]*page-break-before: avoid;/);
    expect(PRINT_STYLESHEET).toMatch(/html, body \{[^}]*page-break-after: avoid;/);
    expect(PRINT_STYLESHEET).toMatch(/\.mellow-content \{[^}]*padding: 0 !important;/);
    expect(PRINT_STYLESHEET).toMatch(/\.mellow-content > p:first-child/);
  });

  it('图片规则对齐 Typora 导出基线（独占段落居中 / 显式 height 保留）', () => {
    expect(PRINT_STYLESHEET).toContain('p > img:only-child { display: block; margin: auto; }');
    expect(PRINT_STYLESHEET).toContain('img:not([height]) { height: auto; }');
    expect(PRINT_STYLESHEET).toContain('image-orientation: from-image');
    expect(PRINT_STYLESHEET).toMatch(/kbd \{[^}]*border-bottom-width: 2px/);
    expect(PRINT_STYLESHEET).toContain('video, iframe { max-width: 100%; border: 0; }');
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

// ADR-0037 = A2 的裁决依据是「打印管线一次解决 10 类核心语法」——首版依据是一次**人工实跑**。
// 下面把它固化成机器断言：任何一类在打印 HTML 里退回源码/字面，都必须在此失败。
// ⚠️ 边界：本测试只锁「打印管线（= HTML 导出管线 + 打印样式）的 DOM 结构」，
//    **不**证明宿主绑定、分页或 `存储为 PDF` 的系统行为（那些仍需真机 / CI）。
describe('A2 打印管线：ADR-0037 列出的核心语法构造', () => {
  const A2_CORPUS = [
    '- 一级',
    '  - 二级',
    '    - 三级',
    '',
    '3. 三',
    '4. 四',
    '',
    '- [x] 完成',
    '- [ ] 未完成',
    '',
    '> 引用',
    '> > 嵌套引用',
    '',
    '硬换行上行  ',
    '硬换行下行',
    '',
    '[文字](https://example.com/path)',
    '',
    '<https://example.com/auto>',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n');

  it('嵌套列表层级 / 有序起始号 / 任务 checkbox / 嵌套引用 / 硬换行 / 链接 / autolink / 代码语言', async () => {
    const html = await buildPrintHtml(A2_CORPUS, {}, { resolveImage });

    // ① 嵌套列表：三层 <ul> 真正嵌套（旧 pdfmake 管线是三个各自独立的单条列表）
    expect(html).toMatch(/<ul>[\s\S]*<li>[^<]*<ul>[\s\S]*<li>[^<]*<ul/);
    expect((html.match(/<ul>/g) ?? []).length).toBeGreaterThanOrEqual(3);

    // ② 有序列表保留起始编号（旧管线变成无序且丢起始号）
    expect(html).toMatch(/<ol start="3">/);

    // ③ 任务列表 checkbox 仍存在（旧管线只剩文本）
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).toMatch(/<input[^>]*checked/);

    // ④ 嵌套引用是两层 <blockquote>（旧管线拍平，`>` 变成字面文本）
    expect((html.match(/<blockquote>/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/<blockquote>[\s\S]*<blockquote>[\s\S]*<\/blockquote>[\s\S]*<\/blockquote>/);

    // ⑤ 行尾两空格 → <br>（旧管线变成空格）
    expect(html).toContain('<br>');

    // ⑥ 行内链接保留 href（旧管线整条丢失，只剩文字）
    expect(html).toContain('<a href="https://example.com/path">文字</a>');

    // ⑦ autolink 渲染为链接（旧管线是字面文本）
    expect(html).toContain('<a href="https://example.com/auto">');

    // ⑧ 代码块语言进入 class（旧管线解析了 language 却无人消费）
    expect(html).toMatch(/<code[^>]*class="language-js"/);
  });

  it('打印样式承担表格列对齐（mellow-align-* class）', async () => {
    const html = await buildPrintHtml('| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |', {}, {});
    expect(html).toContain('class="mellow-align-center"');
    expect(html).toContain('class="mellow-align-right"');
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(table).not.toContain('style=');
    expect(PRINT_STYLESHEET).toContain('td.mellow-align-center { text-align: center; }');
  });

  it('跨页表格：占满宽度 + 表头重复 + 行不拆页（Typora base.css 同源规则）', () => {
    expect(PRINT_STYLESHEET).toMatch(/table \{[^}]*width: 100%/);
    expect(PRINT_STYLESHEET).toMatch(/table \{[^}]*text-align: left/);
    expect(PRINT_STYLESHEET).toContain('thead { display: table-header-group; }');
    expect(PRINT_STYLESHEET).toContain('tr { page-break-inside: avoid; }');
  });

  // Typora base.css：`h1..h6 { page-break-after: avoid; break-after: avoid-page;
  // page-break-inside: avoid; orphans: 4 }` · `p { orphans: 4 }` · `li p { orphans: 1 }`。
  // 此前 Mellow 只有 page-break-after ⇒ 标题自身可被切断、段首孤行无下限。
  it('标题 / 段落分页保护（含标准 break-after 与 orphans）', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(PRINT_STYLESHEET).toMatch(new RegExp(`h${level} \\{[^}]*page-break-after: avoid;`));
      expect(PRINT_STYLESHEET).toMatch(new RegExp(`h${level} \\{[^}]*break-after: avoid-page;`));
      expect(PRINT_STYLESHEET).toMatch(new RegExp(`h${level} \\{[^}]*page-break-inside: avoid;`));
      expect(PRINT_STYLESHEET).toMatch(new RegExp(`h${level} \\{[^}]*orphans: 4;`));
    }
    expect(PRINT_STYLESHEET).toMatch(/p \{ margin: 0\.5em 0; orphans: 4; \}/);
    expect(PRINT_STYLESHEET).toContain('li p { orphans: 1; }');
    expect(PRINT_STYLESHEET).toContain('font-variant-ligatures: no-common-ligatures;');
  });

  // Typora base.css：`svg{page-break-inside:avoid}` · `mjx-container{page-break-inside:avoid}`
  // ⇒ 打印时图形/公式不得被页边界切断。
  it('图形与公式不可被页边界切断', () => {
    expect(PRINT_STYLESHEET).toMatch(/\.mermaid svg \{[^}]*page-break-inside: avoid;/);
    expect(PRINT_STYLESHEET).toMatch(/mjx-container \{[^}]*page-break-inside: avoid;/);
    expect(PRINT_STYLESHEET).toMatch(/\.katex-display \{[^}]*page-break-inside: avoid;/);
  });

  it('分页与目录仍由打印样式承担（A2 的 @page / 大纲出口）', async () => {
    const html = await buildPrintHtml('# 一\n\n正文\n\n# 二\n\n- 列表\n\n## 二·一\n', {
      includeOutline: true,
    });
    expect(html).toContain('@page');
    expect(html).toMatch(/h1 \{ page-break-before: always; \}/);
    // 目录（PRD §72 的 outline）以文档内 TOC 形式存在，不是 PDF 书签
    expect(html).toMatch(/<nav class="mellow-toc"|<div class="mellow-toc"/);
  });

  // Typora showLineNumbersForFence 是全局项，打印件与 HTML 导出共用同一渲染器。
  it('代码块行号在打印管线同样生效（与 HTML 导出同一渲染器）', async () => {
    const md = '```js\nconst a = 1;\nconst b = 2;\n```';
    const on = await buildPrintHtml(md, { codeLineNumbers: true });
    expect(on).toContain('<pre class="mellow-code-lineno"><code class="language-js">');
    expect(on).toContain('<span class="mellow-code-num" aria-hidden="true">2</span>');
    expect(on).toMatch(/\.mellow-code-num \{[^}]*user-select: none;/);
    const off = await buildPrintHtml(md, {});
    expect(off).not.toContain('class="mellow-code-num"');
  });

  // Typora indentFirstLine 同时作用于打印件（导出构建器给 #write 加 first-line-indent 类）。
  it('首行缩进在打印管线同样生效（与 HTML 导出同一选项）', async () => {
    const md = '第一段\n\n第二段';
    const on = await buildPrintHtml(md, { firstLineIndent: true });
    expect(on).toContain('<div class="mellow-content first-line-indent">');
    expect(on).toContain('.mellow-content.first-line-indent p { text-indent: 2em; }');
    const off = await buildPrintHtml(md, {});
    // 样式规则常驻（选择器只在类存在时命中），关闭时只断言根节点不带类
    expect(off).toContain('<div class="mellow-content">');
    expect(off).not.toContain('<div class="mellow-content first-line-indent">');
  });

  // Typora 导出件的 #write 继承生效字号；打印管线共用同一构建器。
  it('正文字号在打印管线同样生效（与 HTML 导出同一选项）', async () => {
    const on = await buildPrintHtml('段落', { fontSize: 20 });
    expect(on).toContain('<div class="mellow-content" style="font-size: 20px">');
    const off = await buildPrintHtml('段落', {});
    expect(off).not.toContain('style="font-size:');
  });
});
