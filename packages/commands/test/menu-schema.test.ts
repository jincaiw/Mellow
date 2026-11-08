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
  test('顶层顺序符合产品合同（app 与 window 仅 mac，其余三平台共有）', () => {
    const ids = MENU_SCHEMA.map((root) => root.id);
    expect(ids).toEqual(['app', ...TYPOGRAPHIC_MENU_ORDER]);
    expect(MENU_SCHEMA[0].macOnly).toBe(true); // app：仅 macOS
    // B3（第四轮）：window 顶层菜单仅 macOS（Typora Windows/Linux 无「窗口」菜单）
    const windowRoot = MENU_SCHEMA.find((r) => r.id === 'window');
    expect(windowRoot?.macOnly).toBe(true);
    const shared = MENU_SCHEMA.filter((r) => r.id !== 'app' && r.id !== 'window');
    expect(shared.every((root) => !root.macOnly)).toBe(true);
  });

  test('Command ID 多槽位合法，但同 id 的 accelerator 声明必须一致（§4.360「六」7b 放宽）', () => {
    // 同一 id 允许出现在多个菜单位置（如 insert.table 同时在表格子菜单与段落菜单；
    // Typora 实机 查找▸ 与 编辑▸跳转组 双槽位同显「跳转到所选内容 [Cmd+J]」）。
    // 原不变量「withShortcut ≤ 1」**过强** —— 它把「单真源」误写成「单槽位」：
    // 真源约束的正确形态 = 同 id 的多处声明必须**逐字段相等**（双处漂移才是缺陷）。
    const counts = new Map<string, number>();
    for (const entry of allEntries()) {
      if (entry.kind === 'command') counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      const shorts = allEntries()
        .filter((e): e is Extract<MenuEntry, { kind: 'command' }> => e.kind === 'command' && e.id === id && e.shortcut !== undefined)
        .map((e) => JSON.stringify(e.shortcut));
      expect([...new Set(shorts)]).toEqual(shorts.length ? [shorts[0]] : []);
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
    // 多槽位同 id（§4.360「六」7b）⇒ Map 按 id 去重，口径 = 「去重后的 id 数」；
    // 「同 id 多处声明必须一致」由上一条不变量锁（两向合起来 = 单真源）。
    const uniqueIds = new Set(commandEntries.map((e) => e.id));
    expect(SCHEMA_SHORTCUTS.size).toBe(uniqueIds.size);
    expect(commandEntries.length - uniqueIds.size).toBe(1); // 当前唯一多槽位对 = edit.gotoSelection
    // drift canary（护栏锚点）：insert.image Win/Linux = Ctrl+Shift+I（P1-1.8 官方键位）
    expect(SCHEMA_SHORTCUTS.get('insert.image')).toEqual({ mac: 'Cmd+Ctrl+I', winLinux: 'Ctrl+Shift+I' });
    // 平台中性键位 F8/F9（focus/typewriter）
    expect(SCHEMA_SHORTCUTS.get('view.focus.cycle')).toEqual({ mac: 'F8', winLinux: 'F8' });
    expect(SCHEMA_SHORTCUTS.get('view.typewriter.cycle')).toEqual({ mac: 'F9', winLinux: 'F9' });
  });

  test('文件菜单 §7.2：槽位顺序契约（B1 修订：去 file.newTab，tabs.close→file.closeWindow；V7-W1.1 增 file.reopenClosed）', () => {
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
      'file.new', 'file.newWindow', '---',
      'file.open', '[file.recent]', 'file.reopenClosed', 'quickOpen.open', 'workspace.openFolder', '---',
      'file.info', 'file.revealInFileList', 'file.revealInFileTree', 'file.revealInFinder', '---',
      'file.trash', '---',
      'file.closeWindow', 'file.closeAll', '---',
      'file.save', 'file.saveAs', 'file.duplicate', 'document.rename', 'file.moveTo', 'file.saveAll', 'file.reloadFromDisk', '---',
      'file.import', '[file.export]', 'file.pageSetup', 'file.print', '---',
      'file.openSnapshotsFolder',
    ]);
    expect(slots.length).toBe(33);
  });

  test('B1：file.newTab / tabs.*（close/closeOthers/closeRight/prev/next/showAll/reopenClosed）不再存在于 schema', () => {
    const banned = ['file.newTab', 'tabs.close', 'tabs.closeOthers', 'tabs.closeRight', 'tabs.reopenClosed', 'tabs.prev', 'tabs.next', 'tabs.showAll'];
    const ids = allEntries().filter((e): e is Extract<MenuEntry, { kind: 'command' }> => e.kind === 'command').map((e) => e.id);
    for (const id of banned) expect(ids).not.toContain(id);
    expect(ids).toContain('file.closeWindow');
    expect(SCHEMA_COMMAND_IDS.has('file.closeWindow')).toBe(true);
    for (const id of banned) expect(SCHEMA_COMMAND_IDS.has(id)).toBe(false);
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
    smartQuotes: false,
    smartDashes: false,
    smartPunctOnRender: false,
  };

  test('mac 平台：含 app 菜单，accelerator 取 mac 键位', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    expect(spec.menus.map((m) => m.id)).toEqual(['app', 'file', 'edit', 'paragraph', 'format', 'view', 'theme', 'window', 'help']);
    const file = spec.menus.find((m) => m.id === 'file');
    const newFile = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'file.new');
    expect(newFile).toMatchObject({ id: 'file.new', label: '#menu.file.new', accel: 'Cmd+N' });
    // §4.360：实机 Typora mac 显示「使用上一次设置导出 [Ctrl+E]」。⚠️「六」7 更正⑤轮误读：
    // dump `[Ctrl+E]` 无 NoCmd 位 ⇒ Cmd 隐含 = ⌃⌘E；原声明 'Ctrl+E' 物化成裸 ⌃E（复 dump
    // 实测 `[NoCmdCtrl+E]`）与基线不符 ⇒ 现声明 'Ctrl+Cmd+E'。（Win/Linux 仍无 accelerator：
    //  Ctrl+E 与 format.selectFormatSpan 冲突的历史裁决继续生效，见下方 win-linux 用例）
    const exportRepeat = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.top.export')
      ?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'export.repeat');
    expect(exportRepeat?.accel).toBe('Ctrl+Cmd+E');
  });

  test('win-linux 平台：过滤 app 与 window（macOnly），accelerator 取 winLinux 键位', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'win-linux' });
    // B3：Windows/Linux 顶层菜单无「窗口」（Typora parity），仅剩 7 组
    expect(spec.menus.map((m) => m.id)).toEqual(TYPOGRAPHIC_MENU_ORDER.filter((id) => id !== 'window'));
    expect(spec.menus.some((m) => m.id === 'window')).toBe(false);
    const file = spec.menus.find((m) => m.id === 'file');
    const newFile = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'file.new');
    expect(newFile?.accel).toBe('Ctrl+N');
    // export.repeat 的 winLinux 快捷键已移除（Ctrl+E 与 format.selectFormatSpan 冲突，
    // 见 verify-menu-contract 快捷键单一真源收口），Win/Linux 仅菜单无 accelerator
    const exportRepeat = file?.items.find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.top.export')
      ?.items.find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'export.repeat');
    expect(exportRepeat?.accel).toBeUndefined();
  });

  test('B1：file.closeAll 仅 Win/Linux 装配；window（mac）菜单无 tabs.prev/next', () => {
    const fileIds = (platform: 'mac' | 'win-linux') => toNativeMenuSpec({ ...base, platform }).menus
      .find((m) => m.id === 'file')!.items
      .filter((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command').map((i) => i.id);
    // §4.360「六」7：mac Typora File 菜单**确有**「全部关闭」（fixture L135 [Opt+W]，
    // AXPosition 探针 = 关闭 的隐藏 ⌥-alternate 同槽 {103,344}）；但 muda 不支持
    // isAlternate ⇒ 无法复现「按 ⌥ 显形」形态，维持 mac 过滤（默认显示面与 Typora 一致）。
    expect(fileIds('mac')).toContain('file.closeWindow');
    expect(fileIds('mac')).not.toContain('file.closeAll');
    expect(fileIds('win-linux')).toContain('file.closeAll');
    // 桌面 UI 对标（审计 §4.359）：窗口菜单三项 = OS predefined（performMiniaturize:/
    // performZoom:/arrangeInFront: 标准 selector）—— AppKit 以标准项为锚点向 windowsMenu
    // 注入「全部最小化 / 全部缩放 / 平铺 / 窗口列表」（Typora 同菜单 47 项的来源）；
    // 自建 command 项不触发注入 ⇒ 本断言同时锁「窗口菜单不得退回 command 形态」。
    const windowItems = toNativeMenuSpec({ ...base, platform: 'mac' }).menus
      .find((m) => m.id === 'window')!.items;
    expect(windowItems.map((i) => i.type)).toEqual(['predefined', 'predefined', 'separator', 'predefined']);
    expect(windowItems.flatMap((i) => (i.type === 'predefined' ? [i.predefined] : [])))
      .toEqual(['minimize', 'maximize', 'bringAllToFront']);
    expect(windowItems.some((i) => i.type === 'command')).toBe(false);
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
    // B1：tabs.reopenClosed 移除后，最近文件子菜单从动态项直接开始
    expect(ids).toEqual(['recent.file::/Users/a/docs/笔记.md', 'recent.file::/tmp/x.md', 'separator', 'recent.clear']);
    const first = recent.items[0] as Extract<NativeMenuItem, { type: 'command' }>;
    expect(first).toMatchObject({ id: 'recent.file::/Users/a/docs/笔记.md', label: '笔记.md' });
  });

  test('动态 recent-files：列表为空时输出禁用占位项 recent.empty（Typora「空」/ No Recent Files）', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac', recentFiles: [] });
    const recent = spec.menus.find((m) => m.id === 'file')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.file.recent')!;
    const ids = recent.items.map((i) => (i.type === 'command' ? i.id : i.type));
    expect(ids).toEqual(['recent.empty', 'separator', 'recent.clear']);
    const empty = recent.items[0] as Extract<NativeMenuItem, { type: 'command' }>;
    // 必须灰显（enabled:false）—— 否则点它什么也不发生，比不显示更糟
    expect(empty).toMatchObject({ id: 'recent.empty', label: '#menu.file.recentEmpty', enabled: false });
  });

  test('动态 recent-files：有文件时不得出现空态占位项', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac', recentFiles: ['/tmp/a.md'] });
    const recent = spec.menus.find((m) => m.id === 'file')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.file.recent')!;
    const ids = recent.items.map((i) => (i.type === 'command' ? i.id : i.type));
    expect(ids).not.toContain('recent.empty');
  });

  test('动态 themes：从 Theme Registry 派生 radio，选中态跟随 activeThemeId', () => {    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    const themeItems = spec.menus.find((m) => m.id === 'theme')!.items
      .filter((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command');
    expect(themeItems[0]).toMatchObject({ id: 'theme.apply.mellow-light', label: 'Mellow Light', checked: true });
    expect(themeItems[1]).toMatchObject({ id: 'theme.apply.mellow-dark', checked: false });
    const system = themeItems.find((i) => i.id === 'theme.mode.system');
    expect(system?.checked).toBe(false);
  });

  test.each(['mac', 'win-linux'] as const)('替换菜单：%s 独立开关、时机互斥与更多选项', (platform) => {
    for (const onRender of [false, true]) {
      for (const quotes of [false, true]) {
        for (const dashes of [false, true]) {
          const spec = toNativeMenuSpec({ ...base, platform, smartQuotes: quotes, smartDashes: dashes, smartPunctOnRender: onRender });
          const submenu = spec.menus.find((m) => m.id === 'edit')!.items
            .find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.edit.replaceMenu')!;
          const commands = submenu.items.filter((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command');
          // G7-MENU-05：文本替换仅 macOS 显示（macOnly），勾选态缺省 true（Typora 快照默认勾选）
          expect(commands.map((c) => [c.id, c.checked])).toEqual([
            ['edit.substitutions.onInput', !onRender],
            ['edit.substitutions.onRender', onRender],
            ['edit.smartQuotes.toggle', quotes],
            ['edit.smartDashes.toggle', dashes],
            ...(platform === 'mac' ? [['edit.textReplacement.toggle', true]] : []),
            ['edit.substitutions.settings', undefined],
          ]);
          expect(submenu.items.filter((i) => i.type === 'separator')).toHaveLength(2);
        }
      }
    }
  });

  test('Text Replacement：勾选态来自设置（缺省 true），非 mac 隐藏', () => {
    const replaceMenu = (platform: 'mac' | 'win-linux', textReplacement?: boolean) => toNativeMenuSpec({ ...base, platform, ...(textReplacement === undefined ? {} : { textReplacement }) })
      .menus.find((m) => m.id === 'edit')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu' && i.label === '#menu.edit.replaceMenu')!;
    const find = (platform: 'mac' | 'win-linux', textReplacement?: boolean) => replaceMenu(platform, textReplacement).items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'edit.textReplacement.toggle');
    expect(find('mac')?.checked).toBe(true);       // 缺省 = 勾选（Typora 快照默认勾选）
    expect(find('mac', false)?.checked).toBe(false);
    expect(find('win-linux')).toBeUndefined();     // 能力不存在 ⇒ 隐藏，不做占位项
  });

  test('checkState：拼写、智能引号、主题、状态栏与工具栏来源解析', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac', themeMode: 'system', spellcheck: false, smartQuotes: true, smartDashes: false, smartPunctOnRender: true, statusbar: false, toolbar: false });
    const editItems = spec.menus.find((m) => m.id === 'edit')!.items
      .filter((i): i is Extract<NativeMenuItem, { type: 'submenu' }> => i.type === 'submenu');
    // 按 **id 查找**，不按下标 —— 下标耦合会在「子菜单里插入新项」时无故失败
    // （本测试曾因 P0-EDITOR-005 在拼写子菜单首位插入条目而失败）。
    const spellMenu = editItems.find((i) => i.label === '#menu.edit.spellMenu')!;
    const spellToggle = spellMenu.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'edit.spellcheck.toggle');
    const punctToggle = editItems.find((i) => i.label === '#menu.edit.replaceMenu')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'edit.smartQuotes.toggle');
    expect(spellToggle).toMatchObject({ id: 'edit.spellcheck.toggle', checked: false });
    expect(punctToggle).toMatchObject({ id: 'edit.smartQuotes.toggle', checked: true });
    // P0-EDITOR-005：新增的拼写条目必须**真的出现在物化结果里**
    // （防「只加了 schema、物化时被丢弃」——那会变成点了没反应的占位项）
    for (const id of ['edit.spelling.checkDocument', 'edit.spelling.learn', 'edit.spelling.unlearn']) {
      expect(spellMenu.items.some((i) => i.type === 'command' && i.id === id)).toBe(true);
    }
    const themeSystem = spec.menus.find((m) => m.id === 'theme')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'theme.mode.system');
    expect(themeSystem?.checked).toBe(true);
    // V7-W1.6：状态栏开关勾选态。§4.360「六」7：本项 mac **不装配**（基线 fixture 显示段
    // L393-419 全段核对 —— dump 枚举含 ⌥-alternate 行，亦无「状态栏」；Win/Linux 实机有）
    // ⇒ 勾选态断言改在 **win-linux** 物化面上取（schema 声明 checkedFrom 不变，护栏仍锁）。
    const winSpec = toNativeMenuSpec({ ...base, platform: 'win-linux', themeMode: 'system', spellcheck: false, smartQuotes: true, smartDashes: false, smartPunctOnRender: true, statusbar: false, toolbar: false });
    const statusbar = winSpec.menus.find((m) => m.id === 'view')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'view.statusbar.toggle');
    expect(statusbar).toMatchObject({ id: 'view.statusbar.toggle', checked: false });
    // 缺省（未传 statusbar）按可见处理（Mellow 默认隐藏由 UI 状态给出，schema 侧保守取 true）
    const statusbarDefault = toNativeMenuSpec({ ...base, platform: 'win-linux' }).menus.find((m) => m.id === 'view')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'view.statusbar.toggle');
    expect(statusbarDefault?.checked).toBe(true);
    // mac 面：本项被平台过滤 ⇒ 不得出现（防「winLinuxOnly 标记丢失」无声回归 mac 菜单）
    const statusbarMac = spec.menus.find((m) => m.id === 'view')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'view.statusbar.toggle');
    expect(statusbarMac).toBeUndefined();
    // V7-W2.4：浮动编辑器工具栏开关勾选态（Typora 1.14 View → Toolbar；mac 常驻装配）
    const toolbar = spec.menus.find((m) => m.id === 'view')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'view.toolbar.toggle');
    expect(toolbar).toMatchObject({ id: 'view.toolbar.toggle', checked: false });
    const toolbarDefault = toNativeMenuSpec({ ...base, platform: 'mac' }).menus.find((m) => m.id === 'view')!.items
      .find((i): i is Extract<NativeMenuItem, { type: 'command' }> => i.type === 'command' && i.id === 'view.toolbar.toggle');
    expect(toolbarDefault?.checked).toBe(true);
  });

  test('V7-W1.5：显示菜单顺序对齐 Typora（侧栏三视图 → 模式 → 全屏缩放 → 状态 → Mellow 增强）', () => {
    const viewIds = toNativeMenuSpec({ ...base, platform: 'mac' }).menus
      .find((m) => m.id === 'view')!.items
      .map((i) => (i.type === 'separator' ? '---' : i.type === 'command' ? i.id : i.type));
    expect(viewIds).toEqual([
      'view.sidebar.toggle', '---',
      'view.sidebar.outline', 'view.sidebar.fileList', 'view.sidebar.fileTree', 'search.global', '---',
      'view.source.toggle', 'view.focus.cycle', 'view.typewriter.cycle', 'view.toolbar.toggle', '---',
      // §4.360「六」5：双指缩放（Typora 实机 = Allow Magnification CheckMenuItem，贴缩放三档之上）
      'window.fullscreen', 'view.magnification.toggle', 'view.zoomReset', 'view.zoomIn', 'view.zoomOut', '---',
      // §4.360「六」7：view.statusbar.toggle mac 不装配（基线 mac View 段无「状态栏」，
      // 含 ⌥-alternate 行核对）⇒ mac 物化序列中不得出现（Win/Linux 面由 checkState 用例覆盖）
      'view.wordCount', 'window.alwaysOnTop', '---',
      'commandPalette.open',
    ]);
  });

  test('V7-W1.2/W1.9：缩进方向与官方键位表一致（Indent=Cmd+[/Ctrl+[，Outdent=Cmd+]/Ctrl+]）', () => {
    expect(SCHEMA_SHORTCUTS.get('paragraph.indentMore')).toEqual({ mac: 'Cmd+[', winLinux: 'Ctrl+[' });
    expect(SCHEMA_SHORTCUTS.get('paragraph.indentLess')).toEqual({ mac: 'Cmd+]', winLinux: 'Ctrl+]' });
    expect(SCHEMA_SHORTCUTS.get('format.code')).toEqual({ mac: 'Cmd+Shift+`', winLinux: 'Ctrl+Shift+`' });
    expect(SCHEMA_SHORTCUTS.get('window.fullscreen')).toEqual({ mac: 'Cmd+Alt+F', winLinux: 'F11' });
  });

  test('V7-W1.1：file.reopenClosed 声明官方键位（⇧⌘T / Ctrl+Shift+T）', () => {
    expect(SCHEMA_SHORTCUTS.get('file.reopenClosed')).toEqual({ mac: 'Cmd+Shift+T', winLinux: 'Ctrl+Shift+T' });
    expect(SCHEMA_COMMAND_IDS.has('file.reopenClosed')).toBe(true);
  });

  test('predefined 条目携带本地化文案且无 id（OS 提供行为）', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    const edit = spec.menus.find((m) => m.id === 'edit')!.items;
    // 2026-11-08：首项即「撤消」—— 与 Typora 1.14.9 显示层基线一致
    // （`tests/benchmark/fixtures/typora-live-menu-1149-display.txt`）。
    expect(edit[0]).toEqual({ type: 'predefined', predefined: 'undo', label: '#menu.top.undo' });
  });

  test('G7-MENU-06 撤回：Edit 菜单不得再出现「新段落 / 新行」补偿项', () => {
    const spec = toNativeMenuSpec({ ...base, platform: 'mac' });
    const edit = spec.menus.find((m) => m.id === 'edit')!.items;
    const ids = edit.map((i) => (i as { id?: string }).id).filter(Boolean);
    expect(ids).not.toContain('edit.newParagraph');
    expect(ids).not.toContain('edit.newLine');
    // 补偿项也不得声明快捷键（Enter / Shift+Enter 不能做 accelerator）
    expect(SCHEMA_SHORTCUTS.has('edit.newParagraph')).toBe(false);
    expect(SCHEMA_SHORTCUTS.has('edit.newLine')).toBe(false);
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
