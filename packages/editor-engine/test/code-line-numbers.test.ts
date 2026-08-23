/**
 * 代码块行号（Typora parity：偏好→Markdown→代码块行号）—— fenceContentRange 纯函数。
 */

import { fenceContentRange } from '../src/codeLineNumbers';

describe('fenceContentRange：围栏内容行区间', () => {
  test('闭合围栏：首行 = 开栏行 + 1，末行 = 闭栏行 - 1', () => {
    // ```ts        ← line 1
    // const a = 1; ← line 2
    // ```          ← line 3
    expect(fenceContentRange(1, 3, '```')).toEqual({ first: 2, last: 2 });
  });

  test('多行内容', () => {
    expect(fenceContentRange(1, 5, '```')).toEqual({ first: 2, last: 4 });
  });

  test('未闭合围栏（EOF 截断）→ 编号到末行', () => {
    expect(fenceContentRange(1, 3, 'const a = 1;')).toEqual({ first: 2, last: 3 });
  });

  test('闭栏带缩进/语言残留/尾随空白', () => {
    expect(fenceContentRange(1, 4, '  ```  ')).toEqual({ first: 2, last: 3 });
    expect(fenceContentRange(1, 4, '~~~')).toEqual({ first: 2, last: 3 });
  });

  test('内容行恰似围栏（4 个反引号）→ 不视为闭栏', () => {
    // ```` 内嵌 ``` 的场景：末行 4 反引号仍可闭合外层围栏 → 视为闭栏
    expect(fenceContentRange(1, 4, '````')).toEqual({ first: 2, last: 3 });
  });

  test('空围栏（开栏即闭栏）→ 无编号行', () => {
    expect(fenceContentRange(1, 2, '```')).toEqual({ first: 2, last: 1 });
  });
});
