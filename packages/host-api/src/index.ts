/**
 * host-api —— 系统能力契约（PRD §116 DesktopHost）。
 *
 * 硬规则（AGENTS.md 统一规则 11 + PRD §113.4）：
 * - editor-core / app-core / editor-react 不允许直接调用 Windows/macOS/Linux API；
 * - 所有系统能力（文件/对话框/剪贴板/窗口/监听/搜索/导出/凭据/进程）经本契约注入；
 * - 本包为纯类型/接口包，零运行时实现，零依赖。
 *
 * Electron fallback 不需要重写 Editor（统一规则 9）：换实现，不换契约。
 */

// ─────────────────────────── 结果类型 ───────────────────────────

export interface OpenDocumentResult {
  path: string | null;
  content: string | null;
  error: string | null;
}

export interface SaveDocumentResult {
  path: string | null;
  error: string | null;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

// ─────────────────────────── 服务契约 ───────────────────────────

/** 文件服务：打开/保存（写采用 atomic，ADR-0009） */
export interface FileService {
  open(options?: { filters?: FileFilter[] }): Promise<OpenDocumentResult>;
  save(path: string | null, content: string, options?: { filters?: FileFilter[] }): Promise<SaveDocumentResult>;
}

/** 对话框服务：错误提示 / 确认 */
export interface DialogService {
  showError(title: string, message: string): Promise<void>;
  showConfirm(title: string, message: string): Promise<boolean>;
}

/** 剪贴板服务：多格式 copy / smart paste（ADR-0011） */
export interface ClipboardService {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readHTML(): Promise<string | null>;
  writeHTML(html: string): Promise<void>;
  readImage(): Promise<ArrayBuffer | null>;
}

/** 窗口服务：窗口状态与行为 */
export interface WindowService {
  setTitle(title: string): Promise<void>;
  setSize(width: number, height: number): Promise<void>;
  getFocused(): Promise<boolean>;
}

/** 文件监听服务：外部变更（ADR-0009） */
export interface WatchService {
  watch(path: string, onChange: () => void): Promise<() => void>;
}

/** 全局搜索服务 */
export interface SearchService {
  search(query: string, directory: string): Promise<Array<{ path: string; line: number }>>;
}

/** 导出服务：PDF / HTML / Print（ADR-0014） */
export interface ExportService {
  exportPDF(path: string, html: string): Promise<void>;
  exportHTML(path: string, html: string): Promise<void>;
}

/** 凭据服务（macOS Keychain / Windows Credential Manager / Linux Secret Service） */
export interface KeychainService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** 进程服务：外部命令/侧车 */
export interface ProcessService {
  spawn(command: string, args: string[]): Promise<{ pid: number }>;
}

/** 宿主整体：DesktopHost 聚合（PRD §116） */
export interface DesktopHost {
  fs: FileService;
  dialog: DialogService;
  clipboard: ClipboardService;
  window: WindowService;
  watcher: WatchService;
  search: SearchService;
  export: ExportService;
  keychain: KeychainService;
  process: ProcessService;
}

/** 空实现（占位/测试用）：所有方法返回明确失败或空值 */
export function createNullHost(): DesktopHost {
  const notImplemented = (name: string) => async () => {
    throw new Error(`[host-api] ${name} is not implemented`);
  };
  return {
    fs: {
      open: async () => ({ path: null, content: null, error: null }),
      save: async () => ({ path: null, error: null }),
    },
    dialog: { showError: notImplemented('dialog.showError'), showConfirm: notImplemented('dialog.showConfirm') },
    clipboard: {
      readText: async () => '',
      writeText: notImplemented('clipboard.writeText'),
      readHTML: async () => null,
      writeHTML: notImplemented('clipboard.writeHTML'),
      readImage: async () => null,
    },
    window: { setTitle: notImplemented('window.setTitle'), setSize: notImplemented('window.setSize'), getFocused: async () => false },
    watcher: { watch: async () => notImplemented('watcher.watch') },
    search: { search: async () => [] },
    export: { exportPDF: notImplemented('export.exportPDF'), exportHTML: notImplemented('export.exportHTML') },
    keychain: { get: async () => null, set: notImplemented('keychain.set') },
    process: { spawn: notImplemented('process.spawn') },
  };
}
