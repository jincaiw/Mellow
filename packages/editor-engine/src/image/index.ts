/**
 * Image Workflow（spec image-workflow）—— 独立扩展组。
 *
 * 输入：Markdown typing / file picker / drag single / drag multiple /
 *       paste bitmap / paste copied file / paste URL（spec §2）
 * 路径：relative / Chinese / spaces / Windows / macOS / Linux（spec §5，path.ts 纯函数）
 * 渲染：Live Mode 图片 widget + broken placeholder（spec §8）+ 远程图加载超时（spec §9）
 * 批量：Move All / Copy All / Download Remote / Upload All（spec §7）
 *       —— 编排在 `packages/app-core/src/imageFileOps.ts`，宿主装配见
 *       `apps/desktop/src/host/uploadService.ts` 与 `src-tauri/src/upload.rs`。
 *
 * ⚠️ 本文件头原先写「上传：暂不实现（spec §7 Upload / §9 remote localize 属后续阶段）」——
 * **已过期**（2026-10-01 更正）：`uploadAll` / `downloadRemote` 均已实现并有 e2e
 *（`tests/e2e/image-upload-verify.mjs`）。**代码注释也是声明，过期即失真。**
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
export * from './scan';
export * from './assetConfig';
export * from './ops';
export * from './engineApi';

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
