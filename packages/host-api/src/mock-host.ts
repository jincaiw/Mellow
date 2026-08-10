/**
 * host-api —— Mock 实现（createMockHost）。
 *
 * 内存版宿主：浏览器 dev 模式 / 测试 / 无 Adapter 环境可用。
 * 所有 service 行为确定、可断言（contract tests 基于此）。
 */

import type { DesktopHost } from './host';
import type { Result, Size, SearchResult, NotificationRequest, FileFilter } from './types';
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
  /** keychain */
  secrets: Map<string, string>;
}

export function createMockHostState(initial?: Partial<MockHostState>): MockHostState {
  return {
    files: new Map(initial?.files ?? [['/dev.md', '# Mellow dev doc']]),
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
  };
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/** 创建内存 mock 宿主（浏览器 dev / 测试用） */
export function createMockHost(initial?: Partial<MockHostState>): DesktopHost {
  const state = createMockHostState(initial);

  const readFile = (path: string): Result<OpenFileResult> => {
    const content = state.files.get(normalizePath(path));
    if (content === undefined) {
      return err({ code: 'not-found', message: `File not found: ${path}`, path });
    }
    return ok({ path, content });
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
      save: async (path: string | null, content: string, _options?: OpenFileOptions): Promise<Result<WriteFileResult>> => {
        const target = path ?? state.nextSavePath;
        if (target === null) {
          return err({ code: 'canceled', message: 'Save dialog canceled' });
        }
        state.files.set(normalizePath(target), content);
        return ok({ path: target, bytesWritten: content.length });
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
        const entries: DirEntry[] = [];
        const prefix = normalizePath(path);
        for (const file of state.files.keys()) {
          if (file.startsWith(prefix) && file !== prefix) {
            const rest = file.slice(prefix.length).replace(/^\//, '');
            if (rest.includes('/')) {
              const dir = rest.split('/')[0];
              entries.push({ path: `${prefix}/${dir}`, name: dir, isDirectory: true });
            } else {
              entries.push({ path: file, name: rest, isDirectory: false });
            }
          }
        }
        return ok(entries);
      },
      exists: async (path: string): Promise<Result<boolean>> => {
        return ok(state.files.has(normalizePath(path)));
      },
      rename: async (from: string, to: string): Promise<Result<void>> => {
        const content = state.files.get(normalizePath(from));
        if (content === undefined) {
          return err({ code: 'not-found', message: `File not found: ${from}`, path: from });
        }
        state.files.delete(normalizePath(from));
        state.files.set(normalizePath(to), content);
        return ok(undefined);
      },
      delete: async (path: string): Promise<Result<void>> => {
        state.files.delete(normalizePath(path));
        return ok(undefined);
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
      watch: async (path: string, onChange: () => void): Promise<Result<() => void>> => {
        // Mock：立即注册，返回取消函数（onChange 由外部测试触发）
        return ok(() => { void path; void onChange; });
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
              if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ path, line: index + 1, snippet: line.trim() });
              }
            });
          }
          return ok(results);
        }
        return ok(state.searchResults);
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
