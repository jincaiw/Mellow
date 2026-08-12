import { CommandRegistry, CommandPaletteModel, commandPaletteSearch, createCommandContext, normalizeShortcut } from '../src';

describe('CommandRegistry', () => {
  test('command contains required fields and every entry dispatches the same execute', async () => {
    const calls: string[] = [];
    const registry = new CommandRegistry();
    registry.register({
      id: 'file.new',
      title: { zh: '新建', en: 'New' },
      category: 'file',
      shortcut: { mac: 'Cmd+N', winLinux: 'Ctrl+N' },
      context: { scope: 'global' },
      enabled: () => true,
      execute: async () => { calls.push('execute'); },
    });

    for (const source of ['menu', 'shortcut', 'command-palette', 'slash', 'context-menu', 'plugin'] as const) {
      await registry.dispatch('file.new', createCommandContext({ source }));
    }

    expect(calls).toEqual(['execute', 'execute', 'execute', 'execute', 'execute', 'execute']);
  });

  test('disabled command is not executed and duplicate id is rejected', async () => {
    const registry = new CommandRegistry();
    const command = {
      id: 'file.save',
      title: { zh: '保存', en: 'Save' },
      category: 'file',
      context: { scope: 'document' as const },
      enabled: () => false,
      execute: jest.fn(),
    };
    registry.register(command);
    expect(() => registry.register(command)).toThrow(/Duplicate command/);
    expect(await registry.dispatch('file.save', createCommandContext({ source: 'menu' }))).toBe(false);
    expect(command.execute).not.toHaveBeenCalled();
  });

  test('shortcut lookup is platform aware and normalizes order', () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'search.global',
      title: { zh: '全局搜索', en: 'Global Search' },
      category: 'search',
      shortcut: { mac: 'Cmd+Shift+F', winLinux: 'Ctrl+Shift+F' },
      context: { scope: 'workspace' },
      enabled: () => true,
      execute: jest.fn(),
    });

    expect(normalizeShortcut('Shift+Ctrl+F')).toBe('Ctrl+Shift+F');
    expect(registry.findByShortcut('shift+ctrl+f', 'win-linux')?.id).toBe('search.global');
    expect(registry.findByShortcut('cmd+shift+f', 'mac')?.id).toBe('search.global');
  });

  test('command palette fuzzy searches localized commands and keeps disabled state', () => {
    const registry = new CommandRegistry();
    registry.register({ id: 'file.save', title: { zh: '保存', en: 'Save' }, category: 'file', shortcut: { mac: 'Cmd+S', winLinux: 'Ctrl+S' }, context: { scope: 'document' }, enabled: () => false, execute: jest.fn() });
    registry.register({ id: 'search.global', title: { zh: '全局搜索', en: 'Global Search' }, category: 'search', shortcut: { mac: 'Cmd+Shift+F', winLinux: 'Ctrl+Shift+F' }, context: { scope: 'workspace' }, enabled: () => true, execute: jest.fn() });

    const zh = commandPaletteSearch(registry.all(), 'qjss', createCommandContext({ source: 'command-palette' }), 'zh', ['file.save']);
    expect(zh[0].command.id).toBe('search.global');
    expect(zh[0].enabled).toBe(true);
    expect(commandPaletteSearch(registry.all(), 'bc', createCommandContext({ source: 'command-palette' }), 'zh')[0].enabled).toBe(false);

    const recent = commandPaletteSearch(registry.all(), '', createCommandContext({ source: 'command-palette' }), 'zh', ['file.save']);
    expect(recent[0].command.id).toBe('file.save');
  });

  test('command palette keyboard only navigation skips disabled on enter', () => {
    const model = new CommandPaletteModel();
    const items = [
      { command: { id: 'a' }, enabled: false, score: 10, title: 'A' },
      { command: { id: 'b' }, enabled: true, score: 9, title: 'B' },
    ] as ReturnType<typeof commandPaletteSearch>;
    expect(model.navigate(items, 'down').selectedIndex).toBe(1);
    expect(model.navigate(items, 'enter')).toEqual({ selectedIndex: 1, commandId: 'b' });
  });
});
