#!/usr/bin/env node
/**
 * run-benchmark — Mellow Performance Benchmark 主 runner（performance-benchmark-spec §7）。
 *
 * 用法：
 *   node run-benchmark.mjs --app both --all
 *   node run-benchmark.mjs --app typora --fixtures 1MB.md --metrics open,typing --runs 3
 *   node run-benchmark.mjs --app mellow --metrics startup
 *
 * 输出：results/<ts>-<app>.json（原始数据）+ reports/<ts>-mellow-vs-typora.md（汇总）
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execSync } from 'node:child_process';
import {
  BENCH_DIR, HELPER, FIXTURES_DIR, RESULTS_DIR,
  helper, killApp, launch, waitWindow, waitForPid,
  sampleRss, stats, sleep, fileMtimeMs, touchOld, checkPerms, inputSourceIsEnglish, currentInputSource,
} from './perf-common.mjs';

// ---------- 参数 ----------
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

const APPS = {
  typora: {
    name: 'Typora',
    bin: argVal('--typora', '/Applications/Typora.app/Contents/MacOS/Typora'),
    killPattern: 'Typora',
    // 忽略 macOS window restoration：否则 Typora 恢复上次全部标签（多文档污染单文档测量）
    launchArgs: ['-ApplePersistenceIgnoreState', 'YES'],
    // 原生 app：光标默认在文档末尾，需要合成点击把焦点放到 ROI 顶部区域。
    probeArgs: [],
    /** hot-open 用：.app 包路径（`open -a` 需要包身份，裸二进制收不到 odoc 事件） */
    bundle: '/Applications/Typora.app',
    /** hot-open 用：pgrep 进程名 */
    pidPattern: 'Typora',
    prep() {
      run('defaults', ['write', 'abnerworks.Typora', 'SUEnableAutomaticChecks', '-bool', 'NO']);
      run('defaults', ['write', 'abnerworks.Typora', 'NSQuitAlwaysKeepsWindows', '-bool', 'NO']);
    },
  },
  mellow: {
    name: 'Mellow',
    bin: argVal('--mellow', join(BENCH_DIR, '..', '..', 'apps', 'desktop', 'src-tauri', 'target', 'release', 'mellow-desktop')),
    killPattern: 'mellow-desktop',
    // 必须传 --no-click（2026-09-23 定位）：合成点击会破坏 WKWebView 的 TextInput
    // 焦点协议 → 随后的 CGEvent 按键全部丢失，探针实测 detectMaxDiff=0 且
    // frontmostPid == expectPid（前台正确、窗口正确，就是收不到输入）。
    // 这正是台账里「探针成功率随 app/fixture 大幅漂移」的根因 —— 它与文件尺寸
    // 无关，只与「这次点击有没有踩坏焦点」有关，所以表现为间歇性（本轮 1/3）。
    // WebView 启动后自动持有焦点，无需点击。golden-journeys.mjs 早有同款处理。
    probeArgs: ['--no-click'],
    /** hot-open 用：.app 包路径（`open -a` 需要包身份，裸二进制收不到 odoc 事件） */
    bundle: join(BENCH_DIR, '..', '..', 'apps', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Mellow.app'),
    /** hot-open 用：pgrep 进程名 */
    pidPattern: 'mellow-desktop',
    prep() {
      // 会话状态（localStorage）与恢复快照必须每次清空，保证「同一起点」。
      //
      // 但**不能**整包删除 `~/Library/WebKit/com.mellow.editor`：那会连带清掉
      // WKWebView 的资源缓存与已编译脚本，把「用户一生只付一次的首次启动成本」
      // 摊到每一次测量上 —— 而 Typora 侧并未被同等对待（其 prep 只写两个 defaults，
      // 保留热 profile）。这是**不对称的测量偏差**，会让 Mellow 被系统性低估。
      // 实测证据：同一二进制冷启动 min 314.5ms / max 5530.0ms（N=3），方差即来源于此；
      // 最小值 314.5ms 远快于 Typora 的 1021.2ms，说明 Mellow 本身启动并不慢。
      const wk = `${process.env.HOME}/Library/WebKit/com.mellow.editor`;
      run('rm', ['-rf', `${wk}/WebsiteData/LocalStorage`]);
      run('rm', ['-rf', `${wk}/LocalStorage`]);
      run('rm', ['-rf', `${process.env.HOME}/Library/Application Support/com.mellow.editor/recovery*`]);
      run('rm', ['-rf', `${process.env.HOME}/Library/Application Support/com.mellow.editor/settings.json`]);
    },
  },
};

