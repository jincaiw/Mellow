/**
 * Image Export 单测（PRD §74：PNG/JPEG/width/quality/long-image protection）。
 *
 * 测量注入：确定性 mock（CJK = size，其余 = size * 0.6）——
 * 断言只依赖布局逻辑（顺序/换行/主题色/保护阈值），不依赖真实字体度量。
 */
import {
  DEFAULT_IMAGE_OPTIONS,
  ImageExportError,
  MAX_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  MAX_IMAGE_WIDTH,
  layoutImageDocument,
  drawLayout,
  exportImageBytes,
  type ImageExportEnv,
  type ImageExportOptions,
  type Canvas2DLike,
  type DrawOp,
} from '../src/image/index';

/** 确定性测量：CJK 单字 = size，其余字符 = size * 0.6 */
const measureText = (text: string, font: { size: number }): number => {
  let w = 0;
  for (const ch of text) {
    w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? font.size : font.size * 0.6;
  }
  return w;
};

const env: ImageExportEnv = { measureText };

const opts = (over: Partial<ImageExportOptions> = {}): ImageExportOptions => ({
  ...DEFAULT_IMAGE_OPTIONS,
  ...over,
});

const textOps = (ops: DrawOp[]): Array<Extract<DrawOp, { op: 'text' }>> => ops.filter((o): o is Extract<DrawOp, { op: 'text' }> => o.op === 'text');

