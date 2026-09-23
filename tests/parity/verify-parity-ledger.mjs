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
  // 反例锁：探针失败时**不得**把「窗口出现」当成有效 open-to-editable。
  // 旧写法 `winMs + (probe.ok ? … : null)` 在 JS 里 `number + null === number`，
  // 于是失败样本静默退化为 winMs 并与成功样本一起求中位数 —— 两种不可比的量混进
  // 同一个统计量，实测直接制造了「Typora 10MB 比 1MB 快 2.6×」这一物理不可能的反转。
  assert(!/\+\s*\(\s*probe\.ok\s*\?/.test(benchCode),
    'open 指标不得用 `winMs + (probe.ok ? … : null)` 这种写法：JS 的 number + null 会静默退化为 winMs，把「窗口出现」冒充成 open-to-editable');
  assert(/validSamples/.test(benchCode) && /probeFailures/.test(benchCode),
    'open 指标必须报出有效样本数与探针失败数（否则读者会拿 N=5 与 N=0 两个数字直接相减）');
  // canary：自检「检测规则」本身，而不是拿真实文件做注入 ——
  // 后者与默认值字面量耦合，合法调整默认值（如 1 → 2）时会误报「canary 未武装」。
  if (!WARMUP_RE.test("const warmup = parseInt(argVal('--warmup', '1'), 10);")) {
    errors.push('benchmark 预热 canary 失效：合法默认值未被检出');
  }
  if (WARMUP_RE.test("const warmup = parseInt(argVal('--warmup', '0'), 10);")) {
    errors.push('benchmark 预热 canary 过宽：0 轮预热（会制造「越大越快」假象）被误判为合法');
  }

  // ── ROI 来源 / 焦点护栏（2026-09-23）────────────────────────────────────
  // 立此节的原因：`startup-probe` 的 ROI 是**窗口相对**坐标，而 runner 原先用
  // `waitWindow` 返回的几何换算绝对像素。`waitWindow` 走 CGWindowList，返回的是窗口
  // 出现**瞬间的过渡尺寸**（实测 Tauri 主窗出现时 1178×786，最终 resize 到 960×963；
  // 而 SCK 侧始终是 960×963）。按过渡几何算出的 ROI 施加到最终窗口上会落到空白处 ——
  // 探针实测 detectMaxDiff=0、失败截图整幅纯白（仅右上角一条工具条残影），成功率
  // 随 app/fixture 漂移（实测 6/10），台账曾把它误读成「探针本身不稳定」。
  // 另：Mellow（WKWebView）下合成点击会破坏 TextInput 焦点协议 → 后续 CGEvent 按键
  // 全部丢失，这是同一症状的**第二个独立成因**，必须同时传 --no-click。
  // 修法：ROI 由「即将捕获的那个窗口」的比例求得（helper 侧 resolveRoiForCapture），
  // 两个来源合一。实测改后同一场景 10/10 成功。
  const STARTUP_CALL_SRC = "helper\\(\\s*'startup-probe'[\\s\\S]*?;";
  const startupCalls = benchCode.match(new RegExp(STARTUP_CALL_SRC, 'g')) ?? [];
  assert(startupCalls.length > 0,
    '未找到 startup-probe 调用点（ROI 护栏失效，请同步更新本护栏）');
  for (const call of startupCalls) {
    assert(/ROI_FRAC/.test(call),
      'startup-probe 必须以窗口比例（ROI_FRAC_*）给出 ROI：绝对像素来自 waitWindow 的过渡几何，与 SCK 实际捕获的窗口不一致，ROI 会落到空白处');
    assert(/app\.probeArgs/.test(call),
      'startup-probe 调用必须透传 app.probeArgs（否则 Mellow 的 --no-click 不生效，按键全部丢失）');
  }
  assert(/probeArgs:\s*\[\s*'--no-click'\s*\]/.test(benchCode),
    'Mellow 必须声明 probeArgs 含 --no-click：合成点击会破坏 WKWebView 的 TextInput 焦点协议，导致后续按键全部丢失（探针报 detectMaxDiff=0）');
  // 反例锁：不得用 waitWindow 的几何换算探针 ROI（本 bug 的原写法）。
  assert(!/roiStr\(\s*topRoi\(/.test(benchCode),
    '不得用 roiStr(topRoi(win)) 作为探针 ROI：waitWindow 返回的是窗口出现瞬间的过渡尺寸，会与 SCK 捕获的窗口错配');

  // canary：自检上述两条规则本身（样本用拼接构造，避免护栏与字面量耦合）
  const BAD_ROI_SAMPLE = 'helper(' + "'startup-probe', '--pid', String(pid), '--roi', " + 'roiStr(topRoi(win)));';
  if (!new RegExp(STARTUP_CALL_SRC).test(BAD_ROI_SAMPLE)) {
    errors.push('ROI 正例锁 canary 失效：缺 ROI_FRAC 的调用样本未被识别为 startup-probe 调用');
  } else if (/ROI_FRAC/.test(BAD_ROI_SAMPLE)) {
    errors.push('ROI 正例锁 canary 失效：缺 ROI_FRAC 的调用样本被误判为合规');
  }
  if (!/roiStr\(\s*topRoi\(/.test(BAD_ROI_SAMPLE)) {
    errors.push('ROI 反例锁 canary 失效：旧写法样本未被检出');
  }

  // 跨层锁：ROI 比例解析必须真的在 helper 里实现（只改 runner 传参 = 参数被静默忽略）。
  const helperPath = resolve(root, 'tests/benchmark/lib/screen-timing.swift');
  assert(existsSync(helperPath), '探针源码 tests/benchmark/lib/screen-timing.swift 不存在');
  if (existsSync(helperPath)) {
    const helperSrc = readFileSync(helperPath, 'utf8').replace(/\r\n/g, '\n');
    assert(/func resolveRoiForCapture/.test(helperSrc),
      'helper 必须实现 resolveRoiForCapture（用「即将捕获的那个窗口」求 ROI）：跨层字段必须两端同时锁');
    assert(/roiFrac/.test(helperSrc), 'helper 必须支持按窗口比例解析 ROI（--roi-frac）');
    assert(/--no-click/.test(helperSrc), 'helper 必须支持 --no-click（Mellow/WKWebView 必需）');
  }

  // ── 基线有效性护栏（2026-09-23）──────────────────────────────────────────
  // 立此节的原因：Typora **不渲染超过 2,000,000 字符的文档** ——
  // `TypeMark/appsrc/window/frame.js` 的 `tryEnterOversize` 判定 `e.length > File.MAX_FILE_SIZE`
  // 且同文件内 `MAX_FILE_SIZE: 2e6`；命中时只显示「The file is too large to render in Typora.」
  // 提示页（实测边界：1,900,000 字符正常渲染 / 2,100,000 字符为提示页）。
  // 于是报告里 5MB/10MB/100k-lines 那几行的 Typora 数字，测的是**提示页耗时**，
  // 与「打开并编辑该文档」不是同一件事。台账原结论「10MB open 2.59× 于 Typora」
  // 正是把这两个量直接相除的产物。故：所有跨应用比值必须经 ratioOrNA 判定基线有效性。
  // 注意 `2[_0]{6,}`：常量写作千位分隔的 `2_000_000`，其中**连续 0 只有 3 个**，
  // 用 `0{5,}` 会漏判（本护栏首跑即因此误报，属 fail-safe 方向）。
  assert(/TYPORA_MAX_FILE_SIZE\s*=\s*2[_0]{6,}/.test(benchCode),
    'benchmark 必须声明 Typora 渲染上限 TYPORA_MAX_FILE_SIZE = 2000000（来源：Typora 1.14.9 frame.js 的 MAX_FILE_SIZE 与 tryEnterOversize）');
  assert(/function baselineRendersFixture/.test(benchCode),
    'benchmark 必须实现 baselineRendersFixture（判定某夹具是否在 Typora 渲染上限内）');
  assert(/function ratioOrNA/.test(benchCode),
    'benchmark 必须实现 ratioOrNA：基线不渲染该夹具时不得相除');
  assert(/TYPORA_MAX_FILE_SIZE/.test(benchCode.slice(benchCode.indexOf('function ratioOrNA'))),
    'ratioOrNA 必须引用 TYPORA_MAX_FILE_SIZE（否则判定与阈值脱钩）');
  // 反例锁：不得出现「把 Typora 的 median/p95 直接当分母」的裸相除。
  // 命中即为「把提示页耗时当成打开耗时」，是台账那条错误结论的原写法。
  const RAW_RATIO_RE = /\.(?:median|p95|medianMB|peakMB)\s*\/\s*(?:tt|ts)\??\./;
  assert(!RAW_RATIO_RE.test(benchCode),
    '不得直接把 Typora 的 median/p95 当分母（须经 ratioOrNA）：超过 Typora 渲染上限的夹具其 Typora 侧是提示页耗时，不是打开耗时');
  // canary：自检反例锁本身（样本用拼接构造）
  const RAW_RATIO_SAMPLE = 'const ratio = (mt' + '.median / ' + 'tt.median).toFixed(2);';
  if (!RAW_RATIO_RE.test(RAW_RATIO_SAMPLE)) {
    errors.push('基线有效性反例锁 canary 失效：裸相除样本未被检出');
  }

  // ── 夹具生成原子性护栏（2026-09-23）────────────────────────────────────
  // 立此节的原因：`generate-fixtures.mjs` 原实现**先 rmSync 掉全部夹具再重新生成**。
  // 一旦中途失败（实测：沙箱下写 1000 张 PNG 被拒），夹具整体丢失且无提示 ——
  // 表现为 runner 在 Typora 那一轮重建失败后，Mellow 那一轮两个夹具被
  // 「跳过（夹具缺失）」，整批测量静默变成空跑，而 results JSON 看起来「跑过了」。
  // 现在改为写入 `.staging/`，全部成功后才 renameSync 搬入。
  const fixturesPath = resolve(root, 'tests/benchmark/generate-fixtures.mjs');
  assert(existsSync(fixturesPath), '夹具生成器 tests/benchmark/generate-fixtures.mjs 不存在');
  if (existsSync(fixturesPath)) {
    const fixtureSrc = readFileSync(fixturesPath, 'utf8').replace(/\r\n/g, '\n');
    assert(/join\(outDir,\s*'\.staging'\)/.test(fixtureSrc),
      '夹具生成必须使用 staging 目录（.staging）：先删后写会在中途失败时整体丢失夹具');
    // 正例锁：生成内容必须写进 staging，**不得**直接写 outDir
    assert(/writeFileSync\(join\(stagingDir,\s*job\.name\)/.test(fixtureSrc),
      '夹具内容必须写入 stagingDir（写入 outDir 会让失败时的半成品覆盖可用夹具）');
    assert(!/writeFileSync\(join\(outDir,\s*job\.name\)/.test(fixtureSrc),
      '夹具内容不得直接写入 outDir：生成中途失败会留下残缺夹具，runner 会当作有效夹具使用');
    // 正例锁：搬入必须用 renameSync（POSIX 原子替换），不得「先删再搬」
    assert(/renameSync\(join\(stagingDir,\s*f\),\s*join\(outDir,\s*f\)\)/.test(fixtureSrc),
      '夹具搬入必须用 renameSync 原子替换：先 rmSync 再写会留下「旧已删、新未到」的空档');
    // canary：自检上述正例锁本身
    const WRITE_OUTDIR_SAMPLE = 'writeFileSync(join(outDir, ' + 'job.name), text);';
    if (!/writeFileSync\(join\(outDir,\s*job\.name\)/.test(WRITE_OUTDIR_SAMPLE)) {
      errors.push('夹具原子性正例锁 canary 失效：直写 outDir 的样本未被检出');
    }
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
