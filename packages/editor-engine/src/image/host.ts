/**
 * ImageHost —— 图片工作流注入接口（spec §2/§3/§4）。
 *
 * editor-engine 零平台 API：所有文件系统/对话框/webview 能力经此接口注入。
 * - desktop：bridge-backed 实现（__MELLOW_BRIDGE__ 契约，经桥调 Rust）
 * - 测试：createMockImageHost
 * - 无宿主：createNullImageHost
 */

import type { Result } from '../../../host-api/src/types';

/** 文件来源（spec §2 输入渠道） */
export type ImageSourceKind = 'file' | 'bitmap' | 'url';

/** 插入策略（spec §3） */
export type ImageInsertStrategy =
  /** 保留原文件，文档内用相对路径（本地文档拖拽/选择默认） */
  | 'keep-original'
  /** 复制到 asset 目录，文档内用相对路径（粘贴 bitmap/copied file 默认） */
  | 'copy-to-assets';

/** 单张图片插入计划（fs 操作与 markdown 分离，方便 undo 与失败处理） */
export interface ImageFsOp {
  kind: 'copy' | 'write' | 'mkdir';
  from?: string;
  to: string;
  data?: ArrayBuffer;
}

export interface ImagePlan {
  /** 插入到文档的 markdown 片段（可能多张） */
  markdown: string;
  /** 需要先执行的 fs 操作（按顺序；mkdir → copy/write） */
  fsOps: ImageFsOp[];
}

/** 待插入图片（统一抽象 file / bitmap / url） */
export interface ImageCandidate {
  kind: ImageSourceKind;
  /** 原文件绝对路径（file）或来源路径（url 无） */
  path?: string;
  /** 文件名（file/bitmap；bitmap 缺省 → 自动命名） */
  name?: string;
  /** bitmap 数据（kind === 'bitmap'） */
  data?: ArrayBuffer;
  /** url 原文（kind === 'url'） */
  url?: string;
  /** 可选 alt 文本 */
  alt?: string;
}

/** ImageHost 能力 */
export interface ImageHost {
  /** 当前文档绝对路径（未保存 → null） */
  getDocumentPath(): string | null;
  /** 文件选择器（图片 filters）；取消 → [] */
  pickImageFiles(): Promise<string[]>;
  /** 剪贴板中的图片文件（copied file；宿主读剪贴板 file URL，web 层拿不到路径） */
  readClipboardFiles(): Promise<Array<{ name: string; path: string }>>;
  /** 最近一次 drag/drop 的文件路径（桌面宿主经 drag-drop 事件注入；读后消费） */
  consumeDroppedFilePaths(): string[];
  /** 复制文件 */
  copyFile(from: string, to: string): Promise<Result<void>>;
  /** 递归建目录 */
  mkdir(path: string): Promise<Result<void>>;
  /** 写二进制文件 */
  writeBinary(path: string, data: ArrayBuffer): Promise<Result<void>>;
  /** 把 image src 解析为 webview 可加载 URL；null → broken */
  resolveWebUrl(src: string): Promise<string | null>;
  /** 把 image src 解析为绝对路径（broken 检测/reveal 用）；null → 无法解析 */
  resolveAbsolutePath(src: string): string | null;
  /** 文件是否存在（broken 检测） */
  exists(path: string): Promise<boolean>;
  /** 在文件管理器中定位（broken placeholder reveal） */
  revealFile(path: string): Promise<void>;
}

/** 无宿主实现（全部失败，UI 显示 broken/提示） */
export function createNullImageHost(): ImageHost {
  const fail = (message: string): Promise<Result<void>> =>
    Promise.resolve({ ok: false, error: { code: 'not-implemented', message } });
  return {
    getDocumentPath: () => null,
    pickImageFiles: async () => [],
    readClipboardFiles: async () => [],
    consumeDroppedFilePaths: () => [],
    copyFile: (from, to) => fail(`copyFile(${from} → ${to}) 未实现`),
    mkdir: (path) => fail(`mkdir(${path}) 未实现`),
    writeBinary: (path) => fail(`writeBinary(${path}) 未实现`),
    resolveWebUrl: async () => null,
    resolveAbsolutePath: () => null,
    exists: async () => false,
    revealFile: async () => {},
  };
}

