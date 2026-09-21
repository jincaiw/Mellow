/**
 * Typora `typora-root-url`（G7-FEAT-08）与 front matter 边界交叉比对。
 *
 * 一手语义（`TypeMark/appsrc/main.js` 的 `docMenu.getLocalRootUrl()`）：
 * 只从 **YAML front matter** 读 `typora-root-url`，相对值以文档目录为基准解析为绝对目录；
 * 设置后文档内图片 src 以该目录为基准解析（Typora `path.resolve(rootUrl || docFolder, src)`）。
 */
import { buildImageSrcFrom, parseRootUrl, resolveImageSrc } from '../src/image/path';
import { frontMatterYaml } from '../src/frontMatter';
import { parseYamlFrontMatter } from '../src/yamlFrontMatter';

describe('parseRootUrl', () => {
  it('无 front matter → null', () => {
    expect(parseRootUrl('hello\n', '/docs')).toBeNull();
  });

  it('front matter 无该键 → null', () => {
    expect(parseRootUrl('---\ntitle: x\n---\n\nbody\n', '/docs')).toBeNull();
  });

  it('相对值以文档目录为基准解析为绝对目录', () => {
    expect(parseRootUrl('---\ntypora-root-url: ..\n---\n\nbody\n', '/docs/sub')).toBe('/docs');
  });

  it('嵌套相对值', () => {
    expect(parseRootUrl('---\ntypora-root-url: ../../assets\n---\n\n', '/docs/sub')).toBe('/assets');
  });

  it('绝对值原样（去引号）', () => {
    expect(parseRootUrl('---\ntypora-root-url: "/opt/root"\n---\n\n', '/docs')).toBe('/opt/root');
  });

  it('空值 → null', () => {
    expect(parseRootUrl('---\ntypora-root-url:\n---\n\n', '/docs')).toBeNull();
    expect(parseRootUrl('---\ntypora-root-url: "  "\n---\n\n', '/docs')).toBeNull();
  });

  it('未保存文档 + 相对 root → null（无法解析）', () => {
    expect(parseRootUrl('---\ntypora-root-url: ..\n---\n\n', null)).toBeNull();
  });

  // ⚠️ 关键负例：正文/代码块里出现同名文本不算 —— 否则会**静默改掉整篇文档的图片解析基准**
  it('正文中的同名文本不算（必须限制在 front matter 内）', () => {
    expect(parseRootUrl('body\n\ntypora-root-url: ..\n', '/docs/sub')).toBeNull();
    expect(parseRootUrl('```\ntypora-root-url: ..\n```\n', '/docs/sub')).toBeNull();
    expect(parseRootUrl('body\n\n---\ntypora-root-url: ..\n---\n', '/docs/sub')).toBeNull();
  });
});

describe('resolveImageSrc + rootDir', () => {
  it('无 rootDir 时行为不变：相对 → 文档目录', () => {
    expect(resolveImageSrc('a.png', '/docs')).toBe('/docs/a.png');
  });

  it('无 rootDir 时行为不变：根相对按 POSIX 绝对处理', () => {
    expect(resolveImageSrc('/images/a.png', '/docs')).toBe('/images/a.png');
  });

  it('有 rootDir：根相对 src 解析到 rootDir 之下（而不是文件系统根）', () => {
    expect(resolveImageSrc('/images/a.png', '/docs/sub', '/docs')).toBe('/docs/images/a.png');
  });

  it('有 rootDir：普通相对 src 基准换成 rootDir', () => {
    expect(resolveImageSrc('images/a.png', '/docs/sub', '/docs')).toBe('/docs/images/a.png');
  });

  it('有 rootDir：url 与绝对路径不受影响', () => {
    expect(resolveImageSrc('https://x/a.png', '/docs/sub', '/docs')).toBe('https://x/a.png');
    expect(resolveImageSrc('/abs/a.png', '/docs/sub', '/other')).toBe('/other/abs/a.png');
  });

  it('未保存文档 + rootDir → 仍可解析根相对 src', () => {
    expect(resolveImageSrc('/images/a.png', null, '/docs')).toBe('/docs/images/a.png');
  });
});

describe('buildImageSrcFrom（写入侧）与 resolveImageSrc 互为逆运算', () => {
  it('无 rootDir：相对文档目录（行为不变）', () => {
    expect(buildImageSrcFrom('/docs/assets/a.png', '/docs', null)).toBe('assets/a.png');
  });

  it('有 rootDir：写根相对（前导 /）', () => {
    expect(buildImageSrcFrom('/docs/images/a.png', '/docs/sub', '/docs')).toBe('/images/a.png');
  });

  it('有 rootDir 且目标就在 root 下（root === docDir）', () => {
    expect(buildImageSrcFrom('/docs/a.png', '/docs', '/docs')).toBe('/a.png');
  });

  it('未保存文档：绝对路径（无 rootDir）', () => {
    expect(buildImageSrcFrom('/tmp/a.png', null, null)).toBe('/tmp/a.png');
  });

  // 关键不变量：写进去的 src 必须能被解析回同一绝对路径（否则「插入即坏图」）
  it.each([
    ['/docs/assets/a.png', '/docs', null],
    ['/docs/images/a.png', '/docs/sub', '/docs'],
    ['/docs/a.png', '/docs', '/docs'],
    ['/other/x/a.png', '/docs/sub', '/docs'],
    ['/tmp/a.png', null, null],
  ])('往返一致：abs=%s docDir=%s rootDir=%s', (abs, docDir, rootDir) => {
    const src = buildImageSrcFrom(abs, docDir, rootDir);
    expect(resolveImageSrc(src, docDir, rootDir)).toBe(abs);
  });
});

describe('front matter 边界：两套扫描器必须一致', () => {
  const docs = [
    'plain\n',
    '---\ntitle: x\n---\n\nbody\n',
    '---\n\n---\n',
    '---\nno closing delimiter\n',
    '---\na: 1\n---',
    'body\n\n---\nnot front matter\n---\n',
  ];

  it.each(docs)('frontMatterYaml 与 parseYamlFrontMatter 取到同一段 yaml：%j', (doc) => {
    const viaParser = parseYamlFrontMatter(doc);
    expect(frontMatterYaml(doc)).toBe(viaParser === null ? null : viaParser.yaml);
  });
});
