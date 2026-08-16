/**
 * HTML Export 类型定义（PRD §73）。
 *
 * 三种模式：
 * - with-theme：完整样式单文件。主题 CSS / KaTeX CSS+字体 / Mermaid bundle 全部内联，
 *   本地图片默认内联（可关闭），离线可完整显示；
 * - without-style：纯语义 HTML。无 <style> / <script> / 内联 style 属性；
 *   math 输出原生 MathML（浏览器离线渲染，零依赖）；mermaid 输出源码块；
 *   TOC 与 heading 锚点仍然保留；
 * - self-contained：严格单文件。所有本地图片强制 base64 内联，
 *   除 http(s) 超链接外不允许任何外部资源请求。
 *
 * 安全输出（safe output）：
 * - raw HTML 白名单过滤（与编辑器 safeHtml 白名单对齐），
 * - href/src 协议校验（拒绝 javascript: 等），
 * - 所有文本节点转义。
 *
 * 平台约束：纯 JS（node 可测）；文件落盘由宿主（Rust fs.write_text）完成。
 */

export type HtmlExportMode = 'with-theme' | 'without-style' | 'self-contained';

export interface HtmlExportOptions {
  mode: HtmlExportMode;
  /** 文档标题；缺省取第一个 H1（strip 行内标记后） */
  title?: string;
  /** <html lang>，默认 zh-CN */
  lang?: string;
  /** with-theme / self-contained 的主题，默认 light */
  theme?: 'light' | 'dark';
  /** 追加到导出的自定义 CSS（仅 with-theme / self-contained） */
  customCss?: string;
  /** TOC 最大层级，默认 6 */
  tocMaxLevel?: number;
  /** 文档无 [TOC] 标记时，在开头插入目录（PRD §73 include outline） */
  includeOutline?: boolean;
  /** 允许 raw HTML（true 时经白名单 sanitize；false 时全部转义为文本） */
  rawHtml?: boolean;
  /** 渲染数学公式（$...$ / $$...$$ / \\(...\\) / \\[...\\]），默认 true */
  math?: boolean;
  /** 渲染 Mermaid 图表（```mermaid 围栏），默认 true */
  mermaid?: boolean;
  /** 本地图片是否内联为 data URL。with-theme 默认 true；self-contained 强制 true；without-style 忽略 */
  embedImages?: boolean;
}

export interface HtmlExportEnv {
  /** markdown 图片 src → data URL；返回 null 时保留原 src */
  resolveImage?: (src: string) => Promise<string | null>;
  /** 覆盖 mermaid bundle 源码（缺省从 mermaid 包读取 mermaid.min.js） */
  mermaidBundle?: string;
  /** 覆盖 KaTeX CSS（缺省从 katex 包读取并将字体内联为 data URL） */
  katexCss?: string;
}

export interface TocItem {
  level: number;
  title: string;
  slug: string;
}

export const DEFAULT_HTML_OPTIONS: HtmlExportOptions = {
  mode: 'with-theme',
  lang: 'zh-CN',
  theme: 'light',
  tocMaxLevel: 6,
  includeOutline: false,
  rawHtml: true,
  math: true,
  mermaid: true,
  embedImages: true,
};
