/**
 * 拖入决策表（Typora `File.onDropFile` 的逐字转写）—— 全行覆盖。
 * 2026-10-07 审计 §4.134。
 */
import {
  decideDropAction,
  dropExtOf,
  IMPORTABLE_DROP_EXTS,
  SUPPORTED_DOC_DROP_EXTS,
  type DropContext,
  type DropPreferences,
} from '../src/dropAction';

/** 默认偏好 = Typora 的默认（三项面板默认分别是 打开 / 打开 / 导入）。 */
const DEFAULTS: DropPreferences = { file: 'open', folder: 'open', import: 'import' };

function ctx(patch: Partial<DropContext> = {}): DropContext {
  return { kind: 'file', ext: '', isKeyWindow: true, isTextBundle: false, supportsTextBundle: false, ...patch };
}

describe('dropAction —— Typora 拖入决策表', () => {
  describe('第 ② 行：目录', () => {
    test('默认（folder=open）⇒ 打开文件夹', () => {
      expect(decideDropAction(ctx({ kind: 'directory' }), DEFAULTS)).toBe('open-folder');
    });
    test('folder=link ⇒ 插链接', () => {
      expect(decideDropAction(ctx({ kind: 'directory' }), { ...DEFAULTS, folder: 'link' })).toBe('insert-link');
    });
    test('目录分支**不受** file/import 两项影响', () => {
      const prefs: DropPreferences = { file: 'link', folder: 'open', import: 'link' };
      expect(decideDropAction(ctx({ kind: 'directory' }), prefs)).toBe('open-folder');
    });
  });

  describe('第 ① 行：`.textbundle`（仅宿主支持时）', () => {
    test('宿主支持 + 是 textbundle ⇒ 走**文件**开关（不是目录开关）', () => {
      const base = ctx({ kind: 'directory', isTextBundle: true, supportsTextBundle: true });
      expect(decideDropAction(base, DEFAULTS)).toBe('open-document');
      expect(decideDropAction(base, { ...DEFAULTS, file: 'link' })).toBe('insert-link');
      // ⚠️ 目录开关**不生效** —— 这一条就是第 ① 行与第 ② 行的区别
      expect(decideDropAction(base, { ...DEFAULTS, folder: 'link' })).toBe('open-document');
    });
    test('宿主**不**支持 textbundle ⇒ 按普通目录处理（Mellow 当前即此）', () => {
      const base = ctx({ kind: 'directory', isTextBundle: true, supportsTextBundle: false });
      expect(decideDropAction(base, DEFAULTS)).toBe('open-folder');
      expect(decideDropAction(base, { ...DEFAULTS, folder: 'link' })).toBe('insert-link');
    });
  });

  describe('第 ③ 行：可导入扩展名', () => {
    test.each([...IMPORTABLE_DROP_EXTS])('%s 默认 ⇒ 导入', (ext) => {
      expect(decideDropAction(ctx({ ext }), DEFAULTS)).toBe('import-document');
    });
    test('import=link ⇒ 插链接', () => {
      expect(decideDropAction(ctx({ ext: 'docx' }), { ...DEFAULTS, import: 'link' })).toBe('insert-link');
    });
    test('大小写不敏感（`DOCX`）', () => {
      expect(decideDropAction(ctx({ ext: 'DOCX' }), DEFAULTS)).toBe('import-document');
    });
    test('可导入优先于受支持文档（`md` 不在可导入表里，反之亦然）', () => {
      expect(IMPORTABLE_DROP_EXTS.filter((e) => SUPPORTED_DOC_DROP_EXTS.includes(e))).toEqual([]);
    });
  });

  describe('第 ④ 行：受支持文档', () => {
    test.each([...SUPPORTED_DOC_DROP_EXTS])('%s 默认 ⇒ 打开文档', (ext) => {
      expect(decideDropAction(ctx({ ext }), DEFAULTS)).toBe('open-document');
    });
    test('file=link ⇒ 插链接', () => {
      expect(decideDropAction(ctx({ ext: 'md' }), { ...DEFAULTS, file: 'link' })).toBe('insert-link');
    });
    test('第 ④ 行**不受** import 开关影响', () => {
      expect(decideDropAction(ctx({ ext: 'md' }), { ...DEFAULTS, import: 'link' })).toBe('open-document');
    });
  });

  describe('第 ⑤ 行：其他文件 ⇒ 插成 Markdown', () => {
    test('未知扩展名 + 窗口可插入 ⇒ 插链接', () => {
      expect(decideDropAction(ctx({ ext: 'png' }), DEFAULTS)).toBe('insert-link');
      expect(decideDropAction(ctx({ ext: 'xyz' }), DEFAULTS)).toBe('insert-link');
    });
    test('无扩展名 ⇒ 插链接', () => {
      expect(decideDropAction(ctx({ ext: '' }), DEFAULTS)).toBe('insert-link');
    });
    test('窗口**不可**插入 ⇒ none（Typora 的 `if (!isKeyWindow()) return false`）', () => {
      expect(decideDropAction(ctx({ ext: 'png', isKeyWindow: false }), DEFAULTS)).toBe('none');
    });
    test('`isKeyWindow=false` **只**影响第 ⑤ 行 —— 目录 / 可导入 / 受支持文档都不受影响', () => {
      const off = { isKeyWindow: false };
      expect(decideDropAction(ctx({ ...off, kind: 'directory' }), DEFAULTS)).toBe('open-folder');
      expect(decideDropAction(ctx({ ...off, ext: 'docx' }), DEFAULTS)).toBe('import-document');
      expect(decideDropAction(ctx({ ...off, ext: 'md' }), DEFAULTS)).toBe('open-document');
    });
    test('第 ⑤ 行**不受**任何开关影响（恒插链接）', () => {
      const all = { file: 'open', folder: 'open', import: 'import' } as DropPreferences;
      const allLink = { file: 'link', folder: 'link', import: 'link' } as DropPreferences;
      expect(decideDropAction(ctx({ ext: 'png' }), all)).toBe('insert-link');
      expect(decideDropAction(ctx({ ext: 'png' }), allLink)).toBe('insert-link');
    });
  });

  describe('dropExtOf —— 按**意图**取扩展名（与 Typora 的正则在无点路径上不同，见实现注释）', () => {
    test.each([
      ['/a/b/c.md', 'md'],
      ['/a/b/c.DOCX', 'docx'],
      ['/a/b.tar.gz', 'gz'],
      ['C:\\a\\b\\c.MD', 'md'],      // 反斜杠路径（Windows）
      ['/a/b/noext', ''],            // ⚠️ Typora 的正则会返回**整条路径**，但分支相同（都落第 ⑤ 行）
      ['/a/.hidden', 'hidden'],      // 点开头的文件名：点后即扩展名（与 Typora 一致）
      ['', ''],
    ])('%s → %s', (p, want) => {
      expect(dropExtOf(p)).toBe(want);
    });
    test('无点路径的结果**不影响分支**（Typora 返回整条路径时同样落第 ⑤ 行）', () => {
      // 这是上面那条差异的「为什么无害」的证明
      expect(decideDropAction(ctx({ ext: dropExtOf('/a/b/noext') }), DEFAULTS)).toBe('insert-link');
      expect(decideDropAction(ctx({ ext: '/a/b/noext' }), DEFAULTS)).toBe('insert-link');
    });
  });

  test('默认偏好 = Typora 的面板默认（open / open / import）', () => {
    // 这一条锁的是「本文件里的 DEFAULTS 与 Typora 一致」；真正的默认值在 settings schema 里，
    // 由 `verify-settings-contract.mjs` 的判据锁（两者必须同值）。
    expect(DEFAULTS).toEqual({ file: 'open', folder: 'open', import: 'import' });
  });
});
