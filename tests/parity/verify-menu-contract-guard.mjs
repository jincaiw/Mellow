/**
 * 护栏的护栏（P1-1.10）
 *
 * `verify-menu-contract.mjs` 全绿本身不构成证据——一个永远绿的护栏比没有护栏更危险。
 * 本文件对菜单护栏做 mutation testing：把各类历史缺陷注入到源码副本中，
 * 断言护栏 **必须** 报错；未报错即判定护栏失效。
 *
 * 攻击面 = 单一真源链路（V4 方案 §7.4）：
 *   menuSchema.ts（声明表） → App.tsx（Registry 注入 + set_menu_spec 下发）
 *   → nativeMenu.ts（主题/平台派生） → messages.ts（双语文案） → menu.rs（纯 materialization）
 *
 * 覆盖的缺陷族：顶层顺序错乱、私建顶层菜单、复活已废弃命令、
 * 主题硬编码/dynamic 占位被删/派生丢失、separator 丢失、条目顺序漂移、
 * shortcut 双真源回潮、schema 键位漂移、checkState 声明丢失、
 * 文案漏译/缺失、Rust 越权（旧状态命令/平台分叉 cfg）。
 */
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const GUARD = join(root, 'tests/parity/verify-menu-contract.mjs');
const FILES = {
  'packages/commands/src/menuSchema.ts': 'packages/commands/src/menuSchema.ts',
  'apps/desktop/src/App.tsx': 'apps/desktop/src/App.tsx',
  'apps/desktop/src/Cheatsheet.tsx': 'apps/desktop/src/Cheatsheet.tsx',
  'apps/desktop/src/nativeMenu.ts': 'apps/desktop/src/nativeMenu.ts',
  'packages/i18n/src/messages.ts': 'packages/i18n/src/messages.ts',
  'apps/desktop/src-tauri/src/menu.rs': 'apps/desktop/src-tauri/src/menu.rs',
  'tests/benchmark/fixtures/typora-menu-dump.txt': 'tests/benchmark/fixtures/typora-menu-dump.txt',
};

let work = '';
function scaffold() {
  work = mkdtempSync(join(tmpdir(), 'mellow-menu-guard-'));
  for (const [from, to] of Object.entries(FILES)) {
    const target = join(work, to);
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(join(root, from), target);
  }
  const guardPath = join(work, 'tests/parity/verify-menu-contract.mjs');
  mkdirSync(join(guardPath, '..'), { recursive: true });
  copyFileSync(GUARD, guardPath);
}
function runGuard() {
  const result = spawnSync(process.execPath, [join(work, 'tests/parity/verify-menu-contract.mjs')], { encoding: 'utf8' });
  return { code: result.status ?? 1, out: `${result.stderr ?? ''}${result.stdout ?? ''}` };
}
const schema = () => join(work, 'packages/commands/src/menuSchema.ts');
const appTsx = () => join(work, 'apps/desktop/src/App.tsx');
const cheatsheet = () => join(work, 'apps/desktop/src/Cheatsheet.tsx');
const nativeMenu = () => join(work, 'apps/desktop/src/nativeMenu.ts');
const messages = () => join(work, 'packages/i18n/src/messages.ts');
const menuRs = () => join(work, 'apps/desktop/src-tauri/src/menu.rs');
const patch = (file, mutate) => writeFileSync(file, mutate(readFileSync(file, 'utf8')));

