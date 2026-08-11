/**
 * DocumentRenameService（spec image-workflow §6：${stem}.assets 联动 + 引用 patch 原子化）。
 */

import { createMockHost } from '../../host-api/src/index';
import { DocumentRenameService } from '../src/documentRename';
import { FileOpHistory } from '../src/fileOpHistory';
import type { EditorBridge, TextChange } from '../src/editorBridge';

function makeEditor(initialDoc: string, initialPath: string | null) {
  let text = initialDoc;
  let path = initialPath;
  const patches: TextChange[][] = [];
  const bridge: EditorBridge = {
    getText: () => text,
    getDocumentPath: () => path,
    setDocumentPath: (p) => { path = p; },
    patchChanges: (c) => { patches.push(c); text = applyChanges(text, c); return true; },
    refreshImages: () => {},
  };
  return { bridge, patches, text: () => text, path: () => path };
}

function applyChanges(doc: string, changes: TextChange[]): string {
  let out = doc;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.text + out.slice(c.to);
  }
  return out;
}

function setUp(opts: {
  doc: string;
  docPath: string | null;
  files: Array<[string, string]>;
  confirmResult?: boolean;
  onRenamed?: (newPath: string) => void;
}) {
  const mock = createMockHost({
    files: new Map(opts.files),
    confirmResult: opts.confirmResult ?? true,
  });
  const editor = makeEditor(opts.doc, opts.docPath);
  const history = new FileOpHistory(mock.fs);
  const renamed: string[] = [];
  const svc = new DocumentRenameService({
    fs: mock.fs,
    editor: editor.bridge,
    history,
    dialog: mock.dialog,
    onRenamed: (p) => { renamed.push(p); opts.onRenamed?.(p); },
  });
  return { mock, editor, history, svc, renamed };
}

const DOC_WITH_ASSETS = '![a](note.assets/a.png)\n![b](note.assets/b.png)\n![c](../imgs/c.png)\n';

describe('DocumentRenameService', () => {
  test('无 assets 目录：仅重命名文档 + 更新编辑器路径 + undo 记录', async () => {
    const { mock, editor, history, svc, renamed } = setUp({
      doc: '# hi',
      docPath: '/docs/note.md',
      files: [['/docs/note.md', '# hi']],
    });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ newPath: '/docs/renamed.md', assetDirRenamed: false, patchedCount: 0 });
    expect(await mock.fs.exists('/docs/renamed.md')).toEqual({ ok: true, value: true });
    expect(await mock.fs.exists('/docs/note.md')).toEqual({ ok: true, value: false });
    expect(editor.path()).toBe('/docs/renamed.md');
    expect(renamed).toEqual(['/docs/renamed.md']);
    expect(history.length).toBe(1);
  });

  test('有 assets + 确认：文档 + 资源目录重命名 + 引用 patch（单事务）', async () => {
    const { mock, editor, svc } = setUp({
      doc: DOC_WITH_ASSETS,
      docPath: '/docs/note.md',
      files: [
        ['/docs/note.md', DOC_WITH_ASSETS],
        ['/docs/note.assets/a.png', 'A'],
        ['/docs/note.assets/b.png', 'B'],
      ],
      confirmResult: true,
    });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.assetDirRenamed).toBe(true);
    expect(r.value.patchedCount).toBe(2);
    expect(await mock.fs.exists('/docs/renamed.assets/a.png')).toEqual({ ok: true, value: true });
    expect(await mock.fs.exists('/docs/note.assets/a.png')).toEqual({ ok: true, value: false });
    // patch 单事务 + 只动指向旧 asset 目录的引用
    expect(editor.patches).toHaveLength(1);
    const t = editor.text();
    expect(t).toContain('![a](renamed.assets/a.png)');
    expect(t).toContain('![b](renamed.assets/b.png)');
    expect(t).toContain('![c](../imgs/c.png)'); // 其他引用不动
  });

  test('有 assets + 拒绝同步：仅文档重命名，引用保持有效', async () => {
    const { mock, editor, svc } = setUp({
      doc: DOC_WITH_ASSETS,
      docPath: '/docs/note.md',
      files: [
        ['/docs/note.md', DOC_WITH_ASSETS],
        ['/docs/note.assets/a.png', 'A'],
      ],
      confirmResult: false,
    });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.assetDirRenamed).toBe(false);
    expect(r.value.patchedCount).toBe(0);
    expect(await mock.fs.exists('/docs/note.assets/a.png')).toEqual({ ok: true, value: true }); // 目录未动
    expect(editor.text()).toContain('![a](note.assets/a.png)'); // 引用未动（仍有效）
  });

  test('目标已存在 → conflict，不执行任何改动', async () => {
    const { mock, svc } = setUp({
      doc: '# hi',
      docPath: '/docs/note.md',
      files: [
        ['/docs/note.md', '# hi'],
        ['/docs/renamed.md', '# existing'],
      ],
    });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('conflict');
    expect(await mock.fs.exists('/docs/note.md')).toEqual({ ok: true, value: true });
  });

  test('asset 目录重命名失败 → 回滚文档重命名（文档零改动）', async () => {
    const base = createMockHost({
      files: new Map([
        ['/docs/note.md', DOC_WITH_ASSETS],
        ['/docs/note.assets/a.png', 'A'],
      ]),
    });
    const editor = makeEditor(DOC_WITH_ASSETS, '/docs/note.md');
    const history = new FileOpHistory(base.fs);
    // 包装 fs：目录 rename 失败
    const failingFs = new Proxy(base.fs, {
      get(target, prop) {
        if (prop === 'rename') {
          return async (from: string, _to: string) => {
            if (from === '/docs/note.assets') {
              return { ok: false, error: { code: 'io', message: '目录被占用' } };
            }
            return target.rename(from, _to);
          };
        }
        return Reflect.get(target, prop);
      },
    });
    const svc = new DocumentRenameService({
      fs: failingFs,
      editor: editor.bridge,
      history,
      dialog: base.dialog,
    });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('已回滚');
    // 文档已回滚
    expect(await base.fs.exists('/docs/note.md')).toEqual({ ok: true, value: true });
    expect(await base.fs.exists('/docs/renamed.md')).toEqual({ ok: true, value: false });
    expect(await base.fs.exists('/docs/note.assets/a.png')).toEqual({ ok: true, value: true });
  });

  test('未保存文档 → 错误', async () => {
    const { svc } = setUp({ doc: '# hi', docPath: null, files: [] });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(false);
  });

  test('文件名校验：空/路径分隔符', async () => {
    const { svc } = setUp({ doc: '# hi', docPath: '/docs/note.md', files: [['/docs/note.md', '# hi']] });
    expect((await svc.renameDocument('  ')).ok).toBe(false);
    expect((await svc.renameDocument('a/b.md')).ok).toBe(false);
  });

  test('补扩展名：note.md → renamed → renamed.md', async () => {
    const { svc } = setUp({ doc: '# hi', docPath: '/docs/note.md', files: [['/docs/note.md', '# hi']] });
    const r = await svc.renameDocument('renamed');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.newPath).toBe('/docs/renamed.md');
  });

  test('文件名未变化 → 错误', async () => {
    const { svc } = setUp({ doc: '# hi', docPath: '/docs/note.md', files: [['/docs/note.md', '# hi']] });
    expect((await svc.renameDocument('note')).ok).toBe(false);
  });
});
