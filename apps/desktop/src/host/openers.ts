/**
 * desktop 装配：OpenerService 实现（PRD §54 Open Image / Reveal；tauri-plugin-opener）。
 *
 * - Tauri：plugin-opener（openPath / revealInFolder / openUrl）
 * - 浏览器 dev：mock（createMockHost().opener）
 */

import { createMockHost } from '../../../../packages/host-api/src/index';
import type { OpenerService } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

/** Tauri 实现 */
export const tauriOpenerService: OpenerService = {
  openPath: async (path: string) => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(path);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  revealInFolder: async (path: string) => {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(path);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  openUrl: async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

/** 浏览器 dev 模式（mock） */
export const browserOpenerService: OpenerService = createMockHost().opener;

export function createDesktopOpenerService(): OpenerService {
  return isTauri() ? tauriOpenerService : browserOpenerService;
}
