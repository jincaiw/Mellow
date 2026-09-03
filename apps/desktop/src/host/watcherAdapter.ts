/**
 * desktop 装配：WatchService 实现（Adapter 层）。
 * - Tauri：watch_document 注册 notify 监听 + listen('mellow://file-changed') 接收事件
 * - 浏览器 dev：host-api mock（内存回调，测试/开发可手动触发）
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { browserMockHost } from './browserMockHost';
import type { WatchService, FileChangeEvent, Result } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';

interface TauriChangeEvent {
  path: string;
  mtime_ms: number;
  identity_key: string;
  kind: string;
}

const fromTauri = (e: TauriChangeEvent): FileChangeEvent => ({
  path: e.path,
  mtimeMs: e.mtime_ms,
  identityKey: e.identity_key,
  kind: (e.kind as FileChangeEvent['kind']) ?? 'modify',
});

export const tauriWatcher: WatchService = {
  async watch(path: string, onChange: (event: FileChangeEvent) => void): Promise<Result<() => void>> {
    try {
      const watcherId = await invoke<number>('watch_document', { path });
      const unlisten = await listen<TauriChangeEvent>('mellow://file-changed', (event) => {
        if (event.payload.path === path) {
          onChange(fromTauri(event.payload));
        }
      });
      return ok(() => {
        void unlisten();
        void invoke('unwatch_document', { watcherId });
      });
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

export const browserWatcher: WatchService = browserMockHost.watcher;

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopWatcher(): WatchService {
  const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return isTauriRuntime ? tauriWatcher : browserWatcher;
}
