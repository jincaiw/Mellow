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
// canary 计数**派生**（模块级 —— 收口行在块外，需可见）：见 §4.180
let canaryCount = 0;
const canary = (ok, msg) => { canaryCount += 1; if (!ok) errors.push(msg); };

// ── 与 UPSTREAM.md「生成 / 校验清单」一节的 diff 命令保持一致的排除面 ──────────
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.yarn']);
const EXCLUDE_FILE = (n) => n.endsWith('.tsbuildinfo') || n === 'yarn.lock';

/**
 * 递归列出相对路径（与 diff 命令同排除面）。**路径一律用 `/` 拼接**（不用 `join` 的产物），
 * 否则 Windows 上会得到 `src\config.ts`，与清单里的 `src/config.ts` 对不上。
 */
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

/**
 * ⚠️ **跨平台：哈希前必须把 CRLF 归一化为 LF**（字节级）。
 * 实测（2026-10-01 CI，Windows job 打红）：仓库**没有 `.gitattributes`**，
 * Windows runner 的 `core.autocrlf=true` 会把文本文件检出为 CRLF →
 * **全部 199 个文件**的内容哈希都与上游 tarball（LF）不符 → 护栏把每个文件都报成「已改动」。
 * 归一化对二进制文件无影响（两侧施加同一变换，相等性保持）。
 * 该归一化是哈希语义的一部分，与清单的 `algorithm` 字段（`sha256-16-lf`）绑定。
 */
function normalizeEol(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) continue; // 丢掉 CR，保留 LF
    out[n] = buf[i];
    n += 1;
  }
  return out.subarray(0, n);
}

const hashOf = (p) => createHash('sha256').update(normalizeEol(readFileSync(p))).digest('hex').slice(0, 16);

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
  if (manifest.algorithm !== 'sha256-16-lf') {
    fail(`${MANIFEST} 的 algorithm=${manifest.algorithm} 不是预期值 sha256-16-lf`
      + '（该值声明「哈希前已把换行符归一化为 LF」—— 改了归一化必须重新生成清单，否则 Windows 上会全量误报）');
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
  // ⚠️ 计数必须**派生**（§4.172/§4.173 的 idiom）：2026-10-09（审计 §4.180）实测该收口行
  //   原写「含 **5 项**逻辑 canary」而当时已有 **7** 条 —— 而判据 ⑦/⑧ 的谓词分别是
  //   `canary N 项`（canary 在**前**）与 `N-word`（英文连字符）⇒ **两个都没覆盖「N 项…canary」**。
  //   `canary` / `canaryCount` 定义在**模块级**（收口行在块外，需可见）。
  const base = { 'src/untouched.ts': 'aaaaaaaaaaaaaaaa', 'src/edited.ts': 'bbbbbbbbbbbbbbbb' };
  const repo = new Map([['src/untouched.ts', 'aaaaaaaaaaaaaaaa'], ['src/edited.ts', 'cccccccccccccccc'], ['test/new.test.ts', 'dddddddddddddddd']]);
  const synthetic = derive(base, repo);
  canary(synthetic.modified.length === 1 && synthetic.modified[0] === 'src/edited.ts',
    `上游清单护栏 canary 失效：哈希不一致的文件未被判为「已改动」（得到 ${JSON.stringify(synthetic.modified)}）`);
  canary(synthetic.added.length === 1 && synthetic.added[0] === 'test/new.test.ts',
    `上游清单护栏 canary 失效：清单里没有的文件未被判为「新增」（得到 ${JSON.stringify(synthetic.added)}）`);
  canary(diffDoc({ modified: ['src/edited.ts'], added: ['test/new.test.ts'] }, synthetic).length === 0,
    '上游清单护栏 canary 失效：一致的文档被误报为不一致');
  const drift = diffDoc({ modified: ['src/untouched.ts'], added: [] }, synthetic);
  canary(drift.length > 0, '上游清单护栏 canary 失效：文档与事实不一致时未报错（护栏已失效）');
  // 漏登记：事实是「已改动」但文档没写
  canary(diffDoc({ modified: [], added: ['test/new.test.ts'] }, synthetic).length > 0,
    '上游清单护栏 canary 失效：漏登记「已改动」文件时未报错');
  // 幽灵条目：文档写了但事实不是
  canary(diffDoc({ modified: ['src/edited.ts', 'src/ghost.ts'], added: ['test/new.test.ts'] }, synthetic).length > 0,
    '上游清单护栏 canary 失效：文档里的幽灵条目未被报出');
  // 丢文件：上游有而仓库无
  canary(diffDoc({ modified: ['src/edited.ts'], added: ['test/new.test.ts'] }, derive(base, new Map([['src/edited.ts', 'cccccccccccccccc'], ['test/new.test.ts', 'dddddddddddddddd']]))).length > 0,
    '上游清单护栏 canary 失效：仓库缺失上游文件时未报错');
}

