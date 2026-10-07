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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
/**
 * ⚠️ **代码文件先剥「整行注释」再断言**（2026-09-30 补）。
 *
 * 本文件的断言几乎都是「纯文本正则 + read(file) 文本匹配」。若不剥注释，
 * 把被断言的代码**注释掉**（开发者停用代码的常见方式）仍会让断言通过 ——
 * 实测：把 insert.ts 里 `const src = buildImageSrcFrom(...)` **两处全部整行注释掉**
 * （真实接线消失、只剩注释文本），本护栏**仍然全绿**：它无法发现「被断言的接线被删」。
 * 这是本仓库反复记录的「注释被计入」失效模式。
 *
 * **只剥整行注释**，不用常见的「行内双斜杠剥离器」：后者会把**字符串/正则里的双斜杠**
 * 也当成注释起点截断（实测：改用后者立刻误报 3 条，而那 3 条的目标文本确实在真实代码里，
 * 是被剥离器误伤）。整行剥离同样能挡住上面那个失效模式，且不会碰行内内容。
 *
 * **风险分级（同日实测）**：用本剥离器重跑，当前代码**仍然全绿**（0 失败）——
 * 即**没有任何断言是「当前靠注释通过」**。故这是**加固**，不是修复现行缺陷。
 */
const stripWholeLineComments = (code) => code
  .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const read = (p) => {
  const raw = readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
  return /\.(ts|tsx|mjs|rs|css)$/.test(p) ? stripWholeLineComments(raw) : raw;
};
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
if (!/toggleTypewriter, typewriterEnabled, (?:clearRecentItems, )?(?:handleOpenImageInBrowser, )?shortcutOverrides\]\)/.test(appSource)) {
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

// ── 宪法侧：PRD §122 的 AI 默认值必须仍在原文里（2026-10-06，审计 §4.82）──────
// 立此条的原因：上面三条断言**在注释里引用 §122**（「PRD §122：AI 默认 disabled /
// no model / no document upload」），但**从未读 PRD**（同 §4.79/§4.80/§4.81 的
// 「引用宪法 ≠ 读宪法」）。若 §122 的默认值被改（例如允许默认启用某个模型），
// 上面那三条就变成**没有宪法依据的要求**，且不会有任何信号。
{
  const prdPath = resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md');
  const prdSrc = existsSync(prdPath) ? readFileSync(prdPath, 'utf8').replace(/\r\n/g, '\n') : '';
  // ⚠️ 判据是**同一个函数对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
  const AI_DEFAULTS122 = ['disabled', 'no model', 'no document upload'];
  const check122 = (sec) => ({
    isP2: /^P2。\s*$/m.test(sec),
    missingDefaults: AI_DEFAULTS122.filter((d) => !sec.includes(d)),
  });
  const at122 = prdSrc.indexOf('# 122.');
  if (at122 < 0) {
    fail('PRD 缺少 §122 AI（AI 默认值的宪法依据）');
  } else {
    const next122 = prdSrc.indexOf('\n# ', at122 + 1);
    const r = check122(prdSrc.slice(at122, next122 < 0 ? prdSrc.length : next122));
    if (!r.isP2) {
      fail('PRD §122 必须声明 AI 为 P2（否则「V1 不交付 AI / 默认关闭」的前提不成立）');
    }
    if (r.missingDefaults.length > 0) {
      fail(`PRD §122 原文里找不到 AI 默认项 ${r.missingDefaults.join(' / ')} —— 宪法改动必须同步本护栏与实现`);
    }
  }
  // canary：**双向**（正样本必须全识别 + 缺一条必须被判为不完整）
  const S122_OK = 'P2。\n\n默认：\n\n- disabled；\n- no model；\n- no document upload。';
  const ok122 = check122(S122_OK);
  if (!ok122.isP2 || ok122.missingDefaults.length > 0) {
    fail('§122 宪法侧护栏 canary 失效：完整样本未被全部识别');
  }
  if (check122(S122_OK.replace('- no model；', '')).missingDefaults.length === 0) {
    fail('§122 宪法侧护栏 canary 失效：缺「no model」的样本竟被判为完整');
  }
  if (check122(S122_OK.replace('P2。', 'P1。')).isP2) {
    fail('§122 宪法侧护栏 canary 失效：P1 样本竟被当作 P2');
  }
}

// ── 「清除最近项」的 状态 ↔ localStorage 必须**成对清理**（2026-10-06，审计 §4.84）──
// 立此条的原因：`App.tsx` 的 `clearRecentItems` 自己声明「**状态与 localStorage 必须同步清理**」
// （G7-MENU-14，Typora 的三档作用域），但**没有任何判据核对这句话** ——
// 全仓对该函数的唯一引用是一处 `useCallback` 依赖数组的正则（只是容忍它出现）。
// ⇒ 只清 state 不清 storage（或反之）时：**界面上已清空、重启后条目又回来**，屏幕上看不出原因。
// 判据（可机械判定）：函数体内 `set*([])` 与 `localStorage.removeItem(...)` **数量必须相等**，
// 且每个被删的键**必须在该文件里真的被写过**（`setItem(KEY`）—— 防「删了一个不存在的键名」的假清理。
{
  const appCode = stripWholeLineComments(appSource);
  const clearBody = /const clearRecentItems = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(appCode)?.[0] ?? '';
  // ⚠️ 判据是**同一个函数对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
  // ⚠️ 键名模式要含**数字**（`[A-Z_][A-Z0-9_]*`）—— 初版写 `[A-Z_]+`，
  // canary 样本 `K1` 因此匹配不上，**canary 当场报错**（正是它该做的事）。
  const clearPairing = (body) => ({
    states: [...body.matchAll(/set[A-Za-z]+\(\[\]\)/g)].length,
    keys: [...body.matchAll(/localStorage\.removeItem\(([A-Z_][A-Z0-9_]*)\)/g)].map((m) => m[1]),
  });
  if (clearBody === '') {
    fail('App.tsx 缺少 clearRecentItems（G7-MENU-14 清除最近项）—— 护栏需同步更新，不要静默漏检');
  } else {
    const { states, keys } = clearPairing(clearBody);
    // 下限：三档作用域（documents / locations / all）⇒ 至少 3 组；低于此值说明解析或实现漂移
    if (states < 3 || keys.length < 3) {
      fail(`clearRecentItems 只解析出 ${states} 个状态清理 / ${keys.length} 个 storage 清理（下限 3 = 三档作用域）—— 判据可能已空转`);
    }
    if (states !== keys.length) {
      fail(`clearRecentItems 的「状态清理」${states} 处与「localStorage 清理」${keys.length} 处**不成对** —— `
        + '只清一侧会让「界面已清空、重启后条目又回来」（G7-MENU-14 声明「必须同步清理」）');
    }
    for (const k of keys) {
      if (!new RegExp(`localStorage\\.setItem\\(${k}`).test(appCode)) {
        fail(`clearRecentItems 删除了 ${k}，但全文件没有 \`localStorage.setItem(${k}\` —— 可能删的是一个写错的键名（假清理）`);
      }
    }
    // canary：三向 —— ①成对样本必须通过 ②去掉一处 removeItem 必须被抓到 ③**放宽谓词**必须被抓到
    const PAIRED = 'setA([]); localStorage.removeItem(K1); setB([]); localStorage.removeItem(K2);';
    const UNPAIRED = 'setA([]); setB([]); localStorage.removeItem(K2);';
    if (clearPairing(PAIRED).states !== clearPairing(PAIRED).keys.length) {
      fail('clearRecentItems 成对护栏 canary 失效：合法成对样本被误判为不成对');
    }
    if (clearPairing(UNPAIRED).states === clearPairing(UNPAIRED).keys.length) {
      fail('clearRecentItems 成对护栏 canary 失效：缺一处 removeItem 的样本竟被判为成对');
    }
    if (clearPairing('setA([]);').keys.length !== 0) {
      fail('clearRecentItems 成对护栏 canary 失效：无 removeItem 的样本竟解析出键');
    }
  }
}

// ── 持久化键必须「在设置 schema，或**显式登记**为有意非设置」（2026-10-06，审计 §4.85）──
// 立此条的原因（§4.84「自称对齐」普查收窄到中风险那一类后的直接产物）：
// 实测有 **21 个 `mellow.*` 键被持久化但不在设置 schema 里** ——
// 它们既不出现在设置页，**也不会被「恢复默认」遍历到**（`restoreAllSettingsDefaults` 只遍历
// `SETTINGS_SECTIONS`）。其中多数是**有意的非设置**（视图/会话状态、最近使用记忆、兜底通道、
// 版本级记忆），但**没有任何东西阻止将来再悄悄加一个** —— 而那正是
// 「设置页里找不到、恢复默认也清不掉」的来源。
//
// 判据：持久化键（存储 API 的字面量键 ∪ `const X = 'mellow.*'` 声明）⊆
// (schema 声明的 `storageKey` ∪ 显式例外表)；例外表**双向**核对（进 schema 或不再使用 ⇒ 报错）。
//
// ⚠️ **扫描面必须同时含两种形态**（2026-10-06 实测踩过）：只扫「存储 API 的字面量键」会漏掉
// **声明为 const 后间接使用**的键（如 `SHORTCUT_OVERRIDES_KEY`）—— 实测只扫前者得 6 个，
// 加上 const 声明得 **21 个**。**「只扫一半的形态 = 漏检一半的对象」**（同 §4.79 的「只核对一半的列」）。
// ⚠️ 范围如实声明：只扫 `apps/desktop/src`、`apps/desktop/scripts`、`packages/**` 的
// `.ts/.tsx/.mjs/.cjs`（**排除 `test/`、`tests/`、`dist/`、`CoreEditor/`**）。
// ⚠️ 不得宽松地扫所有 `'mellow.*'` 字面量：那会把 **CSS 类名**（`mellow-md-image` / `mellow-toc`）
// 也算进来 —— 实测噪声从 21 涨到 90+。用 `mellow.`（**带点**）即可天然排除连字符类名。
const NON_SCHEMA_STORAGE_KEYS = new Map([
  // ── 视图 / 会话状态（Typora 同样不把它们作为偏好）──
  ['mellow.tabs.session', '会话恢复：当前打开的标签列表（app 级，跨窗口共享）'],
  ['mellow.closedFiles', '已关闭文件栈（File → Reopen Closed File ⇧⌘T；有 CLOSED_FILES_LIMIT 上限）'],
  ['mellow.window.bounds', '窗口几何（启动期读取项；**是否记住**由设置 advanced.windowBounds 控制）'],
  ['mellow.sidebar.width', '侧栏宽度（拖拽产生的几何，不是偏好）'],
  ['mellow.sidebar.visible', '侧栏可见性（Cmd+Shift+L / 标题栏按钮；Typora 亦作视图状态）'],
  ['mellow.reader.zoom', 'Reader 缩放倍率（视图状态）'],
  // ── 「最近使用」记忆 ──
  ['mellow.recent.files', '最近打开的文件（G7-MENU-14 清除最近项会清它）'],
  ['mellow.recent.folders', '最近打开的文件夹（同上）'],
  ['mellow.recent.folders.pinned', 'Recent Locations 的固定集合（独立键，避免改动既有 string[] 载荷）'],
  ['mellow.quickOpen.recent', 'Quick Open 的最近项'],
  ['mellow.commandPalette.recent', '命令面板的最近项'],
  ['mellow.fileTree.root', '文件树当前根目录（工作区状态，不是偏好）'],
  ['mellow.export.last', '⌃E「使用上一次设置导出」的**文档级记忆**（按 docPath 绑定；Typora 的 Export Previous 亦非偏好）'],
  // ── 面板/视图选项 ⚠️ **不被「恢复默认」覆盖**（见审计 §4.85 的待裁决登记）──
  ['mellow.fileTree.options', '文件树显示选项（V7-W3.6 自定义显示/隐藏规则）。⚠️ 登记为「已知且非 schema」，'
    + '**不等于已裁决为正确**：它不会被「恢复默认设置」重置 —— 审计 §4.85 已如实登记为待裁决'],
  ['mellow.outline.options', '大纲视图选项。⚠️ 同上：不被「恢复默认」重置，审计 §4.85 登记为待裁决'],
  ['mellow.statusbar.fields', '状态栏**单项可见性**（右键 StatusBar 切换；默认集由 STATUSBAR_DEFAULT_HIDDEN 决定）。'
    + '⚠️ 同上：不被「恢复默认」重置，审计 §4.85 登记为待裁决'],
  // ── 通道 / 兜底键（不是用户设置）──
  ['mellow.engine.features', '引擎特性开关**通道**（构建期注入 + 运行时读）'],
  ['mellow.engine.locale', '引擎 locale 的 **localStorage 兜底键**（桥未就绪时引擎自读，覆盖宿主先于引擎注入的时序）'],
  ['mellow.md.tokens', 'md token 的 **localStorage 兜底键**（同上；桥未就绪时 engine 安装时自读）'],
  ['mellow.shortcuts.overrides', '快捷键 **override 层**（menuSchema 仍是默认值唯一真源）。'
    + '⚠️ `restoreAllSettingsDefaults` 的文档**已明确**「不覆盖快捷键自定义」并给出理由'
    + '（独立 override 层 + 已有逐项恢复），调用方需在文案里说明'],
  // ── 版本级记忆 ──
  ['mellow.updater.skippedVersion', '「跳过此版本」记忆（版本级，不是用户偏好）'],
]);
{
  const SCAN_ROOTS = ['apps/desktop/src', 'apps/desktop/scripts', 'packages'];
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', 'CoreEditor', 'build', 'test', 'tests', '__tests__']);
  const EXTS = ['.ts', '.tsx', '.mjs', '.cjs'];
  // 形态一：存储 API 调用点的**字面量**键
  const STORAGE_CALL = /(?:localStorage\.(?:getItem|setItem|removeItem)|readStored|readEngineFeaturesFromStorage)\s*\(\s*'([^']+)'/g;
  // 形态二：**声明为 const** 后间接使用的键（只扫形态一会漏掉一半，见上方注释）
  const CONST_DECL = /(?:export\s+)?const\s+\w+\s*=\s*'(mellow\.[^']+)'/g;
  const collect = (dir, out) => {
    let entries;
    try { entries = readdirSync(resolve(root, dir), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) collect(rel, out);
      else if (EXTS.includes(e.name.slice(e.name.lastIndexOf('.')))) {
        const src = readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');
        for (const m of src.matchAll(STORAGE_CALL)) out.add(m[1]);
        for (const m of src.matchAll(CONST_DECL)) out.add(m[1]);
      }
    }
    return out;
  };
  const usedKeys = new Set();
  for (const d of SCAN_ROOTS) collect(d, usedKeys);
  const schemaKeys = new Set([...settingsSource.matchAll(/storageKey: '([^']+)'/g)].map((m) => m[1]).filter((k) => k !== ''));
  // 下限：实测基线 = schema 61 / 持久化键 45（2026-10-06）。低于此值说明解析或扫描面漂移。
  if (schemaKeys.size < 50 || usedKeys.size < 40) {
    fail(`持久化键普查解析出 schema ${schemaKeys.size} / 持久化键 ${usedKeys.size}（下限 50 / 40）—— `
      + '扫描面或解析漂移会让本判据**空转**；若确实改过，请同步下调下限并说明');
  }
  // ⚠️ 判据是**同一个函数对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
  const unregisteredOf = (used, schema, exempt) => [...used].filter((k) => !schema.has(k) && !exempt.has(k)).sort();
  const unregistered = unregisteredOf(usedKeys, schemaKeys, NON_SCHEMA_STORAGE_KEYS);
  if (unregistered.length > 0) {
    fail(`这些持久化键**既不在设置 schema、也未登记**：${unregistered.join(', ')} —— `
      + '它们不会出现在设置页，也不会被「恢复默认」清理（restoreAllSettingsDefaults 只遍历 SETTINGS_SECTIONS）。'
      + '要么加进 `packages/settings/src/index.ts`，要么登记进 NON_SCHEMA_STORAGE_KEYS（带理由）');
  }
  // 例外表**双向**：登记了但已进 schema / 已不再被持久化 ⇒ 报错（化石例外会掩盖未来回归）
  for (const [k, reason] of NON_SCHEMA_STORAGE_KEYS) {
    if (schemaKeys.has(k)) {
      fail(`NON_SCHEMA_STORAGE_KEYS 登记了 ${k}，但它**已在设置 schema 里** —— 请删除该例外条目`);
    } else if (!usedKeys.has(k)) {
      fail(`NON_SCHEMA_STORAGE_KEYS 登记了 ${k}，但它**已不再被持久化** —— 请删除该例外条目`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`NON_SCHEMA_STORAGE_KEYS 的 ${k} 缺理由（例外必须带可复核的理由）`);
    }
  }
  // canary：三向 —— ①在 schema 的样本必须通过 ②已登记的样本必须通过 ③**未登记样本必须被识别**
  if (unregisteredOf(new Set(['a.b']), new Set(['a.b']), new Map()).length !== 0) {
    fail('持久化键登记护栏 canary 失效：已在 schema 的样本被误判为未登记');
  }
  if (unregisteredOf(new Set(['a.b']), new Set(), new Map([['a.b', 'r']])).length !== 0) {
    fail('持久化键登记护栏 canary 失效：已登记的样本被误判为未登记');
  }
  if (unregisteredOf(new Set(['a.b']), new Set(), new Map()).join(',') !== 'a.b') {
    fail('持久化键登记护栏 canary 失效：未登记样本未被识别');
  }
  // canary：**形态二**必须真的被扫到（否则「只扫一半的形态」会静默回来）
  if (!CONST_DECL.test("const X_KEY = 'mellow.a.b';")) {
    fail('持久化键登记护栏 canary 失效：const 声明形态未被识别（扫描面只覆盖了一半）');
  }
  if (CONST_DECL.test("const CLS = 'mellow-md-image';")) {
    fail('持久化键登记护栏 canary 过宽：连字符 CSS 类名被误判为持久化键');
  }
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
  // ⚠️ 2026-09-30：此断言原为 `...firstLineIndent'\) host\?\.` —— **锁死了「无大括号单语句」形态**，
  // 于是给它加一条语句（补 setMenuCheckTick）就会被拦。形状锁既会固化缺陷、也会拦住合法改动。
  // 现放宽为：分支体内**确实**下发 setFirstLineIndent(Boolean(value))（允许 `{ … }` 块形态）。
  if (!/def\.id === 'editor\.firstLineIndent'\)\s*\{?\s*host\?\.setEditorConfig\('setFirstLineIndent', \{ enabled: Boolean\(value\) \}\)/.test(appSource)) {
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

    // ── 载体字段的**形状**（2026-10-07，审计 §4.120 / §4.121）────────────────
    // ⚠️ 分工：**形状**在本节（矩阵自己的字段是否齐、kind 与 ref 的形态是否匹配）；
    //    **引用是否真的解析得到**（D 声明行 / 台账 id / ADR 且为 Proposed）在
    //    `verify-release-gate.mjs` —— 那里已持有 D 表解析器、台账与 ADR 三份数据，
    //    放这里会**把同一个 D 表解析器写第二份**（本仓明令避免）。
    //
    // 立此条的原因（实测）：矩阵里 5 条 `deviation.kind === 'undecided'`
    // （`enableHighlight` / `enableSubscript` / `enableSuperscript` / `enableDiagram` / `zoomByMouse`）
    // 与 4 条行为轴的 `behavior: differs`（`autoEscapeImageURL` / `useRelativePathForImg` /
    // `mathFormatOnCopy` / `wordCountDelimiter`）
    // （原为 5 条；`noLegacyMath` 已于 2026-10-07 取证后**改判为 `matches-default`** 并移除 disposition，
    //   见审计 §4.123 —— 该键的**用户可见语义**是「`\( \) \[ \]` 作数学定界符」且默认启用，而 Mellow 已支持）
    // 此前**只出现在 master-plan 的轮次叙述里**，审计的「待裁决项登记表（**唯一声明处**）」**一行都没有**
    // ⇒ 发布门禁据此报 `Pending decisions: 无` —— **项目在机器可读层面声称「没有待裁决项」**。
    // 这正是 ADR-0029 登记表头部自陈的那半句：「要补上这一半**需给标记定机器可读写法**」。
    const badPending = [];
    // 行为轴：`behavior === 'differs'` ⇒ 必须有 `disposition: { kind, ref }`，且形态与 kind 匹配
    // ⚠️ `gap` 的形态必须**排除 `D-XX`** —— 首版写成「`[A-Z0-9]+(-[A-Z0-9]+)+`」（通用「大写连字符」形态），
    //    结果 `D-AK` **也匹配** ⇒ canary 当场抓到「gap 判定不能区分正/负样本」。
    //    台账 id 的实际形态是 `P0-<WORD 或含数字的词>-<三位数>`（如 `P0-I18N-001`）。
    const REF_SHAPE = { deliberate: /^D-[A-Z]{1,2}$/, gap: /^P0-[A-Z0-9]+-\d{3}$/, undecided: /^ADR-\d{4}$/ };
    for (const e of entries) {
      const kind = e.deviation?.kind;
      if (kind === 'undecided') {
        const ref = e.deviation?.pendingRef;
        if (typeof ref !== 'string' || ref.trim() === '') badPending.push(`${e.typora}(undecided 未写 pendingRef)`);
        else if (!/^ADR-\d{4}$/.test(ref.trim())) badPending.push(`${e.typora}(pendingRef 形态非法：${ref})`);
      }
      if (kind === 'deliberate') {
        const carrier = e.deviation?.carrier;
        if (typeof carrier !== 'string' || carrier.trim() === '') {
          badPending.push(`${e.typora}(deliberate 未写 carrier：依据在哪)`);
        }
      }
      if (e.behavior === 'differs') {
        const d = e.disposition;
        if (d === undefined || typeof d !== 'object') {
          badPending.push(`${e.typora}(behavior=differs 未写 disposition)`);
          continue;
        }
        if (!['deliberate', 'gap', 'undecided'].includes(d.kind)) {
          badPending.push(`${e.typora}(disposition.kind=${d.kind})`);
          continue;
        }
        if (typeof d.ref !== 'string' || d.ref.trim() === '') {
          badPending.push(`${e.typora}(disposition 未写 ref)`);
          continue;
        }
        if (!REF_SHAPE[d.kind].test(d.ref.trim())) {
          badPending.push(`${e.typora}(disposition.kind=${d.kind} 的 ref「${d.ref}」形态不匹配：`
            + 'deliberate⇒`D-`+编号 / gap⇒台账 id / undecided⇒`ADR-`+四位编号）');
        }
      }
    }
    if (badPending.length > 0) {
      fail(`偏好项矩阵的「待裁决 / 有意差异」缺机器可读载体（${badPending.length}）：${badPending.join(', ')}`);
    }
    // canary：六向（各字段的「缺 / 形态不匹配 / 合法不误报」），与判据**共用同一份 REF_SHAPE**
    {
      const shapeOk = (kind, ref) => ['deliberate', 'gap', 'undecided'].includes(kind)
        && typeof ref === 'string' && ref.trim() !== '' && REF_SHAPE[kind].test(ref.trim());
      if (shapeOk('deliberate', 'D-AK') !== true || shapeOk('deliberate', 'ADR-0034') !== false) {
        errors.push('偏好项载体形状 canary 失效：deliberate 的 D-XX 判定不能区分正/负样本');
      }
      if (shapeOk('gap', 'P0-EDITOR-005') !== true || shapeOk('gap', 'D-AK') !== false) {
        errors.push('偏好项载体形状 canary 失效：gap 的台账 id 判定不能区分正/负样本');
      }
      if (shapeOk('undecided', 'ADR-0034') !== true || shapeOk('undecided', 'D-AO') !== false) {
        errors.push('偏好项载体形状 canary 失效：undecided 的 ADR 判定不能区分正/负样本');
      }
      if (shapeOk('', 'D-AK') !== false) {
        errors.push('偏好项载体形状 canary 失效：非法 kind 未被拒');
      }
      // 真实数据必须两条轴都还有 undecided（否则本判据会**空转**）
      if (!entries.some((e) => e.deviation?.kind === 'undecided')) {
        errors.push('偏好项载体判据**空转**：矩阵里已无 deviation.undecided —— '
          + '若确实全部裁决完，请把本条判据连同 pendingRef 约定一并收掉，而不是留一个恒真的判据');
      }
      if (!entries.some((e) => e.behavior === 'differs' && e.disposition?.kind === 'undecided')) {
        errors.push('偏好项载体判据**空转**：矩阵里已无 behavior=differs 且 undecided 的条目 —— 同上，请收掉本判据');
      }
    }

    // ── 「面板独有键」登记表的**自洽性**（2026-10-07，审计 §4.126）────────────────
    // 分工与矩阵一致：**覆盖面板集合**需要本机 Typora ⇒ 在
    // `tests/parity/tools/audit-typora-preferences.mjs`（不进 CI）；
    // 这里只锁 **CI 可判定的那一半**：状态合法、引用的 Mellow 设置 id 真实存在、note 非空、条目下限。
    // ⚠️ `unverified` 是**允许**的状态（存量欠债），但**必须**是显式取值 —— 不得用空值糊过去。
    {
      const REG = 'tests/parity/fixtures/typora-panel-only-keys.json';
      let reg = null;
      try { reg = JSON.parse(read(REG)); } catch { fail(`面板独有键登记表缺失或不是合法 JSON：${REG}`); }
      if (reg !== null) {
        const regEntries = reg.entries ?? [];
        if (regEntries.length < 40) {
          fail(`面板独有键登记表只有 ${regEntries.length} 条（下限 40）—— 表被削空会让本判据空转`);
        }
        const VALID_STATUS = new Set(['equivalent', 'gap', 'not-applicable', 'unverified']);
        // `unknown` = **消费方未确定**（2026-10-07，审计 §4.128）：允许存在、但必须可见且只能下降。
        const VALID_CONSUMER = new Set(['js', 'native', 'unknown']);
        const knownSettingIds = new Set([...settingsSource.matchAll(/id: '([^']+)'/g)].map((m) => m[1]));
        const seenKeys = new Set();
        const bad = [];
        for (const e of regEntries) {
          if (seenKeys.has(e.key)) bad.push(`${e.key}(重复)`);
          seenKeys.add(e.key);
          if (!VALID_STATUS.has(e.status)) bad.push(`${e.key}(status=${e.status})`);
          if (typeof e.note !== 'string' || e.note.trim() === '') bad.push(`${e.key}(note 为空)`);
          if (!VALID_CONSUMER.has(e.consumer)) bad.push(`${e.key}(consumer=${e.consumer})`);
          // anchor 是「**可核对**落点」—— 它是本表里唯一能机器核对的字段（核对在本机工具里做，
          // 因为需要 Typora 的 JS 树与原生二进制）。CI 只锁**形状**：必填、非空、与 consumer 相配。
          if (typeof e.anchor !== 'string' || e.anchor.trim() === '') {
            bad.push(`${e.key}(anchor 缺失)`);
          } else if (e.consumer === 'unknown') {
            if (e.anchor.trim() !== '—') bad.push(`${e.key}(consumer=unknown 时 anchor 必须为 —)`);
            if (typeof e.consumerNote !== 'string' || e.consumerNote.trim() === '') {
              bad.push(`${e.key}(consumer=unknown 但没有 consumerNote —— 未确定可以，但必须写明试过哪些形态)`);
            }
          } else if (e.anchor.trim() === '—') {
            bad.push(`${e.key}(consumer=${e.consumer} 但 anchor 是 —)`);
          }
          // `internal` 只在**确实改名**时才有意义
          if (e.internal !== undefined && e.internal === e.key) bad.push(`${e.key}(internal 与 key 相同 ⇒ 不该写)`);
          // `pendingRef`（待裁决载体）：形态 + **对应的 ADR 文件必须真实存在**
          // （2026-10-07，§4.130：新增 `openExportLocation` 的默认行为偏离须有 ADR 载体）
          // 分工：本处只做**存在性**（ADR 的状态是否为 Proposed 由 `verify-release-gate.mjs` 负责）。
          if (e.pendingRef !== undefined) {
            const m = /^(ADR-\d{4})(?:\s+Q\d+)?$/.exec(String(e.pendingRef).trim());
            if (m === null) {
              bad.push(`${e.key}(pendingRef=${e.pendingRef} 形态非法：应为 "ADR-0034" 或 "ADR-0034 Q11")`);
            } else if (!existsSync(resolve(root, 'docs/adr')) || !readdirSync(resolve(root, 'docs/adr'))
              .some((f) => f.startsWith(m[1] + '-'))) {
              bad.push(`${e.key}(pendingRef=${e.pendingRef} 指向的 ADR 文件不存在：docs/adr/${m[1]}-*.md)`);
            }
          }
          for (const id of e.mellow ?? []) {
            if (!knownSettingIds.has(id)) bad.push(`${e.key}→${id}(设置 id 不存在)`);
          }
          // 判据形状：`equivalent` 必须给出**至少一处**可核对的落点（设置 id 或 note 里的符号/路径）
          if (e.status === 'equivalent' && (e.mellow ?? []).length === 0
            && !/`[^`]+`/.test(String(e.note))) {
            bad.push(`${e.key}(equivalent 但既无 mellow 设置 id、note 里也没有反引号落点)`);
          }
        }
        if (bad.length > 0) {
          fail(`面板独有键登记表不合法（${bad.length}）：${bad.join(', ')}`);
        }
        // **棘轮**（存量欠债只能下降）：基线 = 每轮结清后的实测值。
        // 防的是「把没查的项改标成 unverified / unknown 来绕开工作」——那会让欠债**回升**。
        // 收紧记录：`status=unverified` 14(§4.126) → 13(§4.127) → 10(§4.128) → 3(§4.129) → 1(§4.130) → **0**(§4.131，**清零**)；
        //          `consumer=unknown` 7(§4.128) → 2(§4.130) → **1**(§4.131)。
        // ⚠️ `unverified` 到 0 后本判据退化为「必须为空」——**保留它**（欠债一旦回升就会红），
        //    并保留下面「打印清单」的代码（机制还在，只是当前为空）。
        const statusUnverified = regEntries.filter((e) => e.status === 'unverified');
        const consumerUnknown = regEntries.filter((e) => e.consumer === 'unknown');
        if (statusUnverified.length > 0) {
          fail(`面板独有键 status=unverified 回升到 ${statusUnverified.length}（棘轮上限 **0**，2026-10-07 §4.131 已清零）`
            + `：${statusUnverified.map((e) => e.key).join(', ')} —— 存量欠债只能下降；若确有新项未核实，请先把它查完再登记`);
        }
        if (consumerUnknown.length > 1) {
          fail(`面板独有键 consumer=unknown 回升到 ${consumerUnknown.length}（棘轮上限 1，2026-10-07 §4.131 基线）`
            + `：${consumerUnknown.map((e) => e.key).join(', ')} —— 存量欠债只能下降`);
        }
        // canary：四向（重复键 / 非法状态 / 不存在的设置 id / equivalent 无落点）
        {
          const judge = (list) => {
            const s = new Set();
            const out = [];
            for (const e of list) {
              if (s.has(e.key)) out.push('dup');
              s.add(e.key);
              if (!VALID_STATUS.has(e.status)) out.push('status');
              if ((e.status === 'equivalent') && (e.mellow ?? []).length === 0 && !/`[^`]+`/.test(String(e.note))) out.push('noloc');
            }
            return out;
          };
          if (judge([{ key: 'a', status: 'equivalent', note: '`x`' }]).length !== 0) {
            errors.push('面板独有键自洽判据 canary 过宽：合法条目被误报');
          }
          if (!judge([{ key: 'a', status: 'equivalent', note: '`x`' }, { key: 'a', status: 'equivalent', note: '`x`' }]).includes('dup')) {
            errors.push('面板独有键自洽判据 canary 失效：重复键未被检出');
          }
          if (!judge([{ key: 'a', status: 'nope', note: '`x`' }]).includes('status')) {
            errors.push('面板独有键自洽判据 canary 失效：非法状态未被检出');
          }
          if (!judge([{ key: 'a', status: 'equivalent', note: '没有反引号落点' }]).includes('noloc')) {
            errors.push('面板独有键自洽判据 canary 失效：equivalent 无落点未被检出');
          }
        }
        // canary：consumer/anchor 形状判据（**共用同一个谓词**，不另写一份）
        {
          const judgeConsumer = (list) => {
            const out = [];
            for (const e of list) {
              if (!VALID_CONSUMER.has(e.consumer)) { out.push('consumer'); continue; }
              if (typeof e.anchor !== 'string' || e.anchor.trim() === '') { out.push('noanchor'); continue; }
              if (e.consumer === 'unknown') {
                if (e.anchor.trim() !== '—') out.push('anchorNotDash');
                if (typeof e.consumerNote !== 'string' || e.consumerNote.trim() === '') out.push('noNote');
              } else if (e.anchor.trim() === '—') out.push('anchorDash');
              if (e.internal !== undefined && e.internal === e.key) out.push('sameInternal');
            }
            return out;
          };
          if (judgeConsumer([{ key: 'a', consumer: 'js', anchor: 'File.option.x' }]).length !== 0) {
            errors.push('consumer 形状 canary 过宽：合法条目被误报');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'nope', anchor: 'x' }]).includes('consumer')) {
            errors.push('consumer 形状 canary 失效：非法 consumer 未被检出');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'js' }]).includes('noanchor')) {
            errors.push('consumer 形状 canary 失效：缺 anchor 未被检出');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'js', anchor: '—' }]).includes('anchorDash')) {
            errors.push('consumer 形状 canary 失效：js 却用 — 未被检出');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'unknown', anchor: 'x', consumerNote: 'n' }]).includes('anchorNotDash')) {
            errors.push('consumer 形状 canary 失效：unknown 的 anchor 非 — 未被检出');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'unknown', anchor: '—' }]).includes('noNote')) {
            errors.push('consumer 形状 canary 失效：unknown 缺 consumerNote 未被检出');
          }
          if (!judgeConsumer([{ key: 'a', consumer: 'native', anchor: 'a', internal: 'a' }]).includes('sameInternal')) {
            errors.push('consumer 形状 canary 失效：internal 等于 key 未被检出');
          }
        }
      }
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

