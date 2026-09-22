/**
 * 跨平台 vite dev server 启动器（P0-LAYOUT-002 / G7-QA-04）。
 *
 * 背景（2026-09-22 定性）：Windows 侧 §9.3 视觉采集自加入起**从未产出任何基线**。
 * 根因不是「各平台字体度量不同」，而是 `spawn('npx', …)`：Windows 上 `npx` 实际是
 * `npx.cmd`，Node 的 spawn 在没有 shell 时无法执行 `.cmd`（抛 ENOENT）。脚本随即在
 * `waitForServer` 超时后抛错，而 workflow 里该步骤是 `continue-on-error: true` ——
 * 错误被吞掉，`upload-artifact` 于是报 "No files were found" 并**静默上传 0 个文件**。
 * 结果：Windows / Linux 基线永远缺席，`P0-LAYOUT-002` 永久 BLOCKED，且屏幕上
 * 看不出任何异常。这正是「把功能不工作固化成基准」的相邻形态：**静默采集不到**。
 *
 * 因此本模块同时做两件事：
 *   1. 按平台选择正确的启动方式（Windows 走 `.cmd` + shell）；
 *   2. 把 spawn 失败原因**保留下来**，供调用方写进「未就绪」错误里 —— 让失败
 *      指名原因，而不是只留下一句无法定位的超时。
 *
 * 四处视觉脚本（visual / sidebar / scenes / capture-window-chrome）必须共用本模块；
 * `tests/parity/verify-visual-golden.mjs` 锁「不得再出现裸 spawn('npx')」。
 */
import { spawn } from 'node:child_process';

export const isWindows = process.platform === 'win32';

/**
 * 启动 vite dev server。
 *
 * @param {{ cwd: string, port: number }} options
 * @returns {{ child: import('node:child_process').ChildProcess, spawnError: () => Error | null, stop: () => void }}
 */
export function startViteDevServer({ cwd, port }) {
  const child = spawn(
    isWindows ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(port), '--strictPort'],
    {
      cwd,
      stdio: 'ignore',
      detached: false,
      // Windows：`.cmd` 必须经 shell 解析；其余平台保持直接 spawn（避免 shell 注入面）。
      shell: isWindows,
    },
  );
  let spawnError = null;
  // 没有这个监听器时，spawn 失败只会以 'error' 事件静默丢弃（无人监听 → 进程内无人知晓）。
  child.on('error', (error) => { spawnError = error; });
  return {
    child,
    /** 启动失败原因（未失败为 null） */
    spawnError: () => spawnError,
    stop: () => {
      try { child.kill(); } catch { /* 已退出 */ }
    },
  };
}

/**
 * 生成「dev server 未就绪」错误，并把 spawn 失败原因带上。
 * 调用方用法：`throw new Error('vite dev server 未就绪' + describeSpawnFailure(server))`
 */
export function describeSpawnFailure(handle) {
  const error = handle.spawnError();
  if (error === null) return '';
  return `（vite 启动失败：${error.code ?? 'UNKNOWN'} ${error.message}）`;
}
