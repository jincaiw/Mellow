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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const isWindows = process.platform === 'win32';

/**
 * 探针启动前**重建编辑器 bundle**（2026-11-08，审计「六」17 实测发现）。
 *
 * 事故：直接 `npx vite` 会加载 `apps/desktop/public/editor/` 下**上一次构建**的
 * `engine-v<版本>/`。该目录是 gitignore 的生成产物 —— 改了 `packages/editor-engine/src`
 * 却只跑探针时，探针**还在测旧引擎**：本轮 Enter 键位明明已实装，探针却报
 * `got="abc\n"`，差点被当成实现缺陷去「修」。这与 §4.45（dist 陈旧静默进包）同族，
 * 区别是这一层发生在**验证工具**里 —— 假阴性比假阳性更贵（会改写正确代码）。
 *
 * `apps/desktop` 的 `dev`/`build` 脚本本来就先跑本脚本；探针绕过了 package script，
 * 故在启动器这一层补上。`build-editor-bundle.mjs` 自带 dist 新鲜度硬闸门
 * （`assertPkgDistFresh`），故 dist 陈旧时这里会**响亮失败**并指名原因，
 * 而不是静默沿用旧产物。
 *
 * 仅在 `cwd` 确实是 desktop 目录（存在该脚本）时执行，其余调用方行为不变。
 * ⚠️ 并发跑多个探针会争用同一 `public/editor`（CI 与本地均为串行，暂不处理）。
 */
function prebuildEditorBundle(cwd) {
  const script = resolve(cwd, 'scripts/build-editor-bundle.mjs');
  if (!existsSync(script)) return;
  try {
    execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' });
  } catch (error) {
    const stderr = error?.stderr === undefined ? '' : String(error.stderr).trim();
    throw new Error(
      '编辑器 bundle 预构建失败 —— 探针会加载 public/editor 下**陈旧**的引擎，'
      + '结果不可信（先 `pnpm --filter @mellow/editor-engine build`）：'
      + (stderr || error?.message || '未知错误'),
    );
  }
}

/**
 * 端口占用预检（2026-11-08，审计「六」18）。
 *
 * 事故：探针进程被 **SIGKILL**（含我的临时巡检脚本 180s 超时强杀）时，`finally`
 * 不执行，它启动的 vite 直接变成孤儿并长期占着固定端口。此后同一端口的探针：
 *   · 新 vite 因 `--strictPort` **绑定失败并立刻退出**；
 *   · 而探针的 `waitForServer()` 只看「端口上有没有人应答」——
 *     **静默连上那台陌生服务器**继续跑。
 * 结果看起来是「探针失败/通过」，实际测的是别的进程、别的代码状态。
 * 这与 §4.45（陈旧 dist 静默进包）、本文件顶部「静默采集不到」同族：
 * 验证工具自己被污染却不说话。固定端口（1423-1470）一旦被占必须**响亮失败**。
 * @param {number} port
 */
function assertPortFree(port) {
  // 在子进程里试绑一次：占用 → exit 2；其他错误 → exit 3；空闲 → exit 0。
  // 给 2s 重试窗口，避免上一台服务器刚 stop() 尚未释放端口时误报。
  const probe = `
    const net = require('node:net');
    const deadline = Date.now() + 2000;
    const attempt = () => {
      const server = net.createServer();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && Date.now() < deadline) { setTimeout(attempt, 100); return; }
        process.exit(error.code === 'EADDRINUSE' ? 2 : 3);
      });
      server.listen(${JSON.stringify(port)}, '127.0.0.1', () => server.close(() => process.exit(0)));
    };
    attempt();
  `;
  // 子进程自身有 2s 重试窗口；这里的 15s 只是「进程都起不来」的兜底，
  // 避免机器高负载时把 node 冷启动慢误判成端口不可用。
  const result = spawnSync(process.execPath, ['-e', probe], { stdio: 'ignore', timeout: 15000 });
  if (result.status === 2) {
    throw new Error(
      `端口 ${port} 已被占用 —— 上一次探针可能被强杀、留下了 vite 孤儿进程。`
      + '拒绝连到陌生服务器上跑验证（那会把别的构建当成当前代码）：'
      + (isWindows
        ? `先 netstat -ano | findstr :${port}，再 taskkill /T /F /PID <pid>。`
        : `先 lsof -ti tcp:${port} | xargs kill。`),
    );
  }
  if (result.status !== 0) {
    throw new Error(`端口 ${port} 预检失败（exit=${result.status}）—— 无法确认探针会连到自己的 dev server。`);
  }
}

