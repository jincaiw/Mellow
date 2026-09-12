/**
 * App —— Mellow 桌面壳装配层（Tauri 2 + React）。
 * 负责：编辑器挂载、命令注册、Tabs/侧栏/大纲/搜索、视图模式、设置/主题/i18n、生命周期。
 *
 * 依赖注入（host-api 契约）：
 *   EditorHost（editor-react）→ CoreEditor
 *   DocumentService（app-core）→ FileService（desktop Adapter 实现）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { EditorCore, EDITOR_BUNDLE_URL } from '../../../packages/editor-core/src';
import {
  DocumentService,
  RecoveryService,
  ExternalChangeService,
  ImageFileOpsService,
  DocumentRenameService,
  FileOpHistory,
  DocumentState,
  FileTreeModel,
  FileTreeService,
  FileListModel,
  FileListService,
  DEFAULT_FILE_LIST_OPTIONS,
  OutlineModel,
  buildOutline,
  currentHeadingId,
  filterOutline,
  headingOffsetForAnchor,
  QuickOpenModel,
  groupSearchResults,
  SearchResultsModel,
  normalizeSearchRequest,
  rankQuickOpen,
  scanQuickOpen,
  DEFAULT_FILE_TREE_OPTIONS,
  dirname as fileTreeDirname,
  basename as fileTreeBasename,
  relativePath as fileTreeRelativePath,
  parseRecentFolders,
  removeRecentFolder,
  togglePinRecentFolder,
  sortRecentFolders,
  createEditorBridgeFromCore,
  renderReaderHtml,
  countWords,
  formatWordCountStats,
  pushRecentFile,
  parseRecentFiles,
  serializeRecentFiles,
  pushRecentFolder,
  serializeRecentFolders,
  filterFileTree,
  filterFileList,
  documentSuggestedName,
  // V7-W5（G7-FEAT-03）：定时自动保存（Typora Win/Linux 默认 5 分钟）
  parseAutosaveMinutes,
  isAutosaveEnabled,
  autosaveIntervalMs,
  // V7-W5（§7.3）：invalid regex 就地提示
  isSearchRegexValid,
} from '../../../packages/app-core/src';
import type { DocumentTab, ExternalChangeDetail, FileListItem, FileTreeNode, FileTreeOptions, OutlineHeading, QuickOpenEntry, SearchGroup, DocumentStateInput, RecentFileEntry } from '../../../packages/app-core/src';
import { createDesktopFileService, isTauri } from './host/fileServices';
import { createDesktopExtensionHost } from './extensions/extensionHost';
import { helloCommandManifest, setupHelloCommand } from './extensions/examples/helloCommand';
import { ExtensionRegistry, buildExtensionContext } from '../../../packages/app-core/src';
import { createDesktopRecoveryStorage } from './host/recoveryStorage';
import { createDesktopWatcher } from './host/watcherAdapter';
import { createDesktopDialogService } from './host/dialogs';
import { createDesktopOpenerService } from './host/openers';
import { createDesktopWindowService } from './host/windowService';
import { createDesktopSearchService } from './host/searchServices';
import { createDesktopImageUploadService } from './host/uploadService';
import { openThemesFolder, refreshUserThemes } from './host/userThemes';
import { loadKatex, renderKatex, injectKatexCssIntoFrame } from './katexLoader';
import type { ImageWidgetActionRequest } from '../../../packages/editor-engine/src/image/widget';
import type { AssetDirConfig } from '../../../packages/editor-engine/src/image/path';
import type { Encoding, LineEnding, RecoveryEntry, FileChangeEvent, DialogService, OpenerService, SearchResult, SearchService, WindowService, ImageUploadOptions, ImageUploadService } from '../../../packages/host-api/src/index';
import type { ImageExportOptions, Canvas2DLike } from '../../../packages/export/src/image/index';
import { CommandPaletteModel, CommandRegistry, SCHEMA_SHORTCUTS, commandPaletteSearch, createCommandContext, normalizeShortcut, slashCommandSearch, titleFor } from '../../../packages/commands/src';
import type { Command, CommandPaletteItem, CommandSource } from '../../../packages/commands/src';
import type { CommandContribution } from '../../../packages/extension-api/src';
import { DEFAULT_THEME_SETTINGS, allThemes, resolveActiveTheme, themeById } from '../../../packages/themes/src';
import type { MellowTheme, ThemeSettings } from '../../../packages/themes/src';
import { createI18n, MESSAGES, resolveLocale } from '../../../packages/i18n/src';
import { buildNativeMenuSpec } from './nativeMenu';
import type { Locale, LocaleSetting } from '../../../packages/i18n/src';
import { readShortcutOverrides, readSetting, settingById, writeShortcutOverrides, writeSetting, TYPOGRAPHY_DEFAULTS } from '../../../packages/settings/src';
import type { SettingDefinition, ShortcutOverrideMap } from '../../../packages/settings/src';
import SettingsPanel from './SettingsPanel';
import { StatusBar, OutlineList, SearchResultsList, FileTree, FileList, SidebarHeader, SidebarFooter, fieldVisible } from '../../../packages/desktop-ui/src';
import type { SlashOpenRequest } from '../../../packages/editor-engine/src';
import type { EditorContextMenuRequest } from '../../../packages/editor-engine/src';
import ReaderView from './Reader';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry, ContextMenuItem, ContextMenuState } from './ContextMenu';
import Cheatsheet from './Cheatsheet';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import type { Update as TauriUpdate } from '@tauri-apps/plugin-updater';
import { checkForUpdate, downloadUpdate, installUpdateAndRestart, prepareRollback, rollbackCommit, rollbackNoteLaunch, rollbackRestore, rollbackStatus, restartAfterRollback, updateChannelFromSettings } from './host/updater';
import type { RollbackStatus } from './host/updater';
import { PRINT_STYLESHEET } from '../../../packages/export/src/printStyle';

const GLOBAL_ASSET_DIR_KEY = 'mellow.assetDir';
// V7-W5（G7-FEAT-03）：定时自动保存间隔（分钟）。Typora Win/Linux 默认 5 分钟且只存在
// conf/conf.user.json 的 `autoSaveTimer`（GUI 不可达）；Mellow 用 localStorage 暴露为设置项。
const AUTOSAVE_TIMER_KEY = 'mellow.file.autosaveTimer';
// V7-W5：Typora 式 user CSS 分层（appData 目录下）。base = 全主题；<themeId> = 主题专属。
const USER_CSS_BASE_FILE = 'base.user.css';
const USER_CSS_FILE = 'user.css';
/** 用户主题目录（与 `host/userThemes.ts` 的 `appData/themes` 同值）。 */
const USER_THEMES_DIR = 'themes';
/** 安全读取 localStorage（隐私模式 / 禁用存储时抛异常，不得让启动崩）。 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
/**
 * 主题专属 user CSS 的文件名（Typora：`themes/<theme>.user.css`）。
 * 用户主题 id 形如 `user/<name>`，`/` 不是合法文件名字符 → 取 `<name>` 段。
 */
function themeUserCssFile(themeId: string): string {
  return `${themeId.replace(/^user\//, '')}.user.css`;
}
/**
 * 正文字号有**两个消费方**：编辑器（iframe，走 `setEditorConfig('setFontSize')`）与
 * Reader（`.mellow-reader`，CSS 变量 `--mellow-content-font-size`）。两者必须同源，
 * 否则出现「设置里 20px、Reader 仍 16px」—— §6.1「排版默认值三处不一致」的残余。
 */
