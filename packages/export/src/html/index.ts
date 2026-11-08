/**
 * HTML Export 主函数（PRD §73）。
 *
 * 三种模式：
 * - with-theme：完整样式单文件（主题 CSS + KaTeX CSS/字体 + Mermaid bundle 内联，
 *   本地图片默认内联）；
 * - without-style：纯语义 HTML（无 <style>/<script>/style 属性；
 *   math → 原生 MathML；mermaid → 源码块；TOC 与锚点保留）；
 * - self-contained：严格单文件（所有本地图片强制 base64 内联，无外部资源请求）。
 *
 * 安全输出：render 产物整体过白名单 sanitize（见 sanitize.ts）。
 */

import * as fs from 'fs';
import * as path from 'path';

import { katexCssWithEmbeddedFonts, mermaidInitScript, readMermaidBundle } from './assets';
import { collectHeadings, createMarkdownIt, escapeHtml, hasTocMarker, renderTocHtml } from './markdown';
import { sanitizeOutput } from './sanitize';
import { themeCss } from './styles';
import { DEFAULT_HTML_OPTIONS, type HtmlExportEnv, type HtmlExportMode, type HtmlExportOptions } from './types';
import type { HtmlRenderContext } from './markdown';

function normalizeOptions(options: HtmlExportOptions): Required<Pick<HtmlExportOptions, 'lang' | 'theme' | 'tocMaxLevel' | 'includeOutline' | 'rawHtml' | 'math' | 'mermaid' | 'toc' | 'footnote' | 'embedImages' | 'preserveLineBreaks' | 'codeLineNumbers' | 'firstLineIndent'>> & HtmlExportOptions {
  const base = { ...DEFAULT_HTML_OPTIONS, ...options };
  return {
    ...base,
    lang: base.lang ?? 'zh-CN',
    theme: base.theme ?? 'light',
    tocMaxLevel: base.tocMaxLevel ?? 6,
    includeOutline: base.includeOutline ?? false,
    rawHtml: base.rawHtml ?? true,
    math: base.math ?? true,
    mermaid: base.mermaid ?? true,
    // ADR-0036 A1（批次 A36）：目录 / 脚注开关，默认 true（默认输出不变）
    toc: base.toc ?? true,
    footnote: base.footnote ?? true,
    // self-contained 强制内联图片；without-style 强制保持引用（进一步处理用）；with-theme 默认内联
    embedImages: base.mode === 'self-contained' ? true : base.mode === 'without-style' ? false : base.embedImages ?? true,
    // V7-W6（G7-FEAT-13）：Typora `preLinebreakOnExport` 默认 false
    preserveLineBreaks: base.preserveLineBreaks ?? false,
    // Typora `noLineWrapping` 默认 false ⇒ 导出件默认换行代码块长行
    wrapCode: base.wrapCode ?? true,
    // Typora `showLineNumbersForFence` 默认 false ⇒ 仅显式开启时代码块带行号
    codeLineNumbers: base.codeLineNumbers ?? false,
    // Typora `indentFirstLine` 默认 false ⇒ 仅显式开启时导出件带首行缩进类
    firstLineIndent: base.firstLineIndent ?? false,
    // Typora 导出件的正文字号跟随生效字号（`e.fontSize || 根元素 inline style`）：
    // 非法 / 缺省值一律不输出内联 style（默认输出不变）。
    fontSize: typeof base.fontSize === 'number' && Number.isFinite(base.fontSize) && base.fontSize > 0 ? base.fontSize : undefined,
  };
}

/** 收集 markdown 中图片语法 src（正则近似；多余匹配无害，渲染时以 imageMap 为准） */
function collectImageSrcs(markdown: string): string[] {
  const srcs: string[] = [];
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g;
  for (let m = re.exec(markdown); m !== null; m = re.exec(markdown)) {
    if (m[1] !== undefined) srcs.push(m[1]);
  }
  return srcs;
}

function isRemoteOrData(src: string): boolean {
  return /^(https?:|data:)/.test(src);
}

function buildDocument(args: {
  mode: HtmlExportMode;
  lang: string;
  title: string;
  body: string;
  css: string;
  scripts: string;
  /** 段落首行缩进类（Typora `#write.first-line-indent`；无样式导出不带该类） */
  firstLineIndent?: boolean;
  /** 正文字号 px（Typora 导出件 `#write` 的 inline font-size；无样式导出不输出） */
  fontSize?: number;
}): string {
  const { lang, title, body, css, scripts, firstLineIndent, fontSize } = args;
  const head: string[] = [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="Mellow HTML Export">',
    `<title>${escapeHtml(title)}</title>`,
  ];
  if (css !== '') head.push(`<style>\n${css}\n</style>`);
  head.push('</head>');
  // Typora：`File.option.indentFirstLine && (u += " first-line-indent")` —— 类加在 `#write` 上；
  // Mellow 的正文根节点是 `.mellow-content`，故类同置。无样式模式（没有任何 CSS）不带，
  // 与 Typora 无样式导出的提前返回分支一致。
  const contentClass = firstLineIndent === true ? 'mellow-content first-line-indent' : 'mellow-content';
  // Typora 把字号写成 `#write` 的 inline style（`style='font-size:20px !important'`）；
  // Mellow 写入正文根节点即可（em 基准随之缩放，与 Typora 语义相同）。
  const contentAttrs = fontSize === undefined ? `class="${contentClass}"` : `class="${contentClass}" style="font-size: ${fontSize}px"`;
  const parts = [...head, `<body>\n<div ${contentAttrs}>\n${body}\n</div>`, scripts, '</body>', '</html>'];
  return `${parts.join('\n')}\n`;
}