// ── ⑯ Typora `typora-root-url`（G7-FEAT-08）：**两条解析链必须同时支持** ──────
//
// 立节原因：Mellow 有**两条**图片 src → 绝对路径的解析链，改一处必查另一处：
//   ① 引擎 `image/scan.ts` → `resolveImageSrc(src, docDir, rootDir)`（编辑器内显示/图片操作）
//   ② 宿主 `App.tsx` 的 `readerResolveImageSrc`（Reader 渲染 + 图片导出）
// 只改一条的后果是「编辑器里显示正常、Reader/导出里图片全丢」，而屏幕上看不出原因。
//
// 另外锁两个易错点：
//   - `typora-root-url` **只能从 front matter 读**（正文/代码块里同名文本不算）；
//   - 引号内空白（`"  "`）必须判为空值（本轮单测抓到的真 bug）。
{
  const pathSrc = read('packages/editor-engine/src/image/path.ts');
  const scanSrc = read('packages/editor-engine/src/image/scan.ts');
  const desktopSrc2 = read('apps/desktop/src/App.tsx');
  const checks = [
    ['引擎：resolveImageSrc 必须接受 rootDir 并处理根相对 src',
      /export function resolveImageSrc\(src: string, docDir: string \| null, rootDir: string \| null = null\)/.test(pathSrc)
      && /kind === 'posix-absolute' && rootDir !== null/.test(pathSrc)],
    ['引擎：parseRootUrl 存在且只读 front matter',
      /export function parseRootUrl\(doc: string, docDir: string \| null\)/.test(pathSrc)
      && /frontMatterYaml\(doc\)/.test(pathSrc)],
    ['引擎：引号内空白必须判空（先剥引号再 trim）',
      /m\[1\]\.replace\(\/\^\["\'\]\|\["\'\]\$\/g, ''\)\.trim\(\)/.test(pathSrc)],
    ['引擎：scan 链传入 rootDir', /const rootDir = parseRootUrl\(text, docDir\)/.test(scanSrc)
      && /resolveImageSrc\(src, docDir, rootDir\)/.test(scanSrc)],
    ['宿主：Reader/导出链走同一 resolveImageSrc 并读 root-url 基准',
      /resolveImageSrc\(src, docDir, imageRootUrlRef\.current\)/.test(desktopSrc2)
      && /refreshImageRootUrl\(content\)/.test(desktopSrc2)],
    ['HTML 导出：with-theme/self-contained 内联图片必须走 root-url + Rust read_binary',
      /const exportRootDir = docDir === null \? null : parseRootUrl\(content, docDir\)/.test(desktopSrc2)
      && /const abs = resolveImageSrc\(src, docDir, exportRootDir\)/.test(desktopSrc2)
      && /invoke<number\[\]>\('read_binary', \{ path: abs \}\)/.test(desktopSrc2)],
    ['HTML 导出：读取失败必须回退保留原 src（不能阻断导出）',
      /return null; \/\/ 读取失败由 exportHtml 保留原 src/.test(desktopSrc2)],
    ['front matter 边界只有一处实现（宿主不为扫描 front matter 拉入 CodeMirror）',
      /export function frontMatterBounds/.test(read('packages/editor-engine/src/frontMatter.ts'))
      && /frontMatterBounds\(doc\)/.test(read('packages/editor-engine/src/yamlFrontMatter.ts'))],
    // 写入侧（2026-09-21）：设置 root 时必须写**根相对**，且三条生成路径都要走同一函数
    ['写入侧：buildImageSrcFrom 存在且写根相对',
      /export function buildImageSrcFrom\(targetAbs: string, docDir: string \| null, rootDir: string \| null = null\)/.test(pathSrc)
      && /return relToRoot\.startsWith\('\.\/'\) \? relToRoot : `\/\$\{relToRoot\}`/.test(pathSrc)],
    ['写入侧：insert 链用 buildImageSrcFrom（而非自己拼相对路径）',
      /const src = buildImageSrcFrom\(target, docDir, rootDir\)/.test(read('packages/editor-engine/src/image/insert.ts'))
      && /buildImageMarkdown\(buildImageSrcFrom\(abs, docDir, rootDir\)/.test(read('packages/editor-engine/src/image/insert.ts'))],
    ['写入侧：ops 链（移动/复制/重命名后重写引用）用同一函数',
      /function newSrc\(docDir: string \| null, targetAbs: string, rootDir: string \| null\)/.test(read('packages/editor-engine/src/image/ops.ts'))
      && /buildImageSrcFrom\(targetAbs, docDir, rootDir\)/.test(read('packages/editor-engine/src/image/ops.ts'))],
    ['写入侧：rootDir 由单点解析并透传（insert 持 view / app-core context()）',
      /parseRootUrl\(view\.state\.doc\.toString\(\)/.test(read('packages/editor-engine/src/image/input.ts'))
      && /const rootDir = parseRootUrl\(text, docDir\)/.test(read('packages/app-core/src/imageFileOps.ts'))],
    ['写入侧：app-core 的 plan 上下文必须全部带 rootDir（防「算了但没传」空开关）',
      (read('packages/app-core/src/imageFileOps.ts').match(/docDir, rootDir, (?:assetDirAbs, )?existingNames/g) ?? []).length >= 4],
  ];
  for (const [name, ok] of checks) {
    if (!ok) fail(`typora-root-url 契约不完整：${name}`);
  }
  // canary：把「根相对按 root 解析」改回「按文件系统根」，必须被检出
  const drift = pathSrc.replace("if (kind === 'posix-absolute' && rootDir !== null) {", 'if (false) {');
  if (drift === pathSrc) fail('typora-root-url canary 未武装：注入点未命中');
  else if (/kind === 'posix-absolute' && rootDir !== null/.test(drift)) fail('typora-root-url canary 失效');
}

// ── 设置项「两端同时锁」：声明了 applyCommand 就必须真的有接线（2026-09-30）──────
// 缺陷族（实测 6 处，全部已修）：SettingsPanel 渲染 action 型设置时只调用
// `applySetting(def, true)`；而 App 的 applySetting 是按 `def.applyCommand` 分派的 switch，
// 落 `default: break` 即**静默 no-op**。于是「可点击但点了没反应」的控件可以长期存在，
// 而两侧各自的检查都看不到：schema 侧只锁**形状**（storageKey 为空），App 侧不锁枚举。
// 这正是本项目记录过的母题「**跨层字段必须两端同时锁** —— 只在一端加、另一端忽略
// → 占位项可点击且点击无反应」。
//
// 四条不变量（A/B 管「有消费者」，C/D 管「值与存储键匹配」）：
//   A. action 型必须有 applyCommand（否则按钮点了没反应）
//   B. 任何出现的 applyCommand 必须在 App 的 applySetting 里有对应 case
//   C. action 型不得带 storageKey（否则写下一个无人读的值）
//   D. 值型（toggle/select/number/text）必须有 storageKey（否则值无处安放）
// 扫描面**必须同时含 package schema 与 SettingsPanel** —— App 层可动态追加设置项
// （`ai.panel` 就是这样一个：它在 SettingsPanel 里，只扫 package 的检查看不到它）。
{
  /** 解析设置项字面量（id / type / storageKey / applyCommand）。 */
  const parseDefs = (src, where) => {
    const out = [];
    for (const m of src.matchAll(/\{\s*id:\s*'([^']+)'[^{}]*?type:\s*'([^']+)'[^{}]*?\}/g)) {
      const blob = m[0];
      out.push({
        where,
        id: m[1],
        type: m[2],
        storageKey: blob.match(/storageKey:\s*'([^']*)'/)?.[1],
        applyCommand: blob.match(/applyCommand:\s*'([^']+)'/)?.[1],
      });
    }
    return out;
  };

  /** applySetting 的 switch 体（**必须切片**：从函数起一路读到文件尾会混入其它 switch 的 case）。 */
  const sliceApplySetting = (src) => {
    const start = src.indexOf('const applySetting = useCallback');
    if (start < 0) return '';
    const end = src.indexOf('\n  }, [', start);
    return end < 0 ? '' : src.slice(start, end);
  };

  const checkDefs = (defs, cases) => {
    const problems = [];
    for (const d of defs) {
      const at = `[${d.where}] ${d.id}`;
      if (d.type === 'action') {
        if (d.applyCommand === undefined) problems.push(`${at}：action 型缺 applyCommand → 按钮点了没反应`);
        else if (!cases.has(d.applyCommand)) problems.push(`${at}：applyCommand '${d.applyCommand}' 在 App 的 applySetting 里没有对应 case → 静默 no-op`);
        if (d.storageKey !== '') problems.push(`${at}：action 型不得带 storageKey（当前 '${d.storageKey}'）`);
      } else {
        if (d.storageKey === undefined || d.storageKey === '') problems.push(`${at}：${d.type} 型缺 storageKey → 值无处安放`);
        if (d.applyCommand !== undefined && !cases.has(d.applyCommand)) problems.push(`${at}：applyCommand '${d.applyCommand}' 无对应 case → 死引用`);
      }
    }
    return problems;
  };

  const applySettingBody = sliceApplySetting(appSource);
  const cases = new Set([...applySettingBody.matchAll(/case '([^']+)':/g)].map((x) => x[1]));
  if (applySettingBody === '' || cases.size === 0) {
    fail('无法定位 App 的 applySetting switch（切片失败）→ 请同步更新本护栏，不要让它静默漏检');
  }

  const allDefs = [...parseDefs(settingsSource, 'package'), ...parseDefs(panelSource, 'panel')];
  if (allDefs.length < 50) {
    fail(`解析到的设置项过少（${allDefs.length}）→ 解析器可能漏成员，请同步更新本护栏`);
  }
  for (const p of checkDefs(allDefs, cases)) fail(`设置项跨层不变量：${p}`);

  // canary：checkDefs 本身必须两个方向都能判（违例被检出 / 合规不被拦）
  const badAction = [{ where: 'canary', id: 'canary.action', type: 'action', storageKey: '', applyCommand: undefined }];
  const badRef = [{ where: 'canary', id: 'canary.ref', type: 'action', storageKey: '', applyCommand: 'canary.notWired' }];
  const badStore = [{ where: 'canary', id: 'canary.store', type: 'action', storageKey: 'canary.key', applyCommand: 'canary.wired' }];
  const badValue = [{ where: 'canary', id: 'canary.value', type: 'text', storageKey: '' }];
  const goodAction = [{ where: 'canary', id: 'canary.good', type: 'action', storageKey: '', applyCommand: 'canary.wired' }];
  const goodValue = [{ where: 'canary', id: 'canary.goodValue', type: 'toggle', storageKey: 'canary.value.key' }];
  const casesCanary = new Set(['canary.wired']);
  const expectBad = [
    ['action 缺 applyCommand', badAction],
    ['applyCommand 未接线', badRef],
    ['action 带 storageKey', badStore],
    ['值型缺 storageKey', badValue],
  ];
  for (const [name, sample] of expectBad) {
    if (checkDefs(sample, casesCanary).length === 0) fail(`设置项不变量 canary 失效：${name} 的样本未被检出`);
  }
  // 防误报：合规样本**不得**被拦（否则护栏会吃掉正确行为）
  for (const [name, sample] of [['action 合规', goodAction], ['值型合规', goodValue]]) {
    const got = checkDefs(sample, casesCanary);
    if (got.length > 0) fail(`设置项不变量 canary 失效（误报）：${name} 的合法样本被拦下（${got[0]}）`);
  }
}

// ── 「恢复默认」不得只重置一部分（2026-09-30，§15.3 行 14a ③）─────────────────
// 缺陷族：① 硬编码一份清单 → 新增设置项后**静默漏掉**（「只重置一部分」比没有更糟）；
// ② 去掉「跳过入口型 action」→ 恢复默认会**触发副作用**（打开主题文件夹 / 检查更新 / 命令面板）；
// ③ 改成「写入 defaultValue」而非删除键 → 把**当前默认值固化**下来，
//    将来默认值变更时用户那份旧值会顽固留存；
// ④ 去掉确认对话框 → 破坏性操作静默执行。
{
  const marker = 'export function restoreAllSettingsDefaults(';
  const start = settingsSource.indexOf(marker);
  const end = start < 0 ? -1 : settingsSource.indexOf('\n}', start);
  const body = (start < 0 || end < 0) ? '' : settingsSource.slice(start, end);
  if (body === '') {
    fail('找不到 restoreAllSettingsDefaults（或切片失败）→ 请同步更新本护栏，不要让它静默漏检');
  } else {
    const checks = [
      ['必须遍历 SETTINGS_SECTIONS（不得硬编码清单，否则会「只重置一部分」）',
        /for \(const section of SETTINGS_SECTIONS\)/.test(body)],
      ['必须跳过入口型 action（storageKey 为空），否则会触发打开文件夹 / 检查更新等副作用',
        /if \(def\.storageKey === ''\) continue;/.test(body)],
      ['必须删除存储键而非写入 defaultValue（写入会把旧默认值固化）',
        /localStorage\.removeItem\(def\.storageKey\)/.test(body)],
      ['必须逐项 apply 默认值（复用宿主与控件 onChange 同一条路径）',
        /apply\(def, def\.defaultValue\)/.test(body)],
    ];
    for (const [name, ok] of checks) if (!ok) fail(`恢复默认契约：${name}`);
    // canary：把「遍历 SETTINGS_SECTIONS」改成空数组必须被检出
    const drifted = body.replace('for (const section of SETTINGS_SECTIONS)', 'for (const section of [])');
    if (drifted === body) fail('恢复默认 canary 未武装：注入点未命中');
    else if (/for \(const section of SETTINGS_SECTIONS\)/.test(drifted)) fail('恢复默认 canary 失效');
  }
  if (!/id: 'settings\.restoreDefaults'/.test(appSource)) fail('缺少 settings.restoreDefaults 命令入口');
  if (!/restoreAllSettingsDefaults\(applySetting\)/.test(appSource)) {
    fail('恢复默认必须复用 applySetting（与控件 onChange 同一条路径，避免另建一条会漂移的 live-apply）');
  }
  const hStart = appSource.indexOf('const handleRestoreSettingsDefaults = useCallback');
  const hEnd = hStart < 0 ? -1 : appSource.indexOf('\n  }, [', hStart);
  const handler = (hStart < 0 || hEnd < 0) ? '' : appSource.slice(hStart, hEnd);
  if (handler === '') fail('找不到 handleRestoreSettingsDefaults（或切片失败）→ 请同步更新本护栏');
  else if (!/await askUser\(/.test(handler)) {
    fail('恢复默认是破坏性操作，必须走应用内确认对话框（不得直接执行）');
  }
}

// ── 「目录显示的标题层数」端到端接线（2026-09-30）───────────────────────────
// 教训来源（审计 §4.25）：**有设置项 ≠ 真的生效** —— 勾选态那个 bug 正是
// 「设置面板改了值，但没有任何东西触发重算」。故此处把整条链一次锁死：
// schema（含选项集与默认值）→ applySetting 分支写 state → buildOutline 收 maxLevel
// → **该 state 必须进 refreshOutline 的依赖数组**（否则改设置不重算）。
{
  if (!/id: 'markdown\.outlineMaxLevel'[^}]*type: 'select'[^}]*defaultValue: '6'/.test(settingsSource)) {
    fail('settings 缺少 markdown.outlineMaxLevel（select / 默认 6 = 全部层级）');
  }
  for (const level of [1, 2, 3, 4, 5, 6]) {
    if (!settingsSource.includes(`{ value: '${level}', labelKey: 'settings.outlineLevel.${level}' }`)) {
      fail(`markdown.outlineMaxLevel 缺少 ${level} 级选项`);
    }
  }
  if (!/case 'settings\.outlineMaxLevel':[\s\S]{0,300}?setOutlineMaxLevel\(/.test(appSource)) {
    fail('App.tsx 的 applySetting 缺少 settings.outlineMaxLevel 分支（或未写入 state）');
  }
  const outlineSrc = read('packages/app-core/src/outline.ts');
  if (!/maxLevel\?: number;/.test(outlineSrc) || !/heading\.level > maxLevel/.test(outlineSrc)) {
    fail('app-core outline 的 buildOutline 未实现 maxLevel 截断');
  }
  // refreshOutline：必须把 maxLevel 传进 buildOutline **且**把 state 列进依赖数组
  const refreshMatch = appSource.match(/const refreshOutline = useCallback\([\s\S]*?\n  \}, \[([^\]]*)\]\);/);
  if (refreshMatch === null) {
    fail('无法定位 refreshOutline（或切片失败）→ 请同步更新本护栏，不要让它静默漏检');
  } else {
    const [full, deps] = refreshMatch;
    // ⚠️ 不要用 `buildOutline\([^)]*maxLevel` —— 实参里有 `host.getText()`，
    // `[^)]*` 会被那个右括号截断（护栏首跑即踩到）。直接数「传了 maxLevel」的出现次数。
    const buildCalls = (full.match(/maxLevel: outlineMaxLevel/g) ?? []).length;
    if (buildCalls < 2) {
      fail(`refreshOutline 有 ${buildCalls} 处 buildOutline 传了 maxLevel（应为 2：tree + all）`);
    }
    if (!/\boutlineMaxLevel\b/.test(deps)) {
      fail('refreshOutline 的依赖数组缺少 outlineMaxLevel → 改设置不会重算大纲（审计 §4.25 的同型缺陷）');
    }
  }
  // canary：把依赖数组里的 outlineMaxLevel 去掉必须被检出
  const depDrift = refreshMatch === null ? '' : refreshMatch[0].replace(/outlineMaxLevel, /, '');
  if (refreshMatch !== null && depDrift === refreshMatch[0]) {
    fail('outline 依赖 canary 未武装：注入点未命中');
  }
}

// ── 「双指缩放」端到端接线 + 「开关必须关得掉」（2026-09-30）─────────────────
// 背景：手势实现（`enablePinchZoom`）早已存在，但**只在 Quick Look 启用**，
// 且**原先没有返回值**（装上监听器就撤不掉）。做成用户可切换的设置后，
// 「关不掉」会给出**假控件**（关了但没生效）—— 故本节的**核心断言**是
// 「`enablePinchZoom` 必须返回 disposer」，而不只是「有设置项」。
{
  if (!/id: 'editor\.allowMagnification'[^}]*type: 'toggle'[^}]*defaultValue: false[^}]*applyCommand: 'settings\.editorConfig'/.test(settingsSource)) {
    fail('settings 缺少 editor.allowMagnification（toggle / 默认 false / applyCommand=settings.editorConfig）');
  }
  const zoomSrc = read('packages/editor-core/CoreEditor/src/@quicklook/zoom.ts');
  if (!/export function enablePinchZoom\(bridge: PinchZoomBridge\): \(\) => void/.test(zoomSrc)) {
    fail('enablePinchZoom 必须**返回 disposer**（否则做成开关后「关不掉」= 假控件）');
  }
  if (!/return \(\) => \{[\s\S]{0,600}?removeEventListener\('gesturestart'/.test(zoomSrc)) {
    fail('enablePinchZoom 的 disposer 必须移除 gesturestart 监听器');
  }
  const moduleSrc = read('packages/editor-core/CoreEditor/src/modules/config/index.ts');
  if (!/export function setAllowMagnification\(enabled: boolean\)/.test(moduleSrc)) {
    fail('CoreEditor 缺少 setAllowMagnification（modules/config）');
  }
  if (!/pinchZoomDispose\(\);\s*\n\s*pinchZoomDispose = null;/.test(moduleSrc)) {
    fail('setAllowMagnification 关闭分支必须调用 disposer 并清空（否则关不掉）');
  }
  const bridgeSrc = read('packages/editor-core/CoreEditor/src/bridge/web/config.ts');
  if (!/setAllowMagnification\(\{ enabled \}: \{ enabled: boolean \}\): void;/.test(bridgeSrc)
    || !/setAllowMagnification\(\{ enabled \}: \{ enabled: boolean \}\): void \{/.test(bridgeSrc)) {
    fail('bridge/web/config.ts 必须**声明并实现** setAllowMagnification');
  }
  if (!/'setAllowMagnification'/.test(read('packages/editor-core/src/core.ts'))) {
    fail("editor-core 的 setEditorConfig 白名单缺少 'setAllowMagnification'（漏加 → 调用被静默丢弃）");
  }
  if (!/def\.id === 'editor\.allowMagnification'\) host\?\.setEditorConfig\('setAllowMagnification'/.test(appSource)) {
    fail('App.tsx 的 applySetting 缺少 editor.allowMagnification → setAllowMagnification 接线');
  }
  if (!/allowMagDef && readSetting\(allowMagDef\) === true[\s\S]{0,120}?setAllowMagnification', \{ enabled: true \}/.test(appSource)) {
    fail('App.tsx 缺少双指缩放的**启动恢复**下发');
  }
  // canary：去掉 disposer 的返回类型必须被检出
  const zoomDrift = zoomSrc.replace('export function enablePinchZoom(bridge: PinchZoomBridge): () => void', 'export function enablePinchZoom(bridge: PinchZoomBridge)');
  if (zoomDrift === zoomSrc || /enablePinchZoom\(bridge: PinchZoomBridge\): \(\) => void/.test(zoomDrift)) {
    fail('双指缩放 canary 失效：无法模拟「去掉 disposer」的漂移');
  }
}

// ── 图片导出正文字号端到端接线（2026-09-30，Typora `imageFontSize` 对标）──────
// 只锁**接线**；`rel()` 等比缩放的**正确性**由单测的行为断言锁住
// （`packages/export/test/image.test.ts`：body=32 时 H1 必须恰为 56px —— 若 rel 退化成
//  `(absolute / body) * body` ≡ absolute，该断言即失败。**不要把表达式形态也锁进护栏**，
//  那是形状锁：既会拦住合法重构，也保护不了行为。）
{
  if (!/id: 'export\.image\.fontSize'[^}]*type: 'number'[^}]*defaultValue: 16[^}]*min: 8[^}]*max: 48/.test(settingsSource)) {
    fail('settings 缺少 export.image.fontSize（number / 默认 16 / 范围 8–48）');
  }
  const imgSrc = read('packages/export/src/image/index.ts');
  if (!/bodyFontSize\?: number;/.test(imgSrc)) fail('ImageExportOptions 缺少 bodyFontSize');
  if (!/export function resolveImageBodyFontSize\(options: ImageExportOptions\): number/.test(imgSrc)) {
    fail('缺少 resolveImageBodyFontSize（字号回落 + clamp 的单一入口）');
  }
  if (!/const body = resolveImageBodyFontSize\(options\);/.test(imgSrc)) {
    fail('layoutImageDocument 未调用 resolveImageBodyFontSize（字号不会生效）');
  }
  if (!/bodyFontSize: BODY_SIZE,/.test(imgSrc)) {
    fail('DEFAULT_IMAGE_OPTIONS 必须显式声明 bodyFontSize（且默认 = BODY_SIZE，保持既有输出不变）');
  }
  if (!/const BODY_SIZE = 16;/.test(imgSrc)) {
    fail('BODY_SIZE 必须仍为 16 —— 对齐 Typora 的 24 会改变所有既有图片导出输出，需单独裁决（方案 §15.3 行 14b）');
  }
  // ⚠️ 必须带引号匹配：裸子串 `mellow.export.image.fontSize` 仍是 `...fontSizeX` 的**子串**，
  // 用子串断言时「把键改名」这种漂移**不会被检出**（实测：靠 canary 才意外发现）。
  if (!/'mellow\.export\.image\.fontSize'/.test(appSource)) {
    fail('App.tsx 未读取 mellow.export.image.fontSize → 设置不会生效');
  }
  if (!/bodyFontSize: Number\.isFinite\(fontSizeRaw\)/.test(appSource)) {
    fail('App.tsx 未把字号传入图片导出 options');
  }
  // canary：去掉 App 的读取必须被检出
  const appDrift = appSource.replace("localStorage.getItem('mellow.export.image.fontSize')", "localStorage.getItem('mellow.export.image.fontSizeX')");
  if (appDrift === appSource) fail('图片字号 canary 未武装：注入点未命中');

  // ── 2026-10-06（ADR-0033 **Q = A2**）：字号来源 `custom`（默认）| `followEditor` ──
  // 只锁**接线**与**默认值**：默认必须是 `custom` —— 若默认改成 `followEditor`，
  // **所有既有图片导出的输出会随编辑器字号变化**（属外观变更，须单独裁决）。
  if (!/id: 'export\.image\.fontSizeMode'[^}]*type: 'select'[^}]*defaultValue: 'custom'/.test(settingsSource)) {
    fail('settings 缺少 export.image.fontSizeMode（select / **默认 custom**）—— 默认必须是 custom，否则既有导出输出会变');
  }
  if (/id: 'export\.image\.fontSizeMode'[^}]*defaultValue: 'followEditor'/.test(settingsSource)) {
    fail('export.image.fontSizeMode 的默认值不得是 followEditor —— 会改变所有既有图片导出输出（ADR-0033 关键风险）');
  }
  if (!/'mellow\.export\.image\.fontSizeMode'/.test(appSource)) {
    fail('App.tsx 未读取 mellow.export.image.fontSizeMode → 该设置不会生效');
  }
  if (!/settingById\('editor\.fontSize'\)/.test(appSource)) {
    fail("App.tsx 的「跟随编辑器字号」未读取 editor.fontSize → 该选项会**静默无效**");
  }
  // canary：去掉 App 对 fontSizeMode 的读取必须被检出
  const appDrift2 = appSource.replace("localStorage.getItem('mellow.export.image.fontSizeMode')", "localStorage.getItem('mellow.export.image.fontSizeModeX')");
  if (appDrift2 === appSource) fail('字号来源 canary 未武装：注入点未命中');
}

