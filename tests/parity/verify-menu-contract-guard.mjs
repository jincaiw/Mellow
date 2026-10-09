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
  // §10b（2026-09-30）：菜单护栏现在还检查 dump 生成器（既不得制造幻影 diff、
  // 也不得静默跳过真实变更），故沙箱必须一并复制它，否则每个用例都会因
  // 「生成器不存在」而失败 —— 那不是被注入的缺陷，是沙箱缺文件（假阳性）。
  'tests/benchmark/generate-typora-menu-dump.mjs': 'tests/benchmark/generate-typora-menu-dump.mjs',
  // §1b（2026-09-30）：菜单护栏现在还**真的读取并逐条比对**跨入口菜单合同，
  // 故沙箱必须一并复制它，否则每个用例都会因「合同不存在」失败（沙箱缺文件 ≠ 被注入的缺陷）。
  'packages/commands/src/menuContract.ts': 'packages/commands/src/menuContract.ts',
  // §4.217（2026-10-09）：菜单护栏新增了「`LS_CHECKED_SETTINGS` 的第一列必须是真实设置 id」的
  // 双向核对（真值源 = 设置 schema）⇒ 沙箱必须一并复制它，否则每个用例都会因
  // 「文件不存在」失败（沙箱缺文件 ≠ 被注入的缺陷）。
  'packages/settings/src/index.ts': 'packages/settings/src/index.ts',
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
const patch = (file, mutate) => writeFileSync(file, mutate(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));

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
    "    { kind: 'command', id: 'file.trash', labelKey: 'menu.file.trash' },\n    { kind: 'separator' },\n    // B1（SDI）：⌘W = 关闭窗口（mac Typora 真值：File→Close = performClose: 关窗口，非关标签）\n    { kind: 'command', id: 'file.closeWindow',",
    "    { kind: 'command', id: 'file.trash', labelKey: 'menu.file.trash' },\n    // B1（SDI）：⌘W = 关闭窗口（mac Typora 真值：File→Close = performClose: 关窗口，非关标签）\n    { kind: 'command', id: 'file.closeWindow',"))],
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
  // ── §10b dump 生成器：两个方向都要被拒（2026-09-30）────────────────────
  ['dump 生成器退化为无条件重写（幻影 diff 回归）', () => patch(
    join(work, 'tests/benchmark/generate-typora-menu-dump.mjs'),
    (s) => s.replace('if (existingRaw && stripStamp(existingRaw) === stripStamp(next)) {', 'if (false) {'))],
  ['dump 生成器跳过写入（基线静默过期）', () => patch(
    join(work, 'tests/benchmark/generate-typora-menu-dump.mjs'),
    (s) => s.replace('writeFileSync(OUT, next);', '/* removed */'))],
  ['dump 生成器时间戳归一化过度（把真实变更也抹平）', () => patch(
    join(work, 'tests/benchmark/generate-typora-menu-dump.mjs'),
    (s) => s.replace('/^GENERATED_AT: .*$/m', '/^.*$/m'))],
  // ── §1b 跨入口菜单合同：与 schema 脱节必须被拒（2026-09-30）──────────────
  ['菜单合同：命令归属漂移（format.bold → paragraph）', () => patch(
    join(work, 'packages/commands/src/menuContract.ts'),
    (s) => s.replace("{ id: 'format.bold', menu: 'format' },", "{ id: 'format.bold', menu: 'paragraph' },"))],
  ['菜单合同：顶层顺序漂移（file ↔ edit 互换）', () => patch(
    join(work, 'packages/commands/src/menuContract.ts'),
    (s) => s.replace("  'file',\n  'edit',", "  'edit',\n  'file',"))],
  ['菜单合同：引用 schema 中不存在的命令', () => patch(
    join(work, 'packages/commands/src/menuContract.ts'),
    (s) => s.replace("{ id: 'file.new', menu: 'file' },", "{ id: 'file.ghostCommand', menu: 'file' },"))],
  // ── messages.ts：双语契约 ─────────────────────────────────────────────
  ['菜单文案漏译（en 置空）', () => patch(messages(), (s) => s.replace(
    "'menu.file.new': 'New',",
    "'menu.file.new': '',"))],
  ['菜单文案缺失（en 整行删除）', () => patch(messages(), (s) => s.replace(
    "  'menu.file.new': 'New',\n",
    ''))],
  // §12 官方文案合同：真值漂移必须被拒（含本轮新纳入合同的条目）
  ['文案偏离官方真值（en：Open Quickly → Quick Open）', () => patch(messages(), (s) => s.replace(
    "'menu.quickOpen.open': 'Open Quickly',",
    "'menu.quickOpen.open': 'Quick Open',"))],
  ['文案偏离官方真值（en：Save All → Save All Open Files）', () => patch(messages(), (s) => s.replace(
    "'menu.file.saveAll': 'Save All',",
    "'menu.file.saveAll': 'Save All Open Files',"))],
  ['文案偏离官方真值（zh：移动所有图片到 → 移动全部到 asset 目录）', () => patch(messages(), (s) => s.replace(
    "'menu.image.moveAll': '移动所有图片到',",
    "'menu.image.moveAll': '移动全部到 asset 目录',"))],
  // ── §12b enabled 通道：空态占位必须两端贯通 ───────────────────────────
  ['最近文件空态占位被改名（recent.empty）', () => patch(schema(), (s) => s.replace(
    "            id: 'recent.empty',",
    "            id: 'recent.placeholder',"))],
  ['最近文件空态占位未灰显（enabled: false → true）', () => patch(schema(), (s) => s.replace(
    'enabled: false,',
    'enabled: true,'))],
  ['Rust 丢弃 enabled（占位项退化为可点击的空操作）', () => patch(menuRs(), (s) => s.replace(
    'enabled.unwrap_or(true)',
    'true'))],
  // ── §14 命令面板文案：漏译与形态漂移 ──────────────────────────────────
  ['命令面板中文漏译（quickOpen.open 的 zh 改回英文）', () => patch(appTsx(), (s) => s.replace(
    "localizedTitle: { zh: '快速打开', en: 'Open Quickly' }",
    "localizedTitle: { zh: 'Open Quickly', en: 'Open Quickly' }"))],
  ['命令面板新增未登记的 localizedTitle 形态（§14 会静默漏检）', () => patch(appTsx(), (s) => s.replace(
    'localizedTitle: { zh, en },',
    'localizedTitle: { zh: zh, en: en },'))],
  // ── menu.rs：materialization 边界（§7.4 硬规则 6）─────────────────────
  ['主题硬编码进 Rust', () => patch(menuRs(), (s) => `${s}\nconst _HARDCODED_THEMES: &[&str] = &["mellow-light"];\n`)],
  ['Rust 复活旧状态同步命令', () => patch(menuRs(), (s) => `${s}\nfn set_spellcheck_state() {}\n`)],
  ['Rust 引入 target_os 平台分叉', () => patch(menuRs(), (s) => `${s}\n#[cfg(target_os = "windows")]\nfn _win_only_menu() {}\n`)],
];

