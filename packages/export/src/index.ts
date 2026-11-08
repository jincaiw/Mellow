/// <reference path="./pdfmake.d.ts" />
/**
 * PDF Export（T-0606，PRD §72）。
 *
 * 三平台排版高度一致策略：
 * - pdfmake 确定性布局引擎（不依赖平台 WebView 渲染/字体）；
 * - 嵌入 Noto Sans SC 子集字体（CJK + 拉丁统一字形，浏览器无关）；
 * - math / mermaid 预渲染为 PNG 图片嵌入（像素级一致）；
 * - 支持：A4/A5/Letter/Custom、margin、theme(light/dark)、print background、
 *   header/footer、page number、page break at H1、outline(toc)、footnote、alert。
 *
 * 平台约束：纯 JS（node 可测）；文件落盘由宿主（Rust fs.write_binary）完成。
 */

import pdfMake from 'pdfmake/build/pdfmake';
import { PDF_THEME_COLORS, PDF_TYPOGRAPHY, type PdfThemeColors } from './typography';

// ── 选项 ────────────────────────────────────────────────────

export type PdfPaperSize = 'A4' | 'A5' | 'Letter' | 'Custom';

export interface PdfOptions {
  paperSize: PdfPaperSize;
  /** Custom 时宽高（pt） */
  customWidth?: number;
  customHeight?: number;
  /** 四周 margin（pt） */
  margin: number;
  theme: 'light' | 'dark';
  printBackground: boolean;
  header: boolean;
  footer: boolean;
  pageNumbers: boolean;
  pageBreakAtH1: boolean;
  includeOutline: boolean;
  /** 页眉/页脚显示标题 */
  title?: string;
  /**
   * 导出时保留单换行符（V7-W6，G7-FEAT-13）。
   *
   * 对齐 Typora 的 `preLinebreakOnExport`（「导出时保留单换行符」，**默认 false**）。
   * 背景：Mellow 的 Enter 产出**单个 `\n`**（见方案 G7-EDIT-07），而 CommonMark 把段内单换行
   * 渲染为**空格** → 不开启时编辑器里看到的换行会在导出件里**消失**（所见非所得）。
   * 开启后段内 `\n` 直接进入 pdfmake 文本（其将 `\n` 渲染为换行）。
   *
   * 与 HTML 导出同名选项保持**语义一致**（同一设置同时作用于两条管线）。
   */
  preserveLineBreaks?: boolean;
  /**
   * 代码块是否显示行号（默认 false）。
   *
   * 与 HTML 导出的 `codeLineNumbers` 同义、同源设置（`markdown.codeLineNumbers`），
   * 对齐 Typora `File.option.showLineNumbersForFence`。PDF 由 pdfmake 绘制，
   * 没有 CSS gutter ⇒ 用无边框两列表格模拟（行号右对齐 + 代码列）。
   * 行号是**独立的文本节点**，复制代码时不会混入行号。
   *
   * ⚠️ ADR-0037 = A2（Accepted）计划把 PDF 导出切到系统打印管线（批次 A37），
   * 届时本选项自动改由 HTML/打印渲染器承载；在此之前本实现保证两条渲染路径语义一致。
   */
  codeLineNumbers?: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  paperSize: 'A4',
  margin: 60,
  theme: 'light',
  printBackground: true,
  header: false,
  footer: true,
  pageNumbers: true,
  pageBreakAtH1: true,
  includeOutline: true,
  preserveLineBreaks: false,
  codeLineNumbers: false,
};

export interface PdfEnv {
  fonts: { normal: Uint8Array; bold: Uint8Array };
  /** markdown 图片 src → PNG dataURL（无法解析 → null） */
  resolveImage?: (src: string) => Promise<string | null>;
  /** math tex → PNG dataURL（无法渲染 → null，输出源码） */
  renderMath?: (tex: string, display: boolean) => Promise<string | null>;
  /** mermaid 源码 → PNG dataURL（无法渲染 → null，输出源码） */
  renderMermaid?: (code: string) => Promise<string | null>;
}

