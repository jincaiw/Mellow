/**
 * Image 路径纯函数（spec §5 Path Rules / §12 跨平台场景）。
 */

import {
  isUrl,
  isWindowsDrivePath,
  isUncPath,
  isPosixAbsolute,
  isAbsolutePath,
  pathKind,
  normalizeSlashes,
  basename,
  dirname,
  joinPaths,
  computeRelativePath,
  escapeImageSrc,
  unescapeImageSrc,
  resolveImageSrc,
  isImageFile,
  assetDirName,
  buildImageMarkdown,
  parseImageSrcFromMarkdown,
} from '../src/image/path';

describe('路径种类判别（spec §5）', () => {
  test('URL：http/https/data/mailto', () => {
    expect(isUrl('https://example.com/a.png')).toBe(true);
    expect(isUrl('data:image/png;base64,AAA')).toBe(true);
    expect(isUrl('mailto:a@b.com')).toBe(true);
    expect(isUrl('C:/a.png')).toBe(false); // drive 不是 URL
    expect(isUrl('//server/share/a.png')).toBe(false);
  });

  test('Windows drive / UNC / POSIX / relative', () => {
    expect(isWindowsDrivePath('C:\\docs\\a.png')).toBe(true);
    expect(isWindowsDrivePath('c:/docs/a.png')).toBe(true);
    expect(isUncPath('\\\\server\\share\\a.png')).toBe(true);
    expect(isUncPath('//server/share/a.png')).toBe(true);
    expect(isPosixAbsolute('/Users/jason/a.png')).toBe(true);
    expect(isPosixAbsolute('//server/a.png')).toBe(false); // UNC 优先
    expect(isAbsolutePath('C:\\x\\y.png')).toBe(true);
    expect(isAbsolutePath('/x/y.png')).toBe(true);
    expect(isAbsolutePath('\\\\s\\q.png')).toBe(true);
    expect(isAbsolutePath('assets/a.png')).toBe(false);
  });

  test('pathKind 顺序', () => {
    expect(pathKind('https://a.com/x.png')).toBe('url');
    expect(pathKind('D:\\x.png')).toBe('windows-drive');
    expect(pathKind('\\\\srv\\x.png')).toBe('unc');
    expect(pathKind('/home/x.png')).toBe('posix-absolute');
    expect(pathKind('images/x.png')).toBe('relative');
  });
});

describe('路径操作（跨平台）', () => {
  test('normalizeSlashes：\\ → /，UNC 保留双斜杠', () => {
    expect(normalizeSlashes('C:\\docs\\a.png')).toBe('C:/docs/a.png');
    expect(normalizeSlashes('\\\\server\\share\\a.png')).toBe('//server/share/a.png');
    expect(normalizeSlashes('a/b/c.png')).toBe('a/b/c.png');
  });

  test('basename/dirname（POSIX / Windows / UNC / 中文 / 空格）', () => {
    expect(basename('/a/b/图 片.png')).toBe('图 片.png');
    expect(basename('C:\\docs\\my file.png')).toBe('my file.png');
    expect(basename('\\\\srv\\share\\f.png')).toBe('f.png');
    expect(basename('plain.png')).toBe('plain.png');
    expect(dirname('/a/b.png')).toBe('/a');
    expect(dirname('C:\\a\\b.png')).toBe('C:/a');
    expect(dirname('\\\\srv\\share\\f.png')).toBe('//srv/share');
    expect(dirname('b.png')).toBe('.');
  });

  test('joinPaths（drive/UNC/根保留）', () => {
    expect(joinPaths('/docs', 'assets', 'a.png')).toBe('/docs/assets/a.png');
    expect(joinPaths('C:\\docs', 'assets\\a.png')).toBe('C:/docs/assets/a.png');
    expect(joinPaths('\\\\srv\\share', 'a.png')).toBe('//srv/share/a.png');
    expect(joinPaths('/docs/', '/assets/')).toBe('/docs/assets');
  });
});