const failures = [];

// ── 元判据（2026-10-09，审计 §4.217）：**沙箱复制面必须覆盖护栏的读面** ──────────────────
// 【为什么】`FILES` 是**手写清单**；护栏一旦**新读一个文件**而这里没同步，**每个用例都会因
//   「文件不存在」失败** —— 那是**沙箱缺文件**（**假阳性**），不是被注入的缺陷。
//   本仓已两次踩到（见 `FILES` 里的 §10b / §1b 注释），第三次就是本轮（设置 schema）⇒ **机械化**。
{
  /** 返回 `src` 里「护栏读了、但沙箱没复制」的路径（判定与 canary **共用**本谓词）。 */
  const unshippedReads = (src) => [...new Set([...src.matchAll(/resolve\(root,\s*'([^']+)'\)/g)]
    .map((m) => m[1]))].filter((p) => !(p in FILES));
  const guardSrc = readFileSync(GUARD, 'utf8');
  const reads = [...new Set([...guardSrc.matchAll(/resolve\(root,\s*'([^']+)'\)/g)].map((m) => m[1]))];
  if (reads.length < 5) {
    failures.push(`沙箱元判据失效：护栏只解析出 ${reads.length} 处 resolve(root, '…')（下限 5 = 2026-10-09 实测 10）—— 谓词漂移`);
  }
  const missing = unshippedReads(guardSrc);
  if (missing.length > 0) {
    failures.push(`沙箱未复制护栏要读的文件：${missing.join('、')} —— \`FILES\` 是**手写清单**，`
      + '护栏新读文件时必须同步（否则**每个用例**都会因「文件不存在」失败 = **假阳性**）');
  }
  // canary：两向（共用 unshippedReads）
  if (unshippedReads("readFileSync(resolve(root, 'no/such/file.ts'), 'utf8')").length !== 1) {
    failures.push('沙箱元判据 canary 失效：漏复制的文件未被检出');
  }
  if (unshippedReads("readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8')").length !== 0) {
    failures.push('沙箱元判据 canary 过宽：已复制的文件被判为缺失');
  }
}
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
