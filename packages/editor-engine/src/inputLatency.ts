/**
 * 按键回显延迟埋点（W-PERF-1 / PRD §110 Input 目标）。
 *
 * ## 为什么需要它
 *
 * PRD §110 的 Input 目标（普通键 < 16ms）**在屏幕捕获 harness 上原理性不可判定**：
 * 16ms 小于单帧（60Hz ≈ 16.7ms），而屏幕捕获的 P95 分辨率下限约为 1 帧
 * （见 `docs/specs/performance-benchmark-spec.md` §9）。这不是「暂时没测」，
 * 是**量具上限** —— 故必须改为**应用内埋点**，直接测「按键 → 回显」。
 *
 * ## 量的是什么（边界必须写清，否则又是一个会被误读的读数）
 *
 * 一次按键测**两个边界**，分开报：
 *
 * | 字段 | 起点 | 终点 | 含义 |
 * |---|---|---|---|
 * | `dispatchMs` | keydown 到达编辑器 DOM（capture 阶段） | **该按键引起的文档变更已提交**（CM 事务完成） | **应用自身可控**的成本 |
 * | `frameMs` | 同上 | 该变更后的**第一个动画帧**（`requestAnimationFrame`） | 含排版 + 帧边界，**与 PRD 16ms 目标同一量纲** |
 *
 * 为什么**必须分开报**：只报 `dispatchMs` 会得到亚毫秒级读数，读者会以为
 * 「轻松达标」—— 而它**不含**排版与帧边界；只报 `frameMs` 则无法区分
 * 「应用慢」与「帧率所限」。两者之差 ≈ 排版 + 帧边界。
 *
 * **不含**：合成器提交与屏幕呈现（present）—— 那部分只能由屏幕捕获观测。
 * 故本读数相对屏幕捕获是**下界**：in-app ≤ 屏幕捕获读数。
 *
 * ## 不测什么
 *
 * IME 合成期间的按键（`isComposing`）—— 合成期的「按键」不是「字符回显」，
 * 混入会把中文输入误算成慢（与 Composition Guard 同一原则）。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** 环形缓冲容量（够算 P95；避免长时间写作时无限增长） */
export const INPUT_LATENCY_CAPACITY = 500;

export interface LatencyStats {
  count: number;
  median: number | null;
  p95: number | null;
  max: number | null;
}

export interface InputLatencyReport {
  dispatchMs: LatencyStats;
  frameMs: LatencyStats;
}

const dispatchSamples: number[] = [];
const frameSamples: number[] = [];

/** 当前待闭合的按键（t0 + 是否已提交文档变更） */
let pending: { t0: number; dispatched: boolean } | null = null;

function push(bucket: number[], value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  bucket.push(value);
  if (bucket.length > INPUT_LATENCY_CAPACITY) bucket.shift();
}

function statsOf(bucket: number[]): LatencyStats {
  if (bucket.length === 0) return { count: 0, median: null, p95: null, max: null };
  const sorted = [...bucket].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] as number };
}

/** 清空样本（每轮 benchmark 开始前调用） */
export function resetInputLatency(): void {
  dispatchSamples.length = 0;
  frameSamples.length = 0;
  pending = null;
}

/** 读取报告（只读，不重置） */
export function inputLatencyReport(): InputLatencyReport {
  return { dispatchMs: statsOf(dispatchSamples), frameMs: statsOf(frameSamples) };
}

/**
 * 记录一次 keydown（capture 阶段调用）。
 * 已有未闭合的按键时**覆盖**（连续按键只保留最后一次起点：我们要的是「这一键的回显」）。
 */
export function noteKeydown(t0: number): void {
  pending = { t0, dispatched: false };
}

/** 记录文档变更已提交（CM 事务完成）；闭合 dispatchMs，并开启 frameMs 的等待 */
export function noteDocChanged(t1: number): void {
  if (pending === null || pending.dispatched) return;
  pending.dispatched = true;
  push(dispatchSamples, t1 - pending.t0);
}

/** 记录「变更后的第一个动画帧」；闭合 frameMs */
export function noteFrame(t1: number): void {
  if (pending === null || !pending.dispatched) return;
  push(frameSamples, t1 - pending.t0);
  pending = null;
}

/** 当前是否有未闭合的按键（供测试与诊断） */
export function hasPendingKey(): boolean {
  return pending !== null;
}

// ── 宿主通道 ────────────────────────────────────────────────────────────────

export interface InputLatencyApi {
  report(): InputLatencyReport;
  reset(): void;
}

export function installInputLatencyApi(): void {
  (window as unknown as { __MELLOW_INPUT_LATENCY__?: InputLatencyApi }).__MELLOW_INPUT_LATENCY__ = {
    report: inputLatencyReport,
    reset: resetInputLatency,
  };
}

interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

/**
 * 构建埋点扩展：
 * - capture 阶段监听 keydown 记 t0（必须 capture，否则拿到的是 CM 处理后的时间）；
 * - ViewPlugin.update 里看 docChanged 闭合 dispatchMs；
 * - 该变更后的第一个 rAF 闭合 frameMs。
 */
export function buildInputLatencyExtension(): Extension {
  const cm = resolveCm();
  const { ViewPlugin } = cm;

  const plugin = ViewPlugin.fromClass(
    class InputLatencyPlugin {
      private readonly onKeydown: (e: KeyboardEvent) => void;
      private disposed = false;

      constructor(readonly view: EditorView) {
        this.onKeydown = (e: KeyboardEvent): void => {
          // 合成期间的按键不是「字符回显」（见文件头「不测什么」）
          if (e.isComposing) return;
          noteKeydown(performance.now());
        };
        view.dom.addEventListener('keydown', this.onKeydown, true);
      }

      update(update: ViewUpdate): void {
        if (!update.docChanged) return;
        noteDocChanged(performance.now());
        if (this.disposed) return;
        // 帧边界：rAF 不可用时退化为 setTimeout(16)（jsdom / 无 rAF 环境）
        const raf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (cb: FrameRequestCallback): number => setTimeout(() => cb(0), 16) as unknown as number;
        raf(() => {
          if (this.disposed) return;
          noteFrame(performance.now());
        });
      }

      destroy(): void {
        this.disposed = true;
        this.view.dom.removeEventListener('keydown', this.onKeydown, true);
      }
    },
  );

  return [plugin];
}
