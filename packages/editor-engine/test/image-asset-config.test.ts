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

  // 2026-09-13 实机对照 Typora 新增：兼容 Typora 的 YAML 键名。
  // Typora 用户已有文档把图片目录写在 `typora-copy-images-to` 里；
  // 不识别则每篇文档级设置被**静默忽略**，图片落到全局目录 ——
  // 属「看起来能跑、结果不对」的静默偏差，故做键名别名。
  describe('Typora 兼容键 typora-copy-images-to', () => {
    test('可识别 Typora 键并取到路径', () => {
      expect(parseFrontMatterAssetDir('typora-copy-images-to: ./assets')).toBe('./assets');
      expect(parseFrontMatterAssetDir('typora-copy-images-to: images')).toBe('images');
      expect(parseFrontMatterAssetDir('typora-copy-images-to: "my dir"')).toBe('my dir');
    });

    test("Typora 默认形态 ./${filename}.assets 作为 custom 路径处理", () => {
      expect(parseFrontMatterAssetDir('typora-copy-images-to: ./${filename}.assets')).toBe('./${filename}.assets');
    });

    test('两键并存时 Mellow 原生键优先', () => {
      const both = ['---', 'typora-copy-images-to: ./typora-dir', 'asset_dir: images', '---'].join('\n');
      const fm = extractFrontMatter(both);
      expect(fm).not.toBeNull();
      expect(parseFrontMatterAssetDir(fm as string)).toBe('images');
    });

    test('仅 Typora 键时生效（原生键缺失的回退路径）', () => {
      const onlyTypora = ['---', 'title: doc', 'typora-copy-images-to: ./pics', '---'].join('\n');
      const fm = extractFrontMatter(onlyTypora);
      expect(fm).not.toBeNull();
      expect(parseFrontMatterAssetDir(fm as string)).toBe('./pics');
    });

    test('canary：去掉 Typora 键别名后，上述断言会失败', () => {
      // 模拟回退：仅保留原生键
      const nativeOnly = (fm: string) => /^\s*asset_dir\s*:\s*(.*)$/m.exec(fm);
      expect(nativeOnly('typora-copy-images-to: ./assets')).toBeNull();
    });
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
