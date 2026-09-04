/**
 * desktop 装配：用户主题加载（Typora themes 文件夹语义，V4 §7.3 / §11 对标）。
 *
 * - 目录：appData/themes/*.css（不存在则首建，供用户投放 CSS 文件）；
 * - 解析：packages/themes parseUserThemeCss（纯函数，文件名即主题名）；
 * - 注册：registerUserThemes → 主题菜单（nativeMenu 派生）/ theme.apply.* 命令 /
 *   resolveActiveTheme 全部可见；零 OS 依赖保留在 Adapter 层（PRD §113.4）。
 */

import { isTauri } from './fileServices';
import { parseUserThemeCss, registerUserThemes, type MellowTheme } from '../../../../packages/themes/src';

/** appData/themes 目录（不存在时静默创建） */
async function userThemesDir(): Promise<string | null> {
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { invoke } = await import('@tauri-apps/api/core');
    const dir = await join(await appDataDir(), 'themes');
    if (!(await invoke<boolean>('path_exists', { path: dir }))) {
      await invoke('mkdir', { path: dir }).catch(() => undefined);
    }
    return dir;
  } catch {
    return null;
  }
}

/** 扫描 appData/themes/*.css → MellowTheme 列表（非 Tauri / 失败返回空） */
export async function loadUserThemes(): Promise<MellowTheme[]> {
  if (!isTauri()) return [];
  const dir = await userThemesDir();
  if (dir === null) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const entries = await invoke<Array<{ path: string; name: string; is_directory: boolean }>>('read_dir', { path: dir });
    const themes: MellowTheme[] = [];
    for (const entry of entries) {
      if (entry.is_directory || !entry.name.toLowerCase().endsWith('.css')) continue;
      // read_text 返回 { content } 结构（App 既有用法）；失败跳过单个文件不阻塞其余
      const result = await invoke<{ content: string }>('read_text', { path: entry.path }).catch(() => null);
      const content = result?.content;
      if (typeof content !== 'string' || content.trim() === '') continue;
      themes.push(parseUserThemeCss(entry.name, content));
    }
    return themes;
  } catch {
    return [];
  }
}

/** 加载并注册用户主题（返回已注册列表，供菜单/命令派生消费） */
export async function refreshUserThemes(): Promise<MellowTheme[]> {
  const themes = await loadUserThemes();
  registerUserThemes(themes);
  return themes;
}

/** 打开主题文件夹（Typora「打开主题文件夹」对标；目录不存在则首建） */
export async function openThemesFolder(): Promise<void> {
  if (!isTauri()) return;
  const dir = await userThemesDir();
  if (dir === null) return;
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(dir).catch(() => undefined);
  } catch {
    /* opener 不可用：静默 */
  }
}
