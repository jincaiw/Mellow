import { EditorColors, EditorTheme } from '../types';
import { buildTheme, buildHighlight, tags } from '../builder';
import { darkBase as base } from './colors';

const colors: EditorColors = {
  accent: '#79c0ff',
  text: '#c9d1d9',
  comment: '#8b949e',
  background: '#0d1116',
  caret: '#58a6ff',
  selection: '#264f78',
  activeLine: '#6e76811a',
  matchingBracket: '#24432e',
  lineNumber: '#6e7681',
  searchMatch: '#f2cc607f',
  selectionHighlight: '#3fb95040',
  visibleSpace: '#484f58',
  lighterBackground: '#484f5866',
  bracketBorder: '#358a43',
};

function theme() {
  return buildTheme(colors, 'dark');
}

function highlight() {
  // Order matters, don't change it unless you fully understand how it works
  return buildHighlight(colors, [
    { tag: [tags.keyword, tags.modifier, tags.operator, tags.operatorKeyword], color: '#ff7b72' },
    { tag: [tags.literal, tags.inserted, tags.tagName], color: base.green },
    { tag: [tags.deleted, tags.macroName], color: base.red },
    { tag: [tags.className, tags.definition(tags.propertyName), tags.definition(tags.typeName), tags.codeInfo], color: '#ffa657' },
    // V7-I3：列表标记 Typora 对齐——与正文同色（此前 #ffa657 橙色）
    { tag: tags.listMark, color: colors.text },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#d2a8ff' },
    { tag: [tags.meta, tags.comment], color: colors.comment, fontStyle: 'italic' },
    { tag: [tags.link, tags.escape, tags.string, tags.regexp, tags.special(tags.string)], color: '#a5d6ff' },
    { tag: [tags.url, tags.linkMark, tags.propertyName], color: colors.text },
    // V7-I3：引用 Typora 对齐——灰色非斜体（此前绿色斜体）
    { tag: [tags.quote, tags.quoteMark], color: '#8b949e' },
  ], 'dark');
}

export default function GitHubDark(): EditorTheme {
  return {
    colors,
    extension: [theme(), highlight()],
  };
}

export { colors };