function run(cmd, argv) {
  spawnSync(cmd, argv, { stdio: 'ignore' });
}
function stopLaunchedApp(launched) {
  // 仅终止本 runner spawn 的子进程。macOS bundle 进程显示名可能与可执行文件
  // 不同，按名字 pkill 既可能漏掉旧实例，也不应影响用户正在使用的实例。
  if (!launched?.proc || launched.proc.killed) return;
  try { launched.proc.kill('SIGTERM'); } catch { /* 已退出 */ }
  const isGoneOrZombie = () => {
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(launched.pid)], { encoding: 'utf8' }).stdout.trim();
    return state === '' || state.startsWith('Z');
  };
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (isGoneOrZombie()) return;
    sleep(100);
  }
  // Tauri bundle 在 macOS 上可能忽略 SIGTERM（单实例运行循环仍存活）。该 PID
  // 由本 runner spawn，升级 SIGKILL 不会影响用户进程；必须清场才能测独立文档。
  try { process.kill(launched.pid, 'SIGKILL'); } catch { return; }
  const killDeadline = Date.now() + 1000;
  while (Date.now() < killDeadline) {
    if (isGoneOrZombie()) return;
    sleep(50);
  }
  throw new Error(`测试子进程 ${launched.pid} 未能退出`);
}
function focusAndTypeMellow(pid, text) {
  if (!/^[A-Za-z0-9]$/.test(text)) throw new Error('仅支持单个 ASCII 字母或数字');
  // Accessibility 的窗口坐标与 ScreenCaptureKit/CGWindow 的坐标系在 Retina、
  // 多显示器下不一定相同。Golden Journey 用 AX 坐标已验证，保存基准必须复用。
  const boundsResult = spawnSync('osascript', [
    '-e', `tell application "System Events" to tell (first process whose unix id is ${pid}) to get {position, size} of window 1`,
  ], { encoding: 'utf8', timeout: 15000 });
  if (boundsResult.status !== 0) throw new Error(boundsResult.stderr || '无法读取 Mellow 窗口坐标');
  const match = boundsResult.stdout.trim().match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error('无法解析 Mellow 窗口坐标');
  const x = Math.round(Number(match[1]) + Number(match[3]) * 0.5);
  const y = Math.round(Number(match[2]) + Number(match[4]) * 0.55);
  const result = spawnSync('osascript', [
    '-e', `tell application "System Events"
      set frontmost of (first process whose unix id is ${pid}) to true
      delay 0.2
      click at {${x}, ${y}}
      delay 0.2
      key code 124
      keystroke "${text}"
    end tell`,
  ], { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(result.stderr || 'System Events 输入失败');
}

const FIXTURES = ['1MB.md', '5MB.md', '10MB.md', '100k-lines.md', 'large-table.md', '100-mermaid.md', '1000-images.md'];
const ALL_METRICS = ['startup', 'open', 'hotopen', 'typing', 'scroll', 'search', 'save', 'memory'];
// PRD V1.2 FINAL 与 AGENTS.md 冻结的唯一性能/体验对标版本。
// 非该版本的运行仍可用于历史观察，但不可作为当前 P0 判定证据。
const TYPORA_NORMATIVE_VERSION = '1.14.9';
// Typora 的**渲染上限**（2026-09-23 一级取证）。
//
// `TypeMark/appsrc/window/frame.js` 中：
//   tryEnterOversize: function(e,t,n){ return (!File.isMac||File.bundle.filePath)
//     && (a.bindOversizePlaceholder(), t || e.length > File.MAX_FILE_SIZE)
//       ? (File.doEnterOversize(n), "") : (File.exitOversize(), e) }
// 且同文件内 `MAX_FILE_SIZE: 2e6`。
// 即：**文档内容超过 2,000,000 字符时 Typora 完全不渲染**，只显示
// 「The file is too large to render in Typora.」（zh-Hans: 「该文件过大，因此无法在 Typora 中呈现」）
// 提示页 + 一个 QuickLook 按钮。
//
// 实测边界（本机 1.14.9 build 7785，整窗截图字节数判别）：
//   1,900,000 字符 → 正常渲染（截图 270,186 B）
//   2,100,000 字符 → oversize 提示页（截图 36,417 B）
//   1MB.md(1,048,576) 正常；5MB.md / 10MB.md / 100k-lines.md(5,485,326) 全部为提示页
//
// 后果（必须写进报告，否则主动误导）：对超过该阈值的夹具，**Typora 侧不存在可比读数**。
// 台账原结论「10MB open 2.59× 于 Typora」里的 Typora 侧数字，实际测的是
// 「Typora 显示『文件过大』提示页的耗时」，与「打开并编辑 10MB 文档」不是同一件事。
// 故所有跨应用比值必须经 ratioOrNA() 判定基线有效性，禁止直接相除。
const TYPORA_MAX_FILE_SIZE = 2_000_000;
/** 该夹具是否在 Typora 的渲染上限之内（超出 → Typora 侧无有效基线） */
function baselineRendersFixture(fixture) {
  try { return statSync(join(FIXTURES_DIR, fixture)).size <= TYPORA_MAX_FILE_SIZE; } catch { return false; }
}
/**
 * 跨应用比值。基线不渲染该夹具时返回 `n/a（Typora 拒渲染）`，
 * 而不是把「提示页耗时」当成「打开耗时」参与相除。
 */
function ratioOrNA(mellowValue, typoraValue, fixture) {
  if (!baselineRendersFixture(fixture)) return 'n/a（Typora 拒渲染）';
  if (!mellowValue || !typoraValue) return '—';
  return (mellowValue / typoraValue).toFixed(2);
}
/** 表格单元格：基线不渲染该夹具时标注，避免读者把空值读成 0 或「很快」。 */
function cellOrRefused(value, fixture, fmtFn) {
  if (!baselineRendersFixture(fixture)) return '—（拒渲染）';
  return fmtFn(value);
}
// 保存测量永不直接写 fixture。独立副本也避免 touchOld 被宿主当作外部变更，
// 使性能口径保持为“正常打开 → 编辑 → 保存”。
const BENCHMARK_WORKDIR = mkdtempSync(join(tmpdir(), 'mellow-benchmark-'));

function parseList(s) { return s.split(',').map((x) => x.trim()).filter(Boolean); }
const round3 = (n) => Math.round(n * 1000) / 1000;

// ---------- ROI 表达方式（2026-09-23 修正）----------
// startup-probe 的 ROI 必须用「**将要捕获的那个窗口**的比例」表达，绝不可用
// waitWindow 返回的几何换算绝对像素。原因：waitWindow 走 CGWindowList，返回的是窗口
// 出现**瞬间**的过渡尺寸 —— 实测 Tauri 主窗出现时为 1178×786，最终 resize 到 960×963。
// 按过渡几何算出的 ROI 施加到最终窗口上会落到空白处：探针实测 detectMaxDiff=0，
// 失败截图整幅纯白（仅右上角一条工具条残影）。这就是台账里「探针成功率随 app/fixture
// 大幅漂移」的根因，与文件尺寸无关。
// helper 侧现由 resolveRoiForCapture 用「它即将捕获的那个窗口」的 frame 求 ROI，
// 两个来源合一。实测：改用比例后同一场景 10/10 成功（改前 6/10）。
const ROI_FRAC_TOP = ['--roi-frac', '0.2,0.06,0.6,0.10']; // 顶部 10% 高带（光标在文首）
const ROI_FRAC_TOP6 = ['--roi-frac', '0.2,0.06,0.6,0.06']; // 顶部 6% 高带（find bar）
const ROI_FRAC_FULL = ['--roi-frac', '0,0,1,1']; // 整窗（滚动帧统计）
// 合成按键类探针必须**在激活 app 之后**再断言输入源为键盘布局（2026-09-23）：
// macOS 会**按应用记忆**输入源 —— 实测 runner 启动时断言为 ABC，激活 Typora 后
// 变回「Pinyin – Simplified」。输入源是 IME 时按键会弹候选窗而非回显文本，
// 于是「首键回显」分量测的是候选窗出现的耗时（数字看似正常但不可用）。
const ENSURE_ASCII = ['--ensure-ascii'];
// hot-open 的「切换」判据：**帧对变化比例**，不是绝对点数（2026-09-25）。
//
// 为什么不能用绝对阈值：`pixelDiff` 的分母取自单一帧的几何，而 SCK 不保证流生命周期内
// 帧尺寸恒定（实测 changed=17372 > sampleCount=13824，数学上不可能）。
// 而校准阈值 `max(calibMax*3, 60)` 对 13824 个采样点只占 **0.4%** ——
// 工具条/滚动条/光标的偶发重绘即可触发；实测真实切换信号是 **5.3%–7.6%**，
// 即原阈值比真实信号低约 12 倍（症状：8–10MiB 的 switchMs 只有 21–33ms，
// 比 1MiB 的 108ms 还快，物理上不可能）。
// 3% 落在「噪声 0.4%」与「真实信号 5%+」之间，两侧各留约 2.5× 余量。
const HOT_OPEN_SWITCH_MIN_FRAC = '0.03';

// ---------- 版本信息 ----------
function gitInfo() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: BENCH_DIR, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: BENCH_DIR, encoding: 'utf8' }).split('\n').filter(Boolean).length > 0;
    return { hash, dirty };
  } catch { return { hash: 'unknown', dirty: null }; }
}
function typoraVersion(bin) {
  try {
    const out = execSync(`/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' '${bin.replace(/\/Contents\/MacOS\/.*/, '')}/Contents/Info.plist'`, { encoding: 'utf8' });
    return out.trim();
  } catch { return 'unknown'; }
}
function sysInfo() {
  const cpu = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
  const mem = Math.round(parseInt(execSync('sysctl -n hw.memsize', { encoding: 'utf8' }).trim(), 10) / 1024 / 1024 / 1024);
  const os = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
  const arch = execSync('uname -m', { encoding: 'utf8' }).trim();
  return { cpu, memGB: mem, os, arch };
}

