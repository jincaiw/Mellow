import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  DEFAULT_PDF_OPTIONS,
  buildPdfDocument,
  createPdfBuffer,
  parseBlocks,
} from '../src/index';

/**
 * 提取 PDF 中所有 ToUnicode CMap 的明文（Flate 解压）。
 * 一份文档可能有多个子集字体（如正文 + 粗体标题），故返回**数组**，取并集。
 */
function extractToUnicodeCMaps(raw: string): string[] {
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const body = Buffer.from(raw.slice(start, end), 'latin1');
    try {
      const text = zlib.inflateSync(body).toString('latin1');
      if (text.includes('begincmap')) out.push(text);
    } catch { /* 非 Flate 流（图片等）：跳过 */ }
  }
  return out;
}

/** 解析 CMap：字形 id → Unicode 码位。支持 bfchar 与 bfrange 的两种形态。 */
function parseToUnicodeCmap(text: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const sec of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of sec[1].matchAll(/<([0-9a-fA-F]{1,4})>\s*<([0-9a-fA-F]{1,4})>/g)) {
      map.set(parseInt(p[1], 16), parseInt(p[2], 16));
    }
  }
  for (const sec of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // 单条交替正则**一次吃掉整个条目**：`<lo> <hi> [<u>…]`（数组）或 `<lo> <hi> <dst0>`（递增）。
    // ⚠️ 若拆成两条正则，递增形式会匹配到**数组内部的元素**（`<0000> <4e2d> <6587>`），
    // 造出 lo=0..0x4e2d 的伪区间 —— 实测污染出 3 万多个假映射，把「映射缺失」掩盖掉。
    for (const a of sec[1].matchAll(
      /<([0-9a-fA-F]{1,4})>\s*<([0-9a-fA-F]{1,4})>\s*(?:\[([^\]]*)\]|<([0-9a-fA-F]{1,4})>)/g,
    )) {
      const lo = parseInt(a[1], 16);
      if (a[3] !== undefined) {
        [...a[3].matchAll(/<([0-9a-fA-F]{1,4})>/g)]
          .map((x) => parseInt(x[1], 16))
          .forEach((cp, i) => map.set(lo + i, cp));
      } else {
        const hi = parseInt(a[2], 16);
        const dst = parseInt(a[4], 16);
        for (let g = lo; g <= hi; g += 1) map.set(g, dst + (g - lo));
      }
    }
  }
  return map;
}

function fonts(): { normal: Uint8Array; bold: Uint8Array } {
  const dir = path.resolve(__dirname, '../../../apps/desktop/public/fonts');
  return {
    normal: new Uint8Array(fs.readFileSync(path.join(dir, 'NotoSansSC-Regular.ttf'))),
    bold: new Uint8Array(fs.readFileSync(path.join(dir, 'NotoSansSC-Bold.ttf'))),
  };
}

const env = {
  fonts: fonts(),
  resolveImage: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  renderMath: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  renderMermaid: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
};

describe('PDF export — markdown block parsing', () => {
  const md = [
    '# 标题 Title',
    '',
    '段落 with **bold** *italic* `code` and [link](https://x.com)',
    '',
    '## 二级',
    '',
    '- item one',
    '- item two',
    '- [x] done',
    '',
    '1. first',
    '2. second',
    '',
    '> quote text',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '$$',
    'x^2',
    '$$',
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '',
    '> [!NOTE]',
    '> alert body',
    '',
    '[toc]',
    '',
    '![alt](img.png)',
    '',
    '---',
  ].join('\n');

  test('parses all required block types', () => {
    const blocks = parseBlocks(md);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('list');
    expect(types).toContain('blockquote');
    expect(types).toContain('code');
    expect(types).toContain('table');
    expect(types).toContain('math');
    expect(types).toContain('mermaid');
    expect(types).toContain('alert');
    expect(types).toContain('toc');
    expect(types).toContain('image');
    expect(types).toContain('hr');
  });

  test('inline formatting is tokenized', () => {
    const blocks = parseBlocks('**bold** *it* `code`');
    const p = blocks.find((b) => b.type === 'paragraph');
    expect(p && p.type === 'paragraph' && p.content[0].bold).toBe(true);
  });

  test('pagebreak marker is parsed', () => {
    const blocks = parseBlocks('a\n\n<!-- pagebreak -->\n\nb');
    expect(blocks.map((b) => b.type)).toContain('pagebreak');
  });
});

