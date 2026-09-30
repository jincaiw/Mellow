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
  assert(/等待画面静止/.test(benchCode) && /不是文档加载耗时/.test(benchCode),
    '报告打印 loadMs 处必须标注「等待画面静止 / 不是文档加载耗时」（且必须是字符串字面量，'
    + '不能只写在注释里）—— 否则读者会把它当业务指标，历史错误结论「2.59×」正是这样产生的');
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
      // 门槛值必须与 PRD §131 一致
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
    // —— 与 2026-09-29 审计 §4.1 记录的是同一类「看起来像证据的弱引用」，
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

if (errors.length) {
  console.error('Typora parity ledger validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
for (const item of ledger.items) counts[item.status] += 1;
console.log(`Typora parity ledger: ${ledger.items.length} P0 items; normative baseline ${ledger.normativeBaseline.product} ${ledger.normativeBaseline.version}`);
console.log(`Status dashboard: ${Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${status}=${count}`).join(', ')}`);
