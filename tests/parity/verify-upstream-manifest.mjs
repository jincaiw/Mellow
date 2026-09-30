/**
 * 上游清单护栏（2026-10-01）：`packages/editor-core/UPSTREAM.md` 的
 * 「Mellow 的 CoreEditor 改动」清单必须与**事实**一致 —— **离线可校验**。
 *
 * 为什么必须机器可校验：该清单是 re-vendor（`cp -R` 覆盖 `CoreEditor/`）之后
 * **唯一能重放 Mellow 改动**的依据；而 re-vendor 静默丢掉这些改动**不会让任何测试变红**
 * （审计 §4.36 明确记下这一点，§4.45 是同一母题的另一面）。
 *
 * 判据（确定性、不联网）：
 *   `packages/editor-core/upstream-manifest.json` 存了钉住 commit 的上游每个文件的
 *   sha256 前 16 位。于是对仓库内每个文件：
 *     - 清单里有且哈希一致  → **未改动** → **不得**出现在 UPSTREAM.md 的「修改的文件」表里；
 *     - 清单里有且哈希不同  → **已改动** → **必须**出现在「修改的文件」表里；
 *     - 清单里没有          → **新增**   → **必须**出现在「新增的文件」表里。
 *   同时校验：两表的**声明条数**与**实际行数**与**推导结果**三者一致；
 *   上游有而仓库无的文件必须为 0（否则是「丢了上游文件」，同样要报）。
 *
 * 真值源关系：`UPSTREAM.md` 的 `Commit:` 行 ↔ `upstream-manifest.json` 的 `commit`
 * ↔ 清单内容。三者任一漂移即报错（并给出重新生成的命令）。
 *
 * 重新生成清单：`node tools/gen-upstream-manifest.mjs`（联网；或 `--tarball <已下载>`）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const UPSTREAM_MD = 'packages/editor-core/UPSTREAM.md';
const MANIFEST = 'packages/editor-core/upstream-manifest.json';
const CORE_EDITOR = 'packages/editor-core/CoreEditor';

const errors = [];
const fail = (m) => errors.push(m);

// ── 与 UPSTREAM.md「生成 / 校验清单」一节的 diff 命令保持一致的排除面 ──────────
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.yarn']);
const EXCLUDE_FILE = (n) => n.endsWith('.tsbuildinfo') || n === 'yarn.lock';

/** 递归列出相对路径（与 diff 命令同排除面）。 */
function listFiles(dir, rel = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...listFiles(join(dir, entry.name), `${rel}${entry.name}/`));
      continue;
    }
    if (EXCLUDE_FILE(entry.name)) continue;
    out.push(`${rel}${entry.name}`);
  }
  return out;
}

const hashOf = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);

/**
 * 纯函数：按清单与仓库实际哈希推导三个集合（导出给 canary 复用）。
 * @param {Record<string,string>} manifestFiles 上游 相对路径 → 哈希
 * @param {Map<string,string>} repoHashes       仓库 相对路径 → 哈希
 */
export function derive(manifestFiles, repoHashes) {
  const modified = [];
  const added = [];
  for (const [f, h] of repoHashes) {
    if (!(f in manifestFiles)) added.push(f);
    else if (manifestFiles[f] !== h) modified.push(f);
  }
  const deleted = Object.keys(manifestFiles).filter((f) => !repoHashes.has(f));
  return { modified: modified.sort(), added: added.sort(), deleted: deleted.sort() };
}

/**
 * 纯函数：比对「文档声明的清单」与「推导结果」，返回不一致描述（空数组 = 一致）。
 * @param {{modified:string[],added:string[]}} doc
 * @param {{modified:string[],added:string[],deleted:string[]}} actual
 */
