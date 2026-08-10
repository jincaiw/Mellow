/**
 * 文件服务：打开/保存 Markdown。
 * 通过 Tauri IPC 调用 Rust System Core（fs.rs）；浏览器 dev 模式下降级为内存 mock。
 */

import { invoke } from '@tauri-apps/api/core';
import type { OpenDocumentResult, SaveDocumentResult } from './types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 打开对话框并读取文件 */
export async function openDocument(): Promise<OpenDocumentResult> {
  if (!isTauri()) {
    // 浏览器开发模式：模拟打开（便于 UI 开发）
    const content = localStorage.getItem('mellow.dev.doc') ?? '';
    return { path: 'dev.md', content, error: null };
  }
  return invoke<OpenDocumentResult>('open_document');
}

/** 保存（有 path 直接写，无 path 弹另存为对话框）。写入用 atomic（ADR-0009 基础）。 */
export async function saveDocument(
  path: string | null,
  content: string,
): Promise<SaveDocumentResult> {
  if (!isTauri()) {
    localStorage.setItem('mellow.dev.doc', content);
    return { path: path ?? 'dev.md', error: null };
  }
  return invoke<SaveDocumentResult>('save_document', { path, content });
}
