/**
 * App —— Mellow V0.0 Runtime Qualification Shell（最小编辑器壳）。
 * 不开发正式 UI：Open / Save / New + 编辑器容器 + 状态栏。
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
} from '../../../packages/app-core/src';
import type { DocumentTab, ExternalChangeDetail, FileListItem, FileListOptions, FileTreeNode, FileTreeOptions, OutlineHeading, QuickOpenEntry, SearchGroup, TabSessionSnapshot } from '../../../packages/app-core/src';
import { createDesktopFileService } from './host/fileServices';
import { createDesktopRecoveryStorage } from './host/recoveryStorage';
import { createDesktopWatcher } from './host/watcherAdapter';
import { createDesktopDialogService } from './host/dialogs';
import { createDesktopOpenerService } from './host/openers';
import { createDesktopWindowService } from './host/windowService';
import { createDesktopSearchService } from './host/searchServices';
import type { ImageWidgetActionRequest } from '../../../packages/editor-engine/src/image/widget';
import type { AssetDirConfig } from '../../../packages/editor-engine/src/image/path';
import type { Encoding, LineEnding, RecoveryEntry, FileChangeEvent, DialogService, OpenerService, SearchResult, SearchService, WindowService } from '../../../packages/host-api/src/index';
import { CommandPaletteModel, CommandRegistry, commandPaletteSearch, createCommandContext, normalizeShortcut, slashCommandSearch, titleFor } from '../../../packages/commands/src';
import type { Command, CommandPaletteItem, CommandSource } from '../../../packages/commands/src';
import { BUILTIN_THEMES, DEFAULT_THEME_SETTINGS, resolveActiveTheme, themeById } from '../../../packages/themes/src';
import type { MellowTheme, ThemeSettings } from '../../../packages/themes/src';
import { createI18n, MESSAGES, resolveLocale } from '../../../packages/i18n/src';
import type { Locale, LocaleSetting } from '../../../packages/i18n/src';
import type { SettingDefinition } from '../../../packages/settings/src';
import SettingsPanel from './SettingsPanel';
import type { SlashOpenRequest } from '../../../packages/editor-engine/src';
import ReaderView from './Reader';
import SplitPreview from './SplitPreview';
import type { SplitPreviewHandle } from './SplitPreview';
import ContextMenu from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import { convertFileSrc } from '@tauri-apps/api/core';

const GLOBAL_ASSET_DIR_KEY = 'mellow.assetDir';
const TABS_SESSION_KEY = 'mellow.tabs.session';
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
const SPLIT_RATIO_KEY = 'mellow.split.ratio';
const WINDOW_BOUNDS_KEY = 'mellow.window.bounds';
const COMMAND_PALETTE_SHORTCUT = { mac: 'Cmd+Shift+P', winLinux: 'Ctrl+Shift+P' };

type EditorStatus = 'idle' | 'ready' | 'error';

interface DocMeta {
  encoding: Encoding;
  eol: LineEnding;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorCore | null>(null);
  const filePathRef = useRef<string | null>(null);
  const documentsRef = useRef<DocumentService | null>(null);
  const fileServiceRef = useRef<ReturnType<typeof createDesktopFileService> | null>(null);
  const recoveryRef = useRef<RecoveryService | null>(null);
  const externalRef = useRef<ExternalChangeService | null>(null);
  // 图片文件操作（spec image-workflow §6/§7 + PRD §58）
  const fileOpsRef = useRef<ImageFileOpsService | null>(null);
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
  const draggedTabIdRef = useRef<string | null>(null);
  const draggedTreePathRef = useRef<string | null>(null);
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
  const [statusText, setStatusText] = useState(t('msg.editorNotLoaded'));
  const [dirty, setDirtyState] = useState(false);
  const [stats, setStats] = useState('');
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [fileTreeRoot, setFileTreeRoot] = useState<string | null>(() => localStorage.getItem(FILE_TREE_ROOT_KEY));
  const [sidebarMode, setSidebarModeState] = useState<'files' | 'outline' | 'search'>(() => {
    const saved = localStorage.getItem('mellow.sidebar.mode');
    return saved === 'outline' || saved === 'search' ? saved : 'files';
  });
  const [fileSidebarMode, setFileSidebarModeState] = useState<'tree' | 'list'>(() => (localStorage.getItem(FILE_SIDEBAR_MODE_KEY) === 'list' ? 'list' : 'tree'));
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
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitHtml, setSplitHtml] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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
  const [splitRatio, setSplitRatioState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SPLIT_RATIO_KEY));
      return saved >= 0.1 && saved <= 0.9 ? saved : 0.5;
    } catch {
      return 0.5;
    }
  });
  const splitOpenRef = useRef(false);
  splitOpenRef.current = splitOpen;
  const splitPreviewRef = useRef<SplitPreviewHandle | null>(null);
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
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);

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

  /** Reader 图片 src → 可显示 URL（相对路径基于当前文档目录，Tauri asset 协议） */
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

  const openReader = useCallback(() => {
    const host = hostRef.current;
    const active = tabsRef.current.active;
    if (!host || active === null) return;
    const content = host.getText();
    const result = renderReaderHtml(content, { resolveImageSrc: readerResolveImageSrc });
    setReaderHtml(result.html);
    setReaderOutlineItems(result.outline);
    setReaderTitle(active.title);
    setSplitOpen(false);
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

  /** Split：预览从编辑器真源渲染（no second document state） */
  const refreshSplitHtml = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const content = host.getText();
    setSplitHtml(renderReaderHtml(content, { resolveImageSrc: readerResolveImageSrc }).html);
  }, [readerResolveImageSrc]);

  const openSplit = useCallback(() => {
    setReaderOpen(false);
    refreshSplitHtml();
    setSplitOpen(true);
    setStatusText(t('msg.splitOn'));
  }, [refreshSplitHtml]);

  const closeSplit = useCallback(() => {
    setSplitOpen(false);
    setStatusText(t('msg.splitOff'));
  }, []);

  const toggleSplit = useCallback(() => {
    if (splitOpen) closeSplit();
    else openSplit();
  }, [closeSplit, openSplit, splitOpen]);

  const setSplitRatio = useCallback((next: number) => {
    const clamped = Math.max(0.1, Math.min(0.9, next));
    setSplitRatioState(clamped);
    try {
      localStorage.setItem(SPLIT_RATIO_KEY, String(clamped));
    } catch {
      /* no-op */
    }
  }, []);

  /** Preview 点击 → Source 定位（heading anchor / click navigation） */
  const handleSplitPreviewClick = useCallback((offset: number) => {
    const host = hostRef.current;
    if (!host) return;
    host.jumpToOffset(offset);
    host.focus();
  }, []);

  /** Preview 滚动 → Source 同步（阈值防回环由两端 setRatio 同值忽略保证） */
  const handleSplitPreviewScroll = useCallback((ratio: number) => {
    hostRef.current?.setScrollRatio(ratio);
  }, []);

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

  const refreshStats = useCallback((host: EditorCore) => {
    try {
      const text = host.getText();
      const lines = text.length === 0 ? 0 : text.split('\n').length;
      setStats(t('status.words', { count: text.length, lines }));
    } catch {
      setStats('');
    }
  }, []);

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
    setReaderOpen(false);
    setSplitOpen(false);
    suppressEditorEventRef.current = true;
    filePathRef.current = tab.path;
    docIdRef.current = tab.documentId;
    revisionRef.current = tab.revision;
    docMetaRef.current = { encoding: tab.encoding, eol: tab.eol };
    diskStateRef.current = tab.diskState;
    setConflict(null);
    setDirty(tab.dirty);
    host.setDocumentPath(tab.path);
    await host.open(tab.content, undefined, true);
    suppressEditorEventRef.current = false;
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

  /** 执行批量操作（moveAll/copyAll/downloadRemote），toast 提供撤销 */
  const runBatch = useCallback(async (kind: 'moveAll' | 'copyAll' | 'downloadRemote') => {
    const ops = fileOpsRef.current;
    const history = historyRef.current;
    if (!ops || !history) return;
    const before = history.length;
    const r = await ops[kind]();
    if (!r.ok) {
      setStatusText(r.error.message);
      return;
    }
    const rep = r.value;
    const n = rep.moved + rep.copied + rep.downloaded;
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
    showToast(`已重命名 ${current}`, () => void undo());
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
      setStatusText(`打开失败: ${r.error.message}`);
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

  const handleTreeDrop = useCallback(async (targetDir: string) => {
    const svc = fileTreeServiceRef.current;
    const path = draggedTreePathRef.current;
    draggedTreePathRef.current = null;
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
    await host.open(r.value.content, undefined, false);
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
    await host.open(r.value.content, undefined, true); // 放弃本地
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
    host.mount(containerRef.current);

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

    host
      .ready()
      .then(async () => {
        let active = tabsRef.current.active;
        try {
          const raw = localStorage.getItem(TABS_SESSION_KEY);
          if (raw !== null) {
            const parsed = JSON.parse(raw) as TabSessionSnapshot;
            tabsRef.current = new TabManager(parsed);
            active = tabsRef.current.active;
          }
        } catch {
          active = null;
        }
        if (active === null) {
          active = tabsRef.current.open({
            path: null,
            title: t('tab.untitled'),
            content: '# Mellow V0.0\n\nRuntime Qualification Shell',
            dirty: false,
            documentId: docIdRef.current,
            encoding: 'utf-8',
            eol: '\n',
          });
        }
        refreshTabsState();
        await applyTab(active);
        setStatus('ready');
        setStatusText(t('msg.editorReady'));
        refreshStats(host);

        // 注入图片操作 handler（widget 悬停操作条 → app-core 编排；spec §6）
        const frame = containerRef.current?.querySelector('iframe');
        const win = frame?.contentWindow as (Window & { __MELLOW_IMAGE_ACTIONS__?: (req: ImageWidgetActionRequest) => void }) | null;
        if (win) {
          win.__MELLOW_IMAGE_ACTIONS__ = (req) => { void handleImageAction(req); };
        }

        // Crash Recovery：编辑事件 → 防抖快照（与 Auto Save 分离）
        host.onEvent((e) => {
          if (e.type === 'viewUpdate') {
            refreshOutline(host.getSelectionHead());
            refreshCursorPos(host);
            if (e.contentEdited && splitOpenRef.current) refreshSplitHtml();
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
      unlistenDragDrop?.();
      host.destroy();
      recoveryRef.current?.dispose();
      void externalRef.current?.stop();
    };
  }, [handleCleanChange, scheduleRecoverySnapshot, watchDocument, handleImageAction, applyTab, currentTabPatch, refreshTabsState, setDirty, refreshOutline, refreshCursorPos, refreshSplitHtml]);

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

  const handleOpen = useCallback(async () => {
    const documents = documentsRef.current;
    if (!documents) return;
    syncActiveTabFromEditor();
    const result = await documents.open();
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(`打开失败: ${result.error.message}`);
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
    setStatusText(t('msg.openedPath', { path: result.value.path }));
  }, [applyTab, refreshTabsState, syncActiveTabFromEditor]);

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
        setStatusText(`保存失败: ${result.error.message}`);
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
    setStatusText(`已保存 ${result.value.path}`);
  }, [currentTabPatch, refreshTabsState, setDirty, watchDocument]);

  const handleSaveAs = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    const result = await documents.save(null, content, { encoding: meta.encoding, eol: meta.eol });
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(`另存失败: ${result.error.message}`);
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

  const handleDropTab = useCallback((targetId: string) => {
    const dragged = draggedTabIdRef.current;
    draggedTabIdRef.current = null;
    if (dragged === null || dragged === targetId) return;
    syncActiveTabFromEditor();
    const targetIndex = tabsRef.current.all.findIndex((tab) => tab.id === targetId);
    tabsRef.current.reorder(dragged, targetIndex);
    refreshTabsState();
  }, [refreshTabsState, syncActiveTabFromEditor]);

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
      default:
        break;
    }
  }, [applyThemeById, dispatchCommand, setAssetDir, setFileTreeOption, setLocaleSettingPersist, setSidebarMode, setSlashEnabled]);
  useEffect(() => {
    const registry = new CommandRegistry();
    const always = () => true;
    const hasWorkspace = () => fileTreeRoot !== null;
    const commands: Command[] = [
      { id: 'file.new', localizedTitle: { zh: '新建', en: 'New' }, category: 'file', shortcut: { mac: 'Cmd+T', winLinux: 'Ctrl+Alt+T' }, context: { scope: 'global' }, enabled: always, execute: () => void handleNew() },
      { id: 'file.open', localizedTitle: { zh: '打开…', en: 'Open…' }, category: 'file', context: { scope: 'global' }, enabled: always, execute: () => void handleOpen() },
      { id: 'file.save', localizedTitle: { zh: '保存', en: 'Save' }, category: 'file', shortcut: { mac: 'Cmd+S', winLinux: 'Ctrl+S' }, context: { scope: 'document' }, enabled: always, execute: () => void handleSave() },
      { id: 'file.saveAs', localizedTitle: { zh: '另存为…', en: 'Save As…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleSaveAs() },
      { id: 'document.rename', localizedTitle: { zh: '重命名…', en: 'Rename…' }, category: 'file', context: { scope: 'document' }, enabled: always, execute: () => void handleRenameDocument() },
      { id: 'tabs.close', localizedTitle: { zh: '关闭标签页', en: 'Close Tab' }, category: 'file', shortcut: { mac: 'Cmd+W', winLinux: 'Ctrl+W' }, context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => { const active = tabsRef.current.active; if (active) void handleCloseTab(active.id); } },
      { id: 'tabs.closeOthers', localizedTitle: { zh: '关闭其他', en: 'Close Others' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCloseOthers() },
      { id: 'tabs.closeRight', localizedTitle: { zh: '关闭右侧', en: 'Close Right' }, category: 'file', context: { scope: 'document' }, enabled: () => tabsRef.current.all.length > 1, execute: () => void handleCloseRight() },
      { id: 'tabs.reopenClosed', localizedTitle: { zh: '重开关闭', en: 'Reopen Closed' }, category: 'file', shortcut: { mac: 'Cmd+Shift+T', winLinux: 'Ctrl+Shift+T' }, context: { scope: 'global' }, enabled: always, execute: () => void handleReopenClosed() },
      { id: 'workspace.openFolder', localizedTitle: { zh: '打开文件夹…', en: 'Open Folder…' }, category: 'workspace', context: { scope: 'global' }, enabled: always, execute: () => void chooseFileTreeRoot() },
      { id: 'workspace.refresh', localizedTitle: { zh: '刷新文件', en: 'Refresh Files' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void refreshFilesSidebar() },
      { id: 'quickOpen.open', localizedTitle: { zh: 'Quick Open', en: 'Quick Open' }, category: 'navigation', shortcut: { mac: 'Cmd+Shift+O', winLinux: 'Ctrl+P' }, context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void openQuickOpen() },
      { id: 'search.global', localizedTitle: { zh: '全局搜索', en: 'Global Search' }, category: 'search', shortcut: { mac: 'Cmd+Shift+F', winLinux: 'Ctrl+Shift+F' }, context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => openGlobalSearch() },
      { id: 'view.focus.cycle', localizedTitle: { zh: '切换 Focus Mode', en: 'Toggle Focus Mode' }, category: 'view', shortcut: { mac: 'F8', winLinux: 'F8' }, context: { scope: 'document' }, enabled: always, execute: () => cycleFocusMode() },
      { id: 'view.focus.off', localizedTitle: { zh: 'Focus Mode：关闭', en: 'Focus Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('off') },
      { id: 'view.focus.line', localizedTitle: { zh: 'Focus Mode：当前行', en: 'Focus Mode: Current Line' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('line') },
      { id: 'view.focus.paragraph', localizedTitle: { zh: 'Focus Mode：当前段落', en: 'Focus Mode: Current Paragraph' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => setFocusMode('paragraph') },
      { id: 'view.typewriter.cycle', localizedTitle: { zh: '切换 Typewriter Mode', en: 'Toggle Typewriter Mode' }, category: 'view', shortcut: { mac: 'F9', winLinux: 'F9' }, context: { scope: 'document' }, enabled: always, execute: () => toggleTypewriter() },
      { id: 'view.typewriter.on', localizedTitle: { zh: 'Typewriter Mode：开启', en: 'Typewriter Mode: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !typewriterEnabled, execute: () => setTypewriterMode(true) },
      { id: 'view.typewriter.off', localizedTitle: { zh: 'Typewriter Mode：关闭', en: 'Typewriter Mode: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => typewriterEnabled, execute: () => setTypewriterMode(false) },
      { id: 'view.toolbar.toggle', localizedTitle: { zh: '切换格式工具栏', en: 'Toggle Format Toolbar' }, category: 'view', context: { scope: 'document' }, enabled: always, execute: () => toggleSelectionToolbar() },
      { id: 'view.toolbar.on', localizedTitle: { zh: '格式工具栏：启用', en: 'Format Toolbar: On' }, category: 'view', context: { scope: 'document' }, enabled: () => !selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(true) },
      { id: 'view.toolbar.off', localizedTitle: { zh: '格式工具栏：禁用', en: 'Format Toolbar: Off' }, category: 'view', context: { scope: 'document' }, enabled: () => selectionToolbarEnabled, execute: () => setSelectionToolbarEnabled(false) },
      { id: 'reader.open', localizedTitle: { zh: '用 Reader 打开', en: 'Open in Reader' }, category: 'view', context: { scope: 'document' }, enabled: () => !readerOpen && tabsRef.current.active !== null, execute: () => openReader() },
      { id: 'reader.openInEditor', localizedTitle: { zh: '用编辑器打开', en: 'Open in Editor' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => closeReader() },
      { id: 'reader.zoomIn', localizedTitle: { zh: 'Reader 放大', en: 'Reader Zoom In' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom + 0.1) },
      { id: 'reader.zoomOut', localizedTitle: { zh: 'Reader 缩小', en: 'Reader Zoom Out' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(readerZoom - 0.1) },
      { id: 'reader.zoomReset', localizedTitle: { zh: 'Reader 重置缩放', en: 'Reader Reset Zoom' }, category: 'view', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => setReaderZoom(1) },
      { id: 'reader.print', localizedTitle: { zh: '打印 Reader', en: 'Print Reader' }, category: 'file', context: { scope: 'document' }, enabled: () => readerOpen, execute: () => window.print() },
      { id: 'split.toggle', localizedTitle: { zh: '切换 Split（Source | Preview）', en: 'Toggle Split (Source | Preview)' }, category: 'view', context: { scope: 'document' }, enabled: () => tabsRef.current.active !== null, execute: () => toggleSplit() },
      { id: 'split.open', localizedTitle: { zh: 'Split：打开预览', en: 'Split: Open Preview' }, category: 'view', context: { scope: 'document' }, enabled: () => !splitOpen && tabsRef.current.active !== null, execute: () => openSplit() },
      { id: 'split.close', localizedTitle: { zh: 'Split：关闭预览', en: 'Split: Close Preview' }, category: 'view', context: { scope: 'document' }, enabled: () => splitOpen, execute: () => closeSplit() },
      { id: 'image.moveAll', localizedTitle: { zh: '图片：移动全部到 asset 目录', en: 'Images: Move All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('moveAll') },
      { id: 'image.copyAll', localizedTitle: { zh: '图片：复制全部到 asset 目录', en: 'Images: Copy All' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('copyAll') },
      { id: 'image.downloadRemote', localizedTitle: { zh: '图片：下载远程到 asset 目录', en: 'Images: Download Remote' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => void runBatch('downloadRemote') },
      { id: 'image.setAssetDir', localizedTitle: { zh: '图片：设置 asset 目录…', en: 'Images: Set Asset Directory…' }, category: 'image', context: { scope: 'document' }, enabled: always, execute: () => { const v = window.prompt(t('prompt.assetDir'), assetDir); if (v !== null && v.trim() !== '') setAssetDir(v.trim()); } },
      { id: 'window.minimize', localizedTitle: { zh: '最小化窗口', en: 'Minimize Window' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.minimize(); } },
      { id: 'window.maximizeToggle', localizedTitle: { zh: '最大化 / 还原窗口', en: 'Toggle Maximize' }, category: 'system', context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.toggleMaximize(); } },
      { id: 'window.fullscreen', localizedTitle: { zh: '切换全屏', en: 'Toggle Fullscreen' }, category: 'system', shortcut: { mac: 'Ctrl+Cmd+F', winLinux: 'F11' }, context: { scope: 'global' }, enabled: always, execute: () => { void windowServiceRef.current?.isFullscreen().then((r) => { if (r.ok) void windowServiceRef.current?.setFullscreen(!r.value); }); } },
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
      { id: 'insert.table', localizedTitle: { zh: '表格', en: 'Table' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['bg'] } }, enabled: always, execute: () => replaceSlashTrigger('\n|  |  |\n|---|---|\n|  |  |') },
      { id: 'insert.code', localizedTitle: { zh: '代码块', en: 'Code Block' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['fence', 'dm'] } }, enabled: always, execute: () => replaceSlashTrigger('```\n\n```') },
      { id: 'insert.math', localizedTitle: { zh: '数学公式', en: 'Math' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['formula', 'sx'] } }, enabled: always, execute: () => replaceSlashTrigger('$$\n\n$$') },
      { id: 'insert.mermaid', localizedTitle: { zh: 'Mermaid 图表', en: 'Mermaid Diagram' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['diagram', 'tt'] } }, enabled: always, execute: () => replaceSlashTrigger('```mermaid\ngraph TD\n  A --> B\n```') },
      { id: 'insert.alert', localizedTitle: { zh: '提示框', en: 'Alert' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['note', 'jg'] } }, enabled: always, execute: () => replaceSlashTrigger('> [!NOTE]\n> ') },
      { id: 'insert.image', localizedTitle: { zh: '图片', en: 'Image' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['img', 'tp'] } }, enabled: always, execute: () => replaceSlashTrigger('![]( )') },
      { id: 'insert.toc', localizedTitle: { zh: '目录', en: 'Table of Contents' }, category: 'insert', context: { scope: 'document' }, presentation: { slash: { aliases: ['toc', 'ml'] } }, enabled: always, execute: () => replaceSlashTrigger('\n\n[toc]\n\n') },
      { id: 'fileTree.newFile', localizedTitle: { zh: '新文件', en: 'New File' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeNewFile() },
      { id: 'fileTree.newFolder', localizedTitle: { zh: '新文件夹', en: 'New Folder' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeNewFolder() },
      { id: 'fileTree.rename', localizedTitle: { zh: '重命名', en: 'Rename' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeRename() },
      { id: 'fileTree.duplicate', localizedTitle: { zh: '复制', en: 'Duplicate' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeDuplicate() },
      { id: 'fileTree.move', localizedTitle: { zh: '移动', en: 'Move' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeMove() },
      { id: 'fileTree.trash', localizedTitle: { zh: '移到回收站', en: 'Move to Trash' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeTrash() },
      { id: 'fileTree.undo', localizedTitle: { zh: '撤销文件操作', en: 'Undo File Operation' }, category: 'workspace', context: { scope: 'workspace' }, enabled: hasWorkspace, execute: () => void handleTreeUndo() },
      { id: 'fileTree.copyPath', localizedTitle: { zh: '复制路径', en: 'Copy Path' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeCopyPath(false) },
      { id: 'fileTree.copyRelativePath', localizedTitle: { zh: '复制相对路径', en: 'Copy Relative Path' }, category: 'workspace', context: { scope: 'target' }, enabled: () => selectedTreePath !== null, execute: () => void handleTreeCopyPath(true) },
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
  }, [activeTheme, applySetting, applyThemeById, assetDir, chooseFileTreeRoot, closeReader, closeSplit, cycleFocusMode, dispatchCommand, fileTreeRoot, handleCloseOthers, handleCloseRight, handleCloseTab, handleNew, handleOpen, handleReopenClosed, handleRenameDocument, handleSave, handleSaveAs, handleTreeCopyPath, handleTreeDuplicate, handleTreeMove, handleTreeNewFile, handleTreeNewFolder, handleTreeRename, handleTreeReveal, handleTreeTrash, handleTreeUndo, localeSetting, openGlobalSearch, openQuickOpen, openReader, openSlashUi, openSplit, readerOpen, readerZoom, refreshFilesSidebar, replaceSlashTrigger, runBatch, selectedTreePath, selectionToolbarEnabled, setAssetDir, setFocusMode, setLocaleSettingPersist, setReaderZoom, setSelectionToolbarEnabled, setThemeSettingsAndPersist, setTypewriterMode, splitOpen, themeSettings, toggleSelectionToolbar, toggleSlashEnabled, toggleSplit, toggleTypewriter, typewriterEnabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const platform = navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win-linux';
      const parts = [event.ctrlKey ? 'Ctrl' : '', event.metaKey ? 'Cmd' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.key].filter(Boolean).join('+');
      const command = commandRegistryRef.current.findByShortcut(normalizeShortcut(parts), platform);
      if (!command) return;
      // Windows/Linux Ctrl+T 未注册为 New Tab，因此保留给 Table（PRD Shortcut Contract）。
      event.preventDefault();
      void dispatchCommand(command.id, 'shortcut');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatchCommand]);

  // Engine iframe → host：Slash 行首触发通知
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'mellow.slash.open') handleSlashOpen(event.data.payload as SlashOpenRequest);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleSlashOpen]);

  // Split 双向滚动同步：编辑器滚动 → Preview（阈值防回环由两端同值忽略保证）
  useEffect(() => {
    if (!splitOpen) return;
    const host = hostRef.current;
    if (!host) return;
    const unsub = host.onScroll((ratio) => {
      splitPreviewRef.current?.setRatio(ratio);
    });
    return unsub;
  }, [splitOpen]);

  // Split 分隔条拖拽 → 调整 Source/Preview 比例（localStorage 记忆）
  const handleSplitDragStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const container = containerRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      setSplitRatio((ev.clientX - rect.left) / rect.width);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setSplitRatio]);

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
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<string>('mellow-menu-command', (event) => {
        void dispatchCommand(event.payload, 'menu');
      });
    }).catch(() => {
      /* 非 Tauri 环境 */
    });
    return () => {
      unlisten?.();
    };
  }, [dispatchCommand]);

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
    await host.open(snapshot.content, undefined, true);
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
    await host.open(snapshot.content, undefined, true);
    setDirty(true);
    setStatusText(t('msg.compareSnapshot', { path: snapshot.path ?? t('msg.unsavedDoc') }));
    refreshStats(host);
  }, [refreshStats]);

  const handleIgnore = useCallback(async (entry: RecoveryEntry) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    await recovery.ignore(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    setStatusText(`已忽略 ${entry.documentId}`);
  }, []);

  const formatFileTime = (ms?: number) => {
    if (ms === undefined || ms <= 0) return '';
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderTreeNodes = (nodes: FileTreeNode[]) => nodes.map((node) => (
    <div key={node.path}>
      <button
        type="button"
        className={`tree-row ${selectedTreePath === node.path ? 'selected' : ''} ${filePathRef.current === node.path ? 'current' : ''}`}
        style={{ paddingLeft: 8 + node.depth * 14 }}
        title={node.path}
        draggable
        onDragStart={() => { draggedTreePathRef.current = node.path; }}
        onDragOver={(e) => { if (node.kind === 'folder') e.preventDefault(); }}
        onDrop={() => { if (node.kind === 'folder') void handleTreeDrop(node.path); }}
        onClick={() => handleTreeSelect(node.path)}
        onDoubleClick={() => { if (node.kind === 'folder') void handleTreeToggle(node.path); else void openTreeFile(node.path); }}
        onContextMenu={(e) => openTreeContextMenu(e, node.path)}
      >
        <span className="tree-disclosure" onClick={(e) => { e.stopPropagation(); if (node.kind === 'folder') void handleTreeToggle(node.path); }}>
          {node.kind === 'folder' ? (node.expanded ? '▾' : '▸') : ''}
        </span>
        <span className="tree-icon">{node.kind === 'folder' ? '📁' : '📄'}</span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.kind === 'folder' && node.expanded && node.children !== undefined && renderTreeNodes(node.children)}
    </div>
  ));

  const renderFileListItems = (items: FileListItem[]) => items.map((item) => (
    <button
      key={item.path}
      type="button"
      className={`file-list-item ${selectedListPath === item.path ? 'selected' : ''} ${filePathRef.current === item.path ? 'current' : ''}`}
      title={item.path}
      onClick={() => handleFileListSelect(item.path)}
      onDoubleClick={() => void openTreeFile(item.path)}
    >
      <span className="file-list-title">{item.title}</span>
      <span className="file-list-meta">{item.filename}{formatFileTime(item.modifiedMs) ? ` · ${formatFileTime(item.modifiedMs)}` : ''}</span>
      {fileListOptions.includeSummary && item.summary && <span className="file-list-summary">{item.summary}</span>}
    </button>
  ));

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

  const renderSearchGroups = (groups: SearchGroup[]) => groups.map((group) => (
    <div key={group.path} className="search-group">
      <div className="search-group-title" title={group.path}>{group.relativePath} <span>{group.matches.length}</span></div>
      {group.matches.map((match) => (
        <button key={`${match.path}:${match.line}:${match.column}:${match.snippet}`} type="button" className="search-match" onClick={() => void jumpToSearchResult(match)}>
          <span className="search-location">{match.line}:{match.column ?? 1}</span>
          {match.before?.map((line, index) => <span key={`b-${index}`} className="search-context">{line}</span>)}
          <span className="search-snippet">{match.snippet}</span>
          {match.after?.map((line, index) => <span key={`a-${index}`} className="search-context">{line}</span>)}
        </button>
      ))}
    </div>
  ));

  const renderOutlineItems = (items: OutlineHeading[]) => items.map((item) => (
    <button
      key={item.id}
      type="button"
      className={`outline-row ${currentOutlineId === item.id ? 'current' : ''}`}
      style={{ paddingLeft: outlineFlat ? 10 : 8 + (item.level - 1) * 14 }}
      title={item.title}
      onClick={() => handleOutlineJump(item)}
    >
      {!outlineFlat && item.children.length > 0 && (
        <span className="outline-disclosure" onClick={(e) => { e.stopPropagation(); handleOutlineToggle(item.id); }}>
          {outlineModelRef.current.collapsed.has(item.id) ? '▸' : '▾'}
        </span>
      )}
      {!outlineFlat && item.children.length === 0 && <span className="outline-disclosure" />}
      <span className="outline-level">H{item.level}</span>
      <span className="outline-title">{item.number ? `${item.number} ` : ''}{item.title}</span>
    </button>
  ));

  return (
    <div className={`shell${platformMac ? ' platform-mac' : ''}`}>
      <header className="titlebar">
        <nav className="tabbar" aria-label={t('tabbar.label')}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
              title={tab.path ?? t('msg.unsavedDoc')}
              draggable
              onDragStart={() => { draggedTabIdRef.current = tab.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropTab(tab.id)}
              onClick={() => void handleSelectTab(tab.id)}
            >
              <span className="tab-dirty">{tab.dirty ? '●' : ''}</span>
              <span className="tab-title">{tab.title}</span>
              <span
                className="tab-close"
                role="button"
                aria-label={t('tab.close.label', { title: tab.title })}
                onClick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id); }}
              >×</span>
            </button>
          ))}
        </nav>
        <button
          className="titlebar-palette"
          type="button"
          onClick={() => void dispatchCommand('commandPalette.open', 'menu')}
          title={t('titlebar.palette.title')}
        >{platformMac ? '⌘P' : 'Ctrl+P'}</button>
      </header>
      <div className="workspace-shell">
        <aside className="file-tree" onKeyDown={sidebarMode === 'files' ? (fileSidebarMode === 'tree' ? handleTreeKeyDown : handleFileListKeyDown) : undefined} tabIndex={0} aria-label={sidebarMode === 'outline' ? t('sidebar.outlineAria') : sidebarMode === 'search' ? t('sidebar.searchAria') : (fileSidebarMode === 'tree' ? t('sidebar.treeAria') : t('sidebar.listAria'))}>
          <div className="file-tree-header">
            <strong>{sidebarMode === 'outline' ? t('sidebar.outline') : sidebarMode === 'search' ? t('sidebar.search') : t('sidebar.files')}</strong>
            <div className="file-sidebar-switch" role="tablist" aria-label={t('sidebar.filesSwitchLabel')}>
              <button className={sidebarMode === 'files' ? 'active' : ''} onClick={() => setSidebarMode('files')}>{t('sidebar.files')}</button>
              <button className={sidebarMode === 'outline' ? 'active' : ''} onClick={() => { setSidebarMode('outline'); refreshOutlineRef.current(); }}>{t('sidebar.outline')}</button>
              <button className={sidebarMode === 'search' ? 'active' : ''} onClick={() => setSidebarMode('search')}>{t('sidebar.search')}</button>
            </div>
            {sidebarMode === 'files' && (
              <>
                <button onClick={() => void dispatchCommand('workspace.openFolder', 'menu')} title={t('sidebar.openFolderTitle')}>{t('sidebar.openFolder')}</button>
                <button onClick={() => void dispatchCommand('workspace.refresh', 'menu')} disabled={fileTreeRoot === null}>{t('sidebar.refresh')}</button>
              </>
            )}
          </div>
          {sidebarMode === 'files' ? (
            <>
              <div className="file-tree-actions file-mode-tabs">
                <button className={fileSidebarMode === 'tree' ? 'active' : ''} onClick={() => setFileSidebarMode('tree')}>{t('sidebar.tree')}</button>
                <button className={fileSidebarMode === 'list' ? 'active' : ''} onClick={() => setFileSidebarMode('list')}>{t('sidebar.list')}</button>
              </div>
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
              </div>
              <div className="file-tree-globs">
                <input placeholder={t('tree.includeGlob')} value={fileTreeOptions.includeGlobs.join(',')} onChange={(e) => setFileTreeOption({ includeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                <input placeholder={t('tree.excludeGlob')} value={fileTreeOptions.excludeGlobs.join(',')} onChange={(e) => setFileTreeOption({ excludeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="file-tree-root" title={fileTreeRoot ?? ''}>{fileTreeRoot ?? t('tree.rootEmpty')}</div>
              {fileSidebarMode === 'tree' ? (
                <div className="file-tree-list" onContextMenu={(e) => openTreeContextMenu(e)}>
                  {fileTreeNodes.length === 0 ? (
                    <div className="sidebar-empty">{fileTreeRoot === null ? t('sidebar.emptyFiles') : t('sidebar.emptyFolder')}</div>
                  ) : renderTreeNodes(fileTreeNodes)}
                </div>
              ) : (
                <div className="file-list" aria-label={t('filelist.articles')}>
                  {fileListItems.length === 0 ? (
                    <div className="sidebar-empty">{t('sidebar.emptyFiles')}</div>
                  ) : renderFileListItems(fileListItems)}
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
                    : renderOutlineItems(items);
                })()}
              </div>
            </>
          ) : (
            <>
              <div className="search-panel">
                <input className="search-input" autoFocus placeholder={t('search.placeholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runGlobalSearch(); }} />
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
                {renderSearchGroups(searchGroups)}
              </div>
            </>
          )}
        </aside>
        <main className={`editor-container${splitOpen ? ' split' : ''}`}>
          {tabs.length === 0 && !readerOpen && !splitOpen && status === 'ready' && (
            <div className="welcome">
              <h1 className="welcome-title">Mellow</h1>
              <div className="welcome-actions">
                <button onClick={() => void dispatchCommand('file.new', 'menu')}>{t('welcome.new')}</button>
                <button onClick={() => void dispatchCommand('file.open', 'menu')}>{t('welcome.open')}</button>
                <button onClick={() => void dispatchCommand('workspace.openFolder', 'menu')}>{t('welcome.openFolder')}</button>
              </div>
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
          <div
            ref={containerRef}
            style={readerOpen ? { display: 'none' } : splitOpen ? { flexGrow: splitRatio, minWidth: 0, height: '100%' } : undefined}
          />
          {splitOpen && (
            <>
              <div className="split-divider" onMouseDown={handleSplitDragStart} title={t('split.divider.title')} />
              <div className="split-preview-wrap" style={{ flexGrow: 1 - splitRatio, minWidth: 0 }}>
                <SplitPreview
                  t={t}
                  ref={splitPreviewRef}
                  html={splitHtml}
                  onPreviewClick={handleSplitPreviewClick}
                  onScroll={handleSplitPreviewScroll}
                />
              </div>
            </>
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
            <div className="quick-open-results">
              {paletteCommands.map((item, index) => (
                <button
                  key={item.command.id}
                  type="button"
                  className={`quick-open-item ${index === commandPaletteSelected ? 'selected' : ''} ${!item.enabled ? 'disabled' : ''}`}
                  disabled={!item.enabled}
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
              onChange={(e) => handleQuickOpenQuery(e.target.value)}
              onKeyDown={handleQuickOpenKeyDown}
            />
            <div className="quick-open-meta">
              <span>{quickOpenScanning ? t('quickopen.scanning') : t('quickopen.scanned', { n: quickOpenAll.length })}</span>
              <span>{navigator.platform.toLowerCase().includes('mac') ? 'Cmd+Shift+O' : 'Ctrl+P'} · ↑↓ · Enter · Esc</span>
            </div>
            <div className="quick-open-results">
              {quickOpenResults.map((item, index) => (
                <button
                  key={item.path}
                  type="button"
                  className={`quick-open-item ${index === quickOpenSelected ? 'selected' : ''}`}
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
      <footer className="statusbar">
        <span className="statusbar-item">{dirty ? t('status.unsaved') : t('status.saved')}</span>
        <span className="statusbar-item">{stats}</span>
        <span className="statusbar-item">{cursorPos}</span>
        <span className="statusbar-sep" />
        <span className="statusbar-item">{t('status.markdown')}</span>
        <span className="statusbar-item">{t('status.utf8')}</span>
        <span className="statusbar-item">{t('status.lf')}</span>
        <span className="spacer" />
        <span className={`status ${status}`}>{statusText}</span>
      </footer>
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
      {toast !== null && (
        <div className="toast-bar">
          <span className="toast-message">{toast.message}</span>
          {toast.onUndo !== undefined && <button onClick={() => toast.onUndo?.()}>{t('msg.imagesUndo')}</button>}
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
