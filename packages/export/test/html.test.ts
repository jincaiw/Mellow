/**
 * HTML Export 测试（PRD §73）。
 *
 * 覆盖：三种模式结构、safe output（XSS）、Math、Mermaid、image、
 * TOC、heading anchors、无 CDN 依赖（离线可用）、raw HTML 白名单、
 * task list / footnote、fileToDataUrl。
 */

import * as path from 'path';
import { exportHtml, fileToDataUrl, DEFAULT_HTML_OPTIONS } from '../src/html';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const resolveImage = async (src: string): Promise<string | null> => {
  if (src.startsWith('missing-')) return null;
  return `${PNG_1PX}#${encodeURIComponent(src)}`;
};

const SAMPLE_MD = [
  '# 标题 Title',
  '',
  '段落 with **bold** *italic* `code` and [link](https://x.com)',
  '',
  '## 二级 Heading',
  '',
  '## 二级 Heading', // 重复标题 → 锚点唯一化
  '',
  '- [x] 完成的任务',
  '- 普通项目',
  '',
  '> 引用内容',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '$$x^2 + y^2 = z^2$$',
  '',
  '行内公式 $E=mc^2$ 和 \\(a+b\\)',
  '',
  '```mermaid',
  'graph TD',
  '  A --> B',
  '```',
  '',
  '![本地图](img/logo.png "标题")',
  '',
  '![远程图](https://example.com/remote.png)',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '[^1]: 脚注内容',
  '',
  '正文引用脚注[^1]',
  '',
  '[TOC]',
].join('\n');

describe('HTML export — 三种模式', () => {
  it('with-theme：完整文档骨架 + 内联样式 + mermaid bundle + katex 字体', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'with-theme' }, { resolveImage });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<style>');
    expect(html).toContain('--mellow-bg');
    expect(html).toContain('/* KaTeX */');
    expect(html).toContain('data:font/woff2;base64'); // katex 字体内联
    expect(html).toContain('<title>标题 Title</title>');
    expect(html).toContain('<div class="mellow-content">');
    expect(html).toContain('data:image/png;base64'); // 本地图内联
    expect(html).not.toContain('img/logo.png'); // 已被替换为 data URL
    expect(html).toContain('https://example.com/remote.png'); // 远程图保持
    // mermaid bundle + 初始化脚本内联（无外部引用）
    expect(html).toContain('globalThis["mermaid"]');
    expect(html).toContain('mermaid.initialize');
    expect(html).toContain('<pre class="mermaid">');
  });

  it('with-theme dark + customCss', async () => {
    const html = await exportHtml('# T', { mode: 'with-theme', theme: 'dark', customCss: '.custom{color:red}' });
    expect(html).toContain('--mellow-bg: #1e1e1e');
    expect(html).toContain('.custom{color:red}');
    expect(html).toContain('theme: "dark"');
  });

  it('without-style：无 style/script/内联 style 属性，math → MathML，mermaid → 源码', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'without-style' }, { resolveImage });
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/style="/);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>标题 Title</title>');
    // math → MathML（浏览器原生，零依赖）；无 KaTeX CSS（字体无内联）
    expect(html).toContain('<math');
    expect(html).toContain('semantics');
    expect(html).not.toContain('data:font/woff2');
    // mermaid → 源码块
    expect(html).toContain('language-mermaid');
    expect(html).not.toContain('pre class="mermaid"');
    // 图片保持引用（不内联）
    expect(html).toContain('img/logo.png');
    expect(html).not.toContain('data:image/png;base64');
    // TOC / anchors 仍保留
    expect(html).toContain('mellow-toc');
    expect(html).toContain('id="二级-heading"');
  });

  it('self-contained：本地图片强制内联，无任何外部资源引用', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'self-contained' }, { resolveImage });
    expect(html).toContain('data:image/png;base64');
    expect(html).not.toContain('img/logo.png');
    expect(html).toContain('globalThis["mermaid"]');
    expect(html).toContain('data:font/woff2;base64');
    // 无外部脚本 / 样式表引用（script/css 全部内联；远程图片资源允许保留 URL）
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link ');
    expect(html).toContain('https://example.com/remote.png');
  });
});

