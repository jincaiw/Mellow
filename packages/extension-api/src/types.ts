/**
 * extension-api —— 扩展 API 契约（PRD §119-121 / ADR-0013）。
 *
 * V1 范围：
 * - 无 Marketplace；扩展经程序化/本地注册（register + setup）；
 * - 默认最小权限（PRD §120：扩展必须显式声明权限，未声明即拒绝）；
 * - `process` / `keychain` 为高危权限：契约就绪，V1 运行时一律拒绝；
 * - AI 贡献点默认 Off（PRD §122：AI 为可选扩展，用户显式开启才存在）；
 * - 核心 Typora parity 功能全部内建，不依赖第三方扩展。
 *
 * 本包为零依赖纯契约（类型 + 纯函数），运行时在 app-core/src/extensions。
 */

// ─────────────────────────── 类型 ───────────────────────────

/** 扩展类型（PRD §119 八类） */
export type ExtensionType =
  | 'editor'
  | 'theme'
  | 'command'
  | 'imageUploader'
  | 'exporter'
  | 'sidebar'
  | 'renderer'
  | 'ai';

/** 权限（PRD §120，默认最小权限模型） */
export type ExtensionPermission =
  | 'document.read'
  | 'document.write'
  | 'workspace.read'
  | 'workspace.write'
  | 'network'
  | 'clipboard'
  | 'process'
  | 'keychain'
  | 'notification';

export const EXTENSION_TYPES: readonly ExtensionType[] = [
  'editor', 'theme', 'command', 'imageUploader', 'exporter', 'sidebar', 'renderer', 'ai',
];

export const EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  'document.read', 'document.write', 'workspace.read', 'workspace.write',
  'network', 'clipboard', 'process', 'keychain', 'notification',
];

/**
 * 高危权限：V1 运行时拒绝实现。
 * 需显式用户授权（V1 无授权流程）后才可能开放；安全审查约定 process 权限默认拒绝。
 */
export const RESTRICTED_PERMISSIONS: readonly ExtensionPermission[] = ['process', 'keychain'];

/** 扩展清单（注册时的声明） */
export interface ExtensionManifest {
  /** 唯一 id（建议反向域名：com.example.my-extension） */
  id: string;
  version: string;
  /** 显示名 */
  name: string;
  description?: string;
  author?: string;
  /** 主类型（一个扩展可有多个贡献点，主类型用于分类展示） */
  type: ExtensionType;
  /** 所需权限（最小权限：只声明真正需要的） */
  permissions: ExtensionPermission[];
  /** 入口模块（V1 本地加载可选；未提供则纯 setup 注册） */
  main?: string;
}

/** 扩展记录（registry 状态 + 对外只读视图） */
export interface ExtensionRecord extends ExtensionManifest {
  enabled: boolean;
  setupError?: string;
  registeredAt: number;
}

/** 启用/禁用操作结果 */
export interface ExtensionStatus {
  id: string;
  enabled: boolean;
  setupError?: string;
}

// ─────────────────────────── 贡献点（8 类） ───────────────────────────

export interface LocalizedTitle {
  zh?: string;
  en?: string;
}

/** Command 贡献：注册一条命令（接入宿主 CommandRegistry） */
export interface CommandContribution {
  id: string;
  title: LocalizedTitle;
  run(ctx: ExtensionContext): void | Promise<void>;
}

/** Theme 贡献（themes 包 MellowTheme 的结构化子集，避免契约依赖内部包） */
export interface ThemeContribution {
  id: string;
  name: string;
  kind: 'light' | 'dark';
  variables: Record<string, string>;
  themeCss?: string;
  editorTheme?: string;
}

/** Image Uploader 贡献：上传图片 → 返回可插入 Markdown 的 URL/路径 */
export interface ImageUploaderContribution {
  id: string;
  name: string;
  upload(file: { name: string; mime: string; data: ArrayBuffer }): Promise<string>;
}

/** Exporter 贡献：导出格式注册 */
export interface ExporterContribution {
  id: string;
  name: string;
  /** 目标格式标识（如 'html-extra'） */
  format: string;
  /** 导出文件扩展名（如 'html'） */
  extension: string;
  export(doc: string, opts: { title?: string }): Promise<string>;
}

/** Sidebar 贡献：侧边栏面板（V1 契约就绪，宿主暂不消费） */
export interface SidebarContribution {
  id: string;
  name: string;
  /** 宿主注入容器元素；返回可选的 teardown */
  render(container: HTMLElement, ctx: ExtensionContext): void | (() => void);
}

/** Renderer 贡献：自定义块渲染（返回 HTML 或 null 表示不处理） */
export interface RendererContribution {
  id: string;
  name: string;
  renderBlock(source: string, ctx: ExtensionContext): string | null;
}

/** AI 贡献：提供者（默认 Off：仅扩展启用且用户显式开启 AI 时存在） */
export interface AiContribution {
  id: string;
  name: string;
  /** 用户显式触发的生成/补全 */
  complete(prompt: string, doc: string, opts: { cursor?: number }): Promise<string>;
}

