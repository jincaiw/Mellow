/**
 * desktop 装配：Tauri 实现的 FileService（实现 host-api 契约）。
 * 平台相关代码只允许出现在 apps/desktop（Adapter 层，PRD §113.4）。
 */

import { invoke } from '@tauri-apps/api/core';
import type { FileService, OpenDocumentResult, SaveDocumentResult } from '../../../../packages/host-api/src/index';

/** 是否为 Tauri 运行时（浏览器 dev 模式为 false） */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const tauriFileService: FileService = {
  async open(): Promise<OpenDocumentResult> {
    return invoke<OpenDocumentResult>('open_document');
  },
  async save(path: string | null, content: string): Promise<SaveDocumentResult> {
    return invoke<SaveDocumentResult>('save_document', { path, content });
  },
};

/** 浏览器 dev 模式文件服务（内存 mock，便于 UI 开发） */
export const browserFileService: FileService = {
  async open(): Promise<OpenDocumentResult> {
    const content = localStorage.getItem('mellow.dev.doc') ?? '';
    return { path: 'dev.md', content, error: null };
  },
  async save(path: string | null, content: string): Promise<SaveDocumentResult> {
    localStorage.setItem('mellow.dev.doc', content);
    return { path: path ?? 'dev.md', error: null };
  },
};

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopFileService(): FileService {
  return isTauri() ? tauriFileService : browserFileService;
}
