/**
 * Golden 基线路径（按平台分离）。
 *
 * 背景（P0-LAYOUT-002）：§9.3 要求三平台 × 14 场景。但基线里存的是**布局测量值**
 * （写作宽度、行高、aside 尺寸等），而这些取决于平台的字体度量与 DPI ——
 * 用 macOS 测得的基线去比对 Linux / Windows 产物**必然失配**，等于把门禁变成
 * 永远无法通过或只能靠 `--update` 糊过去的假门禁。
 *
 * 因此基线按平台分文件：
 *   - darwin（macOS）：`golden/<name>-golden.json`（沿用历史文件名，本机实测基线）
 *   - linux：          `golden/<name>-golden.linux.json`
 *   - windows：        `golden/<name>-golden.windows.json`
 *
 * 首次在某一平台运行时脚本会自动生成该平台基线并成功退出（与既有行为一致）；
 * 基线提交后，同一平台的后续运行即进入比对模式，漂移会使门禁失败。
 *
 * 可用 `MELLOW_GOLDEN_PLATFORM` 覆盖平台判定（darwin / linux / win32），
 * 便于在本机验证路径逻辑（**注意**：不要提交在非对应平台上生成的基线文件）。
 */
import { resolve } from 'node:path';
import { platform as osPlatform } from 'node:os';

const HERE = new URL('.', import.meta.url).pathname;

/** 返回基线文件名后缀；macOS 返回 null（使用无后缀的主基线名） */
export function platformTag() {
  // 注意：CI 里环境变量常出现「已设置但为空」的情形，空串必须按未设置处理，
  // 否则会生成 `<name>-golden..json` 这类畸形基线名（并静默产生假证据）。
  const raw = (process.env.MELLOW_GOLDEN_PLATFORM ?? '').trim() || osPlatform();
  if (raw === 'darwin' || raw === 'macos') return null;
  if (raw === 'win32' || raw === 'windows') return 'windows';
  if (raw === 'linux') return 'linux';
  // 未知平台：用原名而非静默套用某个平台，避免制造假证据
  return raw;
}

/** goldenFile('layout') → golden/layout-golden.json（macOS）或 golden/layout-golden.linux.json */
export function goldenFile(name) {
  const tag = platformTag();
  return resolve(HERE, 'golden', tag === null ? `${name}-golden.json` : `${name}-golden.${tag}.json`);
}

/** 人类可读的平台名，用于日志 */
export function platformLabel() {
  return platformTag() ?? 'macos';
}
