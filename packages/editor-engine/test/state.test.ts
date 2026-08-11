/**
 * 框架测试 —— Reveal Policy 状态机（spec §5，纯函数）。
 */

import { classifyNodeState, shouldHideMarkers, shouldShowMarkers } from '../src/state';
import type { RevealContext, MarkerRange } from '../src/types';

const NODE = { from: 2, to: 10 }; // 内容节点 [2,10)
const MARKERS: MarkerRange[] = [{ from: 2, to: 4 }, { from: 8, to: 10 }];

function ctx(caret: { anchor: number; head: number }, over: Partial<RevealContext> = {}): RevealContext {
  return { caret, ...over };
}

describe('Reveal Policy（spec §5）', () => {
  test('rule 1：caret intersects node edit range → source', () => {
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 5, head: 5 }))).toBe('source');
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 2, head: 2 }))).toBe('source'); // 边界 from
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 10, head: 10 }))).toBe('source'); // 边界 to
  });

  test('rule 1：caret 在节点外 → rendered', () => {
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 1, head: 1 }))).toBe('rendered');
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 11, head: 11 }))).toBe('rendered');
  });

  test('rule 2：selection intersects marker → source', () => {
    // 选区从节点外开始但碰 marker
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 1, head: 3 }))).toBe('source');
    // 选区覆盖尾部 marker
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 9, head: 12 }))).toBe('source');
  });

  test('rule 2：selection 只在内容中（不碰 marker）→ source（rule 1 命中节点）', () => {
    // 选区 [5,7] 在节点内 → rule 1 source
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 5, head: 7 }))).toBe('source');
  });

  test('rule 3：composition 与节点相交 → source', () => {
    // caret 在节点内 + composition → source
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 5, head: 5 }, { composing: true }))).toBe('source');
  });

  test('rule 3：composition 在别处（caret 节点外）→ rendered', () => {
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 1, head: 1 }, { composing: true }))).toBe('rendered');
  });

  test('rule 5/6：forceSource → source', () => {
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 1, head: 1 }, { forceSource: true }))).toBe('source');
  });

  test('默认（无命中）→ rendered', () => {
    expect(classifyNodeState(NODE, MARKERS, ctx({ anchor: 1, head: 1 }))).toBe('rendered');
  });
});

describe('渲染决策辅助', () => {
  test('shouldHideMarkers：仅 rendered 隐藏', () => {
    expect(shouldHideMarkers('rendered')).toBe(true);
    expect(shouldHideMarkers('source')).toBe(false);
    expect(shouldHideMarkers('mixed')).toBe(false);
    expect(shouldHideMarkers('invalid')).toBe(false);
  });

  test('shouldShowMarkers：source/invalid 显示', () => {
    expect(shouldShowMarkers('source')).toBe(true);
    expect(shouldShowMarkers('invalid')).toBe(true);
    expect(shouldShowMarkers('rendered')).toBe(false);
  });
});
