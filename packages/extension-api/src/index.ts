/**
 * extension-api —— 扩展 API 契约（PRD §119-120）。
 * 契约骨架；实现基于 CoreEditor 的 MarkEdit 扩展机制（addExtension 等）。
 */

export interface ExtensionManifest {
  id: string;
  version: string;
  name: string;
  /** 所需权限（PRD §120 最小权限模型） */
  permissions: ExtensionPermission[];
  main?: string;
}

export type ExtensionPermission =
  | 'editor.read'
  | 'editor.write'
  | 'file.read'
  | 'file.write'
  | 'clipboard.read'
  | 'network';

export interface ExtensionContext {
  manifest: ExtensionManifest;
  /** 编辑器访问（受限，经 host 校验权限） */
  editor: {
    getText(): string;
    insertText(text: string, from: number, to: number): void;
  };
}

export interface ExtensionAPI {
  register(manifest: ExtensionManifest, setup: (ctx: ExtensionContext) => void | Promise<void>): Promise<void>;
  list(): ExtensionManifest[];
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
}
