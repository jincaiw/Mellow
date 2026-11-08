/**
 * HTML Export 主题样式（PRD §73 HTML with theme / self-contained）。
 *
 * 色值对齐 @mellow/themes 的 Mellow Light / Mellow Dark token，
 * 排版对标 Typora 导出（GitHub 风格，中英文混排友好）。
 * 字体不嵌入（CJK 字体体积过大），使用跨平台系统字体栈。
 */

const LIGHT_VARS = `
  --mellow-bg: #ffffff;
  --mellow-fg: #24292f;
  --mellow-fg-subtle: #57606a;
  --mellow-border: #d0d7de;
  --mellow-border-strong: #afb8c1;
  --mellow-accent: #0969da;
  --mellow-code-bg: #f6f8fa;
  --mellow-code-border: #e1e4e8;
  --mellow-quote-bg: #f6f8fa;
  --mellow-toc-bg: #f6f8fa;
  --mellow-mark-bg: #fff8c5;
  --mellow-alert-note-bg: #f0f6ff;
  --mellow-alert-note-border: #b6d4fe;
  --mellow-alert-note-fg: #0a4da3;
  --mellow-alert-tip-bg: #e8f8ee;
  --mellow-alert-tip-border: #a8e6bc;
  --mellow-alert-tip-fg: #0c5d2f;
  --mellow-alert-important-bg: #f3e8fd;
  --mellow-alert-important-border: #d0a6f0;
  --mellow-alert-important-fg: #5c2d91;
  --mellow-alert-warning-bg: #fff7e0;
  --mellow-alert-warning-border: #f0cf86;
  --mellow-alert-warning-fg: #7a4d00;
  --mellow-alert-caution-bg: #ffecec;
  --mellow-alert-caution-border: #f3a6a6;
  --mellow-alert-caution-fg: #8a1a1a;
`;

const DARK_VARS = `
  --mellow-bg: #1e1e1e;
  --mellow-fg: #e6e6e6;
  --mellow-fg-subtle: #b0b0b0;
  --mellow-border: #3a3a3a;
  --mellow-border-strong: #4a4a4a;
  --mellow-accent: #6d94ff;
  --mellow-code-bg: #262a2e;
  --mellow-code-border: #3a4046;
  --mellow-quote-bg: #262626;
  --mellow-toc-bg: #262626;
  --mellow-mark-bg: #7a6a1a;
  --mellow-alert-note-bg: #16283d;
  --mellow-alert-note-border: #2a4a6e;
  --mellow-alert-note-fg: #7ab3e8;
  --mellow-alert-tip-bg: #14301f;
  --mellow-alert-tip-border: #2a5238;
  --mellow-alert-tip-fg: #6fc48a;
  --mellow-alert-important-bg: #2d1d3d;
  --mellow-alert-important-border: #4a3260;
  --mellow-alert-important-fg: #c08ae8;
  --mellow-alert-warning-bg: #332a12;
  --mellow-alert-warning-border: #5c4d22;
  --mellow-alert-warning-fg: #d4b96a;
  --mellow-alert-caution-bg: #361b1b;
  --mellow-alert-caution-border: #5c3030;
  --mellow-alert-caution-fg: #f0a0a0;
`;

/** GitHub Alerts 的 token 名（导出 CSS 与主题变量映射共用）。 */
const ALERT_TOKENS = [
  ['note', '--mellow-alert-note-bg', '--mellow-alert-note-border', '--mellow-alert-note-fg'],
  ['tip', '--mellow-alert-tip-bg', '--mellow-alert-tip-border', '--mellow-alert-tip-fg'],
  ['important', '--mellow-alert-important-bg', '--mellow-alert-important-border', '--mellow-alert-important-fg'],
  ['warning', '--mellow-alert-warning-bg', '--mellow-alert-warning-border', '--mellow-alert-warning-fg'],
  ['caution', '--mellow-alert-caution-bg', '--mellow-alert-caution-border', '--mellow-alert-caution-fg'],
] as const;

type ThemeTokenSource = [target: string, sources: string[]];

