/**
 * App —— Mellow V0.0 Runtime Qualification Shell（最小编辑器壳）。
 * 不开发正式 UI：Open / Save / New + 编辑器容器 + 状态栏。
 *
 * 依赖注入（host-api 契约）：
 *   EditorHost（editor-react）→ CoreEditor
 *   DocumentService（app-core）→ FileService（desktop Adapter 实现）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '../../../packages/app-core/src';
import type { DocumentTab, ExternalChangeDetail, FileListItem, FileListOptions, FileTreeNode, FileTreeOptions, OutlineHeading, QuickOpenEntry, SearchGroup, TabSessionSnapshot } from '../../../packages/app-core/src';
import { createDesktopFileService } from './host/fileServices';
import { createDesktopRecoveryStorage } from './host/recoveryStorage';
import { createDesktopWatcher } from './host/watcherAdapter';
import { createDesktopDialogService } from './host/dialogs';
import { createDesktopOpenerService } from './host/openers';
import { createDesktopSearchService } from './host/searchServices';
import type { ImageWidgetActionRequest } from '../../../packages/editor-engine/src/image/widget';
import type { AssetDirConfig } from '../../../packages/editor-engine/src/image/path';
import type { Encoding, LineEnding, RecoveryEntry, FileChangeEvent, DialogService, OpenerService, SearchResult, SearchService } from '../../../packages/host-api/src/index';
import { CommandPaletteModel, CommandRegistry, commandPaletteSearch, createCommandContext, normalizeShortcut } from '../../../packages/commands/src';
import type { Command, CommandPaletteItem, CommandSource } from '../../../packages/commands/src';

const GLOBAL_ASSET_DIR_KEY = 'mellow.assetDir';
const TABS_SESSION_KEY = 'mellow.tabs.session';
const FILE_TREE_ROOT_KEY = 'mellow.fileTree.root';
const FILE_TREE_OPTIONS_KEY = 'mellow.fileTree.options';
const FILE_LIST_OPTIONS_KEY = 'mellow.fileList.options';
const FILE_SIDEBAR_MODE_KEY = 'mellow.fileSidebar.mode';
const OUTLINE_OPTIONS_KEY = 'mellow.outline.options';
const QUICK_OPEN_RECENT_KEY = 'mellow.quickOpen.recent';
const COMMAND_PALETTE_RECENT_KEY = 'mellow.commandPalette.recent';
const COMMAND_PALETTE_SHORTCUT = { mac: 'Cmd+Shift+P', winLinux: 'Ctrl+Shift+P' };
const SLASH_COMMAND_SHORTCUT = { mac: '/', winLinux: '/' };
const ASSET_DIR_OPTIONS: Array<{ value: AssetDirConfig; label: string }> = [
  { value: 'assets', label: './assets' },
  { value: 'images', label: './images' },
  { value: 'docname', label: './${文件名}.assets' },
];

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
  const [statusText, setStatusText] = useState('未加载');
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
    locale: 'zh',
    documentPath: filePathRef.current,
    workspaceRoot: fileTreeRoot,
    hasSelection: hostRef.current?.getState().hasSelection ?? false,
    targetPath: selectedTreePath,
    payload,
  }), [fileTreeRoot, selectedTreePath]);

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
    else setStatusText(`命令不可用: ${id}`);
    return ok;
  }, [commandContext, rememberCommandRecent]);

  const setFocusMode = useCallback((mode: 'off' | 'line' | 'paragraph') => {
    hostRef.current?.setFocusMode(mode);
    setFocusModeState(mode);
    setStatusText(mode === 'off' ? 'Focus Mode 已关闭' : mode === 'line' ? 'Focus Mode：当前行' : 'Focus Mode：当前段落');
  }, []);

  const cycleFocusMode = useCallback(() => {
    const next = focusMode === 'off' ? 'line' : focusMode === 'line' ? 'paragraph' : 'off';
    setFocusMode(next);
  }, [focusMode, setFocusMode]);

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
    title: filePathRef.current === null ? '未命名' : filePathRef.current.split(/[\\/]/).pop() ?? filePathRef.current,
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
      setStats(`字符 ${text.length} · 行 ${lines}`);
    } catch {
      setStats('');
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
    setStatusText(`已切换到 ${tab.title}${tab.dirty ? '（未保存）' : ''}`);
  }, [refreshStats, setDirty, watchDocument]);

  // ── 图片文件操作（spec image-workflow §6/§7 + PRD §57/§58）──

  const setAssetDir = useCallback((value: AssetDirConfig) => {
    localStorage.setItem(GLOBAL_ASSET_DIR_KEY, value);
    setAssetDirState(value);
    setStatusText(`asset 目录已设为 ./${value}/`);
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
      setStatusText(`${r.value} —— 已撤销`);
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
    const verb = kind === 'moveAll' ? '已移动' : kind === 'copyAll' ? '已复制' : '已下载'; // 远程本地化
    const undoCount = history.length - before;
    setStatusText(`${verb} ${n} 张图片 · 跳过 ${rep.skipped.length} · 失败 ${rep.failed.length}${rep.failed.length > 0 ? `（${rep.failed[0].error}）` : ''}`);
    if (n > 0) {
      showToast(`${verb} ${n} 张图片`, undoCount > 0 ? () => void undo(undoCount) : undefined);
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
        setStatusText('已复制图片路径');
      } catch {
        setStatusText('复制路径失败');
      }
      return;
    }
    if (action === 'open') {
      const abs = ops.resolveSrcPath(src);
      const r = abs !== null
        ? await opener.openPath(abs)
        : await opener.openUrl(src);
      setStatusText(r.ok ? '已打开' : `打开失败: ${r.error.message}`);
      return;
    }
    if (action === 'reveal') {
      const abs = ops.resolveSrcPath(src);
      if (abs === null) {
        setStatusText('无法解析图片路径');
        return;
      }
      const r = await opener.revealInFolder(abs);
      setStatusText(r.ok ? '已定位到文件' : `定位失败: ${r.error.message}`);
      return;
    }
    if (action === 'rename') {
      const abs = ops.resolveSrcPath(src);
      const current = abs === null ? '' : abs.split('/').pop() ?? '';
      const name = window.prompt('新文件名（不含路径）', current);
      if (name === null || name.trim() === '') return;
      const r = await ops.renameImage(src, name);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      setStatusText(`已重命名（跳过 ${r.value.skipped.length}）`);
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
      setStatusText(`${action === 'move' ? '已移动' : '已复制'}（跳过 ${rep.skipped.length}）`);
      return;
    }
    if (action === 'downloadRemote') {
      const r = await ops.downloadRemoteImage(src);
      if (!r.ok) {
        setStatusText(r.error.message);
        return;
      }
      setStatusText(r.value.downloaded > 0 ? '已下载到 asset 目录并更新引用' : `跳过: ${r.value.skipped[0]?.reason ?? ''}`);
    }
  }, []);

  /** 文档重命名（spec §6：${stem}.assets 同步 + 引用 patch 原子化） */
  const handleRenameDocument = useCallback(async () => {
    const svc = renameRef.current;
    if (!svc) return;
    const path = filePathRef.current;
    if (path === null) {
      setStatusText('未保存文档无法重命名（请先保存）');
      return;
    }
    const current = path.split('/').pop() ?? '';
    const name = window.prompt('新文件名', current);
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
      ? `已重命名（资源目录已同步，更新 ${r.value.patchedCount} 处引用）`
      : '已重命名');
    showToast(`已重命名 ${current}`, () => void undo());
  }, [currentTabPatch, refreshTabsState, undo, showToast, setDirty]);

  /** asset 目录选择（custom → 输入自定义目录名） */
  const handleAssetDirChange = useCallback((value: string) => {
    if (value === 'custom') {
      const custom = window.prompt('自定义 asset 目录名（相对文档目录；或绝对路径）', 'my-assets');
      if (custom === null || custom.trim() === '') return;
      setAssetDir(custom.trim());
      return;
    }
    setAssetDir(value as AssetDirConfig);
  }, [setAssetDir]);

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
      setStatusText(`文件树刷新失败: ${r.error.message}`);
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
    const host = hostRef.current;
    outlineModelRef.current.selectedId = item.id;
    setCurrentOutlineId(item.id);
    host?.jumpToOffset(item.from);
  }, []);

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
    setStatusText(`已打开文件夹 ${r.value}`);
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
      setStatusText(`文件列表刷新失败: ${r.error.message}`);
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
      setStatusText('Quick Open 需要先打开文件夹');
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
    if (!r.ok && !controller.signal.aborted) setStatusText(`Quick Open 扫描失败: ${r.error.message}`);
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
      setStatusText('Global Search 需要先打开文件夹');
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
      } else setStatusText(`搜索失败: ${r.error.message}`);
      setSearchRunning(false);
      return;
    }
    if (!started.ok) {
      setStatusText(`搜索失败: ${started.error.message}`);
      setSearchRunning(false);
      return;
    }
    searchCancelRef.current = started.value.cancel;
    setStatusText('搜索已启动，结果将流式显示');
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
    const name = window.prompt('新文件名', 'untitled.md');
    if (!name) return;
    const r = await svc.newFile(dir, name);
    setStatusText(r.ok ? `已新建 ${r.value}` : `新建失败: ${r.error.message}`);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreeDir]);

  const handleTreeNewFolder = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dir = selectedTreeDir();
    if (!svc || dir === null) return;
    const name = window.prompt('新文件夹名', 'New Folder');
    if (!name) return;
    const r = await svc.newFolder(dir, name);
    setStatusText(r.ok ? `已新建文件夹 ${r.value}` : `新建失败: ${r.error.message}`);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreeDir]);

  const handleTreeRename = useCallback(async (name?: string) => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    const next = name ?? window.prompt('重命名', selectedTreePath.split(/[\\/]/).pop() ?? selectedTreePath);
    if (!next) return;
    const r = await svc.rename(selectedTreePath, next);
    setStatusText(r.ok ? `已重命名 ${r.value}` : `重命名失败: ${r.error.message}`);
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeDuplicate = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    const r = await svc.duplicate(selectedTreePath);
    setStatusText(r.ok ? `已复制 ${r.value}` : `复制失败: ${r.error.message}`);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeMove = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    const dialog = dialogRef.current;
    if (!svc || !dialog || selectedTreePath === null) return;
    const target = await dialog.showDirectory();
    if (!target.ok || target.value === null) return;
    const r = await svc.move(selectedTreePath, target.value);
    setStatusText(r.ok ? `已移动 ${r.value}` : `移动失败: ${r.error.message}`);
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeDrop = useCallback(async (targetDir: string) => {
    const svc = fileTreeServiceRef.current;
    const path = draggedTreePathRef.current;
    draggedTreePathRef.current = null;
    if (!svc || path === null || path === targetDir) return;
    const r = await svc.move(path, targetDir);
    setStatusText(r.ok ? `已移动 ${r.value}` : `移动失败: ${r.error.message}`);
    if (r.ok) setSelectedTreePath(r.value);
    await refreshFilesSidebar();
  }, [refreshFileTree]);

  const handleTreeTrash = useCallback(async () => {
    const svc = fileTreeServiceRef.current;
    if (!svc || selectedTreePath === null) return;
    if (!window.confirm(`移到回收站？\n${selectedTreePath}`)) return;
    const r = await svc.trash(selectedTreePath);
    setStatusText(r.ok ? '已移到回收站' : `删除失败: ${r.error.message}`);
    if (r.ok) setSelectedTreePath(null);
    await refreshFilesSidebar();
  }, [refreshFileTree, selectedTreePath]);

  const handleTreeUndo = useCallback(async () => {
    const history = fileTreeServiceRef.current?.undoHistory;
    if (!history) return;
    const r = await history.undo();
    setStatusText(r.ok ? r.value : `撤销失败: ${r.error.message}`);
    await refreshFilesSidebar();
  }, [refreshFileTree]);

  const handleTreeCopyPath = useCallback(async (relative: boolean) => {
    if (selectedTreePath === null) return;
    const text = relative && fileTreeRoot !== null ? fileTreeRelativePath(fileTreeRoot, selectedTreePath) : selectedTreePath;
    await navigator.clipboard.writeText(text);
    setStatusText(relative ? `已复制相对路径 ${text}` : `已复制路径 ${text}`);
  }, [fileTreeRoot, selectedTreePath]);

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
        const name = window.prompt('重命名', selectedTreePath.split(/[\\/]/).pop() ?? selectedTreePath);
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
      setStatusText(`自动重载失败: ${r.error.message}`);
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
    setStatusText('外部变更已自动重新加载（保持光标位置）');
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
      setStatusText(`读取磁盘版本失败: ${r.error.message}`);
      return;
    }
    const diskLines = r.value.content.split('\n').length;
    const localLines = local.split('\n').length;
    setStatusText(`比较：磁盘 ${diskLines} 行 vs 本地 ${localLines} 行（未修改本地）`);
  }, [conflict]);

  /** 冲突：重新加载磁盘版本（放弃本地修改） */
  const handleConflictReloadDisk = useCallback(async () => {
    if (!conflict) return;
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const r = await documents.readPath(conflict.path);
    if (!r.ok) {
      setStatusText(`重新加载失败: ${r.error.message}`);
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
    setStatusText('已重新加载磁盘版本（本地修改已放弃）');
    refreshStats(host);
  }, [conflict, currentTabPatch, refreshStats, refreshTabsState, setDirty]);

  /** 冲突：保留 Mellow 版本（后续保存允许覆盖磁盘） */
  const handleConflictKeepLocal = useCallback(() => {
    diskStateRef.current = null; // 保存跳过 validate（用户已知情）
    setConflict(null);
    setStatusText('已保留本地版本（保存时将覆盖磁盘）');
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
            title: '未命名',
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
        setStatusText('编辑器就绪');
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
            setStatusText(`发现 ${list.value.length} 个未恢复文档`);
          }
        }
      })
      .catch((err) => {
        console.error('editor init failed', err);
        setStatus('error');
        setStatusText(`编辑器初始化失败: ${String(err)}`);
      });

    return () => {
      unlistenDragDrop?.();
      host.destroy();
      recoveryRef.current?.dispose();
      void externalRef.current?.stop();
    };
  }, [handleCleanChange, scheduleRecoverySnapshot, watchDocument, handleImageAction, applyTab, currentTabPatch, refreshTabsState, setDirty, refreshOutline]);

  const handleNew = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    syncActiveTabFromEditor();
    const tab = tabsRef.current.open({
      path: null,
      title: '未命名',
      content: '',
      dirty: false,
      documentId: crypto.randomUUID(),
      encoding: 'utf-8',
      eol: '\n',
      diskState: null,
    });
    refreshTabsState();
    await applyTab(tab);
    setStatusText('新建标签页（未保存）');
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
    setStatusText(`已打开 ${result.value.path}`);
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
    return window.confirm(`以下标签页有未保存修改，仍要关闭吗？\n${names}`);
  }, []);

  const ensureOneTab = useCallback(async () => {
    if (tabsRef.current.all.length > 0) return tabsRef.current.active;
    const tab = tabsRef.current.open({ path: null, title: '未命名', content: '', dirty: false, documentId: crypto.randomUUID(), encoding: 'utf-8', eol: '\n', diskState: null });
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
      setStatusText('没有可重新打开的标签页');
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
      { id: 'commandPalette.open', localizedTitle: { zh: '命令面板', en: 'Command Palette' }, category: 'system', shortcut: COMMAND_PALETTE_SHORTCUT, context: { scope: 'global' }, enabled: always, execute: () => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteVisible(true); } },
      { id: 'slash.open', localizedTitle: { zh: 'Slash 命令', en: 'Slash Commands' }, category: 'system', shortcut: SLASH_COMMAND_SHORTCUT, context: { scope: 'document' }, enabled: always, execute: () => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteQuery('/'); setCommandPaletteVisible(true); } },
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
  }, [chooseFileTreeRoot, cycleFocusMode, dispatchCommand, fileTreeRoot, handleCloseOthers, handleCloseRight, handleCloseTab, handleNew, handleOpen, handleReopenClosed, handleRenameDocument, handleSave, handleSaveAs, handleTreeCopyPath, handleTreeDuplicate, handleTreeMove, handleTreeNewFile, handleTreeNewFolder, handleTreeRename, handleTreeTrash, handleTreeUndo, openGlobalSearch, openQuickOpen, refreshFilesSidebar, selectedTreePath, setFocusMode]);

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

  // ── Crash Recovery 三选项（spec §6：Recover / Compare / Ignore）──

  const handleRecover = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
    const result = await recovery.recover(entry.documentId);
    if (!result.ok || result.value === null) {
      setStatusText(`恢复失败: ${result.ok ? '快照不存在' : result.error.message}`);
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
    setStatusText(`已恢复 ${snapshot.path ?? '未保存文档'}（修订 ${snapshot.revision}）`);
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
      setStatusText(`读取快照失败: ${result.ok ? '快照不存在' : result.error.message}`);
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
    setStatusText(`比较模式：已加载快照（磁盘版本在 ${snapshot.path ?? '(未保存)'}，快照保留待处理）`);
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

  const paletteSource: CommandSource = commandPaletteQuery.startsWith('/') ? 'slash' : 'command-palette';
  const paletteQuery = commandPaletteQuery.startsWith('/') ? commandPaletteQuery.slice(1) : commandPaletteQuery;
  const paletteCommands: CommandPaletteItem[] = commandPaletteSearch(
    commandRegistryRef.current.all(),
    paletteQuery,
    commandContext(paletteSource),
    'zh',
    commandPaletteRecent,
  );

  const runPaletteCommand = (id: string, source: CommandSource = paletteSource) => {
    setCommandPaletteVisible(false);
    setCommandPaletteQuery('');
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
    <div className="shell">
      <header className="toolbar">
        <span className="app-name">Mellow V0.0</span>
        <button onClick={() => void dispatchCommand('file.new', 'menu')} disabled={status !== 'ready'} title="macOS: Cmd+T；Windows/Linux: Ctrl+Alt+T（Ctrl+T 保留给 Table）">新建</button>
        <button onClick={() => void dispatchCommand('file.open', 'menu')} disabled={status !== 'ready'}>打开…</button>
        <button onClick={() => void dispatchCommand('file.save', 'menu')} disabled={status !== 'ready'}>保存</button>
        <button onClick={() => void dispatchCommand('file.saveAs', 'menu')} disabled={status !== 'ready'}>另存为…</button>
        <button onClick={() => void dispatchCommand('tabs.closeOthers', 'menu')} disabled={status !== 'ready' || tabs.length <= 1}>关闭其他</button>
        <button onClick={() => void dispatchCommand('tabs.closeRight', 'menu')} disabled={status !== 'ready' || tabs.length <= 1}>关闭右侧</button>
        <button onClick={() => void dispatchCommand('tabs.reopenClosed', 'menu')} disabled={status !== 'ready'}>重开关闭</button>
        <button onClick={() => void dispatchCommand('document.rename', 'menu')} disabled={status !== 'ready'}>重命名…</button>
        <span className="toolbar-sep" />
        <label className="asset-picker" title="asset 目录（PRD §53）">
          <select
            value={ASSET_DIR_OPTIONS.some((o) => o.value === assetDir) ? assetDir : 'custom'}
            onChange={(e) => handleAssetDirChange(e.target.value)}
            disabled={status !== 'ready'}
          >
            {ASSET_DIR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {!ASSET_DIR_OPTIONS.some((o) => o.value === assetDir) && <option value="custom">{assetDir}</option>}
            <option value="custom">自定义…</option>
          </select>
        </label>
        <button onClick={() => void runBatch('moveAll')} disabled={status !== 'ready'}>移动全部</button>
        <button onClick={() => void runBatch('copyAll')} disabled={status !== 'ready'}>复制全部</button>
        <button onClick={() => void runBatch('downloadRemote')} disabled={status !== 'ready'}>下载远程</button>
        <button onClick={() => void dispatchCommand('view.focus.cycle', 'menu')} disabled={status !== 'ready'} title="F8：关闭 / 当前行 / 当前段落">Focus: {focusMode === 'off' ? '关' : focusMode === 'line' ? '行' : '段'}</button>
        <span className="spacer" />
        <span className={`status ${status}`}>{statusText}</span>
      </header>
      <nav className="tabbar" aria-label="打开的文档标签页">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
            title={tab.path ?? '(未保存文档)'}
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
              aria-label={`关闭 ${tab.title}`}
              onClick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id); }}
            >×</span>
          </button>
        ))}
      </nav>
      <div className="workspace-shell">
        <aside className="file-tree" onKeyDown={sidebarMode === 'files' ? (fileSidebarMode === 'tree' ? handleTreeKeyDown : handleFileListKeyDown) : undefined} tabIndex={0} aria-label={sidebarMode === 'outline' ? '大纲' : sidebarMode === 'search' ? '全局搜索' : (fileSidebarMode === 'tree' ? '文件树' : '文件列表')}>
          <div className="file-tree-header">
            <strong>{sidebarMode === 'outline' ? '大纲' : sidebarMode === 'search' ? '搜索' : '文件'}</strong>
            <div className="file-sidebar-switch" role="tablist" aria-label="侧栏切换">
              <button className={sidebarMode === 'files' ? 'active' : ''} onClick={() => setSidebarMode('files')}>文件</button>
              <button className={sidebarMode === 'outline' ? 'active' : ''} onClick={() => { setSidebarMode('outline'); refreshOutlineRef.current(); }}>大纲</button>
              <button className={sidebarMode === 'search' ? 'active' : ''} onClick={() => setSidebarMode('search')}>搜索</button>
            </div>
            {sidebarMode === 'files' && (
              <>
                <button onClick={() => void dispatchCommand('workspace.openFolder', 'menu')} title="打开文件夹">打开…</button>
                <button onClick={() => void dispatchCommand('workspace.refresh', 'menu')} disabled={fileTreeRoot === null}>刷新</button>
              </>
            )}
          </div>
          {sidebarMode === 'files' ? (
            <>
              <div className="file-tree-actions file-mode-tabs">
                <button className={fileSidebarMode === 'tree' ? 'active' : ''} onClick={() => setFileSidebarMode('tree')}>树</button>
                <button className={fileSidebarMode === 'list' ? 'active' : ''} onClick={() => setFileSidebarMode('list')}>列表</button>
              </div>
              {fileSidebarMode === 'tree' && (
                <>
                  <div className="file-tree-actions">
                    <button onClick={() => void dispatchCommand('fileTree.newFile', 'menu')} disabled={fileTreeRoot === null}>新文件</button>
                    <button onClick={() => void dispatchCommand('fileTree.newFolder', 'menu')} disabled={fileTreeRoot === null}>新文件夹</button>
                    <button onClick={() => void dispatchCommand('fileTree.rename', 'menu')} disabled={selectedTreePath === null}>重命名</button>
                    <button onClick={() => void dispatchCommand('fileTree.duplicate', 'menu')} disabled={selectedTreePath === null}>复制</button>
                    <button onClick={() => void dispatchCommand('fileTree.move', 'menu')} disabled={selectedTreePath === null}>移动</button>
                    <button onClick={() => void dispatchCommand('fileTree.trash', 'menu')} disabled={selectedTreePath === null}>回收站</button>
                    <button onClick={() => void dispatchCommand('fileTree.undo', 'menu')} disabled={fileTreeRoot === null}>撤销</button>
                  </div>
                  <div className="file-tree-actions">
                    <button onClick={() => void dispatchCommand('fileTree.copyPath', 'context-menu')} disabled={selectedTreePath === null}>复制路径</button>
                    <button onClick={() => void dispatchCommand('fileTree.copyRelativePath', 'context-menu')} disabled={selectedTreePath === null || fileTreeRoot === null}>复制相对路径</button>
                  </div>
                </>
              )}
              <div className="file-tree-filters">
                <label><input type="checkbox" checked={fileTreeOptions.showHidden} onChange={(e) => setFileTreeOption({ showHidden: e.target.checked })} />隐藏文件</label>
                <label><input type="checkbox" checked={fileTreeOptions.showNonMarkdown} onChange={(e) => setFileTreeOption({ showNonMarkdown: e.target.checked })} />非 Markdown</label>
                {fileSidebarMode === 'list' && <label><input type="checkbox" checked={fileListOptions.recursive} onChange={(e) => setFileListOption({ recursive: e.target.checked })} />递归</label>}
                {fileSidebarMode === 'list' && <label><input type="checkbox" checked={fileListOptions.includeSummary} onChange={(e) => setFileListOption({ includeSummary: e.target.checked })} />摘要</label>}
                <label>排序
                  <select value={fileTreeOptions.sortBy} onChange={(e) => setFileTreeOption({ sortBy: e.target.value as FileTreeOptions['sortBy'] })}>
                    <option value="natural">自然</option>
                    <option value="name">名称</option>
                    <option value="modified">修改时间</option>
                    <option value="created">创建时间</option>
                  </select>
                </label>
                <label><input type="checkbox" checked={fileTreeOptions.sortAsc} onChange={(e) => setFileTreeOption({ sortAsc: e.target.checked })} />升序</label>
              </div>
              <div className="file-tree-globs">
                <input placeholder="include glob（逗号分隔）" value={fileTreeOptions.includeGlobs.join(',')} onChange={(e) => setFileTreeOption({ includeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                <input placeholder="exclude glob（逗号分隔）" value={fileTreeOptions.excludeGlobs.join(',')} onChange={(e) => setFileTreeOption({ excludeGlobs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="file-tree-root" title={fileTreeRoot ?? ''}>{fileTreeRoot ?? '未打开文件夹（不会创建 .mellow）'}</div>
              {fileSidebarMode === 'tree' ? (
                <div className="file-tree-list">
                  {renderTreeNodes(fileTreeNodes)}
                </div>
              ) : (
                <div className="file-list" aria-label="Articles 文件列表">
                  {renderFileListItems(fileListItems)}
                </div>
              )}
            </>
          ) : sidebarMode === 'outline' ? (
            <>
              <div className="file-tree-filters">
                <input className="outline-filter" placeholder="过滤标题" value={outlineFilter} onChange={(e) => setOutlineFilter(e.target.value)} />
                <label><input type="checkbox" checked={outlineFlat} onChange={(e) => setOutlineFlat(e.target.checked)} />Flat</label>
                <label><input type="checkbox" checked={outlineAutoNumber} onChange={(e) => setOutlineAutoNumberOption(e.target.checked)} />编号</label>
              </div>
              <div className="outline-list" aria-label="文档大纲">
                {renderOutlineItems(outlineItems)}
              </div>
            </>
          ) : (
            <>
              <div className="search-panel">
                <input className="search-input" autoFocus placeholder="Search workspace" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runGlobalSearch(); }} />
                <div className="search-toggles">
                  <label><input type="checkbox" checked={searchCase} onChange={(e) => setSearchCase(e.target.checked)} />Aa</label>
                  <label><input type="checkbox" checked={searchWholeWord} onChange={(e) => setSearchWholeWord(e.target.checked)} />Word</label>
                  <label><input type="checkbox" checked={searchRegex} onChange={(e) => setSearchRegex(e.target.checked)} />.*</label>
                  <label>Ctx <input type="number" min="0" max="2" value={searchContext} onChange={(e) => setSearchContext(Math.max(0, Math.min(2, Number(e.target.value) || 0)))} /></label>
                </div>
                <input className="search-input small" placeholder="include glob（逗号）" value={searchInclude} onChange={(e) => setSearchInclude(e.target.value)} />
                <input className="search-input small" placeholder="exclude glob（默认忽略 .git/node_modules/dist/build/target/vendor）" value={searchExclude} onChange={(e) => setSearchExclude(e.target.value)} />
                <button onClick={() => void runGlobalSearch()} disabled={!searchQuery || fileTreeRoot === null}>搜索</button>
                <span className="search-count">{searchRunning ? 'streaming…' : ''} {searchResults.length} matches</span>
              </div>
              <div className="search-results" aria-label="全局搜索结果">
                {renderSearchGroups(searchGroups)}
              </div>
            </>
          )}
        </aside>
        <main className="editor-container" ref={containerRef} />
      </div>
      {commandPaletteVisible && (
        <div className="quick-open-backdrop" onMouseDown={() => setCommandPaletteVisible(false)}>
          <div className="quick-open-panel" onMouseDown={(e) => e.stopPropagation()}>
            <input
              className="quick-open-input"
              autoFocus
              value={commandPaletteQuery}
              placeholder="Command Palette / Slash / Plugin Commands"
              onChange={(e) => { commandPaletteModelRef.current.selectedIndex = 0; setCommandPaletteSelected(0); setCommandPaletteQuery(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCommandPaletteVisible(false);
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
                  <span className="quick-open-path">{item.command.id} · {item.command.category}{item.command.shortcut ? ` · ${item.command.shortcut.mac ?? item.command.shortcut.winLinux ?? ''}` : ''}{item.recentRank !== undefined ? ' · 最近' : ''}</span>
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
              placeholder="Quick Open：输入文件名或相对路径（支持中文 / Unicode）"
              onChange={(e) => handleQuickOpenQuery(e.target.value)}
              onKeyDown={handleQuickOpenKeyDown}
            />
            <div className="quick-open-meta">
              <span>{quickOpenScanning ? '正在扫描，结果逐步显示…' : `已扫描 ${quickOpenAll.length} 个文件`}</span>
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
              {quickOpenResults.length === 0 && <div className="quick-open-empty">没有匹配结果</div>}
            </div>
          </div>
        </div>
      )}
      {conflict !== null && (
        <div className="recovery-bar conflict-bar">
          <span>磁盘文件已被外部修改（{conflict.kind}）—— 禁止覆盖：</span>
          <button onClick={() => void handleConflictCompare()}>比较</button>
          <button onClick={() => void handleConflictReloadDisk()}>重新加载磁盘版本</button>
          <button onClick={handleConflictKeepLocal}>保留 Mellow 版本</button>
        </div>
      )}
      {recoveryEntries.length > 0 && (
        <div className="recovery-bar">
          <span>发现 {recoveryEntries.length} 个未恢复文档：</span>
          {recoveryEntries.map((entry) => (
            <span key={entry.documentId} className="recovery-item">
              {entry.path ?? '(未保存文档)'} · 修订 {entry.revision}
              <button onClick={() => void handleRecover(entry)}>恢复</button>
              <button onClick={() => void handleCompare(entry)}>比较</button>
              <button onClick={() => void handleIgnore(entry)}>忽略</button>
            </span>
          ))}
        </div>
      )}
      <footer className="statusbar">
        <span>{dirty ? '● 未保存' : '○ 已保存'}</span>
        <span>{stats}</span>
      </footer>
      {toast !== null && (
        <div className="toast-bar">
          <span className="toast-message">{toast.message}</span>
          {toast.onUndo !== undefined && <button onClick={() => toast.onUndo?.()}>撤销</button>}
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
