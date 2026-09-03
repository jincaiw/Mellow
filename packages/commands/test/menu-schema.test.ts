/**
 * menuSchema 单一真源测试（V4.0 P1-1.1 / P1-1.3 / P1-1.5 验收）。
 * 覆盖：schema 结构不变量、SCHEMA_SHORTCUTS 派生、toNativeMenuSpec 物化
 * （平台过滤 / debugOnly / i18n 解析 / 动态展开 / checkState 解析）。
 */

import {
  MENU_SCHEMA,
  SCHEMA_COMMAND_IDS,
  SCHEMA_SHORTCUTS,
  toNativeMenuSpec,
  type MenuEntry,
  type NativeMenuItem,
} from '../src/menuSchema';
import { TYPOGRAPHIC_MENU_ORDER } from '../src/menuContract';

/** 简易双语翻译表：仅覆盖 schema 实际引用的 labelKey。 */
const zh = (key: string): string => `#${key}`;

function* walk(entries: readonly MenuEntry[]): Generator<MenuEntry> {
  for (const entry of entries) {
    yield entry;
    if (entry.kind === 'submenu') yield* walk(entry.entries);
  }
}

const allEntries = (): MenuEntry[] => MENU_SCHEMA.flatMap((root) => [...walk(root.entries)]);