/**
 * 导出件 CSS 变量 ← Mellow 主题 token 的映射。
 *
 * 一手证据（Typora 1.14.9 `appsrc/main.js`）：HTML 导出会内联系当前主题的
 * `theme_css` / `base_user_css` / `theme_user_css`；只有导出选项显式指定
 * `exportTheme` 时才改载 `<theme>.css`。Mellow 此前只按亮/暗选择内置的
 * LIGHT_VARS / DARK_VARS，8 个主题里的 Paper / Kraft / Inkwell 等在选择后
 * 对导出件**不生效**。这里把主题 token 映射到导出件使用的变量名
 * （同一来源里第一个有值的 token 生效；都缺省则保留内置默认值）。
 */
const EXPORT_THEME_SOURCES: ThemeTokenSource[] = [
  ['--mellow-bg', ['--mellow-bg']],
  ['--mellow-fg', ['--mellow-fg']],
  ['--mellow-fg-subtle', ['--mellow-fg-subtle', '--mellow-fg-muted']],
  ['--mellow-border', ['--mellow-border']],
  ['--mellow-border-strong', ['--mellow-border-strong']],
  // 导出件的链接色消费 --mellow-accent，而主题的链接 token 是 --mellow-link
  ['--mellow-accent', ['--mellow-link', '--mellow-accent']],
  ['--mellow-code-bg', ['--mellow-code-bg']],
  ['--mellow-code-border', ['--mellow-code-border']],
  // Reader 的引用底色用 --mellow-code-bg；TOC 用次要底色
  ['--mellow-quote-bg', ['--mellow-quote-bg', '--mellow-code-bg']],
  ['--mellow-toc-bg', ['--mellow-toc-bg', '--mellow-bg-subtle']],
  ['--mellow-mark-bg', ['--mellow-mark-bg', '--mellow-mark']],
  ['--mellow-content-font', ['--mellow-content-font']],
  ...ALERT_TOKENS.flatMap(([, bg, border, fg]): ThemeTokenSource[] => [[bg, [bg]], [border, [border]], [fg, [fg]]]),
];

/** 把主题 token 渲染成 `:root` 内的覆盖声明；无可用值时返回空串（默认输出不变）。 */
function themeVariableOverrides(variables: Record<string, string>): string {
  const lines: string[] = [];
  for (const [target, sources] of EXPORT_THEME_SOURCES) {
    const value = sources.map((name) => variables[name]).find((v) => typeof v === 'string' && v.trim() !== '');
    if (value === undefined) continue;
    // 值来自（可能是用户提供的）主题 CSS：剥掉能提前闭合声明 / 规则的字符。
    lines.push(`  ${target}: ${value.replace(/[;}]/g, '')};`);
  }
  return lines.length === 0 ? '' : `\n${lines.join('\n')}\n`;
}

