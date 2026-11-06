/**
 * 拼写检查作用域开关（批次 A38 / ADR-0038 C：`editor.spellcheckForCodeAndLink`）。
 *
 * 立此文件的理由：Typora 的 `spellcheckForCodeAndLink`（默认 false）把「代码/链接内
 * 是否标拼写错误」做成**可开关**；Mellow 此前是**无条件排除**。开关的契约有三条，
 * 每条都对应一个真实缺陷风险：
 * 1. **默认关 ⇒ 行为与开关引入前逐字一致**（行内码仍带 spellcheck=false）——
 *    回归风险的直接断言；
 * 2. **开关开 ⇒ 行内码标记省略 spellcheck 属性**（继承 cm-content 有效态）且
 *    **其余三个属性不得被顺带删掉**（copy-then-delete 写错键名就是静默 no-op）；
 * 3. **块级 wrapper 生效值 = 开关 ∧ 全局拼写**（纯函数两端锁定，DOM 同步幂等）。
 */

import { setUpEditor, sleep } from './harness';
import {
  blockWrapperSpellcheckAttr,
  isSpellcheckForCodeAndLink,
  setSpellcheckForCodeAndLink,
} from '../src/index';
import { INLINE_CODE_ATTR_CLASS } from '../src/inlineCodeAttrs';
import { setUserSpellcheck } from '../src/largeFile';

function attrSpans(view: ReturnType<typeof setUpEditor>): Element[] {
  return Array.from(view.dom.querySelectorAll(`.${INLINE_CODE_ATTR_CLASS}`));
}

describe('A38：拼写作用域纯函数（blockWrapperSpellcheckAttr）', () => {
  test('开关关 ⇒ 恒 false（= vendored 字面量，现状不变）', () => {
    expect(blockWrapperSpellcheckAttr(false, true)).toBe('false');
    expect(blockWrapperSpellcheckAttr(false, false)).toBe('false');
  });
  test('开关开 ⇒ 跟随全局拼写偏好（全局关时不得在代码块里私自打开）', () => {
    expect(blockWrapperSpellcheckAttr(true, true)).toBe('true');
    expect(blockWrapperSpellcheckAttr(true, false)).toBe('false');
  });
  test('set/is 通道成对（set 同值不产生版本推进由消费方判重，对外语义 = 最终态正确）', () => {
    setSpellcheckForCodeAndLink(true);
    expect(isSpellcheckForCodeAndLink()).toBe(true);
    setSpellcheckForCodeAndLink(false);
    expect(isSpellcheckForCodeAndLink()).toBe(false);
  });
});

describe('A38：行内码属性随开关变化（inlineCodeAttrs）', () => {
  afterEach(() => {
    // 全局态复位：拼写作用域开关与用户拼写偏好都是模块级状态，
    // 不隔离会污染同套件的其他文件（顺序相关假绿/假红）。
    setSpellcheckForCodeAndLink(false);
    setUserSpellcheck(true);
  });

  test('默认（关）：行内码带 spellcheck=false —— 与开关引入前逐字一致', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const el = attrSpans(view)[0];
      expect(el.getAttribute('spellcheck')).toBe('false');
      expect(el.getAttribute('autocorrect')).toBe('off');
      expect(el.getAttribute('autocomplete')).toBe('off');
      expect(el.getAttribute('autocapitalize')).toBe('off');
    } finally { view.destroy(); }
  });

  test('开关开：省略 spellcheck，其余三属性保留（copy-then-delete 只删一键）', async () => {
    setSpellcheckForCodeAndLink(true);
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      const el = attrSpans(view)[0];
      expect(el.hasAttribute('spellcheck')).toBe(false);
      expect(el.getAttribute('autocorrect')).toBe('off');
      expect(el.getAttribute('autocomplete')).toBe('off');
      expect(el.getAttribute('autocapitalize')).toBe('off');
      // 只动属性，不动文本（spec §2）
      expect(view.state.doc.toString()).toBe('a `code` b');
    } finally { view.destroy(); }
  });

  test('会话中切换开关 ⇒ 已挂载视图重算装饰（live apply，无需 reload）', async () => {
    const view = setUpEditor('a `code` b');
    try {
      await sleep();
      expect(attrSpans(view)[0].getAttribute('spellcheck')).toBe('false');
      setSpellcheckForCodeAndLink(true);
      await sleep();
      expect(attrSpans(view)[0].hasAttribute('spellcheck')).toBe(false);
      setSpellcheckForCodeAndLink(false);
      await sleep();
      expect(attrSpans(view)[0].getAttribute('spellcheck')).toBe('false');
    } finally { view.destroy(); }
  });
});
