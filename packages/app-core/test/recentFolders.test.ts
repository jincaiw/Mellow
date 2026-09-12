import { pushRecentFolder, parseRecentFolders, serializeRecentFolders, RECENT_FOLDERS_LIMIT, removeRecentFolder, togglePinRecentFolder, sortRecentFolders } from '../src/recentFiles';

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

/**
 * V7-W3.9 —— Recent Locations 的 trash（移除）与 pin（固定）。
 * Typora 官方 File Management：「click the "trash" icon to remove it from the list …
 * click the "Pin" icon to pin the folder」。
 */
describe('V7-W3.9 recent locations: remove / pin', () => {
  test('removeRecentFolder 精确移除且不动其余项', () => {
    expect(removeRecentFolder(['/a', '/b', '/c'], '/b')).toEqual(['/a', '/c']);
    expect(removeRecentFolder(['/a'], '/missing')).toEqual(['/a']);
  });

  test('togglePinRecentFolder 幂等切换（置顶追加 / 移除）', () => {
    expect(togglePinRecentFolder([], '/a')).toEqual(['/a']);
    expect(togglePinRecentFolder(['/a'], '/b')).toEqual(['/b', '/a']);
    expect(togglePinRecentFolder(['/a', '/b'], '/a')).toEqual(['/b']);
  });

  test('sortRecentFolders 固定项置顶，其余保持最近顺序', () => {
    expect(sortRecentFolders(['/a', '/b', '/c'], ['/c'])).toEqual(['/c', '/a', '/b']);
    expect(sortRecentFolders(['/a', '/b'], [])).toEqual(['/a', '/b']);
  });

  test('sortRecentFolders 忽略已从列表移除的 pin（防幽灵固定项）', () => {
    expect(sortRecentFolders(['/a', '/b'], ['/gone', '/b'])).toEqual(['/b', '/a']);
  });
});
