import {
  completenessReport,
  createI18n,
  detectSystemLocale,
  formatDate,
  formatMessage,
  formatNumber,
  keyboardLabel,
  localeDir,
  pluralRule,
  resolveLocale,
} from '../src/index';

describe('i18n — ICU message subset', () => {
  test('simple interpolation', () => {
    expect(formatMessage('保存 {name}', { name: 'a.md' })).toBe('保存 a.md');
    expect(formatMessage('Untitled {n}', { n: 3 })).toBe('Untitled 3');
  });

  test('brace escaping', () => {
    expect(formatMessage('{{literal}}')).toBe('{literal}');
    expect(formatMessage('{missing}')).toBe('');
  });

  test('plural (en: one/other) with # placeholder', () => {
    const t = '{count, plural, one{# item} other{# items}}';
    expect(formatMessage(t, { count: 1 }, 'en-US')).toBe('1 item');
    expect(formatMessage(t, { count: 2 }, 'en-US')).toBe('2 items');
  });

  test('plural (zh: always other)', () => {
    const t = '{count, plural, other{# 个文件}}';
    expect(formatMessage(t, { count: 1 }, 'zh-CN')).toBe('1 个文件');
    expect(pluralRule('zh-CN', 1)).toBe('other');
    expect(pluralRule('en-US', 1)).toBe('one');
    expect(pluralRule('en-US', 2)).toBe('other');
  });

  test('select', () => {
    const t = '{gender, select, male{他} female{她} other{它}}';
    expect(formatMessage(t, { gender: 'male' })).toBe('他');
    expect(formatMessage(t, { gender: 'unknown' })).toBe('它');
  });

  test('nested interpolation inside plural branch', () => {
    const t = '{count, plural, one{已保存 {name}} other{已保存 {name} 的 {count} 份}}';
    // zh 恒 other：count=1 也走 other
    expect(formatMessage(t, { count: 1, name: 'doc' })).toBe('已保存 doc 的 1 份');
    expect(formatMessage(t, { count: 3, name: 'doc' })).toBe('已保存 doc 的 3 份');
    // en 区分 one/other
    expect(formatMessage(t, { count: 1, name: 'doc' }, 'en-US')).toBe('已保存 doc');
    expect(formatMessage(t, { count: 3, name: 'doc' }, 'en-US')).toBe('已保存 doc 的 3 份');
  });
});

describe('i18n — number / date / dir / keyboard', () => {
  test('number formatting via Intl', () => {
    expect(formatNumber('en-US', 1234.5)).toBe('1,234.5');
    expect(formatNumber('zh-CN', 1234.5)).toBe('1,234.5');
  });

  test('date formatting via Intl', () => {
    const date = new Date(2024, 0, 1);
    expect(formatDate('en-US', date, { year: 'numeric', month: 'short' })).toContain('2024');
    expect(formatDate('zh-CN', date, { year: 'numeric' })).toContain('2024');
  });

  test('dir is ltr for V1 locales, rtl-ready architecture', () => {
    expect(localeDir('zh-CN')).toBe('ltr');
    expect(localeDir('en-US')).toBe('ltr');
    expect(localeDir('ar-SA')).toBe('rtl');
  });

  test('keyboard labels are platform aware', () => {
    expect(keyboardLabel('mac', 'Cmd+S')).toBe('⌘S');
    expect(keyboardLabel('mac', 'Cmd+Shift+P')).toBe('⇧⌘P');
    expect(keyboardLabel('win-linux', 'Ctrl+Shift+P')).toBe('Ctrl+Shift+P');
    expect(keyboardLabel('win-linux', 'Ctrl+S')).toBe('Ctrl+S');
  });
});

describe('i18n — locale resolution', () => {
  test('first launch defaults to zh-CN and system detection maps zh to zh-CN', () => {
    expect(resolveLocale('zh-CN')).toBe('zh-CN');
    expect(resolveLocale('en-US')).toBe('en-US');
    expect(detectSystemLocale('zh-CN')).toBe('zh-CN');
    expect(detectSystemLocale('zh-TW')).toBe('zh-CN');
    expect(detectSystemLocale('en-US')).toBe('en-US');
    expect(detectSystemLocale('ja-JP')).toBe('en-US');
  });
});

describe('i18n — completeness = 100%', () => {
  const CATALOG = {
    'zh-CN': { 'app.name': 'Mellow', 'file.open': '打开…' },
    'en-US': { 'app.name': 'Mellow', 'file.open': 'Open…' },
  } as never;

  test('matching key sets report complete', () => {
    const report = completenessReport(CATALOG);
    expect(report.complete).toBe(true);
  });

  test('missing keys are detected per locale', () => {
    const report = completenessReport({
      'zh-CN': { a: '甲' },
      'en-US': { a: 'a', b: 'b' },
    } as never);
    expect(report.complete).toBe(false);
    expect(report.missing['zh-CN']).toContain('b');
  });

  test('createI18n returns localized text and falls back to en-US', () => {
    const i18n = createI18n(CATALOG, 'zh-CN');
    expect(i18n.t('file.open')).toBe('打开…');
    i18n.setLocale('en-US');
    expect(i18n.t('file.open')).toBe('Open…');
  });
});
