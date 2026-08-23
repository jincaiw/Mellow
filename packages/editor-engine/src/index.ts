/**
 * Mellow Live Markdown Engine —— 通用框架入口。
 *
 * 通过宿主注入（MarkEdit.addExtension），不修改 vendored CoreEditor：
 *   import * as engine from '@mellow/editor-engine';
 *   MarkEdit.addExtension(engine.buildMarkerRevealExtension());
 *
 * 框架能力：
 * - NodeVisualState 状态机（source/rendered/mixed/invalid，spec §4）
 * - Reveal Policy 纯函数（caret/selection/composition/forceSource，spec §5）
 * - 节点注册表（NodeSpec：新增节点 = registerNode，不改管线）
 * - Composition Guard（spec §6）+ 增量 decoration 更新 + Viewport-only（spec §3/§20）
 */

import { buildMarkerRevealExtension } from './plugin';
import { mergeEngineFeatures } from './config';
import type { EngineFeatureConfig } from './config';
import type { Extension } from '@codemirror/state';
import { buildTaskCheckboxExtension } from './taskCheckbox';
import { buildTableToolbarExtension } from './table/toolbar';
import { buildColumnWidthExtension } from './table/columnWidth';
import { installCompositionTracking } from './composition';
import { buildImageExtensions } from './image';
import { buildSmartPasteExtension } from './smartPaste';
import { buildClipboardCopyExtension, installClipboardApi } from './clipboardCopy';
import { buildMathExtension } from './math';
import { buildMermaidExtension } from './mermaid';
import { buildFootnoteExtension } from './footnote';
import { buildTocExtension } from './toc';
import { buildGitHubAlertsExtension } from './githubAlerts';
import { buildYamlFrontMatterExtension } from './yamlFrontMatter';
import { buildSafeHtmlExtension } from './safeHtml';
import { buildOutlineBridgeExtension } from './outlineBridge';
import { buildFocusModeExtension } from './focusMode';
import { buildSlashCommandsExtension } from './slashCommands';
import { buildTypewriterModeExtension } from './typewriterMode';
import { buildSelectionToolbarExtension } from './selectionToolbar';
import { buildScrollBridgeExtension } from './scrollBridge';
import { buildCodeFenceAutocompleteExtension } from './codeFence';
import { emojiSource } from './emoji';
import { buildInlineExtrasExtension } from './inlineExtras';
import { installSourceApi } from './sourceMode';
import { buildWikilinkExtension } from './wikilink';
import { buildMdLinkExtension } from './mdLink';
import { buildContextMenuExtension, buildContextMenuViewTrackerExtension, installContextMenuApi } from './contextMenu';
import { buildDocumentSearchExtension, installSearchApi } from './documentSearch';
import { installFormatApi } from './selectionToolbar';
import { buildLargeFileExtension, installLargeFileApi, installSpellcheckApi } from './largeFile';
import { buildSelectionCommandsExtension, installSelectionCommandsApi } from './selectionCommands';
import { buildSmartPunctuationExtension, installSmartPunctuationApi } from './smartPunctuation';
import { buildCodeLineNumbersExtension, installCodeLineNumbersApi } from './codeLineNumbers';
export { buildCodeLineNumbersExtension, installCodeLineNumbersApi, setCodeLineNumbers, isCodeLineNumbersEnabled, codeLineNumbersVersion, fenceContentRange } from './codeLineNumbers';
export type { CodeLineNumbersApi } from './codeLineNumbers';
export { buildMarkerRevealExtension, MARKER_CLASS, MARKER_DIM_CLASS } from './plugin';
export { DEFAULT_ENGINE_FEATURES, mergeEngineFeatures, readEngineFeaturesFromStorage } from './config';
export type { EngineFeatureConfig } from './config';
export { buildTaskCheckboxExtension, CHECKBOX_CLASS } from './taskCheckbox';
export * from './table';
export * from './image';
export * from './smartPaste';
export * from './clipboardCopy';
export * from './math';
export * from './mermaid';
export * from './footnote';
export * from './toc';
export * from './githubAlerts';
export * from './yamlFrontMatter';
export { buildOutlineBridgeExtension } from './outlineBridge';
export { buildFocusModeExtension, getFocusMode, setFocusMode, FOCUS_DIM_CLASS } from './focusMode';
export { buildSlashCommandsExtension, canTriggerSlashCommand } from './slashCommands';
export type { SlashOpenRequest, SlashCommandsOptions } from './slashCommands';
export { buildTypewriterModeExtension, computeTypewriterScrollTop, getTypewriterMode, setTypewriterMode, TYPEWRITER_CENTER_RATIO } from './typewriterMode';
export { buildSelectionToolbarExtension, shouldShowToolbar, applyInlineFormat, applyLink, applyBlockPrefix, applyHeading, applyDeleteLine, applyReferenceLink, setSelectionToolbarEnabled, getSelectionToolbarEnabled, SELECTION_TOOLBAR_CLASS } from './selectionToolbar';
export type { TextRange, ApplyResult, ToolbarVisibility, SelectionToolbarOptions } from './selectionToolbar';
export { buildScrollBridgeExtension } from './scrollBridge';
export type { ScrollBridgeApi } from './scrollBridge';
export {
  classifyLargeFile,
  isLargeFileMode,
  largeFileVersion,
  setLargeFileMode,
  largeFileViewportRange,
  largeFileDecorationLimit,
  buildLargeFileExtension,
  installLargeFileApi,
  setUserSpellcheck,
  isUserSpellcheck,
  installSpellcheckApi,
  LARGE_FILE_BYTES_THRESHOLD,
  LARGE_FILE_LINES_THRESHOLD,
} from './largeFile';
export { buildSelectionCommandsExtension, installSelectionCommandsApi } from './selectionCommands';
export type { SelectionCommandsApi } from './selectionCommands';
export {
  buildSmartPunctuationExtension,
  installSmartPunctuationApi,
  setSmartPunctuation,
  isSmartPunctuationEnabled,
  smartQuoteFor,
  shouldEmDash,
} from './smartPunctuation';
export type { SmartPunctuationApi } from './smartPunctuation';
export { buildCodeFenceAutocompleteExtension, fenceLangSource } from './codeFence';
export { emojiSource } from './emoji';
export { buildInlineExtrasExtension, scanInlineExtras, inlineCodeSpans } from './inlineExtras';
export { installSourceApi } from './sourceMode';
export { buildWikilinkExtension, scanWikilinks } from './wikilink';
export type { WikilinkRange } from './wikilink';
export { buildMdLinkExtension, scanMdLinks, isMdLinkDest } from './mdLink';
export type { MdLinkRange } from './mdLink';
export { buildContextMenuExtension, buildContextMenuViewTrackerExtension, installContextMenuApi, inlineLinkAt, imageSourceAt } from './contextMenu';
export type { EditorContextMenuRequest, EditorContextActions, InlineLinkSpan } from './contextMenu';
export type { OutlineBridgeApi } from './outlineBridge';
export {
  buildSafeHtmlExtension,
  extractHtmlBlocks,
  renderSafeHtml,
  sanitizeHtml as sanitizeSafeHtml,
} from './safeHtml';
export type { HtmlBlock } from './safeHtml';
export {
  registerNode,
  registerHeadingNode,
  registerSetextNode,
  registerInlineNodes,
  registerLinkNode,
  registerAutolinkNode,
  registerListNode,
  registerBlockquoteNode,
  registerCodeFenceNode,
  registerBuiltinNodes,
  getNodeSpec,
  extractMarkers,
  contentNodeNames,
  markerNodeNames,
  CONTENT_NODE_NAMES,
  MARKER_NODE_NAMES,
  headingMarkerEnd,
} from './nodes';
export { classifyNodeState, shouldHideMarkers, shouldShowMarkers } from './state';
export { setSourceMode, isSourceMode, resetModeState } from './mode';
export { intersects } from './types';
export type { NodeVisualState, NodeSpec, MarkerRange, RevealContext } from './types';

