/**
 * host-api contract tests —— 每个 service 的行为契约（基于 createMockHost / createNullHost）。
 */

import { createMockHost, createMockHostState } from '../src/mock-host';
import { createNullHost } from '../src/null-host';
import { isOk, ok } from '../src/types';

const HOST = createMockHost();

describe('Error model', () => {
  test('Result 类型：ok 携带 value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  test('createNullHost 所有方法返回 not-implemented', async () => {
    const host = createNullHost();
    const f = await host.fs.open();
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error.code).toBe('not-implemented');
  });

  test('取消对话框 → canceled 错误', async () => {
    const host = createMockHost({ nextOpenPath: null });
    const r = await host.fs.open();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('canceled');
  });
});

describe('fs', () => {
  test('open 预设路径读取文件内容（含 encoding/eol/磁盘状态）', async () => {
    const host = createMockHost({ files: new Map([['/a.md', 'hello']]), nextOpenPath: '/a.md' });
    const r = await host.fs.open();
    expect(r).toEqual({
      ok: true,
      value: { path: '/a.md', content: 'hello', encoding: 'utf-8', eol: '\n', diskMtimeMs: 1000, identityKey: 'mock:1' },
    });
  });

  test('open 检测 CRLF EOL（preserve metadata）', async () => {
    const host = createMockHost({ files: new Map([['/crlf.md', 'a\r\nb\r\n']]), nextOpenPath: '/crlf.md' });
    const r = await host.fs.open();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.eol).toBe('\r\n');
  });

  test('save 携带 encoding/eol（preserve metadata 契约，SaveOptions 接受且不报错）', async () => {
    const host = createMockHost({ nextSavePath: '/out.md' });
    const r = await host.fs.save(null, 'content', { encoding: 'utf-8-bom', eol: '\r\n' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.path).toBe('/out.md');
      expect(r.value.bytesWritten).toBe(7);
    }
    // 契约：save 接受 SaveOptions（encoding/eol）；实际编码由 Adapter 实现保证
  });

  test('readText 不存在的文件 → not-found', async () => {
    const r = await HOST.fs.readText('/missing.md');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('not-found');
      expect(r.error.path).toBe('/missing.md');
    }
  });

  test('save + readText 往返（原子写语义由实现保证）', async () => {
    const host = createMockHost({ nextSavePath: '/out.md' });
    const save = await host.fs.save(null, '# saved');
    expect(save.ok).toBe(true);
    if (save.ok) expect(save.value.bytesWritten).toBe(7); // '# saved'

    const read = await host.fs.readText('/out.md');
    expect(read).toEqual({ ok: true, value: '# saved' });
  });

  test('save 取消（path 与 nextSavePath 均 null）→ canceled', async () => {
    const host = createMockHost({ nextSavePath: null });
    const r = await host.fs.save(null, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('canceled');
  });

  test('exists / rename / delete / readDir', async () => {
    const host = createMockHost({
      files: new Map([['/dir/a.md', 'A'], ['/dir/b.md', 'B']]),
    });
    expect(await host.fs.exists('/dir/a.md')).toEqual({ ok: true, value: true });
    expect(await host.fs.exists('/nope')).toEqual({ ok: true, value: false });

    const rename = await host.fs.rename('/dir/a.md', '/dir/c.md');
    expect(rename.ok).toBe(true);
    expect(await host.fs.readText('/dir/c.md')).toEqual({ ok: true, value: 'A' });

    const dir = await host.fs.readDir('/dir');
    expect(dir.ok).toBe(true);
    if (dir.ok) {
      const names = dir.value.map((e) => e.name).sort();
      expect(names).toEqual(['b.md', 'c.md']);
    }

    await host.fs.delete('/dir/b.md');
    expect(await host.fs.exists('/dir/b.md')).toEqual({ ok: true, value: false });
  });

  test('copyFile / mkdir / writeBinary / readBinary（Image Workflow）', async () => {
    const host = createMockHost({ files: new Map([['/docs/a.png', 'fake']]) });
    // mkdir + copyFile
    expect(await host.fs.mkdir('/docs/assets')).toEqual({ ok: true, value: undefined });
    expect(await host.fs.copyFile('/docs/a.png', '/docs/assets/a.png')).toEqual({ ok: true, value: undefined });
    expect(await host.fs.exists('/docs/assets/a.png')).toEqual({ ok: true, value: true });
    // copyFile 源不存在 → not-found
    const missing = await host.fs.copyFile('/nope.png', '/docs/assets/nope.png');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('not-found');
    // writeBinary + readBinary roundtrip
    const data = new Uint8Array([137, 80, 78, 71]).buffer as ArrayBuffer;
    expect(await host.fs.writeBinary('/docs/assets/pasted.png', data)).toEqual({ ok: true, value: undefined });
    const read = await host.fs.readBinary('/docs/assets/pasted.png');
    expect(read.ok).toBe(true);
    if (read.ok) {
      const bytes = new Uint8Array(read.value);
      expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
    }
    // readBinary 不存在 → not-found
    const gone = await host.fs.readBinary('/docs/assets/gone.png');
    expect(gone.ok).toBe(false);
  });
});

