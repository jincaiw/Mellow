import { countWords, formatWordCountStats } from '../src/wordCount';

describe('wordCount (PRD §70)', () => {
  test('empty document', () => {
    expect(countWords('')).toEqual({ cjkChars: 0, words: 0, chars: 0, lines: 0, readingTimeMinutes: 1 });
  });

  test('pure Chinese counts CJK chars', () => {
    const c = countWords('今天天气很好，我们去公园散步。');
    expect(c.cjkChars).toBe(13); // 今天天气很好(6) 我们去公园散步(7)
    expect(c.words).toBe(0);
    expect(c.lines).toBe(1);
  });

  test('pure English counts words', () => {
    const c = countWords('Hello Mellow world');
    expect(c.words).toBe(3);
    expect(c.cjkChars).toBe(0);
  });

  test('mixed Chinese + English', () => {
    const c = countWords('使用 Mellow 写 Markdown 文档');
    expect(c.cjkChars).toBe(5); // 使 用 写 文 档
    expect(c.words).toBe(2); // Mellow, Markdown
  });

  test('lines count', () => {
    expect(countWords('a\nb\nc').lines).toBe(3);
    expect(countWords('\n').lines).toBe(2);
  });

  test('hyphenated and apostrophe words', () => {
    expect(countWords("don't stop-believing").words).toBe(2);
  });

  test('reading time at least 1 minute', () => {
    expect(countWords('测试').readingTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  test('format zh', () => {
    const s = formatWordCountStats({ cjkChars: 5, words: 2, chars: 10, lines: 1, readingTimeMinutes: 1 }, 'zh');
    expect(s).toContain('5 字');
    expect(s).toContain('2 词');
  });

  test('format en', () => {
    const s = formatWordCountStats({ cjkChars: 0, words: 2, chars: 10, lines: 1, readingTimeMinutes: 1 }, 'en');
    expect(s).toContain('2 words');
  });
});
