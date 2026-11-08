/**
 * desktop 装配：TextReplacementService 实现（Adapter 层，PRD §113.4 / G7-MENU-05）。
 *
 * - **Tauri（macOS）**：调用 Rust `text_replacement_*`，读系统词典
 *   （`NSUserDictionaryReplacementItems`，与 Typora `word.getTextReplacement` 同源）；
 * - **Tauri（Windows / Linux）**：Rust `text_replacement_available` 返回 `false`；
 * - **浏览器 dev**：走共享 mock 单例（内存词条）。
 *
 * 平台约束：本模块只做平台调用映射，不含任何 Markdown / 命令业务逻辑。
 */

import { browserMockHost } from './browserMockHost';
import type { TextReplacementEntry, TextReplacementService } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

/**
 * 调用 Rust 命令；失败返回 `null` 由调用方降级。
 * 同 `spellcheck.ts`：文本替换是可选增强，失败不得打断编辑器输入路径。
 */
async function callTextReplacement<T>(cmd: string): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd);
  } catch {
    return null;
  }
}

export const tauriTextReplacementService: TextReplacementService = {
  available: async () => {
    if (!isTauri()) return browserMockHost.textReplacement.available();
    return (await callTextReplacement<boolean>('text_replacement_available')) ?? false;
  },
  entries: async () => {
    if (!isTauri()) return browserMockHost.textReplacement.entries();
    return (await callTextReplacement<TextReplacementEntry[]>('text_replacement_entries')) ?? [];
  },
};

export const browserTextReplacementService: TextReplacementService = browserMockHost.textReplacement;

/** desktop 装配入口（与 `createDesktop*Service` 命名一致） */
export function createDesktopTextReplacementService(): TextReplacementService {
  return isTauri() ? tauriTextReplacementService : browserTextReplacementService;
}

/**
 * 可用性**缓存**（与 `spellcheck.ts` 同因）：菜单项 / 设置行必须在**同步**构造时
 * 决定是否显示。启动时预取一次；未就绪按 `false` 处理（**宁可不显示**）。
 */
let availabilityCache: boolean | null = null;

/** 预取可用性（应用启动时调用一次） */
export async function primeTextReplacementAvailability(): Promise<boolean> {
  try {
    availabilityCache = await createDesktopTextReplacementService().available();
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/** 同步读取缓存的可用性；未就绪返回 false */
export function textReplacementAvailableSync(): boolean {
  return availabilityCache === true;
}

/**
 * 词典**缓存**（同因）：编辑器就绪块是同步代码，而 `entries()` 是异步的。
 * 启动时预取一次；未就绪 ⇒ 空数组 = 引擎 no-op（宁可不替换，不阻塞输入）。
 * 切换文档重建编辑器时用 `textReplacementEntriesSync()` 重新注入。
 */
let entriesCache: TextReplacementEntry[] | null = null;

/** 预取词典（应用启动一次；失败置空表） */
export async function loadTextReplacementEntries(): Promise<TextReplacementEntry[]> {
  try {
    entriesCache = await createDesktopTextReplacementService().entries();
  } catch {
    entriesCache = [];
  }
  return entriesCache;
}

/** 同步读取缓存的词典；未就绪返回空数组 */
export function textReplacementEntriesSync(): TextReplacementEntry[] {
  return entriesCache ?? [];
}
