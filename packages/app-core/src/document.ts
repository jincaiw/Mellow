/**
 * app-core —— 应用核心逻辑（与 UI/平台无关）。
 *
 * 硬规则（AGENTS.md 统一规则 4/5）：
 * - 不直接调用 Windows/macOS/Linux API；
 * - 所有系统能力经 host-api 契约注入。
 *
 * UI 调用约定（要求 6）：UI 通过本层调用，不直接触碰 host-api 实现细节。
 */

import type {
  FileService,
  Result,
  OpenFileResult,
  WriteFileResult,
  SaveOptions,
  DesktopHost,
} from '../../host-api/src/index';

/** 文档服务：打开/保存编排（文件系统能力来自注入的 FileService） */
export class DocumentService {
  constructor(private readonly fs: FileService) {}

  /** 对话框打开文档（返回含 encoding/eol 元数据） */
  open(): Promise<Result<OpenFileResult>> {
    return this.fs.open();
  }

  /** 保存文档（path 为 null 时弹另存对话框；options 携带 encoding/eol preserve） */
  save(path: string | null, content: string, options?: SaveOptions): Promise<Result<WriteFileResult>> {
    return this.fs.save(path, content, options);
  }

  /** 直接按路径读取（外部变化 auto reload / 比较用，无对话框） */
  readPath(path: string): Promise<Result<OpenFileResult>> {
    return this.fs.openPath(path);
  }
}

/** 宿主服务门面：把 DesktopHost 注入到 app-core 各服务（V0.x 只暴露文档） */
export function createAppServices(host: DesktopHost): { documents: DocumentService } {
  return {
    documents: new DocumentService(host.fs),
  };
}
