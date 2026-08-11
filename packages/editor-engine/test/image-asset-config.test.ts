/**
 * Asset 目录配置（PRD §53：global + per-document YAML）。
 */

import {
  extractFrontMatter,
  parseFrontMatterAssetDir,
  resolveAssetDirSetting,
  assetDirRelative,
  assetDirAbsolute,
  normalizeSetting,
} from '../src/image/assetConfig';

describe('front matter 提取', () => {
  test('标准 front matter', () => {
    const text = '---\ntitle: hello\nasset_dir: images\n---\n# Body';
    expect(extractFrontMatter(text)).toBe('title: hello\nasset_dir: images');
  });

  test('无 front matter / 不完整', () => {
    expect(extractFrontMatter('# No FM')).toBeNull();
    expect(extractFrontMatter('---\ntitle: x')).toBeNull(); // 未闭合
    expect(extractFrontMatter('')).toBeNull();
  });

  test('CRLF 与尾部 --- 换行', () => {
    const text = '---\r\nasset_dir: assets\r\n---\r\nbody';
    expect(extractFrontMatter(text)).toBe('asset_dir: assets');
  });
});

describe('asset_dir 解析', () => {
  test('关键字', () => {
    expect(parseFrontMatterAssetDir('asset_dir: images')).toBe('images');
    expect(parseFrontMatterAssetDir('asset_dir: docname')).toBe('docname');
    expect(parseFrontMatterAssetDir('asset_dir: assets')).toBe('assets');
  });

  test('custom 路径与引号/注释', () => {
    expect(parseFrontMatterAssetDir('asset_dir: ./my-images')).toBe('./my-images');
    expect(parseFrontMatterAssetDir('asset_dir: "my dir"')).toBe('my dir');
    expect(parseFrontMatterAssetDir('asset_dir: pics # 注释')).toBe('pics');
    expect(parseFrontMatterAssetDir('title: x')).toBeNull();
    expect(parseFrontMatterAssetDir('asset_dir:')).toBeNull();
  });
});

describe('配置解析（优先级 frontMatter > global > 默认）', () => {
  test('优先级', () => {
    expect(resolveAssetDirSetting({ global: 'images', frontMatter: 'docname' })).toBe('docname');
    expect(resolveAssetDirSetting({ global: 'images', frontMatter: null })).toBe('images');
    expect(resolveAssetDirSetting({ global: null, frontMatter: null })).toBe('assets');
  });

  test('normalizeSetting 关键字 vs custom', () => {
    expect(normalizeSetting('images')).toBe('images');
    expect(normalizeSetting('my-dir')).toBe('my-dir');
  });
});

describe('asset 目录路径（spec §4）', () => {
  test('相对路径', () => {
    expect(assetDirRelative('/Users/jason/note.md', 'assets')).toBe('./assets/');
    expect(assetDirRelative('/Users/jason/note.md', 'docname')).toBe('./note.assets/');
    expect(assetDirRelative('/Users/jason/note.md', 'images')).toBe('./images/');
    expect(assetDirRelative(null, 'docname')).toBe('./untitled.assets/');
  });

  test('绝对路径', () => {
    expect(assetDirAbsolute('/Users/jason/note.md', 'assets')).toBe('/Users/jason/assets');
    expect(assetDirAbsolute('/Users/jason/note.md', 'docname')).toBe('/Users/jason/note.assets');
    expect(assetDirAbsolute('/Users/jason/note.md', './sub')).toBe('/Users/jason/sub');
    expect(assetDirAbsolute('/Users/jason/note.md', '/abs/dir')).toBe('/abs/dir');
    expect(assetDirAbsolute('/Users/jason/note.md', 'C:/pics')).toBe('C:/pics');
    expect(assetDirAbsolute(null, 'assets')).toBeNull(); // 未保存文档
    expect(assetDirAbsolute('/Users/jason/note.md', '/abs/dir/')).toBe('/abs/dir');
  });
});
