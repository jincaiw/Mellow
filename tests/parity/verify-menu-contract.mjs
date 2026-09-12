/**
 * 菜单契约护栏（P1-1.10，P1-1.3 单一真源改造后为 schema 侧校验）
 *
 * 目标：把 V3/V4 审计里反复出现的菜单类缺陷（顺序漂移、separator 丢失、
 * 快捷键双真源、checkState 缺失、文案漏译、主题列表硬编码、Rust 越权）变成
 * 机器可判定的 schema diff，而不是人工 review。
 *
 * 单一真源架构（V4.0 §7.4 硬规则）：
 *   packages/commands/src/menuSchema.ts（MENU_SCHEMA 声明表 + 三平台 shortcut）
 *     → SCHEMA_SHORTCUTS 注入 App.tsx CommandRegistry（键盘与菜单同键位）
 *     → toNativeMenuSpec（locale 文案 / recent files / BUILTIN_THEMES / checkState）
 *     → Rust menu.rs 只做 materialization（无文案、无主题列表、无状态）
 *
 * 规范依据：
 * - docs/plans/typora-parity-master-plan.md §7.7（菜单与快捷键合同）
 * - docs/plans/typora-parity-master-plan.md §8.W1（Command 单一真源硬规则）
 * - 历史论证见 docs/plans/archive/typora-parity-final-plan-v4.md §7.2 / §7.4
 * - packages/commands/src/menuContract.ts（顶层菜单产品合同）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const schemaSource = readFileSync(resolve(root, 'packages/commands/src/menuSchema.ts'), 'utf8').replace(/\r\n/g, '\n');
const appSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const nativeMenuSource = readFileSync(resolve(root, 'apps/desktop/src/nativeMenu.ts'), 'utf8').replace(/\r\n/g, '\n');
const menuRsSource = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/menu.rs'), 'utf8').replace(/\r\n/g, '\n');
const messagesSource = readFileSync(resolve(root, 'packages/i18n/src/messages.ts'), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

/**
 * 剥离注释后的源码。用于「反残留」类断言：解释性注释会合法提及已退役的键名 /
 * 类名（例如说明「此前存在 mellow.editor.toolbarVisible」），若直接对原文做
 * `includes` 会误报。剥块注释（含 JSX {/* *\/}）后再剥行注释。
 */
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');
const appCode = stripComments(appSource);

// ── MENU_SCHEMA 解析（按缩进重建菜单树；schema 为单行条目的声明表）──────────
function parseMenuSchema(src) {
  const start = src.indexOf('export const MENU_SCHEMA');
  if (start === -1) throw new Error('menuSchema.ts 缺少 MENU_SCHEMA');
  const roots = [];
  // stack: { indent, list }，list 为该层的 entries 数组
  const stack = [];
  let current = null; // 当前层 entries
  for (const line of src.slice(start).split('\n').slice(1)) {
    if (/^];/.test(line)) break;
    const indentMatch = line.match(/^(\s*)\{\s*(.*)$/);
    if (!indentMatch) continue;
    const indent = indentMatch[1].length;
    const body = indentMatch[2];
    // 弹栈到正确层级
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    current = stack.length === 0 ? roots : stack[stack.length - 1].list;
    const id = /(?:^|[,{\s])id: '([^']+)'/.exec(body)?.[1];
    const labelKey = /labelKey: '([^']+)'/.exec(body)?.[1];
    const isRoot = /^id: '/.test(body) && /entries: \[\s*$/.test(body);
    if (isRoot) {
      const node = { id, labelKey, macOnly: /macOnly: true/.test(body), entries: [] };
      current.push({ kind: 'root', ...node });
      stack.push({ indent, list: node.entries });
      continue;
    }
    if (/kind: 'separator'/.test(body)) {
      current.push({ kind: 'separator' });
      continue;
    }
    if (/kind: 'dynamic'/.test(body)) {
      current.push({ kind: 'dynamic', dynamic: /dynamic: '([^']+)'/.exec(body)[1] });
      continue;
    }
    if (/kind: 'submenu'/.test(body)) {
      const node = { kind: 'submenu', id, labelKey, entries: [] };
      current.push(node);
      stack.push({ indent, list: node.entries });
      continue;
    }
    if (/kind: 'predefined'/.test(body)) {
      current.push({ kind: 'predefined', predefined: /predefined: '([^']+)'/.exec(body)?.[1], labelKey });
      continue;
    }
    if (/kind: 'command'/.test(body)) {
      const shortcutBody = /shortcut: \{([^}]*)\}/.exec(body);
      const entry = { kind: 'command', id, labelKey };
      if (shortcutBody) {
        entry.shortcut = {};
        const mac = /mac: '([^']+)'/.exec(shortcutBody[1]);
        const win = /winLinux: '([^']+)'/.exec(shortcutBody[1]);
        if (mac) entry.shortcut.mac = mac[1];
        if (win) entry.shortcut.winLinux = win[1];
      }
      const checkedFrom = /checkedFrom: '([^']+)'/.exec(body);
      if (checkedFrom) entry.checkedFrom = checkedFrom[1];
      if (/macOnly: true/.test(body)) entry.macOnly = true;
      if (/debugOnly: true/.test(body)) entry.debugOnly = true;
      current.push(entry);
    }
  }
  return roots;
}