/** 扩展贡献点集合（全部可选；运行时按 manifest.type 与 enabled 状态分发） */
export interface ExtensionContributions {
  /** CM6 Extension（零依赖契约不引入 CM 类型；宿主运行时校验） */
  editor?: unknown;
  theme?: ThemeContribution;
  commands?: CommandContribution[];
  imageUploader?: ImageUploaderContribution;
  exporter?: ExporterContribution;
  sidebar?: SidebarContribution;
  renderer?: RendererContribution;
  ai?: AiContribution;
}

// ─────────────────────────── 门面 API（按权限裁剪） ───────────────────────────

/** 当前文档访问（document.read / document.write） */
export interface ExtensionDocumentApi {
  /** 当前文档全文（document.read） */
  getText(): string;
  /** 主选区 [from,to]（document.read） */
  getSelection(): { from: number; to: number } | null;
  /** 光标位置（document.read） */
  getCursor(): number | null;
  /** 插入文本（document.write；from/to 缺省 = 光标处） */
  insertText(text: string, from?: number, to?: number): void;
  /** 用文本替换主选区（document.write） */
  replaceSelection(text: string): void;
}

/** 工作区访问（workspace.read / workspace.write） */
export interface ExtensionWorkspaceApi {
  /** 列出目录条目（workspace.read） */
  listFiles(dir: string): Promise<Array<{ path: string; name: string; isDirectory: boolean }>>;
  /** 读取文本文件（workspace.read） */
  readFile(path: string): Promise<string | null>;
  /** 写入文本文件（workspace.write） */
  writeFile(path: string, content: string): Promise<void>;
  /** 创建目录（workspace.write） */
  mkdir(path: string): Promise<void>;
  /** 删除文件/目录（workspace.write） */
  delete(path: string): Promise<void>;
}

/** 网络访问（network；宿主代理，V1 限制：超时、无凭据注入） */
export interface ExtensionNetworkApi {
  fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json<T>(): Promise<T>;
  }>;
}

/** 剪贴板（clipboard） */
export interface ExtensionClipboardApi {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

/** 进程执行（process；V1 一律拒绝——高危权限） */
export interface ExtensionProcessApi {
  exec(command: string, args?: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
}

/** 凭据存储（keychain；V1 一律拒绝——desktop 无实现） */
export interface ExtensionKeychainApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** 桌面通知（notification） */
export interface ExtensionNotificationApi {
  show(opts: { title: string; body?: string }): Promise<void>;
}

/** AI 能力（默认 Off：宿主未启用 AI 时 context.ai === null） */
export interface ExtensionAiApi {
  complete(prompt: string, doc: string): Promise<string>;
}

/** 扩展上下文：每个启用扩展的 setup 收到此对象（按权限裁剪的门面） */
export interface ExtensionContext {
  manifest: ExtensionManifest;
  document: ExtensionDocumentApi;
  workspace: ExtensionWorkspaceApi;
  network: ExtensionNetworkApi;
  clipboard: ExtensionClipboardApi;
  process: ExtensionProcessApi;
  keychain: ExtensionKeychainApi;
  notification: ExtensionNotificationApi;
  /** AI 默认 Off：宿主未启用 AI 时为 null */
  ai: ExtensionAiApi | null;
  contributions: ExtensionContributions;
}

// ─────────────────────────── 注册接口 ───────────────────────────

/** 扩展运行时（app-core/src/extensions 实现） */
export interface ExtensionAPI {
  /** 注册扩展（校验 manifest；setup 延迟到 enable 时调用） */
  register(manifest: ExtensionManifest, setup: (ctx: ExtensionContext) => void | Promise<void>): Promise<string>;
  /** 列出全部已注册扩展（含状态） */
  list(): ExtensionRecord[];
  get(id: string): ExtensionRecord | undefined;
  /** 启用（执行 setup；权限门卫在 setup 的 context 内生效） */
  enable(id: string): Promise<ExtensionStatus>;
  disable(id: string): Promise<ExtensionStatus>;
  /** 卸载（从 registry 移除） */
  unload(id: string): Promise<void>;
  isEnabled(id: string): boolean;
  /** Safe Mode（PRD §121）：开启后不加载任何扩展 */
  isSafeMode(): boolean;
  setSafeMode(on: boolean): void;
}

/** 扩展错误（运行时门卫统一错误模型） */
export class ExtensionError extends Error {
  constructor(
    message: string,
    readonly code: 'permission-denied' | 'not-implemented' | 'invalid-manifest' | 'not-found' | 'setup-failed',
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export function permissionDenied(permission: ExtensionPermission): ExtensionError {
  return new ExtensionError(`扩展缺少权限: ${permission}`, 'permission-denied');
}

export function notImplemented(permission: ExtensionPermission): ExtensionError {
  return new ExtensionError(`权限 ${permission} 在 V1 未开放（高危权限）`, 'not-implemented');
}
