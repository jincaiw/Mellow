import { describe, expect, test } from '@jest/globals';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { getNodesNamed, getReadableContent } from '../src/modules/lezer';
import * as editor from './utils/editor';

describe('Lezer parser', () => {
  test('test StrongEmphasis', () => {
    editor.setUp('**Hello** World');

    const types = parseTypes(window.editor);
    expect(types).toContain('StrongEmphasis');
    expect(types).toContain('EmphasisMark');
  });

  test('test Emphasis', () => {
    editor.setUp('*Hello* World');

    const types = parseTypes(window.editor);
    expect(types).toContain('Emphasis');
    expect(types).toContain('EmphasisMark');
  });

  test('test Strikethrough', () => {
    editor.setUp('~~Hello~~ World');

    const types = parseTypes(window.editor);
    expect(types).toContain('Strikethrough');
    expect(types).toContain('StrikethroughMark');
  });

  test('test InlineCode', () => {
    editor.setUp('`Hello` World');

    const types = parseTypes(window.editor);
    expect(types).toContain('InlineCode');
    expect(types).toContain('CodeMark');
  });

  test('test FencedCode', () => {
    editor.setUp('```\nHello World\n```');

    const types = parseTypes(window.editor);
    expect(types).toContain('FencedCode');
    expect(types).toContain('CodeMark');
    expect(types).toContain('CodeText');
  });

  test('test CodeBlock', () => {
    editor.setUp('    Hello World');

    const types = parseTypes(window.editor);
    expect(types).toContain('CodeBlock');
    expect(types).toContain('CodeText');
  });

  test('test ATXHeading', () => {
    editor.setUp('## Heading');

    const types = parseTypes(window.editor);
    expect(types).toContain('ATXHeading2');
    expect(types).toContain('HeaderMark');
  });

  test('test SetextHeading1', () => {
    editor.setUp('Heading\n======');

    const types = parseTypes(window.editor);
    expect(types).toContain('SetextHeading1');
    expect(types).toContain('HeaderMark');
  });

  test('test SetextHeading2', () => {
    editor.setUp('Heading\n------');

    const types = parseTypes(window.editor);
    expect(types).toContain('SetextHeading2');
    expect(types).toContain('HeaderMark');
  });

  test('test FrontMatter', () => {
    editor.setUp('---\ntitle: MarkEdit\n---\n\nHello World');

    const types = parseTypes(window.editor);
    expect(types).toContain('Frontmatter');
    expect(types).toContain('DashLine');
    expect(types).toContain('BlockMapping');
    expect(types).toContain('Pair');
    expect(types).toContain('Key');
    expect(types).toContain('Literal');
    expect(types).toContain(':');

    // These nodes are present without proper frontMatter parsing
    expect(types).not.toContain('HorizontalRule');
    expect(types).not.toContain('SetextHeading2');
    expect(types).not.toContain('HeaderMark');
  });

  test('test footnote', () => {
    editor.setUp('[^footnote]\n\n[^footnote]:');

    const types = parseTypes(window.editor);
    expect(types).toContain('Link');
    expect(types).toContain('LinkMark');
  });

  test('test markdown link', () => {
    editor.setUp('![image](url)\n\n[title](url)');

    const types = parseTypes(window.editor);
    expect(types).toContain('Image');
    expect(types).toContain('Link');
    expect(types).toContain('LinkMark');
    expect(types).toContain('URL');
  });

  test('test reference style link', () => {
    editor.setUp('[reference][link]\n\n[link]:');

    const types = parseTypes(window.editor);
    expect(types).toContain('Link');
    expect(types).toContain('LinkLabel');
  });

  test('test BlockMath', () => {
    editor.setUp('$$\nx = 1\n$$');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath with leading spaces', () => {
    editor.setUp('   $$\nx = 1\n$$');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath with trailing spaces', () => {
    editor.setUp('$$   \nx = 1\n$$   ');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath with leading and trailing spaces', () => {
    editor.setUp('  $$  \nx = 1\n  $$  ');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath single line', () => {
    editor.setUp('$$x = 1$$');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath in blockquote', () => {
    editor.setUp('> $$\n> x = 1\n> $$');
    expect(parseTypes(window.editor)).toContain('BlockMath');
  });

  test('test BlockMath not matched with non-whitespace prefix', () => {
    editor.setUp('x $$\nx = 1\nx $$');
    expect(parseTypes(window.editor)).not.toContain('BlockMath');
  });

  test('test getNodesNamed', () => {
    editor.setUp('[^footnote]\n\n[reference][link]\n\n[standard](link)');

    const nodes = getNodesNamed(window.editor.state, ['Link']);
    expect(nodes.length).toBe(3);
  });

  test('test getting readable content', () => {
    expect(getReadableContent('Hello')).toStrictEqual({
      trimmedText: 'Hello',
      paragraphCount: 1,
      commentCount: 0,
    });

    expect(getReadableContent('<!-- Hello -->')).toStrictEqual({
      trimmedText: '',
      paragraphCount: 0,
      commentCount: 1,
    });

    expect(getReadableContent('<!-- Hello -->\nWorld')).toStrictEqual({
      trimmedText: 'World',
      paragraphCount: 1,
      commentCount: 1,
    });

    expect(getReadableContent('<!-- Hello -->\n<!-- World -->')).toStrictEqual({
      trimmedText: '',
      paragraphCount: 0,
      commentCount: 2,
    });

    expect(getReadableContent('<!-- Hello --> World -->')).toStrictEqual({
      trimmedText: ' World -->',
      paragraphCount: 0,
      commentCount: 1,
    });

    expect(getReadableContent('Hello <!-- Hello \n\n World -->')).toStrictEqual({
      trimmedText: 'Hello <!-- Hello \n\n World -->',
      paragraphCount: 2,
      commentCount: 0,
    });

    expect(getReadableContent('<!-- Hello \n\n World -->')).toStrictEqual({
      trimmedText: '',
      paragraphCount: 0,
      commentCount: 1,
    });

    expect(getReadableContent('Hello <!-- Hello \n.\n. World -->')).toStrictEqual({
      trimmedText: 'Hello ',
      paragraphCount: 1,
      commentCount: 1,
    });

    expect(getReadableContent('<!-- Hello -->World\n\nHello <!-- World -->')).toStrictEqual({
      trimmedText: 'World\n\nHello ',
      paragraphCount: 1,
      commentCount: 2,
    });
  });
});

function parseTypes(editor: EditorView) {
  const types: string[] = [];
  // ⚠️ **Mellow 增补（2026-10-01）**：必须先**强制完成解析**再遍历。
  // `syntaxTree(state)` 返回的是「已解析到哪算哪」的**增量树** —— 视图刚建好时它可能只有
  // `Document` / `Body` 两个节点。实测（`npm run parity` 的 vendored jest 步骤）出现过：
  //   Expected value: "ATXHeading2" / Received array: ["Document", "Body"]
  // 即断言**在解析完成之前**跑掉了 —— 机器负载高时必现、空闲时通常不现 = 偶发假红。
  // `ensureSyntaxTree(state, upto)` 会**同步**把树补到指定位置（本文件文档都很小）。
  // 用 `?? syntaxTree(...)` 兜底（极端情况下 ensureSyntaxTree 可能返回 null）。
  const tree = ensureSyntaxTree(editor.state, editor.state.doc.length) ?? syntaxTree(editor.state);
  tree.iterate({
    enter: node => {
      types.push(node.type.name);
    },
  });

  return types;
}
