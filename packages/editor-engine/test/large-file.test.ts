/**
 * Large File Mode 测试（PRD §109）。
 *
 * 覆盖：
 * - 触发阈值（>5MB / >50,000 行）与 classifyLargeFile 边界；
 * - 状态切换（setLargeFileMode / version / 空 dispatch 触发扩展重算）；
 * - 视口裁剪（largeFileViewportRange / parseMathSpans / parseMermaidBlocks 区间）；
 * - spellcheck 动态关闭（contentAttributes）；
 * - .mellow-large-file class（animation off 载体）；
 * - heavy decorations 数量上限。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import {
  classifyLargeFile,
  isLargeFileMode,
  largeFileVersion,
  setLargeFileMode,
  largeFileViewportRange,
  largeFileDecorationLimit,
  LARGE_FILE_BYTES_THRESHOLD,
  LARGE_FILE_LINES_THRESHOLD,
} from '../src/largeFile';
import { parseMathSpans } from '../src/math';
import { parseMermaidBlocks } from '../src/mermaid';
import { sleep } from './harness';

const MB = 1024 * 1024;

describe('Large File Mode — 触发阈值', () => {
  it('>5MB 或 >50,000 行触发', () => {
    expect(classifyLargeFile(LARGE_FILE_BYTES_THRESHOLD + 1, 1000)).toBe(true);
    expect(classifyLargeFile(1000, LARGE_FILE_LINES_THRESHOLD + 1)).toBe(true);
    expect(classifyLargeFile(LARGE_FILE_BYTES_THRESHOLD, LARGE_FILE_LINES_THRESHOLD)).toBe(false);
    expect(classifyLargeFile(1 * MB, 10_000)).toBe(false);
    expect(classifyLargeFile(0, 0)).toBe(false);
  });

  it('阈值常量正确', () => {
    expect(LARGE_FILE_BYTES_THRESHOLD).toBe(5 * MB);
    expect(LARGE_FILE_LINES_THRESHOLD).toBe(50_000);
  });
});

describe('Large File Mode — 状态切换', () => {
  afterEach(() => {
    setLargeFileMode(false);
  });

  it('setLargeFileMode 切换状态与 version', () => {
    expect(isLargeFileMode()).toBe(false);
    const v0 = largeFileVersion();
    setLargeFileMode(true);
    expect(isLargeFileMode()).toBe(true);
    expect(largeFileVersion()).toBe(v0 + 1);
    setLargeFileMode(true); // 幂等：不重复 dispatch
    expect(largeFileVersion()).toBe(v0 + 1);
    setLargeFileMode(false);
    expect(isLargeFileMode()).toBe(false);
  });

  it('editor 根元素加 .mellow-large-file class（animation off 载体）', async () => {
    const view = new EditorView({
      doc: '# 标题',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(false)],
    });
    expect(view.dom.classList.contains('mellow-large-file')).toBe(false);
    setLargeFileMode(true);
    await sleep(30);
    expect(view.dom.classList.contains('mellow-large-file')).toBe(true);
    setLargeFileMode(false);
    await sleep(30);
    expect(view.dom.classList.contains('mellow-large-file')).toBe(false);
    view.destroy();
  });

  it('spellcheck contentAttributes 动态关闭', async () => {
    const view = new EditorView({
      doc: '# 标题',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(false)],
    });
    const attr = (): string | null => view.contentDOM.getAttribute('spellcheck');
    expect(attr()).toBe('true');
    setLargeFileMode(true);
    await sleep(30);
    expect(attr()).toBe('false');
    setLargeFileMode(false);
    await sleep(30);
    expect(attr()).toBe('true');
    view.destroy();
  });
});

describe('Large File Mode — 视口裁剪', () => {
  afterEach(() => {
    setLargeFileMode(false);
  });

  const doc = [
    '# Title',
    '',
    '行内公式 $x_1 = 1$',
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '',
    'body text',
  ].join('\n');

  it('非大文件模式：parse 范围 = 全文档', () => {
    expect(parseMathSpans(doc).length).toBe(1);
    expect(parseMermaidBlocks(doc).length).toBe(1);
    const view = new EditorView({ doc, extensions: [markdown({ base: markdownLanguage }), install(false)] });
    const range = largeFileViewportRange(view);
    expect(range.from).toBe(0);
    expect(range.to).toBe(doc.length);
    view.destroy();
  });

  it('大文件模式：区间裁剪只解析视口附近', () => {
    const big = Array.from({ length: 5000 }, (_, i) => (i % 100 === 0 ? `# H${i}\n\n$$\nblock_${i}\n$$` : `line ${i}`)).join('\n');
    // 只扫区间 [0, 100) 字符附近 → 只命中开头的 math/mermaid 区域
    const mathInRange = parseMathSpans(big, 0, 200);
    const mathAll = parseMathSpans(big);
    expect(mathInRange.length).toBeLessThan(mathAll.length);
    expect(mathInRange.length).toBeGreaterThan(0);
  });

  it('parseMermaidBlocks 区间裁剪（fence 起始在区间外不解析）', () => {
    const src = ['a', '', '```mermaid', 'graph TD', '  A-->B', '```', '', 'tail'].join('\n');
    // 区间在文档后部（不含 fence 起始行）
    const late = parseMermaidBlocks(src, src.length - 10, src.length);
    expect(late.length).toBe(0);
    // 全文档 → 1 块
    expect(parseMermaidBlocks(src).length).toBe(1);
  });

  it('largeFileViewportRange 在 jsdom（无可见范围）fallback 全文档', () => {
    setLargeFileMode(true);
    const view = new EditorView({ doc, extensions: [markdown({ base: markdownLanguage }), install(false)] });
    const range = largeFileViewportRange(view);
    expect(range.from).toBe(0);
    expect(range.to).toBe(doc.length);
    view.destroy();
  });

  it('heavy decorations 数量上限：大文件模式有限值，非大文件不限', () => {
    expect(largeFileDecorationLimit()).toBe(Infinity);
    setLargeFileMode(true);
    expect(largeFileDecorationLimit()).toBe(4000);
  });
});

describe('Large File Mode — 扩展联动重算', () => {
  afterEach(() => {
    setLargeFileMode(false);
  });

  it('切换后 math widget 重算（视口裁剪生效，文档 math 不渲染为 widget 时不崩）', async () => {
    const doc = ['# T', '', '行内公式 $a^2$ 和 $b^2$', '', 'text'].join('\n');
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(false)],
    });
    // 切换不抛错（version 变化触发 math/mermaid/plugin 重算）
    setLargeFileMode(true);
    await sleep(30);
    setLargeFileMode(false);
    await sleep(30);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('mermaid widget 在切换后保持文档完整（重算不破坏文档）', async () => {
    const doc = ['# T', '', '```mermaid', 'graph TD', '  A-->B', '```'].join('\n');
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(false)],
    });
    setLargeFileMode(true);
    await sleep(30);
    setLargeFileMode(false);
    await sleep(30);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });
});
