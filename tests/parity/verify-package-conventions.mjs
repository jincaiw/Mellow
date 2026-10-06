/**
 * PRD §117.1 包规范合规护栏（2026-10-06 审计 §4.100）
 *
 * 【宪法原文】`docs/product/Mellow-PRD-V1.2-FINAL.md` §117.1「面向 AI/Codex 的仓库设计规范」：
 *
 *   > 每个 package **必须**包含：`README.md` / `CONTRACT.md` / `src/` / `tests/` / `fixtures/`
 *
 * 【立此条的原因】这条是 **P0 宪法级**要求，此前**只被按需引用、没有任何判据**
 * （同 §4.96/§4.97 的「引用宪法 ≠ 读宪法」）。实测（2026-10-06，14 个包，不含 vendored editor-core）：
 *
 *   | 项 | 合规 |
 *   |---|---|
 *   | `src/` | **14 / 14** |
 *   | `test(s)/` | 11 / 14 |
 *   | `README.md` | **1 / 14** |
 *   | `CONTRACT.md` | **0 / 14** |
 *   | `fixtures/` | **0 / 14** |
 *
 * ⇒ **宪法级规范基本未执行**。本护栏的作用是：**让缺口机器可见、且不允许增长**
 * （新包必须完全合规；已存在的缺口必须逐条登记，不得静默扩大）。
 *
 * ⚠️ **与宪法字面的一处偏离（必须显式声明，不得静默放宽）**：
 * §117.1 要求每个包**必须包含 `fixtures/`**，但 **git 无法跟踪空目录** ——
 * 字面满足只能靠提交空的 `.gitkeep`，那是**仪式**而不是内容。
 * ⇒ 本节**按意图判**（见 `PRD_117_1_DEVIATIONS`）：**夹具数据若存在，必须放在 `fixtures/` 下**
 * （即：`fixtures/` 存在则必须非空），**不强制要求空目录存在**。
 * 这个偏离**登记在此处**，而不是靠「把判据写松」悄悄绕开。
 *
 * 【判据】
 *   C1 `src/` —— 必须存在（**硬失败，无例外**）。
 *   C2 `README.md` —— 必须存在（**硬失败，无例外**：它是「包是什么」的唯一入口）。
 *   C3 `CONTRACT.md` —— 必须存在，否则登记进 `PKG_CONTRACT_GAPS`（逐包写明缺口原因）。
 *   C4 `test/` 或 `tests/` —— 同上（登记进 `PKG_TEST_GAPS`）。
 *   C5 `fixtures/` —— 按意图判（存在则必须非空；不强制存在）。
 *   双向：登记表里的项**若已存在** ⇒ 失败（防化石）。下限：包数 ≥ 10；登记表非空。
 *
 * 【执行路径（如实给出，不假装已合规）】
 *   ① `README.md` —— 本护栏落地时**已补齐全部 13 个缺口** ⇒ C2 现在是硬判据；
 *   ② `CONTRACT.md` —— 需要逐包写「输入/输出类型、不变量、错误语义、性能边界、禁止行为、
 *      Typora parity reference、golden fixtures」，是**独立的文档工作包**，本护栏先登记缺口；
 *   ③ `test(s)/` —— 3 个缺测试的包（`editor-react` / `shared` / `workspace`）当前**无跨包消费者**
 *      （见审计 §4.95），是否补测取决于它们的去留 ⇒ 登记缺口待裁决；
 *   ④ `fixtures/` —— 按意图判（见上）。
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

// ── 与宪法字面的偏离（显式声明；本判据不按字面要求 `fixtures/` 存在）───────────
const PRD_117_1_DEVIATIONS = [
  '§117.1 的 `fixtures/` 不按字面要求「目录必须存在」—— git 无法跟踪空目录，'
  + '字面满足只能提交空 `.gitkeep`（仪式而非内容）⇒ 按意图判：夹具数据若存在必须放在 `fixtures/` 下',
];

// ── 已存在的缺口（逐包登记 + 原因；新增缺口即失败）──────────────────────────
// ⚠️ 本表记录的是「**宪法要求但尚未执行**」，不是「已评估通过的偏离」。
// ⚠️ `CONTRACT.md` **已不在本表**：2026-10-06 已为全部 14 个包补齐（审计 §4.103）
//    ⇒ 它是**硬判据**（无例外），与 `src/` / `README.md` 同级。
const PKG_TEST_GAPS = new Map([
  ['editor-react', '未执行 + 待裁决：该包 42 行且**零跨包消费者**（审计 §4.95），'
    + '是否补测取决于它是接线还是删除'],
  ['shared', '未执行 + 待裁决：同上（70 行、零消费者）'],
  ['workspace', '未执行 + 待裁决：同上（72 行、零消费者）'],
]);

// 扫描面下限（防漂移 ⇒ 判据空转）
const MIN_PACKAGES = 10;

const PKG_ROOT = resolve(root, 'packages');
const VENDORED = new Set(['editor-core']); // vendored 上游（UPSTREAM.md 只读），不适用本仓包规范

const pkgNames = readdirSync(PKG_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !VENDORED.has(e.name))
  .map((e) => e.name)
  .sort();
if (pkgNames.length < MIN_PACKAGES) {
  fail(`packages 只解析出 ${pkgNames.length} 个目录（下限 ${MIN_PACKAGES}）—— 扫描面漂移会让本护栏空转`);
}

const hasDir = (p, name) => existsSync(join(p, name)) && statSync(join(p, name)).isDirectory();
const hasFile = (p, name) => existsSync(join(p, name)) && statSync(join(p, name)).isFile();

/** 判定某包的缺口集合（纯函数，canary 复用同一份） */
function gapsOf(pkg, ctx) {
  const p = join(PKG_ROOT, pkg);
  const out = [];
  if (!ctx.hasDir(p, 'src')) out.push('src');
  if (!ctx.hasFile(p, 'README.md')) out.push('README.md');
  if (!ctx.hasFile(p, 'CONTRACT.md')) out.push('CONTRACT.md');
  if (!ctx.hasDir(p, 'test') && !ctx.hasDir(p, 'tests')) out.push('test');
  return out;
}

