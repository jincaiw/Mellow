/**
 * Release Gate 契约护栏（V7-W8 工具链）。
 *
 * 目的：让「发布结论」无法绕过证据。护栏只做**可静态判定**的断言，不假装能验证真机体验：
 *
 * ① 护栏全集接入：tests/parity/verify-*.mjs 的每一个都必须出现在根 package.json 的
 *    `test` 与 `parity` 两条脚本链里 —— 防「新增护栏忘了接线」与「某人悄悄删掉一条」。
 * ② 台账结论纪律：PASS-E 必须要求三平台真机 + UX Gate 证据（与 verify-parity-ledger 分工：
 *    后者校验 schema，本护栏校验**结论可达性**并给出 NO-GO 清单）。
 * ③ CI 门禁完整：单测 / editor-engine / 桌面构建 + 渲染层指纹 / parity 链 / cargo test 齐备。
 * ④ 发布门禁：release.yml 每个平台 job 必须在**打包之前**跑 verify-release-bundle。
 *
 * NO-GO 清单只报告不抛错（开发期必然存在未闭环项）；但「标了 PASS-E 却缺证据」、
 * 「护栏断链」、「CI 缺门禁」都是硬失败。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const parityDir = resolve(root, 'tests/parity');
const guardFiles = readdirSync(parityDir)
  .filter((name) => name.startsWith('verify-') && name.endsWith('.mjs'))
  .sort();

// ── ① 护栏全集必须接入根脚本链 ──────────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
const testChain = pkg.scripts?.test ?? '';
const parityChain = pkg.scripts?.parity ?? '';
if (guardFiles.length < 18) {
  fail(`parity 护栏数量异常（${guardFiles.length}），2026-10-01 基线为 18`);
}
const missingInTest = guardFiles.filter((name) => !testChain.includes(name));
const missingInParity = guardFiles.filter((name) => !parityChain.includes(name));
if (missingInTest.length > 0) fail(`根 package.json 的 test 链缺少护栏：${missingInTest.join(', ')}`);
if (missingInParity.length > 0) fail(`根 package.json 的 parity 链缺少护栏：${missingInParity.join(', ')}`);
if (!testChain.includes('ux-gate-recorder.mjs --self-test')) {
  fail('根 test 链缺少 ux-gate-recorder --self-test（UX Gate 自检）');
}

// ── ② 台账结论可达性 + NO-GO 清单 ───────────────────────────────────────
const ledger = JSON.parse(read('tests/parity/typora-parity-ledger.json'));

// 证据词汇表（§12 D-W「验证范围与证据来源」裁决）：
//   macos / macos-native —— 本机实机验证（用户裁决：macOS 平台版本使用本机验证）
//   windows-ci / linux-ci —— GitHub Actions 证据（用户裁决：其他平台不做真实设备验证；
//                            ADR-0022：Win/Linux 以 CI 为正式 Runtime 证据来源）
//   windows / linux      —— 【禁用】裸平台名暗示真机验证，在 D-W 下不可满足，
//                            会让门禁变成「永远无法关闭的假门禁」，故显式拒绝。
const EVIDENCE_VOCABULARY = new Set([
  // 平台证据来源
  'macos', 'macos-native', 'windows-ci', 'linux-ci',
  // 证据种类（新增种类必须先登记，防止出现无法追溯来源的自造词）
  'unit', 'integration', 'visual-golden', 'ux-gate', 'source-fidelity',
  'ledger-validation', 'cross-app', 'document-review', 'source-freeze',
  'menu-schema', 'command-registry', 'export-corpus', 'benchmark',
  'linux-ime-matrix',
]);
const BANNED_EVIDENCE = ['windows', 'linux', 'win', 'mac'];
// 三平台证据必须齐备：macOS 走本机，Win/Linux 走 CI（各自只需其中之一即可满足该平台）
const PLATFORM_EVIDENCE_GROUPS = [['macos', 'macos-native'], ['windows-ci'], ['linux-ci']];
const noGo = [];
// ── 「闭环」口径（ADR-0024 Q1 = A3，Accepted 2026-09-30）──────────────────
// `AUTO` 不得为「**自身声明需要人工门禁**」的项收口：master-plan §4.3 定义
// `AUTO` =「自动化测试通过，**真机体验验收未完成**」—— 一个把 `ux-gate` 写进
// `requiredEvidence` 的项，其声明本身就承认「人工验收未完成」。
// 依据：§5.7 前科（P0-SHELL-003 浮动工具栏永不显示，却因 AUTO 被当闭环）。
// **本规则只可能让项变严**（移入未闭环），不可能放宽任何一项。
const closedViaAuto = (item) => item.status === 'AUTO'
  && !(item.requiredEvidence ?? []).includes('ux-gate');
const isClosed = (item) => item.status === 'PASS-E' || item.status === 'PASS-B' || closedViaAuto(item);
/** 未闭环项的阻塞原因集合（用于在输出里按原因归类，而不是只列状态码） */
const blockers = new Set();
for (const item of ledger.items ?? []) {
  const required = item.requiredEvidence ?? [];
  for (const token of required) {
    if (BANNED_EVIDENCE.includes(token)) {
      fail(`${item.id} 的 requiredEvidence 含禁用词 '${token}'：D-W 下不做其他平台真机验证，请改用 '${token}-ci'`);
    } else if (!EVIDENCE_VOCABULARY.has(token)) {
      fail(`${item.id} 的 requiredEvidence 含未登记词 '${token}'（须先登记进 EVIDENCE_VOCABULARY）`);
    }
  }
  if (item.status === 'PASS-E') {
    for (const group of PLATFORM_EVIDENCE_GROUPS) {
      if (!group.some((token) => required.includes(token))) {
        fail(`${item.id} 标记 PASS-E 但 requiredEvidence 缺 ${group.join(' / ')}（结论不可达）`);
      }
    }
    if (!required.includes('ux-gate')) {
      fail(`${item.id} 标记 PASS-E 但 requiredEvidence 缺 ux-gate（结论不可达）`);
    }
  }
  // 未闭环项必须**声明阻塞原因**（2026-09-25）。
  //
  // 立此条的原因：此前「为什么这项没闭环」只写在 mellowTarget 的长段散文里，
  // 门禁输出只有 `P0-XXX(MAC 仅单平台)` 这样的状态码 —— 实测其中三项
  // （P0-EDITOR-004 / P0-PLATFORM-001 / P0-LAYOUT-002）**自身 requiredEvidence 已全部取得**，
  // 仅因「PASS-E 必须含 ux-gate」的全局策略而未升，状态码 `MAC 仅单平台` 反而**误导**
  // （读者会以为缺平台证据）。阻塞原因必须成为**机器可读的字段**，否则每次审计都要重读散文。
  const closed = isClosed(item);
  if (!closed) {
    if (typeof item.blockedBy !== 'string' || item.blockedBy.trim() === '') {
      fail(`${item.id} 未闭环但未声明 blockedBy（阻塞原因必须机器可读，不能只写在散文里）`);
    } else {
      blockers.add(item.blockedBy);
    }
  }
  if (item.status === 'NOT_TESTED' || item.status === 'BLOCKED' || item.status === 'ABSENT' || item.status === 'IMPL') {
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'})`);
  } else if (['MAC', 'WIN', 'LINUX'].includes(item.status)) {
    // 仅单一平台证据：三平台未闭环，同样不得作为发布结论
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'})`);
  } else if (item.status === 'AUTO' && !closed) {
    // ADR-0024 A3：自身声明需要 ux-gate 的 AUTO 项，不得以 AUTO 收口
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'}；ADR-0024 A3：含 ux-gate 的项不得以 AUTO 收口)`);
  }
}
// canary：自检「未闭环项必须声明阻塞原因」这条规则本身（样本拼接构造）
{
  const SAMPLE_BAD = { id: 'P0-X', status: 'BLOCKED' };
  const SAMPLE_GOOD = { id: 'P0-X', status: 'BLOCKED', blockedBy: 'reason' };
  const closedOk = isClosed;
  if (closedOk(SAMPLE_BAD) || typeof SAMPLE_BAD.blockedBy === 'string') {
    fail('阻塞原因门禁 canary 失效：缺 blockedBy 的样本未被判为不合规');
  }
  if (!closedOk(SAMPLE_GOOD) && (typeof SAMPLE_GOOD.blockedBy !== 'string' || SAMPLE_GOOD.blockedBy === '')) {
    fail('阻塞原因门禁 canary 失效：带 blockedBy 的样本被判为不合规');
  }
}

