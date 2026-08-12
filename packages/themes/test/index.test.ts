import {
  BUILTIN_THEMES,
  DEFAULT_THEME_SETTINGS,
  resolveActiveTheme,
  themeById,
} from '../src/index';

describe('Theme engine — built-in themes', () => {
  test('ships exactly the six required built-in themes with unique ids', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'mellow-light',
      'mellow-dark',
      'paper',
      'git-light',
      'git-dark',
      'newsprint',
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
