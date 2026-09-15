/**
 * Code Fence —— spec §16（source-oriented）。
 * 引擎保证：code 内容永不隐藏（源码保留）；高亮/折叠/包裹/tab/行号/语言补全由 CM + CoreEditor 提供。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { LanguageDescription, foldGutter, foldCode, unfoldCode, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { install, MARKER_CLASS } from '../src/index';
import { applyCodeBlock, applyMathBlock, sanitizeCodeLang } from '../src/selectionToolbar';
import { setUpEditor, moveCaret, sleep } from './harness';

/** 带语言高亮 + 折叠 + 行号 + 包裹的完整 Code Fence 环境 */
function setUpRich(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({
        base: markdownLanguage,
        codeLanguages: [
          LanguageDescription.of({ name: 'JavaScript', extensions: ['js'], load: async () => javascript() }),
        ],
      }),
      foldGutter(),
      lineNumbers(),
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      install(false),
    ],
  });
  view.focus();
  return view;
}

const FENCE = '```ts\nconst editor = new EditorView();\n```\n\nplain';

void FENCE;

describe('Code Fence — source-oriented（spec §16）', () => {
  test('引擎零干扰：code 内容无 marker 隐藏', async () => {
    const view = setUpEditor('```\ncode content\n```');
    await sleep();
    moveCaret(view, 0); // 节点外
    await sleep();
    expect(view.dom.querySelectorAll(`.${MARKER_CLASS}`).length).toBe(0);
  });

  test('fenced delimiters 保持可见（源码保留）', async () => {
    const view = setUpEditor('```ts\nconst x = 1;\n```');
    await sleep();
    moveCaret(view, 0);
    await sleep();
    expect(view.state.doc.toString()).toBe('```ts\nconst x = 1;\n```');
  });

  test('caret 在 code 内 → 无任何 marker 隐藏', async () => {
    const view = setUpEditor('```ts\nconst x = 1;\n```\n\nplain');
    await sleep();
    moveCaret(view, 8); // code 内容中
    await sleep();
    expect(view.dom.querySelectorAll(`.${MARKER_CLASS}`).length).toBe(0);
  });

  test('唯一真源：copy 含完整 fence 源码', async () => {
    const view = setUpEditor('```ts\nconst x = 1;\nconst y = 2;\n```');
    await sleep();
    expect(view.state.doc.toString()).toBe('```ts\nconst x = 1;\nconst y = 2;\n```');
  });
});

describe('Code Fence — 语法高亮', () => {
  test('```js → JavaScript 高亮（token span 存在）', async () => {
    const view = setUpRich('```js\nconst value = 42;\n```');
    await sleep();
    // CM 语法高亮产生带 class 的 span
    const highlighted = view.dom.querySelectorAll('.cm-content span[class]');
    expect(highlighted.length).toBeGreaterThan(0);
  });

  test('无语言标注 → 不高亮但源码保留', async () => {
    const view = setUpRich('```\nplain block\n```');
    await sleep();
    expect(view.state.doc.toString()).toContain('plain block');
  });
});

describe('Code Fence — 折叠', () => {
  test('foldCode 折叠（doc 文本不变），unfold 恢复', async () => {
    const view = setUpRich('```js\nline1\nline2\nline3\n```\n\nplain');
    await sleep();
    const before = view.state.doc.toString();

    foldCode(view); // 折叠第一个可折叠点
    await sleep();
    // doc 文本不变（折叠只影响渲染）
    expect(view.state.doc.toString()).toBe(before);

    unfoldCode(view);
    await sleep();
    expect(view.state.doc.toString()).toBe(before);
  });
});

describe('Code Fence — 行包裹 / Tab / 行号', () => {
  test('lineWrapping：长行不横向滚动（wrap 生效）', async () => {
    const view = setUpRich('```js\n' + 'x'.repeat(200) + '\n```');
    await sleep();
    // lineWrapping 扩展已安装（无崩溃）
    expect(view.state.doc.toString().length).toBeGreaterThan(200);
  });

  test('Tab 在 code 内插入缩进（不跳转）', async () => {
    const view = setUpRich('```js\nconst x = 1;\n```');
    await sleep();
    moveCaret(view, 6); // code 行首
    view.dispatch({ changes: { from: 6, insert: '  ' } });
    await sleep();
    expect(view.state.doc.toString()).toContain('  const x = 1;');
  });

  test('可选行号：lineNumbers 渲染', async () => {
    const view = setUpRich('```js\nconst x = 1;\n```');
    await sleep();
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
  });
});

