/**
 * P3.3 侧栏键盘导航模型单测（G4-SIDE-02：Outline / Search ↑↓/Enter/Esc/Home/End）。
 * Esc 清空是 UI 装配行为（App.tsx），模型层只覆盖选中移动 / Home / End / Enter / 空集 / clamp。
 */
import { buildOutline, OutlineModel, type OutlineHeading } from '../src/outline';
import { FileListModel } from '../src/fileList';
import { SearchResultsModel } from '../src/globalSearch';
import type { SearchResult } from '../../host-api/src';

const markdown = [
  '# 一级 A',
  'text',
  '## 二级 B',
  '## 二级 C',
  '# 一级 D',
].join('\n');

describe('OutlineModel.navigate（P3.3）', () => {
  const model = new OutlineModel();
  const items = model.visibleItems(buildOutline(markdown), true); // flat：5 项

  test('可见行序列覆盖全部 heading', () => {
    expect(items.map((i) => i.title)).toEqual(['一级 A', '二级 B', '二级 C', '一级 D']);
  });

  test('空集：清空选中，不跳转', () => {
    const m = new OutlineModel();
    expect(m.navigate([], 'down')).toEqual({ selectedId: null });
    expect(m.selectedId).toBeNull();
  });

  test('未选中时 down 从第一项开始（不跳过）', () => {
    const m = new OutlineModel();
    const r = m.navigate(items, 'down');
    expect(r.selectedId).toBe(items[0].id);
    expect(r.jump).toBeUndefined();
  });

  test('up/down 逐步移动并 clamp 边界', () => {
    const m = new OutlineModel();
    m.selectedId = items[0].id;
    expect(m.navigate(items, 'up').selectedId).toBe(items[0].id); // 顶部 clamp
    expect(m.navigate(items, 'down').selectedId).toBe(items[1].id);
    m.selectedId = items[items.length - 1].id;
    expect(m.navigate(items, 'down').selectedId).toBe(items[items.length - 1].id); // 底部 clamp
  });

  test('Home / End 直达首尾', () => {
    const m = new OutlineModel();
    m.selectedId = items[1].id;
    expect(m.navigate(items, 'home').selectedId).toBe(items[0].id);
    expect(m.navigate(items, 'end').selectedId).toBe(items[items.length - 1].id);
  });

  test('Enter 返回跳转目标；未选中时落到第一项', () => {
    const m = new OutlineModel();
    m.selectedId = items[2].id;
    const r = m.navigate(items, 'enter');
    expect(r.selectedId).toBe(items[2].id);
    expect(r.jump).toBe(items[2]);
    const m2 = new OutlineModel();
    const r2 = m2.navigate(items, 'enter');
    expect(r2.jump).toBe(items[0]);
  });

  test('树形可见序列（折叠后）导航只走可见行', () => {
    const m = new OutlineModel();
    m.collapse(items[0].id);
    const visible = m.visibleItems(buildOutline(markdown), false);
    expect(visible.map((i) => i.title)).toEqual(['一级 A', '一级 D']);
    m.selectedId = items[0].id;
    expect(m.navigate(visible, 'down').selectedId).toBe(visible[1].id);
  });
});

describe('SearchResultsModel.navigate（P3.3）', () => {
  const matches: SearchResult[] = [
    { path: '/a.md', line: 1 },
    { path: '/a.md', line: 5 },
    { path: '/b.md', line: 2 },
    { path: '/b.md', line: 9 },
  ];

  test('空结果：索引复位 -1', () => {
    const m = new SearchResultsModel();
    expect(m.navigate([], 'down')).toEqual({ selectedIndex: -1 });
    expect(m.selectedIndex).toBe(-1);
  });

  test('未选中时 down/up 从第一条开始', () => {
    const m = new SearchResultsModel();
    expect(m.navigate(matches, 'down').selectedIndex).toBe(0);
    const m2 = new SearchResultsModel();
    expect(m2.navigate(matches, 'up').selectedIndex).toBe(0);
  });

  test('up/down clamp 边界', () => {
    const m = new SearchResultsModel();
    m.selectedIndex = 0;
    expect(m.navigate(matches, 'up').selectedIndex).toBe(0);
    m.selectedIndex = matches.length - 1;
    expect(m.navigate(matches, 'down').selectedIndex).toBe(matches.length - 1);
  });

  test('Home / End 直达首尾', () => {
    const m = new SearchResultsModel();
    m.selectedIndex = 1;
    expect(m.navigate(matches, 'home').selectedIndex).toBe(0);
    expect(m.navigate(matches, 'end').selectedIndex).toBe(matches.length - 1);
  });

  test('Enter 返回跳转目标；未选中时落到第一条', () => {
    const m = new SearchResultsModel();
    m.selectedIndex = 2;
    const r = m.navigate(matches, 'enter');
    expect(r.selectedIndex).toBe(2);
    expect(r.jump).toBe(matches[2]);
    const m2 = new SearchResultsModel();
    expect(m2.navigate(matches, 'enter').jump).toBe(matches[0]);
  });

  test('结果流式收缩：navigate 内 clamp 不越界', () => {
    const m = new SearchResultsModel();
    m.selectedIndex = 3;
    const shrunk = matches.slice(0, 2);
    expect(m.navigate(shrunk, 'down').selectedIndex).toBe(1);
  });

  test('reset 回到未选中', () => {
    const m = new SearchResultsModel();
    m.selectedIndex = 2;
    m.reset();
    expect(m.selectedIndex).toBe(-1);
  });
});

