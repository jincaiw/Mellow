/**
 * host-api —— Mock 实现（createMockHost）。
 *
 * 内存版宿主：浏览器 dev 模式 / 测试 / 无 Adapter 环境可用。
 * 所有 service 行为确定、可断言（contract tests 基于此）。
 */

import type { DesktopHost } from './host';
import type { Result, Size, SearchResult, NotificationRequest, FileFilter, RecoveryPayload, RecoveryEntry } from './types';
import { ok, err } from './types';
import type {
  OpenFileOptions,
  OpenFileResult,
  WriteFileResult,
  DirEntry,
  MessageDialogOptions,
  ChildProcessInfo,
} from './services';

export interface MockHostState {
  /** 内存文件系统：path → content */
  files: Map<string, string>;
  /** 二进制文件：path → data */
  binaryFiles: Map<string, ArrayBuffer>;
  /** 文件系统目录结构（供 readDir） */
  dirs: Set<string>;
  clipboardText: string;
  clipboardHTML: string | null;
  clipboardImage: ArrayBuffer | null;
  /** 窗口状态 */
  windowTitle: string;
  windowSize: Size;
  windowFocused: boolean;
  /** fs.open 对话框预设路径；null 表示用户取消 */
  nextOpenPath: string | null;
  /** fs.save 对话框预设路径（path 为 null 时使用）；null 表示用户取消 */
  nextSavePath: string | null;
  /** dialog.showConfirm 预设返回值 */
  confirmResult: boolean;
  /** search.searchFiles 预设结果 */
  searchResults: SearchResult[];
  /** 记录 */
  openedPaths: string[];
  notifications: NotificationRequest[];
  spawned: Array<{ command: string; args: string[]; options?: { cwd?: string } }>;
  killed: number[];
  exported: Array<{ kind: 'pdf' | 'html' | 'print'; path: string | null; content: string }>;
  /** 最近保存的元数据（encoding/eol preserve 记录） */
  lastSaveMeta: { encoding: string; eol: string } | null;
  /** mock 磁盘状态（open/save 返回） */
  nextMtimeMs: number;
  identityKey: string;
  /** 回收站（trash 语义：文件从 files 移入此处；可断言） */
  trashBin: Map<string, string>;
  /** 下载记录 + 下载内容（默认写入标记字节；测试可注入） */
  downloads: Array<{ url: string; targetPath: string }>;
  nextDownloadData: ArrayBuffer | null;
  /** 目录选择器预设结果；null 表示用户取消 */
  nextDirectoryPath: string | null;
  /** keychain */
  secrets: Map<string, string>;
  /** recovery 快照存储（内存，keyed by documentId） */
  recovery: Map<string, RecoveryPayload>;
  /** watcher 回调存储（测试可手动触发） */
  watchCallbacks: Map<string, (event: import('./services').FileChangeEvent) => void>;
}

export function createMockHostState(initial?: Partial<MockHostState>): MockHostState {
  return {
    files: new Map(initial?.files ?? [['/dev.md', '# Mellow dev doc']]),
    binaryFiles: new Map(initial?.binaryFiles ?? []),
    dirs: new Set(initial?.dirs ?? ['/']),
    clipboardText: initial?.clipboardText ?? '',
    clipboardHTML: initial?.clipboardHTML ?? null,
    clipboardImage: initial?.clipboardImage ?? null,
    windowTitle: initial?.windowTitle ?? 'Mellow',
    windowSize: initial?.windowSize ?? { width: 1200, height: 800 },
    windowFocused: initial?.windowFocused ?? true,
    nextOpenPath: initial?.nextOpenPath ?? null,
    // 注意：null 表示「另存为对话框取消」，必须保留（不能用 ?? 替换默认值）
    nextSavePath: initial?.nextSavePath === undefined ? '/untitled.md' : initial.nextSavePath,
    confirmResult: initial?.confirmResult ?? true,
    searchResults: initial?.searchResults ?? [],
    openedPaths: initial?.openedPaths ?? [],
    notifications: initial?.notifications ?? [],
    spawned: initial?.spawned ?? [],
    killed: initial?.killed ?? [],
    exported: initial?.exported ?? [],
    secrets: new Map(initial?.secrets ?? []),
    lastSaveMeta: initial?.lastSaveMeta ?? null,
    nextMtimeMs: initial?.nextMtimeMs ?? 1000,
    identityKey: initial?.identityKey ?? 'mock:1',
    trashBin: new Map(initial?.trashBin ?? []),
    downloads: initial?.downloads ?? [],
    nextDownloadData: initial?.nextDownloadData ?? null,
    // 注意：null 表示「目录选择取消」，必须保留（不能用 ?? 替换默认值）
    nextDirectoryPath: initial?.nextDirectoryPath === undefined ? '/dir' : initial.nextDirectoryPath,
    recovery: new Map(initial?.recovery ?? []),
    watchCallbacks: new Map(initial?.watchCallbacks ?? []),
  };
}

