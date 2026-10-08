import { describe, expect, test, beforeEach } from '@jest/globals';
import { taskMarkerStyle } from '../src/styling/nodes/task';
import { waitFor } from './utils/helpers';
import { Config } from '../src/config';
import * as editor from './utils/editor';

describe('Task marker decoration', () => {
  beforeEach(() => {
    // Plugin runs during EditorView construction and reads window.config,
    // so it must exist before setUp().
    window.config = {} as Config;
    // setUp() appends a new editor to document.body each time; clear stale ones.
    document.body.innerHTML = '';
  });

  test('decorates unchecked tasks with cm-md-taskMarker-unchecked', async () => {
    editor.setUp('- [ ] todo', taskMarkerStyle);
    // ⚠️ 原为 `await sleep(200)`（**等时间**）—— decoration 由插件异步施加，CPU 竞争下 200ms
    //    可能不够 ⇒ 偶发 `querySelector` 得 null（2026-10-09 实测一次假红）。改为**等状态**
    //    （同 `test/lezer.test.ts` 的时序修复思路，见 UPSTREAM.md「修改的文件」表）。
    await waitFor(() => document.querySelector('.cm-md-taskMarker') !== null);

    const marker = document.querySelector('.cm-md-taskMarker');
    expect(marker).not.toBeNull();
    expect(marker?.classList.contains('cm-md-taskMarker-unchecked')).toBe(true);
    expect(marker?.classList.contains('cm-md-taskMarker-checked')).toBe(false);
  });

  test('decorates checked tasks with cm-md-taskMarker-checked (lowercase x)', async () => {
    editor.setUp('- [x] done', taskMarkerStyle);
    await waitFor(() => document.querySelector('.cm-md-taskMarker') !== null);

    const marker = document.querySelector('.cm-md-taskMarker');
    expect(marker).not.toBeNull();
    expect(marker?.classList.contains('cm-md-taskMarker-checked')).toBe(true);
    expect(marker?.classList.contains('cm-md-taskMarker-unchecked')).toBe(false);
  });

  test('decorates checked tasks with cm-md-taskMarker-checked (uppercase X)', async () => {
    editor.setUp('- [X] done', taskMarkerStyle);
    await waitFor(() => document.querySelector('.cm-md-taskMarker') !== null);

    const marker = document.querySelector('.cm-md-taskMarker');
    expect(marker?.classList.contains('cm-md-taskMarker-checked')).toBe(true);
  });

  test('decorates mixed task lists with the correct state per line', async () => {
    editor.setUp('- [ ] one\n- [x] two\n- [X] three', taskMarkerStyle);
    await waitFor(() => document.querySelectorAll('.cm-md-taskMarker').length === 3);

    const markers = document.querySelectorAll('.cm-md-taskMarker');
    expect(markers.length).toBe(3);
    expect(markers[0].classList.contains('cm-md-taskMarker-unchecked')).toBe(true);
    expect(markers[1].classList.contains('cm-md-taskMarker-checked')).toBe(true);
    expect(markers[2].classList.contains('cm-md-taskMarker-checked')).toBe(true);
  });
});
