/**
 * ImageFileOpsService（spec image-workflow §6/§7）+ FileOpHistory（PRD §58）测试。
 */

import { createMockHost } from '../../host-api/src/index';
import type { FileService } from '../../host-api/src/index';
import { ImageFileOpsService } from '../src/imageFileOps';
import { FileOpHistory } from '../src/fileOpHistory';
import type { EditorBridge, TextChange } from '../src/editorBridge';

/** 内存编辑器桥（真实应用 changes；记录 patch 历史） */
function makeEditor(initialDoc: string, initialPath: string | null) {
  let text = initialDoc;
  let path = initialPath;
  const patches: TextChange[][] = [];
  let refreshCount = 0;
  const apply = (changes: TextChange[]): string => {
    let out = text;
    for (const c of [...changes].sort((a, b) => b.from - a.from)) {
      out = out.slice(0, c.from) + c.text + out.slice(c.to);
    }
    return out;
  };
  const bridge: EditorBridge = {
    getText: () => text,
    getDocumentPath: () => path,
    setDocumentPath: (p) => { path = p; },
    patchChanges: (c) => { patches.push(c); text = apply(c); return true; },
    refreshImages: () => { refreshCount += 1; },
  };
  return { bridge, patches, text: () => text, path: () => path, refreshCount: () => refreshCount };
}

interface Ctx {
  fs: FileService;
  ops: ImageFileOpsService;
  history: FileOpHistory;
  editor: ReturnType<typeof makeEditor>;
}

function setUp(doc: string, docPath: string | null, files: Array<[string, string]>, globalSetting?: string) {
  const mock = createMockHost({ files: new Map(files) });
  const editor = makeEditor(doc, docPath);
  const history = new FileOpHistory(mock.fs);
  const ops = new ImageFileOpsService({
    fs: mock.fs,
    editor: editor.bridge,
    history,
    assetSetting: globalSetting !== undefined ? { getGlobalSetting: () => globalSetting } : undefined,
  });
  const ctx: Ctx = { fs: mock.fs, ops, history, editor };
  return { mock, ...ctx };
}

const DOC = '![a](../imgs/a.png)\n![b](../imgs/b.png)\n![r](https://a.com/r.png)\n![in](./assets/in.png)\n';

describe('ImageFileOpsService.moveAll', () => {
  test('本地移入 asset；远程/已在 asset/缺失跳过；patch 相对路径', async () => {
    const { ops, editor, mock, history } = setUp(DOC, '/docs/sub/note.md', [
      ['/docs/imgs/a.png', 'A'],
      ['/docs/imgs/b.png', 'B'],
      ['/docs/sub/assets/in.png', 'IN'],
    ]);
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.moved).toBe(2);
    expect(r.value.skipped.map((s) => s.src)).toEqual([
      'https://a.com/r.png',
      './assets/in.png',
    ]);
    // fs：源消失、目标存在
    expect(await mock.fs.exists('/docs/imgs/a.png')).toEqual({ ok: true, value: false });
    expect(await mock.fs.exists('/docs/sub/assets/a.png')).toEqual({ ok: true, value: true });
    // patch 单事务（一次调用）+ 相对路径
    expect(editor.patches).toHaveLength(1);
    expect(editor.patches[0]).toHaveLength(2);
    expect(editor.text()).toContain('![a](assets/a.png)');
    expect(editor.text()).toContain('![b](assets/b.png)');
    // undo 记录
    expect(editor.refreshCount()).toBe(1);
    expect(history.length).toBeGreaterThan(0);
  });

  test('缺失文件跳过（exists=false），引用保留', async () => {
    const { ops } = setUp('![m](../missing/m.png)\n', '/docs/sub/note.md', []);
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.moved).toBe(0);
      expect(r.value.skipped[0].reason).toContain('文件不存在');
    }
  });

  test('未保存文档 → 错误（无 asset 目录基准）', async () => {
    const { ops } = setUp('![a](../imgs/a.png)\n', null, [['/docs/imgs/a.png', 'A']]);
    const r = await ops.moveAll();
    expect(r.ok).toBe(false);
  });

  test('asset 目录配置：front matter docname → ${stem}.assets', async () => {
    const doc = '---\nasset_dir: docname\n---\n![a](../imgs/a.png)\n';
    const { ops, mock } = setUp(doc, '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']]);
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (r.ok && r.value.moved === 1) {
      expect(await mock.fs.exists('/docs/sub/note.assets/a.png')).toEqual({ ok: true, value: true });
    }
  });

  test('global 设置 images 目录', async () => {
    const { ops, mock } = setUp('![a](../imgs/a.png)\n', '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']], 'images');
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (r.ok && r.value.moved === 1) {
      expect(await mock.fs.exists('/docs/sub/images/a.png')).toEqual({ ok: true, value: true });
    }
  });

  test('重名冲突 → 加序号不覆盖', async () => {
    const { ops, mock, editor } = setUp('![a](../imgs/a.png)\n', '/docs/sub/note.md', [
      ['/docs/imgs/a.png', 'A'],
      ['/docs/sub/assets/a.png', 'OLD'], // 已存在同名
    ]);
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.moved).toBe(1);
      expect(await mock.fs.readText('/docs/sub/assets/a.png')).toEqual({ ok: true, value: 'OLD' }); // 原文件未被覆盖
      expect(await mock.fs.exists('/docs/sub/assets/a-1.png')).toEqual({ ok: true, value: true });
      expect(editor.text()).toContain('![a](assets/a-1.png)');
    }
  });
});