function* walkEntries(entries) {
  for (const entry of entries) {
    yield entry;
    if (entry.kind === 'submenu') yield* walkEntries(entry.entries);
  }
}

const MENU_SCHEMA = parseMenuSchema(schemaSource);
const allEntries = () => MENU_SCHEMA.flatMap((rootEntry) => [...walkEntries(rootEntry.entries)]);
const schemaCommandIds = new Set(allEntries().filter((e) => e.kind === 'command').map((e) => e.id));
const schemaShortcuts = new Map(
  allEntries().filter((e) => e.kind === 'command' && e.shortcut).map((e) => [e.id, e.shortcut]),
);

// ── 1. 顶层菜单顺序（产品合同：app(mac) → File → … → Help）────────────────
const TYPOGRAPHIC_MENU_ORDER = ['file', 'edit', 'paragraph', 'format', 'view', 'theme', 'window', 'help'];
const rootIds = MENU_SCHEMA.map((r) => r.id);
if (JSON.stringify(rootIds) !== JSON.stringify(['app', ...TYPOGRAPHIC_MENU_ORDER])) {
  fail(`顶层菜单顺序违反产品合同：${rootIds.join(' → ')}`);
}
// B3（第四轮）：window 顶层菜单仅 macOS（Typora Windows/Linux 无「窗口」菜单，
// 最小化/还原由系统标题栏承担）。平台差异在 spec 侧（macOnly）完成，Rust 零分支。
const macOnlyRoots = MENU_SCHEMA.filter((r) => r.macOnly).map((r) => r.id);
if (JSON.stringify(macOnlyRoots) !== JSON.stringify(['app', 'window'])) {
  fail(`macOnly 顶层菜单集合漂移：应为 [app, window]，实际 ${macOnlyRoots.join(', ')}`);
}
if (!MENU_SCHEMA[0].macOnly) fail('应用菜单必须声明 macOnly（Windows/Linux 不得出现应用菜单）');