export { DEFAULT_HTML_OPTIONS, type HtmlExportEnv, type HtmlExportMode, type HtmlExportOptions } from './types';
export { collectHeadings, renderTocHtml, slugifyHeading } from './markdown';

export async function exportHtml(markdown: string, options: HtmlExportOptions, env: HtmlExportEnv = {}): Promise<string> {
  const opts = normalizeOptions(options);
  const mode = opts.mode;
  const withStyles = mode !== 'without-style';

  const ctx: HtmlRenderContext = {
    mode,
    mathEnabled: opts.math,
    mermaidEnabled: opts.mermaid,
    tocEnabled: opts.toc,
    footnoteEnabled: opts.footnote,
    tocMaxLevel: opts.tocMaxLevel,
    imageMap: new Map<string, string>(),
    tocItems: [],
    preserveLineBreaks: opts.preserveLineBreaks,
    codeLineNumbers: opts.codeLineNumbers,
  };

  // 1. 预解析 tokens（headings 收集与最终渲染同源）
  const md = createMarkdownIt(ctx);
  const tokens = md.parse(markdown, {});

  // 2. headings + 标题
  ctx.tocItems = collectHeadings(tokens);
  const fallbackTitle = ctx.tocItems.find((item) => item.level === 1)?.title ?? 'Untitled';

  // 3. 图片 data URL 预解析
  if (opts.embedImages) {
    const srcs = collectImageSrcs(markdown);
    for (const src of srcs) {
      if (isRemoteOrData(src)) continue;
      if (ctx.imageMap.has(src)) continue;
      const data = env.resolveImage !== undefined ? await env.resolveImage(src) : null;
      if (data !== null && data !== '') ctx.imageMap.set(src, data);
    }
  }

  // 4. [TOC] token 填充 items
  for (const t of tokens) {
    if (t.type === 'mellow_toc') {
      t.meta = { items: ctx.tocItems, maxLevel: opts.tocMaxLevel };
    }
  }

  // 5. 同步渲染 → sanitize
  let body = md.renderer.render(tokens, md.options, {});
  body = opts.rawHtml ? sanitizeOutput(body) : body;
  // rawHtml=false 时 markdown-it html:true 仍会保留 raw HTML —— 关闭后改为整体转义
  // （在导出入口把 markdown 中的 raw HTML 区域替换为转义文本，见下方处理）

  if (!opts.rawHtml) {
    // 重新以 html:false 渲染（原始 HTML 全部转义为可见文本，最保守模式）
    const mdStrict = createMarkdownIt({ ...ctx, mode });
    mdStrict.options.html = false;
    const strictTokens = mdStrict.parse(markdown, {});
    for (const t of strictTokens) {
      if (t.type === 'mellow_toc') t.meta = { items: ctx.tocItems, maxLevel: opts.tocMaxLevel };
    }
    body = mdStrict.renderer.render(strictTokens, mdStrict.options, {});
  }

  // 6. includeOutline：无 [TOC] 标记时在开头插入目录（`toc` 开关关闭时同样不插入）
  if (opts.includeOutline && opts.toc && !hasTocMarker(markdown)) {
    const tocHtml = renderTocHtml(ctx.tocItems, opts.tocMaxLevel);
    if (tocHtml !== '') body = `${tocHtml}\n${body}`;
  }

  // 7. CSS / scripts
  let css = '';
  let scripts = '';
  if (withStyles) {
    css = themeCss(opts.theme, { wrapCode: opts.wrapCode, themeVariables: opts.themeVariables });
    if (opts.customCss !== undefined && opts.customCss !== '') css += `\n${opts.customCss}\n`;
    if (opts.math) {
      const katexCss = katexCssWithEmbeddedFonts(env.katexCss);
      if (katexCss !== null) css += `\n/* KaTeX */\n${katexCss}\n`;
    }
    if (opts.mermaid) {
      const bundle = readMermaidBundle(env.mermaidBundle);
      if (bundle !== null) {
        scripts += `\n<script>\n${bundle}\n</script>\n`;
        scripts += `<script>\n${mermaidInitScript(opts.theme)}\n</script>\n`;
      }
    }
  }

  const title = opts.title ?? fallbackTitle;
  // 无样式模式不输出样式表，首行缩进类与字号 inline style 也就都不存在
  // （与 Typora 的无样式分支一致）。
  return buildDocument({
    mode,
    lang: opts.lang,
    title,
    body,
    css,
    scripts,
    firstLineIndent: withStyles && opts.firstLineIndent,
    fontSize: withStyles ? opts.fontSize : undefined,
  });
}

/** 便捷：将本地文件读取为 data URL（供 env.resolveImage 使用；text 类返回 data:text/plain;base64） */
export async function fileToDataUrl(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      '.avif': 'image/avif',
    };
    const mime = mimeMap[ext] ?? 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