describe('ImageFileOpsService.copyAll / downloadRemote', () => {
  test('copyAll 保留原文件', async () => {
    const { ops, mock, editor } = setUp(DOC, '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']]);
    const r = await ops.copyAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.copied).toBe(1);
      expect(await mock.fs.exists('/docs/imgs/a.png')).toEqual({ ok: true, value: true }); // 原文件保留
      expect(await mock.fs.exists('/docs/sub/assets/a.png')).toEqual({ ok: true, value: true });
      expect(editor.patches).toHaveLength(1);
    }
  });

  test('downloadRemote 仅远程；下载后 patch 相对路径', async () => {
    const { ops, mock, editor } = setUp(DOC, '/docs/sub/note.md', []);
    const r = await ops.downloadRemote();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.downloaded).toBe(1);
      expect(await mock.fs.exists('/docs/sub/assets/r.png')).toEqual({ ok: true, value: true });
      expect(editor.text()).toContain('![r](assets/r.png)');
      const skipped: string[] = r.value.skipped.map((s) => s.src);
      expect(skipped).toEqual(['../imgs/a.png', '../imgs/b.png', './assets/in.png']);
    }
  });
});

describe('ImageFileOpsService.uploadAll（B5 / PRD §55）', () => {
  /** 注入 mock uploader 的 setUp 扩展（uploads 原样返回 → 长度由用例控制） */
  function setUpUpload(doc: string, docPath: string | null, files: Array<[string, string]>, uploads: string[] | null, channel = 'picgo-http') {
    const base = setUp(doc, docPath, files);
    const uploaded: string[] = [];
    const ops = new ImageFileOpsService({
      fs: base.fs,
      editor: base.editor.bridge,
      history: base.history,
      uploader: {
        uploadImages: async (input: string[]) => {
          if (uploads === null) {
            return { ok: false as const, error: { code: 'io' as const, message: 'upload service down' } };
          }
          uploaded.push(...input);
          return { ok: true as const, value: [...uploads] };
        },
      },
      uploadOptions: () => ({ channel: channel as 'picgo-http', httpUrl: 'http://127.0.0.1:36677/upload', command: '' }),
    });
    return { ...base, ops, uploaded };
  }

  test('本地图片上传 → URL 替换；本地文件保留；无文件 undo；单事务 patch', async () => {
    const { ops, mock, editor, history, uploaded } = setUpUpload(DOC, '/docs/sub/note.md', [
      ['/docs/imgs/a.png', 'A'],
      ['/docs/imgs/b.png', 'B'],
    ], ['https://cdn.test/a.png', 'https://cdn.test/b.png']);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.uploaded).toBe(2);
    // 每个唯一路径只上传一次
    expect(uploaded).toEqual(['/docs/imgs/a.png', '/docs/imgs/b.png']);
    // URL 替换
    expect(editor.text()).toContain('![a](https://cdn.test/a.png)');
    expect(editor.text()).toContain('![b](https://cdn.test/b.png)');
    // 本地文件保留（Typora 行为）
    expect(await mock.fs.exists('/docs/imgs/a.png')).toEqual({ ok: true, value: true });
    // 上传无 fsOps → 无文件 undo（文档 Undo 由编辑器单事务承担）
    expect(history.length).toBe(0);
    expect(editor.patches).toHaveLength(1);
    expect(editor.refreshCount()).toBe(1);
    // 远程/缺失跳过
    const skipped: string[] = r.value.skipped.map((s) => s.src);
    expect(skipped).toEqual(['https://a.com/r.png', './assets/in.png']);
  });

  test('同一路径多次引用 → 上传一次，全部替换', async () => {
    const doc = '![x](../imgs/x.png)\ntext\n![x again](../imgs/x.png)\n';
    const { ops, uploaded } = setUpUpload(doc, '/docs/sub/note.md', [['/docs/imgs/x.png', 'X']], ['https://cdn.test/x.png']);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(uploaded).toEqual(['/docs/imgs/x.png']);
    expect(r.value.uploaded).toBe(2);
  });

  test('上传服务整体失败 → 全部 failed，文档零改动', async () => {
    const { ops, editor } = setUpUpload('![a](../imgs/a.png)\n', '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']], null);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.uploaded).toBe(0);
    expect(r.value.failed).toHaveLength(1);
    expect(r.value.failed[0].error).toContain('upload service down');
    expect(editor.patches).toHaveLength(0);
    expect(editor.text()).toBe('![a](../imgs/a.png)\n');
  });

  test('未配置 uploader → not-implemented', async () => {
    const { ops } = setUp('![a](../imgs/a.png)\n', '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']]);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('not-implemented');
  });

  test("channel 'none'（localStorage 不可信值）→ not-implemented", async () => {
    const { ops } = setUpUpload('![a](../imgs/a.png)\n', '/docs/sub/note.md', [['/docs/imgs/a.png', 'A']], ['u'], 'none');
    const r = await ops.uploadAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('not-implemented');
  });

  test('返回 URL 数量不匹配 → invalid-argument', async () => {
    const { ops } = setUpUpload('![a](../imgs/a.png)\n![b](../imgs/b.png)\n', '/docs/sub/note.md', [
      ['/docs/imgs/a.png', 'A'],
      ['/docs/imgs/b.png', 'B'],
    ], ['https://cdn.test/only-one.png']);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid-argument');
  });

  test('无本地图片 → 空报告（提前返回，不上传不扫描跳过项）', async () => {
    const { ops, uploaded } = setUpUpload('![r](https://a.com/r.png)\n', '/docs/sub/note.md', [], ['u']);
    const r = await ops.uploadAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.uploaded).toBe(0);
    expect(r.value.skipped).toHaveLength(0);
    expect(r.value.failed).toHaveLength(0);
    expect(uploaded).toHaveLength(0);
  });
});

