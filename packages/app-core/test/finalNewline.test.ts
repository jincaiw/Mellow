import { applyFinalNewline } from '../src/finalNewline';

/**
 * 对齐 Typora「Insert Final New Line On Save」（`preferFinalNewline`，默认 false）。
 * 一手证据：`TypeMark/appsrc/main.js` 的 `warpContentWithOption`。
 */
describe('applyFinalNewline', () => {
  test('关闭时是恒等变换（默认关闭 → 对既有行为零影响）', () => {
    expect(applyFinalNewline('a', '\n', false)).toBe('a');
    expect(applyFinalNewline('a\n', '\n', false)).toBe('a\n');
    expect(applyFinalNewline('', '\n', false)).toBe('');
  });

  test('开启且缺文末换行 → 追加（LF 文档补 \\n）', () => {
    expect(applyFinalNewline('a', '\n', true)).toBe('a\n');
  });

  test('开启且缺文末换行 → 追加（CRLF 文档补 \\r\\n，跟随文档当前 EOL）', () => {
    expect(applyFinalNewline('a', '\r\n', true)).toBe('a\r\n');
  });

  test('已有文末换行 → 不重复追加（LF / CRLF 结尾均判定为「已有」）', () => {
    expect(applyFinalNewline('a\n', '\n', true)).toBe('a\n');
    expect(applyFinalNewline('a\r\n', '\r\n', true)).toBe('a\r\n');
  });

  test('**从不删除**已有换行 —— 语义是「缺失时追加」，不是「规范化」', () => {
    expect(applyFinalNewline('a\n\n\n', '\n', true)).toBe('a\n\n\n');
    expect(applyFinalNewline('\n', '\n', true)).toBe('\n');
  });

  test('空文档被补成单个换行（与 Typora `substr(-1)` 对空串的判定一致）', () => {
    expect(applyFinalNewline('', '\n', true)).toBe('\n');
  });

  test('幂等：连续两次结果相同（多次保存不会累积换行）', () => {
    const once = applyFinalNewline('a', '\n', true);
    expect(applyFinalNewline(once, '\n', true)).toBe(once);
    const onceCrlf = applyFinalNewline('a', '\r\n', true);
    expect(applyFinalNewline(onceCrlf, '\r\n', true)).toBe(onceCrlf);
  });
});
