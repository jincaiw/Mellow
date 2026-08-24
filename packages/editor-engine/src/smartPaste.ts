/**
 * Smart Paste（clipboard-smart-paste-spec §3-§10）。
 *
 * Clipboard rich formats are converted only at the editor boundary. Markdown
 * remains the persisted source of truth and each successful conversion is one
 * CodeMirror transaction, so it is one Undo step.
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

function normaliseText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** Removes executable/active content before Markdown conversion. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const forbidden = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'BASE', 'FORM']);
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (forbidden.has(element.tagName)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'style' || (name === 'srcdoc')) {
        element.removeAttribute(attribute.name);
      } else if ((name === 'href' || name === 'src') && !isSafeUrl(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return doc.body.innerHTML;
}

function inlineChildren(element: Element): string {
  return Array.from(element.childNodes).map(renderHtmlNode).join('');
}

function tableMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.children)
      .filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
      .map((cell) => inlineChildren(cell).replace(/\n+/g, '<br>').replace(/\|/g, '\\|').trim()),
  ).filter((row) => row.length > 0);
  if (rows.length === 0) {
    return '';
  }
  const columns = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array(columns - row.length).fill('')]);
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(padded[0]), line(Array(columns).fill('---')), ...padded.slice(1).map(line)].join('\n') + '\n\n';
}

function listMarkdown(element: Element, ordered: boolean): string {
  return Array.from(element.children)
    .filter((child) => child.tagName === 'LI')
    .map((item, index) => {
      const content = Array.from(item.childNodes)
        .filter((child) => !(child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')))
        .map(renderHtmlNode)
        .join('').trim();
      return `${ordered ? `${index + 1}.` : '-'} ${content}`;
    })
    .join('\n') + '\n\n';
}

function renderHtmlNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normaliseText(node.textContent ?? '');
  }
  if (!(node instanceof Element)) {
    return '';
  }
  const content = inlineChildren(node);
  switch (node.tagName) {
    case 'H1': return `# ${content.trim()}\n\n`;
    case 'H2': return `## ${content.trim()}\n\n`;
    case 'H3': return `### ${content.trim()}\n\n`;
    case 'H4': return `#### ${content.trim()}\n\n`;
    case 'H5': return `##### ${content.trim()}\n\n`;
    case 'H6': return `###### ${content.trim()}\n\n`;
    case 'P': case 'DIV': return `${content.trim()}\n\n`;
    case 'BR': return '  \n';
    case 'STRONG': case 'B': return `**${content}**`;
    case 'EM': case 'I': return `*${content}*`;
    case 'DEL': case 'S': case 'STRIKE': return `~~${content}~~`;
    case 'CODE': return `\`${content.replace(/`/g, '\\`')}\``;
    case 'PRE': return `\`\`\`\n${node.textContent ?? ''}\n\`\`\`\n\n`;
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      return href !== '' && isSafeUrl(href) ? `[${content}](${href})` : content;
    }
    case 'IMG': {
      const src = node.getAttribute('src') ?? '';
      const alt = node.getAttribute('alt') ?? '';
      return src !== '' && isSafeUrl(src) ? `![${alt}](${src})` : '';
    }
    case 'BLOCKQUOTE': return content.trim().split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
    case 'UL': return listMarkdown(node, false);
    case 'OL': return listMarkdown(node, true);
    case 'TABLE': return tableMarkdown(node);
    case 'LI': return content;
    default: return content;
  }
}

/** Sanitizes HTML then converts the supported rich clipboard subset to Markdown. */
export function htmlToMarkdown(html: string): string {
  const sanitized = sanitizeHtml(html);
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  return Array.from(doc.body.childNodes).map(renderHtmlNode).join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** Returns a GFM table only for multi-row, rectangular TSV with at least two columns. */
export function tsvToGfmTable(text: string): string | null {
  const rows = normaliseText(text).split('\n').filter((line, index, all) => line !== '' || index < all.length - 1).map((line) => line.split('\t'));
  if (rows.length < 2 || rows[0].length < 2 || !rows.every((row) => row.length === rows[0].length)) {
    return null;
  }
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const line = (cells: string[]) => `| ${cells.map(escape).join(' | ')} |`;
  return [line(rows[0]), line(Array(rows[0].length).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

function isInsideCodeBlock(doc: string, position: number): boolean {
  const prefix = doc.slice(0, position);
  let fence: string | null = null;
  for (const line of prefix.split('\n')) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (match === null) {
      continue;
    }
    if (fence === null) {
      fence = match[1][0];
    } else if (match[1][0] === fence) {
      fence = null;
    }
  }
  if (fence !== null) {
    return true;
  }

  const lineStart = doc.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const nextLineBreak = doc.indexOf('\n', lineStart);
  const lineEnd = nextLineBreak === -1 ? doc.length : nextLineBreak;
  const currentLine = doc.slice(lineStart, lineEnd);
  return /^( {4}|\t)/.test(currentLine);
}

function linkedTargetRange(doc: string, from: number, to: number): { from: number; to: number } | null {
  const expression = /\[([^\]]+)\]\(([^\s)]+)\)/g;
  for (let match = expression.exec(doc); match !== null; match = expression.exec(doc)) {
    const labelFrom = match.index + 1;
    const labelTo = labelFrom + match[1].length;
    if (from >= labelFrom && to <= labelTo) {
      const targetFrom = labelTo + 2;
      return { from: targetFrom, to: targetFrom + match[2].length };
    }
  }
  return null;
}

/** Applies one source replacement as exactly one CodeMirror transaction. */
interface PasteRange {
  from: number;
  to: number;
}

export function pasteText(view: EditorView, text: string, range: PasteRange = view.state.selection.main): void {
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
    userEvent: 'input.paste',
  });
}

