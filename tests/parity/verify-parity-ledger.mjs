import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

// ── 状态词表必须「护栏 ⇄ 台账 ⇄ master-plan §4.3」三方一致（2026-10-06，审计 §4.92）──
// 立此条的原因（实测）：`allowedStatuses`（本护栏，**硬编码 10 项**）与
// 台账的 `statusDefinitions`（**声明 10 项**）此前**互不核对** —— 本护栏**完全不读**
// `statusDefinitions`（实测 `includes('statusDefinitions') === false`）⇒
// 在任一侧加/删一个状态都**不会有任何信号**。
//
// 而**状态词表的语义是有后果的**：门禁的「不阻断口径」= `PASS-E` / `PASS-B` /
// **`AUTO` 且 `requiredEvidence` 不含 `ux-gate`**（ADR-0024 Q1=A3）——
// 它**依赖 `AUTO` 的含义**（master-plan §4.3：`自动化测试通过，未完成真机体验验收`）。
// 若有人把台账里的 `AUTO` 释义改成「已完成」，门禁**仍会通过**，而语义已变。
//
// ⚠️ **实测还发现一处真缺口**：master-plan §4.3 定义了 **`PASS-BETTER`**
// （「Better 项通过对照或盲测」），且 §4.3 结尾写明「**最终「Done」只能是 `PASS-E` 或 `PASS-BETTER`**」——
// 而**台账的 `statusDefinitions` 与本护栏的 `allowedStatuses` 都没有它**
// ⇒ **有 Better 项通过盲测时，按宪法无法标记 Done**（只能标 `PASS-E`，与 §4.3 的区分丢失）。
// 注意它**不是** `grade: B` 的重复：master-plan §4.2 的 `grade`（E/B/D）说的是「**该项是不是 Better 项**」，
// §4.3 的 `PASS-BETTER` 说的是「**那个 Better 项的验收级别**」。
// ⇒ **本轮不擅自补**（加一个状态会牵动本护栏、门禁口径与 50 项既有数据），
//   改为**显式例外表 + 理由**，让「要么补状态、要么改 §4.3」这件事**无法被静默忽略**。
const STATUS_VOCAB_EXEMPT = new Map([
  ['PASS-BETTER',
    '⚠️ **已知缺口，待裁决**：master-plan §4.3 把它定义为「最终 Done」之一，但台账/护栏均无此状态。'
    + '本轮**未擅自补**（加状态会牵动护栏、门禁口径与 50 项既有数据）——'
    + '裁决入口：要么给台账 + 护栏补 `PASS-BETTER`，要么把 §4.3 的该行与「Done 只能是…」一句改掉'],
]);
{
  const declared = Object.keys(ledger.statusDefinitions ?? {});
  assert(declared.length > 0, '台账必须声明 statusDefinitions（状态词表的单一真值源）');
  // ① 护栏 ⇄ 台账：**双向**集合相等（本护栏此前完全不读它）
  const guardOnly = [...allowedStatuses].filter((s) => !declared.includes(s)).sort();
  const ledgerOnly = declared.filter((s) => !allowedStatuses.has(s)).sort();
  assert(guardOnly.length === 0 && ledgerOnly.length === 0,
    `状态词表不一致（护栏 ⇄ 台账）：仅护栏有 [${guardOnly}]，仅台账有 [${ledgerOnly}]`
    + ' —— 两侧加/删状态必须同时改（本护栏此前**完全不读** statusDefinitions）');
  // ② 台账 ⇄ master-plan §4.3（**扫 §4.3 原文**，不采信台账自述）
  const planPath = resolve(root, 'docs/plans/typora-parity-master-plan.md');
  assert(existsSync(planPath), '缺少 master-plan（状态码的宪法依据）');
  if (existsSync(planPath)) {
    const plan = readFileSync(planPath, 'utf8').replace(/\r\n/g, '\n');
    const at43 = plan.indexOf('### 4.3 状态码');
    assert(at43 >= 0, 'master-plan 缺少 §4.3 状态码（状态词表的宪法依据）');
    if (at43 >= 0) {
      const nextHead = plan.indexOf('\n### ', at43 + 1);
      const sec43 = plan.slice(at43, nextHead < 0 ? plan.length : nextHead);
      // §4.3 用 `| MAC / WIN / LINUX | … |` 一行合写三个状态 ⇒ 展开后比对
      // ⚠️ 两个已实测的解析坑：
      //   ① 表里有的行是**加粗**（`| **PASS-E** | … |`）；
      //   ② 状态名可含下划线（`NOT_TESTED`）；
      //   ③ **`/` 不能写进正则的字符类** —— 在 JS 里它会**提前结束正则字面量**
      //      （首版写 `[A-Z0-9 _/-]`，当场误报 `PASS-B`/`PASS-E` 缺失）；
      //   ④ token 校验必须**允许 `-`**（`PASS-B` / `PASS-E` / `PASS-BETTER`）——
      //      重写时漏掉 `-` 会让**所有 `PASS-*` 状态**被判为「宪法未定义」（**当场误报**）。
      // ⇒ 改为「抓**整格**（`[^|]*?`）再按 `/` 拆分并逐 token 校验」。
      const planStatuses = new Set();
      for (const m of sec43.matchAll(/^\|\s*([^|]*?)\s*\|/gm)) {
        for (const tok of m[1].split('/')) {
          const s = tok.replace(/\*/g, '').trim();
          if (/^[A-Z][A-Z0-9_-]*$/.test(s) && s !== '状态') planStatuses.add(s);
        }
      }
      assert(planStatuses.size >= 8, `master-plan §4.3 只解析出 ${planStatuses.size} 个状态（下限 8）—— 解析漂移会让本判据空转`);
      const missingInLedger = [...planStatuses].filter((s) => !declared.includes(s) && !STATUS_VOCAB_EXEMPT.has(s)).sort();
      const extraInLedger = declared.filter((s) => !planStatuses.has(s)).sort();
      assert(missingInLedger.length === 0,
        `master-plan §4.3 定义了但台账**无法表达**的状态：${missingInLedger.join(', ')} —— `
        + '要么给台账 + 护栏补上，要么登记进 STATUS_VOCAB_EXEMPT（带理由）');
      assert(extraInLedger.length === 0,
        `台账有但 master-plan §4.3 **未定义**的状态：${extraInLedger.join(', ')} —— 状态的语义必须可追溯到宪法`);
      // ③ `AUTO` 的释义必须仍表达「自动化通过 + 真机体验验收未完成」
      //    （门禁的「不阻断口径」依赖它；改掉释义不会让门禁变红，但语义已变）
      const autoDef = String(ledger.statusDefinitions?.AUTO ?? '');
      assert(/自动化/.test(autoDef) && /真机/.test(autoDef) && /未完成|尚未完成/.test(autoDef),
        `台账 statusDefinitions.AUTO 的释义变了：「${autoDef}」—— 门禁的「不阻断口径」依赖`
        + '「自动化通过 + **真机体验验收未完成**」这一含义（master-plan §4.3 / ADR-0024 A1）');
      assert(!/已完成|已验收/.test(autoDef),
        `台账 statusDefinitions.AUTO 的释义含「已完成/已验收」：「${autoDef}」—— 与 §4.3 的 AUTO 含义相反`);
    }
  }
  // 例外表**双向**：登记了但已不再缺失（说明已补齐）⇒ 报错
  for (const [s, reason] of STATUS_VOCAB_EXEMPT) {
    if (declared.includes(s)) {
      fail(`${s} 已在台账 statusDefinitions 里 —— 请删除 STATUS_VOCAB_EXEMPT 的该例外条目`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`STATUS_VOCAB_EXEMPT 的 ${s} 缺理由`);
    }
  }
  // canary：判据是**同一组集合运算**，双向
  const setDiff = (a, b) => [...a].filter((x) => !b.has(x)).sort();
  if (setDiff(new Set(['A', 'B']), new Set(['A', 'B'])).length !== 0) {
    errors.push('状态词表护栏 canary 失效：相等集合被判为有差异');
  }
  if (setDiff(new Set(['A', 'C']), new Set(['A', 'B'])).join(',') !== 'C') {
    errors.push('状态词表护栏 canary 失效：多出的状态未被识别');
  }
}

