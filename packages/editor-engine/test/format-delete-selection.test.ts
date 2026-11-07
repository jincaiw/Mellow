/**
 * 删除所选内容（Typora 编辑菜单常显行「删除」，基线 fixture L207，无键位）
 * —— applyDeleteSelection 行为矩阵。§4.360「六」7。
 */
import { applyDeleteSelection } from '../src/selectionToolbar';

describe('applyDeleteSelection — 纯函数', () => {
  it('有选区：删除选区文本，caret 落选区起点', () => {
    const doc = '第一段 hello world 结尾';
    const from = doc.indexOf('hello');
    const to = doc.indexOf('world') + 'world'.length;
    const r = applyDeleteSelection(doc, { from, to });
    expect(r.changes).toEqual([{ from, to, insert: '' }]);
    expect(r.selection).toEqual({ from, to: from });
  });

  it('跨行选区：整段删除（含换行）', () => {
    const doc = 'aaa\nbbb\nccc';
    // 1..7 = 'aa\nbbb' ⇒ 剩 'a' + '\nccc'
    const r = applyDeleteSelection(doc, { from: 1, to: 7 });
    const applied = doc.slice(0, 1) + doc.slice(7);
    expect(r.changes).toEqual([{ from: 1, to: 7, insert: '' }]);
    expect(applied).toBe('a\nccc');
  });

  it('空选区：无变更（Typora「删除」语义 = 删除所选内容，不做第二删除键）', () => {
    const doc = 'abc';
    const r = applyDeleteSelection(doc, { from: 1, to: 1 });
    expect(r.changes).toEqual([]);
    expect(r.selection).toEqual({ from: 1, to: 1 });
  });

  it('反向选区（from > to）按无选区处理，不产生负区间', () => {
    const doc = 'abc';
    const r = applyDeleteSelection(doc, { from: 2, to: 1 });
    expect(r.changes).toEqual([]);
  });
});
