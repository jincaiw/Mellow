import {
  BUILTIN_THEMES,
  DEFAULT_THEME_SETTINGS,
  allThemes,
  parseUserThemeCss,
  registerUserThemes,
  resolveActiveTheme,
  themeById,
} from '../src/index';

describe('Theme engine — built-in themes', () => {
  test('ships the complete built-in theme registry with unique ids', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'mellow-light',
      'mellow-dark',
      'paper',
      'git-light',
      'git-dark',
      'newsprint',
      'whitey',
      'gothic',
    ]));
  });

  test('light/dark classification', () => {
    const byId = Object.fromEntries(BUILTIN_THEMES.map((t) => [t.id, t]));
    expect(byId['mellow-light'].kind).toBe('light');
    expect(byId['mellow-dark'].kind).toBe('dark');
    expect(byId['paper'].kind).toBe('light');
    expect(byId['git-light'].kind).toBe('light');
    expect(byId['git-dark'].kind).toBe('dark');
    expect(byId['newsprint'].kind).toBe('light');
    expect(byId['whitey'].kind).toBe('light');
    expect(byId['gothic'].kind).toBe('dark');
  });

  test('every theme defines core CSS variable tokens and editor theme mapping', () => {
    for (const theme of BUILTIN_THEMES) {
      expect(theme.variables['--mellow-bg']).toBeTruthy();
      expect(theme.variables['--mellow-fg']).toBeTruthy();
      expect(theme.variables['--mellow-border']).toBeTruthy();
      expect(theme.variables['--mellow-accent']).toBeTruthy();
      expect(theme.editorTheme).toBeTruthy();
    }
  });

  test('themeById resolves and unknown id returns undefined', () => {
    expect(themeById('paper')?.name).toBe('Paper');
    expect(themeById('nope')).toBeUndefined();
  });
});

describe('Theme engine — resolveActiveTheme', () => {
  test('system mode follows prefers-color-scheme', () => {
    const settings = DEFAULT_THEME_SETTINGS;
    expect(resolveActiveTheme(settings, false).id).toBe('mellow-light');
    expect(resolveActiveTheme(settings, true).id).toBe('mellow-dark');
  });

  test('manual light/dark modes override system preference', () => {
    expect(resolveActiveTheme({ ...DEFAULT_THEME_SETTINGS, mode: 'light' }, true).id).toBe('mellow-light');
    expect(resolveActiveTheme({ ...DEFAULT_THEME_SETTINGS, mode: 'dark' }, false).id).toBe('mellow-dark');
  });

  test('separate light/dark slots are honored', () => {
    const settings = {
      mode: 'system' as const,
      lightThemeId: 'paper',
      darkThemeId: 'git-dark',
    };
    expect(resolveActiveTheme(settings, false).id).toBe('paper');
    expect(resolveActiveTheme(settings, true).id).toBe('git-dark');
  });

  test('falls back to defaults for unknown theme ids', () => {
    expect(resolveActiveTheme({ ...DEFAULT_THEME_SETTINGS, lightThemeId: 'nope' }, false).id).toBe('mellow-light');
    expect(resolveActiveTheme({ ...DEFAULT_THEME_SETTINGS, darkThemeId: 'nope' }, true).id).toBe('mellow-dark');
  });
});

describe('Theme engine — user themes (Typora themes folder semantics)', () => {
  afterEach(() => {
    registerUserThemes([]);
  });

  test('parseUserThemeCss derives id/name from file name and defaults to light', () => {
    const theme = parseUserThemeCss('my-white.css', '.mellow-reader h1 { color: #111; }');
    expect(theme.id).toBe('user/my-white');
    expect(theme.name).toBe('my-white');
    expect(theme.kind).toBe('light');
    expect(theme.editorTheme).toBe('minimal-light');
    expect(theme.themeCss).toContain('.mellow-reader h1');
  });

  test('parseUserThemeCss auto-detects dark from --mellow-bg luminance', () => {
    const theme = parseUserThemeCss('night.css', ':root { --mellow-bg: #17141f; --mellow-fg: #dddddd; }');
    expect(theme.kind).toBe('dark');
    expect(theme.editorTheme).toBe('minimal-dark');
    expect(theme.variables['--mellow-fg']).toBe('#dddddd');
    // 未声明的 token 回退暗色基础板
    expect(theme.variables['--mellow-bg-elevated']).toBe('#252526');
  });

  test('parseUserThemeCss meta comment overrides name and kind', () => {
    const theme = parseUserThemeCss(
      'plain.css',
      '/* mellow-theme: name=我的主题 kind=dark */\n:root { --mellow-bg: #ffffff; }',
    );
    expect(theme.name).toBe('我的主题');
    expect(theme.kind).toBe('dark');
  });

  test('registerUserThemes makes themes resolvable and replaceable', () => {
    const theme = parseUserThemeCss('a.css', ':root { --mellow-bg: #101010; }');
    registerUserThemes([theme]);
    expect(themeById('user/a')).toBe(theme);
    expect(allThemes().map((t) => t.id)).toContain('user/a');
    expect(resolveActiveTheme({ ...DEFAULT_THEME_SETTINGS, mode: 'dark', darkThemeId: 'user/a' }, false).id).toBe('user/a');
    // 重注册替换旧集合（不残留）
    registerUserThemes([]);
    expect(themeById('user/a')).toBeUndefined();
  });
});
