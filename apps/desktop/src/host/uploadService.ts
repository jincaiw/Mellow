/**
 * desktop 装配：ImageUploadService 实现（B5 / PRD §55，Adapter 层）。
 *
 * - Tauri 实现：invoke upload_images（Rust 三通道：picgo-http / picgo-cli / custom-command）
 * - 浏览器 dev：host-api mock（uploadUrls 预设驱动）
 */

import { invoke } from '@tauri-apps/api/core';
import { browserMockHost } from './browserMockHost';
import type { ImageUploadOptions, ImageUploadService, Result } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

/** Tauri 实现（Rust upload.rs；错误经 String → io error） */
export const tauriImageUploadService: ImageUploadService = {
  async uploadImages(files: string[], options: ImageUploadOptions): Promise<Result<string[]>> {
    try {
      const urls = await invoke<string[]>('upload_images', {
        files,
        service: options.channel,
        httpUrl: options.httpUrl,
        command: options.command,
      });
      return ok(urls);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

/** 浏览器 dev 模式（mock；测试经 state.uploadUrls 预设） */
export const browserImageUploadService: ImageUploadService = browserMockHost.imageUpload;

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopImageUploadService(): ImageUploadService {
  return isTauri() ? tauriImageUploadService : browserImageUploadService;
}
