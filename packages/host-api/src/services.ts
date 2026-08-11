/**
 * host-api —— 11 个系统能力服务契约。
 *
 * 硬规则（AGENTS.md 统一规则 4/5 + PRD §113.4）：
 * - editor-core / app-core / UI 不允许直接调用 Windows/macOS/Linux API；
 * - 所有系统能力经本契约注入（Electron fallback 换实现不换契约）；
 * - 每个方法：明确输入参数对象、明确返回 Result<T>（error model 见 types.ts）。
 */

import type {
  Result,
  Size,
  SearchResult,
  FileFilter,
  NotificationRequest,
  Encoding,
  LineEnding,
} from './types';

// ─────────────────────────── fs ───────────────────────────

export interface OpenFileOptions {
  filters?: FileFilter[];
  defaultPath?: string;
}

export interface OpenFileResult {
  path: string;
  content: string;
  /** 检测到的编码（preserve encoding） */
  encoding: Encoding;
  /** 检测到的行尾（preserve EOL） */
  eol: LineEnding;
}

export interface WriteFileResult {
  path: string;
  bytesWritten: number;
}

export interface DirEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

/** 保存选项（preserve metadata：未指定时默认 utf-8 / 不转换 EOL） */
export interface SaveOptions {
  encoding?: Encoding;
  eol?: LineEnding;
  filters?: FileFilter[];
}

/**
 * 文件服务：打开/保存/读写/目录（写采用 atomic，ADR-0009 语义由实现保证）。
 * 取消对话框返回 { ok:false, error:{ code:'canceled' } }。
 */
export interface FileService {
  /** 对话框打开文件 */
  open(options?: OpenFileOptions): Promise<Result<OpenFileResult>>;
  /** 直接按路径打开（无需对话框） */
  openPath(path: string): Promise<Result<OpenFileResult>>;
  /** 保存：path 为 null 时弹另存对话框；options 携带 encoding/eol（preserve metadata） */
  save(path: string | null, content: string, options?: SaveOptions): Promise<Result<WriteFileResult>>;
  /** 读文本 */
  readText(path: string): Promise<Result<string>>;
  /** 写文本（atomic：临时文件 + rename） */
  writeText(path: string, content: string): Promise<Result<WriteFileResult>>;
  /** 列目录 */
  readDir(path: string): Promise<Result<DirEntry[]>>;
  exists(path: string): Promise<Result<boolean>>;
  rename(from: string, to: string): Promise<Result<void>>;
  delete(path: string): Promise<Result<void>>;
}

// ─────────────────────────── dialog ───────────────────────────

export interface MessageDialogOptions {
  title: string;
  message: string;
  detail?: string;
  kind?: 'info' | 'warning' | 'error';
  /** 按钮列表；返回被点击的按钮文本 */
  buttons?: string[];
}

/** 对话框服务 */
export interface DialogService {
  /** 打开文件选择器；取消 → canceled */
  showOpen(options?: OpenFileOptions): Promise<Result<string | null>>;
  /** 保存路径选择器；取消 → canceled */
  showSave(options?: OpenFileOptions): Promise<Result<string | null>>;
  /** 消息对话框；返回被点击的按钮文本 */
  showMessage(options: MessageDialogOptions): Promise<Result<string>>;
  /** 确认对话框 */
  showConfirm(title: string, message: string): Promise<Result<boolean>>;
}

// ─────────────────────────── clipboard ───────────────────────────

/** 剪贴板服务（ADR-0011 多格式 copy / smart paste 的基础） */
export interface ClipboardService {
  readText(): Promise<Result<string>>;
  writeText(text: string): Promise<Result<void>>;
  readHTML(): Promise<Result<string | null>>;
  writeHTML(html: string): Promise<Result<void>>;
  readImage(): Promise<Result<ArrayBuffer | null>>;
  writeImage(data: ArrayBuffer): Promise<Result<void>>;
}

// ─────────────────────────── window ───────────────────────────

/** 窗口服务 */
export interface WindowService {
  setTitle(title: string): Promise<Result<void>>;
  setSize(size: Size): Promise<Result<void>>;
  getSize(): Promise<Result<Size>>;
  getFocused(): Promise<Result<boolean>>;
  minimize(): Promise<Result<void>>;
  maximize(): Promise<Result<void>>;
  close(): Promise<Result<void>>;
}

// ─────────────────────────── watcher ───────────────────────────

/** 文件监听服务（ADR-0009 外部变更检测） */
export interface WatchService {
  /** 监听路径变化；返回取消订阅函数 */
  watch(path: string, onChange: () => void): Promise<Result<() => void>>;
}

// ─────────────────────────── search ───────────────────────────

/** 全局搜索服务 */
export interface SearchService {
  searchFiles(query: string, directory: string): Promise<Result<SearchResult[]>>;
}

// ─────────────────────────── export ───────────────────────────

/** 导出服务（ADR-0014：内建 PDF/HTML/Print） */
export interface ExportService {
  exportPDF(targetPath: string, content: string): Promise<Result<void>>;
  exportHTML(targetPath: string, html: string): Promise<Result<void>>;
  print(html: string): Promise<Result<void>>;
}

// ─────────────────────────── keychain ───────────────────────────

/**
 * 凭据服务（macOS Keychain / Windows Credential Manager / Linux Secret Service）。
 * 不允许明文存储业务数据；仅存凭据。
 */
export interface KeychainService {
  get(key: string): Promise<Result<string | null>>;
  set(key: string, value: string): Promise<Result<void>>;
  delete(key: string): Promise<Result<void>>;
}

// ─────────────────────────── process ───────────────────────────

export interface ChildProcessInfo {
  pid: number;
}

/** 进程服务：外部命令/侧车 */
export interface ProcessService {
  spawn(command: string, args: string[], options?: { cwd?: string }): Promise<Result<ChildProcessInfo>>;
  kill(pid: number): Promise<Result<void>>;
}

// ─────────────────────────── notification（新增） ───────────────────────────

/** 系统通知服务 */
export interface NotificationService {
  show(request: NotificationRequest): Promise<Result<void>>;
}

// ─────────────────────────── opener（新增） ───────────────────────────

/** 系统打开服务（Quick Look / Explorer / XDG） */
export interface OpenerService {
  /** 用系统默认应用打开路径 */
  openPath(path: string): Promise<Result<void>>;
  /** 在文件管理器中定位 */
  revealInFolder(path: string): Promise<Result<void>>;
  /** 打开 URL（浏览器） */
  openUrl(url: string): Promise<Result<void>>;
}
