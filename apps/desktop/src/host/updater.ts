/**
 * updater.ts —— 安全 Auto Update（前端侧）
 *
 * 能力（对应 docs/specs/auto-update-spec.md）：
 * - update check：`check()`（带渠道头；只发送版本/平台元数据）；
 * - download + verify package：下载由 Rust 插件完成，签名在落盘前校验（pubkey 内嵌）；
 * - restart：`install()` 后 `relaunch()`；
 * - release channel：stable（默认）/ beta —— 经 `X-Mellow-Channel` 头传递；
 * - rollback strategy：更新前 `prepareRollback()` 备份当前版本（Rust System Core）；
 *   更新重启后健康确认（`rollbackCommit`）；未健康启动 → 提示回滚（`rollbackRestore`）。
 *
 * 数据安全（硬约束）：更新检查与下载**只发送**当前版本号 / 平台标识 / 渠道；
 * 绝不携带任何文档内容、文件路径或用户数据；无遥测。
 */

import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { exit, relaunch } from '@tauri-apps/plugin-process';
import { readSetting, settingById } from '../../../../packages/settings/src';

export type UpdateChannel = 'stable' | 'beta';
export const UPDATE_CHANNELS: readonly UpdateChannel[] = ['stable', 'beta'];
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'stable';

/** 回滚状态（与 Rust RollbackInfo 对齐） */
export interface RollbackStatus {
  previousVersion: string;
  pending: boolean;
  launchCount: number;
  preparedAt: number;
}

/** 回滚恢复结果（与 Rust RestoreOutcome 对齐） */
export interface RestoreOutcome {
  restored: boolean;
  scheduledRestart: boolean;
  message: string;
}

export function updateChannelFromSettings(): UpdateChannel {
  // P2-2.6：updater section 归位到 general，设置 id 同步为 general.updater.channel
  const def = settingById('general.updater.channel');
  const value = def === undefined ? DEFAULT_UPDATE_CHANNEL : readSetting(def);
  return value === 'beta' ? 'beta' : DEFAULT_UPDATE_CHANNEL;
}

/**
 * 检查更新。返回 null 表示无更新。
 * 请求仅携带版本/平台/渠道元数据（无用户数据）。
 * 15s 超时：端点不可达时不让启动 banner 永久停在「正在检查更新…」。
 */
export async function checkForUpdate(channel: UpdateChannel = DEFAULT_UPDATE_CHANNEL): Promise<Update | null> {
  const CHECK_TIMEOUT_MS = 15_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      check({ headers: { 'X-Mellow-Channel': channel } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('update check timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface UpdateProgress {
  downloaded: number;
  total?: number;
}

/** 下载（Rust 侧签名校验；进度回调） */
export async function downloadUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;
  await update.download((event: DownloadEvent) => {
    if (event.event === 'Started') {
      total = event.data.contentLength;
      onProgress({ downloaded: 0, total });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress({ downloaded, total });
    }
  });
  onProgress({ downloaded, total });
}

/** 更新前备份当前版本（rollback 策略第一步，Rust System Core） */
export async function prepareRollback(): Promise<RollbackStatus> {
  return invoke<RollbackStatus>('update_rollback_prepare');
}

/** 安装已下载更新并重启 */
export async function installUpdateAndRestart(update: Update): Promise<void> {
  await update.install();
  await relaunch();
}

// ── rollback（Rust System Core 命令）──

export async function rollbackStatus(): Promise<RollbackStatus | null> {
  return invoke<RollbackStatus | null>('update_rollback_status');
}

export async function rollbackNoteLaunch(): Promise<RollbackStatus | null> {
  return invoke<RollbackStatus | null>('update_rollback_note_launch');
}

/** 健康确认：删除备份与 marker */
export async function rollbackCommit(): Promise<void> {
  await invoke('update_rollback_commit');
}

/** 回滚到备份版本；Windows 返回 scheduledRestart 时调用方应 exit()（helper 代重启） */
export async function rollbackRestore(): Promise<RestoreOutcome> {
  return invoke<RestoreOutcome>('update_rollback_restore');
}

/** 回滚后重启（macOS/Linux 直接 relaunch；Windows 用 exit 交给 helper） */
export async function restartAfterRollback(outcome: RestoreOutcome): Promise<void> {
  if (outcome.scheduledRestart) {
    await exit(0);
  } else {
    await relaunch();
  }
}