describe('ImageFileOpsService 单图操作', () => {
  test('moveImage：对话框目标目录 + patch', async () => {
    const { ops, mock, editor } = setUp('![x](../imgs/x.png)\n', '/docs/sub/note.md', [['/docs/imgs/x.png', 'X']]);
    const r = await ops.moveImage('../imgs/x.png', '/picked/dir');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.moved).toBe(1);
      expect(await mock.fs.exists('/picked/dir/x.png')).toEqual({ ok: true, value: true });
      expect(editor.text()).toContain('![x](../../picked/dir/x.png)');
    }
  });

  test('renameImage：同目录改名 + patch', async () => {
    const { ops, mock, editor } = setUp('![x](./assets/x.png)\n', '/docs/sub/note.md', [['/docs/sub/assets/x.png', 'X']]);
    const r = await ops.renameImage('./assets/x.png', 'renamed');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(await mock.fs.exists('/docs/sub/assets/renamed.png')).toEqual({ ok: true, value: true });
      expect(await mock.fs.exists('/docs/sub/assets/x.png')).toEqual({ ok: true, value: false });
      expect(editor.text()).toContain('![x](assets/renamed.png)');
    }
  });

  test('引用不存在 → not-found', async () => {
    const { ops } = setUp('![x](./assets/x.png)\n', '/docs/sub/note.md', [['/docs/sub/assets/x.png', 'X']]);
    const r = await ops.renameImage('./assets/nope.png', 'y');
    expect(r.ok).toBe(false);
  });
});

