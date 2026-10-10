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
 *   C3 `CONTRACT.md` —— 必须存在（**硬失败，无例外**；**2026-10-08 起**：该文件已补齐 **15/15**
 *      ⇒ 原先的 `PKG_CONTRACT_GAPS` 登记表**已随之移除**，不再存在）。
 *   C4 `test/` 或 `tests/` —— 必须存在，否则登记进 `PKG_TEST_GAPS`（逐包写明缺口原因）。
 *   C5 `fixtures/` —— 按意图判（存在则必须非空；不强制存在）。
 *   双向：登记表里的项**若已存在** ⇒ 失败（防化石）。下限：包数 ≥ 10；登记表非空。
 *
 * 【执行路径（如实给出，不假装已合规）】
 *   ① `README.md` —— 本护栏落地时**已补齐全部 13 个缺口** ⇒ C2 现在是硬判据；
 *   ② `CONTRACT.md` —— 同上，**已补齐 15/15** ⇒ C3 现在是硬判据（登记表已移除）；
 *   ③ `test(s)/` —— 3 个缺测试的包（`editor-react` / `shared` / `workspace`）。
 *      ⚠️ **2026-10-08 更正（审计 §4.160）**：本行**原写**「是否补测取决于它们的去留 ⇒ 登记缺口待裁决」——
 *      而**去留已在审计 §4.95 裁决**（登记表第 14 行 = **ADR-0032 Q3 的 C3：保留 + 触发条件**）
 *      ⇒ **「待裁决」的前提已过期**。补测的**触发条件** = **该包被真正接线时**（零消费者状态解除）；
 *      该缺口**由登记表第 14 行覆盖**，**不是**一条独立的待裁决项。
 *      ⚠️ 这 3 个里 **`editor-react` 是「有意预留（阶段 2）」**，与 `shared`/`workspace` 的「零消费者」**性质不同**。
 *   ④ `fixtures/` —— 按意图判（见上）。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

/**
 * canary 计数 —— **从代码派生，不手写**（2026-10-08，审计 §4.161）。
 *
 * ⚠️ 立此条的原因（实测）：收口行原**手写**「canary 5 项全绿」，而实际只有 **4** 条断言
 * （新增 C6 的 4 条后应为 **8**）⇒ **手写的计数必然漂移**，且**没有任何判据守它**。
 * ⇒ 改为：每条 canary 断言都经本函数上报，收口行打印 `canaryCount`。
 */
let canaryCount = 0;
const canary = (ok, message) => { canaryCount += 1; if (!ok) errors.push(message); };

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

