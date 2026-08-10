/**
 * app-core —— 应用核心逻辑（与 UI/平台无关）。
 *
 * 硬规则（AGENTS.md 统一规则 4/5）：
 * - 不直接调用 Windows/macOS/Linux API；
 * - 所有系统能力经 host-api 契约注入。
 *
 * 使用方式（desktop 装配）：
 *   const host: DesktopHost = tauriHost();       // apps/desktop 侧实现
 *   const documents = new DocumentService(host.fs);
 */

import type { FileService, OpenDocumentResult, SaveDocumentResult } from '../../host-api/src/index';

/** 文档服务：打开/保存编排（文件系统能力来自注入的 FileService） */
export class DocumentService {
  constructor(private readonly fs: FileService) {}

  async open(): Promise<OpenDocumentResult> {
    return this.fs.open();
  }

  async save(path: string | null, content: string): Promise<SaveDocumentResult> {
    return this.fs.save(path, content);
  }

  /** 打开 + 立即交给编辑器（编排点，后续可加 encoding/EOL 处理） */
  async openIntoModel(): Promise<{ path: string | null; content: string | null; error: string | null }> {
    const result = await this.fs.open();
    if (result.error !== null || result.content === null) {
      return result;
    }
    return result;
  }
}
