/**
 * 引擎侧 UI 文案（ADR-0028 Q2=**B1**：引擎**自带**目录）。
 *
 * ## 为什么引擎要有自己的目录
 *
 * 编辑器运行在**独立 iframe**（独立 `document`）—— 宿主的 `packages/i18n` 目录**到不了这里**，
 * 宿主的 `t()` 也不可用。而引擎会**自己渲染 UI 文案**（查找面板、格式工具栏、表格工具栏、
 * 图片操作提示…），实测 **79 处 / 8 个文件**（审计 §4.57）。
 *
 * ADR-0028 裁决：
 * - **Q1 = A2**：逐项加桥（本文件配套 `__MELLOW_ENGINE_LOCALE__`），**不建统一桥**；
 * - **Q2 = B1**：引擎**自带**目录 —— 保住「零工作区依赖」这条既有架构性质（`dependencies: {}`）；
 * - **Q3 = C1**：默认 **zh-CN** ⇒ **未接桥时 = 当前行为**，本接线**不产生行为变更**。
 *
 * ## 英文真值的来源（不冒充）
 *
 * 带 `Typora:` 标注的取自本机 Typora 1.14.9 的 `Resources/{zh-Hans.lproj/*.strings,
 * TypeMark/appsrc/main.js}` —— **`.strings` 的键即英文源串**（`Close = 关闭`）。
 * 其余标注为 `Mellow`：Typora 在这些位置用**图标**而非文字（表格工具栏）或压根没有对应文案，
 * 故属 **Mellow 自译（参数原创）**，**不得**当作 Typora 真值引用。
 *
 * ## 与 `packages/i18n` 的关系
 *
 * 两套目录**键集不得重叠**（本目录一律 `engine.` 前缀）—— 由
 * `tests/parity/verify-i18n-contract.mjs` 交叉核对，避免两套目录各自漂移。
 */

export type EngineLocale = 'zh-CN' | 'en-US';

export const ENGINE_LOCALES: readonly EngineLocale[] = ['zh-CN', 'en-US'];
/** ADR-0028 Q3=C1：默认 zh-CN（Mellow 默认语言，PRD §87） */
export const ENGINE_DEFAULT_LOCALE: EngineLocale = 'zh-CN';
/** localStorage 兜底键（桥未就绪时引擎自读，覆盖「宿主先于引擎注入」的时序） */
export const ENGINE_LOCALE_STORAGE_KEY = 'mellow.engine.locale';

type Pair = { 'zh-CN': string; 'en-US': string };

/**
 * 引擎 UI 文案真值源（zh / en 同键）。
 *
 * `Typora:` 英文取自本机 Typora 1.14.9；`Mellow:` 为 Mellow 自译（参数原创）。
 */