// ── C6 README 的「导出 N 个符号」必须 == 该包 `src/index.ts` 的**具名导出数** ──────────────
// （2026-10-08，审计 §4.161）
// 立此条的原因（实测）：`app-core/README.md` 写「导出 **124** 个符号」，而实测是 **130**
// （36 条 `export {}` 语句、130 个**唯一**名字）—— 其余 **12** 个带该声明的 README **全部正确**。
// ⚠️ **计数口径**（判定与 canary **共用** `namedExports`）：
//   · **计入**：`export {…}` / `export type {…}` 里的名字 + `export <decl>`（含 `async` / `declare`）的名字；
//   · **不计入**：`export * from '…'`（它是**转发**，名字来自别的文件，本文件里没有显式出现）。
//   ⚠️ 该口径与 13 个 README 的**现状全部吻合**（逐包实测过）。
{
  const EXPORT_COUNT_RE = /导出\s*\*{0,2}(\d+)\*{0,2}\s*个符号/;
  /** 枚举 `src/index.ts` 的**具名**导出（判定与 canary 共用）。 */
  const namedExports = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:type\s+|interface\s+|const\s+|function\s+|class\s+|enum\s+)([A-Za-z0-9_]+)/gm)) {
      out.add(m[1]);
    }
    for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from/gm)) {
      for (const t of m[1].split(',')) {
        const n = t.trim().split(/\s+as\s+/).pop().trim();
        if (n) out.add(n);
      }
    }
    return out;
  };
  let checkedCounts = 0;
  for (const pkg of pkgNames) {
    const readmePath = join(PKG_ROOT, pkg, 'README.md');
    const srcPath = join(PKG_ROOT, pkg, 'src', 'index.ts');
    if (!existsSync(readmePath) || !existsSync(srcPath)) continue;
    const m = EXPORT_COUNT_RE.exec(readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n'));
    if (m === null) continue;
    checkedCounts += 1;
    const actual = namedExports(readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n')).size;
    if (Number(m[1]) !== actual) {
      fail(`${pkg}/README.md 声明「导出 ${m[1]} 个符号」，而 \`src/index.ts\` 实测 **${actual}** 个具名导出`
        + ' —— 该数字会随代码漂移，必须与代码一致（实测：`app-core` 曾写 124 而实际 130）');
    }
  }
  if (checkedCounts < 8) {
    fail(`只有 ${checkedCounts} 个包的 README 带「导出 N 个符号」声明（下限 8 = 立此判据时的基线）`
      + ' —— 谓词或文档漂移会让本判据**空转**');
  }
  // canary：四向（判定与 canary 共用 namedExports）
  canary(namedExports("export { a, b } from './x';\n").size === 2, '导出数护栏 canary 失效：`export {}` 未被识别');
  canary(namedExports('export async function f() {}\nexport declare const g: number;\n').size === 2,
    '导出数护栏 canary 失效：`async` / `declare` 形态未被识别');
  canary(namedExports("export * from './x';\n").size === 0,
    '导出数护栏 canary 过宽：`export *` 被当成了具名导出（口径应为「只数显式名字」）');
  canary(namedExports("export type {\n  A,\n  B,\n} from './x';\n").size === 2,
    '导出数护栏 canary 失效：多行 `export type {}` 未被识别');
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
  canary(g.length === 0, `canary 失效：全合规的合成包被判有缺口（得到 ${JSON.stringify(g)}）`);
  const g2 = gapsOf('x', { hasDir: () => false, hasFile: () => false });
  canary(g2.join(',') === 'src,README.md,CONTRACT.md,test',
    `canary 失效：全缺失的合成包缺口集合不对（得到 ${JSON.stringify(g2)}）`);
  // 负样本-放宽：只缺 test 时必须能判出来（否则「只查了 src」也会全绿）
  const g4 = gapsOf('x', { hasDir: (p, n) => n === 'src', hasFile: OK_FILES });
  canary(g4.join(',') === 'test', `canary 失效：只缺 test 时未判出（得到 ${JSON.stringify(g4)}）`);
  // 负样本-放宽：只缺 CONTRACT.md 时必须能判出来
  const g5 = gapsOf('x', {
    hasDir: (p, n) => n === 'src' || n === 'test',
    hasFile: (p, n) => n === 'README.md',
  });
  canary(g5.join(',') === 'CONTRACT.md', `canary 失效：只缺 CONTRACT.md 时未判出（得到 ${JSON.stringify(g5)}）`);
}

// ── 包文档里复述的「N 个测试文件」必须 == 该包 `test/` 里的 `.test.ts` 数（2026-10-09，审计 §4.192/§4.193）──
// 【为什么】`packages/app-core/{README.md, CONTRACT.md}` 都写「`test/` 下 **24** 个测试文件」——
//   实测目录里已是 **25** 个 ⇒ **两处都已漂**，且**无判据**
//   （用 `tests/parity/tools/audit-doc-counts.mjs --min 2` 普查时发现）。
//   ⚠️ 本判据与 §4.153 的「包用例数」**不同**：**用例数需实跑**（只能文档内自洽），
//   而**测试文件数可直接数目录** ⇒ **可以与实际比对**（更强）。
// 【2026-10-09 扩展（审计 §4.193）】**从「app-core 两处」泛化到「所有包」** ——
//   首版只写死 `app-core` 的 2 个路径 ⇒ 全仓扫描发现 `editor-engine/CONTRACT.md` 也漂了
//   （**78** vs 实测 **79**）而**判据看不到**（**「修一处 ≠ 修一类」的第 6 次**）。
// 【判据】**每个包**的 `README.md` / `CONTRACT.md` 里「N 个测试文件」必须 == 该包 `test/` 下的 `*.test.ts` 数。
{
  const PKG_DIR = resolve(root, 'packages');
  let seen = 0; let checkedPkgs = 0;
  for (const p of readdirSync(PKG_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const testDir = resolve(PKG_DIR, p.name, 'test');
    const actual = existsSync(testDir)
      ? readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).length
      : 0;
    let pkgSeen = 0;
    for (const doc of ['README.md', 'CONTRACT.md']) {
      const f = resolve(PKG_DIR, p.name, doc);
      if (!existsSync(f)) continue;
      // ⚠️ 文档里写的是 `**25** 个测试文件`（**加粗**）⇒ 谓词必须容忍 `**`
      //    （2026-10-09 实测：首版漏了 `\**` ⇒ 一处都匹配不到，防空转下限当场报「0 处」）
      for (const m of readFileSync(f, 'utf8').replace(/\r\n/g, '\n').matchAll(/\**(\d+)\**\s*个测试文件/g)) {
        seen += 1; pkgSeen += 1;
        if (actual === 0) {
          throw new Error(`packages/${p.name}/${doc} 复述了「${m[1]} 个测试文件」，`
            + `而该包**没有** \`test/\` 目录 —— 判据锚点漂移`);
        }
        if (Number(m[1]) !== actual) {
          throw new Error(`packages/${p.name}/${doc} 写「${m[1]} 个测试文件」，`
            + `而 \`packages/${p.name}/test/\` 下有 ${actual} 个`
            + ' —— **测试文件数可直接数目录** ⇒ 加/删测试时同步改文档');
        }
      }
    }
    if (pkgSeen > 0) checkedPkgs += 1;
  }
  // 防空转：实测 4 处（app-core×2 + editor-engine×1 + export×1）；留 1 余量（健康度型）
  if (seen < 3) {
    throw new Error(`「N 个测试文件」只找到 ${seen} 处（下限 3 = 2026-10-09 实测 4 处）`
      + ' —— 判据范围萎缩会让本判据空转');
  }
  console.log(`Package docs: ${checkedPkgs} 个包的「测试文件数」（${seen} 处）== 各自 \`test/\` 实际数`);
}

// ── 包文档里「N 个符号」（README）与「N 个导出」（CONTRACT）必须**彼此一致**（2026-10-09，审计 §4.194）──
// 【为什么】`packages/app-core` 的 README 写「导出 **130** 个符号」而 CONTRACT 写「**124** 个导出」
//   ⇒ **同一包的两份文档互相矛盾**（实测 `src/index.ts` 的具名导出 ≈ **131**，两个数**都不对**）。
//   ⚠️ **不与代码比对**：口径复杂（`export * from` 的重导出 / type-only / 粘连行 ⇒ 两次试算差 1~2）
//   ⇒ **只锁「包内两处一致」**（可机械、不需解析 TS）—— 与 §4.153 的「文档内自洽」同族。
//   ⚠️ 处置见 §4.194：`app-core` 两处**改为不复述数字**（指向 `src/index.ts`），
//   因为**口径不确定的数字，与其写错不如不写**。
// 【判据】若某包的 README 与 CONTRACT **都**写了该数字，则两者必须相等。
{
  const PKG_DIR = resolve(root, 'packages');
  let compared = 0;
  for (const p of readdirSync(PKG_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const grab = (doc, re) => {
      const f = resolve(PKG_DIR, p.name, doc);
      if (!existsSync(f)) return null;
      const m = re.exec(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
      return m === null ? null : Number(m[1]);
    };
    const sym = grab('README.md', /\**(\d+)\**\s*个符号/);
    const exp = grab('CONTRACT.md', /\**(\d+)\**\s*个导出/);
    if (sym === null || exp === null) continue;
    compared += 1;
    if (sym !== exp) {
      throw new Error(`packages/${p.name}：README 写「${sym} 个符号」而 CONTRACT 写「${exp} 个导出」`
        + ' —— **同一包的两份文档必须一致**（口径复杂，故只锁「两处一致」，不与代码比对）');
    }
  }
  // 防空转：2026-10-09 实测 **12** 个包两处都写（app-core 已按 §4.194 改为不复述）
  if (compared < 8) {
    throw new Error(`只有 ${compared} 个包的两处导出数可比（下限 8 = 2026-10-09 实测 12）—— 判据范围萎缩`);
  }
  console.log(`Package docs: ${compared} 个包的「符号数（README）⇄ 导出数（CONTRACT）」两处一致`);
}

// ── C6 **裸模块名必须在 package.json 里声明**（2026-10-10，审计 §4.263）────────────────────────
// 【为什么】「import 了一个包但没声明依赖」= **幽灵依赖**：本地靠 **hoisting** 能跑，
//   严格布局（pnpm 不 hoist / 干净安装）会炸 —— **而没有任何信号**。
//   实测（本轮新透镜「依赖声明完整性」）：自有 **16 个包**（15 个 `packages/*` + `apps/desktop`）
//   / **311** 个源文件 / **305** 处裸引用（**去重口径** = 每文件唯一模块名；按「每处匹配」数是 322
//   —— 两个都对，差别在口径）⇒ **0 处未声明** ✅（本判据落地即绿、可长期拦回归）。
// 【范围如实声明】**排除 vendored `CoreEditor/` 子树**（与本文件 C1–C5 的「不含 vendored editor-core」同先例）：
//   它是**上游代码**，依赖清单是上游的事；实测它确有 **3 处**未声明的直接依赖
//   （`@codemirror/lang-html` / `style-mod` / `@jest/globals` —— 全是**传递依赖**，靠 hoisting 可用）
//   ⇒ 修它要动 vendored 树 + 重生成 sha256 清单（`tools/gen-upstream-manifest.mjs`）+ 更新两张表
//   ⇒ **成本高于收益**（仅潜在）⇒ **已记入审计 §4.263，不在本判据内**。
// 【判据】上述包源码里四种形态的**字面**模块名 —— `import/export … from 'x'` / 副作用 `import 'x'` /
//   动态 `import('x')` / `require('x')` —— 必须出现在该包 `package.json` 的
//   `dependencies` ∪ `peerDependencies` ∪ `devDependencies`（或 = 包自身名）。
//   ⚠️ **必须先剥注释**：JSDoc 里的 `import('jest').Config` 会被动态 import 谓词误命中（本轮实测踩到）。
//   ⚠️ **模板字面量**（`require(\`${pkg}\`)`）**不是**字面模块名 ⇒ 跳过。
//   ⚠️ 扫描面用 **`committedFiles` 口径**（`git ls-files --cached --others --exclude-standard`）——
//     裸 `git ls-files` 只读索引 ⇒ 未 `git add` 的新文件本地看不见（§4.233）。本护栏自成一体、
//     不跨护栏 import（同 `verify-release-gate.mjs` 自带 `git ls-files` 的先例）。
{
  const SKIP_SUBTREE = '/CoreEditor/'; // vendored 上游子树（见上）
  const NODE_BUILTIN = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
    'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
    'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
    'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url',
    'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  ]);
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  /** 判定与 canary **共用**：抽出该源码里的全部**字面**模块名（先剥注释）。 */
  const bareSpecsOf = (src) => {
    const s = stripComments(src);
    const out = new Set();
    for (const m of s.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+['"]([^'"]+)['"]/g)) out.add(m[1]);
    for (const m of s.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) out.add(m[1]);
    for (const m of s.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) out.add(m[1]);
    for (const m of s.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) out.add(m[1]);
    return [...out].filter((x) => !x.includes('${') && !x.startsWith('.') && !x.startsWith('/') && !x.startsWith('node:'));
  };
  /** 基础包名：`@scope/pkg/sub` → `@scope/pkg`；`plain/sub` → `plain`。判定与 canary **共用**。 */
  const baseOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  let committed = [];
  try {
    committed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 1 << 28 })
      .toString().split('\0').filter(Boolean);
  } catch {
    fail('C6 无法枚举仓库文件集：`git ls-files` 执行失败 —— 本判据要求在有 git 的检出里运行');
  }
  const pkgDirs = ['apps/desktop', ...readdirSync(resolve(root, 'packages')).map((d) => `packages/${d}`)]
    .filter((d) => existsSync(resolve(root, d, 'package.json')));
  let refs = 0;
  let filesScanned = 0;
  const undeclared = [];
  for (const dir of pkgDirs) {
    const pj = JSON.parse(readFileSync(resolve(root, dir, 'package.json'), 'utf8'));
    const declared = new Set([
      ...Object.keys(pj.dependencies ?? {}), ...Object.keys(pj.peerDependencies ?? {}),
      ...Object.keys(pj.devDependencies ?? {}), pj.name,
    ]);
    const srcFiles = committed.filter((f) => f.startsWith(`${dir}/`) && /\.(ts|tsx|mts|cts|mjs|cjs|js)$/.test(f)
      && !f.includes('/node_modules/') && !f.includes(SKIP_SUBTREE));
    filesScanned += srcFiles.length;
    for (const f of srcFiles) {
      for (const spec of bareSpecsOf(readFileSync(resolve(root, f), 'utf8'))) {
        const base = baseOf(spec);
        if (NODE_BUILTIN.has(base)) continue;
        refs += 1;
        if (!declared.has(base)) {
          undeclared.push(`${f} 引用了 \`${base}\`，但 \`${dir}/package.json\` **未声明**它`);
        }
      }
    }
  }
  for (const u of undeclared) {
    fail(`${u} —— **幽灵依赖**：本地靠 hoisting 能跑，严格布局（pnpm 不 hoist / 干净安装）会炸`
      + '**且没有任何信号**。请把它加进该包的 `dependencies`（或 `peerDependencies` / `devDependencies`）');
  }
  // 防空转（立此判据时基线：16 个包 / 311 个源文件 / 305 处裸引用（去重口径））
  if (pkgDirs.length < 12) {
    fail(`C6 只扫描到 ${pkgDirs.length} 个包（下限 12 = 立此判据时的基线 16 − 余量）—— 扫描面萎缩会让本判据空转`);
  }
  if (filesScanned < 250) {
    fail(`C6 只扫描到 ${filesScanned} 个源文件（下限 250 = 立此判据时的基线 311 − 余量）`);
  }
  if (refs < 250) {
    fail(`C6 只解析出 ${refs} 处裸模块引用（下限 250 = 立此判据时的基线 305 − 余量）—— 谓词漂移`);
  }
  // canary：四向（与判定**共用** bareSpecsOf / baseOf）
  canary(bareSpecsOf("import { a } from 'react';\n").join(',') === 'react', 'C6 canary 失效：`import … from` 形态未被解析');
  canary(bareSpecsOf("import 'polyfill-x';\n").join(',') === 'polyfill-x', 'C6 canary 失效：副作用 `import` 未被解析');
  canary(bareSpecsOf("const m = await import('heavy-lib');\n").join(',') === 'heavy-lib', 'C6 canary 失效：动态 `import()` 未被解析');
  canary(bareSpecsOf("const r = require('old-lib');\n").join(',') === 'old-lib', 'C6 canary 失效：`require()` 未被解析');
  canary(bareSpecsOf("import { x } from './local';\n").length === 0, 'C6 canary 过宽：相对路径被当成裸模块名');
  canary(bareSpecsOf('const m = require(`${pkg}`);\n').length === 0, 'C6 canary 过宽：**模板字面量**被当成字面模块名');
  canary(bareSpecsOf("/** @type {import('jest').Config} */\nconst x = 1;\n").length === 0,
    'C6 canary 过宽：**注释里**的 `import(\'jest\')` 被命中（必须先剥注释）');
  canary(baseOf('@scope/pkg/sub') === '@scope/pkg' && baseOf('plain/sub') === 'plain',
    'C6 canary 失效：scope / 子路径的基础名解析不对');
  console.log(`Package conventions: 依赖声明完整性 —— ${pkgDirs.length} 个包 / ${filesScanned} 个源文件 / `
    + `${refs} 处裸引用，未声明 ${undeclared.length} 处（**不含 vendored \`CoreEditor\`**）`);
}