// ── 待裁决项必须指向承载它们的 Proposed ADR（2026-09-29）──────────────────
//
// 立此节的原因：审计发现「需要裁决」的事项此前只散落在会话消息与散文里 ——
// 下一次接手的人不知道该改哪份文档、也不知道哪些是「已定」哪些是「待定」。
// 按 AGENTS.md「决策变更：正确做法是新增 ADR」，待裁决项必须有 ADR 载体，
// 且**未裁决前状态必须是 Proposed**（不得被悄悄标成 Accepted 当作已决）。
// ── 已裁决 ADR（2026-09-30）─────────────────────────────────────────────
// ADR-0024 / 0025 / 0026 原为 Proposed；用户在 2026-09-30 授权「自行评估、决策、实施」，
// 三份均已按各自 ADR 内的选项与证据裁决为 **Accepted**（裁决内容见各 ADR 的「裁决」节）。
// 断言仍保留，但方向反转：**已裁决的 ADR 不得被删除、也不得退回 Proposed** ——
// 防止「把裁决记录删掉当作问题不存在」（那会让本门禁的结论失去依据）。
const DECIDED_ADRS = [
  ['docs/adr/ADR-0024-release-closure-semantics.md', 'AUTO 是否阻断发布 / ux-gate 是否逐项前置', 'A3 / B1'],
  ['docs/adr/ADR-0025-evidence-policy-when-baseline-refuses.md', '>2MB 无基线时的证据政策', 'A1 / B1 / C1'],
  ['docs/adr/ADR-0026-perf-target-measurement-scope.md', 'PRD §110 性能目标的测量口径', 'A1 / B1 / C1'],
];
const PENDING_ADRS = []; // 当前无待裁决 ADR（上一批已于 2026-09-30 裁决）
for (const [p, what, decision] of DECIDED_ADRS) {
  if (!existsSync(resolve(root, p))) {
    fail(`已裁决 ADR 缺失：${p}（${what}）—— 裁决记录不得删除，否则门禁结论失去依据`);
    continue;
  }
  const src = read(p);
  // 状态行的 Accepted 可能被加粗（`**Status:** **Accepted**`），故用 [^\n]* 容错，
  // 但**不得**放宽到「行内任意位置出现 Accepted」（那会被正文里的字样满足）。
  if (!/\*\*Status:\*\*[^\n]*Accepted/.test(src)) {
    fail(`${p} 已于 2026-09-30 裁决为 Accepted（${decision}），不得退回 Proposed 或删除`);
  }
}

