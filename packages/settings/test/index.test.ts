import {
  SETTINGS_SECTIONS,
  readShortcutOverrides,
  readSetting,
  settingById,
  writeShortcutOverrides,
  writeSetting,
} from '../src/index';

const STORAGE_KEYS = ['mellow.editor.fontSize', 'mellow.editor.lineNumbers', 'mellow.locale', 'mellow.shortcuts.overrides'];

afterEach(() => {
  STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
});

describe('Settings schema', () => {
  test('ships exactly the top-level sections (PRD §91; P2-2.6: files 归一 + updater 并入 general)', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      'general',
      'editor',
      'markdown',
      'files',
      'image',
      'appearance',
      'export',
      'shortcuts',
      'extensions',
      'advanced',
    ]);
  });

  test('P2-2.6: updater items live under general with stable storage keys', () => {
    expect(settingById('general.updater.channel')?.storageKey).toBe('mellow.updater.channel');
    expect(settingById('general.updater.checkOnStartup')?.storageKey).toBe('mellow.updater.checkOnStartup');
    expect(settingById('general.updater.checkNow')?.type).toBe('action');
  });

  test('every section has a label and at least one setting', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.labelKey).toBeTruthy();
      expect(section.settings.length).toBeGreaterThan(0);
    }
  });

  test('setting ids and storage keys are unique', () => {
    const ids = SETTINGS_SECTIONS.flatMap((s) => s.settings.map((x) => x.id));
    const keys = SETTINGS_SECTIONS.flatMap((s) => s.settings.map((x) => x.storageKey)).filter((k) => k !== '');
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('live apply by default: requiresRestart defaults to false', () => {
    for (const section of SETTINGS_SECTIONS) {
      for (const setting of section.settings) {
        expect(setting.requiresRestart ?? false).toBe(false);
      }
    }
  });

  test('settings carry i18n label keys and valid types', () => {
    for (const section of SETTINGS_SECTIONS) {
      for (const setting of section.settings) {
        expect(setting.labelKey.startsWith('settings.')).toBe(true);
        expect(['toggle', 'select', 'number', 'text', 'action']).toContain(setting.type);
      }
    }
  });
});

describe('Settings persistence helpers', () => {
  test('readSetting returns defaultValue when nothing stored', () => {
    const def = settingById('editor.fontSize');
    expect(def?.defaultValue).toBe(17);
    expect(readSetting(def!)).toBe(17);
  });

  test('writeSetting persists and readSetting reads back', () => {
    const def = settingById('editor.fontSize');
    writeSetting(def!, 19);
    expect(readSetting(def!)).toBe(19);
  });

  test('boolean and select round-trip', () => {
    const lineNumbers = settingById('editor.lineNumbers');
    writeSetting(lineNumbers!, false);
    expect(readSetting(lineNumbers!)).toBe(false);

    // E4：Source 模式行号独立开关（默认开，Typora 源码视图行为）
    const sourceLineNumbers = settingById('editor.sourceLineNumbers');
    expect(sourceLineNumbers?.defaultValue).toBe(true);
    writeSetting(sourceLineNumbers!, false);
    expect(readSetting(sourceLineNumbers!)).toBe(false);

    const language = settingById('general.language');
    writeSetting(language!, 'en-US');
    expect(readSetting(language!)).toBe('en-US');
  });

  test('P2-2.6 shortcut overrides round-trip and reject malformed data', () => {
    writeShortcutOverrides({ 'format.bold': { mac: 'Ctrl+B', winLinux: 'Ctrl+Shift+B' } });
    expect(readShortcutOverrides()).toEqual({ 'format.bold': { mac: 'Ctrl+B', winLinux: 'Ctrl+Shift+B' } });

    localStorage.setItem('mellow.shortcuts.overrides', 'not-json');
    expect(readShortcutOverrides()).toEqual({});

    localStorage.setItem('mellow.shortcuts.overrides', JSON.stringify({ bad: 'no', empty: {}, ok: { mac: 'Cmd+K' } }));
    expect(readShortcutOverrides()).toEqual({ ok: { mac: 'Cmd+K' } });
  });
});

describe('P6 — Settings / Theme / Export / Better 契约', () => {
  test('PRD §122 / V4 P6: AI 默认关闭——无持久化开关、无默认开启项、无独立 section', () => {
    // extensions.ai 是纯入口 action：不持久化任何状态、不绑定命令。
    const ai = settingById('extensions.ai');
    expect(ai).toBeDefined();
    expect(ai?.type).toBe('action');
    expect(ai?.storageKey).toBe('');
    expect(ai?.defaultValue).toBe('');
    expect(ai?.applyCommand).toBeUndefined();
    // 全 schema 无 mellow.ai.* 持久化键（disabled / no model / no document upload 天然成立且可回归）。
    const aiKeys = SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((x) => x.storageKey.startsWith('mellow.ai'));
    expect(aiKeys).toEqual([]);
    // AI 页面默认不存在（AI extension 启用后出现），top-level 无独立 ai section。
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('ai');
  });

  test('V4 P6.3: Slash Commands 可发现且与 Typora 对齐（默认启用 + settings toggle）', () => {
    const slash = settingById('markdown.slashCommands');
    expect(slash).toBeDefined();
    expect(slash?.type).toBe('toggle');
    expect(slash?.storageKey).toBe('mellow.slashCommands.enabled'); // 与 App SLASH_ENABLED_KEY 一致（drift 哨兵在 parity harness）
    expect(slash?.defaultValue).toBe(true); // Typora 对齐：默认启用
    expect(slash?.applyCommand).toBe('slash.toggleEnabled');
  });

  test('V4 P6: User CSS 可发现（advanced.userCss 入口 + 双语文案键）', () => {
    const userCss = settingById('advanced.userCss');
    expect(userCss).toBeDefined();
    expect(userCss?.labelKey).toBe('settings.advanced.userCss');
    expect(userCss?.descriptionKey).toBe('settings.advanced.userCssDesc');
    expect(userCss?.labelKey.trim()).not.toBe('');
    expect(userCss?.descriptionKey?.trim()).not.toBe('');
  });
});
