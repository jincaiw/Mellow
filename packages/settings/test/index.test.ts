import {
  SETTINGS_SECTIONS,
  readSetting,
  settingById,
  writeSetting,
} from '../src/index';

const STORAGE_KEYS = ['mellow.editor.fontSize', 'mellow.editor.lineNumbers', 'mellow.locale'];

afterEach(() => {
  STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
});

describe('Settings schema', () => {
  test('ships exactly the top-level sections (PRD §91 + updater)', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      'general',
      'editor',
      'markdown',
      'file',
      'image',
      'appearance',
      'export',
      'shortcuts',
      'extensions',
      'advanced',
      'updater',
    ]);
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

    const language = settingById('general.language');
    writeSetting(language!, 'en-US');
    expect(readSetting(language!)).toBe('en-US');
  });
});