const BODY_CSS = `
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  padding: 0;
  background: var(--mellow-bg);
  color: var(--mellow-fg);
  /* 主题级内容字体（如 Paper / Inkwell 的衬线栈）：与 Reader 的
     .mellow-reader 同源；未传主题变量时回落到 Mellow 既有 UI 字体栈。 */
  font-family: var(--mellow-content-font, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
    "Source Han Sans SC", sans-serif);
  font-size: 16px;
  line-height: 1.75;
  word-break: break-word;
}
.mellow-content {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 40px 96px;
}
@media (max-width: 720px) {
  .mellow-content { padding: 20px 18px 64px; }
}
h1, h2, h3, h4, h5, h6 {
  margin: 1.4em 0 0.6em;
  font-weight: 600;
  line-height: 1.35;
}
h1 { font-size: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid var(--mellow-border); }
h2 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid var(--mellow-border); }
h3 { font-size: 1.25em; }
h4 { font-size: 1.05em; }
h5 { font-size: 0.95em; }
h6 { font-size: 0.9em; color: var(--mellow-fg-subtle); }
p { margin: 0.7em 0; }
/* 首行缩进（Typora indentFirstLine，默认 false）：导出构建器把 first-line-indent
   类加在 #write 上，base.css 的四条规则是
     #write.first-line-indent p { text-indent: 2em }
     #write.first-line-indent li p,
     #write.first-line-indent p *,
     #write.first-line-indent svg * { text-indent: 0 }
     #write.first-line-indent li { margin-left: 2em }
     #write.first-line-indent p>.md-image:only-child:not(.md-img-error) img { left:-2em; position:relative }
   前三条照搬（选择器换成 Mellow 的正文根节点）；第四条是 Typora 自身 DOM 的补偿：
   它的独占图片外面包着 inline-block 的 .md-image（受 text-indent 影响），Mellow 导出
   直接是 p > img:only-child 且 display:block（块级子元素不受 text-indent 影响），
   故无需左移。未开启时类不存在，这些选择器不匹配任何元素。 */
.mellow-content.first-line-indent p { text-indent: 2em; }
.mellow-content.first-line-indent li p,
.mellow-content.first-line-indent p *,
.mellow-content.first-line-indent svg * { text-indent: 0; }
.mellow-content.first-line-indent li { margin-left: 2em; }
a { color: var(--mellow-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
strong { font-weight: 600; }
mark { background: var(--mellow-mark-bg); }
hr {
  height: 1px;
  margin: 1.6em 0;
  background: var(--mellow-border);
  border: 0;
}
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--mellow-code-bg);
  border: 1px solid var(--mellow-code-border);
  border-radius: 4px;
  padding: 0.15em 0.35em;
}
pre {
  margin: 0.9em 0;
  padding: 14px 16px;
  background: var(--mellow-code-bg);
  border: 1px solid var(--mellow-code-border);
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.55;
}
pre code {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 0.88em;
}
/* 代码块行号（Typora showLineNumbersForFence，默认 false）：
   行号是真实 DOM 文本（见 markdown.ts 的 renderNumberedFence），这里只负责排在
   左侧 gutter 并排除选中/复制 —— 与 Typora 导出件对 .CodeMirror-linenumber
   声明的 user-select:none 同义。未开启行号时这些选择器不匹配任何元素。 */
pre.mellow-code-lineno code { display: block; }
pre.mellow-code-lineno .mellow-code-line { display: block; }
pre.mellow-code-lineno .mellow-code-num {
  display: inline-block;
  min-width: 2.2em;
  padding-right: 0.8em;
  text-align: right;
  color: var(--mellow-fg-subtle);
  -webkit-user-select: none;
  user-select: none;
}
blockquote {
  margin: 0.9em 0;
  padding: 0.2em 1em;
  border-left: 4px solid var(--mellow-border-strong);
  background: var(--mellow-quote-bg);
  color: var(--mellow-fg-subtle);
}
blockquote p { margin: 0.5em 0; }
table {
  border-collapse: collapse;
  margin: 1em 0;
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  /* 默认左对齐（Typora base.css 的 table 规则同样声明 text-align:left）；浏览器默认会把 th
     居中，Mellow 的列对齐 class 只覆盖 markdown 分隔行显式声明的那一列。 */
  text-align: left;
}
th, td {
  border: 1px solid var(--mellow-border);
  padding: 6px 12px;
}
th { background: var(--mellow-code-bg); font-weight: 600; }
/* 列对齐：sanitize 把 markdown-it 的 style="text-align:…" 转成这三个 class（见 sanitize.ts） */
th.mellow-align-left, td.mellow-align-left { text-align: left; }
th.mellow-align-center, td.mellow-align-center { text-align: center; }
th.mellow-align-right, td.mellow-align-right { text-align: right; }
tr:nth-child(2n) td { background: var(--mellow-quote-bg); }
ul, ol { padding-left: 1.8em; margin: 0.6em 0; }
li { margin: 0.25em 0; }
li.task-list-item { list-style: none; margin-left: -1.4em; }
/* 复选框不可交互（Typora base.css 同源规则：.typora-export .task-list-item input
   设 pointer-events:none）。配合 markdown.ts 的 label:false —— 导出 DOM 与 Typora
   同为「input + 文本」，没有 label 转发点击。 */
li.task-list-item input { margin-right: 0.4em; pointer-events: none; }
ul.contains-task-list { padding-left: 1.2em; }
/* 图片：对齐 Typora 导出基线 CSS（TypeMark/style/base.css 的 body.typora-export 同源规则）
   - p > img:only-child 独占段落的图片块级居中；
   - img:not([height]) 才 height:auto —— 显式 height 属性（raw HTML / 尺寸语法）不得被覆盖；
   - vertical-align / image-orientation 与 Typora 一致（行内图与 EXIF 方向）。 */
img { max-width: 100%; vertical-align: middle; image-orientation: from-image; }
img:not([height]) { height: auto; }
p > img:only-child { display: block; margin: auto; }
/* raw HTML 媒体/嵌入：同 base.css 的 video / iframe 规则（白名单放行却无样式时会溢出正文栏） */
video { max-width: 100%; display: block; margin: 0 auto; }
iframe { max-width: 100%; width: 100%; border: none; }
/* 行内 <kbd> 键帽：与编辑器 mellow-kbd 同观感（Typora base.css 同样为 kbd 提供键帽规则，
   而导出白名单放行 kbd 却从未给样式 ⇒ 导出后键帽退化为普通文字）。 */
kbd {
  font-size: 0.85em;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--mellow-border);
  border-bottom-width: 2px;
  background: var(--mellow-code-bg);
  font-family: inherit;
}
details { margin: 0.9em 0; }
summary { cursor: pointer; font-weight: 600; }
sub, sup { line-height: 0; }

/* TOC（PRD §73 include outline / [TOC] 标记） */
.mellow-toc {
  margin: 1.2em 0;
  padding: 0.8em 1.2em;
  background: var(--mellow-toc-bg);
  border: 1px solid var(--mellow-border);
  border-radius: 6px;
  font-size: 0.95em;
}
.mellow-toc > ul { margin: 0; padding-left: 1.2em; }
.mellow-toc ul { margin: 0.2em 0; }

/* Mermaid（渲染前显示源码，渲染后 mermaid 注入 SVG） */
pre.mermaid {
  background: transparent;
  border: 0;
  text-align: center;
  padding: 0.5em 0;
  overflow-x: auto;
}
pre.mermaid svg { max-width: 100%; height: auto; }

/* KaTeX */
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.2em 0; }
.katex { font-size: 1.05em; }

/* MathML fallback（without-style 模式浏览器原生渲染，无样式依赖） */
math { font-family: "Cambria Math", "STIX Two Math", serif; }

/* 脚注区：Typora base.css 的 .footnotes（opacity .8 / font-size .9rem / 上下 1em）。
   分隔线由 markdown-it 输出的 <hr class="footnotes-sep"> 提供 —— Typora 导出件同样
   只有一条 <hr/>（main.js 的 footnotes-area 拼接）；此前这里另加了 border-top，
   导出件于是出现两条分隔线。 */
section.footnotes {
  margin: 1em 0;
  padding-top: 0;
  opacity: 0.8;
  font-size: 0.9em;
}
section.footnotes ol { padding-left: 1.6em; }
/* 脚注引用胶囊：Typora base.css 的 sup.md-footnote（padding 2px 4px / 4px 圆角 /
   浅灰底 / #555 文字）。Typora 在暗色主题下同样使用这组固定值，故不改成主题变量，
   保证编辑器（packages/editor-engine/src/footnote.ts 的同值）与导出件一致。 */
sup.footnote-ref {
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(238, 238, 238, 0.7);
  color: #555;
}
sup.footnote-ref a { color: inherit; text-decoration: none; }

/* GitHub Alerts（> [!NOTE] 引用块） */
blockquote p:first-child {
  font-weight: 500;
}

/*
 * 打印分页（Typora 的导出件内嵌 base.css，其 @media print 段对「用户直接打印导出的
 * HTML」同样生效；Mellow 此前只有屏幕样式 ⇒ 浏览器打印时标题可能与正文分离、
 * 表格行被页边界劈开、后续页没有表头、公式/图形被切断）：
 *   · base.css 的 h1..h6 规则：page-break-after: avoid / break-after: avoid-page /
 *     page-break-inside: avoid / orphans: 4；p 为 orphans: 4；li p 为 orphans: 1；
 *   · thead,tr 为 page-break-inside: avoid；thead 为 display: table-header-group；
 *   · svg 与 mjx-container 均为 page-break-inside: avoid；
 *   · html / body 禁止首尾分页 + 关连字；.typora-export * 保留背景色；
 *     #write 的顶/底留白与首段上边距归零。
 * 不逐条照搬的两条：figure { overflow-x: visible } —— 导出白名单不含 figure
 * （图片渲染为 p > img），选择器不会命中；.is-mac table { page-break-inside: avoid }
 * —— 该规则只挂在 Typora 的 .is-mac 类上，且整表不拆页会让超长表溢出页面。
 * 额外一条来自 Mellow 自身结构：屏幕用 table 的 display:block + overflow-x:auto
 * 让超宽表横向滚动 —— 打印时必须还原 display:table，否则 table-header-group
 * 与行级分页规则不生效。
 */
@media print {
  /* base.css 的 @media print 首条：html / body 首尾禁止分页，并关掉连字，
     避免分页边界附近的字形跳变。缺这条时 Chrome 常在正文后多印一页空白。 */
  html, body {
    page-break-before: avoid;
    page-break-after: avoid;
    font-variant-ligatures: no-common-ligatures;
  }
  /* base.css：.typora-export * { -webkit-print-color-adjust: exact }
     —— 打印默认丢弃背景色，代码块 / 引用 / 表头 / 告警框会褪成白底。
     Typora 只写了带前缀的形式；这里补上标准属性（新版 Chromium / Gecko 认标准名）。 */
  .mellow-content * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* 屏幕留白不进打印（base.css 把 #write 的 margin-top / padding-top / padding-bottom
     归零）：.mellow-content 的 32px 顶距与 96px 底距在打印件里分别是「首页整体下移」
     与「尾部空白页」。左右内边距保留，对应 Typora 导出件的左右留白。 */
  .mellow-content {
    margin-top: 0;
    padding-top: 0;
    padding-bottom: 0;
    page-break-after: avoid;
  }
  /* base.css：#write > p:nth-child(1) { margin-top: 0 } —— 首页首段不叠加段前距。 */
  .mellow-content > p:first-child { margin-top: 0; }
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid-page;
    page-break-inside: avoid;
    orphans: 4;
  }
  p { orphans: 4; }
  li p { orphans: 1; }
  table {
    display: table;
    overflow: visible;
    page-break-inside: auto;
  }
  thead { display: table-header-group; }
  thead, tr { page-break-inside: avoid; }
  img, svg, mjx-container, .katex-display { page-break-inside: avoid; }
}
`;

