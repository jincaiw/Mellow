import { CommandRegistry, CommandPaletteModel, commandPaletteSearch, createCommandContext, normalizeShortcut, slashCommandSearch } from '../src';

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

  test('shortcut lookup normalizes shifted key variants (⇧⌘= / ⇧⌘-)', () => {
    // macOS：Cmd 修饰下 event.key 返回 base key（'=' / '-'）；Win/Linux：Shift 修饰产生 '+' / '_'。
    // key '+' 自身不能被普通 split('+') 吞掉（'Ctrl+Shift++' 的尾 '+' 是 key）。
    const registry = new CommandRegistry();
    registry.register({
      id: 'view.zoomIn',
      title: { zh: '放大', en: 'Zoom In' },
      category: 'view',
      shortcut: { mac: 'Cmd+Shift+=', winLinux: 'Ctrl+Shift+=' },
      context: { scope: 'global' },
      enabled: () => true,
      execute: jest.fn(),
    });
    registry.register({
      id: 'view.zoomOut',
      title: { zh: '缩小', en: 'Zoom Out' },
      category: 'view',
      shortcut: { mac: 'Cmd+Shift+-', winLinux: 'Ctrl+Shift+-' },
      context: { scope: 'global' },
      enabled: () => true,
      execute: jest.fn(),
    });

    expect(normalizeShortcut('Cmd+Shift+=')).toBe('Cmd+Shift+=');
    expect(normalizeShortcut('Ctrl+Shift++')).toBe('Ctrl+Shift+=');
    expect(normalizeShortcut('Cmd+Shift+-')).toBe('Cmd+Shift+-');
    expect(normalizeShortcut('Ctrl+Shift+_')).toBe('Ctrl+Shift+-');
    expect(registry.findByShortcut('Cmd+Shift+=', 'mac')?.id).toBe('view.zoomIn');
    expect(registry.findByShortcut('Ctrl+Shift++', 'win-linux')?.id).toBe('view.zoomIn');
    expect(registry.findByShortcut('Cmd+Shift+-', 'mac')?.id).toBe('view.zoomOut');
    expect(registry.findByShortcut('Ctrl+Shift+_', 'win-linux')?.id).toBe('view.zoomOut');
  });

  test('shortcut aliases resolve to the same command (⌥⌘F 主 + ⌘H 别名)', () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'search.replace',
      title: { zh: '替换', en: 'Replace' },
      category: 'edit',
      shortcut: { mac: 'Cmd+Alt+F', winLinux: 'Ctrl+H' },
      shortcutAliases: [{ mac: 'Cmd+H' }],
      context: { scope: 'global' },
      enabled: () => true,
      execute: jest.fn(),
    });

    expect(registry.findByShortcut('Cmd+Alt+F', 'mac')?.id).toBe('search.replace');
    expect(registry.findByShortcut('Cmd+H', 'mac')?.id).toBe('search.replace');
    expect(registry.findByShortcut('Ctrl+H', 'win-linux')?.id).toBe('search.replace');
    // 别名不串平台：win-linux 不认 Cmd+H
    expect(registry.findByShortcut('Cmd+H', 'win-linux')).toBeUndefined();
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

  test('slash command search only returns slash-presented commands and honors disabled ids', () => {
    const registry = new CommandRegistry();
    registry.register({ id: 'format.heading', localizedTitle: { zh: '标题', en: 'Heading' }, category: 'format', context: { scope: 'document' }, presentation: { slash: { aliases: ['h1', 'biaoti'] } }, enabled: () => true, execute: jest.fn() });
    registry.register({ id: 'file.save', localizedTitle: { zh: '保存', en: 'Save' }, category: 'file', context: { scope: 'document' }, enabled: () => true, execute: jest.fn() });
    registry.register({ id: 'insert.mermaid', localizedTitle: { zh: 'Mermaid 图表', en: 'Mermaid Diagram' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['diagram'] } }, enabled: () => true, execute: jest.fn() });

    const context = createCommandContext({ source: 'slash' });
    expect(slashCommandSearch(registry.all(), 'bt', context, 'zh').map((item) => item.command.id)).toEqual(['format.heading']);
    expect(slashCommandSearch(registry.all(), 'save', context, 'en')).toEqual([]);
    expect(slashCommandSearch(registry.all(), 'merm', context, 'en', { disabledIds: ['insert.mermaid'] })[0].enabled).toBe(false);
  });
});
