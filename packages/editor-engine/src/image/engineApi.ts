/**
 * Engine Image API —— 宿主 → 引擎通道（iframe 内注册）。
 *
 * 宿主（desktop shell / app-core）需要操作编辑器文档（引用 patch），
 * 而 EditorView 只在 iframe 内 —— 经本模块注册的 `window.__MELLOW_ENGINE_API__` 转发。
 *
 * - applyChanges：一次 dispatch 应用全部引用替换（单 CM 事务 → 一次 Undo，spec §11）
 * - refreshImages：文档路径变化后强制全部图片重新解析（resolveWebUrl 用新基准）
 *
 * 通道方向：
 *   host → EditorCore.patchChanges/refreshImages → iframe __MELLOW_ENGINE_API__ → 本模块 → EditorView
 */

import type { EditorView } from '@codemirror/view';

/** 文本替换（from/to 为文档字符偏移；text 为替换内容） */
export interface TextChange {
  from: number;
  to: number;
  text: string;
}

export interface EngineImageApi {
  /** 单事务应用文本替换；false = 编辑器未就绪 */
  applyChanges(changes: TextChange[]): boolean;
  /** 强制全部图片重新解析（文档路径/asset 目录变化后调用） */
  refreshImages(): void;
}

/** 图片 widget 可重解析接口（widget.ts 实现） */
export interface ImageWidgetHandle {
  /** 重新 resolve + render */
  retry(): void;
  /** widget 销毁时调用（取消跟踪） */
  dispose(): void;
}

const GLOBAL_KEY = '__MELLOW_ENGINE_API__' as const;

let activeView: EditorView | null = null;
const trackedWidgets = new Set<ImageWidgetHandle>();

/** 绑定当前 EditorView（ImageWidgetPlugin 构造时调用） */
export function attachEngineView(view: EditorView | null): void {
  activeView = view;
}

/** 跟踪 widget（构造时）；返回取消跟踪函数 */
export function trackImageWidget(widget: ImageWidgetHandle): () => void {
  trackedWidgets.add(widget);
  return () => {
    trackedWidgets.delete(widget);
  };
}

/** 注册全局 API（buildImageWidgetExtension 调用一次） */
export function registerEngineImageApi(): void {
  const api: EngineImageApi = {
    applyChanges(changes) {
      if (activeView === null || changes.length === 0) {
        return false;
      }
      // 单事务：全部替换一次应用（CM 内部处理选区映射；一次 Undo 撤销全部，spec §11）
      activeView.dispatch({
        changes: changes.map((c) => ({ from: c.from, to: c.to, insert: c.text })),
      });
      return true;
    },
    refreshImages() {
      for (const widget of [...trackedWidgets]) {
        widget.retry();
      }
    },
  };
  const win = window as unknown as Record<string, unknown>;
  win[GLOBAL_KEY] = api;
}

/** 读取全局 API（宿主侧）；未注册 → null */
export function getEngineImageApi(): EngineImageApi | null {
  const win = window as unknown as Record<string, unknown>;
  return (win[GLOBAL_KEY] as EngineImageApi | undefined) ?? null;
}
