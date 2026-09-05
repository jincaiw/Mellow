/**
 * E7（Typora 观感收敛）：StatusBar 默认字段集契约。
 * 默认仅 stats + cursor 可见；dirty/markdown/encoding/eol/zoom/status 默认隐藏；
 * 宿主显式 fields 配置始终优先（true/false 均生效）。
 */
import { StatusBarField, STATUSBAR_DEFAULT_HIDDEN, fieldVisible } from '../src/StatusBar';

const all = (fields?: Partial<Record<StatusBarField, boolean>>): StatusBarField[] =>
  (['dirty', 'stats', 'cursor', 'markdown', 'encoding', 'eol', 'zoom', 'status'] as StatusBarField[])
    .filter((f) => fieldVisible(fields, f));

describe('StatusBar E7 默认字段集', () => {
  test('默认隐藏集契约（stats/cursor 之外全部默认隐藏）', () => {
    expect(Array.from(STATUSBAR_DEFAULT_HIDDEN).sort()).toEqual(
      ['dirty', 'eol', 'encoding', 'markdown', 'status', 'zoom'].sort(),
    );
  });

  test('默认渲染：仅 stats + cursor', () => {
    expect(all()).toEqual(['stats', 'cursor']);
  });

  test('显式 fields 优先：可恢复 zoom / status 等', () => {
    const out = all({ zoom: true, status: true, dirty: true, encoding: true, eol: true, markdown: true });
    expect(out).toEqual(['dirty', 'stats', 'cursor', 'markdown', 'encoding', 'eol', 'zoom', 'status']);
  });

  test('显式隐藏 stats 也可生效', () => {
    expect(all({ stats: false })).toEqual(['cursor']);
  });
});