// ---------- 单应用测量 ----------
async function measureApp(appKey, opts) {
  const app = APPS[appKey];
  const result = { app: app.name, metrics: {} };
  app.prep();

  const blank = join(FIXTURES_DIR, '_blank.md');
  if (!existsSync(blank)) writeFileSync(blank, '# Mellow Benchmark\n\nblank document\n');
  const launchApp = (file) => launch(app.bin, [...(app.launchArgs || []), ...(file ? [file] : [])]);

  // startup：无业务文件（blank）冷启动 → 窗口出现 → 首键回显
  if (opts.metrics.includes('startup')) {
    const vals = [];
    const loads = [];
    const winMs = [];
    const probeOk = [];
    const failureHints = [];
    for (let i = 0; i < opts.runs; i++) {
      killApp(app.killPattern);
      sleep(600);
      const { pid, t0Ms } = launchApp(blank);
      try {
        const win = waitWindow(pid, 30000);
        const probe = helper('startup-probe', '--pid', String(pid), ...ROI_FRAC_TOP, '--timeout', '8000', ...(app.probeArgs ?? []), ...ENSURE_ASCII);
        winMs.push(win.wallMs - t0Ms);
        probeOk.push(probe.ok === true);
        // 与 open 指标同一契约：探针失败 = 首键回显没测到 → 记 null（无效），
        // 不得用「窗口出现」冒充（JS 的 number + null 会静默退化，见 open 处注释）。
        if (probe.ok === true) {
          // 与 open 指标同一契约（2026-09-22）：不含 loadMs（waitStable 的 600ms 地板）。
          vals.push((win.wallMs - t0Ms) + probe.latencyMs);
        } else {
          vals.push(null);
        }
        loads.push(probe.ok ? probe.loadMs : null);
        // 失败样本保留探针自报的失败形态（与 open 指标同一契约）。
        if (probe.ok !== true) {
          failureHints.push(
            `${probe.hint ?? probe.error ?? 'unknown'}`
            + `（detectMaxDiff=${probe.detectMaxDiff ?? '?'} threshold=${probe.threshold ?? '?'}`
            + ` calibMaxDiff=${probe.calibMaxDiff ?? '?'} frontmostPid=${probe.frontmostPid ?? '?'} expectPid=${probe.expectPid ?? '?'}）`,
          );
        }
      } catch (e) {
        winMs.push(null);
        probeOk.push(false);
        vals.push(null);
        loads.push(null);
        console.warn(`[${app.name}] startup run ${i + 1} failed: ${e.message}`);
      }
      killApp(app.killPattern);
    }
    const probeFailures = probeOk.filter((ok) => !ok).length;
    result.metrics.startup = {
      samples: vals,
      stats: stats(vals),
      loadMs: stats(loads),
      samplesWinMs: winMs,
      samplesLoadMs: loads.slice(),
      samplesProbeOk: probeOk.slice(),
      // 与 open 指标同一诊断契约（2026-09-22）：失败样本保留探针自报的失败形态。
      failureHints: failureHints.slice(),
      probeFailures,
      probeFailureRate: opts.runs > 0 ? round3(probeFailures / opts.runs) : null,
      validSamples: opts.runs - probeFailures,
    };
    if (probeFailures > 0) {
      console.warn(`⚠️ [${app.name}/startup] ${probeFailures}/${opts.runs} 个样本的 startup-probe 失败（首键回显未测到）→ 记 null 不计入中位数。`);
    }
  }

  // 各夹具指标
  for (const fixture of opts.fixtures) {
    const fpath = join(FIXTURES_DIR, fixture);
    if (!existsSync(fpath)) { console.warn(`跳过（夹具缺失）: ${fixture}`); continue; }
    const m = { fixture };
    console.log(`\n=== ${app.name} / ${fixture} ===`);

    // open-to-editable：N 次冷启动打开
    //
    // 预热轮（2026-09-22 补）：**首个 launch 必须丢弃**。
    // 立此轮的原因：`--app both --fixtures 1MB.md,10MB.md` 实测得到
    //   Typora 1MB median 1107.2ms / 10MB median 397.4ms
    // —— 10MB 比 1MB 快 2.8×，物理上不可能。说明首个 fixture 的首次启动吸收了
    // 一次性成本（二进制页缓存、字体/着色器缓存、WKWebView 资源编译等），
    // 后续测量实际测的是「缓存命中后的启动」，与文件尺寸无关。
    // 台账原结论「10MB 打开 2.59× 于 Typora」正是该假象的产物（同批数据里
    // Mellow 1MB 1289.2ms vs 10MB 1109.7ms 也呈「越大越快」，方向一致）。
    // 因此先跑一轮不计入统计的预热，保证所有被测量的启动都处于同一热状态。
    if (opts.metrics.includes('open')) {
      const warmup = opts.warmup ?? 1;
      const settle = opts.settle ?? 600;
      for (let i = 0; i < warmup; i++) {
        killApp(app.killPattern);
        sleep(settle);
        try {
          const w = launchApp(fpath);
          // 只为「等窗口出现」；其几何**不**参与 ROI（见 ROI_FRAC_TOP 注释）。
          waitWindow(w.pid, 30000);
          helper('startup-probe', '--pid', String(w.pid), ...ROI_FRAC_TOP, '--timeout', '8000', ...(app.probeArgs ?? []), ...ENSURE_ASCII);
        } catch (e) {
          console.warn(`[${app.name}/${fixture}] 预热 ${i + 1} 失败（不计入统计）: ${e.message}`);
        }
        killApp(app.killPattern);
      }
      if (warmup > 0) console.log(`[${app.name}/${fixture}] 预热 ${warmup} 轮完成（已丢弃）`);
      const opens = [];
      const probes = [];
      const loads = [];
      const winMs = [];
      const probeOk = [];
      const failureHints = [];
      for (let i = 0; i < opts.runs; i++) {
        killApp(app.killPattern);
        sleep(settle);
        const { pid, t0Ms } = launchApp(fpath);
        try {
          const win = waitWindow(pid, 30000);
          const probe = helper('startup-probe', '--pid', String(pid), ...ROI_FRAC_TOP, '--timeout', '8000', ...(app.probeArgs ?? []), ...ENSURE_ASCII);
          // 逐样本记录三个分量：只有分解才能判断双峰落在哪一段
          // （窗口出现 / 内容加载 / 首键回显），否则只能看到总量在跳。
          winMs.push(win.wallMs - t0Ms);
          probeOk.push(probe.ok === true);
          if (probe.ok === true) {
            // 指标定义（2026-09-22 修正）：open-to-editable = 窗口出现 + 首键回显。
            // **不含** probe.loadMs —— 它是 `waitStable(stableMs: 600)` 的返回值，
            // 而该循环要求 ROI「连续 600ms 无像素变化」才退出，结构上不可能早于
            // 600ms 返回（见 screen-timing.swift）。把它计入总量等于给每个样本
            // 加一个 ~600ms 常量，实测跨应用/跨尺寸取值带仅 603.8–629.8ms。
            // loadMs 仍单独落盘（settleWaitMs），供诊断与人工解读。
            opens.push((win.wallMs - t0Ms) + probe.latencyMs);
          } else {
            // ⚠️ 探针失败 = **首键回显没测到**，该样本不是 open-to-editable。
            // 旧实现写 `winMs + (ok ? … : null)`，而 JS 里 `number + null === number`，
            // 于是「窗口出现」被静默当成完整 open-to-editable 参与统计 —— 两种**不可比**的
            // 量混进同一个中位数，直接制造了「Typora 10MB 比 1MB 快 2.6×」这一物理不可能
            // 的反转（探针 0/5 成功 vs 5/5 成功）。现在失败样本记 null（无效），
            // 并在下面响亮报出失败率，绝不冒充有效读数。
            opens.push(null);
          }
          probes.push(probe.ok ? probe.latencyMs : null);
          loads.push(probe.ok ? probe.loadMs : null);
          // 失败样本保留探针自报的**失败形态**与关键实测值（2026-09-22）：
          // hint 区分「未收到帧 / 完全无变化（焦点问题）/ 有变化未跨阈值（校准问题）」，
          // 三者修法完全不同；不记下来就只能反复跑 runner 猜。
          if (probe.ok !== true) {
            failureHints.push(
              `${probe.hint ?? probe.error ?? 'unknown'}`
              + `（detectMaxDiff=${probe.detectMaxDiff ?? '?'} detectFrames=${probe.detectFrames ?? '?'} threshold=${probe.threshold ?? '?'}`
              + ` calibMaxDiff=${probe.calibMaxDiff ?? '?'} frontmostPid=${probe.frontmostPid ?? '?'} expectPid=${probe.expectPid ?? '?'}）`,
            );
          }
        } catch (e) {
          winMs.push(null);
          probeOk.push(false);
          opens.push(null);
          probes.push(null);
          loads.push(null);
          console.warn(`[${app.name}/${fixture}] open run ${i + 1} failed: ${e.message}`);
        }
        killApp(app.killPattern);
      }
      const probeFailures = probeOk.filter((ok) => !ok).length;
      m.openToEditable = {
        stats: stats(opens),
        samples: opens,
        probeLatency: stats(probes),
        loadMs: stats(loads),
        // 分量逐样本（诊断用；统计量看不出双峰）
        samplesWinMs: winMs,
        samplesLoadMs: loads.slice(),
        samplesLatencyMs: probes.slice(),
        samplesProbeOk: probeOk.slice(),
        failureHints: failureHints.slice(),
        probeFailures,
        probeFailureRate: opts.runs > 0 ? round3(probeFailures / opts.runs) : null,
        /** 有效样本数（探针成功的那些才是真正的 open-to-editable） */
        validSamples: opts.runs - probeFailures,
      };
      console.log(`open-to-editable: median=${m.openToEditable.stats.median?.toFixed(1)}ms p95=${m.openToEditable.stats.p95?.toFixed(1)}ms（有效样本 ${m.openToEditable.validSamples}/${opts.runs}）`);
      if (probeFailures > 0) {
        console.warn(`⚠️ [${app.name}/${fixture}] ${probeFailures}/${opts.runs} 个样本的 startup-probe 失败（首键回显未测到）→ 这些样本记 null 不计入中位数。失败率高说明该行数字不可用于「谁快谁慢」。`);
      }
      console.log(`  分量 winMs=${JSON.stringify(winMs.map((x) => (x === null ? null : Math.round(x))))}`);
      console.log(`       loadMs=${JSON.stringify(loads.map((x) => (x === null ? null : Math.round(x))))}`);
      console.log(`    latencyMs=${JSON.stringify(probes.map((x) => (x === null ? null : Math.round(x))))}`);
    }

    // 打开状态下测 typing / scroll / memory / search（每指标独立容错：单指标失败不拖垮整块）
    let pid = null;
    if (['typing', 'scroll', 'memory', 'search'].some((k) => opts.metrics.includes(k))) {
      killApp(app.killPattern);
      sleep(600);
      const l = launchApp(fpath);
      pid = l.pid;
      const mSafe = (key, fn) => {
        try { fn(); } catch (e) {
          m[key] = { error: e.message };
          console.warn(`[${app.name}/${fixture}] ${key} 失败: ${e.message}`);
        }
      };
      try {
        waitWindow(pid, 30000); // 只为等窗口出现；几何不参与 ROI

        mSafe('typing', () => {
          if (!opts.metrics.includes('typing')) return;
          const r = helper('keypress-latency', '--pid', String(pid), ...ROI_FRAC_TOP,
            '--key', '0', '--count', String(opts.keystrokes), '--interval', '200', '--timeout', '5000',
            ...(app.probeArgs ?? []), ...ENSURE_ASCII);
          const lats = r.latencies || [];
          m.typing = { stats: stats(lats), samples: lats, timeouts: lats.filter((x) => x < 0).length, calibMaxDiff: r.calibMaxDiff, threshold: r.threshold };
          console.log(`typing: p95=${m.typing.stats.p95?.toFixed(2)}ms median=${m.typing.stats.median?.toFixed(2)}ms timeouts=${m.typing.timeouts}`);
        });

        mSafe('scroll', () => {
          if (!opts.metrics.includes('scroll')) return;
          const r = helper('scroll-frames', '--pid', String(pid), ...ROI_FRAC_FULL,
            '--count', '40', '--delta', '-80', '--interval', '30', '--timeout', '15000');
          m.scroll = frameStats(r.frames || []);
          console.log(`scroll: p95Frame=${m.scroll.p95FrameMs?.toFixed(1)}ms fps=${m.scroll.fps?.toFixed(1)} dropped=${m.scroll.dropped}`);
        });

        mSafe('memory', () => {
          if (!opts.metrics.includes('memory')) return;
          sleep(1500); // 渲染稳定
          m.memory = sampleRss(pid, 5, 400);
          console.log(`memory: median=${m.memory.medianMB?.toFixed(0)}MB peak=${m.memory.peakMB?.toFixed(0)}MB`);
        });

        mSafe('search', () => {
          if (!opts.metrics.includes('search')) return;
          // Typora：Cmd+F → 键入查询 → find bar 首帧变化；Mellow：无 in-doc find（预期超时）
          sleep(2000); // SCK stream 释放冷却
          helper('post-combo', '--mods', 'cmd', '--key', '3', '--pid', String(pid)); // Cmd+F
          sleep(700);
          const r = helper('startup-probe', '--pid', String(pid), ...ROI_FRAC_TOP6, '--timeout', '5000', ...(app.probeArgs ?? []), ...ENSURE_ASCII);
          m.search = { ok: r.ok, latencyMs: r.ok ? r.latencyMs : null, note: r.ok ? null : 'ROI 无变化（find bar 未出现在预期 ROI）' };
          helper('post-combo', '--mods', '', '--key', '53', '--pid', String(pid)); // Esc 关闭 find bar
          console.log(`search: ${r.ok ? r.latencyMs + 'ms' : 'N/A (' + m.search.note + ')'}`);
        });

      } catch (e) {
        console.warn(`[${app.name}/${fixture}] 打开态基础失败: ${e.message}`);
        m.openStateFailed = true;
      } finally {
        killApp(app.killPattern);
      }
    }

    // save 必须使用单独的进程和窗口：此前任何性能指标均不应影响 WebView 首响应者。
    // touchOld 必须在 launch 前，否则 Typora 会把它当成外部改动并显示「重新加载」对话框。
    if (opts.metrics.includes('save')) {
      try {
        killApp(app.killPattern);
        sleep(600);
        const savePath = join(BENCHMARK_WORKDIR, `${appKey}-${fixture}`);
        copyFileSync(fpath, savePath);
        touchOld(savePath);
        const l = launchApp(savePath);
        try {
          waitWindow(l.pid, 30000);
          sleep(app.killPattern === 'Typora' ? 5000 : 10000);
          const beforeText = readFileSync(savePath, 'utf8');
          if (app.killPattern === 'Typora') {
            helper('post-combo', '--mods', '', '--key', '0', '--pid', String(l.pid));
          } else {
            focusAndTypeMellow(l.pid, 'a');
          }
          sleep(400);
          const afterInputText = readFileSync(savePath, 'utf8');
          const afterInputMtime = fileMtimeMs(savePath);
          const persistedBeforeExplicitSave = afterInputText !== beforeText;
          helper('post-combo', '--mods', 'cmd', '--key', '1', '--pid', String(l.pid));
          const t0 = Date.now();
          let changed = false;
          while (Date.now() - t0 < 10000) {
            const now = fileMtimeMs(savePath);
            if (now !== null && now !== afterInputMtime) { changed = true; break; }
            sleep(25);
          }
          const afterText = readFileSync(savePath, 'utf8');
          const sourceChanged = afterText !== beforeText;
          m.save = sourceChanged && (changed || persistedBeforeExplicitSave)
            ? { ms: changed ? Date.now() - t0 : null, note: persistedBeforeExplicitSave ? '输入已在显式 Cmd+S 前持久化' : null, sourceChanged: true, persistedBeforeExplicitSave }
            : {
              ms: null, sourceChanged, persistedBeforeExplicitSave,
              note: !sourceChanged
                ? '输入后 Markdown 源码未变化（输入焦点或编辑失败）'
                : !changed ? '10s 内 mtime 未变化' : 'mtime 已变化但 Markdown 源码未变化（输入焦点或编辑失败）',
            };
          console.log(`save: ${m.save.ms ?? 'FAIL'}ms`);
        } finally {
          stopLaunchedApp(l);
          if (app.killPattern === 'Typora') killApp(app.killPattern);
        }
      } catch (e) {
        m.save = { error: e.message };
        console.warn(`[${app.name}/${fixture}] save 失败: ${e.message}`);
      }
    }
    result.metrics[fixture] = m;
  }

  // ── hot-open：在**已运行的实例**内换文档（2026-09-23 新增）────────────────
  //
  // 与 `open` 的分工：`open` = 窗口出现 + 首键回显，含进程启动与 WebView 初始化，
  // 量的是「冷启动」；PRD 关心的「文档打开成本」是**同一实例内换文档**要多久。
  // 这也是 2026-09-22 文档列出的待办（「需要 hot-open 口径绕开启动态」）。
  //
  // 前置：必须以 **.app 包**启动 —— `open -a <app> <file>` 走 odoc Apple Event，
  // 依赖 LaunchServices 的包身份；裸二进制不会被路由（实测确认）。
  // 触发必须由 helper 自己发（见 lib/screen-timing.swift 的 cmdHotOpenProbe）：
  // runner 用 execFileSync 同步调 helper，若先触发再调，切换瞬间已被错过。
  if (opts.metrics.includes('hotopen')) {
    const usable = opts.fixtures.filter((f) => existsSync(join(FIXTURES_DIR, f)));
    if (!app.bundle || !existsSync(app.bundle) || usable.length < 2) {
      console.warn(`⚠️ [${app.name}/hotopen] 跳过：需要 ≥2 个夹具且 .app 包存在`
        + `（bundle=${app.bundle ?? '(未配置)'}，可用夹具=${usable.length}）`);
    } else {
      const total = [];
      const switches = [];
      const echoes = [];
      const settles = [];
      const probeOk = [];
      const hints = [];
      // 逐样本记录**目标夹具**：hot-open 每次投递的目标是交替的，
      // 把不同尺寸混进一个中位数会让读数失去意义（5MB 的切换成本 ≫ 1MB）。
      const targets = [];
      /** 逐样本的切换判据诊断：实测变化比例、以及基准帧与比较帧几何不一致的帧数 */
      const switchFracs = [];
      const dimMismatch = [];
      // 包陈旧告警（2026-09-23）：hot-open 必须走 .app，而 .app 是**构建产物**，
      // 很容易落后于 target/release 里的裸二进制（本机实测：.app 为 09-15 的 v1.5.9，
      // 而二进制是 09-22 构建）。不告警就会把「旧构建的性能」当成当前提交的读数 ——
      // 与本项目其它「静默加载旧产物」陷阱同类。
      let bundleStale = null;
      let bundleMtime = null;
      let binMtime = null;
      try {
        const bundleM = statSync(app.bundle).mtimeMs;
        const binM = statSync(app.bin).mtimeMs;
        bundleMtime = new Date(bundleM).toISOString();
        binMtime = new Date(binM).toISOString();
        bundleStale = bundleM < binM - 60_000;
        if (bundleStale) {
          console.warn(`⚠️ [${app.name}/hotopen] .app 包早于裸二进制（${bundleMtime} < ${binMtime}）`
            + ' → 本段读数来自**旧构建**，不可作为当前提交的结论。请重建包后再跑。');
        }
      } catch { /* 时间戳不可得则不阻断 */ }
      killApp(app.killPattern);
      sleep(800);
      try {
        // 以 .app 启动并打开第一个夹具（LaunchServices 注册包身份）
        execSync(`open -a ${JSON.stringify(app.bundle)} ${JSON.stringify(join(FIXTURES_DIR, usable[0]))}`);
        const pid = waitForPid(app.pidPattern, 20000);
        waitWindow(pid, 30000);
        sleep(3000); // 首篇文档渲染完成，基准帧才有意义
        for (let i = 0; i < opts.runs; i++) {
          // 目标文档与当前文档必须不同，否则「切换」无变化可言 → 交替投递
          const target = join(FIXTURES_DIR, usable[(i + 1) % usable.length]);
          const p = helper('hot-open-probe', '--pid', String(pid),
            '--open-app', app.bundle, '--open-file', target,
            '--switch-min-frac', HOT_OPEN_SWITCH_MIN_FRAC,
            ...ROI_FRAC_TOP, '--timeout', '8000', ...(app.probeArgs ?? []), ...ENSURE_ASCII);
          probeOk.push(p.ok === true);
          targets.push(usable[(i + 1) % usable.length]);
          switchFracs.push(p.switchDetectMaxFrac ?? null);
          dimMismatch.push(p.switchDimMismatchFrames ?? null);
          switches.push(p.ok ? p.switchMs : null);
          echoes.push(p.ok ? p.echoMs : null);
          settles.push(p.ok ? p.settleMs : null);
          total.push(p.ok ? p.totalMs : null);
          if (p.ok !== true) {
            hints.push(`${p.hint ?? 'unknown'}（openSpawned=${p.openSpawned} switchDiff=${p.switchDetectMaxDiff} echoDiff=${p.echoDetectMaxDiff}）`);
          }
          sleep(1500); // 让下一次投递前画面稳定
        }
      } catch (e) {
        console.warn(`[${app.name}/hotopen] 失败: ${e.message}`);
      }
      killApp(app.killPattern);
      const failures = probeOk.filter((ok) => !ok).length;
      result.metrics.hotOpen = {
        stats: stats(total),
        samples: total,
        samplesSwitchMs: switches,
        samplesEchoMs: echoes,
        samplesSettleMs: settles,
        samplesProbeOk: probeOk.slice(),
        samplesTarget: targets.slice(),
        samplesSwitchFrac: switchFracs.slice(),
        samplesDimMismatchFrames: dimMismatch.slice(),
        switchMinFrac: Number(HOT_OPEN_SWITCH_MIN_FRAC),
        failureHints: hints.slice(),
        probeFailures: failures,
        validSamples: opts.runs - failures,
        /** .app 包是否早于裸二进制（true = 本段读数来自旧构建） */
        bundleStale,
        bundleMtime,
        binMtime,
        /** 该口径**不含** waitStable 的 600ms 地板（与 open 同契约），地板另存 samplesSettleMs */
        note: 'hot-open-to-editable = switchMs + echoMs；settleMs 为 waitStable 地板，不计入',
      };
      console.log(`hot-open: median=${result.metrics.hotOpen.stats.median?.toFixed(1)}ms（有效样本 ${result.metrics.hotOpen.validSamples}/${opts.runs}）`);
      if (failures > 0) {
        console.warn(`⚠️ [${app.name}/hotopen] ${failures}/${opts.runs} 个样本失败 → 记 null 不计入中位数。`);
        for (const h of hints) console.warn(`    ${h}`);
      }
    }
  }

  // save 测试会向夹具写入字符（post 'a' + Cmd+S）：重新生成夹具恢复原始状态
  // （generate-fixtures.mjs 确定性 seed，幂等）
  //
  // 容错（2026-09-22）：夹具重建失败**不得**丢掉整批已测数据 —— 原先 execSync 直接
  // 抛出会让 measureApp 中止，于是 results/<ts>-<app>.json 永不落盘，
  // 「Typora 两个 fixture 已测完、Mellow 一个都没跑」这种半成品状态连原始数据都没留下。
  // 改为警告并继续（夹具在每次运行前由调用方保证，且本步只影响「写回原状」）。
  try {
    execSync(`${process.execPath} generate-fixtures.mjs`, { cwd: BENCH_DIR, stdio: 'ignore' });
  } catch (e) {
    console.warn(`[${app.name}] 夹具重建失败（不影响本轮已测数据）: ${e.message.split('\n')[0]}`);
  }
  return result;
}