describe('dialog', () => {
  test('showConfirm 返回预设值', async () => {
    const yes = await HOST.dialog.showConfirm('t', 'm');
    expect(yes).toEqual({ ok: true, value: true });
    const no = await createMockHost({ confirmResult: false }).dialog.showConfirm('t', 'm');
    expect(no).toEqual({ ok: true, value: false });
  });

  test('showMessage 返回第一个按钮', async () => {
    const r = await HOST.dialog.showMessage({ title: 't', message: 'm', buttons: ['OK', 'Cancel'] });
    expect(r).toEqual({ ok: true, value: 'OK' });
  });

  test('showOpen 取消 → canceled', async () => {
    const r = await createMockHost({ nextOpenPath: null }).dialog.showOpen();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('canceled');
  });
});

describe('clipboard', () => {
  test('writeText / readText 往返', async () => {
    const host = createMockHost();
    await host.clipboard.writeText('hello');
    expect(await host.clipboard.readText()).toEqual({ ok: true, value: 'hello' });
  });

  test('writeHTML / readHTML；writeImage / readImage', async () => {
    const host = createMockHost();
    await host.clipboard.writeHTML('<b>hi</b>');
    expect(await host.clipboard.readHTML()).toEqual({ ok: true, value: '<b>hi</b>' });

    const img = new ArrayBuffer(4);
    await host.clipboard.writeImage(img);
    const read = await host.clipboard.readImage();
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(img);
  });

  test('初始剪贴板为空', async () => {
    expect(await HOST.clipboard.readText()).toEqual({ ok: true, value: '' });
    expect(await HOST.clipboard.readHTML()).toEqual({ ok: true, value: null });
  });
});

describe('window', () => {
  test('setTitle / setSize / getSize / getFocused', async () => {
    const host = createMockHost();
    await host.window.setTitle('Mellow V0.1');
    await host.window.setSize({ width: 800, height: 600 });
    expect(await host.window.getSize()).toEqual({ ok: true, value: { width: 800, height: 600 } });
    expect(await host.window.getFocused()).toEqual({ ok: true, value: true });
  });
});

describe('watcher', () => {
  test('watch 返回取消订阅函数', async () => {
    const host = createMockHost();
    const r = await host.watcher.watch('/a.md', () => { /* no-op */ });
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.value).toBe('function');
  });
});

describe('search', () => {
  test('searchFiles 在内存文件系统中匹配', async () => {
    const host = createMockHost({
      files: new Map([
        ['/src/a.md', '# Title\n\nhello world'],
        ['/src/b.md', '# Other\n\nnothing'],
      ]),
    });
    const r = await host.search.searchFiles('hello', '/src');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0].path).toBe('/src/a.md');
      expect(r.value[0].line).toBe(3);
    }
  });

  test('预设 searchResults 优先', async () => {
    const host = createMockHost({
      searchResults: [{ path: '/x.md', line: 1, snippet: 'pre' }],
    });
    const r = await host.search.searchFiles('q', '/');
    expect(r).toEqual({ ok: true, value: [{ path: '/x.md', line: 1, snippet: 'pre' }] });
  });
});

