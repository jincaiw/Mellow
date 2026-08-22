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
  /** 大文件标记：content 为空，需走 read_text_chunk 分块拉取 */
  large?: boolean | null;
  error: string | null;
}

interface TauriSaveResponse {
  path: string | null;
  disk_mtime_ms: number | null;
  identity_key: string | null;
  error_code: string | null;
  error: string | null;
}

/** 分块读取阈值（decode 后字符数，与 Rust CHUNKED_READ_THRESHOLD_CHARS 对齐） */
const CHUNKED_READ_THRESHOLD_CHARS = 1_000_000;
/** 每块字符数：offset 语义为 Rust chars（Unicode scalar），由块序号推进避免 UTF-16 错位 */
const CHUNK_SIZE_CHARS = 256 * 1024;

/**
 * 大文件分块读取：read_text_meta 探测 → read_text_chunk 逐块拉取拼接。
 * 规避 tauri:// 协议下超大 IPC 单次响应卡死 WebKit 事务（动态样式表失效/白屏）。
 */
async function readContentChunked(path: string): Promise<string> {
  const meta = await invoke<{ path: string; char_count: number; mtime_ms: number }>('read_text_meta', { path });
  const parts: string[] = [];
  for (let i = 0; i * CHUNK_SIZE_CHARS < meta.char_count; i++) {
    const r = await invoke<{ chunk: string; total: number }>('read_text_chunk', {
      path,
      offset: i * CHUNK_SIZE_CHARS,
      len: CHUNK_SIZE_CHARS,
    });
    parts.push(r.chunk);
  }
  const content = parts.join('');
  return content;
}

/** Tauri 实现（类型适配到新 Result 契约；命令语义不变） */
export const tauriFileService: FileService = {
  async open(): Promise<Result<OpenFileResult>> {
    const r = await invoke<TauriOpenResponse>('open_document');
    if (r.error) return err({ code: 'io', message: r.error });
    if (r.path === null) return err({ code: 'canceled', message: '打开已取消' });
    // 大文件：Rust 侧已把内容放入缓存（content 为空），分块拉取避免超大 IPC 响应
    const content = r.large === true ? await readContentChunked(r.path) : (r.content ?? '');
    return ok({
      path: r.path,
      content,
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
      // 先探测元数据：大文件走分块（避免超大 IPC 响应卡死 WebKit 事务），小文件一次读回
      const meta = await invoke<{
        path: string; encoding: string; eol: string; mtime_ms: number; identity_key: string; char_count: number;
      }>('read_text_meta', { path });
      const large = meta.char_count > CHUNKED_READ_THRESHOLD_CHARS;
      const content = large
        ? await readContentChunked(path)
        : (await invoke<{ content: string }>('read_text', { path })).content;
      return ok({
        path,
        content,
        encoding: (meta.encoding as Encoding) ?? 'utf-8',
        eol: (meta.eol as LineEnding) ?? '\n',
        diskMtimeMs: meta.mtime_ms,
        identityKey: meta.identity_key,
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
  writeText: async (path: string, content: string) => {
    try {
      const r = await invoke<TauriSaveResponse & { error?: string }>('write_text', { path, content });
      if (r.error) return err({ code: (r.error_code as 'io' | 'conflict' | undefined) ?? 'io', message: r.error, path });
      return ok({
        path: r.path ?? path,
        bytesWritten: content.length,
        diskMtimeMs: r.disk_mtime_ms ?? undefined,
        identityKey: r.identity_key ?? undefined,
      });
    } catch (e) {
      return err({ code: 'io', message: String(e), path });
    }
  },
  readDir: async (path: string) => {
    try {
      const r = await invoke<Array<{ path: string; name: string; is_directory: boolean; modified_ms?: number; created_ms?: number }>>('read_dir', { path });
      return ok(r.map((e) => ({ path: e.path, name: e.name, isDirectory: e.is_directory, modifiedMs: e.modified_ms, createdMs: e.created_ms })));
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  exists: async (path: string) => {
    try {
      const r = await invoke<boolean>('path_exists', { path });
      return ok(r);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  rename: async (from: string, to: string) => {
    try {
      await invoke('move_file', { from, to });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  move: async (from: string, to: string) => {
    try {
      await invoke('move_file', { from, to });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  trash: async (path: string) => {
    try {
      await invoke('trash', { path });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  delete: async (path: string) => {
    // PRD §57：delete 默认回收站
    try {
      await invoke('trash', { path });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  remove: async (path: string) => {
    try {
      await invoke('remove_file', { path });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  copyFile: async (from: string, to: string) => {
    try {
      await invoke('copy_file', { from, to });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  mkdir: async (path: string) => {
    try {
      await invoke('mkdir', { path });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  writeBinary: async (path: string, data: ArrayBuffer) => {
    try {
      await invoke('write_binary', { path, data: Array.from(new Uint8Array(data)) });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  readBinary: async (path: string) => {
    try {
      const r = await invoke<number[]>('read_binary', { path });
      return ok(new Uint8Array(r).buffer as ArrayBuffer);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  download: async (url: string, targetPath: string) => {
    try {
      await invoke('download_remote', { url, targetPath });
      return ok({ path: targetPath, bytes: 0 });
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

/** 浏览器 dev 模式文件服务（host-api 官方 mock） */
export const browserFileService: FileService = createMockHost().fs;

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopFileService(): FileService {
  return isTauri() ? tauriFileService : browserFileService;
}
