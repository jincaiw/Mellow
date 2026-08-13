/**
 * perf-common — benchmark 公共工具（performance-benchmark-spec §6）。
 * 封装 ScreenTiming helper 调用、进程管理、统计、权限自检。
 */
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BENCH_DIR = __dirname;
export const HELPER = join(__dirname, 'bin', 'screen-timing');
export const FIXTURES_DIR = join(__dirname, 'fixtures');
export const RESULTS_DIR = join(__dirname, 'results');

// ---------- helper 调用 ----------

/** 调用 helper，解析输出中的最后一个 JSON（progress 行忽略）。失败时透传 helper 错误输出。 */
export function helper(...args) {
  let out;
  try {
    out = execFileSync(HELPER, args, { encoding: 'utf8', timeout: 300000 });
  } catch (e) {
    const detail = String(e.stdout || e.stderr || '').trim().slice(0, 300);
    throw new Error(`helper ${args[0]} 失败: ${detail || e.message}`);
  }
  const lines = out.split('\n').filter((l) => l.trim().startsWith('{'));
  if (lines.length === 0) throw new Error(`helper 无输出: ${args.join(' ')}`);
  return JSON.parse(lines[lines.length - 1]);
}

// ---------- 进程管理 ----------

export function killApp(pattern) {
  spawnSync('pkill', ['-x', pattern], { stdio: 'ignore' });
  spawnSync('pkill', ['-x', `${pattern}.bin`], { stdio: 'ignore' });
}

/** 启动 app，返回 { pid, t0Ms } */
export function launch(bin, args) {
  const proc = spawn(bin, args, { stdio: 'ignore', detached: false });
  return { pid: proc.pid, t0Ms: Date.now(), proc };
}

/** 等待窗口出现，返回 { window, wallMs, elapsedMs } */
export function waitWindow(pid, timeoutMs = 20000) {
  const r = helper('wait-window', '--pid', String(pid), '--timeout', String(timeoutMs));
  if (!r.ok) throw new Error(r.error);
  return { x: r.x, y: r.y, w: r.w, h: r.h, title: r.title, wallMs: r.wallMs, elapsedMs: r.elapsedMs };
}

/** 顶部行 ROI（光标在文首）：窗口中央 60% 宽 × 顶部 10% 高 */
export function topRoi(win, fracH = 0.10) {
  const w = win.w;
  const h = win.h;
  return {
    x: Math.round(w * 0.2),
    y: Math.round(h * 0.06),
    w: Math.round(w * 0.6),
    h: Math.max(24, Math.round(h * fracH)),
  };
}
export const roiStr = (r) => `${r.x},${r.y},${r.w},${r.h}`;

// ---------- 内存 ----------

export function rssKB(pid) {
  try {
    const out = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
    const v = parseInt(out.stdout.trim(), 10);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** 采样 N 次 RSS（间隔 ms），返回 { medianMB, peakMB, samplesMB } */
export function sampleRss(pid, n = 5, intervalMs = 400) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const kb = rssKB(pid);
    if (kb !== null) samples.push(kb / 1024);
    if (i < n - 1) sleep(intervalMs);
  }
  if (samples.length === 0) return { medianMB: null, peakMB: null, samplesMB: [] };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMB: sorted[Math.floor(sorted.length / 2)],
    peakMB: Math.max(...samples),
    samplesMB: samples,
  };
}

// ---------- 统计 ----------

export function pct(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, idx)];
}
export function stats(values) {
  const clean = values.filter((v) => v !== null && v !== undefined && v >= 0);
  if (clean.length === 0) return { n: 0, min: null, median: null, p95: null, max: null, mean: null };
  const sorted = [...clean].sort((a, b) => a - b);
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  return {
    n: clean.length,
    min: sorted[0],
    median: pct(sorted, 0.5),
    p95: pct(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean,
  };
}

// ---------- 杂项 ----------

export function sleep(ms) {
  const at = Date.now() + ms;
  while (Date.now() < at) { /* busy-ish wait 精度优先 */ }
}

export function fileMtimeMs(path) {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

/** 把文件 mtime 拨到 2000-01-01（隔离自动保存干扰） */
export function touchOld(path) {
  spawnSync('touch', ['-t', '200001010000', path], { stdio: 'ignore' });
}

/** 权限自检，返回 { ok, accessibility, screenRecording, detail } */
export function checkPerms() {
  const r = helper('check');
  const detail = [];
  if (!r.accessibility) detail.push('辅助功能（Accessibility）：屏幕录制/键盘合成需要');
  if (!r.screenRecording) detail.push('屏幕录制（Screen Recording）：像素帧捕获需要');
  return { ok: r.accessibility && r.screenRecording, accessibility: r.accessibility, screenRecording: r.screenRecording, detail };
}

/** 当前输入源是否 ABC/英文（typing 测试需要） */
export function inputSourceIsEnglish() {
  try {
    const out = spawnSync('defaults', ['read', 'com.apple.HIToolbox', 'AppleSelectedInputSources'], { encoding: 'utf8' });
    return /ABC|U\.S\.|English/.test(out.stdout) && !/Pinyin|Chinese|Wubi|ABC.*Chinese/.test(out.stdout.replace(/ABC\s*\)/, ''));
  } catch { return false; }
}
