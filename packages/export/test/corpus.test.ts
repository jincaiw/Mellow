/**
 * P6.2 Export Corpus（PRD §142 + V4 计划 P6「CJK+Math+Mermaid+Table+Footnote+TOC 导出 corpus」）。
 *
 * 全要素大文档一次跑通 PDF 与 HTML 两条导出链路：
 * 100 pages / 100 images / 50 tables / 100 formulas / 30 diagrams /
 * emoji / CJK / footnote / TOC / callout / code / page breaks。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_PDF_OPTIONS,
  buildPdfDocument,
  createPdfBuffer,
  parseBlocks,
} from '../src/index';
import { exportHtml } from '../src/html';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fonts(): { normal: Uint8Array; bold: Uint8Array } {
  const dir = path.resolve(__dirname, '../../../apps/desktop/public/fonts');
  return {
    normal: new Uint8Array(fs.readFileSync(path.join(dir, 'NotoSansSC-Regular.ttf'))),
    bold: new Uint8Array(fs.readFileSync(path.join(dir, 'NotoSansSC-Bold.ttf'))),
  };
}

const pdfEnv = {
  fonts: fonts(),
  resolveImage: async () => PNG_1PX,
  renderMath: async () => PNG_1PX,
  renderMermaid: async () => PNG_1PX,
};

const htmlEnv = { resolveImage: async () => PNG_1PX };

/** PRD §142 全要素 corpus 生成器 */
function buildCorpus(): string {
  const parts: string[] = [];
  parts.push('[toc]', ''); // TOC
  parts.push('注脚示例[^1] 与 中文段落 + emoji 😀 🎉 混排。', '');
  parts.push('[^1]: 这是注脚定义（footnote）。', '');

  for (let p = 1; p <= 100; p += 1) {
    parts.push(`# 第 ${p} 章 Page ${p}`, '');
    parts.push(`第 ${p} 页正文：**粗体** *斜体* \`行内代码\` [链接](https://example.com/${p}) 😀`, '');

    // 每 2 页一张图 → 50 张；每 1 页再补一张 → 每页 1 张 + 50 页双图 = 150？收敛：每页 1 张，前 50 页再各 1 张
    parts.push(`![图表 ${p}](assets/figure-${p}.png)`, '');
    if (p <= 50) parts.push(`![补充图 ${p}](assets/extra-${p}.png)`, '');

    // 每 2 页一张表 → 50 张表
    if (p % 2 === 1) {
      parts.push('| 名称 | 数量 | 备注 |', '| --- | :-: | --- |', `| 苹果 ${p} | ${p} | 😀 表格 |`, `| 香蕉 | ${p + 1} | 中文\\|管道 |`, '');
    }

    // 每页 1 个公式块 → 100 个
    parts.push('$$', `x_${p}^2 + y_${p}^2 = z_${p}^2`, '$$', '');

    // 每 3 页一个 mermaid 图 → 34 个（≥30）
    if (p % 3 === 1) {
      parts.push('```mermaid', 'graph TD', `  A${p} --> B${p}`, '```', '');
    }

    // 每 5 页一个 callout
    if (p % 5 === 1) {
      parts.push('> [!NOTE]', `> 第 ${p} 章提示：😀 callout`, '');
    }

    // 每 4 页一个代码块
    if (p % 4 === 1) {
      parts.push('```ts', `const page${p} = ${p}; // 中文注释`, '```', '');
    }

    // 每 10 页一个显式分页
    if (p % 10 === 0) {
      parts.push('<!-- pagebreak -->', '');
    }
  }
  return parts.join('\n');
}

const CORPUS = buildCorpus();

describe('P6.2 Export Corpus（PRD §142）— 全要素大文档', () => {
  test('parseBlocks：全部 12 类块按规模出现', () => {
    const blocks = parseBlocks(CORPUS);
    const count = (type: string): number => blocks.filter((b) => b.type === type).length;
    expect(count('heading')).toBe(100);
    expect(count('image')).toBe(150); // 100 主图 + 50 补充图
    expect(count('table')).toBe(50);
    expect(count('math')).toBe(100);
    expect(count('mermaid')).toBe(34); // p%3===1 → 34 页
    expect(count('alert')).toBe(20); // p%5===1 → 20 页
    expect(count('code')).toBe(25); // p%4===1 → 25 页
    expect(count('pagebreak')).toBe(10); // p%10===0
    expect(count('toc')).toBe(1);
    const all = JSON.stringify(blocks);
    expect(all).toContain('😀');
    expect(all).toContain('中文');
  });

  test('PDF corpus：buildPdfDocument 全量构建成功且关键内容命中', async () => {
    const doc = await buildPdfDocument(CORPUS, DEFAULT_PDF_OPTIONS, pdfEnv);
    expect(doc.content.length).toBeGreaterThan(300);
    expect(doc.defaultStyle?.font).toBe('NotoSansSC');
    const flattened = JSON.stringify(doc.content);
    expect(flattened).toContain('😀');
    expect(flattened).toContain('第 100 章');
  });

  test('PDF corpus buffer：100 页级文档生成合法 PDF（宽上界护栏）', async () => {
    const t0 = Date.now();
    const buffer = await createPdfBuffer(CORPUS, DEFAULT_PDF_OPTIONS, pdfEnv);
    const head = String.fromCharCode(...buffer.slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(10 * 1024); // 非空且远大于单页
    expect(Date.now() - t0).toBeLessThan(30000); // 回归护栏；性能验收归真机 benchmark
  });

  test('HTML corpus：exportHtml 全量导出成功且 TOC/footnote/callout 命中', async () => {
    const html = await exportHtml(CORPUS, { mode: 'with-theme' }, htmlEnv);
    expect(html).toContain('第 100 章');
    expect(html).toContain('😀');
    expect(html).toContain('footnote'); // 脚注容器/引用
    // mermaid 引导 <script> 是导出器合法注入（html.test.ts 先例），且库代码
    // 字符串本身含 'onclick'/'javascript:' 字样——断言针对元素属性而非字符串包含。
    expect(html).not.toMatch(/<\w[^>]*\sonclick\s*=/i);
    expect(html).not.toMatch(/<\w[^>]*(href|src)\s*=\s*["']\s*javascript:/i);
  });
});
