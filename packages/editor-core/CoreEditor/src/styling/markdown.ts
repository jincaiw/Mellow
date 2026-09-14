import { syntaxHighlighting } from '@codemirror/language';
import { Compartment } from '@codemirror/state';
import { closeBrackets } from '@codemirror/autocomplete';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { classHighlighter, tagHighlighter, styleTags } from '@lezer/highlight';
import { MarkdownConfig } from '@lezer/markdown';
import { markdownMathExtension as markdownMathConfig } from '../@vendor/joplin/markdownMathParser';
import { tags } from './builder';
import { linkDefinitionConfig } from './nodes/def';
import { listIndentStyle } from './nodes/indent';
import { inlineCodeStyle, codeBlockStyle, previewMermaid, previewMath } from './nodes/code';
import { previewTable, tableStyle } from './nodes/table';
import { frontMatterStyle } from './nodes/frontMatter';
import { taskMarkerStyle } from './nodes/task';

export const classHighlighters = [
  syntaxHighlighting(classHighlighter),
  syntaxHighlighting(tagHighlighter([
    { tag: tags.heading1, class: 'cm-md-header cm-md-heading1' },
    { tag: tags.heading2, class: 'cm-md-header cm-md-heading2' },
    { tag: tags.heading3, class: 'cm-md-header cm-md-heading3' },
    { tag: tags.heading4, class: 'cm-md-header cm-md-heading4' },
    { tag: tags.heading5, class: 'cm-md-header cm-md-heading5' },
    { tag: tags.heading6, class: 'cm-md-header cm-md-heading6' },
    { tag: tags.setextHeading1, class: 'cm-md-header cm-md-heading1 cm-md-setext-heading1' },
    { tag: tags.setextHeading2, class: 'cm-md-header cm-md-heading2 cm-md-setext-heading2' },
    { tag: tags.strong, class: 'cm-md-bold' },
    { tag: tags.emphasis, class: 'cm-md-italic' },
    { tag: tags.strikethrough, class: 'cm-md-strikethrough' },
    { tag: tags.url, class: 'cm-md-url' },
    { tag: tags.codeInfo, class: 'cm-md-codeInfo' },
    { tag: tags.codeMark, class: 'cm-md-codeMark' },
    { tag: tags.linkMark, class: 'cm-md-linkMark' },
    { tag: tags.listMark, class: 'cm-md-listMark' },
    { tag: tags.quote, class: 'cm-md-quote' },
    { tag: tags.quoteMark, class: 'cm-md-quoteMark' },
    { tag: tags.contentSeparator, class: 'cm-md-horizontalRule' },
  ])),
];

// https://code.haverbeke.berlin/lezer/markdown/src/branch/main/src/markdown.ts
export const markdownExtensions: MarkdownConfig[] = [
  {
    props: [
      styleTags({
        InlineCode: tags.inlineCode,
        CodeInfo: tags.codeInfo,
        CodeMark: tags.codeMark,
        ListMark: tags.listMark,
        QuoteMark: tags.quoteMark,
        LinkMark: tags.linkMark,
        LinkDefinition: tags.linkDefinition,
        LinkDefinitionID: tags.link,
        LinkDefinitionMark: tags.linkMark,
        'SetextHeading1/...': tags.setextHeading1,
        'SetextHeading2/...': tags.setextHeading2,
      }),
    ],
  },
  linkDefinitionConfig,
  markdownMathConfig,
];

/**
 * 自动配对（V7-W6，G7-EDIT-12）。
 *
 * 对齐 Typora 1.14.9 的 `Auto pair brackets and quotes`（配置键 `noPairingMatch`，
 * 默认 `false` 即**开启**；一手证据：`TypeMark/appsrc/main.js` 中
 * `autoCloseBrackets: !File.option.noPairingMatch`）。Mellow 此前把 `autoCharacterPairs`
 * 写死为 `true` 且无任何 UI —— 用户**无法关闭自动配对**。
 *
 * 两个消费点必须同进同退（CM6 的 `closeBrackets` **优先读语言数据**，
 * 语言数据里没有才回落到 `closeBrackets()` 的 `brackets` 配置）：
 *   ① `closeBrackets()` 本身（补全与跳过行为）；
 *   ② Markdown 语言数据的 `closeBrackets.brackets` 覆盖。
 *
 * 另注：`modules/input/index.ts` 也读同一个 `window.config.autoCharacterPairs`
 * （选区包裹 / 行内代码 / 代码块等 Markdown 字符辅助），关闭总开关时一并生效。
 */
export const autoPairCompartment = new Compartment;

/** 配对括号集：CM6 默认（`( [ { ' "`，见 `@codemirror/autocomplete` 的 `defaults.brackets`）
 *  + Mellow 扩展的反引号（用于行内代码）。 */
export const AUTO_PAIR_BRACKETS: readonly string[] = ['(', '[', '{', "'", '"', '`'];

/** 当前配置下应安装的自动配对扩展（关闭时为空数组 → 两处一起撤销）。 */
export function autoPairExtensions() {
  if (!window.config.autoCharacterPairs) return [];
  return [
    closeBrackets(),
    markdownLanguage.data.of({ closeBrackets: { brackets: AUTO_PAIR_BRACKETS } }),
  ];
}

/**
 * Extensions used in all scenarios.
 *
 * Order matters, smaller tokens go first.
 */
export const renderExtensions = [
  inlineCodeStyle,
  codeBlockStyle,
  listIndentStyle,
  tableStyle,
  frontMatterStyle,
];

/**
 * Extensions used only in the full editor, i.e., the preview extension doesn't use these.
 */
export const actionExtensions = [
  previewMermaid,
  previewMath,
  previewTable,
  taskMarkerStyle,
];
