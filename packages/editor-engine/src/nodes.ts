/**
 * 节点注册表 —— 通用框架的可扩展点（spec §9-19 各节点）。
 *
 * 引擎管线只依赖注册表；新增节点类型 = 注册 NodeSpec（含 marker 提取/定制分类），
 * 无需修改插件或状态机。内置注册 Phase 1 五类节点：
 * Heading（ATX）/ Strong / Emphasis / Strikethrough / InlineCode。
 */

import type { NodeSpec, MarkerRange } from './types';
import { intersects, MARKER_DIM_CLASS } from './types';

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
  node: { from: number; to: number; name: string; text: string },
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

/**
 * Setext Heading：`标题\n===` / `标题\n---`。
 * marker = HeaderMark 子节点（下划线），默认提取（子节点自身范围）。
 */
export function registerSetextNode(): void {
  registerNode({
    contentNodeNames: ['SetextHeading1', 'SetextHeading2'],
    markerNodeNames: ['HeaderMark'],
  });
}

/**
 * Link（inline/reference）：spec §12 mixed 模型。
 * - idle：link text 显示，URL + 括号隐藏
 * - caret in text：text-marker（`[` `]`）显示，URL 隐藏
 * - caret in URL：URL + 括号显示，text-marker 隐藏
 * - selection 碰 marker → source（全显示）
 */
export function registerLinkNode(): void {
  registerNode({
    contentNodeNames: ['Link'],
    markerNodeNames: ['LinkMark', 'URL', 'LinkLabel'],
    extractMarkers: (node) => {
      if (node.name === 'URL') {
        return [{ from: node.from, to: node.to, kind: 'url' }];
      }
      if (node.name === 'LinkLabel') {
        return [{ from: node.from, to: node.to, kind: 'label' }];
      }
      // LinkMark：'[' ']' → text-marker；'(' ')' → url-marker
      const kind = node.text === '[' || node.text === ']' ? 'text-marker' : 'url-marker';
      return [{ from: node.from, to: node.to, kind }];
    },
    classify: (node, markers, ctx) => {
      if (ctx.forceSource) {
        return 'source';
      }
      // selection（非 caret）碰 marker → source（spec §5.2）；caret 碰 marker 走 mixed
      const isCaret = ctx.caret.anchor === ctx.caret.head;
      if (!isCaret && markers.some((m) => intersects(ctx.caret.anchor, ctx.caret.head, m.from, m.to))) {
        return 'source';
      }
      // caret 在节点内 → mixed（部分显示，spec §12）
      if (intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to)) {
        return 'mixed';
      }
      return 'rendered';
    },
    hiddenMarkers: (node, markers, ctx, state) => {
      if (state === 'source') {
        return [];
      }
      const caret = ctx.caret;
      // URL 区间：'(' 之后到 ')' 之前（inline）；无括号（reference/autolink）→ 无 URL 区
      const open = node.text.indexOf('(');
      const close = node.text.lastIndexOf(')');
      const inUrl = open !== -1 && close > open
        && caret.head > node.from + open && caret.head < node.from + close;
      const inText = intersects(caret.anchor, caret.head, node.from, node.to) && !inUrl;
      return markers.filter((m) => {
        if (m.kind === 'url' || m.kind === 'url-marker') {
          return !inUrl; // URL + 括号：caret 在 URL 内才显示
        }
        return !inText; // text-marker/label：caret 在 text 内才显示
      });
    },
  });
}

/**
 * Autolink（<url>）：idle 隐藏尖括号，URL 常显（它是文本内容）。
 */
export function registerAutolinkNode(): void {
  registerNode({
    contentNodeNames: ['Autolink'],
    markerNodeNames: ['LinkMark', 'URL'],
    extractMarkers: (node) => {
      if (node.name === 'URL') {
        return [{ from: node.from, to: node.to, kind: 'url' }];
      }
      return [{ from: node.from, to: node.to, kind: 'bracket' }];
    },
    classify: (node, _markers, ctx) => {
      if (ctx.forceSource) {
        return 'source';
      }
      return intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to) ? 'mixed' : 'rendered';
    },
    hiddenMarkers: (node, markers, ctx, state) => {
      if (state === 'source') {
        return [];
      }
      // caret 在节点内（mixed）→ 全部显示（尖括号可见）；idle → 只隐藏尖括号
      const inNode = intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to);
      if (inNode) {
        return [];
      }
      return markers.filter((m) => m.kind === 'bracket');
    },
  });
}

/**
 * List Item（无序/有序/嵌套/任务）：spec §14/§15。
 * marker = ListMark（`- ` / `* ` / `1. `）；idle 弱化（dim），caret 行完整显示。
 * Task 的 checkbox（[ ]/[x]）由 CoreEditor widget 处理（taskMarkerStyle），不重复。
 */
export function registerListNode(): void {
  registerNode({
    contentNodeNames: ['ListItem'],
    markerNodeNames: ['ListMark'],
    hiddenMarkers: (_node, markers, _ctx, state) => {
      if (state === 'source') {
        return [];
      }
      // rendered（idle）：弱化 marker（保留布局，无 jump）
      return markers.map((m) => ({ ...m, cls: MARKER_DIM_CLASS }));
    },
  });
}

/**
 * Blockquote：spec §14。marker = QuoteMark（`>`）。
 * - idle：全部隐藏
 * - caret 行：该行 `>` 显示（行级 mixed），其他行隐藏
 */
export function registerBlockquoteNode(): void {
  registerNode({
    contentNodeNames: ['Blockquote'],
    markerNodeNames: ['QuoteMark'],
    classify: (node, _markers, ctx) => {
      if (ctx.forceSource) {
        return 'source';
      }
      return intersects(ctx.caret.anchor, ctx.caret.head, node.from, node.to) ? 'mixed' : 'rendered';
    },
    hiddenMarkers: (node, markers, ctx, state) => {
      if (state === 'source') {
        return [];
      }
      const caret = ctx.caret;
      // caret 所在行 = caret 位于该 marker 到下一个 marker 之间
      const caretLineMarkers = markers.filter((m, i) => {
        const nextFrom = markers[i + 1]?.from ?? node.to;
        return caret.head >= m.from && caret.head < nextFrom;
      });
      if (caretLineMarkers.length === 0) {
        return markers; // idle：全隐藏
      }
      // 隐藏除 caret 行外的所有 marker
      return markers.filter((m) => !caretLineMarkers.includes(m));
    },
  });
}

/**
 * Code Fence（spec §16）：source-oriented 节点。
 * - code 内容始终 source（引擎永不隐藏）；
 * - fenced delimiters（```）保持可见；
 * - 无 marker —— 显式注册保护，防止未来误隐藏 code 内容。
 */
export function registerCodeFenceNode(): void {
  registerNode({
    contentNodeNames: ['FencedCode', 'CodeBlock'],
    markerNodeNames: [],
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
  registerSetextNode();
  registerInlineNodes();
  registerLinkNode();
  registerAutolinkNode();
  registerListNode();
  registerBlockquoteNode();
  registerCodeFenceNode();
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
