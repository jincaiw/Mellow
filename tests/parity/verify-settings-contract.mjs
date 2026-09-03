/**
 * Settings 契约护栏（P2-2.6：快捷键可编辑 / file id 归一 / updater 归位）
 *
 * ① 一级导航对齐 Typora：'files'（复数）替代 'file'；独立 'updater' section 移除，
 *    条目并入 'general'（general.updater.*，storageKey 保持不变，避免用户设置丢失）。
 * ② 快捷键可编辑 = override 层：menuSchema 仍是默认值唯一真源（§7.4 硬规则 2），
 *    用户录制键位存 localStorage（mellow.shortcuts.overrides），仅在装配边界生效：
 *    - App registry 注入（SCHEMA_SHORTCUTS 之后、register 之前）；
 *    - native menu spec（toNativeMenuSpec materialization）。
 * ③ SettingsPanel 录制交互：点击录制、Esc 取消、Backspace/Delete 恢复默认、
 *    capture-phase keydown 抢先消费、无修饰键不生效。
 * ④ i18n：录制相关文案 zh/en 双语。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const settingsSource = read('packages/settings/src/index.ts');
const settingsTestSource = read('packages/settings/test/index.test.ts');
const menuSchemaSource = read('packages/commands/src/menuSchema.ts');
const appSource = read('apps/desktop/src/App.tsx');
const panelSource = read('apps/desktop/src/SettingsPanel.tsx');
const nativeMenuSource = read('apps/desktop/src/nativeMenu.ts');
const messagesSource = read('packages/i18n/src/messages.ts');
const stylesSource = read('apps/desktop/src/styles.css');

// ── ① file id 归一 + updater 归位 ────────────────────────────────────────
if (/' \| 'file' \|/.test(settingsSource) || /'file' \| 'image'/.test(settingsSource)) {
  fail('SettingsSectionId 仍含单数 file section id（P2-2.6 应归一为 files）');
}
if (!/id: 'files',/.test(settingsSource)) {
  fail('Settings schema 缺少 files section（P2-2.6 file id 归一）');
}
for (const id of ['files.showHidden', 'files.showNonMarkdown', 'files.autosave']) {
  if (!settingsSource.includes(`id: '${id}'`)) fail(`Settings schema 缺少归一后的设置项 ${id}`);
}
for (const key of ['mellow.fileTree.showHidden', 'mellow.fileTree.showNonMarkdown', 'mellow.file.autosave']) {
  if (!settingsSource.includes(`storageKey: '${key}'`)) fail(`files 归一必须保持既有 storageKey（${key}），否则用户设置丢失`);
}
if (/id: 'updater',/.test(settingsSource)) {
  fail('Settings schema 不应再有独立 updater section（P2-2.6 归位到 general）');
}
for (const id of ['general.updater.channel', 'general.updater.checkOnStartup', 'general.updater.checkNow']) {
  if (!settingsSource.includes(`id: '${id}'`)) fail(`updater 条目未归位：缺少 ${id}（P2-2.6）`);
}
if (!settingsTestSource.includes("'files',") || settingsTestSource.includes("'updater',")) {
  fail('settings 单测未同步 P2-2.6 section 合同（files 复数 / 无 updater）');
}

// ── ② override 层：schema 单一真源 + 装配边界生效 ────────────────────────
if (!/export const SHORTCUT_OVERRIDES_KEY = 'mellow\.shortcuts\.overrides';/.test(settingsSource)) {
  fail('settings 包缺少 SHORTCUT_OVERRIDES_KEY（P2-2.6 override 持久化键）');
}
if (!/export function readShortcutOverrides/.test(settingsSource) || !/export function writeShortcutOverrides/.test(settingsSource)) {
  fail('settings 包缺少 shortcut override 读写 helper（P2-2.6）');
}
if (!/shortcutOverrides\?: Readonly<Record<string, \{ mac\?: string; winLinux\?: string \}>>;/.test(menuSchemaSource)) {
  fail('NativeMenuSpecInput 缺少 shortcutOverrides 字段（P2-2.6 native 装配边界）');
}
if (!/override\?\.mac \?\? entry\.shortcut\?\.mac/.test(menuSchemaSource) || !/override\?\.winLinux \?\? entry\.shortcut\?\.winLinux/.test(menuSchemaSource)) {
  fail('toNativeMenuSpec 未按平台应用 override（override 优先于 schema 默认键位，P2-2.6）');
}
if (!appSource.includes('shortcutOverridesRef.current = shortcutOverrides;')) {
  fail('App.tsx 缺少 shortcutOverrides ref 镜像（P2-2.6）');
}
if (!/const handleShortcutOverride = useCallback\(\(commandId: string, accelerator: string \| null\)/.test(appSource)) {
  fail('App.tsx 缺少 handleShortcutOverride（accelerator = null 语义：恢复默认，P2-2.6）');
}
// registry 注入边界：override 必须在 SCHEMA_SHORTCUTS 注入之后、且只覆盖已有 shortcut 的命令
if (!/const override = shortcutOverrides\[command\.id\];[\s\S]*?command\.shortcut !== undefined/.test(appSource)) {
  fail('App.tsx registry 注入未应用 override（或未限定 command.shortcut !== undefined，P2-2.6 单一真源纪律）');
}
if (!/toggleTypewriter, typewriterEnabled, shortcutOverrides\]\)/.test(appSource)) {
  fail('registry effect 依赖缺少 shortcutOverrides（override 变化不会重建 registry，P2-2.6）');
}
if (!appSource.includes('shortcutOverrides,\n    });')) {
  fail('buildNativeMenuSpec 输入缺少 shortcutOverrides（P2-2.6）');
}
if (!/menuCheckTick, shortcutOverrides\]\)/.test(appSource)) {
  fail('native menu effect 依赖缺少 shortcutOverrides（P2-2.6）');
}
if (!nativeMenuSource.includes('shortcutOverrides: inputs.shortcutOverrides,')) {
  fail('nativeMenu.ts 未透传 shortcutOverrides（P2-2.6）');
}
if (!appSource.includes('onShortcutChange={handleShortcutOverride}')) {
  fail('SettingsPanel 挂载缺少 onShortcutChange（P2-2.6）');
}

// ── ③ SettingsPanel 录制交互 ─────────────────────────────────────────────
if (!/const \[recordingId, setRecordingId\] = useState<string \| null>\(null\);/.test(panelSource)) {
  fail('SettingsPanel 缺少录制态 recordingId（P2-2.6 快捷键可编辑）');
}
if (!/event\.key === 'Escape'/.test(panelSource)) {
  fail('录制交互缺少 Esc 取消（P2-2.6）');
}
if (!/event\.key === 'Backspace' \|\| event\.key === 'Delete'/.test(panelSource)) {
  fail('录制交互缺少 Backspace/Delete 恢复默认（P2-2.6）');
}
if (!/window\.addEventListener\('keydown', onKeyDown, true\)/.test(panelSource)) {
  fail('录制 keydown 必须 capture-phase（抢在全局 keydown 前消费，防误触发命令，P2-2.6）');
}
if (!/!event\.ctrlKey && !event\.metaKey && !event\.altKey\) return;/.test(panelSource)) {
  fail('录制必须要求修饰键（无修饰键单击不生效，P2-2.6）');
}
if (!/className=\{`settings-shortcut-edit\$\{recordingId === item\.id \? ' recording' : ''\}`\}/.test(panelSource)) {
  fail('录制按钮缺少 .settings-shortcut-edit.recording 态（P2-2.6）');
}
if (!/\.settings-shortcut-edit\.recording \{/.test(stylesSource)) {
  fail('styles.css 缺少录制态样式（P2-2.6）');
}

// ── ④ i18n 双语 ─────────────────────────────────────────────────────────
for (const key of ['settings.shortcuts.listDesc', 'settings.shortcuts.recording', 'settings.shortcuts.editHint', 'settings.shortcuts.none']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`快捷键录制文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
}
if (messagesSource.includes("'settings.updater.label'")) {
  fail('孤儿文案 settings.updater.label 应删除（updater section 已归位，P2-2.6）');
}

// ── drift canary：护栏必须能抓住契约漂移（防「永远绿」假护栏）─────────────
const driftedSettings = settingsSource.replace("id: 'files',", "id: 'file',");
if (/id: 'file',/.test(driftedSettings) === /id: 'file',/.test(settingsSource)) {
  fail('Settings 契约护栏自检失败：无法模拟 file id 回潮（P2-2.6），护栏已失效');
}

// ── ⑤ P6 discoverability：AI 默认关闭 / Reader·Palette·Slash 默认隐藏与可发现 / User CSS ──
// PRD §122：AI 默认 disabled / no model / no document upload —— schema 层无任何持久化 AI 状态。
if (!/id: 'extensions\.ai',.*type: 'action', storageKey: '', defaultValue: '',/.test(settingsSource)) {
  fail('extensions.ai 必须是纯入口 action（storageKey/d defaultValue 为空、无持久化状态，PRD §122）');
}
if (/storageKey: 'mellow\.ai/.test(settingsSource)) {
  fail('Settings schema 出现 mellow.ai.* 持久化键（PRD §122 AI 默认 disabled，不得有默认开启的 AI 配置）');
}
if (/id: 'ai',/.test(settingsSource)) {
  fail('Settings schema 不应存在独立 ai section（AI 页面默认不存在，AI extension 启用后出现）');
}
// V4 P6.3：Reader / Palette / Slash 默认隐藏（App 侧 UI 初始态均为 false），入口可发现。
if (!/const \[readerOpen, setReaderOpen\] = useState\(false\);/.test(appSource)) {
  fail('App.tsx readerOpen 初始态必须为 false（V4 P6.3 Reader 默认隐藏）');
}
if (!/const \[commandPaletteVisible, setCommandPaletteVisible\] = useState\(false\);/.test(appSource)) {
  fail('App.tsx commandPaletteVisible 初始态必须为 false（V4 P6.3 Palette 默认隐藏）');
}
if (!/const \[slashMode, setSlashMode\] = useState\(false\);/.test(appSource)) {
  fail('App.tsx slashMode 初始态必须为 false（V4 P6.3 Slash UI 默认隐藏）');
}
// 可发现性入口：menu schema 暴露 reader.open 与 commandPalette.open（后者含平台快捷键）。
if (!menuSchemaSource.includes("id: 'reader.open'")) {
  fail('menuSchema 缺少 reader.open 入口（V4 P6.3 Reader 可发现性）');
}
if (!menuSchemaSource.includes("id: 'commandPalette.open'") || !/commandPalette\.open.*mac: 'Cmd\+Shift\+P'/.test(menuSchemaSource)) {
  fail('menuSchema 缺少 commandPalette.open（含 Cmd+Shift+P / Ctrl+Shift+P，V4 P6.3 Palette 可发现性）');
}
// Slash 开关键一致性：App SLASH_ENABLED_KEY 与 settings storageKey 必须同值（drift 哨兵）。
const appSlashKey = appSource.match(/const SLASH_ENABLED_KEY = '([^']+)'/)?.[1];
const schemaSlashKey = settingsSource.match(/id: 'markdown\.slashCommands'.*?storageKey: '([^']+)'/s)?.[1];
if (!appSlashKey || !schemaSlashKey || appSlashKey !== schemaSlashKey) {
  fail(`Slash 开关键漂移：App SLASH_ENABLED_KEY(${appSlashKey}) 与 settings storageKey(${schemaSlashKey}) 不一致（V4 P6.3）`);
}
// User CSS：settings 入口 + App 注入实现（mellow-user-css style 标签，优先级最高）。
if (!settingsSource.includes("id: 'advanced.userCss'")) {
  fail('Settings schema 缺少 advanced.userCss 入口（V4 P6 User CSS 可发现性）');
}
if (!appSource.includes("style.id = 'mellow-user-css'") || !appSource.includes("join(dir, 'user.css')")) {
  fail('App.tsx 缺少 user.css 加载与 mellow-user-css 注入实现（V4 P6 User CSS）');
}
// ⑤ 涉及文案的 zh/en 双语。
for (const key of ['settings.advanced.userCss', 'settings.advanced.userCssDesc', 'settings.extensions.ai', 'settings.extensions.aiDesc', 'settings.markdown.slashCommands']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`P6 可发现性文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
}
// drift canary（P6）：模拟 Slash 默认值回潮（true→false）必须能被上面的键值提取链捕获。
const driftedSlash = settingsSource.replace("id: 'markdown.slashCommands', labelKey: 'settings.markdown.slashCommands', type: 'toggle', storageKey: 'mellow.slashCommands.enabled', defaultValue: true", '...drifted...');
if (driftedSlash === settingsSource) {
  fail('P6 契约护栏自检失败：无法模拟 slashCommands 默认值漂移，护栏已失效');
}

// ── ⑥ Export 接线（2026-09-03 复核固化）：Pandoc 九格式 / Previous Export / Image Export ──
// 背景：P6.3 收口时曾误报三项为「roadmap 观察项」，复核发现均已实现——本节把实现固化为
// 契约锚点，防止未来回归（handler 删除、菜单条目丢失、Rust 侧命令消失）时无告警。
const pandocSource = read('apps/desktop/src-tauri/src/pandoc.rs');
for (const fn of ['const handleExportPandoc', 'const handleExportRepeat', 'const handleExportImage']) {
  if (!appSource.includes(fn)) fail(`App.tsx 缺少 ${fn}（导出接线锚点，2026-09-03 复核确认已实现）`);
}
// Typora 导出子菜单全量条目（menuSchema 单一真源）。
for (const id of ['export.pdf', 'export.html', 'export.htmlPlain', 'export.image', 'export.docx', 'export.odt', 'export.rtf', 'export.epub', 'export.latex', 'export.mediawiki', 'export.rst', 'export.textile', 'export.opml', 'export.repeat']) {
  if (!menuSchemaSource.includes(`id: '${id}'`)) fail(`menuSchema 缺少导出菜单条目 ${id}（Typora 导出子菜单全量对齐）`);
}
if (!/id: 'export\.repeat'[^]*?winLinux: 'Ctrl\+E'/.test(menuSchemaSource)) {
  fail("menuSchema export.repeat 缺少 winLinux: 'Ctrl+E'（Typora ⌃E 语义）");
}
// Pandoc Rust 侧：可用性检测 + 导出 + 导入（无 pandoc 环境 graceful skip 归 cargo test）。
// 用 \b 词边界而非 includes：pandoc_export_renamed 之类超集子串不得假绿（canary 实证过）。
for (const fn of ['pub fn pandoc_available', 'pub fn pandoc_export', 'pub fn pandoc_import']) {
  if (!new RegExp(fn.replace(/ /g, '\\s+') + '\\b').test(pandocSource)) {
    fail(`src-tauri/src/pandoc.rs 缺少 ${fn}（Pandoc 导出/导入 Rust 侧实现）`);
  }
}
// Image Export 设置键一致性：settings storageKey 与 App 消费端键同值（drift 哨兵）。
for (const key of ['mellow.export.image.format', 'mellow.export.image.width', 'mellow.export.image.quality']) {
  if (!settingsSource.includes(`storageKey: '${key}'`)) fail(`Settings schema 缺少图片导出设置 ${key}`);
  if (!appSource.includes(`'${key}'`)) fail(`App.tsx 未消费 ${key}（图片导出设置断链）`);
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Settings contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Settings contract: files id normalized + updater merged into general (storage keys stable); editable shortcuts via schema-preserving override layer (registry + native menu boundaries); recording UX armed; P6 armed: AI default-off (no persisted AI state, PRD §122) + Reader/Palette/Slash hidden-by-default with menu/settings entry points + User CSS entry and appData/user.css injection; slash key drift canary armed; export wiring armed (Pandoc 9-format + Previous Export + Image Export, menu/schema/Rust anchors)');