export function diffDoc(doc, actual) {
  const problems = [];
  const cmp = (label, a, b) => {
    const onlyDoc = a.filter((x) => !b.includes(x));
    const onlyActual = b.filter((x) => !a.includes(x));
    if (onlyDoc.length > 0) problems.push(`${label}：文档里有但事实不是 —— ${onlyDoc.join(', ')}`);
    if (onlyActual.length > 0) problems.push(`${label}：事实是但文档里没有 —— ${onlyActual.join(', ')}`);
  };
  cmp('修改的文件', doc.modified, actual.modified);
  cmp('新增的文件', doc.added, actual.added);
  if (actual.deleted.length > 0) {
    problems.push(`上游有而仓库无（re-vendor 可能丢了文件，或清单 commit 不对）—— ${actual.deleted.join(', ')}`);
  }
  return problems;
}

// ── 解析 UPSTREAM.md ────────────────────────────────────────────────────────
const md = readFileSync(resolve(root, UPSTREAM_MD), 'utf8').replace(/\r\n/g, '\n');
const docCommit = md.match(/^- Commit:\s*([0-9a-f]{40})\s*$/m)?.[1];
if (docCommit === undefined) fail(`${UPSTREAM_MD} 缺少 \`- Commit: <40 位 hash>\` 行`);

