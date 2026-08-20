/**
 * Image 文件操作计划（spec image-workflow §6/§7：安全规则/唯一命名/跳过）。
 */

import { scanImageRefs } from '../src/image/scan';
import {
  planMoveImage,
  planCopyImage,
  planRenameImage,
  planMoveAll,
  planCopyAll,
  planDownloadRemote,
  planUploadAll,
  allocateUniqueName,
} from '../src/image/ops';
import type { PlanContext } from '../src/image/ops';

const DOC_DIR = '/Users/jason/docs';
const ASSET = '/Users/jason/docs/assets';

function ctx(targetDirAbs = ASSET, existing: string[] = []): PlanContext {
  return { targetDirAbs, docDir: DOC_DIR, existingNames: new Set(existing) };
}

function refsFor(text: string) {
  const refs = scanImageRefs(text, DOC_DIR, ASSET);
  refs.forEach((r) => {
    if (r.kind === 'local' && r.absolutePath !== null) {
      r.exists = true;
    }
  });
  return refs;
}

describe('唯一命名（绝不静默覆盖，PRD §57）', () => {
  test('无冲突原样；冲突加序号；同批去重', () => {
    const existing = new Set(['a.png', 'b.png']);
    expect(allocateUniqueName(existing, 'c.png')).toBe('c.png');
    expect(allocateUniqueName(existing, 'a.png')).toBe('a-1.png');
    expect(allocateUniqueName(existing, 'a.png')).toBe('a-2.png'); // 同批
    expect(allocateUniqueName(existing, 'b.png')).toBe('b-1.png');
    expect(existing.has('a-1.png')).toBe(true);
  });

  test('无扩展名文件', () => {
    const existing = new Set(['logo']);
    expect(allocateUniqueName(existing, 'logo')).toBe('logo-1');
  });
});

describe('单图 Move / Copy（spec §6）', () => {
  test('move：fs op + patch 相对路径', () => {
    const text = '![x](../imgs/a.png)';
    const refs = refsFor(text);
    const plan = planMoveImage(refs[0], ctx());
    expect(plan.report).toMatchObject({ moved: 1, copied: 0 });
    expect(plan.fsOps).toEqual([
      { kind: 'mkdir', to: ASSET },
      { kind: 'move', from: '/Users/jason/imgs/a.png', to: `${ASSET}/a.png` },
    ]);
    expect(plan.patches[0].text).toBe('![x](assets/a.png)');
    expect(plan.patches[0].from).toBe(refs[0].from);
  });

  test('copy：保留原文件', () => {
    const refs = refsFor('![x](../imgs/a.png)');
    const plan = planCopyImage(refs[0], ctx());
    expect(plan.fsOps[1].kind).toBe('copy');
    expect(plan.report.copied).toBe(1);
  });

  test('已在目标目录 → 跳过', () => {
    const refs = refsFor('![x](assets/a.png)');
    const plan = planMoveImage(refs[0], ctx());
    expect(plan.report.skipped[0].reason).toContain('目标目录');
    expect(plan.fsOps).toHaveLength(0);
  });

  test('远程 → 跳过', () => {
    const refs = refsFor('![x](https://a.com/a.png)');
    const plan = planMoveImage(refs[0], ctx());
    expect(plan.report.skipped[0].reason).toContain('远程');
  });

  test('重名目标自动加序号', () => {
    const refs = refsFor('![x](../imgs/a.png)');
    const plan = planMoveImage(refs[0], ctx(ASSET, ['a.png']));
    expect(plan.fsOps[1].to).toBe(`${ASSET}/a-1.png`);
  });
});

describe('单图 Rename（spec §6）', () => {
  test('重命名 + patch（补扩展名）', () => {
    const refs = refsFor('![x](assets/a.png)');
    const plan = planRenameImage(refs[0], 'b', ctx());
    expect(plan.fsOps).toEqual([{ kind: 'move', from: `${ASSET}/a.png`, to: `${ASSET}/b.png` }]);
    expect(plan.patches[0].text).toBe('![x](assets/b.png)');
  });

  test('显式扩展名 / 中文名', () => {
    const refs = refsFor('![x](assets/a.png)');
    const p1 = planRenameImage(refs[0], 'b.jpg', ctx());
    expect(p1.fsOps[0].to).toBe(`${ASSET}/b.jpg`);
    const p2 = planRenameImage(refs[0], '新 名.png', ctx());
    expect(p2.fsOps[0].to).toBe(`${ASSET}/新 名.png`);
  });

  test('同名/空名/远程 → 跳过', () => {
    const refs = refsFor('![x](assets/a.png)');
    expect(planRenameImage(refs[0], 'a', ctx()).fsOps).toHaveLength(0);
    expect(planRenameImage(refs[0], '  ', ctx()).report.skipped[0]).toBeTruthy();
    const remote = refsFor('![x](https://a.com/a.png)')[0];
    expect(planRenameImage(remote, 'b', ctx()).report.skipped[0].reason).toContain('远程');
  });
});

