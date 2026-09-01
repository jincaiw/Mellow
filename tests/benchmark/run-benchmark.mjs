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
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execSync } from 'node:child_process';
import {
  BENCH_DIR, HELPER, FIXTURES_DIR, RESULTS_DIR,
  helper, killApp, launch, waitWindow, topRoi, roiStr,
  sampleRss, stats, sleep, fileMtimeMs, touchOld, checkPerms, inputSourceIsEnglish,
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
    prep() {
      run('defaults', ['write', 'abnerworks.Typora', 'SUEnableAutomaticChecks', '-bool', 'NO']);
      run('defaults', ['write', 'abnerworks.Typora', 'NSQuitAlwaysKeepsWindows', '-bool', 'NO']);
    },
  },
  mellow: {
    name: 'Mellow',
    bin: argVal('--mellow', join(BENCH_DIR, '..', '..', 'apps', 'desktop', 'src-tauri', 'target', 'release', 'mellow-desktop')),
    killPattern: 'mellow-desktop',
    prep() {
      // 清会话（localStorage）与恢复快照，保证每次冷启动同一起点
      run('rm', ['-rf', `${process.env.HOME}/Library/WebKit/com.mellow.editor`]);
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
const ALL_METRICS = ['startup', 'open', 'typing', 'scroll', 'search', 'save', 'memory'];
// PRD V1.2 FINAL 与 AGENTS.md 冻结的唯一性能/体验对标版本。
// 非该版本的运行仍可用于历史观察，但不可作为当前 P0 判定证据。
const TYPORA_NORMATIVE_VERSION = '1.14.9';
// 保存测量永不直接写 fixture。独立副本也避免 touchOld 被宿主当作外部变更，
// 使性能口径保持为“正常打开 → 编辑 → 保存”。
const BENCHMARK_WORKDIR = mkdtempSync(join(tmpdir(), 'mellow-benchmark-'));

function parseList(s) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

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
    for (let i = 0; i < opts.runs; i++) {
      killApp(app.killPattern);
      sleep(600);
      const { pid, t0Ms } = launchApp(blank);
      try {
        const win = waitWindow(pid, 30000);
        const roi = topRoi(win);
        const probe = helper('startup-probe', '--pid', String(pid), '--roi', roiStr(roi), '--timeout', '8000');
        const toEdit = (win.wallMs - t0Ms) + (probe.ok ? (probe.loadMs ?? 0) + probe.latencyMs : null);
        vals.push(toEdit);
        loads.push(probe.ok ? probe.loadMs : null);
      } catch (e) {
        vals.push(null);
        loads.push(null);
        console.warn(`[${app.name}] startup run ${i + 1} failed: ${e.message}`);
      }
      killApp(app.killPattern);
    }
    result.metrics.startup = { samples: vals, stats: stats(vals), loadMs: stats(loads) };
  }

  // 各夹具指标
  for (const fixture of opts.fixtures) {
    const fpath = join(FIXTURES_DIR, fixture);
    if (!existsSync(fpath)) { console.warn(`跳过（夹具缺失）: ${fixture}`); continue; }
    const m = { fixture };
    console.log(`\n=== ${app.name} / ${fixture} ===`);

    // open-to-editable：N 次冷启动打开
    if (opts.metrics.includes('open')) {
      const opens = [];
      const probes = [];
      const loads = [];
      for (let i = 0; i < opts.runs; i++) {
        killApp(app.killPattern);
        sleep(600);
        const { pid, t0Ms } = launchApp(fpath);
        try {
          const win = waitWindow(pid, 30000);
          const roi = topRoi(win);
          const probe = helper('startup-probe', '--pid', String(pid), '--roi', roiStr(roi), '--timeout', '8000');
          opens.push((win.wallMs - t0Ms) + (probe.ok ? (probe.loadMs ?? 0) + probe.latencyMs : null));
          probes.push(probe.ok ? probe.latencyMs : null);
          loads.push(probe.ok ? probe.loadMs : null);
        } catch (e) {
          opens.push(null);
          probes.push(null);
          loads.push(null);
          console.warn(`[${app.name}/${fixture}] open run ${i + 1} failed: ${e.message}`);
        }
        killApp(app.killPattern);
      }
      m.openToEditable = { stats: stats(opens), samples: opens, probeLatency: stats(probes), loadMs: stats(loads) };
      console.log(`open-to-editable: median=${m.openToEditable.stats.median?.toFixed(1)}ms p95=${m.openToEditable.stats.p95?.toFixed(1)}ms`);
    }

    // 打开状态下测 typing / scroll / save / memory / search（每指标独立容错：单指标失败不拖垮整块）
    let pid = null;
    if (['typing', 'scroll', 'save', 'memory', 'search'].some((k) => opts.metrics.includes(k))) {
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
        const win = waitWindow(pid, 30000);
        const roi = topRoi(win);

        mSafe('typing', () => {
          if (!opts.metrics.includes('typing')) return;
          const r = helper('keypress-latency', '--pid', String(pid), '--roi', roiStr(roi),
            '--key', '0', '--count', String(opts.keystrokes), '--interval', '200', '--timeout', '5000');
          const lats = r.latencies || [];
          m.typing = { stats: stats(lats), samples: lats, timeouts: lats.filter((x) => x < 0).length, calibMaxDiff: r.calibMaxDiff, threshold: r.threshold };
          console.log(`typing: p95=${m.typing.stats.p95?.toFixed(2)}ms median=${m.typing.stats.median?.toFixed(2)}ms timeouts=${m.typing.timeouts}`);
        });

        mSafe('scroll', () => {
          if (!opts.metrics.includes('scroll')) return;
          const r = helper('scroll-frames', '--pid', String(pid), '--roi', roiStr({ x: 0, y: 0, w: win.w, h: win.h }),
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
          const r = helper('startup-probe', '--pid', String(pid), '--roi', roiStr(topRoi(win, 0.06)), '--timeout', '5000');
          m.search = { ok: r.ok, latencyMs: r.ok ? r.latencyMs : null, note: r.ok ? null : 'ROI 无变化（find bar 未出现在预期 ROI）' };
          helper('post-combo', '--mods', '', '--key', '53', '--pid', String(pid)); // Esc 关闭 find bar
          console.log(`search: ${r.ok ? r.latencyMs + 'ms' : 'N/A (' + m.search.note + ')'}`);
        });

        // save 放最后：独立 launch（touchOld 必须在 launch 前，否则 Typora 检测外部 mtime 变化弹「重新加载」对话框）
        mSafe('save', () => {
          if (!opts.metrics.includes('save')) return;
          stopLaunchedApp(l);
          if (app.killPattern === 'Typora') killApp(app.killPattern);
          sleep(600);
          const savePath = join(BENCHMARK_WORKDIR, `${appKey}-${fixture}`);
          copyFileSync(fpath, savePath);
          touchOld(savePath); // launch 前拨老 mtime
          const l2 = launchApp(savePath);
          try {
            waitWindow(l2.pid, 30000);
            // 大文件模式需等待首轮虚拟化/渲染稳定后再输入，否则 resetEditor 的后续
            // transaction 会覆盖测试字符，造成 mtime 假阳性或错误的不可编辑结论。
            // Typora 维持原有 5s；Mellow 对齐 Golden Journey 的 10s 就绪窗口。
            sleep(app.killPattern === 'Typora' ? 5000 : 10000);
            // 在输入前捕获源文件状态。不得在输入后才取 before：若宿主已提前
            // 持久化输入，后续 Cmd+S 是 no-op，旧逻辑会把真实的源码变化误报为 FAIL。
            const beforeText = readFileSync(savePath, 'utf8');
            // 预热：制造修改（'a'）。Mellow 的 WKWebView 会过滤 CGEventPost
            // 字符；必须走 System Events 的真实输入通路。不要合成点击正文，
            // 因为它会破坏 WebView 的 first-responder 焦点协议。
            if (app.killPattern === 'Typora') {
              helper('post-combo', '--mods', '', '--key', '0', '--pid', String(l2.pid));
            } else {
              focusAndTypeMellow(l2.pid, 'a');
            }
            sleep(400);
            const afterInputText = readFileSync(savePath, 'utf8');
            const afterInputMtime = fileMtimeMs(savePath);
            const persistedBeforeExplicitSave = afterInputText !== beforeText;
            helper('post-combo', '--mods', 'cmd', '--key', '1', '--pid', String(l2.pid)); // Cmd+S
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
              ? {
                ms: changed ? Date.now() - t0 : null,
                note: persistedBeforeExplicitSave ? '输入已在显式 Cmd+S 前持久化' : null,
                sourceChanged: true,
                persistedBeforeExplicitSave,
              }
              : {
                ms: null,
                sourceChanged,
                persistedBeforeExplicitSave,
                note: !sourceChanged
                  ? '输入后 Markdown 源码未变化（输入焦点或编辑失败）'
                  : !changed
                    ? '10s 内 mtime 未变化'
                  : 'mtime 已变化但 Markdown 源码未变化（输入焦点或编辑失败）',
              };
            console.log(`save: ${m.save.ms ?? 'FAIL'}ms`);
          } finally {
            stopLaunchedApp(l2);
            if (app.killPattern === 'Typora') killApp(app.killPattern);
          }
        });
      } catch (e) {
        console.warn(`[${app.name}/${fixture}] 打开态基础失败: ${e.message}`);
        m.openStateFailed = true;
      } finally {
        killApp(app.killPattern);
      }
    }
    result.metrics[fixture] = m;
  }
  // save 测试会向夹具写入字符（post 'a' + Cmd+S）：重新生成夹具恢复原始状态
  // （generate-fixtures.mjs 确定性 seed，幂等）
  execSync('node generate-fixtures.mjs', { cwd: BENCH_DIR, stdio: 'ignore' });
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
  L.push(`- 重复次数：open/startup N=${opts.runs}，typing ${opts.keystrokes} 键/次`);
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
  L.push('| fixture | Mellow median | Mellow p95 | Typora median | Typora p95 | ratio med (M/T) | PRD 目标（热打开口径，参考） |');
  L.push('|---|---|---|---|---|---|---|');
  const targetMap = { '1MB.md': '≤250ms', '10MB.md': '1.0–1.5s', '5MB.md': '参考', '100k-lines.md': '参考', 'large-table.md': '参考', '100-mermaid.md': '参考', '1000-images.md': '参考' };
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.openToEditable?.stats; };
    const mt = g('Mellow'); const tt = g('Typora');
    const ratio = mt?.median && tt?.median ? (mt.median / tt.median).toFixed(2) : '—';
    L.push(`| ${f} | ${fmt(mt?.median)} | ${fmt(mt?.p95)} | ${fmt(tt?.median)} | ${fmt(tt?.p95)} | ${ratio} | ${targetMap[f] ?? ''} |`);
  }
  L.push('');

  // typing
  L.push('## 3. typing P95（按键→回显，ms）');
  L.push('');
  L.push('| fixture | 模式 | Mellow P95 | Mellow median | Typora P95 | Typora median | ratio P95 (M/T) | PRD 目标 | 达标 |');
  L.push('|---|---|---|---|---|---|---|---|');
  const modeMap = { '1MB.md': '普通', '5MB.md': '边界', '10MB.md': 'Large', '100k-lines.md': 'Large', 'large-table.md': '参考', '100-mermaid.md': '参考', '1000-images.md': '参考' };
  const targetTyping = { '1MB.md': '<16ms', '5MB.md': '<32ms', '10MB.md': '<32ms', '100k-lines.md': '<32ms' };
  for (const f of opts.fixtures) {
    const g = (appKey) => { const r = results.find((x) => x.app === appKey); return r?.metrics[f]?.typing?.stats; };
    const mt = g('Mellow'); const tt = g('Typora');
    const ratio = mt?.p95 && tt?.p95 ? (mt.p95 / tt.p95).toFixed(2) : '—';
    const target = targetTyping[f];
    const pass = mt?.p95 && target ? (f.includes('1MB') ? mt.p95 < 16 : mt.p95 < 32) : null;
    L.push(`| ${f} | ${modeMap[f] ?? ''} | ${fmt(mt?.p95, 2)} | ${fmt(mt?.median, 2)} | ${fmt(tt?.p95, 2)} | ${fmt(tt?.median, 2)} | ${ratio} | ${target ?? '参考'} | ${pass === null ? '' : pass ? '✅' : '❌'} |`);
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
    L.push(`| ${f} | ${fmt(ms?.p95FrameMs, 1)} | ${fmt(ms?.fps, 1)} | ${ms?.dropped ?? '—'} | ${fmt(ts?.p95FrameMs, 1)} | ${fmt(ts?.fps, 1)} | ${ts?.dropped ?? '—'} |`);
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
    const ratio = ms?.medianMB && ts?.medianMB ? (ms.medianMB / ts.medianMB).toFixed(2) : '—';
    L.push(`| ${f} | ${fmt(ms?.medianMB, 0)} | ${fmt(ms?.peakMB, 0)} | ${fmt(ts?.medianMB, 0)} | ${fmt(ts?.peakMB, 0)} | ${ratio} |`);
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
  if (!inputSourceIsEnglish()) {
    console.warn('⚠️ 输入法非英文（ABC）。typing 测试请先切换到 ABC 输入法。');
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const results = [];
  for (const appKey of appKeys) {
    const r = await measureApp(appKey, { metrics, fixtures, runs, keystrokes });
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