// ── 台账 `updatedAt` 必须是一个**合理的人工维护值**（2026-10-06，审计 §4.92）──
// 实测：`updatedAt` 全仓**只出现在它自己的声明里**（从未被任何代码/文档读），
// 且值为 `2026-09-12` —— 而台账此后被改过多次 ⇒ **字段过期且无消费者**。
// 本判据只做「合理值」下限（合法日期 + 不早于声明下限 + 不在未来），
// ⚠️ **不假装能自动检测「陈旧」** —— 它是**人工维护字段**，无自动推导来源。
{
  const UPDATED_AT_FLOOR = '2026-09-12'; // 声明下限 = 立此判据时的实测值
  const u = String(ledger.updatedAt ?? '');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(u), `台账 updatedAt 必须是 YYYY-MM-DD（实测「${u}」）`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(u)) {
    assert(u >= UPDATED_AT_FLOOR, `台账 updatedAt（${u}）早于声明下限 ${UPDATED_AT_FLOOR} —— 请勿回退该字段`);
    // 不在未来：⚠️ **必须带容差** —— 这是一个「**日期**字段」，由人**在本地时区**写，
    // 却在**校验环境**（CI runner，通常是 UTC）被判。
    // **写入环境与校验环境可能不同时区** ⇒ 只对齐「校验环境内部的 UTC/本地」不够（实测踩过两次）：
    //   · 首次：只比 UTC 今天 ⇒ 本地（GMT+8）已是次日时**误报合法值**；
    //   · 第二次（CI 实测）：CI 在 UTC（2026-10-05），而值按本地写成 2026-10-06 ⇒ **CI 红、本地绿**。
    // ⇒ **容差推导**：时区偏移 ∈ [-12h, +14h]，故「写入方的本地日期」最多比「UTC 日期」**超前 1 天**
    //   （`date(T+14h) − date(T) ≤ 1`）。取 `max(utcToday, localToday)` 已 ≥ utcToday，再加 1 天即**充分**。
    // ⚠️ 容差只放宽「未来」一侧；「不早于下限」一侧仍严格（防回退）。
    const utcToday = new Date().toISOString().slice(0, 10);
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const baseToday = utcToday > localToday ? utcToday : localToday;
    const latestAllowed = new Date(`${baseToday}T00:00:00Z`);
    latestAllowed.setUTCDate(latestAllowed.getUTCDate() + 1); // 容差 +1 天（见上方推导）
    const latestAllowedStr = latestAllowed.toISOString().slice(0, 10);
    assert(u <= latestAllowedStr,
      `台账 updatedAt（${u}）晚于允许上限 ${latestAllowedStr}（今天 UTC ${utcToday} / 本地 ${localToday} + 1 天时区容差）`
      + ' —— 请勿填写未来日期');
  }
  // canary：日期谓词双向
  const validDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!validDate('2026-10-06')) errors.push('updatedAt 护栏 canary 失效：合法日期样本未被识别');
  if (validDate('2026-10')) errors.push('updatedAt 护栏 canary 过宽：不完整日期被误判为合法');
}

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
  //
  // 例外（2026-09-29）：**startup 指标没有夹具** —— 它是 blank 冷启动，Typora 侧不存在
  // 「提示页耗时」问题，故该节内的直接比值合法。扫描时把该节排除，并在注释里写明理由；
  // **不靠改变量名绕开护栏**（改名绕开会腐蚀护栏本身，比误报更糟）。
  const RAW_RATIO_RE = /\.(?:median|p95|medianMB|peakMB)\s*\/\s*(?:tt|ts)\??\./;
  const rawRatioScan = benchCode.replace(/## 1\. startup[\s\S]*?## 2\. open-to-editable/, '');
  // 切片**会连锚点一起删掉**，故用后一个锚点验证切片确实生效（否则护栏静默失效）
  assert(rawRatioScan.includes('## 3. typing'),
    'raw-ratio 例外节的切片失败（## 1. startup 与 ## 2. open-to-editable 的锚点不匹配）→ 护栏已失效');
  assert(!RAW_RATIO_RE.test(rawRatioScan),
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

  // ── 大文件模式阈值跨层锁（2026-09-25）────────────────────────────────────
  // 立此节的原因：`5MB.md` 的字节数**恰好等于** `LARGE_FILE_BYTES_THRESHOLD`（5 MiB），
  // 而判据是**严格大于** → 该夹具**不**进入大文件模式 → 对 5MB 文档付全量渲染成本，
  // 反而比进入降级路径的 10MB 慢。benchmark 报告必须把「哪一侧」显式标注出来，
  // 否则读者会把这条反直觉结果读成噪声或产品缺陷。
  // 报告里的阈值是**复刻**，必须与真值源逐一相等 —— 单侧改动会立刻报错。
  const largeFileSrc = readFileSync(resolve(root, 'packages/editor-engine/src/largeFile.ts'), 'utf8').replace(/\r\n/g, '\n');
  const benchSrc = benchCode;
  const evalArith = (expr) => {
    const cleaned = expr.replace(/_/g, '');
    if (!/^[\d*\s]+$/.test(cleaned)) return null; // 只接受纯算术，不做 eval
    return cleaned.split('*').map((s) => Number(s.trim())).reduce((a, b) => a * b, 1);
  };
  const srcBytes = evalArith((largeFileSrc.match(/LARGE_FILE_BYTES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  const srcLines = evalArith((largeFileSrc.match(/LARGE_FILE_LINES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  const benchBytes = evalArith((benchSrc.match(/MELLOW_LARGE_FILE_BYTES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  const benchLines = evalArith((benchSrc.match(/MELLOW_LARGE_FILE_LINES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  assert(Number.isFinite(srcBytes) && srcBytes > 0, '无法从 largeFile.ts 解析 LARGE_FILE_BYTES_THRESHOLD');
  assert(Number.isFinite(srcLines) && srcLines > 0, '无法从 largeFile.ts 解析 LARGE_FILE_LINES_THRESHOLD');
  assert(Number.isFinite(benchBytes), 'run-benchmark 必须声明 MELLOW_LARGE_FILE_BYTES_THRESHOLD（复刻真值源）');
  assert(Number.isFinite(benchLines), 'run-benchmark 必须声明 MELLOW_LARGE_FILE_LINES_THRESHOLD（复刻真值源）');
  if (Number.isFinite(srcBytes) && Number.isFinite(benchBytes)) {
    assert(srcBytes === benchBytes,
      `大文件模式字节阈值跨层不一致：largeFile.ts=${srcBytes}，benchmark=${benchBytes}（单侧改动会让报告的「哪一侧」标注失真）`);
  }
  if (Number.isFinite(srcLines) && Number.isFinite(benchLines)) {
    assert(srcLines === benchLines,
      `大文件模式行数阈值跨层不一致：largeFile.ts=${srcLines}，benchmark=${benchLines}`);
  }
  // 判据方向必须同为「严格大于」：若一侧改成 >=，`5MB.md` 的归属就会翻转
  assert(/byteLength\s*>\s*LARGE_FILE_BYTES_THRESHOLD\s*\|\|\s*lineCount\s*>\s*LARGE_FILE_LINES_THRESHOLD/.test(largeFileSrc),
    'classifyLargeFile 必须是「严格大于」两阈值（>，不是 >=）：5MB.md 恰好压线，改成 >= 会翻转其归属');
  assert(/bytes\s*>\s*MELLOW_LARGE_FILE_BYTES_THRESHOLD\s*\|\|\s*lines\s*>\s*MELLOW_LARGE_FILE_LINES_THRESHOLD/.test(benchSrc),
    'benchmark 的 mellowLargeFileMode 必须与 classifyLargeFile 同为「严格大于」');
  // ── 三方一致：PRD §109 ↔ largeFile.ts ↔ benchmark 复刻（2026-09-25）──────
  // 「严格大于」不是实现者的口味，而是**宪法依据**：PRD §109 Large File Mode 的触发写的是
  //   >5MB
  //   or >50,000 lines
  // 故这条不变量必须三方同锁 —— 只锁实现与 benchmark 仍可能双双偏离 PRD
  // （例如有人把 PRD 改成 `>=5MB` 而没同步代码，或反之）。
  // 这也正是「5MB.md 恰好压线却不降级」的原因，不是缺陷。
  const prdPath = resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md');
  assert(existsSync(prdPath), 'PRD 不存在，无法校验大文件模式阈值的宪法依据');
  if (existsSync(prdPath)) {
    const prdSrc = readFileSync(prdPath, 'utf8').replace(/\r\n/g, '\n');
    assert(/# 109\. Large File Mode/.test(prdSrc), 'PRD 缺少 §109 Large File Mode（阈值语义的宪法依据）');
    assert(/>5MB/.test(prdSrc), 'PRD §109 的字节触发条件应为「>5MB」（严格大于）');
    assert(/>50,000 lines/.test(prdSrc), 'PRD §109 的行数触发条件应为「>50,000 lines」（严格大于）');
    // canary：自检 PRD 锁
    const PRD_SAMPLE = '# 109. Large File Mode\n\n```text\n>' + '5MB\nor >50,000 lines\n```';
    if (!/>5MB/.test(PRD_SAMPLE) || !/>50,000 lines/.test(PRD_SAMPLE)) {
      errors.push('PRD §109 阈值护栏 canary 失效：样本未被检出');
    }
  }
  // 报告必须把归属标注出来（否则反直觉结论会被误读）
  assert(/function largeModeLabel/.test(benchSrc), '报告必须实现 largeModeLabel（标注夹具落在阈值哪一侧）');
  assert(/恰好压线/.test(benchSrc), '报告必须显式标注「恰好压线」这种边界情形');

  // ── 第四处：**生产路径**上的内联实现（2026-09-30）────────────────────────
  // 立此条的原因（实跑核对发现）：上面三方锁的是「宪法 / 引擎纯函数 / benchmark 复刻」，
  // 但**真正决定应用行为的是宿主包装层**：
  //   `packages/editor-core/src/core.ts` 把阈值**内联重复**了一份
  //   （包依赖方向决定 editor-core 不能 import editor-engine，故内联是必要的）。
  // 而 `classifyLargeFile` 在**生产代码里没有任何调用点** —— 只有测试调用它；
  // 真实判定就是 core.ts 里那句 `bytes > 5 * 1024 * 1024 || lines > 50_000`。
  // 这条路径此前**既无单测也无护栏**：把它改成 `>=` 或改小阈值，
  // 应用行为就变了，而 PRD / largeFile.ts / benchmark **三者仍然自洽**、门禁全绿。
  // （这正是「已实现 ≠ 有消费方」的镜像形态：**被测试的那个函数没人用，被用的那段没人测**。）
  {
    const corePath = resolve(root, 'packages/editor-core/src/core.ts');
    assert(existsSync(corePath), 'editor-core/src/core.ts 不存在（大文件模式的生产路径缺失）');
    if (existsSync(corePath)) {
      const coreSrc = readFileSync(corePath, 'utf8').replace(/\r\n/g, '\n');
      const coreBytes = evalArith((coreSrc.match(/bytes\s*>\s*([\d_*\s]+?)\s*\|\|/) ?? [])[1] ?? '');
      const coreLines = evalArith((coreSrc.match(/lines\s*>\s*([\d_\s]+)/) ?? [])[1] ?? '');
      assert(Number.isFinite(coreBytes),
        '无法从 editor-core/src/core.ts 解析大文件模式字节阈值（生产路径必须可核对；'
        + '若改了写法请同步更新护栏，不要让它静默漏检）');
      assert(Number.isFinite(coreLines),
        '无法从 editor-core/src/core.ts 解析大文件模式行数阈值（同上）');
      if (Number.isFinite(coreBytes) && Number.isFinite(srcBytes)) {
        assert(coreBytes === srcBytes,
          `大文件模式字节阈值「生产路径 ↔ 引擎」不一致：core.ts=${coreBytes}，largeFile.ts=${srcBytes}`
          + '（core.ts 才是应用真正走的判定）');
      }
      if (Number.isFinite(coreLines) && Number.isFinite(srcLines)) {
        assert(coreLines === srcLines,
          `大文件模式行数阈值「生产路径 ↔ 引擎」不一致：core.ts=${coreLines}，largeFile.ts=${srcLines}`);
      }
      // 方向同样必须是「严格大于」（不能是 >=）：`5MB.md` 恰好压线，改方向会翻转其归属
      assert(/bytes\s*>\s*[\d_*\s]+?\s*\|\|\s*lines\s*>\s*[\d_\s]+/.test(coreSrc),
        'core.ts 的大文件判定必须同为「严格大于」两阈值（>，不是 >=）');
      // canary：自检这两条锁（样本拼接构造）
      const DIR_RE = /bytes\s*>\s*[\d_*\s]+?\s*\|\|\s*lines\s*>\s*[\d_\s]+/;
      const CORE_SAMPLE = 'const large = bytes > 5 * 1024 * 1024 || lines > ' + '50_000;';
      const cBytes = evalArith((CORE_SAMPLE.match(/bytes\s*>\s*([\d_*\s]+?)\s*\|\|/) ?? [])[1] ?? '');
      if (cBytes !== 5242880) {
        errors.push('大文件模式生产路径锁 canary 失效：样本阈值未被正确求值');
      }
      if (!DIR_RE.test(CORE_SAMPLE)) {
        errors.push('大文件模式生产路径锁 canary 失效：`>` 样本未被识别（方向锁失效）');
      }
      // 反例：`>=` 必须**不**被当作「严格大于」——否则方向锁形同虚设
      const GE_SAMPLE = 'bytes >' + '= 5 || lines > 50_000';
      if (DIR_RE.test(GE_SAMPLE)) {
        errors.push('大文件模式生产路径锁 canary 失效：`>=` 样本被误判为「严格大于」');
      }
    }
  }
  // canary：自检跨层锁
  const SRC_SAMPLE = 'LARGE_FILE_BYTES_THRESHOLD = ' + '5 * 1024 * 1024;';
  const m = SRC_SAMPLE.match(/LARGE_FILE_BYTES_THRESHOLD\s*=\s*([\d_*\s]+);/);
  if (!m || evalArith(m[1]) !== 5242880) {
    errors.push('大文件模式跨层锁 canary 失效：样本阈值未被正确求值');
  }

  // ── 报告不得把「推断的 PRD 口径」写成 PRD 的陈述（2026-09-29）──────────
  // 立此条的原因：报告原写「PRD 目标（1MB ≤250ms / 10MB ≤1.0–1.5s）为『热打开』口径」——
  // 但 PRD §110 原文**只写**「≤250ms to editable target」，**没有规定口径**。
  // 「热打开」是本仓库的推断（论据强：否则 250ms 比 Startup 的 1.2s 更严、两产品必不达标），
  // 但以「PRD 目标为 X 口径」的形式出现，就把**推断当成了需求** —— 读者会以为
  // PRD 已经这样规定，从而不去质疑该口径本身。
  // 现要求：必须写明「未在 PRD 中规定口径」+ 推断依据 + 指向承载裁决的 ADR。
  assert(/未在 PRD 中规定口径|未规定口径/.test(benchCode),
    '报告必须声明 PRD §110 的 1MB/10MB 目标「未在 PRD 中规定口径」，不得把推断写成 PRD 的陈述');
  assert(/ADR-0026/.test(benchCode),
    '报告必须指向承载口径裁决的 ADR-0026（推断不能自己当结论）');

  // ── 生成器必须产出 spec §4 列出的**全部**夹具（2026-09-30）──────────────
  // spec §4 是一张夹具表（1MB / 5MB / 10MB / 100k-lines / large-table /
  // 100-mermaid / 1000-images），而只有 generate-fixtures.mjs 能产出它们。
  // 此前护栏只提到 generate-fixtures 与 100k-lines，**没有断言「清单全覆盖」** ——
  // 从生成器删掉某个夹具不会有任何信号，spec §4 会**静默变成假话**
  //（「spec 要求了、机器上没人守」，与本轮前两条同类）。
  {
    const specPath = resolve(root, 'docs/specs/performance-benchmark-spec.md');
    const genPath = resolve(root, 'tests/benchmark/generate-fixtures.mjs');
    const specSrc = readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');
    const genSrc = readFileSync(genPath, 'utf8').replace(/\r\n/g, '\n');
    const sec4Start = specSrc.indexOf('## 4. 夹具规格');
    const sec4End = specSrc.indexOf('## 5.', sec4Start);
    const sec4 = sec4End > sec4Start ? specSrc.slice(sec4Start, sec4End) : specSrc.slice(sec4Start);
    const specFixtures = [...sec4.matchAll(/^\|\s*`([^`]+\.md)`\s*\|/gm)].map((m) => m[1]);
    const genNames = [...genSrc.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
    assert(specFixtures.length > 0, '无法从 spec §4 解析夹具清单（护栏需同步更新，不要静默漏检）');
    assert(genNames.length > 0, '无法从 generate-fixtures.mjs 解析夹具名（护栏需同步更新）');
    for (const fx of specFixtures) {
      assert(
        genNames.includes(fx),
        `spec §4 列出了夹具 ${fx}，但 generate-fixtures.mjs 不产出它（spec 会静默变成假话；要么补产出、要么同步删 spec 行）`,
      );
    }
    // canary：自检该锁（样本拼接构造，避免护栏检出自己）
    const SAMPLE_SPEC = '| `1MB.md` | x |' + String.fromCharCode(10) + '| `5MB.md` | y |';
    const parsed = [...SAMPLE_SPEC.matchAll(/^\|\s*`([^`]+\.md)`\s*\|/gm)].map((m) => m[1]);
    if (parsed.join(',') !== '1MB.md,5MB.md') {
      errors.push('夹具清单锁 canary 失效：spec 表行未被正确解析');
    }
  }

  // ── 报告必须有「环境头」，且不得被静默裁掉（spec §8，2026-09-30）─────────
  // spec §8 要求环境头含：机器规格 / macOS 版本 / Mellow commit + 脏树 /
  // Typora 实际版本 / 构建类型 / 权限状态。实测**这些都已实现**，
  // 但**没有任何断言在守** —— 头部被裁掉不会有任何信号，
  // 而「同机型对照」的结论正依赖这些字段（缺了就无法判断两次读数是否可比）。
  // 断言跑在 stripComments 之后的代码上，故必须落在**字符串字面量**里（只写注释不算）。
  {
    const headerFields = [
      [/机器：/, '机器规格 + macOS 版本'],
      [/Mellow commit：/, 'Mellow commit + 脏树'],
      [/Mellow 构建：/, '构建类型'],
      [/Typora 版本：/, 'Typora 实际版本'],
      [/权限：/, '权限状态'],
    ];
    for (const [pat, label] of headerFields) {
      assert(pat.test(benchCode),
        `报告环境头缺少「${label}」（spec §8 要求；缺了无法判断两次读数是否可比）`);
    }
    // canary：自检这几条锁（样本拼接构造，避免护栏检出自己）
    const SAMPLE_HEADER = '机器：' + 'Mellow commit：' + 'Mellow 构建：' + 'Typora 版本：' + '权限：';
    if (!headerFields.every(([pat]) => pat.test(SAMPLE_HEADER))) {
      errors.push('环境头锁 canary 失效：完整样本未被全部识别');
    }
    const SAMPLE_MISSING = '机器：' + 'Mellow commit：' + 'Mellow 构建：' + 'Typora 版本：';
    if (headerFields.every(([pat]) => pat.test(SAMPLE_MISSING))) {
      errors.push('环境头锁 canary 失效：缺「权限：」的样本竟被判为完整');
    }
  }

  // ── ADR-0026 的映射表必须覆盖 PRD §110 的**全部**目标（2026-09-30）─────────
  // PRD §110 有五个绝对目标：Startup ≤1.2s / 1MB ≤250ms / 10MB 1.0–1.5s /
  // Input <16ms / Input Large <32ms。ADR-0026 Q4=C1 已把「目标 ↔ 指标映射」
  // 定为**唯一声明处** —— 声明处漏掉任何一个目标，等于该目标**无人守**。
  // 实测（本轮）：`Input Large <32ms` 此前只出现在 spec 一处，没有任何断言在守；
  // 其余四个在护栏里也只是散文提及（不是断言）。故立此条把「五个都要声明」变成机器可核对。
  {
    const adr0026 = readFileSync(resolve(root, 'docs/adr/ADR-0026-perf-target-measurement-scope.md'), 'utf8').replace(/\r\n/g, '\n');
    const targets = [
      [/1\.2\s*s|1200\s*ms/, 'Startup ≤1.2s'],
      [/250\s*ms/, '1MB ≤250ms'],
      // ⚠️ 记法差异（2026-10-06 实测）：**PRD §110 写 `1.0s–1.5s`**，而 **ADR-0026 写 `1.0–1.5s`**。
      // 故模式必须同时接受两种（`1.0` 后可有可无 `s`）—— 否则「宪法侧」判据会误报。
      [/1\.0\s*s?\s*[–-]\s*1\.5\s*s/, '10MB 1.0–1.5s'],
      [/16\s*ms/, 'Input <16ms'],
      [/32\s*ms/, 'Input Large <32ms'],
    ];
    for (const [pat, label] of targets) {
      assert(pat.test(adr0026),
        `ADR-0026 的映射表缺少 PRD §110 的目标：${label}`
        + '（该表是「目标 ↔ 指标」的唯一声明处，漏项 = 该目标无人守）');
    }
    // ── 宪法侧：同一组目标必须在 **PRD §110 原文**里也成立（2026-10-06，审计 §4.80）──
    // 立此条的原因：上面这 5 个模式此前**只对 ADR 断言**，而「PRD §110 有五个绝对目标」
    // 是**硬编码在本护栏注释里**的 —— **PRD 从未被读** ⇒ 改宪法的数值（如 250ms → 200ms）
    // 不会让任何东西变红，而 ADR 那份「唯一声明处」会与宪法脱钩（「只锁一侧」，同 §4.9/§4.79）。
    {
      const prdFull = readFileSync(resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md'), 'utf8').replace(/\r\n/g, '\n');
      const at110 = prdFull.indexOf('# 110.');
      assert(at110 >= 0, 'PRD 缺少 §110 性能目标（绝对目标的宪法依据）');
      const nextH1 = prdFull.indexOf('\n# ', at110 + 1);
      const sec110 = prdFull.slice(at110, nextH1 < 0 ? prdFull.length : nextH1);
      const missingInPrd = targets.filter(([pat]) => !pat.test(sec110)).map(([, label]) => label);
      assert(missingInPrd.length === 0,
        `PRD §110 原文里找不到这些绝对目标：${missingInPrd.join(' / ')} —— `
        + '宪法是唯一真值源；改宪法必须同步 ADR-0026 的映射表与 benchmark 口径');
    }
    // canary：自检这五条锁有效（样本拼接构造，避免护栏检出自己）
    const SAMPLE_OK = '1.2s 250ms 1.0–1.5s 16ms ' + '32ms';
    if (!targets.every(([pat]) => pat.test(SAMPLE_OK))) {
      errors.push('ADR-0026 目标覆盖锁 canary 失效：完整样本未被全部识别');
    }
    const SAMPLE_MISSING = '1.2s 250ms 1.0–1.5s 16ms';
    if (targets.every(([pat]) => pat.test(SAMPLE_MISSING))) {
      errors.push('ADR-0026 目标覆盖锁 canary 失效：缺 32ms 的样本竟被判为完整');
    }
  }

  // ── 量具读数不得被当作业务指标（2026-09-30）────────────────────────────
  // 背景：历史上的错误结论「Mellow 10MB open 2.59× 于 Typora」正源于把 `loadMs`
  // （= `waitStable` 的返回：**等待画面静止**，含 600ms 稳定判定地板）当成了
  // 「文档加载耗时」。代码里已有注释说明该契约，但**没有护栏** ——
  // 删掉注释与排除逻辑不会有任何信号（「注释不是契约」）。故锁三件事：
  //   ① open 指标定义不得含 loadMs；② hotopen 指标定义不得含 loadMs；
  //   ③ 报告打印 loadMs 处必须带「等待画面静止 / 不是文档加载耗时」标注。
  // 注意：断言跑在 **stripComments 后**的代码上，故 ③ 必须落在**字符串字面量**里
  // （只写在注释里不算 —— 这正是本条的要点）。
  assert(!/opens\.push\([^\n]*loadMs/.test(benchCode),
    'open 指标定义不得包含 probe.loadMs（它是 waitStable 的返回，含 600ms 地板，不是加载耗时）');
  assert(!/vals\.push\([^\n]*loadMs/.test(benchCode),
    'hotopen 指标定义不得包含 probe.loadMs（同上）');
  // ── PRD 目标必须与**判定口径同表**（ADR-0026 A1，2026-09-30）─────────────
  // 背景：PRD §110 的 1MB/10MB 目标原被列在 §2 **冷启动** open-to-editable 表里，
  // 而 ADR-0026 A1 裁决判定量取 **热打开 hotopen.switchMs** —— 目标与口径错位，
  // 读者会拿冷启动读数去对目标（正是 ADR-0026 要消灭的误读）。
  assert(!/L\.push\('\| fixture \| Mellow median[^']*PRD 目标/.test(benchCode),
    '冷启动（open-to-editable）表不得列 PRD 目标 —— 目标必须与判定口径同表（ADR-0026 A1）');
  assert(/L\.push\('\| app \| 目标夹具[^']*PRD 目标[^']*达标/.test(benchCode),
    '热打开（hot-open）表必须列出 PRD 目标与达标判定（ADR-0026 A1 的判定处）');
  assert(/hotVerdict\(t, swMedian\)/.test(benchCode) && /stats\(g\.sw\)\.median/.test(benchCode),
    '热打开的达标判定必须由 **switchMs** 计算（判定量取 switchMs，不是 total）');
  assert(/等待画面静止/.test(benchCode) && /不是文档加载耗时/.test(benchCode),
    '报告打印 loadMs 处必须标注「等待画面静止 / 不是文档加载耗时」（且必须是字符串字面量，'
    + '不能只写在注释里）—— 否则读者会把它当业务指标，历史错误结论「2.59×」正是这样产生的');
  // W-PERF-3（2026-10-01 实测后新增）：`loadMs` 的打印**必须伴随「该窗口内观察到的显著变化帧数」**。
  // 立此条的原因：`loadMs` 恒为 600ms 稳定窗口（不是加载耗时），而实测 8 个样本的
  // `changedFrames` **全为 0** —— 说明该窗口里**没有东西可观察**。若只留 `loadMs` 一行，
  // 读者看到一个常量无从解释；带上帧数才能自证「为什么它是常量」。
  // 同时锁住「不得改用取最后一次变化的返回值」（那会退化成恒 0，实测已证）。
  assert(/samplesStableChangedFrames/.test(benchCode),
    'run-benchmark 必须逐样本落盘 waitStable 窗口内的显著变化帧数（loadMs 的常量成因需可核对）');
  assert(/该窗口内观察到的显著变化帧数/.test(benchCode),
    '报告打印 loadMs 处必须伴随「该窗口内观察到的显著变化帧数」诊断行（字符串字面量）');
  // ── W-PERF-1：应用内延迟读数必须有**出口**，且出口必须**环境变量门控**（2026-10-01）──
  // 立此条的原因：16ms Input 目标在屏幕捕获上原理性不可判定（16ms < 单帧），
  // 应用内埋点是**唯一可判定来源**；而埋点若没有出口（或出口无条件常开），
  // 就会重演本项目反复出现的「已实现 ≠ 有消费方 / 空开关」。
  {
    const readText = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
    const appSrc = readText('apps/desktop/src/App.tsx');
    const rustSrc = readText('apps/desktop/src-tauri/src/lib.rs');
    assert(/fn input_latency_dump_path/.test(rustSrc),
      'Rust 侧缺少 input_latency_dump_path 命令（应用内延迟读数的出口；环境变量 MELLOW_INPUT_LATENCY_DUMP）');
    assert(/input_latency_dump_path,/.test(rustSrc),
      'input_latency_dump_path 未注册进 invoke_handler（命令存在但前端调不到 = 空开关）');
    assert(/input_latency_dump_path/.test(appSrc),
      'App 侧未查询 input_latency_dump_path —— 应用内延迟读数没有出口');
    assert(/getInputLatencyReport/.test(appSrc),
      'App 侧未读取 iframe 埋点报告（getInputLatencyReport）');
    // 门控：未拿到路径时**不得**建定时器（否则正常运行会白跑一个 2s 定时器）
    assert(/path === null \|\| path === ''\) return;/.test(appSrc),
      'App 侧诊断通道必须「未拿到路径即早退」—— 不得无条件启动定时器（对正常运行零成本是硬约束）');
    // harness 侧：typing 必须真的把环境变量传下去，否则出口形同不存在
    assert(/MELLOW_INPUT_LATENCY_DUMP/.test(benchCode),
      'run-benchmark 未向被测 app 传 MELLOW_INPUT_LATENCY_DUMP —— 出口永远不生效');
    // 交叉验证：只报应用内读数**不足以**宣称「16ms 可判」（W-PERF-1 的验收条件）
    assert(/crossCheck/.test(benchCode),
      'run-benchmark 缺少应用内读数与屏幕捕获的**交叉验证**（W-PERF-1 验收条件）');
    assert(/交叉验证：屏幕捕获侧无有效样本/.test(benchCode),
      '交叉验证在「屏幕捕获侧无有效样本」时必须**明确标注未做**（不得据应用内读数单独宣称可判）');
    // 可达性（2026-10-01 实测修正）：初版判据是 `timeouts === 0`，而本机三轮实测的超时数
    // 是 3 / 8 / 7（屏幕捕获固有噪声）→ 该分支**从未执行** = 空开关。
    // 故锁死：不得再用「零超时」这种不可达判据；必须有显式的有效样本率阈值。
    assert(!/m\.typing\.timeouts === 0/.test(benchCode),
      '交叉验证不得以 `m.typing.timeouts === 0` 为判据 —— 实测超时恒 >0，该分支永不执行（空开关）');
    assert(/CROSSCHECK_MIN_VALID_RATE/.test(benchCode),
      '交叉验证必须用显式的「有效样本率」阈值（否则又退回不可达判据）');
    assert(/bias:/.test(benchCode),
      '交叉验证必须把**偏差方向**落盘（超时剔除使屏幕捕获 p95 偏低 ⇒ 下界检验偏严），不得只报 pass/fail');
    {
      const UNREACHABLE = 'if (screen?.p95 !== undefined && screen?.p95 !== null && m.typing.' + 'timeouts === 0) {';
      if (!/m\.typing\.timeouts === 0/.test(UNREACHABLE)) {
        errors.push('交叉验证可达性 canary 未武装：不可达判据样本未被检出');
      }
      const REACHABLE = 'if (screenValidRate >= CROSSCHECK_MIN_VALID_RATE) {';
      if (/m\.typing\.timeouts === 0/.test(REACHABLE)) {
        errors.push('交叉验证可达性 canary 失效：可达判据被误判为不可达');
      }
    }
    // canary：抹掉「早退门控」必须被检出
    const appDrift = appSrc.replace(/path === null \|\| path === ''\) return;/, 'return;');
    if (appDrift === appSrc) {
      errors.push('W-PERF-1 门控 canary 未武装：无法注入「去掉早退」漂移（锚点漂移，请更新护栏）');
    } else if (/path === null \|\| path === ''\) return;/.test(appDrift)) {
      errors.push('W-PERF-1 门控 canary 失效：注入漂移后仍判定为已门控');
    }
  }
  // canary：自检这三条锁（样本拼接构造，避免护栏检出自己）
  {
    const BAD_PUSH = 'opens.push((win.wallMs - t0Ms) + probe.' + 'loadMs);';
    const GOOD_PUSH = 'opens.push((win.wallMs - t0Ms) + probe.' + 'latencyMs);';
    if (!/opens\.push\([^\n]*loadMs/.test(BAD_PUSH)) {
      errors.push('量具读数锁 canary 失效：含 loadMs 的样本未被检出');
    }
    if (/opens\.push\([^\n]*loadMs/.test(GOOD_PUSH)) {
      errors.push('量具读数锁 canary 失效：不含 loadMs 的样本被误判');
    }
    const LABEL_SAMPLE = '等待画面静止' + '，不是文档加载耗时';
    if (!(/等待画面静止/.test(LABEL_SAMPLE) && /不是文档加载耗时/.test(LABEL_SAMPLE))) {
      errors.push('量具读数锁 canary 失效：标注样本未被检出');
    }
  }
  // ADR-0026 已于 2026-09-30 裁决为 Accepted（Q1/Q2=A1）：报告须写明**裁决结论**，
  // 不能停在「待裁决」——否则读者不知道当前该按哪个口径读数字。
  assert(/ADR-0026[^。]*Accepted/.test(benchCode) || /Accepted 2026-09-30/.test(benchCode),
    '报告必须写明 ADR-0026 的裁决状态与结论（Q1/Q2=A1 热打开口径），不得停留在「待裁决」');
  {
    const ASSERTED = 'PRD 目标（1MB ≤250ms / 10MB ≤1.0–1.5s）为「热打开」口径';
    if (benchCode.includes(ASSERTED)) {
      errors.push('报告仍在把「热打开」口径断言为 PRD 的陈述（应改为「未在 PRD 中规定口径」+ 推断依据 + 指向 ADR-0026 的裁决）');
    }
  }
  // canary：自检上述反例锁
  {
    const SAMPLE = 'PRD 目标（1MB ≤250ms / 10MB ≤1.0–1.5s）为「' + '热打开」口径';
    if (!/PRD 目标（1MB ≤250ms \/ 10MB ≤1\.0–1\.5s）为「热打开」口径/.test(SAMPLE)) {
      errors.push('PRD 口径断言反例锁 canary 失效：样本未被检出');
    }
  }

  // ── results[].app 的键名大小写（2026-09-29）─────────────────────────────
  // 立此条的原因：`results[].app` 的取值是 `'Mellow'` / `'Typora'`（**首字母大写**）。
  // 用小写查询会**静默**返回 undefined —— 不报错、不输出，只是整段报告消失。
  // 实测踩过两次：typing 的「逐样本诊断」段与 startup 的判定段都因此一行都没打印，
  // 而报告看起来完全正常（表格在、只是少了那几行）。
  {
    const bad = benchCode.match(/x\.app === '(mellow|typora)'/g) ?? [];
    assert(bad.length === 0,
      `run-benchmark 不得用小写 app 键查询 results（会静默返回 undefined，整段报告消失）：${bad.join(', ')}`);
    const good = benchCode.match(/x\.app === '(Mellow|Typora)'/g) ?? [];
    assert(good.length >= 1,
      `run-benchmark 应按 'Mellow' / 'Typora' 查询 results（实测只找到 ${good.length} 处）`);
    // 经变量的查询（如 `st(k)`）绕不过这条：断言 helper 必须用大写字面量调用
    assert(/st\('Mellow'\)|st\('Typora'\)|g\('Mellow'\)|g\('Typora'\)/.test(benchCode),
      'run-benchmark 的 results 查询 helper 必须以大写字面量调用（小写会静默返回 undefined）');
    // canary：自检大小写锁
    const KEY_SAMPLE = "results.find((x) => x.app === '" + 'mellow' + "')";
    if (!/x\.app === '(mellow|typora)'/.test(KEY_SAMPLE)) {
      errors.push('app 键名大小写护栏 canary 失效：小写样本未被检出');
    }
  }

  // ── typing 指标必须声明「分辨率限制」（2026-09-29）────────────────────
  // 立此条的原因：typing 的判据是**屏幕捕获的首帧变化**，采样率由 SCK 帧率决定
  // （实测 detectFrames=459 / 8000ms → ≈57fps → 单帧 ≈17.4ms）。
  // 而 PRD §110 对普通文档的目标是「P95 update < **16ms**」—— **低于量具分辨率**。
  // 若不声明，一个 100ms 的观测会被读成「未达标 6 倍」，而实际它主要反映
  // 「合成事件 → 渲染 → 捕获」的管线延迟，与编辑器更新耗时不是一回事。
  // 故：目标低于分辨率时**不得**给出 ✅/❌，只能标「不可判定」。
  assert(/SCK_FRAME_MS/.test(benchCode),
    'run-benchmark 必须显式声明 SCK 单帧耗时（typing 的量具分辨率）');
  assert(/分辨率限制/.test(benchCode),
    'typing 报告段必须声明分辨率限制：PRD 的 16ms 目标低于量具分辨率');
  assert(/不可判定（低于分辨率）/.test(benchCode),
    '目标低于量具分辨率时必须输出「不可判定（低于分辨率）」，不得用 ✅/❌ 冒充结论');
  assert(/const belowResolution\s*=/.test(benchCode),
    'run-benchmark 必须实际计算 belowResolution 并在判定中使用');
  {
    // canary：自检分辨率判定逻辑
    const RES_SAMPLE = { targetMs: 16, frameMs: 1000 / 57.4 };
    if (!(RES_SAMPLE.targetMs < RES_SAMPLE.frameMs)) {
      errors.push('typing 分辨率护栏 canary 失效：16ms 样本未被判为低于分辨率');
    }
  }

  // ── 菜单护栏的输出不得谎称「读了本机 Typora」（2026-09-30）──────────────
  // 立此条的原因：`verify-menu-contract.mjs` **不读**本机 Typora（无 existsSync / Typora.app），
  // 它比对的是**内嵌**的 `TYPORA_MENU_LABELS`（CI runner 上不装 Typora）。
  // 但其输出原写「read from the local install」→ 读者会以为每次运行都对着真 Typora 校验过，
  // 而 §12 注释自己就警告过这种「自己给自己盖章，永远绿」。
  // 真值反查靠**人工、非 CI** 的 `tests/parity/tools/audit-typora-menu-labels.mjs`。
  const menuContractPath = resolve(root, 'tests/parity/verify-menu-contract.mjs');
  assert(existsSync(menuContractPath), 'verify-menu-contract.mjs 不存在');
  if (existsSync(menuContractPath)) {
    // ⚠️ 必须**先 stripComments**：本护栏的否定断言（不得含旧措辞）会命中
    // verify-menu-contract.mjs 里**说明该措辞为何被改**的注释 —— 实测首跑即踩。
    // 这正是本文件另一处已有教训（静态契约断言先 stripComments）的同一形态。
    const mcSrc = readFileSync(menuContractPath, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    assert(/compared against EMBEDDED official values/.test(mcSrc),
      '菜单护栏必须如实说明「比对的是内嵌官方值」，而不是让读者以为对着真 Typora 校验过');
    assert(!/read from the local install/.test(mcSrc),
      '菜单护栏不得再声称「read from the local install」（它并不读本机 Typora）');
    assert(/audit-typora-menu-labels\.mjs/.test(mcSrc),
      '菜单护栏必须指明真值反查工具（audit-typora-menu-labels.mjs，需本机 Typora、不进 CI）');
  }

  // ── 发布门禁必须声明「闭环口径」（2026-09-25）──────────────────────────
  // 立此节的原因：`verify-release-gate` 把 `AUTO` 视为**不阻断**，而 master-plan §4.3
  // 定义 `AUTO` = 「自动化测试通过、**真机体验验收未完成**」，§8 的 V1.0 Exit Gate 又要求
  // 「三平台全 PASS-E」。只输出「6 项未闭环」会被读成「只有 6 项没做完」——
  // 实测 PASS-E 为 **0/50**，且有 4 项标 AUTO 却要求 ux-gate。
  // §5.7 更记录过一次教训：`P0-SHELL-003` 的 AUTO 曾把一个**完全不可用**的功能
  // （浮动工具栏永不显示）当作已闭环。故口径必须出现在门禁输出里，且不得被删。
  const gatePath = resolve(root, 'tests/parity/verify-release-gate.mjs');
  assert(existsSync(gatePath), 'verify-release-gate.mjs 不存在');
  if (existsSync(gatePath)) {
    const gateSrc = readFileSync(gatePath, 'utf8').replace(/\r\n/g, '\n');
    assert(/Closure basis/.test(gateSrc),
      'release gate 必须显式声明「不阻断口径」（PASS-E/PASS-B/AUTO）：否则「N 项未闭环」会被误读成「只有 N 项没做完」');
    assert(/实际 PASS-E = \$\{passECount\}\/\$\{totalItems\}/.test(gateSrc),
      'release gate 必须报出 PASS-E 实际数量与总项数（AUTO 不等于 PASS-E）');
    assert(/标 AUTO 且 requiredEvidence 含 ux-gate/.test(gateSrc),
      'release gate 必须暴露「标 AUTO 却要求 ux-gate」的项（ADR-0024 A3 下它们已计入未闭环）');
    // ADR-0024 Q1=A3（Accepted 2026-09-30）：规则本身必须可核对 ——
    // 断言门禁**实现了**「AUTO 且 requiredEvidence 不含 ux-gate 才算不阻断」，
    // 而不是只在输出里打印一句警示（警示可以被忽略，结构规则不能）。
    // ⚠️ 括号必须转义：`/includes('ux-gate')/` 里的 `( )` 会被当成**捕获组**，
    // 于是实际匹配的是 `includes'ux-gate'`（无括号）→ 恒不命中（本轮实测踩到）。
    assert(/closedViaAuto/.test(gateSrc) && /includes\('ux-gate'\)/.test(gateSrc),
      'release gate 必须实现 ADR-0024 A3：含 ux-gate 的 AUTO 项不得以 AUTO 收口');
    assert(/Closure basis: 本门禁的「不阻断」口径 = PASS-E \/ PASS-B \/ AUTO（\*\*且 requiredEvidence 不含 ux-gate\*\*）/.test(gateSrc),
      'release gate 的 Closure basis 必须写明 A3 收紧后的口径（口径不得与实现脱节）');
    assert(/不要把 AUTO 读作/.test(gateSrc),
      'release gate 必须保留 §5.7 的警示（AUTO 曾把一个完全不可用的功能当作已闭环）');
    // canary：自检这几条字符串锁
    const GATE_SAMPLE = 'Closure basis: ' + '实际 PASS-E = ${passECount}/${totalItems}';
    if (!/Closure basis/.test(GATE_SAMPLE) || !/实际 PASS-E = \$\{passECount\}\/\$\{totalItems\}/.test(GATE_SAMPLE)) {
      errors.push('闭环口径护栏 canary 失效：样本未被检出');
    }
  }

  // ── release.yml 的 job 名不得宣称无法保证的属性（2026-09-30）──────────
  // 立此条的原因：macOS job 原名 `macOS (Signed + Notarized + DMG)`，但 Apple 凭据缺失时
  // 其签名配置步骤只 `echo "…产出未签名 DMG"` 然后**继续** → job 仍 success。
  // 即**名称宣称了它无法保证的属性**，而 ADR-0020 §2 要求 V1.0 必须「macOS 签名公证」。
  // 不变量：**要么保证签名（凭据缺失即硬失败），要么名称不宣称签名**。
  {
    const relPath = resolve(root, '.github/workflows/release.yml');
    assert(existsSync(relPath), 'release.yml 不存在');
    if (existsSync(relPath)) {
      const rel = readFileSync(relPath, 'utf8').replace(/\r\n/g, '\n');
      const macJob = (rel.match(/\n  macos:\n[\s\S]*?(?=\n  \w+:\n|\n\n  \w+)/) ?? [])[0] ?? rel;
      const jobName = (macJob.match(/\n    name: (.+)/) ?? [])[1] ?? '';
      const claimsSigning = /Signed/i.test(jobName);
      // 凭据缺失分支是否硬失败（`exit 1` 或 `set -e` 下必然失败）
      const hasHardFail = /凭据未配置[\s\S]{0,120}?exit 1/.test(macJob) || /未配置[\s\S]{0,80}?exit 1/.test(macJob);
      if (claimsSigning && !hasHardFail) {
        fail('release.yml 的 macOS job 名宣称「Signed」，但 Apple 凭据缺失时只 echo 一句就继续'
          + '（job 仍 success）→ 名称在骗人。要么把凭据缺失改为硬失败，要么名称不宣称签名。');
      }
      // canary：自检该判定（样本拼接构造）
      const CLAIM_SAMPLE = 'macOS (Signed + Notarized' + ' + DMG)';
      if (!/Signed/i.test(CLAIM_SAMPLE)) {
        errors.push('job 名宣称护栏 canary 失效：宣称样本未被检出');
      }
    }
  }

  // ── CSP 是 M1 修复，必须保持存在（2026-09-30）──────────────────────────
  // 立此条的原因：`v1.0-final-release-review-2026-08-16.md` 把 **Security M1（CSP 缺失，
  // `csp: null`）** 列为**发布阻断级**缺陷，其后已修复（`tauri.conf.json` 现配有完整 CSP）。
  // 但**没有任何东西守着它** —— CSP 被清空/删掉不会有任何信号，而这曾是 blocker。
  // 本护栏只锁「修复的核心不变量」：CSP 必须存在、必须含 `default-src 'self'` 与
  // `object-src 'none'`。**不锁 `unsafe-inline`/`unsafe-eval`** —— PRD §48 的
  // 「no script / no inline events」针对**渲染出的 HTML**（sanitize 路径），
  // 不构成对 app shell CSP 的要求，故不在此发明更严的约束（那会误伤且非宪法要求）。
  {
    const confPath = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json');
    assert(existsSync(confPath), 'tauri.conf.json 不存在');
    if (existsSync(confPath)) {
      const conf = readFileSync(confPath, 'utf8').replace(/\r\n/g, '\n');
      const csp = (conf.match(/"csp"\s*:\s*"([^"]*)"/) ?? [])[1];
      assert(csp !== undefined && csp !== null && csp.trim() !== '' && csp !== 'null',
        'Security M1 回归：tauri.conf.json 的 csp 必须存在且非空（曾是发布阻断级缺陷）');
      if (typeof csp === 'string' && csp !== '') {
        assert(/default-src 'self'/.test(csp), "CSP 必须含 `default-src 'self'`（M1 修复的核心不变量）");
        assert(/object-src 'none'/.test(csp), "CSP 必须含 `object-src 'none'`（M1 修复的核心不变量）");
      }
      // canary：自检这两条核心不变量锁（样本拼接构造）
      const CSP_SAMPLE = "default-src 'self'; object-src '" + "none'";
      if (!/default-src 'self'/.test(CSP_SAMPLE) || !/object-src 'none'/.test(CSP_SAMPLE)) {
        errors.push('CSP 护栏 canary 失效：核心不变量样本未被检出');
      }
    }
  }

  // ── PRD §48（HTML 安全策略）：宪法侧 + 三处净化器的安全不变量（2026-10-06，审计 §4.81）──
  // 立此条的原因：上面那条 CSP 护栏**只在注释里引用 §48**（「§48 的 no script / no inline events
  // 针对渲染出的 HTML」）—— 即 §48 的 8 条要求**从未被读**（同 §4.79/§4.80 的「引用宪法 ≠ 读宪法」）。
  // 而 §48 是**安全条款**，实现散在**三处**（编辑器 / Reader / 导出），
  // 且紧邻的「两处净化器必须一致」那条**只比对彼此** ——
  // 若两处**同时**删掉 `on*` 剥离，一致性判据仍然成立 ⇒ 行内事件处理器会执行，**没有任何信号**。
  // 本块只锁 §48 **明文列出**且可机械判定的不变量（不发明更严的约束）：
  //   no script（白名单不含 SCRIPT）/ no inline events（`on*` 剥离）/
  //   no JavaScript URL（协议是 allow-list 且不含 `javascript`）/ iframe sandbox（强制置空）。
  {
    const readDoc = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
    const strip = (s) => s
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

    // ⚠️ 判据必须是**同一个谓词对象**（断言与 canary 共用），否则「放宽谓词」抓不到：
    // 若 canary 里另写一份正则，改掉断言那份时 canary 仍用旧的那份 → 双向自检形同虚设。
    const protoOk = (list) => [...list].sort().join(',') === 'http:,https:,mailto:';
    const onKeysOf = (block) => [...block.matchAll(/^\s*([a-zA-Z*][\w*-]*)\s*:/gm)]
      .map((m) => m[1]).filter((k) => k.startsWith('on'));

    // ① 宪法侧：§48 的 8 条要求必须仍在原文里
    //    每条带一个「该条在原文里的字面行」，用于逐条**双向** canary（见下）。
    const ITEMS48 = [
      [/common inline tags/, 'common inline tags', 'common inline tags；'],
      [/block tags/, 'block tags', 'block tags；'],
      [/^\s*-\s*video[;；]/m, 'video', 'video；'],
      [/^\s*-\s*audio[;；]/m, 'audio', 'audio；'],
      [/iframe sandbox/, 'iframe sandbox', 'iframe sandbox；'],
      [/no script/, 'no script', 'no script；'],
      [/no inline events/, 'no inline events', 'no inline events；'],
      [/no JavaScript URL/i, 'no JavaScript URL', 'no JavaScript URL。'],
    ];
    const prd48 = readDoc('docs/product/Mellow-PRD-V1.2-FINAL.md');
    const at48 = prd48.indexOf('# 48. HTML');
    assert(at48 >= 0, 'PRD 缺少 §48 HTML（HTML 安全策略的宪法依据）');
    if (at48 >= 0) {
      const nextH1 = prd48.indexOf('\n# ', at48 + 1);
      const sec48 = prd48.slice(at48, nextH1 < 0 ? prd48.length : nextH1);
      const missing = ITEMS48.filter(([re]) => !re.test(sec48)).map(([, l]) => l);
      assert(missing.length === 0,
        `PRD §48 原文里找不到这些安全要求：${missing.join(' / ')} —— §48 是宪法级安全策略，`
        + '删条目必须同步三处净化器与本护栏');
    }
    // canary：逐条**双向**自检 —— 正向（完整样本里该条必须命中）+ 负向（删掉该条后该条必须不命中）。
    // ⚠️ 只做「整体正向样本」抓不到「单条谓词被放宽」（把 /no script/ 改成 /./ 时正向仍通过）。
    // ⚠️ 负向样本用 `replace('- ' + line, '')`（**不带尾随换行**）—— 首条/末条没有「前后换行」，
    //    带 `\n` 的替换对末条会**静默不生效**，于是正常态也被判成「谓词过宽」（2026-10-06 实测踩过）。
    const S48_FULL = ITEMS48.map(([, , line]) => `- ${line}`).join('\n');
    for (const [re, label, line] of ITEMS48) {
      if (!re.test(S48_FULL)) {
        errors.push(`§48 条目护栏 canary 失效：「${label}」谓词过窄 —— 完整样本里未被识别`);
      }
      if (re.test(S48_FULL.replace(`- ${line}`, ''))) {
        errors.push(`§48 条目护栏 canary 失效：「${label}」谓词过宽 —— 删掉该条后仍被识别`);
      }
    }

    // ② 实现侧（DOM 净化器，白名单是 `Set`）
    const DOM_SANITIZERS = [
      ['编辑器', 'packages/editor-engine/src/safeHtml.ts', 'ALLOWED_TAGS'],
      ['Reader', 'packages/app-core/src/reader.ts', 'SANITIZE_ALLOWED_TAGS'],
    ];
    for (const [label, path, tagsConst] of DOM_SANITIZERS) {
      assert(existsSync(resolve(root, path)), `${label}净化器不存在：${path}`);
      if (!existsSync(resolve(root, path))) continue;
      const code = strip(readDoc(path));
      // no script：白名单是 allow-list，且不含 SCRIPT
      const tags = (code.match(new RegExp(`const ${tagsConst} = new Set\\(\\[([^\\]]*)\\]\\)`)) ?? [])[1];
      assert(tags !== undefined, `${label}净化器：无法解析 ${tagsConst}（护栏需同步更新，不要静默漏检）`);
      if (tags !== undefined) {
        assert(!/'SCRIPT'/.test(tags), `${label}净化器：白名单含 SCRIPT（违反 PRD §48「no script」）`);
      }
      // no inline events
      assert(/name\.startsWith\('on'\)/.test(code),
        `${label}净化器：必须剥离 on* 事件属性（PRD §48「no inline events」）—— 缺失时行内处理器会执行`);
      // no JavaScript URL：协议是 allow-list，且不含 javascript
      const protos = new Set([...code.matchAll(/url\.protocol === '([a-z]+:)'/g)].map((m) => m[1]));
      assert(protos.size > 0, `${label}净化器：无法解析 URL 协议白名单（护栏需同步更新）`);
      assert(protoOk(protos),
        `${label}净化器的 URL 协议白名单应为 http:/https:/mailto:（PRD §48「no JavaScript URL」），`
        + `实测 [${[...protos].join(', ')}]`);
      // iframe sandbox
      assert(/element\.setAttribute\('sandbox', ''\)/.test(code),
        `${label}净化器：IFRAME 必须强制 sandbox（PRD §48「iframe sandbox」）`);
    }

    // ③ 实现侧（导出净化器走 sanitize-html 配置：白名单是数组而非 Set）
    {
      const path = 'packages/export/src/html/sanitize.ts';
      assert(existsSync(resolve(root, path)), `导出净化器不存在：${path}`);
      if (existsSync(resolve(root, path))) {
        const src = readDoc(path);
        const allowedTags = (src.match(/const ALLOWED_TAGS = \[([\s\S]*?)\];/) ?? [])[1];
        assert(allowedTags !== undefined, '导出净化器：无法解析 ALLOWED_TAGS（护栏需同步更新，不要静默漏检）');
        if (allowedTags !== undefined) {
          assert(!/'script'/.test(allowedTags), '导出净化器：白名单含 script（违反 PRD §48「no script」）');
        }
        const schemes = (src.match(/const ALLOWED_SCHEMES = \[([^\]]*)\]/) ?? [])[1];
        assert(schemes !== undefined && schemes.trim() !== '',
          '导出净化器：无法解析 ALLOWED_SCHEMES（护栏需同步更新，不要静默漏检）');
        if (schemes !== undefined) {
          assert(!/'javascript'/.test(schemes),
            `导出净化器的 ALLOWED_SCHEMES 不得含 javascript（PRD §48「no JavaScript URL」），实测 [${schemes.trim()}]`);
        }
        // no inline events：sanitize-html 只放行 ALLOWED_ATTRS 里的属性 ⇒ 事件属性天然被丢弃，
        // 故锁「属性白名单里不存在 on* 键」这条等价不变量。
        const attrBlock = (src.match(/const ALLOWED_ATTRS[\s\S]*?\n\};/) ?? [])[0];
        assert(attrBlock !== undefined, '导出净化器：无法解析 ALLOWED_ATTRS（护栏需同步更新）');
        if (attrBlock !== undefined) {
          const onKeys = onKeysOf(attrBlock);
          assert(onKeys.length === 0,
            `导出净化器的属性白名单含事件属性 [${onKeys.join(', ')}]（违反 PRD §48「no inline events」）`);
        }
        // iframe sandbox：导出侧靠 transformTags 强制
        assert(/attribs\.sandbox = 'sandbox'/.test(src),
          '导出净化器：IFRAME 必须强制 sandbox（PRD §48「iframe sandbox」）');
      }
    }

    // canary：自检「协议 allow-list」与「on* 键」两条谓词有效（样本拼接构造，避免护栏检出自己）
    if (!protoOk(['mailto:', 'http:', 'https:'])) {
      errors.push('§48 协议 allow-list 护栏 canary 失效：合法样本未被识别');
    }
    if (protoOk(['http:', 'https:', 'mailto:', 'javascript:'])) {
      errors.push('§48 协议 allow-list 护栏 canary 失效：含 javascript 的样本竟被判为合法');
    }
    if (onKeysOf('*: [class]\nonclick: [x]').length === 0) {
      errors.push('§48 on* 属性护栏 canary 失效：onclick 样本未被识别');
    }
    if (onKeysOf('*: [class]\nhref: [x]').length !== 0) {
      errors.push('§48 on* 属性护栏 canary 失效：非事件键样本被误判');
    }
  }

  // ── 标题锚点规则：导出那份自称「与 editor-engine 一致」，必须真的**行为一致**（2026-10-06，审计 §4.87）──
  // 立此条的原因：`packages/export/src/html/markdown.ts` 的 `slugifyHeading` 注释写着
  // 「保留字母/数字/中日韩/Emoji，其余转连字符（**与 editor-engine 一致**）」——
  // 而「自称与 X 一致」正是本审计反复抓到的失效形态（§4.79–§4.85）。
  // 实测（抽函数体后原样求值，12 个样本）：**engine 与 export 行为完全一致** ⇒ 声明**成立**。
  // ⇒ 本判据把这条声明**锁成不变量**（防它将来漂散），**不**去统一第三份
  //（统一会改掉 Reader 的 heading id —— 那是一次行为变更，见 §4.86 的教训）。
  //
  // ⚠️ **判据用「行为比对」而不是「逐字比对」**：两份函数的排版不同
  //（一份 `return title\n .trim()…`，另一份 `return (\n title\n .trim()… )`），
  // 逐字比会**误报**；而真正要守的是「同一输入 → 同一锚点」。
  //
  // ⚠️ 与 `app-core/reader.ts` 的差异**已如实登记**（审计 §4.87，待裁决）：
  //   `a_b` → engine/export `a-b` vs Reader `ab`；`日本_語` → `日本-語` vs `日本語`；
  //   `What's new?` → `what-s-new` vs `whats-new`；`Hello 世界 😀` → `hello-世界-😀` vs `hello-世界`；
  //   `!!!` / `---` → engine/export `heading` vs Reader `section` / **`-`**
  //（Reader 产出 `id="-"` 是**退化锚点**，且不同标题会撞成同一 id —— 已登记，本轮未擅自改。）
  {
    /** 抽取 `export function <name>(title: string): string { … }` 并求值成真函数 */
    const buildSlugFn = (file, name) => {
      const abs = resolve(root, file);
      if (!existsSync(abs)) return null;
      const src = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
      const at = src.indexOf(`export function ${name}(`);
      if (at < 0) return null;
      const braceAt = src.indexOf('{', at);
      if (braceAt < 0) return null;
      let depth = 0;
      let endAt = braceAt;
      for (; endAt < src.length; endAt += 1) {
        if (src[endAt] === '{') depth += 1;
        else if (src[endAt] === '}') { depth -= 1; if (depth === 0) { endAt += 1; break; } }
      }
      const js = src.slice(at, endAt)
        .replace(new RegExp(`^export function ${name}\\([^)]*\\)(?:\\s*:\\s*[^{]+)?\\{`), `function ${name}(title) {`);
      try {
        // eslint-disable-next-line no-new-func
        return new Function(`return (${js});`)();
      } catch {
        return null;
      }
    };
    const fnEngine = buildSlugFn('packages/editor-engine/src/toc.ts', 'slugifyHeading');
    const fnExport = buildSlugFn('packages/export/src/html/markdown.ts', 'slugifyHeading');
    assert(typeof fnEngine === 'function' && typeof fnExport === 'function',
      '无法解析两处 `slugifyHeading` 为可调用函数（护栏需同步更新，不要静默漏检）');
    if (typeof fnEngine === 'function' && typeof fnExport === 'function') {
      // 语料覆盖：中日韩 / Emoji / 下划线 / 标点 / 纯符号 / 空白 / 连字符 / 大小写 / 空串
      const SLUG_CASES = [
        'Hello 世界 😀', 'a_b', "What's new?", 'C++ 入门', '中文标题', '  Trim Me  ', '!!!', '---',
        'A  B', 'x--y', 'Ünïcode', '日本_語', '', '   ', 'a-b', 'a--b', 'a.b', 'A/B', '#hash', 'tag_1',
      ];
      let compared = 0;
      const mismatched = [];
      for (const c of SLUG_CASES) {
        compared += 1;
        const a = fnEngine(c);
        const b = fnExport(c);
        if (a !== b) mismatched.push(`${JSON.stringify(c)}: engine ${JSON.stringify(a)} vs export ${JSON.stringify(b)}`);
      }
      assert(mismatched.length === 0,
        `导出与引擎的 \`slugifyHeading\` **行为不一致**（${mismatched.length}/${compared} 个样本）：`
        + `${mismatched.slice(0, 3).join('；')} —— \`export/html/markdown.ts\` 自称「与 editor-engine 一致」，`
        + '不一致会让**同一标题在编辑器 TOC 与导出 HTML 里得到不同锚点**（点 TOC 跳不到该标题）');
      if (compared < 20) {
        errors.push(`slugifyHeading 行为比对只跑了 ${compared} 个样本（下限 20）—— 语料被删会让本判据空转`);
      }
      // canary：把 export 的连字符规则改掉，**必须**在语料上产生差异（否则比对是恒真的）
      const drifted = ((c) => fnExport(c) + '-drift');
      const driftDetected = SLUG_CASES.some((c) => fnEngine(c) !== drifted(c));
      if (!driftDetected) {
        errors.push('slugifyHeading 行为比对 canary 失效：注入漂移后仍判定一致');
      }
    }
  }

  // ── 两处 HTML 净化器必须一致（2026-09-30）────────────────────────────────
  // 立此条的原因：`docs/security/security-review-2026-08-13.md` H1 的建议原文是
  // 「提取 `editor-engine/src/safeHtml.ts` 的 sanitize 为共享实现，**或复制同一逻辑**」——
  // 修复走了「复制」路线，于是**两处净化器各自维护**（该文件当时警告的正是这个不一致）。
  // 而**没有任何东西守着「两处一致」**：任一侧的白名单被改动都不会有信号，
  // 表现是「同一段原始 HTML 在编辑器里保留、在 Reader 里被剥掉」（或反之）——屏幕上看不出原因。
  // 本护栏只锁**可机械比对的三件事**：标签白名单集合、URL 协议白名单、IFRAME 强制 sandbox。
  {
    const readSrc = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
    const appCore = readSrc('packages/app-core/src/reader.ts');
    const engine = readSrc('packages/editor-engine/src/safeHtml.ts');

    const tagsOf = (src, name) => {
      const body = (src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`)) ?? [])[1];
      if (body === undefined) return null;
      return new Set([...body.matchAll(/'([A-Z0-9]+)'/g)].map((m) => m[1]));
    };
    const tagsA = tagsOf(appCore, 'SANITIZE_ALLOWED_TAGS');
    const tagsB = tagsOf(engine, 'ALLOWED_TAGS');
    assert(tagsA !== null && tagsB !== null, '无法解析两处净化器的标签白名单（护栏需同步更新，不要静默漏检）');
    if (tagsA !== null && tagsB !== null) {
      const onlyAppCore = [...tagsA].filter((t) => !tagsB.has(t)).sort();
      const onlyEngine = [...tagsB].filter((t) => !tagsA.has(t)).sort();
      assert(onlyAppCore.length === 0 && onlyEngine.length === 0,
        `两处 HTML 净化器的标签白名单不一致：仅 app-core 有 [${onlyAppCore}]，仅 engine 有 [${onlyEngine}]`
        + ' —— 同一段原始 HTML 会在两处得到不同结果（security-review H1 警告的正是这个分叉）');
      // canary：删掉一个标签必须被检出
      const drift = new Set(tagsB);
      drift.delete([...drift][0]);
      const driftOnly = [...drift].filter((t) => !tagsA.has(t));
      if (driftOnly.length === 0 && drift.size === tagsB.size) {
        errors.push('净化器一致性 canary 失效：样本未被改动');
      }
    }

    const protocolsOf = (src) => new Set([...src.matchAll(/url\.protocol === '([a-z]+:)'/g)].map((m) => m[1]));
    const protoA = protocolsOf(appCore);
    const protoB = protocolsOf(engine);
    assert(protoA.size > 0 && protoB.size > 0, '无法解析两处净化器的 URL 协议白名单（护栏需同步更新）');
    assert([...protoA].sort().join(',') === [...protoB].sort().join(','),
      `两处 HTML 净化器的 URL 协议白名单不一致：app-core [${[...protoA]}] vs engine [${[...protoB]}]`);

    for (const [label, src] of [['app-core', appCore], ['engine', engine]]) {
      assert(/element\.tagName === 'IFRAME'\) element\.setAttribute\('sandbox', ''\)/.test(src),
        `${label} 的净化器必须强制 IFRAME sandbox（两处都要，缺一处即分叉）`);
    }

    // ── 第三处净化器（导出）自称「与编辑器白名单对齐」，此前**无人核对**（2026-10-06，审计 §4.83）──
    // 立此条的原因：`packages/export/src/html/sanitize.ts` 文件头写「与编辑器 safeHtml 白名单对齐，
    // PRD §48」，但上面那条「两处一致」**只比对编辑器与 Reader** —— 导出那处**不在扫描面里**
    // （它的白名单是 `sanitize-html` 配置数组，形态不同）。
    // 实测**当时就已漂移**：编辑器的 41 个标签里 **`kbd` 不在导出白名单里**
    // ⇒ `<kbd>` 在编辑器/Reader 渲染成按键样式，导出时被 `disallowedTagsMode: 'discard'` 剥成纯文本
    //（`discard` 的语义是**去标签保文本**，已实测确认）—— 屏幕上看不出原因。
    // 本判据锁**集合关系**（不是相等）：编辑器/Reader 的白名单必须是导出白名单的**子集**
    //（导出有意多放行 TOC/footnote/task list/KaTeX 等自身产物）。
    {
      const exportSrc = readSrc('packages/export/src/html/sanitize.ts');
      const exportBody = (exportSrc.match(/const ALLOWED_TAGS = \[([\s\S]*?)\];/) ?? [])[1];
      const exportTags = exportBody === undefined ? null
        : new Set([...exportBody.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1].toUpperCase()));
      assert(exportTags !== null, '无法解析导出净化器的 ALLOWED_TAGS（护栏需同步更新，不要静默漏检）');
      // ⚠️ 判据是**同一个函数对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
      const missingInExport = (editorTags, exTags) => [...editorTags].filter((t) => !exTags.has(t)).sort();
      if (exportTags !== null && tagsA !== null && tagsB !== null) {
        for (const [label, tags] of [['app-core', tagsA], ['engine', tagsB]]) {
          const missing = missingInExport(tags, exportTags);
          assert(missing.length === 0,
            `导出净化器的 ALLOWED_TAGS 缺少 ${label} 白名单里的 [${missing.join(', ')}] —— `
            + '同一段原始 HTML 在编辑器/Reader 里保留、在导出里被剥掉（`discard` = 去标签保文本）');
        }
        // canary：三向 —— ①子集样本必须通过 ②缺一个标签必须被抓到 ③**放宽谓词**必须被抓到
        const SUPERSET = new Set(['A', 'IMG', 'KBD']);
        const SUBSET = new Set(['A', 'IMG']);
        if (missingInExport(SUBSET, SUPERSET).length !== 0) {
          errors.push('导出净化器对齐护栏 canary 失效：合法子集样本被误判为缺失');
        }
        if (missingInExport(new Set(['A', 'KBD']), SUBSET).join(',') !== 'KBD') {
          errors.push('导出净化器对齐护栏 canary 失效：缺失的 KBD 未被识别');
        }
        if (missingInExport(new Set(['A', 'KBD']), new Set()).length === 0) {
          errors.push('导出净化器对齐护栏 canary 失效：空白名单样本竟被判为无缺失');
        }
      }
    }
  }

  // ── 行内 / 块级代码的「代码属性」必须一致（2026-10-01）────────────────────
  // 立此条的原因：spec §11 要求行内代码 **no autocorrect / spellcheck**；块级代码的等价物在
  // `CoreEditor/src/styling/nodes/code.ts` 的 `codeBlockStyle`，行内代码的等价物在
  // `editor-engine/src/inlineCodeAttrs.ts`（放引擎侧是为了不被 re-vendor 覆盖，见 UPSTREAM.md）。
  // 两处表达的是**同一件事**（「这段不是自然语言，别做拼写/自动更正」），分叉会让维护者
  // 不知道该改哪一处；而表现是「围栏内不画红波浪线、行内代码内画」——屏幕上看不出原因。
  {
    const readSrc = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
    /** 从对象字面量里取 `'key': 'value'` 对（排序后返回，便于比对） */
    const pairsOf = (src, anchor) => {
      const m = anchor.exec(src);
      if (m === null) return null;
      return [...m[1].matchAll(/'([a-zA-Z]+)':\s*'([a-z]+)'/g)]
        .map((x) => `${x[1]}=${x[2]}`)
        .sort();
    };
    const blockPairs = pairsOf(
      readSrc('packages/editor-core/CoreEditor/src/styling/nodes/code.ts'),
      /cm-md-codeBlockWrapper',\s*\{([^}]*)\}/,
    );
    const inlinePairs = pairsOf(
      readSrc('packages/editor-engine/src/inlineCodeAttrs.ts'),
      /INLINE_CODE_ATTRIBUTES[^=]*=\s*\{([^}]*)\}/,
    );
    assert(blockPairs !== null && inlinePairs !== null,
      '无法解析行内/块级代码属性（护栏需同步更新，不要静默漏检）');
    if (blockPairs !== null && inlinePairs !== null) {
      assert(blockPairs.length >= 4,
        `块级代码属性数量异常（${blockPairs.length}）：至少应含 spellcheck / autocorrect / autocomplete / autocapitalize`);
      assert(blockPairs.join(',') === inlinePairs.join(','),
        `行内 / 块级代码属性不一致：块级 [${blockPairs}] vs 行内 [${inlinePairs}]`
        + ' —— 同一意图的两处实现分叉（spec §11：行内代码不得被拼写检查/自动更正）');
      // canary：从行内样本删掉一项必须被检出
      const drift = inlinePairs.slice(1);
      if (drift.join(',') === blockPairs.join(',')) {
        errors.push('代码属性一致性 canary 失效：样本未被改动');
      }
    }
  }

  // ── widget 的「caret 是否在节点内」边界语义必须**按家族**保持（2026-10-06，审计 §4.86）──
  // 背景：同一件事（caret 是否落在节点内 ⇒ 是否显示源码）在本包里有**两种有意不同**的边界语义：
  //   含边界（`>= && <=`）：inlineExtras / kbdCaps / mdLink / wikilink —— caret 紧贴定界符 ⇒ **显示源码**
  //   严格内（`> && <`）  ：math / mermaid / toc / githubAlerts / footnote —— caret 紧贴定界符 ⇒ **不显示**
  // 该约定**已文档化**（`packages/editor-engine/test/widget-state-matrix.test.ts` 的 `boundaryReveals`
  // 字段 + 各家族 caret 语义注释）**且有测试**。但**没有任何东西阻止有人把某一处改成另一种**。
  //
  // ⚠️ 立此条的直接起因：审计 §4.86 本来打算把 math/mermaid 的 `caretInside` 与
  // mdLink/wikilink 的手写判断**合并成单一 helper**（「看起来是重复代码」）——
  // **回查后确认那是两种语义**，合并会**静默改掉 math/mermaid 的边界行为**。
  // ⇒ 故本判据锁「每个文件用**哪一种**」，而**不是**锁「只有一种」。
  // ⚠️ 也**不**断言「一个文件只能有一种形态」：`githubAlerts` / `footnote` 同时含
  // 「`ranges.some` 跳过检查（含边界）」与「`inside` reveal 判定（严格内）」两件事，
  // 断言互斥会误伤。
  {
    const REVEAL_INCLUSIVE = /(?:head|pos)\s*>=\s*[\w.]*from\s*&&\s*(?:head|pos)\s*<=\s*[\w.]*to/;
    const REVEAL_STRICT = /(?:head|pos)\s*>\s*[\w.]*from\s*&&\s*(?:head|pos)\s*<\s*[\w.]*to/;
    const CARET_FAMILY = [
      ['packages/editor-engine/src/inlineExtras.ts', 'inclusive', 'highlight / sup / sub 定界符'],
      ['packages/editor-engine/src/kbdCaps.ts', 'inclusive', 'kbd 标签'],
      ['packages/editor-engine/src/mdLink.ts', 'inclusive', 'Markdown 文件链接定界符'],
      ['packages/editor-engine/src/wikilink.ts', 'inclusive', 'wikilink 定界符'],
      ['packages/editor-engine/src/math.ts', 'strict', 'Math（block / inline）'],
      ['packages/editor-engine/src/mermaid.ts', 'strict', 'Mermaid'],
      ['packages/editor-engine/src/toc.ts', 'strict', 'TOC'],
      ['packages/editor-engine/src/githubAlerts.ts', 'strict', 'GitHub Alerts'],
      ['packages/editor-engine/src/footnote.ts', 'strict', 'Footnote'],
    ];
    let checked = 0;
    for (const [file, expected, label] of CARET_FAMILY) {
      const abs = resolve(root, file);
      assert(existsSync(abs), `caret 边界家族文件不存在：${file}`);
      if (!existsSync(abs)) continue;
      const src = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
      const hasInclusive = REVEAL_INCLUSIVE.test(src);
      const hasStrict = REVEAL_STRICT.test(src);
      checked += 1;
      if (!hasInclusive && !hasStrict) {
        fail(`${file} 找不到「caret 是否在节点内」谓词（${label}）—— 护栏需同步更新，不要静默漏检`);
      } else if (expected === 'inclusive' && !hasInclusive) {
        fail(`${file}（${label}）的 caret 边界语义应为**含边界**（\`head >= X.from && head <= X.to\`）—— `
          + '改为「严格内」会让 caret 紧贴定界符时**不再显示源码**（与同族其它元素不一致）');
      } else if (expected === 'strict' && !hasStrict) {
        fail(`${file}（${label}）的 caret 边界语义应为**严格内**（\`head > X.from && head < X.to\`）—— `
          + '改为「含边界」会让 caret 紧贴定界符时**改为显示源码**（与同族其它元素不一致）');
      }
    }
    // [覆盖型] 基线 9 —— 家族成员不得被删空（防空转）；阈值必须 == 当前值（skill §2）
    if (checked < 9) {
      fail(`caret 边界家族只解析到 ${checked} 个文件（下限 9 = 2026-10-09 实测基线）—— 判据可能已空转`);
    }
    // 与「文档化来源」挂钩：测试矩阵必须仍声明 boundaryReveals（否则约定失去成文依据）
    const matrixPath = resolve(root, 'packages/editor-engine/test/widget-state-matrix.test.ts');
    assert(existsSync(matrixPath), '缺少 widget-state-matrix.test.ts（caret 边界约定的文档化来源）');
    if (existsSync(matrixPath)) {
      const matrix = readFileSync(matrixPath, 'utf8').replace(/\r\n/g, '\n');
      // ⚠️ 不能只断「出现过 `boundaryReveals`」—— 那是 §26 的「出现过 ≠ 有人用」，
      // 只声明字段却不再读它（或反之）都会被判为通过。**声明与使用必须分别断言**。
      assert(/boundaryReveals\s*:/.test(matrix),
        'widget-state-matrix.test.ts 必须仍**声明** `boundaryReveals` 字段（caret 边界语义的成文依据）');
      assert(/\.boundaryReveals\b/.test(matrix),
        'widget-state-matrix.test.ts 必须仍**实际使用** `boundaryReveals`（只声明不读 = 化石字段，约定失去守护）');
      assert(/caretInside/.test(matrix),
        'widget-state-matrix.test.ts 必须仍记录 `caretInside` 的严格内语义（源码证据注释）');
    }
    // canary：谓词是**同一个对象**（断言与 canary 共用），双向
    if (!REVEAL_INCLUSIVE.test('head >= e.from && head <= e.to')) {
      errors.push('caret 边界家族护栏 canary 失效：含边界样本未被识别');
    }
    if (!REVEAL_STRICT.test('head > span.from && head < span.to')) {
      errors.push('caret 边界家族护栏 canary 失效：严格内样本未被识别');
    }
    if (REVEAL_STRICT.test('head >= e.from && head <= e.to')) {
      errors.push('caret 边界家族护栏 canary 失效：含边界样本被误判为严格内');
    }
    if (REVEAL_INCLUSIVE.test('head > span.from && head < span.to')) {
      errors.push('caret 边界家族护栏 canary 失效：严格内样本被误判为含边界');
    }
  }

  // ── 表格尺寸上限必须两端一致（2026-10-01，任务 4.11）──────────────────────
  // 立此条的原因：`packages/editor-engine` 与 `packages/app-core` **互不依赖**
  //（两者 `dependencies` 均为空），无法共享常量 → 上限在两处各写一份：
  // 创建对话框用 `TABLE_TEMPLATE_MAX_*`，resize 用 `TABLE_RESIZE_MAX_*`。
  // 只改一端 → 同一产品内出现两套尺寸约束（「创建能给 30 列、调整只能到 X 列」）。
  {
    const readSrc = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
    const readNum = (src, name) => {
      const m = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(src);
      return m === null ? null : Number(m[1]);
    };
    const engineSrc = readSrc('packages/editor-engine/src/table/commands.ts');
    const appCoreSrc = readSrc('packages/app-core/src/tableTemplate.ts');
    const pairs = [
      ['行上限', readNum(engineSrc, 'TABLE_RESIZE_MAX_ROWS'), readNum(appCoreSrc, 'TABLE_TEMPLATE_MAX_ROWS')],
      ['列上限', readNum(engineSrc, 'TABLE_RESIZE_MAX_COLS'), readNum(appCoreSrc, 'TABLE_TEMPLATE_MAX_COLUMNS')],
    ];
    for (const [label, a, b] of pairs) {
      assert(a !== null && b !== null, `无法解析表格${label}（护栏需同步更新，不要静默漏检）`);
      assert(a === b,
        `表格${label}两端不一致：engine ${a} vs app-core ${b}`
        + ' —— 两个包互不依赖、常量各写一份，只改一端会造成同一产品内两套尺寸约束');
    }
    // canary：只改一端必须被检出
    const drift = engineSrc.replace(/TABLE_RESIZE_MAX_ROWS\s*=\s*\d+/, 'TABLE_RESIZE_MAX_ROWS = 7');
    if (drift === engineSrc) {
      errors.push('表格尺寸上限一致性 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
    } else if (readNum(drift, 'TABLE_RESIZE_MAX_ROWS') === readNum(appCoreSrc, 'TABLE_TEMPLATE_MAX_ROWS')) {
      errors.push('表格尺寸上限一致性 canary 失效：注入漂移后仍判定一致');
    }
  }

  // ── 远程图片默认值：设置侧与引擎侧必须一致（2026-09-30）────────────────
  // 立此条的原因：这是**安全相关默认值**（默认联网会暴露「已打开该文档」与来源 IP），
  // 而它散落在两处 —— 设置 `image.loadRemote` 的 `defaultValue`，与引擎
  // `remoteImagesEnabled()` 在 localStorage 键缺失时的回退值。
  // 实测发现二者当前**一致（都是 true）**，但：
  //   ① 引擎同文件另有一条注释写「默认不加载」，**与实现相反**（已更正）；
  //   ② `v1.0-final-release-review-2026-08-16.md` 把 M2 标为「✅ 已修：默认 Off」——
  //      **结论已被后续改动推翻**，而该改动只由代码注释记录（已在该文档加更正块）。
  // 单侧改动会让「设置显示关、实际仍加载」（或反之），屏幕上看不出来 → 必须两端同锁。
  {
    const setPath = resolve(root, 'packages/settings/src/index.ts');
    const engPath = resolve(root, 'packages/editor-engine/src/image/widget.ts');
    assert(existsSync(setPath) && existsSync(engPath), '设置或引擎源文件缺失');
    if (existsSync(setPath) && existsSync(engPath)) {
      const setSrc = readFileSync(setPath, 'utf8').replace(/\r\n/g, '\n');
      const engSrc = readFileSync(engPath, 'utf8').replace(/\r\n/g, '\n');
      const setDef = (setSrc.match(/id: 'image\.loadRemote'[^}]*defaultValue:\s*(true|false)/) ?? [])[1];
      // 引擎回退：localStorage 键缺失时 `!== '0'` 为 true、`=== '1'` 为 false
      const engFallback = /localStorage\.getItem\('mellow\.image\.loadRemote'\)\s*!==\s*'0'/.test(engSrc) ? 'true'
        : (/localStorage\.getItem\('mellow\.image\.loadRemote'\)\s*===\s*'1'/.test(engSrc) ? 'false' : null);
      assert(setDef !== undefined, '设置 image.loadRemote 必须显式声明 defaultValue（否则默认值不可判定）');
      assert(engFallback !== null, '引擎 remoteImagesEnabled() 的回退形态无法识别（护栏需同步更新）');
      if (setDef !== undefined && engFallback !== null) {
        assert(setDef === engFallback,
          `远程图片默认值两端不一致：设置 defaultValue=${setDef}，引擎回退=${engFallback}`
          + '（会出现「设置显示关、实际仍加载」这类屏幕上看不出的错配）');
      }
      // canary：自检回退形态识别（样本拼接构造）
      const FB_SAMPLE = "localStorage.getItem('mellow.image.loadRemote') !== '" + "0" + "'";
      if (!/localStorage\.getItem\('mellow\.image\.loadRemote'\)\s*!==\s*'0'/.test(FB_SAMPLE)) {
        errors.push('远程图片默认值护栏 canary 失效：回退样本未被识别');
      }
    }
  }

  // ── UX Score 门槛必须被机器校验（2026-09-30）────────────────────────────
  // 立此条的原因：`UX Score`（PRD §131）此前**只存在于模板的 Markdown 表**，
  // 记录器 schema 里没有它 → 一份**只含 120 条计时、完全没有 UX Score** 的记录
  // 也能满足 `ux-gate` 证据标记 → **「总分 ≥92」门槛可被静默跳过**。
  // 现把它纳入记录器校验；本节同时**交叉核对**工具阈值与模板文档，防两侧漂移。
  {
    const recPath = resolve(root, 'tests/qualification/ux-gate-recorder.mjs');
    assert(existsSync(recPath), 'ux-gate-recorder.mjs 不存在');
    if (existsSync(recPath)) {
      const rec = readFileSync(recPath, 'utf8').replace(/\r\n/g, '\n');
      assert(/const UX_MODULES\s*=\s*\[/.test(rec), '记录器必须定义 UX_MODULES（PRD §131 模块与权重）');
      assert(/const UX_THRESHOLDS\s*=\s*\{/.test(rec), '记录器必须定义 UX_THRESHOLDS');
      // 权重合计必须为 100（PRD §131 满分）
      const weights = [...rec.matchAll(/\['\w+',\s*(\d+),\s*'[^']*'\]/g)].map((m) => Number(m[1]));
      assert(weights.length >= 10, `UX_MODULES 条目数应 ≥10，实测 ${weights.length}`);
      const sum = weights.reduce((a, b) => a + b, 0);
      assert(sum === 100, `UX_MODULES 权重合计必须为 100（PRD §131），实测 ${sum}`);
      // ── 宪法侧交叉核对（2026-10-06，审计 §4.79）──────────────────────────
      // 立此条的原因：上面这些门槛值此前**只锁了「记录器」一侧**，且把 `92 / 24 / 15 / 5`
      // **复述进护栏** ⇒ 同一组数字有**三份副本**（宪法 / 记录器 / 护栏），而**宪法那份没人核对** ——
      // 改 PRD §131 不会让任何东西变红（「只锁一侧」的同型，同 §4.9）。
      // 现改为**从宪法读值**：解析 PRD §131 的模块表与 Release 块，与记录器**双向**比对。
      // ⚠️ 解析必须**响亮失败**（漏行/漏项即报错），否则「解析不到」会静默变成「无需核对」。
      {
        const prdFull = readFileSync(resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md'), 'utf8').replace(/\r\n/g, '\n');
        const at131 = prdFull.indexOf('# 131.');
        assert(at131 >= 0, 'PRD 缺少 §131 UX Parity Score（UX 门槛的宪法依据）');
        const nextH1 = prdFull.indexOf('\n# ', at131 + 1);
        const sec131 = prdFull.slice(at131, nextH1 < 0 ? prdFull.length : nextH1);
        // ① 模块权重表：`| <label> | <score> |`（表头与分隔行第二格非数字 ⇒ 天然被排除）
        const prdRows = [...sec131.matchAll(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*$/gm)]
          .map((m) => ({ label: m[1], score: Number(m[2]) }));
        assert(prdRows.length === 10, `PRD §131 的模块表应解析出 10 行，实测 ${prdRows.length} —— 解析漏成员必须响亮失败`);
        // ② Release 门槛块
        const rel = /Total >= (\d+)[\s\S]*?Live Editing >= (\d+)\/(\d+)[\s\S]*?Caret\/IME\/Undo = (\d+)\/(\d+)[\s\S]*?File Safety = (\d+)\/(\d+)/.exec(sec131);
        assert(rel !== null, 'PRD §131 的 Release 门槛块未能解析（Total / Live Editing / Caret-IME-Undo / File Safety）—— 解析漏项必须响亮失败');
        if (rel !== null) {
          const [, total, leNum, leDen, ciNum, ciDen, fsNum, fsDen] = rel.map(Number);
          const recThresholds = {
            total: Number(/total:\s*(\d+)/.exec(rec)?.[1] ?? NaN),
            liveEditing: Number(/liveEditing:\s*(\d+)/.exec(rec)?.[1] ?? NaN),
            caretImeUndo: Number(/caretImeUndo:\s*(\d+)/.exec(rec)?.[1] ?? NaN),
            fileSafety: Number(/fileSafety:\s*(\d+)/.exec(rec)?.[1] ?? NaN),
          };
          const pairs = [
            ['total', recThresholds.total, total],
            ['liveEditing', recThresholds.liveEditing, leNum],
            ['caretImeUndo', recThresholds.caretImeUndo, ciNum],
            ['fileSafety', recThresholds.fileSafety, fsNum],
          ];
          for (const [name, recVal, prdVal] of pairs) {
            assert(recVal === prdVal,
              `UX 门槛 ${name} 不一致：记录器 ${recVal} vs **PRD §131 原文** ${prdVal} —— `
              + '宪法是唯一真值源；改一侧必须改另一侧（护栏不再复述这些数字）');
          }
          // 满分分母也必须与宪法一致（Live Editing /25、Caret-IME-Undo /15、File Safety /5）
          const recModules = [...rec.matchAll(/\['(\w+)',\s*(\d+),\s*'([^']*)'\]/g)]
            .map((m) => ({ key: m[1], score: Number(m[2]), label: m[3] }));
          const prdByLabel = new Map(prdRows.map((r) => [r.label, r.score]));
          assert(prdByLabel.size === 10, `PRD §131 的模块标签应唯一且为 10 个，实测 ${prdByLabel.size}`);
          for (const m of recModules) {
            const prdScore = prdByLabel.get(m.label);
            assert(prdScore !== undefined,
              `记录器的 UX 模块「${m.label}」在 PRD §131 的模块表里找不到 —— 两侧模块集必须一致`);
            assert(prdScore === m.score,
              `UX 模块「${m.label}」权重不一致：记录器 ${m.score} vs PRD §131 ${prdScore}`);
          }
          assert(recModules.length === prdRows.length,
            `UX 模块条目数不一致：记录器 ${recModules.length} vs PRD §131 ${prdRows.length}`);
          void [leDen, ciDen, fsDen];
        }
      }
      // 门槛值必须与 PRD §131 一致（宪法侧已在上方交叉核对；此处保留记录器侧的字面锁，
      // 二者**同源**：`92 / 24 / 15 / 5` 由上面那条「从宪法读值」的断言保证与宪法一致）
      assert(/total:\s*92/.test(rec), 'UX_THRESHOLDS.total 必须为 92（PRD §131）');
      assert(/liveEditing:\s*24/.test(rec), 'UX_THRESHOLDS.liveEditing 必须为 24（PRD §131）');
      assert(/caretImeUndo:\s*15/.test(rec), 'UX_THRESHOLDS.caretImeUndo 必须为 15（PRD §131，要求满分）');
      assert(/fileSafety:\s*5/.test(rec), 'UX_THRESHOLDS.fileSafety 必须为 5（PRD §131，要求满分）');
      // 缺失 uxScore 必须被拒绝（否则门槛可被跳过）
      assert(/uxScore 缺失/.test(rec), '记录器必须显式拒绝「缺 uxScore」的记录，否则 ≥92 门槛可被静默跳过');
      // 模板侧必须写明分数要写进记录（文档不得比工具宽松）
      const tpl = readFileSync(resolve(root, 'docs/qualification/ux-score-gate-template.md'), 'utf8').replace(/\r\n/g, '\n');
      assert(/uxScore/.test(tpl), '模板必须写明分数写进记录的 uxScore 字段（否则只在 Markdown 表里填）');
      // canary：自检权重合计锁（样本拼接构造）
      const SUM_SAMPLE = [25, 15, 10, 10, 10, 10, 5, 5, 5, 5].reduce((a, b) => a + b, 0);
      if (SUM_SAMPLE !== 100) errors.push('UX 权重合计护栏 canary 失效');
    }
  }

  // ── UX Gate 模板必须与记录器的要求一致（2026-09-30）────────────────────
  // 立此条的原因：模板原写「每**任务**附耗时记录与关键截图」（30 份），
  // 而 `validate` 要求**每一条观测**（30×2×2 = **120 条**）都带证据 →
  // 照模板做的人会在**几小时后**校验时才撞墙。**文档比工具宽松 = 把失败推到最贵的时间点。**
  // 同理，任务表原只有一列时间，而记录器要**每个 app 两轮**。
  {
    const tplPath = resolve(root, 'docs/qualification/ux-score-gate-template.md');
    assert(existsSync(tplPath), 'UX Gate 模板不存在');
    if (existsSync(tplPath)) {
      const tpl = readFileSync(tplPath, 'utf8').replace(/\r\n/g, '\n');
      assert(/每条观测|每一条观测/.test(tpl),
        '模板必须写明证据要求是**每条观测**（与 validate 一致），否则会比工具宽松');
      assert(!/每任务附耗时记录与关键截图/.test(tpl),
        '模板不得再写「每任务附耗时记录与关键截图」——validate 实际要求每条观测都有证据');
      assert(/\| # \| 任务 \| T-R1 \| T-R2 \| M-R1 \| M-R2 \|/.test(tpl),
        '任务表必须含「两轮 × 两应用」的时间列（T-R1/T-R2/M-R1/M-R2），与记录器的 2 round 对齐');
      // canary：自检这两条文本锁（样本拼接构造）
      const LOOSE = '每任务附耗时记录与关键' + '截图';
      if (!/每任务附耗时记录与关键截图/.test(LOOSE)) {
        errors.push('UX Gate 模板一致性护栏 canary 失效：宽松措辞样本未被检出');
      }
    }
  }

  // ── 30 任务清单：模板 ↔ 记录器 必须同源（2026-09-30）──────────────────────
  // 立此节的原因：**同一份「30 任务清单」被维护了两遍** ——
  // `ux-score-gate-template.md` §二的任务表（人读）与 `ux-gate-recorder.mjs` 的 `TASKS`（机读）。
  // 而**真正驱动门禁的是记录器**，模板只是散文 → 两处此前**无任何交叉校验**：
  // 改一处不会让另一处报错，人工照模板做、机器按另一份清单判分，**屏幕上看不出**。
  // 另：PRD §132 **不含逐项清单**（只规定数量 30 与四条阈值，已回查原文），
  // 故清单归属只能指向模板；末项「大文件」是 ADR-0025 / 模板 §3.1 的共同前提，单独锁死。
  {
    const tplForTasks = resolve(root, 'docs/qualification/ux-score-gate-template.md');
    const recForTasks = resolve(root, 'tests/qualification/ux-gate-recorder.mjs');
    assert(existsSync(tplForTasks) && existsSync(recForTasks), '30 任务清单护栏：模板或记录器不存在');
    if (existsSync(tplForTasks) && existsSync(recForTasks)) {
      const tplSrc = readFileSync(tplForTasks, 'utf8').replace(/\r\n/g, '\n');
      const recSrc = readFileSync(recForTasks, 'utf8').replace(/\r\n/g, '\n');
      const tplRows = [...tplSrc.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)]
        .map((m) => ({ n: Number(m[1]), text: m[2] }));
      const arrStart = recSrc.indexOf('const TASKS = [');
      const arrEnd = arrStart >= 0 ? recSrc.indexOf('];', arrStart) : -1;
      const recTasks = (arrStart >= 0 && arrEnd > arrStart)
        ? [...recSrc.slice(arrStart, arrEnd).matchAll(/'([^']*)'/g)].map((m) => m[1]) : [];
      assert(tplRows.length > 0, '无法解析模板的 30 任务表（护栏需同步更新）');
      assert(recTasks.length > 0, '无法解析记录器的 TASKS 数组（护栏需同步更新）');
      // ── 宪法侧：任务**条数**必须等于 PRD §132 写的那个数（2026-10-06，审计 §4.79）──
      // 立此条的原因：模板与记录器**互相**核对过条数，但**两侧都没有与宪法核对** ——
      // 改 PRD §132 的「30 个核心 Typora 任务」不会让任何东西变红（「只锁一侧」，同 §4.9）。
      {
        const prdFull = readFileSync(resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md'), 'utf8').replace(/\r\n/g, '\n');
        const at132 = prdFull.indexOf('# 132.');
        assert(at132 >= 0, 'PRD 缺少 §132 任务效率 Gate（任务条数的宪法依据）');
        const nextH1 = prdFull.indexOf('\n# ', at132 + 1);
        const sec132 = prdFull.slice(at132, nextH1 < 0 ? prdFull.length : nextH1);
        const declared = /(\d+)\s*个核心\s*Typora\s*任务/.exec(sec132);
        assert(declared !== null,
          'PRD §132 未能解析出「N 个核心 Typora 任务」—— 解析漏项必须响亮失败（不得静默跳过）');
        if (declared !== null) {
          const want = Number(declared[1]);
          assert(want === 30, `PRD §132 声明的任务数变为 ${want}（原为 30）—— 宪法改动必须同步模板与记录器`);
          assert(recTasks.length === want,
            `记录器 TASKS 有 ${recTasks.length} 条，而**PRD §132 原文**写的是 ${want} 个核心任务 —— `
            + '宪法是唯一真值源，改一侧必须改另一侧');
        }
      }
      if (tplRows.length && recTasks.length) {
        assert(tplRows.length === recTasks.length,
          `30 任务清单两处条数不一致：模板 ${tplRows.length} 行 vs 记录器 ${recTasks.length} 条`
          + '（记录器才是门禁实际度量的那份，漂移后屏幕上看不出）');
        const expectedNumbers = tplRows.map((_, i) => i + 1).join(',');
        assert(tplRows.map((r) => r.n).join(',') === expectedNumbers,
          '模板任务表编号必须为连续的 1..N（否则任务号与行数脱节，引用「任务 N」会指错）');
        // ADR-0025 Q3a = C1（Accepted 2026-09-30）：末项是**大文档**任务，
        // 且**对照尺寸必须写明 ≈2 MB**（Typora 可渲染上限内）。
        // 若有人把对照尺寸改回 10 MB，Typora 侧将无法执行，而门禁要求「两轮对照记录」→
        // 结果是**逼人编造数据**（本门禁明令禁止伪造计时）。故尺寸与「非对照」分栏两处同锁。
        const lastTplTask = tplRows[tplRows.length - 1].text;
        assert(/大文档|大文件/.test(lastTplTask),
          '模板任务表末项必须是大文档任务（ADR-0025 / 模板 §3.1 均以此为前提）');
        assert(/2\s?MB/i.test(lastTplTask),
          '模板任务表末项必须写明 **≈2 MB** 对照尺寸（Typora 可渲染上限内；'
          + 'ADR-0025 Q3a=C1：10 MB 已改为非对照能力观察）');
        const lastRecTask = recTasks[recTasks.length - 1];
        assert(/大文档|大文件/.test(lastRecTask),
          '记录器 TASKS 末项必须是大文档任务（否则门禁不再度量该场景）');
        assert(/2\s?MB/i.test(lastRecTask),
          '记录器 TASKS 末项必须写明 ≈2 MB 对照尺寸（与模板同源，否则两处语义漂移）');
        // >2 MB 能力观察不得随对照尺寸调整而丢失（PRD §129 J18 的承接处）
        assert(/非对照/.test(tplSrc) && /(10\s?MB|>\s?2\s?MB)/.test(tplSrc),
          '模板必须保留「>2 MB 非对照能力观察」一节（否则 PRD §129 J18 的能力要求会静默消失）');
        // canary：自检「条数一致性」这条锁本身有效（样本拼接构造）
        const A = ['| 1 | x |', '| 2 | y |'];
        const B = ['a'];
        if (A.length === B.length) errors.push('30 任务清单条数锁 canary 失效：不等长样本未被识别');
      }
    }
  }

  // ── 宪法侧：PRD §129 J18 必须仍在原文里（2026-10-06，审计 §4.81）──────────────
  // 立此条的原因：上面那条「模板必须保留 >2 MB 非对照能力观察」**在注释里引用 §129 J18**，
  // 但**从未读 PRD**（「引用宪法 ≠ 读宪法」，同 §4.79/§4.80）。若有人把 §129 J18 的尺寸
  // 从 10MB 改成 2MB，ADR-0025「Typora 无法渲染 >2MB ⇒ 单列为非对照观察」的**全部理由随之消失**，
  // 而模板里的「非对照能力观察」节会变成**没有宪法依据的孤儿**，且**不会有任何信号**。
  // 本块**不依赖模板/记录器能否解析**（否则解析失败会把它静默跳过）。
  {
    // ⚠️ 判据必须是**同一个谓词对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
    const RE_J18_HEAD = /^##\s*J18\s*([^\n]*)/m;
    const RE_TEN_MB = /10\s?MB/i;
    const prd129 = readFileSync(resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md'), 'utf8').replace(/\r\n/g, '\n');
    const at129 = prd129.indexOf('# 129.');
    assert(at129 >= 0, 'PRD 缺少 §129 Typora 体验黄金任务');
    if (at129 >= 0) {
      const nextH1 = prd129.indexOf('\n# ', at129 + 1);
      const sec129 = prd129.slice(at129, nextH1 < 0 ? prd129.length : nextH1);
      assert(/必须全部通过/.test(sec129),
        'PRD §129 必须声明「必须全部通过」—— 否则黄金任务降级为建议，ADR-0025 的前提不再成立');
      const j18 = RE_J18_HEAD.exec(sec129);
      assert(j18 !== null,
        'PRD §129 缺少 J18（大文档黄金任务）—— ADR-0025 的「非对照能力观察」以其为宪法依据');
      if (j18 !== null) {
        assert(RE_TEN_MB.test(String(j18[1] ?? '')),
          `PRD §129 J18 的尺寸变为「${String(j18[1] ?? '').trim()}」（原为 10MB）—— ADR-0025 之所以把 >2MB `
          + '单列为「非对照能力观察」，前提正是 J18 要求 10MB 而 Typora 渲染上限约 2MB；'
          + '改宪法必须同步 ADR-0025 与 UX Gate 模板，不要只改一侧');
      }
      // 18 条黄金任务必须齐全且编号连续（§129「必须全部通过」的对象）
      const jIds = [...sec129.matchAll(/^##\s*J(\d\d)\b/gm)].map((m) => Number(m[1]));
      assert(jIds.length === 18, `PRD §129 的黄金任务应为 18 条，实测 ${jIds.length}`);
      assert(jIds.every((n, i) => n === i + 1),
        `PRD §129 的 J 编号必须为连续 J01..J18，实测 [${jIds.join(', ')}]`);
    }
    // canary：自检 §129 的两条谓词（样本拼接构造，避免护栏检出自己）—— **双向**
    // ⚠️ 只做正向样本抓不到「谓词被放宽」（把 RE_TEN_MB 改成 /./ 仍会通过正向样本）。
    if (!RE_J18_HEAD.test('## J' + '18 10MB')) {
      errors.push('§129 J18 定位护栏 canary 失效：合法样本未被识别');
    }
    if (RE_J18_HEAD.test('## J' + '17 10MB')) {
      errors.push('§129 J18 定位护栏 canary 失效：J17 样本被误判为 J18');
    }
    // 负向样本二：含 J18 但**不是标题行** —— 抓「把 /^##\s*J18/ 放宽成 /J18/」这类收窄丢失
    if (RE_J18_HEAD.test('J' + '18 不是标题')) {
      errors.push('§129 J18 定位护栏 canary 失效：非标题行样本被误判为 J18 标题');
    }
    if (!RE_TEN_MB.test('10' + 'MB')) {
      errors.push('§129 J18 尺寸护栏 canary 失效：10MB 样本未被识别');
    }
    if (RE_TEN_MB.test('2' + 'MB')) {
      errors.push('§129 J18 尺寸护栏 canary 失效：2MB 样本竟被当作 10MB');
    }
  }

  // ── 反例锁：不得把「编号任务清单」归给 PRD §132（2026-09-30）────────────────
  // PRD §132 原文只有「30 个核心 Typora 任务：」+ 四条阈值，**无逐项枚举**（已回查）。
  // 审计与 ADR-0025 曾写成「PRD §132 的任务清单（第 17 项「10 MB」）」——
  // 把**我们自己定义的清单**记成宪法条款，会让**可自行修正的方法论问题伪装成宪法级冲突**
  // （也会让人不敢改本就该改的模板）。只锁这一种形态：
  // 「§132 的阈值」「§132 的 Gate」等**合法引用不受影响**。
  //
  // ⚠️ 必须与「透明追加更正块」的约定兼容：更正块**必然要引用错误原文**
  // （本仓库的更正惯例是「不改写历史、只追加更正」）→ 故按**段落块**判定
  // （Markdown 里以空行分块；列表项的多行续行属同一块），
  // 含更正/引用标记的**整块**豁免。豁免标记是显式白名单，不是模糊启发式。
  {
    const docDirs = ['docs/qualification', 'docs/adr', 'docs/plans', 'docs/specs', 'docs/product'];
    const CITES_NUMBERED_TASKS = /§132\s*任务\s*\d+/;
    // 只锁「§132（的）任务清单」这一**归属**形态；「§132 是否含任务清单」这类**提问**不匹配
    const CITES_TASK_LIST = /§132\s*的?\s*任务清单/;
    const CORRECTION_MARKER = /更正|原写|原文|写成|引用有误|曾把|不含逐项清单/;
    const offenders = [];
    for (const dir of docDirs) {
      const abs = resolve(root, dir);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs)) {
        if (!name.endsWith('.md')) continue;
        const src = readFileSync(resolve(abs, name), 'utf8').replace(/\r\n/g, '\n');
        for (const block of src.split(/\n[ \t]*\n/)) {
          if (CORRECTION_MARKER.test(block)) continue; // 更正/引用块豁免
          if (CITES_NUMBERED_TASKS.test(block) || CITES_TASK_LIST.test(block)) {
            offenders.push(`${dir}/${name}：${block.trim().split('\n')[0].slice(0, 80)}`);
            break;
          }
        }
      }
    }
    assert(offenders.length === 0,
      '不得把「编号任务清单」归给 PRD §132（§132 无逐项清单，清单由 ux-score-gate-template.md 定义）：'
      + offenders.join(' | '));
    // canary：自检该反例锁有效，且豁免标记不会把真正的误引也放过（样本拼接构造）
    const BAD_SAMPLE = 'PRD §132' + ' 任务 17';
    const GOOD_SAMPLE = '本节原写「PRD §132' + ' 的任务清单」，该引用不成立';
    if (!CITES_NUMBERED_TASKS.test(BAD_SAMPLE)) {
      errors.push('§132 清单归属反例锁 canary 失效：误引样本未被检出');
    }
    if (!CITES_TASK_LIST.test(GOOD_SAMPLE)) {
      errors.push('§132 清单归属反例锁 canary 失效：清单误引样本未被检出');
    }
    if (!CORRECTION_MARKER.test(GOOD_SAMPLE)) {
      errors.push('§132 清单归属反例锁 canary 失效：更正块未被豁免（会误报历史更正块）');
    }
  }

  // ── PDF CJK 必须由**机制**断言守着（2026-09-30）─────────────────────────
  // master plan §10 把「PDF CJK garble」列为**发布阻塞项**，V1.0 验收第 13 项依赖它。
  // 而原先的 CI 测试只断言 `%PDF-` 与体积 —— 属**冒烟测试**：证明管线跑通，
  // **测不到「CJK 变乱码」**。garble 有两个**独立**失效面，各由一条机制保证：
  //   ① 字形面：必须嵌入子集（`/FontFile2`），否则换机器/换字体就缺字形；
  //   ② 码位面：CJK 走 `/Type0` + `/Identity-H`，此时字符码 = 字形 id，
  //      **没有 `/ToUnicode` CMap 就无法把字形映回 Unicode** → 屏幕看着正常、
  //      **复制/搜索出来是乱码**（冒烟测试完全测不到这一面）。
  // 锁住这两面确实被断言，防止测试被悄悄退回冒烟状态
  // （「有测试 ≠ 测到了」，§5.7 已记录一次同类前科）。
  {
    const expTest = resolve(root, 'packages/export/test/index.test.ts');
    assert(existsSync(expTest), 'packages/export/test/index.test.ts 不存在');
    if (existsSync(expTest)) {
      const src = readFileSync(expTest, 'utf8').replace(/\r\n/g, '\n');
      const required = ['/ToUnicode', '/FontFile2', '/Identity-H'];
      for (const marker of required) {
        assert(src.includes(`'${marker}'`),
          `PDF CJK 机制断言缺失：export 单测必须断言 PDF 含 ${marker}`
          + '（否则「CJK 乱码」只剩冒烟测试，而它是 §10 发布阻塞项）');
      }
      // 加强（2026-09-30）：**存在 ≠ 正确**。`/ToUnicode` 在、但映射错，
      // 后果与「不在」完全一样 —— 屏幕正常、复制/搜索出来是错字。
      // 故要求真的解析 CMap 并核对映射覆盖（断言的是**实现**与**覆盖断言**，不是注释里的词）。
      assert(/function extractToUnicodeCMaps/.test(src),
        'PDF CJK 断言必须提取 ToUnicode CMap（否则只证明「存在」）');
      assert(/function parseToUnicodeCmap/.test(src),
        'PDF CJK 断言必须解析 CMap 的 bfchar/bfrange（存在 ≠ 正确）');
      assert(/expect\(cjk\.filter\(/.test(src),
        'PDF CJK 断言必须核对「输入里每个 CJK 字符都在映射目标里」'
        + '（只断言 CMap 存在无法发现映射错误）');
      // canary：自检这三条锁有效（样本拼接构造）
      const MARKER_SAMPLE = '/To' + 'Unicode';
      if (!required.includes(MARKER_SAMPLE)) {
        errors.push('PDF CJK 机制断言锁 canary 失效：标记样本未被纳入必需集合');
      }
      if (!/function parseToUnicodeCmap/.test('function parseTo' + 'UnicodeCmap(t) {}')) {
        errors.push('PDF CJK CMap 解析锁 canary 失效：实现样本未被识别');
      }
    }
  }

  // ── UX Gate 对照文档必须存在且「能执行那 30 项任务」（2026-09-30）──────────
  // 门禁要求「同一台机器、**同一份测试文档**」下对照 Typora 与 Mellow，
  // 但此前**没有任何文档被指定**（模板只写「同一份测试文档（tests/fixtures/）」）。
  // 而 30 项里一半以上依赖**特定内容** → 不指定则三场平台会话各用各的文档，
  // 任务内容不可比；「修正 Mermaid 错误」「加一行」这类动作也无从复现。
  // 本节的断言 = 「删掉某项内容会让某几项任务**无法执行**」的那些能力：
  // 无法执行在人工会话里表现为「跳过」，最终是一条**静默缺失的观测**（屏幕上看不出）。
  {
    const gateDir = resolve(root, 'tests/fixtures/ux-gate');
    const gateDoc = resolve(gateDir, 'ux-gate-30tasks.md');
    const gateImg = resolve(gateDir, 'assets/gate-placeholder.png');
    assert(existsSync(gateDoc), 'UX Gate 对照文档缺失：tests/fixtures/ux-gate/ux-gate-30tasks.md');
    assert(existsSync(resolve(gateDir, 'notes.md')), 'UX Gate 第二文档缺失：tests/fixtures/ux-gate/notes.md（任务 03/04 需要）');
    assert(existsSync(gateImg), 'UX Gate 图片载体缺失：tests/fixtures/ux-gate/assets/gate-placeholder.png（任务 12）');
    // 模板必须**指定**这份文档，否则「同文档」仍然没有参照物
    const gateTpl = readFileSync(resolve(root, 'docs/qualification/ux-score-gate-template.md'), 'utf8').replace(/\r\n/g, '\n');
    assert(/tests\/fixtures\/ux-gate\//.test(gateTpl),
      'UX Gate 模板必须指定对照文档为 tests/fixtures/ux-gate/（否则「同机同文档」无参照物）');
    if (existsSync(gateDir)) {
      const mdCount = readdirSync(gateDir).filter((n) => n.endsWith('.md')).length;
      assert(mdCount >= 3, `UX Gate 目录至少需要 3 个 .md 文件（任务 03/04 切换文件与 Quick Open），实测 ${mdCount}`);
    }
    if (existsSync(gateImg)) {
      const head = readFileSync(gateImg).subarray(0, 8);
      const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      assert(PNG_MAGIC.every((b, i) => head[i] === b),
        'UX Gate 图片载体必须是真正的 PNG（否则任务 12/25 的图片渲染与导出会失真）');
    }
    if (existsSync(gateDoc)) {
      const doc = readFileSync(gateDoc, 'utf8').replace(/\r\n/g, '\n');
      // 每一条都对应「少了它某项任务就无法执行」。
      // ⚠️ 断言必须**结构**而非「文本出现过」：本文件里到处在**说明**这些构件
      // （例：正文写着「点击文首的 `[TOC]` 生成的目录项」），
      // 用裸子串判断会被**散文提及**满足 → 真构件删掉后护栏仍绿（假阴性）。
      // 故：指令类用行锚点（`^…$`）、脚注引用要求紧贴正文而非被反引号包住、
      // 「故意写错的 Mermaid」直接**结构性判定**该围栏的括号不平衡。
      const checks = [
        [/^\[TOC\]\s*$/m, '独立的 `[TOC]` 指令行（任务 19；被反引号包住的说明文字不算）'],
        [/\$[^$\n]+\$/, '行内数学 `$…$`（任务 16）'],
        [/^\$\$$/m, '独立的块级数学定界行 `$$`（任务 16 / 25）'],
        [/^```mermaid$/m, 'Mermaid 围栏（任务 17 / 25）'],
        [/^\[\^[^\]]+\]:/m, '脚注定义（任务 18）'],
        [/[\u4e00-\u9fa5A-Za-z]\[\^[^\]]+\]/, '紧贴正文的脚注引用（任务 18；被反引号包住的说明文字不算）'],
        [/:\s*-{2,}/, '表格左对齐标记 `:---`（任务 11）'],
        [/-{2,}\s*:/, '表格右对齐标记 `---:`（任务 11）'],
        [/^- \[ \]/m, '行首的未勾选任务列表项（任务 10）'],
        [/^\s{2,}- /m, '嵌套列表（任务 09）'],
        [/!\[[^\]]*\]\(assets\//, '相对路径图片 `assets/…`（任务 12）'],
        [/^#### /m, 'H4 标题（任务 20 大纲层级）'],
        [/UXGATEKEYWORD/, '搜索关键字标记（任务 05）'],
      ];
      for (const [re, label] of checks) {
        assert(re.test(doc), `UX Gate 对照文档缺少 ${label} —— 对应任务将无法执行（人工会话里表现为「跳过」）`);
      }
      const replaceHits = (doc.match(/替换前/g) ?? []).length;
      assert(replaceHits >= 3,
        `UX Gate 对照文档需含 ≥3 处「替换前」（任务 06 查找与替换），实测 ${replaceHits}`);
      // 任务 17 的「可修正错误」必须是**真的存在**：至少一个 mermaid 围栏括号不平衡。
      // 用结构判定而非「含『故意』二字」——后者删掉真构件后仍可能被说明文字满足。
      const mermaidBlocks = [...doc.matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
      assert(mermaidBlocks.length >= 2,
        `UX Gate 对照文档需含 ≥2 个 Mermaid 围栏（一个含错误 + 一个正确参照，任务 17），实测 ${mermaidBlocks.length}`);
      const unbalanced = mermaidBlocks.filter((b) => {
        const open = (b.match(/\[/g) ?? []).length;
        const close = (b.match(/\]/g) ?? []).length;
        return open !== close;
      });
      assert(unbalanced.length >= 1,
        'UX Gate 对照文档必须含**一处真正写错的 Mermaid**（括号不平衡）——'
        + '任务 17 是「渲染 → 修正错误」，没有可修正的错误则该任务不可执行（只写「故意」二字不算）');
    }
    // canary：自检上述能力断言有效（样本拼接构造）
    const SAMPLE_DOC = '[TOC]\n\n$E=mc^2$\n\n```mermaid\ngraph TD\n  A[开始 --> B[结束]\n```\n';
    if (!/^\[TOC\]\s*$/m.test(SAMPLE_DOC) || !/\$[^$\n]+\$/.test(SAMPLE_DOC)) {
      errors.push('UX Gate 对照文档能力锁 canary 失效：样本未被识别');
    }
    {
      const blocks = [...SAMPLE_DOC.matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
      const broken = blocks.some((b) => (b.match(/\[/g) ?? []).length !== (b.match(/\]/g) ?? []).length);
      if (blocks.length < 1 || !broken) {
        errors.push('UX Gate「故意写错的 Mermaid」结构判定 canary 失效：不平衡样本未被识别');
      }
    }
  }

  // ── UX Gate 记录：不得提交「未填写的预生成草稿」（2026-09-30）──────────────
  // 仓库里曾有一份 `docs/qualification/evidence/macos-ux-gate-DRAFT.json`，其真实作用
  // 是**让 git 保留那个空目录** —— 因为 `init` 当时不创建落点目录（git 不跟踪空目录）。
  // 但那份草稿的 `mellowCommit` **在下一个提交就过期**（实测：草稿写 `c2ba524`，
  // 两小时后 HEAD 已是别的提交），而校验只要求「不是 REPLACE_ 开头」→ 人工照草稿填，
  // 记录就会指向**没被测过的修订**，且**屏幕上看不出**。
  // 现 `init` 自建目录 + 报告 HEAD 一致性，草稿不再需要，且**不得**再提交。
  // ⚠️ 注意区分「草稿」与「已完成的记录」：会话结束后那份**真记录**就落在这个目录里，
  // 它是证据、必须允许存在。判定草稿 = 「init 产出且从未填写」（tester 仍是占位符
  // 且没有任何观测带数值）。
  {
    const evidDir = resolve(root, 'docs/qualification/evidence');
    const drafts = [];
    if (existsSync(evidDir)) {
      for (const name of readdirSync(evidDir)) {
        if (!/ux-gate.*\.json$/.test(name)) continue;
        let rec = null;
        try { rec = JSON.parse(readFileSync(resolve(evidDir, name), 'utf8')); } catch { continue; }
        const testerUnset = typeof rec?.tester !== 'string' || rec.tester.startsWith('REPLACE_');
        const observations = Array.isArray(rec?.observations) ? rec.observations : [];
        const anyMeasured = observations.some((o) => Number.isFinite(o?.durationMs) && o.durationMs > 0);
        if (testerUnset && !anyMeasured) drafts.push(name);
      }
    }
    assert(drafts.length === 0,
      'docs/qualification/evidence/ 不得存在**未填写的** UX Gate 草稿记录：' + drafts.join(', ')
      + '（草稿里的 mellowCommit 在下一个提交就过期 → 照填会记录到没被测过的修订；'
      + '会话开始时用 `ux-gate-recorder.mjs init` 自生成，落点目录由 init 自建）');

    const recPath = resolve(root, 'tests/qualification/ux-gate-recorder.mjs');
    assert(existsSync(recPath), 'ux-gate-recorder.mjs 不存在');
    if (existsSync(recPath)) {
      const rec = readFileSync(recPath, 'utf8').replace(/\r\n/g, '\n');
      assert(/function currentHeadShort/.test(rec),
        'ux-gate-recorder 必须实现 currentHeadShort（记录修订要与当前 HEAD 核对）');
      assert(/function commitCheck/.test(rec), 'ux-gate-recorder 必须实现 commitCheck');
      assert(/commitCheck:\s*cc/.test(rec), 'progress 必须把 commitCheck 报给人工（会话进行中就能发现不一致）');
      assert(/commitNote/.test(rec), 'validate 必须回传 commitNote（不一致不判失败，但必须让人看见）');
      assert(/mkdirSync\(dirname\(path\)/.test(rec),
        'init 必须自建落点目录（否则又得靠提交一份草稿占位来让 git 保留空目录）');
      const tpl = readFileSync(resolve(root, 'docs/qualification/ux-score-gate-template.md'), 'utf8').replace(/\r\n/g, '\n');
      assert(/ux-gate-recorder\.mjs init/.test(tpl),
        '模板必须写明会话开始时用 `init` 自生成记录（不得依赖已删除的草稿文件）');
      assert(/固定|切到要验收的修订|rev-parse --short HEAD/.test(tpl),
        '模板必须写明「会话前把修订固定下来」的纪律（否则记录的 commit 无意义）');
    }
    // canary：自检草稿判定（样本拼接构造）
    const DRAFT_SAMPLE = { tester: 'REPLACE_WITH_' + 'TESTER', observations: [{ task: 1, app: 'typora', round: 1 }] };
    const testerUnset = typeof DRAFT_SAMPLE.tester !== 'string' || DRAFT_SAMPLE.tester.startsWith('REPLACE_');
    const anyMeasured = DRAFT_SAMPLE.observations.some((o) => Number.isFinite(o?.durationMs) && o.durationMs > 0);
    if (!(testerUnset && !anyMeasured)) {
      errors.push('UX Gate 草稿判定 canary 失效：未填写的样本未被识别为草稿');
    }
    const REAL_SAMPLE = { tester: '张三', observations: [{ durationMs: 1000 }] };
    const realTesterUnset = typeof REAL_SAMPLE.tester !== 'string' || REAL_SAMPLE.tester.startsWith('REPLACE_');
    if (realTesterUnset) {
      errors.push('UX Gate 草稿判定 canary 失效：已填写的真记录被误判为草稿（会挡住合法证据）');
    }
  }

  // ── UX Gate 记录器：进度报告必须只读（2026-09-25）──────────────────────
  // 立此节的原因：`validate` 要 120 条齐备才给结论，人工会话中途无法知道「还差哪些」，
  // 且它把「还没填」与「填错了」混在同一次报错里。新增的 `progress` 命令必须**只读**：
  // 它报告填写状态与顺序规则，**不得写文件、不得生成任何耗时数值**
  // （ux-gate-recorder 的设计前提是「只接受人工记录，禁止伪造计时」）。
  const recorderPath = resolve(root, 'tests/qualification/ux-gate-recorder.mjs');
  assert(existsSync(recorderPath), 'ux-gate-recorder.mjs 不存在');
  if (existsSync(recorderPath)) {
    const recSrc = readFileSync(recorderPath, 'utf8').replace(/\r\n/g, '\n');
    assert(/function progressReport/.test(recSrc), 'ux-gate-recorder 必须实现 progressReport');
    assert(/command === 'progress'/.test(recSrc), 'ux-gate-recorder 必须支持 progress 子命令');
    const pStart = recSrc.indexOf('function progressReport');
    const pEnd = recSrc.indexOf('\nfunction ', pStart + 1);
    const pBody = (pStart >= 0 && pEnd > pStart) ? recSrc.slice(pStart, pEnd) : '';
    assert(pBody.length > 0, '无法定位 progressReport 函数体（护栏失效）');
    // 反例锁：只读 + 不造数
    assert(!/writeFileSync/.test(pBody), 'progressReport 必须只读：它只报告填写状态，不得写文件');
    assert(!/durationMs\s*[:=]\s*\d/.test(pBody), 'progressReport 不得生成任何耗时数值（ux-gate 禁止伪造计时）');
    // canary：自检反例锁
    const WRITE_SAMPLE = 'function progressReport() { ' + 'writeFileSync("x", "y"); }';
    if (!/writeFileSync/.test(WRITE_SAMPLE)) {
      errors.push('progress 只读锁 canary 失效：写文件样本未被检出');
    }
  }

  // ── 锁屏/遮挡前置门禁（2026-09-25）──────────────────────────────────────
  // 立此节的原因：**屏幕锁定/屏保激活时 `loginwindow` 成为前台**，此时任何应用都无法
  // 被激活 → SCK 对**被遮挡**窗口只能拿到**静止帧** → 整批样本以
  // `detectMaxDiff=0 calibMaxDiff=0` 失败。实测一次 0/6，而失败信息只有一行 pid，
  // 排查方向被指向「焦点/按键」而不是「窗口被遮挡」。
  // 这类失败必须在开跑前拒绝，且 helper 侧激活失败必须**响亮失败并指名当前前台应用**。
  // 这两处源码在前面的块级作用域里读过，这里需重新读取（否则 ReferenceError）
  const hs2 = existsSync(resolve(root, 'tests/benchmark/lib/screen-timing.swift'))
    ? readFileSync(resolve(root, 'tests/benchmark/lib/screen-timing.swift'), 'utf8').replace(/\r\n/g, '\n') : '';
  const commonSrc2 = existsSync(resolve(root, 'tests/benchmark/perf-common.mjs'))
    ? stripComments(readFileSync(resolve(root, 'tests/benchmark/perf-common.mjs'), 'utf8').replace(/\r\n/g, '\n')) : '';
  assert(/case "frontmost"/.test(hs2), 'helper 必须实现 frontmost 命令（供锁屏前置门禁使用）');
  assert(/isLockScreen/.test(hs2), 'helper 的 frontmost 必须给出 isLockScreen 判据');
  assert(/func activateAppAndConfirm/.test(hs2),
    'helper 必须实现 activateAppAndConfirm：激活后确认目标确实成为前台，失败即响亮失败');
  assert(/未能成为前台/.test(hs2),
    '激活失败必须指名「当前前台应用」（只报 pid 会把排查方向带向「焦点/按键」而非「窗口被遮挡」）');
  assert(/export function frontmostApp/.test(commonSrc2), 'perf-common 必须实现 frontmostApp');
  assert(/'frontmost'/.test(commonSrc2), 'frontmostApp 必须调用 helper 的 frontmost 命令');
  {
    const i = benchCode.indexOf('isLockScreen');
    assert(i >= 0, 'run-benchmark 必须检查 isLockScreen（锁屏时拒绝执行）');
    const tail = i >= 0 ? benchCode.slice(i, i + 700) : '';
    assert(/process\.exit\(1\)/.test(tail),
      '锁屏时必须 process.exit(1) 拒绝执行，不能产出「0 个有效样本」的报告');
  }
  // canary：自检锁屏门禁
  const LOCK_SAMPLE = '{"bundleId":"com.apple.login' + 'window","isLockScreen":true}';
  if (!/isLockScreen":true/.test(LOCK_SAMPLE)) {
    errors.push('锁屏门禁 canary 失效：锁屏样本未被构造出来');
  }

  // ── 输入源判定护栏（2026-09-23）──────────────────────────────────────────
  // 立此节的原因：`inputSourceIsEnglish()` 原实现读
  // `defaults read com.apple.HIToolbox AppleSelectedInputSources` ——
  // 那是**已启用列表**（不是当前源）—— 且用正则 `/ABC|U\.S\.|English/` 判定。
  // 而简体拼音的输入源 id 是 `com.apple.inputmethod.SCIM.ITABC`，
  // **字面量里就含 `ABC`**（"IT**ABC**"），于是该函数对本机实际状态恒返回 true。
  // 后果：合成按键落到拼音 IME 上弹出候选窗而不是回显文本 ——
  // startup/open/typing/search 的「首键回显」分量测的是「候选窗出现的耗时」，
  // 数字看着正常却不可用（实测 10MB 同机中位数 743.9 / 1586.4 / 2098.3ms 三档）。
  // 现改用 helper 的 TIS 查询（只有 TISTypeKeyboardLayout 才算无 IME 干扰），
  // 且把门禁从「仅警告」升级为「拒绝执行」。
  const perfCommonPath = resolve(root, 'tests/benchmark/perf-common.mjs');
  assert(existsSync(perfCommonPath), 'tests/benchmark/perf-common.mjs 不存在');
  if (existsSync(perfCommonPath)) {
    // 必须先剥注释再断言：本轮 `inputSourceIsEnglish` 的**解释性注释**里写了旧实现
    // 用的键名（正是为了说明为什么不能用它），不剥注释会把自己的说明当成违规。
    // 这与本文件早先 `benchCode` 的处理同理（见 stripComments 定义处的注释）。
    const commonSrc = stripComments(readFileSync(perfCommonPath, 'utf8').replace(/\r\n/g, '\n'));
    assert(/export function currentInputSource/.test(commonSrc),
      'perf-common 必须实现 currentInputSource（经 helper 的 TIS 查询取**当前**输入源）');
    assert(/'current-input'/.test(commonSrc),
      'currentInputSource 必须调用 helper 的 current-input 命令');
    // 反例锁：不得再用「已启用输入源列表 + ASCII 关键词」判定 —— 拼音的 id 含 ABC 会误报
    assert(!/AppleSelectedInputSources/.test(commonSrc),
      '不得用 AppleSelectedInputSources 判定输入源：那是已启用列表且拼音 id 含 "ABC"（com.apple.inputmethod.SCIM.ITABC）会误报为英文');
    // canary：自检反例锁本身（样本拼接构造）
    const NAIVE_SAMPLE = "spawnSync('defaults', ['read', 'com.apple.HIToolbox', '" + 'AppleSelectedInputSources' + "'])";
    if (!/AppleSelectedInputSources/.test(NAIVE_SAMPLE)) {
      errors.push('输入源反例锁 canary 失效：旧实现样本未被检出');
    }
    // 正例锁：判定必须落在 isKeyboardLayout 上
    assert(/isKeyboardLayout/.test(commonSrc),
      'inputSourceIsEnglish 必须以 isKeyboardLayout 为准（TISTypeKeyboardLayout 才无 IME 干扰）');
  }
  // 门禁必须是硬失败：合成按键类指标在非键盘布局下拒绝执行
  assert(/KEYSTROKE_METRICS/.test(benchCode),
    'run-benchmark 必须声明 KEYSTROKE_METRICS（合成按键类指标集合）');
  {
    const i = benchCode.indexOf('KEYSTROKE_METRICS');
    const tail = i >= 0 ? benchCode.slice(i, i + 1200) : '';
    assert(/process\.exit\(1\)/.test(tail),
      '输入源非键盘布局时必须**拒绝执行**（process.exit(1)），不能只警告放行 —— 否则产出的是「IME 候选窗耗时」');
  }
  // hot-open 口径必须存在（2026-09-22 文档列出的待办）
  assert(/'hotopen'/.test(benchCode), 'run-benchmark 必须支持 hotopen 指标');
  assert(/hot-open-probe/.test(benchCode), 'run-benchmark 必须调用 helper 的 hot-open-probe');
  {
    // 注意：helperSrc 是上一节块级作用域内的常量，此处需重新读取（否则 ReferenceError）
    const helperPath2 = resolve(root, 'tests/benchmark/lib/screen-timing.swift');
    if (existsSync(helperPath2)) {
      const hs = readFileSync(helperPath2, 'utf8').replace(/\r\n/g, '\n');
      assert(/case "hot-open-probe"/.test(hs), 'helper 必须实现 hot-open-probe 命令');
      assert(/case "current-input"/.test(hs), 'helper 必须实现 current-input 命令（TIS 权威输入源查询）');
      assert(/func ensureAsciiInputSource/.test(hs),
        'helper 必须实现 ensureAsciiInputSource：macOS 按应用记忆输入源，激活后需重新断言为键盘布局');
      // 判据护栏（2026-09-25）：切换判定必须用**帧对比例**，不得用绝对点数。
      // 立此条的原因：`pixelDiff` 只取 `a` 的几何，且全仓假设「流生命周期内帧尺寸恒定」——
      // 该假设不成立（实测 changed=17372 > sampleCount=13824，数学上不可能）。
      // 绝对阈值 `max(calibMax*3, 60)` 对 13824 个采样点只占 0.4%，而真实切换信号是
      // 5.3–7.6% → 原阈值比真实信号低约 12 倍，工具条重绘即可触发。
      assert(/func pixelDiffPair/.test(hs),
        'helper 必须实现 pixelDiffPair（按实际帧对算变化比例）：绝对点数依赖事先算好的采样点总数，而帧几何在流内会变');
      assert(/switchMinFrac/.test(hs), 'hot-open 必须支持按比例给出切换判据（--switch-min-frac）');
      assert(/switchDimMismatchFrames/.test(hs),
        'helper 必须报出 switchDimMismatchFrames（基准帧与比较帧几何不一致的帧数），使该假设失效可见而非静默');
      // 回显判据也必须是**比例**（2026-09-28）。
      // 立此条的原因：`calibrate()` 的判据是 `max(calibMax*3, 60)`，而实测「插入一个字符」
      // 在 576×96 的 ROI 上只产生 **59** 个变化采样点 —— 恰好比地板 60 小 1。
      // 于是 Mellow 10MB 的四次 open 全部被判为「未回显」，PRD 对 10MB 的核心目标
      // （1.0–1.5s）**一个有效读数都拿不到**，而失败提示还写「按键可能未落到编辑区」。
      // 一个魔法常数压在真实信号量级上，是判据设计问题。
      assert(/let ECHO_MIN_FRAC\s*=\s*0\.\d+/.test(hs),
        'helper 必须定义 ECHO_MIN_FRAC：回显判据须为比例，绝对地板 60 会压在信号量级上');
      {
        // 三处都必须用比例判据（2026-09-28）。断言**出现次数**而不是「存在」——
        // 「修了一处漏了另一处」正是这类缺陷的典型形态：实际发生过
        // startup-probe 与 hot-open 修好后，cmdKeypressLatency 仍是绝对阈值，
        // 而 typing 指标（PRD §110「Input P95 update < 16ms」）正是读它。
        const hits = hs.match(/setFracOverride\(ECHO_MIN_FRAC\)/g) ?? [];
        assert(hits.length >= 3,
          `startup-probe / hot-open / keypress-latency 三处回显判定都必须用 ECHO_MIN_FRAC（实测只找到 ${hits.length} 处）`);
      }
      assert(/echoDetectMaxFrac/.test(hs), 'helper 必须报出 echoDetectMaxFrac（回显判据的自证字段）');
      {
        // 反例锁：detect 分支不得直接用 pixelDiff（会重新引入错误分母）
        const i = hs.indexOf('case .detect:');
        assert(i >= 0, 'helper 缺少 detect 分支');
        if (i >= 0) {
          const body = hs.slice(i, i + 1400);
          assert(!/[^P]pixelDiff\(/.test(body.replace(/pixelDiffPair\(/g, '')),
            'detect 分支不得直接用 pixelDiff（其分母取自单一帧的几何，帧几何变化时会得到 changed > total）');
          assert(/pixelDiffPair\(/.test(body), 'detect 分支必须用 pixelDiffPair 计算变化比例');
        }
      }
      // canary：自检上述反例锁
      const PIXEL_DIFF_SAMPLE = 'let d = ' + 'pixelDiff(base, buf)';
      const i2 = hs.indexOf('case .detect:');
      if (i2 >= 0 && !/[^P]pixelDiff\(/.test(PIXEL_DIFF_SAMPLE.replace(/pixelDiffPair\(/g, ''))) {
        errors.push('pixelDiffPair 反例锁 canary 失效：裸 pixelDiff 样本未被检出');
      }
      // 反例锁：需要合成按键的命令必须走 activateAndEnsureInput，不得裸调 activateApp
      for (const fn of ['cmdStartupProbe', 'cmdKeypressLatency', 'cmdHotOpenProbe']) {
        const i = hs.indexOf(`func ${fn}(`);
        assert(i >= 0, `helper 缺少 ${fn}`);
        if (i >= 0) {
          const body = hs.slice(i, i + 900);
          assert(/activateAndEnsureInput\(/.test(body),
            `${fn} 必须用 activateAndEnsureInput（激活后重新断言输入源），不得裸调 activateApp`);
        }
      }
      // canary：自检该反例锁
      const BARE_ACTIVATE_SAMPLE = 'func cmdStartupProbe(pid: Int32) async {\n  activateApp(pid: pid)\n}';
      const i = BARE_ACTIVATE_SAMPLE.indexOf('func cmdStartupProbe(');
      if (!/activateAndEnsureInput\(/.test(BARE_ACTIVATE_SAMPLE.slice(i, i + 900))) {
        // 预期：裸调样本「不含」activateAndEnsureInput → 锁能检出
      } else {
        errors.push('输入源断言反例锁 canary 失效：裸 activateApp 样本未被检出');
      }
    }
  }
}

for (const observation of ledger.patchObservations ?? []) {
  assert(observation.version !== '1.14.9', `补丁观察 ${observation.version} 不应重复规范基线`);
  assert(/不可替代规范验收基线/.test(observation.purpose ?? ''), `补丁观察 ${observation.version} 必须声明其非规范性`);
  const patchEvidenceAbs = resolve(root, observation.evidence ?? '');
  assert(typeof observation.evidence === 'string' && existsSync(patchEvidenceAbs), `补丁观察 ${observation.version} 的证据不存在`);
  assert(!statSync(patchEvidenceAbs).isDirectory(),
    `补丁观察 ${observation.version} 的证据必须指向文件而非目录：${observation.evidence}`);
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
    const evidenceAbs = resolve(root, evidence);
    assert(existsSync(evidenceAbs), `${item.id} 的证据不存在：${evidence}`);
    // 证据必须是**文件**，不能是目录（2026-09-30 新增）。
    // 立此条的原因：`existsSync` 对目录同样返回 true，于是「指向一个目录」也算通过 ——
    // 而目录**不可核对**（你不知道里面哪一份、也不知道它是否还在）。
    // 实测抓到两处：`P0-I18N-001 → packages/i18n`、`P0-PLATFORM-001 → tests/qualification/evidence`
    // —— 与 2026-09-29 审计记录的是同一类「看起来像证据的弱引用」
    // （⚠️ 2026-10-09 审计 §4.219：原文把该引用写成**审计文档的 4.1 节**，但审计日志**从 `## 4.3` 起**
    //   ⇒ 悬空引用；改为**给可核对处**：该审计文档的「四、追加发现」节有 2026-09-30 的复核记录。
    //   ⚠️ 此处**刻意不复现**那个不存在的字面量 —— 复现会被判据当场命中，见 PITFALLS §4.237），
    // 当时只补了具体文件、**没有把目录引用摘掉**，也没有护栏防复发。
    assert(!statSync(evidenceAbs).isDirectory(),
      `${item.id} 的证据必须指向文件而非目录：${evidence}（目录不可核对；请改引具体制品）`);
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
// 覆盖下限取**当前基线 50**（V7-W0 扩容目标）：此前写 45，意味着删掉 5 项也不会报错 —— 覆盖型下限一旦宽松，成员就会悄悄消失。
// [覆盖型] 基线 50 —— 阈值必须 == 当前值（skill §2）
assert(ids.size >= 50, `台账必须覆盖至少 50 个 P0 项（当前 ${ids.size}；V7-W0 扩容后基线即 50）`);
for (const domain of ['file', 'layout', 'feature', 'build']) {
  assert(domains.has(domain), `台账缺少 V7-W0 新增域：${domain}`);
}

// ── `AUTO` 项必须引用 CI 可执行证据（2026-09-29）─────────────────────────
//
// 立此条的原因：master-plan §4.3 定义 `AUTO` = 「**自动化测试通过**，未完成真机体验验收」，
// 且发布门禁把 `AUTO` 视为**不阻断** —— 即 `AUTO` 是「靠自动化撑着」的闭环状态。
// 实测审计发现 **7 项 AUTO 的 evidence 数组里没有任何 CI 可执行制品**：
// 只引 docs / qualification 记录，其中 5 项引的是 `tests/e2e/*.mjs`
// —— 而 e2e **不进 CI**（会悄悄腐烂）。即「标了 AUTO，却没有自动化证据」。
//
// 其中 6 项其实**有** CI 执行的单测（i18n / export / themes / desktop-ui /
// app-core 的 fileTree·fileList·fileOpHistory / editor-engine 的 source-mode-api），
// 只是台账没引用 —— 引用缺位会让证据看起来比实际弱，且把读者指向**最弱、会腐烂**的制品。
//
// 本护栏要求：**AUTO 项的 evidence 必须至少引用一份 CI 可执行制品**
// （parity 护栏 / 单测文件（含 Rust 的 `tests/`）/ CI workflow）。
// 非 AUTO 项不约束 —— 例如 P0-QA-001 是人工 UX Gate，本就无可执行证据，属正确状态。
{
  const isCIArtifact = (p) => p.startsWith('tests/parity/')
    || p.startsWith('.github/workflows/')
    || /\/tests?\//.test(p)
    || /\.test\.|\.spec\./.test(p);
  const offenders = (ledger.items ?? []).filter(
    (i) => i.status === 'AUTO' && !(i.evidence ?? []).some(isCIArtifact),
  );
  assert(offenders.length === 0,
    `AUTO 项必须引用至少一份 CI 可执行证据（AUTO 的定义是「自动化测试通过」，`
    + `而门禁把它视为不阻断）。违规项：${offenders.map((i) => i.id).join(', ')}`);
  // canary：自检该判定（样本拼接构造，避免护栏检出自己）
  const CI_SAMPLE = 'packages/i18n/test/' + 'index.test.ts';
  const E2E_SAMPLE = 'tests/e2e/' + 'sidebar-verify.mjs';
  if (!isCIArtifact(CI_SAMPLE)) errors.push('AUTO 证据护栏 canary 失效：单测样本未被判为 CI 制品');
  if (isCIArtifact(E2E_SAMPLE)) errors.push('AUTO 证据护栏 canary 失效：e2e 样本被误判为 CI 制品');
}

// canary：自检「证据不得指向目录」的判定（2026-09-30；样本拼接构造，避免护栏检出自己）
{
  const DIR_SAMPLE = 'packages/' + 'i18n';
  const FILE_SAMPLE = 'package' + '.json';
  if (!existsSync(resolve(root, DIR_SAMPLE)) || !statSync(resolve(root, DIR_SAMPLE)).isDirectory()) {
    errors.push('证据目录锁 canary 失效：目录样本未被识别为目录');
  }
  if (statSync(resolve(root, FILE_SAMPLE)).isDirectory()) {
    errors.push('证据目录锁 canary 失效：文件样本被误判为目录');
  }
}

// ── 夹具尺寸必须**恰好**落在阈值两侧（2026-10-01）────────────────────────────
// 立此条的原因：报告里有一条**反直觉结论** —— 「5MB.md 恰好压线却不降级，反而比 10MB 慢」，
// 而它成立**完全依赖**「5MB.md 的字节数恰好等于阈值」这一事实。此前护栏只锁了
// **阈值语义**（PRD §109 ↔ largeFile.ts ↔ benchmark 复刻 三方一致 + core.ts 内联第四处），
// **没有锁夹具尺寸与阈值的关系** —— 若有人把生成器改成 `5 * 1024 * 1024 + 1`，
// 或把夹具换成「约 5MB 不必精确」，那条结论会**静默变成假话**，而所有护栏仍绿。
// 这正是「数字无人校验」：spec §4 逐行写了尺寸，却没人把它与生成器对上。
// 本块**自包含**（不依赖上文块作用域里的 srcBytes / evalArith）。
{
  const lfSrc = readFileSync(resolve(root, 'packages/editor-engine/src/largeFile.ts'), 'utf8').replace(/\r\n/g, '\n');
  const arith = (expr) => {
    const cleaned = String(expr).replace(/_/g, '');
    if (!/^[\d*\s]+$/.test(cleaned)) return null; // 只接受纯算术，不做 eval
    return cleaned.split('*').map((s) => Number(s.trim())).reduce((a, b) => a * b, 1);
  };
  const thrBytes = arith((lfSrc.match(/LARGE_FILE_BYTES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  const thrLines = arith((lfSrc.match(/LARGE_FILE_LINES_THRESHOLD\s*=\s*([\d_*\s]+);/) ?? [])[1] ?? '');
  assert(Number.isFinite(thrBytes) && Number.isFinite(thrLines), '无法从 largeFile.ts 解析两阈值（夹具尺寸锁的前提）');

  const genSrc = readFileSync(resolve(root, 'tests/benchmark/generate-fixtures.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const targetOf = (name) => {
    const m = genSrc.match(new RegExp(`name:\\s*'${name.replace('.', '\\.')}'[^\\n]*genMixed\\(([^)]*)\\)`));
    return m === null ? null : arith(m[1]);
  };
  const b1 = targetOf('1MB.md');
  const b5 = targetOf('5MB.md');
  const b10 = targetOf('10MB.md');
  assert(Number.isFinite(b1) && Number.isFinite(b5) && Number.isFinite(b10),
    '无法从 generate-fixtures.mjs 解析 1MB/5MB/10MB 的字节目标（生成器形态变了，护栏需同步更新）');
  if (Number.isFinite(thrBytes) && Number.isFinite(b5)) {
    assert(b5 === thrBytes,
      `5MB.md 的字节目标（${b5}）必须**恰好等于** LARGE_FILE_BYTES_THRESHOLD（${thrBytes}）——`
      + '「恰好压线却不降级」这条结论的唯一依据；不等则报告的反直觉结论会静默失真');
  }
  if (Number.isFinite(thrBytes) && Number.isFinite(b10)) {
    assert(b10 > thrBytes, `10MB.md 的字节目标（${b10}）必须**严格大于**字节阈值（${thrBytes}）才能触发大文件模式`);
  }
  if (Number.isFinite(thrBytes) && Number.isFinite(b1)) {
    assert(b1 < thrBytes, `1MB.md 的字节目标（${b1}）必须**小于**字节阈值（${thrBytes}）`);
  }
  // 「恰好」是靠机制保证的，不是靠运气：`genMixed` 必须收口到 `padToExact`
  // （只断言「存在 padToExact 函数」会被定义处满足 —— 必须断言**调用**）
  assert(/return padToExact\(out, targetBytes\)/.test(genSrc),
    'genMixed 必须收口到 padToExact(out, targetBytes)：否则夹具只是「约等于」，'
    + '「恰好压线」不成立（断言调用而非函数存在）');
  // 行数阈值侧：100k-lines.md 必须严格大于行数阈值才能触发大文件模式
  // 该夹具走**具名函数**（`make: genLines100k`），故先取函数名、再进函数体找循环上界
  // —— 不依赖「表项与循环相邻」这个会随重构失效的假设。
  const fnM = genSrc.match(/name:\s*'100k-lines\.md'[^\n]*make:\s*([A-Za-z_$][\w$]*)/);
  const fnName = fnM === null ? null : fnM[1];
  const bodyM = fnName === null
    ? null
    : genSrc.match(new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert(bodyM !== null,
    `无法从 generate-fixtures.mjs 解析 100k-lines.md 的生成函数（${fnName ?? '未解析到函数名'}）—— 生成器形态变了，护栏需同步更新`);
  const loopM = bodyM === null ? null : bodyM[1].match(/i\s*<\s*([\d_]+)/);
  const genLines = loopM === null ? null : Number(loopM[1].replace(/_/g, ''));
  assert(Number.isFinite(genLines), '无法从 100k-lines.md 的生成函数里解析循环上界（行数目标）');
  if (Number.isFinite(genLines) && Number.isFinite(thrLines)) {
    assert(genLines > thrLines,
      `100k-lines.md 的行数目标（${genLines}）必须**严格大于**行数阈值（${thrLines}）才能触发大文件模式`);
  }
  // canary：用**同一套比较语义**跑合成输入（直接测逻辑，不测字符串替换）
  const isExactlyBoundary = (fixtureBytes, threshold) => fixtureBytes === threshold;
  const triggersLargeMode = (fixtureBytes, threshold) => fixtureBytes > threshold;
  if (!isExactlyBoundary(5242880, 5242880)) errors.push('夹具尺寸锁 canary 失效：相等的样本未被判为「恰好压线」');
  if (isExactlyBoundary(5242881, 5242880)) errors.push('夹具尺寸锁 canary 失效：压线偏大的样本被误判为「恰好压线」');
  if (!triggersLargeMode(10485760, 5242880)) errors.push('夹具尺寸锁 canary 失效：超阈值样本未被判为「触发」');
  if (triggersLargeMode(5242880, 5242880)) errors.push('夹具尺寸锁 canary 失效：压线样本被误判为「触发」');
}

// ── Rust 单测「空壳」检查的共用工具（2026-10-01）──────────────────────────────
// ⚠️ **必须先剥注释再断言**（skill §4）—— 实测自伤：文件里那条「解释空壳形态」的
// doc comment 原样引用了被禁止的写法，于是反例锁**首跑即误报**。
// 这是本会话第三次踩「护栏匹配到散文」（前两次：shell 注释里的 `${TMPDIR}`、
// 台账文本里被 shell 展开的反引号）。
// 限制（如实声明）：剥离器不区分字符串/正则里的 `//`；被扫文件目前不含这类字面量。
const stripRustComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// 抽取 `#[test] fn name() { … }` 的函数体 —— 用**花括号计数**而不是固定缩进的收尾锚点。
// 为什么：首版写成 `…\{([\s\S]*?)\n        \}`（锚死 8 空格），而新增的 `mod platform_contract`
// 在 4 空格缩进下 → **漏解析**。元护栏当场报出「源码有 9 处、只解析出 7 个」——
// 这正是元护栏存在的意义（skill 铁律 3）。
// 限制：花括号计数不区分字符串里的 `{`；Rust 格式占位符（如 `{guesses:?}`）成对出现故净零。
const extractRustTests = (src) => {
  const out = [];
  const re = /#\[test\]\s*\n\s*fn\s+(\w+)\s*\(\)\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ name: m[1], body: src.slice(start, i - 1) });
  }
  return out;
};

const walkRustFiles = (dir) => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkRustFiles(`${dir}/${e.name}`) : e.name.endsWith('.rs') ? [`${dir}/${e.name}`] : []);

// ── 类别级：整个 Rust crate 不得出现「函数体只有 `let _ = f(...);`」的恒真空壳（2026-10-01）──
// 立此条的原因：这一形态在 `spellcheck.rs`（`let _ = suggest("recieve");`）与
// `pandoc.rs`（`let _ = pandoc_available();`）**各出现一次** —— 而台账/文档都会写
// 「Rust 侧有测试」并且**这句话为真**，于是没有人再去核对「那条测试到底验了什么」。
// 按「修一处必须加类别级护栏」的纪律，这里锁**整个 crate**，而不只是出问题的那两个文件。
{
  const shells = [];
  let scanned = 0;
  for (const f of walkRustFiles('apps/desktop/src-tauri/src')) {
    const src = stripRustComments(readFileSync(resolve(root, f), 'utf8').replace(/\r\n/g, '\n'));
    for (const t of extractRustTests(src)) {
      scanned += 1;
      // 只匹配「整个函数体就是一次把结果丢掉的调用」这一**精确**形态（避免误报委托 helper 的测试）
      if (/^let _ = \w+\([^;]*\);$/.test(t.body.replace(/\s+/g, ' ').trim())) {
        shells.push(`${f.replace('apps/desktop/src-tauri/src/', '')}::${t.name}`);
      }
    }
  }
  // 覆盖型下限**等于当前基线**（skill：下限比基线小就会留下「悄悄消失」的空位）。
  // ⚠️ 2026-10-09（审计 §4.168）：注释原写「2026-10-01 实测基线：74」，而**实际已 81** ⇒
  //   阈值 74 留了 7 个空位（用「抬 1 仍绿」二分实测）。现同步为 **81**。
  // [覆盖型] 基线 81 —— 阈值必须 == 当前值（skill §2）
  assert(scanned >= 81, `Rust 单测扫描面异常（只扫到 ${scanned} 个用例，2026-10-09 实测基线 81）—— 解析可能失效，护栏需同步`);
  assert(shells.length === 0,
    `Rust 单测出现「函数体只有 let _ = f(...)」的恒真空壳（不 panic 即通过，断言本体不检查任何东西）：`
    + `${shells.join(', ')} —— 请改为真断言（先自证「读到了东西」+ 断言用户可见不变量）`);
  // canary：用同一套判定跑合成样本，两个方向都要正确
  const SHELL = '#[test]\n        fn x() {\n            let _ = f(1);\n        }';
  const REAL = '#[test]\n        fn y() {\n            let _ = f(1);\n            assert!(true);\n        }';
  const isShell = (body) => /^let _ = \w+\([^;]*\);$/.test(body.replace(/\s+/g, ' ').trim());
  const s1 = extractRustTests(SHELL);
  const s2 = extractRustTests(REAL);
  if (s1.length !== 1 || !isShell(s1[0].body)) {
    errors.push('Rust 空壳测试护栏 canary 失效：空壳样本未被判为恒真空壳');
  }
  if (s2.length !== 1 || isShell(s2[0].body)) {
    errors.push('Rust 空壳测试护栏 canary 失效：带断言的真测试被误判为空壳');
  }
}

// ── P0-EDITOR-005：拼写建议的测试**不得是空壳**（2026-10-01）──────────────────
// 立此条的原因：`spellcheck.rs` 里那条 `suggest_returns_guesses_for_misspelling`
// **长期是恒真空壳** —— 函数体只有 `let _ = suggest("recieve");`（「不 panic 即通过」），
// 而测试名声称「returns guesses」。于是「**真实** NSSpellChecker 是否真的给建议」
// 从未被任何机器验证过（台账 P0-EDITOR-005 的 `runtime-verification-pending` 缺口有一半在此；
// 另一半是应用侧 e2e `tests/e2e/spellcheck-suggestions-verify.mjs`）。
// 判据沿用本仓反复出现的形态：**测试名与注释是「声称」，断言本体才是「守护」**。
{
  const spellPath = 'apps/desktop/src-tauri/src/spellcheck.rs';
  if (existsSync(resolve(root, spellPath))) {
    const spell = stripRustComments(readFileSync(resolve(root, spellPath), 'utf8').replace(/\r\n/g, '\n'));
    // ① 该文件不得再出现「把调用结果丢掉」的空壳形态
    assert(!/let\s+_\s*=\s*suggest\s*\(/.test(spell),
      'spellcheck.rs 出现 `let _ = suggest(...)` 空壳形态（只验「不 panic」，不验行为）—— 请改为真断言');
    // ② 抽取每个 #[test] 的函数体
    const testBodies = extractRustTests(spell);
    // 元护栏（铁律 3）：解析到的数量必须等于源码里 #[test] 的出现次数 —— 漏解析即响亮失败
    const declaredTests = (spell.match(/#\[test\]/g) ?? []).length;
    assert(testBodies.length === declaredTests,
      `spellcheck.rs 的 #[test] 解析不完整：源码有 ${declaredTests} 处，只解析出 ${testBodies.length} 个 —— 形态变了，护栏需同步`);
    // [覆盖型] 基线 9 —— 自述「**是否被误删？**」⇒ 阈值必须 == 当前值（skill §2）
    // ⚠️ 2026-10-09（审计 §4.168）：原写 8，而 `spellcheck.rs` 实际有 **9** 个 `#[test]`
    //   （用「抬 1 仍绿」二分实测）⇒ 留了 1 个空位。
    assert(testBodies.length >= 9, `spellcheck.rs 的 #[test] 过少（${testBodies.length}，2026-10-09 基线 9）—— 是否被误删？`);
    // ③ 每个测试都必须至少含一个断言（防「不 panic 即通过」）
    for (const t of testBodies) {
      assert(/assert/.test(t.body), `spellcheck.rs 的测试 ${t.name} 不含任何断言（空壳：不 panic 即通过）`);
    }
    // ④ 建议测试必须**先自证读到了东西**（skill §12：空输入上的断言恒真）+ 断言用户可见不变量
    const sugg = testBodies.find((t) => t.name === 'suggest_returns_guesses_for_misspelling');
    assert(sugg !== undefined, 'spellcheck.rs 缺少 suggest_returns_guesses_for_misspelling 测试');
    if (sugg !== undefined) {
      assert(/assert!\s*\(\s*!guesses\.is_empty\(\)/.test(sugg.body),
        '建议测试必须**先自证「读到了东西」**（assert!(!guesses.is_empty())）—— 否则系统词典缺失时该测试恒绿');
      assert(/eq_ignore_ascii_case\("receive"\)/.test(sugg.body),
        '建议测试必须断言建议里含正确拼写 receive（用户可见不变量），只断言「非空」仍可能被无关词满足');
    }
    // ⑤ 平台判定必须是**可两端测试的纯函数**（2026-10-01）
    // 立此条的原因：`spellcheck_available()` 的返回值决定宿主**是否显示拼写区**（用户可见行为），
    // 而若直接写成 `cfg!(target_os = "macos")`，这条分支**只能在非 macOS 上被测** ——
    // macOS 单测全在 `cfg(target_os = "macos")` 里 → **两端各自只有一半平台能验**
    // （本地永远验不到 false，ubuntu CI 永远验不到 true）。
    assert(/const fn spellcheck_supported_on\(is_macos: bool\) -> bool/.test(spell),
      'spellcheck.rs 必须把平台判定抽成纯函数 spellcheck_supported_on(is_macos) —— '
      + '否则「非 macOS 不显示拼写区」这条用户可见行为在本地（macOS）永远无法断言');
    assert(/spellcheck_supported_on\(cfg!\(target_os = "macos"\)\)/.test(spell),
      'spellcheck_available() 必须委托给 spellcheck_supported_on(...)，不得内联 cfg!（否则纯函数与真实命令可各自漂移）');
    assert(/assert!\(\s*!spellcheck_supported_on\(false\)/.test(spell)
      && /assert!\(spellcheck_supported_on\(true\)/.test(spell),
      '平台判定纯函数必须**两个取值都被断言**（false → 无词典能力；true → 有）—— 只锁一侧等于没锁');
    // ⑥ 必须有端到端一致性断言（纯函数 ↔ 真实命令），否则两边可各自漂移而纯函数测试仍全绿
    assert(/super::spellcheck_available\(\)[\s\S]{0,120}?cfg!\(target_os = "macos"\)/.test(spell),
      '必须有断言把 spellcheck_available() 与 cfg!(target_os = "macos") 绑在一起（端到端一致性）');

    // canary：用**同一套抽取逻辑**跑合成输入（直接测逻辑，不测字符串替换）
    //   ① 8 空格缩进（`mod tests` 内）② 4 空格缩进（`mod platform_contract` 内）
    //   —— 后者正是首版固定缩进锚点漏掉的那一类。
    const SHELL8 = '#[test]\n        fn x() {\n            let _ = suggest("recieve");\n        }';
    const REAL4 = '#[test]\n    fn y() {\n        assert!(true);\n    }';
    const shell8 = extractRustTests(SHELL8);
    const real4 = extractRustTests(REAL4);
    if (shell8.length !== 1 || /assert/.test(shell8[0].body)) {
      errors.push('拼写测试空壳护栏 canary 失效：空壳样本未被判为「无断言」');
    }
    if (real4.length !== 1 || !/assert/.test(real4[0].body)) {
      errors.push('拼写测试空壳护栏 canary 失效：4 空格缩进的真测试未被正确解析/被误判为无断言');
    }
    // canary：花括号计数必须能跨过多行断言体（含成对格式占位符）
    const MULTI = '#[test]\n        fn z() {\n            assert!(\n                !v.is_empty(),\n                "实际：{v:?}"\n            );\n        }';
    const multi = extractRustTests(MULTI);
    if (multi.length !== 1 || !/is_empty/.test(multi[0].body)) {
      errors.push('拼写测试空壳护栏 canary 失效：多行断言体（含格式占位符）未被正确抽取');
    }
  }
}

// ── e2e 里**硬编码的契约值**必须与真值源一致（2026-10-01）──────────────────
// 立此条的原因：`tests/e2e/` **不进 CI**（其 README 明说），因此它们硬编码的快捷键 /
// 菜单标签 / 默认值会**静默陈旧**。实测（全量跑 28 个脚本）抓到 **3 处真陈旧**：
//   ① `block-shortcuts-verify.mjs` 仍按 `⌥⌘F` 找替换面板 —— 该键已归 `window.fullscreen`，
//      replace 改成了 `Cmd+Alt+H`（2026-09-13 键位冲突修复，schema 里有取舍说明）；
//   ② `context-menu-verify.mjs` 仍找「格式」子菜单 —— 文本右键已拆为「块样式/内联样式/列表样式」；
//   ③ `feature-liveness-verify.mjs` 断言 `insert.table` 直接插入 —— 该命令已改为**弹创建对话框**。
// 这三处的真值分别由 CI 护栏（menu-contract §11/§13、context-menu-parity）与源码常量承载，
// 故可**在 CI 里交叉核对** —— 把 e2e 的硬编码期望与真值源绑起来，腐烂即报错。
// 判据刻意保持宽松（只断言「该字面量/该结构存在」），避免退化成形状锁。
{
  const readE2e = (n) => {
    const p = `tests/e2e/${n}`;
    assert(existsSync(resolve(root, p)), `e2e 脚本缺失：${p}（护栏依赖它存在）`);
    return existsSync(resolve(root, p)) ? readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n') : '';
  };
  const schemaSrc = readFileSync(resolve(root, 'packages/commands/src/menuSchema.ts'), 'utf8').replace(/\r\n/g, '\n');
  const appSrc = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const i18nSrc = readFileSync(resolve(root, 'packages/i18n/src/messages.ts'), 'utf8').replace(/\r\n/g, '\n');

  // ① 替换面板的 mac 键位：e2e 按下的键必须等于 menuSchema 里 search.replace 的 mac 键
  //    （Playwright 写 `Meta`，schema 写 `Cmd`）
  const replaceKey = /id:\s*'search\.replace'[^\n]*mac:\s*'([^']+)'/.exec(schemaSrc)?.[1];
  assert(replaceKey !== undefined, '无法从 menuSchema.ts 解析 search.replace 的 mac 键位（护栏需同步）');
  if (replaceKey !== undefined) {
    const pwKey = replaceKey.replace('Cmd', 'Meta');
    const bs = readE2e('block-shortcuts-verify.mjs');
    assert(bs.includes(`'${pwKey}'`),
      `block-shortcuts-verify.mjs 必须用 ${pwKey} 触发替换面板（menuSchema 的 search.replace mac 键 = ${replaceKey}）`
      + ' —— e2e 不进 CI，硬编码键位会静默陈旧（实测曾长期按已改归全屏的 ⌥⌘F）');
  }
  // ② 文本右键的「内联样式」子菜单：e2e 找的标签必须等于 i18n 真值，且加粗确实在该子菜单里
  const inlineLabel = /'contextmenu\.textInlineStyles':\s*'([^']+)'/.exec(i18nSrc)?.[1];
  assert(inlineLabel !== undefined, '无法从 i18n 解析 contextmenu.textInlineStyles 的中文标签');
  if (inlineLabel !== undefined) {
    // ⚠️ 判据必须落在**查找形态**上，不能只判「文件里含该标签」，也不能只判「行里有 ===」——
    // 两次实测自伤：① 首版 `.includes(label)` 被**失败消息字符串**满足（`check('菜单含「内联样式」…')`）；
    // ② 改成「行里含 findIndex|.includes(|===」后，`check(…, clicked && text === '**hello**', …)`
    //    这一行也命中（`===` 出现在**断言参数**里，与查找无关）。
    // 现按**精确查找形态**判定：`.includes('<label>')` 或 `=== '<label>'`。
    // 若日后改了查找写法，本护栏会响亮失败并提示同步（不是静默放过）。
    const cmSrc = readE2e('context-menu-verify.mjs');
    const usesLabel = new RegExp(`\\.includes\\(\\s*['"]${inlineLabel}['"]|===\\s*['"]${inlineLabel}['"]`);
    assert(usesLabel.test(cmSrc),
      `context-menu-verify.mjs 必须**按查找形态**匹配当前子菜单标签「${inlineLabel}」`
      + '（形如 `.includes(\'…\')` 或 `=== \'…\'`；文本右键已拆为 块样式/内联样式/列表样式）——'
      + '只出现在消息字符串里不算');
    assert(/contextmenu\.textInlineStyles[\s\S]{0,400}?menu\.format\.bold/.test(appSrc),
      'App.tsx 的「内联样式」子菜单必须含加粗（contextmenu.textInlineStyles → menu.format.bold）');
  }
  // ③ `insert.table` 的行为契约：必须走创建对话框（e2e 的表格块据此断言对话框）
  assert(/id:\s*'insert\.table'[^\n]*insertTableWithDialog/.test(appSrc),
    "insert.table 必须走创建对话框（insertTableWithDialog）—— 若改回直接插入，"
    + 'e2e 的表格对话框块会失效（该行为由 table-editing-spec §3 规定）');
  {
    const fl = readE2e('feature-liveness-verify.mjs');
    assert(/insert\.table/.test(fl) && /INPUT_DIALOG_SELECTORS\.input/.test(fl),
      'feature-liveness-verify.mjs 必须覆盖表格创建对话框（dispatch insert.table + 应用内对话框选择器）——'
      + ' 不要用 page.on(\'dialog\')（应用内对话框不触发原生事件）');
  }
  // ④ e2e 不得写入**归档证据目录**（2026-10-01）
  // 立此条的原因：`theme-verify.mjs` 原先把 3 张截图写进 `tests/benchmark/screenshots/`
  // —— 那是**归档证据目录**（同目录的 `capture-window-chrome.mjs` 是**带 manifest 的正式归档工具**，
  // 且 `p2-8-window-chrome-macos.png` 被台账 `P0-LAYOUT-002` 引用为证据）。
  // 于是**每跑一次 e2e 就覆盖被 git 跟踪的证据文件**，而全仓没有任何地方读那 3 张图 ——
  // 跑一次就产生一个二进制 diff，极易被 `git add -A` 误提交（实测本人已踩一次）。
  // 判据：`tests/e2e/*.mjs` 不得出现「向该目录写截图」的调用；
  // 运行期产物应落到被忽略的 `tests/e2e/.artifacts/`。
  {
    const e2eFiles = readdirSync(resolve(root, 'tests/e2e')).filter((f) => f.endsWith('.mjs'));
    const writeRe = /screenshot\(\s*\{\s*path:\s*['"`]tests\/benchmark\/screenshots/;
    const offenders = e2eFiles
      .filter((f) => writeRe.test(readFileSync(resolve(root, `tests/e2e/${f}`), 'utf8')))
      .sort();
    assert(offenders.length === 0,
      `e2e 脚本不得把截图写进归档证据目录 tests/benchmark/screenshots/：${offenders.join(', ')}`
      + ' —— 该目录是证据归档（带 manifest，且被台账引用）；e2e 的运行期产物请落到被忽略的 tests/e2e/.artifacts/');
    // canary：合成违规样本必须被检出
    const SAMPLE = "await page.screenshot({ path: 'tests/benchmark/screenshots/x.png' });";
    if (!writeRe.test(SAMPLE)) {
      errors.push('归档目录写入护栏 canary 失效：违规样本未被检出');
    }
    if (writeRe.test("await page.screenshot({ path: shot('x.png') });")) {
      errors.push('归档目录写入护栏 canary 失效：合规样本被误判为违规');
    }
  }

  // canary：把真值源里的键位换掉，上面的判定必须翻红（用同一套比较逻辑跑合成输入）
  {
    const synth = (schemaKey, e2eKey) => schemaKey.replace('Cmd', 'Meta') === e2eKey;
    if (!synth('Cmd+Alt+H', 'Meta+Alt+H')) {
      errors.push('e2e 契约值交叉锁 canary 失效：一致的样本未被判为一致');
    }
    if (synth('Cmd+Alt+F', 'Meta+Alt+H')) {
      errors.push('e2e 契约值交叉锁 canary 失效：不一致的样本未被检出（护栏已失效）');
    }
  }
}

// ── 引擎侧主题 token：按**可达性**判定（2026-10-01 升级；原版按**前缀**）──────────
//
// 【为什么升级】原版判据是前缀（`--mellow-md-*` ⇒ 会跨 iframe）。盲区：
// `var(--mellow-md-X, fallback)` 若 X **既不在 `MD_TOKEN_DEFAULTS`、也不在主题基表**，
// 同样**恒取 fallback**，但前缀是 md → 原护栏**看不见**。
// 实测即抓到 `--mellow-md-list-bullet`（`plugin.ts` 消费；两端都没定义）——已补入两端。
//
// 【不变的前提】`mdTokens.ts` 的 `setTokenProperties` 显式过滤 `if (key.startsWith('--mellow-md-'))`，
// 其文件头亦自述「编辑器运行在独立 iframe（独立 document），宿主的 `--mellow-*` 变量不会自动继承」。
// 即：宿主（`App.tsx` applyTheme）把主题变量设在 **app 根**上，而 iframe 只拿到 **md** 那一批。
//
// 【实测证据】探针 `tests/e2e/theme-follow-probe.mjs`（app 侧 `data-theme=mellow-dark`、
// `--mellow-toolbar-bg=rgba(40,40,42,.95)`）：
//   · iframe 根上非 md 变量**全为空**；
//   · 选区浮动工具栏计算背景 = `rgba(30,30,30,0.92)` = **fallback**（≠ app 的 `rgba(40,40,42,.95)`）；
//   · 表格工具栏 `bg = rgba(255,255,255,0.92)` → **暗色主题下是白底**
//     （`table/toolbar.ts` 15 处硬编码色、一个主题变量都没用）。
// 【一手基线】Typora 的 `.ty-table-edit` **每个主题显式上色**（`base-control.css` 基线 `background:0 0`
// 透明；`themes/night.css` = `background-color:#363B40`，恰等于该主题 `--bg-color`；gothic/pixyll/whitey
// = `#ededed`；newsprint = `transparent`）→ 「表格工具栏跟随主题」是**既定行为**，Mellow 的暗色白底属缺口。
//
// 【判据（三条，全部双向）】
//   R1 可达性：引擎里每个 `var(--mellow-X, …)` 必须可达 ——
//      · X 为 md 前缀 → 必须**同时**出现在 `MD_TOKEN_DEFAULTS` 与主题基表（`packages/themes/src/index.ts`）；
//      · X 为非 md → 必须在 `ENGINE_THEME_VARS_INERT` 登记（它们承载「想跟随主题」的意图，
//        正解是**拓宽 token 桥**，属**设计决策** → 见 ADR-0027）。
//   R2 两端同锁：`MD_TOKEN_DEFAULTS` 的 md 键集合 ≡ 主题基表的 md 键集合（防一端加了、另一端忘）。
//   R3 防死 token：`MD_TOKEN_DEFAULTS` 里**引擎从不消费**的键必须在 `MD_TOKENS_UNUSED` 登记。
const ENGINE_THEME_VARS_INERT = [
  '--mellow-accent', '--mellow-bg-hover', '--mellow-border', '--mellow-danger',
  '--mellow-toolbar-bg', '--mellow-toolbar-fg',
];
// 在 token 表里、但引擎源码从不消费的 md token（登记 + 原因；新增即失败，防死 token 静默堆积）。
const MD_TOKENS_UNUSED = [
  // 正文色：`MD_TOKEN_DEFAULTS` 与主题基表都有，但**引擎源码从不读它**（扫描确认）。
  // 文档化用途是 Typora 的 `body{color:rgb(51,51,51)}`（master-plan §3 真值表）；
  // 实际正文色由 CoreEditor 主题（`App.tsx` 的 `setTheme(activeTheme.editorTheme)`）提供。
  // 保留而非删除：删除属**主题面**变更，且它可能是后续「引擎自持正文色」的预留接线点。
  '--mellow-md-fg',
];
// R4：**宿主侧**（非 md）token 里「宿主与引擎都不消费」的（登记 + 原因；新增即失败）。
// 与 MD_TOKENS_UNUSED 同一处置逻辑（ADR-0027 Q3=C1）：**删除属主题面变更、接线属外观变更**
// ⇒ 一律**登记**而不是自行删/接。
const HOST_TOKENS_UNUSED = [
  // SDI 迁移删掉标签栏后的**化石**：基表 + 5 个具名主题共 7 处声明，全仓零 `var()` 消费。
  // 保留而非删除：删除属主题面变更；且它是「若将来恢复多标签」的现成接线点。
  '--mellow-tab-underline',
  // 警告家族里**唯一没接线**的成员：`warning-bg` / `warning-border` / `warning-btn` 都在
  // `apps/desktop/src/styles.css` 的 `.recovery-bar` / 提示条里被消费，只有 `-fg` 没有。
  // 现状不算缺陷：`.recovery-bar` 未设 `color` ⇒ 继承 `--mellow-fg`，在警告底色上可读。
  // 接线会**改变文字颜色**（属外观变更）⇒ 登记待裁决，不自行改。
  '--mellow-warning-fg',
  // 同理：`.mellow-reader-mermaid` 用 `--mellow-mermaid-bg` 作底色，但边框用的是
  // `--mellow-border-strong` 而非本 token ⇒ 主题里这个边框色**改不动**。
  '--mellow-mermaid-border',
];
{
  const ENGINE_SRC2 = 'packages/editor-engine/src';
  const MD_TOKENS_SRC = 'packages/editor-engine/src/mdTokens.ts';
  const THEMES_SRC = 'packages/themes/src/index.ts';
  const MD_PREFIX = '--mellow-md-';
  const walkEngine = (dir, rel = '') => readdirSync(resolve(root, dir, rel), { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walkEngine(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  const engineFiles2 = walkEngine(ENGINE_SRC2);
  const readNorm = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
  const collectVarKeys = (src) => new Set([...src.matchAll(/'(--mellow-[a-z0-9-]+)'\s*:/g)].map((m) => m[1]));

  const mdKeys = collectVarKeys(readNorm(MD_TOKENS_SRC));
  const themeKeys = collectVarKeys(readNorm(THEMES_SRC));

  // 引擎消费的变量（先剥注释：说明这些变量的注释里也写着变量名）
  const used = new Set();
  for (const f of engineFiles2) {
    if (!f.endsWith('.ts')) continue;
    for (const m of stripRustComments(readNorm(`${ENGINE_SRC2}/${f}`)).matchAll(/var\((--mellow-[a-z0-9-]+)/g)) {
      used.add(m[1]);
    }
  }

  // 判定函数**具名且参数化**，canary 复用同一份（避免「canary 测的是副本」——本仓已实测过的失效模式；
  // 参数化才能让 canary 真正验证「登记表清空 ⇒ 判定翻转」，而不是靠另写一份逻辑自证）。
  const classify = (name, ctx = { md: mdKeys, theme: themeKeys, inert: ENGINE_THEME_VARS_INERT }) => {
    if (name.startsWith(MD_PREFIX)) {
      return ctx.md.has(name) && ctx.theme.has(name) ? 'reachable-md' : 'inert-md';
    }
    return ctx.inert.includes(name) ? 'registered-inert' : 'unregistered-non-md';
  };

  const inertMd = [...used].filter((v) => classify(v) === 'inert-md').sort();
  assert(inertMd.length === 0,
    `引擎里有**不可达的 md token**：${inertMd.join(', ')} —— 前缀是 md 能过 setTokenProperties 的过滤，`
    + '但 `MD_TOKEN_DEFAULTS` / 主题基表里没有它 → 仍**恒取 fallback**（等于写了永不生效的开关）。'
    + '修法：补进 `packages/editor-engine/src/mdTokens.ts` 与 `packages/themes/src/index.ts`（亮/暗各一）');
  const unregisteredNonMd = [...used].filter((v) => classify(v) === 'unregistered-non-md').sort();
  assert(unregisteredNonMd.length === 0,
    `引擎里出现**新的非 md 主题变量**：${unregisteredNonMd.join(', ')} —— 它们**永远取 fallback**`
    + '（iframe 只接收 --mellow-md-*，见 mdTokens.ts 的过滤）→ 等于写了一个永不生效的开关；'
    + '若确需主题跟随，应先拓宽 token 桥（设计决策，见 ADR-0027），或在登记表里说明原因');

  // R2：两端同锁（双向）
  const mdOnlyInDefaults = [...mdKeys].filter((k) => !themeKeys.has(k)).sort();
  const mdOnlyInThemes = [...themeKeys].filter((k) => k.startsWith(MD_PREFIX) && !mdKeys.has(k)).sort();
  assert(mdOnlyInDefaults.length === 0,
    `md token 只在 MD_TOKEN_DEFAULTS、不在主题基表：${mdOnlyInDefaults.join(', ')}`
    + ' → 宿主 `setMdTokens(activeTheme.variables)` 传不到它，`applyMdTokens` 会回落默认值，主题改不动它');
  assert(mdOnlyInThemes.length === 0,
    `md token 只在主题基表、不在 MD_TOKEN_DEFAULTS：${mdOnlyInThemes.join(', ')}`
    + ' → 未注入时（桥未就绪 / localStorage 兜底缺失）无 fallback，观感不确定');

  // R3：防死 token
  const dead = [...mdKeys].filter((k) => !used.has(k)).sort();
  const deadAdded = dead.filter((k) => !MD_TOKENS_UNUSED.includes(k));
  const deadGone = MD_TOKENS_UNUSED.filter((k) => !dead.includes(k));
  assert(deadAdded.length === 0,
    `MD_TOKEN_DEFAULTS 里出现**引擎从不消费**的 md token：${deadAdded.join(', ')}`
    + ' → 注入到 iframe 但无人读取（死 token）；要么接线消费，要么在 MD_TOKENS_UNUSED 登记原因');
  assert(deadGone.length === 0,
    `MD_TOKENS_UNUSED 登记表里的项已不再「未使用」：${deadGone.join(', ')} —— 已接线消费，请从登记表删除`);

  // 登记表自身必须非空且无重复（防「清空登记表即全绿」）
  assert(ENGINE_THEME_VARS_INERT.length > 0, 'ENGINE_THEME_VARS_INERT 不得为空（清空即等于放弃该判据）');
  assert(new Set(ENGINE_THEME_VARS_INERT).size === ENGINE_THEME_VARS_INERT.length, 'ENGINE_THEME_VARS_INERT 有重复项');
  assert(new Set(MD_TOKENS_UNUSED).size === MD_TOKENS_UNUSED.length, 'MD_TOKENS_UNUSED 有重复项');

  // ── R4：**宿主侧** token 防死旋钮（2026-10-06 审计 §4.99）────────────────────
  // 【为什么补】R1~R3 只覆盖**引擎**（`--mellow-md-*` + 引擎里的非 md 变量）。
  // 而主题基表里还有一大批**宿主** token（`--mellow-bg` / `--mellow-warning-fg` …）——
  // **「宿主从不读它们」这一半没有任何判据**（典型的「只锁一半」）。
  // 【实测】3 个非 md token 全仓零消费：
  //   · `--mellow-tab-underline` —— **SDI 迁移删掉标签栏后的化石**（基表 + 5 个具名主题共 7 处声明）；
  //   · `--mellow-warning-fg` / `--mellow-mermaid-border` —— 家族里**其余成员都已接线**
  //     （`warning-bg/-border/-btn` 在 `styles.css` 消费；`mermaid-bg` 亦消费），只差这两个。
  // 【为什么不直接删/接线】与 `--mellow-md-fg` 同一理由（ADR-0027 Q3=C1）：
  //   删除属**主题面变更**；接线会**改变外观** ⇒ 属裁决范围。⇒ 登记 + 写明原因。
  // 【判据】主题基表里**每个非 md token** 必须至少在**某处**被消费（宿主或引擎），否则登记；
  //   登记表**双向**（已接线即失败）。
  const HOST_SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', '.workbuddy-ai', 'CoreEditor']);
  const walkSkip = (dir, rel = '') => {
    let entries;
    try { entries = readdirSync(resolve(root, dir, rel), { withFileTypes: true }); } catch { return []; }
    return entries.flatMap((e) => {
      if (e.isDirectory()) {
        if (HOST_SKIP_DIRS.has(e.name)) return [];
        return walkSkip(dir, `${rel}${e.name}/`);
      }
      return [`${rel}${e.name}`];
    });
  };
  const hostUsed = new Set();
  for (const d of ['apps/desktop/src', 'packages']) {
    for (const f of walkSkip(d)) {
      if (!/\.(css|ts|tsx|mts|cts|mjs|cjs|js|jsx)$/.test(f)) continue;
      const p = `${d}/${f}`;
      if (p.includes('packages/themes/src/index.ts')) continue; // 声明处本身不算消费
      if (p.includes('/test/')) continue;
      const src = readNorm(p);
      for (const m of src.matchAll(/var\(\s*(--mellow-[a-z0-9-]+)/g)) hostUsed.add(m[1]);
      for (const m of src.matchAll(/setProperty\(\s*'(--mellow-[a-z0-9-]+)'/g)) hostUsed.add(m[1]);
    }
  }
  const classifyHost = (name, ctx = { host: hostUsed, reg: HOST_TOKENS_UNUSED }) => {
    if (name.startsWith(MD_PREFIX)) return 'md-skip'; // md 归 R3 管，避免双重登记
    if (ctx.host.has(name)) return 'host-consumed';
    return ctx.reg.includes(name) ? 'registered-dead' : 'unregistered-dead';
  };
  const deadHost = [...themeKeys].filter((k) => classifyHost(k) === 'unregistered-dead').sort();
  assert(deadHost.length === 0,
    `主题基表里出现**宿主与引擎都不消费**的 token：${deadHost.join(', ')}`
    + ' —— 主题作者会以为设了生效，实际是个死旋钮。'
    + '要么接线消费，要么在 HOST_TOKENS_UNUSED 登记原因');
  const deadHostGone = HOST_TOKENS_UNUSED.filter((k) => classifyHost(k) !== 'registered-dead');
  assert(deadHostGone.length === 0,
    `HOST_TOKENS_UNUSED 登记表里的项已不再「未消费」：${deadHostGone.join(', ')} —— 请从登记表删除`);
  assert(HOST_TOKENS_UNUSED.length > 0, 'HOST_TOKENS_UNUSED 不得为空（清空即等于放弃该判据）');
  assert(new Set(HOST_TOKENS_UNUSED).size === HOST_TOKENS_UNUSED.length, 'HOST_TOKENS_UNUSED 有重复项');

  // canary：复用 classify（同一份判定），逐方向验证「能翻转」
  const canary = (name, expect, ctx) => {
    const got = classify(name, ctx);
    if (got !== expect) errors.push(`引擎主题 token 护栏 canary 失效：${name} 期望 ${expect}、实得 ${got}`);
  };
  canary('--mellow-md-link', 'reachable-md');            // 正常 md token
  canary('--mellow-md-list-bullet', 'reachable-md');     // 本次补入的（回归锚：证明修法真的可被判可达）
  canary('--mellow-md-brand-new', 'inert-md');           // 未定义的 md token → 必须判不可达
  canary('--mellow-brand', 'unregistered-non-md');       // 未登记的非 md → 必须判未登记
  canary('--mellow-accent', 'registered-inert');         // 已登记的非 md
  // 「登记表清空 ⇒ 判定必须翻转」：只清 inert 名单，--mellow-accent 必须变成未登记
  canary('--mellow-accent', 'unregistered-non-md', { md: mdKeys, theme: themeKeys, inert: [] });
  // 「主题表清空 ⇒ md token 必须翻转」：证明 R1 的 theme 那一半真的在起作用
  canary('--mellow-md-link', 'inert-md', { md: mdKeys, theme: new Set(), inert: ENGINE_THEME_VARS_INERT });
  // 「token 表清空 ⇒ md token 必须翻转」：证明 R1 的 defaults 那一半真的在起作用
  canary('--mellow-md-link', 'inert-md', { md: new Set(), theme: themeKeys, inert: ENGINE_THEME_VARS_INERT });

  // canary（R4）：**合成夹具**，只验证分类器本身。
  // ⚠️ 不用真实 token 当夹具 —— 实测教训：首版写 `canaryHost('--mellow-tab-underline', 'registered-dead')`，
  // 于是「将来把它接线并脱表」这个**合法变更**会把 canary 弄红（假警报）。
  // canary 要测的是「判定逻辑能不能翻转」，不是「现实数据恰好长这样」。
  const canaryHost = (name, expect, ctx) => {
    const got = classifyHost(name, ctx);
    if (got !== expect) errors.push(`宿主 token 护栏 canary 失效：${name} 期望 ${expect}、实得 ${got}`);
  };
  canaryHost('--mellow-x', 'host-consumed', { host: new Set(['--mellow-x']), reg: [] });
  canaryHost('--mellow-x', 'registered-dead', { host: new Set(), reg: ['--mellow-x'] });
  canaryHost('--mellow-x', 'unregistered-dead', { host: new Set(), reg: [] });
  canaryHost('--mellow-md-x', 'md-skip', { host: new Set(), reg: [] });   // md 必须交给 R3，不得双重登记
  canaryHost('--mellow-md-x', 'md-skip', { host: new Set(['--mellow-md-x']), reg: ['--mellow-md-x'] });
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
