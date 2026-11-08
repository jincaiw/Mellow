/**
 * HTML Export 测试（PRD §73）。
 *
 * 覆盖：三种模式结构、safe output（XSS）、Math、Mermaid、image、
 * TOC、heading anchors、无 CDN 依赖（离线可用）、raw HTML 白名单、
 * task list / footnote、fileToDataUrl。
 */

import * as path from 'path';
import { exportHtml, fileToDataUrl, DEFAULT_HTML_OPTIONS } from '../src/html';
import { themeCss } from '../src/html/styles';

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

  it('图片 CSS 对齐 Typora 导出基线：独占段落居中 / 显式 height 不被覆盖', async () => {
    const themed = await exportHtml('# T\n\n![图](img/a.png)', { mode: 'with-theme' }, { resolveImage });
    // 一人独占一段的图片在 Typora 导出里是块级居中（base.css 的 `p>img:only-child`）
    expect(themed).toContain('p > img:only-child { display: block; margin: auto; }');
    expect(themed).toContain('img:not([height]) { height: auto; }');
    expect(themed).toContain('image-orientation: from-image');
    // kbd 白名单放行但此前无任何样式 ⇒ 导出后退化；Typora base.css 有键帽规则
    expect(themed).toMatch(/kbd \{[^}]*border-bottom-width: 2px/);
    // raw HTML 媒体/嵌入同 base.css：video 块级居中、iframe 撑满且无边框
    expect(themed).toContain('video { max-width: 100%; display: block; margin: 0 auto; }');
    expect(themed).toContain('iframe { max-width: 100%; width: 100%; border: none; }');
    // 显式 height（raw HTML 尺寸）必须保留到输出，否则 CSS 一压就变形
    const sized = await exportHtml('# T\n\n<img src="img/a.png" height="120">', { mode: 'without-style' }, { resolveImage });
    expect(sized).toContain('height="120"');
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
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('脚注内容');
  });

  // Typora 1.14.9 的脚注 DOM：引用 `<sup class='md-footnote'><a …>{C}</a></sup>`
  // （C = 首次出现顺序，无方括号，重复引用同号），脚注区只有一条 <hr/>，
  // `.footnotes` 为 opacity .8 / .9rem / 上下 1em。此前 Mellow 输出 `[1]`、
  // 且 <hr class="footnotes-sep"> 之外又给 section 加了 border-top（两条分隔线）。
  it('脚注：引用显示序号（无方括号、重复同号）、单条分隔线、胶囊样式', async () => {
    const html = await exportHtml('正文[^a] 与 [^b] 与 [^a]\n\n[^a]: A\n\n[^b]: B', { mode: 'with-theme' });
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn1" id="fnref1">1</a></sup>');
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn2" id="fnref2">2</a></sup>');
    // 重复引用：显示同一个序号，refid 仍带 subId 保证锚点唯一
    expect(html).toContain('id="fnref1:1">1</a></sup>');
    expect(html).not.toMatch(/class="footnote-ref"><a[^>]*>\[/);
    expect(html).toContain('sup.footnote-ref {');
    expect(html).toMatch(/sup\.footnote-ref \{[^}]*border-radius: 4px/);
    expect(html).toMatch(/sup\.footnote-ref \{[^}]*background: rgba\(238, 238, 238, 0\.7\)/);
    expect(html).toMatch(/section\.footnotes \{[^}]*opacity: 0\.8/);
    expect(html).not.toMatch(/section\.footnotes \{[^}]*border-top/);
  });

  // 导出件被用户直接在浏览器里打印时的分页规则（Typora 导出件内嵌 base.css，
  // 其 @media print 段同样生效；Mellow 此前只有屏幕样式，见 styles.ts 的注释）。
  it('with-theme 导出内嵌 @media print 分页规则；without-style 不带样式', async () => {
    const html = await exportHtml('# A\n\n段落\n\n| a |\n|---|\n| 1 |', { mode: 'with-theme' });
    expect(html).toContain('@media print {');
    expect(html).toContain('break-after: avoid-page;');
    expect(html).toContain('page-break-inside: avoid;');
    expect(html).toContain('orphans: 4;');
    expect(html).toContain('thead { display: table-header-group; }');
    // 屏幕态的 display:block 横向滚动表必须在打印时还原为 table（否则表头重复不生效）
    expect(html).toMatch(/table \{\s*display: table;/);
    const plain = await exportHtml('# A', { mode: 'without-style' });
    expect(plain).not.toContain('@media print');
  });

  // base.css 的 @media print 其余四条（§4.376 对照）：html/body 首尾禁止分页 +
  // 关连字；.typora-export * 保留背景色；#write 的顶/底留白与首段上边距归零。
  // 缺它们时的可观察后果：正文后多一页空白、代码块/引用/表头褪成白底、首页整体下移。
  it('打印规则：html/body 不分页、保留背景色、内容区留白归零', async () => {
    const html = await exportHtml('# A\n\n段落', { mode: 'with-theme' });
    expect(html).toMatch(/html, body \{[^}]*page-break-before: avoid;/);
    expect(html).toMatch(/html, body \{[^}]*page-break-after: avoid;/);
    expect(html).toMatch(/html, body \{[^}]*font-variant-ligatures: no-common-ligatures;/);
    expect(html).toMatch(/\.mellow-content \* \{[^}]*print-color-adjust: exact;/);
    expect(html).toMatch(/\.mellow-content \{[^}]*padding-top: 0;/);
    expect(html).toMatch(/\.mellow-content \{[^}]*padding-bottom: 0;/);
    expect(html).toContain('.mellow-content > p:first-child { margin-top: 0; }');
  });

  // 代码块长行换行：Typora 的 noLineWrapping 默认 false ⇒ 导出件默认换行
  // （`#write pre { white-space: pre-wrap }`）；Mellow 由 editor.lineWrapping 经
  // HtmlExportOptions.wrapCode 传入，默认 true。
  it('代码块长行默认换行；wrapCode=false 时恢复横向滚动', async () => {
    const md = '```js\nconst a = 1;\n```';
    const wrap = await exportHtml(md, { mode: 'with-theme' });
    expect(wrap).toContain('pre { white-space: pre-wrap; word-break: break-word; }');
    const nowrap = await exportHtml(md, { mode: 'with-theme', wrapCode: false });
    expect(nowrap).not.toContain('white-space: pre-wrap');
    expect(nowrap).toContain('overflow-x: auto');
  });

  // 首行缩进：Typora 的导出构建器 `File.option.indentFirstLine && (u += " first-line-indent")`
  // 把类加在 #write 上，base.css 由 `#write.first-line-indent p { text-indent: 2em }` 生效；
  // 无样式导出走另一条提前返回分支，不带该类。
  it('首行缩进：开启时才给正文根节点加 first-line-indent 类', async () => {
    const md = '第一段\n\n第二段';
    const off = await exportHtml(md, { mode: 'with-theme' });
    expect(off).toContain('<div class="mellow-content">');
    expect(off).not.toContain('mellow-content first-line-indent');
    // 规则常驻（选择器只在类存在时命中），开启时无需重新生成样式表
    expect(off).toContain('.mellow-content.first-line-indent p { text-indent: 2em; }');
    expect(off).toMatch(/\.mellow-content\.first-line-indent li p,[\s\S]*?text-indent: 0; \}/);

    const on = await exportHtml(md, { mode: 'with-theme', firstLineIndent: true });
    expect(on).toContain('<div class="mellow-content first-line-indent">');
    expect(on).toContain('.mellow-content.first-line-indent p { text-indent: 2em; }');
    expect(on).toContain('.mellow-content.first-line-indent li { margin-left: 2em; }');

    // 默认 false
    expect(DEFAULT_HTML_OPTIONS.firstLineIndent).toBe(false);
  });

  it('首行缩进在无样式模式下不生效（与 Typora 无样式导出分支一致）', async () => {
    const md = '第一段';
    const html = await exportHtml(md, { mode: 'without-style', firstLineIndent: true });
    expect(html).not.toContain('first-line-indent');
    expect(html).not.toContain('<style>');
  });

  // 正文字号：Typora 导出构建器 `var h=e.fontSize||document.body.parentElement.style.fontSize||""`
  // ⇒ 导出件的 #write 继承生效字号；Mellow 的同一真源是 editor.fontSize（编辑器 + Reader 已同源）。
  it('正文字号：仅传 fontSize 时给正文根节点加 inline font-size', async () => {
    const on = await exportHtml('段落', { mode: 'with-theme', fontSize: 20 });
    expect(on).toContain('<div class="mellow-content" style="font-size: 20px">');
    const both = await exportHtml('段落', { mode: 'with-theme', fontSize: 20, firstLineIndent: true });
    expect(both).toContain('<div class="mellow-content first-line-indent" style="font-size: 20px">');
    // 缺省 / 非法值 / 无样式模式都不输出内联 style（默认输出不变）
    for (const opts of [
      { mode: 'with-theme' as const },
      { mode: 'with-theme' as const, fontSize: Number.NaN },
      { mode: 'with-theme' as const, fontSize: -1 },
      { mode: 'without-style' as const, fontSize: 20 },
    ]) {
      const html = await exportHtml('段落', opts);
      expect(html).not.toContain('style="font-size:');
    }
  });

  // 导出件的复选框是静态快照：Typora 的导出 DOM 是「input + 文本」（无 label），
  // 并由 base.css 的 pointer-events:none 关掉点击；label 包裹会让点文本也切换复选框。
  it('任务列表导出为「input + 文本」且不可交互（无 label 转发点击）', async () => {
    const html = await exportHtml('- [x] done\n- [ ] todo', { mode: 'with-theme' });
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('<label>');
    expect(html).toContain('li.task-list-item input { margin-right: 0.4em; pointer-events: none; }');
  });

  // ADR-0037 A2 的「有序列表起始号」对照项：白名单漏 `start` ⇒ sanitize 剥掉属性、
  // 起始号静默退化。必须在导出层（不是打印层）锁住，因为两条路径共用 sanitize。
  it('有序列表保留起始编号（<ol start>）', async () => {
    const html = await exportHtml('3. 三\n4. 四', { mode: 'without-style' });
    expect(html).toContain('<ol start="3">');
    expect(html).not.toMatch(/<ol><li>三/);
  });

  it('表格列对齐保留（style → mellow-align-* class，不放开 style）', async () => {
    const md = '| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |';
    const themed = await exportHtml(md, { mode: 'with-theme' });
    expect(themed).toContain('class="mellow-align-left"');
    expect(themed).toContain('class="mellow-align-center"');
    expect(themed).toContain('class="mellow-align-right"');
    expect(themed).toMatch(/td\.mellow-align-center \{ text-align: center; \}/);
    // 表格占满内容宽度、默认左对齐（Typora 导出基线 base.css 的 table{width:100%;text-align:left}）
    expect(themed).toMatch(/table \{[^}]*width: 100%/);
    expect(themed).toMatch(/table \{[^}]*text-align: left/);
    // 只断言表格自身的标记（整篇文档内嵌了渲染器 bundle，其中含 `style="text-align…"`
    // 之类的源码字符串，不能对全文做子串断言）
    const themedTable = themed.slice(themed.indexOf('<table'), themed.indexOf('</table>'));
    expect(themedTable).not.toContain('style=');

    // 无样式模式：class 仍在（语义不掉），但不含任何 style 属性
    const bare = await exportHtml(md, { mode: 'without-style' });
    const bareTable = bare.slice(bare.indexOf('<table'), bare.indexOf('</table>'));
    expect(bareTable).toContain('mellow-align-center');
    expect(bareTable).not.toContain('style=');
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
    expect(html).toContain('class="footnote-ref"'); // 脚注渲染
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
    // 只判 DOM 标记：样式表里无条件存在 `sup.footnote-ref` 选择器（§4.378），
    // 用裸子串会与 CSS 撞车，测不到「插件未注册」这件事。
    expect(off).not.toContain('class="footnote-ref"');
    expect(off).not.toContain('class="footnotes"');
    // `[^1]: 脚注内容` 本身是合法的 CommonMark 链接引用定义 ⇒ 降级为引用链接（非脚注语义）
    expect(off).toContain('<a href=');
    // 无匹配定义时保留字面文本
    const literal = await exportHtml('正文[^1]', { mode: 'with-theme', footnote: false });
    expect(literal).toContain('[^1]');
  });
});

