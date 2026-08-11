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
import { installCompositionTracking } from './composition';

export { buildMarkerRevealExtension, MARKER_CLASS, MARKER_DIM_CLASS } from './plugin';
export { buildTaskCheckboxExtension, CHECKBOX_CLASS } from './taskCheckbox';
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
  return [buildMarkerRevealExtension(), buildTaskCheckboxExtension()];
}
