/**
 * Reader Mode 渲染器（PRD 4.3 markdown-preview / T-0409 Reader）。
 *
 * 纯函数、零第三方依赖的 Markdown → 语义 HTML 渲染：
 * - 无 caret：输出只读 HTML，无 contentEditable；
 * - 无 markers：标题/粗体/斜体/删除线/行内代码等输出语义标签，不含语法字符；
 * - 支持：heading(带锚点 id)、段落、列表/任务、引用、代码块(语言+复制按钮)、表格、hr、
 *   图片、链接、math(块/行内容器)、mermaid(fence 容器)、GitHub Alert、[toc]、
 *   sanitized 原始 HTML；
 * - 返回与 render 对齐的 outline（OutlineHeading，slug id），供侧栏跳转。
 *
 * 平台约束：本模块零 OS / Tauri / DOM 依赖（可在 node 测试）。
 */

import type { OutlineHeading } from './outline';

export interface ReaderRenderOptions {
  /** 宿主注入：把 markdown 图片 src 转换为可显示 URL（默认原样） */
  resolveImageSrc?: (src: string) => string;
}

export interface ReaderRenderResult {
  html: string;
  outline: OutlineHeading[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^(?:https?:|mailto:|tel:|#|\/|\.\.?\/)/i.test(trimmed)) return true;
  if (/^[a-z0-9][a-z0-9+.-]*:/i.test(trimmed)) return false; // 其他协议拒绝
  return true; // 相对路径
}

export function slugifyHeading(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return slug === '' ? 'section' : slug;
}

/** 极简 sanitize：仅保留常用标签，剥离脚本/事件/危险协议。 */
function sanitizeHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<style[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s?javascript:[^\s"'<>]+/gi, '')
    .replace(/\s?vbscript:[^\s"'<>]+/gi, '');
}

// ── 行内渲染 ────────────────────────────────────────────────

export function renderInline(text: string): string {
  let out = escapeHtml(text);
  // 图片
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) => {
    const url = isSafeUrl(src) ? escapeHtml(src) : '';
    const altText = escapeHtml(alt);
    return url === '' ? altText : `<img src="${url}" alt="${altText}" loading="lazy">`;
  });
  // 链接
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, href: string) => {
    const url = isSafeUrl(href) ? escapeHtml(href) : '';
    if (url === '') return label;
    return `<a href="${url}">${label}</a>`;
  });
  // autolink
  out = out.replace(/&lt;([a-z][a-z0-9+.-]*:\/\/[^&;\s]+)&gt;/gi, '<a href="$1">$1</a>');
  // 行内 math（先于 code/bold，避免 $ 干扰；tex 已在转义文本中，直接使用避免双重转义）
  out = out.replace(/(^|[^\\])\$([^$\n]+)\$/g, (_m, pre: string, tex: string) => {
    const t = tex.trim();
    return `${pre}<span class="mellow-reader-math" data-tex="${t}">${t}</span>`;
  });
  // 行内代码（先于 bold/italic）
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // 粗体 / 斜体 / 删除线
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return out;
}

// ── 块级解析 ────────────────────────────────────────────────

interface BlockLine {
  text: string;
  start: number;
}

function splitLines(markdown: string): BlockLine[] {
  const lines = markdown.split('\n');
  let offset = 0;
  return lines.map((text) => {
    const line: BlockLine = { text, start: offset };
    offset += text.length + 1;
    return line;
  });
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})([^\s`]*)?/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}\s*$/;
const MATH_BLOCK_OPEN_RE = /^\$\$\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

interface ParsedHeading extends OutlineHeading {}

function preScanHeadings(lines: BlockLine[], markdown: string): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  let fence: string | null = null;
  const used = new Set<string>();
  for (const line of lines) {
    const fenceMatch = line.text.match(FENCE_RE);
    if (fenceMatch !== null) {
      fence = fence === null ? fenceMatch[1][0] : null;
      continue;
    }
    if (fence !== null) continue;
    const match = line.text.match(HEADING_RE);
    if (match === null) continue;
    const raw = match[2].replace(/[*_~`]/g, '').trim();
    let slug = slugifyHeading(raw);
    let n = 2;
    while (used.has(slug)) slug = `${slugifyHeading(raw)}-${n++}`;
    used.add(slug);
    headings.push({
      id: slug,
      level: match[1].length,
      title: raw,
      from: line.start,
      to: line.start + line.text.length,
      children: [],
    });
  }
  // 组装层级树
  const roots: ParsedHeading[] = [];
  const stack: ParsedHeading[] = [];
  for (const heading of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    if (stack.length === 0) roots.push(heading);
    else stack[stack.length - 1].children.push(heading);
    stack.push(heading);
  }
  void markdown;
  return roots;
}