/**
 * 宿主安装入口：注册 composition 监听并返回引擎扩展。
 *
 * @param autoInstallComposition 默认 true；测试环境可关闭，自行管理状态
 * @param features 语法特性开关（PRD §94）；未传则全部开启。变更后需重新加载编辑器生效
 */
export function install(autoInstallComposition = true, features?: Partial<EngineFeatureConfig>): ReturnType<typeof buildMarkerRevealExtension> {
  if (autoInstallComposition) {
    installCompositionTracking();
  }
  // Large File Mode：宿主（EditorCore）经 iframe window.__MELLOW_LARGE_FILE__ 调用
  installLargeFileApi();
  // 拼写检查开关（D1-1）：宿主经 iframe window.__MELLOW_SPELLCHECK__ 调用
  installSpellcheckApi();
  // 选择命令（D1-4：⌘L 行 / ⌥⌘P 段落）：宿主经 iframe window.__MELLOW_SELECTION_COMMANDS__ 调用
  installSelectionCommandsApi();
  // 文档查找/替换：宿主（菜单）经 iframe window.__MELLOW_SEARCH_API__ 调用
  installSearchApi();
  // 格式/段落命令：宿主（菜单）经 iframe window.__MELLOW_FORMAT_API__ 调用
  installFormatApi();
  // 剪贴板命令：宿主（菜单）经 iframe window.__MELLOW_CLIPBOARD_API__ 调用
  installClipboardApi();
  // 编辑器右键菜单动作：宿主经 iframe window.__MELLOW_CONTEXT_ACTIONS__ 调用
  installContextMenuApi();
  // 源码模式（PRD §30）：宿主经 iframe window.__MELLOW_SOURCE_API__ 调用
  installSourceApi();
  // 智能标点（master-plan R2-1）：宿主经 iframe window.__MELLOW_SMART_PUNCTUATION__ 调用
  installSmartPunctuationApi();
  // 代码块行号（Typora parity）：宿主经 iframe window.__MELLOW_CODE_LINE_NUMBERS__ 调用
  installCodeLineNumbersApi();
  const f = mergeEngineFeatures(features);
  const ext: Extension[] = [
    buildMarkerRevealExtension(),
    buildTaskCheckboxExtension(),
    buildTableToolbarExtension(),
    buildColumnWidthExtension(),
    buildClipboardCopyExtension(),
    buildSmartPasteExtension(),
    buildOutlineBridgeExtension(),
    buildFocusModeExtension(),
    buildSlashCommandsExtension(),
    buildTypewriterModeExtension(),
    buildSelectionToolbarExtension(),
    buildScrollBridgeExtension(),
    buildImageExtensions(),
    buildLargeFileExtension(),
    buildSelectionCommandsExtension(),
    buildSmartPunctuationExtension(),
    buildCodeLineNumbersExtension(),
    buildContextMenuExtension(),
    buildContextMenuViewTrackerExtension(),
    buildDocumentSearchExtension(),
    buildMdLinkExtension(),
  ];
  // 可开关的语法特性（PRD §94 Markdown 设置）
  if (f.math) ext.push(buildMathExtension(false));
  if (f.mermaid) ext.push(buildMermaidExtension(false));
  if (f.footnote) ext.push(buildFootnoteExtension(false));
  if (f.toc) ext.push(buildTocExtension(false));
  if (f.alerts) ext.push(buildGitHubAlertsExtension(false));
  if (f.yaml) ext.push(buildYamlFrontMatterExtension(false));
  if (f.html) ext.push(buildSafeHtmlExtension(false));
  if (f.highlight || f.supSub) ext.push(buildInlineExtrasExtension());
  if (f.wikilink) ext.push(buildWikilinkExtension());
  ext.push(buildCodeFenceAutocompleteExtension([...f.emoji ? [emojiSource] : []]));
  return ext;
}