function alertCss(): string {
  return ALERT_TOKENS
    .map(
      ([kind, bg, border, fg]) => `blockquote.markdown-alert-${kind} {
  background: var(${bg});
  border-left-color: var(${border});
  color: var(--mellow-fg);
}
blockquote.markdown-alert-${kind} .markdown-alert-title { color: var(${fg}); font-weight: 600; }`,
    )
    .join('\n');
}

export function themeCss(
  theme: 'light' | 'dark',
  options: { wrapCode?: boolean; themeVariables?: Record<string, string> } = {},
): string {
  const vars = theme === 'dark' ? DARK_VARS : LIGHT_VARS;
  // 当前主题 token 覆盖内置亮/暗默认值（Typora 导出件内联系当前主题 CSS）。
  const overrides = options.themeVariables === undefined ? '' : themeVariableOverrides(options.themeVariables);
  // 代码块换行：Typora 的导出件沿用 `noLineWrapping`（默认 false ⇒ 换行），
  // base.css 用 `#write pre { white-space: pre-wrap }` 表达，关闭时才撤销。
  // Mellow 侧由 `editor.lineWrapping`（默认 true）经 HtmlExportOptions.wrapCode 传入。
  const codeWrapCss =
    options.wrapCode === false ? '' : '\n/* 代码块长行换行（Typora noLineWrapping 默认 false ⇒ 换行） */\npre { white-space: pre-wrap; word-break: break-word; }\n';
  return `/* Mellow HTML Export (${theme}) */\n:root {\n${vars}${overrides}}\n${BODY_CSS}\n${codeWrapCss}${alertCss()}\n`;
}
