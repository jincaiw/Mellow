/**
 * app-core —— 应用核心逻辑入口。
 */

export { DocumentService, createAppServices, documentSuggestedName } from './document';
export { RecoveryService } from './recovery';
export { ExternalChangeService } from './externalChange';
export type { ExternalChangeDetail, ExternalChangeServiceOptions } from './externalChange';
export { createEditorBridgeFromCore } from './editorBridge';
export type { EditorBridge, TextChange } from './editorBridge';
export { FileOpHistory, describeOp } from './fileOpHistory';
export type { FileOp, FileOpRecord } from './fileOpHistory';
export { ImageFileOpsService } from './imageFileOps';
export type { ImageFileOpsDeps, AssetSettingProvider } from './imageFileOps';
export { DocumentRenameService } from './documentRename';
export { renderReaderHtml, renderInline, slugifyHeading } from './reader';
export type { ReaderRenderOptions, ReaderRenderResult } from './reader';export type { DocumentRenameDeps, RenameOutcome } from './documentRename';
export { DocumentState } from './documentState';
export type { DocumentTab, DocumentSessionSnapshot, DocumentStateInput, OpenDocumentInput, TabDiskState, CloseResult } from './documentState';
export { FileTreeModel, FileTreeService, FileTreeHistory, DEFAULT_FILE_TREE_OPTIONS, basename, dirname, relativePath, shouldShowEntry, sortEntries, filterFileTree } from './fileTree';
export type { FileTreeOptions, FileTreeNode, FlatFileTreeNode, FileTreeUndoOp, FileTreeSortBy } from './fileTree';
export { FileListModel, FileListService, DEFAULT_FILE_LIST_OPTIONS, titleFromMarkdown, summaryFromMarkdown, filterFileList } from './fileList';
export type { FileListOptions, FileListItem } from './fileList';
export { OutlineModel, buildOutline, parseHeadings, flattenOutline, filterOutline, currentHeadingId, headingOffsetForAnchor } from './outline';
export type { OutlineHeading, BuildOutlineOptions } from './outline';
export { QuickOpenModel, fuzzyScore, rankQuickOpen, scanQuickOpen, quickOpenShortcutAction } from './quickOpen';
export type { QuickOpenAction, QuickOpenEntry, QuickOpenKeyEvent, QuickOpenPlatform, QuickOpenRankedEntry, QuickOpenScanOptions } from './quickOpen';
export { pushRecentFile, markRecentMissing, parseRecentFiles, serializeRecentFiles, RECENT_FILES_LIMIT, pushRecentFolder, parseRecentFolders, serializeRecentFolders, RECENT_FOLDERS_LIMIT } from './recentFiles';
export { countWords, formatWordCountStats } from './wordCount';
export type { WordCount } from './wordCount';
export type { RecentFileEntry } from './recentFiles';
export { DEFAULT_SEARCH_EXCLUDES, buildSearchRegex, globalSearchShortcutAction, groupSearchResults, matchSearchLine, normalizeSearchRequest, SearchResultsModel } from './globalSearch';
export type { SearchGroup, SearchLineOptions } from './globalSearch';
export { ExtensionRegistry, buildExtensionContext, createNullExtensionHost } from './extensions';
export type { ExtensionHost, ExtensionDocumentHost } from './extensions';
