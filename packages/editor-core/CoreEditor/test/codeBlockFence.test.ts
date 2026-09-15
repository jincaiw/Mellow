import { codeBlockFences, sanitizeCodeLang } from '../src/modules/input/insertCodeBlock';

/**
 * 默认代码块语言（V7-W6，G7-EDIT-16）—— 对齐 Typora `defaultCodeLang`（默认空串）。
 *
 * 为什么用纯函数单测而不是浏览器 e2e：`insertCodeBlock` 的展开分支经 CM6 `snippet()` 提交，
 * 在 headless harness 中**不产生变更**（合成按键实测：state 不变），故行为锁定放在这一层；
 * 跨层接线（settings → App → wrapper → bridge → config）由 verify-settings-contract ⑬ 节静态锁定，
 * 并有 e2e 断言 bridge 确实写进了 `window.config.defaultCodeLang`。
 */
describe('codeBlockFences', () => {
  test('未设语言：开围栏为裸 ```，闭围栏也是裸 ```', () => {
    expect(codeBlockFences('')).toEqual({ open: '```', close: '```' });
    expect(codeBlockFences(undefined)).toEqual({ open: '```', close: '```' });
  });

  test('设了语言：只有开围栏带语言，闭围栏不带（`` ```js … ```js `` 是错的）', () => {
    const { open, close } = codeBlockFences('js');
    expect(open).toBe('```js');
    expect(close).toBe('```');
  });

  test('脏值被清洗：反引号 / 换行 / 制表符 / 空格都不残留', () => {
    expect(codeBlockFences('j`s').open).toBe('```js');
    expect(codeBlockFences('a\nb').open).toBe('```ab');
    expect(codeBlockFences('c\td').open).toBe('```cd');
    expect(codeBlockFences(' e f ').open).toBe('```ef');
  });

  test('超长值被截断到 32 字符（防挤坏版面）', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeCodeLang(long)).toHaveLength(32);
  });

  test('非字符串输入回落空串（不得抛错）', () => {
    expect(sanitizeCodeLang(null as unknown as string)).toBe('');
    expect(sanitizeCodeLang(123 as unknown as string)).toBe('');
  });

  test('canary：闭围栏不得被改动为带语言', () => {
    for (const lang of ['', 'js', 'python', 'j`s\nx']) {
      expect(codeBlockFences(lang).close).toBe('```');
    }
  });
});
