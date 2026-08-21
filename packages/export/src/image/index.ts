/**
 * Image Export（T-0607，PRD §74：PNG / JPEG / width / quality / long-image protection）。
 *
 * 策略（与 PDF 导出同哲学：确定性布局 + 宿主注入）：
 * - layoutImageDocument：纯布局（块解析复用 parseBlocks）→ 定位绘制指令（DrawOp 列表）；
 *   文本测量经 env.measureText 注入（webview 用真实 canvas，测试用确定性 mock）；
 * - drawLayout：把 DrawOp 执行到 Canvas2D-like 上下文（webview 真实 canvas / 测试记录器）；
 * - exportImageBytes：layout → 绘制 → toDataURL 编码（PNG 无损 / JPEG quality）；
 * - 长图保护（PRD §74 long-image protection）：超出画布尺寸上限 → image-too-long 错误。
 *
 * 排版常量 px 制（正文 16px），配色复用 PDF_THEME_COLORS（与 PDF/Print 单一真源）。
 * 平台约束：纯 JS（node 可测）；文件落盘由宿主（Rust write_binary）完成。
 */

import { parseBlocks, parseInline } from '../index';
import type { Inline, PdfBlock } from '../index';
import { PDF_THEME_COLORS } from '../typography';

// ── 选项 ────────────────────────────────────────────────────

export type ImageExportFormat = 'png' | 'jpeg';

export interface ImageExportOptions {
  format: ImageExportFormat;
  /** 画布宽度（px），clamp 到 [MIN_IMAGE_WIDTH, MAX_IMAGE_WIDTH] */
  width: number;
  /** JPEG 质量 0-1（PNG 无损，忽略） */
  quality: number;
  theme: 'light' | 'dark';
  /** 四周留白（px） */
  margin: number;
  /** 正文字体族 */
  fontFamily: string;
  /** 等宽字体族 */
  monoFamily: string;
}

export const MIN_IMAGE_WIDTH = 200;
export const MAX_IMAGE_WIDTH = 4096;
/** 长图保护：单边上限（对齐主流 canvas 引擎 16384 上限） */
export const MAX_IMAGE_HEIGHT = 16384;
/** 长图保护：总像素上限（宽 × 高；保守值，覆盖 WKWebView 大画布限制） */
export const MAX_IMAGE_PIXELS = 32_000_000;

export const DEFAULT_IMAGE_OPTIONS: ImageExportOptions = {
  format: 'png',
  width: 800,
  quality: 0.92,
  theme: 'light',
  margin: 32,
  fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  monoFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
};

/** 长图保护 / 宽度非法错误（App 层映射为可读 toast） */
export class ImageExportError extends Error {
  constructor(readonly code: 'image-too-long' | 'invalid-width', message: string) {
    super(message);
    this.name = 'ImageExportError';
  }
}

// ── 环境（宿主注入） ─────────────────────────────────────────

/** 已加载位图（dataURL 或可绘制 URL + 自然尺寸） */
export interface LoadedImage {
  data: string;
  width: number;
  height: number;
}

/** 字体规格：css 为完整 canvas font 字符串；size 供行高计算 */
export interface ImageFontSpec {
  css: string;
  size: number;
  mono?: boolean;
}

export interface ImageExportEnv {
  /** 文本测量（webview：真实 ctx.measureText；测试：确定性 mock） */
  measureText(text: string, font: ImageFontSpec): number;
  /** markdown 图片 src → 位图（失败/未配置 → null，回退源码文本） */
  loadImage?: (src: string) => Promise<LoadedImage | null>;
  /** 位图绘制（webview：缓存的 HTMLImageElement；缺省跳过 image op） */
  drawImage?: (src: string, ctx: Canvas2DLike, x: number, y: number, w: number, h: number) => void;
}

// ── 绘制指令与画布契约 ───────────────────────────────────────

export type DrawOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { op: 'text'; x: number; y: number; text: string; font: string; color: string }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number }
  | { op: 'image'; x: number; y: number; w: number; h: number; src: string };

