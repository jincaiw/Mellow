import { exportHtml } from '../src/html/index';
import { parseBlocks } from '../src/index';

/**
 * 导出时保留单换行符 —— 对齐 Typora `preLinebreakOnExport`（默认 false，G7-FEAT-13）。
 *
 * 背景：Mellow 的 Enter 产出**单个 `\n`**（= Typora 的 New Line 语义，见方案 G7-EDIT-07），
 * 而 CommonMark 把段内单换行渲染为**空格** → 默认导出时「编辑器里看到的换行在导出件里消失」。
 * 本项同时作用于两条导出管线（HTML / PDF），故两侧都要锁。
 */
const DOC = '第一行\n第二行\n\n第二段';

describe('导出保留单换行符（preLinebreakOnExport）', () => {
  test('HTML 导出：默认（关闭）不产生 <br>（按 CommonMark 渲染为空格）', async () => {
    const html = await exportHtml(DOC, { mode: 'without-style' });
    expect(html).not.toContain('<br');
  });

  test('HTML 导出：开启后段内单换行渲染为 <br>', async () => {
    const html = await exportHtml(DOC, { mode: 'without-style', preserveLineBreaks: true });
    expect(html).toContain('<br');
  });

  test('HTML 导出：分段（空行）不受影响 —— 始终是两个段落', async () => {
    for (const preserveLineBreaks of [false, true]) {
      const html = await exportHtml(DOC, { mode: 'without-style', preserveLineBreaks });
      expect((html.match(/<p>/g) ?? []).length).toBe(2);
    }
  });

  test('PDF 管线：默认以空格拼接段内各行', () => {
    const para = parseBlocks(DOC).find((block) => block.type === 'paragraph');
    expect(JSON.stringify(para)).toContain('第一行 第二行');
  });

  test('PDF 管线：开启后保留 \\n', () => {
    const para = parseBlocks(DOC, { preserveLineBreaks: true }).find((block) => block.type === 'paragraph');
    expect(JSON.stringify(para)).toContain('第一行\\n第二行');
  });

  test('PDF 管线：默认值不得漂移为「开启」（canary）', () => {
    // parseBlocks 的第二参数可省略 → 省略时必须等价于关闭（既有调用方不受影响）
    expect(JSON.stringify(parseBlocks(DOC))).toBe(JSON.stringify(parseBlocks(DOC, { preserveLineBreaks: false })));
  });
});