/** 取 `### <标题>（N）` 到下一个 `###`/`---` 之间的表格里的首列路径。 */
function parseTable(title) {
  const head = new RegExp(`^###\\s*${title}[^\\n]*$`, 'm').exec(md);
  if (head === null) return { declared: null, files: [] };
  const start = head.index + head[0].length;
  const rest = md.slice(start);
  const endRel = rest.search(/^(?:###|---)/m);
  const body = endRel === -1 ? rest : rest.slice(0, endRel);
  // 标题形如 `### 修改的文件（19）` 或 `### 新增的文件（3，全在 \`test/\`）` —— 数字紧跟左括号即可
  const declared = /（(\d+)/.exec(head[0])?.[1];
  const files = [];
  for (const line of body.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cell = /^\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (cell !== null) files.push(cell[1]);
  }
  return { declared: declared === undefined ? null : Number(declared), files: files.sort() };
}

const docModified = parseTable('修改的文件');
const docAdded = parseTable('新增的文件');
if (docModified.files.length === 0) fail(`${UPSTREAM_MD} 未解析出「修改的文件」表格（标题或表格形态变了？）`);
if (docAdded.files.length === 0) fail(`${UPSTREAM_MD} 未解析出「新增的文件」表格（标题或表格形态变了？）`);

// ── 读清单 + 算事实 ─────────────────────────────────────────────────────────
if (!existsSync(resolve(root, MANIFEST))) {
  fail(`缺少 ${MANIFEST} —— 用 \`node tools/gen-upstream-manifest.mjs\` 生成`);
} else {
  const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
  if (docCommit !== undefined && manifest.commit !== docCommit) {
    fail(`${MANIFEST} 的 commit=${manifest.commit} 与 ${UPSTREAM_MD} 的 Commit=${docCommit} 不一致 —— `
      + '两者必须描述同一个上游快照（用 `node tools/gen-upstream-manifest.mjs` 重新生成）');
  }
  if (manifest.algorithm !== 'sha256-16') {
    fail(`${MANIFEST} 的 algorithm=${manifest.algorithm} 不是预期值 sha256-16`);
  }
  if (manifest.fileCount !== Object.keys(manifest.files).length) {
    fail(`${MANIFEST} 的 fileCount=${manifest.fileCount} 与 files 实际条数 ${Object.keys(manifest.files).length} 不符`);
  }

  const repoHashes = new Map(listFiles(resolve(root, CORE_EDITOR)).map((f) => [f, hashOf(resolve(root, CORE_EDITOR, f))]));
  const actual = derive(manifest.files, repoHashes);

  for (const p of diffDoc({ modified: docModified.files, added: docAdded.files }, actual)) fail(p);

  // 声明条数 == 实际行数（防「改了表却没改标题里的数字」这类半更新）
  if (docModified.declared !== docModified.files.length) {
    fail(`${UPSTREAM_MD} 的「修改的文件（${docModified.declared}）」与表格实际 ${docModified.files.length} 行不符`);
  }
  if (docAdded.declared !== docAdded.files.length) {
    fail(`${UPSTREAM_MD} 的「新增的文件（${docAdded.declared}）」与表格实际 ${docAdded.files.length} 行不符`);
  }
  if (docModified.declared !== actual.modified.length) {
    fail(`「修改的文件」声明 ${docModified.declared} 个，事实是 ${actual.modified.length} 个`);
  }
  if (docAdded.declared !== actual.added.length) {
    fail(`「新增的文件」声明 ${docAdded.declared} 个，事实是 ${actual.added.length} 个`);
  }

  // ── canary：用**同一套纯函数**跑合成输入，必须报出不一致 ────────────────
  // 直接测逻辑（不是测字符串替换）—— 清单里翻一个哈希 = 事实多一个「已改动」。
  const base = { 'src/untouched.ts': 'aaaaaaaaaaaaaaaa', 'src/edited.ts': 'bbbbbbbbbbbbbbbb' };
  const repo = new Map([['src/untouched.ts', 'aaaaaaaaaaaaaaaa'], ['src/edited.ts', 'cccccccccccccccc'], ['test/new.test.ts', 'dddddddddddddddd']]);
  const synthetic = derive(base, repo);
  if (synthetic.modified.length !== 1 || synthetic.modified[0] !== 'src/edited.ts') {
    fail(`上游清单护栏 canary 失效：哈希不一致的文件未被判为「已改动」（得到 ${JSON.stringify(synthetic.modified)}）`);
  }
  if (synthetic.added.length !== 1 || synthetic.added[0] !== 'test/new.test.ts') {
    fail(`上游清单护栏 canary 失效：清单里没有的文件未被判为「新增」（得到 ${JSON.stringify(synthetic.added)}）`);
  }
  if (diffDoc({ modified: ['src/edited.ts'], added: ['test/new.test.ts'] }, synthetic).length !== 0) {
    fail('上游清单护栏 canary 失效：一致的文档被误报为不一致');
  }
  const drift = diffDoc({ modified: ['src/untouched.ts'], added: [] }, synthetic);
  if (drift.length === 0) {
    fail('上游清单护栏 canary 失效：文档与事实不一致时未报错（护栏已失效）');
  }
  // 漏登记：事实是「已改动」但文档没写
  if (diffDoc({ modified: [], added: ['test/new.test.ts'] }, synthetic).length === 0) {
    fail('上游清单护栏 canary 失效：漏登记「已改动」文件时未报错');
  }
  // 幽灵条目：文档写了但事实不是
  if (diffDoc({ modified: ['src/edited.ts', 'src/ghost.ts'], added: ['test/new.test.ts'] }, synthetic).length === 0) {
    fail('上游清单护栏 canary 失效：文档里的幽灵条目未被报出');
  }
  // 丢文件：上游有而仓库无
  if (diffDoc({ modified: ['src/edited.ts'], added: ['test/new.test.ts'] }, derive(base, new Map([['src/edited.ts', 'cccccccccccccccc'], ['test/new.test.ts', 'dddddddddddddddd']]))).length === 0) {
    fail('上游清单护栏 canary 失效：仓库缺失上游文件时未报错');
  }
}

if (errors.length > 0) {
  throw new Error(`Upstream manifest contract violations:\n  ${errors.join('\n  ')}`);
}

const docMod = parseTable('修改的文件');
const docAdd = parseTable('新增的文件');
console.log(`Upstream manifest: UPSTREAM.md 的改动清单与钉住 commit ${docCommit?.slice(0, 12)} 的上游树哈希一致`
  + `（修改 ${docMod.files.length} / 新增 ${docAdd.files.length}，离线校验，含 5 项逻辑 canary）`);