describe('HTML export — 代码块行号（Typora showLineNumbersForFence，默认 false）', () => {
  const CODE_MD = '```js\nconst a = 1;\n\n  indented();\n```\n';

  it('默认关闭：输出与 markdown-it 默认围栏一致，无行号标记', async () => {
    const html = await exportHtml(CODE_MD, { mode: 'with-theme' });
    expect(html).toContain('<code class="language-js">const a = 1;\n\n  indented();\n</code>');
    expect(html).not.toContain('class="mellow-code-lineno"');
    expect(html).not.toContain('class="mellow-code-num"');
  });

  it('开启后逐行编号；空行也占一行；尾随换行不额外编号', async () => {
    const html = await exportHtml(CODE_MD, { mode: 'with-theme', codeLineNumbers: true });
    expect(html).toContain('<pre class="mellow-code-lineno"><code class="language-js">');
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`<span class="mellow-code-num" aria-hidden="true">${n}</span>`);
    }
    expect(html).not.toContain('aria-hidden="true">4</span>'); // 尾随换行不算第 4 行
    expect(html).toContain('<span class="mellow-code-text">const a = 1;</span>');
    expect(html).toContain('<span class="mellow-code-text"></span>'); // 空行
    expect(html).toContain('<span class="mellow-code-text">  indented();</span>'); // 缩进保留
    // 相邻行之间不能有空白文本节点（pre 保留空白 ⇒ 会多出空行）
    expect(html).toContain(
      '<span class="mellow-code-text">const a = 1;</span></span><span class="mellow-code-line"><span class="mellow-code-num" aria-hidden="true">2</span>',
    );
  });

  it('行号不可选中/复制（user-select:none，与 Typora 的 .CodeMirror-linenumber 同义）', async () => {
    const html = await exportHtml(CODE_MD, { mode: 'with-theme', codeLineNumbers: true });
    expect(html).toMatch(/\.mellow-code-num \{[^}]*-webkit-user-select: none;/);
    expect(html).toMatch(/\.mellow-code-num \{[^}]*user-select: none;/);
  });

  it('行内 HTML 转义不因分行而失效', async () => {
    const html = await exportHtml('```html\n<b> & "q"\n```', { mode: 'with-theme', codeLineNumbers: true });
    // sanitize-html 解析后只重新转义 & < >（文本节点里的引号不需要转义）
    expect(html).toContain('&lt;b&gt; &amp; "q"');
    expect(html).not.toContain('<span class="mellow-code-text"><b>');
  });

  it('without-style 不带行号（Typora 无样式导出走纯 pre/code 分支）', async () => {
    const html = await exportHtml(CODE_MD, { mode: 'without-style', codeLineNumbers: true });
    expect(html).not.toContain('class="mellow-code-num"');
    expect(html).toContain('<pre><code class="language-js">const a = 1;');
  });

  it('Mermaid 图保持 SVG 容器；mermaid=false 时按普通代码块编号', async () => {
    const diagram = await exportHtml('```mermaid\ngraph TD\n  A --> B\n```', { mode: 'with-theme', codeLineNumbers: true });
    expect(diagram).toContain('<pre class="mermaid">');
    expect(diagram).not.toContain('class="mellow-code-num"');
    const plain = await exportHtml('```mermaid\ngraph TD\n  A --> B\n```', { mode: 'with-theme', mermaid: false, codeLineNumbers: true });
    expect(plain).toContain('<pre class="mellow-code-lineno"><code class="language-mermaid">');
    expect(plain).toContain('<span class="mellow-code-num" aria-hidden="true">2</span>');
  });

  it('空代码块不产生行号（也不崩溃）', async () => {
    const html = await exportHtml('```js\n```', { mode: 'with-theme', codeLineNumbers: true });
    expect(html).toContain('<pre class="mellow-code-lineno"><code class="language-js"></code></pre>');
    expect(html).not.toContain('class="mellow-code-num"');
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
 * 当前主题 token 传入导出件（Typora 1.14.9：导出内联**当前主题** CSS，
 * 而非只按亮/暗二选一；一手证据见 styles.ts 的 EXPORT_THEME_SOURCES 注释）。
 *
 * 契约：
 * - 不传 `themeVariables` ⇒ 输出与旧版逐字节同义（内置 LIGHT/DARK 默认值）；
 * - 传入 ⇒ 映射表内的导出变量被主题值覆盖，编辑器专用 token（`--mellow-md-*`）不泄漏；
 * - 空白值 / 未知 token / 非字符串一律忽略，不产生声明；
 * - 值里的 `;` / `}` 被剥离（主题 CSS 可能是用户提供的文件）。
 */
describe('HTML export — 当前主题 token（themeVariables）', () => {
  const PAPER_LIKE = {
    '--mellow-bg': '#f8f4ea',
    '--mellow-fg': '#222222',
    '--mellow-fg-subtle': '#666666',
    '--mellow-border': '#e2e2e2',
    '--mellow-border-strong': '#d0d0d0',
    '--mellow-link': '#0366d6',
    '--mellow-code-bg': '#f6f8fa',
    '--mellow-code-border': '#e1e4e8',
    '--mellow-bg-subtle': '#efe5cd',
    '--mellow-mark': '#ffe066',
    '--mellow-content-font': "Georgia, 'Songti SC', 'Noto Serif SC', serif",
    '--mellow-alert-note-bg': '#f0f6ff',
    // 编辑器排版 token：不属于导出样式表消费面，不应出现在导出件里
    '--mellow-md-code-bg': '#f8f8f8',
    '--mellow-sidebar-bg': '#fafafa',
  };

  it('不传 themeVariables：仍输出内置亮/暗默认值', () => {
    const css = themeCss('light');
    expect(css).toContain('--mellow-fg: #24292f;');
    expect(css).toContain('--mellow-bg: #ffffff;');
    expect(css).not.toContain('--mellow-content-font:');
    expect(themeCss('dark')).toContain('--mellow-fg: #e6e6e6;');
  });

  it('传入主题 token：覆盖导出件消费的变量（含链接色 / 内容字体）', () => {
    const css = themeCss('light', { themeVariables: PAPER_LIKE });
    // 映射：主题 --mellow-link → 导出 --mellow-accent（导出件链接色消费 accent）
    expect(css).toContain('--mellow-accent: #0366d6;');
    expect(css).toContain('--mellow-fg: #222222;');
    expect(css).toContain('--mellow-bg: #f8f4ea;');
    // 引用底色回落到主题 code-bg；TOC 回落到 bg-subtle
    expect(css).toContain('--mellow-quote-bg: #f6f8fa;');
    expect(css).toContain('--mellow-toc-bg: #efe5cd;');
    // 高亮回落到主题 mark
    expect(css).toContain('--mellow-mark-bg: #ffe066;');
    expect(css).toContain("--mellow-content-font: Georgia, 'Songti SC', 'Noto Serif SC', serif;");
    // 告警 token 直通
    expect(css).toContain('--mellow-alert-note-bg: #f0f6ff;');
    // body 的 font-family 走 var()，主题字体才生效
    expect(css).toMatch(/font-family: var\(--mellow-content-font,/);
  });

  it('编辑器专用 token 不进入导出件', () => {
    const css = themeCss('light', { themeVariables: PAPER_LIKE });
    expect(css).not.toContain('--mellow-md-code-bg');
    expect(css).not.toContain('--mellow-sidebar-bg');
  });

  it('空白值 / 未知 token 忽略；值里的 ; 与 } 被剥离', () => {
    const css = themeCss('light', {
      themeVariables: { '--mellow-fg': '   ', '--mellow-bg': '#123456; } body { color: red', '--mellow-unknown': '#fff' },
    });
    expect(css).toContain('--mellow-fg: #24292f;'); // 空白值 ⇒ 保留默认
    expect(css).toMatch(/--mellow-bg: #123456\s+body \{ color: red;/); // 危险字符已剥离
    expect(css).not.toContain('--mellow-unknown');
    expect(css).not.toContain('} body {');
  });

  it('exportHtml 把 themeVariables 接进 <style>；缺省时输出不变', async () => {
    const withTheme = await exportHtml('正文', { mode: 'with-theme', themeVariables: PAPER_LIKE });
    expect(withTheme).toContain('--mellow-accent: #0366d6;');
    expect(withTheme).toContain("--mellow-content-font: Georgia, 'Songti SC', 'Noto Serif SC', serif;");
    const plain = await exportHtml('正文', { mode: 'with-theme' });
    expect(plain).not.toContain('--mellow-accent: #0366d6;');
    expect(plain).toContain('--mellow-accent: #0969da;');
  });

  it('without-style 无样式模式不输出任何 token（与无样式分支一致）', async () => {
    const html = await exportHtml('正文', { mode: 'without-style', themeVariables: PAPER_LIKE });
    expect(html).not.toContain('--mellow-accent');
    expect(html).not.toContain('<style>');
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
