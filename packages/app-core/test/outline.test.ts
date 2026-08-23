import { OutlineModel, buildOutline, currentHeadingId, filterOutline, flattenOutline, headingOffsetForAnchor } from '../src/outline';

const doc = [
  '# Intro',
  '',
  'text',
  '## Install',
  '### macOS',
  '```',
  '# ignored',
  '```',
  '## Usage',
  '#### Advanced',
  '# Final',
].join('\n');

describe('Outline（PRD §16）', () => {
  test('parses H1-H6 and builds hierarchy', () => {
    const outline = buildOutline(doc, { autoNumber: true });
    expect(outline.map((h) => ({ level: h.level, title: h.title, number: h.number, children: h.children.length }))).toEqual([
      { level: 1, title: 'Intro', number: '1', children: 2 },
      { level: 1, title: 'Final', number: '2', children: 0 },
    ]);
    expect(outline[0].children[0].title).toBe('Install');
    expect(outline[0].children[0].children[0].title).toBe('macOS');
    expect(outline[0].children[1].children[0].title).toBe('Advanced');
  });

  test('flat view preserves document order and filter keeps ancestors', () => {
    const outline = buildOutline(doc);
    expect(flattenOutline(outline).map((h) => h.title)).toEqual(['Intro', 'Install', 'macOS', 'Usage', 'Advanced', 'Final']);
    const filtered = filterOutline(outline, 'adv');
    expect(flattenOutline(filtered).map((h) => h.title)).toEqual(['Intro', 'Usage', 'Advanced']);
  });

  test('current heading is nearest preceding heading', () => {
    const outline = buildOutline(doc);
    const flat = flattenOutline(outline);
    const advanced = flat.find((h) => h.title === 'Advanced')!;
    expect(currentHeadingId(flat, advanced.from + 3)).toBe(advanced.id);
    expect(currentHeadingId(flat, 0)).toBe(flat[0].id);
  });

  test('collapse hides descendants but keeps current node available', () => {
    const outline = buildOutline(doc);
    const model = new OutlineModel();
    model.collapse(outline[0].id);
    expect(model.visibleItems(outline, false).map((h) => h.title)).toEqual(['Intro', 'Final']);
    model.expand(outline[0].id);
    expect(model.visibleItems(outline, false).map((h) => h.title)).toContain('Install');
  });
});

describe('headingOffsetForAnchor（Typora `文件.md#标题` 锚点跳转）', () => {
  const md = [
    '# 第一章 开始',
    '正文',
    '## 1.1 安装 Install',
    '正文',
    '# 第二章 进阶',
    '```md',
    '# 假标题',
    '```',
    '正文',
  ].join('\n');

  test('精确文本匹配 → heading from offset', () => {
    const flat = flattenOutline(buildOutline(md));
    const target = flat.find((h) => h.title === '第二章 进阶')!;
    expect(headingOffsetForAnchor(md, '第二章 进阶')).toBe(target.from);
  });

  test('大小写不敏感匹配（Install）', () => {
    const flat = flattenOutline(buildOutline(md));
    const target = flat.find((h) => h.title === '1.1 安装 Install')!;
    expect(headingOffsetForAnchor(md, '1.1 安装 INSTALL')).toBe(target.from);
  });

  test('slug 匹配（空格/点号 → 连字符）', () => {
    const flat = flattenOutline(buildOutline(md));
    const target = flat.find((h) => h.title === '第一章 开始')!;
    expect(headingOffsetForAnchor(md, '第一章-开始')).toBe(target.from);
  });

  test('围栏内假标题不匹配；未命中 → null；空锚点 → null', () => {
    expect(headingOffsetForAnchor(md, '假标题')).toBeNull();
    expect(headingOffsetForAnchor(md, '不存在')).toBeNull();
    expect(headingOffsetForAnchor(md, '')).toBeNull();
    expect(headingOffsetForAnchor(md, '   ')).toBeNull();
  });
});
