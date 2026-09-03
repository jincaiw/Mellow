/**
 * P3.10 Sidebar 12 个计时微任务（V4 计划 3.10）——app-core 侧 T1–T11。
 *
 * 定位：Jest 计时微任务（宽松预算，防 CI 抖动），与 `tests/benchmark/` 的
 * CGEvent + ScreenCaptureKit 真机外部测量分层互补：本文件只验证「纯逻辑
 * 微任务在 10k/1000/1万 量级不阻塞」（V4 计划 3.2/3.10 Exit Gate），不做
 * in-app 插桩、不与 Typora 对照。
 *
 * 每个任务 console.log 实测耗时；预算为实测的 ≥10×，超预算即失败。
 * 数据全部用确定性伪随机生成（seed 固定），跨机器可复现。
 */
import type { FileListItem } from '../src/fileList';
import { FileListModel, filterFileList } from '../src/fileList';
import type { FileTreeNode } from '../src/fileTree';
import { FileTreeModel, filterFileTree } from '../src/fileTree';
import type { OutlineHeading } from '../src/outline';
import { OutlineModel, buildOutline, flattenOutline } from '../src/outline';
import type { SearchResult } from '../../host-api/src';
import { SearchResultsModel, groupSearchResults, matchSearchLine } from '../src/globalSearch';

jest.setTimeout(60000);

/** 可复现伪随机（同 desktop-ui virtual.test.ts 惯例）。 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const now = (): number => globalThis.performance.now();
const elapsed = (started: number): string => `${(now() - started).toFixed(1)}ms`;

const results: Array<{ id: string; name: string; ms: number; budgetMs: number }> = [];
async function timed(id: string, name: string, budgetMs: number, run: () => void | Promise<void>): Promise<void> {
  const started = now();
  await run();
  const ms = now() - started;
  results.push({ id, name, ms, budgetMs });
  // eslint-disable-next-line no-console
  console.log(`[P3.10 bench] ${id} ${name}: ${ms.toFixed(1)}ms（预算 ${budgetMs}ms）`);
  expect(ms).toBeLessThan(budgetMs);
}

/** 10k 节点树：100 个文件夹 × 各 100 个文件（含少量深层子树）。 */
function buildTree(folderCount = 100, filesPerFolder = 100): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  for (let f = 0; f < folderCount; f++) {
    const folderPath = `/ws/folder-${String(f).padStart(4, '0')}`;
    const children: FileTreeNode[] = [];
    const subCount = f % 10 === 0 ? 10 : 0; // 每 10 个文件夹带一层子文件夹
    if (subCount > 0) {
      const subChildren: FileTreeNode[] = Array.from({ length: filesPerFolder }, (_, i) => ({
        path: `${folderPath}/sub-${f}/note-${String(i).padStart(4, '0')}.md`,
        name: `note-${String(i).padStart(4, '0')}.md`,
        kind: 'file' as const,
        depth: 2,
        expanded: false,
      }));
      children.push({
        path: `${folderPath}/sub-${f}`,
        name: `sub-${f}`,
        kind: 'folder',
        depth: 1,
        expanded: true,
        children: subChildren,
      });
    }
    for (let i = children.length; i < filesPerFolder + (f % 10 === 0 ? -10 : 0); i++) {
      children.push({
        path: `${folderPath}/note-${String(i).padStart(4, '0')}.md`,
        name: `note-${String(i).padStart(4, '0')}.md`,
        kind: 'file',
        depth: 1,
        expanded: false,
      });
    }
    nodes.push({ path: folderPath, name: `folder-${String(f).padStart(4, '0')}`, kind: 'folder', depth: 0, expanded: true, children });
  }
  return nodes;
}

function countTreeNodes(nodes: readonly FileTreeNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + (node.children !== undefined ? countTreeNodes(node.children) : 0);
  return n;
}

/** 10k FileListItem。 */
function buildList(count = 10000): FileListItem[] {
  const random = seededRandom(20260911);
  return Array.from({ length: count }, (_, i) => ({
    path: `/ws/doc-${String(i).padStart(5, '0')}.md`,
    filename: `doc-${String(i).padStart(5, '0')}.md`,
    title: `Doc ${i} — ${i % 7 === 0 ? 'Mellow notes' : 'scratch'}`,
    modifiedMs: 1700000000000 + Math.floor(random() * 1e9),
  }));
}

/** 1000 个 heading（H1/H2/H3 交替），经 buildOutline 构树后 flatten。 */
function buildFlatOutline(count = 1000): OutlineHeading[] {
  const lines: string[] = ['# Mellow Guide'];
  for (let i = 0; i < count - 1; i++) {
    const level = (i % 3) + 1;
    lines.push(`${'#'.repeat(level)} Heading ${i} ${i % 11 === 0 ? 'Mellow' : 'topic'}`);
  }
  return flattenOutline(buildOutline(lines.join('\n')));
}

/** 1 万条 SearchResult，分散在 500 个文件（50 文件夹 × 10 文件）。 */
function buildMatches(count = 10000, fileCount = 500): SearchResult[] {
  return Array.from({ length: count }, (_, i) => {
    const fileIdx = i % fileCount;
    return {
      path: `/ws/folder-${String(Math.floor(fileIdx / 10)).padStart(4, '0')}/note-${String(fileIdx % 10).padStart(4, '0')}.md`,
      line: i + 1,
      column: (i % 40) + 1,
      match: 'needle',
      snippet: `line ${i} contains the needle here`,
    };
  });
}

/** 1 万行文本，每 10 行一个 needle。 */
function buildLines(count = 10000): string[] {
  return Array.from({ length: count }, (_, i) =>
    `line ${String(i).padStart(5, '0')} filler text about ${i % 10 === 0 ? 'needle in haystack' : 'ordinary content'}`,
  );
}

