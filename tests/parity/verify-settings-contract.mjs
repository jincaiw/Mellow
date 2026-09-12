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
for (const id of ['general.updater.channel', 'general.updater.checkOnStartup', 'general.updater.autoInstall', 'general.updater.checkNow']) {
  if (!settingsSource.includes(`id: '${id}'`)) fail(`updater 条目未归位：缺少 ${id}（P2-2.6）`);
}
// V5.1 自动升级合同（anySSH autoUpdate 模式）：autoInstall 开关 + App 层 release 构建守卫
if (!/storageKey: 'mellow\.updater\.autoInstall', defaultValue: false/.test(settingsSource)) {
  fail('general.updater.autoInstall 必须默认关闭（自动安装需用户显式开启）');
}
if (!/releaseBuildRef\.current !== true/.test(appSource) || !/invoke<boolean>\('is_release_build'\)/.test(appSource)) {
  fail('App.tsx 缺少 is_release_build 安装守卫（dev 构建绝不能自更新）');
}
if (!appSource.includes("mellow.updater.skippedVersion")) {
  fail('App.tsx 缺少跳过此版本记录（mellow.updater.skippedVersion）');
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
if (!/menuCheckTick,\s*shortcutOverrides[^\]]*\]\)/.test(appSource)) {
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
// V7-I1：用户裁决——「用 Reader 打开」「只读模式」从显示菜单移除（命令保留在注册表，
// 仍可经命令面板/Reader 内按钮触达）；menuSchema 不得再含这两个入口。
if (menuSchemaSource.includes("id: 'reader.open'") || menuSchemaSource.includes("id: 'view.readonly.toggle'")) {
  fail('menuSchema 含已裁撤的 reader.open / view.readonly.toggle 菜单入口（V7-I1 应删除）');
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
// V7-W5 起 user CSS 由「单文件」升级为 Typora 式**三层**（base / <theme> / user），
// 锚点相应更新：原 `style.id = 'mellow-user-css'` 字面量已随分层重构消失。
if (!/const USER_CSS_FILE = 'user\.css';/.test(appSource) || !appSource.includes("id: 'mellow-user-css'")) {
  fail('App.tsx 缺少 user.css 加载与 mellow-user-css 注入实现（V4 P6 User CSS，V7-W5 起为三层）');
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
// broken local link indicator（2026-09-03 用户裁决纳入实施；engine spec §12 subtle error indicator）
//    桥链三方：engine 装饰/刷新钩子 → core.ts 转发 → 宿主 exists checker 注入（fs.exists 缓存预取）。
if (!appSource.includes('__MELLOW_MD_LINK_EXISTS__') || !appSource.includes('refreshMdLinks()')) {
  fail('App.tsx 缺少 broken-link exists checker 注入或引擎重绘调用（engine spec §12 broken local link）');
}
const coreSource = read('packages/editor-core/src/core.ts');
if (!coreSource.includes('refreshMdLinks(): void') || !coreSource.includes('__MELLOW_MD_LINK_REFRESH__')) {
  fail('editor-core core.ts 缺少 refreshMdLinks 转发（宿主 → iframe __MELLOW_MD_LINK_REFRESH__）');
}
const mdLinkSource = read('packages/editor-engine/src/mdLink.ts');
for (const anchor of ['__MELLOW_MD_LINK_EXISTS__', 'mellow-mdlink-broken', '__MELLOW_MD_LINK_REFRESH__']) {
  if (!mdLinkSource.includes(anchor)) fail(`mdLink.ts 缺少 broken indicator 锚点 ${anchor}（engine spec §12）`);
}

// ── ⑦ V7-W5 功能域：定时自动保存 + Print / Page Setup（G7-FEAT-01/02/03）────
// 依据 Typora 官方《Auto Save》支持文档：macOS 自动保存为 NSDocument 系统特性（始终开）；
// Windows / Linux 默认**每 5 分钟**保存一次，间隔藏在 conf/conf.user.json 的
// `autoSaveTimer`（Double / minute / 默认 5），GUI 不可达。Mellow 对齐 5 分钟默认
// 并把间隔暴露到 GUI（B 级增强）。护栏锁定：默认值、解析函数、定时器接线、i18n 双语。
const autosaveSource = read('packages/app-core/src/autosave.ts');
if (!/export const DEFAULT_AUTOSAVE_MINUTES = 5;/.test(autosaveSource)) {
  fail('app-core/autosave.ts 的 DEFAULT_AUTOSAVE_MINUTES 必须为 5（Typora conf.user.json autoSaveTimer 默认值）');
}
for (const fn of ['export function parseAutosaveMinutes', 'export function isAutosaveEnabled', 'export function autosaveIntervalMs']) {
  if (!autosaveSource.includes(fn)) fail(`app-core/autosave.ts 缺少 ${fn}（G7-FEAT-03 定时保存策略）`);
}
if (!settingsSource.includes("id: 'files.autosaveTimer'")) {
  fail('Settings schema 缺少 files.autosaveTimer（G7-FEAT-03：Typora 该配置 GUI 不可达，Mellow 暴露为设置项）');
}
if (!/id: 'files\.autosaveTimer'.*storageKey: 'mellow\.file\.autosaveTimer', defaultValue: '5'/s.test(settingsSource)) {
  fail('files.autosaveTimer 必须 storageKey=mellow.file.autosaveTimer 且 defaultValue=5（与 Typora 默认一致）');
}
for (const anchor of ['parseAutosaveMinutes,', 'isAutosaveEnabled,', 'autosaveIntervalMs,']) {
  if (!appSource.includes(anchor)) fail(`App.tsx 未导入 ${anchor.replace(',', '')}（定时保存断链）`);
}
// 定时器必须真实存在且随开关/间隔重排（否则「改了设置不生效」）。
// 用**单一正则**同时锁定三要素（setInterval → maybeAutoSaveRef → autosaveIntervalMs），
// 避免「别处也有 setInterval」造成假绿；canary 复用同一函数做变异复检。
const AUTOSAVE_TIMER_RE = /window\.setInterval\(\(\) => \{[\s\S]{0,200}?maybeAutoSaveRef\.current\?\.\(\)[\s\S]{0,200}?autosaveIntervalMs\(autosaveMinutes\)/;
const autosaveTimerWired = (src) => AUTOSAVE_TIMER_RE.test(src);
if (!autosaveTimerWired(appSource)) {
  fail('App.tsx 缺少定时自动保存 setInterval（maybeAutoSaveRef + autosaveIntervalMs 三要素，G7-FEAT-03）');
}
if (!/\}, \[autosaveEnabled, autosaveMinutes\]\);/.test(appSource)) {
  fail('定时保存 effect 依赖必须为 [autosaveEnabled, autosaveMinutes]（开关/间隔变更须重排定时器）');
}
if (!/case 'settings\.autosaveTimer':/.test(appSource)) {
  fail("App.tsx applySetting 缺少 'settings.autosaveTimer' 分支（设置变更无法生效）");
}
// G7-FEAT-01（D-H = ②）：Typora 只有 Print / Page Setup，**没有**打印预览窗口
// （证据：tests/benchmark/fixtures/typora-menu-dump.txt 仅含 "Print" 与 "Page Setup"）。
// 护栏禁止 printPreview 复活，避免未裁决的 UI 分叉。
if (!appSource.includes("id: 'file.print'") || !appSource.includes("invoke('print_window')")) {
  fail('App.tsx 缺少 file.print → print_window 接线（Typora File → Print 直接调系统打印对话框）');
}
const hasPrintPreview = (app, schema) => /file\.printPreview/.test(app) || /file\.printPreview/.test(schema);
if (hasPrintPreview(appSource, menuSchemaSource)) {
  fail('出现 file.printPreview：Typora 无打印预览窗口（D-H 裁决 = ②），不得复活（G7-FEAT-01）');
}
// G7-FEAT-02：非 macOS 无系统页面设置面板 → 必须是**可操作提示**，不能静默失败或空转 Err
if (!/if \(!platformMac\) \{[\s\S]*?file\.pageSetup\.unsupportedHint/.test(appSource)) {
  fail('file.pageSetup 缺少 platformMac 守卫 + unsupportedHint 可操作提示（G7-FEAT-02）');
}
for (const key of ['settings.file.autosaveTimer', 'settings.file.autosaveTimerDesc', 'msg.autosaveTimer', 'file.pageSetup.unsupportedHint']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`W5 文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
}
// Typora 式 user CSS 分层（PRD §主题机制；W5「主题」域）：base.user.css（全主题）→
// <themeId>.user.css（主题专属）→ user.css（最高优先级）。层叠顺序必须由**同步按序创建**
// 的三个 style 节点保证，不能按异步 resolve 顺序 append（否则同一份 CSS 表现时好时坏）。
const USER_CSS_LAYER_RE = /mellow-user-css-base[\s\S]{0,400}?mellow-user-css-theme[\s\S]{0,400}?mellow-user-css'/;
const userCssLayered = (src) => USER_CSS_LAYER_RE.test(src);
if (!userCssLayered(appSource)) {
  fail('App.tsx 缺少 Typora 式 user CSS 三层（base → <theme> → user），顺序错误会导致层叠漂移（W5 主题域）');
}
if (!/const USER_CSS_BASE_FILE = 'base\.user\.css';/.test(appSource)) {
  fail('USER_CSS_BASE_FILE 必须为 base.user.css（Typora base.user.css 全局层）');
}
if (!/file: themeUserCssFile\(activeTheme\.id\)/.test(appSource)) {
  fail('主题专属层必须按 activeTheme.id 解析文件名（Typora [theme].user.css）');
}
// user 主题 id 形如 `user/<name>`，`/` 非法文件名 —— 必须剥掉前缀，否则该层永远读不到
if (!/themeId\.replace\(\/\^user\\\/\/, ''\)/.test(appSource)) {
  fail('themeUserCssFile 必须剥离 user/ 前缀（用户主题 id 含 `/`，直接拼文件名会永远读不到）');
}
// 目录必须与 Typora 一致：base / <theme> 两层在 **themes 目录**
if (!/const USER_THEMES_DIR = 'themes';/.test(appSource) || !/subDir: USER_THEMES_DIR/.test(appSource)) {
  fail('user CSS 的 base / <theme> 两层必须位于 themes 目录（Typora 机制；Mellow 既有 user.css 在 appData 根）');
}
// *.user.css 不是主题：主题扫描必须排除，否则菜单出现 "base.user" 伪主题
const userThemesSource = read('apps/desktop/src/host/userThemes.ts');
if (!/endsWith\('\.user\.css'\)\) continue;/.test(userThemesSource)) {
  fail('host/userThemes.ts 未排除 *.user.css（会被注册成名为 base.user 的伪主题，V7-W5）');
}
if (!/\}, \[activeTheme\.id\]\);/.test(appSource)) {
  fail('user CSS 分层 effect 依赖必须含 activeTheme.id（切主题后专属层不刷新 = 旧主题样式残留）');
}
// 读取失败必须**清空**而非保留旧内容（切到无专属 CSS 的主题时旧样式必须立即失效）
if (!/\} catch \{[\s\S]{0,200}?nodes\[i\]\.textContent = '';/.test(appSource)) {
  fail('user CSS 读取失败未清空节点（主题切换后旧主题专属样式会残留）');
}
// drift canary（W5）：变异复检 —— 把「已捕获的锚点片段」整体抹掉，护栏必须转为失败态。
// 若抹掉后仍判定为已接线，说明断言锚点选错（例如命中了别处的 setInterval），护栏是假绿。
const timerAnchor = appSource.match(AUTOSAVE_TIMER_RE)?.[0];
if (timerAnchor === undefined) {
  fail('W5 契约护栏自检失败：无法提取定时保存锚点片段，护栏已失效');
} else {
  const driftedApp = appSource.replace(timerAnchor, '/* drifted: autosave timer removed */');
  if (autosaveTimerWired(driftedApp)) {
    fail('W5 契约护栏自检失败：定时保存接线被抹除后仍判定为已接线（假绿），护栏已失效');
  }
}
if (!hasPrintPreview(`${appSource}\n{ id: 'file.printPreview' }`, menuSchemaSource)) {
  fail('W5 契约护栏自检失败：注入 file.printPreview 未被检出，护栏已失效');
}
const cssLayerAnchor = appSource.match(USER_CSS_LAYER_RE)?.[0];
if (cssLayerAnchor === undefined) {
  fail('W5 契约护栏自检失败：无法提取 user CSS 分层锚点，护栏已失效');
} else if (userCssLayered(appSource.replace(cssLayerAnchor, "'mellow-user-css'"))) {
  fail('W5 契约护栏自检失败：user CSS 分层被抹除后仍判定为已分层（假绿），护栏已失效');
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Settings contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Settings contract: files id normalized + updater merged into general (storage keys stable); editable shortcuts via schema-preserving override layer (registry + native menu boundaries); recording UX armed; P6 armed: AI default-off (no persisted AI state, PRD §122) + Reader/Palette/Slash hidden-by-default with menu/settings entry points + User CSS entry and appData/user.css injection; slash key drift canary armed; export wiring armed (Pandoc 9-format + Previous Export + Image Export, menu/schema/Rust anchors); W5 armed: 5-min timed auto save (Typora conf.user.json autoSaveTimer default) + interval exposed in GUI (Typora needs hand-editing JSON) + Print = system dialog with no preview window (D-H=②) + non-macOS Page Setup actionable hint (G7-FEAT-01/02/03) + Typora-style layered user CSS (themes/base.user.css → themes/<theme>.user.css → user.css, *.user.css excluded from theme scan)');
