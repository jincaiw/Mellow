/**
 * markers.ts 测试 —— Lezer 节点常量与 heading marker 计算。
 */

import { CONTENT_NODE_NAMES, MARKER_NODE_NAMES, headingMarkerEnd } from '../src/markers';

describe('CONTENT_NODE_NAMES（决定 reveal 状态的内容节点）', () => {
  test('包含第一阶段全部内容节点', () => {
    for (const name of [
      'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
      'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
      'Emphasis', 'StrongEmphasis', 'Strikethrough', 'InlineCode',
    ]) {
      expect(CONTENT_NODE_NAMES.has(name)).toBe(true);
    }
  });
});

describe('MARKER_NODE_NAMES（应隐藏的 marker 子节点）', () => {
  test('包含全部 marker 节点类型', () => {
    for (const name of ['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark']) {
      expect(MARKER_NODE_NAMES.has(name)).toBe(true);
    }
  });
});

describe('headingMarkerEnd（`#` + 空格，与 Typora 一致）', () => {
  test.each([
    ['# Title', 2],
    ['## Title', 3],
    ['###### Title', 7],
  ])('%s → marker 长度 %d', (text, expected) => {
    expect(headingMarkerEnd(text)).toBe(expected);
  });

  test('无空格（#Title）只隐藏 #', () => {
    expect(headingMarkerEnd('#Title')).toBe(1);
  });

  test('多空格压缩（##   X）', () => {
    expect(headingMarkerEnd('##   X')).toBe(5);
  });

  test('纯 marker（# ）', () => {
    expect(headingMarkerEnd('# ')).toBe(2);
  });

  test('无法识别（非 heading）→ null', () => {
    expect(headingMarkerEnd('Title')).toBeNull();
    expect(headingMarkerEnd('plain text')).toBeNull();
  });
});
