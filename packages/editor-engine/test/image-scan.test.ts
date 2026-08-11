/**
 * Image 引用扫描（spec image-workflow §6/§7）。
 */

import { scanImageRefs, isDownloadableUrl, isRemoteSrc, remoteFileName, isWithinDir } from '../src/image/scan';

describe('scanImageRefs', () => {
  const DOC_DIR = '/Users/jason/docs';
  const ASSET = '/Users/jason/docs/assets';

  test('本地相对路径（asset 内/外）、远程、data 分类', () => {
    const text = [
      '![a](./assets/a.png)',
      '![b](../imgs/b.jpg)',
      '![c](https://example.com/c.png)',
      '![d](data:image/png;base64,AAA)',
      '![e](/abs/e.gif)',
    ].join('\n');
    const refs = scanImageRefs(text, DOC_DIR, ASSET);
    expect(refs).toHaveLength(5);
    expect(refs[0]).toMatchObject({ kind: 'local', inAssetDir: true, absolutePath: '/Users/jason/docs/assets/a.png' });
    expect(refs[1]).toMatchObject({ kind: 'local', inAssetDir: false, absolutePath: '/Users/jason/imgs/b.jpg' });
    expect(refs[2]).toMatchObject({ kind: 'remote', downloadable: true, absolutePath: null });
    expect(refs[3]).toMatchObject({ kind: 'remote', downloadable: false });
    expect(refs[4]).toMatchObject({ kind: 'local', absolutePath: '/abs/e.gif' });
  });

  test('位置 from/to 与 alt 提取', () => {
    const text = 'before ![alt text](./x.png) after';
    const refs = scanImageRefs(text, DOC_DIR, null);
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(text.slice(r.from, r.to)).toBe('![alt text](./x.png)');
    expect(r.alt).toBe('alt text');
  });

  test('中文/空格/#/% 路径保留（src 反转义）', () => {
    const text = '![中文 名](./图片 目录/照 片.png)';
    const refs = scanImageRefs(text, DOC_DIR, null);
    expect(refs[0].src).toBe('./图片 目录/照 片.png');
    expect(refs[0].absolutePath).toBe('/Users/jason/docs/图片 目录/照 片.png');
  });

  test('转义 src（%20/%23 等）正确反转义', () => {
    const text = '![](./a%20b%23c.png)';
    const refs = scanImageRefs(text, DOC_DIR, null);
    expect(refs[0].src).toBe('./a b#c.png');
  });

  test('未保存文档（docDir null）：相对无法解析', () => {
    const refs = scanImageRefs('![](./a.png)', null, null);
    expect(refs[0].absolutePath).toBeNull();
    expect(refs[0].kind).toBe('local');
  });

  test('Windows drive 绝对路径本地判定', () => {
    const refs = scanImageRefs('![](C:\\pics\\a.png)', null, null);
    expect(refs[0]).toMatchObject({ kind: 'local', absolutePath: 'C:/pics/a.png' });
  });

  test('assetDirAbs 为 null 时 inAssetDir 全 false', () => {
    const refs = scanImageRefs('![](./assets/a.png)', DOC_DIR, null);
    expect(refs[0].inAssetDir).toBe(false);
  });

  test('无图片 → 空数组', () => {
    expect(scanImageRefs('plain text ![not closed](x', DOC_DIR, ASSET)).toHaveLength(0);
    expect(scanImageRefs('', DOC_DIR, ASSET)).toHaveLength(0);
  });
});

describe('远程分类工具', () => {
  test('isDownloadableUrl 仅 http/https', () => {
    expect(isDownloadableUrl('https://a.com/x.png')).toBe(true);
    expect(isDownloadableUrl('http://a.com/x.png')).toBe(true);
    expect(isDownloadableUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isDownloadableUrl('mailto:a@b.com')).toBe(false);
  });

  test('isRemoteSrc', () => {
    expect(isRemoteSrc('https://a.com/x.png')).toBe(true);
    expect(isRemoteSrc('./x.png')).toBe(false);
    expect(isRemoteSrc('C:/x.png')).toBe(false);
  });

  test('remoteFileName 去 query/hash/目录', () => {
    expect(remoteFileName('https://a.com/b/c.png?raw=1#x')).toBe('c.png');
    expect(remoteFileName('https://a.com/')).toBe('image');
    expect(remoteFileName('https://a.com/中文 名.png')).toBe('中文 名.png');
  });
});

describe('isWithinDir', () => {
  test('边界与分隔符', () => {
    expect(isWithinDir('/a/b/c.png', '/a/b')).toBe(true);
    expect(isWithinDir('/a/bc.png', '/a/b')).toBe(false); // 前缀陷阱
    expect(isWithinDir('/a/b', '/a/b')).toBe(true);
    expect(isWithinDir('C:/a/b.png', 'C:/a')).toBe(true);
    expect(isWithinDir('/a/b/c.png', '/a/b/')).toBe(true);
  });
});
