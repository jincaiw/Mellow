/**
 * emoji 补全（Typora 深度对标）：输入 `:smile:` 前缀弹出补全 → 插入 emoji。
 *
 * 基于 @codemirror/autocomplete（编辑器内核运行时已内置）：override 保留围栏语言补全，
 * 追加 emoji 源 —— 触发条件：光标前是 `:字母` 模式（GitHub emoji shortcode）。
 */


/** 常用 GitHub emoji（shortcode → 字符） */
const EMOJI: Array<[string, string]> = [
  ['smile', '😄'], ['smiley', '😃'], ['grinning', '😀'], ['laughing', '😆'], ['joy', '😂'],
  ['wink', '😉'], ['blush', '😊'], ['heart_eyes', '😍'], ['kissing_heart', '😘'], ['thinking', '🤔'],
  ['sunglasses', '😎'], ['sleeping', '😴'], ['angry', '😠'], ['cry', '😢'], ['sob', '😭'],
  ['fearful', '😨'], ['astonished', '😲'], ['flushed', '😳'], ['sweat_smile', '😅'], ['relieved', '😌'],
  ['heart', '❤️'], ['broken_heart', '💔'], ['sparkles', '✨'], ['star', '⭐'], ['fire', '🔥'],
  ['thumbsup', '👍'], ['thumbsdown', '👎'], ['clap', '👏'], ['raised_hands', '🙌'], ['ok_hand', '👌'],
  ['pray', '🙏'], ['wave', '👋'], ['muscle', '💪'], ['point_up', '☝️'], ['point_right', '👉'],
  ['check', '✅'], ['x', '❌'], ['warning', '⚠️'], ['question', '❓'], ['exclamation', '❗'],
  ['rocket', '🚀'], ['bug', '🐛'], ['bulb', '💡'], ['book', '📖'], ['memo', '📝'],
  ['coffee', '☕'], ['beer', '🍺'], ['pizza', '🍕'], ['apple', '🍎'], ['tada', '🎉'],
  ['trophy', '🏆'], ['medal', '🏅'], ['100', '💯'], ['zzz', '💤'], ['eyes', '👀'],
];

interface CompletionContextLike {
  pos: number;
  state: { sliceDoc(from: number, to: number): string };
}
interface CompletionResultLike {
  from: number;
  options: Array<{ label: string; type?: string; detail?: string; apply?: string }>;
  validFor?: RegExp;
}

/** emoji 补全源（纯函数，可测） */
export function emojiSource(context: CompletionContextLike): CompletionResultLike | null {
  const before = context.state.sliceDoc(0, context.pos);
  // 匹配 `:name`（冒号 + 字母；不在行内代码内——粗粒度：不检查反引号，emojicode 罕见）
  const m = /:([a-zA-Z0-9_+-]*)$/.exec(before);
  if (m === null || m[1].length < 1) return null;
  const typed = m[1].toLowerCase();
  const options = EMOJI
    .filter(([shortcode]) => shortcode.startsWith(typed))
    .map(([shortcode, ch]) => ({
      label: shortcode,
      type: 'emoji',
      detail: ch,
      apply: `${ch} `,
    }));
  if (options.length === 0) return null;
  return {
    from: context.pos - m[1].length - 1, // 从冒号开始替换
    options,
    validFor: /^:[a-zA-Z0-9_+-]*$/,
  };
}

// 注：emoji 源经 codeFence 扩展的 extraSources 合并（autocompletion 单实例）