// ── 新建文档的默认行尾（2026-10-07，审计 §4.129；Typora「Default Line Ending」）─────────
// Typora 真值（一手证据）：面板键 `line_ending_crlf`（**仅非 macOS 显示**）→ 原生侧 →
// 字符串设置 `end-of-line` → JS `preferCRLF()` 回落 `File.option.preferCRLF`（默认 false ⇒ **LF**）。
// Mellow 此前在**新建文档**处硬编码 `eol: '\n'` ⇒ 本项**默认必须仍是 LF**，否则默认行为会变。
// 只锁**接线**与**默认值**；「新建的文档真的用 CRLF 保存」由单测/行为断言负责。
{
  if (!/id: 'files\.newFileLineEnding'[^}]*type: 'select'[^}]*defaultValue: 'lf'/.test(settingsSource)) {
    fail('settings 缺少 files.newFileLineEnding（select / **默认 lf**）—— 默认必须是 lf，否则新建文档的默认行尾会变');
  }
  if (/id: 'files\.newFileLineEnding'[^}]*defaultValue: 'crlf'/.test(settingsSource)) {
    fail('files.newFileLineEnding 的默认值不得是 crlf —— 会改变所有新建文档的默认行尾');
  }
  for (const v of ['lf', 'crlf']) {
    if (!new RegExp(`\\{ value: '${v}', labelKey: 'settings\\.file\\.newFileLineEnding\\.${v}' \\}`).test(settingsSource)) {
      fail(`files.newFileLineEnding 缺少选项 ${v}（Typora 面板的两档：LF (Unix Style) / CRLF (Windows Style)）`);
    }
  }
  if (!/settingById\('files\.newFileLineEnding'\)/.test(appSource)) {
    fail('App.tsx 未读取 files.newFileLineEnding → 该设置不会生效');
  }
  if (!/readSetting\(def\) === 'crlf' \? '\\r\\n' : '\\n'/.test(appSource)) {
    fail("App.tsx 的 newDocEol 未把 'crlf' 映射成 '\\r\\n'（映射写错会让设置静默无效）");
  }
  // **每一处**新建文档都必须用 newDocEol()（只修一处 = 该入口静默失效，§4.141 同型）
  const newDocUses = [...appSource.matchAll(/eol: newDocEol\(\)/g)].length;
  if (newDocUses < 3) {
    fail(`App.tsx 只有 ${newDocUses} 处新建文档使用 newDocEol()（下限 3：handleNew / ensureBlankDoc / 启动空 tab）`
      + ' —— 漏掉任意一处 ⇒ 用户在该入口设置的行尾被静默忽略');
  }
  // ⚠️ **不能用朴素计数**：`eol: '\n'` 在 App.tsx 里还会命中
  //   ① **类型注解** `(eol: '\n' | '\r\n')`；② **注释里提到它**（包括 newDocEol 的 JSDoc）。
  //   实测：朴素计数 3，精确计数（要求后接 `,` 或 `}`）1 ⇒ 唯一允许处 = docMetaRef 初始值。
  // ⚠️ **正则里必须写 `'\\n'`**：写成 `'\n'` 匹配的是**真换行符**，而源码里是**反斜杠 + n**
  //   —— 实测踩过：写成 `'\n'` 时计数恒为 0（判据静默失效）。
  const EOL_RE = /eol: '\\n'\s*[,}]/g;
  const eolHardcode = [...appSource.matchAll(EOL_RE)].length;
  if (eolHardcode !== 1) {
    fail(`App.tsx 里「新建文档的 eol 硬编码」出现 ${eolHardcode} 次（只允许 1 次 = docMetaRef 初始值）`
      + ' —— 新增的硬编码会让 files.newFileLineEnding 在该入口失效');
  }
  // canary：正/负样本（用**同一份**正则，不另写）
  if ([...("x({ eol: '\\n', })").matchAll(EOL_RE)].length !== 1) {
    fail('eol 硬编码 canary 失效：正样本（对象属性）未被计入');
  }
  if ([...("(eol: '\\n' | '\\r\\n')").matchAll(EOL_RE)].length !== 0) {
    fail("eol 硬编码 canary 失效：**类型注解** (eol: '\\n' | '\\r\\n') 被误计");
  }
  if ([...("// 硬编码 eol: '\\n' 会让设置失效").matchAll(EOL_RE)].length !== 0) {
    fail('eol 硬编码 canary 失效：注释里提到的字面量被误计');
  }
  if ([...("x({ eol: '\\n' })").matchAll(EOL_RE)].length !== 1) {
    fail('eol 硬编码 canary 失效：对象**最后一个属性**（后接 }）未被计入');
  }
}

