/**
 * Text Replacement 测试（G7-MENU-05「替换 → 文本替换」余项）。
 *
 * 一手真值（Typora 1.14.9 `handleUserReplacement`，审计 §4.360「六」16）：
 * phrase 必须**打完后再键入一个字符**才触发替换，触发字符保留
 * （`n = textarea.value 去掉最后键入字符`；`find(e => n.endsWith(e))`）。
 * 本测试锁：触发时机、最长 phrase、行首硬界、保护上下文、开关与空表、
 * Undo/Redo 与光标、IME composition 不触发。
 */

import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  getTextReplacementEntries,
  isTextReplacementEnabled,
  matchTextReplacement,
  setTextReplacementEnabled,
  setTextReplacementEntries,
  type TextReplacementEntry,
} from '../src/textReplacement';
import { install } from '../src/index';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { setUpEditor } from './harness';

const DICT: TextReplacementEntry[] = [
  { phrase: '(c)', value: '©' },
  { phrase: 'omw', value: 'on my way' },
  { phrase: 'omw!', value: 'I am on my way!' }, // 最长 phrase 优先
  { phrase: 'yours', value: 'you’re' },
];

/** 经 inputHandler 面模拟用户键入一个字符（与 smart-punctuation.test 同法） */
function typeChar(view: EditorView, from: number, text: string): boolean {
  const handlers = view.state.facet(EditorView.inputHandler);
  const insert = () => view.state.update({ changes: { from, insert: text } });
  for (const handler of handlers) {
    if (handler(view, from, from, text, insert)) return true;
  }
  return false;
}

function viewWith(doc: string, caret: number): EditorView {
  const view = setUpEditor(doc);
  view.dispatch({ selection: { anchor: caret } });
  return view;
}

describe('matchTextReplacement（纯匹配，Typora 触发时机）', () => {
  it('prefix 以 phrase 结尾才命中（触发字符不进 prefix）', () => {
    expect(matchTextReplacement('hi (c)', DICT, 100)).toEqual({ phrase: '(c)', value: '©' });
    expect(matchTextReplacement('hi (C)', DICT, 100)).toBeNull();
  });

  it('多命中取最长 phrase', () => {
    expect(matchTextReplacement('omw', DICT, 100)?.value).toBe('on my way');
    expect(matchTextReplacement('omw!', DICT, 100)?.value).toBe('I am on my way!');
  });

  it('phrase 越过行首（maxBack 不足）不命中', () => {
    // 行首即光标处只有 2 个字符可回退，`(c)`（3）放不下
    expect(matchTextReplacement('(c)', DICT, 2)).toBeNull();
    expect(matchTextReplacement('(c)', DICT, 3)).not.toBeNull();
  });

  it('空 phrase 条目被 set 过滤；空词典恒不命中', () => {
    setTextReplacementEntries([{ phrase: '', value: 'x' }, ...DICT]);
    expect(getTextReplacementEntries().every((e) => e.phrase.length > 0)).toBe(true);
    setTextReplacementEntries([]);
    expect(matchTextReplacement('hi (c)', [], 100)).toBeNull();
  });
});