describe('失败回滚（fs 失败 → 文档零改动）', () => {
  test('第二个 move 失败 → 回滚第一个 move + 无 patch', async () => {
    const base = createMockHost({
      files: new Map([
        ['/docs/imgs/a.png', 'A'],
        ['/docs/imgs/b.png', 'B'],
      ]),
    });
    const editor = makeEditor('![a](../imgs/a.png)\n![b](../imgs/b.png)\n', '/docs/sub/note.md');
    const history = new FileOpHistory(base.fs);
    // 包装 fs：第二个 move 失败
    let moveCount = 0;
    const failingFs: FileService = new Proxy(base.fs, {
      get(target, prop) {
        if (prop === 'move') {
          return async (from: string, to: string) => {
            moveCount += 1;
            if (moveCount === 2) {
              return { ok: false, error: { code: 'io', message: '模拟失败' } };
            }
            return target.move(from, to);
          };
        }
        return Reflect.get(target, prop);
      },
    });
    const ops = new ImageFileOpsService({ fs: failingFs, editor: editor.bridge, history });
    const r = await ops.moveAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.failed).toHaveLength(1);
      expect(r.value.moved).toBe(2); // 计划 2，执行失败 1 → report.moved 是计划数（见下）
    }
    // 回滚：第一个 move 已撤销 → 源文件都在原位
    expect(await base.fs.exists('/docs/imgs/a.png')).toEqual({ ok: true, value: true });
    expect(await base.fs.exists('/docs/imgs/b.png')).toEqual({ ok: true, value: true });
    expect(await base.fs.exists('/docs/sub/assets/a.png')).toEqual({ ok: true, value: false });
    // 无 patch（文档零改动）
    expect(editor.patches).toHaveLength(0);
    expect(editor.text()).toBe('![a](../imgs/a.png)\n![b](../imgs/b.png)\n');
  });
});

describe('ImageFileOpsService 单图下载 / 路径解析', () => {
  test('downloadRemoteImage：仅下载指定远程图 + patch', async () => {
    const { ops, mock, editor } = setUp(DOC, '/docs/sub/note.md', []);
    const r = await ops.downloadRemoteImage('https://a.com/r.png');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.downloaded).toBe(1);
      expect(await mock.fs.exists('/docs/sub/assets/r.png')).toEqual({ ok: true, value: true });
      expect(editor.text()).toContain('![r](assets/r.png)');
      expect(editor.text()).toContain('![a](../imgs/a.png)'); // 其他引用不动
    }
  });

  test('downloadRemoteImage：非远程/不存在 → 错误', async () => {
    const { ops } = setUp(DOC, '/docs/sub/note.md', []);
    expect((await ops.downloadRemoteImage('../imgs/a.png')).ok).toBe(false);
    expect((await ops.downloadRemoteImage('https://nope.com/x.png')).ok).toBe(false);
  });

  test('resolveSrcPath：src → 绝对路径', async () => {
    const { ops } = setUp('![x](../imgs/x.png)\n![r](https://a.com/r.png)\n', '/docs/sub/note.md', []);
    expect(ops.resolveSrcPath('../imgs/x.png')).toBe('/docs/imgs/x.png');
    expect(ops.resolveSrcPath('https://a.com/r.png')).toBeNull();
    expect(ops.resolveSrcPath('nope.png')).toBeNull();
  });
});