describe('computeRelativePath（spec §5 相对路径）', () => {
  test('同目录 → 文件名', () => {
    expect(computeRelativePath('/docs', '/docs/a.png')).toBe('a.png');
  });

  test('子目录 → 下行', () => {
    expect(computeRelativePath('/docs', '/docs/assets/a.png')).toBe('assets/a.png');
  });

  test('上溯 → ../', () => {
    expect(computeRelativePath('/docs/chapters', '/docs/images/a.png')).toBe('../images/a.png');
  });

  test('中文/空格路径', () => {
    expect(computeRelativePath('/文档 目录', '/文档 目录/图片/照 片.png')).toBe('图片/照 片.png');
  });

  test('Windows drive 相对化', () => {
    expect(computeRelativePath('C:\\docs', 'C:\\docs\\a.png')).toBe('a.png');
    expect(computeRelativePath('C:\\docs', 'D:\\docs\\a.png')).toBe('D:/docs/a.png'); // 跨盘无法相对
  });

  test('UNC 前缀不一致 → 绝对', () => {
    expect(computeRelativePath('\\\\srv1\\share', '\\\\srv2\\share\\a.png')).toBe('//srv2/share/a.png');
  });
});

describe('escapeImageSrc / unescape（spec §5 URL escape）', () => {
  test('空格/#/%/括号/方括号 转义', () => {
    expect(escapeImageSrc('my file.png')).toBe('my%20file.png');
    expect(escapeImageSrc('a#b.png')).toBe('a%23b.png');
    expect(escapeImageSrc('100%.png')).toBe('100%25.png');
    expect(escapeImageSrc('img(1).png')).toBe('img%281%29.png');
    expect(escapeImageSrc('[x].png')).toBe('%5Bx%5D.png');
  });

  test('中文保留（不转义）', () => {
    expect(escapeImageSrc('图片.png')).toBe('图片.png');
  });

  test('已有 %XX 不双重转义', () => {
    expect(escapeImageSrc('my%20file.png')).toBe('my%20file.png');
  });

  test('unescape 还原', () => {
    expect(unescapeImageSrc('my%20file%23x.png')).toBe('my file#x.png');
    expect(unescapeImageSrc('%E5%9B%BE')).toBe('%E5%9B%BE'); // 非保留字符不强行解码
  });
});

describe('resolveImageSrc（spec §5 resolve）', () => {
  test('URL 原样', () => {
    expect(resolveImageSrc('https://a.com/x.png', '/docs')).toBe('https://a.com/x.png');
  });

  test('绝对路径归一化', () => {
    expect(resolveImageSrc('C:\\docs\\a.png', '/docs')).toBe('C:/docs/a.png');
    expect(resolveImageSrc('\\\\srv\\share\\a.png', '/docs')).toBe('//srv/share/a.png');
    expect(resolveImageSrc('/abs/a.png', '/docs')).toBe('/abs/a.png');
  });

  test('相对路径 → 相对文档目录', () => {
    expect(resolveImageSrc('assets/a.png', '/docs')).toBe('/docs/assets/a.png');
    expect(resolveImageSrc('a.png', '/docs')).toBe('/docs/a.png');
  });

  test('未保存文档 + 相对 → null', () => {
    expect(resolveImageSrc('a.png', null)).toBe(null);
  });
});

describe('asset 目录 / markdown 生成', () => {
  test('assetDirName 四模式（spec §4）', () => {
    expect(assetDirName('note', 'assets')).toBe('./assets/');
    expect(assetDirName('note', 'images')).toBe('./images/');
    expect(assetDirName('note', 'docname')).toBe('./note.assets/');
    expect(assetDirName(null, 'docname')).toBe('./untitled.assets/');
    expect(assetDirName('note', 'custom')).toBe('./custom/');
  });

  test('buildImageMarkdown + 转义', () => {
    expect(buildImageMarkdown('assets/a.png', 'alt')).toBe('![alt](assets/a.png)');
    expect(buildImageMarkdown('my file.png')).toBe('![](my%20file.png)');
  });

  test('parseImageSrcFromMarkdown roundtrip', () => {
    expect(parseImageSrcFromMarkdown('![alt](assets/a.png)')).toBe('assets/a.png');
    expect(parseImageSrcFromMarkdown('![](my%20file.png)')).toBe('my file.png');
    expect(parseImageSrcFromMarkdown('plain text')).toBe(null);
  });

  test('isImageFile 扩展名', () => {
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('a.gif')).toBe(true);
    expect(isImageFile('a.svg')).toBe(true);
    expect(isImageFile('a.webp')).toBe(true);
    expect(isImageFile('a.bmp')).toBe(true);
    expect(isImageFile('a.avif')).toBe(true);
    expect(isImageFile('a.tiff')).toBe(true);
    expect(isImageFile('a.md')).toBe(false);
    expect(isImageFile('a.png.bak')).toBe(false);
  });
});