// ── 文档里**复述**的「上游文件数」必须 == manifest 的 `fileCount`（2026-10-09，审计 §4.180）────
// 【为什么】`docs/architecture/README.md` 与 `docs/architecture/editor-core.md` 都写着
//   「以 `upstream-manifest.json` 为真值源 —— **199 个文件**」：它们**声明了真值源**，
//   却**又复述了数字**，而**没有任何判据** ⇒ manifest 一变（re-vendor 到新 commit），
//   两处文档**静默漂**（同族「只锁了一半」**第 9 次**）。
//   ⚠️ **有前科**：`docs/architecture/README.md` 的更正块自己写着「**201 与真值源（199）不符**」
//   —— 这类复述数字**确实漂过**。
// 【判据】凡在 `docs/architecture/*.md` 里**同时**出现 `upstream-manifest.json` 与「N 个文件」的
//   **窗口**（标记行 + 紧邻下一行 —— 这两份文档都是**跨行**写法），其 N 必须 == `fileCount`。
{
  const archManifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
  // ⚠️ 扫描面**按职责**取（凡「复述上游文件数」的**活文档**都要在内）——
  //    2026-10-09（审计 §4.190）：`packages/editor-core/UPSTREAM.md` 也写着「…sha256 前 16 位，
  //    **199 个文件**」，而原扫描面只有 `docs/architecture/*` ⇒ 那处**从未被检查**
  //    （用 `tests/parity/tools/audit-doc-counts.mjs` 普查时发现）。
  const ARCH_DOCS = ['docs/architecture/README.md', 'docs/architecture/editor-core.md',
    'packages/editor-core/UPSTREAM.md'];
  const numOfFiles = (w) => {
    const m = /(\d+)\s*个文件/.exec(w);
    return m === null ? null : Number(m[1]);
  };
  let counted = 0;
  for (const d of ARCH_DOCS) {
    if (!existsSync(resolve(root, d))) { fail(`上游文件数：${d} 不存在 —— 判据锚点漂移`); continue; }
    const lines = readFileSync(resolve(root, d), 'utf8').replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const win = lines[i] + '\n' + (lines[i + 1] ?? '');
      if (!/upstream-manifest\.json/.test(win)) continue;
      const n = numOfFiles(win);
      if (n === null) continue;
      counted += 1;
      if (n !== archManifest.fileCount) {
        fail(`${d}:${i + 1} 复述上游文件数 ${n}，而 \`${MANIFEST}\` 的 fileCount = ${archManifest.fileCount}`
          + ' —— 既然声明了真值源，就不要复述数字（或让它与真值源一致）');
      }
    }
  }
  if (counted < 2) {
    fail(`上游文件数：只找到 ${counted} 处「upstream-manifest.json + N 个文件」（下限 3 = 2026-10-09 实测）—— 判据范围萎缩`);
  }
  // canary ①（正样本）：**跨行**形态必须能取到
  if (numOfFiles('以 `upstream-manifest.json` 为真值源 ——\n  共 **199 个文件**（该文件的 `fileCount`）。') !== 199) {
    fail('上游文件数 canary 失效：跨行形态取不到');
  }
  // canary ②（负样本）：不一致必须能检出（谓词与判定共用）
  if (numOfFiles('upstream-manifest.json 共 42 个文件') === archManifest.fileCount) {
    fail('上游文件数 canary 失效：不一致的数字未被识别（判据已退化成空真）');
  }
}

// ── `packages/editor-core/README.md` 复述的「修改 N / 新增 M」必须 == `UPSTREAM.md` 表行数（2026-10-09，审计 §4.195）──
// 【为什么】该 README 写「`UPSTREAM.md` 记录本仓**修改 19 个上游文件 / 新增 3 个**」，
//   而 `UPSTREAM.md` 的「修改的文件」表**实测 21 行**（本护栏自己的输出）⇒ **已漂 2**。
//   ⚠️ 这是「**可直接数**」类（表行数）⇒ 应**与真值比对**（比「文档内自洽」强，PITFALLS §4.306）。
// 【判据】README 的「修改 N / 新增 M」必须 == `docModified.files.length` / `docAdded.files.length`。
{
  const README = 'packages/editor-core/README.md';
  const src = readFileSync(resolve(root, README), 'utf8').replace(/\r\n/g, '\n');
  const RE = /修改\s*\**(\d+)\**\s*个上游文件\s*\/\s*新增\s*\**(\d+)\**\s*个/;
  const m = RE.exec(src);
  if (m === null) {
    fail(`${README} 找不到「修改 N 个上游文件 / 新增 M 个」—— 判据锚点漂移，别静默跳过`);
  } else {
    if (Number(m[1]) !== docModified.files.length) {
      fail(`${README} 写「修改 ${m[1]} 个上游文件」，而 ${UPSTREAM_MD} 的「修改的文件」表有 `
        + `${docModified.files.length} 行 —— 表行数**可直接数** ⇒ 改表时同步改该 README`);
    }
    if (Number(m[2]) !== docAdded.files.length) {
      fail(`${README} 写「新增 ${m[2]} 个」，而 ${UPSTREAM_MD} 的「新增的文件」表有 `
        + `${docAdded.files.length} 行`);
    }
  }
  // canary：谓词与判定共用
  const probe = (s) => { const r = RE.exec(s); return r === null ? null : `${r[1]}/${r[2]}`; };
  if (probe('修改 **19** 个上游文件 / 新增 3 个') !== '19/3') {
    fail('上游改动数 canary 失效：形态取不到');
  }
  if (probe('无此形态') !== null) {
    fail('上游改动数 canary 过宽：无锚点的样本被误判');
  }
}

if (errors.length > 0) {
  throw new Error(`Upstream manifest contract violations:\n  ${errors.join('\n  ')}`);
}

const docMod = parseTable('修改的文件');
const docAdd = parseTable('新增的文件');
console.log(`Upstream manifest: UPSTREAM.md 的改动清单与钉住 commit ${docCommit?.slice(0, 12)} 的上游树哈希一致`
  + `（修改 ${docMod.files.length} / 新增 ${docAdd.files.length}，离线校验，含 ${canaryCount} 项逻辑 canary）`);
