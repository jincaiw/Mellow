import { DEFAULT_SEARCH_EXCLUDES, buildSearchRegex, globalSearchShortcutAction, groupSearchResults, isSearchRegexValid, matchSearchLine, normalizeSearchRequest } from '../src/globalSearch';

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

  // §7.3「invalid regex 就地提示」：非法正则必须与「空查询 / 零匹配」区分开，
  // 否则 UI 只显示「无结果」，用户无法判断是语法错还是真没匹配。
  test('isSearchRegexValid 只校验 regex 模式下的语法', () => {
    expect(isSearchRegexValid({ query: 'issue-\\d+', caseSensitive: false, wholeWord: false, regex: true })).toBe(true);
    expect(isSearchRegexValid({ query: '(unclosed', caseSensitive: false, wholeWord: false, regex: true })).toBe(false);
    expect(isSearchRegexValid({ query: '[a-', caseSensitive: false, wholeWord: false, regex: true })).toBe(false);
    expect(isSearchRegexValid({ query: '*bad', caseSensitive: false, wholeWord: false, regex: true })).toBe(false);
    // 非 regex 模式：转义后必然合法 —— 元字符不是语法错误
    expect(isSearchRegexValid({ query: '(unclosed', caseSensitive: false, wholeWord: false, regex: false })).toBe(true);
    expect(isSearchRegexValid({ query: '*bad', caseSensitive: false, wholeWord: false, regex: false })).toBe(true);
    // 空查询：无意义校验，恒合法
    expect(isSearchRegexValid({ query: '', caseSensitive: false, wholeWord: false, regex: true })).toBe(true);
  });

  test('buildSearchRegex 与 isSearchRegexValid 判定一致（无旁路）', () => {
    const cases: Array<[string, boolean]> = [
      ['issue-\\d+', true],
      ['(unclosed', false],
      ['a{2,1}', false],
      ['\\\\', true],
    ];
    for (const [query, regex] of cases) {
      const options = { query, caseSensitive: false, wholeWord: false, regex: true };
      expect(isSearchRegexValid(options)).toBe(buildSearchRegex(options) !== null);
    }
  });

  test('shortcut Ctrl/Cmd+Shift+F', () => {
    expect(globalSearchShortcutAction({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('global-search');
    expect(globalSearchShortcutAction({ key: 'F', ctrlKey: false, metaKey: true, shiftKey: true })).toBe('global-search');
    expect(globalSearchShortcutAction({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
  });
});
