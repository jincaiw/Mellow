/**
 * Code Fence language autocomplete（RC UX parity B3）。
 *
 * 输入代码围栏（``` / ~~~）后自动补全语言名（对齐 Typora）。
 * 实现：@codemirror/autocomplete（运行时经 window.require 注入，与其余引擎扩展一致）；
 * 仅当光标行是「未带语言的围栏行」时提供补全（override 只保留本来源，不干扰其他输入）。
 */

import type { Extension } from '@codemirror/state';

/** 常见语言列表（Typora 同款常用集） */
const FENCE_LANGUAGES: Array<{ label: string; detail: string }> = [
  { label: 'markdown', detail: 'Markdown' },
  { label: 'javascript', detail: 'JavaScript' },
  { label: 'js', detail: 'JavaScript' },
  { label: 'typescript', detail: 'TypeScript' },
  { label: 'ts', detail: 'TypeScript' },
  { label: 'jsx', detail: 'React JSX' },
  { label: 'tsx', detail: 'React TSX' },
  { label: 'json', detail: 'JSON' },
  { label: 'yaml', detail: 'YAML' },
  { label: 'yml', detail: 'YAML' },
  { label: 'toml', detail: 'TOML' },
  { label: 'ini', detail: 'INI' },
  { label: 'xml', detail: 'XML' },
  { label: 'html', detail: 'HTML' },
  { label: 'css', detail: 'CSS' },
  { label: 'scss', detail: 'SCSS' },
  { label: 'rust', detail: 'Rust' },
  { label: 'python', detail: 'Python' },
  { label: 'py', detail: 'Python' },
  { label: 'c', detail: 'C' },
  { label: 'cpp', detail: 'C++' },
  { label: 'csharp', detail: 'C#' },
  { label: 'java', detail: 'Java' },
  { label: 'go', detail: 'Go' },
  { label: 'kotlin', detail: 'Kotlin' },
  { label: 'swift', detail: 'Swift' },
  { label: 'php', detail: 'PHP' },
  { label: 'ruby', detail: 'Ruby' },
  { label: 'sh', detail: 'Shell' },
  { label: 'bash', detail: 'Bash' },
  { label: 'zsh', detail: 'Zsh' },
  { label: 'sql', detail: 'SQL' },
  { label: 'makefile', detail: 'Makefile' },
  { label: 'dockerfile', detail: 'Dockerfile' },
  { label: 'mermaid', detail: 'Mermaid diagram' },
  { label: 'math', detail: 'Math' },
  { label: 'latex', detail: 'LaTeX' },
  { label: 'csv', detail: 'CSV' },
  { label: 'txt', detail: 'Plain text' },
];

/** CompletionContext / CompletionResult 结构子集（避免依赖导入） */
interface CompletionContextLike {
  pos: number;
  state: { sliceDoc(from: number, to: number): string };
}
interface CompletionResultLike {
  from: number;
  options: Array<{ label: string; type?: string; detail?: string; apply?: string }>;
  validFor: RegExp;
}

interface AutoCompleteRuntime {
  autocompletion: (config?: unknown) => Extension;
}

function resolveAutoComplete(): AutoCompleteRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  return requireFn('@codemirror/autocomplete') as AutoCompleteRuntime;
}

/** 围栏行补全源（纯函数，可测） */
export function fenceLangSource(context: CompletionContextLike): CompletionResultLike | null {
  const textBefore = context.state.sliceDoc(0, context.pos);
  const lastLine = textBefore.slice(textBefore.lastIndexOf('\n') + 1);
  const match = lastLine.match(/^ {0,3}(`{3,}|~{3,})([a-zA-Z0-9_-]*)$/);
  if (match === null) return null;
  const typed = match[2] ?? '';
  const options = FENCE_LANGUAGES.filter((l) => l.label.startsWith(typed.toLowerCase())).map((l) => ({
    label: l.label,
    type: 'keyword',
    detail: l.detail,
    apply: `${l.label} `,
  }));
  return {
    from: context.pos - typed.length,
    options,
    validFor: /^[a-zA-Z0-9_-]*$/,
  };
}

/** 构建扩展：围栏语言自动补全（RC parity B3） */
export function buildCodeFenceAutocompleteExtension(): Extension {
  const { autocompletion } = resolveAutoComplete();
  return autocompletion({
    override: [fenceLangSource as never],
  });
}