export const ENGINE_MESSAGES: Record<string, Pair> = {
  // ── 代码块语言标签 ────────────────────────────────────────────────
  'engine.codeBlock.lang': { 'zh-CN': '语言', 'en-US': 'Lang' },                       // Mellow
  'engine.codeBlock.editLang': { 'zh-CN': '点击修改代码块语言', 'en-US': 'Edit code block language' }, // Mellow
  'engine.codeBlock.noLang': { 'zh-CN': '(无语言)', 'en-US': '(no language)' },        // Mellow

  // ── 查找 / 替换面板 ──────────────────────────────────────────────
  'engine.search.find': { 'zh-CN': '查找', 'en-US': 'Find' },                          // Typora: Menu.strings
  'engine.search.replace': { 'zh-CN': '替换', 'en-US': 'Replace' },                    // Typora: Front.strings
  'engine.search.all': { 'zh-CN': '全部', 'en-US': 'All' },                            // Typora: Front.strings
  'engine.search.previous': { 'zh-CN': '上一个 (Shift+Enter)', 'en-US': 'Previous (Shift+Enter)' }, // Mellow
  'engine.search.next': { 'zh-CN': '下一个 (Enter)', 'en-US': 'Next (Enter)' },        // Mellow
  'engine.search.caseSensitive': { 'zh-CN': '区分大小写', 'en-US': 'Case Sensitive' },  // Typora: Front.strings
  'engine.search.wholeWord': { 'zh-CN': '全词匹配', 'en-US': 'Whole Word' },            // Typora: Front.strings
  'engine.search.regex': { 'zh-CN': '正则表达式', 'en-US': 'Regular Expression' },      // Typora: Front.strings
  'engine.search.close': { 'zh-CN': '关闭 (Esc)', 'en-US': 'Close (Esc)' },            // Mellow（Close 有 Typora 真值，带快捷键后缀的组合为 Mellow）

  // ── 图片 widget（按钮标签 + tooltip 描述）────────────────────────
  'engine.image.download': { 'zh-CN': '下载', 'en-US': 'Download' },                   // Typora: Front.strings
  'engine.image.downloadHint': { 'zh-CN': '下载到本地 asset 目录并更新引用', 'en-US': 'Download into the local asset folder and update the reference' }, // Mellow
  'engine.image.loadRemote': { 'zh-CN': '加载远程图片', 'en-US': 'Load remote image' }, // Mellow
  'engine.image.open': { 'zh-CN': '打开', 'en-US': 'Open' },                           // Typora: Menu.strings
  'engine.image.openHint': { 'zh-CN': '用系统默认应用打开', 'en-US': 'Open with the system default app' }, // Mellow
  'engine.image.openInBrowserHint': { 'zh-CN': '在浏览器中打开', 'en-US': 'Open in browser' }, // Mellow
  'engine.image.reveal': { 'zh-CN': '定位', 'en-US': 'Reveal' },                       // Mellow
  'engine.image.revealHint': { 'zh-CN': '在文件管理器中定位', 'en-US': 'Reveal in file manager' }, // Mellow
  'engine.image.size': { 'zh-CN': '尺寸', 'en-US': 'Size' },                           // Mellow
  'engine.image.sizeHint': { 'zh-CN': '设置显示尺寸（宽×高）', 'en-US': 'Set the display size (width×height)' }, // Mellow
  'engine.image.rename': { 'zh-CN': '重命名', 'en-US': 'Rename' },                     // Typora: Menu.strings
  'engine.image.renameHint': { 'zh-CN': '重命名文件并更新引用', 'en-US': 'Rename the file and update the reference' }, // Mellow
  'engine.image.move': { 'zh-CN': '移动', 'en-US': 'Move' },                           // Mellow
  'engine.image.moveHint': { 'zh-CN': '移动到其他目录并更新引用', 'en-US': 'Move to another folder and update the reference' }, // Mellow
  'engine.image.copy': { 'zh-CN': '复制', 'en-US': 'Copy' },                           // Mellow
  'engine.image.copyHint': { 'zh-CN': '复制到 asset 目录并更新引用', 'en-US': 'Copy into the asset folder and update the reference' }, // Mellow
  'engine.image.copyPath': { 'zh-CN': '复制路径', 'en-US': 'Copy Path' },              // Mellow
  'engine.image.copyPathHint': { 'zh-CN': '复制图片绝对路径', 'en-US': 'Copy the absolute path of the image' }, // Mellow
  'engine.image.copyUrlHint': { 'zh-CN': '复制图片 URL', 'en-US': 'Copy the image URL' }, // Mellow
  'engine.image.retry': { 'zh-CN': '重试', 'en-US': 'Retry' },                         // Mellow

  // ── 图片批量操作的结果原因（report.skipped[].reason）──────────────
  'engine.imageOp.remoteNotApplicable': { 'zh-CN': '远程图片不适用', 'en-US': 'Not applicable to remote images' }, // Mellow
  'engine.imageOp.unresolvedPath': { 'zh-CN': '无法解析路径', 'en-US': 'Cannot resolve the path' }, // Mellow
  'engine.imageOp.alreadyInTarget': { 'zh-CN': '已在目标目录', 'en-US': 'Already in the target folder' }, // Mellow
  'engine.imageOp.renameRemoteUnsupported': { 'zh-CN': '远程图片不支持重命名', 'en-US': 'Remote images cannot be renamed' }, // Mellow
  'engine.imageOp.emptyName': { 'zh-CN': '新文件名为空', 'en-US': 'The new file name is empty' }, // Mellow
  'engine.imageOp.nameUnchanged': { 'zh-CN': '文件名未变化', 'en-US': 'The file name is unchanged' }, // Mellow
  'engine.imageOp.sameAsSource': { 'zh-CN': '目标与源相同', 'en-US': 'Target is the same as the source' }, // Mellow
  'engine.imageOp.batchRemoteSkipped': { 'zh-CN': '远程图片跳过（Move/Copy All 仅本地）', 'en-US': 'Remote image skipped (Move/Copy All is local only)' }, // Mellow
  'engine.imageOp.alreadyInAsset': { 'zh-CN': '已在 asset 目录', 'en-US': 'Already in the asset folder' }, // Mellow
  'engine.imageOp.fileMissing': { 'zh-CN': '文件不存在（保留引用）', 'en-US': 'File does not exist (reference kept)' }, // Mellow
  'engine.imageOp.downloadLocalSkipped': { 'zh-CN': '本地图片跳过（Download Remote 仅远程）', 'en-US': 'Local image skipped (Download Remote is for remote only)' }, // Mellow
  'engine.imageOp.protocolNotDownloadable': { 'zh-CN': '协议不可下载（data/mailto 等）', 'en-US': 'Protocol cannot be downloaded (data/mailto, etc.)' }, // Mellow
  'engine.imageOp.notLocalUploadable': { 'zh-CN': '非本地可上传图片（远程/缺失/无法解析）', 'en-US': 'Not a local uploadable image (remote / missing / unresolvable)' }, // Mellow
  'engine.imageOp.notInBatch': { 'zh-CN': '未上传（不在本次批次）', 'en-US': 'Not uploaded (not part of this batch)' }, // Mellow
  'engine.imageOp.uploadFailed': { 'zh-CN': '上传失败', 'en-US': 'Upload failed' },     // Mellow
  'engine.imageOp.fsFailed': { 'zh-CN': 'fs 操作失败', 'en-US': 'File system operation failed' }, // Mellow

  // ── 选区格式工具栏 ───────────────────────────────────────────────
  'engine.format.heading1': { 'zh-CN': '一级标题', 'en-US': 'Heading 1' },              // Typora: Menu.strings
  'engine.format.heading2': { 'zh-CN': '二级标题', 'en-US': 'Heading 2' },              // Typora: Menu.strings
  'engine.format.heading3': { 'zh-CN': '三级标题', 'en-US': 'Heading 3' },              // Typora: Menu.strings
  'engine.format.bold': { 'zh-CN': '粗体', 'en-US': 'Strong' },                        // Typora: Menu.strings（Strong = 加粗）
  'engine.format.italic': { 'zh-CN': '斜体', 'en-US': 'Emphasis' },                    // Typora: Menu.strings
  'engine.format.strike': { 'zh-CN': '删除线', 'en-US': 'Strike' },                    // Typora: Menu.strings
  'engine.format.inlineCode': { 'zh-CN': '行内代码', 'en-US': 'Inline Code' },         // Mellow
  'engine.format.link': { 'zh-CN': '链接', 'en-US': 'Hyperlink' },                     // Mellow
  'engine.format.quote': { 'zh-CN': '引用', 'en-US': 'Quote' },                        // Typora: Menu.strings
  'engine.format.list': { 'zh-CN': '列表', 'en-US': 'List' },                          // Mellow
  'engine.format.toolbar': { 'zh-CN': '格式工具栏', 'en-US': 'Format toolbar' },       // Mellow

  // ── 表格工具栏（Typora 用图标，文字标签为 Mellow 自译）────────────
  'engine.table.resize': { 'zh-CN': '调整', 'en-US': 'Resize' },                       // Mellow
  'engine.table.rowAbove': { 'zh-CN': '↑行', 'en-US': '↑ Row' },                       // Mellow
  'engine.table.rowBelow': { 'zh-CN': '↓行', 'en-US': '↓ Row' },                       // Mellow
  'engine.table.deleteRow': { 'zh-CN': '删行', 'en-US': 'Delete Row' },                // Mellow
  'engine.table.colLeft': { 'zh-CN': '←列', 'en-US': '← Col' },                        // Mellow
  'engine.table.colRight': { 'zh-CN': '→列', 'en-US': '→ Col' },                       // Mellow
  'engine.table.deleteCol': { 'zh-CN': '删列', 'en-US': 'Delete Col' },                // Mellow
  'engine.table.alignLeft': { 'zh-CN': '左', 'en-US': 'Align Left' },                  // Typora: main.js
  'engine.table.alignCenter': { 'zh-CN': '中', 'en-US': 'Align Center' },              // Typora: main.js
  'engine.table.alignRight': { 'zh-CN': '右', 'en-US': 'Align Right' },                // Typora: main.js
  'engine.table.tidy': { 'zh-CN': '整理', 'en-US': 'Tidy' },                           // Mellow
  'engine.table.delete': { 'zh-CN': '删除表', 'en-US': 'Delete Table' },               // Typora: Menu.strings / main.js
  'engine.table.cols': { 'zh-CN': '列', 'en-US': 'Cols' },                             // Mellow
  'engine.table.rows': { 'zh-CN': '行', 'en-US': 'Rows' },                             // Mellow
  'engine.table.apply': { 'zh-CN': '应用', 'en-US': 'Apply' },                         // Mellow

  // ── 代码块「复制代码」浮层 ───────────────────────────────────────
  'engine.code.copy': { 'zh-CN': '复制', 'en-US': 'Copy' },                            // Mellow
  'engine.code.copyCode': { 'zh-CN': '复制代码', 'en-US': 'Copy code' },               // Mellow
  'engine.code.copied': { 'zh-CN': '已复制', 'en-US': 'Copied' },                      // Mellow
};

