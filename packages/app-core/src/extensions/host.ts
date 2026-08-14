/**
 * extensions/host.ts —— 扩展宿主能力接口（app-core 不实现，由 desktop Adapter 注入）。
 * 遵循 host-api 依赖注入模式：app-core 只依赖契约，平台实现在 apps/desktop。
 */
import type {
  FileService,
  ClipboardService,
  KeychainService,
  ProcessService,
  NotificationService,
} from '../../../host-api/src';

/** 当前文档访问（App.tsx 注入：EditorHost 能力） */
export interface ExtensionDocumentHost {
  getText(): string;
  getSelection(): { from: number; to: number } | null;
  getCursor(): number | null;
  insertText(text: string, from?: number, to?: number): void;
  replaceSelection(text: string): void;
}

/** 扩展宿主：扩展运行时需要的全部系统能力（desktop Adapter 实现） */
export interface ExtensionHost {
  document: ExtensionDocumentHost;
  fs: FileService;
  clipboard: ClipboardService;
  keychain: KeychainService;
  process: ProcessService;
  notification: NotificationService;
  /** network 代理（受限：超时、无凭据注入）；宿主不支持时省略 */
  fetch?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json<T>(): Promise<T>;
  }>;
  /** AI 是否启用（默认 Off，PRD §122） */
  aiEnabled: boolean;
}

/** 空实现（未注入时使用：所有能力拒绝/空） */
export function createNullExtensionHost(): ExtensionHost {
  const deny = (): never => { throw new Error('extension host 未注入'); };
  return {
    document: { getText: deny, getSelection: deny, getCursor: deny, insertText: deny, replaceSelection: deny },
    fs: undefined as unknown as FileService,
    clipboard: undefined as unknown as ClipboardService,
    keychain: undefined as unknown as KeychainService,
    process: undefined as unknown as ProcessService,
    notification: undefined as unknown as NotificationService,
    aiEnabled: false,
  };
}