export interface Canvas2DLike {
  fillStyle: string;
  font: string;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

export interface CanvasLike {
  readonly ctx: Canvas2DLike;
  toDataURL(mime: string, quality?: number): string;
}

export interface ImageLayout {
  width: number;
  height: number;
  ops: DrawOp[];
}

// ── 排版常量（px） ──────────────────────────────────────────

const HEADING_SCALE: Record<number, number> = { 1: 28, 2: 24, 3: 20, 4: 18, 5: 17, 6: 16 };
const BODY_SIZE = 16;
const CODE_SIZE = 13;
const SMALL_SIZE = 13;
const LINE_HEIGHT = 1.65;
const CODE_LINE_HEIGHT = 1.5;
const BLOCK_GAP = 12;

interface Chunk {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

function fontSpec(size: number, opts: { bold?: boolean; italic?: boolean; mono?: boolean }, options: ImageExportOptions): ImageFontSpec {
  const family = opts.mono === true ? options.monoFamily : options.fontFamily;
  const css = `${opts.italic === true ? 'italic ' : ''}${opts.bold === true ? 'bold ' : ''}${size}px ${family}`;
  return { css, size, mono: opts.mono };
}

/** 行内 token → 绘制小块（链接折叠为文字、图片折叠为源码，与 PDF 一致） */
function inlineToChunks(inlines: Inline[]): Chunk[] {
  return inlines.filter((t) => t.text !== '').map((t) => ({
    text: t.text, bold: t.bold, italic: t.italic, code: t.code, strike: t.strike,
  }));
}

/** 拆分为可换行单元：CJK 单字断行，拉丁按词，空白独立（CJK 标点跟随单字） */
const CJK_UNIT_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]|[^\s]+|\s+/gu;

function toUnits(chunk: Chunk): Chunk[] {
  const units: Chunk[] = [];
  const matches = chunk.text.match(CJK_UNIT_RE) ?? [chunk.text];
  for (const m of matches) {
    units.push({ text: m, bold: chunk.bold, italic: chunk.italic, code: chunk.code, strike: chunk.strike });
  }
  return units;
}

/** 贪心断行（CJK 逐字 / 拉丁逐词）；返回行列表（每行 = chunk 序列） */
function wrapChunks(chunks: Chunk[], maxWidth: number, env: ImageExportEnv, options: ImageExportOptions): Chunk[][] {
  const units = chunks.flatMap(toUnits);
  const lines: Chunk[][] = [];
  let line: Chunk[] = [];
  let lineW = 0;
  for (const unit of units) {
    const spec = fontSpec(unit.code === true ? BODY_SIZE * 0.9 : BODY_SIZE, unit, options);
    const w = env.measureText(unit.text, spec);
    if (lineW + w > maxWidth && line.length > 0) {
      // 去掉行首空白
      while (line.length > 0 && line[0].text.trim() === '') line.shift();
      lines.push(line);
      if (unit.text.trim() === '') continue; // 换行处的空白丢弃
      line = [unit];
      lineW = w;
    } else {
      line.push(unit);
      lineW += w;
    }
  }
  while (line.length > 0 && line[0].text.trim() === '') line.shift();
  if (line.length > 0) lines.push(line);
  return lines;
}

/** 布局器：光标推进 + ops 收集 */
class Layout {
  readonly ops: DrawOp[] = [];
  private y = 0;

  constructor(
    readonly width: number,
    readonly margin: number,
    private readonly env: ImageExportEnv,
    private readonly options: ImageExportOptions,
    private readonly fg: string,
  ) {
    this.y = margin;
  }

  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  get cursor(): number {
    return this.y;
  }

  advance(px: number): void {
    this.y += px;
  }

