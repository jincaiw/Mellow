/**
 * Image Workflow（spec image-workflow）—— 独立扩展组。
 *
 * 输入：Markdown typing / file picker / drag single / drag multiple /
 *       paste bitmap / paste copied file / paste URL（spec §2）
 * 路径：relative / Chinese / spaces / Windows / macOS / Linux（spec §5，path.ts 纯函数）
 * 渲染：Live Mode 图片 widget + broken placeholder（spec §8）
 * 上传：暂不实现（spec §7 Upload / §9 remote localize 属后续阶段）
 */

import type { Extension } from '@codemirror/state';
import type { ImageHost } from './host';
import { createNullImageHost } from './host';
import { buildImageWidgetExtension } from './widget';
import { buildImageInputExtension } from './input';

export * from './path';
export * from './host';
export * from './insert';
export * from './input';
export * from './widget';

/**
 * 安装 Image 工作流扩展（widget 渲染 + paste/drag 输入）。
 *
 * @param host ImageHost 实现；缺省用 null host（无宿主能力：图片不可解析，输入不可用）
 */
export function buildImageExtensions(host?: ImageHost): Extension {
  const resolved = host ?? createNullImageHost();
  return [
    buildImageWidgetExtension(resolved),
    buildImageInputExtension(resolved),
  ];
}
