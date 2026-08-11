/**
 * Clipboard Copy（clipboard-smart-paste-spec §2）。
 *
 * Normal Copy writes multiple clipboard flavors when the platform supports them:
 * - text/plain: rendered plain text (good for plain editors)
 * - text/html: semantic HTML (good for Word/Gmail/Notes/LibreOffice)
 * - text/rtf: best-effort RTF (platform/WebView support varies)
 * - text/markdown + text/x-mellow-markdown: source Markdown flavor for Mellow/future integrations
 */

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  keymap: typeof import('@codemirror/view').keymap;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin, keymap: view.keymap };
}

export interface ClipboardDataLike {
  setData(type: string, value: string): void;
}

export interface CopyOptions {
  includeHtml: boolean;
  includeRtf: boolean;
  includeMarkdownFlavor: boolean;
  includeTheme: boolean;
}

export const COPY_COMMANDS = [
  { id: 'clipboard.copy', title: 'Copy', shortcut: 'Mod-C' },
  { id: 'clipboard.copyAsMarkdown', title: 'Copy as Markdown', shortcut: 'Mod-Shift-C' },
  { id: 'clipboard.copyAsPlain', title: 'Copy as Plain' },
  { id: 'clipboard.copyWithoutTheme', title: 'Copy without Theme' },
] as const;

const NORMAL_COPY: CopyOptions = {
  includeHtml: true,
  includeRtf: true,
  includeMarkdownFlavor: true,
  includeTheme: true,
};

const WITHOUT_THEME_COPY: CopyOptions = {
  includeHtml: true,
  includeRtf: true,
  includeMarkdownFlavor: true,
  includeTheme: false,
};

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeHref(value: string): boolean {
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function renderInlineMarkdown(markdown: string): string {
  const placeholders: string[] = [];
  const put = (html: string): string => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let text = normalizeText(markdown);
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => put(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_m, alt: string, src: string) => {
    if (!isSafeHref(src)) return escapeHtml(alt);
    return put(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`);
  });
  text = text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_m, label: string, href: string) => {
    const labelHtml = renderInlineMarkdown(label);
    if (!isSafeHref(href)) return labelHtml;
    return put(`<a href="${escapeHtml(href)}">${labelHtml}</a>`);
  });

  text = escapeHtml(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => placeholders[Number(index)] ?? '');
}

function renderParagraph(lines: string[]): string {
  return `<p>${renderInlineMarkdown(lines.join('\n')).replace(/\n/g, '<br>')}</p>`;
}

function tableToHtml(lines: string[]): string | null {
  if (lines.length < 2 || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1])) {
    return null;
  }
  const split = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.trim());
  };
  const header = split(lines[0]);
  const rows = lines.slice(2).map(split).filter((row) => row.length === header.length);
  if (header.length < 2) {
    return null;
  }
  const th = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead>${body !== '' ? `<tbody>${body}</tbody>` : ''}</table>`;
}

function collectTable(lines: string[], start: number): { html: string; next: number } | null {
  const block = lines.slice(start);
  const candidates: string[] = [];
  for (const line of block) {
    if (!line.includes('|') || line.trim() === '') break;
    candidates.push(line);
  }
  const html = tableToHtml(candidates);
  return html === null ? null : { html, next: start + candidates.length };
}

function collectList(lines: string[], start: number): { html: string; next: number } | null {
  const ordered = /^\s*\d+\.\s+/.test(lines[start]);
  const marker = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
  if (!marker.test(lines[start])) return null;
  const items: string[] = [];
  let i = start;
  while (i < lines.length && marker.test(lines[i])) {
    items.push(lines[i].replace(marker, ''));
    i += 1;
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.map((item) => `<li>${renderInlineMarkdown(item.trim())}</li>`).join('')}</${tag}>`, next: i };
}

/** Markdown source → semantic HTML fragment for cross-app rich copy. */
export function markdownToClipboardHtml(markdown: string, options: { includeTheme: boolean } = { includeTheme: false }): string {
  const lines = normalizeText(markdown).split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})([^`]*)$/);
    if (fence !== null) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{3,}`).test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const lang = fence[2].trim();
      const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
      out.push(`<pre><code${cls}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const table = collectTable(lines, i);
    if (table !== null) {
      out.push(table.html);
      i = table.next;
      continue;
    }

    const list = collectList(lines, i);
    if (list !== null) {
      out.push(list.html);
      i = list.next;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading !== null) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote !== null) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*(`{3,}|~{3,})/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) && collectTable(lines, i) === null) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(renderParagraph(paragraph));
  }

  const html = out.join('\n');
  if (!options.includeTheme) {
    return html;
  }
  return `<div data-mellow-clipboard="true" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">${html}</div>`;
}

function inlineMarkdownToPlain(markdown: string): string {
  return normalizeText(markdown)
    .replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
}

function markdownTableToTsv(lines: string[]): string | null {
  if (tableToHtml(lines) === null) return null;
  const split = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => inlineMarkdownToPlain(cell.trim()));
  return [split(lines[0]), ...lines.slice(2).map(split)].map((row) => row.join('\t')).join('\n');
}

