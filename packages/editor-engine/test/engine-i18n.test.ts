/**
 * ADR-0028：引擎侧 UI 文案目录 + locale 桥。
 *
 * 立此测试的原因：引擎运行在**独立 iframe**，宿主的 i18n 到不了 —— 引擎自己渲染的文案
 * （查找面板 / 格式工具栏 / 表格工具栏 / 图片操作提示）必须自带目录 + 由宿主经桥注入 locale。
 * 实测缺口见审计 §4.52 / §4.57（登记 79 条 / 8 文件）。
 */

import {
  ENGINE_DEFAULT_LOCALE,
  ENGINE_MESSAGES,
  ENGINE_LOCALE_STORAGE_KEY,
  getEngineLocale,
  installEngineLocaleBridge,
  setEngineLocale,
  tEngine,
} from '../src/engineI18n';

describe('engine i18n — 目录', () => {
  test('默认 locale 为 zh-CN（ADR-0028 Q3=C1：未接桥 = 原行为）', () => {
    expect(ENGINE_DEFAULT_LOCALE).toBe('zh-CN');
  });

  test('每个键的 zh-CN 与 en-US 都非空，且键一律 engine. 前缀', () => {
    const keys = Object.keys(ENGINE_MESSAGES);
    expect(keys.length).toBeGreaterThanOrEqual(76);
    for (const k of keys) {
      expect(k.startsWith('engine.')).toBe(true);
      expect(ENGINE_MESSAGES[k]['zh-CN'].trim()).not.toBe('');
      expect(ENGINE_MESSAGES[k]['en-US'].trim()).not.toBe('');
    }
  });

  test('en-US 不得等于 zh-CN（否则「已翻译」是假的）', () => {
    const same = Object.entries(ENGINE_MESSAGES)
      .filter(([, v]) => v['zh-CN'] === v['en-US'])
      .map(([k]) => k);
    expect(same).toEqual([]);
  });
});

describe('engine i18n — tEngine', () => {
  afterEach(() => setEngineLocale(ENGINE_DEFAULT_LOCALE));

  test('未设 locale 时取 zh-CN', () => {
    expect(tEngine('engine.search.find')).toBe('查找');
    expect(tEngine('engine.table.delete')).toBe('删除表');
  });

  test('设为 en-US 后取英文（含 Typora 一手真值）', () => {
    setEngineLocale('en-US');
    expect(tEngine('engine.search.find')).toBe('Find');            // Typora: Menu.strings
    expect(tEngine('engine.search.caseSensitive')).toBe('Case Sensitive'); // Typora: Front.strings
    expect(tEngine('engine.format.bold')).toBe('Strong');          // Typora: Menu.strings（Strong = 加粗）
    expect(tEngine('engine.table.delete')).toBe('Delete Table');   // Typora: Menu.strings / main.js
  });

  test('未登记的键**回显键名**（界面显示裸键 ⇒ 一眼可辨，不静默空白）', () => {
    expect(tEngine('engine.nope.notHere')).toBe('engine.nope.notHere');
  });

  test('不做插值（引擎侧 79 条文案无一带 {var}；避免空开关）', () => {
    const withVar = Object.entries(ENGINE_MESSAGES)
      .filter(([, v]) => /\{[A-Za-z]/.test(v['zh-CN']) || /\{[A-Za-z]/.test(v['en-US']))
      .map(([k]) => k);
    expect(withVar).toEqual([]);
  });

  test('setEngineLocale 拒绝非法值且不改动当前值', () => {
    setEngineLocale('en-US');
    expect(setEngineLocale('fr-FR')).toBe(false);
    expect(getEngineLocale()).toBe('en-US');
    expect(setEngineLocale(null)).toBe(false);
    expect(getEngineLocale()).toBe('en-US');
  });
});

describe('engine i18n — locale 桥（宿主 → iframe）', () => {
  afterEach(() => {
    setEngineLocale(ENGINE_DEFAULT_LOCALE);
    delete (window as unknown as { __MELLOW_ENGINE_LOCALE__?: unknown }).__MELLOW_ENGINE_LOCALE__;
    localStorage.removeItem(ENGINE_LOCALE_STORAGE_KEY);
  });

  test('装桥后桥可用，set 同时改内存值与 localStorage（时序兜底）', () => {
    installEngineLocaleBridge();
    const bridge = (window as unknown as { __MELLOW_ENGINE_LOCALE__?: { set: (l: string) => void } }).__MELLOW_ENGINE_LOCALE__;
    expect(bridge).toBeDefined();
    bridge?.set('en-US');
    expect(getEngineLocale()).toBe('en-US');
    expect(localStorage.getItem(ENGINE_LOCALE_STORAGE_KEY)).toBe('en-US');
    expect(tEngine('engine.search.find')).toBe('Find');
  });

  test('桥未就绪时从 localStorage 兜底恢复（覆盖「宿主先于引擎注入」的时序）', () => {
    localStorage.setItem(ENGINE_LOCALE_STORAGE_KEY, 'en-US');
    installEngineLocaleBridge();
    expect(getEngineLocale()).toBe('en-US');
  });

  test('装桥幂等（重复调用不覆盖已装桥）', () => {
    installEngineLocaleBridge();
    const first = (window as unknown as { __MELLOW_ENGINE_LOCALE__?: unknown }).__MELLOW_ENGINE_LOCALE__;
    installEngineLocaleBridge();
    expect((window as unknown as { __MELLOW_ENGINE_LOCALE__?: unknown }).__MELLOW_ENGINE_LOCALE__).toBe(first);
  });
});