  /** 渲染一組行内块（wrap 后逐行绘制，返回占用高度） */
  renderInlines(chunks: Chunk[], opts: { size?: number; bold?: boolean; italic?: boolean; indent?: number; color?: string } = {}): number {
    const size = opts.size ?? BODY_SIZE;
    const indent = opts.indent ?? 0;
    const color = opts.color ?? this.fg;
    const maxWidth = this.contentWidth - indent;
    // wrapChunks 以 BODY_SIZE 断行；此处块级统一尺寸（标题/脚注）按比例换算阈值
    const scale = size / BODY_SIZE;
    const lines = wrapChunks(chunks.map((c) => ({ ...c, bold: c.bold === true || opts.bold === true, italic: c.italic === true || opts.italic === true })), maxWidth / scale, this.env, this.options);
    const advance = size * LINE_HEIGHT;
    for (const line of lines) {
      let x = this.margin + indent;
      const baseline = this.y + size * 1.1;
      for (const chunk of line) {
        const spec = fontSpec(chunk.code === true ? size * 0.9 : size, chunk, this.options);
        this.ops.push({ op: 'text', x, y: baseline, text: chunk.text, font: spec.css, color });
        const w = this.env.measureText(chunk.text, spec);
        if (chunk.strike === true) {
          this.ops.push({ op: 'line', x1: x, y1: baseline - size * 0.28, x2: x + w, y2: baseline - size * 0.28, color, lineWidth: 1 });
        }
        x += w;
      }
      this.y += advance;
    }
    return lines.length * advance;
  }

  text(text: string, opts: { x?: number; size?: number; bold?: boolean; italic?: boolean; mono?: boolean; color?: string }): void {
    const size = opts.size ?? BODY_SIZE;
    const spec = fontSpec(size, { bold: opts.bold, italic: opts.italic, mono: opts.mono }, this.options);
    this.ops.push({ op: 'text', x: opts.x ?? this.margin, y: this.y + size * 1.1, text, font: spec.css, color: opts.color ?? this.fg });
    this.y += size * LINE_HEIGHT;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ops.push({ op: 'rect', x, y, w, h, color });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth = 1): void {
    this.ops.push({ op: 'line', x1, y1, x2, y2, color, lineWidth });
  }