describe('export', () => {
  test('exportPDF / exportHTML / print 记录到 exported', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    await host.export.exportPDF('/out.pdf', 'content');
    await host.export.exportHTML('/out.html', '<html>');
    await host.export.print('<html>');

    expect(state.exported.map((e) => e.kind)).toEqual(['pdf', 'html', 'print']);
  });
});

describe('keychain', () => {
  test('set / get / delete 往返；不存在 → null', async () => {
    const host = createMockHost();
    expect(await host.keychain.get('token')).toEqual({ ok: true, value: null });

    await host.keychain.set('token', 'secret');
    expect(await host.keychain.get('token')).toEqual({ ok: true, value: 'secret' });

    await host.keychain.delete('token');
    expect(await host.keychain.get('token')).toEqual({ ok: true, value: null });
  });
});

describe('process', () => {
  test('spawn / kill 记录调用', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    const spawn = await host.process.spawn('pandoc', ['-v'], { cwd: '/tmp' });
    expect(spawn.ok).toBe(true);
    if (spawn.ok) expect(spawn.value.pid).toBeGreaterThan(0);

    await host.process.kill(spawn.ok ? spawn.value.pid : 0);
    expect(state.spawned).toHaveLength(1);
    expect(state.killed).toHaveLength(1);
  });
});

describe('notification', () => {
  test('show 记录到 notifications', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    await host.notification.show({ title: 'Saved', body: 'done' });
    expect(state.notifications).toEqual([{ title: 'Saved', body: 'done' }]);
  });
});

describe('opener', () => {
  test('openPath / revealInFolder / openUrl 记录', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    await host.opener.openPath('/a.md');
    await host.opener.revealInFolder('/a.md');
    await host.opener.openUrl('https://example.com');

    expect(state.openedPaths).toEqual(['/a.md', 'reveal:/a.md', 'url:https://example.com']);
  });
});

describe('recovery', () => {
  const payload = {
    documentId: 'doc-1',
    path: '/a.md',
    content: '# crash content',
    revision: 3,
    encoding: 'utf-8' as const,
    eol: '\n' as const,
    cursor: { anchor: 1, head: 2 },
    scroll: null,
    savedAt: 1000,
  };

  test('save → list/get 往返（document-id mapping）', async () => {
    const state = createMockHostState();
    const host = createMockHost(state);
    await host.recovery.save(payload);

    const list = await host.recovery.list();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value).toEqual([{ documentId: 'doc-1', path: '/a.md', revision: 3, savedAt: 1000 }]);
    }

    const got = await host.recovery.get('doc-1');
    expect(got).toEqual({ ok: true, value: payload });
  });

  test('cleanup after successful save：delete 后 list 为空', async () => {
    const host = createMockHost();
    await host.recovery.save(payload);
    await host.recovery.delete('doc-1');
    const list = await host.recovery.list();
    expect(list.ok && list.value.length === 0).toBe(true);
    expect(await host.recovery.get('doc-1')).toEqual({ ok: true, value: null });
  });

  test('multiple documents 独立', async () => {
    const host = createMockHost();
    await host.recovery.save(payload);
    await host.recovery.save({ ...payload, documentId: 'doc-2', content: 'BBB' });
    const list = await host.recovery.list();
    expect(list.ok && list.value.length === 2).toBe(true);
    await host.recovery.delete('doc-1');
    const listAfter = await host.recovery.list();
    if (listAfter.ok) expect(listAfter.value.length).toBe(1);
  });
});

describe('isOk 辅助', () => {
  test('判别 ok 分支', async () => {
    const r = await HOST.fs.exists('/dev.md');
    expect(isOk(r)).toBe(true);
  });
});