// ── 2. 命令覆盖：schema 命令 id 必须能被前端 CommandRegistry 处理 ───────────
const desktopCommandIds = new Set([...appSource.matchAll(/\{\s*\n?\s*id: '([^']+)'/g)].map((m) => m[1]));
const unhandled = [...schemaCommandIds].filter((id) => !desktopCommandIds.has(id));
if (unhandled.length > 0) fail(`schema 命令缺少 CommandRegistry 注册: ${unhandled.join(', ')}`);

// ── 3. 主题菜单从 Theme Registry 派生（§7.4 硬规则 4）─────────────────────
const themeRoot = MENU_SCHEMA.find((r) => r.id === 'theme');
const themeEntries = themeRoot?.entries ?? [];
if (!themeEntries.some((e) => e.kind === 'dynamic' && e.dynamic === 'themes')) {
  fail('主题菜单必须包含 dynamic: themes 占位（从 Theme Registry 派生）');
}
if (allEntries().some((e) => e.kind === 'command' && /^theme\.apply\./.test(e.id))) {
  fail('主题命令 id 不得静态声明（theme.apply.* 必须由 dynamic: themes 生成）');
}
if (/mellow-light/.test(menuRsSource)) fail('Rust menu.rs 不得硬编码主题列表（P1-1.5：主题从 Theme Registry 派生）');
if (!nativeMenuSource.includes('BUILTIN_THEMES')) fail('nativeMenu.ts 必须从 BUILTIN_THEMES 派生主题菜单');
if (!appSource.includes("invoke('set_menu_spec'")) fail('App.tsx 必须经 set_menu_spec 下发 NativeMenuSpec');

// ── 4. Rust menu.rs 降级为 materialization Adapter（§7.4 硬规则 6）─────────
const menuRsCode = menuRsSource.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
if (/MENU_LABELS/.test(menuRsCode)) fail('Rust menu.rs 不得再持有 MENU_LABELS（文案真源已迁 i18n menu.*）');
for (const legacy of ['set_menu_locale', 'set_recent_files', 'set_theme_selection', 'set_spellcheck_state', 'set_smart_punct_state']) {
  if (menuRsCode.includes(legacy)) fail(`Rust menu.rs 不得再保留旧状态同步命令: ${legacy}`);
}
if (!menuRsSource.includes('serde::Deserialize') || !menuRsSource.includes('pub fn set_menu_spec')) {
  fail('Rust menu.rs 必须实现 set_menu_spec + serde::Deserialize materialization');
}
if (/#\[cfg\(target_os/.test(menuRsSource)) {
  fail('Rust menu.rs 菜单结构不得使用 #[cfg(target_os)] 分支（平台差异在 spec 侧完成）');
}

// ── 5. 文件菜单条目顺序（§7.2，separator 一并纳入 diff）────────────────────
const SEP = { kind: 'separator' };
const FILE_MENU_CONTRACT = [
  { kind: 'command', id: 'file.new' },
  { kind: 'command', id: 'file.newWindow' },
  SEP,
  { kind: 'command', id: 'file.open' },
  { kind: 'submenu', id: 'file.recent' },
  { kind: 'command', id: 'file.reopenClosed' }, // V7-W1.1：Typora「重新打开关闭的文件」
  { kind: 'command', id: 'quickOpen.open' },
  { kind: 'command', id: 'workspace.openFolder' },
  SEP,
  { kind: 'command', id: 'file.info' },
  { kind: 'command', id: 'file.revealInFileList' },
  { kind: 'command', id: 'file.revealInFileTree' },
  { kind: 'command', id: 'file.revealInFinder' },
  SEP,
  { kind: 'command', id: 'file.moveTo' },
  { kind: 'command', id: 'file.trash' },
  SEP,
  { kind: 'command', id: 'file.closeWindow' }, // B1：⌘W 关闭窗口（mac performClose: 真值）
  { kind: 'command', id: 'file.closeAll' },
  SEP,
  { kind: 'command', id: 'file.save' },
  { kind: 'command', id: 'file.saveAs' },
  { kind: 'command', id: 'file.saveAll' },
  { kind: 'command', id: 'file.reloadFromDisk' },
  SEP,
  { kind: 'command', id: 'file.import' },
  { kind: 'submenu', id: 'file.export' },
  { kind: 'command', id: 'file.pageSetup' },
  { kind: 'command', id: 'file.print' },
  SEP,
  { kind: 'command', id: 'file.openSnapshotsFolder' }, // §7.2：快照不得插入高频组
];
const renderSeq = (items) => items.map((it) => (it.kind === 'separator' ? '──' : it.kind === 'submenu' ? `[${it.id}]` : it.id)).join(' | ');
const fileRoot = MENU_SCHEMA.find((r) => r.id === 'file');
const fileItems = fileRoot?.entries ?? [];
if (fileItems.length !== FILE_MENU_CONTRACT.length || fileItems.some((it, i) => {
  const want = FILE_MENU_CONTRACT[i];
  return it.kind !== want.kind || (want.kind !== 'separator' && it.id !== want.id);
})) {
  fail(`File menu order violates plan §7.2\n    expected: ${renderSeq(FILE_MENU_CONTRACT)}\n    actual:   ${renderSeq(fileItems)}`);
}

// ── 6. 双语完整：schema 用到的每个 labelKey 都必须在 i18n menu.* 有中英文 ──
function parseLocaleBlock(name) {
  // 声明形式兼容类型注解：const zhCN = { / const enUS: Record<keyof typeof zhCN, string> = {
  const decl = new RegExp(`const ${name}[^=\\n]*= \\{`).exec(messagesSource);
  const startIdx = decl?.index ?? -1;
  if (startIdx === -1) throw new Error(`messages.ts 缺少 locale 块 ${name}`);
  // 定界 = 起始之后第一个行首 `}`。注意：zhCN 以 `} as const;` 结束，早期实现用
  // indexOf('\n};') 会跨过它一直找到 enUS 结尾，使 zh-CN 文案从未被真正校验
  // （en 值覆盖 zh 值，缺译检查恒绿）—— 此处修正为行首 `}` 定界。
  const rest = messagesSource.slice(startIdx);
  const endRel = rest.search(/^}/m);
  const block = endRel === -1 ? rest : rest.slice(0, endRel);
  const map = new Map();
  for (const [, key, value] of block.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',/gm)) {
    if (key.startsWith('menu.')) map.set(key, value);
  }
  return map;
}
const zhMenu = parseLocaleBlock('zhCN');
const enMenu = parseLocaleBlock('enUS');
const usedLabelKeys = new Set([
  ...MENU_SCHEMA.map((r) => r.labelKey),
  ...allEntries().flatMap((e) => (e.labelKey ? [e.labelKey] : [])),
]);
for (const key of usedLabelKeys) {
  if (!zhMenu.has(key)) fail(`菜单 labelKey 缺少 zh-CN 文案: ${key}`);
  else if (zhMenu.get(key).trim() === '') fail(`菜单 zh-CN 文案为空: ${key}`);
  if (!enMenu.has(key)) fail(`菜单 labelKey 缺少 en-US 文案: ${key}`);
  else if (enMenu.get(key).trim() === '') fail(`菜单 en-US 文案为空: ${key}`);
}
// 孤儿 key 检测：i18n 中 menu.* 必须被 schema 引用或登记白名单
const ORPHAN_ALLOWED = new Set([
  'menu.top.insert', // 预留：插入类顶层菜单（当前归入段落/格式，暂未装配）
  ...[...zhMenu.keys()].filter((k) => k.startsWith('menu.theme.')),
]);
for (const key of zhMenu.keys()) {
  if (!usedLabelKeys.has(key) && !ORPHAN_ALLOWED.has(key)) fail(`i18n 孤儿菜单文案（schema 未引用）: ${key}`);
}

// ── 7. 快捷键单一真源（§7.4 硬规则 2）────────────────────────────────────
// schema 是唯一声明处；App.tsx 仅允许 SCHEMA_SHORTCUTS 注入 + 平台互补白名单。
const INLINE_SHORTCUT_ALLOWED = new Set([
  'settings.open', // schema 仅 mac（app 菜单），内联补充 Win/Linux Ctrl+,（键盘）
  'export.repeat', // schema 仅 Win/Linux（菜单），内联补充 mac Ctrl+E（键盘）
]);
const commandBlocks = [];
{
  const starts = [...appSource.matchAll(/\{\s*\n?\s*id: '/g)].map((m) => m.index);
  for (let i = 0; i < starts.length; i += 1) {
    const block = appSource.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined);
    const id = /\{\s*\n?\s*id: '([^']+)'/.exec(block)?.[1];
    if (id) commandBlocks.push({ id, block });
  }
}
for (const { id, block } of commandBlocks) {
  if (!schemaShortcuts.has(id) || INLINE_SHORTCUT_ALLOWED.has(id)) continue;
  if (/shortcut:\s*(\{[^}]*\}|COMMAND_PALETTE_SHORTCUT)/.test(block)) {
    fail(`快捷键双真源：${id} 的 shortcut 已在 menuSchema.ts 声明，App.tsx 不得内联重复（由 SCHEMA_SHORTCUTS 注入）`);
  }
}
if (!appSource.includes('SCHEMA_SHORTCUTS.get(command.id)')) {
  fail('App.tsx 缺少 SCHEMA_SHORTCUTS 快捷键注入（§7.4 硬规则 2）');
}
// D1 决议：Win/Linux 9 处官方键位契约（对照 Typora 官方 Shortcut Keys，防回归漂移）
const D1_OFFICIAL_KEYS = [
  ['file.new', 'Ctrl+N'],
  ['file.newWindow', 'Ctrl+Shift+N'],
  ['insert.image', 'Ctrl+Shift+I'],
  ['format.quote', 'Ctrl+Shift+Q'],
  ['format.orderedList', 'Ctrl+Shift+['],
  ['format.list', 'Ctrl+Shift+]'],
  ['format.strike', 'Alt+Shift+5'],
  ['format.code', 'Ctrl+Shift+`'],
  ['format.codeBlock', 'Ctrl+Shift+K'],
  ['format.mathBlock', 'Ctrl+Shift+M'],
];
for (const [id, key] of D1_OFFICIAL_KEYS) {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  if (!entry?.shortcut) fail(`D1 官方键位缺失：${id} 未在 schema 声明 shortcut`);
  else if (entry.shortcut.winLinux !== key) fail(`D1 官方键位漂移：${id} 应为 ${key}，实际 ${entry.shortcut.winLinux}`);
}

// drift canary：护栏必须能抓住 schema 侧键位漂移（防「永远绿」假护栏）
const DRIFT_CANARY_ID = 'insert.image';
const driftShortcut = schemaShortcuts.get(DRIFT_CANARY_ID);
if (!driftShortcut || driftShortcut.winLinux !== 'Ctrl+Shift+I') {
  fail(`快捷键护栏自检夹具失效：menuSchema.ts 中 ${DRIFT_CANARY_ID} 键位已变化，请更新 canary`);
} else {
  const drifted = schemaSource.replace("winLinux: 'Ctrl+Shift+I'", "winLinux: 'Ctrl+Alt+I'");
  const reParsed = parseMenuSchema(drifted);
  const reEntries = [...reParsed.flatMap((r) => [...walkEntries(r.entries)])].find((e) => e.kind === 'command' && e.id === DRIFT_CANARY_ID);
  if (reEntries?.shortcut?.winLinux !== 'Ctrl+Alt+I') {
    fail('快捷键护栏自检失败：schema 解析器未能检出注入的键位漂移，护栏已失效');
  }
}

// ── 8. checkState 契约（§7.4 硬规则 5：勾选态与 Settings 同一真源）────────
// 随 P1-1.3 单一真源落地：拼写/智能标点/主题/跟随系统已在 schema checkedFrom 声明。
const CHECK_STATE_CONTRACT = [
  { id: 'edit.spellcheck.toggle', checkedFrom: 'spellcheck' },
  { id: 'edit.smartPunctuation.toggle', checkedFrom: 'smartPunct' },
  { id: 'theme.mode.system', checkedFrom: 'themeModeSystem' },
  // V7-W1.6：状态栏可见性（Typora Win/Linux 显示菜单「状态栏」开关）
  { id: 'view.statusbar.toggle', checkedFrom: 'statusbar' },
  // V7-W2.4：浮动编辑器工具栏启用态（Typora 1.14 View → Toolbar）
  { id: 'view.toolbar.toggle', checkedFrom: 'toolbar' },
];
const VIEW_GROUP_EXCEPTIONS = new Set([
  'view.source.toggle', 'view.focus.cycle', 'view.typewriter.cycle',
  'view.wordCount', 'window.fullscreen', 'window.alwaysOnTop',
]);
for (const { id, checkedFrom } of CHECK_STATE_CONTRACT) {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  if (!entry) fail(`checkState 契约条目缺失: ${id}`);
  else if (entry.checkedFrom !== checkedFrom) fail(`${id} checkedFrom 应为 ${checkedFrom}，实际 ${entry.checkedFrom ?? '（无）'}`);
}
const spellcheckSync = /spellcheck: \(\(\) => \{ const def = settingById\('editor\.spellcheck'\); return def \? readSetting\(def\) !== false : true; \}\)\(\)/.test(appSource);
const smartPunctSync = /smartPunct: \(\) => \{ const def = settingById\('editor\.smartPunctuation'\);/.test(appSource) || /smartPunct: \(\(\) => \{/.test(appSource);
if (!spellcheckSync || !smartPunctSync) fail('syncNativeMenu 必须从 Settings Store 读取 spellcheck/smartPunct 勾选态（单一真源）');
// V7-W1.6：状态栏勾选态同样必须来自单一状态源（不得硬编码）
if (!/statusbar: statusbarVisible/.test(appSource)) {
  fail('syncNativeMenu 必须从状态栏可见性状态读取 statusbar 勾选态（单一真源）');
}
// V7-W2.4：浮动编辑器工具栏勾选态同源（View → Toolbar 与设置 → 外观同一 storageKey）
if (!/toolbar: selectionToolbarEnabled/.test(appSource)) {
  fail('syncNativeMenu 必须从 selectionToolbarEnabled 状态读取 toolbar 勾选态（V7-W2.4 单一真源）');
}
if (!/execute: \(\) => toggleSelectionToolbar\(\) \}/.test(appSource)) {
  fail('view.toolbar.toggle 必须切换浮动编辑器工具栏（V7-W2.4 D-B = ①：Typora 只有浮动工具栏）');
}
if (/mellow\.editor\.toolbarVisible/.test(appCode)) {
  fail('App.tsx 不得残留 mellow.editor.toolbarVisible（V7-W2.4：常驻横条已退役，开关与浮动工具栏同源）');
}
// 例外过期检测：View 组一旦声明 checkedFrom 即从例外表移除
const staleExceptions = [...VIEW_GROUP_EXCEPTIONS].filter((id) => {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  return entry?.checkedFrom !== undefined;
});
if (staleExceptions.length > 0) fail(`VIEW_GROUP_EXCEPTIONS 已过期，请从例外表移除：${staleExceptions.join(', ')}`);

// ── 9. Cheatsheet 快捷键派生（P1-1.6：无静态键位串）───────────────────────
const cheatsheetSource = readFileSync(resolve(root, 'apps/desktop/src/Cheatsheet.tsx'), 'utf8').replace(/\r\n/g, '\n');
if (/[^a-zA-Z]shortcut: '/.test(cheatsheetSource)) {
  fail('Cheatsheet.tsx 出现静态键位串（shortcut:），必须改用 commandId 从 registry 派生（P1-1.6）');
}
const cheatsheetCommandIds = [...cheatsheetSource.matchAll(/commandId: '([^']+)'/g)].map((m) => m[1]);
const cheatsheetUnknown = cheatsheetCommandIds.filter((id) => !desktopCommandIds.has(id));
if (cheatsheetUnknown.length > 0) fail(`Cheatsheet commandId 未在 CommandRegistry 注册: ${cheatsheetUnknown.join(', ')}`);

// ── 10. Typora menu dump Golden（P1-1.12：真机 EXTRACTED 真值必须入库且有效）──
const dumpPath = resolve(root, 'tests/benchmark/fixtures/typora-menu-dump.txt');
let dumpSource = '';
try {
  dumpSource = readFileSync(dumpPath, 'utf8').replace(/\r\n/g, '\n');
} catch {
  fail('typora-menu-dump.txt 不存在：Typora 1.14.9 Golden 真值必须入库（P1-1.12），运行 tests/benchmark/generate-typora-menu-dump.mjs 在真机生成');
}
if (dumpSource) {
  const status = /^STATUS: (\w+)$/m.exec(dumpSource)?.[1];
  const build = /^SOURCE_BUILD: (\S+)$/m.exec(dumpSource)?.[1];
  if (status !== 'EXTRACTED') fail(`typora-menu-dump.txt 状态为 ${status ?? '（无）'}，入库前必须为 EXTRACTED（真机 AX 提取）`);
  if (build !== '7785') fail(`typora-menu-dump.txt 基线版本漂移：SOURCE_BUILD=${build ?? '（无）'}，验收基线为 1.14.9 (7785)`);
}

// ── 11. 官方快捷键表真值合同 ─────────────────────────────────────────────
// 规范依据：Typora 官方 Shortcut Keys 页（support.typora.io/Shortcut-Keys，
// 页面最后更新 2026-09-06，规范基线 1.14.9 / build 7785）。
//
// 立节原因（第五类失真的回归防线）：G7-KEY-01 / G7-KEY-04 / G7-KEY-05 三项都是
// 「Mellow 自研键位 ≠ 官方表」，且全部长期未被发现 —— 因为纠偏只落在 e2e 断言里，
// 而 e2e 不进 CI、且随实现改写后不会回头验证真值。本轮 e2e 复跑再次抓到同型问题：
// `sidebar-verify` 仍断言「⌃⌘2 未绑定」（W1.5 已按官方表恢复 Articles）、
// `block-shortcuts-verify` 仍断言「⌃` 行内代码」（W1.9 已改为 ⌘⇧`）。
// 二者均为断言过期而非实现回归，但暴露出「改键位无回归防线」的结构性缺口，故立本节。
//
// 归一化说明：官方表用 `Command` / `Control` / `Option` / `↑`，schema 用
// `Cmd` / `Ctrl` / `Alt` / `ArrowUp`，且修饰键书写顺序不固定（如 `Shift+Cmd+D`）。
// 比较前统一别名并排序，避免「等价写法被判为漂移」。
const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Cmd'];
const MOD_ALIAS = {
  Cmd: 'Cmd', Command: 'Cmd', Meta: 'Cmd',
  Ctrl: 'Ctrl', Control: 'Ctrl',
  Alt: 'Alt', Option: 'Alt',
  Shift: 'Shift',
};
const KEY_ALIAS = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right',
};
const normalizeCombo = (combo) => {
  const parts = String(combo).split('+');
  // 解析器按正则从源文本取值，读到的是转义形式（`'Cmd+\\'` → `Cmd+\\`），先还原。
  const key = parts.pop().replace(/\\\\/g, '\\');
  const mods = parts
    .map((m) => MOD_ALIAS[m])
    .filter(Boolean)
    .sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, KEY_ALIAS[key] ?? key].join('+');
};

/** [commandId, 官方 macOS 键位, 官方 Win/Linux 键位（null = 本节不校验）] */
const OFFICIAL_SHORTCUTS = [
  // ── File ──
  ['file.new', 'Cmd+N', 'Ctrl+N'],
  ['file.newWindow', 'Cmd+Shift+N', 'Ctrl+Shift+N'],
  ['file.open', 'Cmd+O', 'Ctrl+O'],
  ['quickOpen.open', 'Cmd+Shift+O', 'Ctrl+P'],
  ['file.reopenClosed', 'Cmd+Shift+T', 'Ctrl+Shift+T'],
  ['file.save', 'Cmd+S', 'Ctrl+S'],
  ['file.saveAs', 'Cmd+Shift+S', 'Ctrl+Shift+S'],
  // settings.open 只存在于 macOS 应用菜单（macOnly），Win/Linux 键位由 App.tsx
  // CommandRegistry 以「平台互补补充键位」提供，故此处不校验 winLinux（见下方专项断言）。
  ['settings.open', 'Cmd+,', null],
  ['file.closeWindow', 'Cmd+W', 'Ctrl+W'],
  // ── Edit ──
  ['edit.copyMarkdown', 'Cmd+Shift+C', 'Ctrl+Shift+C'],
  ['edit.pastePlain', 'Cmd+Shift+V', 'Ctrl+Shift+V'],
  ['edit.selectLine', 'Cmd+L', 'Ctrl+L'],
  ['edit.deleteLine', 'Cmd+Shift+Backspace', 'Ctrl+Shift+Backspace'],
  ['edit.selectFormatSpan', 'Cmd+E', 'Ctrl+E'],
  ['edit.selectWord', 'Cmd+D', 'Ctrl+D'],
  ['edit.deleteWord', 'Cmd+Shift+D', 'Ctrl+Shift+D'],
  ['edit.gotoDocStart', 'Cmd+Up', 'Ctrl+Home'],
  ['edit.gotoSelection', 'Cmd+J', 'Ctrl+J'],
  ['edit.gotoDocEnd', 'Cmd+Down', 'Ctrl+End'],
  ['search.find', 'Cmd+F', 'Ctrl+F'],
  // Win/Linux 官方为 F3 / Enter，走别名（G7-KEY-07 仍为开项，此处只锁主键 Cmd+G）
  ['search.findNext', 'Cmd+G', null],
  ['search.findPrevious', 'Cmd+Shift+G', null],
  // ── Paragraph ──
  ['paragraph.h1', 'Cmd+1', 'Ctrl+1'],
  ['paragraph.h2', 'Cmd+2', 'Ctrl+2'],
  ['paragraph.h3', 'Cmd+3', 'Ctrl+3'],
  ['paragraph.h4', 'Cmd+4', 'Ctrl+4'],
  ['paragraph.h5', 'Cmd+5', 'Ctrl+5'],
  ['paragraph.h6', 'Cmd+6', 'Ctrl+6'],
  ['paragraph.normal', 'Cmd+0', 'Ctrl+0'],
  ['paragraph.headingUp', 'Cmd+=', 'Ctrl+='],
  ['paragraph.headingDown', 'Cmd+-', 'Ctrl+-'],
  ['insert.table', 'Cmd+Alt+T', 'Ctrl+T'],
  ['format.codeBlock', 'Cmd+Alt+C', 'Ctrl+Shift+K'],
  ['format.mathBlock', 'Cmd+Alt+B', 'Ctrl+Shift+M'],
  ['format.quote', 'Cmd+Alt+Q', 'Ctrl+Shift+Q'],
  ['format.orderedList', 'Cmd+Alt+O', 'Ctrl+Shift+['],
  ['format.list', 'Cmd+Alt+U', 'Ctrl+Shift+]'],
  ['paragraph.indentMore', 'Cmd+[', 'Ctrl+['],
  ['paragraph.indentLess', 'Cmd+]', 'Ctrl+]'],
  // ── Format ──
  ['format.bold', 'Cmd+B', 'Ctrl+B'],
  ['format.italic', 'Cmd+I', 'Ctrl+I'],
  ['format.underline', 'Cmd+U', 'Ctrl+U'],
  ['format.code', 'Cmd+Shift+`', 'Ctrl+Shift+`'],
  ['format.strike', 'Ctrl+Shift+`', 'Alt+Shift+5'],
  ['format.link', 'Cmd+K', 'Ctrl+K'],
  ['insert.image', 'Cmd+Ctrl+I', 'Ctrl+Shift+I'],
  ['format.clear', 'Cmd+\\', 'Ctrl+\\'],
  // ── View ──
  ['view.sidebar.toggle', 'Cmd+Shift+L', 'Ctrl+Shift+L'],
  ['view.sidebar.outline', 'Ctrl+Cmd+1', 'Ctrl+Shift+1'],
  ['view.sidebar.fileList', 'Ctrl+Cmd+2', 'Ctrl+Shift+2'],
  ['view.sidebar.fileTree', 'Ctrl+Cmd+3', 'Ctrl+Shift+3'],
  ['view.source.toggle', 'Cmd+/', 'Ctrl+/'],
  ['view.focus.cycle', 'F8', 'F8'],
  ['view.typewriter.cycle', 'F9', 'F9'],
  ['window.fullscreen', 'Cmd+Alt+F', 'F11'],
];

/** 已登记的有意差异（§12 D 表）。键必须仍存在于 schema，否则为过期例外。 */
const OFFICIAL_SHORTCUT_EXCEPTIONS = new Map([
  ['search.replace', '§12 D-Q：macOS Cmd+H 被系统「隐藏应用」占用，沿用 Cmd+Alt+F；Win/Linux 已对齐 Ctrl+H'],
  // G7-KEY-08：Command+` 在 SDI 下语义变为窗口切换，未绑定为文档切换。
  // G7-KEY-09：New Tab (Cmd+T) 随 SDI 决策移除。
]);

const shortcutMapFrom = (src) => new Map(
  parseMenuSchema(src)
    .flatMap((rootEntry) => [...walkEntries(rootEntry.entries)])
    .filter((e) => e.kind === 'command' && e.shortcut)
    .map((e) => [e.id, e.shortcut]),
);

function checkOfficialShortcuts(src) {
  const out = [];
  const parsed = shortcutMapFrom(src);
  for (const [id, mac, win] of OFFICIAL_SHORTCUTS) {
    if (OFFICIAL_SHORTCUT_EXCEPTIONS.has(id)) continue;
    const actual = parsed.get(id);
    if (!actual) {
      out.push(`官方快捷键表：schema 缺少命令 ${id}`);
      continue;
    }
    if (normalizeCombo(actual.mac ?? '') !== normalizeCombo(mac)) {
      out.push(`官方快捷键表漂移：${id} macOS 应为 ${mac}，实际 ${actual.mac ?? '（无）'}`);
    }
    if (win !== null && normalizeCombo(actual.winLinux ?? '') !== normalizeCombo(win)) {
      out.push(`官方快捷键表漂移：${id} Win/Linux 应为 ${win}，实际 ${actual.winLinux ?? '（无）'}`);
    }
  }
  return out;
}

for (const message of checkOfficialShortcuts(schemaSource)) fail(message);

// 有意差异必须「按登记值」存在：既防止悄悄回退，也防止例外表本身过期。
const replaceShortcut = schemaShortcuts.get('search.replace');
if (replaceShortcut?.mac !== 'Cmd+Alt+F' || replaceShortcut?.winLinux !== 'Ctrl+H') {
  fail(`search.replace 键位与 §12 D-Q 登记值不符：期望 mac=Cmd+Alt+F / winLinux=Ctrl+H，实际 ${JSON.stringify(replaceShortcut ?? null)}`);
}
for (const [id] of OFFICIAL_SHORTCUT_EXCEPTIONS) {
  if (!schemaShortcuts.has(id)) fail(`OFFICIAL_SHORTCUT_EXCEPTIONS 已过期：schema 不再包含 ${id}`);
}
// 平台互补键位专项：settings.open 的 Win/Linux `Ctrl+,` 不在 schema（macOnly 应用菜单），
// 而在 App.tsx CommandRegistry。官方表 Preference = Ctrl+,，必须是同一命令而非另立入口。
if (!/id: 'settings\.open'[\s\S]{0,240}?winLinux: 'Ctrl\+,'/.test(appSource)) {
  fail('settings.open 缺少 Win/Linux 键盘键位 Ctrl+,（官方表 Preference；macOnly 菜单项由 CommandRegistry 互补提供）');
}

// canary：把 W1.9 纠偏前的旧键位（⌃` 行内代码）注回 schema，合同必须拒绝。
// 先正则提取锚点片段 → 整体抹除 → 复检（避免直接 replace 命中无关片段）。
const codeAnchor = /\{ kind: 'command', id: 'format\.code'[^}]*shortcut: \{[^}]*\}\s*\}/.exec(schemaSource)?.[0];
if (!codeAnchor) {
  fail('官方快捷键表 canary 未武装：schema 中找不到 format.code 条目（锚点漂移，请更新 canary）');
} else {
  // 注入目标取一个「永不等于当前值」的非官方键位，避免文件已处于漂移态时
  // replace 变成无操作而被误判为 canary 未武装（真实注入已验证：旧值 ⌃` 会被拒绝）。
  const drifted = schemaSource.replace(codeAnchor, codeAnchor.replace("mac: 'Cmd+Shift+`'", "mac: 'Ctrl+Alt+`'"));
  if (drifted === schemaSource) {
    fail('官方快捷键表 canary 未武装：无法注入漂移键位（锚点漂移，请更新 canary）');
  } else if (checkOfficialShortcuts(drifted).length === 0) {
    fail('官方快捷键表合同假绿：format.code 键位漂移到非官方值仍未被拒绝');
  }
}
// canary：把 W1.5 纠偏前的缺失态（Articles 未绑定 ⌃⌘2）注回，合同必须拒绝。
const articlesAnchor = /\{ kind: 'command', id: 'view\.sidebar\.fileList'[^}]*shortcut: \{[^}]*\}\s*\}/.exec(schemaSource)?.[0];
if (!articlesAnchor) {
  fail('Articles canary 未武装：schema 中找不到 view.sidebar.fileList 条目（锚点漂移，请更新 canary）');
} else {
  const drifted = schemaSource.replace(articlesAnchor, articlesAnchor.replace("mac: 'Ctrl+Cmd+2'", "mac: 'Ctrl+Cmd+9'"));
  if (drifted === schemaSource) {
    fail('Articles canary 未武装：无法注入漂移键位（锚点漂移，请更新 canary）');
  } else if (checkOfficialShortcuts(drifted).length === 0) {
    fail('官方快捷键表合同假绿：Articles 键位漂移到 ⌃⌘9 仍未被拒绝');
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Menu contract violations:\n  ${errors.join('\n  ')}`);
}

const commandCount = [...schemaCommandIds].length;
console.log(`Menu schema: app(mac) → ${TYPOGRAPHIC_MENU_ORDER.join(' → ')}; ${commandCount} schema command IDs dispatch through CommandRegistry`);
console.log(`File menu schema: ${FILE_MENU_CONTRACT.length} slots match plan §7.2 (incl. separators)`);
console.log(`Shortcut single source: ${schemaShortcuts.size} accelerators declared in menuSchema.ts, injected into CommandRegistry (drift canary armed)`);
console.log(`Bilingual labels: ${usedLabelKeys.size} label keys resolved from i18n menu.* (zh-CN + en-US); Rust menu.rs is a pure materialization adapter`);
console.log(`Check state: ${CHECK_STATE_CONTRACT.length} toggles from Settings Store, ${VIEW_GROUP_EXCEPTIONS.size} tracked view-group exceptions; themes derived from Theme Registry`);
console.log(`Official shortcut table: ${OFFICIAL_SHORTCUTS.length} bindings match Typora Shortcut Keys (rev. 2026-09-06); ${OFFICIAL_SHORTCUT_EXCEPTIONS.size} registered D-exceptions (drift canary armed)`);
