/**
 * W-PERF-1：按键回显延迟埋点。
 *
 * 覆盖两层：
 *  ① 纯函数层（noteKeydown / noteDocChanged / noteFrame / report / reset）——
 *     边界闭合规则、无起点不闭合、容量上限；
 *  ② 扩展层（真实 EditorView + 真实 keydown 事件）—— capture 阶段记 t0、
 *     docChanged 闭合 dispatchMs、rAF 闭合 frameMs、IME 合成期跳过。
 */
import { EditorView } from '@codemirror/view';
import { install } from '../src/index';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  buildInputLatencyExtension,
  hasPendingKey,
  inputLatencyReport,
  INPUT_LATENCY_CAPACITY,
  noteDocChanged,
  noteFrame,
  noteKeydown,
  resetInputLatency,
} from '../src/inputLatency';

const flush = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('inputLatency — 边界闭合规则（纯函数）', () => {
  beforeEach(() => resetInputLatency());

  test('keydown → docChanged → frame：两个边界各记一个样本', () => {
    noteKeydown(100);
    expect(hasPendingKey()).toBe(true);
    noteDocChanged(101.5);
    noteFrame(116);
    const r = inputLatencyReport();
    expect(r.dispatchMs.count).toBe(1);
    expect(r.dispatchMs.median).toBeCloseTo(1.5, 5);
    expect(r.frameMs.count).toBe(1);
    expect(r.frameMs.median).toBeCloseTo(16, 5);
    expect(hasPendingKey()).toBe(false);
  });

  test('没有 keydown 起点时，docChanged / frame 都不闭合（程序化改动不得计入）', () => {
    noteDocChanged(50);
    noteFrame(60);
    const r = inputLatencyReport();
    expect(r.dispatchMs.count).toBe(0);
    expect(r.frameMs.count).toBe(0);
  });

  test('frame 在 dispatch 之前到达 → 不闭合（避免把「上一键的帧」算到这一键）', () => {
    noteKeydown(10);
    noteFrame(30); // dispatch 还没发生
    expect(inputLatencyReport().frameMs.count).toBe(0);
    expect(hasPendingKey()).toBe(true);
  });

  test('同一个 docChanged 只闭合一次 dispatch（重复 update 不得重复计数）', () => {
    noteKeydown(0);
    noteDocChanged(2);
    noteDocChanged(3);
    expect(inputLatencyReport().dispatchMs.count).toBe(1);
  });

  test('负值与 NaN 不进入样本（时钟回拨/异常不得污染 P95）', () => {
    noteKeydown(100);
    noteDocChanged(90); // 负增量
    noteFrame(Number.NaN);
    expect(inputLatencyReport().dispatchMs.count).toBe(0);
    expect(inputLatencyReport().frameMs.count).toBe(0);
  });

  test('容量上限：只保留最近 N 个样本', () => {
    for (let i = 0; i < INPUT_LATENCY_CAPACITY + 20; i += 1) {
      noteKeydown(0);
      noteDocChanged(1);
    }
    expect(inputLatencyReport().dispatchMs.count).toBe(INPUT_LATENCY_CAPACITY);
  });

  test('reset 清空样本与未闭合状态', () => {
    noteKeydown(0);
    noteDocChanged(1);
    resetInputLatency();
    expect(hasPendingKey()).toBe(false);
    expect(inputLatencyReport().dispatchMs.count).toBe(0);
  });
});

describe('inputLatency — 扩展层（真实 EditorView）', () => {
  beforeEach(() => resetInputLatency());

  function setUp(): EditorView {
    const view = new EditorView({
      doc: 'hello',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), buildInputLatencyExtension()],
    });
    view.focus();
    return view;
  }

  test('真实 keydown + 文档变更 → 记到 dispatchMs 与 frameMs', async () => {
    const view = setUp();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    view.dispatch({ changes: { from: 5, insert: 'x' } });
    // docChanged 是同步的：dispatchMs 应已闭合
    expect(inputLatencyReport().dispatchMs.count).toBe(1);
    expect(inputLatencyReport().frameMs.count).toBe(0);
    await flush();
    expect(inputLatencyReport().frameMs.count).toBe(1);
    expect(inputLatencyReport().frameMs.median).toBeGreaterThanOrEqual(0);
    view.destroy();
  });

  test('IME 合成期的 keydown 不计入（合成期的「按键」不是「字符回显」）', () => {
    const view = setUp();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, isComposing: true }));
    expect(hasPendingKey()).toBe(false);
    view.dispatch({ changes: { from: 5, insert: 'x' } });
    expect(inputLatencyReport().dispatchMs.count).toBe(0);
    view.destroy();
  });

  test('destroy 后不再记录（监听器已解绑、rAF 回调不再闭合）', async () => {
    const view = setUp();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    view.dispatch({ changes: { from: 5, insert: 'x' } });
    view.destroy();
    await flush();
    // dispatch 已记录（destroy 前发生），但 frame 不应再被补上
    expect(inputLatencyReport().dispatchMs.count).toBe(1);
    expect(inputLatencyReport().frameMs.count).toBe(0);
  });
});

describe('inputLatency — 接线（必须真的被 install() 装上，不能只是被导出）', () => {
  // 样本是**模块级**缓冲，跨用例累积 —— 必须重置，否则断言会被前面的用例污染
  // （实测踩到：期望 1 实得 2）。
  beforeEach(() => resetInputLatency());

  // 立此用例的原因：本项目反复出现「已实现 ≠ 有消费方」——
  // 模块写了、单测过了，但没有任何地方调用它。故断言 `install()` 之后
  // `window.__MELLOW_INPUT_LATENCY__` 存在且可读，把「接线」变成机器可核对的事实。
  test('install() 之后宿主通道存在，且能读回报告', () => {
    const view = new EditorView({
      doc: 'hello',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
    const api = (window as unknown as { __MELLOW_INPUT_LATENCY__?: { report(): unknown; reset(): void } })
      .__MELLOW_INPUT_LATENCY__;
    expect(api).toBeDefined();
    expect(typeof api?.report).toBe('function');
    expect(typeof api?.reset).toBe('function');
    // 走一遍真实按键 → 报告里应能看到样本
    view.focus();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    view.dispatch({ changes: { from: 5, insert: 'x' } });
    const report = api?.report() as { dispatchMs: { count: number } } | undefined;
    expect(report?.dispatchMs.count).toBe(1);
    view.destroy();
  });
});
