import { LanguageDescription, LanguageSupport, StreamLanguage, StreamParser } from '@codemirror/language';

/**
 * Code languages shipped with the app, the rest comes from the MarkEdit-language-data extension.
 *
 * v1.5.4：真机反馈「代码块无高亮」——此前仅内置 HTML/Markdown（lang-data 扩展从未 vendored）。
 * 现基于 node_modules 已有的 @codemirror/lang-* 原生包 + @codemirror/legacy-modes StreamParser
 * 补齐常用语言，load 内动态 import 保持分包，零新增依赖。
 */

/** 极简 JSON StreamParser（legacy-modes 无 JSON 模式）：字符串/数字/关键字/标点 */
const jsonStreamParser: StreamParser<unknown> = {
  name: 'json',
  token(stream) {
    if (stream.match(/^"/) === true) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') {
          stream.next(); // 跳过转义字符
          continue;
        }
        if (ch === '"') break;
      }
      return 'string';
    }
    if (stream.match(/^(?:true|false|null)\b/) === true) return 'atom';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/) === true) return 'number';
    if (stream.match(/^[{}[\]:,]/) === true) return 'keyword'; // 标点用 keyword 色以获得稳定样式
    stream.next();
    return null;
  },
};

/** StreamParser → 动态 load（返回 LanguageSupport） */
function streamLoader(pick: () => Promise<StreamParser<unknown>>) {
  return async () => new LanguageSupport(StreamLanguage.define(await pick()));
}

export function bundledLanguages(html: LanguageSupport) {
  return [
    LanguageDescription.of({
      name: 'HTML',
      alias: ['xhtml'],
      extensions: ['html', 'htm', 'handlebars', 'hbs'],
      support: html,
    }),
    LanguageDescription.of({
      name: 'Markdown',
      extensions: ['md', 'markdown', 'mkd'],
      load: async () => (await import('@codemirror/lang-markdown')).markdown(),
    }),
    LanguageDescription.of({
      name: 'JavaScript',
      alias: ['js', 'jsx', 'mjs', 'cjs', 'node'],
      extensions: ['js', 'jsx', 'mjs', 'cjs'],
      load: async () => (await import('@codemirror/lang-javascript')).javascript(),
    }),
    LanguageDescription.of({
      name: 'TypeScript',
      alias: ['ts', 'tsx'],
      extensions: ['ts', 'tsx'],
      load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
    }),
    LanguageDescription.of({
      name: 'CSS',
      alias: ['scss', 'less'],
      extensions: ['css', 'scss', 'less'],
      load: async () => (await import('@codemirror/lang-css')).css(),
    }),
    LanguageDescription.of({
      name: 'YAML',
      alias: ['yml'],
      extensions: ['yaml', 'yml'],
      load: async () => (await import('@codemirror/lang-yaml')).yaml(),
    }),
    LanguageDescription.of({
      name: 'JSON',
      alias: ['jsonc', 'json5'],
      extensions: ['json', 'jsonc', 'map'],
      load: streamLoader(async () => jsonStreamParser),
    }),
    LanguageDescription.of({
      name: 'Python',
      alias: ['py', 'python3'],
      extensions: ['py', 'pyw'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/python')).python),
    }),
    LanguageDescription.of({
      name: 'Shell',
      alias: ['bash', 'sh', 'zsh', 'shell-script'],
      extensions: ['sh', 'bash', 'zsh'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell),
    }),
    LanguageDescription.of({
      name: 'C',
      extensions: ['c', 'h'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/clike')).c),
    }),
    LanguageDescription.of({
      name: 'C++',
      alias: ['cpp', 'cc', 'cxx'],
      extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp),
    }),
    LanguageDescription.of({
      name: 'Java',
      extensions: ['java'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/clike')).java),
    }),
    LanguageDescription.of({
      name: 'C#',
      alias: ['csharp', 'cs'],
      extensions: ['cs'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp),
    }),
    LanguageDescription.of({
      name: 'Kotlin',
      alias: ['kt'],
      extensions: ['kt', 'kts'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin),
    }),
    LanguageDescription.of({
      name: 'Swift',
      extensions: ['swift'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift),
    }),
    LanguageDescription.of({
      name: 'Go',
      alias: ['golang'],
      extensions: ['go'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/go')).go),
    }),
    LanguageDescription.of({
      name: 'Rust',
      alias: ['rs'],
      extensions: ['rs'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/rust')).rust),
    }),
    LanguageDescription.of({
      name: 'SQL',
      alias: ['mysql', 'postgresql', 'postgres', 'sqlite'],
      extensions: ['sql'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/sql')).standardSQL),
    }),
    LanguageDescription.of({
      name: 'XML',
      alias: ['svg'],
      extensions: ['xml', 'svg'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/xml')).xml),
    }),
    LanguageDescription.of({
      name: 'Dockerfile',
      alias: ['docker'],
      extensions: ['dockerfile'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile),
    }),
    LanguageDescription.of({
      name: 'Diff',
      alias: ['patch'],
      extensions: ['diff', 'patch'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/diff')).diff),
    }),
    LanguageDescription.of({
      name: 'Lua',
      extensions: ['lua'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/lua')).lua),
    }),
    LanguageDescription.of({
      name: 'Ruby',
      alias: ['rb'],
      extensions: ['rb'],
      load: streamLoader(async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby),
    }),
  ];
}
