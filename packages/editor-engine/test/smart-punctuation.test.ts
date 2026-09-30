/**
 * Smart Punctuation 测试（master-plan R2-1：Typora 智能标点 parity）。
 * 覆盖：弯引号上下文判定 / em-dash 安全约束（hr、表格、三连击）/ 开关状态
 * / **代码上下文守卫（spec §11 / §16）**。
 */

import { EditorView } from '@codemirror/view';
import {
  isInsideCodeContext,
  isSmartPunctuationEnabled,
  setSmartPunctuation,
  shouldEmDash,
  smartQuoteFor,
} from '../src/smartPunctuation';
import { resetModeState } from '../src/index';
import { setUpEditor, sleep } from './harness';

describe('smartQuoteFor（直引号 → 弯引号）', () => {
  it('行首/空前置 → 左引号', () => {
    expect(smartQuoteFor('"', '')).toBe('“');
    expect(smartQuoteFor("'", '')).toBe('‘');
  });

  it('空白/开括号前置 → 左引号', () => {
    expect(smartQuoteFor('"', ' ')).toBe('“');
    expect(smartQuoteFor('"', '(')).toBe('“');
    expect(smartQuoteFor('"', '（')).toBe('“');
  });

  it('字母/中文后 → 右引号', () => {
    expect(smartQuoteFor('"', 'a')).toBe('”');
    expect(smartQuoteFor('"', '文')).toBe('”');
    expect(smartQuoteFor("'", 's')).toBe('’');
  });

  it('闭合引号后再输 → 交替', () => {
    // “abc 后输入 → 右引号（成对闭合）
    expect(smartQuoteFor('"', 'c')).toBe('”');
  });

  it('非引号输入原样返回', () => {
    expect(smartQuoteFor('a', ' ')).toBe('a');
    expect(smartQuoteFor('，', 'x')).toBe('，');
  });
});

describe('shouldEmDash（-- + 空格 → em-dash 安全判定）', () => {
  it('行内 -- 触发', () => {
    expect(shouldEmDash('word --')).toBe(true);
    expect(shouldEmDash('中 --')).toBe(true);
  });

  it('行首 -- 不触发（hr 输入中途）', () => {
    expect(shouldEmDash('--')).toBe(false);
  });

  it('三连 - 中途不触发（hr 语法保护）', () => {
    expect(shouldEmDash('x ---')).toBe(false);
  });

  it('表格 delimiter 行不触发（| --- | 内）', () => {
    expect(shouldEmDash('| a | b |')).toBe(false); // 无 -- 结尾
    expect(shouldEmDash('| --- | --')).toBe(false); // 有 -- 结尾但含 |：不触发
  });

  it('非 -- 结尾不触发', () => {
    expect(shouldEmDash('word -')).toBe(false);
    expect(shouldEmDash('word')).toBe(false);
  });
});

describe('开关状态', () => {
  afterEach(() => {
    setSmartPunctuation(false); // 复位默认
  });

  it('默认关闭', () => {
    expect(isSmartPunctuationEnabled()).toBe(false);
  });

  it('setSmartPunctuation 切换', () => {
    setSmartPunctuation(true);
    expect(isSmartPunctuationEnabled()).toBe(true);
    setSmartPunctuation(false);
    expect(isSmartPunctuationEnabled()).toBe(false);
  });
});

// ─────────────────────── 代码上下文守卫（spec §11 / §16） ───────────────────────
//
// 立此分节的理由（2026-10-01 审计 §4.35）：
// 智能标点是**全局 inputHandler**，原先**没有代码感知** —— 开启后，在 `` `code` ``
// 或代码围栏内键入 `"` 会被改写成弯引号，即**静默改写代码文本**（spec §2 唯一真源 / §16）。
// 而既有用例 `format-code-fence.test.ts`「code 内编辑保留源码（无 smart punctuation 改写）」
// 用的是**程序化 `dispatch`** —— inputHandler 只对**用户输入**触发，故该断言恒真、覆盖为零。
//
// 本节的测试**走真实的 inputHandler facet 链**（`state.facet(EditorView.inputHandler)`），
// 这是 jsdom 下能到达的最接近真实按键的路径；不是 `view.dispatch` 那种绕过 handler 的形态。

/** 依次调用已注册的 inputHandler，直到某个接管（返回 true）—— 与 CodeMirror 的调用方式一致 */
function typeThroughInputHandler(view: EditorView, from: number, text: string): boolean {
  const handlers = view.state.facet(EditorView.inputHandler);
  // 第 5 个参数是**惰性事务工厂**（`() => Transaction`），即「未被接管时 CodeMirror 会插入的事务」
  const insert = () => view.state.update({ changes: { from, insert: text } });
  for (const handler of handlers) {
    if (handler(view, from, from, text, insert)) return true;
  }
  return false;
}

describe('代码上下文守卫（spec §11 inline code / §16 code fence）', () => {
  beforeEach(() => {
    resetModeState();
    setSmartPunctuation(true); // 守卫只在功能开启时才可能被触发，故本分节全程开启
  });
  afterEach(() => {
    setSmartPunctuation(false);
  });

  it('isInsideCodeContext：行内代码内为 true、普通文本为 false', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const inside = doc.indexOf('code') + 2; // `code` 内部
      const outside = doc.indexOf(' b') + 1; // 节点外
      expect(isInsideCodeContext(view.state, inside)).toBe(true);
      expect(isInsideCodeContext(view.state, outside)).toBe(false);
    } finally { view.destroy(); }
  });

  it('isInsideCodeContext：代码围栏内为 true、围栏外为 false', async () => {
    const view = setUpEditor('```\nconst x = 1;\n```\n\nplain');
    try {
      await sleep();
      expect(isInsideCodeContext(view.state, 8)).toBe(true); // 'const' 内
      expect(isInsideCodeContext(view.state, 21)).toBe(false); // 'plain' 内
    } finally { view.destroy(); }
  });

  it('行内代码内键入 " → inputHandler 不接管（保持直引号，不被改成弯引号）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const pos = doc.indexOf('code') + 4; // `code` 末尾
      const handled = typeThroughInputHandler(view, pos, '"');
      expect(handled).toBe(false);
      // handler 未接管 → 文本一字未改（真实浏览器中 CodeMirror 会插入用户输入的直引号）
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  it('代码围栏内键入 " → inputHandler 不接管', async () => {
    const view = setUpEditor('```\nconst x = "abc"\n```');
    try {
      await sleep();
      const before = view.state.doc.toString();
      const pos = before.indexOf('"abc"') + 5; // 代码文本内
      const handled = typeThroughInputHandler(view, pos, '"');
      expect(handled).toBe(false);
      expect(view.state.doc.toString()).toBe(before);
    } finally { view.destroy(); }
  });

  it('反向对照：普通文本中键入 " → inputHandler 接管并转成弯引号（守卫不是「一律不转」）', async () => {
    const view = setUpEditor('a b');
    try {
      await sleep();
      const handled = typeThroughInputHandler(view, 3, '"');
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe('a b”'); // 'b' 之后 → 右引号
    } finally { view.destroy(); }
  });

  it('反向对照：行内代码**之后**的普通文本仍可转换（守卫范围不越界）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const doc = view.state.doc.toString();
      const afterCode = doc.length; // 文档末尾，已在节点外
      const handled = typeThroughInputHandler(view, afterCode, '"');
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe('a `code` b”');
    } finally { view.destroy(); }
  });
});