describe('Image Export — 布局', () => {
  test('背景 rect 置首且覆盖整幅画布；标题/段落文本 op 顺序正确', async () => {
    const layout = await layoutImageDocument('# Hi\n\nHello world', opts(), env);
    expect(layout.ops[0]).toMatchObject({ op: 'rect', x: 0, y: 0, w: layout.width, h: layout.height, color: '#ffffff' });
    const texts = textOps(layout.ops).map((o) => o.text);
    expect(texts).toContain('Hi');
    expect(texts).toContain('Hello');
    expect(texts).toContain('world');
    // 标题字体：bold + 28px + 正文字体族
    const heading = textOps(layout.ops).find((o) => o.text === 'Hi');
    expect(heading?.font).toContain('bold');
    expect(heading?.font).toContain('28px');
    expect(heading?.font).toContain(DEFAULT_IMAGE_OPTIONS.fontFamily);
  });

  test('dark 主题使用 dark 配色', async () => {
    const layout = await layoutImageDocument('# T', opts({ theme: 'dark' }), env);
    const bg = layout.ops[0] as Extract<DrawOp, { op: 'rect' }>;
    expect(bg.color).toBe('#1e1e1e');
    const text = textOps(layout.ops)[0];
    expect(text.color).toBe('#e6e6e6');
  });

  test('宽度 clamp：过小/过大收敛到 [MIN, MAX]', async () => {
    const small = await layoutImageDocument('x', opts({ width: 50 }), env);
    expect(small.width).toBe(MIN_IMAGE_WIDTH);
    const large = await layoutImageDocument('x', opts({ width: 99999 }), env);
    expect(large.width).toBe(MAX_IMAGE_WIDTH);
  });

  test('宽度非法（NaN/负数）→ invalid-width', async () => {
    await expect(layoutImageDocument('x', opts({ width: Number.NaN }), env)).rejects.toMatchObject({ code: 'invalid-width' });
    await expect(layoutImageDocument('x', opts({ width: -1 }), env)).rejects.toMatchObject({ code: 'invalid-width' });
  });

  test('CJK 长文本逐字换行且不超内容宽度', async () => {
    const markdown = '一'.repeat(200); // 200 CJK 字
    const layout = await layoutImageDocument(markdown, opts(), env);
    const contentWidth = layout.width - DEFAULT_IMAGE_OPTIONS.margin * 2;
    // mock 度量：每行 16px/字 → 每行 floor(736/16)=46 字 → ceil(200/46)=5 行
    const byLine = new Map<number, string>();
    for (const op of textOps(layout.ops)) {
      byLine.set(op.y, (byLine.get(op.y) ?? '') + op.text);
    }
    expect(byLine.size).toBe(Math.ceil(200 / Math.floor(contentWidth / 16)));
    // 每行实际宽度不超内容宽（每行 ≤ 46 字 × 16px）
    for (const lineText of byLine.values()) {
      expect(measureText(lineText, { size: 16 })).toBeLessThanOrEqual(contentWidth);
    }
  });

  test('代码块：codeBg 背景 rect + 等宽字体文本 op', async () => {
    const layout = await layoutImageDocument('```js\nconst a = 1;\n```', opts(), env);
    const rect = layout.ops.find((o) => o.op === 'rect' && o.color === '#f6f8fa') as Extract<DrawOp, { op: 'rect' }>;
    expect(rect).toBeDefined();
    expect(rect.w).toBe(layout.width - DEFAULT_IMAGE_OPTIONS.margin * 2);
    const code = textOps(layout.ops).find((o) => o.text === 'const a = 1;');
    expect(code?.font).toContain('13px');
    expect(code?.font).toContain(DEFAULT_IMAGE_OPTIONS.monoFamily);
  });

  test('表格：表头背景 + 边框线 + 单元格文本', async () => {
    const layout = await layoutImageDocument('| a | b |\n|---|---|\n| 1 | 2 |', opts(), env);
    const headerBg = layout.ops.find((o) => o.op === 'rect' && o.color === '#f6f8fa');
    expect(headerBg).toBeDefined();
    const lines = layout.ops.filter((o) => o.op === 'line');
    expect(lines.length).toBeGreaterThan(0);
    const texts = textOps(layout.ops).map((o) => o.text);
    expect(texts).toEqual(expect.arrayContaining(['a', 'b', '1', '2']));
  });

  test('列表：bullet 前缀 + 任务勾选状态 + 有序序号', async () => {
    const layout = await layoutImageDocument('- one\n- [x] done\n1. first', opts(), env);
    const texts = textOps(layout.ops).map((o) => o.text);
    expect(texts).toContain('• ');
    expect(texts).toContain('[x] ');
    expect(texts).toContain('1. ');
  });

  test('图片：loadImage 命中 → image op 等比缩放；失败 → 回退源码文本', async () => {
    const loaded = { data: 'data:image/png;base64,xxxx', width: 400, height: 200 };
    const envWithImage: ImageExportEnv = { measureText, loadImage: async () => loaded };
    const layout = await layoutImageDocument('![alt](assets/foo.png)', opts(), envWithImage);
    const img = layout.ops.find((o) => o.op === 'image') as Extract<DrawOp, { op: 'image' }>;
    expect(img.src).toBe(loaded.data);
    expect(img.w).toBe(400);
    expect(img.h).toBe(200); // 400×200 等比

    const layoutFallback = await layoutImageDocument('![alt](missing.png)', opts(), env);
    const fallback = textOps(layoutFallback.ops).find((o) => o.text.includes('missing.png'));
    expect(fallback).toBeDefined();
  });

  test('图片缩放：自然宽超内容宽 → 收敛到内容宽且等比', async () => {
    const loaded = { data: 'data:image/png;base64,xxxx', width: 2000, height: 1000 };
    const envWithImage: ImageExportEnv = { measureText, loadImage: async () => loaded };
    const layout = await layoutImageDocument('![a](big.png)', opts(), envWithImage);
    const img = layout.ops.find((o) => o.op === 'image') as Extract<DrawOp, { op: 'image' }>;
    const contentWidth = layout.width - DEFAULT_IMAGE_OPTIONS.margin * 2;
    expect(img.w).toBe(contentWidth);
    expect(img.h).toBeCloseTo(contentWidth / 2, 5);
  });

  test('math/mermaid 无渲染器 → 回退源码文本（与 PDF 行为一致）', async () => {
    const layout = await layoutImageDocument('$$\nE=mc^2\n$$\n\n```mermaid\ngraph TD\nA-->B\n```', opts(), env);
    const texts = textOps(layout.ops).map((o) => o.text).join('\n');
    expect(texts).toContain('E=mc^2');
    expect(texts).toContain('graph TD');
  });

  test('删除线：文本 op 后跟删除线 line op', async () => {
    const layout = await layoutImageDocument('~~gone~~', opts(), env);
    const strikeLine = layout.ops.find((o) => o.op === 'line' && o.lineWidth === 1);
    expect(strikeLine).toBeDefined();
    expect(textOps(layout.ops).map((o) => o.text).join('')).toContain('gone');
  });

  test('长图保护：高度超限 → image-too-long', async () => {
    // 每段约 26.4px 高（16×1.65）+12 gap；构造 > 16384px 的文档
    const paragraphs = Array.from({ length: 700 }, (_, i) => `第${i}段`).join('\n\n');
    await expect(layoutImageDocument(paragraphs, opts({ width: 800 }), env)).rejects.toMatchObject({
      code: 'image-too-long',
      name: 'ImageExportError',
    });
  });

  test('长图保护（总像素）：超宽 × 超高 → image-too-long', async () => {
    // 2000px 宽 × ~26880px 高 ≈ 53.8M px > 32M（像素检查先于高度检查触发）
    const paragraphs = Array.from({ length: 700 }, (_, i) => `第${i}段`).join('\n\n');
    await expect(layoutImageDocument(paragraphs, opts({ width: 2000 }), env)).rejects.toMatchObject({ code: 'image-too-long' });
  });

  test('保护阈值以下正常导出', async () => {
    const layout = await layoutImageDocument('# ok\n\nshort doc', opts(), env);
    expect(layout.height).toBeLessThanOrEqual(MAX_IMAGE_HEIGHT);
    expect(layout.width * layout.height).toBeLessThanOrEqual(32_000_000);
  });

  test('空文档：仅背景，高度 = 2 × margin', async () => {
    const layout = await layoutImageDocument('', opts(), env);
    expect(layout.ops).toHaveLength(1);
    expect(layout.height).toBe(DEFAULT_IMAGE_OPTIONS.margin * 2);
  });
});