let currentLocale: EngineLocale = ENGINE_DEFAULT_LOCALE;

/** 取当前引擎 locale（默认 zh-CN） */
export function getEngineLocale(): EngineLocale {
  return currentLocale;
}

/** 设置引擎 locale（非法值回落默认；返回是否接受） */
export function setEngineLocale(locale: unknown): boolean {
  if (locale === 'zh-CN' || locale === 'en-US') {
    currentLocale = locale;
    return true;
  }
  return false;
}

/**
 * 取引擎 UI 文案。未登记的键**回显键名**（与 `packages/i18n` 的 `t()` 同语义：
 * 界面会显示裸键 ⇒ 一眼可辨，不会静默空白）。
 *
 * **刻意不做插值**：引擎侧 79 条文案**没有一条**需要 `{var}`（唯一带插值的
 * `image/host.ts` 三条是**开发者错误**，已豁免、不进目录）。加一个无人消费的
 * `vars` 参数 = 空开关 —— 本仓明令禁止（§4.53「写了却永不生效」同型）。
 * 将来真出现带变量的文案时，**连同消费方一起**加。
 */
export function tEngine(key: string): string {
  const entry = ENGINE_MESSAGES[key];
  return entry === undefined ? key : entry[currentLocale];
}

/** 引擎侧 locale 桥（宿主 → iframe） */
export interface EngineLocaleBridge {
  set: (locale: string) => void;
}

/**
 * 安装 locale 桥（engine install 时调用一次；幂等）。
 * 先从 localStorage 兜底恢复上次注入 —— 覆盖「宿主先于引擎注入」的时序
 * （与 `mdTokens.ts` 的 `installMdTokensBridge` 同构）。
 */
export function installEngineLocaleBridge(): void {
  const win = window as unknown as { __MELLOW_ENGINE_LOCALE__?: EngineLocaleBridge };
  try {
    const raw = localStorage.getItem(ENGINE_LOCALE_STORAGE_KEY);
    if (raw !== null) setEngineLocale(raw);
  } catch {
    /* 忽略 */
  }
  if (win.__MELLOW_ENGINE_LOCALE__ !== undefined) return;
  win.__MELLOW_ENGINE_LOCALE__ = {
    set: (locale: string) => {
      setEngineLocale(locale);
      try {
        localStorage.setItem(ENGINE_LOCALE_STORAGE_KEY, locale);
      } catch {
        /* 忽略 */
      }
    },
  };
}
