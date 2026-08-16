/**
 * emoji 补全（Typora 深度对标）：`:smile:` 前缀 → 补全。
 */
import { emojiSource } from '../src/emoji';

function ctx(doc: string, pos: number) {
  return { pos, state: { sliceDoc: (_from: number, to: number) => doc.slice(0, to) } };
}

describe('emoji autocomplete（Typora 对齐）', () => {
  test(':sm 前缀提供 emoji 补全', () => {
    const r = emojiSource(ctx(':sm', 3));
    expect(r).not.toBeNull();
    const labels = r!.options.map((o) => o.label);
    expect(labels).toContain('smile');
    expect(labels).toContain('smiley');
    const smile = r!.options.find((o) => o.label === 'smile');
    expect(smile!.detail).toBe('😄');
    expect(smile!.apply).toBe('😄 ');
  });

  test('无冒号不触发', () => {
    expect(emojiSource(ctx('hello', 5))).toBeNull();
  });

  test(':he 过滤到 heart 系', () => {
    const r = emojiSource(ctx(':he', 3));
    expect(r).not.toBeNull();
    expect(r!.options.map((o) => o.label)).toContain('heart');
  });

  test('未知前缀返回 null', () => {
    expect(emojiSource(ctx(':zzzzz', 6))).toBeNull();
  });
});
