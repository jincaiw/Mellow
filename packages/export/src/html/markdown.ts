/// <reference path="../markdown-it.d.ts" />
/**
 * Markdown → HTML 渲染（markdown-it + 插件）。
 *
 * 覆盖：CommonMark、footnote、task list、math（$...$ / $$...$$ / \\(...\\) / \\[...\\]）、
 * Mermaid 围栏、[TOC] 标记、heading 锚点、图片内联映射。
 *
 * 渲染流程：先 md.parse 收集 headings 与图片 src（保证与最终输出 100% 一致），
 * 再 renderer.render(tokens) 同步渲染；KaTeX 同步渲染（renderToString），
 * 图片 data URL 由调用方预先解析好放入 imageMap。
 */

import MarkdownIt from 'markdown-it';
import katex from 'katex';
import footnotePlugin from 'markdown-it-footnote';
import taskListsPlugin from 'markdown-it-task-lists';

import type { StateBlock, StateInline, Token } from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it';
import type { HtmlExportMode, TocItem } from './types';

type RuleInline = (state: StateInline, silent: boolean) => boolean;
type RuleBlock = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean;
type MdToken = Token;

export interface HtmlRenderContext {
  mode: HtmlExportMode;
  mathEnabled: boolean;
  mermaidEnabled: boolean;
  tocMaxLevel: number;
  /** 原文图片 src → data URL（无映射则保留原 src） */
  imageMap: Map<string, string>;
  tocItems: TocItem[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

export function slugifyHeading(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      // 保留字母/数字/中日韩/Emoji，其余转连字符（与 editor-engine 一致）
      .replace(/[^\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'heading'
  );
}

/** 从 markdown-it tokens 收集 heading（slug 全局唯一，重复追加 -1/-2） */
export function collectHeadings(tokens: MdToken[]): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const level = Number(t.tag.slice(1));
    const inline = tokens[i + 1];
    const raw = inline !== undefined && inline.type === 'inline' ? inline.content : '';
    const title = stripInlineMarkdown(raw);
    const base = slugifyHeading(title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count}`;
    items.push({ level, title, slug });
  }
  return items;
}

function renderMathHtml(tex: string, display: boolean, ctx: HtmlRenderContext): string {
  if (!ctx.mathEnabled) {
    return escapeHtml(display ? `$$\n${tex}\n$$` : `$${tex}$`);
  }
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: ctx.mode === 'without-style' ? 'mathml' : 'htmlAndMathml',
    });
  } catch {
    // 兜底：渲染异常时输出转义源码，绝不抛错中断导出
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

/** TOC 嵌套 <ul> 渲染（缩进层级语义化，无样式模式下自然缩进） */
export function renderTocHtml(items: TocItem[], maxLevel: number): string {
  const filtered = items.filter((item) => item.level <= maxLevel);
  if (filtered.length === 0) return '';
  const renderTree = (nodes: Array<{ item: TocItem; children: Array<{ item: TocItem; children: unknown[] }> }>): string => {
    let html = '<ul>';
    for (const node of nodes) {
      html += `<li><a href="#${escapeHtml(node.item.slug)}">${escapeHtml(node.item.title)}</a>`;
      if (node.children.length > 0) html += renderTree(node.children as never);
      html += '</li>';
    }
    return `${html}</ul>`;
  };

  interface Node { item: TocItem; children: Node[] }
  const root: Node[] = [];
  const stack: Node[] = [];
  for (const item of filtered) {
    const node: Node = { item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else root.push(node);
    stack.push(node);
  }
  const html = renderTree(root as never);
  return `<nav class="mellow-toc" role="navigation" aria-label="Table of contents">${html}</nav>`;
}

export function createMarkdownIt(ctx: HtmlRenderContext): MarkdownItInstance {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  // footnote + task list
  md.use(footnotePlugin);
  md.use(taskListsPlugin, { enabled: true, label: true, labelAfter: false });

  // ── math ────────────────────────────────────────────────
  const mathInline: RuleInline = (state, silent) => {
    const pos = state.pos;
    const src = state.src;

    // \( ... \)
    if (src.startsWith('\\(', pos)) {
      const end = src.indexOf('\\)', pos + 2);
      if (end === -1) return false;
      if (silent) return true;
      const token = state.push('mellow_math_inline', '', 0);
      token.meta = { tex: src.slice(pos + 2, end) };
      state.pos = end + 2;
      return true;
    }

    // $...$（非 $$，两端不紧贴空格，内容非空）
    if (src[pos] !== '$' || src[pos + 1] === '$') return false;
    let end = pos + 1;
    while (end < src.length && src[end] !== '$' && src[end] !== '\n') end += 1;
    if (end >= src.length || src[end] !== '$' || end === pos + 1) return false;
    const tex = src.slice(pos + 1, end);
    if (tex[0] === ' ' || tex[tex.length - 1] === ' ') return false;
    if (silent) return true;
    const token = state.push('mellow_math_inline', '', 0);
    token.meta = { tex };
    state.pos = end + 1;
    return true;
  };

  const mathBlock: RuleBlock = (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const lineText = state.src.slice(startPos, maxPos);

    // \[ ... \]：同行闭合或跨行到 \]
    if (lineText.startsWith('\\[')) {
      const closeIdx = lineText.indexOf('\\]');
      let tex = '';
      let nextLine = startLine;
      if (closeIdx !== -1) {
        tex = lineText.slice(2, closeIdx);
      } else {
        const texLines: string[] = [lineText.slice(2)];
        nextLine = startLine + 1;
        let closed = false;
        for (; nextLine < endLine; nextLine += 1) {
          const p = state.bMarks[nextLine] + state.tShift[nextLine];
          const e = state.eMarks[nextLine];
          const l = state.src.slice(p, e);
          const c = l.indexOf('\\]');
          if (c !== -1) {
            texLines.push(l.slice(0, c));
            closed = true;
            break;
          }
          texLines.push(l);
        }
        if (!closed) return false;
        tex = texLines.join('\n');
      }
      if (silent) return true;
      const token = state.push('mellow_math_block', '', 0);
      token.meta = { tex: tex.trim() };
      token.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    }

    // $$ ... $$：$$ 独立行开头，收集到下一个独立 $$ 行
    if (!/^\$\$\s*$/.test(lineText)) return false;
    const texLines: string[] = [];
    let closeLine = -1;
    for (let l = startLine + 1; l < endLine; l += 1) {
      const p = state.bMarks[l] + state.tShift[l];
      const e = state.eMarks[l];
      if (/^\$\$\s*$/.test(state.src.slice(p, e))) {
        closeLine = l;
        break;
      }
      texLines.push(state.src.slice(p, e));
    }
    if (closeLine === -1) return false; // 未闭合：不处理，保留原文
    if (silent) return true;
    const token = state.push('mellow_math_block', '', 0);
    token.meta = { tex: texLines.join('\n').trim() };
    token.map = [startLine, closeLine + 1];
    state.line = closeLine + 1;
    return true;
  };

  md.inline.ruler.before('text', 'mellow_math_inline', mathInline);
  md.block.ruler.before('paragraph', 'mellow_math_block', mathBlock);

  // ── [TOC] 标记 ──────────────────────────────────────────
  const tocRule: RuleBlock = (state, startLine, _endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const line = state.src.slice(startPos, maxPos).trim();
    if (!/^\[TOC\]$/i.test(line)) return false;
    if (silent) return true;
    const token = state.push('mellow_toc', 'nav', 0);
    token.map = [startLine, startLine + 1];
    token.meta = { filled: false };
    state.line = startLine + 1;
    return true;
  };
  md.block.ruler.before('paragraph', 'mellow_toc', tocRule);

  // ── renderer 规则 ───────────────────────────────────────
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.mellow_math_inline = (tokens, idx) => {
    const meta = tokens[idx].meta as { tex: string } | null;
    return renderMathHtml(meta?.tex ?? '', false, ctx);
  };
  md.renderer.rules.mellow_math_block = (tokens, idx) => {
    const meta = tokens[idx].meta as { tex: string } | null;
    return renderMathHtml(meta?.tex ?? '', true, ctx);
  };

  md.renderer.rules.mellow_toc = (tokens, idx) => {
    const meta = tokens[idx].meta as { items?: TocItem[]; maxLevel?: number } | null;
    const items = meta?.items ?? ctx.tocItems;
    const maxLevel = meta?.maxLevel ?? ctx.tocMaxLevel;
    return renderTocHtml(items, maxLevel);
  };

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info === null || token.info === undefined ? '' : md.utils.unescapeAll(token.info).trim();
    const lang = info.split(/\s+/)[0] ?? '';
    if (lang.toLowerCase() === 'mermaid' && ctx.mermaidEnabled && ctx.mode !== 'without-style') {
      return `<pre class="mermaid">\n${escapeHtml(token.content)}\n</pre>\n`;
    }
    if (defaultFence !== undefined) return defaultFence(tokens, idx, options, env, self);
    return `<pre><code>${escapeHtml(token.content)}</code></pre>\n`;
  };

  // heading id：按文档顺序从 ctx.tocItems 取 slug（与 collectHeadings 一一对应）
  let headingIndex = 0;
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const item = ctx.tocItems[headingIndex];
    if (item !== undefined && item.level === Number(tokens[idx].tag.slice(1))) {
      tokens[idx].attrSet('id', item.slug);
      headingIndex += 1;
    }
    return self.renderToken(tokens, idx, options);
  };

  // 图片 src：查 imageMap 替换为 data URL
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    void options; void env; void self;
    const token = tokens[idx];
    const srcVal = token.attrGet('src');
    const src = srcVal === null || srcVal === undefined ? '' : String(srcVal);
    const alt = token.content ?? '';
    const titleVal = token.attrGet('title');
    const title = titleVal === null || titleVal === undefined ? undefined : String(titleVal);
    const resolved = ctx.imageMap.get(src) ?? src;
    let out = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}"`;
    if (title !== undefined && title !== '') out += ` title="${escapeHtml(title)}"`;
    out += '>';
    return out;
  };

  return md;
}

/** 是否有 [TOC] 标记（独立行） */
export function hasTocMarker(markdown: string): boolean {
  return /^\[TOC\]\s*$/im.test(markdown);
}