function renderToc(headings: ParsedHeading[], offset?: number): string {
  const walk = (items: ParsedHeading[]): string => {
    if (items.length === 0) return '';
    return `<ul>${items.map((item) => `<li><a href="#${item.id}">${escapeHtml(item.title)}</a>${walk(item.children)}</li>`).join('')}</ul>`;
  };
  const attr = offset === undefined ? '' : ` data-offset="${offset}"`;
  return `<div class="mellow-reader-toc"${attr}>${walk(headings)}</div>`;
}

function renderTable(rows: string[], resolveImageSrc: (src: string) => string, offset?: number): string {
  const cells = (row: string): string[] => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  if (rows.length < 2) return '';
  const header = cells(rows[0]);
  const body = rows.slice(2);
  const headHtml = `<thead><tr>${header.map((c) => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>`;
  const bodyHtml = body.length === 0
    ? ''
    : `<tbody>${body.map((row) => `<tr>${cells(row).map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  void resolveImageSrc;
  const attr = offset === undefined ? '' : ` data-offset="${offset}"`;
  return `<table${attr}>${headHtml}${bodyHtml}</table>`;
}

export function renderReaderHtml(markdown: string, options: ReaderRenderOptions = {}): ReaderRenderResult {
  const resolveImageSrc = options.resolveImageSrc ?? ((src: string) => src);
  const lines = splitLines(markdown);
  const allHeadings = preScanHeadings(lines, markdown);
  const outline: OutlineHeading[] = allHeadings;

  const html: string[] = [];
  let i = 0;

  const pushInlineParagraph = (text: string, offset: number): void => {
    if (text.trim() === '') return;
    html.push(`<p data-offset="${offset}">${renderInline(text)}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i].text;
    const trimmed = line.trim();

    // 代码块 / mermaid
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch !== null) {
      const blockOffset = lines[i].start;
      const fenceChar = fenceMatch[1][0];
      const lang = (fenceMatch[2] ?? '').trim().toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const close = lines[i].text.match(FENCE_RE);
        if (close !== null && close[1][0] === fenceChar) {
          i += 1;
          break;
        }
        codeLines.push(lines[i].text);
        i += 1;
      }
      const code = codeLines.join('\n');
      const escaped = escapeHtml(code);
      if (lang === 'mermaid') {
        html.push(`<div class="mellow-reader-mermaid" data-offset="${blockOffset}" data-source="${escapeHtml(code)}"><pre><code>${escaped}</code></pre></div>`);
      } else {
        const langClass = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
        html.push(`<div class="mellow-reader-code" data-offset="${blockOffset}"><div class="mellow-reader-code-head"><span class="mellow-reader-code-lang">${escapeHtml(lang)}</span><button type="button" class="mellow-reader-copy" title="复制">复制</button></div><pre><code${langClass}>${escaped}</code></pre></div>`);
      }
      continue;
    }

    // math 块
    if (MATH_BLOCK_OPEN_RE.test(line)) {
      const blockOffset = lines[i].start;
      const texLines: string[] = [];
      i += 1;
      while (i < lines.length && !MATH_BLOCK_OPEN_RE.test(lines[i].text)) {
        texLines.push(lines[i].text);
        i += 1;
      }
      if (i < lines.length) i += 1; // 吃掉闭合 $$
      const tex = texLines.join('\n').trim();
      html.push(`<div class="mellow-reader-math-block" data-offset="${blockOffset}" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</div>`);
      continue;
    }

    // 表格
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].text)) {
      const blockOffset = lines[i].start;
      const rows: string[] = [line, lines[i + 1].text];
      i += 2;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].text)) {
        rows.push(lines[i].text);
        i += 1;
      }
      html.push(renderTable(rows, resolveImageSrc, blockOffset));
      continue;
    }

    // 引用（含 GitHub Alert）
    if (QUOTE_RE.test(line)) {
      const blockOffset = lines[i].start;
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i].text)) {
        quoteLines.push(lines[i].text.replace(QUOTE_RE, '$1'));
        i += 1;
      }
      const first = quoteLines[0].trim();
      const alertMatch = first.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alertMatch !== null) {
        const kind = alertMatch[1].toUpperCase();
        const body = quoteLines.slice(1).map((t) => t.trim()).filter((t) => t !== '');
        const bodyHtml = body.length === 0
          ? `<p>${renderInline(alertMatch[2].trim())}</p>`
          : body.map((t) => `<p>${renderInline(t)}</p>`).join('');
        html.push(`<div class="mellow-reader-alert mellow-reader-alert-${escapeHtml(kind)}" data-offset="${blockOffset}"><div class="mellow-reader-alert-title">${escapeHtml(alertMatch[1].toUpperCase())}</div><div class="mellow-reader-alert-body">${bodyHtml}</div></div>`);
      } else {
        const body = quoteLines.map((t) => renderInline(t)).join('<br>');
        html.push(`<blockquote data-offset="${blockOffset}">${body}</blockquote>`);
      }
      continue;
    }

    // heading
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch !== null) {
      const level = headingMatch[1].length;
      const slug = slugifyHeading(headingMatch[2].replace(/[*_~`]/g, '').trim());
      html.push(`<h${level} id="${slug}" data-offset="${lines[i].start}">${renderInline(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // 列表
    const listMatch = line.match(LIST_RE);
    if (listMatch !== null && listMatch[2] !== '*') {
      const blockOffset = lines[i].start;
      const ordered = /^\d+\.$/.test(listMatch[2]);
      const tag = ordered ? 'ol' : 'ul';
      const items: string[] = [];
      let start = listMatch[1].length;
      while (i < lines.length) {
        const m = lines[i].text.match(LIST_RE);
        if (m === null || m[1].length !== start || (ordered ? !/^\d+\.$/.test(m[2]) : /^\d+\.$/.test(m[2]))) break;
        const task = m[3].match(TASK_RE);
        let content = renderInline(m[3]);
        if (task !== null) {
          const checked = task[1].toLowerCase() === 'x';
          content = `<input type="checkbox"${checked ? ' checked' : ''} disabled> ${renderInline(task[2])}`;
          items.push(`<li class="mellow-reader-task">${content}</li>`);
        } else {
          items.push(`<li>${content}</li>`);
        }
        i += 1;
      }
      html.push(`<${tag} data-offset="${blockOffset}">${items.join('')}</${tag}>`);
      continue;
    }

    // hr
    if (HR_RE.test(line)) {
      html.push(`<hr data-offset="${lines[i].start}">`);
      i += 1;
      continue;
    }

    // toc
    if (/^\[toc\]\s*$/i.test(trimmed)) {
      html.push(renderToc(allHeadings, lines[i].start));
      i += 1;
      continue;
    }

    // 原始 HTML 块（sanitized）
    if (trimmed.startsWith('<')) {
      const raw: string[] = [line];
      i += 1;
      while (i < lines.length && lines[i].text.trim() !== '' && (lines[i].text.trim().startsWith('<') || lines[i].text.trim().startsWith('</'))) {
        raw.push(lines[i].text);
        i += 1;
      }
      html.push(sanitizeHtml(raw.join('\n')));
      continue;
    }

    // 段落
    if (trimmed === '') {
      i += 1;
      continue;
    }
    const para: string[] = [line];
    const paraOffset = lines[i].start;
    i += 1;
    while (i < lines.length) {
      const t = lines[i].text;
      if (t.trim() === '' || FENCE_RE.test(t) || MATH_BLOCK_OPEN_RE.test(t) || HEADING_RE.test(t) || LIST_RE.test(t) || QUOTE_RE.test(t) || HR_RE.test(t) || /^\[toc\]\s*$/i.test(t.trim()) || TABLE_ROW_RE.test(t)) break;
      para.push(t);
      i += 1;
    }
    pushInlineParagraph(para.join(' '), paraOffset);
  }

  return { html: html.join('\n'), outline };
}