const ctx = { hasDir, hasFile };
for (const pkg of pkgNames) {
  const p = join(PKG_ROOT, pkg);
  // C1 / C2 —— 硬失败，无例外
  if (!hasDir(p, 'src')) fail(`${pkg}: 缺 \`src/\`（PRD §117.1 硬要求）`);
  if (!hasFile(p, 'README.md')) {
    fail(`${pkg}: 缺 \`README.md\`（PRD §117.1 硬要求）—— 它是「这个包是什么」的唯一入口；`
      + '本护栏落地时已补齐全部缺口，新增包必须自带');
  }
  // C3 / C4 —— C3（CONTRACT.md）为硬判据；C4（测试目录）可登记
  const hasContract = hasFile(p, 'CONTRACT.md');
  const hasTests = hasDir(p, 'test') || hasDir(p, 'tests');
  if (!hasContract) {
    fail(`${pkg}: 缺 \`CONTRACT.md\`（PRD §117.1 硬要求）—— 本护栏落地时已补齐全部 14 个包，新增包必须自带；`
      + '内容清单见 §117.1：输入/输出类型、不变量、错误语义、性能边界、禁止行为、Typora parity reference、golden fixtures');
  }
  if (!hasTests && !PKG_TEST_GAPS.has(pkg)) {
    fail(`${pkg}: 既无 \`test/\` 也无 \`tests/\`（PRD §117.1）且未登记 —— 请补齐，或登记进 PKG_TEST_GAPS`);
  }
  if (hasTests && PKG_TEST_GAPS.has(pkg)) {
    fail(`${pkg}: PKG_TEST_GAPS 登记了它，但测试目录**已存在** —— 请删除该登记项`);
  }
  // C5 —— 按意图判：`fixtures/` 存在则必须非空（防「建个空目录交差」）
  if (hasDir(p, 'fixtures')) {
    const inner = readdirSync(join(p, 'fixtures'));
    if (inner.length === 0) {
      fail(`${pkg}: \`fixtures/\` 是空目录 —— §117.1 要的是夹具数据，不是空目录（git 也跟踪不了空目录）`);
    }
  }
}

// 登记表自身：非空 + 无「登记了不存在的包」
for (const [tbl, name] of [[PKG_TEST_GAPS, 'PKG_TEST_GAPS']]) {
  if (tbl.size === 0) fail(`${name} 不得为空（清空即等于放弃该判据）`);
  for (const [pkg, reason] of tbl) {
    if (!pkgNames.includes(pkg)) fail(`${name} 登记了不存在的包：${pkg} —— 请删除该登记项`);
    if (typeof reason !== 'string' || reason.trim() === '') fail(`${name} 的 ${pkg} 缺原因`);
  }
}
if (PRD_117_1_DEVIATIONS.length === 0) {
  fail('PRD_117_1_DEVIATIONS 不得为空 —— 与宪法字面的偏离必须显式声明，不得静默放宽');
}

// ── canary：三向 + 合成夹具（不绑现实数据：合法变更不应弄红 canary）──────────
{
  const OK_FILES = (p, n) => n === 'README.md' || n === 'CONTRACT.md';
  const g = gapsOf('x', { hasDir: (p, n) => new Set(['src', 'test']).has(n), hasFile: OK_FILES });
  if (g.length !== 0) errors.push(`canary 失效：全合规的合成包被判有缺口（得到 ${JSON.stringify(g)}）`);
  const g2 = gapsOf('x', { hasDir: () => false, hasFile: () => false });
  if (g2.join(',') !== 'src,README.md,CONTRACT.md,test') {
    errors.push(`canary 失效：全缺失的合成包缺口集合不对（得到 ${JSON.stringify(g2)}）`);
  }
  // 负样本-放宽：只缺 test 时必须能判出来（否则「只查了 src」也会全绿）
  const g4 = gapsOf('x', { hasDir: (p, n) => n === 'src', hasFile: OK_FILES });
  if (g4.join(',') !== 'test') errors.push(`canary 失效：只缺 test 时未判出（得到 ${JSON.stringify(g4)}）`);
  // 负样本-放宽：只缺 CONTRACT.md 时必须能判出来
  const g5 = gapsOf('x', {
    hasDir: (p, n) => n === 'src' || n === 'test',
    hasFile: (p, n) => n === 'README.md',
  });
  if (g5.join(',') !== 'CONTRACT.md') errors.push(`canary 失效：只缺 CONTRACT.md 时未判出（得到 ${JSON.stringify(g5)}）`);
}

if (errors.length > 0) {
  throw new Error(`Package convention violations (PRD §117.1):\n  ${errors.join('\n  ')}`);
}

console.log(`Package conventions (§117.1): ${pkgNames.length} 个包；`
  + '`src/` / `README.md` / `CONTRACT.md` 全合规（**硬判据**）；'
  + `\`test(s)/\` 已登记缺口 ${PKG_TEST_GAPS.size} 个（**「宪法要求但尚未执行」**，非「已评估通过的偏离」）；`
  + `\`fixtures/\` 按意图判（偏离已显式声明 ${PRD_117_1_DEVIATIONS.length} 条）；canary 5 项全绿。`);
