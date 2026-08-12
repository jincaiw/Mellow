import { CommandRegistry, createCommandContext, normalizeShortcut } from '../src';

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
});