// ── ③ CI 门禁完整性 ─────────────────────────────────────────────────────
const ci = read('.github/workflows/ci.yml');
for (const anchor of [
  'run: pnpm -r --filter \'!mellow-desktop\' run test', // packages 单测
  'working-directory: packages/editor-engine',           // engine 单测
  'run: pnpm run build',                                 // 桌面构建
  'node scripts/verify-release-bundle.mjs',              // 渲染层指纹（G7-TYPO-04）
  'run: npm run parity',                                 // parity 护栏链
  'run: cargo test',                                     // Rust System Core
]) {
  if (!ci.includes(anchor)) fail(`ci.yml 缺少门禁锚点：${anchor}`);
}
// ADR-0022：Windows 以 GitHub Actions 为正式 Runtime 证据来源。若 ci.yml 完全没有
// Windows runner，台账里 47 项要求的 windows-ci 证据就无从产生 ——
// 本轮实测发现该缺口（6 个 job 全跑 ubuntu-latest），故立此不变量防再次退化。
if (!/runs-on:\s*windows-latest/.test(ci)) {
  fail('ci.yml 没有任何 windows-latest job：ADR-0022 要求 Windows 证据以 CI 为来源，否则 windows-ci 类证据不可达');
}
// ── CI 步骤名不得内嵌**无法派生**的数字（2026-09-30）──────────────────────
// 立此条的原因：步骤名里曾写死「Unit tests (host-api 43 / app-core 217 / …)」这类数字，
// 而**没有任何东西校验它们** → 随测试增长**静默失真**（实测各包全部漂移，
// 且「当天就会变」—— 给 export 补一个测试，该包计数即从 83 变成 84）。
// 这与「菜单护栏谎称读了本机 Typora」同类：**输出里的数字若无法派生，就不要写**。
// 真实数字由 jest / cargo / 脚本自己打印（本身即派生），无需在步骤名里复述。
//
// ⚠️ 2026-09-30 扩展：原实现**只读 ci.yml** → 同一缺陷族在另外两个 workflow 里存活。
// 实测抓到 `runtime-qualification.yml` 的「Visual golden (§9.3, 14 scenes)」：
// 该「14」**无法从任何东西派生** —— 三个基线文件共 7 + 4 + 6 = 17 个键，
// 而 master plan §9.3 的场景清单列了 13 项。数字对不上任何来源，属"写了个没人校验的数"。
//
// 豁免：**引用类**数字不是「计数」，不应误报（如 `ADR-0020`、`§9.3`、`#123`、`v1.5.6`、
// 缺陷号 `G7-EDIT-11` / `P0-EDITOR-005`）。做法是先剥掉引用记号，再看是否还剩 2+ 位数字。
{
  const WORKFLOWS = ['ci.yml', 'runtime-qualification.yml', 'release.yml'];
  const stripRefs = (s) => s
    .replace(/\bADR-\d+/g, '')       // ADR-0020
    .replace(/§\s*\d+(?:\.\d+)*/g, '') // §9.3
    .replace(/\bv\d+(?:\.\d+)*/g, '')  // v1.5.6
    .replace(/\b[A-Z]\d+-[A-Z]+-\d+/g, '') // G7-EDIT-11
    .replace(/\bP\d-[A-Z]+-\d+/g, '')  // P0-EDITOR-005
    .replace(/#\d+/g, '');           // #123
  const offenders = [];
  for (const name of WORKFLOWS) {
    let src = '';
    try { src = read(`.github/workflows/${name}`); } catch { continue; }
    for (const m of src.matchAll(/^\s+- name: "?(.*?)"?$/gm)) {
      const stepName = m[1];
      if (/\d{2,}/.test(stripRefs(stepName))) offenders.push(`${name}：${stepName}`);
    }
  }
  if (offenders.length > 0) {
    fail(`workflow 步骤名不得内嵌无法派生的数字（无任何东西校验，会静默失真）：${offenders.join(' / ')}`);
  }
  // canary：自检该判定 + 引用豁免（样本拼接构造）
  const COUNT_SAMPLE = 'Unit tests (host-api ' + '43' + ')';
  const REF_SAMPLE = 'Fill release notes and mark prerelease (ADR-' + '0020' + ')';
  const SECTION_SAMPLE = 'Visual golden (§' + '9.3' + ')';
  if (!/\d{2,}/.test(stripRefs(COUNT_SAMPLE))) {
    errors.push('步骤名数字护栏 canary 失效：含计数的样本未被检出');
  }
  if (/\d{2,}/.test(stripRefs(REF_SAMPLE)) || /\d{2,}/.test(stripRefs(SECTION_SAMPLE))) {
    errors.push('步骤名数字护栏 canary 失效：ADR / 章节引用被误报（豁免规则失效）');
  }
}

// 指纹校验必须排在桌面构建之后（顺序断言，防止「先校验后构建」的假门禁）
const buildIdx = ci.indexOf('run: pnpm run build');
const fpIdx = ci.indexOf('node scripts/verify-release-bundle.mjs');
if (buildIdx === -1 || fpIdx === -1 || fpIdx < buildIdx) {
  fail('ci.yml 的 verify-release-bundle 必须排在桌面 build 之后');
}

// ── ④ 发布门禁：打包前必须校验渲染层指纹 ────────────────────────────────
const release = read('.github/workflows/release.yml');
if (!existsSync(resolve(root, '.github/workflows/release.yml'))) {
  fail('缺少 .github/workflows/release.yml');
} else {
  const jobs = release.split(/\n {2}[a-z][a-zA-Z-]*:\n/).slice(1);
  const packagingJobs = jobs.filter((job) => /tauri-apps\/tauri-action|Build .*(MSI|NSIS|DMG|AppImage|deb|rpm)/i.test(job));
  if (packagingJobs.length === 0) {
    fail('release.yml 未识别到任何打包 job（无法断言「打包前校验」）');
  }
  for (const job of packagingJobs) {
    const vIdx = job.indexOf('verify-release-bundle');
    const pIdx = job.search(/tauri-apps\/tauri-action|npx tauri|pnpm tauri/);
    if (vIdx === -1) {
      fail('release.yml 有打包 job 未在打包前跑 verify-release-bundle.mjs（指纹错配会静默加载旧引擎）');
    } else if (pIdx !== -1 && vIdx > pIdx) {
      fail('release.yml 的 verify-release-bundle 必须排在打包之前');
    }
  }
}

// ── drift canary：移除一个护栏后，① 必须转为失败态 ──────────────────────
const removed = guardFiles[0];
const driftedChain = testChain.replace(removed, '');
if (driftedChain.includes(removed) || guardFiles.length === 0) {
  fail('Release Gate 护栏自检失败：无法模拟护栏断链，护栏已失效');
}
const driftedMissing = guardFiles.filter((name) => !driftedChain.includes(name));
if (driftedMissing.length === 0) {
  fail('Release Gate 护栏自检失败：断链未被检出（假绿），护栏已失效');
}

// ── ⑤ 护栏必须容忍 CRLF（2026-09-13 Windows CI 事故）────────────────────
// Windows 的 `actions/checkout` 以 CRLF 检出源码，而护栏大量依赖
// `.replace()` 做注入与 canary 自检 —— 锚点里的 `\n` 在 CRLF 下全部失配，
// 表现为「注入没有生效」/「canary 未武装」，于是 Windows job 连挂而
// Linux / macOS 全绿。故每个读取源码的护栏都必须做换行归一化。
{
  const parityDir = resolve(root, 'tests/parity');
  const guardFiles = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
    : [];
  for (const f of guardFiles) {
    const src = read(`tests/parity/${f}`);
    if (/readFileSync/.test(src) && !/\\r\\n/.test(src)) {
      errors.push(`${f} 读取源码但未归一化 CRLF（Windows 下注入 / canary 会失配）`);
    }
  }
  // canary：去掉自身的归一化必须被检出（证明断言不是摆设）
  const selfSrc = read('tests/parity/verify-release-gate.mjs');
  const anchored = "readFileSync(resolve(root, p), 'utf8').replace(/\\r\\n/g, '\\n')";
  const drifted = selfSrc.replace(anchored, "readFileSync(resolve(root, p), 'utf8')");
  if (drifted === selfSrc) {
    errors.push('CRLF canary 未武装：无法模拟「去掉归一化」的漂移，护栏已失效');
  } else if (/\\r\\n/.test(drifted)) {
    errors.push('CRLF canary 失效：注入后仍未检出缺失归一化');
  }
}

// ── qualification README 的门禁表数字必须与实际一致（2026-10-01）────────────
// 立此节的必要性：`tests/qualification/README.md` 是 **ADR-0019 §3 Gate 条款**指定的
// 「三平台 Pass/Fail 表」载体，而它的**护栏数量**长期未刷新 —— 实测：写「14 个」而实际 **17 个**
//（同段的包用例数也过期：写 editor-engine 1135 而实际 1277）。**数字过期会误导覆盖度判断**，
// 且这类「自述与现实不符」在本项目已出现多次。
//
// ⚠️ **本节的落位本身就是一次教训**：首版把它写在 `if (errors.length > 0)` **之后** ——
// 那里已经没有检查点了，`fail()` 只是往数组里塞字符串，**永远不会被判定**（= 护栏卫生里的
// 「护栏看不见我」）。是 canary（注入漂移后**应当**失败却 exit 0）当场暴露的。
// **新增断言必须落在错误检查点之前**；且**只做注入验证不够，必须验证「能翻转」**。
//
// ⚠️ 覆盖边界：只锁**护栏数量**（可静态算）；**包用例数需实跑**，无法在此校验 —— 如实声明。
{
  const readme = read('tests/qualification/README.md');
  const STATED_RE = /Parity 契约护栏 \*\*(\d+) 个\*\*/;
  const stated = STATED_RE.exec(readme)?.[1];
  if (stated === undefined) {
    fail('qualification README 缺少「Parity 契约护栏 N 个」声明（护栏需同步更新，不要静默漏检）');
  } else if (Number(stated) !== guardFiles.length) {
    fail(`qualification README 的护栏数量过期：写 ${stated} 个，实际 ${guardFiles.length} 个`
      + ' —— 该文件是 ADR-0019 §3 Gate 条款的 Pass/Fail 表载体，数字过期会误导覆盖度判断');
  }
  // canary：改掉那个数字必须被检出
  const drift = readme.replace(STATED_RE, 'Parity 契约护栏 **1 个**');
  if (drift === readme) {
    errors.push('qualification README 数字一致性 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if (Number(STATED_RE.exec(drift)?.[1]) === guardFiles.length) {
    errors.push('qualification README 数字一致性 canary 失效：注入漂移后仍判定一致');
  }
}

if (errors.length > 0) {
  throw new Error(`Release gate violations:\n  ${errors.join('\n  ')}`);
}

const goNoGo = noGo.length === 0 ? 'GO（全部 P0 已闭环）' : `NO-GO：${noGo.length} 项未闭环`;
// 按阻塞原因归类输出（2026-09-25）：只列状态码会让「三项自身证据已齐备、仅被全局
// ux-gate 策略挡住」这种关键事实淹没在 `MAC 仅单平台` 里（该状态码本身还会误导）。
const byReason = new Map();
for (const item of ledger.items ?? []) {
  if (isClosed(item)) continue;
  const key = item.blockedBy ?? '未声明';
  if (!byReason.has(key)) byReason.set(key, []);
  byReason.get(key).push(item.id);
}
// ── A3 规则自检（canary，2026-09-30）─────────────────────────────────────
// 防止本规则被静默退回「AUTO 一律不阻断」：样本拼接构造，避免护栏检出自己。
{
  const AUTO = 'AUTO';
  const UX = 'ux-' + 'gate';
  if (isClosed({ status: AUTO, requiredEvidence: ['unit'] }) !== true) {
    errors.push('ADR-0024 A3 canary 失效：不含 ux-gate 的 AUTO 项应视为不阻断');
  }
  if (isClosed({ status: AUTO, requiredEvidence: ['unit', UX] }) !== false) {
    errors.push('ADR-0024 A3 canary 失效：含 ux-gate 的 AUTO 项**不得**视为已闭环');
  }
  if (isClosed({ status: 'PASS-E', requiredEvidence: [UX] }) !== true) {
    errors.push('ADR-0024 A3 canary 失效：PASS-E 项应视为已闭环');
  }
}
// ── 「闭环」口径必须显式声明（2026-09-25）────────────────────────────────
// 立此节的必要性：本门禁把 `AUTO` 视为**不阻断**，而 master-plan §4.3 定义
// `AUTO` = 「自动化测试通过，**真机体验验收未完成**」；§8 的 V1.0 Exit Gate 又要求
// 「Windows / macOS / Linux 全 PASS-E」。两者口径不同 —— 只输出「6 项未闭环」
// 会被读成「只有 6 项没做完」，实际 PASS-E 为 **0**。
// 更危险的是 §5.7 已记录过一次教训：`P0-SHELL-003` 的 `AUTO` 曾把一个**完全不可用**的
// 功能（浮动工具栏永不显示）当作已闭环 —— 单测只覆盖纯函数，属「有测试但不工作」。
const totalItems = (ledger.items ?? []).length;
const passECount = (ledger.items ?? []).filter((i) => i.status === 'PASS-E').length;
const autoWithUxGate = (ledger.items ?? []).filter(
  (i) => i.status === 'AUTO' && (i.requiredEvidence ?? []).includes('ux-gate'),
);
console.log(
  `Release gate: ${guardFiles.length} parity guards wired into both root test and parity chains; `
  + 'PASS-E conclusion reachability checked; CI gates armed (packages/engine unit, desktop build + bundle fingerprint, parity chain, cargo test); '
  + `release packaging gated by pre-build fingerprint verification. Release verdict: ${goNoGo}`
  + (noGo.length > 0 ? `\n  Unclosed: ${noGo.join(', ')}` : '')
  + (byReason.size > 0
    ? `\n  Blocked by: ${[...byReason.entries()].map(([r, ids]) => `${r} → ${ids.join(', ')}`).join(' | ')}`
    : '')
  + `\n  Closure basis: 本门禁的「不阻断」口径 = PASS-E / PASS-B / AUTO（**且 requiredEvidence 不含 ux-gate**）；`
  + `按 ADR-0024 Q1=A3（Accepted 2026-09-30），自身声明需要人工门禁的 AUTO 项不得以 AUTO 收口。`
  + `按 master-plan §4.3，AUTO 的含义是「自动化测试通过、**真机体验验收未完成**」。`
  + `实际 PASS-E = ${passECount}/${totalItems}。`
  + (autoWithUxGate.length > 0
    ? `\n  ℹ️ ${autoWithUxGate.length} 项标 AUTO 且 requiredEvidence 含 ux-gate`
      + `（${autoWithUxGate.map((i) => i.id).join(', ')}）：按 ADR-0024 A3 已计入未闭环（不得以 AUTO 收口）。`
    : '')
  + '\n  ⚠️ §5.7 已记录一次「AUTO 把一个完全不可用的功能当作已闭环」（P0-SHELL-003 浮动工具栏）—— 不要把 AUTO 读作「已完成」。'
  + (noGo.length > 0
    ? (PENDING_ADRS.length > 0
      ? `\n  Pending decisions: ${PENDING_ADRS.map(([p]) => p.replace('docs/adr/', '')).join(', ')}`
        + '（状态 Proposed，裁决前不生效）'
      : '\n  Pending decisions: 无 —— ADR-0024 / 0025 / 0026 已于 2026-09-30 裁决为 Accepted（见各自 ADR 的「裁决」节）')
    : '')
);
