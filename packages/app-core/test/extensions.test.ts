/**
 * Extension 运行时测试（PRD §119-121 / ADR-0013）。
 * 覆盖：
 * - manifest 校验（id/version/type/permissions）；
 * - 生命周期（register → enable → disable → unload）与状态；
 * - Safe Mode（PRD §121）；
 * - 运行时权限门卫：未声明权限 → permission-denied；process/keychain → not-implemented；
 * - 贡献点分发（setup 填充 contributions → collect 聚合）；
 * - setup 失败 → enabled=false + setupError。
 */
import { ExtensionRegistry, createNullExtensionHost } from '../src/extensions';
import type { ExtensionHost, ExtensionDocumentHost } from '../src/extensions';
import {
  ExtensionError,
  ExtensionManifest,
} from '../../extension-api/src';
import { ok, err } from '../../host-api/src';

function makeHost(over: Partial<ExtensionDocumentHost> = {}): ExtensionHost {
  return {
    document: {
      getText: () => '# doc',
      getSelection: () => ({ from: 0, to: 1 }),
      getCursor: () => 0,
      insertText: () => undefined,
      replaceSelection: () => undefined,
      ...over,
    },
    fs: {
      readDir: async () => ok([{ path: '/w/a.md', name: 'a.md', isDirectory: false, modifiedMs: 0, createdMs: 0 }]),
      readText: async (path: string) => (path === '/w/a.md' ? ok('hi') : err({ code: 'not-found', message: 'nf' })),
      writeText: async () => ok({ path: '/w/a.md' }),
      mkdir: async () => ok(undefined as never),
      delete: async () => ok(undefined as never),
    } as unknown as ExtensionHost['fs'],
    clipboard: { readText: async () => ok('clip'), writeText: async () => ok(undefined as never) } as unknown as ExtensionHost['clipboard'],
    keychain: undefined as never,
    process: undefined as never,
    notification: { show: async () => ok(undefined as never) } as unknown as ExtensionHost['notification'],
    aiEnabled: false,
  };
}

const manifest = (over: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  id: 'com.example.hello',
  version: '1.0.0',
  name: 'Hello',
  type: 'command',
  permissions: ['document.read'],
  ...over,
});

describe('ExtensionRegistry — manifest 校验', () => {
  const reg = new ExtensionRegistry(makeHost());

  it('合法 manifest 注册成功', async () => {
    const id = await reg.register(manifest(), () => undefined);
    expect(id).toBe('com.example.hello');
  });

  it('非法 id 拒绝', async () => {
    await expect(reg.register(manifest({ id: 'bad id!' }), () => undefined))
      .rejects.toThrow('非法扩展 id');
  });

  it('非法版本拒绝', async () => {
    await expect(reg.register(manifest({ version: 'latest' }), () => undefined))
      .rejects.toThrow('非法版本号');
  });

  it('未知权限拒绝', async () => {
    await expect(reg.register(manifest({ permissions: ['hack.all'] as never }), () => undefined))
      .rejects.toThrow('未知权限');
  });

  it('未知类型拒绝', async () => {
    await expect(reg.register(manifest({ type: 'virus' as never }), () => undefined))
      .rejects.toThrow('未知扩展类型');
  });

  it('重复 id 拒绝', async () => {
    await expect(reg.register(manifest(), () => undefined)).rejects.toThrow('扩展已注册');
  });
});

