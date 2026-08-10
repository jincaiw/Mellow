/**
 * Mellow Live Markdown Engine —— 入口。
 *
 * 通过宿主注入（MarkEdit.addExtension），不修改 vendored CoreEditor：
 *   import * as engine from '@mellow/editor-engine';
 *   MarkEdit.addExtension(engine.buildMarkerRevealExtension());
 */

import { buildMarkerRevealExtension } from './plugin';
import { installCompositionTracking } from './composition';

export { buildMarkerRevealExtension, MARKER_CLASS } from './plugin';
export { CONTENT_NODE_NAMES, MARKER_NODE_NAMES, headingMarkerEnd } from './markers';

/**
 * 宿主安装入口：注册 composition 监听并返回引擎扩展。
 *
 * @param autoInstallComposition 默认 true；测试环境可关闭，自行管理状态
 */
export function install(autoInstallComposition = true): ReturnType<typeof buildMarkerRevealExtension> {
  if (autoInstallComposition) {
    installCompositionTracking();
  }
  return buildMarkerRevealExtension();
}