/**
 * 结束 dev server 的**整个进程树**（2026-11-09，审计 §4.384）。
 *
 * 事故：v1.5.35 的 tag 轮 Runtime Qualification（run 42538759470）在
 * 「Visual golden (§9.3)」步骤打印 `Visual golden: 6 configs match baseline` 之后
 * **不再推进**，Windows / Linux 两个 job 各自挂到 45 分钟上限被 cancel；
 * 循环里的 `VISUAL_GOLDEN visual-golden: OK` 从未出现。
 *
 * 根因：本文件在 2026-11-08 把子进程 stderr 从 `'ignore'` 改成 `'pipe'`（为了启动失败
 * 时能**指名**原因），但 `stop()` 只对**直接子进程**（`npm exec` 壳）发信号。真正的
 * `node …/vite.js` 与 `esbuild --service` 是它的**子孙**：壳死后它们仍然存活，并且
 * **继承了 stderr 管道的写端**。读端在探针进程里 ⇒ 子孙不关写端，管道就永不 EOF
 * ⇒ Node 事件循环永远非空 ⇒ 脚本**打印完成功行却不退出**。
 * （最小复现：父进程被杀、孙进程 `stdio: 'inherit'` 存活 → 探针 10 s 仍活；
 *  加 `stderr.destroy()` 后立即退出。）
 *
 * 修法：① 按平台杀掉整棵进程树（Windows `taskkill /T`，POSIX 沿 ppid 链找子孙）；
 * ② 无论树是否杀干净，`stop()` 都销毁 stderr 读端 —— 这一条直接消灭挂死机制，
 * 也防止未来某个平台的壳再次吞掉信号时重演。
 */
function listDescendants(pid) {
  const out = spawnSync('ps', ['-e', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  if (out.status !== 0 || typeof out.stdout !== 'string') return [];
  const children = new Map();
  for (const line of out.stdout.split('\n')) {
    const [childPid, parentPid] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(childPid) || !Number.isInteger(parentPid)) continue;
    if (!children.has(parentPid)) children.set(parentPid, []);
    children.get(parentPid).push(childPid);
  }
  const result = [];
  const stack = [...(children.get(pid) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    result.push(current);
    stack.push(...(children.get(current) ?? []));
  }
  return result;
}

function killTree(child) {
  if (child.pid === undefined) return;
  if (isWindows) {
    // /T = 连同子孙；/F = 强制（node / esbuild 不响应温和信号）
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  for (const pid of listDescendants(child.pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* 已退出 */ }
  }
  try { child.kill('SIGTERM'); } catch { /* 已退出 */ }
}

/**
 * 启动 vite dev server。
 *
 * @param {{ cwd: string, port: number }} options
 * @returns {{ child: import('node:child_process').ChildProcess, spawnError: () => Error | null, stderrTail: () => string, stop: () => void }}
 */
export function startViteDevServer({ cwd, port }) {
  // 先判端口：被占时**立即**失败，不让调用方白等一次 bundle 预构建。
  assertPortFree(port);
  prebuildEditorBundle(cwd);
  const child = spawn(
    isWindows ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(port), '--strictPort'],
    {
      cwd,
      // stderr 保留最后若干行：启动失败时要能**指名**原因（端口冲突、配置错误等），
      // 而不是只剩一句「未就绪」。
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
      // Windows：`.cmd` 必须经 shell 解析；其余平台保持直接 spawn（避免 shell 注入面）。
      shell: isWindows,
    },
  );
  let spawnError = null;
  const stderrLines = [];
  child.stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      stderrLines.push(trimmed);
      if (stderrLines.length > 20) stderrLines.shift();
    }
  });
  // 没有这个监听器时，spawn 失败只会以 'error' 事件静默丢弃（无人监听 → 进程内无人知晓）。
  child.on('error', (error) => { spawnError = error; });
  return {
    child,
    /** 启动失败原因（未失败为 null） */
    spawnError: () => spawnError,
    /** vite 最近写出的 stderr（用于未就绪错误里指名原因） */
    stderrTail: () => stderrLines.join(' | '),
    stop: () => {
      killTree(child);
      // ② **必须**销毁 stderr 读端（见 killTree 上方事故说明）。
      //    只要还有某个子孙活着并持有这个管道的写端，本进程的事件循环就不会排空 —
      //    脚本已经打印成功行，却永远不退出，CI 里表现为「步骤挂到 job 超时上限」。
      try { child.stderr?.destroy(); } catch { /* 已销毁 */ }
    },
  };
}

/**
 * 生成「dev server 未就绪」错误，并把 spawn 失败原因带上。
 * 调用方用法：`throw new Error('vite dev server 未就绪' + describeSpawnFailure(server))`
 */
export function describeSpawnFailure(handle) {
  const error = handle.spawnError();
  if (error !== null) return `（vite 启动失败：${error.code ?? 'UNKNOWN'} ${error.message}）`;
  // 子进程已退出（如 --strictPort 绑定失败）时，spawn 的 'error' 事件**不会**触发，
  // 只有退出码与 stderr 能说明原因 —— 否则调用方仍只看到一句无法定位的超时。
  const exitCode = handle.child?.exitCode;
  if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
    const tail = handle.stderrTail?.() ?? '';
    return `（vite 已退出 exit=${exitCode}${tail === '' ? '' : `：${tail}`}）`;
  }
  return '';
}