describe('Move All / Copy All（spec §7）', () => {
  const text = [
    '![a](./assets/a.png)', // 已在 asset → 跳过
    '![b](../imgs/b.png)',  // 移入
    '![c](../imgs/c.png)',  // 移入（与 b 不同名）
    '![d](https://a.com/d.png)', // 远程 → 跳过
    '![e](../missing/e.png)',    // exists=false → 跳过
  ].join('\n');

  test('moveAll 仅本地 + 跳过规则', () => {
    const refs = refsFor(text);
    refs[4].exists = false;
    const plan = planMoveAll(refs, ctx());
    expect(plan.report.moved).toBe(2);
    expect(plan.report.skipped).toHaveLength(3);
    expect(plan.report.skipped.map((s) => s.reason)).toEqual([
      '已在 asset 目录',
      '远程图片跳过（Move/Copy All 仅本地）',
      '文件不存在（保留引用）',
    ]);
    expect(plan.fsOps.filter((op) => op.kind === 'move')).toHaveLength(2);
    expect(plan.patches.map((p) => p.text)).toEqual([
      '![b](assets/b.png)',
      '![c](assets/c.png)',
    ]);
  });

  test('copyAll 保留原文件', () => {
    const refs = refsFor(text);
    refs[4].exists = false; // missing 文件跳过
    const plan = planCopyAll(refs, ctx());
    expect(plan.report.copied).toBe(2);
    expect(plan.fsOps.filter((op) => op.kind === 'copy')).toHaveLength(2);
  });

  test('同批同名去重（不同目录同名文件）', () => {
    const t = '![x](../d1/a.png)\n![y](../d2/a.png)';
    const refs = refsFor(t);
    const plan = planMoveAll(refs, ctx());
    expect(plan.report.moved).toBe(2);
    const targets = plan.fsOps.filter((op) => op.kind === 'move').map((op) => op.to);
    expect(targets).toEqual([`${ASSET}/a.png`, `${ASSET}/a-1.png`]);
  });

  test('全部跳过 → 无 mkdir', () => {
    const refs = refsFor('![d](https://a.com/d.png)');
    const plan = planMoveAll(refs, ctx());
    expect(plan.fsOps).toHaveLength(0);
  });
});

describe('Download Remote（spec §7/§9）', () => {
  test('http/https 下载计划 + patch 相对路径', () => {
    const refs = refsFor('![x](https://a.com/img/b.png?raw=1)');
    const plan = planDownloadRemote(refs, ctx());
    expect(plan.report.downloaded).toBe(1);
    expect(plan.fsOps).toEqual([
      { kind: 'mkdir', to: ASSET },
      { kind: 'download', url: 'https://a.com/img/b.png?raw=1', to: `${ASSET}/b.png` },
    ]);
    expect(plan.patches[0].text).toBe('![x](assets/b.png)');
  });

  test('无扩展名 URL 附加 .img', () => {
    const refs = refsFor('![x](https://a.com/pic)');
    const plan = planDownloadRemote(refs, ctx());
    expect(plan.fsOps[1].to).toBe(`${ASSET}/pic.img`);
  });

  test('data/mailto 跳过；本地跳过', () => {
    const refs = refsFor('![d](data:image/png;base64,AAA)\n![l](./a.png)');
    const plan = planDownloadRemote(refs, ctx());
    expect(plan.report.downloaded).toBe(0);
    expect(plan.report.skipped).toHaveLength(2);
    expect(plan.report.skipped[0].reason).toContain('协议不可下载');
    expect(plan.report.skipped[1].reason).toContain('本地');
  });
});

describe('docDir null（未保存文档）→ patch 用绝对路径', () => {
  test('move 单图（绝对路径引用）', () => {
    const text = '![x](/abs/a.png)';
    const refs = scanImageRefs(text, null, null);
    const plan = planMoveImage(refs[0], { targetDirAbs: ASSET, docDir: null, existingNames: new Set() });
    expect(plan.fsOps[1]).toMatchObject({ kind: 'move', from: '/abs/a.png', to: `${ASSET}/a.png` });
    expect(plan.patches[0].text).toBe(`![x](${ASSET}/a.png)`);
  });
});

describe('Upload All（B5 / PRD §55；Typora「上传图片」）', () => {
  test('成功 → URL patch（alt 保留）；无 fsOps；本地文件保留语义', () => {
    const refs = refsFor('![x](../imgs/a.png)');
    const outcomes = new Map([['/Users/jason/imgs/a.png', { url: 'https://cdn.test/a.png' }]]);
    const plan = planUploadAll(refs, outcomes);
    expect(plan.report.uploaded).toBe(1);
    expect(plan.fsOps).toHaveLength(0); // 无文件操作（本地保留）
    expect(plan.patches).toEqual([{ from: refs[0].from, to: refs[0].to, text: '![x](https://cdn.test/a.png)' }]);
  });

  test('失败 → failed + 无 patch；未在批次 → skipped；远程/缺失 → skipped', () => {
    const refs = refsFor('![ok](../imgs/ok.png)\n![bad](../imgs/bad.png)\n![remote](https://a.com/r.png)\n![missing](../imgs/miss.png)');
    refs.find((r) => r.src === '../imgs/miss.png')!.exists = false; // 模拟缺失回填
    const outcomes = new Map<string, { url: string | null; error?: string }>([
      ['/Users/jason/imgs/ok.png', { url: 'https://cdn.test/ok.png' }],
      ['/Users/jason/imgs/bad.png', { url: null, error: '401 unauthorized' }],
      ['/Users/jason/imgs/nope.png', { url: 'https://cdn.test/nope.png' }], // 不在 refs（未消费）
    ]);
    const plan = planUploadAll(refs, outcomes);
    expect(plan.report.uploaded).toBe(1);
    expect(plan.report.failed).toEqual([{ src: '../imgs/bad.png', error: '401 unauthorized' }]);
    expect(plan.report.skipped.map((s) => s.src)).toEqual(['https://a.com/r.png', '../imgs/miss.png']);
    expect(plan.patches).toHaveLength(1);
  });

  test('同一路径多次引用 → 全部替换（outcome 按路径索引）', () => {
    const refs = refsFor('![a](../imgs/a.png)\ntext\n![b](../imgs/a.png)');
    const outcomes = new Map([['/Users/jason/imgs/a.png', { url: 'https://cdn.test/a.png' }]]);
    const plan = planUploadAll(refs, outcomes);
    expect(plan.report.uploaded).toBe(2);
    expect(plan.patches).toHaveLength(2);
  });
});
