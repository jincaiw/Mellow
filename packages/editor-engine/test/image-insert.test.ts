/**
 * Image 插入计划（spec §3 Insert Strategy / §4 Asset Directory / §12 场景）。
 */

import { planImageCandidate, planImageCandidates, executeFsOps, fileLinkMarkdown } from '../src/image/insert';
import type { ImageHost, ImageCandidate } from '../src/image/host';
import { unescapeImageSrc } from '../src/image/path';

/** 内存 mock ImageHost（记录 fs 操作，不落盘） */
function makeHost(docPath: string | null = '/docs/note.md'): ImageHost & { ops: string[] } {
  const ops: string[] = [];
  return {
    getDocumentPath: () => docPath,
    pickImageFiles: async () => [],
    readClipboardFiles: async () => [],
    consumeDroppedFilePaths: () => [],
    copyFile: async (from, to) => { ops.push(`copy:${from}→${to}`); return { ok: true, value: undefined }; },
    mkdir: async (path) => { ops.push(`mkdir:${path}`); return { ok: true, value: undefined }; },
    writeBinary: async (path) => { ops.push(`write:${path}`); return { ok: true, value: undefined }; },
    resolveWebUrl: async (src) => `mock://${src}`,
    resolveAbsolutePath: () => null,
    exists: async () => true,
    revealFile: async () => {},
    ops,
  };
}

function srcOf(plan: { markdown: string }): string {
  const first = plan.markdown.split('\n\n')[0].trim();
  const m = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(first);
  return m === null ? '' : m[2];
}

