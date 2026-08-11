/**
 * host-api —— 通用类型（错误模型 / 结果 / 共享结构）。
 */

/** 统一错误码 */
export type HostErrorCode =
  | 'not-implemented'    // 该宿主未实现此能力
  | 'not-found'          // 文件/资源不存在
  | 'permission-denied'  // 权限不足
  | 'io'                 // 读写失败
  | 'invalid-argument'   // 参数非法
  | 'canceled'           // 用户取消（对话框）
  | 'conflict'           // 磁盘文件被外部修改，拒绝覆盖（spec §5）
  | 'unsupported'        // 平台不支持
  | 'unknown';

/** 统一错误模型：所有 Host API 失败都返回此结构 */
export interface HostError {
  code: HostErrorCode;
  message: string;
  /** 关联路径（io/not-found 场景） */
  path?: string;
  /** 底层原因（仅 debug，不用于 UI 展示） */
  cause?: unknown;
}

/** 统一结果类型：所有 Host API 方法返回 Result<T> */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: HostError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: HostError | string): Result<T> {
  return {
    ok: false,
    error: typeof error === 'string' ? { code: 'unknown', message: error } : error,
  };
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}

/** 尺寸 */
export interface Size {
  width: number;
  height: number;
}

/** 搜索结果条目 */
export interface SearchResult {
  path: string;
  line: number;
  column?: number;
  snippet?: string;
}

/** 文件选择过滤器 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** 文本编码（BOM 由加载管线检测并剥离，模型仅记录） */
export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'latin1';

/** 行尾 */
export type LineEnding = '\n' | '\r\n' | '\r';

/** 恢复快照（AppData，keyed by document id，spec §6；与 Auto Save 分离） */
export interface RecoveryCursor {
  anchor: number;
  head: number;
}

export interface RecoveryScroll {
  top: number;
  left: number;
}

export interface RecoveryPayload {
  documentId: string;
  path: string | null;
  content: string;
  revision: number;
  encoding: Encoding;
  eol: LineEnding;
  cursor: RecoveryCursor | null;
  scroll: RecoveryScroll | null;
  savedAt: number;
}

/** 启动发现条目 */
export interface RecoveryEntry {
  documentId: string;
  path: string | null;
  revision: number;
  savedAt: number;
}

/** 系统通知请求 */
export interface NotificationRequest {
  title: string;
  body: string;
  icon?: string;
  actions?: Array<{ id: string; title: string }>;
}