/**
 * 桥接实现（__MELLOW_BRIDGE__ 契约，平台无关）：
 * - fs 操作 → bridge invoke('fs', method, params)（Rust bridge.rs 分发）
 * - 文档路径 → window.__MELLOW_DOC_PATH__（宿主经 editor-core.setDocumentPath 写入）
 * - 拖拽路径 → window.__MELLOW_DROP_PATHS__（桌面 Adapter 经 drag-drop 事件注入）
 * - webview 资源 URL → window.__MELLOW_ASSET_RESOLVER__（桌面 Adapter 注入）
 */
export function createBridgeImageHost(): ImageHost {
  interface Bridge {
    invoke(message: unknown): Promise<unknown>;
  }
  const bridge = (window as unknown as { __MELLOW_BRIDGE__?: Bridge }).__MELLOW_BRIDGE__;
  if (bridge === undefined) {
    return createNullImageHost();
  }

  const invokeFs = async (method: string, params: Record<string, unknown>): Promise<Result<void>> => {
    try {
      const r = await bridge.invoke({
        module_name: 'fs',
        method_name: method,
        parameters: JSON.stringify(params),
      });
      const parsed = typeof r === 'string' ? JSON.parse(r) : r;
      if (parsed && parsed.ok === true) {
        return { ok: true } as Result<void>;
      }
      return { ok: false, error: { code: 'io', message: parsed?.error ?? 'fs 操作失败' } };
    } catch (e) {
      return { ok: false, error: { code: 'io', message: String(e) } };
    }
  };

  return {
    getDocumentPath: () => (window as unknown as { __MELLOW_DOC_PATH__?: string | null }).__MELLOW_DOC_PATH__ ?? null,
    pickImageFiles: async () => [], // 桌面 picker 走桥（dialog）；V0.0 由宿主菜单/命令触发
    readClipboardFiles: async () => [], // 剪贴板文件路径：真机能力（macOS/Windows），V0.0 无宿主实现
    consumeDroppedFilePaths: () => {
      const win = window as unknown as { __MELLOW_DROP_PATHS__?: string[] };
      const paths = win.__MELLOW_DROP_PATHS__ ?? [];
      win.__MELLOW_DROP_PATHS__ = [];
      return paths;
    },
    copyFile: (from, to) => invokeFs('copyFile', { from, to }),
    mkdir: (path) => invokeFs('mkdir', { path }),
    writeBinary: (path, data) => invokeFs('writeBinary', { path, data: Array.from(new Uint8Array(data)) }),
    resolveWebUrl: async (src) => {
      const resolver = (window as unknown as { __MELLOW_ASSET_RESOLVER__?: (s: string) => string }).__MELLOW_ASSET_RESOLVER__;
      return typeof resolver === 'function' ? resolver(src) : src;
    },
    resolveAbsolutePath: (src) => {
      // url → null（无法 reveal）；相对 → 相对文档目录；绝对 → 原样
      const kind = pathKindOf(src);
      if (kind === 'url') {
        return null;
      }
      if (kind === 'relative') {
        const doc = (window as unknown as { __MELLOW_DOC_PATH__?: string | null }).__MELLOW_DOC_PATH__;
        if (doc === null || doc === undefined) {
          return null;
        }
        return joinForHost(doc, src);
      }
      return src;
    },
    exists: async (path) => {
      try {
        const r = await bridge.invoke({
          module_name: 'fs',
          method_name: 'exists',
          parameters: JSON.stringify({ path }),
        });
        const parsed = typeof r === 'string' ? JSON.parse(r) : r;
        return parsed?.ok === true || parsed?.exists === true;
      } catch {
        return false;
      }
    },
    revealFile: async (path) => {
      try {
        await bridge.invoke({
          module_name: 'fs',
          method_name: 'reveal',
          parameters: JSON.stringify({ path }),
        });
      } catch {
        // no-op
      }
    },
  };
}

/** src 种类（bridge host 内部用，避免依赖 path 模块循环） */
function pathKindOf(p: string): 'url' | 'absolute' | 'relative' {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p) || /^data:/i.test(p) || /^mailto:/i.test(p)) {
    return 'url';
  }
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\') || p.startsWith('//') || p.startsWith('/')) {
    return 'absolute';
  }
  return 'relative';
}

function joinForHost(base: string, src: string): string {
  const n = base.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${n}/${src.replace(/^\/+/g, '')}`;
}
