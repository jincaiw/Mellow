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
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
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

// ── ⑧ 自动配对开关的端到端接线（V7-W6，G7-EDIT-12）─────────────────────────
//
// 立节原因：Typora 有「匹配括号和引号」开关（配置键 `noPairingMatch`，默认 `false` 即**默认开启**），
// 而 Mellow 把 `autoCharacterPairs` 写死为 `true` 且无任何 UI —— 用户无法关闭自动配对。
// 该开关横跨**四层**（设置 schema → App 启动/live apply → editor-core wrapper 白名单 →
// vendored CoreEditor 的 compartment + 语言数据 + bridge）。任一层断掉都表现为
// 「设置里能勾但没反应」——**屏幕上看不出来**，故逐层锁死。
{
  const coreEditorExtensions = read('packages/editor-core/CoreEditor/src/extensions.ts');
  const coreEditorMarkdown = read('packages/editor-core/CoreEditor/src/styling/markdown.ts');
  const coreEditorBridge = read('packages/editor-core/CoreEditor/src/bridge/web/config.ts');

  if (!/id: 'editor\.autoPair'.*defaultValue: true.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail('settings 缺少 editor.autoPair（或默认值/applyCommand 不符）：Typora「匹配括号和引号」默认开启');
  }
  if (!/id: 'editor\.markdownSyntaxPairs'.*defaultValue: false.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail('settings 缺少 editor.markdownSyntaxPairs（或默认值/applyCommand 不符）：Typora autoPairExtendSymbol 默认关闭');
  }
  if (!/def\.id === 'editor\.markdownSyntaxPairs'\) host\?\.setEditorConfig\('setMarkdownSyntaxPairs', \{ enabled: Boolean\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 markdownSyntaxPairs live apply（setEditorConfig('setMarkdownSyntaxPairs')）");
  }
  if (!/settingById\('editor\.markdownSyntaxPairs'\)[\s\S]{0,260}?setEditorConfig\('setMarkdownSyntaxPairs', \{ enabled: true \}\)/.test(appSource)) {
    fail('App.tsx 缺少 markdownSyntaxPairs 启动恢复下发');
  }
  if (!/'setMarkdownSyntaxPairs'/.test(coreSource)) fail("editor-core wrapper 白名单缺少 'setMarkdownSyntaxPairs'");
  if (!/def\.id === 'editor\.autoPair'\) host\?\.setEditorConfig\('setAutoPair', \{ enabled: Boolean\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 editor.autoPair 的 live apply（setEditorConfig('setAutoPair')）");
  }
  if (!/settingById\('editor\.autoPair'\)[\s\S]{0,240}?setEditorConfig\('setAutoPair', \{ enabled: false \}\)/.test(appSource)) {
    fail('App.tsx 缺少 editor.autoPair 的启动恢复下发（重启后开关会失效）');
  }
  if (!/'setAutoPair'/.test(coreSource)) {
    fail("editor-core wrapper 的 setEditorConfig 白名单缺少 'setAutoPair' —— 调用会被静默丢弃");
  }
  if (!/setAutoPair\(\{ enabled \}/.test(coreEditorBridge)) {
    fail('CoreEditor bridge 缺少 setAutoPair 消息 —— 前端下发无处接收');
  }
  if (!/autoPairCompartment\.of\(autoPairExtensions\(\)\)/.test(coreEditorExtensions)) {
    fail('CoreEditor extensions.ts 的 closeBrackets 未纳入 autoPairCompartment → 运行时开关无效');
  }
  if (/window\.config\.autoCharacterPairs \? closeBrackets\(\)/.test(coreEditorExtensions)) {
    fail('CoreEditor 仍在装配期静态判断 autoCharacterPairs → 无法运行时关闭配对');
  }
  // CM6 的 closeBrackets **优先读语言数据**，故语言数据覆盖必须与 closeBrackets 同进同退
  if (!/markdownLanguage\.data\.of\(\{ closeBrackets: \{ brackets: AUTO_PAIR_BRACKETS \} \}\)/.test(coreEditorMarkdown)) {
    fail('Markdown 语言数据的括号集覆盖未随开关一起进出（CM6 优先读语言数据，漏一处则「关不干净」）');
  }
  if (!/if \(!window\.config\.autoCharacterPairs\) return \[\];/.test(coreEditorMarkdown)) {
    fail('autoPairExtensions() 未在关闭时返回空数组');
  }
  const inputSource = read('packages/editor-core/CoreEditor/src/modules/input/index.ts');
  if (!/window\.config\.autoMarkdownSyntaxPairs === true/.test(inputSource)) {
    fail('modules/input 未读取 autoMarkdownSyntaxPairs（第二个开关不会影响实际输入辅助）');
  }
  // 选区包裹必须走第二个开关（否则两个 Typora 开关只是名义拆分）
  if (/autoCharacterPairs && marksToWrap/.test(inputSource)) {
    fail('选区包裹仍复用 autoCharacterPairs：两个 Typora 开关未真正拆分');
  }
  // ⚠️ 反向断言（2026-09-15 修正）：**围栏展开必须挂 autoCharacterPairs，不得挂 autoMarkdownSyntaxPairs**。
  // 起因：拆分时曾把 `insert === '`'` 一并挪到默认关闭的新开关下 → **输入 ``` 不再展开代码块**
  // （默认行为回归），而当时无任何测试覆盖。一手证据（main.js 的 autoPairExtendSymbol 全部 5 处命中点）
  // 表明该偏好**不含**围栏展开。故此处锁「必须挂在 autoCharacterPairs（默认 true）下」。
  if (!/if \(autoCharacterPairs && insert === '`'\)/.test(inputSource)) {
    fail("围栏展开（insert === '`'）必须挂在 autoCharacterPairs 下 —— 挂到默认关闭的 autoMarkdownSyntaxPairs 会让「输入 ``` 展开代码块」默认失效（曾发生）");
  }
  if (/autoMarkdownSyntaxPairs && insert === '`'/.test(inputSource)) {
    fail("围栏展开不得挂 autoMarkdownSyntaxPairs（Typora 的 autoPairExtendSymbol 不含围栏展开，且该开关默认关闭）");
  }
  const driftedExt = coreEditorExtensions.replace(
    'autoPairCompartment.of(autoPairExtensions())',
    'window.config.autoCharacterPairs ? closeBrackets() : []',
  );
  if (driftedExt === coreEditorExtensions) {
    fail('自动配对 canary 未武装：无法注入「装配期静态判断」漂移（锚点漂移，请更新护栏）');
  } else if (/autoPairCompartment\.of\(autoPairExtensions\(\)\)/.test(driftedExt)) {
    fail('自动配对 canary 失效：注入的装配期静态判断未被检出');
  }
}

// ── ⑨ 保存时补文末换行（V7-W6，G7-FEAT-12）─────────────────────────────────
//
// 立节原因：Typora「Insert Final New Line On Save」（配置键 `preferFinalNewline`，默认 false）
// 在 Mellow 侧此前**无实现**。该能力落在**保存路径**上，而保存路径有**两处**
// （handleSave / handleSaveAs）—— 只接一处就会出现「另存为时行为不同」这类
// **屏幕上看不出来**的偏差，故锁「不变量」而非字面量：
// **任何 `documents.save(...)` 都不得直接把原始 content 交给宿主**。
{
  const finalNewlineSource = read('packages/app-core/src/finalNewline.ts');

  if (!/id: 'files\.finalNewline'.*type: 'toggle'.*defaultValue: false/.test(settingsSource)) {
    fail('settings 缺少 files.finalNewline（或不是默认关闭的 toggle）：Typora preferFinalNewline 默认 false');
  }
  // 语义锁：默认关闭时短路（零影响）、按 EOL 追加、且**不得**删除/裁剪内容
  const fnBody = finalNewlineSource.slice(finalNewlineSource.indexOf('export function applyFinalNewline'));
  if (!/if \(!enabled\) return content;/.test(fnBody)) {
    fail('applyFinalNewline 未在关闭时短路 —— 默认关闭必须对既有行为零影响');
  }
  if (!/if \(content\.endsWith\('\\n'\)\) return content;/.test(fnBody)) {
    fail("applyFinalNewline 未判定「已有文末换行」（应以 endsWith('\\n') 判定，含 CRLF 结尾）");
  }
  if (!/return content \+ \(eol === '\\r\\n' \? '\\r\\n' : '\\n'\);/.test(fnBody)) {
    fail('applyFinalNewline 未按文档 EOL 追加（CRLF 文档须补 \\r\\n）');
  }
  if (/\.replace\(|\.trim\(|\.slice\(/.test(fnBody)) {
    fail('applyFinalNewline 不得删除或裁剪已有换行 —— Typora 语义是「缺失时追加」，不是「规范化」');
  }
  // 不变量：不得有绕过该变换的保存路径（两处 save 都必须走 applyFinalNewline）
  const rawSave = /documents\.save\([^)]*,\s*content\s*,/.test(appSource);
  if (rawSave) {
    fail('存在绕过 applyFinalNewline 的保存路径（把原始 content 直接交给 documents.save）—— 另存为/保存行为会不一致');
  }
  if ((appSource.match(/applyFinalNewline\(/g) ?? []).length < 2) {
    fail('App.tsx 中 applyFinalNewline 的调用点少于 2 处（handleSave / handleSaveAs 都要接）');
  }
  // 注意：必须用 /g —— `String.replace(str, …)` 只替换**首个**匹配，只会改到声明处，
  // 调用点仍是 contentToWrite，漂移不会被检出（canary 会误报「失效」）。
  const saveDrift = appSource.replace(/contentToWrite/g, 'content');
  if (saveDrift === appSource) {
    fail('文末换行 canary 未武装：无法注入「绕过变换」漂移（锚点漂移，请更新护栏）');
  } else if (!/documents\.save\([^)]*,\s*content\s*,/.test(saveDrift)) {
    fail('文末换行 canary 失效：注入的「绕过变换」未被检出');
  }
}

// ── ⑩ 「Tab 键缩进」的端到端接线（V7-W6，G7-EDIT-13）────────────────────────
//
// 立节原因：Typora 有「默认缩进」（`indentSize`，默认 **2 空格**）与「使用Tab」（`indentByTab`，默认 false），
// 而 Mellow **从未调用**引擎早已提供的 `setTabKeyBehavior` → Tab 一直落到引擎默认 `insertTab`
// （插入**裸制表符**；行首制表符在 CommonMark 里是缩进代码块，属真实隐患）。
//
// ⚠️ 本节同时锁一个**反例**（比正例更值钱）：**不得改用 `setIndentUnit` 实现该设置** ——
// 2026-09-14 探针实测（Playwright，真机 iframe）：`indentUnit` facet 在 Mellow **无任何消费方**
// （设 2 空格 / 4 空格 / 制表符，`abc`+Tab 与 `- a`+Tab 与列表续写行为**完全一致**）→ 用它做出来的是
// **空开关**（设置里能选、毫无效果）。把「实测过」这件事固化进护栏，防止后来者「顺手」换回去。
{
  if (!/id: 'editor\.tabBehavior'.*defaultValue: 'twoSpaces'.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail("settings 缺少 editor.tabBehavior（或默认值/applyCommand 不符）：Typora「默认缩进」默认 2 空格");
  }
  if (!/def\.id === 'editor\.tabBehavior'\) host\?\.setEditorConfig\('setTabKeyBehavior', \{ behavior: tabBehaviorFor\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 editor.tabBehavior 的 live apply（setEditorConfig('setTabKeyBehavior')）");
  }
  if (!/settingById\('editor\.tabBehavior'\)[\s\S]{0,260}?setEditorConfig\('setTabKeyBehavior', \{ behavior: tabBehaviorFor\(/.test(appSource)) {
    fail('App.tsx 缺少 editor.tabBehavior 的启动恢复下发（重启后设置会失效）');
  }
  const tabFn = /function tabBehaviorFor\(value: unknown\): number \{[\s\S]*?\n\}/.exec(appSource)?.[0] ?? '';
  if (tabFn === '') {
    fail('App.tsx 缺少 tabBehaviorFor（设置值 → TabKeyBehavior 枚举值的映射）');
  } else {
    // 枚举真值：insertTab=0 / insertTwoSpaces=1 / insertFourSpaces=2（CoreEditor/modules/indentation/types.ts）
    for (const [label, re] of [['insertTab(0)', /return 0;/], ['insertTwoSpaces(1)', /return 1;/], ['insertFourSpaces(2)', /return 2;/]]) {
      if (!re.test(tabFn)) fail(`tabBehaviorFor 未映射 ${label} —— 枚举值取自 CoreEditor/modules/indentation/types.ts`);
    }
  }
  if (!/'setTabKeyBehavior'/.test(coreSource)) {
    fail("editor-core wrapper 的 setEditorConfig 白名单缺少 'setTabKeyBehavior' —— 调用会被静默丢弃");
  }
  if (/'setIndentUnit'/.test(appSource)) {
    fail('App.tsx 不得用 setIndentUnit 实现缩进设置：实测该 facet 在 Mellow 无消费方（空开关），应走 tabKeyBehavior');
  }
  const tabDrift = appSource.replace(
    "host?.setEditorConfig('setTabKeyBehavior', { behavior: tabBehaviorFor(value) })",
    'undefined',
  );
  if (tabDrift === appSource) {
    fail('Tab 缩进 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if (/setTabKeyBehavior', \{ behavior: tabBehaviorFor\(value\)/.test(tabDrift)) {
    fail('Tab 缩进 canary 失效：注入的漂移未被检出');
  }
}

// ── ⑫ 「首行缩进」的端到端接线（V7-W6，G7-EDIT-15）──────────────────────────
//
// Typora `indentFirstLine` 默认 false（`window/frame.js` DEFAULT_OPTIONS）；Mellow 此前全仓无实现。
// 该设置必须只作用于普通 Paragraph 的首行，不能叠加到列表/引用/代码块。
{
  const coreEditorExtensions = read('packages/editor-core/CoreEditor/src/extensions.ts');
  const indentSource = read('packages/editor-core/CoreEditor/src/styling/nodes/indent.ts');
  const coreEditorConfig = read('packages/editor-core/CoreEditor/src/styling/config.ts');
  const coreEditorBridge = read('packages/editor-core/CoreEditor/src/bridge/web/config.ts');

  if (!/id: 'editor\.firstLineIndent'.*defaultValue: false.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail('settings 缺少 editor.firstLineIndent（或默认值/applyCommand 不符）：Typora indentFirstLine 默认 false');
  }
  if (!/def\.id === 'editor\.firstLineIndent'\) host\?\.setEditorConfig\('setFirstLineIndent', \{ enabled: Boolean\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 firstLineIndent 的 live apply（setEditorConfig('setFirstLineIndent')）");
  }
  if (!/settingById\('editor\.firstLineIndent'\)[\s\S]{0,260}?setEditorConfig\('setFirstLineIndent', \{ enabled: true \}\)/.test(appSource)) {
    fail('App.tsx 缺少 firstLineIndent 的启动恢复下发');
  }
  if (!/paragraphFirstLineIndentStyle/.test(indentSource) || !/createDecos\(\['Paragraph'\]/.test(indentSource)) {
    fail('CoreEditor 首行缩进必须只创建在 Paragraph 节点上（不得作用于列表/引用/代码块）');
  }
  if (!/text-indent: 2em/.test(indentSource)) {
    fail('CoreEditor 首行缩进缺少 2em text-indent（Typora indentFirstLine 的默认视觉语义）');
  }
  // 注意：`=== true` 不可省 —— `firstLineIndent?: boolean` 是可空布尔，
  // CoreEditor 的 eslint 规则 `@typescript-eslint/strict-boolean-expressions` 要求显式处理 nullish。
  if (!/firstLineIndentCompartment\.of\(window\.config\.firstLineIndent === true \? firstLineIndentExtension\(\) : \[\]\)/.test(coreEditorExtensions)) {
    fail('CoreEditor extensions.ts 未把首行缩进接入 compartment');
  }
  if (!/firstLineIndent\?\.reconfigure\(enabled \? paragraphFirstLineIndentStyle : \[\]\)/.test(coreEditorConfig)) {
    fail('CoreEditor styling/config.ts 缺少首行缩进 live reconfigure');
  }
  if (!/setFirstLineIndent\(\{ enabled \}/.test(coreEditorBridge)) {
    fail('CoreEditor bridge 缺少 setFirstLineIndent 消息');
  }
  if (!/'setFirstLineIndent'/.test(coreSource)) {
    fail("editor-core wrapper 白名单缺少 'setFirstLineIndent'");
  }
  const firstLineDrift = appSource.replace(
    "host?.setEditorConfig('setFirstLineIndent', { enabled: Boolean(value) })",
    'undefined',
  );
  if (firstLineDrift === appSource) {
    fail('首行缩进 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if (/setFirstLineIndent', \{ enabled: Boolean\(value\) \}/.test(firstLineDrift)) {
    fail('首行缩进 canary 失效：注入的漂移未被检出');
  }
}

// ── ⑪ 「导出时保留单换行符」同时作用于两条导出管线（V7-W6，G7-FEAT-13）─────────
//
// 立节原因：Typora 有 `preLinebreakOnExport`（「导出时保留单换行符」，默认 false）。
// Mellow 侧该缺口比 Typora 更**要紧**：Mellow 的 Enter 产出**单个 `\n`**（G7-EDIT-07），
// 而 CommonMark 把段内单换行渲染为空格 → 默认导出时「编辑器里看到的换行在导出件里消失」。
//
// 而 Mellow 有**两条**导出管线（HTML 走 markdown-it；PDF 走自有 parseBlocks），
// 只接一条就会出现「导出 HTML 有换行、导出 PDF 没有」——**屏幕上看不出来**的偏差，故锁「两条都接」。
{
  const exportMarkdown = read('packages/export/src/html/markdown.ts');
  const exportIndex = read('packages/export/src/index.ts');

  if (!/id: 'export\.preserveLineBreaks'.*defaultValue: false/.test(settingsSource)) {
    fail('settings 缺少 export.preserveLineBreaks（或默认值不为 false）：Typora preLinebreakOnExport 默认 false');
  }
  // 管线①：HTML（markdown-it breaks）
  if (!/breaks: ctx\.preserveLineBreaks === true/.test(exportMarkdown)) {
    fail('HTML 导出未把 preserveLineBreaks 接到 markdown-it 的 breaks（导出 HTML 的换行不会被保留）');
  }
  if (/\bbreaks: false\b/.test(exportMarkdown)) {
    fail('HTML 导出仍硬编码 breaks: false —— 开关会失效');
  }
  // 管线②：PDF（自有 parseBlocks 的段落拼接）
  if (!/para\.join\(options\.preserveLineBreaks === true \? '\\n' : ' '\)/.test(exportIndex)) {
    fail("PDF 导出未按 preserveLineBreaks 决定段内拼接（应为 '\\n' / ' '）—— 导出 PDF 的换行不会被保留");
  }
  if (!/parseBlocks\(markdown, \{ preserveLineBreaks: options\.preserveLineBreaks \}\)/.test(exportIndex)) {
    fail('buildPdfDocument 未把 preserveLineBreaks 透传给 parseBlocks');
  }
  // App 侧两条导出路径都必须下发该设置（漏一条 → 其中一种导出格式静默失效）
  const appPreserve = (appSource.match(/preserveLineBreaks: readBoolSetting\('export\.preserveLineBreaks', false\)/g) ?? []).length;
  if (appPreserve < 2) {
    fail(`App.tsx 只在 ${appPreserve} 条导出路径下发了 preserveLineBreaks（应 ≥2：HTML + PDF）—— 漏掉的那种格式会静默失效`);
  }
  const preserveDrift = appSource.replace(/preserveLineBreaks: readBoolSetting\('export\.preserveLineBreaks', false\)/g, 'undefined');
  if (preserveDrift === appSource) {
    fail('导出保留换行 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if ((preserveDrift.match(/preserveLineBreaks: readBoolSetting/g) ?? []).length !== 0) {
    fail('导出保留换行 canary 失效：注入的漂移未被检出');
  }
}

// ── ⑬ 「默认代码块语言」的端到端接线（V7-W6，G7-EDIT-16）────────────────────
//
// Typora 真值（一手证据 window/frame.js DEFAULT_OPTIONS + main.js）：`defaultCodeLang` 默认**空串**；
// `defaultCodeLangOption` 是**位掩码**（`DefaultCodeLangOptionCode = 1` / `...Menu = 2`），
// 默认值 **1** = 只在「输入 Markdown 反引号」通道生效。另支持特殊值 `__LAST`（用上次用过的语言）。
{
  const insertSource = read('packages/editor-core/CoreEditor/src/modules/input/insertCodeBlock.ts');

  if (!/id: 'markdown\.defaultCodeLang'.*type: 'text'.*defaultValue: ''.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail("settings 缺少 markdown.defaultCodeLang（或类型/默认值/applyCommand 不符）：Typora defaultCodeLang 默认空串");
  }
  if (!/def\.id === 'markdown\.defaultCodeLang'\) host\?\.setEditorConfig\('setDefaultCodeLang', \{ lang: String\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 defaultCodeLang 的 live apply（setEditorConfig('setDefaultCodeLang')）");
  }
  if (!/settingById\('markdown\.defaultCodeLang'\)[\s\S]{0,300}?setEditorConfig\('setDefaultCodeLang', \{ lang: defaultCodeLang \}\)/.test(appSource)) {
    fail('App.tsx 缺少 defaultCodeLang 的启动恢复下发');
  }
  if (!/'setDefaultCodeLang'/.test(coreSource)) {
    fail("editor-core wrapper 白名单缺少 'setDefaultCodeLang'");
  }
  // 语言必须只加在**开**围栏：codeBlockFences() 返回 open（带语言）/ close（裸）
  if (!/export function codeBlockFences\(defaultLang: string \| undefined\): \{ open: string; close: string \}/.test(insertSource)) {
    fail('insertCodeBlock 缺少 codeBlockFences 纯函数（单测与护栏的锚点）');
  }
  if (!insertSource.includes('open: `${fence}${sanitizeCodeLang(defaultLang)}`')) {
    fail('codeBlockFences 的开围栏未拼接默认语言');
  }
  if (!insertSource.includes('close: fence')) {
    fail('codeBlockFences 的闭围栏被改动 —— 闭围栏**必须**是裸围栏（`` ```js … ```js `` 是错的）');
  }
  if (!insertSource.includes('${openFence}#{}')) {
    fail('insertCodeBlock 的开围栏未使用 openFence（默认语言不会生效）');
  }
  if (!insertSource.includes('${lineBreak}${closeFence}${trailing}')) {
    fail('insertCodeBlock 的闭围栏未使用 closeFence');
  }
  // 用户设置值必须清洗：反引号/换行/空白会破坏围栏语法（属「输入即写坏文档」）
  if (!insertSource.includes("/[`\\r\\n\\t\\s]+/g, ''")) {
    fail('sanitizeCodeLang 未清洗反引号与空白 —— 用户填错值会破坏围栏语法');
  }
  if (!insertSource.includes('.slice(0, 32)')) {
    fail('sanitizeCodeLang 未限制长度（超长 info string 会挤坏版面）');
  }
  // 纯函数单测必须存在（该行为在 harness 中无法用合成按键走通，见文件头注释）
  if (!/codeBlockFences/.test(read('packages/editor-core/CoreEditor/test/codeBlockFence.test.ts'))) {
    fail('缺少 codeBlockFences 单测（浏览器 harness 无法覆盖该路径，单测是唯一行为锁定）');
  }
  const fenceDrift = insertSource.replace('open: `${fence}${sanitizeCodeLang(defaultLang)}`', 'open: `${fence}`');
  if (fenceDrift === insertSource) {
    fail('默认代码块语言 canary 未武装：注入点未命中');
  } else if (fenceDrift.includes('open: `${fence}${sanitizeCodeLang(defaultLang)}`')) {
    fail('默认代码块语言 canary 失效：注入的漂移未被检出');
  }

  // ── ⑬-b 引擎侧：菜单/快捷键通道（Typora `defaultCodeLangOption` 的 **Menu 位**）──────
  // Typora 的位掩码 `DefaultCodeLangOptionMenu = 2` 即「当通过菜单栏代码插入代码块」。
  // Mellow 的菜单/快捷键插入走引擎 `applyCodeBlock`，故语言必须在这条路径也生效 ——
  // 只做 CoreEditor 的输入通道 = 只实现了 Typora 位掩码的一位（「N 处只做了 1 处」）。
  const toolbarSource = read('packages/editor-engine/src/selectionToolbar.ts');
  if (!/export function applyCodeBlock\(doc: string, range: TextRange, defaultLang = ''\)/.test(toolbarSource)) {
    fail('引擎 applyCodeBlock 未接收默认代码块语言（菜单通道不生效）');
  }
  if (!/applyFenceBlock\(doc, range, '```', sanitizeCodeLang\(defaultLang\)\)/.test(toolbarSource)) {
    fail('applyCodeBlock 未把清洗后的语言传给 applyFenceBlock');
  }
  if (!/const open = `\$\{fence\}\$\{openSuffix\}\\n`/.test(toolbarSource)) {
    fail('applyFenceBlock 的开围栏未拼接 openSuffix（语言不会生效）');
  }
  if (!/case 'codeBlock': return applyCodeBlock\(doc, range, defaultCodeLang\)/.test(toolbarSource)) {
    fail("applyAction 未把 defaultCodeLang 传给 codeBlock 分支");
  }
  if (!/options\?\.defaultCodeLang \?\? ''/.test(toolbarSource)) {
    fail('installFormatApi 未接收/传递 options.defaultCodeLang');
  }
  if (!/action === 'codeBlock'[\s\S]{0,260}?format\(action, \{ defaultCodeLang/.test(appSource)) {
    fail('App.engineFormat 未在 codeBlock 时下发默认语言（引擎不读 window.config，必须宿主传入）');
  }
  // ⚠️ 交叉比对：两个 sanitizer 必须同规则（CoreEditor 与引擎各一份，不做跨包 import）
  const ruleOf = (source) => {
    const m = /replace\(\/\[([^\]]+)\]\+?\/g, ''\)\.slice\(0, (\d+)\)/.exec(source)
      ?? /replace\(\/\[([^\]]+)\]\+?\/g, ''\)/.exec(source);
    return m === null ? null : `${m[1]}|${m[2] ?? ''}`;
  };
  const coreRule = ruleOf(insertSource);
  const engineRule = ruleOf(toolbarSource);
  if (coreRule === null || engineRule === null) {
    fail('未能解析 sanitizeCodeLang 的清洗规则（交叉比对失效）');
  } else if (coreRule !== engineRule) {
    fail(`两处 sanitizeCodeLang 规则漂移：CoreEditor=${coreRule} / engine=${engineRule}（必须同规则）`);
  }
}

// ── ⑭ Typora 偏好项矩阵（G7-QA-05）──────────────────────────────────────
//
// 矩阵 `tests/parity/fixtures/typora-preferences-matrix.json` 是「Typora 每个偏好键各自状态」的
// **唯一登记处**。此前是凭手感挑一项来对标 —— 那种方式永远发现不了没人想到的键。
//
// 与 Typora 的**完备性比对**需要本机 Typora（`tests/parity/tools/audit-typora-preferences.mjs`，
// 与 audit-typora-menu-labels.mjs 同类，**不进 CI**）；此处只锁 CI 可判定的部分：
// 状态合法、无 TODO、无重复键、implemented 条目引用的 Mellow 设置 id 真实存在。
{
  const matrixPath = 'tests/parity/fixtures/typora-preferences-matrix.json';
  let matrix = null;
  try {
    matrix = JSON.parse(read(matrixPath));
  } catch {
    fail(`偏好项矩阵缺失或不是合法 JSON：${matrixPath}`);
  }
  if (matrix !== null) {
    const entries = matrix.entries ?? [];
    if (entries.length === 0) fail('偏好项矩阵为空');
    const knownIds = new Set([...settingsSource.matchAll(/id: '([^']+)'/g)].map((m) => m[1]));
    const seen = new Set();
    const bad = [];
    for (const e of entries) {
      if (seen.has(e.typora)) fail(`偏好项矩阵有重复键：${e.typora}`);
      seen.add(e.typora);
      if (!['implemented', 'gap', 'not-applicable'].includes(e.status)) {
        bad.push(`${e.typora}(status=${e.status})`);
      }
      if (e.status === 'implemented') {
        for (const id of e.mellow ?? []) {
          if (!knownIds.has(id)) bad.push(`${e.typora}→${id}`);
        }
      }
    }
    if (bad.length > 0) fail(`偏好项矩阵非法条目（${bad.length}）：${bad.join(', ')}`);

    // canary：注入一个不存在的设置 id，同一条检查必须检出
    const drift = { entries: [...entries, { typora: '__canary__', status: 'implemented', mellow: ['no.such.setting.id'], note: '' }] };
    const driftBad = drift.entries.some((e) => e.status === 'implemented'
      && (e.mellow ?? []).some((id) => !knownIds.has(id)));
    if (!driftBad) fail('偏好项矩阵 canary 失效：注入的无效设置 id 未被检出');

    // 「登记而非擅改」的 CI 可判定部分：默认值偏离必须带理由；不可比必须写明原因。
    // （与 Typora 的**实际**默认值比对需要本机 Typora，在 audit-typora-preferences.mjs 中做。）
    const badMeta = [];
    for (const e of entries) {
      if (e.deviation !== undefined) {
        const kind = e.deviation?.kind;
        const reason = e.deviation?.reason;
        if (kind !== 'deliberate' && kind !== 'undecided') badMeta.push(`${e.typora}(deviation.kind=${kind})`);
        if (typeof reason !== 'string' || reason.trim() === '') badMeta.push(`${e.typora}(deviation 无理由)`);
      }
      if (e.comparable === false && (typeof e.comparableNote !== 'string' || e.comparableNote.trim() === '')) {
        badMeta.push(`${e.typora}(comparable:false 未写明原因)`);
      }
      if (e.polarity !== undefined && e.polarity !== 'inverted') badMeta.push(`${e.typora}(polarity=${e.polarity})`);
      // 第三层：gap 条目必须标注行为判定（matches-default / differs / unverified）
      if (e.status === 'gap' && !['matches-default', 'differs', 'unverified', 'n/a'].includes(e.behavior)) {
        badMeta.push(`${e.typora}(gap 缺 behavior=${e.behavior})`);
      }
      if (e.behavior === 'differs' && (typeof e.behaviorNote !== 'string' || e.behaviorNote.trim() === '')) {
        badMeta.push(`${e.typora}(behavior=differs 未写明证据)`);
      }
      if (e.behavior !== undefined && e.status !== 'gap') {
        badMeta.push(`${e.typora}(非 gap 条目不应带 behavior)`);
      }
    }
    if (badMeta.length > 0) fail(`偏好项矩阵元数据不完整（${badMeta.length}）：${badMeta.join(', ')}`);
    if (!entries.some((e) => e.deviation !== undefined)) {
      fail('偏好项矩阵没有任何 deviation 条目 —— 与 Typora 的默认值不可能全部一致，疑为登记缺失');
    }

    // 审计工具必须存在（否则「与 Typora 的完备性比对」会随工具丢失而静默消失）
    try {
      read('tests/parity/tools/audit-typora-preferences.mjs');
    } catch {
      fail('缺少偏好项审计工具 tests/parity/tools/audit-typora-preferences.mjs（需本机 Typora，不进 CI）');
    }
  }
}

// ── ⑮ 「代码块缩进宽度」的端到端接线（V7-W6，G7-EDIT-17）────────────────────
//
// Typora 真值（一手证据 window/frame.js DEFAULT_OPTIONS）：`indentSize: 2`（正文）与
// `codeIndentSize: 4`（代码块）是**两个独立偏好**。Mellow 此前只有一个 `editor.tabBehavior`
// 兼管两者 → 实测代码块内按 Tab 得到正文宽度（2 而非 4），属**行为偏离 Typora 默认**。
{
  const indentSource = read('packages/editor-core/CoreEditor/src/modules/indentation/index.ts');

  if (!/id: 'editor\.codeIndentSize'.*type: 'number'.*defaultValue: 4.*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail("settings 缺少 editor.codeIndentSize（或类型/默认值/applyCommand 不符）：Typora codeIndentSize 默认 4");
  }
  if (!/def\.id === 'editor\.codeIndentSize'\) host\?\.setEditorConfig\('setCodeIndentSize', \{ indentWidth: Number\(value\) \}\)/.test(appSource)) {
    fail("App.tsx 缺少 codeIndentSize 的 live apply（setEditorConfig('setCodeIndentSize')）");
  }
  if (!/settingById\('editor\.codeIndentSize'\)[\s\S]{0,300}?setEditorConfig\('setCodeIndentSize', \{ indentWidth/.test(appSource)) {
    fail('App.tsx 缺少 codeIndentSize 的启动恢复下发');
  }
  if (!/'setCodeIndentSize'/.test(coreSource)) {
    fail("editor-core wrapper 白名单缺少 'setCodeIndentSize'");
  }
  // 判定必须沿父链（只看 innermost 节点会漏：光标所在节点是代码文本而非 FencedCode）
  if (!/export function insideCodeBlock\(state: EditorState, pos: number\): boolean \{[\s\S]{0,220}?node\.parent/.test(indentSource)) {
    fail('insideCodeBlock 未沿父链判定（只看 innermost 节点会漏判代码块内）');
  }
  // 只在「空格」两档生效：insertTab 插制表符、indentMore 由 CM 处理
  if (!/behavior === TabKeyBehavior\.insertTwoSpaces \|\| behavior === TabKeyBehavior\.insertFourSpaces[\s\S]{0,120}?insideCodeBlock\(editor\.state, cursor\)/.test(indentSource)) {
    fail('Tab 处理的代码块分支未限定在「空格」两档（insertTab / indentMore 会被误改）');
  }
  if (!/replaceSelections\(' '\.repeat\(codeIndentWidth\(\)\)\)/.test(indentSource)) {
    fail('代码块内 Tab 未使用 codeIndentWidth()');
  }
  // 用户设置值必须夹取：异常值会一次插入超长空白（属「输入即写坏文档」）
  if (!/Math\.min\(16, Math\.max\(1, Math\.round\(raw\)\)\)/.test(indentSource)) {
    fail('codeIndentWidth 未夹取到 1..16 —— 用户填错值会一次插入超长空白');
  }
  const indentDrift = indentSource.replace('replaceSelections(\' \'.repeat(codeIndentWidth()))', 'replaceSelections(\'  \')');
  if (indentDrift === indentSource) {
    fail('代码块缩进宽度 canary 未武装：注入点未命中');
  } else if (indentDrift.includes('replaceSelections(\' \'.repeat(codeIndentWidth()))')) {
    fail('代码块缩进宽度 canary 失效：注入的漂移未被检出');
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Settings contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Settings contract: files id normalized + updater merged into general (storage keys stable); editable shortcuts via schema-preserving override layer (registry + native menu boundaries); recording UX armed; P6 armed: AI default-off (no persisted AI state, PRD §122) + Reader/Palette/Slash hidden-by-default with menu/settings entry points + User CSS entry and appData/user.css injection; slash key drift canary armed; export wiring armed (Pandoc 9-format + Previous Export + Image Export, menu/schema/Rust anchors); W5 armed: 5-min timed auto save (Typora conf.user.json autoSaveTimer default) + interval exposed in GUI (Typora needs hand-editing JSON) + Print = system dialog with no preview window (D-H=②) + non-macOS Page Setup actionable hint (G7-FEAT-01/02/03) + Typora-style layered user CSS (themes/base.user.css → themes/<theme>.user.css → user.css, *.user.css excluded from theme scan); editor auto pair toggle wired end-to-end: settings schema → App startup/live apply → editor-core whitelist → CoreEditor autoPairCompartment + markdown language data + bridge (V7-W6, G7-EDIT-12); final newline on save wired through BOTH save paths with no bypass (V7-W6, G7-FEAT-12); Tab-key indent wired via tabKeyBehavior (NOT the inert indentUnit facet — probe-verified) (V7-W6, G7-EDIT-13); preserve-line-breaks on export wired into BOTH pipelines (markdown-it breaks + PDF parseBlocks) (V7-W6, G7-FEAT-13); first-line indent wired only for Paragraph via CoreEditor compartment + bridge (V7-W6, G7-EDIT-15)');
