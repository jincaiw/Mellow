/**
 * Safe output：raw HTML 白名单过滤（与编辑器 safeHtml 白名单对齐，PRD §48）。
 *
 * - 白名单标签与编辑器一致（A/IMG/IFRAME/VIDEO 等），额外放行导出自身的产物：
 *   TOC（nav）、footnote（section/sup）、task list（input）、KaTeX（katex + MathML）。
 * - 属性白名单：class / id / data-* / aria-* 通配 + 各标签必要属性；style 与 on* 一律删除。
 * - URL 协议校验：a → http/https/mailto；img/video/audio/source 额外允许 data:；
 *   iframe 强制 sandbox=""。
 * - a[target=_blank] 强制补充 rel="noopener noreferrer"。
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  // 编辑器 safeHtml 白名单（**必须逐字包含** `packages/editor-engine/src/safeHtml.ts` 的
  // `ALLOWED_TAGS`；本组与编辑器/Reader 的集合关系由 `tests/parity/verify-parity-ledger.mjs`
  // 双向锁定。2026-10-06 实测此处曾漏掉 `kbd` —— 表现是 `<kbd>` 在编辑器/Reader 渲染成按键、
  // 导出时被 `discard` 剥成纯文本，屏幕上看不出原因）
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'ol', 'p', 'pre', 's',
  'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead',
  'tr', 'ul', 'video', 'audio', 'source', 'iframe',
  // 导出产物
  'nav', 'section', 'input',
  // KaTeX htmlAndMathml 输出（katex 对用户输入严格转义，放行安全）
  'katex', 'math', 'annotation', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'mfrac',
  'msup', 'msub', 'msqrt', 'mroot', 'mstyle', 'mspace', 'mtext', 'menclose',
  'mover', 'munder', 'munderover', 'msubsup', 'mtable', 'mtr', 'mtd', 'mphantom',
  'mpadded', 'merror', 'maction',
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['class', 'id', 'title', 'data-*', 'aria-*'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  video: ['src', 'poster', 'controls', 'width', 'height'],
  audio: ['src', 'controls'],
  source: ['src', 'type'],
  iframe: ['src', 'width', 'height', 'allowfullscreen', 'sandbox'],
  input: ['type', 'checked', 'disabled'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  code: ['class'],
  // KaTeX MathML
  math: ['xmlns', 'display'],
  annotation: ['encoding'],
  mfrac: ['linethickness'],
  mspace: ['width', 'height'],
  mrow: ['displaystyle'],
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];
const ALLOWED_SCHEMES_BY_TAG: Record<string, string[]> = {
  img: ['http', 'https', 'data'],
  video: ['http', 'https', 'data'],
  audio: ['http', 'https', 'data'],
  source: ['http', 'https', 'data'],
  iframe: ['http', 'https'],
};

// 与 @types/sanitize-html 的 Transformer 形状一致（避免依赖其 namespace 类型）
interface SanitizeTag {
  tagName: string;
  attribs: Record<string, string>;
}
type SanitizeTransformer = (tagName: string, attribs: Record<string, string>) => SanitizeTag;

const TRANSFORM_TAGS: Record<string, SanitizeTransformer> = {
  a: (tagName, attribs) => {
    if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer';
    return { tagName, attribs };
  },
  iframe: (tagName, attribs) => {
    // 空值属性会被 sanitize-html 丢弃；"sandbox" token 无效被浏览器忽略，等价于全禁用
    attribs.sandbox = 'sandbox';
    return { tagName, attribs };
  },
};

export function createSanitizeOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: ALLOWED_SCHEMES_BY_TAG,
    allowProtocolRelative: false,
    transformTags: TRANSFORM_TAGS,
    disallowedTagsMode: 'discard',
  };
}

let cachedOptions: sanitizeHtml.IOptions | null = null;

export function getSanitizeOptions(): sanitizeHtml.IOptions {
  if (cachedOptions === null) cachedOptions = createSanitizeOptions();
  return cachedOptions;
}

export function sanitizeOutput(html: string): string {
  return sanitizeHtml(html, getSanitizeOptions());
}