// ── C7 三个**严格检查**必须在**所有** tsconfig 里开启（2026-10-10，审计 §4.267）────────────────
// 【为什么】实测：`noUnusedLocals` / `noUnusedParameters` 只在 **3/15** 份 tsconfig 里、
//   `noFallthroughCasesInSwitch` 只在 **1/15** 份里 ⇒ **12 个包的「未使用的局部变量 / 参数」**、
//   **14 个包的「switch 落空」**都**不会被 typecheck 抓到**（与本仓「死代码要删」**同族**：
//   **缺的是检查，不是代码**）。而 15 份 tsconfig 是**独立副本**（**没有** `extends`）⇒ 必然漂移。
// 【处置】**对齐到最严**（实测代价 **0 个新错误**：逐包 `tsc --noEmit` 全绿）+ 本判据锁住「不得漂回去」。
// 【判据】`packages/*/tsconfig.json` + `apps/desktop/tsconfig.json` 的这三个选项**必须为 `true`**。
//   ⚠️ **只锁这 3 个**（**质量检查**）；其余选项（`jsx` / `outDir` / `lib` / `esModuleInterop` /
//     `isolatedModules` / `resolveJsonModule` …）是**按包性质有意不同**或**在 `target: ES2022` 下是
//     no-op** ⇒ **不锁**（逐条分诊见审计 §4.267）。
{
  const STRICT_KEYS = ['noUnusedLocals', 'noUnusedParameters', 'noFallthroughCasesInSwitch'];
  const tsconfigs = [
    ...readdirSync(resolve(root, 'packages')).map((d) => `packages/${d}/tsconfig.json`),
    'apps/desktop/tsconfig.json',
  ].filter((p) => existsSync(resolve(root, p)));
  // 防空转：立此判据时基线 15 份（14 个包 + app），下限 12
  if (tsconfigs.length < 12) {
    fail(`C7 只找到 ${tsconfigs.length} 份 tsconfig（下限 12 = 立此判据时的基线 15 − 余量）—— 扫描面萎缩`);
  }
  /** 判定与 canary **共用**：三项是否齐全为 `true`。 */
  const strictOk = (co) => STRICT_KEYS.every((k) => co[k] === true);
  for (const p of tsconfigs) {
    let co = null;
    try { co = JSON.parse(readFileSync(resolve(root, p), 'utf8')).compilerOptions ?? {}; } catch { /* 下面报错 */ }
    if (co === null) { fail(`C7 无法解析 \`${p}\`（JSON 坏了？）`); continue; }
    if (strictOk(co)) continue;
    const bad = STRICT_KEYS.filter((k) => co[k] !== true)
      .map((k) => `${k} = ${JSON.stringify(co[k] ?? null)}`).join(' / ');
    fail(`${p} 未开启严格检查：${bad}（应为 \`true\`）—— 这三个是**质量检查**：不开就等于`
      + '「未使用的局部变量 / 参数 / switch 落空」**不会被发现**（实测曾有 12 / 14 个包没开）');
  }
  // canary：两向（构造样本；与判定**共用** strictOk）
  if (!strictOk({ noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true })) {
    fail('C7 canary 失效：**三项齐全**的样本未被判为合规');
  }
  if (strictOk({ noUnusedLocals: true })) {
    fail('C7 canary **过宽**：**缺两项**的样本被判为合规');
  }
  console.log(`Package conventions: 严格检查 —— ${tsconfigs.length} 份 tsconfig 均已开启 `
    + `${STRICT_KEYS.join(' / ')}`);
}

if (errors.length > 0) {
  throw new Error(`Package convention violations (PRD §117.1):\n  ${errors.join('\n  ')}`);
}

console.log(`Package conventions (§117.1): ${pkgNames.length} 个包；`
  + '`src/` / `README.md` / `CONTRACT.md` 全合规（**硬判据**）；'
  + `\`test(s)/\` 已登记缺口 ${PKG_TEST_GAPS.size} 个（**「宪法要求但尚未执行」**，非「已评估通过的偏离」）；`
  + `\`fixtures/\` 按意图判（偏离已显式声明 ${PRD_117_1_DEVIATIONS.length} 条）；`
  // ⚠️ 2026-10-08（审计 §4.161）：本行原**手写**「canary 5 项全绿」—— 而实际只有 **4** 条断言。
  //    ⇒ 改为**从代码派生**（`canary()` 计数），手写的计数不再存在（本行自己也**不再是一个漂移源**）。
  + `canary ${canaryCount} 项全绿。`);
