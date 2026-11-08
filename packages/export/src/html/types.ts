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
  /**
   * 当前主题的 token（`@mellow/themes` 的 `MellowTheme.variables`）。
   *
   * 对齐 Typora 1.14.9：HTML 导出会内联**当前主题**的 `theme_css` /
   * `base_user_css` / `theme_user_css`，只有导出选项显式指定 `exportTheme` 时才改载
   * `<theme>.css`。Mellow 此前只按亮/暗选内置默认值 ⇒ Paper / Kraft / Inkwell 等主题
   * 对导出件不生效。宿主传入后，凡导出件 CSS 消费的变量都按
   * `packages/export/src/html/styles.ts` 的 EXPORT_THEME_SOURCES 映射覆盖默认值；
   * 缺省 / 空值保留内置默认（默认输出不变）。
   */
  themeVariables?: Record<string, string>;
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
  /**
   * 渲染 `[TOC]` 标记与 `includeOutline` 插入的目录（ADR-0036 A1 施工批次 A36）。
   * 默认 true；关闭后 `[TOC]` 行**保留为字面文本**（与预览端 `markdown.toc` 开关同义）。
   */
  toc?: boolean;
  /**
   * 渲染脚注（`[^1]` 语法，markdown-it-footnote；ADR-0036 A1 施工批次 A36）。
   * 默认 true；关闭后不注册插件，`[^1]` 按 CommonMark 原生降级
   * （无匹配定义 = 字面文本；`[^1]: …` 恰是合法的链接引用定义 = 降级为引用链接），
   * 与预览端 `markdown.footnote` 开关同义。
   */
  footnote?: boolean;
  /** 本地图片是否内联为 data URL。with-theme 默认 true；self-contained 强制 true；without-style 忽略 */
  embedImages?: boolean;
  /**
   * 导出时保留单换行符（V7-W6，G7-FEAT-13）。
   *
   * 对齐 Typora 的 `preLinebreakOnExport`（「导出时保留单换行符」，**默认 false**）。
   * 背景：Mellow 的 Enter 产出**单个 `\n`**（= Typora 的 New Line 语义，见方案 G7-EDIT-07），
   * 而 CommonMark 把段内单换行渲染为**空格** → 不开启时，编辑器里看到的换行会在导出件里**消失**
   * （所见非所得）。开启后段内 `\n` 渲染为硬换行。
   *
   * 为何默认关闭：与 Typora 一致；且对**硬折行**的源文件（按 80 列断行）会把每个折行都变成硬换行。
   */
  preserveLineBreaks?: boolean;
  /**
   * 代码块长行是否自动换行（默认 true）。
   *
   * 对齐 Typora：`File.option.noLineWrapping` 默认 **false**（= 换行开启），
   * 且导出件沿用同一状态 —— `base.css` 的 `#write pre { white-space: pre-wrap }`
   * 只在 `noLineWrapping` 为 true 时被 `#write.fences-no-line-wrapping pre` 撤销。
   * Mellow 的编辑器同一语义由 `editor.lineWrapping` 承载（默认 true），
   * 宿主导出时把该设置原样传入本选项，保证「编辑器里看到什么，导出件就是什么」。
   * 关闭后代码块按原样横向滚动（`overflow-x: auto`）。
   */
  wrapCode?: boolean;
  /**
   * 代码块是否显示行号（默认 false）。
   *
   * 对齐 Typora `File.option.showLineNumbersForFence`（一手证据：1.14.9 的
   * `appsrc/main.js` 中 `DEFAULT_OPTIONS.showLineNumbersForFence:!1`；开启时其导出
   * 围栏分支把**实时 CodeMirror DOM**（含 `.CodeMirror-gutters` / `.CodeMirror-linenumber`）
   * 克隆进导出件，而 `base.css` 对行号声明 `user-select:none` ⇒ 行号可见但不可选中/复制）。
   * Typora 的「HTML (Without Styles)」导出走 `<pre><code>` 分支，**不带行号** ——
   * 本选项在 `without-style` 模式下同样不生效。
   *
   * Mellow 的编辑器同一语义由 `markdown.codeLineNumbers` 承载（storageKey
   * `mellow.editor.codeLineNumbers`，默认 false），宿主导出时原样传入本选项。
   */
  codeLineNumbers?: boolean;
  /**
   * 段落首行缩进（默认 false）。
   *
   * 对齐 Typora 的 `File.option.indentFirstLine`（一手证据：1.14.9 的
   * `appsrc/main.js` 导出构建器中 `File.option.indentFirstLine && (u += " first-line-indent")`
   * —— 该类加在导出件的 `#write` 上；`base.css` 由 `#write.first-line-indent p
   * { text-indent: 2em }` 生效，并把 `li p` / `p *` / `svg *` 归零、`li` 左移 2em）。
   * Typora 的无样式导出走**另一条提前返回的分支**，不带该类 —— 本选项在
   * `without-style` 模式下同样不生效（该模式本就没有样式表）。
   *
   * Mellow 的编辑器同一语义由 `editor.firstLineIndent` 承载（默认 false，
   * 见 `packages/editor-core` 的 `firstLineIndentCompartment`），宿主导出时原样传入本选项。
   */
  firstLineIndent?: boolean;
  /**
   * 正文字号（px）。缺省 undefined = 用导出样式表自带的 16px（默认输出不变）。
   *
   * 对齐 Typora 的导出构建器（一手证据：1.14.9 的 `appsrc/main.js`）：
   * `var h=e.fontSize||document.body.parentElement.style.fontSize||""; h&&(…
   * style='font-size:…!important')` —— 导出件的 `#write` 继承生效字号；
   * 而 `useCustomFontSize` 开启时 `document.body.parentElement.style.fontSize`
   * 正是用户设置的编辑器字号。Mellow 的同一真源是 `editor.fontSize`
   * （编辑器经 `setFontSize`、Reader 经 `--mellow-content-font-size`，两者已同源；
   * 此选项把它接到**第三个消费方**：导出件）。无样式导出不输出内联 style。
   */
  fontSize?: number;
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
  toc: true,
  footnote: true,
  embedImages: true,
  preserveLineBreaks: false,
  wrapCode: true,
  codeLineNumbers: false,
  firstLineIndent: false,
};
