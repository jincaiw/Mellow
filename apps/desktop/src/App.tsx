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
import { EditorCore } from '../../../packages/editor-core/src';
import {
  DocumentService,
  RecoveryService,
  ExternalChangeService,
  ImageFileOpsService,
  DocumentRenameService,
  FileOpHistory,
  TabManager,
  FileTreeModel,
  FileTreeService,
  FileListModel,
  FileListService,
  OutlineModel,
  buildOutline,
  currentHeadingId,
  filterOutline,
  headingOffsetForAnchor,
  QuickOpenModel,
  groupSearchResults,
  normalizeSearchRequest,
  rankQuickOpen,
  scanQuickOpen,
  DEFAULT_FILE_TREE_OPTIONS,
  DEFAULT_FILE_LIST_OPTIONS,
  dirname as fileTreeDirname,
  relativePath as fileTreeRelativePath,
  createEditorBridgeFromCore,
  renderReaderHtml,
  countWords,
  formatWordCountStats,
  pushRecentFile,
  parseRecentFiles,
  serializeRecentFiles,
  pushRecentFolder,
  parseRecentFolders,
  serializeRecentFolders,
} from '../../../packages/app-core/src';
import type { DocumentTab, ExternalChangeDetail, FileListItem, FileListOptions, FileTreeNode, FileTreeOptions, OutlineHeading, QuickOpenEntry, SearchGroup, TabSessionSnapshot, RecentFileEntry } from '../../../packages/app-core/src';
import { createDesktopFileService, isTauri } from './host/fileServices';
import { createDesktopExtensionHost } from './extensions/extensionHost';
import { helloCommandManifest, setupHelloCommand } from './extensions/examples/helloCommand';
import { ExtensionRegistry, basename, buildExtensionContext } from '../../../packages/app-core/src';
import { createDesktopRecoveryStorage } from './host/recoveryStorage';
import { createDesktopWatcher } from './host/watcherAdapter';
import { createDesktopDialogService } from './host/dialogs';
import { createDesktopOpenerService } from './host/openers';
import { createDesktopWindowService } from './host/windowService';
import { createDesktopSearchService } from './host/searchServices';
import { createDesktopImageUploadService } from './host/uploadService';
import { loadKatex, renderKatex, injectKatexCssIntoFrame } from './katexLoader';
import type { ImageWidgetActionRequest } from '../../../packages/editor-engine/src/image/widget';
import type { AssetDirConfig } from '../../../packages/editor-engine/src/image/path';
import type { Encoding, LineEnding, RecoveryEntry, FileChangeEvent, DialogService, OpenerService, SearchResult, SearchService, WindowService, ImageUploadOptions, ImageUploadService } from '../../../packages/host-api/src/index';
import type { ImageExportOptions, Canvas2DLike } from '../../../packages/export/src/image/index';
import { CommandPaletteModel, CommandRegistry, commandPaletteSearch, createCommandContext, normalizeShortcut, slashCommandSearch, titleFor } from '../../../packages/commands/src';
import type { Command, CommandPaletteItem, CommandSource } from '../../../packages/commands/src';
import type { CommandContribution } from '../../../packages/extension-api/src';
import { BUILTIN_THEMES, DEFAULT_THEME_SETTINGS, resolveActiveTheme, themeById } from '../../../packages/themes/src';
import type { MellowTheme, ThemeSettings } from '../../../packages/themes/src';
import { createI18n, MESSAGES, resolveLocale } from '../../../packages/i18n/src';
import type { Locale, LocaleSetting } from '../../../packages/i18n/src';
import { readSetting, settingById, writeSetting } from '../../../packages/settings/src';
import type { SettingDefinition } from '../../../packages/settings/src';
import SettingsPanel from './SettingsPanel';
import { Tabbar, StatusBar, Welcome, OutlineList, SearchResultsList, FileList, FileTree, SidebarHeader } from '../../../packages/desktop-ui/src';
import type { SlashOpenRequest } from '../../../packages/editor-engine/src';
import type { EditorContextMenuRequest, EditorContextActions } from '../../../packages/editor-engine/src';
import ReaderView from './Reader';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem, ContextMenuState } from './ContextMenu';
import Cheatsheet from './Cheatsheet';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import type { Update as TauriUpdate } from '@tauri-apps/plugin-updater';
import { checkForUpdate, downloadUpdate, installUpdateAndRestart, prepareRollback, rollbackCommit, rollbackNoteLaunch, rollbackRestore, rollbackStatus, restartAfterRollback, updateChannelFromSettings } from './host/updater';
import type { RollbackStatus } from './host/updater';
import { PRINT_STYLESHEET } from '../../../packages/export/src/printStyle';

