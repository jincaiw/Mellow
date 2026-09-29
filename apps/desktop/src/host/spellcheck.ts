/**
 * desktop 装配：SpellcheckService 实现（Adapter 层，PRD §113.4 / P0-EDITOR-005）。
 *
 * - **Tauri（macOS）**：调用 Rust `spellcheck_*`（`NSSpellChecker`：系统词典 + 用户词典）；
 * - **Tauri（Windows / Linux）**：Rust 侧 `spellcheck_available()` 返回 `false`；
 * - **浏览器 dev**：走共享 mock 单例（内存词典）。
 *
 * 平台约束：本模块只做平台调用映射，不含任何 Markdown / 命令业务逻辑。
 */

import { browserMockHost } from './browserMockHost';
import type { SpellcheckService } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

/**
 * 调用 Rust 命令；失败返回 `null` 由调用方降级。
 *
 * 为什么统一吞错而不抛：拼写检查是**可选增强**，其失败不应打断右键菜单的显示。
 * 若向上抛，宿主只能在每次右键时 try/catch，反而更容易漏（且漏了就是「点了没反应」）。
 */
async function callSpellcheck<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export const tauriSpellcheckService: SpellcheckService = {
  available: async () => {
    if (!isTauri()) return browserMockHost.spellcheck.available();
    return (await callSpellcheck<boolean>('spellcheck_available')) ?? false;
  },
  suggest: async (word: string) => {
    if (!isTauri()) return browserMockHost.spellcheck.suggest(word);
    return (await callSpellcheck<string[]>('spellcheck_suggest', { word })) ?? [];
  },
  learn: async (word: string) => {
    if (!isTauri()) return browserMockHost.spellcheck.learn(word);
    return (await callSpellcheck<boolean>('spellcheck_learn', { word })) ?? false;
  },
  unlearn: async (word: string) => {
    if (!isTauri()) return browserMockHost.spellcheck.unlearn(word);
    return (await callSpellcheck<boolean>('spellcheck_unlearn', { word })) ?? false;
  },
  hasLearned: async (word: string) => {
    if (!isTauri()) return browserMockHost.spellcheck.hasLearned(word);
    return (await callSpellcheck<boolean>('spellcheck_has_learned', { word })) ?? false;
  },
};

export const browserSpellcheckService: SpellcheckService = browserMockHost.spellcheck;

/** desktop 装配入口（与 `createDesktop*Service` 命名一致） */
export function createDesktopSpellcheckService(): SpellcheckService {
  return isTauri() ? tauriSpellcheckService : browserSpellcheckService;
}

/**
 * 可用性**缓存**（P0-EDITOR-005）。
 *
 * 为什么需要：右键菜单项必须在**同步**构造 items 时决定是否显示拼写区
 * （异步取完再弹菜单会导致跳动与点击错位），而 `available()` 是异步的。
 * 故在应用启动时预取一次并缓存；未就绪时按 `false` 处理（**宁可不显示**）——
 * 显示一个点了没反应的项比不显示更糟（本项目「占位项可点击且点击无反应」母题）。
 */
let availabilityCache: boolean | null = null;

/** 预取可用性（应用启动时调用一次） */
export async function primeSpellcheckAvailability(): Promise<boolean> {
  try {
    availabilityCache = await createDesktopSpellcheckService().available();
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/** 同步读取缓存的可用性；未就绪返回 false */
export function spellcheckAvailableSync(): boolean {
  return availabilityCache === true;
}