describe('ExtensionRegistry — 生命周期', () => {
  it('enable 调用 setup；disable 停用；unload 移除', async () => {
    const reg = new ExtensionRegistry(makeHost());
    let setupCalls = 0;
    await reg.register(manifest(), () => { setupCalls += 1; });
    expect(reg.list()[0].enabled).toBe(false);

    await reg.enable('com.example.hello');
    expect(setupCalls).toBe(1);
    expect(reg.isEnabled('com.example.hello')).toBe(true);

    await reg.disable('com.example.hello');
    expect(reg.isEnabled('com.example.hello')).toBe(false);

    await reg.unload('com.example.hello');
    expect(reg.get('com.example.hello')).toBeUndefined();
  });

  it('setup 失败 → enabled=false + setupError', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest(), () => { throw new Error('boom'); });
    await expect(reg.enable('com.example.hello')).rejects.toThrow('setup 失败');
    const rec = reg.get('com.example.hello');
    expect(rec?.enabled).toBe(false);
    expect(rec?.setupError).toBe('boom');
  });

  it('未注册 enable → not-found', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await expect(reg.enable('nope')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('ExtensionRegistry — Safe Mode（PRD §121）', () => {
  it('safe mode 下 enable 拒绝', async () => {
    const reg = new ExtensionRegistry(makeHost());
    reg.setSafeMode(true);
    await reg.register(manifest(), () => undefined);
    await expect(reg.enable('com.example.hello')).rejects.toThrow('Safe Mode');
  });
});

describe('ExtensionRegistry — 运行时权限门卫', () => {
  it('未声明 document.write → insertText 抛 permission-denied', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest({ permissions: ['document.read'] }), (ctx) => {
      expect(() => ctx.document.insertText('x')).toThrow(ExtensionError);
      expect(() => ctx.document.insertText('x')).toThrow('缺少权限: document.write');
    });
    await reg.enable('com.example.hello');
  });

  it('声明权限可用', async () => {
    const reg = new ExtensionRegistry(makeHost());
    const inserted: string[] = [];
    await reg.register(manifest({ permissions: ['document.read', 'document.write'] }), (ctx) => {
      ctx.document.insertText('x', 0, 0);
      expect(ctx.document.getText()).toBe('# doc');
    });
    await reg.register(manifest({ id: 'com.example.writer', permissions: ['document.write'] }), (ctx) => {
      inserted.push('ran');
      void ctx.document.getText;
    });
    await reg.enable('com.example.hello');
    // 不声明 document.read 的扩展调用 getText 应抛
    await reg.register(manifest({ id: 'com.example.no-read', permissions: [] }), (ctx) => {
      expect(() => ctx.document.getText()).toThrow('缺少权限: document.read');
    });
    await reg.enable('com.example.no-read');
    expect(inserted).toEqual([]);
  });

  it('process / keychain 一律 not-implemented', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest({ permissions: ['process', 'keychain'] }), (ctx) => {
      expect(ctx.process.exec('ls')).rejects.toThrow('V1 未开放');
      expect(ctx.keychain.get('k')).rejects.toThrow('V1 未开放');
    });
    await reg.enable('com.example.hello');
  });

  it('workspace 门面按权限代理', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest({ permissions: ['workspace.read'] }), async (ctx) => {
      const files = await ctx.workspace.listFiles('/w');
      expect(files[0].name).toBe('a.md');
      const content = await ctx.workspace.readFile('/w/a.md');
      expect(content).toBe('hi');
      await expect(ctx.workspace.writeFile('/w/a.md', 'x')).rejects.toThrow('缺少权限: workspace.write');
    });
    await reg.enable('com.example.hello');
  });
});

describe('ExtensionRegistry — 贡献点分发', () => {
  it('setup 填充 contributions → collect 聚合', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest({ type: 'command' }), (ctx) => {
      ctx.contributions.commands = [{ id: 'ext.hello', title: { zh: '你好', en: 'Hello' }, run: () => undefined }];
      ctx.contributions.theme = { id: 'ext-theme', name: 'Ext', kind: 'light', variables: { '--bg': '#fff' } };
    });
    await reg.enable('com.example.hello');

    const commands = reg.collect('commands');
    expect(commands).toHaveLength(1);
    expect(commands[0].value[0].id).toBe('ext.hello');

    const themes = reg.collect('theme');
    expect(themes).toHaveLength(1);
    expect(themes[0].value.kind).toBe('light');
  });

  it('未启用扩展的贡献点不聚合', async () => {
    const reg = new ExtensionRegistry(makeHost());
    await reg.register(manifest(), (ctx) => {
      ctx.contributions.commands = [{ id: 'x.y', title: { zh: 'x' }, run: () => undefined }];
    });
    expect(reg.collect('commands')).toHaveLength(0);
  });
});