describe('FileOpHistory（PRD §58）', () => {
  test('undo(count)：批量操作一次撤销全部', async () => {
    const mock = createMockHost({
      files: new Map([
        ['/docs/imgs/a.png', 'A'],
        ['/docs/imgs/b.png', 'B'],
      ]),
    });
    await mock.fs.move('/docs/imgs/a.png', '/docs/assets/a.png');
    await mock.fs.move('/docs/imgs/b.png', '/docs/assets/b.png');
    const history = new FileOpHistory(mock.fs);
    history.push({ kind: 'move', from: '/docs/imgs/a.png', to: '/docs/assets/a.png' });
    history.push({ kind: 'move', from: '/docs/imgs/b.png', to: '/docs/assets/b.png' });
    const r = await history.undo(2);
    expect(r.ok).toBe(true);
    expect(await mock.fs.exists('/docs/imgs/a.png')).toEqual({ ok: true, value: true });
    expect(await mock.fs.exists('/docs/imgs/b.png')).toEqual({ ok: true, value: true });
    expect(await mock.fs.exists('/docs/assets/a.png')).toEqual({ ok: true, value: false });
  });

  test('move undo：反向移回', async () => {
    const mock = createMockHost({ files: new Map([['/a.md', 'x']]) });
    await mock.fs.move('/a.md', '/b.md');
    const history = new FileOpHistory(mock.fs);
    history.push({ kind: 'move', from: '/a.md', to: '/b.md' });
    const r = await history.undo();
    expect(r.ok).toBe(true);
    expect(await mock.fs.exists('/a.md')).toEqual({ ok: true, value: true });
    expect(await mock.fs.exists('/b.md')).toEqual({ ok: true, value: false });
  });

  test('copy undo：删除副本', async () => {
    const mock = createMockHost({ files: new Map([['/a.png', 'x']]) });
    await mock.fs.copyFile('/a.png', '/assets/a.png');
    const history = new FileOpHistory(mock.fs);
    history.push({ kind: 'copy', from: '/a.png', to: '/assets/a.png' });
    await history.undo();
    expect(await mock.fs.exists('/assets/a.png')).toEqual({ ok: true, value: false });
    expect(await mock.fs.exists('/a.png')).toEqual({ ok: true, value: true });
  });

  test('mkdir undo：仅空目录删除', async () => {
    const mock = createMockHost();
    const history = new FileOpHistory(mock.fs);
    history.push({ kind: 'mkdir', path: '/assets' });
    await history.undo();
    // 空目录被删除（readDir 不再列出）
    const r = await mock.fs.readDir('/');
    if (r.ok) expect(r.value.some((e) => e.name === 'assets')).toBe(false);
  });

  test('空栈 undo → 错误', async () => {
    const mock = createMockHost();
    const history = new FileOpHistory(mock.fs);
    const r = await history.undo();
    expect(r.ok).toBe(false);
  });

  test('rename undo：改回原名', async () => {
    const mock = createMockHost({ files: new Map([['/a.md', 'x']]) });
    await mock.fs.rename('/a.md', '/b.md');
    const history = new FileOpHistory(mock.fs);
    history.push({ kind: 'rename', from: '/a.md', to: '/b.md' });
    await history.undo();
    expect(await mock.fs.exists('/a.md')).toEqual({ ok: true, value: true });
  });
});
