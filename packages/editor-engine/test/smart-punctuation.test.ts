/**
 * Smart Punctuation 测试（master-plan R2-1：Typora 智能标点 parity）。
 * 覆盖：弯引号上下文判定 / em-dash 安全约束（hr、表格、三连击）/ 开关状态。
 */

import {
  isSmartPunctuationEnabled,
  setSmartPunctuation,
  shouldEmDash,
  smartQuoteFor,
} from '../src/smartPunctuation';

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