describe('P3.10 Sidebar 计时微任务（T1–T11）', () => {
  test('T1 filterFileTree：10k 节点过滤', async () => {
    const tree = buildTree();
    const total = countTreeNodes(tree);
    expect(total).toBeGreaterThanOrEqual(10000);
    await timed('T1', `filterFileTree(${total} 节点, query "note-0099")`, 1000, () => {
      const out = filterFileTree(tree, 'note-0099');
      expect(out.length).toBeGreaterThan(0);
    });
  });

  test('T2 filterFileList：10k 条目过滤', async () => {
    const items = buildList();
    await timed('T2', `filterFileList(${items.length} 条, query "doc-09999")`, 500, () => {
      const out = filterFileList(items, 'doc-09999');
      expect(out.length).toBe(1);
    });
  });

  test('T3 FileTreeModel.flatten：10k 展开树扁平化', async () => {
    const model = new FileTreeModel('/ws');
    const tree = buildTree();
    const total = countTreeNodes(tree);
    await timed('T3', `flatten(${total} 节点)`, 500, () => {
      const flat = model.flatten(tree);
      expect(flat.length).toBe(total);
      expect(flat[flat.length - 1].index).toBe(flat.length - 1);
    });
  });

  test('T4 FileListModel.navigate：10k 条目 down 全遍历', async () => {
    const model = new FileListModel();
    const items = buildList();
    await timed('T4', `navigate down ×${items.length}（10k 全遍历）`, 10000, () => {
      model.selectedPath = null;
      let last: string | null = null;
      for (let i = 0; i < items.length; i++) {
        last = model.navigate(items, 'down').selected;
      }
      expect(last).toBe(items[items.length - 1].path);
    });
  });

  test('T5 FileListModel.navigate：PageUp/PageDown ×1000 整页移动', async () => {
    const model = new FileListModel();
    const items = buildList();
    await timed('T5', `pagedown/pageup ×1000（pageSize 10, 10k 条）`, 2000, () => {
      model.selectedPath = null;
      for (let i = 0; i < 1000; i++) {
        model.navigate(items, i % 2 === 0 ? 'pagedown' : 'pageup');
      }
      const index = items.findIndex((it) => it.path === model.selectedPath);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(items.length);
    });
  });

  test('T6 OutlineModel.navigate：1000 headings ×1000 次键位', async () => {
    const model = new OutlineModel();
    const flat = buildFlatOutline(1000);
    expect(flat.length).toBe(1000);
    const keys = ['up', 'down', 'home', 'end'] as const;
    await timed('T6', `OutlineModel.navigate ×1000（${flat.length} 可见行）`, 2000, () => {
      model.selectedId = null;
      for (let i = 0; i < 1000; i++) {
        model.navigate(flat, keys[i % keys.length]);
      }
      expect(model.selectedId).not.toBeNull();
    });
  });

  test('T7 OutlineModel.collapseAll：1000 headings 全部折叠', async () => {
    const model = new OutlineModel();
    const flat = buildFlatOutline(1000);
    await timed('T7', `collapseAll(${flat.length} 行)`, 200, () => {
      model.collapseAll(flat);
      expect(model.collapsed.size).toBeGreaterThan(0);
    });
  });

  test('T8 SearchResultsModel：结果流式增长 0→10k 再收缩 →0（导航不越界）', async () => {
    const model = new SearchResultsModel();
    const matches = buildMatches();
    await timed('T8', `feed 0→${matches.length}→shrink→1（步进 100，每步 navigate down）`, 1000, () => {
      model.reset();
      for (let k = 100; k <= matches.length; k += 100) {
        model.navigate(matches.slice(0, k), 'down');
      }
      for (let k = matches.length; k >= 1; k -= 100) {
        const { selectedIndex } = model.navigate(matches.slice(0, Math.max(1, k)), 'down');
        expect(selectedIndex).toBeLessThan(Math.max(1, k));
        expect(selectedIndex).toBeGreaterThanOrEqual(-1);
      }
    });
  });

  test('T9 SearchResultsModel.navigate：10k 匹配 ×10k 次键位', async () => {
    const model = new SearchResultsModel();
    const matches = buildMatches();
    await timed('T9', `navigate down ×${matches.length}（${matches.length} 匹配）`, 500, () => {
      model.reset();
      for (let i = 0; i < matches.length; i++) {
        model.navigate(matches, 'down');
      }
      expect(model.selectedIndex).toBe(matches.length - 1);
    });
  });

  test('T10 matchSearchLine：1 万行逐行匹配', async () => {
    const lines = buildLines();
    const options = { query: 'needle', caseSensitive: false, wholeWord: false, regex: false };
    await timed('T10', `matchSearchLine ×${lines.length} 行`, 1000, () => {
      let hits = 0;
      for (const line of lines) {
        if (matchSearchLine(line, options) !== null) hits += 1;
      }
      expect(hits).toBe(1000);
    });
  });

  test('T11 groupSearchResults：1 万匹配分组到 500 文件', async () => {
    const matches = buildMatches();
    await timed('T11', `groupSearchResults(${matches.length} 匹配 → 500 组)`, 1000, () => {
      const groups = groupSearchResults(matches, '/ws');
      expect(groups.length).toBe(500);
      expect(groups.reduce((acc, g) => acc + g.matches.length, 0)).toBe(matches.length);
    });
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('\n[P3.10 bench] app-core 微任务实测汇总：');
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(`  ${r.id.padEnd(4)} ${r.ms.toFixed(1).padStart(8)}ms / 预算 ${String(r.budgetMs).padStart(6)}ms  ${r.name}`);
    }
  });
});
