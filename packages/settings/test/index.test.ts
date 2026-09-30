import {
  SETTINGS_SECTIONS,
  readShortcutOverrides,
  readSetting,
  restoreAllSettingsDefaults,
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
    // V5-D3：默认字号对齐 Typora Github 主题真值 16px
    expect(def?.defaultValue).toBe(16);
    expect(readSetting(def!)).toBe(16);
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
    // extensions.ai 是入口 action：**不持久化任何状态**（这才是 PRD §122 的不变量）。
    const ai = settingById('extensions.ai');
    expect(ai).toBeDefined();
    expect(ai?.type).toBe('action');
    expect(ai?.storageKey).toBe('');
    expect(ai?.defaultValue).toBe('');
    // ⚠️ 2026-09-30 审计修正：此处原为 `expect(ai?.applyCommand).toBeUndefined()`
    // （注释「不绑定命令」）。那条断言**把「点了没反应的按钮」写成了契约** ——
    // SettingsPanel 对 action 型一律渲染「打开」按钮且只调用 applySetting(def, true)，
    // 无 applyCommand 即静默 no-op（applySetting 的 switch 落 default）。
    // PRD §122 要的是「不持久化 AI 状态」（上一条），不是「按钮不许做事」。
    // 现改为断言**必须绑定命令**，跨层「命令真的有对应 case」由 parity 护栏守。
    expect(ai?.applyCommand).toBe('extensions.list');
    // 全 schema 无 mellow.ai.* 持久化键（disabled / no model / no document upload 天然成立且可回归）。
    const aiKeys = SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((x) => x.storageKey.startsWith('mellow.ai'));
    expect(aiKeys).toEqual([]);
    // AI 页面默认不存在（AI extension 启用后出现），top-level 无独立 ai section。
    expect(SETTINGS_SECTIONS.map((s) => s.id)).not.toContain('ai');
  });

  // 2026-09-30 审计新增：action 型**必须绑定命令**，且**不得持久化**。
  // 渲染层对 action 只调用 applySetting → 无命令 = 死按钮；有 storageKey = 写了无人读的值。
  test('action 型设置：必须绑定 applyCommand 且不得带 storageKey', () => {
    const actions = SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((x) => x.type === 'action');
    expect(actions.length).toBeGreaterThan(0);
    for (const def of actions) {
      expect({ id: def.id, applyCommand: def.applyCommand }).toEqual({ id: def.id, applyCommand: expect.any(String) });
      expect({ id: def.id, storageKey: def.storageKey }).toEqual({ id: def.id, storageKey: '' });
    }
    // 反向：值型设置必须有存储键，否则值无处安放（曾出现 storageKey 为空的 text 输入框）。
    for (const def of SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((x) => x.type !== 'action')) {
      expect({ id: def.id, storageKey: def.storageKey === '' }).toEqual({ id: def.id, storageKey: false });
    }
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

// 2026-09-30：Typora 偏好面板「重置高级设置」的对标 —— 全量恢复默认。
describe('restoreAllSettingsDefaults', () => {
  const NON_ACTION = SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((d) => d.storageKey !== '');

  test('清掉所有值型设置项的存储键，且逐项 apply 默认值', () => {
    const fontSize = settingById('editor.fontSize');
    const lineNumbers = settingById('editor.lineNumbers');
    expect(fontSize).toBeDefined();
    expect(lineNumbers).toBeDefined();
    writeSetting(fontSize as never, 20);
    writeSetting(lineNumbers as never, true);
    expect(readSetting(fontSize as never)).toBe(20);

    const applied: Array<[string, unknown]> = [];
    const n = restoreAllSettingsDefaults((def, value) => applied.push([def.id, value]));

    // ① 存储键被清除 → 读时回落默认值（不是「写入 defaultValue」，是**删除**）
    expect(localStorage.getItem(fontSize?.storageKey as string)).toBeNull();
    expect(readSetting(fontSize as never)).toBe(fontSize?.defaultValue);
    expect(readSetting(lineNumbers as never)).toBe(lineNumbers?.defaultValue);
    // ② 每一项都被 apply 了默认值，且数量 == 值型设置项数（不漏项）
    expect(n).toBe(NON_ACTION.length);
    expect(applied).toHaveLength(NON_ACTION.length);
    for (const [id, value] of applied) {
      expect(value).toBe(settingById(id)?.defaultValue);
    }
  });

  test('跳过入口型 action（storageKey 为空）—— apply 会触发副作用，不得被调用', () => {
    const actions = SETTINGS_SECTIONS.flatMap((s) => s.settings).filter((d) => d.type === 'action');
    expect(actions.length).toBeGreaterThan(0); // 前提：确实存在 action 型（否则本测试是空壳）
    const seen: string[] = [];
    restoreAllSettingsDefaults((def) => seen.push(def.id));
    for (const def of actions) {
      expect(seen).not.toContain(def.id);
    }
  });

  test('不触碰快捷键 override 层（那是独立 override，且已有逐项恢复）', () => {
    writeShortcutOverrides({ 'file.save': { mac: 'Cmd+Shift+S' } });
    restoreAllSettingsDefaults(() => { /* noop */ });
    expect(readShortcutOverrides()['file.save']?.mac).toBe('Cmd+Shift+S');
    localStorage.removeItem('mellow.shortcuts.overrides');
  });
});
