/**
 * E1：常驻编辑器工具栏按钮契约。
 * - 按钮命令 id 唯一；
 * - 全部属于 Typora 浮动/常驻工具栏语义集合（B/I/U/S/code/H2/H3/quote/ol/ul/image/table/link）；
 * - 排除 H1（Typora 工具栏不提供一级标题按钮，标题用段落菜单/快捷键）。
 */
import { EDITOR_TOOLBAR_BUTTONS } from '../src/EditorToolbar';

describe('EditorToolbar E1 按钮契约', () => {
  test('命令 id 唯一', () => {
    const ids = EDITOR_TOOLBAR_BUTTONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('按钮集合 = Typora 工具栏语义（含 U/image/table/ol，无 H1）', () => {
    expect(EDITOR_TOOLBAR_BUTTONS.map((b) => b.id).sort()).toEqual([
      'format.bold',
      'format.code',
      'format.italic',
      'format.list',
      'format.link',
      'format.orderedList',
      'format.quote',
      'format.strike',
      'format.underline',
      'insert.image',
      'insert.table',
      'paragraph.h2',
      'paragraph.h3',
    ].sort());
  });

  test('每个按钮都有非空 label 与 titleKey', () => {
    for (const b of EDITOR_TOOLBAR_BUTTONS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.titleKey.startsWith('menu.')).toBe(true);
    }
  });
});