/** Markdown source → rendered plain text for text/plain flavor. */
export function markdownToPlainText(markdown: string): string {
  const lines = normalizeText(markdown).split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence !== null) {
      i += 1;
      const code: string[] = [];
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{3,}`).test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(code.join('\n'));
      continue;
    }
    const table = collectTable(lines, i);
    if (table !== null) {
      const tableLines = lines.slice(i, table.next);
      out.push(markdownTableToTsv(tableLines) ?? tableLines.join('\n'));
      i = table.next;
      continue;
    }
    out.push(inlineMarkdownToPlain(line.replace(/^(#{1,6})\s+/, '').replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/^>\s?/, '')));
    i += 1;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function rtfEscapeCodeUnit(code: number): string {
  if (code === 0x5c) return '\\\\';
  if (code === 0x7b) return '\\{';
  if (code === 0x7d) return '\\}';
  if (code === 0x0a) return '\\par\n';
  if (code === 0x09) return '\\tab ';
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  const signed = code > 0x7fff ? code - 0x10000 : code;
  return `\\u${signed}?`;
}

/** Markdown source → best-effort Unicode-safe RTF. */
export function markdownToRtf(markdown: string): string {
  const plain = markdownToPlainText(markdown);
  let body = '';
  for (let i = 0; i < plain.length; i += 1) {
    body += rtfEscapeCodeUnit(plain.charCodeAt(i));
  }
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\f0\\fs24 ${body}}`;
}

function selectedMarkdown(view: EditorView): string | null {
  const selection = view.state.selection.main;
  if (selection.empty) {
    return null;
  }
  return view.state.sliceDoc(selection.from, selection.to);
}

export function copySelectionToClipboard(view: EditorView, clipboardData: ClipboardDataLike, options: CopyOptions = NORMAL_COPY): boolean {
  const markdown = selectedMarkdown(view);
  if (markdown === null) {
    return false;
  }
  clipboardData.setData('text/plain', markdownToPlainText(markdown));
  if (options.includeHtml) {
    clipboardData.setData('text/html', markdownToClipboardHtml(markdown, { includeTheme: options.includeTheme }));
  }
  if (options.includeRtf) {
    clipboardData.setData('text/rtf', markdownToRtf(markdown));
  }
  if (options.includeMarkdownFlavor) {
    clipboardData.setData('text/markdown', markdown);
    clipboardData.setData('text/x-mellow-markdown', markdown);
  }
  return true;
}

function writeViaNavigator(markdown: string, options: CopyOptions): void {
  const nav = navigator as Navigator & {
    clipboard?: Clipboard & { write?: (items: ClipboardItem[]) => Promise<void>; writeText?: (text: string) => Promise<void> };
  };
  const clipboard = nav.clipboard;
  if (clipboard === undefined) {
    return;
  }
  const plain = markdownToPlainText(markdown);
  if (options.includeHtml && typeof ClipboardItem !== 'undefined' && typeof clipboard.write === 'function') {
    const items: Record<string, Blob> = { 'text/plain': new Blob([plain], { type: 'text/plain' }) };
    items['text/html'] = new Blob([markdownToClipboardHtml(markdown, { includeTheme: options.includeTheme })], { type: 'text/html' });
    if (options.includeRtf) {
      items['text/rtf'] = new Blob([markdownToRtf(markdown)], { type: 'text/rtf' });
    }
    if (options.includeMarkdownFlavor) {
      items['text/markdown'] = new Blob([markdown], { type: 'text/markdown' });
    }
    void clipboard.write([new ClipboardItem(items)]).catch(() => clipboard.writeText?.(plain));
    return;
  }
  void clipboard.writeText?.(options.includeMarkdownFlavor && !options.includeHtml ? markdown : plain);
}

function copyCommandWithOptions(view: EditorView, options: CopyOptions, clipboardData?: ClipboardDataLike): boolean {
  const markdown = selectedMarkdown(view);
  if (markdown === null) return false;
  if (clipboardData !== undefined) {
    return copySelectionToClipboard(view, clipboardData, options);
  }
  writeViaNavigator(markdown, options);
  return true;
}

export function copy(view: EditorView, clipboardData?: ClipboardDataLike): boolean {
  return copyCommandWithOptions(view, NORMAL_COPY, clipboardData);
}

export function copyAsMarkdown(view: EditorView, clipboardData?: ClipboardDataLike): boolean {
  const markdown = selectedMarkdown(view);
  if (markdown === null) return false;
  if (clipboardData !== undefined) {
    clipboardData.setData('text/plain', markdown);
  } else {
    void navigator.clipboard?.writeText?.(markdown);
  }
  return true;
}

export function copyAsPlain(view: EditorView, clipboardData?: ClipboardDataLike): boolean {
  const markdown = selectedMarkdown(view);
  if (markdown === null) return false;
  const plain = markdownToPlainText(markdown);
  if (clipboardData !== undefined) {
    clipboardData.setData('text/plain', plain);
  } else {
    void navigator.clipboard?.writeText?.(plain);
  }
  return true;
}

export function copyWithoutTheme(view: EditorView, clipboardData?: ClipboardDataLike): boolean {
  return copyCommandWithOptions(view, WITHOUT_THEME_COPY, clipboardData);
}

/** Installs Typora-like multi-format Copy plus Copy as Markdown shortcut. */
export function buildClipboardCopyExtension(): Extension {
  const { ViewPlugin, keymap } = resolveCm();
  const plugin = ViewPlugin.fromClass(class ClipboardCopyPlugin {}, {
    eventHandlers: {
      copy: (event: ClipboardEvent, view: EditorView): boolean => {
        if (isComposing()) {
          return false;
        }
        if (event.clipboardData === null) {
          return false;
        }
        const handled = copy(view, event.clipboardData);
        if (handled) {
          event.preventDefault();
        }
        return handled;
      },
    },
  });
  const shortcuts = keymap.of([
    { key: 'Mod-Shift-c', run: copyAsMarkdown },
  ]);
  return [plugin, shortcuts];
}
