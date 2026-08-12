import { DEFAULT_SEARCH_EXCLUDES, globalSearchShortcutAction, groupSearchResults, matchSearchLine, normalizeSearchRequest } from '../src/globalSearch';

describe('Global Search pure logic', () => {
  test('default ignore includes heavy workspace directories', () => {
    const req = normalizeSearchRequest({ root: '/ws', query: 'hello' });
    expect(req.exclude).toEqual(expect.arrayContaining(DEFAULT_SEARCH_EXCLUDES));
  });

  test('case, whole word and regex matching', () => {
    expect(matchSearchLine('Hello mellow', { query: 'hello', caseSensitive: false, wholeWord: false, regex: false })).not.toBeNull();
    expect(matchSearchLine('Hello mellow', { query: 'hello', caseSensitive: true, wholeWord: false, regex: false })).toBeNull();
    expect(matchSearchLine('cat scatter concatenate', { query: 'cat', caseSensitive: false, wholeWord: true, regex: false })?.column).toBe(1);
    expect(matchSearchLine('issue-123', { query: 'issue-\\d+', caseSensitive: false, wholeWord: false, regex: true })?.match).toBe('issue-123');
  });

  test('groups by file and preserves context', () => {
    const groups = groupSearchResults([
      { path: '/ws/a.md', line: 2, column: 4, match: 'foo', snippet: 'foo', before: ['a'], after: ['b'] },
      { path: '/ws/b.md', line: 1, column: 1, match: 'foo', snippet: 'foo' },
      { path: '/ws/a.md', line: 5, column: 2, match: 'foo', snippet: 'foo2' },
    ], '/ws');
    expect(groups.map((g) => ({ relativePath: g.relativePath, count: g.matches.length }))).toEqual([
      { relativePath: 'a.md', count: 2 },
      { relativePath: 'b.md', count: 1 },
    ]);
    expect(groups[0].matches[0].before).toEqual(['a']);
  });

  test('shortcut Ctrl/Cmd+Shift+F', () => {
    expect(globalSearchShortcutAction({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('global-search');
    expect(globalSearchShortcutAction({ key: 'F', ctrlKey: false, metaKey: true, shiftKey: true })).toBe('global-search');
    expect(globalSearchShortcutAction({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
  });
});