/** 每个用例：注入一处缺陷，护栏必须失败（exit ≠ 0） */
const CASES = [
  // ── menuSchema.ts：结构契约 ────────────────────────────────────────────
  ['私建独立 Insert 顶层菜单', () => patch(schema(), (s) => s.replace(
    "  { id: 'file', labelKey: 'menu.top.file', entries: [",
    "  { id: 'insert', labelKey: 'menu.top.insert', entries: [\n    { kind: 'command', id: 'file.ghostCommand', labelKey: 'menu.top.insert' },\n  ] },\n  { id: 'file', labelKey: 'menu.top.file', entries: ["))],
  ['顶层菜单顺序错乱（File ↔ Theme id 互换）', () => patch(schema(), (s) => s
    .replace("{ id: 'file', labelKey: 'menu.top.file', entries: [", "{ id: 'theme', labelKey: 'menu.top.file', entries: [")
    .replace("{ id: 'theme', labelKey: 'menu.top.theme', entries: [", "{ id: 'file', labelKey: 'menu.top.theme', entries: ["))],
  ['复活已废弃命令（Registry 无处理）', () => patch(schema(), (s) => s.replace(
    "      { kind: 'command', id: 'edit.spellcheck.toggle', labelKey: 'menu.edit.spellcheck', checkedFrom: 'spellcheck' },",
    "      { kind: 'command', id: 'edit.spellcheck.toggle', labelKey: 'menu.edit.spellcheck', checkedFrom: 'spellcheck' },\n      { kind: 'command', id: 'view.split.toggle', labelKey: 'menu.edit.spellcheck' },"))],
  ['文件菜单丢失 separator', () => patch(schema(), (s) => s.replace(
    "    { kind: 'command', id: 'file.trash', labelKey: 'menu.file.trash' },\n    { kind: 'separator' },\n    { kind: 'command', id: 'tabs.close',",
    "    { kind: 'command', id: 'file.trash', labelKey: 'menu.file.trash' },\n    { kind: 'command', id: 'tabs.close',"))],
  ['文件菜单顺序漂移（save ↔ saveAs 互换）', () => patch(schema(), (s) => {
    const save = "    { kind: 'command', id: 'file.save', labelKey: 'menu.file.save', shortcut: { mac: 'Cmd+S', winLinux: 'Ctrl+S' } },";
    const saveAs = "    { kind: 'command', id: 'file.saveAs', labelKey: 'menu.file.saveAs', shortcut: { mac: 'Cmd+Shift+S', winLinux: 'Ctrl+Shift+S' } },";
    return s.replace(`${save}\n${saveAs}`, `${saveAs}\n${save}`);
  })],
  ['主题菜单 dynamic 占位被删', () => patch(schema(), (s) => s.replace(
    "    { kind: 'dynamic', dynamic: 'themes' },",
    "    { kind: 'separator' },"))],
  ['schema 键位漂移（Ctrl+Shift+I → Ctrl+Alt+I）', () => patch(schema(), (s) => s.replace(
    "winLinux: 'Ctrl+Shift+I'",
    "winLinux: 'Ctrl+Alt+I'"))],
  ['checkState 声明丢失（spellcheck）', () => patch(schema(), (s) => s.replace(
    ", labelKey: 'menu.edit.spellcheck', checkedFrom: 'spellcheck' },",
    ", labelKey: 'menu.edit.spellcheck' },"))],
  // ── App.tsx / nativeMenu.ts：派生与注入契约 ───────────────────────────
  ['快捷键双真源（App.tsx 内联回潮）', () => patch(appTsx(), (s) => s.replace(
    "enabled: always, execute: () => replaceSlashTrigger('![]( )') },",
    "enabled: always, shortcut: { mac: 'Cmd+Alt+I' }, execute: () => replaceSlashTrigger('![]( )') },"))],
  ['App.tsx 丢失 SCHEMA_SHORTCUTS 注入', () => patch(appTsx(), (s) => s.replace(
    'SCHEMA_SHORTCUTS.get(command.id)',
    '_schemaShortcutsUnused'))],
  ['nativeMenu.ts 丢失 BUILTIN_THEMES 派生', () => patch(nativeMenu(), (s) => s.replaceAll(
    'BUILTIN_THEMES',
    'THEME_LIST'))],
  ['Cheatsheet 静态键位串回潮', () => patch(cheatsheet(), (s) => s.replace(
    "commandId: 'paragraph.h1' },",
    "shortcut: 'Cmd/Ctrl+1', commandId: 'paragraph.h1' },"))],
  ['Golden dump 退化为 UNVERIFIED 占位', () => patch(join(work, 'tests/benchmark/fixtures/typora-menu-dump.txt'), (s) => s.replace(
    'STATUS: EXTRACTED',
    'STATUS: UNVERIFIED'))],
  // ── messages.ts：双语契约 ─────────────────────────────────────────────
  ['菜单文案漏译（en 置空）', () => patch(messages(), (s) => s.replace(
    "'menu.file.new': 'New',",
    "'menu.file.new': '',"))],
  ['菜单文案缺失（en 整行删除）', () => patch(messages(), (s) => s.replace(
    "  'menu.file.new': 'New',\n",
    ''))],
  // ── menu.rs：materialization 边界（§7.4 硬规则 6）─────────────────────
  ['主题硬编码进 Rust', () => patch(menuRs(), (s) => `${s}\nconst _HARDCODED_THEMES: &[&str] = &["mellow-light"];\n`)],
  ['Rust 复活旧状态同步命令', () => patch(menuRs(), (s) => `${s}\nfn set_spellcheck_state() {}\n`)],
  ['Rust 引入 target_os 平台分叉', () => patch(menuRs(), (s) => `${s}\n#[cfg(target_os = "windows")]\nfn _win_only_menu() {}\n`)],
];

const failures = [];
try {
  // 基线：未注入缺陷时护栏必须全绿
  scaffold();
  const baseline = runGuard();
  if (baseline.code !== 0) {
    failures.push(`基线护栏未通过，无法做 mutation 测试：\n${baseline.out}`);
  } else {
    for (const [name, mutate] of CASES) {
      scaffold();
      mutate();
      const result = runGuard();
      if (result.code === 0) failures.push(`护栏未捕获注入的缺陷：${name}`);
    }
  }
} finally {
  if (work) rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  throw new Error(`Menu contract guard self-test failed:\n  ${failures.join('\n  ')}`);
}

console.log(`Menu contract guard: baseline green + ${CASES.length} injected defects all rejected (schema → registry → i18n → rust chain)`);