describe('OutlineModel P3.5 右键菜单 collapseAll', () => {
  test('全部折叠：仅折叠有子级的项；展开态不受影响项保持', () => {
    const m = new OutlineModel();
    const tree = buildOutline(['# A', '## B', '## C', '# D'].join('\n'));
    m.collapseAll(m.visibleItems(tree, true));
    const visible = m.visibleItems(tree, false);
    // A 有子级被折叠 → 只剩 A、D 可见
    expect(visible.map((i) => i.title)).toEqual(['A', 'D']);
    m.collapsed.clear();
    expect(m.visibleItems(tree, false).length).toBe(4);
  });
});

describe('FileListModel.navigate P3.4 键位补齐（G4-SIDE-01：←→/PageUp/PageDown）', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ path: `/f${String(i + 1).padStart(2, '0')}.md` }));

  test('←→ 与 ↑↓ 同义（单列列表惯例），未选中时落到第一项', () => {
    const m = new FileListModel();
    expect(m.navigate(items, 'right').selected).toBe('/f01.md');
    expect(m.navigate(items, 'left').selected).toBe('/f01.md'); // 顶部 clamp
  });

  test('←→ 逐步移动并 clamp 边界', () => {
    const m = new FileListModel();
    m.selectedPath = '/f02.md';
    expect(m.navigate(items, 'left').selected).toBe('/f01.md');
    expect(m.navigate(items, 'left').selected).toBe('/f01.md');
    m.selectedPath = '/f24.md';
    expect(m.navigate(items, 'right').selected).toBe('/f25.md');
    expect(m.navigate(items, 'right').selected).toBe('/f25.md');
  });

  test('PageDown/PageUp 整页移动（默认 10 项）', () => {
    const m = new FileListModel();
    m.selectedPath = '/f01.md';
    expect(m.navigate(items, 'pagedown').selected).toBe('/f11.md');
    expect(m.navigate(items, 'pagedown').selected).toBe('/f21.md');
    expect(m.navigate(items, 'pageup').selected).toBe('/f11.md');
  });

  test('PageUp/PageDown clamp 边界，不越界不丢选中', () => {
    const m = new FileListModel();
    m.selectedPath = '/f25.md';
    expect(m.navigate(items, 'pagedown').selected).toBe('/f25.md');
    m.selectedPath = '/f03.md';
    expect(m.navigate(items, 'pageup').selected).toBe('/f01.md');
  });

  test('未选中时 PageDown 与既有心智一致落第一项', () => {
    const m = new FileListModel();
    expect(m.navigate(items, 'pagedown').selected).toBe('/f01.md');
  });

  test('自定义 pageSize 生效', () => {
    const m = new FileListModel();
    m.selectedPath = '/f01.md';
    expect(m.navigate(items, 'pagedown', 5).selected).toBe('/f06.md');
  });

  test('Enter 仍打开选中项（既有语义不回退）', () => {
    const m = new FileListModel();
    m.selectedPath = '/f02.md';
    const r = m.navigate(items, 'enter');
    expect(r.selected).toBe('/f02.md');
    expect(r.open).toBe('/f02.md');
  });

  test('空列表返回 null 选中（既有语义不回退）', () => {
    const m = new FileListModel();
    expect(m.navigate([], 'down')).toEqual({ selected: null });
  });
});