function frameStats(frames) {
  if (frames.length < 3) return { n: frames.length, note: '帧不足' };
  const intervals = [];
  for (let i = 1; i < frames.length; i++) intervals.push(frames[i] - frames[i - 1]);
  const s = stats(intervals.filter((d) => d > 0 && d < 500));
  const duration = frames[frames.length - 1] - frames[0];
  const fps = duration > 0 ? ((frames.length - 1) / duration) * 1000 : 0;
  const dropped = intervals.filter((d) => d > 33.4).length;
  return { n: frames.length, p95FrameMs: s.p95, medianFrameMs: s.median, maxFrameMs: s.max, fps, dropped };
}

// ---------- 报告 ----------
function renderReport(env, results, opts) {
  const L = [];
  L.push('# Mellow vs Typora Performance Benchmark');
  L.push('');
  L.push(`- 日期：${env.date}`);
  L.push(`- 机器：${env.sys.cpu} / ${env.sys.memGB}GB / ${env.sys.os} (${env.sys.arch})`);
  L.push(`- Mellow commit：\`${env.git.hash}\`${env.git.dirty ? '（工作区有未提交改动）' : ''}`);
  L.push(`- Mellow 构建：release（cargo build --release）`);
  const typoraEvidence = env.typoraVersion === TYPORA_NORMATIVE_VERSION
    ? `规范验收基线 ${TYPORA_NORMATIVE_VERSION} ✓`
    : `当前规范验收基线 ${TYPORA_NORMATIVE_VERSION}；此版本仅作历史/观察数据，不能用于 P0 对标`;
  L.push(`- Typora 版本：${env.typoraVersion}（${typoraEvidence}）`);
  L.push(`- 输入法：${env.inputSource ? 'ABC（英文）✓' : '非英文（typing 结果可能受 IME 影响）'}`);
  L.push(`- 权限：Accessibility ${env.perms.accessibility ? '✓' : '✗'} / Screen Recording ${env.perms.screenRecording ? '✓' : '✗'}`);
  L.push(`- 重复次数：open/startup N=${opts.runs}（另有 ${opts.warmup ?? 0} 轮预热，已丢弃不计入统计），typing ${opts.keystrokes} 键/次`);
  L.push('');
  L.push('## 测量口径');
  L.push('- **startup**：冷启动（`_blank.md`）→ 窗口出现 → 首个合成按键屏幕回显，总耗时；');
  L.push('- **open-to-editable**：冷启动带夹具文件 → 窗口出现 → 首键回显，总耗时；PRD 目标（1MB ≤250ms / 10MB ≤1.0–1.5s）为「热打开」口径，冷启动口径通常更高，判定仅供参考；');
  L.push('- **typing P95**：按键→屏幕回显 P95；PRD 普通 <16ms / Large <32ms；');
  L.push('- **scroll**：合成滚动期间帧间隔 P95 / 平均 fps / 掉帧（>33.4ms 间隔）数；');
  L.push('- **save**：Cmd+S → mtime 变化耗时；');
  L.push('- **memory**：主进程 RSS（打开后采样中位数/峰值）；');
  L.push('- **search**：Cmd+F → 键入 → find bar 首帧变化；Mellow 文档内查找（@codemirror/search）已实现。');
  L.push('');

  const R = (res) => res.app;

  // startup
  L.push('## 1. startup（blank 冷启动 → 可编辑，ms）');
  L.push('');
  L.push('| app | median | p95 | min | max | n |');
  L.push('|---|---|---|---|---|---|');
  for (const res of results) {
    const s = res.metrics.startup?.stats;
    L.push(`| ${R(res)} | ${fmt(s?.median)} | ${fmt(s?.p95)} | ${fmt(s?.min)} | ${fmt(s?.max)} | ${s?.n ?? 0} |`);
  }
  L.push('');
  L.push('PRD 目标：P95 ≤ 1.2s to editable。');
  L.push('');

  // open-to-editable per fixture
  L.push('## 2. open-to-editable（ms）');
  L.push('');
  // 基线有效性提示（2026-09-23）：Typora 不渲染 >2MB 的文档，此时其数字是
  // 「提示页耗时」，不得与 Mellow 的真实打开耗时相比。
  {
    const refused = opts.fixtures.filter((f) => !baselineRendersFixture(f));
    if (refused.length > 0) {
      L.push(`⚠️ **基线不适用**：${refused.join('、')} 超过 Typora 的渲染上限`);
      L.push(`（\`MAX_FILE_SIZE = ${TYPORA_MAX_FILE_SIZE}\` 字符，见 \`frame.js\` 的 \`tryEnterOversize\`），`);
      L.push('Typora 对它们只显示「文件过大」提示页、不渲染也不可编辑 → 该行 Typora 列与 ratio **无意义**，已标注。');
      L.push('');
    }
  }
  L.push('| fixture | Mellow median | Mellow p95 | Typora median | Typora p95 | ratio med (M/T) | PRD 目标（热打开口径，参考） |');
  L.push('|---|---|---|---|---|---|---|');
  const targetMap = { '1MB.md': '≤250ms', '10MB.md': '1.0–1.5s', '5MB.md': '参考', '100k-lines.md': '参考', 'large-table.md': '参考', '100-mermaid.md': '参考', '1000-images.md': '参考' };
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.openToEditable?.stats; };
    const mt = g('Mellow'); const tt = g('Typora');
    const ratio = ratioOrNA(mt?.median, tt?.median, f);
    L.push(`| ${f} | ${fmt(mt?.median)} | ${fmt(mt?.p95)} | ${cellOrRefused(tt?.median, f, fmt)} | ${cellOrRefused(tt?.p95, f, fmt)} | ${ratio} | ${targetMap[f] ?? ''} |`);
  }
  L.push('');

  // ── 有效样本 / 探针失败率（2026-09-22）────────────────────────────────────
  // 立此节的必要性：`open` 的绝对值只有在 startup-probe 成功时才是
  // 「open-to-editable」；失败样本已改记为 null（不再用「窗口出现」冒充）。
  // 但若失败率高，两侧的有效样本数不同 → 中位数仍不可比。必须显式列出，
  // 否则读者会拿「N=5」与「N=0」两个数字直接相减（实测正是这样产生了
  // 「Typora 10MB 比 1MB 快 2.6×」的假象）。
  {
    const rows = [];
    for (const f of opts.fixtures) {
      for (const appName of ['Mellow', 'Typora']) {
        const r = results.find((x) => x.app === appName);
        const o = r?.metrics[f]?.openToEditable;
        if (!o) continue;
        rows.push(`| ${appName} | ${f} | ${o.validSamples ?? '—'} / ${opts.runs} | ${o.probeFailures ?? '—'} | ${fmt(o.stats?.median)} | ${fmt(o.samplesWinMs ? o.samplesWinMs.filter((x) => x !== null).reduce((a, b) => a + b, 0) / Math.max(1, o.samplesWinMs.filter((x) => x !== null).length) : null)} |`);
      }
    }
    if (rows.length > 0) {
      L.push('### 2c. 有效样本与探针失败率（open 指标的可比性前提）');
      L.push('');
      L.push('`startup-probe` 失败时该样本**不是** open-to-editable（首键回显未测到），已记为 null。');
      L.push('失败率高的行，其中位数不可用于「谁快谁慢」。');
      L.push('');
      L.push('| app | fixture | 有效样本 | 探针失败 | 有效中位数 | 平均窗口出现 |');
      L.push('|---|---|---|---|---|---|');
      L.push(...rows);
      L.push('');
    }
  }

  // ── §2d hot-open（同一实例内换文档）──────────────────────────────────────
  // 与 §2 的分工：§2 的 `open` 含进程启动与 WebView 初始化（冷启动）；
  // hot-open 绕开它们，量的是「文档打开成本」本身（2026-09-22 文档列出的待办）。
  {
    const rows = results.filter((r) => r.metrics?.hotOpen).map((r) => ({ app: R(r), h: r.metrics.hotOpen }));
    if (rows.length > 0) {
      L.push('### 2d. hot-open（同一实例内换文档，2026-09-23 新增）');
      L.push('');
      L.push('绕开进程启动与 WebView 初始化，量「文档打开成本」本身：');
      L.push('`hot-open-to-editable = switchMs（触发 open → 画面首次变化）+ echoMs（首键 → 回显）`；');
      L.push('`settleMs` 是 `waitStable` 的 600ms 地板，**不计入**指标（与 §2 的 open 同契约）。');
      L.push('前置：以 `.app` 包启动（`open -a` 依赖 LaunchServices 包身份）；');
      L.push('输入源必须是键盘布局（`--ensure-ascii` 在激活后重新断言，IME 会拦按键）。');
      L.push('');
      // 包陈旧必须写进**报告**（报告是耐久产物，只在 stderr 告警会被漏掉）：
      // .app 是构建产物，极易落后于裸二进制，届时读数属于旧构建而非当前提交。
      for (const { app: appName, h } of rows.filter((x) => x.h.bundleStale)) {
        L.push(`⚠️ **${appName} 的 .app 包早于裸二进制**（${h.bundleMtime} < ${h.binMtime}）→`);
        L.push('本段读数来自**旧构建**，**不得作为当前提交的结论**。请先重建包（`bash apps/desktop/scripts/build-local.sh`）再复测。');
        L.push('');
      }
      L.push('| app | 目标夹具 | 有效样本 | median | p95 | switchMs(中位) | echoMs(中位) |');
      L.push('|---|---|---|---|---|---|---|');
      // **按目标夹具分组**：每次投递的目标是交替的，不同尺寸的切换成本差一个数量级，
      // 混进同一个中位数会让读数失去意义。
      for (const { app: appName, h } of rows) {
        const byTarget = new Map();
        (h.samplesTarget ?? []).forEach((t, i) => {
          if (!byTarget.has(t)) byTarget.set(t, { total: [], sw: [], echo: [], n: 0 });
          const g = byTarget.get(t);
          g.n += 1;
          if (h.samples[i] !== null && h.samples[i] !== undefined) {
            g.total.push(h.samples[i]);
            g.sw.push(h.samplesSwitchMs[i]);
            g.echo.push(h.samplesEchoMs[i]);
          }
        });
        if (byTarget.size === 0) {
          L.push(`| ${appName} | — | ${h.validSamples} / ${h.samples.length} | ${fmt(h.stats?.median)} | ${fmt(h.stats?.p95)}`
            + ` | ${fmt(stats(h.samplesSwitchMs ?? []).median)} | ${fmt(stats(h.samplesEchoMs ?? []).median)} |`);
          continue;
        }
        for (const [t, g] of byTarget) {
          L.push(`| ${appName} | ${t} | ${g.total.length} / ${g.n} | ${fmt(stats(g.total).median)} | ${fmt(stats(g.total).p95)}`
            + ` | ${fmt(stats(g.sw).median)} | ${fmt(stats(g.echo).median)} |`);
        }
      }
      L.push('');
      L.push('settleMs（`waitStable` 地板，不计入指标）逐样本：'
        + rows.map(({ app: a, h }) => `${a}=[${(h.samplesSettleMs ?? []).map((x) => (x === null || x === undefined) ? 'null' : Number(x).toFixed(0)).join(', ')}]`).join('；'));
      // 切换判据的自证（2026-09-25）：把「实测变化比例」与「帧几何不一致帧数」列出，
      // 使读者能判断 switchMs 是否真由一次实质切换触发，而不是被偶发重绘骗过。
      for (const { app: a, h } of rows) {
        const fracs = (h.samplesSwitchFrac ?? []).map((x) => (x === null || x === undefined) ? 'null' : `${(Number(x) * 100).toFixed(1)}%`);
        const dims = h.samplesDimMismatchFrames ?? [];
        L.push('');
        L.push(`判据自证（${a}）：切换判据 = 帧对变化比例 ≥ ${((h.switchMinFrac ?? 0) * 100).toFixed(0)}%；`
          + `实测比例逐样本 = [${fracs.join(', ')}]；`
          + `基准帧/比较帧几何不一致帧数 = [${dims.map((x) => x === null || x === undefined ? 'null' : x).join(', ')}]`
          + `${dims.some((x) => Number(x) > 0) ? ' ← **>0 说明「帧尺寸恒定」假设不成立，该批读数需复测**' : ''}`);
      }
      L.push('');
      const hints = rows.flatMap(({ app: a, h }) => (h.failureHints ?? []).map((s) => `${a}: ${s}`));
      if (hints.length > 0) {
        L.push('失败样本形态：');
        for (const h of hints) L.push(`- ${h}`);
        L.push('');
      }
    }
  }

  // 立此诊断的原因：台账原结论「10MB 打开 2.59× 于 Typora」把 ratio 直接读作
  // 「大文件处理慢」。但若某应用的 open 时间**不随文件尺寸增长**，该值就被
  // **固定启动成本**主导，ratio 不能归因于大文件处理能力。
  //
  // 实测反例（2026-09-12 数据）：Mellow 1MB median 1289.2ms vs 10MB 1109.7ms ——
  // 10MB 反而更快，差值远小于 run 间方差（同批 startup 实测 min 314.5 / max 5530.0ms）
  // → Mellow 侧由固定成本主导；同批 Typora 1MB 1326.9ms vs 10MB 428.1ms 呈相反方向
  // （首个 fixture 吸收冷启动）。两侧方向相反，说明该批测量主要反映**启动成本与
  // 执行顺序**，而非文件尺寸。
  //
  // 结论：ratio 只有在**同应用内随尺寸单调增长**时才可作为「大文件处理」证据；
  // 否则必须标注为「启动成本主导，需 hot-open 口径复测」。
  {
    const sizeOf = (f) => {
      try { return statSync(join(FIXTURES_DIR, f)).size; } catch { return 0; }
    };
    const ordered = [...opts.fixtures].sort((a, b) => sizeOf(a) - sizeOf(b));
    L.push('### 2b. 尺寸标度诊断（open 时间是否随文件尺寸增长）');
    L.push('');
    if (ordered.length < 2) {
      L.push('（仅一个 fixture，无法判断尺寸标度 —— 结论不得归因于大文件处理）');
    } else {
      const small = ordered[0]; const large = ordered[ordered.length - 1];
      L.push(`对比 ${small}（${sizeOf(small)} B）→ ${large}（${sizeOf(large)} B）`);
      if (!baselineRendersFixture(large)) {
        L.push('');
        L.push(`⚠️ 大 fixture \`${large}\` 超出 Typora 渲染上限（${TYPORA_MAX_FILE_SIZE} 字符）→`);
        L.push('Typora 侧为提示页、无有效读数，其行只能是「数据不足」；');
        L.push('**不得据此说「Mellow 在该尺寸上更快/更慢」**。');
      }
      L.push('');
      L.push('| app | 小 fixture median | 大 fixture median | 增长倍数 | 判定 |');
      L.push('|---|---|---|---|---|');
      for (const appName of ['Mellow', 'Typora']) {
        const r = results.find((x) => x.app === appName);
        const a = r?.metrics[small]?.openToEditable?.stats?.median;
        const b = r?.metrics[large]?.openToEditable?.stats?.median;
        if (!a || !b) { L.push(`| ${appName} | ${fmt(a)} | ${fmt(b)} | — | 数据不足 |`); continue; }
        const growth = b / a;
        const verdict = growth > 1.15
          ? '随尺寸增长 → ratio 可归因于大文件处理'
          : '**未随尺寸增长 → 固定启动成本主导，ratio 不得归因于大文件处理**';
        L.push(`| ${appName} | ${fmt(a)} | ${fmt(b)} | ${growth.toFixed(2)}× | ${verdict} |`);
      }
    }
    L.push('');
  }

  L.push('');
  L.push('| fixture | 模式 | Mellow P95 | Mellow median | Typora P95 | Typora median | ratio P95 (M/T) | PRD 目标 | 达标 |');
  L.push('|---|---|---|---|---|---|---|---|');
  const modeMap = { '1MB.md': '普通', '5MB.md': '边界', '10MB.md': 'Large', '100k-lines.md': 'Large', 'large-table.md': '参考', '100-mermaid.md': '参考', '1000-images.md': '参考' };
  const targetTyping = { '1MB.md': '<16ms', '5MB.md': '<32ms', '10MB.md': '<32ms', '100k-lines.md': '<32ms' };
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.typing?.stats; };
    const mt = g('Mellow'); const tt = g('Typora');
    const ratio = ratioOrNA(mt?.p95, tt?.p95, f);
    const target = targetTyping[f];
    const pass = mt?.p95 && target ? (f.includes('1MB') ? mt.p95 < 16 : mt.p95 < 32) : null;
    L.push(`| ${f} | ${modeMap[f] ?? ''} | ${fmt(mt?.p95, 2)} | ${fmt(mt?.median, 2)} | ${cellOrRefused(tt?.p95, f, (v) => fmt(v, 2))} | ${cellOrRefused(tt?.median, f, (v) => fmt(v, 2))} | ${ratio} | ${target ?? '参考'} | ${pass === null ? '' : pass ? '✅' : '❌'} |`);
  }
  L.push('');

  // scroll
  L.push('## 4. scroll');
  L.push('');
  L.push('| fixture | Mellow p95帧(ms) | Mellow fps | Mellow 掉帧 | Typora p95帧(ms) | Typora fps | Typora 掉帧 |');
  L.push('|---|---|---|---|---|---|---|');
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.scroll; };
    const ms = g('Mellow'); const ts = g('Typora');
    if (!ms && !ts) continue;
    L.push(`| ${f} | ${fmt(ms?.p95FrameMs, 1)} | ${fmt(ms?.fps, 1)} | ${ms?.dropped ?? '—'} | ${cellOrRefused(ts?.p95FrameMs, f, (v) => fmt(v, 1))} | ${cellOrRefused(ts?.fps, f, (v) => fmt(v, 1))} | ${baselineRendersFixture(f) ? (ts?.dropped ?? '—') : '—（拒渲染）'} |`);
  }
  L.push('');

  // search
  L.push('## 5. search');
  L.push('');
  L.push('| fixture | Typora（Cmd+F 文档内查找，ms） | Mellow |');
  L.push('|---|---|---|');
  for (const f of ['1MB.md', '10MB.md']) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.search; };
    const ts = g('Typora'); const ms = g('Mellow');
    L.push(`| ${f} | ${ts ? (ts.ok ? fmt(ts.latencyMs, 1) : '超时') : '—'} | ${ms ? (ms.ok ? fmt(ms.latencyMs, 1) : `N/A（${ms.note}）`) : '—'} |`);
  }
  L.push('');
  L.push('> Mellow 文档内查找（Cmd+F）已实现（@codemirror/search，2026-08-16）；此处 ROI 口径仅测侧边栏全局搜索（Rust streaming），与 Typora 文档内查找不同不可比。');
  L.push('');

  // save
  L.push('## 6. save（Cmd+S → mtime 变化，ms）');
  L.push('');
  L.push('| fixture | Mellow | Typora |');
  L.push('|---|---|---|');
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.save; };
    const ms = g('Mellow'); const ts = g('Typora');
    if (!ms && !ts) continue;
    L.push(`| ${f} | ${ms ? (ms.ms !== null ? ms.ms + 'ms' : 'FAIL') : '—'} | ${ts ? (ts.ms !== null ? ts.ms + 'ms' : 'FAIL') : '—'} |`);
  }
  L.push('');

  // memory
  L.push('## 7. memory（主进程 RSS，MB）');
  L.push('');
  L.push('| fixture | Mellow median | Mellow peak | Typora median | Typora peak | ratio med (M/T) |');
  L.push('|---|---|---|---|---|---|');
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.memory; };
    const ms = g('Mellow'); const ts = g('Typora');
    if (!ms && !ts) continue;
    const ratio = ratioOrNA(ms?.medianMB, ts?.medianMB, f);
    L.push(`| ${f} | ${fmt(ms?.medianMB, 0)} | ${fmt(ms?.peakMB, 0)} | ${cellOrRefused(ts?.medianMB, f, (v) => fmt(v, 0))} | ${cellOrRefused(ts?.peakMB, f, (v) => fmt(v, 0))} | ${ratio} |`);
  }
  L.push('');

  L.push('## 8. 发现项');
  L.push('');
  L.push('- Mellow 文档内查找（Cmd+F）已实现（2026-08-16）；search 指标 ROI 口径待适配 CM 查找面板。');
  L.push('- 大文件模式（>5MB 或 >50,000 行触发）影响 10MB / 100k-lines 的打开与输入路径。');
  L.push('- PRD「open-to-editable ≤250ms」为热打开口径；本 benchmark 采用冷启动口径（公平对比所需），绝对值解读需注意。');
  L.push('');
  L.push('## 原始数据');
  L.push('');
  for (const res of results) L.push(`- \`${env.ts}-${res.app}.json\``);
  L.push('');
  return L.join('\n');
}

