/**
 * desktop 装配：FileService 实现（Adapter 层，PRD §113.4 —— 平台代码只允许在此）。
 *
 * - Tauri 实现：invoke Rust 命令（桥接层，未在 Host API 本轮扩展范围内，仅类型适配）
 * - 浏览器 dev：createMockHost 内存 mock（host-api 官方 mock）
 */

import { invoke } from '@tauri-apps/api/core';
import { createMockHost } from '../../../../packages/host-api/src/index';
import type { FileService, Result, OpenFileResult, WriteFileResult } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';

/** 是否为 Tauri 运行时（浏览器 dev 模式为 false） */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Tauri 实现（类型适配到新 Result 契约；命令语义不变） */
export const tauriFileService: FileService = {
  async open(): Promise<Result<OpenFileResult>> {
    const r = await invoke<{ path: string | null; content: string | null; error: string | null }>('open_document');
    if (r.error) return err({ code: 'io', message: r.error });
    if (r.path === null) return err({ code: 'canceled', message: '打开已取消' });
    return ok({ path: r.path, content: r.content ?? '' });
  },
  async save(path: string | null, content: string): Promise<Result<WriteFileResult>> {
    const r = await invoke<{ path: string | null; error: string | null }>('save_document', { path, content });
    if (r.error) return err({ code: 'io', message: r.error });
    if (r.path === null) return err({ code: 'canceled', message: '保存已取消' });
    return ok({ path: r.path, bytesWritten: content.length });
  },
  openPath: async (path: string) => err({ code: 'not-implemented', message: 'openPath 待实现', path }),
  readText: async (path: string) => err({ code: 'not-implemented', message: 'readText 待实现', path }),
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