function applyContentFontSize(px: number): void {
  document.documentElement.style.setProperty('--mellow-content-font-size', `${px}px`);
}
// 帮助菜单外链（Typora 帮助菜单补全：快速上手 / Markdown 参考 / 反馈）
const HELP_URL_QUICK_START = 'https://github.com/jincaiw/Mellow#readme';
const HELP_URL_WEBSITE = 'https://github.com/jincaiw/Mellow';
const HELP_URL_MARKDOWN_REFERENCE = 'https://commonmark.cn/help/';
const HELP_URL_FEEDBACK = 'https://github.com/jincaiw/Mellow/issues';
// V7-W1.11：Typora 主题菜单「获取主题」对标入口（Typora → 官方 Theme Gallery；
// Mellow → 主题文档/社区主题说明，与「打开主题文件夹」配套）
const THEME_GALLERY_URL = 'https://github.com/jincaiw/Mellow#themes';
const TABS_SESSION_KEY = 'mellow.tabs.session';
const RECENT_FILES_KEY = 'mellow.recent.files';
// V7-W1.1：已关闭文件栈（Typora File → Reopen Closed File，⇧⌘T）。app 级，跨窗口共享。
const CLOSED_FILES_KEY = 'mellow.closedFiles';
/** 已关闭文件栈上限（Typora 无上限 UI，取 20 足够且避免 localStorage 无限增长）。 */
const CLOSED_FILES_LIMIT = 20;
/** 读取已关闭文件栈（最近关闭的在前）。 */
function readClosedFiles(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_FILES_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}
/** 压入已关闭文件栈（去重 + 上限裁剪）。 */
function pushClosedFile(path: string): string[] {
  const next = [path, ...readClosedFiles().filter((p) => p !== path)].slice(0, CLOSED_FILES_LIMIT);
  try { localStorage.setItem(CLOSED_FILES_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
}
/**
 * V7-W3.6（G7-SIDE-06）：Typora 1.14 的「自定义显示 / 隐藏规则」——
 * 逗号或换行分隔的 glob 列表（`shouldShowEntry` 消费 `includeGlobs` / `excludeGlobs`）。
 */
function parseGlobList(raw: string): string[] {
  return raw.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
const RECENT_FOLDERS_KEY = 'mellow.recent.folders';
/** V7-W3.9：Recent Locations 的 pin（固定）集合 —— 独立键，避免改动既有 string[] 载荷。 */
const PINNED_FOLDERS_KEY = 'mellow.recent.folders.pinned';
const FILE_TREE_ROOT_KEY = 'mellow.fileTree.root';
const FILE_TREE_OPTIONS_KEY = 'mellow.fileTree.options';
const OUTLINE_OPTIONS_KEY = 'mellow.outline.options';
const QUICK_OPEN_RECENT_KEY = 'mellow.quickOpen.recent';
const COMMAND_PALETTE_RECENT_KEY = 'mellow.commandPalette.recent';
const SLASH_ENABLED_KEY = 'mellow.slashCommands.enabled';
const THEME_SETTINGS_KEY = 'mellow.theme.settings';
const LOCALE_SETTING_KEY = 'mellow.locale';
const AI_ENABLED_KEY = 'mellow.ai.enabled';
const READER_ZOOM_KEY = 'mellow.reader.zoom';
const SIDEBAR_WIDTH_KEY = 'mellow.sidebar.width';
const WINDOW_BOUNDS_KEY = 'mellow.window.bounds';

/**
 * KeyboardEvent.code → 快捷键 key 归一表（dispatchShortcut 用）。
 * ⌥ 组合在 macOS 上 e.key 为特殊字符（Opt+B → '∫'），命令注册表以物理键位
 * 定义（'B'），故优先按 code 归一；未列出的 code（F8、ArrowUp 等）与 key 同形。
 */
const CODE_KEY_ALIASES: Record<string, string> = {
  Equal: '=', Minus: '-', Backslash: '\\', Slash: '/', Backquote: '`',
  BracketLeft: '[', BracketRight: ']', Semicolon: "'", Quote: "'",
  Comma: ',', Period: '.', Space: ' ',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  // 字母键（⌥ 组合在 mac 上 e.key 为特殊字符如 'œ'/'∫'，code 布局无关）
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G',
  KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N',
  KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T', KeyU: 'U',
  KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
};

type EditorStatus = 'idle' | 'ready' | 'error';

interface DocMeta {
  encoding: Encoding;
  eol: LineEnding;
}

/** mdLink dest → 解析结果（decode + 剥锚点 + 相对当前文档目录拼接）。空目标 → null。
 *  openMdLink 与 broken-link exists checker 共用（spec §12 同口径，避免两套解析漂移）。 */
function resolveMdLinkTarget(dest: string, currentDocPath: string | null): { pathPart: string; target: string; anchor: string } | null {
  let decoded = dest;
  try { decoded = decodeURIComponent(dest); } catch { /* 保留原样（含裸 % 等） */ }
  const hashIndex = decoded.indexOf('#');
  const pathPart = hashIndex === -1 ? decoded : decoded.slice(0, hashIndex);
  if (pathPart === '') return null;
  const anchor = hashIndex === -1 ? '' : decoded.slice(hashIndex + 1);
  const target = currentDocPath !== null ? `${fileTreeDirname(currentDocPath)}/${pathPart}` : pathPart;
  return { pathPart, target, anchor };
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorCore | null>(null);
  // IME 候选态中禁止由桌面壳反向读取 iframe。等 compositionend 到达后，
  // 将候选期间发生的修改作为一次普通编辑统一结算。
  const compositionEditPendingRef = useRef(false);
  // CLI/Finder 打开事件可能在 iframe 初始化期间抵达。必须先完成默认 tab /
  // 会话恢复的 applyTab，再读入外部文件；否则晚到的空白 tab 会覆盖文件。
  const editorStartupReadyRef = useRef<Promise<void> | null>(null);
  const resolveEditorStartupRef = useRef<(() => void) | null>(null);
  if (editorStartupReadyRef.current === null) {
    editorStartupReadyRef.current = new Promise<void>((resolve) => { resolveEditorStartupRef.current = resolve; });
  }
  // Rust 在前端 ready 前保存打开请求、在 ready 后 emit 实时事件；两条通道可能
  // 抵达同一请求。保持 in-flight 去重，避免同一路径同时 apply 两次。
  const externalOpenInflightRef = useRef(new Set<string>());
  const filePathRef = useRef<string | null>(null);
  const extensionRegistryRef = useRef<ExtensionRegistry | null>(null);
  const extensionHostRef = useRef<ReturnType<typeof createDesktopExtensionHost> | null>(null);


  /** 扩展命令执行：按扩展 manifest 构建受限上下文（运行时权限门卫） */
  const runExtensionCommand = useCallback((extensionId: string, command: CommandContribution) => {
    const reg = extensionRegistryRef.current;
    const host = extensionHostRef.current;
    if (reg === null || host === null) return;
    const manifest = reg.get(extensionId);
    if (manifest === undefined || !manifest.enabled) return;
    const ctx = buildExtensionContext(manifest, host, { contributions: {} });
    void command.run(ctx);
  }, []);

  /** 把已启用扩展的 Command 贡献点增量注册进 CommandRegistry（不重建 effect，避免 dispatch 链路扰动） */
  const syncExtensionCommands = useCallback((registry: ExtensionRegistry | null) => {
    if (registry === null) return;
    const cmdApi = (window as unknown as { __MELLOW_COMMANDS__?: { register: (command: Command) => void; dispatch: (id: string, payload?: unknown) => Promise<boolean>; all: () => Command[] } }).__MELLOW_COMMANDS__;
    if (cmdApi === undefined) return;
    for (const { extensionId, value } of registry.collect('commands')) {
      for (const c of value) {
        cmdApi.register({
          id: c.id,
          localizedTitle: { zh: c.title.zh ?? c.title.en ?? c.id, en: c.title.en ?? c.title.zh ?? c.id },
          category: 'extension',
          context: { scope: 'global' },
          enabled: () => true,
          execute: () => runExtensionCommand(extensionId, c),
        });
      }
    }
  }, [runExtensionCommand]);
  const documentsRef = useRef<DocumentService | null>(null);
  const fileServiceRef = useRef<ReturnType<typeof createDesktopFileService> | null>(null);
  const recoveryRef = useRef<RecoveryService | null>(null);
  const externalRef = useRef<ExternalChangeService | null>(null);
  // 图片文件操作（spec image-workflow §6/§7 + PRD §58）
  const fileOpsRef = useRef<ImageFileOpsService | null>(null);
  // 图床上传服务（Typora §55：插入图片自动上传；__MELLOW_IMAGE_UPLOAD__ 注入用）
  const imageUploadServiceRef = useRef<ImageUploadService | null>(null);
  const renameRef = useRef<DocumentRenameService | null>(null);
  const historyRef = useRef<FileOpHistory | null>(null);
  const dialogRef = useRef<DialogService | null>(null);
  const openerRef = useRef<OpenerService | null>(null);
  const searchRef = useRef<SearchService | null>(null);
  const searchCancelRef = useRef<(() => void) | null>(null);
  const windowServiceRef = useRef<WindowService | null>(null);
  const commandRegistryRef = useRef<CommandRegistry>(new CommandRegistry());
  const pluginCommandsRef = useRef<Command[]>([]);
  const commandPaletteModelRef = useRef<CommandPaletteModel>(new CommandPaletteModel());
  // B1（SDI）：单文档状态（DocumentState，D2=1b 收敛）—— 一窗口 ⇔ 一文档；
  // UI/命令/菜单已约束为窗口=文档，多标签语义（tabs[]/activeId/closed 栈）已删除。
  const docStateRef = useRef<DocumentState>(new DocumentState());
  // B1（SDI）：是否主窗口（label 'main'）—— 仅主窗口参与会话恢复与持久化，避免多窗口互相覆盖
  const primaryWindowRef = useRef(true);
  const suppressEditorEventRef = useRef(false);

  // File Tree / Articles File List（PRD §14/§15/§59/§60；不创建 .mellow workspace 文件）
  const fileTreeServiceRef = useRef<FileTreeService | null>(null);
  const fileTreeModelRef = useRef<FileTreeModel | null>(null);
  // V7-W1.5：Articles（文档列表）视图复建 —— Typora 显示菜单为 Outline / Articles /
  // File Tree 三视图；V5-A1 曾随 SDI 一并退役，现按 Typora 1.14.9 真值恢复（⌃⌘2）。
  const fileListServiceRef = useRef<FileListService | null>(null);
  const fileListModelRef = useRef<FileListModel>(new FileListModel());
  const outlineModelRef = useRef<OutlineModel>(new OutlineModel());
  const outlineActiveRef = useRef<string | null>(null);
  const refreshOutlineRef = useRef<(head?: number | null) => void>(() => {});
  const quickOpenModelRef = useRef<QuickOpenModel>(new QuickOpenModel());
  const searchResultsModelRef = useRef<SearchResultsModel>(new SearchResultsModel());
  const quickOpenAbortRef = useRef<AbortController | null>(null);
  const quickOpenQueryRef = useRef('');
  // 外部变化检测需要实时读取 dirty / 磁盘基准（ref 保持最新）
  const dirtyRef = useRef(false);
  // Crash Recovery：文档 id + 修订（快照 keyed by document id）
  const docIdRef = useRef<string>(crypto.randomUUID());
  const revisionRef = useRef(0);
  // preserve metadata：打开时记录编码/EOL，保存时原样传回
  const docMetaRef = useRef<DocMeta>({ encoding: 'utf-8', eol: '\n' });
  // validate disk revision：打开时记录的磁盘状态，保存时校验外部变更（spec §5）
  const diskStateRef = useRef<{ mtimeMs: number; identityKey: string } | null>(null);

  // ── 安全 Auto Update（signed update / verify package / release channel / rollback）──
  // 更新检查只发送版本/平台/渠道元数据；绝不携带文档或用户数据（见 host/updater.ts）。
  const pendingUpdateRef = useRef<TauriUpdate | null>(null);
  type UpdateUi =
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'available'; version: string }
    | { phase: 'downloading'; percent: number }
    | { phase: 'ready' }
    | { phase: 'upToDate' }
    | { phase: 'error'; message: string };
  const [updateUi, setUpdateUi] = useState<UpdateUi>({ phase: 'idle' });
  const [rollbackPrompt, setRollbackPrompt] = useState<RollbackStatus | null>(null);
  // Status Bar 默认隐藏；用户显式开启后持久化。
  const [statusbarVisible, setStatusbarVisible] = useState<boolean>(() => {
    // U2：状态栏默认隐藏（设置可开启）
    try { return localStorage.getItem('mellow.statusbar.visible') === '1'; } catch { return false; }
  });
  // U1：侧边栏默认隐藏（Cmd+Shift+L / 标题栏按钮唤起）
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try { return localStorage.getItem('mellow.sidebar.visible') === '1'; } catch { return false; }
  });
  // 窄窗口时临时收起 Sidebar，但不覆盖用户的显式显示偏好；恢复到正式最小宽度后
  // 自动恢复原状态（master plan §7.7），避免把一次系统缩窗误记成用户关闭。
  const [sidebarSuppressedByWidth, setSidebarSuppressedByWidth] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.innerWidth < 900,
  );
  const sidebarShown = sidebarVisible && !sidebarSuppressedByWidth;
  // 侧边栏宽度拖拽（D-J / Typora parity）：200–480px，localStorage 记忆（默认 260）
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      return Number.isFinite(saved) && saved >= 200 && saved <= 480 ? saved : 260;
    } catch {
      return 260;
    }
  });
  const setSidebarWidth = useCallback((next: number) => {
    const clamped = Math.max(200, Math.min(480, Math.round(next)));
    setSidebarWidthState(clamped);
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped)); } catch { /* no-op */ }
  }, []);
  useEffect(() => {
    const updateSidebarWidthGate = () => setSidebarSuppressedByWidth(window.innerWidth < 900);
    updateSidebarWidthGate();
    window.addEventListener('resize', updateSidebarWidthGate);
    return () => window.removeEventListener('resize', updateSidebarWidthGate);
  }, []);
  /** 引擎格式/段落命令桥（菜单 → iframe __MELLOW_FORMAT_API__） */
  const engineFormat = useCallback((action: string) => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_FORMAT_API__?: { format: (a: string) => void } }) | null;
    win?.__MELLOW_FORMAT_API__?.format(action);
    hostRef.current?.focus();
  }, []);
  /** 引擎源码模式桥（PRD §30：Cmd/Ctrl+/ 切换；菜单/CLI → iframe __MELLOW_SOURCE_API__） */
  const engineSourceToggle = useCallback(() => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_SOURCE_API__?: { toggle: () => void } }) | null;
    win?.__MELLOW_SOURCE_API__?.toggle();
    hostRef.current?.focus();
  }, []);
  /** E4（§5.1 合同兑现）：行号双偏好写入引擎 + 按当前模式应用。
   * Live 行号仍走 CoreEditor setShowLineNumbers 单一真源；Source 行号独立开关由
   * sourceMode.toggle 读 `__MELLOW_LINE_NUMBER_PREFS__.source` 自行切换。此处把
   * 两个偏好写入 iframe 全局，并按当前模式立即应用对应值（设置 live apply 用）。
   */
  const applyLineNumberPrefs = useCallback(() => {
    const liveDef = settingById('editor.lineNumbers');
    const sourceDef = settingById('editor.sourceLineNumbers');
    const live = liveDef ? readSetting(liveDef) === true : false;
    const source = sourceDef ? readSetting(sourceDef) === true : true;
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & {
      __MELLOW_LINE_NUMBER_PREFS__?: { live: boolean; source: boolean };
      __MELLOW_SOURCE_API__?: { isActive: () => boolean };
      webModules?: { config?: { setShowLineNumbers?: (p: { enabled: boolean }) => void } };
    }) | null;
    if (win === null || win === undefined) return;
    win.__MELLOW_LINE_NUMBER_PREFS__ = { live, source };
    const isSource = win.__MELLOW_SOURCE_API__?.isActive?.() === true;
    win.webModules?.config?.setShowLineNumbers?.({ enabled: isSource ? source : live });
  }, []);
  /** 引擎查找/替换桥（菜单 → iframe __MELLOW_SEARCH_API__） */
  const engineSearch = useCallback((mode: 'find' | 'replace' | 'findNext' | 'findPrevious') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_SEARCH_API__?: { openFind: () => void; openReplace: () => void; findNext: () => void; findPrevious: () => void } }) | null;
    const api = win?.__MELLOW_SEARCH_API__;
    if (api === undefined) return;
    if (mode === 'find') api.openFind();
    else if (mode === 'replace') api.openReplace();
    else if (mode === 'findNext') api.findNext();
    else api.findPrevious();
    hostRef.current?.focus();
  }, []);

  /** 引擎剪贴板桥（菜单「复制为 Markdown / 纯文本 / HTML 代码 / 无主题 HTML / 粘贴为纯文本」→ iframe __MELLOW_CLIPBOARD_API__） */
  const engineClipboard = useCallback((action: 'copyMarkdown' | 'copyPlain' | 'copyHtmlSource' | 'copyWithoutTheme' | 'pastePlain') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CLIPBOARD_API__?: { copyAsMarkdown: () => boolean; copyAsPlain: () => boolean; copyAsHtmlSource: () => boolean; copyWithoutTheme: () => boolean; pastePlain: () => void } }) | null;
    if (action === 'copyMarkdown') win?.__MELLOW_CLIPBOARD_API__?.copyAsMarkdown();
    else if (action === 'copyPlain') win?.__MELLOW_CLIPBOARD_API__?.copyAsPlain();
    else if (action === 'copyHtmlSource') win?.__MELLOW_CLIPBOARD_API__?.copyAsHtmlSource();
    else if (action === 'copyWithoutTheme') win?.__MELLOW_CLIPBOARD_API__?.copyWithoutTheme();
    else win?.__MELLOW_CLIPBOARD_API__?.pastePlain();
    hostRef.current?.focus();
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((v) => {
      try { localStorage.setItem('mellow.sidebar.visible', v ? '0' : '1'); } catch { /* noop */ }
      return !v;
    });
  }, []);

  // 侧边栏右缘拖拽调整宽度（与 split-divider 同模式：window mousemove/mouseup）
  const handleSidebarDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const onMove = (ev: MouseEvent): void => {
      // workspace-shell 贴视口左缘 → clientX 即侧边栏宽度（clamp 由 setSidebarWidth 保证）
      setSidebarWidth(ev.clientX);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setSidebarWidth]);

  const [status, setStatus] = useState<EditorStatus>('idle');
  const [localeSetting, setLocaleSetting] = useState<LocaleSetting>(() => {
    try {
      const saved = localStorage.getItem(LOCALE_SETTING_KEY) as LocaleSetting | null;
      return saved === 'system' || saved === 'en-US' || saved === 'zh-CN' ? saved : 'zh-CN';
    } catch {
      return 'zh-CN';
    }
  });
  const locale: Locale = resolveLocale(localeSetting);
  const i18n = useMemo(() => createI18n(MESSAGES, locale), [locale]);
  const t = i18n.t;

  // C3（V4 §9.3）：状态栏单项可见性配置（右键 StatusBar 切换；localStorage 持久化）
  const [statusbarFields, setStatusbarFields] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('mellow.statusbar.fields');
      return raw !== null ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  });
  const toggleStatusbarField = useCallback((field: string) => {
    setStatusbarFields((prev) => {
      // E7：按有效状态翻转（未持久化的字段以 STATUSBAR_DEFAULT_HIDDEN 为默认）
      const current = fieldVisible(prev, field as never);
      const next = { ...prev, [field]: !current };
      try { localStorage.setItem('mellow.statusbar.fields', JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  }, []);
  const handleStatusbarContextMenu = useCallback((x: number, y: number) => {
    const labels: Record<string, string> = {
      dirty: t('statusbar.field.dirty'),
      stats: t('statusbar.field.stats'),
      cursor: t('statusbar.field.cursor'),
      markdown: t('statusbar.field.markdown'),
      encoding: t('statusbar.field.encoding'),
      eol: t('statusbar.field.eol'),
      zoom: t('statusbar.field.zoom'),
      status: t('statusbar.field.status'),
    };
    const items: ContextMenuEntry[] = Object.entries(labels).map(([key, label]) => ({
      label,
      onClick: () => toggleStatusbarField(key),
    }));
    setContextMenu({ x, y, items });
  }, [t, toggleStatusbarField]);
  /** E6a：只读模式（Typora 1.14.9 toggleReadonlyMode:）——引擎 editable Compartment 切换 */
  const engineReadonlyToggle = useCallback(() => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_READONLY_API__?: { toggle: () => boolean } }) | null;
    const next = win?.__MELLOW_READONLY_API__?.toggle();
    if (typeof next === 'boolean') {
      setToast({ message: next ? t('msg.readonlyOn') : t('msg.readonlyOff') });
    }
    hostRef.current?.focus();
  }, [t]);
  /**
   * V7-W2.4（D-B 裁决 = 方案 §12 选项 ①）：退役常驻 `.editor-toolbar` 横条。
   *
   * 依据 Typora 1.14 What's New 原文：「You can now enable the float toolbar from
   * menubar → View → Toolbar or from Settings → Appearance」—— Typora 只有**一个**
   * 「编辑器工具栏」概念，且是**浮动**的（Selection 锚定），入口是 View → Toolbar
   * 或 设置 → 外观。Mellow 此前有两个：引擎级浮动工具栏（`selectionToolbar`，
   * 设置 → 外观「浮动编辑器工具栏」，默认开）+ 壳层常驻横条（`mellow.editor.toolbarVisible`，
   * View → 工具栏，默认关，13 键）。后者在 Typora 中不存在，且与前者功能重叠、
   * 造成「两套格式工具」心智负担与设置项语义割裂。
   *
   * 处置：移除常驻横条与其独立持久化键；`View → Toolbar` 改为切换**浮动**工具栏，
   * 与 Typora `toggleEditorToolbar` 语义一致，并与设置项同源（storageKey
   * `mellow.selectionToolbar.enabled`）。
   */

  // document lang/dir（未来 RTL：localeDir 由 i18n 提供）
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // 写作宽度 / 行高：从 localStorage 初始化 CSS 变量（设置面板即时生效）
  useEffect(() => {
    try {
      // A1（第四轮）：写作宽度不再缩窄 iframe 本体，改经编辑器就绪恢复段
      // setContentMaxWidth 在 iframe 内 .cm-content 限宽居中（滚动条贴窗、两侧背景连续）。
      // V7-W2.2：Reader 同文档排版也消费 --mellow-writing-width（此前 Reader 硬编码 820px，
      // 与设置值 860 不一致 —— G7-SHELL-03）。
      const ww = localStorage.getItem('mellow.editor.writingWidth');
      const wwv = ww === null || ww === '' ? String(TYPOGRAPHY_DEFAULTS.writingWidth) : ww;
      document.documentElement.style.setProperty('--mellow-writing-width', wwv === 'auto' ? 'none' : `${wwv}px`);
      const lh = localStorage.getItem('mellow.editor.lineHeight');
      const lhv = lh === null ? String(TYPOGRAPHY_DEFAULTS.lineHeight) : lh;
      document.documentElement.style.setProperty('--mellow-line-height', lhv);
    } catch { /* 单一真源默认值由 CSS fallback 承担 */ }
  }, []);
  // Native Menu 本地化（P1-1.3：locale 纳入 syncNativeMenu 统一重建；PRD §23/附录 J）
  // Print 打印样式表（PRD §77：与 PDF 共享排版常量；@page/@media print 只在打印时生效）
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.mellowPrint = 'true';
    style.textContent = PRINT_STYLESHEET;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
  const [statusText, setStatusText] = useState(t('msg.editorNotLoaded'));
  const [dirty, setDirtyState] = useState(false);
  const [stats, setStats] = useState('');
  // R2-2 字数统计窗口（Typora 视图→字数统计窗口）：面板开时 refreshStats 实时刷新
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [wordCountData, setWordCountData] = useState<ReturnType<typeof countWords> | null>(null);
  // B1（SDI）：tabs/activeTabId React 状态移除 —— 无标签栏/Overview 消费方，
  // 单文档状态经 docStateRef 表达，DOM 重渲染由 applyTab/setDirty 等既有路径驱动。
  const [fileTreeRoot, setFileTreeRoot] = useState<string | null>(() => localStorage.getItem(FILE_TREE_ROOT_KEY));
  // ref 镜像：openPathInTab 内免依赖读取（「打开单文件 → 父文件夹自动加载」判断）
  const fileTreeRootRef = useRef(fileTreeRoot);
  fileTreeRootRef.current = fileTreeRoot;
  const [sidebarMode, setSidebarModeState] = useState<'files' | 'fileList' | 'outline' | 'search'>(() => {
    const saved = localStorage.getItem('mellow.sidebar.mode');
    return saved === 'outline' || saved === 'search' || saved === 'fileList' ? saved : 'files';
  });
  // U6：侧栏过滤/排序控件默认折叠（⋯ 展开），降低默认界面密度（desktop-ui-design-spec §6）
  const [fileTreeNodes, setFileTreeNodes] = useState<FileTreeNode[]>([]);
  // V7-W1.5：Articles（文档列表）视图 —— 递归收集的 Markdown 文件，显示名取首个标题
  const [fileListItems, setFileListItems] = useState<FileListItem[]>([]);
  const [fileListSelectedPath, setFileListSelectedPath] = useState<string | null>(null);
  // P3.6（G4-SIDE-06）常驻 filter：Files 模式按名称过滤
  const [fileFilterQuery, setFileFilterQuery] = useState('');
  const filteredFileTreeNodes = useMemo(() => filterFileTree(fileTreeNodes, fileFilterQuery), [fileTreeNodes, fileFilterQuery]);
  // V7-W1.5：Articles 视图与 File Tree 共用同一过滤串（Typora 三视图共用侧栏过滤）
  const filteredFileListItems = useMemo(() => filterFileList(fileListItems, fileFilterQuery), [fileListItems, fileFilterQuery]);
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const [fileTreeOptions, setFileTreeOptions] = useState<FileTreeOptions>(() => {
    try {
      return { ...DEFAULT_FILE_TREE_OPTIONS, ...(JSON.parse(localStorage.getItem(FILE_TREE_OPTIONS_KEY) ?? '{}') as Partial<FileTreeOptions>) };
    } catch {
      return DEFAULT_FILE_TREE_OPTIONS;
    }
  });
  // V7-W3.5（G7-SIDE-04）：「展开全部」标記。File Tree 为惰性读取（只下钻 expanded 项），
  // 未知层级读不到，故必须由 readTree 的 expandAll 递归读取，不能只改 expanded 集合。
  const [treeExpandAll, setTreeExpandAll] = useState(false);
  // V7-W3.9：Recent Locations（侧栏底部文件夹菜单）。pinned 独立持久化，固定项置顶。
  const [recentFolders, setRecentFolders] = useState<string[]>(() => parseRecentFolders(localStorage.getItem(RECENT_FOLDERS_KEY)));
  const [pinnedFolders, setPinnedFolders] = useState<string[]>(() => parseRecentFolders(localStorage.getItem(PINNED_FOLDERS_KEY)));
  // V7-W3.2：Articles 是否递归收集子文件夹（Typora Articles 的 current / recursive 开关）
  const [fileListRecursive, setFileListRecursive] = useState(true);
  const [outlineItems, setOutlineItems] = useState<OutlineHeading[]>([]);
  const [outlineFilter, setOutlineFilter] = useState('');
  const [outlineFlat, setOutlineFlat] = useState(false);
  const [outlineAutoNumber, setOutlineAutoNumber] = useState(() => {
    try {
      return Boolean((JSON.parse(localStorage.getItem(OUTLINE_OPTIONS_KEY) ?? '{}') as { autoNumber?: boolean }).autoNumber);
    } catch {
      return false;
    }
  });
  const [currentOutlineId, setCurrentOutlineId] = useState<string | null>(null);
  // P3.3 Outline 键盘选中（与 caret 驱动的 currentOutlineId 分离，避免互相打架）
  const [outlineSelectedId, setOutlineSelectedId] = useState<string | null>(null);
  // V7-W3.7：强制滚动计数（右键 Highlight Current Header）—— 当前项已是选中项时 state 不变、
  // effect 不重跑会导致「点了没反应」，用递增 nonce 强制触发 OutlineList 的滚动跟随。
  const [outlineHighlightNonce, setOutlineHighlightNonce] = useState(0);
  // V7-I7（v1.5.4 Typora parity）：编辑器右侧浮动大纲面板（overlay，不挤压正文）
  const [outlineFloatOpen, setOutlineFloatOpen] = useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [quickOpenAll, setQuickOpenAll] = useState<QuickOpenEntry[]>([]);
  const [quickOpenResults, setQuickOpenResults] = useState<QuickOpenEntry[]>([]);
  const [quickOpenSelected, setQuickOpenSelected] = useState(0);
  const [quickOpenScanning, setQuickOpenScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCase, setSearchCase] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchInclude, setSearchInclude] = useState('');
  const [searchExclude, setSearchExclude] = useState('');
  const [searchContext, setSearchContext] = useState(1);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [searchRunning, setSearchRunning] = useState(false);
  // P3.3 Search 键盘选中（扁平匹配序列上的索引；流式追加时由渲染侧越界忽略）
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(-1);
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteSelected, setCommandPaletteSelected] = useState(0);
  const [focusMode, setFocusModeState] = useState<'off' | 'line' | 'paragraph'>('off');
  const [typewriterEnabled, setTypewriterEnabled] = useState(false);
  // V7-W2.4：浮动编辑器工具栏（Typora 1.14 Editor Toolbar）启用态。
  // 与引擎同源（storageKey `mellow.selectionToolbar.enabled`，引擎侧同样读该键），
  // 启动必须从持久化值初始化 —— 此前恒为 true，用户关闭后重启会出现
  // 「菜单勾选态 = 开，实际工具栏 = 关」的真值分裂。
  const [selectionToolbarEnabled, setSelectionToolbarEnabledState] = useState<boolean>(() => {
    const def = settingById('appearance.toolbar');
    return def === undefined ? true : readSetting(def) !== false;
  });
  // V7-W2.6（G7-SHELL-06）：字数并入标题栏（Typora macOS「始终显示」选项）
  const [wordCountInTitle, setWordCountInTitle] = useState<boolean>(() => {
    const def = settingById('appearance.wordCount');
    return def !== undefined && readSetting(def) === true;
  });
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerHtml, setReaderHtml] = useState('');
  const [readerOutlineItems, setReaderOutlineItems] = useState<OutlineHeading[]>([]);
  const [readerZoom, setReaderZoomState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(READER_ZOOM_KEY));
      return saved >= 0.5 && saved <= 2 ? saved : 1;
    } catch {
      return 1;
    }
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Cheatsheet（帮助菜单 / 命令面板 help.cheatsheet）
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  // Open With（PRD §79）：检测本机编辑器 → 用其打开当前文件
  const [openWithOpen, setOpenWithOpen] = useState(false);
  const [openWithEditors, setOpenWithEditors] = useState<Array<{ id: string; name: string; launch: string }>>([]);
  const [openWithCustom, setOpenWithCustom] = useState('');
  // 文件信息（PRD §J.1 文件菜单「文件信息」）
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  // 诊断信息（V6-P0-E：appVersion + 渲染层 bundle 指纹，定位 WKWebView 缓存陈旧）
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  // Recent Files（Typora 深度对标 ⑫：欢迎屏最近打开 + 缺失标记）
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() => {
    try { return parseRecentFiles(localStorage.getItem(RECENT_FILES_KEY)); } catch { return []; }
  });
  // V7-W1.1：已关闭文件栈（Typora File → Reopen Closed File；菜单 enabled 依据）
  const [closedFiles, setClosedFiles] = useState<string[]>(() => readClosedFiles());
  const [cursorPos, setCursorPos] = useState('');
  // V6-P2 2.2：窗口标题跟随文档名（Typora 行为；原生标题栏显示）
  const [docTitle, setDocTitle] = useState<string | null>(null);
  // V6-P2 2.1：⌘F 侧栏临时过滤框（quickbar 常驻条已移除）
  const [treeFilterOpen, setTreeFilterOpen] = useState(false);
  const treeFilterRef = useRef<HTMLInputElement | null>(null);
  // 编辑器 iframe 会在挂载后抢焦点（mellow-editor-frame 成为 activeElement）→
  // 挂载后短窗内反复夺回焦点，保证键入直接落在过滤框
  useEffect(() => {
    if (!treeFilterOpen) return;
    const deadline = Date.now() + 1200;
    const timer = window.setInterval(() => {
      const el = treeFilterRef.current;
      if (el === null || !document.contains(el)) { window.clearInterval(timer); return; }
      if (document.activeElement === el) { window.clearInterval(timer); return; }
      if (Date.now() > deadline) { window.clearInterval(timer); return; }
      el.focus();
    }, 60);
    treeFilterRef.current?.focus();
    return () => window.clearInterval(timer);
  }, [treeFilterOpen]);
  // V6-P2 2.2：窗口标题跟随文档名（Typora 行为：macOS 原生标题栏显示「文档名 — Mellow」，
  // dirty 时前缀 ●；无文档时回落「Mellow」）
  // V7-W2.6（G7-SHELL-06）：开启「在标题栏显示字数」后把字数并入标题（Typora macOS
  // 「始终显示」选项；hover 显隐见设置项注释里的 D 类说明）。
  useEffect(() => {
    if (!isTauri()) return;
    if (docTitle === null) {
      void windowServiceRef.current?.setTitle('Mellow');
      return;
    }
    const prefix = dirty ? '● ' : '';
    const words = wordCountInTitle && wordCountData !== null
      ? ` — ${t('status.wordCountShort', { count: wordCountData.cjkChars + wordCountData.words })}`
      : '';
    void windowServiceRef.current?.setTitle(`${prefix}${docTitle}${words} — Mellow`);
  }, [docTitle, dirty, wordCountInTitle, wordCountData, t]);
  const [platformMac] = useState(() => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
  // P2-2.6 快捷键自定义 override：Settings 录制 → localStorage → registry/native menu 装配边界生效
  const [shortcutOverrides, setShortcutOverrides] = useState<ShortcutOverrideMap>(() => readShortcutOverrides());
  const shortcutOverridesRef = useRef(shortcutOverrides);
  shortcutOverridesRef.current = shortcutOverrides;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiEnabled] = useState(() => { try { return localStorage.getItem(AI_ENABLED_KEY) === '1'; } catch { return false; } });
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(THEME_SETTINGS_KEY) ?? 'null') as ThemeSettings | null;
      if (saved !== null && typeof saved === 'object' && (saved.mode === 'system' || saved.mode === 'light' || saved.mode === 'dark')) {
        return { ...DEFAULT_THEME_SETTINGS, ...saved };
      }
    } catch {
      /* 回退默认 */
    }
    return DEFAULT_THEME_SETTINGS;
  });
  const [systemDark, setSystemDark] = useState(false);
  const activeTheme: MellowTheme = resolveActiveTheme(themeSettings, systemDark);

  // 用户主题（Typora themes 文件夹语义）：appData/themes/*.css → 主题菜单 / theme.apply.*
  // 加载 + 注册（registerUserThemes 使 resolveActiveTheme/themeById 可见）；
  // 窗口重新聚焦时重扫（用户在外部投放 CSS 后回到应用即生效）。
  const [userThemeList, setUserThemeList] = useState<MellowTheme[]>([]);
  const refreshUserThemeList = useCallback(() => {
    void refreshUserThemes().then((themes) => {
      setUserThemeList(themes);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshUserThemeList();
    window.addEventListener('focus', refreshUserThemeList);
    return () => window.removeEventListener('focus', refreshUserThemeList);
  }, [refreshUserThemeList]);

  // B3-2 编辑器字体族优先级：用户显式设置（localStorage）> 主题级 editorFontFamily > CoreEditor 默认（null）
  const readEditorFontFamilyPreference = (theme: MellowTheme): string | null => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem('mellow.editor.fontFamily');
    } catch { /* 忽略 */
    }
    if (raw !== null && raw !== '') return raw;
    return theme.editorFontFamily ?? null;
  };

  // 系统亮暗跟随（System 模式）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 应用主题：CSS 变量 + theme CSS + data 属性 + 编辑器内容区主题
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = activeTheme.id;
    root.dataset.colorScheme = activeTheme.kind;
    for (const [key, value] of Object.entries(activeTheme.variables)) {
      root.style.setProperty(key, value);
    }
    let style = document.getElementById('mellow-theme-css') as HTMLStyleElement | null;
    if (style === null) {
      style = document.createElement('style');
      style.id = 'mellow-theme-css';
      document.head.appendChild(style);
    }
    style.textContent = activeTheme.themeCss;
    hostRef.current?.setTheme(activeTheme.editorTheme);
    // V5：md 排版 token 注入编辑器 iframe（engine __MELLOW_THEME_TOKENS__ 桥）
    hostRef.current?.setMdTokens(activeTheme.variables);
    // B3-2 主题级编辑器字体：用户显式设置 > 主题（衬线风）> CoreEditor 默认（ui-monospace）
    const family = readEditorFontFamilyPreference(activeTheme);
    hostRef.current?.setEditorConfig('setFontFace', { family: family ?? 'ui-monospace' });
  }, [activeTheme]);

  const setThemeSettingsAndPersist = useCallback((next: ThemeSettings) => {
    setThemeSettings(next);
    try {
      localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  }, []);

  const setLocaleSettingPersist = useCallback((next: LocaleSetting) => {
    setLocaleSetting(next);
    try {
      localStorage.setItem(LOCALE_SETTING_KEY, next);
    } catch {
      /* 忽略 */
    }
  }, []);



  const applyThemeById = useCallback((id: string) => {
    const theme = themeById(id);
    if (theme === undefined) return;
    setThemeSettingsAndPersist({
      ...themeSettings,
      mode: theme.kind,
      [theme.kind === 'light' ? 'lightThemeId' : 'darkThemeId']: id,
    });
  }, [setThemeSettingsAndPersist, themeSettings]);

  // User CSS（Typora 机制对标，V7-W5）：三层叠加，**后层覆盖前层**——
  //   ① `base.user.css`        全局，对所有主题生效（Typora base.user.css）
  //   ② `<themeId>.user.css`   当前主题专属（Typora [theme].user.css）
  //   ③ `user.css`             Mellow 既有单文件，优先级最高（向后兼容既有用户）
  // 三个 <style> 元素**同步按序创建**后再异步填内容：读取是异步且完成顺序不确定，
  // 若按 resolve 顺序 append，层叠顺序会漂移（同一份 CSS 表现时好时坏）。
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    // 目录与 Typora 一致：base / <theme> 在 **themes 目录**；Mellow 既有的单文件
    // user.css 留在 appData 根（向后兼容既有用户），作为最高优先级层。
    const layers: ReadonlyArray<{ id: string; subDir: string; file: string }> = [
      { id: 'mellow-user-css-base', subDir: USER_THEMES_DIR, file: USER_CSS_BASE_FILE },
      { id: 'mellow-user-css-theme', subDir: USER_THEMES_DIR, file: themeUserCssFile(activeTheme.id) },
      { id: 'mellow-user-css', subDir: '', file: USER_CSS_FILE },
    ];
    // 按 layers 顺序取得（必要时创建）style 节点，保证 DOM 顺序 == 层叠顺序
    const nodes = layers.map((layer) => {
      const existing = document.getElementById(layer.id) as HTMLStyleElement | null;
      if (existing !== null) return existing;
      const style = document.createElement('style');
      style.id = layer.id;
      document.head.appendChild(style);
      return style;
    });
    void import('@tauri-apps/api/path').then(async ({ appDataDir, join }) => {
      const { invoke } = await import('@tauri-apps/api/core');
      const appData = await appDataDir();
      for (let i = 0; i < layers.length; i += 1) {
        try {
          const dir = layers[i].subDir === '' ? appData : await join(appData, layers[i].subDir);
          const path = await join(dir, layers[i].file);
          const content = await invoke<string>('read_text', { path });
          if (cancelled) return;
          nodes[i].textContent = content;
        } catch {
          if (cancelled) return;
          // 文件不存在/不可读 → 清空（切换主题后旧主题的专属 CSS 必须立即失效）
          nodes[i].textContent = '';
        }
      }
    }).catch(() => {
      /* appDataDir 不可用时整体静默 */
    });
    return () => {
      cancelled = true;
    };
  }, [activeTheme.id]);
  const [slashEnabled, setSlashEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SLASH_ENABLED_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [slashMode, setSlashMode] = useState(false);
  const slashTriggerRef = useRef<{ from: number; to: number } | null>(null);
  const slashEnabledRef = useRef(slashEnabled);
  slashEnabledRef.current = slashEnabled;
  const [commandPaletteRecent, setCommandPaletteRecent] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(COMMAND_PALETTE_RECENT_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  // 启动发现的未恢复文档（恢复 / 比较 / 忽略）
  const [recoveryEntries, setRecoveryEntries] = useState<RecoveryEntry[]>([]);
  // 外部变更冲突（dirty 时三选项：比较 / 重新加载磁盘版本 / 保留 Mellow 版本）
  const [conflict, setConflict] = useState<ExternalChangeDetail | null>(null);
  // asset 目录全局设置（PRD §53 global；localStorage 持久化）
  const [assetDir, setAssetDirState] = useState<AssetDirConfig>(() => {
    const saved = localStorage.getItem(GLOBAL_ASSET_DIR_KEY);
    return (saved as AssetDirConfig | null) ?? 'assets';
  });
  // 文件操作 toast（PRD §58：已移动 xxx [撤销]）
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void; action?: { label: string; run: () => void } } | null>(null);

  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);

  // ── 安全 Auto Update 处理（channel / check / download / restart / rollback）──

  // Windows Portable 模式标志（Rust is_portable；启动时加载一次）
  const portableRef = useRef(false);
  // release 构建守卫（Rust is_release_build，anySSH 模式）：debug/dev 构建绝不
  // 自更新（会把 release 覆盖到运行中的二进制上造成损坏）；未知按保守处理
  const releaseBuildRef = useRef<boolean | null>(null);
  const isAutoInstallEnabled = useCallback(() => {
    const def = settingById('general.updater.autoInstall');
    return def !== undefined && readSetting(def) === true;
  }, []);

  /**
   * 检查更新（仅发送版本/平台/渠道元数据；无用户数据、无遥测）。
   * manual=true（设置页/命令触发）：忽略「跳过此版本」，且发现即展示。
   * 自动安装（anySSH autoUpdate 模式）：autoInstall 开 + release 构建 →
   * 静默 rollback 备份 → 下载（Rust 校验签名）→ 安装并重启进入新版本。
   */
  const runUpdateCheck = useCallback(async (options?: { manual?: boolean }) => {
    const manual = options?.manual === true;
    if (!isTauri()) return;
    // Windows Portable：应用内更新不可用（替换 exe 与运行中进程冲突），降级为下载提示（master-plan R1-2）
    if (portableRef.current) {
      setToast({ message: t('updater.portable') });
      return;
    }
    setUpdateUi({ phase: 'checking' });
    try {
      const update = await checkForUpdate(updateChannelFromSettings());
      if (update === null) {
        setUpdateUi({ phase: 'upToDate' });
        window.setTimeout(() => setUpdateUi({ phase: 'idle' }), 4000);
        return;
      }
      pendingUpdateRef.current = update;
      // 自动升级：静默下载安装并重启（dev 构建由 releaseBuildRef 拦截）
      if (isAutoInstallEnabled() && releaseBuildRef.current === true) {
        setToast({ message: t('updater.autoInstalling', { version: update.version }) });
        await prepareRollback();
        await downloadUpdate(update, (p) => {
          const total = p.total ?? 0;
          const percent = total > 0 ? Math.min(100, Math.round((p.downloaded / total) * 100)) : 0;
          setUpdateUi({ phase: 'downloading', percent });
        });
        await installUpdateAndRestart(update); // 安装并重启进入新版本
        return;
      }
      // 非自动模式：启动/定时检查不打扰「已跳过」的版本；手动检查始终展示
      if (!manual) {
        let skipped: string | null = null;
        try { skipped = localStorage.getItem('mellow.updater.skippedVersion'); } catch { /* noop */ }
        if (skipped === update.version) {
          setUpdateUi({ phase: 'idle' });
          return;
        }
      }
      setUpdateUi({ phase: 'available', version: update.version });
    } catch (err) {
      setUpdateUi({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [isAutoInstallEnabled, t]);

  const handleUpdateLater = useCallback(() => {
    setUpdateUi({ phase: 'idle' });
  }, []);

  /** 跳过此版本：记录版本号，本次安装内不再弹启动/定时提示（anySSH skipUpdate 模式） */
  const handleSkipUpdate = useCallback(() => {
    const version = pendingUpdateRef.current?.version;
    if (version !== undefined) {
      try { localStorage.setItem('mellow.updater.skippedVersion', version); } catch { /* noop */ }
    }
    setUpdateUi({ phase: 'idle' });
  }, []);

  /** 立即更新：rollback 备份当前版本 → 下载（Rust 校验签名）→ 提示重启安装 */
  const handleUpdateNow = useCallback(async () => {
    // dev/debug 构建守卫：绝不把 release 覆盖到运行中的二进制上（anySSH is_release_build 模式）
    if (releaseBuildRef.current !== true) {
      setToast({ message: t('updater.devGuard') });
      setUpdateUi({ phase: 'idle' });
      return;
    }
    setUpdateUi({ phase: 'downloading', percent: 0 });
    try {
      await prepareRollback();
      const update = pendingUpdateRef.current;
      if (update === null) throw new Error('no pending update');
      await downloadUpdate(update, (p) => {
        const total = p.total ?? 0;
        const percent = total > 0 ? Math.min(100, Math.round((p.downloaded / total) * 100)) : 0;
        setUpdateUi({ phase: 'downloading', percent });
      });
      setUpdateUi({ phase: 'ready' });
    } catch (err) {
      setUpdateUi({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [t]);

  const handleInstallRestart = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (update === null) return;
    try {
      await installUpdateAndRestart(update);
    } catch (err) {
      setUpdateUi({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  /** 回滚到更新前版本（macOS/Linux 直接 relaunch；Windows 退出交给 helper） */
  const handleRollback = useCallback(async () => {
    setRollbackPrompt(null);
    try {
      const outcome = await rollbackRestore();
      await restartAfterRollback(outcome);
    } catch (err) {
      setToast({ message: `${t('updater.rollbackFailed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t]);

  /** 继续使用当前版本 → 视为健康，清理备份 */
  const handleRollbackKeep = useCallback(async () => {
    setRollbackPrompt(null);
    await rollbackCommit().catch(() => undefined);
  }, []);

  // ── RC F1：PDF 导出（PRD §72 / golden journey #19；与打印共享排版常量）──
  const handleExportPdf = useCallback(async () => {
    const tab = docStateRef.current.doc;
    if (tab === null || hostRef.current === null) return;
    try {
      const [{ createPdfBuffer, loadNotoFonts, DEFAULT_PDF_OPTIONS }, savePath] = await Promise.all([
        import('../../../packages/export/src/index'),
        invoke<string | null>('pick_save_path', {
          defaultName: `${(tab.title ?? 'untitled').replace(/\.md$/i, '')}.pdf`,
          filters: ['pdf'],
        }),
      ]);
      if (savePath === null) return; // 用户取消
      const fonts = await loadNotoFonts();
      const buffer = await createPdfBuffer(hostRef.current.getText(), DEFAULT_PDF_OPTIONS, { fonts });
      await invoke('write_binary', { path: savePath, data: Array.from(buffer) });
      setToast({ message: t('export.pdf.done') });
    } catch (err) {
      setToast({ message: `${t('export.pdf.failed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t]);

  // ── RC F6：导出 HTML（PRD §73；with-theme 单文件，白名单 sanitize）──
  // Pandoc 导出（PRD §75 P1 / deep-parity A9 / D2 格式扩展）：
  // 检测 pandoc → 选路径 → 导出（docx/odt/rtf/epub/latex/mediawiki/rst/textile/opml）
  // pandoc 以磁盘文件为输入，未保存文档先提示保存（Typora 导出前隐式落盘的差异点）
  const handleExportPandoc = useCallback(async (format: string, ext: string) => {
    const tab = docStateRef.current.doc;
    if (tab === null || hostRef.current === null) return;
    if (!isTauri()) return;
    if (tab.path === null) {
      setStatusText(t('msg.renameNeedsSave'));
      return;
    }
    try {
      const available = await invoke<boolean>('pandoc_available');
      if (!available) {
        setToast({ message: t('export.pandoc.needPandoc') });
        return;
      }
      const savePath = await invoke<string | null>('pick_save_path', {
        defaultName: `${(tab.title ?? 'untitled').replace(/\.md$/i, '')}.${ext}`,
        filters: [ext],
      });
      if (savePath === null) return;
      await invoke('pandoc_export', { input: tab.path, output: savePath, format });
      // 记录上次导出（Typora「使用上一次设置导出」⌃E；按文档路径绑定）
      try {
        localStorage.setItem('mellow.export.last', JSON.stringify({ docPath: tab.path, format, output: savePath }));
      } catch { /* quota 满 → 忽略（仅失去 ⌃E 记忆） */ }
      setToast({ message: t('export.pandoc.done', { format }) });
    } catch (err) {
      setToast({ message: `${t('export.pandoc.failed', { format })}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t]);

  /** D2：pandoc 导出命令表（Typora 导出子菜单全量对齐；id = 菜单/命令 id） */
  const PANDOC_EXPORT_COMMANDS: ReadonlyArray<{ id: string; format: string; ext: string; zh: string; en: string }> = [
    { id: 'export.docx', format: 'docx', ext: 'docx', zh: '导出 Word…', en: 'Export Word…' },
    { id: 'export.odt', format: 'odt', ext: 'odt', zh: '导出 OpenOffice…', en: 'Export OpenOffice…' },
    { id: 'export.rtf', format: 'rtf', ext: 'rtf', zh: '导出 RTF…', en: 'Export RTF…' },
    { id: 'export.epub', format: 'epub', ext: 'epub', zh: '导出 Epub…', en: 'Export Epub…' },
    { id: 'export.latex', format: 'latex', ext: 'tex', zh: '导出 LaTeX…', en: 'Export LaTeX…' },
    { id: 'export.mediawiki', format: 'mediawiki', ext: 'txt', zh: '导出 Media Wiki…', en: 'Export Media Wiki…' },
    { id: 'export.rst', format: 'rst', ext: 'rst', zh: '导出 reStructuredText…', en: 'Export reStructuredText…' },
    { id: 'export.textile', format: 'textile', ext: 'textile', zh: '导出 Textile…', en: 'Export Textile…' },
    { id: 'export.opml', format: 'opml', ext: 'opml', zh: '导出 OPML…', en: 'Export OPML…' },
  ];

  // D2：使用上一次设置导出（Typora ⌃E 语义合并「覆盖上一次导出文件」：
  // 同一文档 + 上次 pandoc 导出记录存在 → 直接覆盖导出）
  const handleExportRepeat = useCallback(async () => {
    const tab = docStateRef.current.doc;
    if (tab === null || !isTauri()) return;
    if (tab.path === null) {
      setStatusText(t('msg.renameNeedsSave'));
      return;
    }
    let last: { docPath: string; format: string; output: string } | null = null;
    try {
      last = JSON.parse(localStorage.getItem('mellow.export.last') ?? 'null');
    } catch { last = null; }
    if (last === null || last.docPath !== tab.path) {
      setToast({ message: t('export.repeat.none') });
      return;
    }
    try {
      const available = await invoke<boolean>('pandoc_available');
      if (!available) {
        setToast({ message: t('export.pandoc.needPandoc') });
        return;
      }
      await invoke('pandoc_export', { input: tab.path, output: last.output, format: last.format });
      setToast({ message: t('export.repeat.done', { path: last.output }) });
    } catch (err) {
      setToast({ message: `${t('export.pandoc.failed', { format: last.format })}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t]);

  // 导出 HTML（PRD §73；with-theme 单文件，白名单 sanitize；D2 增 without-style 无样式模式）
  const runExportHtml = useCallback(async (mode: 'with-theme' | 'without-style') => {
    const tab = docStateRef.current.doc;
    if (tab === null || hostRef.current === null) return;
    try {
      const [{ exportHtml }, savePath] = await Promise.all([
        import('../../../packages/export/src/html/index'),
        invoke<string | null>('pick_save_path', {
          defaultName: `${(tab.title ?? 'untitled').replace(/\.md$/i, '')}.html`,
          filters: ['html', 'htm'],
        }),
      ]);
      if (savePath === null) return; // 用户取消
      const html = await exportHtml(hostRef.current.getText(), {
        mode,
        theme: themeSettings.mode === 'dark' ? 'dark' : 'light',
        title: tab.title ?? undefined,
      });
      await invoke('write_text', { path: savePath, content: html });
      setToast({ message: t('export.html.done') });
    } catch (err) {
      setToast({ message: `${t('export.html.failed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t, themeSettings.mode]);
  const handleExportHtml = useCallback(() => runExportHtml('with-theme'), [runExportHtml]);
  const handleExportHtmlPlain = useCallback(() => runExportHtml('without-style'), [runExportHtml]);

  /** 图片 src → 可显示/可加载 URL（相对路径基于当前文档目录，Tauri asset 协议）；Reader 与图片导出共用 */
  const readerResolveImageSrc = useCallback((src: string) => {
    if (/^(?:https?:|data:|#)/i.test(src)) return src;
    const docPath = filePathRef.current;
    const base = docPath === null ? '' : docPath.replace(/[\/][^\/]*$/, '');
    const abs = base === '' ? src : `${base}/${src}`;
    if ('__TAURI_INTERNALS__' in window) {
      try {
        return convertFileSrc(abs.replace(/^file:\/\//, ''));
      } catch {
        return abs;
      }
    }
    return abs;
  }, []);

  // ── B5+: 导出图片 PNG/JPEG（PRD §74：width / quality / long-image protection）──
  const handleExportImage = useCallback(async () => {
    const tab = docStateRef.current.doc;
    if (tab === null || hostRef.current === null) return;
    try {
      // 设置读取（PRD §74 参数；localStorage 值不可信任 → 回退默认）
      const settingsFormat = localStorage.getItem('mellow.export.image.format') === 'jpeg' ? 'jpeg' : 'png';
      const widthRaw = Number(localStorage.getItem('mellow.export.image.width'));
      const qualityRaw = Number(localStorage.getItem('mellow.export.image.quality'));
      const [{ exportImageBytes, DEFAULT_IMAGE_OPTIONS }, savePath] = await Promise.all([
        import('../../../packages/export/src/image/index'),
        invoke<string | null>('pick_save_path', {
          defaultName: `${(tab.title ?? 'untitled').replace(/\.md$/i, '')}.${settingsFormat === 'jpeg' ? 'jpg' : 'png'}`,
          filters: ['png', 'jpg', 'jpeg'],
        }),
      ]);
      if (savePath === null) return; // 用户取消
      // 保存路径扩展名优先（用户在对话框中改名 → 按扩展名出格式）
      const extFormat = /\.(jpe?g)$/i.test(savePath) ? 'jpeg' : /\.png$/i.test(savePath) ? 'png' : settingsFormat;
      const options: ImageExportOptions = {
        ...DEFAULT_IMAGE_OPTIONS,
        format: extFormat,
        width: Number.isFinite(widthRaw) && widthRaw >= 200 ? widthRaw : DEFAULT_IMAGE_OPTIONS.width,
        quality: Number.isFinite(qualityRaw) && qualityRaw > 0 ? Math.min(qualityRaw, 1) : DEFAULT_IMAGE_OPTIONS.quality,
        theme: themeSettings.mode === 'dark' ? 'dark' : 'light',
      };
      // canvas 装配（浏览器/webview Adapter）
      const scratch = document.createElement('canvas').getContext('2d');
      const imageCache = new Map<string, HTMLImageElement>();
      const loadImage = (src: string): Promise<{ data: string; width: number; height: number } | null> =>
        new Promise((resolve) => {
          const url = readerResolveImageSrc(src);
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            imageCache.set(url, img);
            resolve({ data: url, width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      const drawImage = (src: string, ctx: Canvas2DLike, x: number, y: number, w: number, h: number): void => {
        const img = imageCache.get(src);
        if (img !== undefined) (ctx as CanvasRenderingContext2D).drawImage(img, x, y, w, h);
      };
      const measureText = (text: string, font: { css: string; size: number }): number => {
        if (scratch === null) return text.length * font.size * 0.6;
        scratch.font = font.css;
        return scratch.measureText(text).width;
      };
      const bytes = await exportImageBytes(hostRef.current.getText(), options, {
        measureText,
        loadImage,
        drawImage,
      }, (w, h) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('canvas 2d context unavailable');
        // 引擎只写入 string fillStyle/strokeStyle；DOM 联合类型在此断言为写契约
        return { ctx: ctx as unknown as Canvas2DLike, toDataURL: (mime: string, quality?: number) => canvas.toDataURL(mime, quality) };
      });
      await invoke('write_binary', { path: savePath, data: Array.from(bytes) });
      setToast({ message: t('export.image.done') });
    } catch (err) {
      if ((err as { code?: unknown }).code === 'image-too-long') {
        setToast({ message: t('export.image.tooLong') });
        return;
      }
      setToast({ message: `${t('export.image.failed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t, themeSettings.mode, readerResolveImageSrc]);

  /** 启动：更新健康确认（rollback 策略）+ 启动后定时检查更新 */
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      portableRef.current = await invoke<boolean>('is_portable').catch(() => false);
      // release 构建守卫（updater 安装路径）：invoke 失败按保守 false 处理
      releaseBuildRef.current = await invoke<boolean>('is_release_build').catch(() => false);
      // 诊断信息用 appVersion（V6-P0-E）
      setAppVersion(await getVersion().catch(() => ''));
      try {
        const status = await rollbackStatus();
        if (status !== null && status.pending) {
          const current = await getVersion();
          if (current === status.previousVersion) {
            await rollbackCommit(); // 版本未变 → 直接清理
          } else {
            const noted = await rollbackNoteLaunch();
            if (noted !== null && noted.launchCount >= 2) {
              if (!cancelled) setRollbackPrompt(status); // 上次启动未完成健康确认 → 可回滚
            } else {
              // 健康确认窗口：15s 后提交（删除备份与 marker）
              window.setTimeout(() => { void rollbackCommit().catch(() => undefined); }, 15000);
            }
          }
        }
      } catch {
        /* 更新未配置/失败不阻塞启动 */
      }
      if (!cancelled) {
        let checkEnabled = true;
        try {
          checkEnabled = localStorage.getItem('mellow.updater.checkOnStartup') !== '0';
        } catch {
          /* noop */
        }
        // dev serve（vite localhost）跳过自动检查：updater 端点未配置/不可达时
        // check() 挂起，启动 banner「正在检查更新…」永不消失（Aug 19 真机验证发现）。
        // release 各平台均执行检查（不可达时由 checkForUpdate 的 15s 超时兜底转 error）。
        const isDevServe = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        // Windows Portable 跳过启动自动检查（应用内更新不可用，master-plan R1-2）
        if (checkEnabled && !isDevServe && !portableRef.current) {
          window.setTimeout(() => { void runUpdateCheck(); }, 4000);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [runUpdateCheck]);


  const readQuickOpenRecent = useCallback((): string[] => {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUICK_OPEN_RECENT_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, []);

  const rememberQuickOpenRecent = useCallback((path: string) => {
    const next = [path, ...readQuickOpenRecent().filter((p) => p !== path)].slice(0, 50);
    localStorage.setItem(QUICK_OPEN_RECENT_KEY, JSON.stringify(next));
  }, [readQuickOpenRecent]);

  const commandContext = useCallback((source: CommandSource, payload?: unknown) => createCommandContext({
    source,
    platform: navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win-linux',
    locale: locale === 'zh-CN' ? 'zh' : 'en',
    documentPath: filePathRef.current,
    workspaceRoot: fileTreeRoot,
    hasSelection: hostRef.current?.getState().hasSelection ?? false,
    targetPath: selectedTreePath,
    payload,
  }), [fileTreeRoot, locale, selectedTreePath]);

  const rememberCommandRecent = useCallback((id: string) => {
    setCommandPaletteRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20);
      localStorage.setItem(COMMAND_PALETTE_RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const dispatchCommand = useCallback(async (id: string, source: CommandSource = 'menu', payload?: unknown) => {
    const ok = await commandRegistryRef.current.dispatch(id, commandContext(source, payload));
    if (ok) rememberCommandRecent(id);
    else setStatusText(t('msg.commandUnavailable', { id }));
    return ok;
  }, [commandContext, rememberCommandRecent]);

  const setFocusMode = useCallback((mode: 'off' | 'line' | 'paragraph') => {
    hostRef.current?.setFocusMode(mode);
    setFocusModeState(mode);
    setStatusText(mode === 'off' ? t('msg.focusOff') : mode === 'line' ? t('msg.focusLine') : t('msg.focusParagraph'));
  }, []);

  const cycleFocusMode = useCallback(() => {
    const next = focusMode === 'off' ? 'line' : focusMode === 'line' ? 'paragraph' : 'off';
    setFocusMode(next);
  }, [focusMode, setFocusMode]);

  const setTypewriterMode = useCallback((on: boolean) => {
    hostRef.current?.setTypewriterMode(on);
    setTypewriterEnabled(on);
    setStatusText(on ? t('msg.typewriterOn') : t('msg.typewriterOff'));
  }, []);

  const toggleTypewriter = useCallback(() => {
    setTypewriterMode(!typewriterEnabled);
  }, [setTypewriterMode, typewriterEnabled]);

  // P2-2.6 快捷键可编辑：Settings 录制新键位（accelerator = null 表示恢复默认）。
  // 单一真源不变 —— schema 仍是默认值唯一来源，override 仅在装配边界覆盖。
  const handleShortcutOverride = useCallback((commandId: string, accelerator: string | null) => {
    const next: ShortcutOverrideMap = { ...shortcutOverridesRef.current };
    if (accelerator === null) {
      delete next[commandId];
    } else {
      const platformKey = platformMac ? 'mac' as const : 'winLinux' as const;
      next[commandId] = { ...next[commandId], [platformKey]: accelerator };
    }
    shortcutOverridesRef.current = next;
    setShortcutOverrides(next);
    writeShortcutOverrides(next);
  }, [platformMac]);

  const setSelectionToolbarEnabled = useCallback((on: boolean) => {
    hostRef.current?.setSelectionToolbarEnabled(on);
    setSelectionToolbarEnabledState(on);
    setStatusText(on ? t('msg.toolbarOn') : t('msg.toolbarOff'));
    // 原生菜单勾选态（View → 工具栏）由 syncNativeMenu 的 selectionToolbarEnabled 依赖自动重建
  }, [t]);

  const toggleSelectionToolbar = useCallback(() => {
    setSelectionToolbarEnabled(!selectionToolbarEnabled);
  }, [selectionToolbarEnabled, setSelectionToolbarEnabled]);

  const openReader = useCallback(() => {
    const host = hostRef.current;
    const active = docStateRef.current.doc;
    if (!host || active === null) return;
    const content = host.getText();
    const result = renderReaderHtml(content, { resolveImageSrc: readerResolveImageSrc });
    setReaderHtml(result.html);
    setReaderOutlineItems(result.outline);
    setReaderTitle(active.title);
    setReaderOpen(true);
    setStatusText(t('msg.readerOn'));
  }, [readerResolveImageSrc]);

  const closeReader = useCallback(() => {
    setReaderOpen(false);
    setStatusText(t('msg.readerOff'));
  }, []);

  const setReaderZoom = useCallback((next: number) => {
    const clamped = Math.max(0.5, Math.min(2, next));
    setReaderZoomState(clamped);
    try {
      localStorage.setItem(READER_ZOOM_KEY, String(clamped));
    } catch {
      /* no-op */
    }
  }, []);

  const openFileInfo = useCallback(() => setFileInfoOpen(true), []);
  /** 诊断信息（V6-P0-E）：读取渲染层 bundle 指纹；与 appVersion 不一致 = WKWebView 命中旧缓存 */
  const readBundleVersion = useCallback((): string => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_BUNDLE_VERSION__?: string }) | null;
    return win?.__MELLOW_BUNDLE_VERSION__ ?? '—';
  }, []);

  /** 诊断探针（V7-I5）：渲染层 config 字号阶梯 + DOM 实测 H1/正文字号（真机「标题同字号」定位） */
  const readEditorStyleProbe = useCallback((): { configFontSize: number; diffs: number[]; h1Measured: string; bodyMeasured: string } | null => {
    try {
      const frame = containerRef.current?.querySelector('iframe');
      const doc = frame?.contentDocument;
      const win = frame?.contentWindow as (Window & { config?: { fontSize?: number; headerFontSizeDiffs?: number[] } }) | null;
      if (doc === null || doc === undefined || win === null || win === undefined) return null;
      const configFontSize = win.config?.fontSize ?? 0;
      const diffs = win.config?.headerFontSizeDiffs ?? [];
      const probeLine = (text: string): string => {
        const lines = Array.from(doc.querySelectorAll('.cm-content .cm-line'));
        const line = lines.find((l) => (l.textContent ?? '').includes(text));
        if (line === null || line === undefined) return '—';
        const span = Array.from(line.querySelectorAll('span')).find((s) => (s.textContent ?? '').includes(text) && parseFloat(getComputedStyle(s).fontSize) > 0);
        return span !== null && span !== undefined
          ? `${getComputedStyle(span).fontSize} (line ${getComputedStyle(line).fontSize})`
          : getComputedStyle(line).fontSize;
      };
      const bodyLine = Array.from(doc.querySelectorAll('.cm-content .cm-line')).find((l) => !l.classList.contains('mellow-heading-line'));
      return {
        configFontSize,
        diffs,
        h1Measured: probeLine('H1'),
        bodyMeasured: bodyLine !== null && bodyLine !== undefined ? getComputedStyle(bodyLine).fontSize : '—',
      };
    } catch {
      return null;
    }
  }, []);

  const openOpenWith = useCallback(() => {
    setOpenWithCustom('');
    setOpenWithEditors([]);
    setOpenWithOpen(true);
    if (isTauri()) {
      void invoke<Array<{ id: string; name: string; launch: string }>>('detect_open_with')
        .then((apps) => setOpenWithEditors(apps))
        .catch(() => setOpenWithEditors([]));
    }
  }, []);

  const runOpenWith = useCallback(async (launch: string) => {
    const path = filePathRef.current;
    if (path === null) { setStatusText(t('msg.saveFirst')); return; }
    setOpenWithOpen(false);
    try {
      await invoke('open_with_editor', { launch, filePath: path });
      setStatusText(t('msg.openWithLaunched', { editor: launch }));
    } catch (err) {
      setStatusText(`${t('msg.openWithFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [t]);

  const openSlashUi = useCallback(() => {
    commandPaletteModelRef.current.selectedIndex = 0;
    setCommandPaletteSelected(0);
    setCommandPaletteQuery('');
    setSlashMode(true);
    setCommandPaletteVisible(true);
  }, []);

  /** Engine → host：行首 `/` 触发（仅当 Slash Commands 启用时接受） */
  const handleSlashOpen = useCallback((request: SlashOpenRequest) => {
    if (!slashEnabledRef.current) return;
    slashTriggerRef.current = { from: request.from, to: request.to };
    openSlashUi();
  }, [openSlashUi]);

  const toggleSlashEnabled = useCallback(() => {
    setSlashEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SLASH_ENABLED_KEY, String(next));
      return next;
    });
  }, []);

  /** 统一命令插入入口：slash command execute 都经此替换触发前缀（不留下 `/`，单 Undo） */
  const replaceSlashTrigger = useCallback((text: string) => {
    const host = hostRef.current;
    if (!host) return;
    const trigger = slashTriggerRef.current;
    if (trigger !== null) {
      host.insertText(text, trigger.from, trigger.to);
      slashTriggerRef.current = null;
    } else {
      const head = host.getSelectionHead?.() ?? 0;
      host.insertText(text, head, head);
    }
  }, []);

  /** V7-W1.7：格式 → 图像 → 插入本地图片…（Typora「Insert Local Images」）。
   *  文件选择器选图 → 光标处插入 Markdown 图片语法；同根路径下优先相对路径（Typora 行为）。 */
  const insertLocalImage = useCallback(async () => {
    const dialog = dialogRef.current;
    const host = hostRef.current;
    if (!dialog || !host) return;
    const r = await dialog.showOpen({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'] }],
    });
    if (!r.ok || r.value === null) return;
    const docPath = filePathRef.current;
    let src = r.value;
    if (docPath !== null) {
      const dir = fileTreeDirname(docPath);
      // 仅同根（同盘/同卷）用相对路径，避免跨卷产生一长串 ../
      const rootOf = (p: string): string => p.replace(/\\/g, '/').split('/').filter(Boolean)[0] ?? '';
      if (rootOf(dir) === rootOf(r.value)) src = fileTreeRelativePath(dir, r.value);
    }
    const alt = src.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
    replaceSlashTrigger(`![${alt}](${src})`);
  }, [replaceSlashTrigger]);

  const persistTabs = useCallback(() => {
    // B1（SDI）：仅主窗口写会话（mellow.tabs.session）；非主窗口（⌘N 新窗）不参与，
    // 避免多窗口并发覆盖同一 localStorage key。Phase 4 将整体迁至 Rust windows.json。
    if (!primaryWindowRef.current) return;
    try {
      localStorage.setItem(TABS_SESSION_KEY, JSON.stringify(docStateRef.current.snapshot()));
    } catch {
      // localStorage quota / private mode：session restore 降级，不影响编辑
    }
  }, []);

  const refreshTabsState = useCallback(() => {
    // B1（SDI）：tabs/activeTabId state 已移除（无标签栏/Overview 消费方），
    // 本函数保留为「写入会话 + 命名稳定的刷新点」，供各 handler 调用。
    persistTabs();
  }, [persistTabs]);

  const currentTabPatch = useCallback((host: EditorCore): Partial<DocumentTab> => ({
    path: filePathRef.current,
    title: filePathRef.current === null ? t('doc.untitled') : filePathRef.current.split(/[\\/]/).pop() ?? filePathRef.current,
    content: host.getText(),
    dirty: dirtyRef.current,
    documentId: docIdRef.current,
    revision: revisionRef.current,
    encoding: docMetaRef.current.encoding,
    eol: docMetaRef.current.eol,
    diskState: diskStateRef.current,
  }), []);

  /** B1（SDI）：把编辑器的当前内容/元数据同步进单文档状态（DocumentState）。 */
  const syncDocFromEditor = useCallback(() => {
    const host = hostRef.current;
    if (!host || docStateRef.current.doc === null) return;
    docStateRef.current.updateCurrent(currentTabPatch(host));
    refreshTabsState();
  }, [currentTabPatch, refreshTabsState]);

  /** B1（SDI）：单文档关闭确认 —— 当前文档 dirty 时弹「丢弃修改」确认；干净直接放行。 */
  const confirmCloseDocument = useCallback((doc: DocumentTab): boolean => {
    if (!doc.dirty) return true;
    return window.confirm(t('dialog.closeDocDirty'));
  }, []);

  /** B1（SDI）：打开/新建另一文档前确保窗口内只有当前文档。
   *  当前文档 dirty → 丢弃确认；通过后清空文档状态，随后调用方再 open 新文档。
   *  返回 false 表示用户取消（调用方不得继续打开）。
   *  注：必须先于 openTreeFile/handleNew/handleOpen 等调用方声明（deps 数组即时求值）。 */
  const guardSingleDocument = useCallback((): boolean => {
    syncDocFromEditor();
    const existing = docStateRef.current.doc;
    if (existing !== null) {
      if (!confirmCloseDocument(existing)) return false;
      docStateRef.current = new DocumentState();
    }
    return true;
  }, [confirmCloseDocument, syncDocFromEditor]);

  // 状态栏编码/行尾：读真实文档元数据（docMetaRef），不再硬编码
  const encodingLabel = useMemo(() => {
    const enc = docMetaRef.current.encoding;
    if (enc === 'utf-8-bom') return t('status.encoding.utf8bom');
    if (enc === 'utf-16le') return t('status.encoding.utf16le');
    if (enc === 'utf-16be') return t('status.encoding.utf16be');
    if (enc === 'latin1') return t('status.encoding.latin1');
    return t('status.utf8');
  }, [t]);
  const eolLabel = useMemo(() => {
    return docMetaRef.current.eol === '\r\n' ? t('status.eol.crlf') : t('status.lf');
  }, [t]);

  const refreshStats = useCallback((host: EditorCore) => {
    try {
      const text = host.getText();
      const count = countWords(text);
      const base = formatWordCountStats(count, locale === 'zh-CN' ? 'zh' : 'en');
      const reading = t('status.readingTime', { minutes: count.readingTimeMinutes });
      setStats(base + ' · ' + reading);
      setWordCountData(count); // R2-2 字数统计窗口（面板未开时轻量更新 state）
    } catch {
      setStats('');
    }
  }, [locale, t]);

  /** Status Bar 行:列（viewUpdate 时刷新） */
  const refreshCursorPos = useCallback((host: EditorCore) => {
    try {
      const head = host.getSelectionHead();
      if (head === null) {
        setCursorPos('');
        return;
      }
      const text = host.getText();
      const clamped = Math.max(0, Math.min(text.length, head));
      const before = text.slice(0, clamped);
      const line = before.split('\n').length;
      const col = clamped - (before.lastIndexOf('\n') + 1);
      setCursorPos(t('status.cursor', { line, col }));
    } catch {
      setCursorPos('');
    }
  }, []);

  /** 监听当前文档路径（外部变化检测） */
  const watchDocument = useCallback(async (path: string | null) => {
    const external = externalRef.current;
    if (!external) return;
    if (!path) {
      await external.stop();
      return;
    }
    await external.start(path);
  }, []);

  const applyTab = useCallback(async (tab: DocumentTab) => {
    const host = hostRef.current;
    if (!host) return;
    // PRD §101 Auto Save：切换文档前保存当前 dirty 文档（默认 Window Blur + Document Switch）
    await maybeAutoSaveRef.current?.();
    setReaderOpen(false);
    suppressEditorEventRef.current = true;
    filePathRef.current = tab.path;
    docIdRef.current = tab.documentId;
    setDocTitle(tab.title);
    // 窗口标题兜底：标题 effect（依赖 re-render + windowServiceRef 时序）在真机上
    // 可能未生效（v1.5.3 截图标题栏仅 "Mellow"），这里在文档应用点直接同步设置。
    void windowServiceRef.current?.setTitle(`${tab.dirty ? '● ' : ''}${tab.title} — Mellow`);
    revisionRef.current = tab.revision;
    docMetaRef.current = { encoding: tab.encoding, eol: tab.eol };
    diskStateRef.current = tab.diskState;
    setConflict(null);
    setDirty(tab.dirty);
    host.setDocumentPath(tab.path);
    await host.open(tab.content, undefined, true, tab.eol);
    // Typora 打开/切换文档后可立即继续书写。大文件 reset 会重建 CodeMirror 的
    // contenteditable，因此必须在 open 完成后显式恢复 EditorView focus。
    host.focus();
    // resetEditor 完成后仍可能有一帧的 CodeMirror 布局/虚拟化收尾；在该帧后再
    // 确认一次焦点，避免 10 MB 文档只渲染而无法接收首个真实键盘输入。
    requestAnimationFrame(() => {
      if (hostRef.current === host && docIdRef.current === tab.documentId) host.focus();
    });
    suppressEditorEventRef.current = false;
    // Large File Mode（PRD §109）已在 CoreEditor.open() 收口：resetEditor 前自动
    // 分类降级（>5MB 或 >50,000 行），覆盖全部 open 路径（含 auto reload/快照恢复）。
    refreshOutlineRef.current(0);
    await watchDocument(tab.path);
    refreshStats(host);
    refreshCursorPos(host);
    setStatusText(t('msg.openedDoc', { title: tab.title, suffix: tab.dirty ? t('msg.unsavedSuffix') : '' }));
  }, [refreshCursorPos, refreshStats, setDirty, watchDocument]);

  // ── 图片文件操作（spec image-workflow §6/§7 + PRD §57/§58）──

  const setAssetDir = useCallback((value: AssetDirConfig) => {
    localStorage.setItem(GLOBAL_ASSET_DIR_KEY, value);
    setAssetDirState(value);
    setStatusText(t('msg.assetDirSet', { value }));
  }, []);

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    setToast({ message, onUndo });
  }, []);

  /** 撤销文件操作（PRD §58 toast）；count=1 默认；批量操作一次撤销全部 */
  const undo = useCallback(async (count = 1) => {
    const history = historyRef.current;
    const host = hostRef.current;
    if (!history || !host) return;
    const top = history.peek();
    const r = await history.undo(count);
    if (r.ok) {
      setStatusText(t('msg.undone', { value: r.value }));
      // 撤销文档重命名后：同步编辑器路径 + watcher（rename 反向）
      if (top?.op.kind === 'rename' && top.op.to === filePathRef.current) {
        filePathRef.current = top.op.from;
        host.setDocumentPath(top.op.from);
        host.refreshImages();
        await watchDocument(top.op.from);
      }
    } else {
      setStatusText(r.error.message);
    }
    setToast(null);
  }, [watchDocument]);

  /** 执行批量操作（moveAll/copyAll/downloadRemote/uploadAll），toast 提供撤销 */
  const runBatch = useCallback(async (kind: 'moveAll' | 'copyAll' | 'downloadRemote' | 'uploadAll') => {
    const ops = fileOpsRef.current;
    const history = historyRef.current;
    if (!ops || !history) return;
    const before = history.length;
    const r = await ops[kind]();
    if (!r.ok) {
      setStatusText(r.error.code === 'not-implemented' ? t('msg.imageUploadNoService') : r.error.message);
      return;
    }
    const rep = r.value;
    const n = rep.moved + rep.copied + rep.downloaded + rep.uploaded;
    if (kind === 'uploadAll') {
      // 上传：n=0 且无失败 → 没有可上传图片；失败详情见报告
      if (n === 0 && rep.failed.length === 0 && rep.skipped.length === 0) {
        setStatusText(t('msg.imageUploadNoneLocal'));
        return;
      }
      setStatusText(t('msg.imageUploaded', { n, skipped: rep.skipped.length, failed: rep.failed.length > 0 ? `${rep.failed.length}（${rep.failed[0].error}）` : '0' }));
      if (n > 0) showToast(t('msg.imageUploaded', { n, skipped: rep.skipped.length, failed: rep.failed.length }), undefined);
      return;
    }
    const verb = kind === 'moveAll' ? t('msg.moved') : kind === 'copyAll' ? t('msg.copied') : t('msg.downloaded');
    const undoCount = history.length - before;
    setStatusText(t('msg.imageMovedAll', { verb, n, skipped: rep.skipped.length, failed: rep.failed.length > 0 ? `${rep.failed.length}（${rep.failed[0].error}）` : '0' }));
    if (n > 0) {
      showToast(`${verb} ${n}`, undoCount > 0 ? () => void undo(undoCount) : undefined);
    }
  }, [undo, showToast]);

  /** widget 悬停操作条分发（spec §6 单图操作入口） */
  const handleImageAction = useCallback(async (req: ImageWidgetActionRequest) => {
    const ops = fileOpsRef.current;
    const opener = openerRef.current;
    const dialog = dialogRef.current;
    if (!ops || !opener || !dialog) return;
    const { src, action } = req;

    if (action === 'copyPath') {
      try {
        await navigator.clipboard.writeText(src);
        setStatusText(t('msg.imagePathCopied'));
      } catch {
        setStatusText(t('msg.imagePathCopyFailed'));
      }
      return;
    }
    if (action === 'open') {
      const abs = ops.resolveSrcPath(src);
      const r = abs !== null
        ? await opener.openPath(abs)
        : await opener.openUrl(src);
      setStatusText(r.ok ? t('msg.opened') : t('msg.openFailed', { error: r.error.message }));
      return;
    }
    if (action === 'reveal') {
      const abs = ops.resolveSrcPath(src);
      if (abs === null) {
        setStatusText(t('msg.imagePathUnresolved'));
        return;
      }
      const r = await opener.revealInFolder(abs);
      setStatusText(r.ok ? t('msg.revealed') : t('msg.revealFailed', { error: r.error.message }));
      return;
    }
    if (action === 'rename') {
      const abs = ops.resolveSrcPath(src);
      const current = abs === null ? '' : abs.split('/').pop() ?? '';
      const name = window.prompt(t('prompt.newFile'), current);
      if (name === null || name.trim() === '') return;
      const r = await ops.renameImage(src, name);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      setStatusText(t('msg.renamedSkipped', { n: r.value.skipped.length }));
      return;
    }
    if (action === 'move' || action === 'copy') {
      const dir = await dialog.showDirectory();
      if (!dir.ok || dir.value === null) return;
      const r = action === 'move'
        ? await ops.moveImage(src, dir.value)
        : await ops.copyImage(src, dir.value);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      const rep = r.value;
      setStatusText(`${action === 'move' ? t('msg.moved') : t('msg.copied')}${t('msg.batchSuffix', { n: rep.skipped.length })}`);
      return;
    }
    if (action === 'downloadRemote') {
      const r = await ops.downloadRemoteImage(src);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      setStatusText(r.value.downloaded > 0 ? t('msg.downloadedAll') : t('msg.skippedReason', { reason: r.value.skipped[0]?.reason ?? '' }));
      return;
    }
    // C1 右键菜单新增（V4 §10 image 行：Resize / Markdown↔HTML / Upload / Delete）
    if (action === 'setSize') {
      const current = window.prompt(t('prompt.imageSize'), '300x200');
      if (current === null) return;
      void engineContextRef.current('imageSpanOp', 'setSize', current.trim());
      return;
    }
    if (action === 'mdToHtml' || action === 'htmlToMd') {
      void engineContextRef.current('imageSpanOp', action);
      return;
    }
    if (action === 'upload') {
      const r = await ops.uploadOne(src);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      setStatusText(r.value.uploaded > 0 ? t('msg.imageUploaded', { n: r.value.uploaded, skipped: r.value.skipped.length, failed: r.value.failed.length > 0 ? `${r.value.failed.length}（${r.value.failed[0].error}）` : '0' }) : t('msg.skippedReason', { reason: r.value.skipped[0]?.reason ?? r.value.failed[0]?.error ?? '' }));
      return;
    }
    if (action === 'delete') {
      const abs = ops.resolveSrcPath(src);
      if (!window.confirm(t('dialog.imageDeleteConfirm', { src }))) return;
      // 本地文件 → 回收站（Trash，不直接删）；远程/未解析 → 只移除引用
      if (abs !== null) {
        const svc = fileTreeServiceRef.current;
        if (svc !== null) {
          const r = await svc.trash(abs);
          if (!r.ok) {
            setStatusText(t('msg.deleteFailed', { error: r.error.message }));
            return;
          }
        }
      }
      void engineContextRef.current('imageSpanOp', 'delete');
      setStatusText(t('msg.trashed'));
      return;
    }
  }, []);

  /** 拷贝图片（Typora parity D3）：光标处图片 → 本地文件 → 系统剪贴板位图 */
  const handleCopyImage = useCallback(async () => {
    const ops = fileOpsRef.current;
    if (!ops || !isTauri()) return;
    const src = hostRef.current?.imageSourceAtCursor() ?? null;
    if (src === null) {
      setStatusText(t('msg.copyImageNone'));
      return;
    }
    const abs = ops.resolveSrcPath(src);
    if (abs === null) {
      setStatusText(t('msg.copyImageRemoteUnsupported'));
      return;
    }
    try {
      await invoke('copy_image_to_clipboard', { path: abs });
      setStatusText(t('msg.copyImageDone'));
    } catch (err) {
      setStatusText(t('msg.copyImageFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  }, [t]);

  // ── D4 表格操作 / 链接操作 / 代码块复制（Typora 段落→表格、格式→链接操作、段落→代码工具）──

  /** 引擎表格命令桥（菜单/命令面板 → iframe __MELLOW_CONTEXT_ACTIONS__.tableOp；C1 + 对齐子菜单） */
  const engineTableOp = useCallback((op: 'addRowBelow' | 'deleteRow' | 'addColumnRight' | 'deleteColumn' | 'tidy' | 'addRowAbove' | 'addColumnLeft' | 'moveRowUp' | 'moveRowDown' | 'moveColumnLeft' | 'moveColumnRight' | 'deleteTable' | 'copyTable' | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignDefault') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: { tableOp?: (op: string) => void } }) | null;
    win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp?.(op);
    hostRef.current?.focus();
  }, []);

  /** C1：引擎上下文动作桥（右键菜单 code-tools / copy-as-image / deleteBlock / 图片引用编辑 / 链接编辑） */
  const engineContext = useCallback(<T = void>(method: string, ...args: unknown[]): Promise<T | null> => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: Record<string, ((...a: unknown[]) => unknown) | undefined> }) | null;
    const fn = win?.__MELLOW_CONTEXT_ACTIONS__?.[method];
    const result = typeof fn === 'function' ? fn(...args) : undefined;
    hostRef.current?.focus();
    return Promise.resolve((result ?? null) as T | null);
  }, []);
  const engineContextRef = useRef(engineContext);
  engineContextRef.current = engineContext;

  /** C1：复制渲染结果为 PNG（Typora copyMathBlock→copyAsImage / 图表 copy-as-image） */
  const handleCopyRendered = useCallback((kind: 'math' | 'mermaid') => {
    void engineContextRef.current<boolean>('copyRendered', kind).then((ok) => {
      setStatusText(ok ? t('msg.copied') : t('msg.copyImageFailed', { error: t('msg.renderUnavailable') }));
    });
  }, [t]);

  /** C1：渲染导出为 PNG 文件（Typora download-math / download-diagram） */
  const handleDownloadRendered = useCallback(async (kind: 'math' | 'mermaid') => {
    const dataUrl = await engineContextRef.current<string>('renderPng', kind);
    if (dataUrl === null) {
      setStatusText(t('msg.renderUnavailable'));
      return;
    }
    try {
      const defaultName = kind === 'math' ? 'formula.png' : 'diagram.png';
      const savePath = await invoke<string | null>('pick_save_path', { defaultName, filters: ['png'] });
      if (savePath === null) return; // 用户取消
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      await invoke('write_binary', { path: savePath, data: Array.from(bytes) });
      setToast({ message: t('export.image.done') });
    } catch (err) {
      setToast({ message: `${t('export.image.failed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [t]);

  /** C1：复制光标处数学块的 MathML（Typora copyAsMathML） */
  const handleCopyMathMl = useCallback(() => {
    void engineContextRef.current<boolean>('copyMathMl');
  }, []);

  /** C1：编辑链接 URL（Typora link Edit：以当前 URL 为默认值） */
  const handleEditLinkUrl = useCallback(async () => {
    const current = await engineContextRef.current<string>('getLinkUrl');
    if (current === null) return;
    const next = window.prompt(t('prompt.editLinkUrl'), current);
    if (next === null || next.trim() === '') return;
    void engineContextRef.current('setLinkUrl', next.trim());
  }, [t]);

  /** C1：移除链接（保留文本；Typora link Remove） */
  const handleRemoveLink = useCallback(() => {
    void engineContextRef.current('unlink');
  }, []);

  /** C2：行结束符转换（Typora 编辑→行结束符；整文一次 patchChanges → 一次 Undo） */
  const handleDocEol = useCallback((eol: '\n' | '\r\n') => {
    const host = hostRef.current;
    if (!host) return;
    const text = host.getText();
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const next = eol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized;
    if (next === text) {
      setStatusText(t('msg.eolAlready', { eol: eol === '\r\n' ? 'CRLF' : 'LF' }));
      return;
    }
    if (!host.patchChanges([{ from: 0, to: text.length, text: next }])) return;
    docMetaRef.current = { ...docMetaRef.current, eol };
    setStatusText(t('msg.eolConverted', { eol: eol === '\r\n' ? 'CRLF' : 'LF' }));
  }, [t]);

  /** C2：清理行尾空白（引擎 docTransform：保护代码围栏与行内代码） */
  const handleTrimTrailing = useCallback(() => {
    const ok = engineContextRef.current<boolean>('docTransform', 'trimTrailing');
    void ok.then((done) => {
      setStatusText(done ? t('msg.trimmedTrailing') : t('msg.trimNothing'));
    });
  }, [t]);

  /** P1-1.7：复制光标处的数学 / Mermaid 源码（右键菜单经 dispatchCommand 调用） */
  const engineCopySource = useCallback((kind: 'math' | 'mermaid') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: { copySource?: (kind: 'math' | 'mermaid') => boolean } }) | null;
    const ok = win?.__MELLOW_CONTEXT_ACTIONS__?.copySource?.(kind) ?? false;
    setStatusText(ok
      ? t(kind === 'math' ? 'msg.mathSourceCopied' : 'msg.mermaidSourceCopied')
      : t(kind === 'math' ? 'msg.mathSourceNone' : 'msg.mermaidSourceNone'));
    return ok;
  }, [t]);

  /** P1-1.7：编辑动作（剪切/复制/粘贴）统一经 Registry 命令，右键菜单不再直连引擎 */
  const engineEditAction = useCallback((action: 'cut' | 'copy' | 'paste') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: { cut?: () => void; copy?: () => void; paste?: () => void } }) | null;
    const api = win?.__MELLOW_CONTEXT_ACTIONS__;
    if (action === 'cut') api?.cut?.();
    else if (action === 'copy') api?.copy?.();
    else api?.paste?.();
    hostRef.current?.focus();
  }, []);

  /** 打开光标处链接（Typora 格式→链接操作→打开链接） */
  const handleOpenLinkAtCursor = useCallback(() => {
    const url = hostRef.current?.linkUrlAtCursor() ?? null;
    if (url === null) {
      setStatusText(t('msg.linkNone'));
      return;
    }
    void openerRef.current?.openUrl(url);
  }, [t]);

  /** 复制光标处链接地址（Typora 格式→链接操作→复制链接地址） */
  const handleCopyLinkUrl = useCallback(async () => {
    const url = hostRef.current?.linkUrlAtCursor() ?? null;
    if (url === null) {
      setStatusText(t('msg.linkNone'));
      return;
    }
    await navigator.clipboard.writeText(url);
    setStatusText(t('msg.linkUrlCopied'));
  }, [t]);

  /** 复制光标处代码块内容（Typora 段落→代码工具→复制代码块内容） */
  const handleCopyCodeBlock = useCallback(async () => {
    const source = hostRef.current?.codeBlockSourceAtCursor() ?? null;
    if (source === null) {
      setStatusText(t('msg.codeBlockNone'));
      return;
    }
    await navigator.clipboard.writeText(source);
    setStatusText(t('msg.codeBlockCopied'));
  }, [t]);

  /** 文档重命名（spec §6：${stem}.assets 同步 + 引用 patch 原子化） */
  const handleRenameDocument = useCallback(async () => {
    const svc = renameRef.current;
    if (!svc) return;
    const path = filePathRef.current;
    if (path === null) {
      setStatusText(t('msg.renameNeedsSave'));
      return;
    }
    const current = path.split('/').pop() ?? '';
    const name = window.prompt(t('prompt.newFileShort'), current);
    if (name === null || name.trim() === '') return;
    const r = await svc.renameDocument(name);
    if (!r.ok) {
      setStatusText(r.error.message);
      return;
    }
    filePathRef.current = r.value.newPath;
    setDirty(true);
    const host = hostRef.current;
    if (host) {
      docStateRef.current.updateCurrent({
        ...currentTabPatch(host),
        path: r.value.newPath,
        title: r.value.newPath.split(/[\\/]/).pop() ?? r.value.newPath,
        dirty: true,
      });
      refreshTabsState();
    }
    setStatusText(r.value.assetDirRenamed
      ? t('msg.renamedAssets', { n: r.value.patchedCount })
      : t('msg.renamed'));
    showToast(t('msg.renamedTo', { name: current }), () => void undo());
  }, [currentTabPatch, refreshTabsState, undo, showToast, setDirty]);

  // ── File Tree（PRD §14/§59/§60）──

  const refreshFileTree = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const model = fileTreeModelRef.current;
    if (!svc || !model || fileTreeRoot === null) {
      setFileTreeNodes([]);
      return;
    }
    const r = await svc.readTree(fileTreeRoot, model.expanded, fileTreeOptions, 0, treeExpandAll);
    if (!r.ok) {
      setStatusText(t('msg.treeRefreshFailed', { error: r.error.message }));
      return;
    }
    // V7-W3.5：expandAll 读取后回填 expanded —— 否则节点的 expanded 为 true 但集合里没有，
    // 用户点击折叠时 readTree 仍会重新展开（折叠失效）。
    if (treeExpandAll) model.expandAllPaths(r.value);
    setFileTreeNodes(r.value);
  }, [fileTreeOptions, fileTreeRoot, treeExpandAll]);


  /** V7-W1.5：Articles（文档列表）视图刷新 —— 递归收集 Markdown，标题取首个标题行。
   *  Typora Articles 与 File Tree 是同一数据源的两种呈现，故共用 fileTreeRoot。 */
  const refreshFileList = useCallback(async () => {
    const svc = fileListServiceRef.current;
    if (!svc || fileTreeRoot === null) {
      setFileListItems([]);
      return;
    }
    const r = await svc.readList(
      fileTreeRoot,
      { ...DEFAULT_FILE_LIST_OPTIONS, recursive: fileListRecursive },
      fileTreeOptions,
    );
    if (r.ok) setFileListItems(r.value);
  }, [fileListRecursive, fileTreeOptions, fileTreeRoot]);

  /** V7-W3.2：Articles 分组标题 —— 相对当前根的路径（根本身显示为「.」）。 */
  const fileListFolderLabel = useCallback((path: string): string => {
    const dir = fileTreeDirname(path);
    if (fileTreeRoot === null) return dir;
    if (dir === fileTreeRoot) return '.';
    return fileTreeRelativePath(fileTreeRoot, dir);
  }, [fileTreeRoot]);

  /** V7-W3.2：folder grouping 要求同文件夹的项连续 —— 按文件夹路径排序（组内保持原排序）。 */
  const fileListItemsForRender = useMemo(() => {
    if (!fileListRecursive) return filteredFileListItems;
    return [...filteredFileListItems].sort((a, b) => fileTreeDirname(a.path).localeCompare(fileTreeDirname(b.path)));
  }, [fileListRecursive, filteredFileListItems]);

  /** V7-W1.5：Articles 列表的修改时间列（同日显示时刻，跨日显示日期）。 */
  const formatFileTime = useCallback((ms?: number): string => {
    if (ms === undefined) return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const tag = locale === 'en-US' ? 'en-US' : 'zh-CN';
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(tag, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }, [locale]);

  const setFileTreeOption = useCallback((patch: Partial<FileTreeOptions>) => {
    setFileTreeOptions((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FILE_TREE_OPTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setSidebarMode = useCallback((mode: 'files' | 'fileList' | 'outline' | 'search') => {
    setSidebarModeState(mode);
    localStorage.setItem('mellow.sidebar.mode', mode);
  }, []);

  // ── V7-W3.5（G7-SIDE-04）展开全部 / 折叠全部 ──────────────────────────
  /** 展开全部：惰性读取导致未知层级读不到，必须走 readTree 的 expandAll 递归读取。 */
  const handleExpandAllTrees = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const model = fileTreeModelRef.current;
    if (!svc || !model || fileTreeRoot === null) return;
    setTreeExpandAll(true);
    const r = await svc.readTree(fileTreeRoot, model.expanded, fileTreeOptions, 0, true);
    if (!r.ok) {
      setStatusText(t('msg.treeRefreshFailed', { error: r.error.message }));
      return;
    }
    model.expandAllPaths(r.value);
    setFileTreeNodes(r.value);
  }, [fileTreeOptions, fileTreeRoot]);

  const handleCollapseAllTrees = useCallback(async () => {
    setTreeExpandAll(false);
    fileTreeModelRef.current?.collapseAllPaths();
    await refreshFileTree();
  }, [refreshFileTree]);

  // ── V7-W3.9 Recent Locations：pin（固定）/ trash（移除） ────────────────
  const togglePinnedFolder = useCallback((folder: string) => {
    setPinnedFolders((prev) => {
      const next = togglePinRecentFolder(prev, folder);
      try { localStorage.setItem(PINNED_FOLDERS_KEY, serializeRecentFolders(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
  }, []);

  const forgetRecentFolder = useCallback((folder: string) => {
    setRecentFolders((prev) => {
      const next = removeRecentFolder(prev, folder);
      try { localStorage.setItem(RECENT_FOLDERS_KEY, serializeRecentFolders(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
    setPinnedFolders((prev) => prev.filter((f) => f !== folder));
  }, []);

  /** 侧边栏模式快捷键（⌃⌘1/2/3，Typora 对齐）：切到大纲／文档列表／文件树；侧栏未开则打开。 */
  const showSidebarAs = useCallback((mode: 'files' | 'fileList' | 'outline' | 'search') => {
    setSidebarMode(mode);
    setSidebarVisible((v) => {
      if (v) return v;
      try { localStorage.setItem('mellow.sidebar.visible', '1'); } catch { /* noop */ }
      return true;
    });
  }, [setSidebarMode]);

  const setOutlineAutoNumberOption = useCallback((value: boolean) => {
    setOutlineAutoNumber(value);
    localStorage.setItem(OUTLINE_OPTIONS_KEY, JSON.stringify({ autoNumber: value }));
  }, []);

  const refreshOutline = useCallback((head?: number | null) => {
    const host = hostRef.current;
    if (!host) return;
    const tree = filterOutline(buildOutline(host.getText(), { autoNumber: outlineAutoNumber }), outlineFilter);
    const visible = outlineModelRef.current.visibleItems(tree, outlineFlat);
    const all = outlineModelRef.current.visibleItems(buildOutline(host.getText(), { autoNumber: outlineAutoNumber }), true);
    const current = currentHeadingId(all, head ?? host.getSelectionHead() ?? 0);
    outlineActiveRef.current = current;
    setOutlineItems(visible);
    setCurrentOutlineId(current);
  }, [outlineAutoNumber, outlineFilter, outlineFlat]);

  refreshOutlineRef.current = refreshOutline;

  const handleOutlineJump = useCallback((item: OutlineHeading) => {
    outlineModelRef.current.selectedId = item.id;
    setCurrentOutlineId(item.id);
    if (readerOpen) {
      // Reader：滚动正文到标题锚点（不动侧栏滚动位置）
      const el = document.getElementById(item.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const host = hostRef.current;
    host?.jumpToOffset(item.from);
  }, [readerOpen]);

  const handleOutlineToggle = useCallback((id: string) => {
    outlineModelRef.current.toggle(id);
    refreshOutline(outlineActiveRef.current === id ? undefined : hostRef.current?.getSelectionHead());
  }, [refreshOutline]);

  // ── P3.3 Outline 键盘导航（G4-SIDE-02：↑↓/Enter/Esc/Home/End）──
  // 可见行序列：渲染与键盘导航共用同一计算（编辑器 outlineItems / Reader 大纲两种数据源）
  const visibleOutlineItems = useCallback((): OutlineHeading[] => (
    readerOpen
      ? outlineModelRef.current.visibleItems(filterOutline(readerOutlineItems, outlineFilter), outlineFlat)
      : outlineItems
  ), [outlineFilter, outlineFlat, outlineItems, readerOpen, readerOutlineItems]);

  // 过滤词变化 → 选中项可能已不在可见序列，清空键盘选中
  useEffect(() => {
    setOutlineSelectedId(null);
    outlineModelRef.current.selectedId = null;
  }, [outlineFilter]);

  const handleOutlineKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const model = outlineModelRef.current;
    const items = visibleOutlineItems();
    const map: Record<string, 'up' | 'down' | 'home' | 'end' | 'enter' | undefined> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end', Enter: 'enter' };
    if (event.target instanceof HTMLInputElement) {
      // 焦点在过滤输入框：↑↓ 移动选中、Esc 清空过滤；Home/End/Enter 保留输入框光标/原生行为
      if (event.key === 'Escape') {
        event.preventDefault();
        setOutlineFilter('');
        setOutlineSelectedId(null);
        model.selectedId = null;
        return;
      }
      const key = map[event.key];
      if (key === 'up' || key === 'down') {
        event.preventDefault();
        setOutlineSelectedId(model.navigate(items, key).selectedId);
      }
      return;
    }
    const key = map[event.key];
    if (key === undefined) return;
    event.preventDefault();
    const r = model.navigate(items, key);
    setOutlineSelectedId(r.selectedId);
    if (r.jump) handleOutlineJump(r.jump);
  }, [handleOutlineJump, visibleOutlineItems]);

  const rememberRecentFolder = useCallback((folder: string) => {
    // V7-W3.9：最近文件夹 UI 经侧栏底部菜单恢复（D-C = ①），此处同步 state + 持久化
    setRecentFolders((prev) => {
      const next = pushRecentFolder(prev, folder);
      try { localStorage.setItem(RECENT_FOLDERS_KEY, serializeRecentFolders(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
  }, []);

  /** 载入文件夹根（Open Folder… 与 Recent Locations 共用，避免两份装配漂移） */
  const loadFolderRoot = useCallback((folder: string) => {
    localStorage.setItem(FILE_TREE_ROOT_KEY, folder);
    setFileTreeRoot(folder);
    rememberRecentFolder(folder);
    fileTreeModelRef.current = new FileTreeModel(folder, fileTreeOptions);
    setSelectedTreePath(null);
  }, [fileTreeOptions, rememberRecentFolder]);

  const chooseFileTreeRoot = useCallback(async () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const r = await dialog.showDirectory();
    if (!r.ok || r.value === null) return;
    loadFolderRoot(r.value);
    setStatusText(t('msg.folderOpened', { value: r.value }));
  }, [loadFolderRoot, t]);

  /**
   * V7-W3.3（D-C = ①）+ W3.4 + W3.9：侧栏底部「当前文件夹」弹出菜单。
   * Typora 官方 File Management：「At the bottom of the left side bar, users can pop up
   * menu items for the current folder」—— 含 Refresh / Open Folder… / 展开折叠 / 排序
   * （Group by Folder + 4 种排序 × 升降序）/ Recent Locations（hover 显示 pin + trash）。
   */
  const openFolderMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const sortLabel = (by: FileTreeOptions['sortBy']): string =>
      by === 'natural' ? t('sidebar.sortNatural')
        : by === 'name' ? t('sidebar.sortName')
          : by === 'modified' ? t('sidebar.sortModified')
            : t('sidebar.sortCreated');
    const sortItems: ContextMenuItem[] = [
      { label: t('sidebar.foldersFirst'), checked: fileTreeOptions.folderFirst, onClick: () => setFileTreeOption({ folderFirst: !fileTreeOptions.folderFirst }) },
      { label: sortLabel('natural'), checked: fileTreeOptions.sortBy === 'natural', onClick: () => setFileTreeOption({ sortBy: 'natural' }) },
      { label: sortLabel('name'), checked: fileTreeOptions.sortBy === 'name', onClick: () => setFileTreeOption({ sortBy: 'name' }) },
      { label: sortLabel('modified'), checked: fileTreeOptions.sortBy === 'modified', onClick: () => setFileTreeOption({ sortBy: 'modified' }) },
      { label: sortLabel('created'), checked: fileTreeOptions.sortBy === 'created', onClick: () => setFileTreeOption({ sortBy: 'created' }) },
      { label: t('sidebar.sortAsc'), checked: fileTreeOptions.sortAsc, onClick: () => setFileTreeOption({ sortAsc: true }) },
      { label: t('sidebar.sortDesc'), checked: !fileTreeOptions.sortAsc, onClick: () => setFileTreeOption({ sortAsc: false }) },
    ];
    const orderedRecent = sortRecentFolders(recentFolders, pinnedFolders);
    const recentItems: ContextMenuItem[] = orderedRecent.length === 0
      ? [{ label: t('sidebar.noRecentFolders'), enabled: false }]
      : orderedRecent.map((folder) => {
        const pinned = pinnedFolders.includes(folder);
        return {
          label: fileTreeBasename(folder) || folder,
          onClick: () => loadFolderRoot(folder),
          actions: [
            { key: 'pin', label: pinned ? '★' : '☆', title: pinned ? t('sidebar.unpin') : t('sidebar.pin'), active: pinned, onClick: () => togglePinnedFolder(folder) },
            { key: 'trash', label: '✕', title: t('sidebar.removeRecent'), onClick: () => forgetRecentFolder(folder) },
          ],
        };
      });
    const items: ContextMenuEntry[] = [
      { label: t('sidebar.refresh'), onClick: () => { void refreshFilesSidebarRef.current(); } },
      { label: t('sidebar.openFolderTitle'), onClick: () => { void chooseFileTreeRoot(); } },
      { separator: true },
      { label: t('files.expandAll'), enabled: fileTreeRoot !== null && !treeExpandAll, onClick: () => { void handleExpandAllTrees(); } },
      { label: t('files.collapseAll'), enabled: fileTreeRoot !== null, onClick: () => { void handleCollapseAllTrees(); } },
    ];
    // V7-W3.2：Articles（文档列表）专属的 current / recursive 开关只在列表视图下出现
    if (sidebarMode === 'fileList') {
      items.push({ label: t('sidebar.recursive'), checked: fileListRecursive, onClick: () => setFileListRecursive((v) => !v) });
    }
    items.push(
      { label: t('sidebar.sort'), children: sortItems },
      { label: t('sidebar.recentFolders'), children: recentItems },
    );
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  }, [chooseFileTreeRoot, fileListRecursive, fileTreeOptions, fileTreeRoot, forgetRecentFolder, handleCollapseAllTrees, handleExpandAllTrees, loadFolderRoot, pinnedFolders, recentFolders, setFileTreeOption, sidebarMode, t, togglePinnedFolder, treeExpandAll]);

  /**
   * V7-W3.2「missing 态」：当前文档不在已加载文件夹内。
   * Typora 此时侧栏无任何 current 高亮，用户会以为列表没刷新 —— Mellow 在底部给出显式提示
   * 与「载入所在文件夹」入口（B 级增强，登记于 §7.3）。
   * 注：filePath 只有 ref（`filePathRef`），故借 `docTitle` 触发重渲染后再读取。
   */
  const currentDocOutsideFolder = (() => {
    const p = docTitle === null ? null : filePathRef.current;
    if (p === null || fileTreeRoot === null) return false;
    return !(p === fileTreeRoot || p.startsWith(`${fileTreeRoot}/`));
  })();

  const treeFlatten = useCallback(() => {
    const model = fileTreeModelRef.current;
    // P3.6：键盘导航/选中目录解析均基于过滤后序列（与渲染同源）
    return model?.flatten(filteredFileTreeNodes) ?? [];
  }, [filteredFileTreeNodes]);

  const selectedTreeDir = useCallback(() => {
    const selected = selectedTreePath;
    if (selected === null) return fileTreeRoot;
    const flat = treeFlatten();
    const node = flat.find((n) => n.path === selected);
    return node?.kind === 'folder' ? selected : fileTreeDirname(selected);
  }, [fileTreeRoot, selectedTreePath, treeFlatten]);

  const refreshFilesSidebar = useCallback(async () => {
    // V7-W1.5：File Tree 与 Articles 同源刷新（任一视图切换即得最新数据）
    await Promise.all([refreshFileTree(), refreshFileList()]);
  }, [refreshFileList, refreshFileTree]);

  // P3.7 修复（历史）：refreshFilesSidebar 曾引用 refreshFileList → selectedTreeDir →
  // treeFlatten → filteredFileTreeNodes → fileTreeNodes 长链，effect deps 直接引用会陷入
  // 「刷新 → 重建 → effect 重跑」死循环。经 ref 间接调用，effect 只依赖真正的配置值。
  const refreshFilesSidebarRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { refreshFilesSidebarRef.current = refreshFilesSidebar; }, [refreshFilesSidebar]);

  const openTreeFile = useCallback(async (path: string): Promise<boolean> => {
    const documents = documentsRef.current;
    if (!documents) return false;
    // B1（SDI）：文件树/QuickOpen 打开 = 当前窗口替换（Typora 文件树单击换文档）
    if (!guardSingleDocument()) return false;
    const r = await documents.readPath(path);
    if (!r.ok) {
      setStatusText(t('msg.openFailed', { error: r.error.message }));
      return false;
    }
    const tab = docStateRef.current.open({
      path: r.value.path,
      content: r.value.content,
      dirty: false,
      documentId: crypto.randomUUID(),
      revision: 0,
      encoding: r.value.encoding,
      eol: r.value.eol,
      diskState: r.value.diskMtimeMs !== undefined && r.value.identityKey !== undefined ? { mtimeMs: r.value.diskMtimeMs, identityKey: r.value.identityKey } : null,
    });
    refreshTabsState();
    rememberQuickOpenRecent(path);
    await applyTab(tab);
    return true;
  }, [applyTab, guardSingleDocument, refreshTabsState, rememberQuickOpenRecent]);

  /** V7-W1.1：重新打开最近关闭的文件（Typora File → Reopen Closed File，⇧⌘T）。
   *  Typora 多标签语义为「恢复标签页」；Mellow 为 SDI 单文档窗口，等价映射为
   *  在当前窗口打开（未保存修改仍经 guardSingleDocument 确认）。
   *  文件已失效（删除/移动）时不弹错——openTreeFile 已给状态栏提示，并保留栈项待重试。 */
  const handleReopenClosed = useCallback(async () => {
    const target = readClosedFiles().find((p) => p !== filePathRef.current);
    if (target === undefined) return;
    if (!(await openTreeFile(target))) return;
    const rest = readClosedFiles().filter((p) => p !== target);
    try { localStorage.setItem(CLOSED_FILES_KEY, JSON.stringify(rest)); } catch { /* noop */ }
    setClosedFiles(rest);
  }, [openTreeFile]);

  const updateQuickOpenResults = useCallback((entries: QuickOpenEntry[], query: string) => {
    const unique = [...new Map(entries.map((entry) => [entry.path, entry])).values()];
    const ranked = rankQuickOpen(unique, query, readQuickOpenRecent()).slice(0, 80);
    const selected = Math.min(quickOpenModelRef.current.selectedIndex, Math.max(0, ranked.length - 1));
    quickOpenModelRef.current.selectedIndex = selected;
    setQuickOpenResults(ranked);
    setQuickOpenSelected(selected);
  }, [readQuickOpenRecent]);

  const openQuickOpen = useCallback(async () => {
    if (fileTreeRoot === null) {
      setStatusText(t('msg.quickOpenNeedsFolder'));
      return;
    }
    quickOpenAbortRef.current?.abort();
    const controller = new AbortController();
    quickOpenAbortRef.current = controller;
    quickOpenModelRef.current.selectedIndex = 0;
    setQuickOpenVisible(true);
    quickOpenQueryRef.current = '';
    setQuickOpenQuery('');
    const recentEntries = readQuickOpenRecent()
      .filter((path) => path.startsWith(`${fileTreeRoot}/`))
      .map((path) => ({ path, filename: path.split(/[\\/]/).pop() ?? path, relativePath: fileTreeRelativePath(fileTreeRoot, path) }));
    setQuickOpenAll(recentEntries);
    setQuickOpenResults(recentEntries);
    setQuickOpenSelected(0);
    setQuickOpenScanning(true);
    const collected: QuickOpenEntry[] = [...recentEntries];
    const fsService = fileServiceRef.current;
    if (!fsService) return;
    const r = await scanQuickOpen(fileTreeRoot, fsService, {
      batchSize: 30,
      signal: controller.signal,
      onBatch: (items) => {
        collected.push(...items);
        setQuickOpenAll([...collected]);
        updateQuickOpenResults(collected, quickOpenQueryRef.current);
      },
    });
    if (!r.ok && !controller.signal.aborted) setStatusText(t('msg.quickOpenScanFailed', { error: r.error.message }));
    if (!controller.signal.aborted) {
      setQuickOpenAll(r.ok ? r.value : collected);
      updateQuickOpenResults(r.ok ? r.value : collected, quickOpenQueryRef.current);
      setQuickOpenScanning(false);
    }
  }, [fileTreeRoot, readQuickOpenRecent, updateQuickOpenResults]);

  const closeQuickOpen = useCallback(() => {
    quickOpenAbortRef.current?.abort();
    setQuickOpenVisible(false);
    setQuickOpenScanning(false);
  }, []);

  const confirmQuickOpen = useCallback(async (path?: string) => {
    const itemPath = path ?? quickOpenResults[quickOpenSelected]?.path;
    if (!itemPath) return;
    rememberQuickOpenRecent(itemPath);
    closeQuickOpen();
    await openTreeFile(itemPath);
  }, [closeQuickOpen, openTreeFile, quickOpenResults, quickOpenSelected, rememberQuickOpenRecent]);

  const handleQuickOpenKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickOpen();
      return;
    }
    const key = event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowUp' ? 'up' : event.key === 'Enter' ? 'enter' : null;
    if (key === null) return;
    event.preventDefault();
    const r = quickOpenModelRef.current.navigate(quickOpenResults, key);
    setQuickOpenSelected(r.selectedIndex);
    if (r.open) void confirmQuickOpen(r.open);
  }, [closeQuickOpen, confirmQuickOpen, quickOpenResults]);

  const handleQuickOpenQuery = useCallback((value: string) => {
    quickOpenModelRef.current.selectedIndex = 0;
    quickOpenQueryRef.current = value;
    setQuickOpenQuery(value);
    updateQuickOpenResults(quickOpenAll, value);
  }, [quickOpenAll, updateQuickOpenResults]);

  const openGlobalSearch = useCallback(() => {
    setSidebarMode('search');
  }, [setSidebarMode]);

  // §7.3：invalid regex 就地提示。`buildSearchRegex` 对非法正则返回 null，与「空查询」
  // 和「零匹配」不可区分 —— 不提示的话用户会以为是文档里没有匹配，实际是语法写错。
  const searchRegexInvalid = useMemo(
    () => searchRegex && searchQuery !== '' && !isSearchRegexValid({
      query: searchQuery,
      caseSensitive: searchCase,
      wholeWord: searchWholeWord,
      regex: true,
    }),
    [searchCase, searchQuery, searchRegex, searchWholeWord],
  );

  const runGlobalSearch = useCallback(async () => {
    const svc = searchRef.current;
    if (!svc || fileTreeRoot === null) {
      setStatusText(t('msg.searchNeedsFolder'));
      return;
    }
    searchCancelRef.current?.();
    setSearchResults([]);
    setSearchGroups([]);
    setSearchRunning(true);
    const include = searchInclude.split(',').map((s) => s.trim()).filter(Boolean);
    const exclude = searchExclude.split(',').map((s) => s.trim()).filter(Boolean);
    const request = normalizeSearchRequest({ root: fileTreeRoot, query: searchQuery, caseSensitive: searchCase, wholeWord: searchWholeWord, regex: searchRegex, include, exclude, context: searchContext });
    const collected: SearchResult[] = [];
    const started = await svc.searchFilesStreaming?.(request, (result) => {
      collected.push(result);
      setSearchResults([...collected]);
      setSearchGroups(groupSearchResults(collected, fileTreeRoot));
    });
    if (!started) {
      const r = await svc.searchFiles(searchQuery, fileTreeRoot);
      if (r.ok) {
        setSearchResults(r.value);
        setSearchGroups(groupSearchResults(r.value, fileTreeRoot));
      } else setStatusText(t('msg.searchFailed', { error: r.error.message }));
      setSearchRunning(false);
      return;
    }
    if (!started.ok) {
      setStatusText(t('msg.searchFailed', { error: started.error.message }));
      setSearchRunning(false);
      return;
    }
    searchCancelRef.current = started.value.cancel;
    setStatusText(t('msg.searchStarted'));
    void started.value.done?.then(() => setSearchRunning(false));
  }, [fileTreeRoot, searchCase, searchContext, searchExclude, searchInclude, searchQuery, searchRegex, searchWholeWord]);

  const jumpToSearchResult = useCallback(async (result: SearchResult) => {
    await openTreeFile(result.path);
    requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host) return;
      const text = host.getText();
      let offset = 0;
      const lines = text.split('\n');
      for (let i = 0; i < Math.max(0, result.line - 1); i += 1) offset += lines[i].length + 1;
      offset += Math.max(0, (result.column ?? 1) - 1);
      host.jumpToOffset(offset);
    });
  }, [openTreeFile]);

  // ── P3.3 Search 键盘导航（G4-SIDE-02：↑↓/Enter/Esc/Home/End）──
  // 扁平匹配序列（行序 = 组序 + 组内序），键盘导航与 SearchResultsList 高亮共用
  const flatSearchMatches = useMemo(() => searchGroups.flatMap((group) => group.matches), [searchGroups]);

  // 查询词变化 → 旧选中失效
  useEffect(() => {
    searchResultsModelRef.current.reset();
    setSearchSelectedIndex(-1);
  }, [searchQuery]);

  const handleSearchKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const model = searchResultsModelRef.current;
    const map: Record<string, 'up' | 'down' | 'home' | 'end' | 'enter' | undefined> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end', Enter: 'enter' };
    if (event.target instanceof HTMLInputElement) {
      // 焦点在搜索输入框：↑↓ 移动选中、Esc 清空搜索；Home/End 保留光标移动、Enter 保留原生（运行搜索）
      if (event.key === 'Escape') {
        event.preventDefault();
        searchCancelRef.current?.();
        setSearchQuery('');
        setSearchResults([]);
        setSearchGroups([]);
        setSearchSelectedIndex(-1);
        model.reset();
        return;
      }
      const key = map[event.key];
      if (key === 'up' || key === 'down') {
        event.preventDefault();
        setSearchSelectedIndex(model.navigate(flatSearchMatches, key).selectedIndex);
      }
      return;
    }
    const key = map[event.key];
    if (key === undefined) return;
    event.preventDefault();
    const r = model.navigate(flatSearchMatches, key);
    setSearchSelectedIndex(r.selectedIndex);
    if (r.jump) void jumpToSearchResult(r.jump);
  }, [flatSearchMatches, jumpToSearchResult]);

  const handleTreeToggle = useCallback(async (path: string) => {
    const model = fileTreeModelRef.current;
    if (!model) return;
    model.toggle(path);
    model.select(path);
    setSelectedTreePath(path);
    await refreshFilesSidebar();
  }, [refreshFileTree]);

  const handleTreeSelect = useCallback((path: string) => {
    fileTreeModelRef.current?.select(path);
    setSelectedTreePath(path);
  }, []);

  const handleTreeNewFile = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dir = selectedTreeDir();
    if (!svc || dir === null) return;
    const name = window.prompt(t('prompt.newFileShort'), t('prompt.untitledMd'));
    if (!name) return;
    const r = await svc.newFile(dir, name);
    setStatusText(r.ok ? t('msg.newFile', { value: r.value }) : t('msg.newFileFailed', { error: r.error.message }));
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreeDir]);

  const handleTreeNewFolder = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dir = selectedTreeDir();
    if (!svc || dir === null) return;
    const name = window.prompt(t('prompt.newFolder'), t('prompt.newFolderDefault'));
    if (!name) return;
    const r = await svc.newFolder(dir, name);
    setStatusText(r.ok ? t('msg.newFolder', { value: r.value }) : t('msg.newFileFailed', { error: r.error.message }));
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreeDir]);

  const handleTreeRename = useCallback(async (name?: string, pathOverride?: string) => {
    const svc = fileTreeServiceRef.current;
    // P3.4：File List 键盘 F2 复用同一重命名流（pathOverride = 列表选中项）
    const target = pathOverride ?? selectedTreePath;
    if (!svc || target === null) return;
    const next = name ?? window.prompt(t('prompt.rename'), target.split(/[\\/]/).pop() ?? target);
    if (!next) return;
    const r = await svc.rename(target, next);
    setStatusText(r.ok ? t('msg.renamed', { value: r.value }) : t('msg.renameFailed', { error: r.error.message }));
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeDuplicate = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    const r = await svc.duplicate(selectedTreePath);
    setStatusText(r.ok ? t('msg.duplicated', { value: r.value }) : t('msg.duplicateFailed', { error: r.error.message }));
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeMove = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dialog = dialogRef.current;
    if (!svc || !dialog || selectedTreePath === null) return;
    const target = await dialog.showDirectory();
    if (!target.ok || target.value === null) return;
    const r = await svc.move(selectedTreePath, target.value);
    setStatusText(r.ok ? t('msg.movedTo', { value: r.value }) : t('msg.moveFailed', { error: r.error.message }));
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeDrop = useCallback(async (targetDir: string, draggedPath: string | null) => {
    const svc = fileTreeServiceRef.current;
    const path = draggedPath;
    if (!svc || path === null || path === targetDir) return;
    const r = await svc.move(path, targetDir);
    setStatusText(r.ok ? t('msg.movedTo', { value: r.value }) : t('msg.moveFailed', { error: r.error.message }));
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree]);

  const handleTreeTrash = useCallback(async (pathOverride?: string) => {
    const svc = fileTreeServiceRef.current;
    // P3.4：File List 键盘 Delete 复用同一 Trash 流（pathOverride = 列表选中项）
    const target = pathOverride ?? selectedTreePath;
    if (!svc || target === null) return;
    if (!window.confirm(t('dialog.trashConfirm', { path: target }))) return;
    const r = await svc.trash(target);
    setStatusText(r.ok ? t('msg.trashed') : t('msg.deleteFailed', { error: r.error.message }));
    if (r.ok) setSelectedTreePath(null);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeUndo = useCallback(async () => {
    const history = fileTreeServiceRef.current?.undoHistory;
    if (!history) return;
    const r = await history.undo();
    setStatusText(r.ok ? r.value : t('msg.undoFailed', { error: r.error.message }));
    await refreshFilesSidebar();
  }, [refreshFileTree]);

  const handleTreeCopyPath = useCallback(async (relative: boolean, pathOverride?: string) => {
    // P3.5：File List / Search 右键复制路径复用同一流（pathOverride = 目标项路径）
    const target = pathOverride ?? selectedTreePath;
    if (target === null) return;
    const text = relative && fileTreeRoot !== null ? fileTreeRelativePath(fileTreeRoot, target) : target;
    await navigator.clipboard.writeText(text);
    setStatusText(relative ? t('msg.copiedRelativePath', { text }) : t('msg.copiedPath', { text }));
  }, [fileTreeRoot, selectedTreePath]);

  /** Explorer integration：在系统文件管理器中定位（PRD §54 Reveal / spec §14 Windows） */
  const handleTreeReveal = useCallback(async (path: string) => {
    const opener = openerRef.current;
    if (!opener) return;
    const r = await opener.revealInFolder(path);
    setStatusText(r.ok ? t('msg.revealedInFolder') : t('msg.revealFailed', { error: r.error.message }));
  }, []);

  /** 文件树右键菜单（desktop-ui-design-spec §6：context menu） */
  const openTreeContextMenu = useCallback((event: React.MouseEvent, path?: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (path !== undefined) {
      fileTreeModelRef.current?.select(path);
      setSelectedTreePath(path);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: t('contextmenu.newFile'), enabled: fileTreeRoot !== null, onClick: () => void handleTreeNewFile() },
        { label: t('contextmenu.newFolder'), enabled: fileTreeRoot !== null, onClick: () => void handleTreeNewFolder() },
        { label: t('contextmenu.rename'), enabled: path !== undefined, onClick: () => void handleTreeRename() },
        { label: t('contextmenu.duplicate'), enabled: path !== undefined, onClick: () => void handleTreeDuplicate() },
        { label: t('contextmenu.move'), enabled: path !== undefined, onClick: () => void handleTreeMove() },
        { label: t('contextmenu.trash'), enabled: path !== undefined, onClick: () => void handleTreeTrash() },
        { label: t('contextmenu.reveal'), enabled: path !== undefined, onClick: () => void handleTreeReveal(path as string) },
        { label: t('contextmenu.copyPath'), enabled: path !== undefined, onClick: () => void handleTreeCopyPath(false) },
        { label: t('contextmenu.copyRelativePath'), enabled: path !== undefined && fileTreeRoot !== null, onClick: () => void handleTreeCopyPath(true) },
        { label: t('contextmenu.undo'), enabled: fileTreeRoot !== null, onClick: () => void handleTreeUndo() },
      ],
    });
  }, [fileTreeRoot, handleTreeCopyPath, handleTreeDuplicate, handleTreeMove, handleTreeNewFile, handleTreeNewFolder, handleTreeRename, handleTreeReveal, handleTreeTrash, handleTreeUndo]);

  /** P3.5 Outline 右键菜单：跳转/平铺-树形切换/全部折叠/全部展开（8.5 合同 Context 项） */
  const openOutlineContextMenu = useCallback((event: React.MouseEvent, item: OutlineHeading) => {
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: t('outline.jumpToHeading'), enabled: true, onClick: () => handleOutlineJump(item) },
      { label: outlineFlat ? t('outline.switchTree') : t('outline.switchFlat'), enabled: true, onClick: () => setOutlineFlat(!outlineFlat) },
      { label: t('outline.collapseAll'), enabled: !outlineFlat, onClick: () => { outlineModelRef.current.collapseAll(visibleOutlineItems()); refreshOutline(hostRef.current?.getSelectionHead()); } },
      { label: t('outline.expandAll'), enabled: !outlineFlat, onClick: () => { outlineModelRef.current.collapsed.clear(); refreshOutline(hostRef.current?.getSelectionHead()); } },
      // V7-W3.7：Typora Outline 右键「Highlight Current Header」—— 当前章节滚出视野时快速定位。
      // 走 setOutlineSelectedId 复用键盘选中态（OutlineList 的 scrollIntoView 效果随之触发）。
      { label: t('outline.highlightCurrent'), enabled: currentOutlineId !== null, onClick: () => {
        setOutlineSelectedId(currentOutlineId);
        setOutlineHighlightNonce((n) => n + 1);
      } },
    ];
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  }, [currentOutlineId, handleOutlineJump, outlineFlat, refreshOutline, visibleOutlineItems]);

  /** P3.5 Search 右键菜单：跳转/复制路径/复制相对路径 */
  const openSearchContextMenu = useCallback((event: React.MouseEvent, match: SearchResult) => {
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuItem[] = [
      { label: t('search.jumpToMatch'), enabled: true, onClick: () => void jumpToSearchResult(match) },
      { label: t('contextmenu.copyPath'), enabled: true, onClick: () => void handleTreeCopyPath(false, match.path) },
      { label: t('contextmenu.copyRelativePath'), enabled: fileTreeRoot !== null, onClick: () => void handleTreeCopyPath(true, match.path) },
    ];
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  }, [fileTreeRoot, handleTreeCopyPath, jumpToSearchResult]);

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent) => {
    // V6-P2 2.1：⌘F 在侧栏临时唤出过滤框（无需 workspace 也可用，先于 model 守卫）
    if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setTreeFilterOpen(true);
      return;
    }
    const model = fileTreeModelRef.current;
    if (!model) return;
    const map: Record<string, 'up' | 'down' | 'left' | 'right' | 'enter' | undefined> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter' };
    const key = map[event.key];
    if (key !== undefined) {
      event.preventDefault();
      const r = model.navigate(treeFlatten(), key);
      setSelectedTreePath(r.selected);
      void refreshFileTree().then(() => { if (r.open) void openTreeFile(r.open); });
      return;
    }
    if (event.key === 'F2' && selectedTreePath !== null) {
      event.preventDefault();
      void (async () => {
        const name = window.prompt(t('prompt.rename'), selectedTreePath.split(/[\\/]/).pop() ?? selectedTreePath);
        if (name) await handleTreeRename(name);
      })();
    }
    if (event.key === 'Delete' && selectedTreePath !== null) {
      event.preventDefault();
      void handleTreeTrash();
    }
  }, [handleTreeRename, handleTreeTrash, openTreeFile, refreshFileTree, selectedTreePath, treeFlatten]);

  /** V7-W1.5：Articles（文档列表）键盘导航 —— 单列列表，↑↓/←→ 同义，Enter 打开。
   *  ⌘F 与 File Tree 一致临时唤出过滤框。 */
  const handleFileListKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setTreeFilterOpen(true);
      return;
    }
    // V7-W3.2：补齐 PageUp / PageDown（模型早已支持，此前未接线 —— 契约 §7.3「键盘 ↑↓ Enter PageUp/PageDown」）
    const map: Record<string, 'up' | 'down' | 'enter' | 'pageup' | 'pagedown' | undefined> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'up', ArrowRight: 'down', Enter: 'enter', PageUp: 'pageup', PageDown: 'pagedown',
    };
    const key = map[event.key];
    if (key === undefined) return;
    event.preventDefault();
    const r = fileListModelRef.current.navigate(fileListItemsForRender, key);
    setFileListSelectedPath(r.selected);
    if (r.open) void openTreeFile(r.open);
  }, [fileListItemsForRender, openTreeFile]);

  useEffect(() => {
    if (fileTreeRoot !== null) {
      fileTreeModelRef.current = new FileTreeModel(fileTreeRoot, fileTreeOptions);
      void refreshFilesSidebarRef.current();
    }
  }, [fileTreeOptions, fileTreeRoot]);

  useEffect(() => {
    refreshOutlineRef.current();
  }, [outlineAutoNumber, outlineFilter, outlineFlat]);

  // ── 外部文件变化检测（spec §5）──

  /** 外部变化（clean）→ 自动重载，保持 caret/scroll（documentChanged=false） */
  const handleCleanChange = useCallback(async (event: FileChangeEvent) => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents || !event.path) return;
    const r = await documents.readPath(event.path);
    if (!r.ok) {
      setStatusText(t('msg.autoReloadFailed', { error: r.error.message }));
      return;
    }
    docMetaRef.current = { encoding: r.value.encoding, eol: r.value.eol };
    diskStateRef.current = r.value.diskMtimeMs !== undefined && r.value.identityKey !== undefined
      ? { mtimeMs: r.value.diskMtimeMs, identityKey: r.value.identityKey }
      : null;
    // documentChanged=false → CoreEditor resetEditor 保持 scroll + selection
    await host.open(r.value.content, undefined, false, r.value.eol);
    refreshOutline(host.getSelectionHead());
    setDirty(false);
    docStateRef.current.updateCurrent({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
    refreshTabsState();
    setStatusText(t('msg.autoReloaded'));
    refreshStats(host);
  }, [currentTabPatch, refreshStats, refreshTabsState, setDirty]);

  /** 冲突：比较（读磁盘版本，显示差异摘要，不修改本地） */
  const handleConflictCompare = useCallback(async () => {
    if (!conflict) return;
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const r = await documents.readPath(conflict.path);
    const local = host.getText();
    if (!r.ok) {
      setStatusText(t('msg.readDiskFailed', { error: r.error.message }));
      return;
    }
    const diskLines = r.value.content.split('\n').length;
    const localLines = local.split('\n').length;
    setStatusText(t('msg.compareSummary', { disk: diskLines, local: localLines }));
  }, [conflict]);

  /** 冲突：重新加载磁盘版本（放弃本地修改） */
  const handleConflictReloadDisk = useCallback(async () => {
    if (!conflict) return;
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const r = await documents.readPath(conflict.path);
    if (!r.ok) {
      setStatusText(t('msg.reloadFailed', { error: r.error.message }));
      return;
    }
    docMetaRef.current = { encoding: r.value.encoding, eol: r.value.eol };
    diskStateRef.current = r.value.diskMtimeMs !== undefined && r.value.identityKey !== undefined
      ? { mtimeMs: r.value.diskMtimeMs, identityKey: r.value.identityKey }
      : null;
    await host.open(r.value.content, undefined, true, r.value.eol); // 放弃本地
    setDirty(false);
    docStateRef.current.updateCurrent({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
    refreshTabsState();
    setConflict(null);
    setStatusText(t('msg.reloadedDisk'));
    refreshStats(host);
  }, [conflict, currentTabPatch, refreshStats, refreshTabsState, setDirty]);

  /** 冲突：保留 Mellow 版本（后续保存允许覆盖磁盘） */
  const handleConflictKeepLocal = useCallback(() => {
    diskStateRef.current = null; // 保存跳过 validate（用户已知情）
    setConflict(null);
    setStatusText(t('msg.keptLocal'));
  }, []);

  /** 组装当前文档恢复快照并防抖写入（与 Auto Save 分离：只写 AppData） */
  const scheduleRecoverySnapshot = useCallback((host: EditorCore) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    const meta = docMetaRef.current;
    recovery.scheduleSnapshot({
      documentId: docIdRef.current,
      path: filePathRef.current,
      content: host.getText(),
      revision: revisionRef.current,
      encoding: meta.encoding,
      eol: meta.eol,
      cursor: null,
      scroll: null,
      savedAt: Date.now(),
    });
  }, []);

  // 挂载编辑器 + 文件服务 + Recovery + 外部变化检测
  useEffect(() => {
    if (!containerRef.current) return;
    const fsService = createDesktopFileService();
    fileServiceRef.current = fsService;
    documentsRef.current = new DocumentService(fsService);
    fileTreeServiceRef.current = new FileTreeService(fsService);
    // V7-W1.5：Articles（文档列表）数据源（与 File Tree 同一 FileService）
    fileListServiceRef.current = new FileListService(fsService);
    if (fileTreeRoot !== null) {
      fileTreeModelRef.current = new FileTreeModel(fileTreeRoot, fileTreeOptions);
    }
    recoveryRef.current = new RecoveryService(createDesktopRecoveryStorage());
    dialogRef.current = createDesktopDialogService();
    openerRef.current = createDesktopOpenerService();
    windowServiceRef.current = createDesktopWindowService();
    searchRef.current = createDesktopSearchService();
    externalRef.current = new ExternalChangeService(createDesktopWatcher(), {
      getDiskState: () => {
        const d = diskStateRef.current;
        return { mtimeMs: d?.mtimeMs ?? null, identityKey: d?.identityKey ?? null };
      },
      isDirty: () => dirtyRef.current,
      onCleanChange: (e) => { void handleCleanChange(e); },
      onConflict: (d) => setConflict(d),
      updateDiskState: (mtimeMs, identityKey) => {
        diskStateRef.current = { mtimeMs, identityKey };
      },
    });

    const host = new EditorCore({
      // 防缓存击穿：iframe src 固定为 /editor/index.html（URL 跨版本不变），
      // WKWebView 磁盘缓存可能让升级后仍命中旧 index.html + 旧指纹资源——
      // 一个内部自洽的旧编辑器（真机 v1.5.1–v1.5.3 显示修复不生效的头号嫌疑）。
      // 每次启动换查询参数强制走新 URL；tauri 协议按 path 部分解析，query 不影响资源定位。
      bundleUrl: `${EDITOR_BUNDLE_URL}?v=${Date.now().toString(36)}`,
    });
    hostRef.current = host;

    // 编辑器 iframe 启动竞态规避（macOS 真机矩阵 0/12 复现，Aug 18）：
    // 外壳大 bundle（dist 24MB / index.html inline 641KB）同步执行期间主运行
    // 循环被占用，iframe 立即发起的 tauri:// 自定义协议请求会使 WebKit 的
    // WKURLSchemeTaskImpl didReceiveResponse 阻塞在 callOnMainRunLoopAndWait，
    // 直到 tokio worker panic（panic=abort → SIGABRT）或 iframe -999 取消。
    // 策略：等主运行循环空闲后再创建 iframe —— requestIdleCallback 优先
    // （确定性空闲信号），旧 WebKit 回退到实测安全的固定延迟。
    const editorContainer = containerRef.current;
    let resolveMount: (() => void) | undefined;
    const mountGate = new Promise<void>((res) => { resolveMount = res; });
    const doMount = () => {
      try {
        host.mount(editorContainer);
      } catch (err) {
        console.error('[editor] mount failed', err);
      }
      resolveMount?.();
    };
    const idleRequest = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    let cancelIdle: (() => void) | undefined;
    let mountTimer = 0;
    if (typeof idleRequest === 'function') {
      // timeout 上限兜底：即便持续繁忙也保证挂载（600ms 内）
      const idleId = idleRequest.call(window, () => doMount(), { timeout: 600 });
      cancelIdle = () => {
        (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      };
    } else {
      // 旧 WebKit（无 requestIdleCallback）：回退实测安全延迟（Aug 18 真机值）
      mountTimer = window.setTimeout(() => doMount(), 800);
    }

    // 扩展运行时（PRD §119-121）：desktop 宿主 + 示例扩展注册
    const extensionHost = createDesktopExtensionHost(() => hostRef.current);
    extensionHostRef.current = extensionHost;
    const registry = new ExtensionRegistry(extensionHost);
    extensionRegistryRef.current = registry;
    // 扩展命令接线：enable 完成后经 __MELLOW_COMMANDS__ 增量注册（CommandRegistry effect 首次构建后再同步）
    // CommandRegistry effect 在 commit 后同步执行，__MELLOW_COMMANDS__ 在此 .then（微任务）前已就绪。
    void registry.register(helloCommandManifest, setupHelloCommand)
      .then(() => registry.enable(helloCommandManifest.id))
      .then(() => syncExtensionCommands(registry));

    // 图片文件操作服务（spec §6/§7：fs 编排 + 单事务 patch + undo）
    const dialog = dialogRef.current;
    const history = new FileOpHistory(fsService);
    historyRef.current = history;
    const editorBridge = createEditorBridgeFromCore(
      {
        getText: () => host.getText(),
        setDocumentPath: (p) => host.setDocumentPath(p),
        patchChanges: (c) => host.patchChanges(c),
        refreshImages: () => host.refreshImages(),
      },
      () => filePathRef.current,
    );
    fileOpsRef.current = new ImageFileOpsService({
      fs: fsService,
      editor: editorBridge,
      history,
      assetSetting: {
        getGlobalSetting: () => (localStorage.getItem(GLOBAL_ASSET_DIR_KEY) as AssetDirConfig | null) ?? 'assets',
      },
      // B5 图片上传（PRD §55）：通道配置每次调用时读 localStorage（live 设置）
      uploader: (imageUploadServiceRef.current ??= createDesktopImageUploadService()),
      uploadOptions: (): ImageUploadOptions => ({
        channel: (localStorage.getItem('mellow.image.uploadService') || 'none') as ImageUploadOptions['channel'],
        httpUrl: localStorage.getItem('mellow.image.uploadHttpUrl') || 'http://127.0.0.1:36677/upload',
        command: localStorage.getItem('mellow.image.uploadCommand') || '',
      }),
    });
    renameRef.current = new DocumentRenameService({
      fs: fsService,
      editor: editorBridge,
      history,
      dialog,
      onRenamed: async (newPath) => { await watchDocument(newPath); },
    });

    // Tauri drag-drop：桌面宿主把拖入文件路径注入 iframe（engine image input 消费）
    let unlistenDragDrop: (() => void) | undefined;
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => {
          getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type === 'drop') {
              const frame = containerRef.current?.querySelector('iframe');
              const win = frame?.contentWindow as (Window & { __MELLOW_DROP_PATHS__?: string[] }) | null;
              if (win) {
                win.__MELLOW_DROP_PATHS__ = event.payload.paths;
              }
            }
          }).then((unlisten) => { unlistenDragDrop = unlisten; });
        })
        .catch(() => { /* 浏览器 dev：无 drag-drop 注入 */ });
    }

    mountGate
      .then(() => host.ready())
      .then(async () => {
        let active = docStateRef.current.doc;
        // B1（SDI）：会话恢复仅主窗口（label 'main'）执行；⌘N/新建窗口不继承
        // 上一会话文档，直接从空白「未命名」启动（Typora 新窗口 = 空白文档）。
        let isPrimaryWindow = true;
        if ('__TAURI_INTERNALS__' in window) {
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            isPrimaryWindow = getCurrentWindow().label === 'main';
          } catch { isPrimaryWindow = true; }
        }
        primaryWindowRef.current = isPrimaryWindow;
        // PRD §92 启动行为：可关闭「恢复上次会话」（默认开启）
        let reopenLast = true;
        try { reopenLast = localStorage.getItem('mellow.general.reopenLast') !== '0'; } catch { /* 默认开启 */ }
        try {
          if (reopenLast && isPrimaryWindow) {
            const raw = localStorage.getItem(TABS_SESSION_KEY);
            if (raw !== null) {
              // 兼容 v≤1.4.6 旧结构（{tabs,activeId,closed}）与新结构（{tab}）
              const parsed = JSON.parse(raw) as DocumentStateInput;
              docStateRef.current = new DocumentState(parsed);
              active = docStateRef.current.doc;
            }
          } else {
            docStateRef.current = new DocumentState();
            active = null;
          }
        } catch {
          active = null;
        }
        if (active === null) {
          active = docStateRef.current.open({
            path: null,
            title: t('doc.untitled'),
            content: '',
            dirty: false,
            documentId: docIdRef.current,
            encoding: 'utf-8',
            eol: '\n',
          });
        }
        refreshTabsState();
        await applyTab(active);
        // 外部打开请求必须等到此处：初始空 tab / 恢复会话已经完成，不能再
        // 把随后打开的真实文件回写为初始化内容。
        resolveEditorStartupRef.current?.();
        resolveEditorStartupRef.current = null;
        // B3-1 编辑器设置启动恢复（fontSize/fontFamily/lineNumbers/lineWrapping：
        // 持久化在 localStorage，此前仅 live apply 无恢复 → 重启后丢失；B1-1 缩放同享此路径）
        try {
          // V7-W2.2（G7-SHELL-03）：字号启动恢复必须**无条件 apply**，与行高同一模式。
          // 历史缺陷：此处硬编码「size !== 17 才 apply」，而 17 是 vendored CoreEditor
          // iframe 的初始值（`editor-core/CoreEditor/index.ts:40`、`src/bundle.ts:21`），
          // 并非 Mellow 默认（TYPOGRAPHY_DEFAULTS.fontSize = 16）。后果：用户保持默认
          // 16px 时该分支被跳过，编辑器实际停在 iframe 的 17px —— 设置显示 16 而正文
          // 渲染 17。现改为无条件写入设置值（读不到设置时回落同一真源）。
          const sizeDef = settingById('editor.fontSize');
          const size = sizeDef ? readSetting(sizeDef) : TYPOGRAPHY_DEFAULTS.fontSize;
          const fontSize = typeof size === 'number' && size > 0 ? size : TYPOGRAPHY_DEFAULTS.fontSize;
          host.setEditorConfig('setFontSize', { fontSize });
          applyContentFontSize(fontSize); // Reader 同源（见 applyContentFontSize 注释）
          // B3-2 字体族启动恢复：用户显式设置 > 主题级（Newsprint/Paper 衬线）> CoreEditor 默认。
          // C4 修复（G4-EDIT / theme-verify）：无用户设置且主题未声明字体时也必须显式
          // apply 'ui-monospace' —— iframe 初始 window.config 的 fontFace.family 为
          // system-ui（vendored CoreEditor 契约默认），不覆盖会残留为 system-ui 开头的
          // 回退栈，导致切回 mellow-light 后编辑器字体不是 ui-monospace。
          const familyPref = readEditorFontFamilyPreference(activeTheme);
          host.setEditorConfig('setFontFace', { family: familyPref ?? 'ui-monospace' });
          const lineNumDef = settingById('editor.lineNumbers');
          if (lineNumDef && readSetting(lineNumDef) === true) {
            host.setEditorConfig('setShowLineNumbers', { enabled: true });
          }
          // E4：行号双偏好写入引擎（Source 模式行号独立开关，Typora 源码模式默认显示）
          {
            const sourceLineNumDef = settingById('editor.sourceLineNumbers');
            const liveOn = lineNumDef ? readSetting(lineNumDef) === true : false;
            const sourceOn = sourceLineNumDef ? readSetting(sourceLineNumDef) === true : true;
            const frameEl = containerRef.current?.querySelector('iframe');
            const frameWin = frameEl?.contentWindow as (Window & { __MELLOW_LINE_NUMBER_PREFS__?: { live: boolean; source: boolean } }) | null;
            if (frameWin !== null && frameWin !== undefined) {
              frameWin.__MELLOW_LINE_NUMBER_PREFS__ = { live: liveOn, source: sourceOn };
            }
          }
          const wrapDef = settingById('editor.lineWrapping');
          if (wrapDef && readSetting(wrapDef) === false) {
            host.setEditorConfig('setLineWrapping', { enabled: false });
          }
          // P2-2.1 行高启动恢复：CoreEditor 默认 1.5 ≠ Mellow 默认（TYPOGRAPHY_DEFAULTS.lineHeight），
          // 必须无条件 apply 对齐（读不到设置时回落同一真源），不能沿用「非默认才 apply」模式。
          const lineHeightDef = settingById('editor.lineHeight');
          const lineHeightValue = lineHeightDef ? readSetting(lineHeightDef) : TYPOGRAPHY_DEFAULTS.lineHeight;
          host.setEditorConfig('setLineHeight', { lineHeight: typeof lineHeightValue === 'number' && lineHeightValue > 0 ? lineHeightValue : TYPOGRAPHY_DEFAULTS.lineHeight });
          // A1（第四轮）写作宽度启动恢复：iframe 内 .cm-content 限宽居中
          // （680/860/980/Auto，默认见 TYPOGRAPHY_DEFAULTS）；Auto(null) = 全宽。替代 v1.4.5 前缩窄
          // iframe 本体的做法，滚动条贴窗缘、两侧编辑器底色连续（Typora parity）。
          {
            const widthDef = settingById('editor.writingWidth');
            const raw = widthDef ? readSetting(widthDef) : TYPOGRAPHY_DEFAULTS.writingWidth;
            const num = typeof raw === 'number' && raw > 0 ? raw : Number(raw);
            host.setEditorConfig('setContentMaxWidth', { width: raw === 'auto' || Number.isNaN(num) ? null : num });
          }
          // D1-1 拼写检查启动恢复（默认 true；大文件模式由引擎侧强制关闭）
          const spellDef = settingById('editor.spellcheck');
          if (spellDef && readSetting(spellDef) === false) {
            host.setSpellcheckEnabled(false);
          }
          if ('__TAURI_INTERNALS__' in window) {
            const spellInit = spellDef ? readSetting(spellDef) !== false : true;
            void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_spellcheck_state', { checked: spellInit })).catch(() => undefined);
          }
          // R2-1 智能标点启动恢复（默认 false；Typora parity）
          const smartPunctDef = settingById('editor.smartPunctuation');
          if (smartPunctDef && readSetting(smartPunctDef) === true) {
            host.setSmartPunctuationEnabled(true);
          }
          // 代码块行号启动恢复（默认 false；Typora 偏好→Markdown）
          const codeLnDef = settingById('markdown.codeLineNumbers');
          if (codeLnDef && readSetting(codeLnDef) === true) {
            host.setCodeLineNumbersEnabled(true);
          }
          // 专注/打字机「默认开启状态」启动恢复（Typora 偏好→通用：重启后按偏好进入）
          const typewriterDef = settingById('editor.typewriter');
          if (typewriterDef && readSetting(typewriterDef) === true) {
            host.setTypewriterMode(true);
            setTypewriterEnabled(true);
          }
          const focusDef = settingById('editor.focusMode');
          if (focusDef) {
            const fv = String(readSetting(focusDef) ?? 'off');
            if (fv === 'line' || fv === 'paragraph') {
              host.setFocusMode(fv);
              setFocusModeState(fv);
            }
          }
        } catch { /* 设置读取失败 → 保持默认 */ }
        setStatus('ready');
        setStatusText(t('msg.editorReady'));
        refreshStats(host);

        // 注入图片操作 handler（widget 悬停操作条 → app-core 编排；spec §6）
        const frame = containerRef.current?.querySelector('iframe');
        const win = frame?.contentWindow as (Window & { __MELLOW_IMAGE_ACTIONS__?: (req: ImageWidgetActionRequest) => void }) | null;
        if (win) {
          win.__MELLOW_IMAGE_ACTIONS__ = (req) => { void handleImageAction(req); };
        }

        // R3-2 编辑器内公式排版：注入宿主 KaTeX 渲染通道（含 mhchem \ce/\pu，按需加载；
        // 渲染失败引擎回退源码显示）+ iframe KaTeX 样式
        host.installKatexRenderer((tex, display) =>
          loadKatex().then((katex) => renderKatex(katex, tex, display)).catch(() => null));
        injectKatexCssIntoFrame(frame);

        // 注入 wikilink 打开 handler（[[name]] → 同目录 name.md；App 解析并打开）
        const wikilinkWin = frame?.contentWindow as (Window & { __MELLOW_WIKILINK_OPEN__?: (name: string) => void }) | null;
        if (wikilinkWin) {
          wikilinkWin.__MELLOW_WIKILINK_OPEN__ = (name) => { void openWikilinkRef.current(name); };
        }

        // 图床上传（Typora §55 / 清单 1.3）：插入图片（拖拽/粘贴）自动上传替换 URL。
        // 惰性读 localStorage（live 设置：偏好→图片→上传服务切换即生效）；
        // 'none'/未装配 → 全 null → engine 回退本地插入策略（keep-original / copy-to-assets）。
        const uploadWin = frame?.contentWindow as (Window & { __MELLOW_IMAGE_UPLOAD__?: (paths: string[]) => Promise<Array<string | null>> }) | null;
        if (uploadWin) {
          uploadWin.__MELLOW_IMAGE_UPLOAD__ = async (paths: string[]): Promise<Array<string | null>> => {
            const channel = (localStorage.getItem('mellow.image.uploadService') || 'none') as ImageUploadOptions['channel'];
            if (channel === 'none') return paths.map(() => null);
            const service = imageUploadServiceRef.current;
            if (service === null) return paths.map(() => null);
            const r = await service.uploadImages(paths, {
              channel,
              httpUrl: localStorage.getItem('mellow.image.uploadHttpUrl') || 'http://127.0.0.1:36677/upload',
              command: localStorage.getItem('mellow.image.uploadCommand') || '',
            });
            if (!r.ok) {
              setStatusText(t('msg.uploadFailed', { error: r.error.message }));
              return paths.map(() => null);
            }
            setStatusText(t('msg.uploadDone', { count: r.value.filter((u) => u.length > 0).length }));
            return r.value.map((u) => (u.length > 0 ? u : null));
          };
        }

        // 注入 markdown 文件链接打开 handler（[label](path.md#锚点) → 相对解析打开 + 锚点跳转）
        // 与 broken local link indicator 的 exists checker（spec §12：false 才标错，undefined 不误标）
        const mdLinkWin = frame?.contentWindow as (Window & { __MELLOW_MD_LINK_OPEN__?: (dest: string) => void; __MELLOW_MD_LINK_EXISTS__?: (dest: string) => boolean | undefined }) | null;
        if (mdLinkWin) {
          mdLinkWin.__MELLOW_MD_LINK_OPEN__ = (dest) => { void openMdLinkRef.current(dest); };
          mdLinkWin.__MELLOW_MD_LINK_EXISTS__ = (dest) => checkMdLinkExistsRef.current(dest);
        }

        // 注入编辑器右键菜单 handler（engine 检测上下文 → App 弹 ContextMenu）
        const ctxWin = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_MENU__?: (req: EditorContextMenuRequest) => void }) | null;
        if (ctxWin) {
          ctxWin.__MELLOW_CONTEXT_MENU__ = (req) => { handleEditorContextMenuRef.current(req); };
        }

        // Crash Recovery：编辑事件 → 防抖快照（与 Auto Save 分离）
        host.onEvent((e) => {
          if (e.type === 'viewUpdate') {
            if (e.compositionEnded === false) {
              compositionEditPendingRef.current ||= e.contentEdited;
              return;
            }
            const contentEdited = e.contentEdited || compositionEditPendingRef.current;
            compositionEditPendingRef.current = false;
            refreshOutline(host.getSelectionHead());
            refreshCursorPos(host);
            // 光标/选区变化同样需要刷新 UI，但绝不能把它们记成未保存内容。
            // CoreEditor 的 contentEdited 精确对应 CodeMirror Transaction.docChanged。
            if (!contentEdited || suppressEditorEventRef.current) return;
            revisionRef.current += 1;
            setDirty(true);
            docStateRef.current.updateCurrent({
              ...currentTabPatch(host),
              dirty: true,
              revision: revisionRef.current,
            });
            refreshTabsState();
            scheduleRecoverySnapshot(host);
          }
        });

        // 启动发现未恢复文档（spec §6：Recover / Compare / Ignore）
        const recovery = recoveryRef.current;
        if (recovery) {
          const list = await recovery.listPending();
          if (list.ok && list.value.length > 0) {
            setRecoveryEntries(list.value);
            setStatusText(t('msg.recoveryFound', { n: list.value.length }));
          }
        }
      })
      .catch((err) => {
        // 启动失败也释放等待者，避免外部打开请求永久挂起；其自身会安全报错。
        resolveEditorStartupRef.current?.();
        resolveEditorStartupRef.current = null;
        console.error('editor init failed', err);
        setStatus('error');
        setStatusText(t('msg.editorInitFailed', { error: String(err) }));
      });

    return () => {
      cancelIdle?.();
      window.clearTimeout(mountTimer);
      unlistenDragDrop?.();
      host.destroy();
      recoveryRef.current?.dispose();
      void externalRef.current?.stop();
    };
    // 注意：挂载 effect 必须只运行一次。若依赖数组包含会随渲染变化的 useCallback
    // 身份（如 applyTab 链），React 会先跑 cleanup（host.destroy() 移除 iframe →
    // WebKit -999 取消加载）再重跑，导致编辑器 iframe 竞态空白。所有被引用值均
    // 经 ref（hostRef/fileServiceRef/...）访问，mount 时快照即安全。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 记录最近打开（去重置顶、cap 10、持久化）+ Windows JumpList 系统最近文档 */
  const recordRecentFile = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = pushRecentFile(prev, path, Date.now());
      const raw = serializeRecentFiles(next);
      if (raw !== null) {
        try { localStorage.setItem(RECENT_FILES_KEY, raw); } catch { /* noop */ }
      }
      return next;
    });
    // Windows JumpList（PRD §134 P1 Recent integration）：SHAddToRecentDocs 系统聚合，
    // 任务栏右键「最近」直达；非 Windows 后端 no-op。失败静默（体验增强，不影响主流程）。
    void invoke('jump_list_add_recent', { path }).catch(() => undefined);
  }, []);

  const handleNew = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    // B1（SDI）：非 Tauri 回落路径也保持一窗一文档 —— 清空现有文档（dirty 需确认）
    if (!guardSingleDocument()) return;
    const tab = docStateRef.current.open({
      path: null,
      title: t('doc.untitled'),
      content: '',
      dirty: false,
      documentId: crypto.randomUUID(),
      encoding: 'utf-8',
      eol: '\n',
      diskState: null,
    });
    refreshTabsState();
    await applyTab(tab);
    setStatusText(t('msg.untitledCreated'));
  }, [applyTab, guardSingleDocument, refreshTabsState]);

  /** Typora：打开单个文件 → 父文件夹自动加载（清单 2.1 注：无需显式打开文件夹）。
   *  仅在尚未加载任何文件夹时生效（fileTreeRoot 为 null），不打断已打开的项目根。 */
  const autoLoadParentFolder = useCallback((path: string) => {
    if (fileTreeRootRef.current !== null) return;
    const dir = fileTreeDirname(path);
    if (dir === '') return;
    localStorage.setItem(FILE_TREE_ROOT_KEY, dir);
    setFileTreeRoot(dir);
    rememberRecentFolder(dir);
  }, [rememberRecentFolder]);

  const handleOpen = useCallback(async () => {
    const documents = documentsRef.current;
    if (!documents) return;
    // B1（SDI）：⌘O 打开文档 = 当前窗口内替换当前文档（脏文档先确认）
    if (!guardSingleDocument()) return;
    const result = await documents.open();
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.openFailed', { error: result.error.message }));
      }
      return;
    }
    const tab = docStateRef.current.open({
      path: result.value.path,
      content: result.value.content,
      dirty: false,
      documentId: crypto.randomUUID(),
      revision: 0,
      encoding: result.value.encoding,
      eol: result.value.eol,
      diskState: result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
        ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
        : null,
    });
    refreshTabsState();
    await applyTab(tab);
    autoLoadParentFolder(result.value.path);
    setStatusText(t('msg.openedPath', { path: result.value.path }));
    recordRecentFile(result.value.path);
  }, [applyTab, guardSingleDocument, refreshTabsState, recordRecentFile, autoLoadParentFolder]);

  /** 外部打开（CLI 参数 / Finder「打开方式」odoc）：按路径直接读入当前窗口（替换语义），无对话框 */
  const openPathInTab = useCallback(async (path: string) => {
    const documents = documentsRef.current;
    if (!documents) return;
    // WKURLSchemeHandler 竞态防护：大文档管线（分块 IPC + 拼接 + dispatch）会
    // 长时间占用主线程；若恰逢 iframe 动态样式 CSSOM pending 窗口，WebKit 会
    // 永久丢弃 CSSOM → 白屏。读取前确保编辑器就绪且样式建立（正常情况瞬时）。
    const host = hostRef.current;
    if (host) {
      await host.ready();
      await host.waitForStylesReady();
    }
    // B1（SDI）：odoc/CLI 打开 = 当前窗口替换（脏文档先确认）；Phase 4 提供新窗口模式
    if (!guardSingleDocument()) return;
    const result = await documents.readPath(path);
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.openFailed', { error: result.error.message }));
      }
      return;
    }
    const tab = docStateRef.current.open({
      path: result.value.path,
      content: result.value.content,
      dirty: false,
      documentId: crypto.randomUUID(),
      revision: 0,
      encoding: result.value.encoding,
      eol: result.value.eol,
      diskState: result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
        ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
        : null,
    });
    refreshTabsState();
    await applyTab(tab);
    autoLoadParentFolder(result.value.path);
    setStatusText(t('msg.openedPath', { path: result.value.path }));
    recordRecentFile(result.value.path);
  }, [applyTab, guardSingleDocument, refreshTabsState, recordRecentFile, autoLoadParentFolder]);

  // D2：导入（Typora File→Import）：pandoc 将 docx/odt/rtf/epub/html/tex 等
  // 转为 Markdown 落盘，并经 openPathInTab 在当前窗口打开（B1 SDI：替换语义）。
  // 二进制输入不经文本读取，直接传路径给 pandoc。
  const handleImportDocument = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const available = await invoke<boolean>('pandoc_available');
      if (!available) {
        setToast({ message: t('import.needPandoc') });
        return;
      }
      const input = await invoke<string | null>('pick_open_path', {
        filters: ['docx', 'odt', 'rtf', 'epub', 'html', 'htm', 'tex', 'latex', 'rst', 'textile', 'wiki', 'opml'],
      });
      if (input === null) return;
      const base = input.split(/[\\/]/).pop() ?? 'imported';
      const output = await invoke<string | null>('pick_save_path', {
        defaultName: `${base.replace(/\.[^.]*$/, '')}.md`,
        filters: ['md'],
      });
      if (output === null) return;
      await invoke('pandoc_import', { input, output });
      await openPathInTab(output);
      setToast({ message: t('import.done', { path: output }) });
    } catch (err) {
      setToast({ message: `${t('import.failed')}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [openPathInTab, t]);

  /** Wikilink [[name]] → 同目录 name.md（无当前路径时相对 name.md）；不存在则提示 */
  const openWikilink = useCallback(async (name: string) => {
    const fsService = fileServiceRef.current;
    const targetName = /\.(md|markdown|mdown|mkd)$/i.test(name) ? name : `${name}.md`;
    const current = filePathRef.current;
    const target = current !== null ? `${fileTreeDirname(current)}/${targetName}` : targetName;
    if (fsService !== null) {
      const r = await fsService.exists(target);
      if (!r.ok) { setStatusText(t('msg.openFailed', { error: r.error.message })); return; }
      if (!r.value) { setStatusText(t('msg.wikilinkNotFound', { name: targetName })); return; }
    }
    await openPathInTab(target);
  }, [openPathInTab]);
  const openWikilinkRef = useRef(openWikilink);
  openWikilinkRef.current = openWikilink;

  /** Markdown 文件链接 `[label](path.md#锚点)` → 相对当前文档目录解析并打开；
   *  锚点跳转：heading 文本/ slug 匹配 → jumpToOffset（Typora 文件链接锚点跳转）。 */
  // broken local link indicator（engine spec §12：subtle error indicator）：
  // engine 装饰时同步查缓存；miss → 去重异步预取（fs.exists）→ 写缓存 → 通知引擎重绘。
  // undefined（未预取）首帧不误标；fs 查询失败保守视为存在（不误标）。
  const mdLinkExistsCacheRef = useRef(new Map<string, boolean>());
  const mdLinkExistsPendingRef = useRef(new Set<string>());
  const checkMdLinkExists = useCallback((dest: string): boolean | undefined => {
    const resolved = resolveMdLinkTarget(dest, filePathRef.current);
    if (resolved === null) return true; // 空/纯锚点 → 不标错
    const cached = mdLinkExistsCacheRef.current.get(resolved.target);
    if (cached !== undefined) return cached;
    if (!mdLinkExistsPendingRef.current.has(resolved.target)) {
      mdLinkExistsPendingRef.current.add(resolved.target);
      void (async () => {
        let exists = true;
        const fsService = fileServiceRef.current;
        if (fsService !== null) {
          const r = await fsService.exists(resolved.target);
          if (r.ok) exists = r.value;
        }
        mdLinkExistsPendingRef.current.delete(resolved.target);
        if (mdLinkExistsCacheRef.current.size > 512) mdLinkExistsCacheRef.current.clear();
        mdLinkExistsCacheRef.current.set(resolved.target, exists);
        hostRef.current?.refreshMdLinks();
      })();
    }
    return undefined;
  }, []);
  const checkMdLinkExistsRef = useRef(checkMdLinkExists);
  checkMdLinkExistsRef.current = checkMdLinkExists;

  const openMdLink = useCallback(async (dest: string) => {
    // dest 可能带 %XX 转义（拖拽建链/外部工具生成）→ resolveMdLinkTarget 统一解码拆锚点
    const resolved = resolveMdLinkTarget(dest, filePathRef.current);
    if (resolved === null) return;
    const { pathPart, target, anchor } = resolved;
    const fsService = fileServiceRef.current;
    if (fsService !== null) {
      const r = await fsService.exists(target);
      if (!r.ok) { setStatusText(t('msg.openFailed', { error: r.error.message })); return; }
      // Typora：链接目标不存在 → 引导自动创建（清单 2.3 文件链接）
      if (!r.value) {
        if (!window.confirm(t('dialog.mdLinkCreate', { path: pathPart }))) {
          setStatusText(t('msg.wikilinkNotFound', { name: pathPart }));
          return;
        }
        const created = await fsService.writeText(target, '');
        if (!created.ok) {
          setStatusText(t('msg.openFailed', { error: created.error.message }));
          return;
        }
        // 自动创建成功 → 同步 exists 缓存，broken 指示立即消失
        mdLinkExistsCacheRef.current.set(target, true);
      }
    }
    await openPathInTab(target);
    if (anchor !== '') {
      const text = hostRef.current?.getText() ?? '';
      const offset = headingOffsetForAnchor(text, anchor);
      if (offset !== null) hostRef.current?.jumpToOffset(offset);
    }
  }, [openPathInTab]);
  const openMdLinkRef = useRef(openMdLink);
  openMdLinkRef.current = openMdLink;

  /** 编辑器右键菜单（engine → __MELLOW_CONTEXT_MENU__ 请求 → 弹 ContextMenu） */
  const handleEditorContextMenu = useCallback((req: EditorContextMenuRequest) => {
    // P1-1.7（G4-MENU-07）：右键菜单只发命令，不直接调用引擎。
    // 所有条目走 dispatchCommand，与菜单 / 快捷键 / 命令面板共用同一入口与同一 enabledWhen。
    // C1：ContextMenu 升级支持分隔线与一层子菜单，Typora 子菜单结构（code-tools / table / Alignment /
    // copyMathBlock）按原层级呈现，不再扁平化。
    const run = (id: string) => () => { void dispatchCommand(id, 'context-menu'); };
    const items: ContextMenuEntry[] = [
      { label: t('contextmenu.editorCut'), enabled: req.hasSelection, onClick: run('edit.cut') },
      { label: t('contextmenu.editorCopy'), enabled: req.hasSelection, onClick: run('edit.copy') },
      { label: t('contextmenu.editorPaste'), onClick: run('edit.paste') },
    ];
    // Typora 通用子菜单（code-tools：Copy Code Content / Auto Indent Whole / Auto Indent Selected）
    // 注意：codeTools / insertParagraph 条目在 code/math/mermaid 三个分支内各内联一份
    // （护栏 verify-context-menu-parity.mjs 按 kind 块内 run( 调用抽取序列）。
    // P1-1.7：链接右键。Typora 1.14.9：["openLink","copyLink","|","normal",download]；
    // C1 补齐 Edit / Remove（Typora link 右键的编辑与移除）。
    if (req.kind === 'link' && req.url !== undefined) {
      items.push(
        { separator: true },
        { label: t('contextmenu.editorOpenLink'), onClick: run('format.openLink') },
        { label: t('contextmenu.editorCopyLink'), onClick: run('format.copyLinkUrl') },
        { label: t('contextmenu.linkEdit'), onClick: run('format.editLinkUrl') },
        { label: t('contextmenu.linkRemove'), onClick: run('format.removeLink') },
      );
    }
    if (req.kind === 'wikilink' && req.name !== undefined) {
      items.push({
        label: t('contextmenu.editorOpenWikilink', { name: req.name }),
        onClick: () => { void openWikilinkRef.current(req.name as string); },
      });
    }
    // V4 §10 image 行：Open/Reveal、Copy Image/Copy Path、Resize、Markdown↔HTML、
    // Rename/Move/Copy、Upload、Delete（二次确认 + Trash）。直连 handleImageAction（已登记例外）。
    if (req.kind === 'image' && req.src !== undefined) {
      const img = (action: Parameters<typeof handleImageAction>[0]['action']) => () => {
        void handleImageAction({ src: req.src as string, action });
      };
      items.push(
        { separator: true },
        { label: t('contextmenu.editorImageOpen'), onClick: img('open') },
        { label: t('contextmenu.editorImageReveal'), onClick: img('reveal') },
        { label: t('contextmenu.editorImageCopy'), onClick: run('edit.copyImage') },
        { label: t('contextmenu.editorImageCopyPath'), onClick: img('copyPath') },
        { separator: true },
        { label: t('contextmenu.editorImageRename'), onClick: img('rename') },
        { label: t('contextmenu.editorImageMove'), onClick: img('move') },
        { label: t('contextmenu.editorImageResize'), onClick: img('setSize') },
        { separator: true },
        { label: t('contextmenu.editorImageMdToHtml'), onClick: img('mdToHtml') },
        { label: t('contextmenu.editorImageHtmlToMd'), onClick: img('htmlToMd') },
        { label: t('contextmenu.editorImageUpload'), onClick: img('upload') },
        { separator: true },
        { label: t('contextmenu.editorImageDelete'), onClick: img('delete') },
      );
    }
    // 普通文本：段落 / 格式转换子菜单 + 复制为（V4 §10 text 行）。
    if (req.kind === 'text') {
      items.push(
        { separator: true },
        {
          label: t('contextmenu.textParagraph'),
          children: [
            { label: t('menu.paragraph.h1'), onClick: run('paragraph.h1') },
            { label: t('menu.paragraph.h2'), onClick: run('paragraph.h2') },
            { label: t('menu.paragraph.h3'), onClick: run('paragraph.h3') },
            { label: t('menu.paragraph.h4'), onClick: run('paragraph.h4') },
            { label: t('menu.paragraph.h5'), onClick: run('paragraph.h5') },
            { label: t('menu.paragraph.h6'), onClick: run('paragraph.h6') },
            { label: t('menu.paragraph.normal'), onClick: run('paragraph.normal') },
          ],
        },
        {
          label: t('contextmenu.textFormat'),
          children: [
            { label: t('menu.format.bold'), onClick: run('format.bold') },
            { label: t('menu.format.italic'), onClick: run('format.italic') },
            { label: t('menu.format.strike'), onClick: run('format.strike') },
            { label: t('menu.format.code'), onClick: run('format.code') },
            { label: t('menu.format.link'), onClick: run('format.link') },
          ],
        },
        { separator: true },
        { label: t('contextmenu.textCopyAsMarkdown'), onClick: run('edit.copyMarkdown') },
        { label: t('contextmenu.textCopyAsPlain'), onClick: run('edit.copyPlain') },
      );
    }
    // P1-1.7：代码块 / 公式块 / 图表块级分支。
    // 依据 Typora 1.14.9 appsrc/main.js getMenuItemsForMac：
    //   fences（普通代码块）→ ["|","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete-fences"]
    //   math_block            → ["|","edit","copyMathBlock","download-math","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete"]
    //   fences + md-diagram   → ["|","edit","copy-as-image","download-diagram","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete"]
    // C1：子菜单结构与 Typora 一致；copy-as-image / download 经引擎渲染导出（SVG/σMathML → PNG）。
    if (req.kind === 'code') {
      items.push(
        { separator: true },
        {
          label: t('contextmenu.codeTools'),
          children: [
            { label: t('contextmenu.codeCopyContent'), onClick: run('paragraph.copyCodeBlock') },
            { label: t('contextmenu.codeAutoIndentAll'), onClick: run('paragraph.autoIndentCodeBlock') },
            { label: t('contextmenu.codeAutoIndentSelected'), onClick: run('paragraph.autoIndentSelection') },
          ],
        },
        { separator: true },
        { label: t('contextmenu.codeInsertParagraphBefore'), onClick: run('paragraph.insertParagraphBefore') },
        { label: t('contextmenu.codeInsertParagraphAfter'), onClick: run('paragraph.insertParagraphAfter') },
        { label: t('contextmenu.codeDeleteFences'), onClick: run('paragraph.deleteFences') },
      );
    }
    if (req.kind === 'math') {
      items.push(
        { separator: true },
        {
          label: t('contextmenu.mathCopyMenu'),
          children: [
            { label: t('contextmenu.mathCopyAsTex'), onClick: run('math.copyAsTex') },
            { label: t('contextmenu.mathCopyAsMathML'), onClick: run('math.copyAsMathML') },
            { label: t('contextmenu.mathCopyAsImage'), onClick: run('math.copyAsImage') },
          ],
        },
        { label: t('contextmenu.mathDownload'), onClick: run('math.download') },
        {
          label: t('contextmenu.codeTools'),
          children: [
            { label: t('contextmenu.codeCopyContent'), onClick: run('paragraph.copyCodeBlock') },
            { label: t('contextmenu.codeAutoIndentAll'), onClick: run('paragraph.autoIndentCodeBlock') },
            { label: t('contextmenu.codeAutoIndentSelected'), onClick: run('paragraph.autoIndentSelection') },
          ],
        },
        { separator: true },
        { label: t('contextmenu.codeInsertParagraphBefore'), onClick: run('paragraph.insertParagraphBefore') },
        { label: t('contextmenu.codeInsertParagraphAfter'), onClick: run('paragraph.insertParagraphAfter') },
        { label: t('contextmenu.mathDelete'), onClick: run('math.deleteBlock') },
      );
    }
    if (req.kind === 'mermaid') {
      items.push(
        { separator: true },
        { label: t('contextmenu.mermaidCopyAsImage'), onClick: run('mermaid.copyAsImage') },
        { label: t('contextmenu.mermaidDownload'), onClick: run('mermaid.download') },
        {
          label: t('contextmenu.codeTools'),
          children: [
            { label: t('contextmenu.codeCopyContent'), onClick: run('paragraph.copyCodeBlock') },
            { label: t('contextmenu.codeAutoIndentAll'), onClick: run('paragraph.autoIndentCodeBlock') },
            { label: t('contextmenu.codeAutoIndentSelected'), onClick: run('paragraph.autoIndentSelection') },
          ],
        },
        { separator: true },
        { label: t('contextmenu.codeInsertParagraphBefore'), onClick: run('paragraph.insertParagraphBefore') },
        { label: t('contextmenu.codeInsertParagraphAfter'), onClick: run('paragraph.insertParagraphAfter') },
        { label: t('contextmenu.mermaidDelete'), onClick: run('mermaid.deleteBlock') },
      );
    }
    if (req.kind === 'table') {
      items.push(
        { separator: true },
        {
          label: t('contextmenu.tableMenu'),
          children: [
            { label: t('contextmenu.tableAddRowAbove'), onClick: run('table.addRowAbove') },
            { label: t('contextmenu.tableAddRowBelow'), onClick: run('table.addRowBelow') },
            { label: t('contextmenu.tableDeleteRow'), onClick: run('table.deleteRow') },
            { label: t('contextmenu.tableAddColumnLeft'), onClick: run('table.addColumnLeft') },
            { label: t('contextmenu.tableAddColumnRight'), onClick: run('table.addColumnRight') },
            { label: t('contextmenu.tableDeleteColumn'), onClick: run('table.deleteColumn') },
            { label: t('contextmenu.tableMoveRowUp'), onClick: run('table.moveRowUp') },
            { label: t('contextmenu.tableMoveRowDown'), onClick: run('table.moveRowDown') },
            { label: t('contextmenu.tableMoveColumnLeft'), onClick: run('table.moveColumnLeft') },
            { label: t('contextmenu.tableMoveColumnRight'), onClick: run('table.moveColumnRight') },
            { label: t('contextmenu.tableCopyTable'), onClick: run('table.copyTable') },
            { label: t('contextmenu.tableTidy'), onClick: run('table.tidy') },
            { label: t('contextmenu.tableDeleteTable'), onClick: run('table.deleteTable') },
          ],
        },
        {
          label: t('contextmenu.tableAlign'),
          children: [
            { label: t('contextmenu.tableAlignLeft'), onClick: run('table.alignLeft') },
            { label: t('contextmenu.tableAlignCenter'), onClick: run('table.alignCenter') },
            { label: t('contextmenu.tableAlignRight'), onClick: run('table.alignRight') },
            { label: t('contextmenu.tableAlignDefault'), onClick: run('table.alignDefault') },
          ],
        },
      );
    }
    setContextMenu({ x: req.x, y: req.y, items });
  }, [dispatchCommand, handleImageAction, t]);
  const handleEditorContextMenuRef = useRef(handleEditorContextMenu);
  handleEditorContextMenuRef.current = handleEditorContextMenu;

  const handleSave = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    const expected = diskStateRef.current ?? undefined;
    const result = await documents.save(filePathRef.current, content, {
      encoding: meta.encoding,
      eol: meta.eol,
      expectedDisk: expected,
      // C1：未命名首存（Ctrl+S 弹对话框）建议名同样取首行/首个标题
      suggestedName: filePathRef.current === null ? documentSuggestedName(content) ?? undefined : undefined,
    });
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.saveFailed', { error: result.error.message }));
      }
      return;
    }
    filePathRef.current = result.value.path;
    host.setDocumentPath(result.value.path);
    diskStateRef.current = result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
      ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
      : null;
    setDirty(false);
    docStateRef.current.updateCurrent({
      ...currentTabPatch(host),
      path: result.value.path,
      title: result.value.path.split(/[\\/]/).pop() ?? result.value.path,
      dirty: false,
      diskState: diskStateRef.current,
    });
    refreshTabsState();
    // 保存成功 → cleanup recovery（spec §4 clear recovery snapshot）
    void recoveryRef.current?.onSaved(docIdRef.current);
    await watchDocument(result.value.path);
    setStatusText(t('msg.saved', { path: result.value.path }));
  }, [currentTabPatch, refreshTabsState, setDirty, watchDocument]);

  // PRD §101 Auto Save：默认 Window Blur + Document Switch；设置可关闭（mellow.file.autosave）
  const maybeAutoSaveRef = useRef<(() => Promise<void>) | null>(null);
  const maybeAutoSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    if (!isAutosaveEnabled(readStored('mellow.file.autosave'))) return;
    await handleSave();
  }, [handleSave]);
  maybeAutoSaveRef.current = maybeAutoSave;
  // V7-W5（G7-FEAT-03）定时自动保存：Typora Win/Linux 默认每 5 分钟保存一次
  // （官方《Auto Save》：`autoSaveTimer` Double，单位 minute，默认 5）；macOS 为
  // NSDocument 系统特性、始终开启。Mellow 三平台统一启用（规则 10 共享产品语义），
  // 并把间隔暴露到 GUI（Typora 需手改 JSON），判定 B（更优）。
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => isAutosaveEnabled(readStored('mellow.file.autosave')));
  const [autosaveMinutes, setAutosaveMinutes] = useState(() => parseAutosaveMinutes(readStored(AUTOSAVE_TIMER_KEY)));
  useEffect(() => {
    if (!autosaveEnabled) return;
    const timer = window.setInterval(() => {
      void maybeAutoSaveRef.current?.();
    }, autosaveIntervalMs(autosaveMinutes));
    return () => {
      window.clearInterval(timer);
    };
  }, [autosaveEnabled, autosaveMinutes]);

  const handleSaveAs = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    // C1（第四轮）：另存对话框建议文件名 = 内容首行/首个标题提炼（Typora parity）
    const result = await documents.save(null, content, {
      encoding: meta.encoding,
      eol: meta.eol,
      suggestedName: documentSuggestedName(content) ?? undefined,
    });
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.saveAsFailed', { error: result.error.message }));
      }
      return;
    }
    filePathRef.current = result.value.path;
    host.setDocumentPath(result.value.path);
    diskStateRef.current = result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
      ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
      : null;
    setDirty(false);
    docStateRef.current.updateCurrent({
      ...currentTabPatch(host),
      path: result.value.path,
      title: result.value.path.split(/[\\/]/).pop() ?? result.value.path,
      dirty: false,
      diskState: diskStateRef.current,
    });
    refreshTabsState();
    void recoveryRef.current?.onSaved(docIdRef.current);
    await watchDocument(result.value.path);
    setStatusText(`已另存 ${result.value.path}`);
  }, [currentTabPatch, refreshTabsState, setDirty, watchDocument]);

  /** B1（SDI）：保存全部（Typora 文件→保存全部）—— 单文档窗口下即保存当前文档；
   *  多窗口场景各窗口分别触发本命令（每窗口各自保存自身文档）。 */
  const handleSaveAll = useCallback(async () => {
    await handleSave();
  }, [handleSave]);

  /** 从磁盘重新加载（Typora 文件→从磁盘重新加载）：放弃本地未保存修改，覆盖为磁盘版本 */
  const handleReloadFromDisk = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    const path = filePathRef.current;
    if (!host || !documents || path === null) return;
    const r = await documents.readPath(path);
    if (!r.ok) {
      setStatusText(t('msg.reloadFailed', { error: r.error.message }));
      return;
    }
    docMetaRef.current = { encoding: r.value.encoding, eol: r.value.eol };
    diskStateRef.current = r.value.diskMtimeMs !== undefined && r.value.identityKey !== undefined
      ? { mtimeMs: r.value.diskMtimeMs, identityKey: r.value.identityKey }
      : null;
    await host.open(r.value.content, undefined, true, r.value.eol);
    setDirty(false);
    docStateRef.current.updateCurrent({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
    refreshTabsState();
    setStatusText(t('msg.reloadedDisk'));
    refreshStats(host);
  }, [currentTabPatch, refreshStats, refreshTabsState, setDirty]);

  /** B1（SDI）：窗口内无文档时的兜底 —— 打开空白「未命名」文档。
   *  仅 dev/浏览器（无真实窗口）在关闭文档后需要；Tauri 下关闭文档 = 关窗。 */
  const ensureBlankDoc = useCallback(async (): Promise<DocumentTab> => {
    const current = docStateRef.current.doc;
    if (current !== null) return current;
    const tab = docStateRef.current.open({ path: null, title: t('doc.untitled'), content: '', dirty: false, documentId: crypto.randomUUID(), encoding: 'utf-8', eol: '\n', diskState: null });
    refreshTabsState();
    await applyTab(tab);
    return tab;
  }, [applyTab, refreshTabsState]);

  /** B1（SDI）：Tauri 下关闭当前窗口前先「武装」关闭许可 —— 已在前端完成 dirty 确认的
   *  关闭（⌘W / 删除文档后关窗）需通知 Rust 放行，避免 CloseRequested 二次拦截重复确认。 */
  const armWindowClose = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const label = getCurrentWindow().label;
      await invoke('allow_close_window', { label });
    } catch { /* 非 Tauri / 后端未提供：忽略 */ }
  }, []);

  /** B1（SDI）：关闭当前文档 = 关闭当前窗口（Typora ⌘W；mac 真值：File→Close = performClose: 关窗口）。
   *  dirty → 丢弃确认（confirmCloseDocument）；随后关闭窗口。非 Tauri（dev/浏览器）无窗口可关，
   *  回落到空白未命名文档（原「关到最后一个回落 ensureOneTab」行为）。
   *  系统关闭（红绿灯/✕）的 dirty 拦截由 Rust CloseRequested 通道承担（B1 Phase 4）。 */
  const closeCurrentWindow = useCallback(async () => {
    syncDocFromEditor();
    const active = docStateRef.current.doc;
    if (active === null) return;
    if (!confirmCloseDocument(active)) return;
    // V7-W1.1：关窗前记录路径，供 File → Reopen Closed File（⇧⌘T）恢复
    if (active.path !== null) setClosedFiles(pushClosedFile(active.path));
    const svc = windowServiceRef.current;
    if (isTauri() && svc) { await armWindowClose(); void svc.close(); return; }
    docStateRef.current.close();
    refreshTabsState();
    const next = await ensureBlankDoc();
    if (next) await applyTab(next);
  }, [applyTab, armWindowClose, confirmCloseDocument, ensureBlankDoc, refreshTabsState, syncDocFromEditor]);

  /** B1（SDI，D4=A）：系统关闭请求（mac 红绿灯 / Win ✕ 或原生 close）—— Rust
   *  CloseRequested 拦截后 emit `mellow://window-close-requested` 到此窗口。
   *  这里对当前文档做 dirty 确认：确认（或干净）→ arm 放行 + 关窗；取消 → 留在窗口。 */
  const handleSystemCloseRequest = useCallback(async () => {
    syncDocFromEditor();
    const doc = docStateRef.current.doc;
    if (doc !== null && !confirmCloseDocument(doc)) return;
    // V7-W1.1：系统关闭（红绿灯 / ✕）同样入栈，保证 ⇧⌘T 可恢复
    if (doc !== null && doc.path !== null) setClosedFiles(pushClosedFile(doc.path));
    const svc = windowServiceRef.current;
    if (isTauri() && svc) { await armWindowClose(); void svc.close(); }
  }, [armWindowClose, confirmCloseDocument, syncDocFromEditor]);

  /** 移动当前文档到其他文件夹（D1-2：Typora 文件→移到…；tab/watcher/引擎路径基准同步） */
  const handleMoveDocument = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dialog = dialogRef.current;
    const path = filePathRef.current;
    if (!svc || !dialog) return;
    if (path === null) {
      setStatusText(t('msg.renameNeedsSave'));
      return;
    }
    const target = await dialog.showDirectory();
    if (!target.ok || target.value === null) return;
    const r = await svc.move(path, target.value);
    if (!r.ok) {
      setStatusText(t('msg.moveFailed', { error: r.error.message }));
      return;
    }
    const newPath = r.value;
    filePathRef.current = newPath;
    const host = hostRef.current;
    if (host) {
      host.setDocumentPath(newPath);
      host.refreshImages();
      docStateRef.current.updateCurrent({
        ...currentTabPatch(host),
        path: newPath,
        title: newPath.split(/[\\/]/).pop() ?? newPath,
      });
      refreshTabsState();
    }
    await watchDocument(newPath);
    // 最近文件：旧路径条目替换为新路径（避免残留 missing 条目）
    setRecentFiles((prev) => {
      const next = prev.map((e) => (e.path === path ? { ...e, path: newPath } : e));
      try { localStorage.setItem(RECENT_FILES_KEY, serializeRecentFiles(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
    setStatusText(t('msg.movedTo', { value: newPath }));
    await refreshFilesSidebar();
  }, [currentTabPatch, refreshFilesSidebar, refreshTabsState, watchDocument]);

  /** 删除当前文档到系统废纸篓（D1-3：Typora 文件→删除；dirty 时警示丢弃未保存修改） */
  const handleTrashDocument = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const path = filePathRef.current;
    if (!svc || path === null) return;
    const active = docStateRef.current.doc;
    const dirty = active !== null && active.dirty;
    const message = dirty ? t('dialog.trashConfirmDirty', { path }) : t('dialog.trashConfirm', { path });
    if (!window.confirm(message)) return;
    const r = await svc.trash(path);
    if (!r.ok) {
      setStatusText(t('msg.deleteFailed', { error: r.error.message }));
      return;
    }
    setStatusText(t('msg.trashed'));
    // B1（SDI）：文档即窗口 —— 文件已删除（不走 dirty 保存确认，保存会重新创建已删文件），
    // Tauri 下关闭当前窗口；dev/浏览器回落空白未命名文档。
    if (active !== null) {
      docStateRef.current.close();
      refreshTabsState();
      const winSvc = windowServiceRef.current;
      if (isTauri() && winSvc) { await armWindowClose(); void winSvc.close(); return; }
      const next = await ensureBlankDoc();
      if (next) await applyTab(next);
    }
    await refreshFilesSidebar();
  }, [applyTab, armWindowClose, ensureBlankDoc, refreshFilesSidebar, refreshTabsState]);

  /** 字号缩放（⇧⌘0 实际大小 / ⇧⌘= 放大 / ⇧⌘- 缩小，Typora 视图菜单对齐）：
   *  读写 editor.fontSize 设置（单一真源）+ live apply；到达 min/max 后静默停。
   *  百分比换算基准 = 设置项 defaultValue（V7-W2.2 起为 TYPOGRAPHY_DEFAULTS.fontSize = 16px = 100%）。 */
  const adjustFontSize = useCallback((delta: number) => {
    const def = settingById('editor.fontSize');
    if (def === undefined) return;
    const current = readSetting(def);
    const base = typeof current === 'number' ? current : Number(def.defaultValue);
    const next = delta === 0
      ? Number(def.defaultValue)
      : Math.min(def.max ?? 32, Math.max(def.min ?? 10, base + delta));
    if (next === base) return;
    writeSetting(def, next);
    hostRef.current?.setEditorConfig('setFontSize', { fontSize: next });
    applyContentFontSize(next); // Reader 同源（见 applyContentFontSize 注释）
    const pct = Math.round((next / Number(def.defaultValue)) * 100);
    setStatusText(`${t('settings.editor.fontSize')}: ${next}px (${pct}%)`);
  }, [t]);

  /** Settings live apply（不要求重启；安全项立即生效） */
  const applySetting = useCallback((def: SettingDefinition, value: string | number | boolean) => {
    switch (def.applyCommand) {
      case 'locale.set.system': {
        const v = String(value);
        if (v === 'system' || v === 'zh-CN' || v === 'en-US') setLocaleSettingPersist(v);
        break;
      }
      case 'theme.apply.mellow-light':
        applyThemeById(String(value));
        break;
      case 'settings.editorConfig': {
        const host = hostRef.current;
        if (def.id === 'editor.fontSize') {
          const px = Number(value);
          host?.setEditorConfig('setFontSize', { fontSize: px });
          applyContentFontSize(px);
        }
        else if (def.id === 'editor.fontFamily') host?.setEditorConfig('setFontFace', { family: String(value) });
        else if (def.id === 'editor.lineNumbers') { host?.setEditorConfig('setShowLineNumbers', { enabled: Boolean(value) }); applyLineNumberPrefs(); }
        else if (def.id === 'editor.sourceLineNumbers') applyLineNumberPrefs();
        else if (def.id === 'editor.lineWrapping') host?.setEditorConfig('setLineWrapping', { enabled: Boolean(value) });
        break;
      }
      case 'view.typewriter.on':
        void dispatchCommand(value ? 'view.typewriter.on' : 'view.typewriter.off', 'menu');
        break;
      case 'view.focus.off': {
        const v = String(value);
        void dispatchCommand(v === 'line' ? 'view.focus.line' : v === 'paragraph' ? 'view.focus.paragraph' : 'view.focus.off', 'menu');
        break;
      }
      case 'settings.toolbar':
        // V7-W2.4（D-B = ①）：设置 → 外观「浮动编辑器工具栏」与 View → 工具栏同源
        // （同一 storageKey / 同一状态），故两处入口都收敛到 view.toolbar.on|off。
        void dispatchCommand(value ? 'view.toolbar.on' : 'view.toolbar.off', 'menu');
        break;
      case 'settings.wordCount':
        // V7-W2.6：字数并入标题栏（标题 effect 依赖该 state 重建窗口标题）
        setWordCountInTitle(Boolean(value));
        break;
      case 'slash.toggleEnabled':
        setSlashEnabled(Boolean(value));
        break;
      case 'settings.fileTreeOptions':
        // V7-W3.6（G7-SIDE-06）：Typora 1.14 的三项文件过滤配置 —— 显示隐藏文件 /
        // 显示非 Markdown 文件 / 自定义显示隐藏规则（glob 列表，逗号或换行分隔）。
        if (def.id === 'files.showHidden') setFileTreeOption({ showHidden: Boolean(value) });
        else if (def.id === 'files.showNonMarkdown') setFileTreeOption({ showNonMarkdown: Boolean(value) });
        else if (def.id === 'files.includeGlobs') setFileTreeOption({ includeGlobs: parseGlobList(String(value ?? '')) });
        else if (def.id === 'files.excludeGlobs') setFileTreeOption({ excludeGlobs: parseGlobList(String(value ?? '')) });
        break;
      case 'settings.sidebarMode':
        setSidebarMode(String(value) as 'files' | 'fileList' | 'outline' | 'search');
        break;
      case 'settings.image.assetDir':
        setAssetDir(String(value));
        break;
      case 'file.openUserCss':
        // 主题文件夹入口（Typora 偏好→外观；action 型设置 → 命令派发）
        void dispatchCommand('file.openUserCss');
        break;
      case 'help.cheatsheet':
        // P2-2.6：Settings 快捷键列表入口 → 快捷键速查表
        void dispatchCommand('help.cheatsheet');
        break;
      case 'updater.check':
        // P2-2.6：Settings「检查更新」→ 既有 updater.check 命令
        void dispatchCommand('updater.check');
        break;
      case 'settings.spellcheck': {
        // D1-1 拼写检查 live apply：引擎偏好 + 原生菜单 CheckMenuItem 状态同步
        const on = Boolean(value);
        hostRef.current?.setSpellcheckEnabled(on);
        if ('__TAURI_INTERNALS__' in window) {
          void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_spellcheck_state', { checked: on })).catch(() => undefined);
        }
        break;
      }
      case 'settings.smartPunctuation':
        // R2-1 智能标点 live apply（引擎 inputHandler 开关）
        hostRef.current?.setSmartPunctuationEnabled(Boolean(value));
        break;
      case 'settings.codeLineNumbers':
        // 代码块行号 live apply（Typora 偏好→Markdown；引擎行号 widget 开关）
        hostRef.current?.setCodeLineNumbersEnabled(Boolean(value));
        break;
      case 'settings.statusbar':
        setStatusbarVisible(Boolean(value));
        break;
      case 'settings.writingWidth': {
        // A1（第四轮）：写作宽度 live apply —— 经 CoreEditor setContentMaxWidth 在
        // iframe 内 .cm-content 限宽居中（PRD §18：680/860/980/Auto，默认见 TYPOGRAPHY_DEFAULTS）。
        // Auto(null) = 全宽（编辑器通栏，Typora parity 滚动条贴窗缘）。
        // V7-W2.2：同步 --mellow-writing-width，Reader 与编辑器同一宽度真源。
        const v = String(value);
        const n = Number(v);
        hostRef.current?.setEditorConfig('setContentMaxWidth', { width: v === 'auto' ? null : n });
        document.documentElement.style.setProperty('--mellow-writing-width', v === 'auto' ? 'none' : `${n}px`);
        break;
      }
      case 'settings.lineHeight': {
        // 行高：编辑器内容行高（PRD §18：1.2–2.2，默认见 TYPOGRAPHY_DEFAULTS）。
        // P2-2.1：CSS 变量只对同文档 Reader 生效；编辑器在 iframe 内读不到外层
        // document 变量，必须经 setEditorConfig('setLineHeight') 走 CoreEditor 通道。
        const lh = Number(value) || TYPOGRAPHY_DEFAULTS.lineHeight;
        document.documentElement.style.setProperty('--mellow-line-height', String(lh));
        hostRef.current?.setEditorConfig('setLineHeight', { lineHeight: lh });
        break;
      }
      case 'settings.autosave':
        // V7-W5：同步定时器启停（写盘后再更新 state，保证与持久化一致）
        setAutosaveEnabled(Boolean(value));
        setStatusText(Boolean(value) ? t('msg.autosaveOn') : t('msg.autosaveOff'));
        break;
      case 'settings.autosaveTimer': {
        // V7-W5（G7-FEAT-03）：间隔变更立即重排定时器（Typora 需重启 / 手改 JSON）
        const minutes = parseAutosaveMinutes(String(value));
        setAutosaveMinutes(minutes);
        setStatusText(t('msg.autosaveTimer', { minutes: String(minutes) }));
        break;
      }
      case 'settings.reopenLast':
        // 下次启动生效（当前会话不受影响）
        setStatusText(Boolean(value) ? t('msg.reopenLastOn') : t('msg.reopenLastOff'));
        break;
      case 'settings.engineFeature': {
        // 语法特性开关（PRD §94）：重建 JSON → mellow.engine.features（bundle loader 读取）
        // V5-C4：无 localStorage 键 = 从未设置 → 默认开启（此前 `=== '1'` 让新装用户全量默认关闭）
        const keys = ['highlight', 'supSub', 'emoji', 'alerts', 'math', 'mermaid', 'toc', 'footnote', 'wikilink', 'html', 'yaml'];
        const features: Record<string, boolean> = {};
        for (const k of keys) {
          let value = true;
          try {
            const raw = localStorage.getItem(`mellow.engine.features.${k}`);
            if (raw !== null) value = raw === '1';
          } catch { value = true; }
          features[k] = value;
        }
        try { localStorage.setItem('mellow.engine.features', JSON.stringify(features)); } catch { /* noop */ }
        // PRD §K.2：语法开关在编辑器加载时生效 → 提供「重新加载编辑器」动作（会话经 localStorage 恢复）
        setToast({ message: t('settings.markdownReloadHint'), action: { label: t('settings.markdownReload'), run: () => window.location.reload() } });
        break;
      }
      default:
        break;
    }
  }, [applyLineNumberPrefs, applyThemeById, dispatchCommand, setAssetDir, setFileTreeOption, setLocaleSettingPersist, setSidebarMode, setSlashEnabled]);
  // PRD §101 Auto Save：窗口失焦时保存 dirty 文档（默认开启，设置可关闭）
  useEffect(() => {
    const onBlur = () => { void maybeAutoSaveRef.current?.(); };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);
  // 外部打开（CLI 参数 / Finder「打开方式」odoc）：Rust 侧 emit mellow://open-file
  // PRD §80 CLI 模式：--reader 打开后进 Reader；--source 打开后切源码模式
  const openPathWithMode = useCallback((req: { path: string; mode?: string }) => {
    const key = `${req.mode ?? 'normal'}\u0000${req.path}`;
    if (externalOpenInflightRef.current.has(key)) return;
    externalOpenInflightRef.current.add(key);
    void (async () => {
      try {
        await editorStartupReadyRef.current;
        await openPathInTab(req.path);
        if (req.mode === 'reader') openReader();
        else if (req.mode === 'source') engineSourceToggle();
      } finally {
        externalOpenInflightRef.current.delete(key);
      }
    })();
  }, [engineReadonlyToggle, engineSourceToggle, openPathInTab, openReader]);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<{ path: string; mode?: string }>('mellow://open-file', (e) => { openPathWithMode(e.payload); }))
      .then((fn) => { if (cancelled) fn(); else unlisten = fn; })
      .catch(() => { /* 非 Tauri 环境 */ });
    // 前端就绪前的事件已存入 Rust state：mount 后主动拉取，保证不丢
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<{ path: string; mode?: string } | null>('pending_open_path'))
      .then((p) => { if (p && !cancelled) openPathWithMode(p); })
      .catch(() => { /* 非 Tauri 环境 */ });
    return () => { cancelled = true; unlisten?.(); };
  }, [openPathWithMode]);
  // B1（SDI，D4=A）：Rust 侧 CloseRequested 拦截（红绿灯/✕/原生 close）→ 此监听做
  // dirty 确认。窗口自身发起的关闭（⌘W）已在 closeCurrentWindow 内 arm，不经过此事件。
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen('mellow://window-close-requested', () => { void handleSystemCloseRequest(); }))
      .then((fn) => { if (cancelled) fn(); else unlisten = fn; })
      .catch(() => { /* 非 Tauri 环境 */ });
    return () => { cancelled = true; unlisten?.(); };
  }, [handleSystemCloseRequest]);
  // CoreEditor 位于 iframe 中，编辑事件经 Tauri bridge 回到桌面壳。不能只依赖
  // window keydown：IME、粘贴、拖放和输入法提交都可能绕过该路径。
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<{ moduleName: string; methodName: string; parameters: string }>('mellow://bridge', (e) => {
        if (e.payload.moduleName !== 'core') return;
        if (e.payload.methodName === 'notifyCompositionEnded') {
          hostRef.current?.emitExternalEvent({
            type: 'viewUpdate', contentEdited: false, isDirty: true, compositionEnded: true,
          });
          return;
        }
        if (e.payload.methodName !== 'notifyViewDidUpdate') return;
        let parameters: { contentEdited?: unknown; isDirty?: unknown; compositionEnded?: unknown };
        try {
          parameters = JSON.parse(e.payload.parameters) as { contentEdited?: unknown; isDirty?: unknown; compositionEnded?: unknown };
        } catch {
          return;
        }
        hostRef.current?.emitExternalEvent({
          type: 'viewUpdate',
          contentEdited: parameters.contentEdited === true,
          isDirty: parameters.isDirty === true,
          // 老 bundle 未包含该字段时，保持原有非合成态行为。
          compositionEnded: parameters.compositionEnded !== false,
        });
      }))
      .then((fn) => { if (cancelled) fn(); else unlisten = fn; })
      .catch(() => { /* 非 Tauri 环境 */ });
    return () => { cancelled = true; unlisten?.(); };
  }, []);
  // P1-1.3：菜单 checkState 变更 tick —— spellcheck/smartPunct 写入 localStorage 设置
  // （非 React state），toggle 后自增以触发 syncNativeMenu 重建原生菜单。
  const [menuCheckTick, setMenuCheckTick] = useState(0);
  useEffect(() => {
    const registry = new CommandRegistry();
    const always = () => true;
    const hasWorkspace = () => fileTreeRoot !== null;
    // P1-1.7：剪贴板命令的可用性。右键菜单与菜单/快捷键共用同一 enabledWhen（§7.4 硬规则 5/7），
    // 避免「菜单里可点、快捷键无效」或反之的双真源问题。
    const hasSelection = () => hostRef.current?.getState().hasSelection ?? false;
    const commands: Command[] = [
      { id: 'extensions.list', localizedTitle: { zh: '扩展列表', en: 'Extensions List' }, category: 'extension', context: { scope: 'global' }, enabled: always, execute: () => {
        const reg = extensionRegistryRef.current;
        if (reg === null) return;
        const list = reg.list().map((e) => `${e.enabled ? '✅' : '⛔'} ${e.name} (${e.id}) v${e.version}${e.setupError !== undefined ? ` [${e.setupError}]` : ''}`).join('；');
        setStatusText(`扩展: ${list === '' ? '无' : list}`);
      } },
      // B1（SDI，Typora 对齐）：新建 ⌘N/Ctrl+N = 新窗口空白文档（Typora 单文档窗口）；
      // 「新建标签页 ⌘T / Ctrl+Alt+T」随多标签能力移除。file.new 在非 Tauri（dev/浏览器）回落 handleNew。
      { id: 'file.new', localizedTitle: { zh: '新建', en: 'New' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => {
        if (isTauri()) {
          void import('@tauri-apps/api/core').then(({ invoke }) => invoke('new_window')).catch(() => setToast({ message: t('window.newWindow.unavailable') }));
        } else {
          void handleNew();
        }
      } },
      { id: 'file.newWindow', localizedTitle: { zh: '新建窗口', en: 'New Window' }, category: 'file', context: { scope: 'global' }, enabled: () => isTauri(), execute: () => {
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('new_window')).catch(() => setToast({ message: t('window.newWindow.unavailable') }));
      } },
      // P1-1.9：「在文库中显示 / 在文件树中显示」（Typora 文件菜单，§7.2 第 11/12 项；
      // V5-A1 侧栏仅树形，Reveal in Library 语义等同切到文件树）
      { id: 'file.revealInFileList', localizedTitle: { zh: '在文档列表中显示', en: 'Reveal in Library' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => showSidebarAs('fileList') },
      { id: 'file.revealInFileTree', localizedTitle: { zh: '在文件树中显示', en: 'Reveal in File Tree' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => showSidebarAs('files') },
      // V7-W5（G7-FEAT-02）：macOS 走 NSApplication.runPageLayout: 系统面板；
      // Windows / Linux 的 Tauri 无等价原生 API（Rust 侧返回 Err），改为**可操作提示**
      // 而非「点了弹错」——告知用户在「打印…」对话框中设置纸张与边距。
      { id: 'file.pageSetup', localizedTitle: { zh: '页面设置…', en: 'Page Setup…' }, category: 'file', context: { scope: 'document' }, enabled: () => isTauri(), execute: () => {
        if (!platformMac) {
          setToast({ message: t('file.pageSetup.unsupportedHint') });
          return;
        }
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('page_setup')).catch(() => setToast({ message: t('file.pageSetup.unavailable') }));
      } },
      { id: 'file.open', localizedTitle: { zh: '打开…', en: 'Open…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => void handleOpen() },
      // V7-W1.1：Typora File → Reopen Closed File（⇧⌘T）；栈为 app 级 localStorage
      { id: 'file.reopenClosed', localizedTitle: { zh: '重新打开关闭的文件', en: 'Reopen Closed File' }, category: 'file', context: { scope: 'global' }, enabled: () => closedFiles.length > 0, execute: () => void handleReopenClosed() },
      { id: 'file.save', localizedTitle: { zh: '保存', en: 'Save' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleSave() },
      { id: 'file.saveAs', localizedTitle: { zh: '另存为…', en: 'Save As…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleSaveAs() },
      { id: 'document.rename', localizedTitle: { zh: '重命名…', en: 'Rename…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleRenameDocument() },
      // D1-2/D1-3 文档操作（Typora 文件→移到…/删除）
      { id: 'file.moveTo', localizedTitle: { zh: '移到…', en: 'Move to…' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => void handleMoveDocument() },
      { id: 'file.trash', localizedTitle: { zh: '删除', en: 'Delete' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => void handleTrashDocument() },
      // D1-5 快照文件夹入口（替代 macOS Versions 版本复原：崩溃恢复快照可在 Finder 查看）
      { id: 'file.openSnapshotsFolder', localizedTitle: { zh: '打开快照文件夹…', en: 'Open Snapshots Folder…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => {
        if (!isTauri()) return;
        void import('@tauri-apps/api/path').then(async ({ appDataDir, join }) => {
          const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
          const dir = await appDataDir();
          const p = await join(dir, 'recovery');
          await revealItemInDir(p).catch(() => undefined);
        }).catch(() => undefined);
      } },
      // B1（SDI）：⌘W = 关闭当前文档 = 关闭当前窗口（macOS Typora 真值：File→Close=performClose:）。
      // tabs.closeOthers/closeRight/reopenClosed/next/prev/showAll 随多标签能力一并移除。
      { id: 'file.closeWindow', localizedTitle: { zh: '关闭窗口', en: 'Close Window' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void closeCurrentWindow() },
      // B2 文件菜单补全（Typora 对齐：全部关闭 / 保存全部 / 从磁盘重新加载）
      // B1：file.closeAll 语义=关闭全部窗口（mac Typora 无此菜单项，见 menuSchema 平台条件化）。
      { id: 'file.closeAll', localizedTitle: { zh: '全部关闭', en: 'Close All' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void closeCurrentWindow() },
      { id: 'file.saveAll', localizedTitle: { zh: '保存全部打开的文件…', en: 'Save All Open Files…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleSaveAll() },
      { id: 'file.reloadFromDisk', localizedTitle: { zh: '从磁盘重新加载', en: 'Reload from Disk' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => void handleReloadFromDisk() },
      { id: 'workspace.openFolder', localizedTitle: { zh: '打开文件夹…', en: 'Open Folder…' }, category: 'workspace', context: { scope: 'global' }, enabled: always, execute: () => void chooseFileTreeRoot() },
      { id: 'workspace.refresh', localizedTitle: { zh: '刷新文件', en: 'Refresh Files' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void refreshFilesSidebar() },
      { id: 'quickOpen.open', localizedTitle: { zh: 'Quick Open', en: 'Quick Open' }, category: 'navigation', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void openQuickOpen() },
      { id: 'search.global', localizedTitle: { zh: '全局搜索', en: 'Global Search' }, category: 'search', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => openGlobalSearch() },
      { id: 'view.focus.cycle', localizedTitle: { zh: '切换 Focus Mode', en: 'Toggle Focus Mode' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => cycleFocusMode() },
      { id: 'view.focus.off', localizedTitle: { zh: 'Focus Mode：关闭', en: 'Focus Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('off') },
      { id: 'view.focus.line', localizedTitle: { zh: 'Focus Mode：当前行', en: 'Focus Mode: Current Line' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('line') },
      { id: 'view.focus.paragraph', localizedTitle: { zh: 'Focus Mode：当前段落', en: 'Focus Mode: Current Paragraph' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('paragraph') },
      { id: 'view.typewriter.cycle', localizedTitle: { zh: '切换 Typewriter Mode', en: 'Toggle Typewriter Mode' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => toggleTypewriter() },
      { id: 'view.source.toggle', localizedTitle: { zh: '源码模式', en: 'Source Mode' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => engineSourceToggle() },
      { id: 'view.readonly.toggle', localizedTitle: { zh: '只读模式', en: 'Readonly Mode' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => engineReadonlyToggle() },
      { id: 'view.zoomReset', localizedTitle: { zh: '实际大小', en: 'Actual Size' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(0) },
      { id: 'view.zoomIn', localizedTitle: { zh: '放大', en: 'Zoom In' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(1) },
      { id: 'view.zoomOut', localizedTitle: { zh: '缩小', en: 'Zoom Out' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(-1) },
      { id: 'view.typewriter.on', localizedTitle: { zh: 'Typewriter Mode：开启', en: 'Typewriter Mode: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !typewriterEnabled, execute: () => setTypewriterMode(true) },
      { id: 'view.typewriter.off', localizedTitle: { zh: 'Typewriter Mode：关闭', en: 'Typewriter Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => typewriterEnabled, execute: () => setTypewriterMode(false) },
      { id: 'view.toolbar.toggle', localizedTitle: { zh: '工具栏', en: 'Toolbar' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => toggleSelectionToolbar() },
      // V7-W1.6：状态栏开关（Typora Win/Linux 显示菜单「状态栏」，checkState 与 Settings 同源）
      { id: 'view.statusbar.toggle', localizedTitle: { zh: '状态栏', en: 'Status Bar' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => {
        setStatusbarVisible((v) => {
          const next = !v;
          try { localStorage.setItem('mellow.statusbar.visible', next ? '1' : '0'); } catch { /* noop */ }
          return next;
        });
      } },
      // R2-2 字数统计窗口（Typora 视图→字数统计窗口）
      { id: 'view.wordCount', localizedTitle: { zh: '字数统计窗口', en: 'Word Count Window' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => {
        setWordCountOpen((v) => !v);
        const host = hostRef.current;
        if (host !== null) refreshStats(host);
      } },
      { id: 'view.toolbar.on', localizedTitle: { zh: '格式工具栏：启用', en: 'Format Toolbar: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(true) },
      { id: 'view.toolbar.off', localizedTitle: { zh: '格式工具栏：禁用', en: 'Format Toolbar: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(false) },
      { id: 'reader.open', localizedTitle: { zh: '用 Reader 打开', en: 'Open in Reader' }, category: 'view', context: { scope: 'document' }, enabled: () => !readerOpen && docStateRef.current.doc !== null, execute: () => openReader() },
      { id: 'reader.openInEditor', localizedTitle: { zh: '用编辑器打开', en: 'Open in Editor' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => closeReader() },
      { id: 'reader.zoomIn', localizedTitle: { zh: 'Reader 放大', en: 'Reader Zoom In' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom + 0.1) },
      { id: 'reader.zoomOut', localizedTitle: { zh: 'Reader 缩小', en: 'Reader Zoom Out' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom - 0.1) },
      { id: 'reader.zoomReset', localizedTitle: { zh: 'Reader 重置缩放', en: 'Reader Reset Zoom' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(1) },
      { id: 'reader.print', localizedTitle: { zh: '打印 Reader', en: 'Print Reader' }, category: 'file', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => { void invoke('print_window').catch(() => window.print()); } },
      // RC F2：打印入口（对齐 Typora Cmd+P；golden journey #18）
      { id: 'file.print', localizedTitle: { zh: '打印…', en: 'Print…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => { void invoke('print_window').catch(() => window.print()); } },
      { id: 'file.openWith', localizedTitle: { zh: '打开方式…', en: 'Open With…' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => openOpenWith() },
      { id: 'file.info', localizedTitle: { zh: '文件信息', en: 'File Info' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => openFileInfo() },
      { id: 'file.openUserCss', localizedTitle: { zh: '打开用户 CSS（appData/user.css）', en: 'Open User CSS (appData/user.css)' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => {
        if (!isTauri()) return;
        void import('@tauri-apps/api/path').then(async ({ appDataDir, join }) => {
          const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
          const dir = await appDataDir();
          const p = await join(dir, 'user.css');
          await revealItemInDir(p).catch(() => undefined);
        }).catch(() => undefined);
      } },
      // RC F6：导出 HTML（PRD §73）；D2 增无样式 HTML（Typora 导出子菜单对齐）
      { id: 'export.html', localizedTitle: { zh: '导出 HTML…', en: 'Export HTML…' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void handleExportHtml() },
      { id: 'export.htmlPlain', localizedTitle: { zh: '导出 HTML（无样式）…', en: 'Export HTML (without styles)…' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void handleExportHtmlPlain() },
      // D2：pandoc 导出格式全量（Typora 导出子菜单；表定义于 handleExportPandoc 侧）
      ...PANDOC_EXPORT_COMMANDS.map(({ id, format, ext, zh, en }) => ({
        id,
        localizedTitle: { zh, en },
        category: 'file',
        context: { scope: 'document' as const },
        enabled: () => docStateRef.current.doc !== null,
        execute: () => void handleExportPandoc(format, ext),
      })),
      // D2：使用上一次设置导出（Typora ⌃E）
      { id: 'export.repeat', localizedTitle: { zh: '使用上一次设置导出', en: 'Export with Last Settings' }, category: 'file', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+E' }, enabled: () => docStateRef.current.doc !== null, execute: () => void handleExportRepeat() },
      // D2：导入（Typora File→Import；pandoc → Markdown 新标签页）
      { id: 'file.import', localizedTitle: { zh: '导入…', en: 'Import…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => void handleImportDocument() },
      // 导出图片 PNG/JPEG（PRD §74：width / quality / long-image protection）
      { id: 'export.image', localizedTitle: { zh: '导出图片（PNG/JPEG）…', en: 'Export Image (PNG/JPEG)…' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void handleExportImage() },
      // RC F1：PDF 导出（golden journey #19）
      { id: 'export.pdf', localizedTitle: { zh: '导出 PDF…', en: 'Export PDF…' }, category: 'file', context: { scope: 'document' }, enabled: () => docStateRef.current.doc !== null, execute: () => void handleExportPdf() },
      { id: 'image.moveAll', localizedTitle: { zh: '图片：移动全部到 asset 目录', en: 'Images: Move All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('moveAll') },
      { id: 'image.copyAll', localizedTitle: { zh: '图片：复制全部到 asset 目录', en: 'Images: Copy All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('copyAll') },
      { id: 'image.downloadRemote', localizedTitle: { zh: '图片：下载远程到 asset 目录', en: 'Images: Download Remote' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('downloadRemote') },
      { id: 'image.uploadAll', localizedTitle: { zh: '图片：上传图片', en: 'Images: Upload All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('uploadAll') },
      // V7-W1.7：Typora 格式 → 图像 → 插入本地图片…（文件选择器 → 光标处插入图片语法）
      { id: 'image.insertLocal', localizedTitle: { zh: '插入本地图片…', en: 'Insert Local Images…' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void insertLocalImage() },
      { id: 'image.setAssetDir', localizedTitle: { zh: '图片：设置 asset 目录…', en: 'Images: Set Asset Directory…' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => { const v = window.prompt(t('prompt.assetDir'), assetDir); if (v !== null && v.trim() !== '') setAssetDir(v.trim()); } },
      { id: 'window.minimize', localizedTitle: { zh: '最小化窗口', en: 'Minimize Window' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.minimize(); } },
      { id: 'window.maximizeToggle', localizedTitle: { zh: '最大化 / 还原窗口', en: 'Toggle Maximize' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.toggleMaximize(); } },
      { id: 'window.fullscreen', localizedTitle: { zh: '切换全屏', en: 'Toggle Fullscreen' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.isFullscreen().then((r) => { if (r.ok) void windowServiceRef.current?.setFullscreen(!r.value); }); } },
      // B2 显示菜单补全（Typora 对齐：保持窗口在最前端，toggle）
      { id: 'window.alwaysOnTop', localizedTitle: { zh: '保持窗口在最前端', en: 'Keep Window on Top' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.isAlwaysOnTop().then((r) => { if (r.ok) void windowServiceRef.current?.setAlwaysOnTop(!r.value); }); } },
      { id: 'window.close', localizedTitle: { zh: '关闭窗口', en: 'Close Window' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.close(); } },
      { id: 'file.revealInFinder', localizedTitle: { zh: '在 Finder 中显示', en: 'Reveal in Finder' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => { if (filePathRef.current !== null) void handleTreeReveal(filePathRef.current); } },
      { id: 'commandPalette.open', localizedTitle: { zh: '命令面板', en: 'Command Palette' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteVisible(true); } },
      { id: 'settings.open', localizedTitle: { zh: '设置…', en: 'Settings…' }, category: 'system', shortcut: { mac: 'Cmd+,', winLinux: 'Ctrl+,' }, context: { scope: 'global' }, enabled: always, execute: () => setSettingsOpen(true) },
      { id: 'theme.system', localizedTitle: { zh: '主题：跟随系统', en: 'Theme: System' }, category: 'view', context: { scope: 'global' }, enabled: () => themeSettings.mode !== 'system', execute: () => setThemeSettingsAndPersist({ ...themeSettings, mode: 'system' }) },
      { id: 'theme.cycle', localizedTitle: { zh: '主题：下一个', en: 'Theme: Next' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { const all = allThemes(); const next = all[(all.findIndex((t) => t.id === activeTheme.id) + 1) % all.length]; applyThemeById(next.id); } },
      // Typora 主题机制对标（V4 §7.3）：打开主题文件夹（appData/themes，投放 *.css 即成为主题）
      { id: 'theme.openFolder', localizedTitle: { zh: '打开主题文件夹…', en: 'Open Themes Folder…' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void openThemesFolder(); } },
      // V7-W1.11：Typora 主题菜单「获取主题」（官方 Theme Gallery 入口）
      { id: 'theme.getThemes', localizedTitle: { zh: '获取主题…', en: 'Get Themes…' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(THEME_GALLERY_URL); } },
      { id: 'locale.set.zh-CN', localizedTitle: { zh: '语言：简体中文', en: 'Language: 简体中文' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'zh-CN', execute: () => setLocaleSettingPersist('zh-CN') },
      { id: 'locale.set.en-US', localizedTitle: { zh: '语言：English', en: 'Language: English' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'en-US', execute: () => setLocaleSettingPersist('en-US') },
      { id: 'locale.set.system', localizedTitle: { zh: '语言：跟随系统', en: 'Language: Follow System' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'system', execute: () => setLocaleSettingPersist('system') },
      { id: 'slash.open', localizedTitle: { zh: 'Slash 命令', en: 'Slash Commands' }, category: 'system', context: { scope: 'document' }, enabled: always, execute: () => openSlashUi() },
      { id: 'slash.toggleEnabled', localizedTitle: { zh: 'Slash Commands：启用/禁用', en: 'Slash Commands: Toggle' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => toggleSlashEnabled() },
      { id: 'insert.heading', localizedTitle: { zh: '标题', en: 'Heading' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['h1', 'bt'] } }, enabled: always, execute: () => replaceSlashTrigger('# ') },
      { id: 'insert.list', localizedTitle: { zh: '列表', en: 'List' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['ul', 'lb'] } }, enabled: always, execute: () => replaceSlashTrigger('- ') },
      { id: 'insert.task', localizedTitle: { zh: '任务', en: 'Task' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['todo', 'rw'] } }, enabled: always, execute: () => replaceSlashTrigger('- [ ] ') },
      { id: 'insert.quote', localizedTitle: { zh: '引用', en: 'Quote' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['blockquote', 'yy'] } }, enabled: always, execute: () => replaceSlashTrigger('> ') },
      { id: 'insert.table', localizedTitle: { zh: '表格', en: 'Table' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['bg'] } }, enabled: always, execute: () => replaceSlashTrigger('\n|  |  |\n|---|---|\n|  |  |') },
      { id: 'insert.code', localizedTitle: { zh: '代码块', en: 'Code Block' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['fence', 'dm'] } }, enabled: always, execute: () => replaceSlashTrigger('```\n\n```') },
      { id: 'insert.math', localizedTitle: { zh: '数学公式', en: 'Math' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['formula', 'sx'] } }, enabled: always, execute: () => replaceSlashTrigger('$$\n\n$$') },
      { id: 'insert.mermaid', localizedTitle: { zh: 'Mermaid 图表', en: 'Mermaid Diagram' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['diagram', 'tt'] } }, enabled: always, execute: () => replaceSlashTrigger('```mermaid\ngraph TD\n  A --> B\n```') },
      { id: 'insert.alert', localizedTitle: { zh: '提示框', en: 'Alert' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['note', 'jg'] } }, enabled: always, execute: () => replaceSlashTrigger('> [!NOTE]\n> ') },
      { id: 'insert.image', localizedTitle: { zh: '图片', en: 'Image' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['img', 'tp'] } }, enabled: always, execute: () => replaceSlashTrigger('![]( )') },
      { id: 'insert.toc', localizedTitle: { zh: '目录', en: 'Table of Contents' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['toc', 'ml'] } }, enabled: always, execute: () => replaceSlashTrigger('\n\n[toc]\n\n') },
      // B2 段落菜单补全：警告框 5 类（Typora「段落 → 警告框」子菜单，GFM alert）
      { id: 'alert.note', localizedTitle: { zh: '提醒内容', en: 'Note' }, category: 'insert', context: { scope: 'document' }, enabled: always, execute: () => replaceSlashTrigger('> [!NOTE]\n> ') },
      { id: 'alert.tip', localizedTitle: { zh: '建议内容', en: 'Tip' }, category: 'insert', context: { scope: 'document' }, enabled: always, execute: () => replaceSlashTrigger('> [!TIP]\n> ') },
      { id: 'alert.important', localizedTitle: { zh: '重要内容', en: 'Important' }, category: 'insert', context: { scope: 'document' }, enabled: always, execute: () => replaceSlashTrigger('> [!IMPORTANT]\n> ') },
      { id: 'alert.warning', localizedTitle: { zh: '警告内容', en: 'Warning' }, category: 'insert', context: { scope: 'document' }, enabled: always, execute: () => replaceSlashTrigger('> [!WARNING]\n> ') },
      { id: 'alert.caution', localizedTitle: { zh: '注意内容', en: 'Caution' }, category: 'insert', context: { scope: 'document' }, enabled: always, execute: () => replaceSlashTrigger('> [!CAUTION]\n> ') },
      { id: 'fileTree.newFile', localizedTitle: { zh: '新文件', en: 'New File' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeNewFile() },
      { id: 'fileTree.newFolder', localizedTitle: { zh: '新文件夹', en: 'New Folder' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeNewFolder() },
      { id: 'fileTree.rename', localizedTitle: { zh: '重命名', en: 'Rename' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeRename() },
      { id: 'fileTree.duplicate', localizedTitle: { zh: '复制', en: 'Duplicate' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeDuplicate() },
      { id: 'fileTree.move', localizedTitle: { zh: '移动', en: 'Move' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeMove() },
      { id: 'fileTree.trash', localizedTitle: { zh: '移到回收站', en: 'Move to Trash' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeTrash() },
      { id: 'fileTree.undo', localizedTitle: { zh: '撤销文件操作', en: 'Undo File Operation' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeUndo() },
      { id: 'fileTree.copyPath', localizedTitle: { zh: '复制路径', en: 'Copy Path' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeCopyPath(false) },
      { id: 'fileTree.copyRelativePath', localizedTitle: { zh: '复制相对路径', en: 'Copy Relative Path' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeCopyPath(true) },
      { id: 'updater.check', localizedTitle: { zh: '检查更新', en: 'Check for Updates' }, category: 'app', context: { scope: 'global' }, enabled: () => isTauri(), execute: () => void runUpdateCheck({ manual: true }) },
      // B2 文件菜单补全：清除最近文件（「打开最近文件」子菜单）
      { id: 'recent.clear', localizedTitle: { zh: '清除最近文件', en: 'Clear Recent Files' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => { setRecentFiles([]); try { localStorage.removeItem(RECENT_FILES_KEY); } catch { /* noop */ } } },
      // 编辑：查找 / 替换（Typora 对齐；Ctrl+H 由引擎 keymap 处理）
      { id: 'search.find', localizedTitle: { zh: '查找…', en: 'Find…' }, category: 'edit', context: { scope: 'global' }, enabled: always, execute: () => engineSearch('find') },
      // Typora：替换 ⌥⌘F（⌘H 与 macOS 系统隐藏冲突，作为别名兜底）；Win/Linux Ctrl+H
      { id: 'search.replace', localizedTitle: { zh: '替换…', en: 'Replace…' }, category: 'edit', context: { scope: 'global' }, shortcutAliases: [{ mac: 'Cmd+H' }], enabled: always, execute: () => engineSearch('replace') },
      // B2 编辑菜单补全（Typora 对齐：查找下一个/上一个 ⌘G / ⇧⌘G）
      { id: 'search.findNext', localizedTitle: { zh: '查找下一个', en: 'Find Next' }, category: 'edit', context: { scope: 'global' }, shortcutAliases: [{ winLinux: 'F3' }, { mac: 'F3' }], enabled: always, execute: () => engineSearch('findNext') },
      { id: 'search.findPrevious', localizedTitle: { zh: '查找上一个', en: 'Find Previous' }, category: 'edit', context: { scope: 'global' }, shortcutAliases: [{ winLinux: 'Shift+F3' }, { mac: 'Shift+F3' }], enabled: always, execute: () => engineSearch('findPrevious') },
      // B2 编辑菜单补全（Typora 对齐：复制为 Markdown ⇧⌘C / 粘贴为纯文本 ⇧⌘V）
      { id: 'edit.copyMarkdown', localizedTitle: { zh: '复制为 Markdown', en: 'Copy as Markdown' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('copyMarkdown') },
      { id: 'edit.pastePlain', localizedTitle: { zh: '粘贴为纯文本', en: 'Paste as Plain Text' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('pastePlain') },
      // ⇧⌘⌫ 删除行（Typora 编辑→删除行，引擎 applyDeleteLine）
      { id: 'edit.deleteLine', localizedTitle: { zh: '删除行', en: 'Delete Line' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('deleteLine') },
      // D1-4 选择命令（Typora 编辑→选择：⌘L 行 / ⌥⌘P 段落或块）
      { id: 'edit.selectLine', localizedTitle: { zh: '选择行', en: 'Select Line' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.selectLine(); } },
      { id: 'edit.selectParagraph', localizedTitle: { zh: '选择段落或块', en: 'Select Paragraph or Block' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.selectParagraph(); } },
      // D3 选择子菜单补全（Typora 编辑→选择）
      { id: 'edit.selectWord', localizedTitle: { zh: '选中当前词', en: 'Select Word' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.selectWord(); } },
      { id: 'edit.selectFormatSpan', localizedTitle: { zh: '选中当前格式文本', en: 'Select Format Span' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.selectFormatSpan(); } },
      { id: 'edit.gotoDocStart', localizedTitle: { zh: '跳转到文首', en: 'Go to Document Start' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.gotoDocStart(); } },
      { id: 'edit.gotoDocEnd', localizedTitle: { zh: '跳转到文末', en: 'Go to Document End' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.gotoDocEnd(); } },
      { id: 'edit.gotoSelection', localizedTitle: { zh: '跳转到所选内容', en: 'Go to Selection' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.gotoSelection(); } },
      { id: 'edit.gotoLineStart', localizedTitle: { zh: '跳转到行首', en: 'Go to Line Start' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.gotoLineStart(); } },
      { id: 'edit.gotoLineEnd', localizedTitle: { zh: '跳转到行尾', en: 'Go to Line End' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.gotoLineEnd(); } },
      // D3 删除范围子菜单（Typora 编辑→删除范围）
      { id: 'edit.deleteParagraph', localizedTitle: { zh: '删除块', en: 'Delete Block' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.deleteParagraph(); } },
      { id: 'edit.deleteFormatSpan', localizedTitle: { zh: '删除当前格式文本', en: 'Delete Format Span' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.deleteFormatSpan(); } },
      { id: 'edit.deleteWord', localizedTitle: { zh: '删除当前词', en: 'Delete Word' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.deleteWord(); } },
      // V7-W1 后续批次（G7-MENU-06）：Typora Edit 菜单顶部的「新段落 / 新行」。
      // 语义按官方 Shortcut Keys 表：New Paragraph = 真分段（\n\n）；New Line = 段内软换行（\n）。
      // 刻意**不改 Enter 键本身** —— Mellow 的 Enter 目前产出单 \n（= New Line 语义），
      // 改动输入路径风险过高，故只把两项能力经菜单显式暴露。
      { id: 'edit.newParagraph', localizedTitle: { zh: '新段落', en: 'New Paragraph' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('newParagraph') },
      { id: 'edit.newLine', localizedTitle: { zh: '新行', en: 'New Line' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('newLine') },
      // D3 上移/下移该行（Typora 编辑菜单 ⌥↑/⌥↓）
      { id: 'edit.moveLineUp', localizedTitle: { zh: '上移该行', en: 'Move Line Up' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.moveLineUp(); } },
      { id: 'edit.moveLineDown', localizedTitle: { zh: '下移该行', en: 'Move Line Down' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { hostRef.current?.moveLineDown(); } },
      // D3 复制/拷贝（Typora 编辑菜单：拷贝图片 / 复制为纯文本 / 复制为 HTML 代码）
      // P1-1.7：右键菜单的剪切/复制/粘贴与菜单、快捷键共用同一命令入口
      { id: 'edit.cut', localizedTitle: { zh: '剪切', en: 'Cut' }, category: 'edit', shortcut: { mac: 'Cmd+X', winLinux: 'Ctrl+X' }, context: { scope: 'selection' }, enabled: hasSelection, execute: () => engineEditAction('cut') },
      { id: 'edit.copy', localizedTitle: { zh: '拷贝', en: 'Copy' }, category: 'edit', shortcut: { mac: 'Cmd+C', winLinux: 'Ctrl+C' }, context: { scope: 'selection' }, enabled: hasSelection, execute: () => engineEditAction('copy') },
      { id: 'edit.paste', localizedTitle: { zh: '粘贴', en: 'Paste' }, category: 'edit', shortcut: { mac: 'Cmd+V', winLinux: 'Ctrl+V' }, context: { scope: 'document' }, enabled: always, execute: () => engineEditAction('paste') },
      { id: 'edit.copyImage', localizedTitle: { zh: '拷贝图片', en: 'Copy Image' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => void handleCopyImage() },
      // P1-1.7：公式块「复制为 Tex 代码」——对应 Typora 1.14.9 mathBlock.copyAsTex()
      // 证据：Typora 1.14.9 appsrc/main.js getMenuItemsForMac，math_block 分支条目为
      // ["|","edit","copyMathBlock","download-math","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete"]，
      // copyMathBlock 的动作为 mathBlock.copyAsTex() / copyAsMathML() / copyAsImage()；文案取自官方 Menu.json「Copy as Tex」=「复制为 Tex 代码」。
      { id: 'math.copyAsTex', localizedTitle: { zh: '复制为 Tex 代码', en: 'Copy as Tex' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { engineCopySource('math'); } },
      // P1-1.7：图表源码复制 —— 属 B（Better）增强，Typora 1.14.9 图表的右键条目为
      // ["|","edit","copy-as-image","download-diagram","code-tools","|",...]，无源码复制项。
      // 因此只在命令面板提供，不进右键菜单，避免与 Typora parity 混淆。
      { id: 'mermaid.copySource', localizedTitle: { zh: '复制图表源码', en: 'Copy Diagram Source' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { engineCopySource('mermaid'); } },
      // C1：代码工具（Typora code-tools 子菜单：Auto Indent Whole/Selected Code + delete-fences + 前后插入段落）
      { id: 'paragraph.autoIndentCodeBlock', localizedTitle: { zh: '整体自动缩进', en: 'Auto Indent Whole Code' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('codeTool', 'autoIndentAll'); } },
      { id: 'paragraph.autoIndentSelection', localizedTitle: { zh: '所选内容自动缩进', en: 'Auto Indent Selected Code' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('codeTool', 'autoIndentSelected'); } },
      { id: 'paragraph.deleteFences', localizedTitle: { zh: '删除围栏', en: 'Delete Fences' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('codeTool', 'deleteFences'); } },
      { id: 'paragraph.insertParagraphBefore', localizedTitle: { zh: '在上方插入段落', en: 'Insert Paragraph Before' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('codeTool', 'insertParagraphBefore'); } },
      { id: 'paragraph.insertParagraphAfter', localizedTitle: { zh: '在下方插入段落', en: 'Insert Paragraph After' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('codeTool', 'insertParagraphAfter'); } },
      // C1：公式块右键（Typora copyMathBlock 子菜单 + download-math + delete）
      { id: 'math.copyAsMathML', localizedTitle: { zh: '复制为 MathML', en: 'Copy as MathML' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { handleCopyMathMl(); } },
      { id: 'math.copyAsImage', localizedTitle: { zh: '复制为图片', en: 'Copy as Image' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { handleCopyRendered('math'); } },
      { id: 'math.download', localizedTitle: { zh: '下载公式（PNG）…', en: 'Download Formula (PNG)…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleDownloadRendered('math') },
      { id: 'math.deleteBlock', localizedTitle: { zh: '删除公式块', en: 'Delete Math Block' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('deleteBlock', 'math'); } },
      // C1：图表右键（Typora copy-as-image / download-diagram / delete）
      { id: 'mermaid.copyAsImage', localizedTitle: { zh: '复制为图片', en: 'Copy as Image' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { handleCopyRendered('mermaid'); } },
      { id: 'mermaid.download', localizedTitle: { zh: '下载图表…', en: 'Download Diagram…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleDownloadRendered('mermaid') },
      { id: 'mermaid.deleteBlock', localizedTitle: { zh: '删除图表', en: 'Delete Diagram' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => { void engineContext('deleteBlock', 'mermaid'); } },
      // C1：表格对齐子菜单（Typora table 右键 Alignment）
      { id: 'table.alignLeft', localizedTitle: { zh: '左对齐', en: 'Align Left' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('alignLeft') },
      { id: 'table.alignCenter', localizedTitle: { zh: '居中对齐', en: 'Align Center' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('alignCenter') },
      { id: 'table.alignRight', localizedTitle: { zh: '右对齐', en: 'Align Right' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('alignRight') },
      { id: 'table.alignDefault', localizedTitle: { zh: '默认对齐', en: 'Default Alignment' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('alignDefault') },
      // C1：链接编辑 / 移除（Typora link 右键 Edit / Remove）
      { id: 'format.editLinkUrl', localizedTitle: { zh: '编辑链接…', en: 'Edit Link…' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => void handleEditLinkUrl() },
      { id: 'format.removeLink', localizedTitle: { zh: '移除链接', en: 'Remove Link' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => { handleRemoveLink(); } },
      // C2：编辑菜单收口（Typora 对齐：粘贴并匹配样式 / 复制为无主题 HTML / 行结束符 / 空白）
      { id: 'edit.pasteMatchStyle', localizedTitle: { zh: '粘贴并匹配样式', en: 'Paste and Match Style' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('pastePlain') },
      { id: 'edit.copyWithoutTheme', localizedTitle: { zh: '复制为无主题 HTML', en: 'Copy as HTML without Theme' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('copyWithoutTheme') },
      { id: 'edit.eol.lf', localizedTitle: { zh: '行结束符：LF（Unix/macOS）', en: 'Line Endings: LF (Unix/macOS)' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => handleDocEol('\n') },
      { id: 'edit.eol.crlf', localizedTitle: { zh: '行结束符：CRLF（Windows）', en: 'Line Endings: CRLF (Windows)' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => handleDocEol('\r\n') },
      { id: 'edit.trimTrailingSpaces', localizedTitle: { zh: '清理行尾空白', en: 'Trim Trailing Whitespace' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => handleTrimTrailing() },
      { id: 'edit.copyPlain', localizedTitle: { zh: '复制为纯文本', en: 'Copy as Plain Text' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('copyPlain') },
      { id: 'edit.copyHtmlSource', localizedTitle: { zh: '复制为 HTML 代码', en: 'Copy as HTML Code' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => engineClipboard('copyHtmlSource') },
      // D4 表格操作（Typora 段落→表格子菜单；快捷键由引擎 keymap/右键菜单处理，菜单不设 accel）
      { id: 'table.addRowAbove', localizedTitle: { zh: '上方插入行', en: 'Insert Row Above' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('addRowAbove') },
      { id: 'table.addRowBelow', localizedTitle: { zh: '下方插入行', en: 'Insert Row Below' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('addRowBelow') },
      { id: 'table.addColumnLeft', localizedTitle: { zh: '左侧插入列', en: 'Insert Column Left' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('addColumnLeft') },
      { id: 'table.addColumnRight', localizedTitle: { zh: '右侧插入列', en: 'Insert Column Right' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('addColumnRight') },
      { id: 'table.moveRowUp', localizedTitle: { zh: '向上移动表格行', en: 'Move Row Up' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('moveRowUp') },
      { id: 'table.moveRowDown', localizedTitle: { zh: '向下移动表格行', en: 'Move Row Down' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('moveRowDown') },
      { id: 'table.moveColumnLeft', localizedTitle: { zh: '向左移动表格列', en: 'Move Column Left' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('moveColumnLeft') },
      { id: 'table.moveColumnRight', localizedTitle: { zh: '向右移动表格列', en: 'Move Column Right' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('moveColumnRight') },
      { id: 'table.deleteRow', localizedTitle: { zh: '删除行', en: 'Delete Row' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('deleteRow') },
      { id: 'table.deleteColumn', localizedTitle: { zh: '删除列', en: 'Delete Column' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('deleteColumn') },
      { id: 'table.copyTable', localizedTitle: { zh: '复制表格', en: 'Copy Table' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('copyTable') },
      { id: 'table.tidy', localizedTitle: { zh: '格式化表格源码', en: 'Format Table Source' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('tidy') },
      { id: 'table.deleteTable', localizedTitle: { zh: '删除表格', en: 'Delete Table' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineTableOp('deleteTable') },
      // D4 代码工具（Typora 段落→代码工具→复制代码块内容）
      { id: 'paragraph.copyCodeBlock', localizedTitle: { zh: '复制代码块内容', en: 'Copy Code Block Content' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => void handleCopyCodeBlock() },
      // D1-1 拼写检查（Typora 编辑→拼写和语法「键入时检查」；菜单 CheckMenuItem 触发）
      { id: 'edit.spellcheck.toggle', localizedTitle: { zh: '键入时检查拼写', en: 'Check Spelling While Typing' }, category: 'edit', context: { scope: 'global' }, enabled: always, execute: () => {
        const def = settingById('editor.spellcheck');
        if (!def) return;
        const next = readSetting(def) !== true;
        writeSetting(def, next);
        hostRef.current?.setSpellcheckEnabled(next);
        setMenuCheckTick((v) => v + 1); // P1-1.3：菜单 CheckMenuItem 选中态随 syncNativeMenu 重建
        setStatusText(t(next ? 'msg.spellcheckOn' : 'msg.spellcheckOff'));
      } },
      // R2-1 编辑→替换「智能标点」（Typora parity；设置面板同一真源）
      { id: 'edit.smartPunctuation.toggle', localizedTitle: { zh: '智能标点', en: 'Smart Punctuation' }, category: 'edit', context: { scope: 'global' }, enabled: always, execute: () => {
        const def = settingById('editor.smartPunctuation');
        if (!def) return;
        const next = readSetting(def) !== true;
        writeSetting(def, next);
        hostRef.current?.setSmartPunctuationEnabled(next);
        setMenuCheckTick((v) => v + 1); // P1-1.3：菜单 CheckMenuItem 选中态随 syncNativeMenu 重建
        setStatusText(t(next ? 'msg.smartPunctOn' : 'msg.smartPunctOff'));
      } },
      // 格式（Typora 对齐；引擎 applyInlineFormat / 空选区成对插入）
      { id: 'format.bold', localizedTitle: { zh: '粗体', en: 'Bold' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('bold') },
      { id: 'format.italic', localizedTitle: { zh: '斜体', en: 'Italic' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('italic') },
      // P1-1.8：官方键位 —— 删除线 Alt+Shift+5、行内代码 Ctrl+Shift+`（Win/Linux）
      { id: 'format.strike', localizedTitle: { zh: '删除线', en: 'Strikethrough' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('strike') },
      { id: 'format.code', localizedTitle: { zh: '行内代码', en: 'Inline Code' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('code') },
      { id: 'format.link', localizedTitle: { zh: '链接…', en: 'Link…' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('link') },
      // ⌥⌘L 链接引用（Typora 格式→链接引用，引擎 applyReferenceLink）
      { id: 'format.referenceLink', localizedTitle: { zh: '链接引用…', en: 'Link Reference…' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('referenceLink') },
      // P1-1.8：官方键位 —— 引用 Ctrl+Shift+Q、无序列表 Ctrl+Shift+]、有序列表 Ctrl+Shift+[（Win/Linux）
      { id: 'format.quote', localizedTitle: { zh: '引用', en: 'Blockquote' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('quote') },
      { id: 'format.list', localizedTitle: { zh: '列表', en: 'Bulleted List' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('list') },
      { id: 'format.orderedList', localizedTitle: { zh: '有序列表', en: 'Ordered List' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('orderedList') },
      { id: 'format.taskList', localizedTitle: { zh: '任务列表', en: 'Task List' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('taskList') },
      // P1-1.8：官方键位 —— 代码块 Ctrl+Shift+K、数学块 Ctrl+Shift+M（Win/Linux）
      { id: 'format.codeBlock', localizedTitle: { zh: '代码块', en: 'Code Block' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('codeBlock') },
      { id: 'format.mathBlock', localizedTitle: { zh: '数学公式块', en: 'Math Block' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('mathBlock') },
      { id: 'format.highlight', localizedTitle: { zh: '高亮', en: 'Highlight' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('highlight') },
      { id: 'format.sup', localizedTitle: { zh: '上标', en: 'Superscript' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('sup') },
      { id: 'format.sub', localizedTitle: { zh: '下标', en: 'Subscript' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('sub') },
      // D4 格式菜单补全（Typora 格式：下划线 ⌘U / 注释 ⌃-；引擎 applyInlineWrap 非对称包裹）
      { id: 'format.underline', localizedTitle: { zh: '下划线', en: 'Underline' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('underline') },
      { id: 'format.comment', localizedTitle: { zh: '注释', en: 'Comment' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('comment') },
      // D4 链接操作（Typora 格式→链接操作：打开链接 / 复制链接地址）
      { id: 'format.openLink', localizedTitle: { zh: '打开链接', en: 'Open Link' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => handleOpenLinkAtCursor() },
      { id: 'format.copyLinkUrl', localizedTitle: { zh: '复制链接地址', en: 'Copy Link Address' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => void handleCopyLinkUrl() },
      // 清除样式（Typora Format→清除样式 ⌘\）：选区行内 marker + 链接语法剥除
      { id: 'format.clear', localizedTitle: { zh: '清除样式', en: 'Clear Formatting' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('clear') },
      // 段落（标题层级 / 段落）
      { id: 'paragraph.h1', localizedTitle: { zh: '一级标题', en: 'Heading 1' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h1') },
      { id: 'paragraph.h2', localizedTitle: { zh: '二级标题', en: 'Heading 2' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h2') },
      { id: 'paragraph.h3', localizedTitle: { zh: '三级标题', en: 'Heading 3' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h3') },
      { id: 'paragraph.h4', localizedTitle: { zh: '四级标题', en: 'Heading 4' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h4') },
      { id: 'paragraph.h5', localizedTitle: { zh: '五级标题', en: 'Heading 5' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h5') },
      { id: 'paragraph.h6', localizedTitle: { zh: '六级标题', en: 'Heading 6' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('h6') },
      { id: 'paragraph.normal', localizedTitle: { zh: '段落', en: 'Paragraph' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('paragraph') },
      // 段落新项（B2 菜单补全，Typora 段落菜单对齐）
      { id: 'paragraph.headingUp', localizedTitle: { zh: '提升标题级别', en: 'Increase Heading Level' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('headingUp') },
      { id: 'paragraph.headingDown', localizedTitle: { zh: '降低标题级别', en: 'Decrease Heading Level' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('headingDown') },
      { id: 'paragraph.horizontalRule', localizedTitle: { zh: '水平分割线', en: 'Horizontal Rule' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('horizontalRule') },
      { id: 'paragraph.footnote', localizedTitle: { zh: '脚注', en: 'Footnote' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('footnote') },
      { id: 'paragraph.yamlFrontMatter', localizedTitle: { zh: 'YAML Front Matter', en: 'YAML Front Matter' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('yamlFrontMatter') },
      { id: 'paragraph.taskToggle', localizedTitle: { zh: '切换任务状态', en: 'Toggle Task State' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('taskToggle') },
      // D4 列表缩进（Typora 段落→列表缩进 ⌘]/⌘[；引擎 applyListIndent）
      { id: 'paragraph.indentMore', localizedTitle: { zh: '增加缩进', en: 'Increase Indent' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('indentMore') },
      { id: 'paragraph.indentLess', localizedTitle: { zh: '减少缩进', en: 'Decrease Indent' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('indentLess') },
      // D4 插入段落（Typora 段落→在上方/下方插入段落；引擎 applyInsertParagraph）
      { id: 'paragraph.insertAbove', localizedTitle: { zh: '在上方插入段落', en: 'Insert Paragraph Above' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('insertParagraphAbove') },
      { id: 'paragraph.insertBelow', localizedTitle: { zh: '在下方插入段落', en: 'Insert Paragraph Below' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('insertParagraphBelow') },
      { id: 'theme.mode.system', localizedTitle: { zh: '跟随系统', en: 'Follow System' }, category: 'view', context: { scope: 'global' }, enabled: () => themeSettings.mode !== 'system', execute: () => setThemeSettingsAndPersist({ ...themeSettings, mode: 'system' }) },
      { id: 'view.sidebar.toggle', localizedTitle: { zh: '切换侧边栏', en: 'Toggle Sidebar' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: toggleSidebar },
      { id: 'view.sidebar.outline', localizedTitle: { zh: '大纲', en: 'Outline' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => showSidebarAs('outline') },
      { id: 'view.sidebar.fileTree', localizedTitle: { zh: '文件树', en: 'File Tree' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => showSidebarAs('files') },
      // V7-W1.5：Typora 显示菜单第二视图 Articles（文档列表，⌃⌘2）
      { id: 'view.sidebar.fileList', localizedTitle: { zh: '文档列表', en: 'Articles' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => showSidebarAs('fileList') },
      // B1（SDI）：tabs.showAll（⇧⌘\ Tab Overview）随多标签能力移除
      // DevTools（仅 debug 构建可用；release 返回 Err → toast 提示）
      { id: 'view.devtools', localizedTitle: { zh: '开发者工具', en: 'Developer Tools' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void invoke('open_devtools').catch(() => setToast({ message: t('view.devtools.unavailable') })); } },
      { id: 'help.quickStart', localizedTitle: { zh: '快速上手', en: 'Quick Start' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_QUICK_START); } },
      { id: 'help.website', localizedTitle: { zh: '官方网站', en: 'Website' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_WEBSITE); } },
      { id: 'help.markdownReference', localizedTitle: { zh: 'Markdown 语法参考', en: 'Markdown Reference' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_MARKDOWN_REFERENCE); } },
      { id: 'help.feedback', localizedTitle: { zh: '反馈问题…', en: 'Feedback…' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_FEEDBACK); } },
      { id: 'help.cheatsheet', localizedTitle: { zh: 'Markdown 速查表', en: 'Markdown Cheatsheet' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => setCheatsheetOpen(true) },
      { id: 'help.diagnostics', localizedTitle: { zh: '诊断信息', en: 'Diagnostics…' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => setDiagnosticsOpen(true) },
    ];
    // P1-1.2：快捷键单一真源注入（§7.4 硬规则 2）—— schema 覆盖命令的 shortcut 由
    // SCHEMA_SHORTCUTS（packages/commands/menuSchema.ts）统一提供，内联只保留
    // 平台互补的键盘补充键位（settings.open win / export.repeat mac）与纯键盘快捷键
    // （tabs.prev/next、edit.cut/copy/paste 等，菜单条目为 OS predefined 项）。
    for (const command of commands) {
      const injected = SCHEMA_SHORTCUTS.get(command.id);
      if (injected !== undefined) command.shortcut = { ...injected, ...command.shortcut };
    }
    // P2-2.6：用户自定义键位 override（Settings 录制）在装配边界覆盖 schema 默认值；
    // 仅覆盖有 schema 键位的命令（无键位命令不允许凭空造键位，保持单一真源纪律）。
    for (const command of commands) {
      const override = shortcutOverrides[command.id];
      if (override !== undefined && command.shortcut !== undefined) {
        command.shortcut = {
          mac: override.mac ?? command.shortcut.mac,
          winLinux: override.winLinux ?? command.shortcut.winLinux,
        };
      }
    }
    commands.forEach((command) => registry.register(command));
    for (const theme of allThemes()) {
      registry.register({
        id: `theme.apply.${theme.id}`,
        localizedTitle: { zh: `主题：${theme.name}`, en: `Theme: ${theme.name}` },
        category: 'view',
        context: { scope: 'global' },
        enabled: () => activeTheme.id !== theme.id,
        execute: () => applyThemeById(theme.id),
      });
    }
    pluginCommandsRef.current.forEach((command) => registry.register(command, { source: 'plugin' }));
    commandRegistryRef.current = registry;
    (window as unknown as { __MELLOW_COMMANDS__?: { register: (command: Command) => void; dispatch: (id: string, payload?: unknown) => Promise<boolean>; all: () => Command[] } }).__MELLOW_COMMANDS__ = {
      register: (command) => {
        pluginCommandsRef.current = [...pluginCommandsRef.current.filter((c) => c.id !== command.id), command];
        commandRegistryRef.current.register(command, { source: 'plugin', replace: true });
      },
      dispatch: (id, payload) => dispatchCommand(id, 'plugin', payload),
      all: () => commandRegistryRef.current.all(),
    };
  }, [activeTheme, adjustFontSize, applySetting, applyThemeById, assetDir, chooseFileTreeRoot, closeReader, cycleFocusMode, dispatchCommand, engineContext, fileTreeRoot, handleDocEol, closeCurrentWindow, handleCopyMathMl, handleCopyRendered, handleDownloadRendered, handleEditLinkUrl, handleExportHtml, handleExportPdf, handleExportImage, handleNew, handleOpen, handleRemoveLink, handleRenameDocument, handleSave, handleSaveAs, handleTrimTrailing, handleTreeCopyPath, handleTreeDuplicate, handleTreeMove, handleTreeNewFile, handleTreeNewFolder, handleTreeRename, handleTreeReveal, handleTreeTrash, handleTreeUndo, localeSetting, openGlobalSearch, openQuickOpen, openReader, openSlashUi, readerOpen, readerZoom, refreshFilesSidebar, replaceSlashTrigger, engineFormat, engineSearch, engineSourceToggle, engineReadonlyToggle, runBatch, runUpdateCheck, selectedTreePath, setCheatsheetOpen, showSidebarAs, toggleSidebar, selectionToolbarEnabled, setAssetDir, setFocusMode, setLocaleSettingPersist, setReaderZoom, setSelectionToolbarEnabled, setThemeSettingsAndPersist, setTypewriterMode, themeSettings, toggleSelectionToolbar, toggleSlashEnabled, toggleTypewriter, typewriterEnabled, shortcutOverrides]);

  /**
   * 快捷键统一分发（window keydown 与编辑器 iframe 转发共用）。
   * key 归一优先用物理键位 code（⌥ 组合在 mac 上 e.key 为特殊字符如 '∫'，
   * code 布局无关）：KeyB→B / Equal→= / Digit0→0 / Slash→/ …
   */
  const dispatchShortcut = useCallback((key: string, code: string, mods: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): boolean => {
    const platform = navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win-linux';
    const normalizedKey = CODE_KEY_ALIASES[code] ?? key;
    const parts = [mods.ctrlKey ? 'Ctrl' : '', mods.metaKey ? 'Cmd' : '', mods.altKey ? 'Alt' : '', mods.shiftKey ? 'Shift' : '', normalizedKey].filter(Boolean).join('+');
    const command = commandRegistryRef.current.findByShortcut(normalizeShortcut(parts), platform);
    if (!command) return false;
    void dispatchCommand(command.id, 'shortcut');
    return true;
  }, [dispatchCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (dispatchShortcut(event.key, event.code, event)) {
        // Windows/Linux Ctrl+T 未注册为 New Tab，因此保留给 Table（PRD Shortcut Contract）。
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatchShortcut]);

  // 编辑器 iframe 按键同步桥（bundle 内 keyForwarder 同源直调）：命中命令返回 true，
  // iframe 侧立即 preventDefault（WKWebView 未拦截的 ⌘ 组合会明文插入字符）。
  useEffect(() => {
    (window as unknown as { __MELLOW_SHORTCUT_API__?: { dispatch: (key: string, code: string, mods: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }) => boolean } }).__MELLOW_SHORTCUT_API__ = {
      dispatch: (key, code, mods) => dispatchShortcut(key, code, mods),
    };
    return () => {
      delete (window as unknown as { __MELLOW_SHORTCUT_API__?: unknown }).__MELLOW_SHORTCUT_API__;
    };
  }, [dispatchShortcut]);

  // Cmd/Ctrl+滚轮缩放桥（bundle 内 wheelForwarder 同源直调）：读 mellow.editor.cmdWheelZoom
  // 开关后调 adjustFontSize（与 ⇧⌘= 共用 editor.fontSize 单一真源；关闭时宿主侧静默）
  useEffect(() => {
    (window as unknown as { __MELLOW_WHEEL_API__?: { zoom: (direction: number) => void } }).__MELLOW_WHEEL_API__ = {
      zoom: (direction) => {
        if (localStorage.getItem('mellow.editor.cmdWheelZoom') === '0') return;
        void adjustFontSize(direction);
      },
    };
    return () => {
      delete (window as unknown as { __MELLOW_WHEEL_API__?: unknown }).__MELLOW_WHEEL_API__;
    };
  }, [adjustFontSize]);

  // Engine iframe → host：Slash 行首触发通知
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'mellow.slash.open') handleSlashOpen(event.data.payload as SlashOpenRequest);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleSlashOpen]);

  // 窗口 size/position 记忆（desktop-ui-design-spec §3 Window；settings.advanced.windowBounds 开关）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let boundsEnabled = true;
    try { boundsEnabled = localStorage.getItem('mellow.advanced.windowBounds') !== '0'; } catch { /* 默认开启 */ }
    if (!boundsEnabled) return;
    let disposed = false;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow, PhysicalSize, PhysicalPosition }) => {
      const win = getCurrentWindow();
      try {
        const saved = localStorage.getItem(WINDOW_BOUNDS_KEY);
        if (saved !== null) {
          const bounds = JSON.parse(saved) as { width: number; height: number; x: number; y: number };
          if (Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.width >= 900 && bounds.height >= 600) {
            await win.setSize(new PhysicalSize(Math.round(bounds.width), Math.round(bounds.height)));
            if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
              await win.setPosition(new PhysicalPosition(Math.round(bounds.x), Math.round(bounds.y)));
            }
          }
        }
      } catch {
        /* 忽略恢复失败 */
      }
      if (disposed) return;
      let saveTimer = 0;
      const persist = (): void => {
        if (saveTimer !== 0) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          void win.outerSize().then(async (size) => {
            try {
              const pos = await win.outerPosition();
              localStorage.setItem(WINDOW_BOUNDS_KEY, JSON.stringify({ width: size.width, height: size.height, x: pos.x, y: pos.y }));
            } catch {
              /* 忽略 */
            }
          });
        }, 400);
      };
      const unlistens: Array<() => void> = [];
      try {
        unlistens.push(await win.onResized(persist));
        unlistens.push(await win.onMoved(persist));
      } catch {
        /* 事件订阅失败不影响 */
      }
      return () => {
        disposed = true;
        unlistens.forEach((un) => un());
      };
    }).catch(() => {
      /* 非 Tauri 环境 */
    });
    return () => {
      disposed = true;
    };
  }, []);

  // macOS Menu Bar → 统一 Command Registry（menu 事件只 dispatch 命令，不做平台业务逻辑）
  // B2：recent.file::<path>（「打开最近文件」动态子菜单项）在此拦截按路径打开，
  // 其余 id 一律走 dispatchCommand（与前端注册命令一一对应）。
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<string>('mellow-menu-command', (event) => {
        const id = event.payload;
        if (id.startsWith('recent.file::')) {
          void openPathInTab(id.slice('recent.file::'.length));
          return;
        }
        void dispatchCommand(id, 'menu');
      });
    }).catch(() => {
      /* 非 Tauri 环境 */
    });
    return () => {
      unlisten?.();
    };
  }, [dispatchCommand, openPathInTab]);

  // P3.1 目录 watcher：打开 workspace 时递归监听目录树，外部 create/remove/modify
  // 经 250ms 合并窗口后刷新 FileTree / FileList（增量 = 只重建侧栏树，不动编辑器状态）；
  // 换根或关闭时 unwatch_dir 取消（drop watcher 即取消底层 inotify/FSEvents/RDW）。
  useEffect(() => {
    if (!isTauri() || fileTreeRoot === null) return;
    const root = fileTreeRoot;
    let watcherId: number | null = null;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { void refreshFilesSidebarRef.current(); }, 250);
    };
    void Promise.all([
      import('@tauri-apps/api/core').then(({ invoke }) => invoke<number>('watch_dir', { path: root })),
      import('@tauri-apps/api/event').then(({ listen }) => listen<{ root: string; path: string; kind: string }>('mellow://dir-changed', (e) => {
        if (e.payload.root !== root) return;
        scheduleRefresh();
      })),
    ]).then(([id, fn]) => {
      if (cancelled) {
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('unwatch_dir', { watcherId: id })).catch(() => undefined);
        fn();
        return;
      }
      watcherId = id;
      unlisten = fn;
    }).catch(() => {
      /* 非 Tauri / watcher 不可用 */
    });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      if (watcherId !== null) {
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('unwatch_dir', { watcherId })).catch(() => undefined);
      }
      unlisten?.();
    };
    // P3.7 修复：refreshFilesSidebar 经 ref 调用（引用随 fileTreeNodes 抖动，见其定义处注释）
  }, [fileTreeRoot]);

  // P1-1.3 / P1-1.4 / P1-1.5：原生菜单单一真源 —— 前端把 MENU_SCHEMA（含 locale 文案、
  // 最近文件、BUILTIN_THEMES 主题派生、spellcheck/smartPunct/themeMode checkState）物化为
  // NativeMenuSpec 下发，Rust menu.rs 只做 materialization（§7.4 硬规则 5/6）。
  // 任一输入变化整体重建，取代旧 set_menu_locale / set_recent_files / set_theme_selection /
  // set_spellcheck_state / set_smart_punct_state 五条状态同步命令。
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const spec = buildNativeMenuSpec({
      locale,
      translate: t,
      recentFiles: recentFiles.map((f) => f.path),
      activeThemeId: activeTheme.id,
      themeMode: themeSettings.mode,
      spellcheck: (() => { const def = settingById('editor.spellcheck'); return def ? readSetting(def) !== false : true; })(),
      smartPunct: (() => { const def = settingById('editor.smartPunctuation'); return def ? readSetting(def) === true : false; })(),
      // V7-W1.6：状态栏开关勾选态（Typora Win/Linux 显示菜单「状态栏」）
      statusbar: statusbarVisible,
      // V7-W2.4：浮动编辑器工具栏勾选态（Typora 1.14 View → Toolbar）
      toolbar: selectionToolbarEnabled,
      // 用户主题（appData/themes/*.css）：随加载/重扫变化重建主题菜单派生
      userThemes: userThemeList.map((theme) => ({ id: theme.id, name: theme.name })),
      // P2-2.6：自定义键位随 override 变化重建原生菜单（accelerator 物化）
      shortcutOverrides,
    });
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_menu_spec', { spec }))
      .catch(() => {
        /* 非 Tauri / 菜单不可用 */
      });
    // menuCheckTick：spellcheck/smartPunct toggle 写 localStorage 后自增触发重建
  }, [locale, t, recentFiles, activeTheme.id, themeSettings.mode, userThemeList, menuCheckTick, shortcutOverrides, statusbarVisible, selectionToolbarEnabled]);

  // ── Crash Recovery 三选项（spec §6：Recover / Compare / Ignore）──

  const handleRecover = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
    // B1（SDI）：恢复 = 用快照替换当前窗口文档；当前 dirty 时先确认丢弃
    if (!guardSingleDocument()) return;
    const result = await recovery.recover(entry.documentId);
    if (!result.ok || result.value === null) {
      setStatusText(t('msg.recoverFailed', { error: result.ok ? t('msg.snapshotMissing') : result.error.message }));
      return;
    }
    const snapshot = result.value;
    // 用快照内容打开（恢复上次崩溃前状态）
    filePathRef.current = snapshot.path;
    docIdRef.current = snapshot.documentId; // 保持原文档 id（恢复语义）
    revisionRef.current = snapshot.revision;
    docMetaRef.current = { encoding: snapshot.encoding, eol: snapshot.eol };
    diskStateRef.current = null; // 磁盘状态未知：跳过 validate（恢复场景）
    await host.open(snapshot.content, undefined, true, snapshot.eol);
    setDirty(true);
    const host2 = hostRef.current;
    if (host2) docStateRef.current.updateCurrent({ ...currentTabPatch(host2), dirty: true });
    refreshTabsState();
    setStatusText(t('msg.recovered', { path: snapshot.path ?? t('msg.unsavedDoc'), rev: snapshot.revision }));
    // 恢复后清理快照（用户已处理）
    await recovery.onSaved(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    refreshStats(host);
  }, [currentTabPatch, guardSingleDocument, refreshStats, refreshTabsState]);

  const handleCompare = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
    // B1（SDI）：比较 = 加载快照到当前窗口（覆盖当前内容前同样做 dirty 确认）
    if (!guardSingleDocument()) return;
    const result = await recovery.recover(entry.documentId);
    if (!result.ok || result.value === null) {
      setStatusText(t('msg.readSnapshotFailed', { error: result.ok ? t('msg.snapshotMissing') : result.error.message }));
      return;
    }
    // 比较：加载快照到编辑器（磁盘版本保留在原路径，供用户对比），不删除快照
    const snapshot = result.value;
    filePathRef.current = snapshot.path;
    docIdRef.current = snapshot.documentId;
    revisionRef.current = snapshot.revision;
    docMetaRef.current = { encoding: snapshot.encoding, eol: snapshot.eol };
    diskStateRef.current = null;
    await host.open(snapshot.content, undefined, true, snapshot.eol);
    setDirty(true);
    const host2 = hostRef.current;
    if (host2) docStateRef.current.updateCurrent({ ...currentTabPatch(host2), dirty: true });
    refreshTabsState();
    setStatusText(t('msg.compareSnapshot', { path: snapshot.path ?? t('msg.unsavedDoc') }));
    refreshStats(host);
  }, [currentTabPatch, guardSingleDocument, refreshStats, refreshTabsState]);

  const handleIgnore = useCallback(async (entry: RecoveryEntry) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    await recovery.ignore(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    setStatusText(t('msg.ignoredSnapshot'));
  }, []);

  const paletteSource: CommandSource = slashMode || commandPaletteQuery.startsWith('/') ? 'slash' : 'command-palette';
  const paletteQuery = commandPaletteQuery.startsWith('/') ? commandPaletteQuery.slice(1) : commandPaletteQuery;
  const paletteCommands: CommandPaletteItem[] = slashMode
    ? slashCommandSearch(commandRegistryRef.current.all(), paletteQuery, commandContext('slash'), locale === 'zh-CN' ? 'zh' : 'en', { recentIds: commandPaletteRecent })
    : commandPaletteSearch(
        commandRegistryRef.current.all(),
        paletteQuery,
        commandContext(paletteSource),
        locale === 'zh-CN' ? 'zh' : 'en',
        commandPaletteRecent,
      );

  const runPaletteCommand = (id: string, source: CommandSource = paletteSource) => {
    setCommandPaletteVisible(false);
    setCommandPaletteQuery('');
    setSlashMode(false);
    commandPaletteModelRef.current.selectedIndex = 0;
    setCommandPaletteSelected(0);
    void dispatchCommand(id, source);
  };

  return (
    <div className={`shell${platformMac ? ' platform-mac' : ''}`}>
      <header className="titlebar" data-tauri-drag-region>
        <button
          className="titlebar-palette"
          type="button"
          onClick={toggleSidebar}
          title={t('sidebar.toggleTitle')}
          aria-pressed={sidebarShown}
        ><span aria-hidden="true">☰</span><span className="sr-only">{platformMac ? '⇧⌘L' : 'Ctrl+Shift+L'}</span></button>
        {/* Windows 一体化自绘标题栏（Typora parity，V4 §17 D10）：非 macOS Tauri 环境显示窗口控制按钮 */}
        {!platformMac && isTauri() && (
          <div className="titlebar-window-controls" role="group" aria-label="Window controls">
            <button
              type="button"
              className="titlebar-win-btn"
              title={t('menu.window.minimize')}
              aria-label={t('menu.window.minimize')}
              onClick={() => { void windowServiceRef.current?.minimize(); }}
            ><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg></button>
            <button
              type="button"
              className="titlebar-win-btn"
              title={t('menu.window.maximizeToggle')}
              aria-label={t('menu.window.maximizeToggle')}
              onClick={() => { void windowServiceRef.current?.toggleMaximize(); }}
            ><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg></button>
            <button
              type="button"
              className="titlebar-win-btn titlebar-win-close"
              title={t('titlebar.closeWindow')}
              aria-label={t('titlebar.closeWindow')}
              onClick={() => { void windowServiceRef.current?.close(); }}
            ><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" /></svg></button>
          </div>
        )}
      </header>
      <div className="workspace-shell">
        {sidebarShown && (
        <aside className="file-tree" style={{ width: sidebarWidth }} onKeyDown={sidebarMode === 'files' ? handleTreeKeyDown : sidebarMode === 'fileList' ? handleFileListKeyDown : sidebarMode === 'outline' ? handleOutlineKeyDown : handleSearchKeyDown} tabIndex={0} aria-label={sidebarMode === 'outline' ? t('sidebar.outlineAria') : sidebarMode === 'search' ? t('sidebar.searchAria') : sidebarMode === 'fileList' ? t('sidebar.articlesAria') : t('sidebar.treeAria')}>
          <SidebarHeader
            mode={sidebarMode}
            t={t}
            onModeChange={(m) => { setSidebarMode(m); if (m === 'outline') refreshOutlineRef.current(); }}
            onSearchClick={() => { setSidebarMode('search'); }}
            onHide={() => { setSidebarVisible(false); }}
            hideLabel={t('sidebar.hideSidebar')}
          />
          {sidebarMode === 'files' ? (
            <>
              {/* V6-P2 2.1（D1=完全 Typora 化）：quickbar 常驻条（过滤框 + 新建按钮）移除 ——
                  新建走右键菜单/命令面板；⌘F 在侧栏临时唤出过滤框（Enter 确认 / Esc 清空收起） */}
              {treeFilterOpen && (
                <div className="file-quickbar">
                  <input
                    ref={treeFilterRef}
                    className="file-filter-input"
                    type="text"
                    placeholder={t('files.filterPlaceholder')}
                    value={fileFilterQuery}
                    onChange={(e) => setFileFilterQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.stopPropagation(); setTreeFilterOpen(false); }
                      else if (e.key === 'Escape') { e.stopPropagation(); setFileFilterQuery(''); setTreeFilterOpen(false); }
                      // ←→ 保护输入框光标移动（aside 层把它们映射为折叠/展开）
                      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
                    }}
                  />
                </div>
              )}
              {/* V5-A1（D1=完全 Typora 化）：仅树形——列表视图与树/列表切换已退役 */}
              <div className="file-tree-list" onContextMenu={(e) => openTreeContextMenu(e)}>
                {filteredFileTreeNodes.length === 0 ? (
                  <div className="sidebar-empty">{fileTreeRoot === null ? t('sidebar.emptyFiles') : (fileTreeNodes.length === 0 ? t('sidebar.emptyFolder') : t('sidebar.noFilterMatch'))}</div>
                ) : <FileTree nodes={filteredFileTreeNodes} selectedPath={selectedTreePath} currentPath={filePathRef.current} onSelect={handleTreeSelect} onToggle={(p) => void handleTreeToggle(p)} onOpen={(p) => void openTreeFile(p)} onDrop={(d, p) => void handleTreeDrop(d, p)} onContextMenu={openTreeContextMenu} />}
              </div>
            </>
          ) : sidebarMode === 'fileList' ? (
            /* V7-W1.5：Articles（文档列表）—— Typora 显示菜单第二视图（⌃⌘2）。
               与 File Tree 同源（同一根目录），差异仅在呈现：树形 vs 平铺列表。 */
            <>
              {treeFilterOpen && (
                <div className="file-quickbar">
                  <input
                    ref={treeFilterRef}
                    className="file-filter-input"
                    type="text"
                    placeholder={t('files.filterPlaceholder')}
                    value={fileFilterQuery}
                    onChange={(e) => setFileFilterQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.stopPropagation(); setTreeFilterOpen(false); }
                      else if (e.key === 'Escape') { e.stopPropagation(); setFileFilterQuery(''); setTreeFilterOpen(false); }
                      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
                    }}
                  />
                </div>
              )}
              {/* .file-list 自身即滚动容器（VirtualRows 经 parentElement 探测滚动源） */}
              <div className="file-list" onContextMenu={(e) => openTreeContextMenu(e)}>
                {filteredFileListItems.length === 0 ? (
                  <div className="sidebar-empty">{fileTreeRoot === null ? t('sidebar.emptyFiles') : (fileListItems.length === 0 ? t('sidebar.emptyFolder') : t('sidebar.noFilterMatch'))}</div>
                ) : (
                  <FileList
                    items={fileListItemsForRender}
                    selectedPath={fileListSelectedPath}
                    currentPath={filePathRef.current}
                    includeSummary={false}
                    compact
                    groupByFolder={fileListRecursive}
                    folderLabel={fileListFolderLabel}
                    formatFileTime={formatFileTime}
                    onSelect={setFileListSelectedPath}
                    onOpen={(p) => void openTreeFile(p)}
                    onContextMenu={openTreeContextMenu}
                  />
                )}
              </div>
            </>
          ) : sidebarMode === 'outline' ? (
            <>
              <div className="file-tree-filters">
                <input className="outline-filter" placeholder={t('outline.filter')} value={outlineFilter} onChange={(e) => setOutlineFilter(e.target.value)} />
                <label><input type="checkbox" checked={outlineFlat} onChange={(e) => setOutlineFlat(e.target.checked)} />{t('outline.flat')}</label>
                <label><input type="checkbox" checked={outlineAutoNumber} onChange={(e) => setOutlineAutoNumberOption(e.target.checked)} />{t('outline.number')}</label>
              </div>
              <div className="outline-list" aria-label={t('outline.listLabel')}>
                {(() => {
                  const items = visibleOutlineItems();
                  return items.length === 0
                    ? <div className="sidebar-empty">{t('outline.empty')}</div>
                    : <OutlineList items={items} selectedId={outlineSelectedId} currentId={currentOutlineId} flat={outlineFlat} collapsed={outlineModelRef.current.collapsed} onJump={handleOutlineJump} onToggle={handleOutlineToggle} onContextMenu={openOutlineContextMenu} highlightNonce={outlineHighlightNonce} />;
                })()}
              </div>
            </>
          ) : (
            <>
              <div className="search-panel">
                <input className="search-input" autoFocus placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runGlobalSearch(); }} />
                <div className="search-toggles">
                  <label><input type="checkbox" checked={searchCase} onChange={(e) => setSearchCase(e.target.checked)} />{t('search.case')}</label>
                  <label><input type="checkbox" checked={searchWholeWord} onChange={(e) => setSearchWholeWord(e.target.checked)} />{t('search.word')}</label>
                  <label><input type="checkbox" checked={searchRegex} onChange={(e) => setSearchRegex(e.target.checked)} />{t('search.regex')}</label>
                  <label>{t('search.ctx')} <input type="number" min="0" max="2" value={searchContext} onChange={(e) => setSearchContext(Math.max(0, Math.min(2, Number(e.target.value) || 0)))} /></label>
                </div>
                {/* §7.3：invalid regex 就地提示 —— 非法正则此前被静默吞成「无结果」 */}
                {searchRegexInvalid && <div className="search-regex-invalid" role="alert">{t('search.regexInvalid')}</div>}
                <input className="search-input small" placeholder={t('search.include')} value={searchInclude} onChange={(e) => setSearchInclude(e.target.value)} />
                <input className="search-input small" placeholder={t('search.exclude')} value={searchExclude} onChange={(e) => setSearchExclude(e.target.value)} />
                <button onClick={() => void runGlobalSearch()} disabled={!searchQuery || fileTreeRoot === null}>{t('search.run')}</button>
                <span className="search-count">{searchRunning ? t('search.streaming') : ''} {t('search.matches', { n: searchResults.length })}</span>
              </div>
              <div className="search-results" aria-label={t('search.resultsLabel')}>
                {searchQuery === '' && searchResults.length === 0 && <div className="sidebar-empty">{t('search.empty')}</div>}
                {<SearchResultsList groups={searchGroups} selectedIndex={searchSelectedIndex} onJump={(m) => void jumpToSearchResult(m)} onContextMenu={openSearchContextMenu} />}
              </div>
            </>
          )}
          {/* V7-W3.3（D-C = ①）：侧栏底部「当前文件夹」操作条 —— Typora File Management 真值
              「At the bottom of the left side bar, users can pop up menu items for the current folder」。
              仅 Files（树 / 列表）模式出现 —— Typora 的 Outline / Search 面板底部无此条。 */}
          {(sidebarMode === 'files' || sidebarMode === 'fileList') && (
            <SidebarFooter
              folderName={fileTreeRoot === null ? null : (fileTreeBasename(fileTreeRoot) || fileTreeRoot)}
              folderPath={fileTreeRoot}
              t={t}
              onMenu={openFolderMenu}
              currentOutsideFolder={currentDocOutsideFolder}
              onLoadCurrentFolder={filePathRef.current === null ? undefined : () => loadFolderRoot(fileTreeDirname(filePathRef.current ?? ''))}
            />
          )}
        </aside>
        )}
        {sidebarShown && (
          <div
            className="sidebar-resizer"
            onMouseDown={handleSidebarDragStart}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('sidebar.resizeTitle')}
            title={t('sidebar.resizeTitle')}
          />
        )}
        <main className="editor-container">
          {/* V7-W2.3（D-A 裁决 = 方案 §12 选项 ③「改造为纯操作条」）：
              1) **移除居中文档名** —— 文件名唯一真源是窗口标题栏（`windowService.setTitle`，
                 `● ` 前缀表 dirty，Typora 行为，见上方 effect）。此前 `.editor-topbar-title`
                 把同一信息渲染第二次：macOS 原生标题栏（V6-P2 2.2 已回归）+ 本条 = 重复；
                 Typora 本身无应用内文件名条，故删除该节点与对应 CSS。
              2) **保留本条作为纯操作条**，因为它是 macOS 上唯一可发现的侧栏入口
                 （G7-SHELL-05：`.shell.platform-mac .titlebar { display: none }` 隐藏了 ☰）
                 与浮动大纲的唯一入口。左侧按钮在 macOS 恒显（Typora macOS 同样在标题栏行
                 提供侧栏开关），非 macOS 仅在侧栏隐藏时显示（此时自绘 `.titlebar` 已有 ☰）。
              3) 条高保持 34px 不变，避免布局基线漂移；残余差异（Typora 无此条）登记为 D。 */}
          {!readerOpen && (
            <div className="editor-topbar" data-tauri-drag-region>
              <div className="editor-topbar-side editor-topbar-left">
                {(platformMac || !sidebarShown) && (
                  <button
                    type="button"
                    className={`editor-topbar-btn${sidebarShown ? ' active' : ''}`}
                    aria-label={sidebarShown ? t('sidebar.hideSidebar') : t('sidebar.showSidebar')}
                    aria-pressed={sidebarShown}
                    title={sidebarShown ? t('sidebar.hideSidebar') : t('sidebar.showSidebar')}
                    onClick={toggleSidebar}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M5.5 3.5L10 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      <path d="M13.5 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="editor-topbar-spacer" />
              <div className="editor-topbar-side editor-topbar-right">
                <button
                  type="button"
                  className={`editor-topbar-btn${outlineFloatOpen ? ' active' : ''}`}
                  aria-label={t('sidebar.outline')}
                  aria-pressed={outlineFloatOpen}
                  title={t('sidebar.outline')}
                  onClick={() => { setOutlineFloatOpen((v) => !v); refreshOutlineRef.current(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 3.5h9M2 8h7M2 12.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    <circle cx="13.2" cy="3.5" r="0.9" fill="currentColor" />
                    <circle cx="11.7" cy="8" r="0.9" fill="currentColor" />
                    <circle cx="13.2" cy="12.5" r="0.9" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {/* P2-2.5 模式状态指示（不常驻，轻量）：仅非默认模式时渲染 badge，点击即退出。
              Reader 有自带 bar（mellow-reader-bar 含关闭入口），重复 badge 反增干扰；
              Slash 为瞬态面板且 slashEnabled 默认开启，常显违反「不常驻」——均不做常驻指示。 */}
          {(focusMode !== 'off' || typewriterEnabled) && (
            <div className="mode-indicators">
              {focusMode !== 'off' && (
                <button
                  type="button"
                  className="mode-indicator"
                  title={t('mode.indicatorHint')}
                  onClick={() => setFocusMode('off')}
                >
                  {focusMode === 'line' ? t('mode.focusLine') : t('mode.focusParagraph')}
                </button>
              )}
              {typewriterEnabled && (
                <button
                  type="button"
                  className="mode-indicator"
                  title={t('mode.indicatorHint')}
                  onClick={() => setTypewriterMode(false)}
                >
                  {t('mode.typewriter')}
                </button>
              )}
            </div>
          )}
          {readerOpen && (
            <ReaderView
              t={t}
              html={readerHtml}
              title={readerTitle}
              zoom={readerZoom}
              onZoomChange={setReaderZoom}
              onOpenInEditor={closeReader}
              onClose={closeReader}
              onCurrentHeadingChange={(id) => { outlineActiveRef.current = id; setCurrentOutlineId(id); }}
            />
          )}
          {/* V7-W2.4（D-B = ①）：常驻 `.editor-toolbar` 横条已退役 —— Typora 1.14 只有
              一个「编辑器工具栏」概念且为浮动（Selection 锚定），已由引擎级
              `selectionToolbar` 提供（View → 工具栏 / 设置 → 外观 同源开关）。
              残留常驻横条会形成「两套格式工具」并偏离 Typora 布局。 */}
          <div
            ref={containerRef}
            className="editor-host"
            style={readerOpen ? { display: 'none' } : undefined}
          />
          {/* V7-I7（v1.5.4 Typora parity）：浮动大纲面板（编辑器右侧 overlay，不挤压正文） */}
          {outlineFloatOpen && !readerOpen && (
            <div className="outline-float" role="complementary" aria-label={t('outline.listLabel')}>
              <div className="outline-float-header">
                <span className="outline-float-title">{t('sidebar.outline')}</span>
                <button
                  type="button"
                  className="outline-float-close"
                  aria-label={t('reader.close')}
                  title={t('reader.close')}
                  onClick={() => { setOutlineFloatOpen(false); }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="outline-float-list">
                {(() => {
                  const items = visibleOutlineItems();
                  return items.length === 0
                    ? <div className="sidebar-empty">{t('outline.empty')}</div>
                    : <OutlineList items={items} selectedId={outlineSelectedId} currentId={currentOutlineId} flat={outlineFlat} collapsed={outlineModelRef.current.collapsed} onJump={handleOutlineJump} onToggle={handleOutlineToggle} onContextMenu={openOutlineContextMenu} highlightNonce={outlineHighlightNonce} />;
                })()}
              </div>
            </div>
          )}
        </main>
      </div>
      {commandPaletteVisible && (
        <div className="quick-open-backdrop" onMouseDown={() => { setCommandPaletteVisible(false); setSlashMode(false); }}>
          <div className="quick-open-panel" onMouseDown={(e) => e.stopPropagation()}>
            <input
              className="quick-open-input"
              autoFocus
              value={commandPaletteQuery}
              placeholder={slashMode ? t('palette.slash.placeholder') : t('palette.command.placeholder')}
              aria-label={slashMode ? t('palette.slash.placeholder') : t('palette.command.placeholder')}
              onChange={(e) => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteQuery(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setCommandPaletteVisible(false); setSlashMode(false); }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                  e.preventDefault();
                  const key = e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up' : 'enter';
                  const r = commandPaletteModelRef.current.navigate(paletteCommands, key);
                  setCommandPaletteSelected(r.selectedIndex);
                  if (r.commandId) runPaletteCommand(r.commandId);
                }
              }}
            />
            <div className="quick-open-results" role="listbox" aria-label={slashMode ? t('palette.slash.placeholder') : t('palette.command.placeholder')}>
              {paletteCommands.map((item, index) => (
                <button
                  key={item.command.id}
                  type="button"
                  className={`quick-open-item ${index === commandPaletteSelected ? 'selected' : ''} ${!item.enabled ? 'disabled' : ''}`}
                  disabled={!item.enabled}
                  role="option"
                  aria-selected={index === commandPaletteSelected}
                  aria-disabled={!item.enabled}
                  onMouseEnter={() => { commandPaletteModelRef.current.selectedIndex = index; setCommandPaletteSelected(index); }}
                  onClick={() => runPaletteCommand(item.command.id)}
                >
                  <span className="quick-open-filename">{item.title}</span>
                  <span className="quick-open-path">{item.command.id} · {item.command.category}{item.command.shortcut ? ` · ${item.command.shortcut.mac ?? item.command.shortcut.winLinux ?? ''}` : ''}{item.recentRank !== undefined ? ` · ${t('palette.recent')}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {quickOpenVisible && (
        <div className="quick-open-backdrop" onMouseDown={closeQuickOpen}>
          <div className="quick-open-panel" onMouseDown={(e) => e.stopPropagation()}>
            <input
              className="quick-open-input"
              autoFocus
              value={quickOpenQuery}
              placeholder={t('quickopen.placeholder')}
              aria-label={t('quickopen.placeholder')}
              onChange={(e) => handleQuickOpenQuery(e.target.value)}
              onKeyDown={handleQuickOpenKeyDown}
            />
            <div className="quick-open-meta">
              <span>{quickOpenScanning ? t('quickopen.scanning') : t('quickopen.scanned', { n: quickOpenAll.length })}</span>
              <span>{navigator.platform.toLowerCase().includes('mac') ? 'Cmd+Shift+O' : 'Ctrl+P'} · ↑↓ · Enter · Esc</span>
            </div>
            <div className="quick-open-results" role="listbox" aria-label={t('quickopen.placeholder')}>
              {quickOpenResults.map((item, index) => (
                <button
                  key={item.path}
                  type="button"
                  className={`quick-open-item ${index === quickOpenSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={index === quickOpenSelected}
                  onMouseEnter={() => { quickOpenModelRef.current.selectedIndex = index; setQuickOpenSelected(index); }}
                  onClick={() => { quickOpenModelRef.current.selectedIndex = index; setQuickOpenSelected(index); void confirmQuickOpen(item.path); }}
                >
                  <span className="quick-open-filename">{item.filename}</span>
                  <span className="quick-open-path">{item.relativePath}</span>
                </button>
              ))}
              {quickOpenResults.length === 0 && <div className="quick-open-empty">{t('quickopen.empty')}</div>}
            </div>
          </div>
        </div>
      )}
      {conflict !== null && (
        <div className="recovery-bar conflict-bar">
          <span>{t('conflict.title', { kind: conflict.kind })}</span>
          <button onClick={() => void handleConflictCompare()}>{t('conflict.compare')}</button>
          <button onClick={() => void handleConflictReloadDisk()}>{t('conflict.reloadDisk')}</button>
          <button onClick={handleConflictKeepLocal}>{t('conflict.keepLocal')}</button>
        </div>
      )}
      {recoveryEntries.length > 0 && (
        <div className="recovery-bar">
          <span>{t('recovery.title', { n: recoveryEntries.length })}</span>
          {recoveryEntries.map((entry) => (
            <span key={entry.documentId} className="recovery-item">
              {entry.path ?? t('msg.unsavedDoc')} · {t('recovery.revision', { rev: entry.revision })}
              <button onClick={() => void handleRecover(entry)}>{t('recovery.recover')}</button>
              <button onClick={() => void handleCompare(entry)}>{t('conflict.compare')}</button>
              <button onClick={() => void handleIgnore(entry)}>{t('recovery.ignore')}</button>
            </span>
          ))}
        </div>
      )}
      {(updateUi.phase === 'checking' || updateUi.phase === 'upToDate' || updateUi.phase === 'error') && (
        <div className={`update-bar${updateUi.phase === 'error' ? ' update-bar-error' : ''}`}>
          <span>
            {updateUi.phase === 'checking' && t('updater.checking')}
            {updateUi.phase === 'upToDate' && t('updater.upToDate')}
            {updateUi.phase === 'error' && `${t('updater.checkFailed')}${updateUi.message !== '' ? `：${updateUi.message}` : ''}`}
          </span>
        </div>
      )}
      {updateUi.phase === 'available' && (
        <div className="update-bar">
          <span>{t('updater.updateAvailable', { version: updateUi.version })}</span>
          <button onClick={handleUpdateLater}>{t('updater.later')}</button>
          <button onClick={handleSkipUpdate}>{t('updater.skipVersion')}</button>
          <button onClick={() => void handleUpdateNow()}>{t('updater.update')}</button>
        </div>
      )}
      {updateUi.phase === 'downloading' && (
        <div className="update-bar">
          <span>{t('updater.downloading', { percent: updateUi.percent })}</span>
        </div>
      )}
      {updateUi.phase === 'ready' && (
        <div className="update-bar">
          <span>{t('updater.ready')}</span>
          <button onClick={() => void handleInstallRestart()}>{t('updater.restartInstall')}</button>
        </div>
      )}
      {rollbackPrompt !== null && (
        <div className="update-bar rollback-bar">
          <span>{t('updater.rollbackPrompt', { version: rollbackPrompt.previousVersion })}</span>
          <button onClick={() => void handleRollback()}>{t('updater.rollback')}</button>
          <button onClick={() => void handleRollbackKeep()}>{t('updater.keepNew')}</button>
        </div>
      )}
      {statusbarVisible && (
        <div
          className="statusbar-wrap"
          onContextMenu={(e) => {
            e.preventDefault();
            handleStatusbarContextMenu(e.clientX, e.clientY);
          }}
        >
          <StatusBar
            t={t}
            dirty={dirty}
            stats={stats}
            cursorPos={cursorPos}
            encodingLabel={encodingLabel}
            eolLabel={eolLabel}
            status={status}
            statusText={statusText}
            zoom={(() => {
              const def = settingById('editor.fontSize');
              if (def === undefined) return undefined;
              const v = readSetting(def);
              const size = typeof v === 'number' ? v : Number(def.defaultValue);
              return `${Math.round((size / Number(def.defaultValue)) * 100)}%`;
            })()}
            fields={statusbarFields}
            onZoomReset={() => adjustFontSize(0)}
            // V7-W2.7：点击字数项展开字数统计面板（Typora：word count 按钮 → popup panel）
            onStatsClick={() => {
              const host = hostRef.current;
              if (host !== null) refreshStats(host);
              setWordCountOpen(true);
            }}
          />
        </div>
      )}
      {fileInfoOpen && (
        <div className="open-with-backdrop" onMouseDown={() => setFileInfoOpen(false)}>
          <div className="open-with-panel" role="dialog" aria-label={t('file.info')} onMouseDown={(e) => e.stopPropagation()}>
            <div className="open-with-header">
              <span className="open-with-title">{t('file.info')}</span>
              <button type="button" className="open-with-close" onClick={() => setFileInfoOpen(false)} aria-label={t('settings.close')}>✕</button>
            </div>
            <div className="file-info-body">
              {(() => {
                const text = hostRef.current?.getText() ?? '';
                const count = countWords(text);
                const sizeBytes = new TextEncoder().encode(text).length;
                const mtime = diskStateRef.current?.mtimeMs;
                const rows: Array<[string, string]> = [
                  [t('fileInfo.path'), filePathRef.current ?? t('msg.unsavedDoc')],
                  [t('fileInfo.size'), `${sizeBytes.toLocaleString()} B`],
                  [t('fileInfo.modified'), mtime !== undefined && mtime !== null ? new Date(mtime).toLocaleString() : '—'],
                  [t('fileInfo.encoding'), docMetaRef.current.encoding],
                  [t('fileInfo.eol'), docMetaRef.current.eol === '\r\n' ? 'CRLF' : docMetaRef.current.eol === '\r' ? 'CR' : 'LF'],
                  [t('fileInfo.lines'), String(count.lines)],
                  [t('fileInfo.chars'), String(count.chars)],
                  [t('fileInfo.words'), `${count.cjkChars} 字 / ${count.words} 词`],
                  [t('fileInfo.readingTime'), t('status.readingTime', { minutes: count.readingTimeMinutes })],
                ];
                return rows.map(([label, value]) => (
                  <div key={label} className="file-info-row">
                    <span className="file-info-label">{label}</span>
                    <span className="file-info-value">{value}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      {wordCountOpen && wordCountData !== null && (() => {
        const c = wordCountData;
        const rows: Array<[string, string]> = [
          [t('wordCount.cjk'), String(c.cjkChars)],
          [t('wordCount.words'), String(c.words)],
          [t('wordCount.chars'), String(c.chars)],
          [t('wordCount.charsNoSpace'), String(c.charsNoSpace)],
          [t('wordCount.lines'), String(c.lines)],
          [t('wordCount.paragraphs'), String(c.paragraphs)],
          [t('wordCount.readingTime'), t('status.readingTime', { minutes: c.readingTimeMinutes })],
        ];
        return (
          <div className="word-count-window" role="dialog" aria-label={t('wordCount.title')}>
            <div className="open-with-header">
              <span className="open-with-title">{t('wordCount.title')}</span>
              <button type="button" className="open-with-close" onClick={() => setWordCountOpen(false)} aria-label={t('settings.close')}>✕</button>
            </div>
            <div className="file-info-body">
              {rows.map(([label, value]) => (
                <div key={label} className="file-info-row">
                  <span className="file-info-label">{label}</span>
                  <span className="file-info-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {diagnosticsOpen && (() => {
        // V6-P0-E 诊断信息：appVersion（tauri.conf）+ 渲染层 bundle 指纹（iframe 注入）。
        // 两者不一致 → WKWebView 命中旧缓存（v1.4.8 真机事故的直接判据）。
        // V7-I5：追加渲染层实时探针（config 字号阶梯 + DOM 实测 H1 字号）——
        // 真机「标题同字号」一键定位失效层级（config → 样式表 → computed）。
        const bundle = readBundleVersion();
        const probe = readEditorStyleProbe();
        const rows: Array<[string, string]> = [
          [t('diag.appVersion'), `v${appVersion}`],
          [t('diag.bundleVersion'), bundle],
          [t('diag.platform'), navigator.userAgent],
        ];
        if (probe !== null) {
          rows.push([t('diag.configFont'), `${probe.configFontSize}px / diffs [${probe.diffs.join(',')}]`]);
          rows.push([t('diag.h1Measured'), probe.h1Measured]);
          rows.push([t('diag.bodyMeasured'), probe.bodyMeasured]);
        }
        const mismatch = appVersion !== '' && bundle !== '—' && bundle !== `v${appVersion}`;
        return (
          <div className="word-count-window" role="dialog" aria-label={t('diag.title')}>
            <div className="open-with-header">
              <span className="open-with-title">{t('diag.title')}</span>
              <button type="button" className="open-with-close" onClick={() => setDiagnosticsOpen(false)} aria-label={t('settings.close')}>✕</button>
            </div>
            <div className="file-info-body">
              {mismatch && <div className="diag-warning">{t('diag.mismatch')}</div>}
              {rows.map(([label, value]) => (
                <div key={label} className="file-info-row">
                  <span className="file-info-label">{label}</span>
                  <span className="file-info-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {openWithOpen && (
        <div className="open-with-backdrop" onMouseDown={() => setOpenWithOpen(false)}>
          <div className="open-with-panel" role="dialog" aria-label={t('file.openWith')} onMouseDown={(e) => e.stopPropagation()}>
            <div className="open-with-header">
              <span className="open-with-title">{t('file.openWith')}</span>
              <button type="button" className="open-with-close" onClick={() => setOpenWithOpen(false)} aria-label={t('settings.close')}>✕</button>
            </div>
            <div className="open-with-body">
              {openWithEditors.length === 0
                ? <div className="open-with-empty">{t('openWith.empty')}</div>
                : openWithEditors.map((app) => (
                    <button key={app.id} type="button" className="open-with-item" onClick={() => void runOpenWith(app.launch)}>
                      {app.name}
                    </button>
                  ))}
              <div className="open-with-custom">
                <input
                  className="open-with-input"
                  placeholder={t('openWith.customPlaceholder')}
                  value={openWithCustom}
                  onChange={(e) => setOpenWithCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && openWithCustom.trim() !== '') void runOpenWith(openWithCustom.trim()); }}
                />
                <button type="button" disabled={openWithCustom.trim() === ''} onClick={() => void runOpenWith(openWithCustom.trim())}>{t('openWith.open')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsPanel
          t={t}
          onClose={() => setSettingsOpen(false)}
          applySetting={applySetting}
          currentLanguage={localeSetting === 'system' ? 'system' : localeSetting}
          themeSettings={themeSettings}
          aiEnabled={aiEnabled}
          shortcuts={commandRegistryRef.current.all().filter((c) => c.shortcut !== undefined).map((c) => ({
            id: c.id,
            title: titleFor(c, locale === 'zh-CN' ? 'zh' : 'en'),
            shortcut: platformMac ? c.shortcut?.mac : c.shortcut?.winLinux,
          }))}
          onShortcutChange={handleShortcutOverride}
        />
      )}
      {contextMenu !== null && (
        <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}
      <Cheatsheet open={cheatsheetOpen} locale={locale} shortcuts={Object.fromEntries(commandRegistryRef.current.all().map((c) => [c.id, platformMac ? c.shortcut?.mac : c.shortcut?.winLinux]))} onClose={() => setCheatsheetOpen(false)} />
      {toast !== null && (
        <div className="toast-bar">
          <span className="toast-message">{toast.message}</span>
          {toast.onUndo !== undefined && <button onClick={() => toast.onUndo?.()}>{t('msg.imagesUndo')}</button>}
          {toast.action !== undefined && <button className="toast-action" onClick={() => toast.action?.run()}>{toast.action.label}</button>}
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
