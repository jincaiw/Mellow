/** Outline 纯逻辑（PRD §16）：H1-H6、层级、过滤、折叠、flat/tree、auto-number。 */

export interface OutlineHeading {
  id: string;
  level: number;
  title: string;
  from: number;
  to: number;
  number?: string;
  children: OutlineHeading[];
}

export interface BuildOutlineOptions {
  autoNumber?: boolean;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .trim();
}

export function parseHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split('\n');
  let offset = 0;
  let fence: string | null = null;
  let yaml = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const from = offset;
    const to = offset + line.length;
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      offset = to + 1;
      continue;
    }
    if (fence !== null) {
      offset = to + 1;
      continue;
    }
    if (i === 0 && /^---\s*$/.test(line)) {
      yaml = true;
      offset = to + 1;
      continue;
    }
    if (yaml) {
      if (/^---\s*$/.test(line)) yaml = false;
      offset = to + 1;
      continue;
    }
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match !== null) {
      const title = stripInlineMarkdown(match[2]);
      headings.push({ id: `h-${from}-${match[1].length}`, level: match[1].length, title, from, to, children: [] });
    }
    offset = to + 1;
  }
  return headings;
}

export function buildOutline(markdown: string, options: BuildOutlineOptions = {}): OutlineHeading[] {
  const roots: OutlineHeading[] = [];
  const stack: OutlineHeading[] = [];
  const counters = [0, 0, 0, 0, 0, 0];
  for (const heading of parseHeadings(markdown)) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    if (options.autoNumber) {
      counters[heading.level - 1] += 1;
      for (let i = heading.level; i < counters.length; i += 1) counters[i] = 0;
      heading.number = counters.slice(0, heading.level).filter((n) => n > 0).join('.');
    }
    if (stack.length === 0) roots.push(heading);
    else stack[stack.length - 1].children.push(heading);
    stack.push(heading);
  }
  return roots;
}

export function flattenOutline(headings: OutlineHeading[]): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  const walk = (items: OutlineHeading[]): void => {
    for (const item of items) {
      out.push(item);
      walk(item.children);
    }
  };
  walk(headings);
  return out;
}

export function filterOutline(headings: OutlineHeading[], query: string): OutlineHeading[] {
  const q = query.trim().toLowerCase();
  if (!q) return headings;
  const filter = (items: OutlineHeading[]): OutlineHeading[] => items.flatMap((item) => {
    const children = filter(item.children);
    if (item.title.toLowerCase().includes(q) || children.length > 0) return [{ ...item, children }];
    return [];
  });
  return filter(headings);
}

export function currentHeadingId(flat: OutlineHeading[], offset: number): string | null {
  let current: OutlineHeading | null = null;
  for (const item of flat) {
    if (item.from <= offset) current = item;
    else break;
  }
  return current?.id ?? null;
}

/** 锚点 → heading 文档 offset（Typora `文件.md#标题` 锚点跳转）：
 * 依次尝试精确文本 → 大小写不敏感 → slug 匹配（GitHub 风格 slug，`[^字母数字]` → `-`）；
 * 跳过 fenced code / YAML（复用 parseHeadings 语义）；未命中 → null。 */
export function headingOffsetForAnchor(markdown: string, anchor: string): number | null {
  const trimmed = anchor.trim();
  if (trimmed === '') return null;
  const slugify = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const anchorLower = trimmed.toLowerCase();
  const anchorSlug = slugify(trimmed);
  let ciOffset: number | null = null;
  let slugOffset: number | null = null;
  for (const h of parseHeadings(markdown)) {
    if (h.title === trimmed) return h.from;
    if (ciOffset === null && h.title.toLowerCase() === anchorLower) ciOffset = h.from;
    if (slugOffset === null && slugify(h.title) === anchorSlug) slugOffset = h.from;
  }
  return ciOffset ?? slugOffset;
}

export class OutlineModel {
  collapsed = new Set<string>();
  selectedId: string | null = null;
  collapse(id: string): void { this.collapsed.add(id); }
  expand(id: string): void { this.collapsed.delete(id); }
  toggle(id: string): void { if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id); }

  visibleItems(headings: OutlineHeading[], flat: boolean): OutlineHeading[] {
    if (flat) return flattenOutline(headings);
    const out: OutlineHeading[] = [];
    const walk = (items: OutlineHeading[]): void => {
      for (const item of items) {
        out.push(item);
        if (!this.collapsed.has(item.id)) walk(item.children);
      }
    };
    walk(headings);
    return out;
  }
}
