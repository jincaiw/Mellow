/**
 * desktop 装配：WindowService 实现（Adapter 层，PRD §113.4）。
 *
 * - Tauri：@tauri-apps/api/window getCurrentWindow（minimize/maximize/close/fullscreen）。
 *   Windows：保留原生 decorations → 原生标题栏控制按钮 + Windows 11 Snap Layout 免费获得；
 *   本服务提供统一契约，供命令/插件/未来自定义控件调用。
 * - 浏览器 dev：mock（browserMockHost.window，共享单例）。
 *
 * 平台约束：本模块只做平台调用映射，不含任何 Markdown / 命令业务逻辑。
 */

import { browserMockHost } from './browserMockHost';
import type { WindowService, Size } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

type TauriWindow = import('@tauri-apps/api/window').Window;

async function windowHandle(): Promise<TauriWindow | null> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export const tauriWindowService: WindowService = {
  setTitle: async (title) => {
    try {
      const win = await windowHandle();
      await win?.setTitle(title);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  setSize: async (size: Size) => {
    try {
      const { PhysicalSize } = await import('@tauri-apps/api/dpi');
      const win = await windowHandle();
      await win?.setSize(new PhysicalSize(size.width, size.height));
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  getSize: async () => {
    try {
      const win = await windowHandle();
      const size = await win?.innerSize();
      if (size === undefined) return err({ code: 'unsupported', message: 'window unavailable' });
      return ok({ width: size.width, height: size.height });
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  getFocused: async () => {
    try {
      const win = await windowHandle();
      const focused = await win?.isFocused();
      return ok(focused === undefined ? false : focused);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  minimize: async () => {
    try {
      const win = await windowHandle();
      await win?.minimize();
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  maximize: async () => {
    try {
      const win = await windowHandle();
      await win?.maximize();
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  toggleMaximize: async () => {
    try {
      const win = await windowHandle();
      await win?.toggleMaximize();
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  isMaximized: async () => {
    try {
      const win = await windowHandle();
      const maximized = await win?.isMaximized();
      return ok(maximized === undefined ? false : maximized);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  setFullscreen: async (fullscreen) => {
    try {
      const win = await windowHandle();
      await win?.setFullscreen(fullscreen);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  isFullscreen: async () => {
    try {
      const win = await windowHandle();
      const fs = await win?.isFullscreen();
      return ok(fs === undefined ? false : fs);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  setAlwaysOnTop: async (on) => {
    try {
      const win = await windowHandle();
      await win?.setAlwaysOnTop(on);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  isAlwaysOnTop: async () => {
    try {
      const win = await windowHandle();
      const onTop = await win?.isAlwaysOnTop();
      return ok(onTop === undefined ? false : onTop);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  close: async () => {
    try {
      const win = await windowHandle();
      await win?.close();
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

/** 浏览器 dev 模式（mock） */
export const browserWindowService: WindowService = browserMockHost.window;

export function createDesktopWindowService(): WindowService {
  return isTauri() ? tauriWindowService : browserWindowService;
}