/** Command entry point for Paste Plain; rich clipboard formats are intentionally ignored. */
export function pastePlain(view: EditorView, plainText: string): boolean {
  if (plainText.length === 0) {
    return false;
  }
  pasteText(view, normaliseText(plainText));
  return true;
}

function handleSmartPaste(data: DataTransfer | null, view: EditorView): boolean {
  if (data === null || isInsideCodeBlock(view.state.doc.toString(), view.state.selection.main.head)) {
    return false;
  }
  const plain = normaliseText(data.getData('text/plain') ?? '');
  const tsv = tsvToGfmTable(plain);
  if (tsv !== null) {
    pasteText(view, tsv);
    return true;
  }
  const html = data.getData('text/html') ?? '';
  if (html.trim() !== '') {
    const markdown = htmlToMarkdown(html);
    if (markdown !== '') {
      pasteText(view, markdown);
      return true;
    }
  }
  const selection = view.state.selection.main;
  if (!selection.empty && isSafeUrl(plain)) {
    const doc = view.state.doc.toString();
    const target = linkedTargetRange(doc, selection.from, selection.to);
    if (target !== null) {
      pasteText(view, plain, target);
    } else {
      pasteText(view, `[${doc.slice(selection.from, selection.to)}](${plain})`, selection);
    }
    return true;
  }
  return false;
}

/** Installs rich clipboard conversion plus the Mod-Shift-V Paste Plain shortcut. */
export function buildSmartPasteExtension(): Extension {
  const { ViewPlugin, keymap } = resolveCm();
  const plugin = ViewPlugin.fromClass(class SmartPastePlugin {}, {
    eventHandlers: {
      paste: (event: ClipboardEvent, view: EditorView): boolean => {
        if (isComposing(view)) {
          return false;
        }
        const handled = handleSmartPaste(event.clipboardData, view);
        if (handled) {
          event.preventDefault();
        }
        return handled;
      },
    },
  });
  const plainKeymap = keymap.of([{
    key: 'Mod-Shift-v',
    run: (view: EditorView) => {
      void navigator.clipboard?.readText?.().then((text) => pastePlain(view, text)).catch(() => undefined);
      return true;
    },
  }]);
  return [plugin, plainKeymap];
}
