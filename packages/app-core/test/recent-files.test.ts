/**
 * Recent Files（Typora 深度对标 ⑫）—— 最近打开列表模型测试。
 */
import { markRecentMissing, parseRecentFiles, pushRecentFile, serializeRecentFiles, RECENT_FILES_LIMIT } from '../src/recentFiles';

describe('pushRecentFile', () => {
  test('追加置顶 + 时间戳', () => {
    const next = pushRecentFile([{ path: '/a.md', lastOpenedAt: 1 }], '/b.md', 100);
    expect(next.map((e) => e.path)).toEqual(['/b.md', '/a.md']);
    expect(next[0].lastOpenedAt).toBe(100);
  });

  test('同一路径去重置顶', () => {
    const list = [{ path: '/a.md', lastOpenedAt: 1 }, { path: '/b.md', lastOpenedAt: 2 }];
    const next = pushRecentFile(list, '/a.md', 3);
    expect(next.map((e) => e.path)).toEqual(['/a.md', '/b.md']);
    expect(next[0].lastOpenedAt).toBe(3);
  });

  test('超过上限截断', () => {
    const list = Array.from({ length: RECENT_FILES_LIMIT }, (_, i) => ({ path: `/f${i}.md`, lastOpenedAt: i }));
    const next = pushRecentFile(list, '/new.md', 999);
    expect(next).toHaveLength(RECENT_FILES_LIMIT);
    expect(next[0].path).toBe('/new.md');
    expect(next[next.length - 1].path).toBe(`/f${RECENT_FILES_LIMIT - 2}.md`);
  });

  test('原列表不被修改（纯函数）', () => {
    const list = [{ path: '/a.md', lastOpenedAt: 1 }];
    pushRecentFile(list, '/b.md', 2);
    expect(list).toHaveLength(1);
  });
});

describe('markRecentMissing', () => {
  test('exists=false 标记 missing', () => {
    const list = [
      { path: '/a.md', lastOpenedAt: 1 },
      { path: '/b.md', lastOpenedAt: 2 },
    ];
    const marked = markRecentMissing(list, (p) => p === '/a.md');
    expect(marked[0]).toEqual({ path: '/a.md', lastOpenedAt: 1, missing: false });
    expect(marked[1]).toEqual({ path: '/b.md', lastOpenedAt: 2, missing: true });
  });
});

describe('持久化 round-trip', () => {
  test('serialize → parse 还原', () => {
    const list = [{ path: '/a.md', lastOpenedAt: 123 }];
    const raw = serializeRecentFiles(list);
    expect(raw).not.toBeNull();
    expect(parseRecentFiles(raw)).toEqual(list);
  });

  test('损坏输入回退空列表', () => {
    expect(parseRecentFiles('not json')).toEqual([]);
    expect(parseRecentFiles('{"x":1}')).toEqual([]);
    expect(parseRecentFiles('[{"path":1}]')).toEqual([]);
    expect(parseRecentFiles(null)).toEqual([]);
  });

  test('超长载荷截断', () => {
    const raw = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ path: `/f${i}.md`, lastOpenedAt: i })));
    expect(parseRecentFiles(raw)).toHaveLength(RECENT_FILES_LIMIT);
  });
});