describe('Image Export — 绘制与编码', () => {
  /** 记录型画布（断言 fillText/fillRect 调用与 toDataURL 参数） */
  function recordingCanvas() {
    const calls: string[] = [];
    const ctx: Canvas2DLike = {
      fillStyle: '', font: '', strokeStyle: '', lineWidth: 1,
      fillRect: (x, y, w, h) => calls.push(`rect:${x},${y},${w},${h}`),
      fillText: (text, x, y) => calls.push(`text:${text}@${x},${y}`),
      beginPath: () => calls.push('beginPath'),
      moveTo: (x, y) => calls.push(`moveTo:${x},${y}`),
      lineTo: (x, y) => calls.push(`lineTo:${x},${y}`),
      stroke: () => calls.push('stroke'),
    };
    let toDataURLArgs: { mime: string; quality?: number } | null = null;
    // 1×1 PNG / JPEG magic（编码由真实 canvas 完成，这里只验证透传）
    const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const canvas = {
      ctx,
      toDataURL(mime: string, quality?: number) {
        toDataURLArgs = { mime, quality };
        return mime === 'image/jpeg'
          ? 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDP/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA='
          : PNG_1PX;
      },
    };
    return { canvas, calls, toDataURLArgs: () => toDataURLArgs };
  }

  test('drawLayout 执行背景 rect 与文本 fillText', async () => {
    const layout = await layoutImageDocument('# Hi', opts(), env);
    const { canvas, calls } = recordingCanvas();
    drawLayout(layout, canvas.ctx);
    expect(calls[0]).toMatch(/^rect:0,0,/);
    expect(calls.some((c) => c.startsWith('text:Hi@'))).toBe(true);
  });

  test('exportImageBytes PNG：mime 透传 + PNG 魔数字节', async () => {
    const { canvas, toDataURLArgs } = recordingCanvas();
    const bytes = await exportImageBytes('# Hi', opts({ format: 'png' }), env, () => canvas);
    expect(toDataURLArgs()).toEqual({ mime: 'image/png', quality: undefined });
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  test('exportImageBytes JPEG：mime + quality 透传 + JPEG 魔数字节', async () => {
    const { canvas, toDataURLArgs } = recordingCanvas();
    const bytes = await exportImageBytes('# Hi', opts({ format: 'jpeg', quality: 0.5 }), env, () => canvas);
    expect(toDataURLArgs()).toEqual({ mime: 'image/jpeg', quality: 0.5 });
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  test('exportImageBytes image op 经 env.drawImage 绘制', async () => {
    const drawn: string[] = [];
    const envWithDraw: ImageExportEnv = {
      measureText,
      loadImage: async () => ({ data: 'data:image/png;base64,xx', width: 100, height: 50 }),
      drawImage: (src) => drawn.push(src),
    };
    const { canvas } = recordingCanvas();
    await exportImageBytes('![a](a.png)', opts(), envWithDraw, () => canvas);
    expect(drawn).toEqual(['data:image/png;base64,xx']);
  });

  test('exportImageBytes 长图保护：抛 ImageExportError 且不创建画布', async () => {
    const paragraphs = Array.from({ length: 700 }, (_, i) => `第${i}段`).join('\n\n');
    let created = 0;
    await expect(
      exportImageBytes(paragraphs, opts(), env, () => {
        created += 1;
        return recordingCanvas().canvas;
      }),
    ).rejects.toBeInstanceOf(ImageExportError);
    expect(created).toBe(0);
  });
});
