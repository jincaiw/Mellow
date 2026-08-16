/**
 * Code Fence language autocomplete（RC UX parity B3）。
 */
import { fenceLangSource } from '../src/codeFence';

function ctx(doc: string, pos: number) {
  return { pos, state: { sliceDoc: (_from: number, to: number) => doc.slice(0, to) } };
}

describe('Code Fence language autocomplete（parity B3）', () => {
  test('围栏行提供语言补全', () => {
    const result = fenceLangSource(ctx('```', 3));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3);
    expect(result!.options.length).toBeGreaterThan(10);
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('javascript');
    expect(labels).toContain('rust');
    expect(labels).toContain('mermaid');
    // apply 在语言后补空格
    const rust = result!.options.find((o) => o.label === 'rust');
    expect(rust!.apply).toBe('rust ');
  });

  test('已输入前缀时过滤', () => {
    const result = fenceLangSource(ctx('```ru', 5));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(3); // 从围栏后开始替换
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('rust');
    expect(labels).toContain('ruby');
    expect(labels).not.toContain('javascript');
  });

  test('~ 围栏同样生效', () => {
    const result = fenceLangSource(ctx('~~~', 3));
    expect(result).not.toBeNull();
  });

  test('带语言围栏不重复补全', () => {
    const result = fenceLangSource(ctx('```rust', 7));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('rust');
  });

  test('非围栏行返回 null', () => {
    expect(fenceLangSource(ctx('```rust\nconst x = 1;', 20))).toBeNull();
    expect(fenceLangSource(ctx('hello world', 11))).toBeNull();
    expect(fenceLangSource(ctx('````', 4))).not.toBeNull(); // 4+ 反引号也是围栏
  });
});
