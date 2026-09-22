import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ledgerPath = resolve(import.meta.dirname, 'typora-parity-ledger.json');
const benchmarkRunnerPath = resolve(root, 'tests/benchmark/run-benchmark.mjs');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8').replace(/\r\n/g, '\n'));
const allowedGrades = new Set(['E', 'B', 'D']);
const allowedStatuses = new Set([
  'ABSENT', 'IMPL', 'AUTO', 'MAC', 'WIN', 'LINUX', 'PASS-B', 'PASS-E', 'BLOCKED', 'NOT_TESTED'
]);
const platformEvidence = new Set(['macos', 'windows', 'linux']);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(ledger.schemaVersion === 1, 'schemaVersion 必须为 1');
assert(ledger.normativeBaseline?.product === 'Typora', '规范产品必须为 Typora');
assert(ledger.normativeBaseline?.version === '1.14.9', '规范验收基线必须为 Typora 1.14.9');
assert(Array.isArray(ledger.patchObservations), 'patchObservations 必须为数组');
assert(existsSync(benchmarkRunnerPath), '性能 benchmark runner 不存在');
if (existsSync(benchmarkRunnerPath)) {
  const benchmarkRunner = readFileSync(benchmarkRunnerPath, 'utf8').replace(/\r\n/g, '\n');
  assert(/TYPORA_NORMATIVE_VERSION\s*=\s*['"]1\.14\.9['"]/.test(benchmarkRunner),
    '性能 benchmark runner 必须声明 Typora 1.14.9 为规范基线');
  assert(!/PRD 基线 1\.14\.6/.test(benchmarkRunner),
    '性能 benchmark runner 不得将 Typora 1.14.6 标记为 PRD 基线');

  // ── 测量口径护栏（2026-09-22）─────────────────────────────────────────────
  // 立此节的原因：台账原结论「10MB open 2.59× 于 Typora」实为**缺预热**造成的假象 ——
  // 首个 fixture 的首次启动吸收一次性成本，后续测量实际测「缓存命中后的启动」，
  // 于是出现「越大越快」（同批 Typora 1MB 1021.8ms > 10MB 398.5ms，物理不可能）。
  // 另：measureApp 末尾的夹具重建原先用裸 execSync，失败即抛出 → results JSON 不落盘，
  // 整批已测数据丢失（实测「Typora 测完、Mellow 一个未跑」）。
  // 注释里也会出现这些关键字，故先剥注释再断言。
  const stripComments = (s) => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const benchCode = stripComments(benchmarkRunner);
  const WARMUP_RE = /argVal\('--warmup',\s*'[1-9]\d*'\)/;
  assert(WARMUP_RE.test(benchCode),
    '性能 benchmark 必须默认执行 ≥1 轮预热（--warmup 默认值须 ≥1）：否则首个 fixture 吸收一次性启动成本，产生「越大越快」假象');
  assert(/metrics,\s*fixtures,\s*runs,\s*keystrokes,\s*warmup\s*(?:,\s*\w+)*\s*\}/.test(benchCode),
    '性能 benchmark 必须把 warmup 传入 measureApp（否则预热参数不生效）');
  assert(/try\s*\{[\s\S]{0,300}?generate-fixtures\.mjs[\s\S]{0,600}?\}\s*catch/.test(benchCode),
    '夹具重建必须容错（try/catch）：裸 execSync 失败会中止 measureApp，导致 results JSON 不落盘、整批已测数据丢失');
  // 逐样本分量必须落盘：open 指标 = winMs + loadMs + latencyMs，只存总量时
  // 双峰/常量无法归因（实测：`loadMs` 是 ≈600ms 常量、探针成功率随 app/fixture 漂移，
  // 只存总量会把它误读成「大文件处理慢」）。
  for (const field of ['samplesWinMs', 'samplesLoadMs', 'samplesLatencyMs', 'samplesProbeOk']) {
    assert(benchCode.includes(field),
      `open 指标必须逐样本记录 ${field}（只存总量无法诊断双峰/常量分量，会把 harness 假象读成性能结论）`);
  }
  // canary：自检「检测规则」本身，而不是拿真实文件做注入 ——
  // 后者与默认值字面量耦合，合法调整默认值（如 1 → 2）时会误报「canary 未武装」。
  if (!WARMUP_RE.test("const warmup = parseInt(argVal('--warmup', '1'), 10);")) {
    errors.push('benchmark 预热 canary 失效：合法默认值未被检出');
  }
  if (WARMUP_RE.test("const warmup = parseInt(argVal('--warmup', '0'), 10);")) {
    errors.push('benchmark 预热 canary 过宽：0 轮预热（会制造「越大越快」假象）被误判为合法');
  }
}

