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

const BODY_CSS = `
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  padding: 0;
  background: var(--mellow-bg);
  color: var(--mellow-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
    "Source Han Sans SC", sans-serif;
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
  max-width: 100%;
  overflow-x: auto;
}
th, td {
  border: 1px solid var(--mellow-border);
  padding: 6px 12px;
}
th { background: var(--mellow-code-bg); font-weight: 600; }
tr:nth-child(2n) td { background: var(--mellow-quote-bg); }
ul, ol { padding-left: 1.8em; margin: 0.6em 0; }
li { margin: 0.25em 0; }
li.task-list-item { list-style: none; margin-left: -1.4em; }
li.task-list-item input { margin-right: 0.4em; }
ul.contains-task-list { padding-left: 1.2em; }
img { max-width: 100%; height: auto; }
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

/* Footnotes */
section.footnotes {
  margin-top: 2.4em;
  padding-top: 0.8em;
  border-top: 1px solid var(--mellow-border);
  font-size: 0.9em;
  color: var(--mellow-fg-subtle);
}
section.footnotes ol { padding-left: 1.6em; }

/* GitHub Alerts（> [!NOTE] 引用块） */
blockquote p:first-child {
  font-weight: 500;
}
`;

function alertCss(): string {
  const kinds = [
    ['note', '--mellow-alert-note-bg', '--mellow-alert-note-border', '--mellow-alert-note-fg'],
    ['tip', '--mellow-alert-tip-bg', '--mellow-alert-tip-border', '--mellow-alert-tip-fg'],
    ['important', '--mellow-alert-important-bg', '--mellow-alert-important-border', '--mellow-alert-important-fg'],
    ['warning', '--mellow-alert-warning-bg', '--mellow-alert-warning-border', '--mellow-alert-warning-fg'],
    ['caution', '--mellow-alert-caution-bg', '--mellow-alert-caution-border', '--mellow-alert-caution-fg'],
  ] as const;
  return kinds
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

export function themeCss(theme: 'light' | 'dark'): string {
  const vars = theme === 'dark' ? DARK_VARS : LIGHT_VARS;
  return `/* Mellow HTML Export (${theme}) */\n:root {\n${vars}}\n${BODY_CSS}\n${alertCss()}\n`;
}
