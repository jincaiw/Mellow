/**
 * desktop 装配：DialogService 实现（Adapter 层，PRD §113.4）。
 *
 * - Tauri：tauri-plugin-dialog（原生对话框；Rust 侧已注册插件）
 * - 浏览器 dev：window.confirm / mock（browserMockHost.dialog，共享单例）
 */

import { confirm, open } from '@tauri-apps/plugin-dialog';
import { browserMockHost } from './browserMockHost';
import type { DialogService, OpenFileOptions } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

/** Tauri 实现（原生对话框） */
export const tauriDialogService: DialogService = {
  showOpen: async (options?: OpenFileOptions) => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: options?.filters?.map((f) => ({ name: f.name, extensions: f.extensions })),
      defaultPath: options?.defaultPath,
    });
    if (picked === null) return err({ code: 'canceled', message: '打开已取消' });
    return ok(picked as string);
  },
  showSave: async () => {
    // V0.0：保存对话框走 fs.save（Rust save_document 内置）；此处占位
    return err({ code: 'not-implemented', message: 'showSave 经 fs.save 实现' });
  },
  showMessage: async (options) => {
    const result = await import('@tauri-apps/plugin-dialog').then((m) => m.message(options.message, {
      title: options.title,
      kind: (options.kind as 'info' | 'warning' | 'error') ?? 'info',
      okLabel: options.buttons?.[0] ?? 'OK',
    }));
    return ok(result);
  },
  showConfirm: async (title, message) => {
    const result = await confirm(message, { title, kind: 'warning', okLabel: '是', cancelLabel: '否' });
    return ok(result);
  },
  showDirectory: async () => {
    // 目录选择：Rust pick_folder 命令（tauri-plugin-dialog 的 open directory 也可，但复用已注册命令保持一致）
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const r = await invoke<string | null>('pick_folder');
      if (r === null) return err({ code: 'canceled', message: '目录选择已取消' });
      return ok(r);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

/** 浏览器 dev 模式（mock dialog） */
export const browserDialogService: DialogService = browserMockHost.dialog;

/** 按运行时选择实现 */
export function createDesktopDialogService(): DialogService {
  return isTauri() ? tauriDialogService : browserDialogService;
}
