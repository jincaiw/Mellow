/**
 * 框架测试 —— 节点注册表（NodeSpec 抽象）。
 */

import {
  registerNode,
  getNodeSpec,
  extractMarkers,
  contentNodeNames,
  markerNodeNames,
  registerHeadingNode,
  registerInlineNodes,
  headingMarkerEnd,
} from '../src/nodes';

describe('节点注册表', () => {
  test('内置节点注册（Heading + 内联格式）', () => {
    registerHeadingNode();
    registerInlineNodes();
    expect(contentNodeNames().has('ATXHeading1')).toBe(true);
    expect(contentNodeNames().has('StrongEmphasis')).toBe(true);
    expect(contentNodeNames().has('Emphasis')).toBe(true);
    expect(contentNodeNames().has('Strikethrough')).toBe(true);
    expect(contentNodeNames().has('InlineCode')).toBe(true);
    expect(markerNodeNames().has('HeaderMark')).toBe(true);
    expect(markerNodeNames().has('EmphasisMark')).toBe(true);
    expect(markerNodeNames().has('StrikethroughMark')).toBe(true);
    expect(markerNodeNames().has('CodeMark')).toBe(true);
  });

  test('未注册节点 → null（管线按 source 处理，安全）', () => {
    expect(getNodeSpec('FencedCode')).toBeNull();
    expect(getNodeSpec('ATXHeading7')).toBeNull();
  });

  test('自定义节点注册（可扩展性：新增节点不改管线）', () => {
    registerNode({
      contentNodeNames: ['ListMark'],
      markerNodeNames: ['CustomMarker'],
      extractMarkers: (_node, parent) => [
        { from: parent.from, to: parent.from + 2 },
      ],
    });
    const spec = getNodeSpec('ListMark');
    expect(spec).not.toBeNull();
    const markers = extractMarkers(spec!, { from: 10, to: 12, name: 'CustomMarker', text: '' }, { from: 10, text: '- item' });
    expect(markers).toEqual([{ from: 10, to: 12 }]);
  });
});

describe('marker 提取', () => {
  test('默认提取：marker 子节点自身范围', () => {
    const spec = getNodeSpec('StrongEmphasis')!;
    const markers = extractMarkers(spec, { from: 2, to: 4, name: 'EmphasisMark', text: '**' }, { from: 0, text: '**bold**' });
    expect(markers).toEqual([{ from: 2, to: 4 }]);
  });

  test('Heading 提取：`#` + 空格（绝对偏移）', () => {
    const spec = getNodeSpec('ATXHeading1')!;
    const markers = extractMarkers(spec, { from: 0, to: 1, name: 'HeaderMark', text: '#' }, { from: 0, text: '# Title' });
    expect(markers).toEqual([{ from: 0, to: 2 }]); // '# '

    const markers2 = extractMarkers(spec, { from: 0, to: 1, name: 'HeaderMark', text: '#' }, { from: 0, text: '#Title' });
    expect(markers2).toEqual([{ from: 0, to: 1 }]); // 无空格

    // 非 heading 文本 → null（source）
    const markers3 = extractMarkers(spec, { from: 0, to: 1, name: 'HeaderMark', text: '#' }, { from: 0, text: 'plain' });
    expect(markers3).toBeNull();
  });
});

describe('headingMarkerEnd（兼容）', () => {
  test.each([
    ['# Title', 2],
    ['## Title', 3],
    ['###   X', 6],
    ['#Title', 1],
  ])('%s → %d', (text, expected) => {
    expect(headingMarkerEnd(text)).toBe(expected);
  });

  test('非 heading → null', () => {
    expect(headingMarkerEnd('plain')).toBeNull();
  });
});
