/**
 * desktop 装配：FileService 实现（Adapter 层，PRD §113.4 —— 平台代码只允许在此）。
 *
 * - Tauri 实现：invoke Rust 命令（桥接层，未在 Host API 本轮扩展范围内，仅类型适配）
 * - 浏览器 dev：createMockHost 内存 mock（host-api 官方 mock）
 */

import { invoke } from '@tauri-apps/api/core';
import { createMockHost } from '../../../../packages/host-api/src/index';
import type { FileService, Result, OpenFileResult, WriteFileResult, SaveOptions, Encoding, LineEnding } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';

/** 是否为 Tauri 运行时（浏览器 dev 模式为 false） */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface TauriOpenResponse {
  path: string | null;
  content: string | null;
  encoding: string | null;
  eol: string | null;
  disk_mtime_ms: number | null;
  identity_key: string | null;
  error: string | null;
}

interface TauriSaveResponse {
  path: string | null;
  disk_mtime_ms: number | null;
  identity_key: string | null;
  error_code: string | null;
  error: string | null;
}

/** Tauri 实现（类型适配到新 Result 契约；命令语义不变） */
export const tauriFileService: FileService = {
  async open(): Promise<Result<OpenFileResult>> {
    const r = await invoke<TauriOpenResponse>('open_document');
    if (r.error) return err({ code: 'io', message: r.error });
    if (r.path === null) return err({ code: 'canceled', message: '打开已取消' });
    return ok({
      path: r.path,
      content: r.content ?? '',
      encoding: (r.encoding as Encoding) ?? 'utf-8',
      eol: (r.eol as LineEnding) ?? '\n',
      diskMtimeMs: r.disk_mtime_ms ?? undefined,
      identityKey: r.identity_key ?? undefined,
    });
  },
  async save(path: string | null, content: string, options?: SaveOptions): Promise<Result<WriteFileResult>> {
    const r = await invoke<TauriSaveResponse>('save_document', {
      path,
      content,
      encoding: options?.encoding ?? null,
      eol: options?.eol ?? null,
      expected: options?.expectedDisk
        ? { mtime_ms: options.expectedDisk.mtimeMs, identity_key: options.expectedDisk.identityKey }
        : null,
    });
    if (r.error) {
      return err({
        code: (r.error_code as 'io' | 'conflict') ?? 'io',
        message: r.error,
        path: r.path ?? undefined,
      });
    }
    if (r.path === null) return err({ code: 'canceled', message: '保存已取消' });
    return ok({
      path: r.path,
      bytesWritten: content.length,
      diskMtimeMs: r.disk_mtime_ms ?? undefined,
      identityKey: r.identity_key ?? undefined,
    });
  },
  openPath: async (path: string) => {
    try {
      const r = await invoke<TauriOpenResponse & { error?: string }>('read_text', { path });
      if (r.error) return err({ code: 'io', message: r.error, path });
      return ok({
        path,
        content: r.content ?? '',
        encoding: (r.encoding as Encoding) ?? 'utf-8',
        eol: (r.eol as LineEnding) ?? '\n',
        diskMtimeMs: r.disk_mtime_ms ?? undefined,
        identityKey: r.identity_key ?? undefined,
      });
    } catch (e) {
      return err({ code: 'io', message: String(e), path });
    }
  },
  readText: async (path: string) => {
    try {
      const r = await invoke<TauriOpenResponse & { error?: string }>('read_text', { path });
      if (r.error) return err({ code: 'io', message: r.error, path });
      return ok(r.content ?? '');
    } catch (e) {
      return err({ code: 'io', message: String(e), path });
    }
  },
  writeText: async (path: string, _content: string) => err({ code: 'not-implemented', message: 'writeText 待实现', path }),
  readDir: async () => err({ code: 'not-implemented', message: 'readDir 待实现' }),
  exists: async () => err({ code: 'not-implemented', message: 'exists 待实现' }),
  rename: async () => err({ code: 'not-implemented', message: 'rename 待实现' }),
  delete: async () => err({ code: 'not-implemented', message: 'delete 待实现' }),
};

/** 浏览器 dev 模式文件服务（host-api 官方 mock） */
export const browserFileService: FileService = createMockHost().fs;

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopFileService(): FileService {
  return isTauri() ? tauriFileService : browserFileService;
}
