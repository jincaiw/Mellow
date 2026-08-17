/**
 * Word Count（PRD §70）—— 中文优化的字数统计。
 *
 * 口径：
 * - cjkChars：CJK 统一表意文字（汉字）数；
 * - words：英文/数字词数（连续的 [A-Za-z0-9] 序列）；
 * - chars：全部字符数（不含换行）；
 * - lines：行数；
 * - readingTime：阅读时长（分钟），中文按 300 字/分、英文按 200 词/分估算。
 */

export interface WordCount {
  cjkChars: number;
  words: number;
  chars: number;
  lines: number;
  readingTimeMinutes: number;
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
const WORD_RE = /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g;

export function countWords(text: string): WordCount {
  const safe = text ?? '';
  const lines = safe.length === 0 ? 0 : safe.split('\n').length;
  const cjkMatches = safe.match(CJK_RE);
  const cjkChars = cjkMatches === null ? 0 : cjkMatches.length;
  const wordMatches = safe.match(WORD_RE);
  const words = wordMatches === null ? 0 : wordMatches.length;
  const chars = safe.replace(/\n/g, '').length;
  const readingTimeMinutes = Math.max(1, Math.ceil(cjkChars / 300 + words / 200));
  return { cjkChars, words, chars, lines, readingTimeMinutes };
}

/**
 * 状态栏展示串（PRD §70）：中文优先显示「N 字 · M 词 · K 行」。
 */
export function formatWordCountStats(count: WordCount, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    return count.cjkChars + ' 字 · ' + count.words + ' 词 · ' + count.chars + ' 字符 · ' + count.lines + ' 行';
  }
  return count.words + ' words · ' + count.cjkChars + ' CJK · ' + count.chars + ' chars · ' + count.lines + ' lines';
}