/** 检测行尾（mock 用，与 Rust detect_eol 语义一致） */
function detectEol(content: string): '\n' | '\r\n' | '\r' {
  const crlf = content.indexOf('\r\n');
  const lf = content.indexOf('\n');
  const cr = content.indexOf('\r');
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return '\r\n';
  if (cr !== -1 && (lf === -1 || cr < lf)) return '\r';
  return '\n';
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/** rename/move 共用核心（文件/目录前缀移动） */
async function renameCore(state: MockHostState, from: string, to: string): Promise<Result<void>> {  const nFrom = normalizePath(from);
  const nTo = normalizePath(to);
  if (state.files.has(nFrom)) {
    state.files.set(nTo, state.files.get(nFrom)!);
    state.files.delete(nFrom);
    return ok(undefined);
  }
  if (state.binaryFiles.has(nFrom)) {
    state.binaryFiles.set(nTo, state.binaryFiles.get(nFrom)!);
    state.binaryFiles.delete(nFrom);
    return ok(undefined);
  }
  let moved = 0;
  for (const key of [...state.files.keys()]) {
    if (key.startsWith(`${nFrom}/`)) {
      state.files.set(`${nTo}${key.slice(nFrom.length)}`, state.files.get(key)!);
      state.files.delete(key);
      moved += 1;
    }
  }
  for (const key of [...state.binaryFiles.keys()]) {
    if (key.startsWith(`${nFrom}/`)) {
      state.binaryFiles.set(`${nTo}${key.slice(nFrom.length)}`, state.binaryFiles.get(key)!);
      state.binaryFiles.delete(key);
      moved += 1;
    }
  }
  for (const key of [...state.dirs.keys()]) {
    if (key.startsWith(`${nFrom}/`)) {
      state.dirs.delete(key);
      moved += 1;
    }
  }
  if (moved === 0) {
    return err({ code: 'not-found', message: `File not found: ${from}`, path: from });
  }
  state.dirs.add(nTo);
  return ok(undefined);
}

/** trash/delete 共用核心（移入回收站；目录 → 前缀整体） */
async function trashCore(state: MockHostState, path: string): Promise<Result<void>> {
  const key = normalizePath(path);
  const content = state.files.get(key) ?? (() => {
    const b = state.binaryFiles.get(key);
    return b === undefined ? undefined : String(b.byteLength);
  })();
  if (content === undefined) {
    const under = [...state.files.keys(), ...state.binaryFiles.keys()].filter((k) => k.startsWith(`${key}/`));
    if (under.length === 0) {
      return err({ code: 'not-found', message: `File not found: ${path}`, path });
    }
    for (const k of under) {
      state.files.delete(k);
      state.binaryFiles.delete(k);
      state.trashBin.set(k, '');
    }
    return ok(undefined);
  }
  state.files.delete(key);
  state.binaryFiles.delete(key);
  state.trashBin.set(key, content);
  return ok(undefined);
}

/** 创建内存 mock 宿主（浏览器 dev / 测试用） */
export function createMockHost(initial?: Partial<MockHostState>): DesktopHost {
  const state = createMockHostState(initial);

  const readFile = (path: string): Result<OpenFileResult> => {
    const content = state.files.get(normalizePath(path));
    if (content === undefined) {
      return err({ code: 'not-found', message: `File not found: ${path}`, path });
    }
    return ok({ path, content, encoding: 'utf-8', eol: detectEol(content), diskMtimeMs: state.nextMtimeMs, identityKey: state.identityKey });
  };

  return {
    fs: {
      open: async (_options?: OpenFileOptions): Promise<Result<OpenFileResult>> => {
        if (state.nextOpenPath === null) {
          return err({ code: 'canceled', message: 'Open dialog canceled' });
        }
        return readFile(state.nextOpenPath);
      },
      openPath: async (path: string): Promise<Result<OpenFileResult>> => readFile(path),
      save: async (path: string | null, content: string, options?: { encoding?: string; eol?: string; filters?: unknown }): Promise<Result<WriteFileResult>> => {
        const target = path ?? state.nextSavePath;
        if (target === null) {
          return err({ code: 'canceled', message: 'Save dialog canceled' });
        }
        state.files.set(normalizePath(target), content);
        state.lastSaveMeta = { encoding: options?.encoding ?? 'utf-8', eol: options?.eol ?? '\n' };
        return ok({ path: target, bytesWritten: content.length, diskMtimeMs: Date.now(), identityKey: state.identityKey });
      },
      readText: async (path: string): Promise<Result<string>> => {
        const result = readFile(path);
        return result.ok ? ok(result.value.content) : result;
      },
      writeText: async (path: string, content: string): Promise<Result<WriteFileResult>> => {
        state.files.set(normalizePath(path), content);
        return ok({ path, bytesWritten: content.length });
      },
      readDir: async (path: string): Promise<Result<DirEntry[]>> => {
        const entries = new Map<string, DirEntry>();
        const prefix = normalizePath(path);
        const collect = (key: string, isDirectory: boolean): void => {
          if (!key.startsWith(prefix) || key === prefix) return;
          const rest = key.slice(prefix.length).replace(/^\//, '');
          if (rest === '') return;
          if (rest.includes('/')) {
            const dir = rest.split('/')[0];
            const dirPath = `${prefix}/${dir}`;
            if (!entries.has(dirPath)) {
              entries.set(dirPath, { path: dirPath, name: dir, isDirectory: true });
            }
          } else if (isDirectory) {
            const dirPath = `${prefix}/${rest}`;
            if (!entries.has(dirPath)) {
              entries.set(dirPath, { path: dirPath, name: rest, isDirectory: true });
            }
          } else {
            entries.set(key, { path: key, name: rest, isDirectory: false });
          }
        };
        for (const key of state.files.keys()) collect(key, false);
        for (const key of state.binaryFiles.keys()) collect(key, false);
        for (const key of state.dirs.keys()) collect(key, true);
        return ok([...entries.values()]);
      },
      exists: async (path: string): Promise<Result<boolean>> => {
        const key = normalizePath(path);
        const exists =
          state.files.has(key) ||
          state.binaryFiles.has(key) ||
          state.dirs.has(key) ||
          [...state.files.keys(), ...state.binaryFiles.keys()].some((k) => k.startsWith(`${key}/`));
        return ok(exists);
      },
      rename: async (from: string, to: string): Promise<Result<void>> => {
        return renameCore(state, from, to);
      },
      move: async (from: string, to: string): Promise<Result<void>> => {
        return renameCore(state, from, to);
      },
      trash: async (path: string): Promise<Result<void>> => {
        return trashCore(state, path);
      },
      delete: async (path: string): Promise<Result<void>> => {
        // PRD §57：用户删除一律回收站
        const r = await trashCore(state, path);
        return r;
      },
      remove: async (path: string): Promise<Result<void>> => {
        const key = normalizePath(path);
        if (state.files.has(key) || state.binaryFiles.has(key) || state.dirs.has(key)) {
          state.files.delete(key);
          state.binaryFiles.delete(key);
          state.dirs.delete(key);
          return ok(undefined);
        }
        // 目录 remove：前缀整体删除
        let removed = 0;
        for (const k of [...state.files.keys()]) {
          if (k.startsWith(`${key}/`)) { state.files.delete(k); removed += 1; }
        }
        for (const k of [...state.binaryFiles.keys()]) {
          if (k.startsWith(`${key}/`)) { state.binaryFiles.delete(k); removed += 1; }
        }
        for (const k of [...state.dirs.keys()]) {
          if (k.startsWith(`${key}/`)) { state.dirs.delete(k); removed += 1; }
        }
        if (removed === 0) {
          return err({ code: 'not-found', message: `File not found: ${path}`, path });
        }
        return ok(undefined);
      },
      copyFile: async (from: string, to: string): Promise<Result<void>> => {
        const nFrom = normalizePath(from);
        const content = state.files.get(nFrom);
        if (content === undefined) {
          return err({ code: 'not-found', message: `File not found: ${from}`, path: from });
        }
        state.files.set(normalizePath(to), content);
        return ok(undefined);
      },
      mkdir: async (path: string): Promise<Result<void>> => {
        state.dirs.add(normalizePath(path));
        return ok(undefined);
      },
      writeBinary: async (path: string, data: ArrayBuffer): Promise<Result<void>> => {
        state.binaryFiles.set(normalizePath(path), data.slice(0));
        return ok(undefined);
      },
      readBinary: async (path: string): Promise<Result<ArrayBuffer>> => {
        const data = state.binaryFiles.get(normalizePath(path));
        if (data === undefined) {
          return err({ code: 'not-found', message: `File not found: ${path}`, path });
        }
        return ok(data.slice(0));
      },
      download: async (url: string, targetPath: string): Promise<Result<import('./services').DownloadResult>> => {
        state.downloads.push({ url, targetPath });
        const data = state.nextDownloadData ?? new TextEncoder().encode(`downloaded:${url}`).buffer as ArrayBuffer;
        state.binaryFiles.set(normalizePath(targetPath), data.slice(0));
        return ok({ path: targetPath, bytes: data.byteLength });
      },
    },

    dialog: {
      showOpen: async (_options?: OpenFileOptions): Promise<Result<string | null>> => {
        if (state.nextOpenPath === null) {
          return err({ code: 'canceled', message: 'Open dialog canceled' });
        }
        return ok(state.nextOpenPath);
      },
      showSave: async (_options?: OpenFileOptions): Promise<Result<string | null>> => {
        if (state.nextSavePath === null) {
          return err({ code: 'canceled', message: 'Save dialog canceled' });
        }
        return ok(state.nextSavePath);
      },
      showMessage: async (options: MessageDialogOptions): Promise<Result<string>> => {
        return ok(options.buttons?.[0] ?? 'OK');
      },
      showConfirm: async (_title: string, _message: string): Promise<Result<boolean>> => {
        return ok(state.confirmResult);
      },
      showDirectory: async (_options?: OpenFileOptions): Promise<Result<string | null>> => {
        if (state.nextDirectoryPath === null) {
          return err({ code: 'canceled', message: 'Directory dialog canceled' });
        }
        return ok(state.nextDirectoryPath);
      },
    },

    clipboard: {
      readText: async (): Promise<Result<string>> => ok(state.clipboardText),
      writeText: async (text: string): Promise<Result<void>> => {
        state.clipboardText = text;
        return ok(undefined);
      },
      readHTML: async (): Promise<Result<string | null>> => ok(state.clipboardHTML),
      writeHTML: async (html: string): Promise<Result<void>> => {
        state.clipboardHTML = html;
        return ok(undefined);
      },
      readImage: async (): Promise<Result<ArrayBuffer | null>> => ok(state.clipboardImage),
      writeImage: async (data: ArrayBuffer): Promise<Result<void>> => {
        state.clipboardImage = data;
        return ok(undefined);
      },
    },

    window: {
      setTitle: async (title: string): Promise<Result<void>> => {
        state.windowTitle = title;
        return ok(undefined);
      },
      setSize: async (size: Size): Promise<Result<void>> => {
        state.windowSize = size;
        return ok(undefined);
      },
      getSize: async (): Promise<Result<Size>> => ok(state.windowSize),
      getFocused: async (): Promise<Result<boolean>> => ok(state.windowFocused),
      minimize: async (): Promise<Result<void>> => ok(undefined),
      maximize: async (): Promise<Result<void>> => ok(undefined),
      close: async (): Promise<Result<void>> => ok(undefined),
    },

    watcher: {
      watch: async (path: string, onChange: (event: import('./services').FileChangeEvent) => void): Promise<Result<() => void>> => {
        state.watchCallbacks.set(path, onChange);
        return ok(() => state.watchCallbacks.delete(path));
      },
    },

    search: {
      searchFiles: async (query: string, directory: string): Promise<Result<SearchResult[]>> => {
        if (state.searchResults.length === 0) {
          // 兜底：在内存文件系统中简单子串匹配
          const results: SearchResult[] = [];
          for (const [path, content] of state.files) {
            if (!path.startsWith(normalizePath(directory))) continue;
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              const found = line.toLowerCase().indexOf(query.toLowerCase());
              if (found >= 0) {
                results.push({ path, line: index + 1, column: found + 1, match: line.slice(found, found + query.length), snippet: line.trim() });
              }
            });
          }
          return ok(results);
        }
        return ok(state.searchResults);
      },
      searchFilesStreaming: async (request, onResult): Promise<Result<{ cancel: () => void; done?: Promise<void> }>> => {
        const results = state.searchResults.length > 0 ? state.searchResults : [];
        if (results.length > 0) {
          results.forEach(onResult);
          return ok({ cancel: () => undefined });
        }
        for (const [path, content] of state.files) {
          if (!path.startsWith(normalizePath(request.root))) continue;
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            const source = request.caseSensitive ? line : line.toLowerCase();
            const needle = request.caseSensitive ? request.query : request.query.toLowerCase();
            const found = source.indexOf(needle);
            if (found >= 0) onResult({ path, line: index + 1, column: found + 1, match: line.slice(found, found + request.query.length), snippet: line.trim() });
          });
        }
        return ok({ cancel: () => undefined });
      },
    },

    export: {
      exportPDF: async (targetPath: string, content: string): Promise<Result<void>> => {
        state.exported.push({ kind: 'pdf', path: targetPath, content });
        return ok(undefined);
      },
      exportHTML: async (targetPath: string, html: string): Promise<Result<void>> => {
        state.exported.push({ kind: 'html', path: targetPath, content: html });
        return ok(undefined);
      },
      print: async (html: string): Promise<Result<void>> => {
        state.exported.push({ kind: 'print', path: null, content: html });
        return ok(undefined);
      },
    },

    keychain: {
      get: async (key: string): Promise<Result<string | null>> => {
        return ok(state.secrets.get(key) ?? null);
      },
      set: async (key: string, value: string): Promise<Result<void>> => {
        state.secrets.set(key, value);
        return ok(undefined);
      },
      delete: async (key: string): Promise<Result<void>> => {
        state.secrets.delete(key);
        return ok(undefined);
      },
    },

    process: {
      spawn: async (command: string, args: string[], options?: { cwd?: string }): Promise<Result<ChildProcessInfo>> => {
        state.spawned.push({ command, args, options });
        return ok({ pid: state.spawned.length });
      },
      kill: async (pid: number): Promise<Result<void>> => {
        state.killed.push(pid);
        return ok(undefined);
      },
    },

    notification: {
      show: async (request: NotificationRequest): Promise<Result<void>> => {
        state.notifications.push(request);
        return ok(undefined);
      },
    },

    recovery: {
      save: async (payload: RecoveryPayload): Promise<Result<void>> => {
        state.recovery.set(payload.documentId, payload);
        return ok(undefined);
      },
      list: async (): Promise<Result<RecoveryEntry[]>> => {
        const entries: RecoveryEntry[] = [...state.recovery.values()].map((p) => ({
          documentId: p.documentId,
          path: p.path,
          revision: p.revision,
          savedAt: p.savedAt,
        }));
        return ok(entries);
      },
      get: async (documentId: string): Promise<Result<RecoveryPayload | null>> => {
        return ok(state.recovery.get(documentId) ?? null);
      },
      delete: async (documentId: string): Promise<Result<void>> => {
        state.recovery.delete(documentId);
        return ok(undefined);
      },
    },

    opener: {
      openPath: async (path: string): Promise<Result<void>> => {
        state.openedPaths.push(path);
        return ok(undefined);
      },
      revealInFolder: async (path: string): Promise<Result<void>> => {
        state.openedPaths.push(`reveal:${path}`);
        return ok(undefined);
      },
      openUrl: async (url: string): Promise<Result<void>> => {
        state.openedPaths.push(`url:${url}`);
        return ok(undefined);
      },
    },
  };
}

export type { FileFilter };