for (const observation of ledger.patchObservations ?? []) {
  assert(observation.version !== '1.14.9', `补丁观察 ${observation.version} 不应重复规范基线`);
  assert(/不可替代规范验收基线/.test(observation.purpose ?? ''), `补丁观察 ${observation.version} 必须声明其非规范性`);
  assert(typeof observation.evidence === 'string' && existsSync(resolve(root, observation.evidence)), `补丁观察 ${observation.version} 的证据不存在`);
}

const ids = new Set();
const domains = new Set();
for (const item of ledger.items ?? []) {
  assert(/^P0-[A-Z0-9]+-\d{3}$/.test(item.id ?? ''), `无效 P0 ID：${item.id ?? '<missing>'}`);
  assert(!ids.has(item.id), `P0 ID 重复：${item.id}`);
  ids.add(item.id);
  domains.add(item.domain);
  assert(allowedGrades.has(item.grade), `${item.id} 的 grade 必须为 E、B 或 D`);
  assert(allowedStatuses.has(item.status), `${item.id} 的 status 无效：${item.status}`);
  assert(typeof item.typoraBehavior === 'string' && item.typoraBehavior.length > 0, `${item.id} 缺少 Typora 行为合同`);
  assert(typeof item.mellowTarget === 'string' && item.mellowTarget.length > 0, `${item.id} 缺少 Mellow 目标`);
  assert(typeof item.ownerPackage === 'string' && item.ownerPackage.length > 0, `${item.id} 缺少 Owner Package`);
  assert(Array.isArray(item.evidence) && item.evidence.length > 0, `${item.id} 缺少证据`);
  assert(Array.isArray(item.requiredEvidence) && item.requiredEvidence.length > 0, `${item.id} 缺少验收证据要求`);
  for (const evidence of item.evidence ?? []) {
    assert(existsSync(resolve(root, evidence)), `${item.id} 的证据不存在：${evidence}`);
    // 证据必须能随仓库提交 —— `tests/benchmark/results/` 与 `reports/` 已在其
    // .gitignore 中被忽略，指向那里的证据在本机存在、在 CI 上必然缺失
    // （2026-09-13 实测：正是它让 parity 护栏在 CI 连续四轮失败，而本地全绿）。
    // 生成产物若要作为证据，先复制到 `tests/qualification/evidence/` 再登记。
    assert(!/^tests\/benchmark\/(results|reports)\//.test(evidence),
      `${item.id} 的证据位于被 gitignore 的生成目录：${evidence}（请复制到 tests/qualification/evidence/ 后登记）`);
  }
  if (item.status === 'PASS-E') {
    for (const platform of platformEvidence) {
      assert(item.requiredEvidence.includes(platform), `${item.id} 标记 PASS-E 前必须要求 ${platform} 真机证据`);
    }
    assert(item.requiredEvidence.includes('ux-gate'), `${item.id} 标记 PASS-E 前必须要求 UX Gate`);
  }
}

for (const domain of ['editing', 'sidebar', 'desktop-ui', 'menu', 'acceptance']) {
  assert(domains.has(domain), `台账缺少关键域：${domain}`);
}
// V7-W0（2026-09-12）：台账从 32 项扩容到覆盖 §7 分域合同的 50 项。下限提到 45，
// 防止未来「删条目瘦身」悄悄退回只覆盖少数域。
assert(ids.size >= 45, `台账必须覆盖至少 45 个 P0 项（当前 ${ids.size}，V7-W0 扩容后基线 50）`);
for (const domain of ['file', 'layout', 'feature', 'build']) {
  assert(domains.has(domain), `台账缺少 V7-W0 新增域：${domain}`);
}

if (errors.length) {
  console.error('Typora parity ledger validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
for (const item of ledger.items) counts[item.status] += 1;
console.log(`Typora parity ledger: ${ledger.items.length} P0 items; normative baseline ${ledger.normativeBaseline.product} ${ledger.normativeBaseline.version}`);
console.log(`Status dashboard: ${Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${status}=${count}`).join(', ')}`);