export async function loadNotoFonts(baseUrl = ''): Promise<{ normal: Uint8Array; bold: Uint8Array }> {
  const [normal, bold] = await Promise.all([
    fetch(`${baseUrl}/fonts/NotoSansSC-Regular.ttf`).then((r) => r.arrayBuffer()),
    fetch(`${baseUrl}/fonts/NotoSansSC-Bold.ttf`).then((r) => r.arrayBuffer()),
  ]);
  return { normal: new Uint8Array(normal), bold: new Uint8Array(bold) };
}

// ── Markdown 块解析 ─────────────────────────────────────────

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

export type PdfBlock =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Array<{ task: boolean; checked: boolean; content: Inline[] }> }
  | { type: 'blockquote'; content: Inline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'table'; header: string[]; rows: string[][]; align?: Array<'left' | 'center' | 'right' | undefined> }
  | { type: 'hr' }
  | { type: 'image'; alt: string; src: string }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'mermaid'; code: string }
  | { type: 'alert'; kind: string; content: Inline[] }
  | { type: 'toc' }
  | { type: 'pagebreak' }
  | { type: 'footnote'; id: string; content: string }
  | { type: 'text'; content: Inline[] };

interface BlockLine {
  text: string;
  start: number;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})([^\s`]*)?/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}\s*$/;
const MATH_OPEN_RE = /^\$\$\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

function splitLines(markdown: string): BlockLine[] {
  const lines = markdown.split('\n');
  let offset = 0;
  return lines.map((text) => {
    const line = { text, start: offset };
    offset += text.length + 1;
    return line;
  });
}

/** 行内 token 化：**bold** *italic* ~~strike~~ `code` [label](url) ![alt](src) $math$ */
export function parseInline(text: string): Inline[] {
  const tokens: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = rest.match(/^(!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|`([^`\n]+)`|\$([^$\n]+)\$)/);
    if (match === null) {
      const next = rest.search(/(!\[|\*\*|\*|~~|`|\$|\[)/);
      if (next === -1) {
        tokens.push({ text: rest });
        break;
      }
      if (next > 0) tokens.push({ text: rest.slice(0, next) });
      if (next === 0) {
        // 特殊字符（如 `$`）开头但不匹配完整语法：作为字面文本消费，避免死循环
        tokens.push({ text: rest[0] });
        rest = rest.slice(1);
        continue;
      }
      rest = rest.slice(next);
      continue;
    }
    if (match[0].startsWith('![')) {
      const img = match[0];
      const alt = img.slice(2, img.indexOf(']'));
      const src = img.slice(img.indexOf('(') + 1, img.lastIndexOf(')'));
      tokens.push({ text: `![${alt}](${src})` });
    } else if (match[0].startsWith('[')) {
      const link = match[0];
      const label = link.slice(1, link.indexOf(']'));
      tokens.push({ text: label });
    } else if (match[2] !== undefined) {
      tokens.push({ text: match[2], bold: true });
    } else if (match[3] !== undefined) {
      tokens.push({ text: match[3], italic: true });
    } else if (match[4] !== undefined) {
      tokens.push({ text: match[4], strike: true });
    } else if (match[5] !== undefined) {
      tokens.push({ text: match[5], code: true });
    } else if (match[6] !== undefined) {
      tokens.push({ text: `$${match[6]}$` });
    }
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

export function parseBlocks(markdown: string, options: { preserveLineBreaks?: boolean } = {}): PdfBlock[] {
  const lines = splitLines(markdown);
  const blocks: PdfBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].text;
    const trimmed = line.trim();

    // pagebreak 注释
    if (/<!--\s*pagebreak\s*-->/i.test(trimmed)) {
      blocks.push({ type: 'pagebreak' });
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence !== null) {
      const char = fence[1][0];
      const language = (fence[2] ?? '').trim().toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const close = lines[i].text.match(FENCE_RE);
        if (close !== null && close[1][0] === char) {
          i += 1;
          break;
        }
        codeLines.push(lines[i].text);
        i += 1;
      }
      const code = codeLines.join('\n');
      if (language === 'mermaid') blocks.push({ type: 'mermaid', code });
      else blocks.push({ type: 'code', language, text: code });
      continue;
    }

    if (MATH_OPEN_RE.test(line)) {
      const texLines: string[] = [];
      i += 1;
      while (i < lines.length && !MATH_OPEN_RE.test(lines[i].text)) {
        texLines.push(lines[i].text);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'math', tex: texLines.join('\n').trim(), display: true });
      continue;
    }

    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].text)) {
      // GFM：cell 内 \| 是字面竖线，不构成列分隔。先用占位符保护，拆列后还原，
      // 否则含 \| 的行会多出列，下游 pdfmake 表格 widths 越界崩溃。
      const splitRow = (raw: string): string[] =>
        raw
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .replace(/\\\|/g, '\u0000')
          .split('|')
          .map((c) => c.trim().replace(/\u0000/g, '|'));
      const header = splitRow(line);
      // GFM 对齐语法：`:--` 左、`:-:` 中、`--:` 右。此前整行只被当作分隔符丢弃，
      // PDF 里所有列一律左对齐 —— 与 HTML/打印路径（mellow-align-* class）不一致。
      const align = splitRow(lines[i + 1].text).map((c): 'left' | 'center' | 'right' | undefined => {
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return undefined;
      });
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].text)) {
        rows.push(splitRow(lines[i].text));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows, align });
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i].text)) {
        quoteLines.push(lines[i].text.replace(QUOTE_RE, '$1'));
        i += 1;
      }
      const first = quoteLines[0].trim();
      const alert = first.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alert !== null) {
        const body = [alert[2].trim(), ...quoteLines.slice(1).map((t) => t.trim()).filter((t) => t !== '')];
        blocks.push({ type: 'alert', kind: alert[1].toUpperCase(), content: parseInline(body.join(' ')) });
      } else {
        blocks.push({ type: 'blockquote', content: parseInline(quoteLines.join(' ')) });
      }
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // 独立行图片 → image 块（switch 已支持，此处补全解析）
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
    if (imgMatch !== null) {
      blocks.push({ type: 'image', alt: imgMatch[1], src: imgMatch[2] });
      i += 1;
      continue;
    }

    const list = line.match(LIST_RE);
    if (list !== null && list[2] !== '*') {
      const ordered = /^\d+\.$/.test(list[2]);
      const indent = list[1].length;
      const items: Array<{ task: boolean; checked: boolean; content: Inline[] }> = [];
      while (i < lines.length) {
        const m = lines[i].text.match(LIST_RE);
        if (m === null || m[1].length !== indent || (ordered ? !/^\d+\.$/.test(m[2]) : /^\d+\.$/.test(m[2]))) break;
        const task = m[3].match(TASK_RE);
        if (task !== null) items.push({ task: true, checked: task[1].toLowerCase() === 'x', content: parseInline(task[2]) });
        else items.push({ task: false, checked: false, content: parseInline(m[3]) });
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^\[toc\]\s*$/i.test(trimmed)) {
      blocks.push({ type: 'toc' });
      i += 1;
      continue;
    }

    const footnoteDef = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (footnoteDef !== null) {
      blocks.push({ type: 'footnote', id: footnoteDef[1], content: footnoteDef[2] });
      i += 1;
      continue;
    }

    if (trimmed === '') {
      i += 1;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const t = lines[i].text;
      if (t.trim() === '' || FENCE_RE.test(t) || MATH_OPEN_RE.test(t) || HEADING_RE.test(t) || LIST_RE.test(t) || QUOTE_RE.test(t) || HR_RE.test(t) || TABLE_ROW_RE.test(t) || /^\[\^[^\]]+\]:/.test(t) || /<!--\s*pagebreak/.test(t)) break;
      para.push(t);
      i += 1;
    }
    // V7-W6（G7-FEAT-13）：Typora `preLinebreakOnExport` —— 开启时保留段内单换行
    // （CommonMark 默认把段内 `\n` 渲染为空格；Mellow 的 Enter 正是产单换行）。
    blocks.push({ type: 'paragraph', content: parseInline(para.join(options.preserveLineBreaks === true ? '\n' : ' ')) });
  }
  return blocks;
}

// ── pdfmake 文档定义 ────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PdfDocDefinition {
  content: any[];
  pageSize: any;
  pageMargins: number[];
  defaultStyle?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  background?: unknown;
  header?: unknown;
  footer?: unknown;
  pageBreakBefore?: (el: unknown) => boolean;
}

const THEME_COLORS = PDF_THEME_COLORS;

function inlineToPdf(inline: Inline[]): any {
  return inline.map((token) => {
    const style: Record<string, unknown> = {};
    if (token.bold) style.bold = true;
    if (token.italic) style.italics = true;
    if (token.strike) style.strike = true;
    if (token.code) style.fontSize = 9;
    return Object.keys(style).length > 0 ? { text: token.text, ...style } : token.text;
  });
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[{}]/g, '');
}

/**
 * PDF 代码块行号（Typora `showLineNumbersForFence`）。
 *
 * pdfmake 没有 CSS gutter ⇒ 用无边框两列表格模拟：左列行号（右对齐）、右列代码。
 * 行号是**独立文本节点**（不是拼进代码字符串），复制代码时不会带上行号 ——
 * 与 HTML 导出（`user-select:none` 的独立 span）语义一致。
 * 尾随换行不算一行；块内空行保留行号（空行用单个空格占位，避免行高塌陷）。
 */
function buildNumberedCodeBlock(text: string, colors: PdfThemeColors): Record<string, unknown> {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return { text: '', style: 'code', background: colors.codeBg };
  return {
    table: {
      widths: ['auto', '*'],
      dontBreakRows: true,
      body: lines.map((line, index) => [
        { text: String(index + 1), style: 'codeNum', alignment: 'right', fillColor: colors.codeBg },
        { text: line === '' ? ' ' : line, style: 'code', fillColor: colors.codeBg },
      ]),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: (index: number) => (index === 0 ? 6 : 0),
      paddingTop: () => 1,
      paddingBottom: () => 1,
    },
    margin: [0, 4, 0, 4],
  };
}

export async function buildPdfDocument(markdown: string, options: PdfOptions, env: PdfEnv): Promise<PdfDocDefinition> {
  const blocks = parseBlocks(markdown, { preserveLineBreaks: options.preserveLineBreaks });
  const colors = THEME_COLORS[options.theme];
  const content: any[] = [];

  // 收集 heading 用于 toc / H1 分页
  const headings = blocks.filter((b): b is Extract<PdfBlock, { type: 'heading' }> => b.type === 'heading');

  const renderMath = async (tex: string, display: boolean): Promise<any> => {
    const data = env.renderMath ? await env.renderMath(tex, display) : null;
    if (data !== null) return { image: data, width: display ? 320 : 260 };
    return { text: tex, italics: true, color: colors.fg, style: 'code' };
  };

  // PDF 书签（Outline）：Typora 的 PDF 导出器固定写 `View.PageMode = pmUseOutlines`
  // （appsrc/main.js 的 TPDFPageMode），即导出的 PDF 自带标题书签面板。pdfmake 用
  // 节点上的 `outline` / `id` / `outlineParentId` 表达同一结构；按标题层级维护父链，
  // 跳级（h1 → h3）时回退到最近的更浅祖先。
  const outlineStack: { level: number; id: string }[] = [];
  let headingSeq = 0;

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const level = Math.min(block.level, 6);
        const el: any = { text: inlineToPdf(block.content), style: `h${level}` };
        if (options.pageBreakAtH1 && block.level === 1) el._h1 = true;
        while (outlineStack.length > 0 && outlineStack[outlineStack.length - 1].level >= level) {
          outlineStack.pop();
        }
        const id = `heading-${(headingSeq += 1)}`;
        el.outline = true;
        el.id = id;
        // pdfmake 的标题取 `outlineText || text`；heading 的 text 是 inline 数组，
        // 直接沿用会被 String(...) 成 `[object Object]` ⇒ 必须显式给纯文本。
        el.outlineText = block.content.map((token) => token.text).join('');
        const parent = outlineStack[outlineStack.length - 1];
        if (parent !== undefined) el.outlineParentId = parent.id;
        outlineStack.push({ level, id });
        content.push(el);
        break;
      }
      case 'paragraph':
        content.push({ text: inlineToPdf(block.content), style: 'body' });
        break;
      case 'list': {
        content.push({
          ul: block.items.map((item) => ({ text: inlineToPdf(item.content), style: 'body' })),
        });
        break;
      }
      case 'blockquote':
        content.push({ text: inlineToPdf(block.content), style: 'quote' });
        break;
      case 'code':
        content.push(
          options.codeLineNumbers === true
            ? buildNumberedCodeBlock(block.text, colors)
            : { text: block.text, style: 'code', background: colors.codeBg },
        );
        break;
      case 'table': {
        const cell = (text: string, col: number, bold = false): Record<string, unknown> => {
          const alignment = block.align?.[col];
          return alignment ? { text, bold, alignment } : { text, bold };
        };
        const body = [
          block.header.map((c, col) => cell(c, col, true)),
          ...block.rows.map((row) => row.map((c, col) => cell(c, col))),
        ];
        content.push({ table: { widths: Array(block.header.length).fill('*'), body } });
        break;
      }
      case 'hr':
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 0.5, lineColor: colors.border }] });
        break;
      case 'image': {
        const data = env.resolveImage ? await env.resolveImage(block.src) : null;
        if (data !== null) content.push({ image: data, width: 300 });
        else content.push({ text: `[${block.alt}](${block.src})`, style: 'code' });
        break;
      }
      case 'math':
        content.push(await renderMath(block.tex, block.display));
        break;
      case 'mermaid': {
        const data = env.renderMermaid ? await env.renderMermaid(block.code) : null;
        if (data !== null) content.push({ image: data, width: 360 });
        else content.push({ text: block.code, style: 'code' });
        break;
      }
      case 'alert':
        content.push({ text: inlineToPdf(block.content), style: `alert-${block.kind}` });
        break;
      case 'toc': {
        if (options.includeOutline) {
          content.push({
            text: 'Contents',
            style: 'toc',
            ol: headings.map((h) => ({ text: inlineToPdf(h.content) })),
          });
        }
        break;
      }
      case 'pagebreak':
        content.push({ text: '', pageBreak: 'after' });
        break;
      case 'footnote':
        content.push({ text: `[${block.id}] ${escapePdfText(block.content)}`, style: 'footnote' });
        break;
      case 'text':
        content.push({ text: inlineToPdf(block.content), style: 'body' });
        break;
      default:
        break;
    }
  }

  const pageSize: any = options.paperSize === 'Custom'
    ? { width: options.customWidth ?? 595, height: options.customHeight ?? 842 }
    : options.paperSize === 'Letter' ? 'LETTER' : options.paperSize;

  const doc: PdfDocDefinition = {
    content,
    pageSize,
    pageMargins: [options.margin, options.margin, options.margin, options.margin],
    defaultStyle: { font: 'NotoSansSC', fontSize: PDF_TYPOGRAPHY.body, lineHeight: PDF_TYPOGRAPHY.lineHeight, color: colors.fg },
    styles: {
      h1: { fontSize: PDF_TYPOGRAPHY.headings[1], bold: true, margin: [0, 10, 0, 8] },
      h2: { fontSize: PDF_TYPOGRAPHY.headings[2], bold: true, margin: [0, 8, 0, 6] },
      h3: { fontSize: PDF_TYPOGRAPHY.headings[3], bold: true, margin: [0, 6, 0, 4] },
      h4: { fontSize: PDF_TYPOGRAPHY.headings[4], bold: true, margin: [0, 6, 0, 4] },
      h5: { fontSize: PDF_TYPOGRAPHY.headings[5], bold: true },
      h6: { fontSize: PDF_TYPOGRAPHY.headings[6], bold: true, color: colors.fg },
      body: { fontSize: PDF_TYPOGRAPHY.body },
      code: { fontSize: PDF_TYPOGRAPHY.code, color: colors.fg, background: colors.codeBg },
      // 代码块行号：与代码同字号、同色（pdfmake 无 muted token）；右对齐由单元格 alignment 控制
      codeNum: { fontSize: PDF_TYPOGRAPHY.code, color: colors.fg },
      quote: { fontSize: PDF_TYPOGRAPHY.body, italics: true, color: colors.fg, background: colors.codeBg, margin: [8, 4, 0, 4] },
      footnote: { fontSize: PDF_TYPOGRAPHY.footnote, color: colors.fg },
      toc: { fontSize: PDF_TYPOGRAPHY.body + 1, bold: true },
    },
  };

  if (options.printBackground) {
    doc.background = (_current: number, pageSize: { width: number; height: number }) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: colors.bg }],
    });
  }

  if (options.header && options.title !== undefined) {
    doc.header = (_current: number) => ({ text: escapePdfText(options.title ?? ''), alignment: 'right', margin: [options.margin, 10], fontSize: 9, color: colors.fg });
  }

  if (options.footer || options.pageNumbers) {
    doc.footer = (current: number, pageCount: number) => ({
      text: options.pageNumbers ? `${current} / ${pageCount}` : '',
      alignment: 'center',
      margin: [0, 8],
      fontSize: 9,
      color: colors.fg,
    });
  }

  if (options.pageBreakAtH1) {
    doc.pageBreakBefore = (el: any) => el._h1 === true && el.style !== 'toc';
  }

  return doc;
}

export * from './html';
export { PDF_THEME_COLORS, PDF_TYPOGRAPHY, headingFontSize } from './typography';
export type { PdfThemeColors, PdfThemeName, PdfTypography } from './typography';
export * from './printStyle';
export * from './print';
export * from './image';

/** 生成 PDF 字节（嵌入子集字体）。pdfmake 0.3.11 的字体需注册到 vfs 后以字符串键引用。 */
export function createPdfBuffer(markdown: string, options: PdfOptions, env: PdfEnv): Promise<Uint8Array> {
  return buildPdfDocument(markdown, options, env).then((doc) => {
    // pdfmake 0.3.11 不支持 Uint8Array 字体值（会当 URL 解析崩溃），
    // 先注册到 virtualfs，再用字符串键引用（provideFont 会 readFileSync 读取）。
    const normalKey = 'MellowNotoSansSC-Regular.ttf';
    const boldKey = 'MellowNotoSansSC-Bold.ttf';
    if (pdfMake.virtualfs !== undefined) {
      pdfMake.virtualfs.writeFileSync(normalKey, Buffer.from(env.fonts.normal));
      pdfMake.virtualfs.writeFileSync(boldKey, Buffer.from(env.fonts.bold));
    }
    // CJK 字体无真斜体档位（Typora 同样映射到同文件），缺失会导致
    // 含 *斜体* 的中文文档导出 PDF 时抛 "Font ... in style 'italics' is not defined"。
    pdfMake.fonts = {
      NotoSansSC: { normal: normalKey, bold: boldKey, italics: normalKey, bolditalics: boldKey },
    };
    return pdfMake.createPdf(doc).getBuffer().then((buffer: Buffer) => new Uint8Array(buffer));
  });
}
