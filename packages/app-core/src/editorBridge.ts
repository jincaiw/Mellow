/**
 * EditorBridge —— app-core 与编辑器之间的最小契约。
 *
 * app-core 不感知 EditorCore/iframe/CM 细节：编排层只通过本接口
 * 读文档、patch 引用（单事务）、刷新图片、更新文档路径。
 * 测试注入 fake 实现即可。
 */

/** 文本替换（与 editor-core contract.TextChange 同构；app-core 不依赖 editor-core） */
export interface TextChange {
  from: number;
  to: number;
  text: string;
}

export interface EditorBridge {
  /** 当前文档全文 */
  getText(): string;
  /** 当前文档绝对路径；未保存 → null */
  getDocumentPath(): string | null;
  /** 更新文档路径（rename/save-as 后；图片相对路径解析基准） */
  setDocumentPath(path: string | null): void;
  /** 单事务应用引用替换（一次 Undo 撤销全部；false = 未就绪） */
  patchChanges(changes: TextChange[]): boolean;
  /** 强制图片重新解析（文档路径变化后） */
  refreshImages(): void;
}

/** 从 EditorCore 适配（desktop Adapter 层调用；文档路径由宿主状态提供） */
export function createEditorBridgeFromCore(
  core: {
    getText(): string;
    setDocumentPath(path: string | null): void;
    patchChanges(changes: TextChange[]): boolean;
    refreshImages(): void;
  },
  getDocumentPath: () => string | null,
): EditorBridge {
  return {
    getText: () => core.getText(),
    getDocumentPath,
    setDocumentPath: (p) => core.setDocumentPath(p),
    patchChanges: (c) => core.patchChanges(c),
    refreshImages: () => core.refreshImages(),
  };
}