describe('策略：keep-original（本地文件 → 相对路径，spec §3 默认）', () => {
  test('同目录文件 → 相对路径，无 fs 操作', async () => {
    const host = makeHost();
    const plan = await planImageCandidate(host, { kind: 'file', path: '/docs/a.png' });
    expect(plan.fsOps).toHaveLength(0);
    expect(srcOf(plan)).toBe('a.png');
  });

  test('子目录文件 → assets/xxx 相对路径', async () => {
    const host = makeHost();
    const plan = await planImageCandidate(host, { kind: 'file', path: '/docs/assets/a.png' });
    expect(srcOf(plan)).toBe('assets/a.png');
  });

  test('上级目录 → ../', async () => {
    const host = makeHost('/docs/chapters/c1.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '/docs/assets/a.png' });
    expect(srcOf(plan)).toBe('../assets/a.png');
  });

  test('中文/空格文件名', async () => {
    const host = makeHost('/docs/笔记.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '/docs/图 片/照 片.png' });
    expect(srcOf(plan)).toBe('图%20片/照%20片.png'); // 目录与文件名空格均转义，中文保留
  });

  test('Windows drive 同盘相对化 / 跨盘绝对', async () => {
    const host = makeHost('C:\\docs\\note.md');
    const same = await planImageCandidate(host, { kind: 'file', path: 'C:\\docs\\a.png' });
    expect(srcOf(same)).toBe('a.png');
    const cross = await planImageCandidate(host, { kind: 'file', path: 'D:\\x\\a.png' });
    expect(srcOf(cross)).toBe('D:/x/a.png'); // 跨盘无法相对 → 绝对
  });

  test('UNC 路径绝对化（无法相对）', async () => {
    const host = makeHost('\\\\srv\\docs\\note.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '\\\\srv\\share\\a.png' });
    expect(srcOf(plan)).toBe('//srv/share/a.png');
  });

  test('未保存文档 + 本地文件 → 绝对路径直插', async () => {
    const host = makeHost(null);
    const plan = await planImageCandidate(host, { kind: 'file', path: '/abs/a.png' });
    expect(srcOf(plan)).toBe('/abs/a.png');
  });

  test('macOS/Linux 绝对路径', async () => {
    const host = makeHost('/Users/jason/notes/n.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '/Users/jason/pics/a.png' });
    expect(srcOf(plan)).toBe('../pics/a.png');
  });
});

describe('策略：copy-to-assets（spec §3 pasted bitmap → asset dir）', () => {
  test('bitmap → mkdir + write，文档内相对路径', async () => {
    const host = makeHost('/docs/note.md');
    const plan = await planImageCandidate(host, { kind: 'bitmap', name: 'pasted-1.png', data: new Uint8Array([1, 2]).buffer });
    expect(plan.fsOps.map((o) => o.kind)).toEqual(['mkdir', 'write']);
    expect(plan.fsOps[0]).toMatchObject({ kind: 'mkdir', to: '/docs/assets' });
    expect(plan.fsOps[1]).toMatchObject({ kind: 'write', to: '/docs/assets/pasted-1.png' });
    expect(srcOf(plan)).toBe('assets/pasted-1.png');
  });

  test('bitmap 无 name → 自动命名', async () => {
    const host = makeHost('/docs/note.md');
    const plan = await planImageCandidate(host, { kind: 'bitmap', data: new Uint8Array(4).buffer });
    expect(srcOf(plan)).toMatch(/^assets\/pasted-\d+-\d+\.png$/);
  });

  test('copied file（strategy copy-to-assets）→ copy', async () => {
    const host = makeHost('/docs/note.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '/tmp/x.png' }, { strategy: 'copy-to-assets' });
    expect(plan.fsOps.map((o) => o.kind)).toEqual(['mkdir', 'copy']);
    expect(plan.fsOps[1]).toMatchObject({ kind: 'copy', from: '/tmp/x.png', to: '/docs/assets/x.png' });
    expect(srcOf(plan)).toBe('assets/x.png');
  });

  test('custom asset dir（spec §4）', async () => {
    const host = makeHost('/docs/note.md');
    const plan = await planImageCandidate(
      host,
      { kind: 'bitmap', name: 'a.png', data: new Uint8Array(1).buffer },
      { assetDir: 'docname' },
    );
    expect(srcOf(plan)).toBe('note.assets/a.png');
  });
});

describe('URL / 多图 / 执行', () => {
  test('URL 直插，无 fs 操作', async () => {
    const host = makeHost();
    const plan = await planImageCandidate(host, { kind: 'url', url: 'https://a.com/x.png' });
    expect(plan.fsOps).toHaveLength(0);
    expect(srcOf(plan)).toBe('https://a.com/x.png');
  });

  test('多张合并：fsOps mkdir 去重，markdown 按空行分隔', async () => {
    const host = makeHost('/docs/note.md');
    const candidates: ImageCandidate[] = [
      { kind: 'file', path: '/docs/a.png' },
      { kind: 'file', path: '/docs/b.png' },
    ];
    const plan = await planImageCandidates(host, candidates, { strategy: 'copy-to-assets' });
    expect(plan.fsOps.filter((o) => o.kind === 'mkdir')).toHaveLength(1);
    expect(plan.fsOps.filter((o) => o.kind === 'copy')).toHaveLength(2);
    expect(plan.markdown.split('\n\n')).toHaveLength(2);
  });

  test('executeFsOps 顺序执行；失败返回错误', async () => {
    const host = makeHost();
    const plan = await planImageCandidate(host, { kind: 'bitmap', name: 'a.png', data: new Uint8Array(1).buffer });
    expect(await executeFsOps(host, plan.fsOps)).toBe(null);
    // 失败注入
    const failing: ImageHost & { ops: string[] } = { ...host, copyFile: async () => ({ ok: false, error: { code: 'io', message: 'disk full' } }) };
    const p2 = await planImageCandidate(failing, { kind: 'file', path: '/tmp/x.png' }, { strategy: 'copy-to-assets' });
    const err = await executeFsOps(failing, p2.fsOps);
    expect(err).toContain('copy');
  });

  test('解析后的 src 可 unescape 还原为真实路径（spec §12 一致性命中）', async () => {
    const host = makeHost('/docs/笔记.md');
    const plan = await planImageCandidate(host, { kind: 'file', path: '/docs/我的 图片.png' });
    expect(unescapeImageSrc(srcOf(plan))).toBe('我的 图片.png');
  });
});

describe('拖拽建链：fileLinkMarkdown（Typora 拖入编辑区 → 文件链接）', () => {
  test('同目录文件 → 相对路径链接', () => {
    const host = makeHost('/docs/note.md');
    expect(fileLinkMarkdown(host, '/docs/report.pdf')).toBe('[report.pdf](report.pdf)');
  });

  test('子目录 / 上级目录 → 相对路径', () => {
    const host = makeHost('/docs/chapters/c1.md');
    expect(fileLinkMarkdown(host, '/docs/chapters/sub/a.md')).toBe('[a.md](sub/a.md)');
    expect(fileLinkMarkdown(host, '/docs/assets/a.md')).toBe('[a.md](../assets/a.md)');
  });

  test('未保存文档 → 绝对路径', () => {
    const host = makeHost(null);
    expect(fileLinkMarkdown(host, '/abs/notes.md')).toBe('[notes.md](/abs/notes.md)');
  });

  test('跨盘 / UNC → 绝对路径（无法相对化）', () => {
    const host = makeHost('C:\\docs\\note.md');
    expect(fileLinkMarkdown(host, 'D:\\x\\a.pdf')).toBe('[a.pdf](D:/x/a.pdf)');
    const unc = makeHost('\\\\srv\\docs\\note.md');
    expect(fileLinkMarkdown(unc, '\\\\srv\\share\\a.pdf')).toBe('[a.pdf](//srv/share/a.pdf)');
  });

  test('中文/空格文件名 → %XX 转义（与 image src 同规则；中文保留）', () => {
    const host = makeHost('/docs/笔记.md');
    expect(fileLinkMarkdown(host, '/docs/图 片/照 片.pdf')).toBe('[照 片.pdf](图%20片/照%20片.pdf)');
  });

  test('label 转义 [ ] \\；dest 转义括号', () => {
    const host = makeHost('/docs/note.md');
    expect(fileLinkMarkdown(host, '/docs/草[稿].md')).toBe('[草\\[稿\\].md](草%5B稿%5D.md)');
    expect(fileLinkMarkdown(host, '/docs/a(1).md')).toBe('[a(1).md](a%281%29.md)');
  });

  test('文件夹也可建链（basename label）', () => {
    const host = makeHost('/docs/note.md');
    expect(fileLinkMarkdown(host, '/docs/assets')).toBe('[assets](assets)');
  });

  test('空路径 → 空串（不插入）', () => {
    const host = makeHost('/docs/note.md');
    expect(fileLinkMarkdown(host, '')).toBe('');
  });
});