describe('HTML export — safe output', () => {
  it('剥离 script / on* 事件 / javascript: 链接 / style 属性', async () => {
    const evil = [
      '# T',
      '',
      '<script>alert(1)</script>',
      '',
      '<img src="x" onerror="alert(1)">',
      '',
      '<a href="javascript:alert(1)">bad</a>',
      '',
      '<a href="https://ok.com" target="_blank">ok</a>',
      '',
      '<div style="color:red">styled</div>',
    ].join('\n');
    const html = await exportHtml(evil, { mode: 'without-style' });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/style="/);
    expect(html).toContain('https://ok.com');
    // target=_blank 强制 noopener
    expect(html).toContain('rel="noopener noreferrer"');
    // styled 文本保留（div 白名单内）
    expect(html).toContain('styled');
  });

  it('iframe 强制 sandbox，白名单外标签剥除', async () => {
    const md = ['# T', '', '<iframe src="https://x.com"></iframe>', '', '<marquee>hi</marquee>'].join('\n');
    const html = await exportHtml(md, { mode: 'with-theme' });
    expect(html).toContain('sandbox="sandbox"');
    expect(html).not.toContain('<marquee');
    // marquee 文本保留
    expect(html).toContain('hi');
  });

  it('rawHtml=false：所有 raw HTML 转义为文本', async () => {
    const html = await exportHtml('# T\n\n<script>alert(1)</script>', { mode: 'with-theme', rawHtml: false });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('HTML export — Math', () => {
  it('inline $...$、block $$...$$、\\(...\\)、\\[...\\] 均渲染', async () => {
    const md = ['# T', '', '行内 $a^2$', '', '$$\\frac{1}{2}$$', '', '\\(x+y\\)', '', '\\[\\int_0^1 f(x)\\,dx\\]'].join('\n');
    const html = await exportHtml(md, { mode: 'with-theme' });
    expect(html).toContain('class="katex');
    expect(html).toContain('katex-display');
    // KaTeX MathML 双轨输出
    expect(html).toContain('<math');
  });

  it('渲染失败不抛错（源码可见）', async () => {
    const html = await exportHtml('# T\n\n$$ \\notvalid{ $$', { mode: 'with-theme' });
    expect(html).toContain('katex-error');
  });

  it('math=false 时保留源码文本', async () => {
    const html = await exportHtml('# T\n\n行内 $a^2$', { mode: 'with-theme', math: false });
    // 无 KaTeX 渲染产物与 CSS（mermaid bundle 内含 katex 字样，不能整串断言）
    expect(html).not.toContain('<span class="katex');
    expect(html).not.toContain('data:font/woff2');
    expect(html).toContain('$a^2$');
  });
});

describe('HTML export — Mermaid', () => {
  it('fence 渲染为 pre.mermaid；无 bundle 时降级为源码块', async () => {
    const md = '# T\n\n```mermaid\ngraph LR\n  A-->B\n```';
    const html = await exportHtml(md, { mode: 'with-theme' });
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('graph LR');
  });

  it('mermaid=false 时输出普通代码块', async () => {
    const html = await exportHtml('# T\n\n```mermaid\ngraph LR\n  A-->B\n```', { mode: 'with-theme', mermaid: false });
    expect(html).toContain('language-mermaid');
    expect(html).not.toContain('pre class="mermaid"');
  });
});

describe('HTML export — image', () => {
  it('resolveImage 返回 null 时保留原 src；缺失文件不报错', async () => {
    const md = '# T\n\n![缺](missing-1.png)\n\n![空](missing-2.png)';
    const html = await exportHtml(md, { mode: 'self-contained' }, { resolveImage });
    expect(html).toContain('missing-1.png');
  });

  it('title/alt 保留', async () => {
    const html = await exportHtml('# T\n\n![说明文字](img/a.png "图题")', { mode: 'with-theme' }, { resolveImage });
    expect(html).toContain('alt="说明文字"');
    expect(html).toContain('title="图题"');
  });
});

describe('HTML export — TOC 与 heading anchors', () => {
  it('[TOC] 生成嵌套目录，重复标题锚点唯一', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'with-theme' }, { resolveImage });
    expect(html).toContain('class="mellow-toc"');
    expect(html).toContain('href="#二级-heading"');
    // 重复标题：-1 后缀
    expect(html).toContain('id="二级-heading-1"');
    // heading id 唯一（只检查标题元素，排除内联 bundle 里的 id 字符串）
    const ids = html.match(/<h[1-6] id="([^"]+)"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includeOutline：无 [TOC] 标记时在开头插入目录', async () => {
    const md = '# 一级\n\n## 二级\n\n正文';
    const html = await exportHtml(md, { mode: 'with-theme', includeOutline: true });
    const tocPos = html.indexOf('mellow-toc');
    const bodyPos = html.indexOf('正文');
    expect(tocPos).toBeGreaterThan(-1);
    expect(tocPos).toBeLessThan(bodyPos);
    expect(html).toContain('href="#一级"');
    expect(html).toContain('href="#二级"');
  });

  it('tocMaxLevel 限制层级', async () => {
    const md = '# 一级\n\n## 二级\n\n### 三级';
    const html = await exportHtml(md, { mode: 'with-theme', tocMaxLevel: 2, includeOutline: true });
    expect(html).toContain('href="#一级"');
    expect(html).toContain('href="#二级"');
    expect(html).not.toContain('href="#三级"');
  });

  it('所有标题都有 id 锚点（含代码块外的 # 处理）', async () => {
    const md = '# 一级\n\n```\n# 不是标题\n```\n\n## 二级';
    const html = await exportHtml(md, { mode: 'with-theme', includeOutline: true });
    expect(html).toContain('<h1 id="一级">');
    expect(html).toContain('<h2 id="二级">');
    expect(html).toContain('href="#一级"');
    // 代码块内的 # 不进 TOC
    expect(html).not.toContain('href="#不是标题"');
  });
});