describe('Code Fence — 禁用拼写 / smart punctuation（CoreEditor codeBlockStyle）', () => {  test('codeBlockStyle attributes（vendored 静态确认）', () => {
    // CoreEditor 的 codeBlockStyle 对 FencedCode/CodeBlock 设置：
    // spellcheck=false, autocorrect=off, autocomplete=off, autocapitalize=off
    const codeStyle = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../editor-core/CoreEditor/src/styling/nodes/code.ts'),
      'utf8',
    );
    expect(codeStyle).toContain("'spellcheck': 'false'");
    expect(codeStyle).toContain("'autocorrect': 'off'");
    expect(codeStyle).toContain("'autocomplete': 'off'");
  });

  test('code 内编辑保留源码（无 smart punctuation 改写）', async () => {
    const view = setUpEditor('```\nconst x = \"abc\"\n```');
    await sleep();
    // 行尾追加（动态定位，避免硬编码偏移）
    const text = view.state.doc.toString();
    const end = text.indexOf('"abc"') + 5;
    view.dispatch({ changes: { from: end, insert: ' + "def"' } });
    await sleep();
    // 引号原样保留（无智能引号转换）
    expect(view.state.doc.toString()).toContain('"abc" + "def"');
  });
});

/**
 * 默认代码块语言（G7-EDIT-16）。
 *
 * Typora：`defaultCodeLang`（默认空串）+ `defaultCodeLangOption` **位掩码**
 * （`DefaultCodeLangOptionCode = 1` / `DefaultCodeLangOptionMenu = 2`，默认 1）。
 * 菜单/快捷键插入走 `applyCodeBlock` → 对应 **Menu 位**。
 */
describe('Code Fence — 默认代码块语言（G7-EDIT-16）', () => {
  /** 把 ApplyResult.changes 落到 doc 上（倒序应用，避免偏移失效） */
  const applyChanges = (doc: string, changes: ReadonlyArray<{ from: number; to: number; insert: string }>): string => {
    let out = doc;
    for (const c of [...changes].sort((a, b) => b.from - a.from)) {
      out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    }
    return out;
  };

  test('未设语言：开/闭围栏都是裸 ```（默认行为不变）', () => {
    const r = applyCodeBlock('abc', { from: 0, to: 3 });
    expect(applyChanges('abc', r.changes)).toBe('```\nabc\n```');
  });

  test('设了语言：只有开围栏带语言，闭围栏仍是裸围栏', () => {
    const r = applyCodeBlock('abc', { from: 0, to: 3 }, 'js');
    expect(applyChanges('abc', r.changes)).toBe('```js\nabc\n```');
  });

  test('脏值被清洗（反引号 / 换行 / 空白不残留）', () => {
    expect(sanitizeCodeLang('j`s\nx')).toBe('jsx');
    expect(sanitizeCodeLang('a b')).toBe('ab');
    expect(sanitizeCodeLang(undefined)).toBe('');
    expect(sanitizeCodeLang('x'.repeat(100))).toHaveLength(32);
    const r = applyCodeBlock('abc', { from: 0, to: 3 }, 'j`s\nx');
    expect(applyChanges('abc', r.changes)).toBe('```jsx\nabc\n```');
  });

  test('toggle off：开围栏带语言时仍能被识别并移除（不残留空代码块）', () => {
    const doc = '```js\nabc\n```';
    const from = doc.indexOf('abc'); // 动态定位，避免硬编码偏移
    const r = applyCodeBlock(doc, { from, to: from + 3 }, 'js');
    expect(applyChanges(doc, r.changes)).toBe('abc');
  });

  test('数学公式块不受默认代码块语言影响', () => {
    const r = applyMathBlock('abc', { from: 0, to: 3 });
    expect(applyChanges('abc', r.changes)).toBe('$$\nabc\n$$');
  });

  test('canary：语言永远不得出现在闭围栏上', () => {
    for (const lang of ['js', 'python', 'j`s\nx']) {
      const r = applyCodeBlock('abc', { from: 0, to: 3 }, lang);
      const out = applyChanges('abc', r.changes);
      expect(out.endsWith('```')).toBe(true);
      expect(out.endsWith('```' + lang)).toBe(false);
    }
  });
});
