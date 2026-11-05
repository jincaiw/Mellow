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

describe('HTML export — 语法特性开关（ADR-0036 A1 批次 A36：「开关关不掉」修复）', () => {
  it('默认（不传开关）：math/mermaid/toc/footnote 全部渲染 —— 默认输出不变', async () => {
    const html = await exportHtml(SAMPLE_MD, { mode: 'with-theme' }, { resolveImage });
    expect(html).toContain('katex'); // 数学渲染
    expect(html).toContain('<pre class="mermaid">'); // Mermaid 渲染
    expect(html).toContain('mellow-toc'); // [TOC] 渲染
    expect(html).toContain('footnote-ref'); // 脚注渲染
  });

  it('math=false：$E=mc^2$ 与 $$…$$ 保留字面文本', async () => {
    const md = '行内 $E=mc^2$ 与\n\n$$x^2$$';
    const html = await exportHtml(md, { mode: 'with-theme', math: false });
    expect(html).toContain('$E=mc^2$');
    expect(html).toContain('$$x^2$$');
    // KaTeX 渲染与整包 KaTeX CSS（字体 base64 内联）都不应出现；
    // 主题 CSS 本身固定含一个 .katex-display 小规则（styles.ts），故判据用「内联字体」
    expect(html).not.toContain('class="katex"');
    expect(html).not.toContain('data:font/woff2');
  });

  it('mermaid=false：围栏按普通代码块输出，无 .mermaid 容器', async () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```';
    const html = await exportHtml(md, { mode: 'with-theme', mermaid: false });
    expect(html).not.toContain('<pre class="mermaid">');
    expect(html).toContain('graph TD');
  });

  it('rawHtml=false：原始 HTML 转义为可见文本', async () => {
    const md = '# T\n\n<div class="box">内容</div>';
    const on = await exportHtml(md, { mode: 'with-theme', rawHtml: true });
    expect(on).toContain('<div class="box">内容</div>');
    const off = await exportHtml(md, { mode: 'with-theme', rawHtml: false });
    expect(off).toContain('&lt;div class=&quot;box&quot;&gt;内容&lt;/div&gt;');
    expect(off).not.toContain('<div class="box">内容</div>');
  });

  it('toc=false：[TOC] 保留字面文本，includeOutline 同样不插入', async () => {
    const md = '# A\n\n## B\n\n[TOC]';
    const on = await exportHtml(md, { mode: 'with-theme', toc: true });
    expect(on).toContain('<nav class="mellow-toc"');
    const off = await exportHtml(md, { mode: 'with-theme', toc: false });
    expect(off).not.toContain('<nav class="mellow-toc"');
    expect(off).toContain('[TOC]');
    const outlineOff = await exportHtml('# A\n\n## B', { mode: 'with-theme', toc: false, includeOutline: true });
    expect(outlineOff).not.toContain('<nav class="mellow-toc"');
  });

  it('footnote=false：不渲染脚注容器；[^1] 按 CommonMark 降级', async () => {
    const md = '正文[^1]\n\n[^1]: 脚注内容';
    const off = await exportHtml(md, { mode: 'with-theme', footnote: false });
    expect(off).not.toContain('footnote-ref');
    expect(off).not.toContain('class="footnotes"');
    // `[^1]: 脚注内容` 本身是合法的 CommonMark 链接引用定义 ⇒ 降级为引用链接（非脚注语义）
    expect(off).toContain('<a href=');
    // 无匹配定义时保留字面文本
    const literal = await exportHtml('正文[^1]', { mode: 'with-theme', footnote: false });
    expect(literal).toContain('[^1]');
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

/**
 * 行内强调的**渲染语义台账**（ADR-0035 裁决 = A1「对齐 Typora」后的语义钉）。
 *
 * 【历史】本组测试在裁决前钉住 CommonMark 语义（`这是**「必须」**的` 渲染字面 `**`），
 *   作用 = 「改动渲染语义时它会红，迫使回到 ADR-0035」。
 * 【现状】2026-11-05 批次 A35 落地 A1：导出侧 `installTyporaEmphasis`
 *   （packages/export/src/html/markdown.ts）把 flanking 判据放宽为「内侧非空白即可」
 *   ⇒ 差异用例翻转为**加粗**。本组改为钉住 A1 语义 + 不回退用例：
 *   - ADR-0035 验收矩阵 4 用例全部加粗（预览侧对应测试 = packages/editor-engine/test/cjk-emphasis.test.ts）；
 *   - 既有 CommonMark 机器不回退：`**a**b**c**`、`***foo***` 嵌套、`snake_case_word` 守卫、未闭合。
 *   ⚠️ 再改动渲染语义 = 回到 ADR-0035 重新裁决，本组必须同步。
 */
describe('HTML export — 行内强调语义台账（ADR-0035 = A1，批次 A35 已落地）', () => {
  // mode = without-style：纯语义 HTML（无内嵌样式/脚本/渲染器 bundle）⇒ 断言可裸查标签。
  // （旧 `mode: 'plain'` 并非合法取值，会落到 with-theme 整文档 —— 内嵌 bundle 里有渲染器
  // 源码字符串，裸查 `<em>`/`<strong>` 会命中源码；正查 CJK 串侥幸不中。批次 A35 修正。）
  const render = async (md: string): Promise<string> => exportHtml(md, { ...DEFAULT_HTML_OPTIONS, mode: 'without-style' });

  it('验收矩阵 ①：内侧是汉字，加粗', async () => {
    expect(await render('中文**粗体**中文')).toContain('<strong>粗体</strong>');
  });

  it('验收矩阵 ②：内侧紧贴全角标点且外侧紧贴汉字 ⇒ **加粗**（A1 翻转的用例）', async () => {
    const html = await render('这是**「必须」**的。');
    expect(html).toContain('<p>这是<strong>「必须」</strong>的。</p>');
  });

  it('验收矩阵 ③：行首 / 行尾，加粗', async () => {
    expect(await render('**「引文」**。')).toContain('<strong>「引文」</strong>');
  });

  it('验收矩阵 ④：两侧留空格，加粗', async () => {
    expect(await render('这是 **「必须」** 的')).toContain('<strong>「必须」</strong>');
  });

  it('`__` 同形：内侧全角标点 + 外侧汉字也加粗', async () => {
    expect(await render('这是__「必须」__的')).toContain('<strong>「必须」</strong>');
  });

  it('`*` 单星同理：中文*「斜体」*中文 渲染斜体', async () => {
    expect(await render('中文*「斜体」*中文')).toContain('<em>「斜体」</em>');
  });

  it('不回退 ①：`**a**b**c**` 维持两对 strong', async () => {
    expect(await render('**a**b**c**')).toContain('<strong>a</strong>b<strong>c</strong>');
  });

  it('不回退 ②：`***foo***` 维持 em>strong 嵌套', async () => {
    expect(await render('***foo***')).toContain('<em><strong>foo</strong></em>');
  });

  it('不回退 ③：`snake_case_word` 保持字面（ASCII 单词内 `_` 守卫）', async () => {
    const html = await render('snake_case_word');
    expect(html).not.toContain('<em>');
    expect(html).toContain('snake_case_word');
  });

  it('不回退 ④：未闭合 `**粗体` 保持字面', async () => {
    expect(await render('**未闭合')).toContain('<p>**未闭合</p>');
  });
});
