import { pushRecentFolder, parseRecentFolders, serializeRecentFolders, RECENT_FOLDERS_LIMIT } from '../src/recentFiles';

describe('recent folders (PRD §56/§62)', () => {
  test('push dedupes and tops', () => {
    let list: string[] = ['/a', '/b'];
    list = pushRecentFolder(list, '/a');
    expect(list).toEqual(['/a', '/b']);
    list = pushRecentFolder(list, '/c');
    expect(list[0]).toBe('/c');
  });

  test('limit caps', () => {
    let list: string[] = [];
    for (let i = 0; i < RECENT_FOLDERS_LIMIT + 5; i++) list = pushRecentFolder(list, `/f${i}`);
    expect(list.length).toBe(RECENT_FOLDERS_LIMIT);
  });

  test('parse/serialize round-trip', () => {
    const raw = serializeRecentFolders(['/x', '/y']);
    expect(parseRecentFolders(raw)).toEqual(['/x', '/y']);
    expect(parseRecentFolders('not-json')).toEqual([]);
    expect(parseRecentFolders(null)).toEqual([]);
  });
});