describe('HTML export — 表格 / task / footnote / raw HTML', () => {
  it('表格、任务列表、脚注渲染', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'with-theme' }, { resolveImage });
    expect(html).toContain('<table>');
    expect(html).toContain('task-list-item');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('脚注内容');
  });

  it('raw HTML 块保留（白名单）', async () => {
    const md = '# T\n\n<div class="box">内容</div>';
    const html = await exportHtml(md, { mode: 'with-theme' });
    expect(html).toContain('<div class="box">内容</div>');
  });

  it('空文档不崩溃', async () => {
    const html = await exportHtml('', { mode: 'with-theme' });
    expect(html).toContain('<title>Untitled</title>');
  });
});

describe('HTML export — fileToDataUrl', () => {
  it('读取本地文件为 data URL', async () => {
    const fixture = path.resolve(__dirname, 'fixtures/pixel.png');
    const data = await fileToDataUrl(fixture);
    expect(data).toMatch(/^data:image\/png;base64,/);
  });

  it('文件不存在返回 null', async () => {
    const data = await fileToDataUrl('/nonexistent/xx.png');
    expect(data).toBeNull();
  });
});

describe('HTML export — 默认值', () => {
  it('DEFAULT_HTML_OPTIONS 与 normalize 一致', async () => {
    expect(DEFAULT_HTML_OPTIONS.mode).toBe('with-theme');
    const html = await exportHtml('# T', DEFAULT_HTML_OPTIONS);
    expect(html).toContain('<style>');
  });
});
