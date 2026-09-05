/**
 * C1（第四轮，Typora parity）：documentSuggestedName 首行/首个标题 → 建议文件名。
 */
import { documentSuggestedName } from '../src/document';

describe('documentSuggestedName', () => {
  test('取首个 # 标题（去 markdown 强调与非法字符）', () => {
    expect(documentSuggestedName('# Hello *World*\n\nbody')).toBe('Hello World');
    expect(documentSuggestedName('前言\n\n# 核心：**方案**\n')).toBe('核心：方案');
  });

  test('无标题时取首个非空行并截断 ≤48 字符', () => {
    expect(documentSuggestedName('\n\n第一行内容\n第二行')).toBe('第一行内容');
    const long = 'x'.repeat(60);
    expect(documentSuggestedName(long)).toHaveLength(48);
  });

  test('链接/图片语法降为文本；空文档返回 null', () => {
    expect(documentSuggestedName('# [文档标题](https://a.b)\n')).toBe('文档标题');
    expect(documentSuggestedName('![图](img.png) 的说明\n')).toBe('的说明');
    expect(documentSuggestedName('')).toBeNull();
    expect(documentSuggestedName('   \n\n')).toBeNull();
    expect(documentSuggestedName('# 标题\n# 第二个')).toBe('标题');
  });

  test('净化非法文件名字符（/ \\ : * ? " < > |）', () => {
    expect(documentSuggestedName('# a/b:c*d?e"f<g>h|i\n')).toBe('abcdefghi');
  });
});
