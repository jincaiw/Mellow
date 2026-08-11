/**
 * 节点注册表 —— 通用框架的可扩展点（spec §9-19 各节点）。
 *
 * 引擎管线只依赖注册表；新增节点类型 = 注册 NodeSpec（含 marker 提取/定制分类），
 * 无需修改插件或状态机。内置注册 Phase 1 五类节点：
 * Heading（ATX）/ Strong / Emphasis / Strikethrough / InlineCode。
 */

import type { NodeSpec, MarkerRange } from './types';

/** 内容节点名 → NodeSpec 注册表 */
const registry = new Map<string, NodeSpec>();

/** 注册节点（同一内容节点名重复注册会覆盖，便于宿主定制） */
export function registerNode(spec: NodeSpec): void {
  for (const name of spec.contentNodeNames) {
    registry.set(name, spec);
  }
}

/** 查询节点规格；未注册 → null（管线按 source 处理，安全） */
export function getNodeSpec(name: string): NodeSpec | null {
  return registry.get(name) ?? null;
}

/** 全部内容节点名（遍历语法树时快速过滤） */
export function contentNodeNames(): ReadonlySet<string> {
  return new Set(registry.keys());
}

/** marker 子节点名集合（遍历时快速命中） */
export function markerNodeNames(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const spec of registry.values()) {
    for (const name of spec.markerNodeNames) {
      names.add(name);
    }
  }
  return names;
}

/** 计算 marker 子节点的隐藏范围（默认：子节点自身范围；heading 定制含空格） */
export function extractMarkers(
  spec: NodeSpec,
  node: { from: number; to: number; name: string },
  parent: { from: number; text: string },
): MarkerRange[] | null {
  if (spec.extractMarkers) {
    return spec.extractMarkers(node, parent);
  }
  if (node.from >= node.to) {
    return null;
  }
  return [{ from: node.from, to: node.to }];
}

// ─────────────────────────── 内置节点（Phase 1） ───────────────────────────

const ATX_HEADING_RE = /^#{1,6}\s*/;

/** Heading（ATX）：marker = `#` + 空格（与 Typora 一致隐藏 `# `） */
export function registerHeadingNode(): void {
  registerNode({
    contentNodeNames: ['ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6'],
    markerNodeNames: ['HeaderMark'],
    extractMarkers: (_node, parent) => {
      const match = parent.text.match(ATX_HEADING_RE);
      if (match === null) {
        return null;
      }
      return [{ from: parent.from, to: parent.from + match[0].length }];
    },
  });
}

/**
 * 内联格式节点（Strong/Emphasis/Strikethrough/InlineCode）：
 * marker = EmphasisMark/StrikethroughMark/CodeMark 子节点自身范围。
 */
export function registerInlineNodes(): void {
  registerNode({
    contentNodeNames: ['StrongEmphasis'],
    markerNodeNames: ['EmphasisMark'],
  });
  registerNode({
    contentNodeNames: ['Emphasis'],
    markerNodeNames: ['EmphasisMark'],
  });
  registerNode({
    contentNodeNames: ['Strikethrough'],
    markerNodeNames: ['StrikethroughMark'],
  });
  registerNode({
    contentNodeNames: ['InlineCode'],
    markerNodeNames: ['CodeMark'],
  });
}

/** 注册全部内置节点（幂等） */
let builtinRegistered = false;
export function registerBuiltinNodes(): void {
  if (builtinRegistered) {
    return;
  }
  builtinRegistered = true;
  registerHeadingNode();
  registerInlineNodes();
}

// ─────────────────────────── 兼容导出（原 markers.ts 语义） ───────────────────────────

/** 内容节点名（兼容：原 CONTENT_NODE_NAMES） */
export const CONTENT_NODE_NAMES: ReadonlySet<string> = contentNodeNames();

/** marker 子节点名（兼容：原 MARKER_NODE_NAMES） */
export const MARKER_NODE_NAMES: ReadonlySet<string> = markerNodeNames();

/** Heading marker 结束偏移（兼容：原 headingMarkerEnd） */
export function headingMarkerEnd(headingText: string): number | null {
  const match = headingText.match(ATX_HEADING_RE);
  return match === null ? null : match[0].length;
}