describe('文本替换输入行为（引擎装配后）', () => {
  beforeEach(() => {
    setTextReplacementEntries(DICT);
    setTextReplacementEnabled(true);
  });
  afterEach(() => {
    setTextReplacementEnabled(false);
    setTextReplacementEntries([]);
  });

  it('打完 phrase 后键入下一字符 → 替换且触发字符保留', () => {
    const view = viewWith('hi (c)', 6);
    try {
      expect(typeChar(view, 6, ' ')).toBe(true);
      expect(view.state.doc.toString()).toBe('hi © ');
      expect(view.state.selection.main.head).toBe(5);
    } finally { view.destroy(); }
  });

  it('行首 phrase + 触发字符不越界（maxBack = 行内已打字符数）', () => {
    const view = viewWith('(c)', 0);
    try {
      // 光标在行首：prefix 为空，无替换
      expect(typeChar(view, 0, ' ')).toBe(false);
    } finally { view.destroy(); }
  });

  it('未打完 phrase 不触发', () => {
    const view = viewWith('om', 2);
    try {
      expect(typeChar(view, 2, ' ')).toBe(false);
    } finally { view.destroy(); }
  });

  it('开关关闭 / 词典为空 ⇒ 恒 no-op', () => {
    const view = viewWith('hi (c)', 6);
    try {
      setTextReplacementEnabled(false);
      expect(typeChar(view, 6, ' ')).toBe(false);
      setTextReplacementEnabled(true);
      const saved = getTextReplacementEntries();
      setTextReplacementEntries([]);
      expect(typeChar(view, 6, ' ')).toBe(false);
      setTextReplacementEntries(saved);
      expect(typeChar(view, 6, ' ')).toBe(true);
    } finally { view.destroy(); }
  });

  it('代码 / URL 上下文不替换；行外同串正常替换（对照组）', () => {
    // doc: "run `omw`" — 光标 8 = 闭合反引号前（omw 在 5..7），prefix 以 omw 结尾且在 InlineCode 内
    const code = viewWith('run `omw`', 8);
    try {
      expect(typeChar(code, 8, '!')).toBe(false);
    } finally { code.destroy(); }
    // doc: "[a](http://h/omw)" — 光标 16 = 右括号前，prefix 以 omw 结尾且在 URL 内
    const url = viewWith('[a](http://h/omw)', 16);
    try {
      expect(typeChar(url, 16, '!')).toBe(false);
    } finally { url.destroy(); }
    // 对照：同样以 omw 结尾但在正文 → 替换
    const plain = viewWith('say omw', 7);
    try {
      expect(typeChar(plain, 7, '!')).toBe(true);
      expect(plain.state.doc.toString()).toBe('say on my way!');
    } finally { plain.destroy(); }
  });

  it('替换是单事务：Undo 一步回到键入后，Redo 恢复', () => {
    const view = new EditorView({
      doc: 'hi (c)',
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    try {
      view.dispatch({ selection: { anchor: 6 } });
      expect(typeChar(view, 6, ' ')).toBe(true);
      expect(view.state.doc.toString()).toBe('hi © ');
      undo(view);
      expect(view.state.doc.toString()).toBe('hi (c)');
      redo(view);
      expect(view.state.doc.toString()).toBe('hi © ');
    } finally { view.destroy(); }
  });

  it('IME 合成期间不触发（composition guard）', () => {
    installCompositionTracking();
    const view = viewWith('你好 omw', 6);
    try {
      // 合成状态真值来自引擎 composition.ts（document 级事件驱动，
      // 与 ime-guards.test.ts 同法；jsdom 不转发 contentDOM 上的合成事件）
      document.dispatchEvent(new Event('compositionstart'));
      expect(typeChar(view, 6, ' ')).toBe(false);
      expect(view.state.doc.toString()).toBe('你好 omw');
      document.dispatchEvent(new Event('compositionend'));
      // 合成结束后恢复正常替换（prefix 命中 `omw`，触发字符 '!' 保留）
      expect(typeChar(view, 6, '!')).toBe(true);
      expect(view.state.doc.toString()).toBe('你好 on my way!');
    } finally {
      resetCompositionState();
      view.destroy();
    }
  });
});

describe('引擎 API 安装（install() 后 __MELLOW_TEXT_REPLACEMENT__ 存在）', () => {
  it('API 四件套可用且驱动同一状态', () => {
    install(false);
    const api = (window as unknown as {
      __MELLOW_TEXT_REPLACEMENT__?: {
        set: (e: TextReplacementEntry[]) => void;
        get: () => TextReplacementEntry[];
        setEnabled: (v: boolean) => void;
        getEnabled: () => boolean;
      };
    }).__MELLOW_TEXT_REPLACEMENT__;
    expect(api).toBeDefined();
    api!.setEnabled(true);
    expect(isTextReplacementEnabled()).toBe(true);
    api!.set([{ phrase: 'a', value: 'b' }]);
    expect(getTextReplacementEntries()).toEqual([{ phrase: 'a', value: 'b' }]);
    api!.setEnabled(false);
    expect(isTextReplacementEnabled()).toBe(false);
    api!.set([]);
  });
});
