/**
 * 无官方类型的小型 markdown-it 插件的类型声明。
 */

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt, options?: Record<string, unknown>) => void;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (
    md: MarkdownIt,
    options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean },
  ) => void;
  export default plugin;
}