// ── 消费端引用的设置 id 必须存在（2026-10-07，审计 §4.127）──────────────────────
// 【为什么补】本护栏此前锁了 schema↔applyCommand（action 型）与 schema↔i18n，
//   但**没锁 schema ↔ 消费端**。而 `settingById('<id>')` 对不存在的 id **返回 `undefined`**：
//   消费端常见的写法是 `const def = settingById('x'); if (def === undefined) return '';`
//   ⇒ **该设置静默失效** —— 界面照常渲染、值照常持久化进 localStorage、**没有任何报错**。
//   这与 i18n 的 `t('a.b')` 缺键是**同一类**陷阱（`t()` 返回键名本身、界面显示裸键、不报错）。
// 【实测（本次）】24 个被引用的不同 id **全部存在** —— 本判据是**加固**，不是修复现行缺陷；
//   这也是它值得写下来的理由：现行代码干净，所以判据一落地就是绿的、可长期拦回归。
// 【口径】`declaredIds` 取**同一行同时含 `type:`** 的 `id:`（69 个）——
//   刻意**排除** section id（`id: 'export'` 等 10 个）：section id 与设置 id 同形，
//   若把 section id 也算作「已声明」，则 `settingById('export')` 这种**真 bug**
//   会被误判为合法（运行时仍返回 `undefined`）。canary 直接锁住这个边界。
//   ⇒ 代价：设置项若被改成**多行**声明，本判据会把它当未声明（**偏严**，会响不会静默放行），
//     且 `declaredIds.size` 的下限断言会把「大规模重排」当场拦住。
{
  const declaredIds = new Set(
    [...settingsSource.matchAll(/\bid:\s*'([^']+)'[^\n]*?\btype:\s*'([^']+)'/g)].map((m) => m[1]),
  );
  if (declaredIds.size < 60) {
    fail(`只解析出 ${declaredIds.size} 个设置项 id（下限 60）—— 扫描面漂移会让本判据空转`
      + '（若确实把设置项改成了多行声明，请同步更新本判据的解析方式）');
  }
  // 扫描面：apps/desktop/src 下**所有** .ts/.tsx（不止 App.tsx —— 消费端可能已拆包）
  const consumerFiles = [];
  const walkConsumers = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walkConsumers(p);
      else if (/\.(ts|tsx)$/.test(e.name)) consumerFiles.push(p);
    }
  };
  walkConsumers(resolve(root, 'apps/desktop/src'));
  const referenced = new Map();
  for (const abs of consumerFiles) {
    const rel = abs.slice(root.length + 1).split('\\').join('/');
    const src = read(rel);
    for (const m of src.matchAll(/settingById\(\s*'([^']+)'\s*\)/g)) {
      if (!referenced.has(m[1])) referenced.set(m[1], []);
      // ⚠️ 行号是**剥掉整行注释之后**的位置 ⇒ 会比编辑器里的小（`read()` 会删行）。
      //    标 `≈` 以免被当成精确坐标去找（实测：真实第 1296 行被报成 1210）。
      referenced.get(m[1]).push(`${rel}:≈${src.slice(0, m.index).split('\n').length}`);
    }
  }
  if (referenced.size < 20) {
    fail(`只解析出 ${referenced.size} 个被消费端引用的设置 id（下限 20）`
      + ' —— 扫描面漂移会让本判据空转');
  }
  // **共用同一谓词**（canary 与判据用同一个函数，避免「放宽谓词后 canary 仍用旧的那份」）
  const danglingIds = (ids) => ids.filter((id) => !declaredIds.has(id));
  for (const id of danglingIds([...referenced.keys()]).sort()) {
    fail(`消费端引用了**不存在**的设置 id \`${id}\`（${referenced.get(id).join('、')}）`
      + ' —— `settingById` 对不存在的 id 返回 `undefined` ⇒ **该设置静默失效**'
      + '（界面照常渲染、无任何报错）');
  }
  // canary：三向 + 边界（防「一律报错」/「一律通过」/「section id 混入」）
  if (danglingIds([...declaredIds]).length !== 0) {
    fail('消费端 id canary 失效：schema 里**已声明**的 id 被判为悬空（正样本方向反了）');
  }
  if (danglingIds(['__ghost__.setting']).length !== 1) {
    fail('消费端 id canary 失效：不存在的 id 未被判定为悬空（判据已失去鉴别力）');
  }
  if (danglingIds([]).length !== 0) {
    fail('消费端 id canary 失效：空输入被判为悬空（谓词写成了「一律报错」）');
  }
  for (const sectionId of ['export', 'editor', 'files']) {
    if (declaredIds.has(sectionId)) {
      fail(`消费端 id canary 失效：section id \`${sectionId}\` 被算作「已声明的设置 id」`
        + ' —— 那会让 `settingById(\'' + sectionId + '\')` 这类真 bug 静默通过');
    }
  }
  if (danglingIds([...referenced.keys()]).length !== 0) {
    fail('消费端 id canary 失效：对**真实引用集**的判定与逐条报错的结果不一致');
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Settings contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Settings contract: files id normalized + updater merged into general (storage keys stable); editable shortcuts via schema-preserving override layer (registry + native menu boundaries); recording UX armed; P6 armed: AI default-off (no persisted AI state, PRD §122) + Reader/Palette/Slash hidden-by-default with menu/settings entry points + User CSS entry and appData/user.css injection; slash key drift canary armed; export wiring armed (Pandoc 9-format + Previous Export + Image Export, menu/schema/Rust anchors); W5 armed: 5-min timed auto save (Typora conf.user.json autoSaveTimer default) + interval exposed in GUI (Typora needs hand-editing JSON) + Print = system dialog with no preview window (D-H=②) + non-macOS Page Setup actionable hint (G7-FEAT-01/02/03) + Typora-style layered user CSS (themes/base.user.css → themes/<theme>.user.css → user.css, *.user.css excluded from theme scan); editor auto pair toggle wired end-to-end: settings schema → App startup/live apply → editor-core whitelist → CoreEditor autoPairCompartment + markdown language data + bridge (V7-W6, G7-EDIT-12); final newline on save wired through BOTH save paths with no bypass (V7-W6, G7-FEAT-12); Tab-key indent wired via tabKeyBehavior (NOT the inert indentUnit facet — probe-verified) (V7-W6, G7-EDIT-13); preserve-line-breaks on export wired into BOTH pipelines (markdown-it breaks + PDF parseBlocks) (V7-W6, G7-FEAT-13); first-line indent wired only for Paragraph via CoreEditor compartment + bridge (V7-W6, G7-EDIT-15); settings entries double-ended (2026-09-30): action 必有 applyCommand 且该 applyCommand 在 applySetting 有 case、action 不带 storageKey、值型必有 storageKey — 扫描面含 SettingsPanel 动态 section; restore-defaults (2026-09-30): 必须遍历 SETTINGS_SECTIONS（不得硬编码清单）、跳过入口型 action、删除键而非写默认值、逐项 apply 复用 applySetting、且必须走应用内确认对话框; outline max-level (2026-09-30): markdown.outlineMaxLevel 端到端 —— schema(select 1..6 / 默认 6) → applySetting 写 state → buildOutline 收 maxLevel（tree + all 两处）→ 该 state 必须进 refreshOutline 依赖数组（否则改设置不重算，§4.25 同型）; allow-magnification (2026-09-30): editor.allowMagnification 端到端（settings → bridge 声明+实现 → setEditorConfig 白名单 → App live+启动）+ **核心断言：enablePinchZoom 必须返回 disposer**（否则做成开关后「关不掉」= 假控件）; image font size (2026-09-30): export.image.fontSize 端到端（settings number 8–48 / 默认 16 → ImageExportOptions.bodyFontSize → resolveImageBodyFontSize → layout）+ **BODY_SIZE 必须仍为 16**（对齐 Typora 的 24 需单独裁决）；rel() 等比缩放的正确性由单测行为断言锁（非护栏形状锁）');