describe('MENU_SCHEMA 结构不变量', () => {
  test('顶层顺序符合产品合同（app 仅 mac，排在 file 之前）', () => {
    const ids = MENU_SCHEMA.map((root) => root.id);
    expect(ids).toEqual(['app', ...TYPOGRAPHIC_MENU_ORDER]);
    expect(MENU_SCHEMA[0].macOnly).toBe(true);
    expect(MENU_SCHEMA.slice(1).every((root) => !root.macOnly)).toBe(true);
  });

  test('Command ID 只定义一次（submenu 内同名 insert.table 复用同一 id 属合法重复挂载）', () => {
    // 同一 id 允许出现在多个菜单位置（如 insert.table 同时在表格子菜单与段落菜单），
    // 但 accelerator 声明必须唯一 —— 由 SCHEMA_SHORTCUTS 单值 Map 天然保证。
    const counts = new Map<string, number>();
    for (const entry of allEntries()) {
      if (entry.kind === 'command') counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      const withShortcut = allEntries().filter((e) => e.kind === 'command' && e.id === id && e.shortcut !== undefined).length;
      expect({ id, withShortcut, ok: withShortcut <= 1 }).toEqual({ id, withShortcut, ok: true });
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test('每个 command 条目都有 labelKey，每个 submenu 都有 id + labelKey', () => {
    for (const entry of allEntries()) {
      if (entry.kind === 'command') expect(entry.labelKey).toMatch(/^menu\./);
      if (entry.kind === 'submenu') {
        expect(entry.id).not.toEqual('');
        expect(entry.labelKey).toMatch(/^menu\./);
      }
    }
  });

  test('快捷键声明唯一：SCHEMA_SHORTCUTS 每个命令只映射一个三平台键位', () => {
    const commandEntries = allEntries().filter((e): e is Extract<MenuEntry, { kind: 'command' }> => e.kind === 'command' && e.shortcut !== undefined);
    expect(SCHEMA_SHORTCUTS.size).toBe(commandEntries.length);
    // drift canary（护栏锚点）：insert.image Win/Linux = Ctrl+Shift+I（P1-1.8 官方键位）
    expect(SCHEMA_SHORTCUTS.get('insert.image')).toEqual({ mac: 'Cmd+Ctrl+I', winLinux: 'Ctrl+Shift+I' });
    // 平台中性键位 F8/F9（focus/typewriter）
    expect(SCHEMA_SHORTCUTS.get('view.focus.cycle')).toEqual({ mac: 'F8', winLinux: 'F8' });
    expect(SCHEMA_SHORTCUTS.get('view.typewriter.cycle')).toEqual({ mac: 'F9', winLinux: 'F9' });
  });

  test('文件菜单 §7.2：31 槽位顺序契约', () => {
    const fileRoot = MENU_SCHEMA.find((root) => root.id === 'file');
    expect(fileRoot).toBeDefined();
    const slots = (fileRoot as NonNullable<typeof fileRoot>).entries.map((entry): string => {
      if (entry.kind === 'separator') return '---';
      if (entry.kind === 'submenu') return `[${entry.id}]`;
      if (entry.kind === 'dynamic') return '<dynamic>';
      if (entry.kind === 'predefined') return `(${entry.predefined})`;
      return entry.id;
    });
    expect(slots).toEqual([
      'file.new', 'file.newWindow', 'file.newTab', '---',
      'file.open', '[file.recent]', 'quickOpen.open', 'workspace.openFolder', '---',
      'file.info', 'file.revealInFileList', 'file.revealInFileTree', 'file.revealInFinder', '---',
      'file.moveTo', 'file.trash', '---',
      'tabs.close', 'file.closeAll', '---',
      'file.save', 'file.saveAs', 'file.saveAll', 'file.reloadFromDisk', '---',
      'file.import', '[file.export]', 'file.pageSetup', 'file.print', '---',
      'file.openSnapshotsFolder',
    ]);
    expect(slots.length).toBe(31);
  });

  test('主题菜单是 dynamic 占位（Rust 无主题列表的结构前提）', () => {
    const themeRoot = MENU_SCHEMA.find((root) => root.id === 'theme');
    expect(themeRoot?.entries[0]).toEqual({ kind: 'dynamic', dynamic: 'themes' });
    const rustMenuless = SCHEMA_COMMAND_IDS.has('theme.apply.mellow-light');
    expect(rustMenuless).toBe(false); // 主题命令 id 是动态生成的，不在静态 schema
  });
});

describe('toNativeMenuSpec 物化', () => {
  const base = {
    debug: false,
    translate: zh,
    recentFiles: [] as string[],
    themes: [
      { id: 'mellow-light', name: 'Mellow Light' },
      { id: 'mellow-dark', name: 'Mellow Dark' },
    ],
    activeThemeId: 'mellow-light',
    themeMode: 'light',
    spellcheck: true,
    smartPunct: false,
  };

  test('mac 平台：含 app 菜单，accelerator 取 mac 键位', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    expect(spec.menus.map((m) => m.id)).toEqual(['app', 'file', 'edit', 'paragraph', 'format', 'view', 'theme', 'window', 'help']);
    const file = spec.menus.find((m) => m.id === 'file');
    const newFile = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'file.new');
    expect(newFile).toMatchObject({ id: 'file.new', label: '#menu.file.new', accel: 'Cmd+N' });
    // export.repeat 仅 Win/Linux 有 accelerator，mac 无
    const exportRepeat = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.top.export')
      ?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'export.repeat');
    expect(exportRepeat?.accel).toBeUndefined();
  });

  test('win-linux 平台：过滤 app 菜单与 macOnly 条目，accelerator 取 winLinux 键位', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'win-linux' });
    expect(spec.menus.map((m) => m.id)).toEqual(TYPOGRAPHIC_MENU_ORDER);
    const file = spec.menus.find((m) => m.id === 'file');
    const newFile = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'file.new');
    expect(newFile?.accel).toBe('Ctrl+N');
    // export.repeat Win/Linux = Ctrl+E
    const exportRepeat = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.top.export')
      ?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'export.repeat');
    expect(exportRepeat?.accel).toBe('Ctrl+E');
  });

  test('debugOnly 条目：debug=false 不装配，debug=true 装配', () => {
    const viewItems = (platform: 'mac' | 'win-linux', debug: boolean) =>
      toNativeMenuSpec({ ...base, platform, debug }).menus.find((m) => m.id === 'view')!.items
        .filter((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command').map((i) => i.id);
    expect(viewItems('mac', false)).not.toContain('view.devtools');
    expect(viewItems('mac', true)).toContain('view.devtools');
  });

  test('动态 recent-files：路径展开为 recent.file::<path>，label 取 basename', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac', recentFiles: ['/Users/a/docs/笔记.md', '/tmp/x.md'] });
    const recent = spec.menus.find((m) => m.id === 'file')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.file.recent')!;
    const ids = recent.items.map((i) => (i.type === 'command' ? i.id : i.type));
    expect(ids).toEqual(['tabs.reopenClosed', 'recent.file::/Users/a/docs/笔记.md', 'recent.file::/tmp/x.md', 'separator', 'recent.clear']);
    const first = recent.items[1] as Extract<NativeMenuItem, { type: 'command' }>;
    expect(first).toMatchObject({ id: 'recent.file::/Users/a/docs/笔记.md', label: '笔记.md' });
  });

  test('动态 themes：从 Theme Registry 派生 radio，选中态跟随 activeThemeId', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    const themeItems = spec.menus.find((m) => m.id === 'theme')!.items
      .filter((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command');
    expect(themeItems[0]).toMatchObject({ id: 'theme.apply.mellow-light', label: 'Mellow Light', checked: true });
    expect(themeItems[1]).toMatchObject({ id: 'theme.apply.mellow-dark', checked: false });
    const system = themeItems.find((i) => i.id === 'theme.mode.system');
    expect(system?.checked).toBe(false);
  });

  test('checkState：spellcheck/smartPunct/themeModeSystem 三来源解析', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac', themeMode: 'system', spellcheck: false, smartPunct: true });
    const editItems = spec.menus.find((m) => m.id === 'edit')!.items
      .filter((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu');
    const spellToggle = editItems.find((i) => i.label === '#menu.edit.spellMenu')!.items[0] as Extract<NativeMenuItem, { type: 'command' }>;
    const punctToggle = editItems.find((i) => i.label === '#menu.edit.replaceMenu')!.items[0] as Extract<NativeMenuItem, { type: 'command' }>;
    expect(spellToggle).toMatchObject({ id: 'edit.spellcheck.toggle', checked: false });
    expect(punctToggle).toMatchObject({ id: 'edit.smartPunctuation.toggle', checked: true });
    const themeSystem = spec.menus.find((m) => m.id === 'theme')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'theme.mode.system');
    expect(themeSystem?.checked).toBe(true);
  });

  test('predefined 条目携带本地化文案且无 id（OS 提供行为）', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    const edit = spec.menus.find((m) => m.id === 'edit')!.items;
    expect(edit[0]).toEqual({ type: 'predefined', predefined: 'undo', label: '#menu.top.undo' });
    // separator 直通
    expect(edit[2]).toEqual({ type: 'separator' });
  });
});

describe('SCHEMA_COMMAND_IDS', () => {
  test('包含 §7.2 文件菜单全部静态命令 id', () => {
    for (const id of ['file.new', 'file.newWindow', 'file.revealInFileList', 'file.pageSetup', 'file.print', 'file.openSnapshotsFolder']) {
      expect(SCHEMA_COMMAND_IDS.has(id)).toBe(true);
    }
  });

  test('不包含动态项前缀', () => {
    expect([...SCHEMA_COMMAND_IDS].every((id) => !id.startsWith('recent.file::') && !id.startsWith('theme.apply.'))).toBe(true);
  });
});
