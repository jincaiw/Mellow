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
import { buildTaskCheckboxExtension } from './taskCheckbox';
import { buildTableToolbarExtension } from './table/toolbar';
import { installCompositionTracking } from './composition';
import { buildImageExtensions } from './image';
import { buildSmartPasteExtension } from './smartPaste';
import { buildClipboardCopyExtension } from './clipboardCopy';
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
import { buildDocumentSearchExtension, installSearchApi } from './documentSearch';
import { installFormatApi } from './selectionToolbar';
import { buildLargeFileExtension, installLargeFileApi } from './largeFile';
export { buildMarkerRevealExtension, MARKER_CLASS, MARKER_DIM_CLASS } from './plugin';
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
export { buildSelectionToolbarExtension, shouldShowToolbar, applyInlineFormat, applyLink, applyBlockPrefix, applyHeading, setSelectionToolbarEnabled, getSelectionToolbarEnabled, SELECTION_TOOLBAR_CLASS } from './selectionToolbar';
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
  LARGE_FILE_BYTES_THRESHOLD,
  LARGE_FILE_LINES_THRESHOLD,
} from './largeFile';
export { buildCodeFenceAutocompleteExtension, fenceLangSource } from './codeFence';
export { emojiSource } from './emoji';
export { buildInlineExtrasExtension, scanInlineExtras, inlineCodeSpans } from './inlineExtras';
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
 */
export function install(autoInstallComposition = true): ReturnType<typeof buildMarkerRevealExtension> {
  if (autoInstallComposition) {
    installCompositionTracking();
  }
  // Large File Mode：宿主（EditorCore）经 iframe window.__MELLOW_LARGE_FILE__ 调用
  installLargeFileApi();
  // 文档查找/替换：宿主（菜单）经 iframe window.__MELLOW_SEARCH_API__ 调用
  installSearchApi();
  // 格式/段落命令：宿主（菜单）经 iframe window.__MELLOW_FORMAT_API__ 调用
  installFormatApi();
  return [
    buildMarkerRevealExtension(),
    buildTaskCheckboxExtension(),
    buildTableToolbarExtension(),
    buildClipboardCopyExtension(),
    buildSmartPasteExtension(),
    buildMathExtension(false),
    buildMermaidExtension(false),
    buildFootnoteExtension(false),
    buildTocExtension(false),
    buildGitHubAlertsExtension(false),
    buildYamlFrontMatterExtension(false),
    buildSafeHtmlExtension(false),
    buildOutlineBridgeExtension(),
    buildFocusModeExtension(),
    buildSlashCommandsExtension(),
    buildTypewriterModeExtension(),
    buildSelectionToolbarExtension(),
    buildScrollBridgeExtension(),
    buildImageExtensions(),
    buildLargeFileExtension(),
    buildCodeFenceAutocompleteExtension([emojiSource]),
    buildInlineExtrasExtension(),
    buildDocumentSearchExtension(),
  ];
}