const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d));

// ---------- main ----------
async function main() {
  const metrics = has('--all') ? ALL_METRICS : parseList(argVal('--metrics', 'open'));
  const fixtures = has('--all') ? FIXTURES : parseList(argVal('--fixtures', '1MB.md'));
  const runs = parseInt(argVal('--runs', '5'), 10);
  // 预热轮：每个 app×fixture 在统计前先跑 N 轮并丢弃（默认 1）。
  // 不预热会把「首次启动的一次性缓存成本」算进首个 fixture，产生「越大越快」的假象。
  const warmup = parseInt(argVal('--warmup', '1'), 10);
  // kill → 下次 launch 之间的静默时长。用于区分「被测应用的间歇成本」与
  // 「OS/WKWebView 进程池在两态间交替」——后者会随静默时长变化而消失。
  const settle = parseInt(argVal('--settle', '600'), 10);
  const keystrokes = parseInt(argVal('--keystrokes', '100'), 10);
  const appArg = argVal('--app', 'both');
  const appKeys = appArg === 'both' ? ['typora', 'mellow'] : [appArg];

  console.log('Mellow Performance Benchmark');
  console.log('  fixtures:', fixtures.join(', '));
  console.log('  metrics:', metrics.join(', '));
  console.log('  runs:', runs, '| keystrokes:', keystrokes);

  const perms = checkPerms();
  if (!perms.ok) {
    console.error('\n权限不足：');
    for (const d of perms.detail) console.error('  - ' + d);
    console.error('\n请为以下二进制授权：');
    console.error(`  ${HELPER}`);
    console.error('  系统设置 → 隐私与安全性 → 辅助功能 / 屏幕录制 → 添加并开启');
    console.error('  授权后重新运行本命令。');
    process.exit(1);
  }
  console.log('权限 OK：Accessibility ✓ / Screen Recording ✓');
  // 输入源**硬门禁**（2026-09-23 由「仅警告」升级为「拒绝执行」）。
  //
  // 立此门禁的原因：合成按键类指标依赖「按键真的落到文档并回显」。输入源是 IME 时，
  // 按键会弹候选窗而不是回显文本 —— 数字看着正常，测的却是「候选窗出现的耗时」，
  // 且方差远大于真实回显（实测同机两轮 10MB 中位数 743.9ms vs 1586.4ms）。
  // 旧实现只 warn 放行，而且判定函数因简体拼音的 id `com.apple.inputmethod.SCIM.ITABC`
  // **字面量里含 `ABC`** 而恒为 true → 门禁形同虚设（见 perf-common 的 currentInputSource）。
  const KEYSTROKE_METRICS = ['startup', 'open', 'typing', 'search', 'hotopen'];
  const needsKeystrokes = metrics.some((m) => KEYSTROKE_METRICS.includes(m));
  let inputSrc = currentInputSource();
  if (needsKeystrokes && !inputSourceIsEnglish()) {
    // 先尝试自行切到 ABC（可逆、无副作用；golden-journeys 亦用同一工具）。
    // 注意：这里只是**起点**断言 —— macOS 按应用记忆输入源，激活目标 app 后可能又切回 IME，
    // 故每次探针还会带 --ensure-ascii 在 activateApp 之后重新断言（见 ENSURE_ASCII）。
    console.warn(`⚠️ 当前输入源是「${inputSrc.name || '未知'}」，尝试切换到 ABC…`);
    try {
      execSync(`${join(BENCH_DIR, 'bin', 'select-input')} com.apple.keylayout.ABC`, { stdio: 'ignore' });
      sleep(500);
      inputSrc = currentInputSource();
    } catch (e) {
      console.warn(`   切换失败：${e.message.split('\n')[0]}`);
    }
  }
  if (needsKeystrokes && !inputSourceIsEnglish()) {
    console.error(`\n✗ 当前输入源是「${inputSrc.name || '未知'}」（id=${inputSrc.id || '?'}, type=${inputSrc.type || '?'}），不是键盘布局。`);
    console.error('  startup / open / typing / search / hotopen 依赖合成按键落到文档并回显；');
    console.error('  IME 会拦下按键并弹出候选窗 → 这些指标的「首键回显」分量不可用。');
    console.error('  请手动切换到 ABC / U.S. 键盘布局后重跑：');
    console.error(`    ${join(BENCH_DIR, 'bin', 'select-input')} com.apple.keylayout.ABC`);
    console.error('  或 系统设置 → 键盘 → 输入法 → 选择 ABC。');
    process.exit(1);
  }
  if (inputSrc.ok !== true) {
    console.warn(`⚠️ 无法确认当前输入源（${inputSrc.error ?? '未知原因'}）→ 首键回显分量的有效性未经验证。`);
  } else {
    console.log(`输入源 OK：${inputSrc.name}（${inputSrc.type}）`);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const results = [];
  for (const appKey of appKeys) {
    const r = await measureApp(appKey, { metrics, fixtures, runs, keystrokes, warmup, settle });
    results.push(r);
    writeFileSync(join(RESULTS_DIR, `${ts}-${appKey}.json`), JSON.stringify(r, null, 2));
  }

  const env = {
    date: new Date().toISOString(),
    ts,
    sys: sysInfo(),
    git: gitInfo(),
    typoraVersion: typoraVersion(APPS.typora.bin),
    perms,
    inputSource: inputSourceIsEnglish(),
  };
  const report = renderReport(env, results, { metrics, fixtures, runs, keystrokes });
  mkdirSync(join(BENCH_DIR, 'reports'), { recursive: true });
  const reportPath = join(BENCH_DIR, 'reports', `${ts}-mellow-vs-typora.md`);
  writeFileSync(reportPath, report);
  console.log('\n报告：' + reportPath);
}

main().catch((e) => { console.error('runner 失败:', e); process.exit(1); });
