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
  /** 段落数（master-plan R2-2：非空行块） */
  paragraphs: number;
  /** 不含空格字符数（master-plan R2-2：Typora 字数统计窗口口径） */
  charsNoSpace: number;
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
  // 段落 = 连续非空行块（Typora 口径；空行分隔）
  const paragraphs = safe.split(/\n+/).filter((block) => block.trim() !== '').length;
  const charsNoSpace = safe.replace(/\s/g, '').length;
  return { cjkChars, words, chars, lines, readingTimeMinutes, paragraphs, charsNoSpace };
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

/**
 * G7-SHELL-11（选区字数）—— 一手证据与口径裁决（2026-11-08）：
 * Typora `frame.js` WordCount：页脚 label 有选区时显示 `sel / all Unit`
 * （`updateLabel`：`0<e&&e<t` 才出后缀；`e<0` 复用上次的 selCount），mac 侧
 * `getLabelsToShowOnMac` 把 `|` 分隔的 sel 值推给原生标题；面板行值有 `-sel`
 * 对应单元（`ty-show-word-count-in-selection` 门控）。
 * ⚠️ **口径裁决**：Typora 的选区/整篇共用它自己的 `a(e)` 词计数（CJK 逐字计 +
 * 标点段折叠 + 哨兵 token，node 直接执行原式实测 `你好世界→4`、
 * `hello 你好 world→4`）。Mellow **不移植**该函数、选区仍走既有 `countWords`：
 * ① `cjkChars + words` 在常规中英混排上与 `a(e)` 同值；
 * ② `sel / all` 串的**两端必须同一口径**（否则「选区词数」可能大于同屏的
 *   「整篇词数」这类荒谬显示）—— 双口径 = 「同一操作两套实现」母题
 *   （G7-SIDE-09），本仓已为它付过学费；
 * ③ 与 Typora 绝对值的口径差本就登记在 D-AS/D-AO，不因选区功能重开。
 * ⇒ 选区后缀串在宿主侧统一走 i18n `status.wordCountSel`（标题栏与页脚同一 builder），
 *   本模块只负责计数口径；「有选区才出后缀」的门（`0<sel<all`）判定也在宿主。
 */