const GLOBAL_ASSET_DIR_KEY = 'mellow.assetDir';
// 帮助菜单外链（Typora 帮助菜单补全：快速上手 / Markdown 参考 / 反馈）
const HELP_URL_QUICK_START = 'https://github.com/jincaiw/Mellow#readme';
const HELP_URL_MARKDOWN_REFERENCE = 'https://commonmark.cn/help/';
const HELP_URL_FEEDBACK = 'https://github.com/jincaiw/Mellow/issues';
const TABS_SESSION_KEY = 'mellow.tabs.session';
const RECENT_FILES_KEY = 'mellow.recent.files';
const RECENT_FOLDERS_KEY = 'mellow.recent.folders';
const FILE_TREE_ROOT_KEY = 'mellow.fileTree.root';
const FILE_TREE_OPTIONS_KEY = 'mellow.fileTree.options';
const FILE_LIST_OPTIONS_KEY = 'mellow.fileList.options';
const FILE_SIDEBAR_MODE_KEY = 'mellow.fileSidebar.mode';
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
const COMMAND_PALETTE_SHORTCUT = { mac: 'Cmd+Shift+P', winLinux: 'Ctrl+Shift+P' };

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

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorCore | null>(null);
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
  // Tabs（PRD §11：open/active/dirty/reorder/close/session restore）
  const tabsRef = useRef<TabManager>(new TabManager());
  const suppressEditorEventRef = useRef(false);

  // File Tree / Articles File List（PRD §14/§15/§59/§60；不创建 .mellow workspace 文件）
  const fileTreeServiceRef = useRef<FileTreeService | null>(null);
  const fileTreeModelRef = useRef<FileTreeModel | null>(null);
  const fileListServiceRef = useRef<FileListService | null>(null);
  const fileListModelRef = useRef<FileListModel>(new FileListModel());
  const outlineModelRef = useRef<OutlineModel>(new OutlineModel());
  const outlineActiveRef = useRef<string | null>(null);
  const refreshOutlineRef = useRef<(head?: number | null) => void>(() => {});
  const quickOpenModelRef = useRef<QuickOpenModel>(new QuickOpenModel());
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
  // PRD §11：单 Tab 自动隐藏 Tab Bar（Typora 行为；设置可关）
  const [autoHideTabBar, setAutoHideTabBar] = useState<boolean>(() => {
    try { return localStorage.getItem('mellow.editor.autoHideTabBar') !== '0'; } catch { return true; }
  });
  const [statusbarVisible, setStatusbarVisible] = useState<boolean>(() => {
    // U2：状态栏默认隐藏（设置可开启）
    try { return localStorage.getItem('mellow.statusbar.visible') === '1'; } catch { return false; }
  });
  // U1：侧边栏默认隐藏（Cmd+Shift+L / 标题栏按钮唤起）
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try { return localStorage.getItem('mellow.sidebar.visible') === '1'; } catch { return false; }
  });
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

  /** 引擎剪贴板桥（菜单「复制为 Markdown / 纯文本 / HTML 代码 / 粘贴为纯文本」→ iframe __MELLOW_CLIPBOARD_API__） */
  const engineClipboard = useCallback((action: 'copyMarkdown' | 'copyPlain' | 'copyHtmlSource' | 'pastePlain') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CLIPBOARD_API__?: { copyAsMarkdown: () => boolean; copyAsPlain: () => boolean; copyAsHtmlSource: () => boolean; pastePlain: () => void } }) | null;
    if (action === 'copyMarkdown') win?.__MELLOW_CLIPBOARD_API__?.copyAsMarkdown();
    else if (action === 'copyPlain') win?.__MELLOW_CLIPBOARD_API__?.copyAsPlain();
    else if (action === 'copyHtmlSource') win?.__MELLOW_CLIPBOARD_API__?.copyAsHtmlSource();
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

  // document lang/dir（未来 RTL：localeDir 由 i18n 提供）
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // 写作宽度 / 行高：从 localStorage 初始化 CSS 变量（设置面板即时生效）
  useEffect(() => {
    try {
      const w = localStorage.getItem('mellow.editor.writingWidth');
      const wv = w === null ? '820' : w;
      document.documentElement.style.setProperty('--mellow-writing-width', wv === 'auto' ? 'none' : wv + 'px');
      const lh = localStorage.getItem('mellow.editor.lineHeight');
      const lhv = lh === null ? '1.65' : lh;
      document.documentElement.style.setProperty('--mellow-line-height', lhv);
    } catch { /* 默认 820 / 1.65 */ }
  }, []);
  // Native Menu 本地化（menu.rs 目录；locale 切换 → 重建菜单，PRD §23/附录 J）
  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_menu_locale', { locale }).catch(() => undefined);
  }, [locale]);
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
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [fileTreeRoot, setFileTreeRoot] = useState<string | null>(() => localStorage.getItem(FILE_TREE_ROOT_KEY));
  // ref 镜像：openPathInTab 内免依赖读取（「打开单文件 → 父文件夹自动加载」判断）
  const fileTreeRootRef = useRef(fileTreeRoot);
  fileTreeRootRef.current = fileTreeRoot;
  // RC parity B1：Pin Folder（固定文件夹 + 会话记忆）
  const PINNED_KEY = 'mellow.fileTree.pinned';
  const [pinnedFolders, setPinnedFolders] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const persistPinned = useCallback((next: string[]) => {
    setPinnedFolders(next);
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }, []);
  const handleTogglePinRoot = useCallback(() => {
    if (fileTreeRoot === null) return;
    if (pinnedFolders.includes(fileTreeRoot)) {
      persistPinned(pinnedFolders.filter((p) => p !== fileTreeRoot));
    } else {
      persistPinned([...pinnedFolders, fileTreeRoot]);
    }
  }, [fileTreeRoot, pinnedFolders, persistPinned]);
  const [sidebarMode, setSidebarModeState] = useState<'files' | 'outline' | 'search'>(() => {
    const saved = localStorage.getItem('mellow.sidebar.mode');
    return saved === 'outline' || saved === 'search' ? saved : 'files';
  });
  const [fileSidebarMode, setFileSidebarModeState] = useState<'tree' | 'list'>(() => (localStorage.getItem(FILE_SIDEBAR_MODE_KEY) === 'list' ? 'list' : 'tree'));
  // U6：侧栏过滤/排序控件默认折叠（⋯ 展开），降低默认界面密度（desktop-ui-design-spec §6）
  const [fileFiltersOpen, setFileFiltersOpen] = useState(false);
  const [fileTreeNodes, setFileTreeNodes] = useState<FileTreeNode[]>([]);
  const [fileListItems, setFileListItems] = useState<FileListItem[]>([]);
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const [selectedListPath, setSelectedListPath] = useState<string | null>(null);
  const [fileTreeOptions, setFileTreeOptions] = useState<FileTreeOptions>(() => {
    try {
      return { ...DEFAULT_FILE_TREE_OPTIONS, ...(JSON.parse(localStorage.getItem(FILE_TREE_OPTIONS_KEY) ?? '{}') as Partial<FileTreeOptions>) };
    } catch {
      return DEFAULT_FILE_TREE_OPTIONS;
    }
  });
  const [fileListOptions, setFileListOptions] = useState<FileListOptions>(() => {
    try {
      return { ...DEFAULT_FILE_LIST_OPTIONS, ...(JSON.parse(localStorage.getItem(FILE_LIST_OPTIONS_KEY) ?? '{}') as Partial<FileListOptions>) };
    } catch {
      return DEFAULT_FILE_LIST_OPTIONS;
    }
  });
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
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  // Tab Overview（⇧⌘\ 显示所有标签页，Typora 视图菜单对齐）
  const [tabOverviewOpen, setTabOverviewOpen] = useState(false);
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
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteSelected, setCommandPaletteSelected] = useState(0);
  const [focusMode, setFocusModeState] = useState<'off' | 'line' | 'paragraph'>('off');
  const [typewriterEnabled, setTypewriterEnabled] = useState(false);
  const [selectionToolbarEnabled, setSelectionToolbarEnabledState] = useState(true);
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
  // Recent Files（Typora 深度对标 ⑫：欢迎屏最近打开 + 缺失标记）
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() => {
    try { return parseRecentFiles(localStorage.getItem(RECENT_FILES_KEY)); } catch { return []; }
  });
  const [recentMissing, setRecentMissing] = useState<Record<string, boolean>>({});
  // 最近文件夹（PRD §56/§62）：打开文件夹时去重置顶记录
  const [recentFolders, setRecentFolders] = useState<string[]>(() => {
    try { return parseRecentFolders(localStorage.getItem(RECENT_FOLDERS_KEY)); } catch { return []; }
  });
  const rememberRecentFolder = useCallback((folder: string) => {
    setRecentFolders((prev) => {
      const next = pushRecentFolder(prev, folder);
      try { localStorage.setItem(RECENT_FOLDERS_KEY, serializeRecentFolders(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
  }, []);
  // 移除最近位置（Typora parity：悬停最近位置 → 移除入口）
  const forgetRecentFolder = useCallback((folder: string) => {
    setRecentFolders((prev) => {
      const next = prev.filter((f) => f !== folder);
      try { localStorage.setItem(RECENT_FOLDERS_KEY, serializeRecentFolders(next) ?? '[]'); } catch { /* noop */ }
      return next;
    });
  }, []);
  const [cursorPos, setCursorPos] = useState('');
  const [platformMac] = useState(() => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
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

  // User CSS（appData/user.css，优先级最高）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    void import('@tauri-apps/api/path').then(async ({ appDataDir, join }) => {
      const { invoke } = await import('@tauri-apps/api/core');
      const dir = await appDataDir();
      const userCssPath = await join(dir, 'user.css');
      const content = await invoke<string>('read_text', { path: userCssPath });
      if (cancelled) return;
      let style = document.getElementById('mellow-user-css') as HTMLStyleElement | null;
      if (style === null) {
        style = document.createElement('style');
        style.id = 'mellow-user-css';
        document.head.appendChild(style);
      }
      style.textContent = content;
    }).catch(() => {
      /* user.css 不存在或不可读：静默 */
    });
    return () => {
      cancelled = true;
    };
  }, []);
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

  /** 检查更新（仅发送版本/平台/渠道元数据；无用户数据、无遥测） */
  const runUpdateCheck = useCallback(async () => {
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
      setUpdateUi({ phase: 'available', version: update.version });
    } catch (err) {
      setUpdateUi({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const handleUpdateLater = useCallback(() => {
    setUpdateUi({ phase: 'idle' });
  }, []);

  /** 立即更新：rollback 备份当前版本 → 下载（Rust 校验签名）→ 提示重启安装 */
  const handleUpdateNow = useCallback(async () => {
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
  }, []);

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
    const tab = tabsRef.current.active;
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
    const tab = tabsRef.current.active;
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
    const tab = tabsRef.current.active;
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
    const tab = tabsRef.current.active;
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
    const tab = tabsRef.current.active;
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

  const setSelectionToolbarEnabled = useCallback((on: boolean) => {
    hostRef.current?.setSelectionToolbarEnabled(on);
    setSelectionToolbarEnabledState(on);
    setStatusText(on ? t('msg.toolbarOn') : t('msg.toolbarOff'));
  }, []);

  const toggleSelectionToolbar = useCallback(() => {
    setSelectionToolbarEnabled(!selectionToolbarEnabled);
  }, [selectionToolbarEnabled, setSelectionToolbarEnabled]);

  const openReader = useCallback(() => {
    const host = hostRef.current;
    const active = tabsRef.current.active;
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

  const persistTabs = useCallback(() => {
    try {
      localStorage.setItem(TABS_SESSION_KEY, JSON.stringify(tabsRef.current.snapshot()));
    } catch {
      // localStorage quota / private mode：session restore 降级，不影响编辑
    }
  }, []);

  const refreshTabsState = useCallback(() => {
    const snapshot = tabsRef.current.snapshot();
    setTabs(snapshot.tabs);
    setActiveTabId(snapshot.activeId);
    persistTabs();
  }, [persistTabs]);

  const currentTabPatch = useCallback((host: EditorCore): Partial<DocumentTab> => ({
    path: filePathRef.current,
    title: filePathRef.current === null ? t('tab.untitled') : filePathRef.current.split(/[\\/]/).pop() ?? filePathRef.current,
    content: host.getText(),
    dirty: dirtyRef.current,
    documentId: docIdRef.current,
    revision: revisionRef.current,
    encoding: docMetaRef.current.encoding,
    eol: docMetaRef.current.eol,
    diskState: diskStateRef.current,
  }), []);

  const syncActiveTabFromEditor = useCallback(() => {
    const host = hostRef.current;
    const active = tabsRef.current.active;
    if (!host || active === null) return;
    tabsRef.current.update(active.id, currentTabPatch(host));
    refreshTabsState();
  }, [currentTabPatch, refreshTabsState]);

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
    revisionRef.current = tab.revision;
    docMetaRef.current = { encoding: tab.encoding, eol: tab.eol };
    diskStateRef.current = tab.diskState;
    setConflict(null);
    setDirty(tab.dirty);
    host.setDocumentPath(tab.path);
    await host.open(tab.content, undefined, true, tab.eol);
    suppressEditorEventRef.current = false;
    // Large File Mode（PRD §109）已在 CoreEditor.open() 收口：resetEditor 前自动
    // 分类降级（>5MB 或 >50,000 行），覆盖全部 open 路径（含 auto reload/快照恢复）。
    refreshOutlineRef.current(0);
    await watchDocument(tab.path);
    refreshStats(host);
    refreshCursorPos(host);
    setStatusText(t('msg.switchedTab', { title: tab.title, suffix: tab.dirty ? t('msg.unsavedSuffix') : '' }));
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

  /** 引擎表格命令桥（菜单/命令面板 → iframe __MELLOW_CONTEXT_ACTIONS__.tableOp） */
  const engineTableOp = useCallback((op: 'addRowBelow' | 'deleteRow' | 'addColumnRight' | 'deleteColumn' | 'tidy' | 'addRowAbove' | 'addColumnLeft' | 'moveRowUp' | 'moveRowDown' | 'moveColumnLeft' | 'moveColumnRight' | 'deleteTable' | 'copyTable') => {
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: { tableOp?: (op: string) => void } }) | null;
    win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp?.(op);
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
      tabsRef.current.updateActive({
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
    const r = await svc.readTree(fileTreeRoot, model.expanded, fileTreeOptions);
    if (!r.ok) {
      setStatusText(t('msg.treeRefreshFailed', { error: r.error.message }));
      return;
    }
    setFileTreeNodes(r.value);
  }, [fileTreeOptions, fileTreeRoot]);


  const setFileTreeOption = useCallback((patch: Partial<FileTreeOptions>) => {
    setFileTreeOptions((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FILE_TREE_OPTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setFileListOption = useCallback((patch: Partial<FileListOptions>) => {
    setFileListOptions((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FILE_LIST_OPTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setFileSidebarMode = useCallback((mode: 'tree' | 'list') => {
    setFileSidebarModeState(mode);
    localStorage.setItem(FILE_SIDEBAR_MODE_KEY, mode);
  }, []);

  const setSidebarMode = useCallback((mode: 'files' | 'outline' | 'search') => {
    setSidebarModeState(mode);
    localStorage.setItem('mellow.sidebar.mode', mode);
  }, []);

  /** 侧边栏模式快捷键（⌃⌘1/2/3，Typora 对齐）：切到大纲/文件列表/文件树；侧栏未开则打开 */
  const showSidebarAs = useCallback((mode: 'files' | 'outline' | 'search', fileMode?: 'tree' | 'list') => {
    if (mode === 'files' && fileMode) setFileSidebarMode(fileMode);
    setSidebarMode(mode);
    setSidebarVisible((v) => {
      if (v) return v;
      try { localStorage.setItem('mellow.sidebar.visible', '1'); } catch { /* noop */ }
      return true;
    });
  }, [setFileSidebarMode, setSidebarMode]);

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

  const chooseFileTreeRoot = useCallback(async () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const r = await dialog.showDirectory();
    if (!r.ok || r.value === null) return;
    localStorage.setItem(FILE_TREE_ROOT_KEY, r.value);
    setFileTreeRoot(r.value);
    rememberRecentFolder(r.value);
    fileTreeModelRef.current = new FileTreeModel(r.value, fileTreeOptions);
    setSelectedTreePath(null);
    setStatusText(t('msg.folderOpened', { value: r.value }));
  }, [fileTreeOptions]);

  const treeFlatten = useCallback(() => {
    const model = fileTreeModelRef.current;
    return model?.flatten(fileTreeNodes) ?? [];
  }, [fileTreeNodes]);

  const selectedTreeDir = useCallback(() => {
    const selected = selectedTreePath;
    if (selected === null) return fileTreeRoot;
    const flat = treeFlatten();
    const node = flat.find((n) => n.path === selected);
    return node?.kind === 'folder' ? selected : fileTreeDirname(selected);
  }, [fileTreeRoot, selectedTreePath, treeFlatten]);

  const refreshFileList = useCallback(async () => {
    const svc = fileListServiceRef.current;
    if (!svc || fileTreeRoot === null) {
      setFileListItems([]);
      return;
    }
    const root = fileListOptions.recursive ? fileTreeRoot : (selectedTreeDir() ?? fileTreeRoot);
    const r = await svc.readList(root, fileListOptions, fileTreeOptions);
    if (!r.ok) {
      setStatusText(t('msg.listRefreshFailed', { error: r.error.message }));
      return;
    }
    setFileListItems(r.value);
  }, [fileListOptions, fileTreeOptions, fileTreeRoot, selectedTreeDir]);

  const refreshFilesSidebar = useCallback(async () => {
    await refreshFileTree();
    await refreshFileList();
  }, [refreshFileList, refreshFileTree]);

  const openTreeFile = useCallback(async (path: string) => {
    const documents = documentsRef.current;
    if (!documents) return;
    syncActiveTabFromEditor();
    const r = await documents.readPath(path);
    if (!r.ok) {
      setStatusText(t('msg.openFailed', { error: r.error.message }));
      return;
    }
    const tab = tabsRef.current.open({
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
  }, [applyTab, refreshTabsState, rememberQuickOpenRecent, syncActiveTabFromEditor]);

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

  const handleTreeRename = useCallback(async (name?: string) => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    const next = name ?? window.prompt(t('prompt.rename'), selectedTreePath.split(/[\\/]/).pop() ?? selectedTreePath);
    if (!next) return;
    const r = await svc.rename(selectedTreePath, next);
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

  const handleTreeTrash = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    if (!window.confirm(t('dialog.trashConfirm', { path: selectedTreePath }))) return;
    const r = await svc.trash(selectedTreePath);
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

  const handleTreeCopyPath = useCallback(async (relative: boolean) => {
    if (selectedTreePath === null) return;
    const text = relative && fileTreeRoot !== null ? fileTreeRelativePath(fileTreeRoot, selectedTreePath) : selectedTreePath;
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

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent) => {
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

  const handleFileListSelect = useCallback((path: string) => {
    fileListModelRef.current.selectedPath = path;
    setSelectedListPath(path);
  }, []);

  const handleFileListKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const key = event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowUp' ? 'up' : event.key === 'Enter' ? 'enter' : null;
    if (key === null) return;
    event.preventDefault();
    const r = fileListModelRef.current.navigate(fileListItems, key);
    setSelectedListPath(r.selected);
    if (r.open) void openTreeFile(r.open);
  }, [fileListItems, openTreeFile]);

  useEffect(() => {
    if (fileTreeRoot !== null) {
      fileTreeModelRef.current = new FileTreeModel(fileTreeRoot, fileTreeOptions);
      void refreshFilesSidebar();
    }
  }, [fileListOptions, fileTreeOptions, fileTreeRoot, refreshFilesSidebar]);

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
    tabsRef.current.updateActive({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
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
    tabsRef.current.updateActive({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
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

    const host = new EditorCore();
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
        let active = tabsRef.current.active;
        // PRD §92 启动行为：可关闭「恢复上次会话」（默认开启）
        let reopenLast = true;
        try { reopenLast = localStorage.getItem('mellow.general.reopenLast') !== '0'; } catch { /* 默认开启 */ }
        try {
          if (reopenLast) {
            const raw = localStorage.getItem(TABS_SESSION_KEY);
            if (raw !== null) {
              const parsed = JSON.parse(raw) as TabSessionSnapshot;
              tabsRef.current = new TabManager(parsed);
              active = tabsRef.current.active;
            }
          } else {
            tabsRef.current = new TabManager();
            active = null;
          }
        } catch {
          active = null;
        }
        if (active === null) {
          active = tabsRef.current.open({
            path: null,
            title: t('tab.untitled'),
            content: '',
            dirty: false,
            documentId: docIdRef.current,
            encoding: 'utf-8',
            eol: '\n',
          });
        }
        refreshTabsState();
        await applyTab(active);
        // B3-1 编辑器设置启动恢复（fontSize/fontFamily/lineNumbers/lineWrapping：
        // 持久化在 localStorage，此前仅 live apply 无恢复 → 重启后丢失；B1-1 缩放同享此路径）
        try {
          const sizeDef = settingById('editor.fontSize');
          const size = sizeDef ? readSetting(sizeDef) : 17;
          if (typeof size === 'number' && size !== 17) {
            host.setEditorConfig('setFontSize', { fontSize: size });
          }
          // B3-2 字体族启动恢复：用户显式设置 > 主题级（Newsprint/Paper 衬线）> CoreEditor 默认
          const familyPref = readEditorFontFamilyPreference(activeTheme);
          if (familyPref !== null) {
            host.setEditorConfig('setFontFace', { family: familyPref });
          }
          const lineNumDef = settingById('editor.lineNumbers');
          if (lineNumDef && readSetting(lineNumDef) === true) {
            host.setEditorConfig('setShowLineNumbers', { enabled: true });
          }
          const wrapDef = settingById('editor.lineWrapping');
          if (wrapDef && readSetting(wrapDef) === false) {
            host.setEditorConfig('setLineWrapping', { enabled: false });
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
        const mdLinkWin = frame?.contentWindow as (Window & { __MELLOW_MD_LINK_OPEN__?: (dest: string) => void }) | null;
        if (mdLinkWin) {
          mdLinkWin.__MELLOW_MD_LINK_OPEN__ = (dest) => { void openMdLinkRef.current(dest); };
        }

        // 注入编辑器右键菜单 handler（engine 检测上下文 → App 弹 ContextMenu）
        const ctxWin = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_MENU__?: (req: EditorContextMenuRequest) => void }) | null;
        if (ctxWin) {
          ctxWin.__MELLOW_CONTEXT_MENU__ = (req) => { handleEditorContextMenuRef.current(req); };
        }

        // Crash Recovery：编辑事件 → 防抖快照（与 Auto Save 分离）
        host.onEvent((e) => {
          if (e.type === 'viewUpdate') {
            refreshOutline(host.getSelectionHead());
            refreshCursorPos(host);
            if (suppressEditorEventRef.current) return;
            revisionRef.current += 1;
            setDirty(true);
            tabsRef.current.updateActive({
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

  /** 记录最近打开（去重置顶、cap 10、持久化） */
  const recordRecentFile = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = pushRecentFile(prev, path, Date.now());
      const raw = serializeRecentFiles(next);
      if (raw !== null) {
        try { localStorage.setItem(RECENT_FILES_KEY, raw); } catch { /* noop */ }
      }
      return next;
    });
  }, []);

  const handleNew = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    syncActiveTabFromEditor();
    const tab = tabsRef.current.open({
      path: null,
      title: t('tab.untitled'),
      content: '',
      dirty: false,
      documentId: crypto.randomUUID(),
      encoding: 'utf-8',
      eol: '\n',
      diskState: null,
    });
    refreshTabsState();
    await applyTab(tab);
    setStatusText(t('msg.newTab'));
  }, [applyTab, refreshTabsState, syncActiveTabFromEditor]);

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
    syncActiveTabFromEditor();
    const result = await documents.open();
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.openFailed', { error: result.error.message }));
      }
      return;
    }
    const tab = tabsRef.current.open({
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
  }, [applyTab, refreshTabsState, syncActiveTabFromEditor, recordRecentFile, autoLoadParentFolder]);

  /** 外部打开（CLI 参数 / Finder「打开方式」odoc）：按路径直接读入 tab，无对话框 */
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
    syncActiveTabFromEditor();
    const result = await documents.readPath(path);
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(t('msg.openFailed', { error: result.error.message }));
      }
      return;
    }
    const tab = tabsRef.current.open({
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
  }, [applyTab, refreshTabsState, syncActiveTabFromEditor, recordRecentFile, autoLoadParentFolder]);

  // D2：导入（Typora File→Import）：pandoc 将 docx/odt/rtf/epub/html/tex 等
  // 转为 Markdown 落盘，并在新标签页打开。二进制输入不经文本读取，直接传路径给 pandoc。
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
  const openMdLink = useCallback(async (dest: string) => {
    // dest 可能带 %XX 转义（拖拽建链/外部工具生成）→ 解码后再拆锚点
    let decoded = dest;
    try { decoded = decodeURIComponent(dest); } catch { /* 保留原样（含裸 % 等） */ }
    const hashIndex = decoded.indexOf('#');
    const pathPart = hashIndex === -1 ? decoded : decoded.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? '' : decoded.slice(hashIndex + 1);
    if (pathPart === '') return;
    const current = filePathRef.current;
    const target = current !== null ? `${fileTreeDirname(current)}/${pathPart}` : pathPart;
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
    const frame = containerRef.current?.querySelector('iframe');
    const win = frame?.contentWindow as (Window & { __MELLOW_CONTEXT_ACTIONS__?: EditorContextActions }) | null;
    const items: ContextMenuItem[] = [
      { label: t('contextmenu.editorCut'), enabled: req.hasSelection, onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.cut() },
      { label: t('contextmenu.editorCopy'), enabled: req.hasSelection, onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.copy() },
      { label: t('contextmenu.editorPaste'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.paste() },
    ];
    if (req.kind === 'link' && req.url !== undefined) {
      items.push({
        label: t('contextmenu.editorOpenLink'),
        onClick: () => { void openerRef.current?.openUrl(req.url as string); },
      });
    }
    if (req.kind === 'wikilink' && req.name !== undefined) {
      items.push({
        label: t('contextmenu.editorOpenWikilink', { name: req.name }),
        onClick: () => { void openWikilinkRef.current(req.name as string); },
      });
    }
    if (req.kind === 'image' && req.src !== undefined) {
      items.push(
        { label: t('contextmenu.editorImageOpen'), onClick: () => { void handleImageAction({ src: req.src as string, action: 'open' }); } },
        { label: t('contextmenu.editorImageReveal'), onClick: () => { void handleImageAction({ src: req.src as string, action: 'reveal' }); } },
        { label: t('contextmenu.editorImageCopyPath'), onClick: () => { void handleImageAction({ src: req.src as string, action: 'copyPath' }); } },
        { label: t('contextmenu.editorImageRename'), onClick: () => { void handleImageAction({ src: req.src as string, action: 'rename' }); } },
      );
    }
    if (req.kind === 'table') {
      items.push(
        { label: t('contextmenu.tableAddRowAbove'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('addRowAbove') },
        { label: t('contextmenu.tableAddRowBelow'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('addRowBelow') },
        { label: t('contextmenu.tableDeleteRow'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('deleteRow') },
        { label: t('contextmenu.tableAddColumnLeft'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('addColumnLeft') },
        { label: t('contextmenu.tableAddColumnRight'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('addColumnRight') },
        { label: t('contextmenu.tableDeleteColumn'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('deleteColumn') },
        { label: t('contextmenu.tableMoveRowUp'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('moveRowUp') },
        { label: t('contextmenu.tableMoveRowDown'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('moveRowDown') },
        { label: t('contextmenu.tableMoveColumnLeft'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('moveColumnLeft') },
        { label: t('contextmenu.tableMoveColumnRight'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('moveColumnRight') },
        { label: t('contextmenu.tableCopyTable'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('copyTable') },
        { label: t('contextmenu.tableTidy'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('tidy') },
        { label: t('contextmenu.tableDeleteTable'), onClick: () => win?.__MELLOW_CONTEXT_ACTIONS__?.tableOp('deleteTable') },
      );
    }
    setContextMenu({ x: req.x, y: req.y, items });
  }, [handleImageAction, t]);
  const handleEditorContextMenuRef = useRef(handleEditorContextMenu);
  handleEditorContextMenuRef.current = handleEditorContextMenu;

  // 欢迎屏：异步检测最近文件是否存在（缺失 → 置灰 + 「已删除」标记）
  useEffect(() => {
    const fs = fileServiceRef.current;
    if (fs === null || recentFiles.length === 0) return;
    let cancelled = false;
    void (async () => {
      const map: Record<string, boolean> = {};
      for (const entry of recentFiles) {
        const r = await fs.exists(entry.path);
        if (!cancelled) map[entry.path] = !r.ok || !r.value;
      }
      if (!cancelled) setRecentMissing(map);
    })();
    return () => { cancelled = true; };
  }, [recentFiles]);

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
    tabsRef.current.updateActive({
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
    try {
      if (localStorage.getItem('mellow.file.autosave') === '0') return;
    } catch { /* 默认开启 */ }
    await handleSave();
  }, [handleSave]);
  maybeAutoSaveRef.current = maybeAutoSave;

  const handleSaveAs = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    const result = await documents.save(null, content, { encoding: meta.encoding, eol: meta.eol });
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
    tabsRef.current.updateActive({
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

  const confirmCloseTabs = useCallback((closing: DocumentTab[]): boolean => {
    const dirtyTabs = closing.filter((tab) => tab.dirty);
    if (dirtyTabs.length === 0) return true;
    const names = dirtyTabs.map((tab) => tab.title).join('、');
    return window.confirm(t('dialog.closeTabsDirty', { names }));
  }, []);

  /** 保存全部（Typora 文件→保存全部）：active 走 handleSave（含冲突校验），其余按 tab.content 落盘 */
  const handleSaveAll = useCallback(async () => {
    const documents = documentsRef.current;
    if (!documents) return;
    await handleSave(); // active tab 先存（e2e 主路径）
    const activeId = tabsRef.current.active?.id;
    for (const tab of tabsRef.current.all) {
      if (tab.id === activeId || !tab.dirty || tab.path === null) continue;
      const result = await documents.save(tab.path, tab.content, { encoding: tab.encoding, eol: tab.eol });
      if (!result.ok) {
        setStatusText(t('msg.saveFailed', { error: result.error.message }));
        continue;
      }
      tabsRef.current.update(tab.id, {
        dirty: false,
        diskState: result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
          ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
          : null,
      });
    }
    refreshTabsState();
  }, [handleSave, refreshTabsState]);

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
    tabsRef.current.updateActive({ ...currentTabPatch(host), content: r.value.content, dirty: false, diskState: diskStateRef.current });
    refreshTabsState();
    setStatusText(t('msg.reloadedDisk'));
    refreshStats(host);
  }, [currentTabPatch, refreshStats, refreshTabsState, setDirty]);

  const ensureOneTab = useCallback(async () => {
    if (tabsRef.current.all.length > 0) return tabsRef.current.active;
    const tab = tabsRef.current.open({ path: null, title: t('tab.untitled'), content: '', dirty: false, documentId: crypto.randomUUID(), encoding: 'utf-8', eol: '\n', diskState: null });
    refreshTabsState();
    await applyTab(tab);
    return tab;
  }, [applyTab, refreshTabsState]);

  const handleSelectTab = useCallback(async (id: string) => {
    if (id === activeTabId) return;
    syncActiveTabFromEditor();
    const tab = tabsRef.current.setActive(id);
    refreshTabsState();
    if (tab) await applyTab(tab);
  }, [activeTabId, applyTab, refreshTabsState, syncActiveTabFromEditor]);

  /** 标签页循环切换（Typora 窗口→显示下一个/上一个标签页） */
  const handleCycleTab = useCallback(async (delta: 1 | -1) => {
    const all = tabsRef.current.all;
    if (all.length < 2) return;
    const idx = tabsRef.current.activeIndex;
    if (idx < 0) return;
    const next = all[(idx + delta + all.length) % all.length];
    await handleSelectTab(next.id);
  }, [handleSelectTab]);

  const handleCloseTab = useCallback(async (id: string) => {
    syncActiveTabFromEditor();
    const tab = tabsRef.current.all.find((t) => t.id === id);
    if (tab === undefined || !confirmCloseTabs([tab])) return;
    const result = tabsRef.current.close(id);
    refreshTabsState();
    const next = result.active ?? await ensureOneTab();
    if (next) await applyTab(next);
  }, [applyTab, confirmCloseTabs, ensureOneTab, refreshTabsState, syncActiveTabFromEditor]);

  const handleCloseOthers = useCallback(async () => {
    const active = tabsRef.current.active;
    if (active === null) return;
    syncActiveTabFromEditor();
    const closing = tabsRef.current.all.filter((tab) => tab.id !== active.id);
    if (!confirmCloseTabs(closing)) return;
    tabsRef.current.closeOthers(active.id);
    refreshTabsState();
    const next = tabsRef.current.active;
    if (next) await applyTab(next);
  }, [applyTab, confirmCloseTabs, refreshTabsState, syncActiveTabFromEditor]);

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
      tabsRef.current.updateActive({
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
    const active = tabsRef.current.active;
    const dirty = active !== null && active.dirty;
    const message = dirty ? t('dialog.trashConfirmDirty', { path }) : t('dialog.trashConfirm', { path });
    if (!window.confirm(message)) return;
    const r = await svc.trash(path);
    if (!r.ok) {
      setStatusText(t('msg.deleteFailed', { error: r.error.message }));
      return;
    }
    setStatusText(t('msg.trashed'));
    // 强制关闭当前 tab（文件已删除，不走 dirty 保存确认——保存会重新创建已删文件）
    if (active !== null) {
      const result = tabsRef.current.close(active.id);
      refreshTabsState();
      const next = result.active ?? await ensureOneTab();
      if (next) await applyTab(next);
    }
    await refreshFilesSidebar();
  }, [applyTab, ensureOneTab, refreshFilesSidebar, refreshTabsState]);

  const handleCloseRight = useCallback(async () => {
    const active = tabsRef.current.active;
    if (active === null) return;
    syncActiveTabFromEditor();
    const index = tabsRef.current.activeIndex;
    const closing = tabsRef.current.all.slice(index + 1);
    if (!confirmCloseTabs(closing)) return;
    tabsRef.current.closeRight(active.id);
    refreshTabsState();
  }, [confirmCloseTabs, refreshTabsState, syncActiveTabFromEditor]);

  /** 全部关闭（Typora 文件→全部关闭 ⌥⌘W）：关全部标签后回落到单个未命名标签 */
  const handleCloseAll = useCallback(async () => {
    if (tabsRef.current.all.length === 0) return;
    syncActiveTabFromEditor();
    if (!confirmCloseTabs(tabsRef.current.all)) return;
    for (const tab of [...tabsRef.current.all]) tabsRef.current.close(tab.id);
    refreshTabsState();
    const next = tabsRef.current.active ?? await ensureOneTab();
    if (next) await applyTab(next);
  }, [applyTab, confirmCloseTabs, ensureOneTab, refreshTabsState, syncActiveTabFromEditor]);

  const handleReopenClosed = useCallback(async () => {
    syncActiveTabFromEditor();
    const tab = tabsRef.current.reopenClosed();
    if (tab === null) {
      setStatusText(t('msg.noReopenTab'));
      return;
    }
    refreshTabsState();
    await applyTab(tab);
    setStatusText(`已重新打开 ${tab.title}`);
  }, [applyTab, refreshTabsState, syncActiveTabFromEditor]);

  const handleDropTab = useCallback((targetId: string, draggedId: string | null) => {
    if (draggedId === null || draggedId === targetId) return;
    syncActiveTabFromEditor();
    const targetIndex = tabsRef.current.all.findIndex((tab) => tab.id === targetId);
    tabsRef.current.reorder(draggedId, targetIndex);
    refreshTabsState();
  }, [refreshTabsState, syncActiveTabFromEditor]);

  /** 字号缩放（⇧⌘0 实际大小 / ⇧⌘= 放大 / ⇧⌘- 缩小，Typora 视图菜单对齐）：
   *  读写 editor.fontSize 设置（单一真源）+ live apply；到达 min/max 后静默停。
   *  R2-4 口径统一：px 旁显示百分比换算（默认 17px = 100%，Reader zoom 同基准）。 */
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
        if (def.id === 'editor.fontSize') host?.setEditorConfig('setFontSize', { fontSize: Number(value) });
        else if (def.id === 'editor.fontFamily') host?.setEditorConfig('setFontFace', { family: String(value) });
        else if (def.id === 'editor.lineNumbers') host?.setEditorConfig('setShowLineNumbers', { enabled: Boolean(value) });
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
      case 'view.toolbar.on':
        void dispatchCommand(value ? 'view.toolbar.on' : 'view.toolbar.off', 'menu');
        break;
      case 'slash.toggleEnabled':
        setSlashEnabled(Boolean(value));
        break;
      case 'settings.fileTreeOptions':
        setFileTreeOption(def.id === 'file.showHidden' ? { showHidden: Boolean(value) } : { showNonMarkdown: Boolean(value) });
        break;
      case 'settings.sidebarMode':
        setSidebarMode(String(value) as 'files' | 'outline' | 'search');
        break;
      case 'settings.image.assetDir':
        setAssetDir(String(value));
        break;
      case 'file.openUserCss':
        // 主题文件夹入口（Typora 偏好→外观；action 型设置 → 命令派发）
        void dispatchCommand('file.openUserCss');
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
        // 写作宽度：编辑器 iframe max-width（PRD §18：680/820/980/Auto，默认 820）
        const v = String(value);
        document.documentElement.style.setProperty('--mellow-writing-width', v === 'auto' ? 'none' : v + 'px');
        break;
      }
      case 'settings.lineHeight': {
        // 行高：编辑器内容行高（PRD §18：1.55–1.75，默认 1.65）
        document.documentElement.style.setProperty('--mellow-line-height', String(Number(value) || 1.65));
        break;
      }
      case 'settings.autosave':
        setStatusText(Boolean(value) ? t('msg.autosaveOn') : t('msg.autosaveOff'));
        break;
      case 'settings.autoHideTabBar':
        setAutoHideTabBar(Boolean(value));
        break;
      case 'settings.reopenLast':
        // 下次启动生效（当前会话不受影响）
        setStatusText(Boolean(value) ? t('msg.reopenLastOn') : t('msg.reopenLastOff'));
        break;
      case 'settings.engineFeature': {
        // 语法特性开关（PRD §94）：重建 JSON → mellow.engine.features（bundle loader 读取）
        const keys = ['highlight', 'supSub', 'emoji', 'alerts', 'math', 'mermaid', 'toc', 'footnote', 'wikilink', 'html', 'yaml'];
        const features: Record<string, boolean> = {};
        for (const k of keys) {
          try { features[k] = localStorage.getItem(`mellow.engine.features.${k}`) === '1'; } catch { features[k] = true; }
        }
        try { localStorage.setItem('mellow.engine.features', JSON.stringify(features)); } catch { /* noop */ }
        // PRD §K.2：语法开关在编辑器加载时生效 → 提供「重新加载编辑器」动作（会话经 localStorage 恢复）
        setToast({ message: t('settings.markdownReloadHint'), action: { label: t('settings.markdownReload'), run: () => window.location.reload() } });
        break;
      }
      default:
        break;
    }
  }, [applyThemeById, dispatchCommand, setAssetDir, setFileTreeOption, setLocaleSettingPersist, setSidebarMode, setSlashEnabled]);
  // PRD §101 Auto Save：窗口失焦时保存 dirty 文档（默认开启，设置可关闭）
  useEffect(() => {
    const onBlur = () => { void maybeAutoSaveRef.current?.(); };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);
  // 外部打开（CLI 参数 / Finder「打开方式」odoc）：Rust 侧 emit mellow://open-file
  // PRD §80 CLI 模式：--reader 打开后进 Reader；--source 打开后切源码模式
  const openPathWithMode = useCallback((req: { path: string; mode?: string }) => {
    void (async () => {
      await openPathInTab(req.path);
      if (req.mode === 'reader') openReader();
      else if (req.mode === 'source') engineSourceToggle();
    })();
  }, [engineSourceToggle, openPathInTab, openReader]);
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
  useEffect(() => {
    const registry = new CommandRegistry();
    const always = () => true;
    const hasWorkspace = () => fileTreeRoot !== null;
    const commands: Command[] = [
      { id: 'extensions.list', localizedTitle: { zh: '扩展列表', en: 'Extensions List' }, category: 'extension', context: { scope: 'global' }, enabled: always, execute: () => {
        const reg = extensionRegistryRef.current;
        if (reg === null) return;
        const list = reg.list().map((e) => `${e.enabled ? '✅' : '⛔'} ${e.name} (${e.id}) v${e.version}${e.setupError !== undefined ? ` [${e.setupError}]` : ''}`).join('；');
        setStatusText(`扩展: ${list === '' ? '无' : list}`);
      } },
      { id: 'file.new', localizedTitle: { zh: '新建', en: 'New' }, category: 'file', shortcut: { mac: 'Cmd+T', winLinux: 'Ctrl+Alt+T' }, context: { scope: 'global' }, enabled: always, execute: () => void handleNew() },
      { id: 'file.open', localizedTitle: { zh: '打开…', en: 'Open…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => void handleOpen() },
      { id: 'file.save', localizedTitle: { zh: '保存', en: 'Save' }, category: 'file', shortcut: { mac: 'Cmd+S', winLinux: 'Ctrl+S' }, context: { scope: 'document' }, enabled: always, execute: () => void handleSave() },
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
      { id: 'tabs.close', localizedTitle: { zh: '关闭标签页', en: 'Close Tab' }, category: 'file', shortcut: { mac: 'Cmd+W', winLinux: 'Ctrl+W' }, context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => { const active = tabsRef.current.active; if (active) void handleCloseTab(active.id); } },
      { id: 'tabs.closeOthers', localizedTitle: { zh: '关闭其他', en: 'Close Others' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCloseOthers() },
      { id: 'tabs.closeRight', localizedTitle: { zh: '关闭右侧', en: 'Close Right' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCloseRight() },
      { id: 'tabs.reopenClosed', localizedTitle: { zh: '重开关闭', en: 'Reopen Closed' }, category: 'file', shortcut: { mac: 'Cmd+Shift+T', winLinux: 'Ctrl+Shift+T' }, context: { scope: 'global' }, enabled: always, execute: () => void handleReopenClosed() },
      // B2 文件菜单补全（Typora 对齐：全部关闭 / 保存全部 / 从磁盘重新加载）
      { id: 'file.closeAll', localizedTitle: { zh: '全部关闭', en: 'Close All' }, category: 'file', shortcut: { mac: 'Cmd+Alt+W', winLinux: 'Ctrl+Shift+W' }, context: { scope: 'document' }, enabled: () => tabsRef.current.all.length > 0, execute: () => void handleCloseAll() },
      { id: 'file.saveAll', localizedTitle: { zh: '保存全部打开的文件…', en: 'Save All Open Files…' }, category: 'file', shortcut: { mac: 'Cmd+Alt+S', winLinux: 'Ctrl+Alt+S' }, context: { scope: 'document' }, enabled: always, execute: () => void handleSaveAll() },
      { id: 'file.reloadFromDisk', localizedTitle: { zh: '从磁盘重新加载', en: 'Reload from Disk' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => void handleReloadFromDisk() },
      // B2 窗口菜单补全（Typora 对齐：显示下一个/上一个标签页）
      { id: 'tabs.next', localizedTitle: { zh: '显示下一个标签页', en: 'Show Next Tab' }, category: 'window', shortcut: { mac: 'Ctrl+Tab', winLinux: 'Ctrl+Tab' }, context: { scope: 'global' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCycleTab(1) },
      { id: 'tabs.prev', localizedTitle: { zh: '显示上一个标签页', en: 'Show Previous Tab' }, category: 'window', shortcut: { mac: 'Ctrl+Shift+Tab', winLinux: 'Ctrl+Shift+Tab' }, context: { scope: 'global' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCycleTab(-1) },
      { id: 'workspace.openFolder', localizedTitle: { zh: '打开文件夹…', en: 'Open Folder…' }, category: 'workspace', context: { scope: 'global' }, enabled: always, execute: () => void chooseFileTreeRoot() },
      { id: 'workspace.refresh', localizedTitle: { zh: '刷新文件', en: 'Refresh Files' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void refreshFilesSidebar() },
      { id: 'quickOpen.open', localizedTitle: { zh: 'Quick Open', en: 'Quick Open' }, category: 'navigation', shortcut: { mac: 'Cmd+Shift+O', winLinux: 'Ctrl+P' }, context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void openQuickOpen() },
      { id: 'search.global', localizedTitle: { zh: '全局搜索', en: 'Global Search' }, category: 'search', shortcut: { mac: 'Cmd+Shift+F', winLinux: 'Ctrl+Shift+F' }, context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => openGlobalSearch() },
      { id: 'view.focus.cycle', localizedTitle: { zh: '切换 Focus Mode', en: 'Toggle Focus Mode' }, category: 'view', shortcut: { mac: 'F8', winLinux: 'F8' }, context: { scope: 'document' }, enabled: always, execute: () => cycleFocusMode() },
      { id: 'view.focus.off', localizedTitle: { zh: 'Focus Mode：关闭', en: 'Focus Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('off') },
      { id: 'view.focus.line', localizedTitle: { zh: 'Focus Mode：当前行', en: 'Focus Mode: Current Line' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('line') },
      { id: 'view.focus.paragraph', localizedTitle: { zh: 'Focus Mode：当前段落', en: 'Focus Mode: Current Paragraph' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('paragraph') },
      { id: 'view.typewriter.cycle', localizedTitle: { zh: '切换 Typewriter Mode', en: 'Toggle Typewriter Mode' }, category: 'view', shortcut: { mac: 'F9', winLinux: 'F9' }, context: { scope: 'document' }, enabled: always, execute: () => toggleTypewriter() },
      { id: 'view.source.toggle', localizedTitle: { zh: '源码模式', en: 'Source Mode' }, category: 'view', shortcut: { mac: 'Cmd+/', winLinux: 'Ctrl+/' }, context: { scope: 'global' }, enabled: always, execute: () => engineSourceToggle() },
      { id: 'view.zoomReset', localizedTitle: { zh: '实际大小', en: 'Actual Size' }, category: 'view', shortcut: { mac: 'Cmd+Shift+0', winLinux: 'Ctrl+Shift+0' }, context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(0) },
      { id: 'view.zoomIn', localizedTitle: { zh: '放大', en: 'Zoom In' }, category: 'view', shortcut: { mac: 'Cmd+Shift+=', winLinux: 'Ctrl+Shift+=' }, context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(1) },
      { id: 'view.zoomOut', localizedTitle: { zh: '缩小', en: 'Zoom Out' }, category: 'view', shortcut: { mac: 'Cmd+Shift+-', winLinux: 'Ctrl+Shift+-' }, context: { scope: 'global' }, enabled: always, execute: () => adjustFontSize(-1) },
      { id: 'view.typewriter.on', localizedTitle: { zh: 'Typewriter Mode：开启', en: 'Typewriter Mode: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !typewriterEnabled, execute: () => setTypewriterMode(true) },
      { id: 'view.typewriter.off', localizedTitle: { zh: 'Typewriter Mode：关闭', en: 'Typewriter Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => typewriterEnabled, execute: () => setTypewriterMode(false) },
      { id: 'view.toolbar.toggle', localizedTitle: { zh: '切换格式工具栏', en: 'Toggle Format Toolbar' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => toggleSelectionToolbar() },
      // R2-2 字数统计窗口（Typora 视图→字数统计窗口）
      { id: 'view.wordCount', localizedTitle: { zh: '字数统计窗口', en: 'Word Count Window' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => {
        setWordCountOpen((v) => !v);
        const host = hostRef.current;
        if (host !== null) refreshStats(host);
      } },
      { id: 'view.toolbar.on', localizedTitle: { zh: '格式工具栏：启用', en: 'Format Toolbar: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(true) },
      { id: 'view.toolbar.off', localizedTitle: { zh: '格式工具栏：禁用', en: 'Format Toolbar: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(false) },
      { id: 'reader.open', localizedTitle: { zh: '用 Reader 打开', en: 'Open in Reader' }, category: 'view', context: { scope: 'document' }, enabled: () => !readerOpen && tabsRef.current.active !== null, execute: () => openReader() },
      { id: 'reader.openInEditor', localizedTitle: { zh: '用编辑器打开', en: 'Open in Editor' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => closeReader() },
      { id: 'reader.zoomIn', localizedTitle: { zh: 'Reader 放大', en: 'Reader Zoom In' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom + 0.1) },
      { id: 'reader.zoomOut', localizedTitle: { zh: 'Reader 缩小', en: 'Reader Zoom Out' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom - 0.1) },
      { id: 'reader.zoomReset', localizedTitle: { zh: 'Reader 重置缩放', en: 'Reader Reset Zoom' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(1) },
      { id: 'reader.print', localizedTitle: { zh: '打印 Reader', en: 'Print Reader' }, category: 'file', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => { void invoke('print_window').catch(() => window.print()); } },
      // RC F2：打印入口（对齐 Typora Cmd+P；golden journey #18）
      { id: 'file.print', localizedTitle: { zh: '打印…', en: 'Print…' }, category: 'file', context: { scope: 'global' }, shortcut: { mac: 'Cmd+P', winLinux: 'Ctrl+Alt+P' }, enabled: always, execute: () => { void invoke('print_window').catch(() => window.print()); } },
      { id: 'file.openWith', localizedTitle: { zh: '打开方式…', en: 'Open With…' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => openOpenWith() },
      { id: 'file.info', localizedTitle: { zh: '文件信息', en: 'File Info' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => openFileInfo() },
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
      { id: 'export.html', localizedTitle: { zh: '导出 HTML…', en: 'Export HTML…' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => void handleExportHtml() },
      { id: 'export.htmlPlain', localizedTitle: { zh: '导出 HTML（无样式）…', en: 'Export HTML (without styles)…' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => void handleExportHtmlPlain() },
      // D2：pandoc 导出格式全量（Typora 导出子菜单；表定义于 handleExportPandoc 侧）
      ...PANDOC_EXPORT_COMMANDS.map(({ id, format, ext, zh, en }) => ({
        id,
        localizedTitle: { zh, en },
        category: 'file',
        context: { scope: 'document' as const },
        enabled: () => tabsRef.current.active !== null,
        execute: () => void handleExportPandoc(format, ext),
      })),
      // D2：使用上一次设置导出（Typora ⌃E）
      { id: 'export.repeat', localizedTitle: { zh: '使用上一次设置导出', en: 'Export with Last Settings' }, category: 'file', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+E', winLinux: 'Ctrl+E' }, enabled: () => tabsRef.current.active !== null, execute: () => void handleExportRepeat() },
      // D2：导入（Typora File→Import；pandoc → Markdown 新标签页）
      { id: 'file.import', localizedTitle: { zh: '导入…', en: 'Import…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => void handleImportDocument() },
      // 导出图片 PNG/JPEG（PRD §74：width / quality / long-image protection）
      { id: 'export.image', localizedTitle: { zh: '导出图片（PNG/JPEG）…', en: 'Export Image (PNG/JPEG)…' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => void handleExportImage() },
      // RC F1：PDF 导出（golden journey #19）
      { id: 'export.pdf', localizedTitle: { zh: '导出 PDF…', en: 'Export PDF…' }, category: 'file', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+Cmd+P' }, enabled: () => tabsRef.current.active !== null, execute: () => void handleExportPdf() },
      { id: 'image.moveAll', localizedTitle: { zh: '图片：移动全部到 asset 目录', en: 'Images: Move All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('moveAll') },
      { id: 'image.copyAll', localizedTitle: { zh: '图片：复制全部到 asset 目录', en: 'Images: Copy All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('copyAll') },
      { id: 'image.downloadRemote', localizedTitle: { zh: '图片：下载远程到 asset 目录', en: 'Images: Download Remote' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('downloadRemote') },
      { id: 'image.uploadAll', localizedTitle: { zh: '图片：上传图片', en: 'Images: Upload All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('uploadAll') },
      { id: 'image.setAssetDir', localizedTitle: { zh: '图片：设置 asset 目录…', en: 'Images: Set Asset Directory…' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => { const v = window.prompt(t('prompt.assetDir'), assetDir); if (v !== null && v.trim() !== '') setAssetDir(v.trim()); } },
      { id: 'window.minimize', localizedTitle: { zh: '最小化窗口', en: 'Minimize Window' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.minimize(); } },
      { id: 'window.maximizeToggle', localizedTitle: { zh: '最大化 / 还原窗口', en: 'Toggle Maximize' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.toggleMaximize(); } },
      { id: 'window.fullscreen', localizedTitle: { zh: '切换全屏', en: 'Toggle Fullscreen' }, category: 'system', shortcut: { mac: 'Ctrl+Cmd+F', winLinux: 'F11' }, context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.isFullscreen().then((r) => { if (r.ok) void windowServiceRef.current?.setFullscreen(!r.value); }); } },
      // B2 显示菜单补全（Typora 对齐：保持窗口在最前端，toggle）
      { id: 'window.alwaysOnTop', localizedTitle: { zh: '保持窗口在最前端', en: 'Keep Window on Top' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.isAlwaysOnTop().then((r) => { if (r.ok) void windowServiceRef.current?.setAlwaysOnTop(!r.value); }); } },
      { id: 'window.close', localizedTitle: { zh: '关闭窗口', en: 'Close Window' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.close(); } },
      { id: 'file.revealInFinder', localizedTitle: { zh: '在 Finder 中显示', en: 'Reveal in Finder' }, category: 'file', context: { scope: 'document' }, enabled: () => filePathRef.current !== null, execute: () => { if (filePathRef.current !== null) void handleTreeReveal(filePathRef.current); } },
      { id: 'commandPalette.open', localizedTitle: { zh: '命令面板', en: 'Command Palette' }, category: 'system', shortcut: COMMAND_PALETTE_SHORTCUT, context: { scope: 'global' }, enabled: always, execute: () => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteVisible(true); } },
      { id: 'settings.open', localizedTitle: { zh: '设置…', en: 'Settings…' }, category: 'system', shortcut: { mac: 'Cmd+,', winLinux: 'Ctrl+,' }, context: { scope: 'global' }, enabled: always, execute: () => setSettingsOpen(true) },
      { id: 'theme.system', localizedTitle: { zh: '主题：跟随系统', en: 'Theme: System' }, category: 'view', context: { scope: 'global' }, enabled: () => themeSettings.mode !== 'system', execute: () => setThemeSettingsAndPersist({ ...themeSettings, mode: 'system' }) },
      { id: 'theme.cycle', localizedTitle: { zh: '主题：下一个', en: 'Theme: Next' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { const next = BUILTIN_THEMES[(BUILTIN_THEMES.findIndex((t) => t.id === activeTheme.id) + 1) % BUILTIN_THEMES.length]; applyThemeById(next.id); } },
      { id: 'locale.set.zh-CN', localizedTitle: { zh: '语言：简体中文', en: 'Language: 简体中文' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'zh-CN', execute: () => setLocaleSettingPersist('zh-CN') },
      { id: 'locale.set.en-US', localizedTitle: { zh: '语言：English', en: 'Language: English' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'en-US', execute: () => setLocaleSettingPersist('en-US') },
      { id: 'locale.set.system', localizedTitle: { zh: '语言：跟随系统', en: 'Language: Follow System' }, category: 'system', context: { scope: 'global' }, enabled: () => localeSetting !== 'system', execute: () => setLocaleSettingPersist('system') },
      { id: 'slash.open', localizedTitle: { zh: 'Slash 命令', en: 'Slash Commands' }, category: 'system', context: { scope: 'document' }, enabled: always, execute: () => openSlashUi() },
      { id: 'slash.toggleEnabled', localizedTitle: { zh: 'Slash Commands：启用/禁用', en: 'Slash Commands: Toggle' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => toggleSlashEnabled() },
      { id: 'insert.heading', localizedTitle: { zh: '标题', en: 'Heading' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['h1', 'bt'] } }, enabled: always, execute: () => replaceSlashTrigger('# ') },
      { id: 'insert.list', localizedTitle: { zh: '列表', en: 'List' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['ul', 'lb'] } }, enabled: always, execute: () => replaceSlashTrigger('- ') },
      { id: 'insert.task', localizedTitle: { zh: '任务', en: 'Task' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['todo', 'rw'] } }, enabled: always, execute: () => replaceSlashTrigger('- [ ] ') },
      { id: 'insert.quote', localizedTitle: { zh: '引用', en: 'Quote' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['blockquote', 'yy'] } }, enabled: always, execute: () => replaceSlashTrigger('> ') },
      { id: 'insert.table', localizedTitle: { zh: '表格', en: 'Table' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['bg'] } }, shortcut: { mac: 'Cmd+Alt+T', winLinux: 'Ctrl+Alt+T' }, enabled: always, execute: () => replaceSlashTrigger('\n|  |  |\n|---|---|\n|  |  |') },
      { id: 'insert.code', localizedTitle: { zh: '代码块', en: 'Code Block' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['fence', 'dm'] } }, enabled: always, execute: () => replaceSlashTrigger('```\n\n```') },
      { id: 'insert.math', localizedTitle: { zh: '数学公式', en: 'Math' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['formula', 'sx'] } }, enabled: always, execute: () => replaceSlashTrigger('$$\n\n$$') },
      { id: 'insert.mermaid', localizedTitle: { zh: 'Mermaid 图表', en: 'Mermaid Diagram' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['diagram', 'tt'] } }, enabled: always, execute: () => replaceSlashTrigger('```mermaid\ngraph TD\n  A --> B\n```') },
      { id: 'insert.alert', localizedTitle: { zh: '提示框', en: 'Alert' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['note', 'jg'] } }, enabled: always, execute: () => replaceSlashTrigger('> [!NOTE]\n> ') },
      { id: 'insert.image', localizedTitle: { zh: '图片', en: 'Image' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['img', 'tp'] } }, shortcut: { mac: 'Cmd+Ctrl+I', winLinux: 'Ctrl+Alt+I' }, enabled: always, execute: () => replaceSlashTrigger('![]( )') },
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
      { id: 'updater.check', localizedTitle: { zh: '检查更新', en: 'Check for Updates' }, category: 'app', context: { scope: 'global' }, enabled: () => isTauri(), execute: () => void runUpdateCheck() },
      // B2 文件菜单补全：清除最近文件（「打开最近文件」子菜单）
      { id: 'recent.clear', localizedTitle: { zh: '清除最近文件', en: 'Clear Recent Files' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => { setRecentFiles([]); try { localStorage.removeItem(RECENT_FILES_KEY); } catch { /* noop */ } } },
      // 编辑：查找 / 替换（Typora 对齐；Ctrl+H 由引擎 keymap 处理）
      { id: 'search.find', localizedTitle: { zh: '查找…', en: 'Find…' }, category: 'edit', context: { scope: 'global' }, shortcut: { mac: 'Cmd+F', winLinux: 'Ctrl+F' }, enabled: always, execute: () => engineSearch('find') },
      // Typora：替换 ⌥⌘F（⌘H 与 macOS 系统隐藏冲突，作为别名兜底）；Win/Linux Ctrl+H
      { id: 'search.replace', localizedTitle: { zh: '替换…', en: 'Replace…' }, category: 'edit', context: { scope: 'global' }, shortcut: { mac: 'Cmd+Alt+F', winLinux: 'Ctrl+H' }, shortcutAliases: [{ mac: 'Cmd+H' }], enabled: always, execute: () => engineSearch('replace') },
      // B2 编辑菜单补全（Typora 对齐：查找下一个/上一个 ⌘G / ⇧⌘G）
      { id: 'search.findNext', localizedTitle: { zh: '查找下一个', en: 'Find Next' }, category: 'edit', context: { scope: 'global' }, shortcut: { mac: 'Cmd+G', winLinux: 'Ctrl+G' }, shortcutAliases: [{ winLinux: 'F3' }, { mac: 'F3' }], enabled: always, execute: () => engineSearch('findNext') },
      { id: 'search.findPrevious', localizedTitle: { zh: '查找上一个', en: 'Find Previous' }, category: 'edit', context: { scope: 'global' }, shortcut: { mac: 'Cmd+Shift+G', winLinux: 'Ctrl+Shift+G' }, shortcutAliases: [{ winLinux: 'Shift+F3' }, { mac: 'Shift+F3' }], enabled: always, execute: () => engineSearch('findPrevious') },
      // B2 编辑菜单补全（Typora 对齐：复制为 Markdown ⇧⌘C / 粘贴为纯文本 ⇧⌘V）
      { id: 'edit.copyMarkdown', localizedTitle: { zh: '复制为 Markdown', en: 'Copy as Markdown' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Shift+C', winLinux: 'Ctrl+Shift+C' }, enabled: always, execute: () => engineClipboard('copyMarkdown') },
      { id: 'edit.pastePlain', localizedTitle: { zh: '粘贴为纯文本', en: 'Paste as Plain Text' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Shift+V', winLinux: 'Ctrl+Shift+V' }, enabled: always, execute: () => engineClipboard('pastePlain') },
      // ⇧⌘⌫ 删除行（Typora 编辑→删除行，引擎 applyDeleteLine）
      { id: 'edit.deleteLine', localizedTitle: { zh: '删除行', en: 'Delete Line' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Shift+Cmd+Backspace', winLinux: 'Ctrl+Shift+Backspace' }, enabled: always, execute: () => engineFormat('deleteLine') },
      // D1-4 选择命令（Typora 编辑→选择：⌘L 行 / ⌥⌘P 段落或块）
      { id: 'edit.selectLine', localizedTitle: { zh: '选择行', en: 'Select Line' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+L', winLinux: 'Ctrl+L' }, enabled: always, execute: () => { hostRef.current?.selectLine(); } },
      { id: 'edit.selectParagraph', localizedTitle: { zh: '选择段落或块', en: 'Select Paragraph or Block' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+P', winLinux: 'Ctrl+Alt+P' }, enabled: always, execute: () => { hostRef.current?.selectParagraph(); } },
      // D3 选择子菜单补全（Typora 编辑→选择）
      { id: 'edit.selectWord', localizedTitle: { zh: '选中当前词', en: 'Select Word' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+D', winLinux: 'Ctrl+D' }, enabled: always, execute: () => { hostRef.current?.selectWord(); } },
      { id: 'edit.selectFormatSpan', localizedTitle: { zh: '选中当前格式文本', en: 'Select Format Span' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+E', winLinux: 'Ctrl+E' }, enabled: always, execute: () => { hostRef.current?.selectFormatSpan(); } },
      { id: 'edit.gotoDocStart', localizedTitle: { zh: '跳转到文首', en: 'Go to Document Start' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+ArrowUp', winLinux: 'Ctrl+Home' }, enabled: always, execute: () => { hostRef.current?.gotoDocStart(); } },
      { id: 'edit.gotoDocEnd', localizedTitle: { zh: '跳转到文末', en: 'Go to Document End' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+ArrowDown', winLinux: 'Ctrl+End' }, enabled: always, execute: () => { hostRef.current?.gotoDocEnd(); } },
      { id: 'edit.gotoSelection', localizedTitle: { zh: '跳转到所选内容', en: 'Go to Selection' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+J', winLinux: 'Ctrl+J' }, enabled: always, execute: () => { hostRef.current?.gotoSelection(); } },
      { id: 'edit.gotoLineStart', localizedTitle: { zh: '跳转到行首', en: 'Go to Line Start' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+A', winLinux: 'Home' }, enabled: always, execute: () => { hostRef.current?.gotoLineStart(); } },
      { id: 'edit.gotoLineEnd', localizedTitle: { zh: '跳转到行尾', en: 'Go to Line End' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+ArrowRight', winLinux: 'End' }, enabled: always, execute: () => { hostRef.current?.gotoLineEnd(); } },
      // D3 删除范围子菜单（Typora 编辑→删除范围）
      { id: 'edit.deleteParagraph', localizedTitle: { zh: '删除块', en: 'Delete Block' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+Shift+P', winLinux: 'Ctrl+Alt+Shift+P' }, enabled: always, execute: () => { hostRef.current?.deleteParagraph(); } },
      { id: 'edit.deleteFormatSpan', localizedTitle: { zh: '删除当前格式文本', en: 'Delete Format Span' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+Shift+E', winLinux: 'Ctrl+Alt+Shift+E' }, enabled: always, execute: () => { hostRef.current?.deleteFormatSpan(); } },
      { id: 'edit.deleteWord', localizedTitle: { zh: '删除当前词', en: 'Delete Word' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Shift+Cmd+D', winLinux: 'Ctrl+Shift+D' }, enabled: always, execute: () => { hostRef.current?.deleteWord(); } },
      // D3 上移/下移该行（Typora 编辑菜单 ⌥↑/⌥↓）
      { id: 'edit.moveLineUp', localizedTitle: { zh: '上移该行', en: 'Move Line Up' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Alt+ArrowUp', winLinux: 'Alt+ArrowUp' }, enabled: always, execute: () => { hostRef.current?.moveLineUp(); } },
      { id: 'edit.moveLineDown', localizedTitle: { zh: '下移该行', en: 'Move Line Down' }, category: 'edit', context: { scope: 'document' }, shortcut: { mac: 'Alt+ArrowDown', winLinux: 'Alt+ArrowDown' }, enabled: always, execute: () => { hostRef.current?.moveLineDown(); } },
      // D3 复制/拷贝（Typora 编辑菜单：拷贝图片 / 复制为纯文本 / 复制为 HTML 代码）
      { id: 'edit.copyImage', localizedTitle: { zh: '拷贝图片', en: 'Copy Image' }, category: 'edit', context: { scope: 'document' }, enabled: always, execute: () => void handleCopyImage() },
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
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_spellcheck_state', { checked: next })).catch(() => undefined);
        setStatusText(t(next ? 'msg.spellcheckOn' : 'msg.spellcheckOff'));
      } },
      // R2-1 编辑→替换「智能标点」（Typora parity；设置面板同一真源）
      { id: 'edit.smartPunctuation.toggle', localizedTitle: { zh: '智能标点', en: 'Smart Punctuation' }, category: 'edit', context: { scope: 'global' }, enabled: always, execute: () => {
        const def = settingById('editor.smartPunctuation');
        if (!def) return;
        const next = readSetting(def) !== true;
        writeSetting(def, next);
        hostRef.current?.setSmartPunctuationEnabled(next);
        void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_smart_punct_state', { checked: next })).catch(() => undefined);
        setStatusText(t(next ? 'msg.smartPunctOn' : 'msg.smartPunctOff'));
      } },
      // 格式（Typora 对齐；引擎 applyInlineFormat / 空选区成对插入）
      { id: 'format.bold', localizedTitle: { zh: '粗体', en: 'Bold' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+B', winLinux: 'Ctrl+B' }, enabled: always, execute: () => engineFormat('bold') },
      { id: 'format.italic', localizedTitle: { zh: '斜体', en: 'Italic' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+I', winLinux: 'Ctrl+I' }, enabled: always, execute: () => engineFormat('italic') },
      { id: 'format.strike', localizedTitle: { zh: '删除线', en: 'Strikethrough' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+Shift+`', winLinux: 'Ctrl+Shift+`' }, enabled: always, execute: () => engineFormat('strike') },
      { id: 'format.code', localizedTitle: { zh: '行内代码', en: 'Inline Code' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+`', winLinux: 'Ctrl+`' }, enabled: always, execute: () => engineFormat('code') },
      { id: 'format.link', localizedTitle: { zh: '链接…', en: 'Link…' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+K', winLinux: 'Ctrl+K' }, enabled: always, execute: () => engineFormat('link') },
      // ⌥⌘L 链接引用（Typora 格式→链接引用，引擎 applyReferenceLink）
      { id: 'format.referenceLink', localizedTitle: { zh: '链接引用…', en: 'Link Reference…' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+L', winLinux: 'Ctrl+Alt+L' }, enabled: always, execute: () => engineFormat('referenceLink') },
      { id: 'format.quote', localizedTitle: { zh: '引用', en: 'Blockquote' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+Q', winLinux: 'Ctrl+Alt+Q' }, enabled: always, execute: () => engineFormat('quote') },
      { id: 'format.list', localizedTitle: { zh: '列表', en: 'Bulleted List' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+U', winLinux: 'Ctrl+Alt+U' }, enabled: always, execute: () => engineFormat('list') },
      { id: 'format.orderedList', localizedTitle: { zh: '有序列表', en: 'Ordered List' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+O', winLinux: 'Ctrl+Alt+O' }, enabled: always, execute: () => engineFormat('orderedList') },
      { id: 'format.taskList', localizedTitle: { zh: '任务列表', en: 'Task List' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+X', winLinux: 'Ctrl+Alt+X' }, enabled: always, execute: () => engineFormat('taskList') },
      { id: 'format.codeBlock', localizedTitle: { zh: '代码块', en: 'Code Block' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+C', winLinux: 'Ctrl+Alt+C' }, enabled: always, execute: () => engineFormat('codeBlock') },
      { id: 'format.mathBlock', localizedTitle: { zh: '数学公式块', en: 'Math Block' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+B', winLinux: 'Ctrl+Alt+B' }, enabled: always, execute: () => engineFormat('mathBlock') },
      { id: 'format.highlight', localizedTitle: { zh: '高亮', en: 'Highlight' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('highlight') },
      { id: 'format.sup', localizedTitle: { zh: '上标', en: 'Superscript' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('sup') },
      { id: 'format.sub', localizedTitle: { zh: '下标', en: 'Subscript' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('sub') },
      // D4 格式菜单补全（Typora 格式：下划线 ⌘U / 注释 ⌃-；引擎 applyInlineWrap 非对称包裹）
      { id: 'format.underline', localizedTitle: { zh: '下划线', en: 'Underline' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+U', winLinux: 'Ctrl+U' }, enabled: always, execute: () => engineFormat('underline') },
      { id: 'format.comment', localizedTitle: { zh: '注释', en: 'Comment' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+-', winLinux: 'Ctrl+-' }, enabled: always, execute: () => engineFormat('comment') },
      // D4 链接操作（Typora 格式→链接操作：打开链接 / 复制链接地址）
      { id: 'format.openLink', localizedTitle: { zh: '打开链接', en: 'Open Link' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => handleOpenLinkAtCursor() },
      { id: 'format.copyLinkUrl', localizedTitle: { zh: '复制链接地址', en: 'Copy Link Address' }, category: 'format', context: { scope: 'document' }, enabled: always, execute: () => void handleCopyLinkUrl() },
      // 清除样式（Typora Format→清除样式 ⌘\）：选区行内 marker + 链接语法剥除
      { id: 'format.clear', localizedTitle: { zh: '清除样式', en: 'Clear Formatting' }, category: 'format', context: { scope: 'document' }, shortcut: { mac: 'Cmd+\\', winLinux: 'Ctrl+\\' }, enabled: always, execute: () => engineFormat('clear') },
      // 段落（标题层级 / 段落）
      { id: 'paragraph.h1', localizedTitle: { zh: '一级标题', en: 'Heading 1' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+1', winLinux: 'Ctrl+1' }, enabled: always, execute: () => engineFormat('h1') },
      { id: 'paragraph.h2', localizedTitle: { zh: '二级标题', en: 'Heading 2' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+2', winLinux: 'Ctrl+2' }, enabled: always, execute: () => engineFormat('h2') },
      { id: 'paragraph.h3', localizedTitle: { zh: '三级标题', en: 'Heading 3' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+3', winLinux: 'Ctrl+3' }, enabled: always, execute: () => engineFormat('h3') },
      { id: 'paragraph.h4', localizedTitle: { zh: '四级标题', en: 'Heading 4' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+4', winLinux: 'Ctrl+4' }, enabled: always, execute: () => engineFormat('h4') },
      { id: 'paragraph.h5', localizedTitle: { zh: '五级标题', en: 'Heading 5' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+5', winLinux: 'Ctrl+5' }, enabled: always, execute: () => engineFormat('h5') },
      { id: 'paragraph.h6', localizedTitle: { zh: '六级标题', en: 'Heading 6' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+6', winLinux: 'Ctrl+6' }, enabled: always, execute: () => engineFormat('h6') },
      { id: 'paragraph.normal', localizedTitle: { zh: '段落', en: 'Paragraph' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+0', winLinux: 'Ctrl+0' }, enabled: always, execute: () => engineFormat('paragraph') },
      // 段落新项（B2 菜单补全，Typora 段落菜单对齐）
      { id: 'paragraph.headingUp', localizedTitle: { zh: '提升标题级别', en: 'Increase Heading Level' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+=', winLinux: 'Ctrl+=' }, enabled: always, execute: () => engineFormat('headingUp') },
      { id: 'paragraph.headingDown', localizedTitle: { zh: '降低标题级别', en: 'Decrease Heading Level' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+-', winLinux: 'Ctrl+-' }, enabled: always, execute: () => engineFormat('headingDown') },
      { id: 'paragraph.horizontalRule', localizedTitle: { zh: '水平分割线', en: 'Horizontal Rule' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+-', winLinux: 'Ctrl+Alt+-' }, enabled: always, execute: () => engineFormat('horizontalRule') },
      { id: 'paragraph.footnote', localizedTitle: { zh: '脚注', en: 'Footnote' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+Alt+R', winLinux: 'Ctrl+Alt+R' }, enabled: always, execute: () => engineFormat('footnote') },
      { id: 'paragraph.yamlFrontMatter', localizedTitle: { zh: 'YAML Front Matter', en: 'YAML Front Matter' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('yamlFrontMatter') },
      { id: 'paragraph.taskToggle', localizedTitle: { zh: '切换任务状态', en: 'Toggle Task State' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Ctrl+X', winLinux: 'Ctrl+Alt+X' }, enabled: always, execute: () => engineFormat('taskToggle') },
      // D4 列表缩进（Typora 段落→列表缩进 ⌘]/⌘[；引擎 applyListIndent）
      { id: 'paragraph.indentMore', localizedTitle: { zh: '增加缩进', en: 'Increase Indent' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+]', winLinux: 'Ctrl+]' }, enabled: always, execute: () => engineFormat('indentMore') },
      { id: 'paragraph.indentLess', localizedTitle: { zh: '减少缩进', en: 'Decrease Indent' }, category: 'paragraph', context: { scope: 'document' }, shortcut: { mac: 'Cmd+[', winLinux: 'Ctrl+[' }, enabled: always, execute: () => engineFormat('indentLess') },
      // D4 插入段落（Typora 段落→在上方/下方插入段落；引擎 applyInsertParagraph）
      { id: 'paragraph.insertAbove', localizedTitle: { zh: '在上方插入段落', en: 'Insert Paragraph Above' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('insertParagraphAbove') },
      { id: 'paragraph.insertBelow', localizedTitle: { zh: '在下方插入段落', en: 'Insert Paragraph Below' }, category: 'paragraph', context: { scope: 'document' }, enabled: always, execute: () => engineFormat('insertParagraphBelow') },
      { id: 'theme.mode.system', localizedTitle: { zh: '跟随系统', en: 'Follow System' }, category: 'view', context: { scope: 'global' }, enabled: () => themeSettings.mode !== 'system', execute: () => setThemeSettingsAndPersist({ ...themeSettings, mode: 'system' }) },
      { id: 'view.sidebar.toggle', localizedTitle: { zh: '切换侧边栏', en: 'Toggle Sidebar' }, category: 'view', context: { scope: 'global' }, shortcut: { mac: 'Cmd+Shift+L', winLinux: 'Ctrl+Shift+L' }, enabled: always, execute: toggleSidebar },
      { id: 'view.sidebar.outline', localizedTitle: { zh: '大纲', en: 'Outline' }, category: 'view', context: { scope: 'global' }, shortcut: { mac: 'Ctrl+Cmd+1', winLinux: 'Ctrl+Shift+1' }, enabled: always, execute: () => showSidebarAs('outline') },
      { id: 'view.sidebar.fileList', localizedTitle: { zh: '文件列表', en: 'File List' }, category: 'view', context: { scope: 'global' }, shortcut: { mac: 'Ctrl+Cmd+2', winLinux: 'Ctrl+Shift+2' }, enabled: always, execute: () => showSidebarAs('files', 'list') },
      { id: 'view.sidebar.fileTree', localizedTitle: { zh: '文件树', en: 'File Tree' }, category: 'view', context: { scope: 'global' }, shortcut: { mac: 'Ctrl+Cmd+3', winLinux: 'Ctrl+Shift+3' }, enabled: always, execute: () => showSidebarAs('files', 'tree') },
      // ⇧⌘\ 显示所有标签页（Typora 视图→显示所有标签页 / Tab Overview）
      { id: 'tabs.showAll', localizedTitle: { zh: '显示所有标签页', en: 'Show All Tabs' }, category: 'view', context: { scope: 'global' }, shortcut: { mac: 'Shift+Cmd+\\', winLinux: 'Ctrl+Shift+\\' }, enabled: always, execute: () => setTabOverviewOpen((v) => !v) },
      // DevTools（仅 debug 构建可用；release 返回 Err → toast 提示）
      { id: 'view.devtools', localizedTitle: { zh: '开发者工具', en: 'Developer Tools' }, category: 'view', context: { scope: 'global' }, enabled: always, execute: () => { void invoke('open_devtools').catch(() => setToast({ message: t('view.devtools.unavailable') })); } },
      { id: 'help.quickStart', localizedTitle: { zh: '快速上手', en: 'Quick Start' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_QUICK_START); } },
      { id: 'help.markdownReference', localizedTitle: { zh: 'Markdown 语法参考', en: 'Markdown Reference' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_MARKDOWN_REFERENCE); } },
      { id: 'help.feedback', localizedTitle: { zh: '反馈问题…', en: 'Feedback…' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => { void openerRef.current?.openUrl(HELP_URL_FEEDBACK); } },
      { id: 'help.cheatsheet', localizedTitle: { zh: 'Markdown 速查表', en: 'Markdown Cheatsheet' }, category: 'help', context: { scope: 'global' }, enabled: always, execute: () => setCheatsheetOpen(true) },
    ];
    commands.forEach((command) => registry.register(command));
    for (const theme of BUILTIN_THEMES) {
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
  }, [activeTheme, adjustFontSize, applySetting, applyThemeById, assetDir, chooseFileTreeRoot, closeReader, cycleFocusMode, dispatchCommand, fileTreeRoot, handleCloseOthers, handleCloseRight, handleCloseTab, handleExportHtml, handleExportPdf, handleExportImage, handleNew, handleOpen, handleReopenClosed, handleRenameDocument, handleSave, handleSaveAs, handleTreeCopyPath, handleTreeDuplicate, handleTreeMove, handleTreeNewFile, handleTreeNewFolder, handleTreeRename, handleTreeReveal, handleTreeTrash, handleTreeUndo, localeSetting, openGlobalSearch, openQuickOpen, openReader, openSlashUi, readerOpen, readerZoom, refreshFilesSidebar, replaceSlashTrigger, engineFormat, engineSearch, engineSourceToggle, runBatch, runUpdateCheck, selectedTreePath, setCheatsheetOpen, showSidebarAs, toggleSidebar, selectionToolbarEnabled, setAssetDir, setFocusMode, setLocaleSettingPersist, setReaderZoom, setSelectionToolbarEnabled, setThemeSettingsAndPersist, setTypewriterMode, themeSettings, toggleSelectionToolbar, toggleSlashEnabled, toggleTypewriter, typewriterEnabled]);

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

  // Tab Overview Esc 关闭（无输入框聚焦，需 window 级监听）
  useEffect(() => {
    if (!tabOverviewOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTabOverviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabOverviewOpen]);

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

  // 最近文件 → 原生菜单「打开最近文件」子菜单（B2：recentFiles 变化触发 set_recent_files 重建）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_recent_files', { files: recentFiles.map((f) => f.path) }))
      .catch(() => {
        /* 非 Tauri / 菜单不可用 */
      });
  }, [recentFiles]);

  // 主题选中态 → 原生菜单「主题」radio（B2-5/B3-2：themeSettings/activeTheme 变化触发 set_theme_selection 重建）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_theme_selection', { mode: themeSettings.mode, activeThemeId: activeTheme.id }))
      .catch(() => {
        /* 非 Tauri / 菜单不可用 */
      });
  }, [themeSettings.mode, activeTheme.id]);

  // ── Crash Recovery 三选项（spec §6：Recover / Compare / Ignore）──

  const handleRecover = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
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
    setStatusText(t('msg.recovered', { path: snapshot.path ?? t('msg.unsavedDoc'), rev: snapshot.revision }));
    // 恢复后清理快照（用户已处理）
    await recovery.onSaved(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    refreshStats(host);
  }, [refreshStats]);

  const handleCompare = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
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
    setStatusText(t('msg.compareSnapshot', { path: snapshot.path ?? t('msg.unsavedDoc') }));
    refreshStats(host);
  }, [refreshStats]);

  const handleIgnore = useCallback(async (entry: RecoveryEntry) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    await recovery.ignore(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    setStatusText(t('msg.ignoredSnapshot'));
  }, []);

  const formatFileTime = (ms?: number) => {
    if (ms === undefined || ms <= 0) return '';
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

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
        {(tabs.length > 1 || !autoHideTabBar) && <Tabbar
          tabs={tabs}
          activeTabId={activeTabId}
          t={t}
          onSelect={(id) => void handleSelectTab(id)}
          onClose={(id) => void handleCloseTab(id)}
          onDropTab={handleDropTab}
        />}
        <button
          className="titlebar-palette"
          type="button"
          onClick={toggleSidebar}
          title={t('sidebar.toggleTitle')}
          aria-pressed={sidebarVisible}
        >{platformMac ? '⇧⌘L' : 'Ctrl+Shift+L'}</button>
      </header>
      <div className="workspace-shell">
        {sidebarVisible && (
        <aside className="file-tree" style={{ width: sidebarWidth }} onKeyDown={sidebarMode === 'files' ? (fileSidebarMode === 'tree' ? handleTreeKeyDown : handleFileListKeyDown) : undefined} tabIndex={0} aria-label={sidebarMode === 'outline' ? t('sidebar.outlineAria') : sidebarMode === 'search' ? t('sidebar.searchAria') : (fileSidebarMode === 'tree' ? t('sidebar.treeAria') : t('sidebar.listAria'))}>
          <SidebarHeader
            mode={sidebarMode}
            t={t}
            onModeChange={(m) => { setSidebarMode(m); if (m === 'outline') refreshOutlineRef.current(); }}
            onOpenFolder={() => void dispatchCommand('workspace.openFolder', 'menu')}
            onRefresh={() => void dispatchCommand('workspace.refresh', 'menu')}
            canRefresh={fileTreeRoot !== null}
            filtersOpen={fileFiltersOpen}
            onToggleFilters={() => setFileFiltersOpen((v) => !v)}
          />
          {sidebarMode === 'files' ? (
            <>
              <div className="file-tree-actions file-mode-tabs">
                <button className={fileSidebarMode === 'tree' ? 'active' : ''} onClick={() => setFileSidebarMode('tree')}>{t('sidebar.tree')}</button>
                <button className={fileSidebarMode === 'list' ? 'active' : ''} onClick={() => setFileSidebarMode('list')}>{t('sidebar.list')}</button>
              </div>
              {fileFiltersOpen && (
              <>
              <div className="file-tree-filters">
                <label><input type="checkbox" checked={fileTreeOptions.showHidden} onChange={(e) => setFileTreeOption({ showHidden: e.target.checked })} />{t('sidebar.showHidden')}</label>
                <label><input type="checkbox" checked={fileTreeOptions.showNonMarkdown} onChange={(e) => setFileTreeOption({ showNonMarkdown: e.target.checked })} />{t('sidebar.showNonMarkdown')}</label>
                {fileSidebarMode === 'list' && <label><input type="checkbox" checked={fileListOptions.recursive} onChange={(e) => setFileListOption({ recursive: e.target.checked })} />{t('sidebar.recursive')}</label>}
                {fileSidebarMode === 'list' && <label><input type="checkbox" checked={fileListOptions.includeSummary} onChange={(e) => setFileListOption({ includeSummary: e.target.checked })} />{t('sidebar.summary')}</label>}
                <label>{t('sidebar.sort')}
                  <select value={fileTreeOptions.sortBy} onChange={(e) => setFileTreeOption({ sortBy: e.target.value as FileTreeOptions['sortBy'] })}>
                    <option value="natural">{t('sidebar.sortNatural')}</option>
                    <option value="name">{t('sidebar.sortName')}</option>
                    <option value="modified">{t('sidebar.sortModified')}</option>
                    <option value="created">{t('sidebar.sortCreated')}</option>
                  </select>
                </label>
                <label><input type="checkbox" checked={fileTreeOptions.sortAsc} onChange={(e) => setFileTreeOption({ sortAsc: e.target.checked })} />{t('sidebar.sortAsc')}</label>
                <label><input type="checkbox" checked={fileTreeOptions.folderFirst} onChange={(e) => setFileTreeOption({ folderFirst: e.target.checked })} />{t('sidebar.foldersFirst')}</label>
              </div>
              <div className="file-tree-globs">
                <input placeholder={t('tree.includeGlob')} value={fileTreeOptions.includeGlobs.join(',')} onChange={(e) => setFileTreeOption({ includeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                <input placeholder={t('tree.excludeGlob')} value={fileTreeOptions.excludeGlobs.join(',')} onChange={(e) => setFileTreeOption({ excludeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
              </>
              )}
              <div className="file-tree-root" title={fileTreeRoot ?? ''}>
                <span className="file-tree-root-label">{fileTreeRoot ?? t('tree.rootEmpty')}</span>
                {fileTreeRoot !== null && (
                  <button
                    type="button"
                    className="file-tree-pin"
                    title={pinnedFolders.includes(fileTreeRoot) ? t('sidebar.unpin') : t('sidebar.pin')}
                    aria-pressed={pinnedFolders.includes(fileTreeRoot)}
                    onClick={handleTogglePinRoot}
                  >
                    {pinnedFolders.includes(fileTreeRoot) ? '★' : '☆'}
                  </button>
                )}
              </div>
              {pinnedFolders.length > 0 && (
                <div className="pinned-folders" aria-label={t('sidebar.pinnedLabel')}>
                  {pinnedFolders.map((p) => (
                    <span key={p} className="pinned-folder-group">
                      <button
                        type="button"
                        className={`pinned-folder${p === fileTreeRoot ? ' active' : ''}`}
                        title={p}
                        onClick={() => { setFileTreeRoot(p); rememberRecentFolder(p); }}
                      >
                        {p === fileTreeRoot ? '★ ' : ''}{basename(p)}
                      </button>
                      <button
                        type="button"
                        className="pinned-folder-remove"
                        title={t('sidebar.unpin')}
                        aria-label={t('sidebar.unpin')}
                        onClick={() => persistPinned(pinnedFolders.filter((x) => x !== p))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {recentFolders.length > 0 && (
                <div className="pinned-folders" aria-label={t('sidebar.recentFoldersLabel')}>
                  <span className="file-tree-root-label">{t('sidebar.recentFolders')}</span>
                  {recentFolders.filter((f) => f !== fileTreeRoot).slice(0, 5).map((f) => (
                    <span key={f} className="pinned-folder-group">
                      <button
                        type="button"
                        className="pinned-folder"
                        title={f}
                        onClick={() => { setFileTreeRoot(f); rememberRecentFolder(f); }}
                      >
                        {basename(f)}
                      </button>
                      <button
                        type="button"
                        className="pinned-folder-remove"
                        title={t('sidebar.removeRecent')}
                        aria-label={t('sidebar.removeRecent')}
                        onClick={() => forgetRecentFolder(f)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {fileSidebarMode === 'tree' ? (
                <div className="file-tree-list" onContextMenu={(e) => openTreeContextMenu(e)}>
                  {fileTreeNodes.length === 0 ? (
                    <div className="sidebar-empty">{fileTreeRoot === null ? t('sidebar.emptyFiles') : t('sidebar.emptyFolder')}</div>
                  ) : <FileTree nodes={fileTreeNodes} selectedPath={selectedTreePath} currentPath={filePathRef.current} onSelect={handleTreeSelect} onToggle={(p) => void handleTreeToggle(p)} onOpen={(p) => void openTreeFile(p)} onDrop={(d, p) => void handleTreeDrop(d, p)} onContextMenu={openTreeContextMenu} />}
                </div>
              ) : (
                <div className="file-list" aria-label={t('filelist.articles')}>
                  {fileListItems.length === 0 ? (
                    <div className="sidebar-empty">{t('sidebar.emptyFiles')}</div>
                  ) : <FileList items={fileListItems} selectedPath={selectedListPath} currentPath={filePathRef.current} includeSummary={fileListOptions.includeSummary} formatFileTime={formatFileTime} onSelect={handleFileListSelect} onOpen={(p) => void openTreeFile(p)} />}
                </div>
              )}
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
                  const items = readerOpen ? outlineModelRef.current.visibleItems(filterOutline(readerOutlineItems, outlineFilter), outlineFlat) : outlineItems;
                  return items.length === 0
                    ? <div className="sidebar-empty">{t('outline.empty')}</div>
                    : <OutlineList items={items} currentId={currentOutlineId} flat={outlineFlat} collapsed={outlineModelRef.current.collapsed} onJump={handleOutlineJump} onToggle={handleOutlineToggle} />;
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
                <input className="search-input small" placeholder={t('search.include')} value={searchInclude} onChange={(e) => setSearchInclude(e.target.value)} />
                <input className="search-input small" placeholder={t('search.exclude')} value={searchExclude} onChange={(e) => setSearchExclude(e.target.value)} />
                <button onClick={() => void runGlobalSearch()} disabled={!searchQuery || fileTreeRoot === null}>{t('search.run')}</button>
                <span className="search-count">{searchRunning ? t('search.streaming') : ''} {t('search.matches', { n: searchResults.length })}</span>
              </div>
              <div className="search-results" aria-label={t('search.resultsLabel')}>
                {searchQuery === '' && searchResults.length === 0 && <div className="sidebar-empty">{t('search.empty')}</div>}
                {<SearchResultsList groups={searchGroups} onJump={(m) => void jumpToSearchResult(m)} />}
              </div>
            </>
          )}
        </aside>
        )}
        {sidebarVisible && (
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
          {tabs.length === 0 && !readerOpen && status === 'ready' && (
            <Welcome
              t={t}
              recentFiles={recentFiles}
              recentMissing={recentMissing}
              onNew={() => void dispatchCommand('file.new', 'menu')}
              onOpen={() => void dispatchCommand('file.open', 'menu')}
              onOpenFolder={() => void dispatchCommand('workspace.openFolder', 'menu')}
              onOpenRecent={(path) => void openPathInTab(path)}
            />
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
          <div
            ref={containerRef}
            style={readerOpen ? { display: 'none' } : undefined}
          />
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
      {tabOverviewOpen && (
        <div className="quick-open-backdrop" onMouseDown={() => setTabOverviewOpen(false)}>
          <div className="tab-overview-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="tab-overview-grid" role="listbox" aria-label={t('tabs.overview.title')}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab-overview-card ${tab.id === activeTabId ? 'active' : ''}`}
                  role="option"
                  aria-selected={tab.id === activeTabId}
                  onClick={() => { setTabOverviewOpen(false); void handleSelectTab(tab.id); }}
                >
                  <span className="tab-overview-title">{tab.title ?? t('tab.untitled')}{tab.dirty ? ' •' : ''}</span>
                  <span className="tab-overview-path">{tab.path}</span>
                </button>
              ))}
            </div>
            <div className="quick-open-meta"><span>{t('tabs.overview.hint')}</span></div>
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
        <StatusBar
          t={t}
          dirty={dirty}
          stats={stats}
          cursorPos={cursorPos}
          encodingLabel={encodingLabel}
          eolLabel={eolLabel}
          status={status}
          statusText={statusText}
        />
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
