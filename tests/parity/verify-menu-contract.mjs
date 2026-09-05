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
 * - docs/plans/typora-parity-final-plan-v4.md §7.2（文件菜单顺序）
 * - docs/plans/typora-parity-final-plan-v4.md §7.4（Command 单一真源硬规则）
 * - packages/commands/src/menuContract.ts（顶层菜单产品合同）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const schemaSource = readFileSync(resolve(root, 'packages/commands/src/menuSchema.ts'), 'utf8');
const appSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8');
const nativeMenuSource = readFileSync(resolve(root, 'apps/desktop/src/nativeMenu.ts'), 'utf8');
const menuRsSource = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/menu.rs'), 'utf8');
const messagesSource = readFileSync(resolve(root, 'packages/i18n/src/messages.ts'), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

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
  const block = messagesSource.slice(startIdx, messagesSource.indexOf('\n};', startIdx));
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
];
const VIEW_GROUP_EXCEPTIONS = new Set([
  'view.source.toggle', 'view.focus.cycle', 'view.typewriter.cycle', 'view.toolbar.toggle',
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
// 例外过期检测：View 组一旦声明 checkedFrom 即从例外表移除
const staleExceptions = [...VIEW_GROUP_EXCEPTIONS].filter((id) => {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  return entry?.checkedFrom !== undefined;
});
if (staleExceptions.length > 0) fail(`VIEW_GROUP_EXCEPTIONS 已过期，请从例外表移除：${staleExceptions.join(', ')}`);

// ── 9. Cheatsheet 快捷键派生（P1-1.6：无静态键位串）───────────────────────
const cheatsheetSource = readFileSync(resolve(root, 'apps/desktop/src/Cheatsheet.tsx'), 'utf8');
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
  dumpSource = readFileSync(dumpPath, 'utf8');
} catch {
  fail('typora-menu-dump.txt 不存在：Typora 1.14.9 Golden 真值必须入库（P1-1.12），运行 tests/benchmark/generate-typora-menu-dump.mjs 在真机生成');
}
if (dumpSource) {
  const status = /^STATUS: (\w+)$/m.exec(dumpSource)?.[1];
  const build = /^SOURCE_BUILD: (\S+)$/m.exec(dumpSource)?.[1];
  if (status !== 'EXTRACTED') fail(`typora-menu-dump.txt 状态为 ${status ?? '（无）'}，入库前必须为 EXTRACTED（真机 AX 提取）`);
  if (build !== '7785') fail(`typora-menu-dump.txt 基线版本漂移：SOURCE_BUILD=${build ?? '（无）'}，验收基线为 1.14.9 (7785)`);
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