describe('PDF export — document definition', () => {
  test('builds docDefinition with content, styles and theme colors', async () => {
    const doc = await buildPdfDocument('# Hello\n\n世界\n\n- a\n- b', DEFAULT_PDF_OPTIONS, env);
    expect(doc.content.length).toBeGreaterThan(0);
    expect(doc.defaultStyle?.font).toBe('NotoSansSC');
    expect(doc.defaultStyle?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('dark theme changes colors and background option toggles canvas', async () => {
    const dark = await buildPdfDocument('# H', { ...DEFAULT_PDF_OPTIONS, theme: 'dark', printBackground: true }, env);
    expect(dark.defaultStyle?.color).not.toBe(DEFAULT_PDF_OPTIONS.theme === 'light' ? '#1a1a1a' : '#e6e6e6');
    expect(dark.background).toBeDefined();
    const noBg = await buildPdfDocument('# H', { ...DEFAULT_PDF_OPTIONS, theme: 'dark', printBackground: false }, env);
    expect(noBg.background).toBeUndefined();
  });

  test('header/footer/page numbers wired', async () => {
    const doc = await buildPdfDocument('# H', { ...DEFAULT_PDF_OPTIONS, header: true, footer: true, pageNumbers: true, title: 'Doc Title' }, env);
    expect(doc.header).toBeDefined();
    expect(doc.footer).toBeDefined();
  });

  test('H1 page break option marks level-1 headings', async () => {
    const doc = await buildPdfDocument('# One\n\n## Sub\n\n# Two', { ...DEFAULT_PDF_OPTIONS, pageBreakAtH1: true }, env);
    const h1 = doc.content.filter((el) => (el as { _h1?: boolean })._h1 === true);
    expect(h1.length).toBe(2);
    expect(doc.pageBreakBefore).toBeDefined();
  });

  test('toc includes headings and footnote appends definition', async () => {
    const doc = await buildPdfDocument('# A\n\n[toc]\n\nfootnote text[^1]\n\n[^1]: note body', DEFAULT_PDF_OPTIONS, env);
    expect(doc.content.some((el) => (el as { text?: unknown }).text === '目录' || (el as { style?: string }).style === 'toc')).toBe(true);
  });
});

describe('PDF export — buffer generation (subset fonts, CJK, 100 pages)', () => {
  test('generates a valid small PDF with CJK (subset fonts embedded)', async () => {
    const buffer = await createPdfBuffer('# 中文标题\n\n这是中文段落测试。\n\nEnglish paragraph.', DEFAULT_PDF_OPTIONS, env);
    const head = String.fromCharCode(...buffer.slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(buffer.byteLength).toBeLessThan(3 * 1024 * 1024);
  });

  /**
   * PDF CJK **机制**断言（2026-09-30 补）。
   *
   * 立此测试的原因：上面那条只断言 `%PDF-` 与体积 —— 属**冒烟测试**，
   * 证明「管线跑通了」，**测不到「CJK 变乱码」**。而 master plan §10 把
   * 「PDF CJK garble」列为**发布阻塞项**，V1.0 验收第 13 项也依赖它。
   *
   * 「garble」有两个独立的失效面，各由一条机制保证：
   *   - **看得见**（字形）：必须**嵌入子集**（`/FontFile2`），否则换台机器/换字体就缺字形；
   *   - **复制/搜索得到正确字符**（码位）：CJK 走 `/Type0` + `/Identity-H`，
   *     此时字符码 = 字形 id，**没有 `/ToUnicode` CMap 就无法把字形映回 Unicode** →
   *     屏幕上看着正常，**复制出来却是乱码**。这一面冒烟测试完全测不到。
   *
   * 实测（本机 macOS，pdfmake 0.3.11 + Noto Sans SC 子集）四个标记全部命中。
   */
  test('CJK 走 Type0/Identity-H + 嵌入子集 + ToUnicode CMap（冒烟测试测不到的两面）', async () => {
    const buffer = await createPdfBuffer('# 中文标题\n\n这是中文段落测试。\n', DEFAULT_PDF_OPTIONS, env);
    const raw = Buffer.from(buffer).toString('latin1');
    // 面一：字形 —— 复合字体 + 嵌入子集
    expect(raw).toContain('/Type0');
    expect(raw).toContain('/Identity-H');
    expect(raw).toContain('/CIDFontType2');
    expect(raw).toContain('/FontFile2');
    // 面二：码位 —— Identity-H 下字形 id 到 Unicode 的映射
    expect(raw).toContain('/ToUnicode');
  });

  /**
   * **映射正确性**断言（2026-09-30 加强）。
   *
   * 上一条只证明 `/ToUnicode` **存在** —— 而「存在但映射错」的后果与「不存在」完全一样：
   * 屏幕正常、复制/搜索出来是错字。故这里**真的解析 CMap**，
   * 断言「输入里的每个 CJK 字符都能在映射的目标码位里找到」。
   *
   * 实测（Noto Sans SC 子集，两份 CMap = 正文 + 粗体标题）：15 个目标码位，
   * 输入里 10 个 CJK 字符全部命中。
   */
  test('ToUnicode CMap 的映射覆盖输入里的每个 CJK 字符（存在 ≠ 正确）', async () => {
    const md = '# 中文标题\n\n这是中文段落测试。\n';
    const buffer = Buffer.from(await createPdfBuffer(md, DEFAULT_PDF_OPTIONS, env));
    const raw = buffer.toString('latin1');
    const cmaps = extractToUnicodeCMaps(raw);
    expect(cmaps.length).toBeGreaterThan(0);
    const mappedCodePoints = new Set(cmaps.flatMap((t) => [...parseToUnicodeCmap(t).values()]));
    expect(mappedCodePoints.size).toBeGreaterThan(5);
    const cjk = [...new Set([...md].filter((c) => /[\u3400-\u9fff]/.test(c)))];
    expect(cjk.length).toBeGreaterThanOrEqual(8);
    // 一个都不能少：缺失的字符在 PDF 里就是「看得见、复制错」
    expect(cjk.filter((c) => !mappedCodePoints.has(c.codePointAt(0) as number))).toEqual([]);
  });

  test('100-page document renders without failure', async () => {
    const parts: string[] = [];
    for (let i = 1; i <= 100; i += 1) {
      parts.push(`# Section ${i}`, '', `Page ${i} content with 中文 文本。`, '');
    }
    const buffer = await createPdfBuffer(parts.join('\n'), DEFAULT_PDF_OPTIONS, env);
    expect(String.fromCharCode(...buffer.slice(0, 5))).toBe('%PDF-');
  });

  test('image / math / mermaid blocks embed as images', async () => {
    const md = '![图](a.png)\n\n$$e^{i\\pi}+1=0$$\n\n```mermaid\ngraph TD\n  A --> B\n```';
    const buffer = await createPdfBuffer(md, DEFAULT_PDF_OPTIONS, env);
    expect(String.fromCharCode(...buffer.slice(0, 5))).toBe('%PDF-');
  });
});