  image(x: number, y: number, w: number, h: number, src: string): void {
    this.ops.push({ op: 'image', x, y, w, h, src });
  }
}

/** 单元格文本截断（表格列宽有限，超宽截尾 …） */
function truncateCell(text: string, maxWidth: number, env: ImageExportEnv, spec: ImageFontSpec): string {
  if (env.measureText(text, spec) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && env.measureText(`${out}…`, spec) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/**
 * 布局：markdown → 定位绘制指令（纯函数；图片经 env.loadImage 异步加载）。
 * 长图保护：高度 > MAX_IMAGE_HEIGHT 或总像素 > MAX_IMAGE_PIXELS → ImageExportError。
 */
export async function layoutImageDocument(markdown: string, rawOptions: ImageExportOptions, env: ImageExportEnv): Promise<ImageLayout> {
  if (!Number.isFinite(rawOptions.width) || rawOptions.width <= 0) {
    throw new ImageExportError('invalid-width', `图片宽度非法: ${rawOptions.width}`);
  }
  const options: ImageExportOptions = { ...rawOptions, width: Math.min(Math.max(Math.round(rawOptions.width), MIN_IMAGE_WIDTH), MAX_IMAGE_WIDTH) };
  const colors = PDF_THEME_COLORS[options.theme];
  const blocks = parseBlocks(markdown);
  const L = new Layout(options.width, options.margin, env, options, colors.fg);

  const headings = blocks.filter((b): b is Extract<PdfBlock, { type: 'heading' }> => b.type === 'heading');

  const renderBlock = async (block: PdfBlock): Promise<void> => {
    switch (block.type) {
      case 'heading': {
        const size = HEADING_SCALE[Math.min(Math.max(block.level, 1), 6)] ?? BODY_SIZE;
        L.advance(block.level === 1 ? 20 : 14);
        L.renderInlines(inlineToChunks(block.content), { size, bold: true });
        L.advance(6);
        break;
      }
      case 'paragraph':
        L.renderInlines(inlineToChunks(block.content));
        L.advance(BLOCK_GAP);
        break;
      case 'text':
        L.renderInlines(inlineToChunks(block.content));
        L.advance(BLOCK_GAP);
        break;
      case 'list': {
        const indent = 24;
        block.items.forEach((item, idx) => {
          const prefix = item.task ? (item.checked ? '[x] ' : '[ ] ') : block.ordered ? `${idx + 1}. ` : '• ';
          const prefixSpec = fontSpec(BODY_SIZE, { mono: item.task }, options);
          L.ops.push({ op: 'text', x: L.margin + indent - 20, y: L.cursor + BODY_SIZE * 1.1, text: prefix, font: prefixSpec.css, color: colors.fg });
          const prefixW = Math.max(env.measureText(prefix, prefixSpec), 14);
          const lines = wrapChunks(inlineToChunks(item.content), L.contentWidth - indent - prefixW, env, options);
          const advance = BODY_SIZE * LINE_HEIGHT;
          for (const line of lines) {
            let x = L.margin + indent + prefixW;
            const baseline = L.cursor + BODY_SIZE * 1.1;
            for (const chunk of line) {
              const spec = fontSpec(chunk.code === true ? BODY_SIZE * 0.9 : BODY_SIZE, chunk, options);
              L.ops.push({ op: 'text', x, y: baseline, text: chunk.text, font: spec.css, color: colors.fg });
              x += env.measureText(chunk.text, spec);
            }
            L.advance(advance);
          }
          L.advance(6);
        });
        L.advance(BLOCK_GAP - 6);
        break;
      }
      case 'blockquote': {
        const top = L.cursor;
        L.advance(2);
        const h = L.renderInlines(inlineToChunks(block.content), { italic: true, indent: 18 });
        const bottom = top + 2 + h + 4;
        L.line(L.margin + 1.5, top, L.margin + 1.5, bottom, colors.border, 3);
        L.advance(6);
        break;
      }
      case 'code': {
        const padding = 12;
        const lines = block.text.split('\n');
        const advance = CODE_SIZE * CODE_LINE_HEIGHT;
        const height = lines.length * advance + padding * 2;
        L.rect(L.margin, L.cursor, L.contentWidth, height, colors.codeBg);
        L.advance(padding);
        for (const lineText of lines) {
          const spec = fontSpec(CODE_SIZE, { mono: true }, options);
          L.ops.push({ op: 'text', x: L.margin + padding, y: L.cursor + CODE_SIZE * 1.1, text: lineText, font: spec.css, color: colors.fg });
          L.advance(advance);
        }
        L.advance(padding + BLOCK_GAP);
        break;
      }
      case 'table': {
        const cols = block.header.length;
        const colW = L.contentWidth / cols;
        const rowH = 32;
        const cellSpec = fontSpec(BODY_SIZE, {}, options);
        const headSpec = fontSpec(BODY_SIZE, { bold: true }, options);
        const rows = [block.header, ...block.rows];
        rows.forEach((row, r) => {
          const y = L.cursor;
          if (r === 0) L.rect(L.margin, y, L.contentWidth, rowH, colors.codeBg);
          row.forEach((cell, c) => {
            const x = L.margin + c * colW;
            const spec = r === 0 ? headSpec : cellSpec;
            const text = truncateCell(cell, colW - 16, env, spec);
            L.ops.push({ op: 'text', x: x + 8, y: y + rowH / 2 + BODY_SIZE * 0.35, text, font: spec.css, color: colors.fg });
          });
          L.advance(rowH);
          L.line(L.margin, L.cursor, L.margin + L.contentWidth, L.cursor, colors.border, 1);
        });
        for (let c = 0; c <= cols; c++) {
          L.line(L.margin + c * colW, L.cursor - rows.length * rowH, L.margin + c * colW, L.cursor, colors.border, 1);
        }
        L.advance(BLOCK_GAP);
        break;
      }
      case 'hr':
        L.advance(10);
        L.line(L.margin, L.cursor, L.margin + L.contentWidth, L.cursor, colors.border, 1);
        L.advance(10 + BLOCK_GAP);
        break;
      case 'image': {
        const loaded = env.loadImage !== undefined ? await env.loadImage(block.src) : null;
        if (loaded === null || loaded.width <= 0 || loaded.height <= 0) {
          L.text(`[${block.alt}](${block.src})`, { mono: true, size: CODE_SIZE });
        } else {
          const w = Math.min(L.contentWidth, loaded.width);
          const h = (w * loaded.height) / loaded.width;
          L.image(L.margin + (L.contentWidth - w) / 2, L.cursor, w, h, loaded.data);
          L.advance(h + BLOCK_GAP);
        }
        break;
      }
      case 'math':
        // 宿主未注入渲染器 → 回退源码（与 PDF 回退一致）
        L.text(block.tex, { italic: true, mono: true, size: CODE_SIZE });
        L.advance(BLOCK_GAP);
        break;
      case 'mermaid':
        L.text(block.code, { mono: true, size: CODE_SIZE });
        L.advance(BLOCK_GAP);
        break;
      case 'alert':
        L.text(`${block.kind}: `, { bold: true, size: BODY_SIZE });
        L.renderInlines(inlineToChunks(block.content), { indent: 0 });
        L.advance(BLOCK_GAP);
        break;
      case 'toc': {
        L.text('Contents', { size: 18, bold: true });
        L.advance(4);
        for (const h of headings) {
          const text = h.content.map((t) => t.text).join('');
          L.text(`${'  '.repeat(Math.min(h.level - 1, 3))}${text}`, { size: SMALL_SIZE });
        }
        L.advance(BLOCK_GAP);
        break;
      }
      case 'pagebreak':
        // 长图导出无分页 → 忽略
        break;
      case 'footnote':
        L.text(`[${block.id}] ${block.content}`, { size: SMALL_SIZE, color: colors.fg });
        break;
      default:
        break;
    }
  };

  for (const block of blocks) {
    await renderBlock(block);
  }
  const height = L.cursor + options.margin;

  // 长图保护（PRD §74）：总像素先行，单边高度兜底
  if (options.width * height > MAX_IMAGE_PIXELS) {
    throw new ImageExportError('image-too-long', `图片总像素 ${options.width * height} 超出上限 ${MAX_IMAGE_PIXELS}（长图保护），请减小宽度或分段导出`);
  }
  if (height > MAX_IMAGE_HEIGHT) {
    throw new ImageExportError('image-too-long', `图片高度 ${Math.round(height)}px 超出上限 ${MAX_IMAGE_HEIGHT}px（长图保护），请分段导出`);
  }

  // 背景 rect 置首（覆盖整幅画布）
  const ops: DrawOp[] = [{ op: 'rect', x: 0, y: 0, w: options.width, h: height, color: colors.bg }, ...L.ops];

  return { width: options.width, height, ops };
}

/** 把布局执行到画布（image op 经 env.drawImage；缺省跳过） */
export function drawLayout(layout: ImageLayout, ctx: Canvas2DLike, drawImage?: ImageExportEnv['drawImage']): void {
  for (const op of layout.ops) {
    switch (op.op) {
      case 'rect':
        ctx.fillStyle = op.color;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      case 'text':
        ctx.font = op.font;
        ctx.fillStyle = op.color;
        ctx.fillText(op.text, op.x, op.y);
        break;
      case 'line':
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.lineWidth;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case 'image':
        drawImage?.(op.src, ctx, op.x, op.y, op.w, op.h);
        break;
      default:
        break;
    }
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 完整导出：layout → 绘制 → 编码（PNG / JPEG quality） */
export async function exportImageBytes(
  markdown: string,
  options: ImageExportOptions,
  env: ImageExportEnv,
  createCanvas: (width: number, height: number) => CanvasLike,
): Promise<Uint8Array> {
  const layout = await layoutImageDocument(markdown, options, env);
  const canvas = createCanvas(layout.width, layout.height);
  drawLayout(layout, canvas.ctx, env.drawImage);
  const mime = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = options.format === 'jpeg' ? options.quality : undefined;
  const dataUrl = canvas.toDataURL(mime, quality);
  return base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

export { parseInline, parseBlocks };
